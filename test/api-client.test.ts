// `api-client` es el cliente HTTP que usan los 6 productos en CADA
// llamada, asi que sus casos de borde (204, respuesta no-JSON, `detail`
// de la API vs statusText) son los que definen que ve el usuario cuando
// algo sale mal.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _reiniciarAvisoDeSesion, api, ApiError, configurarSesionVencida } from '../src/api-client'

function respuesta(
  body: unknown,
  { status = 200, json = true }: { status?: number; json?: boolean } = {},
) {
  return new Response(
    body === undefined ? null : json ? JSON.stringify(body) : String(body),
    {
      status,
      headers: json ? { 'content-type': 'application/json' } : { 'content-type': 'text/html' },
    },
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

// El cuerpo de un Response se puede leer UNA sola vez, asi que
// `mockResolvedValue(respuesta(...))` rompe en el segundo llamado con
// "Body has already been read". Este helper arma uno nuevo por llamada.
function responde(body: unknown, opciones?: { status?: number; json?: boolean }) {
  fetchMock.mockImplementation(() => Promise.resolve(respuesta(body, opciones)))
}

describe('forma de la peticion', () => {
  it('manda la cookie de sesion en todas las llamadas', async () => {
    responde({ ok: true })
    await api.get('/api/me')
    // Sin `credentials: include` la cookie no viaja y todo da 401: es el
    // detalle del que depende la sesion entera.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
  })

  it('un GET no manda body ni Content-Type', async () => {
    responde({ ok: true })
    await api.get('/api/clientes')
    const [ruta, opciones] = fetchMock.mock.calls[0]
    expect(ruta).toBe('/api/clientes')
    expect(opciones.method).toBe('GET')
    expect(opciones.body).toBeUndefined()
    expect(opciones.headers).toBeUndefined()
  })

  it('un POST sin cuerpo manda {} y no undefined', async () => {
    responde({ ok: true })
    await api.post('/api/logout')
    // Es deliberado: varios endpoints esperan un JSON valido aunque este
    // vacio. Mandar undefined los haria fallar con 422.
    expect(fetchMock.mock.calls[0][1].body).toBe('{}')
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('serializa el cuerpo de put y patch', async () => {
    responde({ ok: true })
    await api.put('/api/usuarios/1', { nombre: 'Ana' })
    expect(fetchMock.mock.calls[0][1].body).toBe('{"nombre":"Ana"}')
    await api.patch('/api/usuarios/1', { activo: false })
    expect(fetchMock.mock.calls[1][1].body).toBe('{"activo":false}')
  })

  it('los 5 verbos usan su metodo HTTP', async () => {
    responde({ ok: true })
    await api.get('/x')
    await api.post('/x')
    await api.put('/x', {})
    await api.patch('/x', {})
    await api.del('/x')
    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual([
      'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
    ])
  })
})

describe('respuestas', () => {
  it('devuelve el JSON parseado', async () => {
    responde({ id: 7, nombre: 'Ana' })
    await expect(api.get('/api/usuarios/7')).resolves.toEqual({ id: 7, nombre: 'Ana' })
  })

  it('un 204 devuelve undefined sin intentar parsear', async () => {
    // El 204 lleva `content-type: application/json` A PROPOSITO: es el
    // caso real de FastAPI, y es el unico que ejercita el corte temprano.
    // Con un 204 "pelado" (sin content-type) el test pasaba igual por otro
    // camino -- lo delato mutar el `if` del 204 y ver que nadie se quejaba.
    // Sin ese corte, `.json()` sobre un cuerpo vacio tira
    // "Unexpected end of JSON input".
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(null, {
        status: 204,
        headers: { 'content-type': 'application/json' },
      })),
    )
    await expect(api.del('/api/usuarios/7')).resolves.toBeUndefined()
  })

  it('una respuesta 200 que NO es JSON devuelve undefined', async () => {
    // Pasa cuando el catch-all de la SPA sirve index.html donde se
    // esperaba la API: no debe explotar al parsear.
    responde('<!doctype html>', { json: false })
    await expect(api.get('/api/loquesea')).resolves.toBeUndefined()
  })
})

describe('errores', () => {
  it('un 4xx lanza ApiError con status y el detail de la API', async () => {
    responde({ detail: 'Usuario o contraseña incorrectos' }, { status: 401 })
    const error = await api.post('/api/login', {}).catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(401)
    expect(error.detail).toBe('Usuario o contraseña incorrectos')
    // El mensaje del Error tambien es el detail: es lo que se muestra en
    // pantalla si alguien hace `String(error)`.
    expect(error.message).toBe('Usuario o contraseña incorrectos')
  })

  it('si el error no trae detail cae al statusText', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(null, { status: 502, statusText: 'Bad Gateway' })),
    )
    const error = await api.get('/api/x').catch((e) => e) as ApiError
    expect(error.status).toBe(502)
    expect(error.detail).toBe('Bad Gateway')
  })

  it('un error con cuerpo JSON pero sin detail tampoco rompe', async () => {
    responde({ error: 'otra_forma' }, { status: 500 })
    const error = await api.get('/api/x').catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(500)
  })

  it('el 503 del corte de servicio llega como ApiError', async () => {
    // Contalibra/Restolibra cortan la API con 503 cuando el servicio esta
    // suspendido -- ver el middleware de web/app.py.
    responde({ error: 'servicio_suspendido', mensaje: 'Falta de pago' }, { status: 503 })
    const error = await api.get('/api/me').catch((e) => e) as ApiError
    expect(error.status).toBe(503)
  })
})

describe('postForm (uploads)', () => {
  it('manda el FormData sin Content-Type', async () => {
    responde({ ok: true })
    const form = new FormData()
    form.append('archivo', new Blob(['x']), 'logo.png')
    await api.postForm('/api/config/empresa/logo', form)
    const opciones = fetchMock.mock.calls[0][1]
    // Sin Content-Type explicito a proposito: lo pone el browser con el
    // boundary. Fijarlo a mano rompe el multipart.
    expect(opciones.headers).toBeUndefined()
    expect(opciones.body).toBeInstanceOf(FormData)
    expect(opciones.credentials).toBe('include')
  })

  it('un upload fallido tambien lanza ApiError con su detail', async () => {
    responde({ detail: 'El archivo es demasiado grande' }, { status: 413 })
    const error = await api.postForm('/api/upload', new FormData()).catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(413)
    expect(error.detail).toBe('El archivo es demasiado grande')
  })
})

// ── Sesión vencida (2026-08-06) ────────────────────────────────────────────
//
// Reportado con captura: la demo pública mostrando el menú entero y
// `not authenticated` en rojo donde iban los datos. La sesión se había muerto
// —el reset de las 04:30 recrea los usuarios— con la pestaña ya abierta, y la
// SPA se quedó montada tirando 401 sin volver nunca al login.
//
// Lo que fijan estos tests, en orden de lo que se rompe sin que se note:
//
// 1. 🔴 **Que el 401 del LOGIN no dispare nada.** Es el que rompe todo si se
//    olvida: con la contraseña mal el backend contesta 401, y redirigir ahí
//    borraría el mensaje de error y dejaría la pantalla peleando consigo misma.
// 2. Que un 401 de datos sí vuelva al login.
// 3. Que varias llamadas fallando juntas avisen una sola vez.

describe('sesión vencida', () => {
  let volviAlLogin: ReturnType<typeof vi.fn>

  beforeEach(() => {
    volviAlLogin = vi.fn()
    configurarSesionVencida(volviAlLogin)
    _reiniciarAvisoDeSesion()
    // jsdom arranca en "/", que no es el login: es el escenario real.
    window.history.pushState({}, '', '/dashboard')
  })

  it('un 401 en una llamada de datos vuelve al login', async () => {
    responde({ detail: 'not authenticated' }, { status: 401 })
    await api.get('/api/dashboard/operativo?dias=30').catch(() => {})
    expect(volviAlLogin).toHaveBeenCalledTimes(1)
  })

  it('🔴 un 401 del LOGIN no vuelve al login: es la contraseña equivocada', async () => {
    responde({ detail: 'invalid credentials' }, { status: 401 })
    const error = await api.post('/auth/login', { username: 'ana', password: 'mal' }).catch((e) => e) as ApiError
    // Y el error tiene que seguir llegando al formulario, que es quien muestra
    // "usuario o contraseña incorrectos".
    expect(error).toBeInstanceOf(ApiError)
    expect(error.detail).toBe('invalid credentials')
    expect(volviAlLogin).not.toHaveBeenCalled()
  })

  it('el 401 de /auth/me tampoco: lo traduce el AuthProvider a "no hay usuario"', async () => {
    responde({ detail: 'not authenticated' }, { status: 401 })
    await api.get('/auth/me').catch(() => {})
    expect(volviAlLogin).not.toHaveBeenCalled()
  })

  it('el 401 del auto-login de la demo tampoco', async () => {
    // `POST /auth/demo` puede contestar 401/503 en una instancia a medio
    // sembrar, y el botón muestra el motivo en pantalla.
    responde({ detail: 'no', status: 401 }, { status: 401 })
    await api.post('/auth/demo').catch(() => {})
    expect(volviAlLogin).not.toHaveBeenCalled()
  })

  it('varias llamadas fallando juntas avisan una sola vez', async () => {
    // El dashboard dispara dos, y la pantalla de Clientes tres. Una
    // redirección por cada una es una pantalla que parpadea.
    responde({ detail: 'not authenticated' }, { status: 401 })
    await Promise.all([
      api.get('/api/dashboard').catch(() => {}),
      api.get('/api/dashboard/operativo').catch(() => {}),
      api.get('/api/clientes').catch(() => {}),
    ])
    expect(volviAlLogin).toHaveBeenCalledTimes(1)
  })

  it('estando ya en el login no redirige', async () => {
    window.history.pushState({}, '', '/login')
    responde({ detail: 'not authenticated' }, { status: 401 })
    await api.get('/api/algo').catch(() => {})
    expect(volviAlLogin).not.toHaveBeenCalled()
  })

  it('un 403 no es sesión vencida: es un permiso que falta', async () => {
    // El visitante de la demo es staff y hay pantallas de admin. Mandarlo al
    // login le haría creer que se cayó la sesión.
    responde({ detail: 'forbidden' }, { status: 403 })
    await api.get('/api/usuarios').catch(() => {})
    expect(volviAlLogin).not.toHaveBeenCalled()
  })

  it('un upload que cae en 401 también vuelve al login', async () => {
    responde({ detail: 'not authenticated' }, { status: 401 })
    await api.postForm('/api/config/empresa/logo', new FormData()).catch(() => {})
    expect(volviAlLogin).toHaveBeenCalledTimes(1)
  })

  it('el ApiError se sigue propagando: la pantalla decide si muestra algo', async () => {
    responde({ detail: 'not authenticated' }, { status: 401 })
    const error = await api.get('/api/clientes').catch((e) => e) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(401)
  })
})

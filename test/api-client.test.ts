// `api-client` es el cliente HTTP que usan los 6 productos en CADA
// llamada, asi que sus casos de borde (204, respuesta no-JSON, `detail`
// de la API vs statusText) son los que definen que ve el usuario cuando
// algo sale mal.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../src/api-client'

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

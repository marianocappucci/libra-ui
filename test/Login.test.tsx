// La pantalla de login de los 6 productos. Lo que importa acá es lo que
// ve el usuario cuando algo falla, y el enlace de recuperación, que es
// **opt-in** a propósito.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLogin } from '../src/Login'
import { ApiError } from '../src/api-client'
import { SegundoFactorRequerido } from '../src/AuthContext'

const navegar = vi.fn()
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...real, useNavigate: () => navegar }
})

// El widget de ALTCHA de verdad no corre en jsdom (workers, WebCrypto); lo que
// importa acá es qué hace el LOGIN con él. El doble entrega una solución al
// tocarlo, como el widget cuando termina la prueba de trabajo.
vi.mock('../src/CaptchaAltcha', () => ({
  default: ({ challengeUrl, onCambio }: { challengeUrl: string; onCambio: (p: string) => void }) => (
    <button type="button" data-desafio={challengeUrl} onClick={() => onCambio(`PAYLOAD:${challengeUrl}`)}>
      No soy un robot
    </button>
  ),
}))

type UsuarioDePrueba = { id: string; username: string; role: string }

function montar({
  login = vi.fn().mockResolvedValue({ id: '1', username: 'ana', role: 'admin' }),
  // Sin default: la mayoría de los tests no pasa segundo factor, y un
  // `useAuth` sin `confirmarCodigo` es justamente el caso "producto sin 2FA"
  // que tiene que seguir andando igual que siempre.
  confirmarCodigo,
  ...config
}: {
  login?: ReturnType<typeof vi.fn>
  confirmarCodigo?: ReturnType<typeof vi.fn>
  forgotPasswordPath?: string
  forgotPasswordHint?: string
  demoPath?: string
  totpPath?: string
  captchaPath?: string
  onLoginSuccess?: (u: UsuarioDePrueba) => string
  formatError?: (e: ApiError) => string
} = {}) {
  const Login = createLogin<UsuarioDePrueba>({
    productName: 'Contalibra',
    productInitial: 'C',
    redirectTo: '/dashboard',
    useAuth: () => ({ login, confirmarCodigo }),
    ...config,
  })
  render(<MemoryRouter><Login /></MemoryRouter>)
  return { login, confirmarCodigo }
}

async function completarYEnviar() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Usuario'), 'ana')
  await user.type(screen.getByLabelText('Contraseña'), 'clave')
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('render', () => {
  it('muestra el branding del producto', () => {
    montar()
    expect(screen.getByRole('heading', { name: 'Contalibra' })).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('el campo de contraseña usa el ojito compartido', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument()
  })
})

describe('el enlace de recuperación es opt-in', () => {
  it('sin forgotPasswordPath NO se muestra', () => {
    // Deliberado: la recuperación también es opt-in en el backend, y
    // mostrar el link en un producto que no la tiene prendida seria un
    // enlace a un 404.
    montar()
    expect(screen.queryByText('¿Olvidaste tu contraseña?')).not.toBeInTheDocument()
  })

  it('con forgotPasswordPath se muestra y apunta ahí', () => {
    montar({ forgotPasswordPath: '/forgot-password' })
    const enlace = screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })
    expect(enlace).toHaveAttribute('href', '/forgot-password')
  })

  it('sin ruta pero con forgotPasswordHint se muestra el texto, sin enlace', () => {
    // El backoffice: no hay recuperación por correo, pero la pantalla tiene
    // que decir qué hacer.
    montar({ forgotPasswordHint: 'La cambia quien administra el servidor.' })
    expect(screen.getByText('La cambia quien administra el servidor.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /olvidaste/i })).not.toBeInTheDocument()
  })

  it('con las dos, gana el enlace', () => {
    montar({ forgotPasswordPath: '/forgot-password', forgotPasswordHint: 'Texto que no va' })
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument()
    expect(screen.queryByText('Texto que no va')).not.toBeInTheDocument()
  })
})

describe('envío', () => {
  it('llama a login con lo tipeado y navega al destino', async () => {
    const { login } = montar()
    await completarYEnviar()
    expect(login).toHaveBeenCalledWith('ana', 'clave')
    expect(navegar).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('onLoginSuccess decide el destino según el usuario', async () => {
    // Lo usa Restolibra para mandar al rol `mozo` a su propia pantalla.
    montar({
      login: vi.fn().mockResolvedValue({ id: '9', username: 'pepe', role: 'mozo' }),
      onLoginSuccess: (u) => (u.role === 'mozo' ? '/salon' : '/dashboard'),
    })
    await completarYEnviar()
    expect(navegar).toHaveBeenCalledWith('/salon', { replace: true })
  })

  it('deshabilita el botón mientras envía', async () => {
    let resolver: (v: unknown) => void = () => {}
    montar({ login: vi.fn(() => new Promise((r) => { resolver = r })) })
    await completarYEnviar()
    // Sin esto, un doble click manda dos logins.
    expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled()
    // Se resuelve DENTRO de act y se espera el re-render: soltar la
    // promesa al final del test deja un setState fuera de act, que React
    // avisa por consola. Un warning tolerado hoy es un warning que tapa
    // uno real mañana.
    await act(async () => {
      resolver({ id: '1', username: 'ana', role: 'admin' })
    })
  })
})

describe('errores', () => {
  it('un ApiError muestra el mensaje genérico por defecto', async () => {
    montar({ login: vi.fn().mockRejectedValue(new ApiError(401, 'Usuario o contraseña incorrectos')) })
    await completarYEnviar()
    // Genérico a propósito: distinguir "no existe" de "clave mala" le
    // diría a un atacante qué usuarios están dados de alta.
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument()
    expect(navegar).not.toHaveBeenCalled()
  })

  it('formatError permite mostrar el detalle real del backend', async () => {
    // Contalibra/Restolibra lo usan para mensajes como "Cuenta suspendida".
    montar({
      login: vi.fn().mockRejectedValue(new ApiError(403, 'Cuenta suspendida')),
      formatError: (e) => e.detail,
    })
    await completarYEnviar()
    expect(await screen.findByText('Cuenta suspendida')).toBeInTheDocument()
  })

  it('un error que NO es de la API se reporta como problema de conexión', async () => {
    montar({ login: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    await completarYEnviar()
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
  })

  it('el botón vuelve a habilitarse tras un error', async () => {
    montar({ login: vi.fn().mockRejectedValue(new ApiError(401, 'mal')) })
    await completarYEnviar()
    await screen.findByText('Usuario o contraseña incorrectos.')
    // Si quedara deshabilitado, el usuario no podría reintentar.
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled()
  })

  it('el error anterior se limpia al reintentar', async () => {
    const login = vi.fn()
      .mockRejectedValueOnce(new ApiError(401, 'mal'))
      .mockResolvedValueOnce({ id: '1', username: 'ana', role: 'admin' })
    montar({ login })
    await completarYEnviar()
    await screen.findByText('Usuario o contraseña incorrectos.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(screen.queryByText('Usuario o contraseña incorrectos.')).not.toBeInTheDocument()
  })
})

// ── El botón "Entrar a la demo" (2026-08-06) ───────────────────────────────
//
// Las seis demos públicas estaban en el aire con el auto-login del backend
// funcionando, y **desde el navegador no se podía entrar**: la pantalla que
// cargaba era ésta, sin credenciales que tipear.
//
// Lo que fijan estos tests, en orden de lo que se rompe sin que se note:
//
// 1. 🔴 **Que un `200` que no es JSON NO muestre el botón.** Estos productos
//    sirven la SPA con un catch-all: en la instancia de un cliente, un GET a
//    la ruta de la sonda devuelve 200 con el `index.html`. Un botón
//    condicionado al código de estado aparecería en todas las instancias.
// 2. Que sin `demoPath` la pantalla ni pregunte.
// 3. Que entrar recargue en vez de navegar (si no, rebota contra el guard).

function sondaResponde(cuerpo: unknown, { json = true, status = 200 } = {}) {
  vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({ username: 'demo' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
    }
    return Promise.resolve(new Response(
      typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
      { status, headers: { 'content-type': json ? 'application/json' : 'text/html' } },
    ))
  }))
}

const BOTON_DEMO = { name: 'Entrar a la demo' }

describe('el botón de la demo', () => {
  let irA: ReturnType<typeof vi.fn>

  beforeEach(() => {
    irA = vi.fn()
    // `window.location.assign` no está implementado en jsdom y además nos
    // interesa afirmar A DÓNDE manda, no sólo que no explote.
    Object.defineProperty(window, 'location', {
      configurable: true, value: { assign: irA, href: 'https://demo.test/login' },
    })
  })

  it('aparece si la instancia contesta la sonda con JSON', async () => {
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })

    expect(await screen.findByRole('button', BOTON_DEMO)).toBeInTheDocument()
    expect(screen.getByText(/entrás como «demo»/)).toBeInTheDocument()
  })

  it('🔴 NO aparece si la respuesta es un 200 que no es JSON', async () => {
    // El caso real: la instancia de un cliente, donde el catch-all de la SPA
    // devuelve el index.html con 200 para cualquier ruta que no exista. Es la
    // razón por la que la sonda valida la forma y no el código de estado.
    sondaResponde('<!doctype html><html><body><div id="root"></div></body></html>',
      { json: false })
    montar({ demoPath: '/auth/demo' })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', BOTON_DEMO)).not.toBeInTheDocument()
  })

  it('NO aparece si la sonda contesta JSON pero sin la forma esperada', async () => {
    // Un JSON cualquiera tampoco alcanza: la clave `enabled` en `true` es lo
    // que distingue a esta respuesta de cualquier otro endpoint que devuelva
    // 200 en esa ruta.
    sondaResponde({ detail: 'Not Found' })
    montar({ demoPath: '/auth/demo' })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', BOTON_DEMO)).not.toBeInTheDocument()
  })

  it('NO aparece si la instancia contesta 404, que es lo normal', async () => {
    sondaResponde({ detail: 'Not Found' }, { status: 404 })
    montar({ demoPath: '/auth/demo' })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', BOTON_DEMO)).not.toBeInTheDocument()
  })

  it('sin demoPath ni pregunta', async () => {
    sondaResponde({ enabled: true, username: 'demo' })
    montar()

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', BOTON_DEMO)).not.toBeInTheDocument()
  })

  // ── El código de acceso (libraauth v0.26.0) ─────────────────────────────
  //
  // La demo dejó de abrirse sola: el botón manda un código, y sin código no
  // manda nada. Lo que sigue fija las dos mitades — que con código entra, y
  // que sin código el botón no puede pegarle al endpoint.

  const CAMPO_CODIGO = { name: /código de acceso/i }

  it('el botón arranca deshabilitado hasta que se escribe un código', async () => {
    // 🔴 Es el cerrojo del lado de la pantalla. Sin esto el botón sigue
    // pudiendo pegarle a `POST /auth/demo` con el cuerpo vacío, que es
    // exactamente la llamada que este cambio existe para cortar.
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })

    expect(await screen.findByRole('button', BOTON_DEMO)).toBeDisabled()
    expect(screen.getByRole('textbox', CAMPO_CODIGO)).toBeInTheDocument()
  })

  it('los espacios de más no habilitan el botón', async () => {
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })
    await userEvent.setup().type(
      await screen.findByRole('textbox', CAMPO_CODIGO), '   ')

    expect(screen.getByRole('button', BOTON_DEMO)).toBeDisabled()
  })

  it('con un código entra y RECARGA, no navega', async () => {
    // 🔴 Recargar no es un detalle: el POST deja la cookie puesta, pero el
    // AuthProvider ya montó con user=null. Un `navigate` rebota contra el
    // guard de rutas y devuelve al login — el mismo síntoma que esto arregla.
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })
    const usuario = userEvent.setup()
    await usuario.type(
      await screen.findByRole('textbox', CAMPO_CODIGO), 'H7KQ-9MRT-2XVB')
    await usuario.click(screen.getByRole('button', BOTON_DEMO))

    await waitFor(() => expect(irA).toHaveBeenCalledWith('/dashboard'))
    expect(navegar).not.toHaveBeenCalled()
  })

  it('el código viaja en el cuerpo del POST', async () => {
    // Sin esto, el test de arriba pasaría igual con un `api.post` que no
    // manda nada: entra porque el fetch falso contesta 200, no porque el
    // código haya llegado.
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })
    const usuario = userEvent.setup()
    await usuario.type(
      await screen.findByRole('textbox', CAMPO_CODIGO), 'H7KQ-9MRT-2XVB')
    await usuario.click(screen.getByRole('button', BOTON_DEMO))

    await waitFor(() => expect(irA).toHaveBeenCalled())
    const post = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(JSON.parse((post?.[1] as RequestInit).body as string))
      .toEqual({ codigo: 'H7KQ-9MRT-2XVB' })
  })

  it('un código con espacios alrededor se manda recortado', async () => {
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })
    const usuario = userEvent.setup()
    await usuario.type(
      await screen.findByRole('textbox', CAMPO_CODIGO), '  H7KQ-9MRT-2XVB  ')
    await usuario.click(screen.getByRole('button', BOTON_DEMO))

    await waitFor(() => expect(irA).toHaveBeenCalled())
    const post = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(JSON.parse((post?.[1] as RequestInit).body as string).codigo)
      .toBe('H7KQ-9MRT-2XVB')
  })

  it('si el ingreso falla lo dice con el motivo del backend', async () => {
    // El 401 del motor ("el código no es válido o ya venció") es lo que ve
    // quien tipeó mal. El 503 ("demo user not provisioned") pasa cuando la
    // instancia todavía no se sembró: son dos causas distintas y decir
    // "usuario o contraseña incorrectos" mandaría a mirar el lugar
    // equivocado en las dos.
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === 'POST'
        ? new Response(JSON.stringify({ detail: 'demo user not provisioned' }),
          { status: 503, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ enabled: true, username: 'demo' }),
          { status: 200, headers: { 'content-type': 'application/json' } }))))
    montar({ demoPath: '/auth/demo' })
    const usuario = userEvent.setup()
    await usuario.type(
      await screen.findByRole('textbox', CAMPO_CODIGO), 'H7KQ-9MRT-2XVB')
    await usuario.click(screen.getByRole('button', BOTON_DEMO))

    expect(await screen.findByText(/demo user not provisioned/)).toBeInTheDocument()
    expect(irA).not.toHaveBeenCalled()
    // Y se puede reintentar: quedar deshabilitado dejaría la pantalla muerta
    // justo cuando alguien acaba de tipear mal un código.
    expect(screen.getByRole('button', BOTON_DEMO)).toBeEnabled()
  })

  it('el campo del código no aparece fuera de una demo', async () => {
    // La otra mitad del par: en la instancia de un cliente no hay ni botón ni
    // campo, así que el campo no puede ser una vía de ingreso ahí.
    sondaResponde({ detail: 'Not Found' }, { status: 404 })
    montar({ demoPath: '/auth/demo' })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('textbox', CAMPO_CODIGO)).not.toBeInTheDocument()
  })

  // ── El login de credenciales, plegado en una demo ────────────────────────
  //
  // El visitante veía dos formas de entrar y tenía una sola: probaba la de
  // arriba, no tenía credenciales, y se comía un "usuario o contraseña
  // incorrectos" antes de encontrar el campo que le correspondía.
  //
  // 🔴 El par que importa son los DOS lados: plegado en la demo, y **visible
  // como siempre** en las otras cinco instancias. Sin el segundo, esconderlo
  // de más pasaría en verde y dejaría a cinco productos sin pantalla de login.

  const ADMIN = { name: /soy administrador/i }

  it('en una demo el campo Usuario arranca escondido', async () => {
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })
    await screen.findByRole('textbox', CAMPO_CODIGO)

    expect(screen.queryByLabelText(/usuario/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', ADMIN)).toBeInTheDocument()
  })

  it('«Soy administrador» lo despliega', async () => {
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })
    await userEvent.setup().click(await screen.findByRole('button', ADMIN))

    expect(screen.getByLabelText(/usuario/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /^ingresar$/i })).toBeVisible()
    // Y el link se va: ya cumplió, y dejarlo sugeriría que hay algo más.
    expect(screen.queryByRole('button', ADMIN)).not.toBeInTheDocument()
  })

  it('🔴 fuera de una demo el login se ve como siempre', async () => {
    // La mitad que evita que esconderlo de más pase en verde.
    sondaResponde({ detail: 'Not Found' }, { status: 404 })
    montar({ demoPath: '/auth/demo' })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByLabelText(/usuario/i)).toBeVisible()
    expect(screen.queryByRole('button', ADMIN)).not.toBeInTheDocument()
  })

  it('sin demoPath tampoco se esconde nada', async () => {
    montar()

    expect(screen.getByLabelText(/usuario/i)).toBeVisible()
    expect(screen.queryByRole('button', ADMIN)).not.toBeInTheDocument()
  })

  it('en una demo el código va primero en el DOM', async () => {
    // El orden de lectura, no sólo la presencia: es lo que hace que el
    // visitante vea lo suyo antes que el login del administrador.
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })
    const codigo = await screen.findByRole('textbox', CAMPO_CODIGO)
    // Se despliega el login: plegado no hay campo Usuario en el DOM, así que
    // el orden se compara una vez que los dos existen.
    await userEvent.setup().click(screen.getByRole('button', ADMIN))
    const usuario = screen.getByLabelText(/usuario/i)

    expect(codigo.compareDocumentPosition(usuario))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('el encabezado dice que se entra con código', async () => {
    sondaResponde({ enabled: true, username: 'demo' })
    montar({ demoPath: '/auth/demo' })

    expect(await screen.findByText(/ingresá con tu código de acceso/i)).toBeInTheDocument()
    expect(screen.queryByText(/iniciá sesión para continuar/i)).not.toBeInTheDocument()
  })

  it('el login de credenciales sigue funcionando en una demo', async () => {
    // 🔴 Esconderlo no puede romperlo: es por donde entra quien administra la
    // instancia, y sin él no hay forma de llegar a Configuración ni al backup.
    sondaResponde({ enabled: true, username: 'demo' })
    const { login } = montar({ demoPath: '/auth/demo' })
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', ADMIN))
    await u.type(screen.getByLabelText(/usuario/i), 'admin')
    await u.type(screen.getByLabelText(/^contraseña$/i), 'la-del-admin')
    await u.click(screen.getByRole('button', { name: /^ingresar$/i }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'la-del-admin'))
  })
})


// ── El viejo segundo factor de una pantalla (v0.60.0, F2) — deprecado ───────
//
// Hasta v0.69.3 `totpPath` prendía una sonda propia y un campo «Código de
// verificación» arriba del formulario. v0.70.0 lo reemplaza por el login en
// dos pasos (ver más abajo) y **deja `totpPath` tipado pero ignorado** — lo
// sigue pasando el backoffice, que no tiene por qué dejar de compilar. Lo
// único que hace falta fijar acá es que pasarlo no dibuje nada ni pegue a
// ningún lado: si algo del campo viejo sobreviviera, esta prueba lo vería.
describe('totpPath (deprecado desde v0.70.0)', () => {
  it('se ignora: no pega la sonda ni dibuja el campo viejo', async () => {
    const fetchEspiado = vi.fn()
    vi.stubGlobal('fetch', fetchEspiado)
    const { login } = montar({ totpPath: '/api/login/opciones' })
    expect(fetchEspiado).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: /código de verificación/i })).not.toBeInTheDocument()
    await completarYEnviar()
    // La llamada de siempre, con DOS argumentos: pasar `totpPath` no cambia
    // el cuerpo que ve `login`.
    expect(login).toHaveBeenCalledWith('ana', 'clave')
  })
})


// ── El captcha «No soy un robot» (v0.69.0, ALTCHA) ──────────────────────────
//
// Opt-in por `captchaPath` y condicionado por la sonda, como el segundo
// factor. Lo que fijan estos tests, en orden de lo que se rompe sin que se note:
//
// 1. 🔴 Que sin tildar no se pueda ingresar, y que la solución viaje.
// 2. 🔴 Que después de un intento fallido haya que volver a tildar: el servidor
//    ya gastó ese desafío, y reenviarlo sería un 400 seguro.
// 3. Que el catch-all de la SPA (200 con HTML) no lo encienda.
// 4. Que sin la prop la llamada a `login` siga siendo la de siempre.

const DESAFIO = { parameters: { algorithm: 'PBKDF2/SHA-256' }, signature: 'firma' }
const ROBOT = { name: 'No soy un robot' }

function sondas(respuestas: Record<string, { cuerpo: unknown; json?: boolean; status?: number }>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const r = respuestas[url] ?? { cuerpo: { detail: 'Not Found' }, status: 404 }
    return Promise.resolve(new Response(
      typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo),
      { status: r.status ?? 200, headers: { 'content-type': (r.json ?? true) ? 'application/json' : 'text/html' } },
    ))
  }))
}

async function tipearCredenciales() {
  const usuario = userEvent.setup()
  await usuario.type(screen.getByLabelText('Usuario'), 'ana')
  await usuario.type(screen.getByLabelText('Contraseña'), 'clave')
  return usuario
}

describe('el captcha', () => {
  it('sin captchaPath ni pregunta ni lo dibuja, y la llamada es la de siempre', async () => {
    sondas({ '/auth/captcha': { cuerpo: DESAFIO } })
    const { login } = montar()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', ROBOT)).not.toBeInTheDocument()
    await completarYEnviar()
    expect(login).toHaveBeenCalledWith('ana', 'clave')
  })

  it('con un desafío aparece, e «Ingresar» espera a que se tilde', async () => {
    sondas({ '/auth/captcha': { cuerpo: DESAFIO } })
    const { login } = montar({ captchaPath: '/auth/captcha' })
    const robot = await screen.findByRole('button', ROBOT)
    expect(robot).toHaveAttribute('data-desafio', '/auth/captcha')
    const usuario = await tipearCredenciales()
    const ingresar = screen.getByRole('button', { name: 'Ingresar' })
    expect(ingresar).toBeDisabled()
    await usuario.click(robot)
    expect(ingresar).toBeEnabled()
    await usuario.click(ingresar)
    expect(login).toHaveBeenCalledWith('ana', 'clave', { captcha: 'PAYLOAD:/auth/captcha' })
    expect(navegar).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('con captcha y el login en dos pasos: el captcha viaja en el paso 1, y el modal no lo vuelve a pedir', async () => {
    // Reemplaza al viejo test de `totpPath` + captcha (v0.69.x): ahora el
    // segundo factor no es un campo del mismo formulario sino el modal de
    // `CodigoPorDigitos`, así que lo que hay que fijar es que el captcha
    // viaje en el POST de `login` y que el paso 2 no vuelva a pedirlo.
    sondas({ '/auth/captcha': { cuerpo: DESAFIO } })
    const login = vi.fn().mockRejectedValue(new SegundoFactorRequerido('desafio-abc'))
    const confirmarCodigo = vi.fn().mockResolvedValue({ id: '1', username: 'ana', role: 'admin' })
    montar({ login, confirmarCodigo, captchaPath: '/auth/captcha' })
    const robot = await screen.findByRole('button', ROBOT)
    const usuario = await tipearCredenciales()
    await usuario.click(robot)
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(login).toHaveBeenCalledWith('ana', 'clave', { captcha: 'PAYLOAD:/auth/captcha' })

    const dialogo = await screen.findByRole('dialog')
    await tipearCodigo(usuario, dialogo, '123456')

    // El paso 2 sólo manda el desafío y el código -- el captcha ya cumplió.
    await waitFor(() => expect(confirmarCodigo).toHaveBeenCalledWith('desafio-abc', '123456'))
  })

  it('🔴 después de un intento fallido hay que volver a tildar', async () => {
    sondas({ '/auth/captcha': { cuerpo: DESAFIO } })
    const login = vi.fn().mockRejectedValue(new ApiError(401, 'Usuario o contraseña incorrectos'))
    montar({ login, captchaPath: '/auth/captcha' })
    const usuario = await tipearCredenciales()
    await usuario.click(await screen.findByRole('button', ROBOT))
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument()
    // El widget se remontó: no hay solución, y el botón vuelve a esperar.
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDisabled()
    await usuario.click(await screen.findByRole('button', ROBOT))
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled()
  })

  it.each([
    ['🔴 un 200 que no es JSON (el catch-all de la SPA)', { cuerpo: '<!doctype html><html></html>', json: false }],
    ['un JSON sin la forma de un desafío', { cuerpo: { totp: true } }],
    ['un 404', { cuerpo: { detail: 'Not Found' }, status: 404 }],
  ])('%s no lo enciende', async (_caso, respuesta) => {
    sondas({ '/auth/captcha': respuesta })
    const { login } = montar({ captchaPath: '/auth/captcha' })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', ROBOT)).not.toBeInTheDocument()
    await completarYEnviar()
    expect(login).toHaveBeenCalledWith('ana', 'clave')
  })
})


// ── El login en dos pasos (v0.70.0) ─────────────────────────────────────────
//
// `login` puede lanzar `SegundoFactorRequerido` en vez de resolver: ahí se
// abre el modal con `CodigoPorDigitos`, y el segundo paso lo completa
// `confirmarCodigo` mandando `{ desafio, codigo }`. Lo que fijan estos tests,
// en el orden en que se rompe sin que se note:
//
// 1. 🔴 Que el modal se abra y NO se navegue todavía -- el usuario no está
//    logueado hasta que el paso 2 confirme.
// 2. 🔴 Que completar los 6 dígitos postee el `desafio` recibido, no cualquier
//    cosa, y ahí sí navegue.
// 3. Que un código incorrecto limpie los casilleros y deje el modal.
// 4. 🔴 Que un desafío vencido cierre el modal Y reinicie el captcha -- hace
//    falta un login nuevo desde cero.
// 5. Que cancelar cierre el modal, reinicie el captcha y NO borre lo tipeado.
// 6. Que sin `confirmarCodigo` en el `useAuth` del producto, se vea un error
//    en vez de romper.

async function tipearCodigo(usuario: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement, codigo: string) {
  for (let i = 0; i < codigo.length; i += 1) {
    await usuario.type(within(dialogo).getByLabelText(`Dígito ${i + 1} de 6`), codigo[i])
  }
}

describe('el login en dos pasos (v0.70.0)', () => {
  it('🔴 si login pide el código, abre el modal y NO navega todavía', async () => {
    const login = vi.fn().mockRejectedValue(new SegundoFactorRequerido('desafio-abc'))
    montar({ login, confirmarCodigo: vi.fn() })
    await completarYEnviar()

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Código de verificación')).toBeInTheDocument()
    expect(navegar).not.toHaveBeenCalled()
    expect(login).toHaveBeenCalledWith('ana', 'clave')
  })

  it('🔴 completar los 6 dígitos postea {desafio, codigo} y navega', async () => {
    const login = vi.fn().mockRejectedValue(new SegundoFactorRequerido('desafio-abc'))
    const confirmarCodigo = vi.fn().mockResolvedValue({ id: '1', username: 'ana', role: 'admin' })
    montar({ login, confirmarCodigo })
    await completarYEnviar()
    const dialogo = await screen.findByRole('dialog')
    const usuario = userEvent.setup()

    await tipearCodigo(usuario, dialogo, '123456')

    await waitFor(() => expect(confirmarCodigo).toHaveBeenCalledWith('desafio-abc', '123456'))
    await waitFor(() => expect(navegar).toHaveBeenCalledWith('/dashboard', { replace: true }))
  })

  it('el botón «Verificar» está deshabilitado hasta 6 dígitos, y mientras envía', async () => {
    // Con 5 dígitos, deshabilitado por faltar uno. Al completar el sexto se
    // envía SOLO (onComplete) -- y ahí el botón sigue deshabilitado, pero
    // ahora por el envío en curso, no por dígitos faltantes.
    const login = vi.fn().mockRejectedValue(new SegundoFactorRequerido('desafio-abc'))
    const confirmarCodigo = vi.fn(() => new Promise<never>(() => {})) // nunca resuelve
    montar({ login, confirmarCodigo })
    await completarYEnviar()
    const dialogo = await screen.findByRole('dialog')
    const usuario = userEvent.setup()

    await tipearCodigo(usuario, dialogo, '12345')
    expect(within(dialogo).getByRole('button', { name: 'Verificar' })).toBeDisabled()

    await usuario.type(within(dialogo).getByLabelText('Dígito 6 de 6'), '6')
    await waitFor(() => expect(confirmarCodigo).toHaveBeenCalledWith('desafio-abc', '123456'))
    expect(within(dialogo).getByRole('button', { name: 'Verificando…' })).toBeDisabled()
  })

  it('código incorrecto limpia los casilleros y deja el modal abierto', async () => {
    const login = vi.fn().mockRejectedValue(new SegundoFactorRequerido('desafio-abc'))
    const confirmarCodigo = vi.fn().mockRejectedValue(new ApiError(401, 'Código incorrecto.'))
    montar({ login, confirmarCodigo })
    await completarYEnviar()
    const dialogo = await screen.findByRole('dialog')
    const usuario = userEvent.setup()

    await tipearCodigo(usuario, dialogo, '123456')

    expect(await within(dialogo).findByText('Código incorrecto.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(navegar).not.toHaveBeenCalled()
    expect(within(dialogo).getByLabelText('Dígito 1 de 6')).toHaveValue('')
  })

  it('🔴 un desafío vencido cierra el modal, muestra el error arriba y reinicia el captcha', async () => {
    // Con captcha activo: es lo que hace falta para poder afirmar que se
    // reinició -- el widget se remonta y el botón "No soy un robot" vuelve a
    // pedir que lo tildes.
    sondas({ '/auth/captcha': { cuerpo: DESAFIO } })
    const login = vi.fn().mockRejectedValue(new SegundoFactorRequerido('desafio-abc'))
    const confirmarCodigo = vi.fn().mockRejectedValue(new ApiError(401, 'El código venció: volvé a ingresar.'))
    montar({ login, confirmarCodigo, captchaPath: '/auth/captcha' })
    const usuario = await tipearCredenciales()
    await usuario.click(await screen.findByRole('button', ROBOT))
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }))
    const dialogo = await screen.findByRole('dialog')

    await tipearCodigo(usuario, dialogo, '123456')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('El código venció: volvé a ingresar.')).toBeInTheDocument()
    expect(navegar).not.toHaveBeenCalled()
    // El captcha se remontó: hay que volver a tildarlo antes de reintentar.
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDisabled()
  })

  it('cancelar cierra el modal, reinicia el captcha y conserva usuario y contraseña', async () => {
    sondas({ '/auth/captcha': { cuerpo: DESAFIO } })
    const login = vi.fn().mockRejectedValue(new SegundoFactorRequerido('desafio-abc'))
    montar({ login, confirmarCodigo: vi.fn(), captchaPath: '/auth/captcha' })
    const usuario = await tipearCredenciales()
    await usuario.click(await screen.findByRole('button', ROBOT))
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }))
    const dialogo = await screen.findByRole('dialog')

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Usuario')).toHaveValue('ana')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('clave')
    // El captcha se remontó (se perdió la solución tildada).
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDisabled()
  })

  it('sin `confirmarCodigo` en el useAuth del producto, se ve un error y no rompe', async () => {
    const login = vi.fn().mockRejectedValue(new SegundoFactorRequerido('desafio-abc'))
    montar({ login }) // sin confirmarCodigo
    await completarYEnviar()

    expect(await screen.findByText(/segundo factor.*no lo tiene configurado/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(navegar).not.toHaveBeenCalled()
  })
})

// La pantalla de login de los 6 productos. Lo que importa acá es lo que
// ve el usuario cuando algo falla, y el enlace de recuperación, que es
// **opt-in** a propósito.
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLogin } from '../src/Login'
import { ApiError } from '../src/api-client'

const navegar = vi.fn()
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...real, useNavigate: () => navegar }
})

type UsuarioDePrueba = { id: string; username: string; role: string }

function montar({
  login = vi.fn().mockResolvedValue({ id: '1', username: 'ana', role: 'admin' }),
  ...config
}: {
  login?: ReturnType<typeof vi.fn>
  forgotPasswordPath?: string
  demoPath?: string
  onLoginSuccess?: (u: UsuarioDePrueba) => string
  formatError?: (e: ApiError) => string
} = {}) {
  const Login = createLogin<UsuarioDePrueba>({
    productName: 'Contalibra',
    productInitial: 'C',
    redirectTo: '/dashboard',
    useAuth: () => ({ login }),
    ...config,
  })
  render(<MemoryRouter><Login /></MemoryRouter>)
  return { login }
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
})


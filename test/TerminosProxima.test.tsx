// El aviso de la próxima versión de los Términos y la aceptación por adelantado (libraauth ADR-024, libra-ui ADR-066).
//
// Lo que fijan estos tests, en orden de lo que se rompe sin que se note:
//
// 1. 🔴 **Que «Aceptar» mande la versión PRÓXIMA al prefijo correcto.** Si mandara la vigente, el backend registraría la
//    aceptación equivocada; si ignorara `terminosPath`, ContaLibra y RestoLibra (`/api/terminos`) tocarían una ruta que no
//    existe y el aviso se vería sin que nada se registre.
// 2. 🔴 **Que no aparezca de más**: con la próxima ya aceptada, sin próxima, o para quien no puede aceptar (un operador no
//    puede hacer nada con él), y que no tape el gate bloqueante cuando éste corresponde.
// 3. Que «Más tarde» dure hasta el próximo ingreso, no menos (vuelve al recargar la vista nueva) ni más (no sobrevive a un
//    cierre de sesión).
// 4. Que el texto se pueda leer en el sistema y, si no llega, haya una salida a la página pública.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AvisoProximaVersion, GateTerminos, URL_TERMINOS_PROXIMA, type ProximaVersion } from '../src/Terminos'
import { createAuthContext } from '../src/AuthContext'
import { configurarTerminosPendientes } from '../src/api-client'

const PROXIMA: ProximaVersion = {
  version: '1.1',
  vigente_desde: '09-11-2026',
  hash_texto: 'b'.repeat(64),
  aceptada: false,
  aceptada_por: null,
  aceptada_at: null,
  resumen_del_cambio: 'El abono mensual pasa a ser precio final con IVA incluido.',
}

const ESTADO = {
  version: '1.0',
  vigente_desde: '22-08-2026',
  hash_texto: 'a'.repeat(64),
  pendiente: false,
  puede_aceptar: true,
  proxima: PROXIMA,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  configurarTerminosPendientes(() => {})
  window.sessionStorage.clear()
})

/** Responde `estado` a los GET del estado y `respuestas[ruta]` a lo demás. */
function servir(estado: unknown, respuestas: Record<string, unknown> = {}) {
  fetchMock.mockImplementation((ruta: string) =>
    ruta in respuestas ? Promise.resolve(json(respuestas[ruta])) : Promise.resolve(json(estado)))
}

const aviso = () => screen.queryByRole('region', { name: /Nueva versión de los Términos/i })
const envios = (ruta: string) => fetchMock.mock.calls.filter((c) => c[0] === ruta)

// ── 2. Cuándo aparece ───────────────────────────────────────────────────────

describe('cuándo aparece', () => {
  it('con una próxima sin aceptar, para quien puede aceptar: dice qué rige, desde cuándo y qué cambia, sin tapar la app', async () => {
    servir(ESTADO)
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)

    const region = await screen.findByRole('region', { name: /Nueva versión de los Términos/i })
    expect(region.textContent).toContain(
      'Desde el 09-11-2026 rige la versión 1.1 de los Términos y Condiciones. '
      + 'El abono mensual pasa a ser precio final con IVA incluido.')
    expect(within(region).getByRole('button', { name: 'Aceptar' })).toBeDisabled()
    expect(within(region).getByRole('button', { name: 'Más tarde' })).toBeTruthy()
    // No bloquea: la aplicación sigue ahí, sin la pantalla del gate.
    expect(screen.getByText('la aplicación')).toBeTruthy()
    expect(screen.queryByText('Términos y Condiciones del Servicio')).toBeNull()
  })

  it.each([
    ['la próxima ya está aceptada', { ...ESTADO, proxima: { ...PROXIMA, aceptada: true, aceptada_por: 'Ana' } }],
    ['no hay próxima (null)', { ...ESTADO, proxima: null }],
    ['el backend es anterior y no manda `proxima`', { ...ESTADO, proxima: undefined }],
    ['quien entra no puede aceptar', { ...ESTADO, puede_aceptar: false }],
  ])('🔴 no aparece si %s', async (_caso, estado) => {
    servir(estado)
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    await screen.findByText('la aplicación')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 10))
    expect(aviso()).toBeNull()
  })

  it('🔴 con la vigente pendiente manda el gate bloqueante y no el aviso', async () => {
    servir({ ...ESTADO, pendiente: true, texto_html: '<p>Cuerpo</p>' })
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    await screen.findByText('Términos y Condiciones del Servicio')
    expect(aviso()).toBeNull()
    expect(screen.queryByText('la aplicación')).toBeNull()
  })

  it('un error consultando el estado no muestra nada ni bloquea', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'boom' }, 500)))
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    expect(await screen.findByText('la aplicación')).toBeTruthy()
    expect(aviso()).toBeNull()
  })

  it('sin sesión (`activo` falso) no consulta ni muestra nada', async () => {
    render(<GateTerminos activo={false}><p>login</p></GateTerminos>)
    expect(await screen.findByText('login')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(aviso()).toBeNull()
  })

  it('sin resumen no queda un espacio ni un «null» colgando', async () => {
    servir({ ...ESTADO, proxima: { ...PROXIMA, resumen_del_cambio: null } })
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    const region = await screen.findByRole('region', { name: /Nueva versión/i })
    expect(region.textContent).toContain('rige la versión 1.1 de los Términos y Condiciones.')
    expect(region.textContent).not.toMatch(/null|undefined/)
  })
})

// ── 1. Aceptar ──────────────────────────────────────────────────────────────

describe('aceptar', () => {
  it('🔴 manda la versión PRÓXIMA a /terminos/aceptar y pasa a «Aceptado. Gracias.»', async () => {
    servir(ESTADO, { '/terminos/aceptar': { ...ESTADO, proxima: { ...PROXIMA, aceptada: true } } })
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    const region = await screen.findByRole('region', { name: /Nueva versión/i })

    await userEvent.click(within(region).getByRole('checkbox'))
    await userEvent.click(within(region).getByRole('button', { name: 'Aceptar' }))

    expect(await screen.findByText('Aceptado. Gracias.')).toBeTruthy()
    const [envio] = envios('/terminos/aceptar')
    expect(JSON.parse(envio[1].body)).toEqual({ version: '1.1' })
    expect(envio[1].method).toBe('POST')
    expect(envios('/terminos/aceptar')).toHaveLength(1)
    // Desapareció el aviso de aceptar: ya no hay botón «Aceptar» ni «Más tarde».
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Más tarde' })).toBeNull()
    // La app no se recargó ni se tapó: no era un gate.
    expect(screen.getByText('la aplicación')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(aviso()).toBeNull()
  })

  it('🔴 usa el prefijo de `terminosPath` (/api/terminos de Contalibra y Restolibra)', async () => {
    servir({ ...ESTADO }, { '/api/terminos/aceptar': { ...ESTADO } })
    render(<GateTerminos activo basePath="/api/terminos"><p>la aplicación</p></GateTerminos>)
    const region = await screen.findByRole('region', { name: /Nueva versión/i })
    await userEvent.click(within(region).getByRole('checkbox'))
    await userEvent.click(within(region).getByRole('button', { name: 'Aceptar' }))
    await screen.findByText('Aceptado. Gracias.')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/terminos')
    expect(envios('/api/terminos/aceptar')).toHaveLength(1)
    expect(envios('/terminos/aceptar')).toHaveLength(0)
  })

  it('un error al registrar se muestra y deja reintentar, sin «Aceptado»', async () => {
    fetchMock.mockImplementation((ruta: string) =>
      ruta === '/terminos/aceptar'
        ? Promise.resolve(json({ detail: 'La versión cambió mientras se aceptaba. Recargá la página.' }, 409))
        : Promise.resolve(json(ESTADO)))
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    const region = await screen.findByRole('region', { name: /Nueva versión/i })
    await userEvent.click(within(region).getByRole('checkbox'))
    await userEvent.click(within(region).getByRole('button', { name: 'Aceptar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/La versión cambió/)
    expect(screen.queryByText('Aceptado. Gracias.')).toBeNull()
    expect(within(region).getByRole('button', { name: 'Aceptar' })).not.toBeDisabled()
  })

  it('avisa al producto cuando se aceptó', async () => {
    servir(ESTADO)
    const alAceptar = vi.fn()
    render(<AvisoProximaVersion proxima={PROXIMA} onAceptada={alAceptar} />)
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    await waitFor(() => expect(alAceptar).toHaveBeenCalled())
  })
})

// ── 3. «Más tarde» ──────────────────────────────────────────────────────────

describe('más tarde', () => {
  it('lo oculta y no vuelve al volver a montar en la misma sesión', async () => {
    servir(ESTADO)
    const { unmount } = render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    await userEvent.click(await screen.findByRole('button', { name: 'Más tarde' }))
    expect(aviso()).toBeNull()
    // No registró nada.
    expect(envios('/terminos/aceptar')).toHaveLength(0)

    unmount()
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    await screen.findByText('la aplicación')
    await new Promise((r) => setTimeout(r, 10))
    expect(aviso()).toBeNull()
  })

  it('🔴 vuelve a aparecer en el próximo ingreso: cerrar sesión y volver a entrar lo muestra de nuevo', async () => {
    servir(ESTADO)
    const { rerender } = render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    await userEvent.click(await screen.findByRole('button', { name: 'Más tarde' }))
    expect(aviso()).toBeNull()

    rerender(<GateTerminos activo={false}><p>login</p></GateTerminos>)
    await screen.findByText('login')
    rerender(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    expect(await screen.findByRole('region', { name: /Nueva versión/i })).toBeTruthy()
  })

  it('sin `sessionStorage` (ventana privada) igual se oculta y nada se rompe', async () => {
    const roto = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    const lee = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    try {
      servir(ESTADO)
      render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
      await userEvent.click(await screen.findByRole('button', { name: 'Más tarde' }))
      expect(aviso()).toBeNull()
      expect(screen.getByText('la aplicación')).toBeTruthy()
    } finally {
      roto.mockRestore()
      lee.mockRestore()
    }
  })
})

// ── 4. Leer el texto ────────────────────────────────────────────────────────

describe('leer la versión', () => {
  it('abre el texto en un diálogo, lo pide recién ahora con ?texto=1 y muestra la huella', async () => {
    servir(ESTADO, {
      '/terminos?texto=1': {
        ...ESTADO, texto_html: '<h2>vigente</h2>',
        proxima: { ...PROXIMA, texto_html: '<h2>5. Precio, impuestos y forma de pago</h2><p>precio final con el IVA incluido</p>' },
      },
    })
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    await screen.findByRole('region', { name: /Nueva versión/i })
    // El estado liviano no pide el texto.
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/terminos'])

    await userEvent.click(screen.getByRole('button', { name: /Leer la versión 1\.1/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(await within(dialogo).findByText(/precio final con el IVA incluido/)).toBeTruthy()
    // Muestra el texto de la PRÓXIMA, no el de la vigente.
    expect(within(dialogo).queryByText('vigente')).toBeNull()
    expect(within(dialogo).getByText('b'.repeat(64))).toBeTruthy()
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain('/terminos?texto=1')

    await userEvent.click(within(dialogo).getAllByRole('button', { name: /Cerrar/ })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Leer no acepta ni oculta el aviso.
    expect(aviso()).toBeTruthy()
    expect(envios('/terminos/aceptar')).toHaveLength(0)
  })

  it('si el backend no trae el texto de la próxima, ofrece la página pública', async () => {
    servir(ESTADO, { '/terminos?texto=1': ESTADO })
    render(<AvisoProximaVersion proxima={PROXIMA} />)
    await userEvent.click(screen.getByRole('button', { name: /Leer la versión/ }))
    const enlace = await screen.findByRole('link', { name: /página pública/ })
    expect(enlace).toHaveAttribute('href', URL_TERMINOS_PROXIMA)
    expect(URL_TERMINOS_PROXIMA).toBe('/legal/terminos-proxima.html')
  })

  it('si la llamada falla, también ofrece la página pública (y se puede cambiar la dirección)', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('sin red')))
    render(<AvisoProximaVersion proxima={PROXIMA} urlTexto="https://compulibra.com.ar/legal/terminos-proxima.html" />)
    await userEvent.click(screen.getByRole('button', { name: /Leer la versión/ }))
    const enlace = await screen.findByRole('link', { name: /página pública/ })
    expect(enlace).toHaveAttribute('href', 'https://compulibra.com.ar/legal/terminos-proxima.html')
  })
})

// ── El cableado: cuelga del AuthProvider, sin que el producto haga nada ─────

describe('colgado del AuthProvider', () => {
  it('con sesión de admin y una próxima sin aceptar, el aviso sale sin tocar el producto (también con /api/terminos)', async () => {
    fetchMock.mockImplementation((ruta: string) =>
      ruta.startsWith('/api/terminos')
        ? Promise.resolve(json(ESTADO))
        : Promise.resolve(json({ id: '1', role: 'admin' })))
    const { AuthProvider } = createAuthContext<{ id: string; role: string }>({
      mePath: '/api/me', loginPath: '/api/login', logoutPath: '/api/logout', terminosPath: '/api/terminos',
    })
    render(<AuthProvider><p>la aplicación</p></AuthProvider>)
    expect(await screen.findByRole('region', { name: /Nueva versión/i })).toBeTruthy()
    expect(screen.getByText('la aplicación')).toBeTruthy()
  })

  it('`sinGateDeTerminos` (backoffice de superadmin) tampoco muestra el aviso', async () => {
    fetchMock.mockImplementation((ruta: string) =>
      ruta.startsWith('/terminos') ? Promise.resolve(json(ESTADO)) : Promise.resolve(json({ id: '1', role: 'admin' })))
    const { AuthProvider } = createAuthContext<{ id: string; role: string }>({
      mePath: '/api/me', loginPath: '/api/login', logoutPath: '/api/logout', sinGateDeTerminos: true,
    })
    render(<AuthProvider><p>la aplicación</p></AuthProvider>)
    expect(await screen.findByText('la aplicación')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 10))
    expect(aviso()).toBeNull()
  })
})

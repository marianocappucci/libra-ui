// La pantalla bloqueante de Términos y el gate que la muestra.
//
// Lo que fijan estos tests, en orden de lo que se rompe sin que se note:
//
// 1. 🔴 **Que nadie quede encerrado.** Un operador que no puede aceptar tiene
//    que poder cerrar sesión, y un error al consultar el estado NO puede
//    bloquear: la instancia quedaría muerta por una llamada que falló. El corte
//    real lo hace el backend; esta pantalla no es una decisión de seguridad.
// 2. 🔴 **Que el gate se entere por los dos caminos.** La consulta al montar
//    cubre la pantalla que no pide datos; la intercepción del 403 cubre la
//    versión nueva publicada con la pestaña abierta. Con uno solo, hay un
//    agujero que no da error.
// 3. Que sólo el rol admin vea el botón de aceptar (cláusula 30.5).
// 4. Que se acepte la versión que se tenía delante, no "la vigente".
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GateTerminos, PantallaTerminos } from '../src/Terminos'
import { createAuthContext } from '../src/AuthContext'
import { api, configurarTerminosPendientes } from '../src/api-client'

const ESTADO = {
  version: '1.0',
  vigente_desde: '22-08-2026',
  hash_texto: 'a'.repeat(64),
  pendiente: true,
  puede_aceptar: true,
  texto_html: '<h1>TÉRMINOS Y CONDICIONES</h1><p>Cuerpo del contrato.</p>',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  // El gate registra un callback global en `api-client`; entre tests hay que
  // dejarlo inerte o el de un caso anterior sigue escuchando.
  configurarTerminosPendientes(() => {})
})

// ── 1. Nadie queda encerrado ────────────────────────────────────────────────

describe('salidas', () => {
  it('quien no puede aceptar ve el motivo y el botón de cerrar sesión', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json({ ...ESTADO, puede_aceptar: false })))
    const salir = vi.fn()
    render(<PantallaTerminos onSalir={salir} />)

    await screen.findByText(/Sólo el responsable de la cuenta/i)
    expect(screen.queryByRole('button', { name: /Aceptar y continuar/i })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Cerrar sesión/i }))
    expect(salir).toHaveBeenCalled()
  })

  it('🔴 un error consultando el estado NO bloquea', async () => {
    // Una instancia sin el router montado, o una llamada que falla por red, no
    // puede dejar a nadie afuera. Lo que garantiza el corte es el 403.
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'boom' }, 500)))
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    expect(await screen.findByText('la aplicación')).toBeTruthy()
  })
})

// ── 2. Los dos caminos por los que se entera ────────────────────────────────

describe('cómo se entera el gate', () => {
  it('consultando al montar, cuando hay sesión', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(ESTADO)))
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)

    await screen.findByText('Términos y Condiciones del Servicio')
    expect(screen.queryByText('la aplicación')).toBeNull()
    // El estado se pide liviano; el texto lo pide después la pantalla.
    expect(fetchMock.mock.calls[0][0]).toBe('/terminos')
    await waitFor(() =>
      expect(fetchMock.mock.calls.map((c) => c[0])).toContain('/terminos?texto=1'))
  })

  it('sin sesión no consulta ni bloquea', async () => {
    render(<GateTerminos activo={false}><p>la pantalla de login</p></GateTerminos>)
    expect(await screen.findByText('la pantalla de login')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('🔴 por el 403 de cualquier llamada, con la aplicación ya montada', async () => {
    // El caso de la versión nueva publicada con la pestaña abierta. Sin esto,
    // el corte del backend se ve como "forbidden" en rojo donde iban los datos.
    fetchMock.mockImplementation((ruta: string) =>
      ruta === '/terminos'
        ? Promise.resolve(json({ ...ESTADO, pendiente: false }))
        : Promise.resolve(json(ESTADO)))
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    expect(await screen.findByText('la aplicación')).toBeTruthy()

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(
        { detail: { code: 'terminos_pendientes', version: '1.0', mensaje: 'falta aceptar' } },
        403,
      )))
    await api.get('/clientes').catch(() => {})

    await screen.findByText('Términos y Condiciones del Servicio')
    expect(screen.queryByText('la aplicación')).toBeNull()
  })

  it('al aceptar desde el gate, recarga la aplicación entera', async () => {
    // No alcanza con esconder la pantalla: mientras el gate estuvo puesto, cada
    // llamada que la aplicación hizo se fue en 403. Volver a montar es más
    // barato que perseguir cada pantalla para que reintente.
    const recargar = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: recargar }, writable: true,
    })
    fetchMock.mockImplementation(() => Promise.resolve(json(ESTADO)))
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)

    await screen.findByText('TÉRMINOS Y CONDICIONES')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Aceptar y continuar/i }))
    await waitFor(() => expect(recargar).toHaveBeenCalled())
  })

  it('un 403 común no dispara la pantalla', async () => {
    // Control negativo: sin esto, el verde de arriba se explicaría igual por un
    // gate que se enciende con cualquier 403 y bloquea al operador que
    // simplemente no tiene permisos.
    fetchMock.mockImplementation((ruta: string) =>
      ruta === '/terminos'
        ? Promise.resolve(json({ ...ESTADO, pendiente: false }))
        : Promise.resolve(json({ detail: 'forbidden' }, 403)))
    render(<GateTerminos activo><p>la aplicación</p></GateTerminos>)
    expect(await screen.findByText('la aplicación')).toBeTruthy()

    await api.get('/clientes').catch(() => {})
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText('Términos y Condiciones del Servicio')).toBeNull()
    expect(screen.getByText('la aplicación')).toBeTruthy()
  })
})

// ── 3 y 4. La aceptación ────────────────────────────────────────────────────

describe('aceptar', () => {
  it('muestra el contrato, la huella y exige tildar antes de habilitar', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(ESTADO)))
    render(<PantallaTerminos />)

    await screen.findByText('TÉRMINOS Y CONDICIONES')
    expect(screen.getByText(ESTADO.hash_texto)).toBeTruthy()
    expect(screen.getByText(/Versión 1\.0/)).toBeTruthy()

    const boton = screen.getByRole('button', { name: /Aceptar y continuar/i })
    expect(boton).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    expect(boton).not.toBeDisabled()
  })

  it('🔴 manda la versión que se tenía delante, no una constante', async () => {
    // Si mandara "la vigente", una pestaña abierta desde antes de un deploy
    // registraría la aceptación de un texto que nunca se mostró.
    fetchMock.mockImplementation(() => Promise.resolve(json({ ...ESTADO, version: '0.9' })))
    const aceptado = vi.fn()
    render(<PantallaTerminos onAceptado={aceptado} />)

    await screen.findByText('TÉRMINOS Y CONDICIONES')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Aceptar y continuar/i }))

    await waitFor(() => expect(aceptado).toHaveBeenCalled())
    const envio = fetchMock.mock.calls.find((c) => c[0] === '/terminos/aceptar')
    expect(JSON.parse(envio![1].body)).toEqual({ version: '0.9' })
  })

  it('un error al registrar se muestra y deja reintentar', async () => {
    fetchMock.mockImplementation((ruta: string) =>
      ruta === '/terminos/aceptar'
        ? Promise.resolve(json({ detail: 'La versión vigente es 1.1' }, 409))
        : Promise.resolve(json(ESTADO)))
    render(<PantallaTerminos />)

    await screen.findByText('TÉRMINOS Y CONDICIONES')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Aceptar y continuar/i }))

    expect(await screen.findByText(/La versión vigente es 1\.1/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Aceptar y continuar/i })).not.toBeDisabled()
  })

  it('usa el prefijo que se le pase', async () => {
    // Contalibra y Restolibra sirven su API bajo /api.
    fetchMock.mockImplementation(() => Promise.resolve(json(ESTADO)))
    render(<PantallaTerminos basePath="/api/terminos" />)
    await screen.findByText('TÉRMINOS Y CONDICIONES')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/terminos?texto=1')
  })
})

// ── El cableado: el gate cuelga del AuthProvider ────────────────────────────
//
// 🔴 Es lo que hace que ningún producto tenga que envolverse. Si alguien lo
// sacara de acá, los ocho seguirían compilando y andando —y ninguno cortaría.

describe('el gate colgado del AuthProvider', () => {
  function armar(config: Parameters<typeof createAuthContext>[0]) {
    const { AuthProvider } = createAuthContext<{ id: string; role: string }>(config)
    return () => render(<AuthProvider><p>la aplicación</p></AuthProvider>)
  }

  it('con sesión y contrato pendiente, bloquea sin que el producto haga nada', async () => {
    fetchMock.mockImplementation((ruta: string) =>
      ruta.startsWith('/api/terminos')
        ? Promise.resolve(json(ESTADO))
        : Promise.resolve(json({ id: '1', role: 'admin' })))
    armar({ mePath: '/api/me', loginPath: '/api/login', logoutPath: '/api/logout',
            terminosPath: '/api/terminos' })()

    await screen.findByText('Términos y Condiciones del Servicio')
    expect(screen.queryByText('la aplicación')).toBeNull()
  })

  it('🔴 el "cerrar sesión" de la pantalla llama al logout del contexto', async () => {
    // Sin esto, un operador que no puede aceptar queda encerrado: el botón
    // existiría pero no haría nada, que es peor que no tenerlo.
    fetchMock.mockImplementation((ruta: string) =>
      ruta.startsWith('/api/terminos')
        ? Promise.resolve(json({ ...ESTADO, puede_aceptar: false }))
        : Promise.resolve(json({ id: '1', role: 'staff' })))
    armar({ mePath: '/api/me', loginPath: '/api/login', logoutPath: '/api/logout',
            terminosPath: '/api/terminos' })()

    await screen.findByText('Términos y Condiciones del Servicio')
    await userEvent.click(await screen.findByRole('button', { name: /Cerrar sesión/i }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.map((c) => c[0])).toContain('/api/logout'))
  })

  it('sin sesión no bloquea: la pantalla de login tiene que verse', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'not authenticated' }, 401)))
    armar({ mePath: '/api/me', loginPath: '/api/login', logoutPath: '/api/logout' })()
    expect(await screen.findByText('la aplicación')).toBeTruthy()
  })

  it('`sinGateDeTerminos` lo apaga, para el backoffice de superadmin', async () => {
    fetchMock.mockImplementation((ruta: string) =>
      ruta.startsWith('/terminos')
        ? Promise.resolve(json(ESTADO))
        : Promise.resolve(json({ id: '1', role: 'admin' })))
    armar({ mePath: '/api/me', loginPath: '/api/login', logoutPath: '/api/logout',
            sinGateDeTerminos: true })()

    expect(await screen.findByText('la aplicación')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText('Términos y Condiciones del Servicio')).toBeNull()
  })
})

// La tarjeta de la copia externa, compartida por los productos que usan la
// Configuración del kit.
//
// Lo que fija:
//
// - Que distinga los estados de la subida. Con dos —"anda" y "no anda"— le
//   mostraría una alarma a quien no contrató el add-on, que es ruido, y nada a
//   quien lo contrató y hace cuatro días que no sube, que es el caso silencioso
//   que todo este trabajo vino a cerrar.
// - Desde que la cuenta se conecta desde la pantalla (2026-09-10): que ofrezca
//   conectar **sólo con el plan**, que no mande al navegador a ningún lado sin
//   la URL que arma el backend, y que desconectar pase por la confirmación.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ResguardoExternoCard } from '../src/Configuracion'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

type Ruta = (init?: RequestInit) => Response

/** Responde por **final exacto** de la ruta, y 404 a lo que no esté. Por
 *  final y no por `includes`: `/resguardo-externo` es prefijo de
 *  `/resguardo-externo/enlace`, y confundirlos es justo el modo de falla que
 *  un test de esta tarjeta tiene que poder ver. */
function rutas(mapa: Record<string, Ruta>) {
  const f = vi.fn((url: string, init?: RequestInit) => {
    const ruta = String(url).split('?')[0]
    const clave = Object.keys(mapa).find((k) => ruta.endsWith(k))
    return Promise.resolve(clave ? mapa[clave](init) : json({ detail: 'Not Found' }, 404))
  })
  vi.stubGlobal('fetch', f)
  return f
}

const SIN_SUBIDAS = { contratado: false, al_dia: null, motivo: null, detalle: null }
const AL_DIA = {
  contratado: true, al_dia: true, motivo: 'al dia (2026-08-12T04:20:00)',
  detalle: {
    cuando: '2026-08-12T04:20:00', archivo: 'backup_automatico_20260812_040000.zip',
    destino: 'drive_compulibra:libra/compulibra', bytes: 3800000,
    en_destino: 10, error: null,
  },
}
const VIEJA = {
  contratado: true, al_dia: false,
  motivo: 'la ultima copia externa es de 2026-08-08T04:20:00, hace mas de 36 horas',
  detalle: {
    cuando: '2026-08-08T04:20:00', archivo: null, destino: 'drive_x:',
    bytes: null, en_destino: null, error: null,
  },
}
const PROVEEDORES = [{ clave: 'drive', nombre: 'Google Drive' }, { clave: 'dropbox', nombre: 'Dropbox' }]
const VINCULO = {
  proveedor: 'drive', nombre: 'Google Drive', cuenta: 'cliente@gmail.com',
  carpeta: 'Resguardo Contalibra', desde: '2026-09-10T15:04:05-03:00',
}

const estado = (body: unknown): Ruta => () => json(body)
const enlace = (vinculo: unknown = null, proveedores = PROVEEDORES): Ruta =>
  () => json({ proveedores, enlace: vinculo })

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

// ── La subida, con un LibraCore que todavía no sabe enlazar ─────────────────

it('sin contratar muestra la propuesta y NO una alarma', async () => {
  rutas({ '/resguardo-externo': estado(SIN_SUBIDAS) })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/Consultanos para activarlo/)).toBeInTheDocument())
  expect(screen.queryByText(/con problemas/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Conectar/ })).not.toBeInTheDocument()
})

it('al día muestra el destino y la fecha', async () => {
  rutas({ '/resguardo-externo': estado(AL_DIA) })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/al día/)).toBeInTheDocument())
  expect(screen.getByText(/drive_compulibra:libra\/compulibra/)).toBeInTheDocument()
  // "copias" y no sólo el número: es la redacción de Contalibra, que es la que
  // quedó como canónica al unificar la pantalla (v0.47.0).
  expect(screen.getByText(/10 copias guardadas afuera/)).toBeInTheDocument()
  // El nombre del archivo también sale: sin él, "la copia está al día" no se
  // puede contrastar contra lo que hay del otro lado.
  expect(screen.getByText(/backup_automatico_20260812_040000\.zip/)).toBeInTheDocument()
})

it('con problemas muestra el motivo que da el backend', async () => {
  rutas({ '/resguardo-externo': estado(VIEJA) })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/con problemas/)).toBeInTheDocument())
  expect(screen.getByText(/hace mas de 36 horas/)).toBeInTheDocument()
})

it('si ningún endpoint existe la tarjeta no aparece', async () => {
  // Una instancia con un LibraCore anterior a v1.32.0. No tiene que romper la
  // pantalla ni mostrar una alarma: simplemente no se ve.
  const f = rutas({})

  const { container } = render(<ResguardoExternoCard />)

  await waitFor(() => expect(f).toHaveBeenCalledTimes(2))
  expect(container.textContent).toBe('')
})

// ── Conectar ────────────────────────────────────────────────────────────────

it('sin el plan (403) muestra la propuesta y no los botones', async () => {
  rutas({
    '/resguardo-externo': estado(SIN_SUBIDAS),
    '/resguardo-externo/enlace': () => json({ detail: "modulo 'resguardo_externo' no incluido en el plan actual" }, 403),
  })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/Consultanos para activarlo/)).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /Conectar/ })).not.toBeInTheDocument()
})

it('con el plan y sin conectar ofrece los proveedores habilitados', async () => {
  rutas({ '/resguardo-externo': estado(SIN_SUBIDAS), '/resguardo-externo/enlace': enlace() })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByRole('button', { name: 'Conectar Google Drive' })).toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Conectar Dropbox' })).toBeInTheDocument()
  expect(screen.queryByText(/Consultanos para activarlo/)).not.toBeInTheDocument()
})

it('con el plan pero sin proveedores habilitados no ofrece botones que terminan en un error', async () => {
  rutas({ '/resguardo-externo': estado(SIN_SUBIDAS), '/resguardo-externo/enlace': enlace(null, []) })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/todavía no está habilitada/)).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /Conectar/ })).not.toBeInTheDocument()
})

it('conectar pide la URL al backend y recién ahí manda al navegador', async () => {
  const URL_GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth?state=abc'
  const f = rutas({
    '/resguardo-externo': estado(SIN_SUBIDAS),
    '/resguardo-externo/enlace': enlace(),
    '/resguardo-externo/enlace/drive': () => json({ url: URL_GOOGLE }),
  })
  const navegar = vi.fn()

  render(<ResguardoExternoCard navegar={navegar} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Conectar Google Drive' }))

  await waitFor(() => expect(navegar).toHaveBeenCalledWith(URL_GOOGLE))
  expect(f).toHaveBeenCalledWith(
    '/api/config/resguardo-externo/enlace/drive', expect.objectContaining({ method: 'POST' }),
  )
})

it('si el backend no deja conectar muestra el motivo y no navega', async () => {
  rutas({
    '/resguardo-externo': estado(SIN_SUBIDAS),
    '/resguardo-externo/enlace': enlace(),
    '/resguardo-externo/enlace/drive': () => json({ detail: 'Google Drive todavia no esta habilitado en este servidor.' }, 422),
  })
  const navegar = vi.fn()

  render(<ResguardoExternoCard navegar={navegar} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Conectar Google Drive' }))

  await waitFor(() => expect(screen.getByText(/todavia no esta habilitado/)).toBeInTheDocument())
  expect(navegar).not.toHaveBeenCalled()
})

// ── Conectada ───────────────────────────────────────────────────────────────

it('conectada y sin subidas todavía: dice a qué cuenta y que la primera sale esta noche', async () => {
  rutas({ '/resguardo-externo': estado(SIN_SUBIDAS), '/resguardo-externo/enlace': enlace(VINCULO) })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/Copia externa conectada/)).toBeInTheDocument())
  expect(screen.getByText('cliente@gmail.com')).toBeInTheDocument()
  expect(screen.getByText('Resguardo Contalibra')).toBeInTheDocument()
  expect(screen.getByText(/10-09-2026 15:04/)).toBeInTheDocument()
  expect(screen.getByText(/la primera sale esta noche/)).toBeInTheDocument()
  // Conectada no es "sin contratar": ni la propuesta, ni los botones de conectar.
  expect(screen.queryByText(/Consultanos/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Conectar/ })).not.toBeInTheDocument()
})

it('conectada y al día muestra la cuenta y la última copia', async () => {
  rutas({ '/resguardo-externo': estado(AL_DIA), '/resguardo-externo/enlace': enlace(VINCULO) })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/Copia externa al día/)).toBeInTheDocument())
  expect(screen.getByText('cliente@gmail.com')).toBeInTheDocument()
  expect(screen.getByText(/10 copias guardadas afuera/)).toBeInTheDocument()
})

it('conectada con problemas muestra el motivo', async () => {
  rutas({ '/resguardo-externo': estado(VIEJA), '/resguardo-externo/enlace': enlace(VINCULO) })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/Copia externa con problemas/)).toBeInTheDocument())
  expect(screen.getByText(/hace mas de 36 horas/)).toBeInTheDocument()
})

it('desconectar pasa por la confirmación, y arrepentirse no llama al backend', async () => {
  let vinculado = true
  const f = rutas({
    '/resguardo-externo': estado(SIN_SUBIDAS),
    '/resguardo-externo/enlace': (init) => {
      if (init?.method === 'DELETE') {
        vinculado = false
        return json({ ok: true, revocado: true })
      }
      return json({ proveedores: PROVEEDORES, enlace: vinculado ? VINCULO : null })
    },
  })
  const borrados = () => f.mock.calls.filter(([, init]) => init?.method === 'DELETE')

  render(<ResguardoExternoCard />)
  fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
  expect(borrados()).toHaveLength(0)

  fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desconectar' }))

  await waitFor(() => expect(screen.getByText('Copia externa desconectada.')).toBeInTheDocument())
  expect(borrados()).toHaveLength(1)
  // Vuelve a ofrecer conectar: el estado se relee, no se supone.
  expect(screen.getByRole('button', { name: 'Conectar Google Drive' })).toBeInTheDocument()
})

it('si no se pudo revocar avisa que el permiso puede seguir en la cuenta', async () => {
  rutas({
    '/resguardo-externo': estado(SIN_SUBIDAS),
    '/resguardo-externo/enlace': (init) => (init?.method === 'DELETE'
      ? json({ ok: true, revocado: false })
      : json({ proveedores: PROVEEDORES, enlace: VINCULO })),
  })

  render(<ResguardoExternoCard />)
  fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desconectar' }))

  await waitFor(() => expect(screen.getByText(/puede seguir figurando en tu cuenta de Google Drive/)).toBeInTheDocument())
})

// ── La vuelta del proveedor ─────────────────────────────────────────────────

it('la vuelta con ok avisa y limpia la URL sin perder la sección', async () => {
  window.history.replaceState(null, '', '/configuracion?seccion=datos&resguardo=ok')
  rutas({ '/resguardo-externo': estado(SIN_SUBIDAS), '/resguardo-externo/enlace': enlace(VINCULO) })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/quedó conectada/)).toBeInTheDocument())
  // Sin limpiarla, recargar la página vuelve a decir "quedó conectada".
  expect(window.location.search).toBe('?seccion=datos')
})

it('la vuelta con error muestra el detalle que manda el backend', async () => {
  window.history.replaceState(
    null, '', '/configuracion?seccion=datos&resguardo=error&detalle=Cancelaste+el+permiso%2C+asi+que+no+se+conecto+nada.',
  )
  rutas({ '/resguardo-externo': estado(SIN_SUBIDAS), '/resguardo-externo/enlace': enlace() })

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/Cancelaste el permiso/)).toBeInTheDocument())
  expect(window.location.search).toBe('?seccion=datos')
})

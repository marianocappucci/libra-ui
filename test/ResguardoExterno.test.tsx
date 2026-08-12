// La tarjeta del resguardo externo, compartida por Gestiolibra, MedLibra y
// VentaLibra.
//
// Lo que fija, y es lo único que importa acá: que la pantalla distinga los
// **tres** estados. Con dos —"anda" y "no anda"— le mostraría una alarma a
// quien no contrató el add-on, que es ruido, y no le mostraría nada a quien lo
// contrató y hace cuatro días que no sube, que es el caso silencioso que todo
// este trabajo vino a cerrar.
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import { ResguardoExternoCard } from '../src/Configuracion'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function responder(respuesta: () => Response) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respuesta())))
}

beforeEach(() => {
  vi.restoreAllMocks()
})

it('sin contratar muestra la propuesta y NO una alarma', async () => {
  responder(() => json({ contratado: false, al_dia: null, motivo: null, detalle: null }))

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/Copia externa/)).toBeInTheDocument())
  expect(screen.getByText(/Consultanos para activarlo/)).toBeInTheDocument()
  expect(screen.queryByText(/con problemas/)).not.toBeInTheDocument()
})

it('al día muestra el destino y la fecha', async () => {
  responder(() => json({
    contratado: true, al_dia: true, motivo: 'al dia (2026-08-12T04:20:00)',
    detalle: {
      cuando: '2026-08-12T04:20:00', archivo: 'backup_automatico_20260812_040000.zip',
      destino: 'drive_compulibra:libra/compulibra', bytes: 3800000,
      en_destino: 10, error: null,
    },
  }))

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/al día/)).toBeInTheDocument())
  expect(screen.getByText(/drive_compulibra:libra\/compulibra/)).toBeInTheDocument()
  expect(screen.getByText(/10 guardadas afuera/)).toBeInTheDocument()
})

it('con problemas muestra el motivo que da el backend', async () => {
  responder(() => json({
    contratado: true, al_dia: false,
    motivo: 'la ultima copia externa es de 2026-08-08T04:20:00, hace mas de 36 horas',
    detalle: {
      cuando: '2026-08-08T04:20:00', archivo: null, destino: 'drive_x:',
      bytes: null, en_destino: null, error: null,
    },
  }))

  render(<ResguardoExternoCard />)

  await waitFor(() => expect(screen.getByText(/con problemas/)).toBeInTheDocument())
  expect(screen.getByText(/hace mas de 36 horas/)).toBeInTheDocument()
})

it('si el endpoint no existe la tarjeta no aparece', async () => {
  // Una instancia con un LibraCore anterior a v1.32.0. No tiene que romper la
  // pantalla ni mostrar una alarma: simplemente no se ve.
  responder(() => json({ detail: 'Not Found' }, 404))

  const { container } = render(<ResguardoExternoCard />)

  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(container.textContent).toBe('')
})

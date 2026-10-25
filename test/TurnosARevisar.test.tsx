// La lista «Turnos a revisar» (ADR-095): un turno, una tarjeta, con el motivo en lenguaje simple y lo que se hizo en esta PC.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../src/api-client'
import { TurnosARevisar } from '../src/TurnosARevisar'
import { MOTIVOS, type AtencionARevisar } from '../src/turnos-del-nodo'

afterEach(cleanup)

// Las tarjetas (los `<li>` de la lista), sin los renglones de adentro de una tarjeta con dos atenciones.
const tarjetas = () => [...screen.getByRole('list', { name: 'Turnos a revisar' }).querySelectorAll<HTMLElement>(':scope > li')]

// Datos ficticios.
function atencion(over: Partial<AtencionARevisar> = {}): AtencionARevisar {
  return {
    atencion_id: 'at-1', appointment_id: 'turno-a', estado: 'completed', at: '2026-10-25T10:40:00-03:00', actor: 'Recepción Demo',
    motivo: 'cancelado', estado_despues: 'cancelled', resultado: 'a_revisar', revisada_at: null, ...over,
  }
}
const CANCELADO = atencion()
const MOVIDO = atencion({ atencion_id: 'at-2', appointment_id: 'turno-b', estado: 'no_show', at: '2026-10-25T11:00:00-03:00', motivo: 'movido', estado_despues: 'no_show' })
// Un turno con dos atenciones: en curso y después atendido.
const EN_CURSO = atencion({ atencion_id: 'at-3', appointment_id: 'turno-c', estado: 'in_progress', at: '2026-10-25T12:00:00-03:00', motivo: 'ya_atendido', estado_despues: 'completed' })
const ATENDIDO = atencion({ atencion_id: 'at-4', appointment_id: 'turno-c', estado: 'completed', at: '2026-10-25T12:30:00-03:00', motivo: 'ya_atendido', estado_despues: 'completed' })

describe('lo que muestra', () => {
  it('una tarjeta por turno, aunque tenga dos atenciones', () => {
    render(<TurnosARevisar atenciones={[CANCELADO, MOVIDO, ATENDIDO, EN_CURSO]} />)
    expect(tarjetas()).toHaveLength(3)
    expect(screen.getByRole('heading', { name: /Turnos a revisar \(3\)/ })).toBeInTheDocument()
  })

  it('el motivo en lenguaje simple, y lo que se hizo en esta PC', () => {
    render(<TurnosARevisar atenciones={[CANCELADO]} />)
    const [tarjeta] = tarjetas()
    expect(within(tarjeta).getByText(/Se canceló en la web\./)).toBeInTheDocument()
    expect(within(tarjeta).getByText(MOTIVOS.cancelado.explicacion, { exact: false })).toBeInTheDocument()
    expect(within(tarjeta).getByText('Se hizo en esta PC')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Atendido · 25-10-2026 10:40 · Recepción Demo')).toBeInTheDocument()
    expect(within(tarjeta).getByText('En la web figura')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Cancelado')).toBeInTheDocument()
    expect(within(tarjeta).getByText('A revisar')).toBeInTheDocument()
  })

  it('el turno con dos atenciones las muestra en orden, y su motivo repetido una sola vez', () => {
    render(<TurnosARevisar atenciones={[ATENDIDO, EN_CURSO]} />)
    const [tarjeta] = tarjetas()
    const renglones = within(tarjeta).getAllByRole('listitem').map((li) => li.textContent)
    expect(renglones).toEqual(['En curso · 25-10-2026 12:00 · Recepción Demo', 'Atendido · 25-10-2026 12:30 · Recepción Demo'])
    expect(within(tarjeta).getAllByText(/Ya figuraba como atendido\./)).toHaveLength(1)
  })

  it('nada de jerga técnica en lo que ve el usuario', () => {
    const { container } = render(<TurnosARevisar atenciones={[CANCELADO, MOVIDO, EN_CURSO, ATENDIDO]} />)
    expect(container.textContent).not.toMatch(/nodo|outbox|central|cancelled|completed|in_progress|no_show|transicion/i)
  })

  it('sin motivo igual muestra el turno, sin la fila «Qué pasó»', () => {
    render(<TurnosARevisar atenciones={[atencion({ motivo: null, estado_despues: null })]} />)
    expect(screen.queryByText('Qué pasó')).toBeNull()
    expect(screen.queryByText('En la web figura')).toBeNull()
    expect(screen.getByText('Se hizo en esta PC')).toBeInTheDocument()
  })

  it('un motivo que el kit no conoce sale con el texto general', () => {
    render(<TurnosARevisar atenciones={[atencion({ motivo: 'motivo_futuro' })]} />)
    expect(screen.getByText(/Cambió en la web\./)).toBeInTheDocument()
    expect(screen.queryByText(/motivo_futuro/)).toBeNull()
  })

  it('el título de cada tarjeta es el del producto si lo da, y si no, «Turno del <fecha>»', () => {
    const { rerender } = render(<TurnosARevisar atenciones={[CANCELADO]} />)
    expect(screen.getByText('Turno del 25-10-2026')).toBeInTheDocument()
    rerender(<TurnosARevisar atenciones={[CANCELADO]} describirTurno={(t) => `Ana Demo · ${t.turnoId}`} />)
    expect(screen.getByText('Ana Demo · turno-a')).toBeInTheDocument()
  })

  it('no muestra las ya revisadas ni las aplicadas', () => {
    render(<TurnosARevisar atenciones={[atencion({ revisada_at: '2026-10-26T09:00:00-03:00' }), atencion({ appointment_id: 'otro', resultado: 'aplicada' })]} />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.getByText('No hay turnos para revisar.')).toBeInTheDocument()
  })
})

describe('estados de la lista', () => {
  it('cargando, lo dice; con turnos a la vista no tapa la lista', () => {
    const { rerender } = render(<TurnosARevisar atenciones={undefined} cargando />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.queryByText('No hay turnos para revisar.')).toBeNull()
    rerender(<TurnosARevisar atenciones={[CANCELADO]} cargando />)
    expect(screen.queryByText('Cargando…')).toBeNull()
    expect(tarjetas()).toHaveLength(1)
  })

  it('un error al pedir la lista se dice como alerta y no se disfraza de lista vacía', () => {
    render(<TurnosARevisar atenciones={null} error="No se pudo leer la lista." />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo leer la lista.')
    expect(screen.queryByText('No hay turnos para revisar.')).toBeNull()
  })

  it('el título y la introducción se pueden sacar, y la lista conserva su nombre accesible', () => {
    render(<TurnosARevisar atenciones={[CANCELADO]} titulo={null} introduccion={null} />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByRole('region', { name: 'Turnos a revisar' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Turnos a revisar' })).toBeInTheDocument()
  })

  it('con título, la sección se llama como él', () => {
    render(<TurnosARevisar atenciones={[]} />)
    expect(screen.getByRole('region', { name: 'Turnos a revisar' })).toBeInTheDocument()
  })
})

describe('«Ya lo revisé»', () => {
  it('sin `onMarcarRevisado` la lista es de consulta: no hay botón', () => {
    render(<TurnosARevisar atenciones={[CANCELADO]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('le pasa al producto el turno entero, con todas sus atenciones', async () => {
    const onMarcarRevisado = vi.fn().mockResolvedValue(undefined)
    render(<TurnosARevisar atenciones={[ATENDIDO, EN_CURSO, CANCELADO]} onMarcarRevisado={onMarcarRevisado} />)
    const delTurnoC = tarjetas().find((li) => li.textContent?.includes('En curso'))!
    await userEvent.click(within(delTurnoC).getByRole('button', { name: 'Ya lo revisé' }))
    expect(onMarcarRevisado).toHaveBeenCalledTimes(1)
    const turno = onMarcarRevisado.mock.calls[0][0]
    expect(turno.turnoId).toBe('turno-c')
    expect(turno.atenciones.map((a: AtencionARevisar) => a.atencion_id)).toEqual(['at-3', 'at-4'])
  })

  it('si falla, dice por qué con el `detail` de la API y el turno sigue ahí', async () => {
    const onMarcarRevisado = vi.fn().mockRejectedValue(new ApiError(409, 'Otra persona ya revisó este turno.'))
    render(<TurnosARevisar atenciones={[CANCELADO]} onMarcarRevisado={onMarcarRevisado} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ya lo revisé' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Otra persona ya revisó este turno.')
    expect(tarjetas()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Ya lo revisé' })).toBeEnabled()
  })

  it('si falla sin explicación, un texto simple', async () => {
    render(<TurnosARevisar atenciones={[CANCELADO]} onMarcarRevisado={vi.fn().mockRejectedValue(new Error('boom'))} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ya lo revisé' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo marcar como revisado. Probá de nuevo.')
  })

  it('mientras marca, apaga los botones (no se revisa dos veces)', async () => {
    let terminar!: () => void
    const onMarcarRevisado = vi.fn(() => new Promise<void>((r) => { terminar = r }))
    render(<TurnosARevisar atenciones={[CANCELADO, MOVIDO]} onMarcarRevisado={onMarcarRevisado} />)
    const botones = screen.getAllByRole('button', { name: 'Ya lo revisé' })
    await userEvent.click(botones[0])
    await waitFor(() => botones.forEach((b) => expect(b).toBeDisabled()))
    terminar()
    await waitFor(() => botones.forEach((b) => expect(b).toBeEnabled()))
  })
})

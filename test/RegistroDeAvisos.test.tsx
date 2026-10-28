// El registro de avisos (ADR-097): `GET /api/avisos/envios` en una tabla paginada y filtrable.
//
// Lo que importa: que diga el estado de cada aviso con su motivo, que el destino (el motor lo manda COMPLETO) sólo se vea entero para un
// administrador, y que los filtros se pidan al motor y no se hagan en la pantalla sobre una lista recortada.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegistroDeAvisos } from '../src/RegistroDeAvisos'
import type { Envio } from '../src/avisos'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function envio(id: number, extra: Partial<Envio> = {}): Envio {
  return {
    id, canal: 'whatsapp', clave: `reserva:${id}:recordatorio:24`, tipo: 'recordatorio', destino: '5491155551234', asunto: '',
    cuerpo: 'Mañana 19:00', plantilla: '', variables: {}, proveedor: 'evolution', estado: 'enviado', intentos: 1, detalle: '',
    id_externo: '', enviado_at: '2026-10-28 10:00:00', created_at: '2026-10-28 09:30:15', updated_at: '2026-10-28 10:00:00', ...extra,
  }
}

function responde(filas: Envio[]) {
  fetchMock.mockImplementation(() => Promise.resolve(json(filas)))
}
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]))

describe('RegistroDeAvisos', () => {
  it('sin avisos dice que todavía no hay ninguno', async () => {
    responde([])
    render(<RegistroDeAvisos />)
    expect(await screen.findByText('Todavía no se registró ningún aviso.')).toBeInTheDocument()
    expect(urls()).toEqual(['/api/avisos/envios?limite=200'])
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument()
  })

  it('con filas muestra fecha, canal, tipo, estado y detalle', async () => {
    responde([
      envio(3, { estado: 'fallido', detalle: 'Evolution rechazó la apikey (401).', intentos: 2, tipo: 'confirmacion_turno' }),
      envio(2, { canal: 'email', destino: 'ana@club.test', estado: 'registrado', proveedor: 'registro' }),
      envio(1, { estado: 'rechazado', detalle: 'El número no tiene WhatsApp.' }),
    ])
    render(<RegistroDeAvisos esAdmin />)
    await screen.findByText('Evolution rechazó la apikey (401). · 2 intentos')

    const filas = screen.getAllByRole('row')
    expect(filas).toHaveLength(4) // encabezado + 3
    const primera = within(filas[1])
    expect(primera.getByText('28-10-2026 09:30')).toBeInTheDocument()
    expect(primera.getByText('WhatsApp')).toBeInTheDocument()
    expect(primera.getByText('Confirmacion turno')).toBeInTheDocument()
    expect(primera.getByText('Falló')).toHaveAttribute('data-tono', 'negativo')
    expect(within(filas[2]).getByText('Correo')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Registrado')).toHaveAttribute('data-tono', 'neutro')
    expect(within(filas[3]).getByText('Rechazado')).toHaveAttribute('data-tono', 'atencion')
    expect(screen.getByText('Mostrando', { exact: false })).toHaveTextContent('Mostrando 1–3 de 3 avisos')
  })

  it('🔴 sin `esAdmin` el destino sale enmascarado, el teléfono y el mail', async () => {
    responde([envio(2, { canal: 'email', destino: 'ana@club.test' }), envio(1, { destino: '5491155551234' })])
    render(<RegistroDeAvisos />)
    await screen.findByText('a•••@club.test')
    expect(screen.getByText('••••••••1234')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('5491155551234')
    expect(document.body.textContent).not.toContain('ana@club.test')
  })

  it('con `esAdmin` el destino sale entero', async () => {
    responde([envio(2, { canal: 'email', destino: 'ana@club.test' }), envio(1, { destino: '5491155551234' })])
    render(<RegistroDeAvisos esAdmin />)
    expect(await screen.findByText('5491155551234')).toBeInTheDocument()
    expect(screen.getByText('ana@club.test')).toBeInTheDocument()
  })

  it('el producto pone el rótulo de cada tipo', async () => {
    responde([envio(1, { tipo: 'recordatorio' })])
    render(<RegistroDeAvisos etiquetaDelTipo={(t) => (t === 'recordatorio' ? 'Recordatorio de reserva' : t)} />)
    expect(await screen.findByText('Recordatorio de reserva')).toBeInTheDocument()
  })

  it('pagina de a `porPagina` y avanza con «Siguiente»', async () => {
    responde(Array.from({ length: 25 }, (_, i) => envio(25 - i)))
    const user = userEvent.setup()
    render(<RegistroDeAvisos porPagina={10} />)
    await screen.findByText(/Mostrando/)
    expect(screen.getByText(/Mostrando/)).toHaveTextContent('Mostrando 1–10 de 25 avisos')
    expect(screen.getAllByRole('row')).toHaveLength(11)
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText(/Mostrando/)).toHaveTextContent('Mostrando 11–20 de 25 avisos')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText(/Mostrando/)).toHaveTextContent('Mostrando 21–25 de 25 avisos')
    expect(screen.getAllByRole('row')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    // Todo salió de un solo pedido: paginar no vuelve a pedir.
    expect(urls()).toHaveLength(1)
  })

  it('si llegan tantos como el límite avisa que hay más viejos', async () => {
    responde(Array.from({ length: 5 }, (_, i) => envio(5 - i)))
    render(<RegistroDeAvisos limite={5} />)
    expect(await screen.findByText('Se muestran los últimos 5 avisos; los más viejos no entran en la lista.')).toBeInTheDocument()
    expect(urls()[0]).toBe('/api/avisos/envios?limite=5')
  })

  it('los filtros se piden al motor (canal y estado) y vuelven a la primera página', async () => {
    responde([envio(1)])
    const user = userEvent.setup()
    render(<RegistroDeAvisos basePath="/api/club/avisos" />)
    await screen.findByText('Recordatorio')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'fallido')
    await waitFor(() => expect(urls()).toContain('/api/club/avisos/envios?estado=fallido&limite=200'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Canal' }), 'email')
    await waitFor(() => expect(urls()).toContain('/api/club/avisos/envios?canal=email&estado=fallido&limite=200'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), '__todos__')
    await waitFor(() => expect(urls().at(-1)).toBe('/api/club/avisos/envios?canal=email&limite=200'))
  })

  it('con filtros y sin resultados lo dice distinto que sin avisos', async () => {
    responde([envio(1)])
    const user = userEvent.setup()
    render(<RegistroDeAvisos />)
    await screen.findByText('Recordatorio')
    responde([])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'omitido')
    expect(await screen.findByText('No hay avisos con esos filtros.')).toBeInTheDocument()
  })

  it('«Actualizar» vuelve a pedir la lista', async () => {
    responde([envio(1)])
    const user = userEvent.setup()
    render(<RegistroDeAvisos />)
    await screen.findByText('Recordatorio')
    await user.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(urls()).toHaveLength(2))
  })

  it('un error del motor se dice, sin tabla', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'No tenés permiso para hacer esto.' }, 403))
    render(<RegistroDeAvisos />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('un estado que el kit no conoce se ve con su nombre y en neutro', async () => {
    responde([envio(1, { estado: 'cancelado' })])
    render(<RegistroDeAvisos />)
    expect(await screen.findByText('cancelado')).toHaveAttribute('data-tono', 'neutro')
  })

  it('`titulo={null}` saca el título', async () => {
    responde([])
    render(<RegistroDeAvisos titulo={null} />)
    await screen.findByText('Todavía no se registró ningún aviso.')
    expect(screen.queryByText('Registro de avisos')).not.toBeInTheDocument()
  })
})

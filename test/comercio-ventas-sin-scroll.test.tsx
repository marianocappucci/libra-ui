// Ventas sin scroll horizontal (0.116.0, ADR-020): la tabla cuando entra en el ancho que hay, tarjetas cuando no, como Stock (ADR-016).
// jsdom no mide el layout, así que el ancho se simula con un `ResizeObserver` falso que informa el que fije cada test.
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Ventas } from '../src/comercio/Ventas'
import { _resetCacheDeMedios } from '../src/comercio/medios-pago'
import type { Venta } from '../src/comercio/tipos'
import { prepararFetch, responder } from './helpers-pantallas'

const CLIENTE_LARGO = 'Distribuidora Mayorista del Litoral Sociedad Anónima Comercial e Industrial'
const COBRADA: Venta = {
  id: 7, numero: 'V-00007', fecha: '2026-09-06', items: [], subtotal: 200, descuento: 0, total: 200, cliente_id: 3, cliente_nombre: CLIENTE_LARGO,
  observaciones: '', estado: 'cobrada', pagos: [{ medio: 'efectivo', monto: 200, referencia: '' }],
  factura_id: 55, factura_display: 'FACTURA C 0005-00000011', remito_id: null, mp_order_id: '', mp_payment_id: '',
}
const DESCARTADA: Venta = { ...COBRADA, id: 8, numero: 'V-00008', cliente_id: null, cliente_nombre: '', estado: 'borrador_descartado', pagos: [], factura_id: null, factura_display: null }

let anchoSimulado = 0
class ObservadorFalso {
  constructor(private readonly cb: (e: { contentRect: { width: number } }[]) => void) {}
  observe() { this.cb([{ contentRect: { width: anchoSimulado } }]) }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  cleanup()
  _resetCacheDeMedios()
  prepararFetch()
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
})
afterEach(() => { vi.unstubAllGlobals() })

async function abrir(ancho: number, ventas: Venta[] = [COBRADA, DESCARTADA]) {
  anchoSimulado = ancho
  responder({ '/api/ventas': ventas, '/api/cajas/medios-disponibles': [{ id: 'efectivo', label: 'Efectivo' }] })
  render(<MemoryRouter><Ventas puedeAnular /></MemoryRouter>)
  if (ventas.length) await screen.findAllByText('V-00007')
}

describe('Ventas: tabla o tarjetas según el ancho', () => {
  it('con ancho de sobra es la tabla de siempre', async () => {
    await abrir(1600)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Ventas' })).toBeNull()
  })

  it('con menos ancho que el mínimo de la tabla (suma de sus columnas) pasa a tarjetas, sin tabla', async () => {
    await abrir(390)
    expect(screen.queryByRole('table')).toBeNull()
    const tarjetas = within(screen.getByRole('list', { name: 'Ventas' })).getAllByRole('listitem')
    expect(tarjetas).toHaveLength(2)
    const [cobrada, descartada] = tarjetas
    // El número lleva al detalle; fecha, cliente, estado, total, medios, factura y las mismas acciones que la tabla.
    expect(within(cobrada).getByRole('link', { name: 'V-00007' }).getAttribute('href')).toBe('/ventas/7')
    expect(within(cobrada).getByText(new RegExp(CLIENTE_LARGO))).toBeTruthy()
    expect(within(cobrada).getByText('Cobrada')).toBeTruthy()
    expect(within(cobrada).getByText('FACTURA C 0005-00000011')).toBeTruthy()
    expect(within(cobrada).getByLabelText('Imprimir ticket')).toBeTruthy()
    expect(within(cobrada).getByLabelText('Anular')).toBeTruthy()
    expect(within(descartada).getByText('Descartada')).toBeTruthy()
    // Sin cliente, sólo la fecha (la tabla muestra «—»).
    expect(within(descartada).getByRole('link', { name: 'V-00008' }).nextElementSibling!.textContent).not.toContain('·')
    expect(within(cobrada).getByRole('link', { name: 'V-00007' }).nextElementSibling!.textContent).toContain(' · ')
    expect(within(descartada).getByText('Sin facturar')).toBeTruthy()
  })

  it('en tarjetas el texto largo no ensancha la página: columna minmax(0,1fr) y el cliente parte la línea', async () => {
    await abrir(390)
    const tarjeta = within(screen.getByRole('list', { name: 'Ventas' })).getAllByRole('listitem')[0]
    expect(tarjeta.className).toContain('grid-cols-[minmax(0,1fr)]')
    expect(within(tarjeta).getByText(new RegExp(CLIENTE_LARGO)).className).toContain('[overflow-wrap:anywhere]')
  })

  it('la columna de acciones reserva sólo los botones que el producto muestra: sin recibo ni anular, el umbral baja 80 px', async () => {
    // VentaLibra pasa `rutaDeRecibo={null}`: medido en Chromium, la tabla mide 962 px y con 4 botones reservados el umbral quedaba en 1002.
    // Columnas sin acciones: 820 px (con el Total de 120, ADR-021); con 2 botones (92) el umbral es 912, con 4 (172) sería 992.
    anchoSimulado = 950
    responder({ '/api/ventas': [COBRADA], '/api/cajas/medios-disponibles': [] })
    render(<MemoryRouter><Ventas rutaDeRecibo={null} /></MemoryRouter>)
    await screen.findAllByText('V-00007')
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('las pestañas hacen wrap en vez de ensanchar la página a 320 px', async () => {
    await abrir(300)
    expect(screen.getByRole('tablist').className).toContain('flex-wrap')
  })

  it('en tarjetas los botones son objetivos táctiles de 44 px; en la tabla siguen en 36 (ADR-021)', async () => {
    await abrir(390)
    const tarjeta = within(screen.getByRole('list', { name: 'Ventas' })).getAllByRole('listitem')[0]
    const contenedor = within(tarjeta).getByLabelText('Imprimir ticket').closest('div.flex')!.parentElement!
    expect(contenedor.className).toBe('[&_a]:size-11 [&_button]:size-11')
    // El número (link al detalle) queda afuera: no es un botón.
    expect(contenedor.contains(within(tarjeta).getByRole('link', { name: 'V-00007' }))).toBe(false)
  })

  it('en la tabla el total entra entero (columna de 120 px) y, si no, lleva el importe en el title (ADR-021)', async () => {
    await abrir(1600, [{ ...COBRADA, total: 3703701 }])
    const celda = within(screen.getByRole('table')).getByTitle(/3\.703\.701/)
    expect(celda.className).toContain('truncate')
  })

  it('sin ventas, en tarjetas, el mismo aviso que la tabla', async () => {
    anchoSimulado = 390
    responder({ '/api/ventas': [], '/api/cajas/medios-disponibles': [] })
    render(<MemoryRouter><Ventas /></MemoryRouter>)
    expect(await screen.findByText('No hay ventas registradas aún.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

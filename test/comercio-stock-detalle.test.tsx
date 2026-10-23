// Stock en tabla compacta con detalle desplegable (0.179.0, ADR-093): la tabla lleva producto, stock, estado y acciones (y la categoría desde 1280 px); código, unidad,
// mínimo y el stock de cada depósito se despliegan al hacer click en la fila. Con muchos productos y varias sucursales la pantalla ya no pasa a tarjetas en escritorio.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Stock } from '../src/comercio/Stock'
import type { StockItem } from '../src/comercio/tipos'
import { prepararFetch, responder } from './helpers-pantallas'

const DEPOSITOS = [{ id: 1, nombre: 'Central' }, { id: 2, nombre: 'Salón Norte' }, { id: 3, nombre: 'Bodega' }]
const YERBA: StockItem = { id: 1, codigo: 'Y001', nombre: 'Yerba', unidad: 'kg', categoria: 'Almacén', stock_minimo: 5, activo: 1, stock_actual: 3, por_deposito: { '1': 2, '2': 1, '3': 0 } }
const SAL: StockItem = { id: 2, codigo: 'S9', nombre: 'Sal', unidad: 'u', categoria: '', stock_minimo: 0, activo: 1, stock_actual: 40, por_deposito: { '1': 40 } }
const TABLA = { '/api/stock': { productos: [YERBA, SAL], alertas: [YERBA], depositos: DEPOSITOS }, '/api/stock/motivos-merma': [], '/api/stock/movimientos': [] }

class ObservadorFalso {
  constructor(private readonly cb: (e: { contentRect: { width: number } }[]) => void) {}
  observe() { this.cb([{ contentRect: { width: 1200 } }]) }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  cleanup()
  prepararFetch()
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
})
afterEach(() => { vi.unstubAllGlobals() })

async function abrir(props: Parameters<typeof Stock>[0] = {}) {
  responder(TABLA)
  render(<MemoryRouter><Stock {...props} /></MemoryRouter>)
  await screen.findByText('Sal')
}

const encabezados = () => screen.getAllByRole('columnheader').map((th) => th.textContent)

describe('Stock: tabla compacta con detalle (ADR-093)', () => {
  it('con tres depósitos, a 1200 px es una tabla (no tarjetas) y sin una columna por depósito', async () => {
    await abrir()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(encabezados()).toEqual(['Detalle', 'Producto', 'Categoría', 'Stock', 'Estado', 'Acciones'])
    expect(screen.queryByLabelText('Stock por depósito')).toBeNull()
  })

  it('la categoría es opcional: oculta bajo 1280 px, en la celda y en su <col>', async () => {
    await abrir()
    const th = screen.getByRole('columnheader', { name: 'Categoría' })
    expect(th.className).toContain('hidden xl:table-cell')
    expect(document.querySelectorAll('col')[2].className).toBe('hidden xl:table-column')
  })

  it('el stock lleva su unidad al lado del número', async () => {
    await abrir()
    const fila = screen.getByText('Sal').closest('tr')!
    expect(within(fila).getByTitle('40 u').textContent).toBe('40u')
  })

  it('click en la fila despliega el detalle: código, categoría, unidad, mínimo y cada depósito; otro click lo cierra', async () => {
    const user = userEvent.setup()
    await abrir()
    const chevron = screen.getByLabelText('Ver detalle de Yerba')
    expect(chevron.getAttribute('aria-expanded')).toBe('false')
    await user.click(screen.getByText('Yerba'))
    expect(chevron.getAttribute('aria-expanded')).toBe('true')
    const detalle = document.getElementById(chevron.getAttribute('aria-controls')!)!
    const valor = (dt: string) => within(detalle).getByText(dt).nextElementSibling!.textContent
    expect(valor('Código')).toBe('Y001')
    expect(valor('Categoría')).toBe('Almacén')
    expect(valor('Unidad')).toBe('kg')
    expect(valor('Stock mínimo')).toBe('5 kg')
    const chips = within(within(detalle).getByLabelText('Stock por depósito')).getAllByRole('listitem').map((li) => li.textContent)
    expect(chips).toEqual(['Central:2', 'Salón Norte:1', 'Bodega:0'])
    await user.click(screen.getByText('Yerba'))
    expect(chevron.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('Stock por depósito')).toBeNull()
  })

  it('un depósito que no figura en `por_deposito` dice 0, y lo que falta dice «—»', async () => {
    const user = userEvent.setup()
    await abrir()
    await user.click(screen.getByLabelText('Ver detalle de Sal'))
    const detalle = screen.getByLabelText('Stock por depósito')
    expect(within(detalle).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Central:40', 'Salón Norte:0', 'Bodega:0'])
    expect(screen.getByText('Categoría', { selector: 'dt' }).nextElementSibling!.textContent).toBe('—')
    expect(screen.getByText('Stock mínimo').nextElementSibling!.textContent).toBe('—')
  })

  it('los botones de la fila no despliegan: «Ajustar stock» abre el diálogo y la fila queda cerrada', async () => {
    const user = userEvent.setup()
    await abrir()
    await user.click(screen.getAllByLabelText('Ajustar stock')[0])
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Ver detalle de Yerba').getAttribute('aria-expanded')).toBe('false')
  })

  it('sin depósitos el detalle no tiene la lista por depósito', async () => {
    const user = userEvent.setup()
    responder({ ...TABLA, '/api/stock': { productos: [YERBA], alertas: [] } })
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(encabezados()).toContain('Stock')
    await user.click(screen.getByText('Yerba'))
    expect(screen.getByText('Stock mínimo')).toBeTruthy()
    expect(screen.queryByLabelText('Stock por depósito')).toBeNull()
  })

  it('con `conFiltros` el buscador encuentra también por código', async () => {
    const user = userEvent.setup()
    await abrir({ conFiltros: true })
    await user.type(screen.getByLabelText('Buscar producto'), 's9')
    expect(screen.queryByText('Yerba')).toBeNull()
    expect(screen.getByText('Sal')).toBeTruthy()
  })
})

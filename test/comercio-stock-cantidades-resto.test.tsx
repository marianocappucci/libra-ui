// El resto de Stock muestra las cantidades con decimales (0.152.0, ADR-064): un producto por peso con 1,5 kg dice «1,5» y no «2».
// El ADR-057 había dejado el diálogo de ajuste con `formatoCantidad` y el resto de las pantallas de stock con el `formatEntero` del producto (`@/lib/utils`),
// que los productos escriben redondeando a entero (VentaLibra: `String(Math.round(value))`). Acá se lo reemplaza por ese mismo redondeo, que es lo que lo
// reproduce: el stub del paquete no redondea (y por eso ningún test de las pantallas lo había visto).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DepositoDetalle } from '../src/comercio/DepositoDetalle'
import { Productos } from '../src/comercio/Productos'
import { Stock } from '../src/comercio/Stock'
import { StockMovimientos } from '../src/comercio/StockMovimientos'
import type { MovimientoStock, StockItem } from '../src/comercio/tipos'
import { prepararFetch, responder } from './helpers-pantallas'

vi.mock('@/lib/utils', async (original) => ({
  ...(await original<typeof import('../test/stubs/lib/utils')>()),
  formatEntero: (valor: number) => String(Math.round(valor)),
}))

// Un producto por peso: 1,5 kg en total, 0,75 en un depósito y 0,75 en el otro; mínimo 2,5. Y uno por unidad, que no cambia.
const QUESO: StockItem = {
  id: 1, codigo: 'Q1', nombre: 'Queso', unidad: 'kg', categoria: '', stock_minimo: 2.5, activo: 1, stock_actual: 1.5, por_deposito: { '1': 0.75, '2': 0.75 },
}
const SAL: StockItem = { id: 2, codigo: null, nombre: 'Sal', unidad: 'u', categoria: '', stock_minimo: 0, activo: 1, stock_actual: 40, por_deposito: { '1': 40, '2': 0 } }
const DEPOSITOS = [{ id: 1, nombre: 'Central' }, { id: 2, nombre: 'Salón' }]

const MOV: MovimientoStock = { id: 1, producto_id: 1, producto_nombre: 'Queso', unidad: 'kg', tipo: 'ajuste', cantidad: 1.5, referencia: 'Conteo', fecha: '2026-10-06' }

let anchoSimulado = 1600
class ObservadorFalso {
  constructor(private readonly cb: (e: { contentRect: { width: number } }[]) => void) {}
  observe() { this.cb([{ contentRect: { width: anchoSimulado } }]) }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  cleanup()
  prepararFetch()
  anchoSimulado = 1600
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
})
afterEach(() => { vi.unstubAllGlobals() })

function celdasDeLaFila(nombre: string) {
  return Array.from(screen.getByText(nombre).closest('tr')!.querySelectorAll('td')).map((td) => td.textContent)
}

describe('Stock: las cantidades con decimales en todo el listado', () => {
  const TABLA = {
    '/api/stock': { productos: [QUESO, SAL], alertas: [QUESO], depositos: DEPOSITOS },
    '/api/stock/motivos-merma': [],
    '/api/stock/movimientos': [MOV],
  }

  it('la tabla: mínimo, cada depósito y el total salen con sus decimales (2,5 · 0,75 · 0,75 · 1,5), no redondeados', async () => {
    responder(TABLA)
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Sal')
    const celdas = celdasDeLaFila('Queso')
    expect(celdas).toContain('2,5')
    expect(celdas.filter((c) => c === '0,75')).toHaveLength(2)
    expect(celdas).toContain('1,5')
    // Y el de unidades enteras, igual que siempre.
    expect(celdasDeLaFila('Sal')).toContain('40')
  })

  it('las tarjetas (ancho chico): el total, el mínimo y los depósitos de cada producto', async () => {
    anchoSimulado = 400
    responder(TABLA)
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Sal')
    expect(screen.queryByRole('table')).toBeNull()
    const tarjeta = screen.getByText('Queso', { selector: '*' }).closest('li') ?? screen.getAllByLabelText('Stock por depósito')[0].closest('li')!
    expect(within(tarjeta).getByText('Total:').parentElement!.textContent).toContain('1,5')
    expect(within(tarjeta).getByText(/Mínimo:/).textContent).toBe('Mínimo: 2,5')
    const depositos = within(tarjeta).getByLabelText('Stock por depósito')
    expect(within(depositos).getByText('Central:').closest('li')!.textContent).toBe('Central:0,75')
  })

  it('el aviso de stock bajo dice «Queso (1,5 kg)», con el mismo texto en el título', async () => {
    responder(TABLA)
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Sal')
    const pastilla = screen.getByText('Queso (1,5 kg)')
    expect(pastilla.closest('[title]')!.getAttribute('title')).toBe('Queso (1,5 kg)')
  })

  it('el historial de movimientos (tabla): la cantidad sale «+1,5»', async () => {
    responder(TABLA)
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Sal')
    await userEvent.setup().click(screen.getByRole('button', { name: /Historial de movimientos/ }))
    expect(await screen.findByText('+1,5')).toBeTruthy()
  })

  it('el historial angosto, que es una lista: también «+1,5»', async () => {
    anchoSimulado = 400
    responder(TABLA)
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Sal')
    await userEvent.setup().click(screen.getByRole('button', { name: /Historial de movimientos/ }))
    expect(await screen.findByText('+1,5')).toBeTruthy()
  })
})

describe('StockMovimientos: la cantidad con decimales', () => {
  it('+1,5 y -0,25, no +2 y -0', async () => {
    responder({ '/api/productos': [], '/api/stock/movimientos': [MOV, { ...MOV, id: 2, tipo: 'venta', cantidad: -0.25, referencia: 'Venta 3' }] })
    render(
      <MemoryRouter initialEntries={['/stock/movimientos']}>
        <Routes><Route path="/stock/movimientos" element={<StockMovimientos />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('+1,5')).toBeTruthy()
    expect(screen.getByText('-0,25')).toBeTruthy()
  })
})

describe('DepositoDetalle: el stock del depósito con decimales', () => {
  it('actual y mínimo del producto por peso: 1,5 y 2,5', async () => {
    responder({ '/api/depositos': [{ id: 1, nombre: 'Central', descripcion: '', activo: 1 }], '/api/depositos/1/stock': [{ ...QUESO, stock_actual: 1.5 }] })
    render(
      <MemoryRouter initialEntries={['/d/1']}>
        <Routes><Route path="/d/:id" element={<DepositoDetalle />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByText('Queso')
    const celdas = celdasDeLaFila('Queso')
    expect(celdas).toContain('1,5')
    expect(celdas).toContain('2,5')
  })
})

describe('Productos: «Stock total» con decimales', () => {
  it('la columna de la tabla dice 1,5 y no 2', async () => {
    responder({
      '/api/productos': [{ id: 1, nombre: 'Queso', codigo: 'Q1', unidad: 'kg', categoria: '', precio_venta: 100, precio_costo: 50, activo: 1, stock_minimo: 0 }],
      '/api/productos/categorias': [],
      '/api/stock': { productos: [{ id: 1, stock_actual: 1.5 }], alertas: [] },
    })
    render(<MemoryRouter><Productos conStockTotal /></MemoryRouter>)
    await screen.findByText('Queso')
    expect(await within(screen.getByText('Queso').closest('tr')!).findByText('1,5')).toBeTruthy()
  })
})

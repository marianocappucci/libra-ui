// Stock sin scroll horizontal (0.114.0): la tabla cuando entra en el ancho que hay, tarjetas cuando no, el aviso de stock bajo que no ensancha la página y el historial en lista cuando es angosto.
// jsdom no mide el layout, así que el ancho se simula con un `ResizeObserver` falso que informa el que fije cada test; lo medido en Chromium (la tabla mide 837 + 110 por depósito, 1301 px
// con un depósito y el menú abierto) está en el ADR-016 del kit.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Stock } from '../src/comercio/Stock'
import type { StockItem } from '../src/comercio/tipos'
import { prepararFetch, pedidas, responder } from './helpers-pantallas'

const DEPOSITOS = [{ id: 1, nombre: 'Central' }, { id: 2, nombre: 'Sucursal Centro Comercial Paseo del Bosque Local 214' }]
const NOMBRE_LARGO = 'Yerba mate compuesta con hierbas serranas selección especial paquete de 500 gramos'
const YERBA: StockItem = { id: 1, codigo: 'Y001', nombre: NOMBRE_LARGO, unidad: 'kg', categoria: 'Almacén', stock_minimo: 5, activo: 1, stock_actual: 3, por_deposito: { '1': 2, '2': 1 } }
const SAL: StockItem = { id: 2, codigo: null, nombre: 'Sal', unidad: 'kg', categoria: '', stock_minimo: 0, activo: 1, stock_actual: 40, por_deposito: { '1': 40, '2': 0 } }
const TABLA = { '/api/stock': { productos: [YERBA, SAL], alertas: [YERBA], depositos: DEPOSITOS }, '/api/stock/motivos-merma': [], '/api/stock/movimientos': [] }

let anchoSimulado = 0
class ObservadorFalso {
  constructor(private readonly cb: (e: { contentRect: { width: number } }[]) => void) {}
  observe() { this.cb([{ contentRect: { width: anchoSimulado } }]) }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  cleanup()
  prepararFetch()
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
})
afterEach(() => { vi.unstubAllGlobals() })

async function abrir(ancho: number) {
  anchoSimulado = ancho
  responder(TABLA)
  render(<MemoryRouter><Stock /></MemoryRouter>)
  await screen.findAllByText(/Sal/)
}

describe('Stock: tabla o tarjetas según el ancho', () => {
  it('con ancho de sobra es la tabla de siempre', async () => {
    await abrir(1600)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByLabelText('Stock por depósito')).toBeNull()
  })

  it('con menos ancho que el mínimo de la tabla (suma de sus columnas) pasa a tarjetas, sin tabla', async () => {
    await abrir(400)
    expect(screen.queryByRole('table')).toBeNull()
    const grupos = screen.getAllByLabelText('Stock por depósito')
    expect(grupos).toHaveLength(2)
    // Cada depósito con su cantidad, y el total y el estado de cada producto.
    expect(within(grupos[1]).getByText(/Central:/).textContent).toContain('2')   // Yerba (Sal va primero: A a Z)
    expect(screen.getAllByText('Bajo mínimo').length).toBeGreaterThan(0)
    expect(screen.getByText('OK')).toBeTruthy()
  })

  it('en tarjetas se puede ordenar y las acciones siguen estando', async () => {
    const user = userEvent.setup()
    await abrir(400)
    expect(screen.getAllByLabelText('Ajustar stock')).toHaveLength(2)
    const nombres = () => screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-md border p-3')).map((li) => li.querySelector('p')?.textContent)
    expect(nombres()).toEqual(['Sal', NOMBRE_LARGO])   // A a Z
    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'total-asc')
    expect(nombres()).toEqual([NOMBRE_LARGO, 'Sal'])
  })

  it('sin medida (sin ResizeObserver) se queda en la tabla', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    anchoSimulado = 0
    responder(TABLA)
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Sal')
    expect(screen.getByRole('table')).toBeTruthy()
  })
})

describe('Stock: el aviso de stock bajo no ensancha la página', () => {
  it('las pastillas topan en el ancho del aviso (max-w-full + truncate) y llevan el nombre completo en el title', async () => {
    await abrir(1600)
    const pastilla = screen.getByTitle(`${NOMBRE_LARGO} (3 kg)`)
    expect(pastilla.className).toContain('max-w-full')
    expect(pastilla.querySelector('.truncate')?.textContent).toBe(`${NOMBRE_LARGO} (3 kg)`)
    expect(pastilla.parentElement!.className).toContain('min-w-0')
    // El aviso mismo es un ítem de la grilla de la pantalla: sin `min-w-0` su mínimo es la pastilla más larga y ensancha la PÁGINA (medido en Chromium: 591 px a 390, 855 a 768 con el menú abierto).
    expect(pastilla.closest('div.rounded-md.border')!.className).toContain('min-w-0')
  })
})

describe('Stock: el historial de movimientos', () => {
  const MOV = { id: 9, producto_id: 1, producto_nombre: NOMBRE_LARGO, unidad: 'kg', tipo: 'merma', cantidad: -2, referencia: 'Merma: Quemado', fecha: '2026-09-06', deposito_id: 2 }

  async function abrirHistorial(ancho: number) {
    const user = userEvent.setup()
    anchoSimulado = ancho
    responder({ ...TABLA, '/api/stock/movimientos': [MOV] })
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findAllByText(/Sal/)
    await user.click(screen.getByRole('button', { name: /Historial de movimientos/ }))
    await screen.findByText(/Merma: Quemado/)
    return user
  }

  it('angosto: una lista con el producto, el depósito y la referencia, sin tabla de movimientos', async () => {
    await abrirHistorial(400)
    expect(pedidas().some((p) => p.includes('/api/stock/movimientos'))).toBe(true)
    // La tabla de stock se fue a tarjetas y la del historial a lista: no queda ninguna tabla.
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/Sucursal Centro Comercial Paseo del Bosque Local 214 · Merma: Quemado/)).toBeTruthy()
  })

  it('ancho: una tabla cuyas columnas de texto largo hacen wrap (no nowrap)', async () => {
    await abrirHistorial(1600)
    const tablas = screen.getAllByRole('table')
    const historial = tablas[tablas.length - 1]
    const celda = within(historial).getByText(NOMBRE_LARGO).closest('td')!
    expect(celda.className).toContain('whitespace-normal')
    expect(celda.className).not.toContain('whitespace-nowrap')
  })
})

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
    const central = within(grupos[1]).getByText('Central:').closest('li')!   // Yerba (Sal va primero: A a Z)
    expect(central.textContent).toBe('Central:2')
    expect(screen.getAllByText('Bajo mínimo').length).toBeGreaterThan(0)
    expect(screen.getByText('OK')).toBeTruthy()
  })

  it('en tarjetas los botones son objetivos táctiles de 44 px (ADR-021)', async () => {
    await abrir(400)
    const tarjeta = screen.getAllByLabelText('Stock por depósito')[0].closest('li')!
    expect(within(tarjeta).getByLabelText('Ajustar stock').closest('div.flex')!.parentElement!.className).toBe('[&_a]:size-11 [&_button]:size-11')
  })

  it('en tarjetas un depósito de nombre largo no ensancha la página: columna minmax(0,1fr), el nombre se trunca y la cantidad no (0.114.2)', async () => {
    // Medido en Chromium (390 px, 3 o más depósitos con uno de 64 caracteres): el chip aportaba su texto completo al mínimo de una columna `auto` y la página llegaba a 509 px.
    await abrir(400)
    const tarjeta = screen.getAllByLabelText('Stock por depósito')[0].closest('li')!
    expect(tarjeta.className).toContain('grid-cols-[minmax(0,1fr)]')
    const chip = screen.getAllByText(/Sucursal Centro Comercial Paseo del Bosque Local 214:/)[0].closest('li')!
    expect(chip.className).toContain('flex')
    expect(chip.querySelector('.truncate')!.textContent).toBe('Sucursal Centro Comercial Paseo del Bosque Local 214:')
    expect(chip.querySelector('.shrink-0')!.textContent).toBe('0')   // la cantidad siempre se ve
  })

  it('el total «Bajo mínimo» no es ámbar 600 (3,2:1 sobre blanco): amber-800, como la pastilla de estado', async () => {
    await abrir(400)
    const total = screen.getAllByText('3').find((e) => e.tagName === 'STRONG')!
    expect(total.className).toContain('text-amber-800')
    expect(total.className).not.toContain('text-amber-600')
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

describe('Stock: cosméticos', () => {
  it('el encabezado de un depósito de nombre largo se corta con «…» y lleva el nombre entero en el title', async () => {
    await abrir(1600)
    const boton = screen.getByTitle(DEPOSITOS[1].nombre)
    expect(boton.className).toContain('max-w-full')
    expect(boton.querySelector('.truncate')!.textContent).toBe(DEPOSITOS[1].nombre)
    expect(boton.querySelector('svg')!.getAttribute('class')).toContain('shrink-0')   // el icono de orden no se pierde
  })

  it('«Stock resultante» no muestra tres decimales fijos: 11 y no 11.000, 11,5 y no 11.500', async () => {
    const user = userEvent.setup()
    await abrir(1600)
    await user.click(screen.getAllByLabelText('Ajustar stock')[0])
    const dialogo = await screen.findByRole('dialog')
    const campo = within(dialogo).getByRole('spinbutton', { name: /Stock nuevo|Cantidad/ })
    await user.clear(campo)
    await user.type(campo, '11')
    expect(within(dialogo).getByText(/Stock resultante:/).textContent).toBe('Stock resultante: 11 kg')
    await user.clear(campo)
    await user.type(campo, '11.5')
    expect(within(dialogo).getByText(/Stock resultante:/).textContent).toBe('Stock resultante: 11,5 kg')
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

  it('angosto: la lista parte una referencia sin espacios (overflow-wrap:anywhere) y su columna es minmax(0,1fr)', async () => {
    await abrirHistorial(400)
    const li = screen.getByText(/Merma: Quemado/).closest('li')!
    expect(li.className).toContain('grid-cols-[minmax(0,1fr)]')
    expect(screen.getByText(/Merma: Quemado/).className).toContain('[overflow-wrap:anywhere]')
  })

  it('ancho: una tabla cuyas columnas de texto largo hacen wrap (no nowrap)', async () => {
    await abrirHistorial(1600)
    const tablas = screen.getAllByRole('table')
    const historial = tablas[tablas.length - 1]
    const celda = within(historial).getByText(NOMBRE_LARGO).closest('td')!
    expect(celda.className).toContain('whitespace-normal')
    expect(celda.className).toContain('[overflow-wrap:anywhere]')   // `break-words` no baja el mínimo de la columna: un token largo (una URL pegada) la ensanchaba
    expect(celda.className).not.toContain('whitespace-nowrap')
  })
})

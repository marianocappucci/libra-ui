// Variantes de un producto con unidades propias, varios códigos y variantes (0.79.0), todas aditivas: sin las props la
// pantalla es la de Contalibra y Restolibra (lo prueba `comercio-flujos`).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import type { Producto } from '../src/comercio/tipos'
import { opcionesDe } from './helpers-pantallas'

const YERBA: Producto = {
  id: 1, codigo: 'Y1', nombre: 'Yerba', descripcion: '', precio_venta: 1500, precio_costo: 900,
  unidad: 'KG', categoria: 'Almacén', stock_minimo: 0, estacion: '', vendible: 1, activo: 1, tipo: 'producto',
}

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const path = url.split('?')[0]
    const clave = `${init?.method ?? 'GET'} ${path}`
    const valor = clave in tabla ? tabla[clave] : tabla[path]
    if (valor && typeof valor === 'object' && 'status' in (valor as object) && 'detail' in (valor as object)) {
      const e = valor as { status: number; detail: string }
      return Promise.resolve(json({ detail: e.detail }, e.status))
    }
    if (valor === undefined) return Promise.resolve(json({ detail: `sin respuesta para ${clave}` }, 404))
    return Promise.resolve(json(valor))
  })
}

const pedidas = () => fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
const cuerpoDe = (clave: string) => JSON.parse(String((fetchMock.mock.calls[pedidas().indexOf(clave)][1] as RequestInit).body))

beforeEach(() => {
  cleanup()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

const BASE = { '/api/productos': [YERBA], '/api/productos/categorias': [{ id: 1, nombre: 'Almacén' }] }

describe('Productos con las variantes de VentaLibra', () => {
  it('sin las props no hay detalle, ni stock total, y sí eliminar', async () => {
    responder(BASE)
    render(<MemoryRouter><Productos /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(screen.queryByLabelText('Gestionar códigos y variantes')).toBeNull()
    expect(screen.queryByText('Stock total')).toBeNull()
    expect(screen.getByLabelText('Eliminar producto')).toBeTruthy()
    expect(pedidas().some((p) => p === 'GET /api/stock')).toBe(false)
  })

  it('las unidades del alta son las que dice el backend, y la del producto se ofrece aunque no esté', async () => {
    responder({ ...BASE, '/api/productos/unidades': ['KG', 'UN'] })
    const user = userEvent.setup()
    render(<MemoryRouter><Productos /></MemoryRouter>)
    await screen.findByText('Yerba')
    await waitFor(() => expect(pedidas()).toContain('GET /api/productos/unidades'))
    await user.click(screen.getByLabelText('Editar producto'))
    const dialogo = await screen.findByRole('dialog')
    const selector = within(dialogo).getByLabelText('Unidad')
    expect(selector).toHaveValue('KG')
    expect(await opcionesDe(user, selector)).toEqual(['KG', 'UN'])
  })

  it('si el backend no contesta las unidades, queda la lista de siempre', async () => {
    responder(BASE)
    const user = userEvent.setup()
    render(<MemoryRouter><Productos /></MemoryRouter>)
    await screen.findByText('Yerba')
    await user.click(screen.getByLabelText('Editar producto'))
    const dialogo = await screen.findByRole('dialog')
    const selector = within(dialogo).getByLabelText('Unidad')
    expect(selector).toHaveValue('KG')
    // «KG» no está en la lista de siempre: se ofrece igual, para no perder la unidad del producto al guardar.
    const opciones = await opcionesDe(user, selector)
    expect(opciones).toContain('kg')
    expect(opciones).toContain('KG')
  })

  it('conStockTotal suma la columna con el total de todos los depósitos', async () => {
    responder({ ...BASE, '/api/stock': { productos: [{ id: 1, stock_actual: 7 }], alertas: [] } })
    render(<MemoryRouter><Productos conStockTotal /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(screen.getByText('Stock total')).toBeTruthy()
    expect(await within(screen.getByText('Yerba').closest('tr')!).findByText('7')).toBeTruthy()
  })

  it('conEliminar={false} no ofrece eliminar', async () => {
    responder(BASE)
    render(<MemoryRouter><Productos conEliminar={false} /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(screen.queryByLabelText('Eliminar producto')).toBeNull()
    expect(screen.getByLabelText('Editar producto')).toBeTruthy()
  })
})

describe('Códigos y variantes de un producto', () => {
  const CODIGOS = [
    { id: 1, producto_id: 1, tipo: 'internal', codigo: 'Y1', es_principal: true },
    { id: 2, producto_id: 1, tipo: 'scale', codigo: '0012', es_principal: false },
  ]
  const VARIANTES = [{ id: 5, producto_id: 1, sku: 'Y-500', nombre: '500 g', atributos: {}, activa: true }]
  const con = { ...BASE, '/api/productos/1/codigos': CODIGOS, '/api/productos/1/variantes': VARIANTES }

  async function abrir() {
    const user = userEvent.setup()
    render(<MemoryRouter><Productos conDetalle /></MemoryRouter>)
    await screen.findByText('Yerba')
    await user.click(screen.getByLabelText('Gestionar códigos y variantes'))
    return { user, dialogo: await screen.findByRole('dialog') }
  }

  it('lista los códigos con su tipo (el principal resaltado) y las variantes', async () => {
    responder(con)
    const { dialogo } = await abrir()
    expect(await within(dialogo).findByText('Interno: Y1')).toBeTruthy()
    expect(within(dialogo).getByText('Balanza: 0012')).toBeTruthy()
    expect(within(dialogo).getByText('Y-500 — 500 g')).toBeTruthy()
  })

  it('agrega un código con su tipo y una variante, y recarga', async () => {
    responder({ ...con, 'POST /api/productos/1/codigos': CODIGOS[1], 'POST /api/productos/1/variantes': VARIANTES[0] })
    const { user, dialogo } = await abrir()
    await within(dialogo).findByText('Interno: Y1')
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Tipo' }), 'scale')
    await user.type(within(dialogo).getByLabelText('Código'), ' 0099 ')
    const antes = pedidas().filter((p) => p === 'GET /api/productos/1/codigos').length
    await user.click(within(dialogo).getAllByRole('button', { name: 'Agregar' })[0])
    await waitFor(() => expect(pedidas()).toContain('POST /api/productos/1/codigos'))
    expect(cuerpoDe('POST /api/productos/1/codigos')).toEqual({ tipo: 'scale', codigo: '0099' })
    await waitFor(() => expect(pedidas().filter((p) => p === 'GET /api/productos/1/codigos').length).toBe(antes + 1))
    await user.type(within(dialogo).getByLabelText('SKU'), 'Y-1000')
    await user.type(within(dialogo).getByLabelText('Nombre (ej. M / Azul)'), '1 kg')
    await user.click(within(dialogo).getAllByRole('button', { name: 'Agregar' })[1])
    await waitFor(() => expect(pedidas()).toContain('POST /api/productos/1/variantes'))
    expect(cuerpoDe('POST /api/productos/1/variantes')).toEqual({ sku: 'Y-1000', nombre: '1 kg' })
  })

  it('el 409 de un código repetido se muestra tal cual', async () => {
    responder({ ...con, 'POST /api/productos/1/codigos': { status: 409, detail: 'Ese código ya existe.' } })
    const { user, dialogo } = await abrir()
    await within(dialogo).findByText('Interno: Y1')
    await user.type(within(dialogo).getByLabelText('Código'), '0012')
    await user.click(within(dialogo).getAllByRole('button', { name: 'Agregar' })[0])
    expect(await within(dialogo).findByText('Ese código ya existe.')).toBeTruthy()
  })
})

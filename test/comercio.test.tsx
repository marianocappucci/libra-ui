// Las pantallas de catálogo, stock y depósitos (P9-M1, 2026-09-06), extraídas
// de Contalibra y Restolibra.
//
// El grueso de cada pantalla ya lo cubren las suites y el smoke de los
// productos, que las ejercen contra su API real. Lo que se prueba acá son **las
// costuras que creó la extracción**: las props con las que cada producto la
// ajusta y el dato del backend que decide si hay merma. Si alguna se cablea mal
// la pantalla no explota — muestra una columna de más o un modo de menos, que es
// lo que nadie ve hasta que un operador lo busca.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import { Stock } from '../src/comercio/Stock'
import { StockMovimientos } from '../src/comercio/StockMovimientos'
import { Depositos } from '../src/comercio/Depositos'
import { DepositoTransferencia } from '../src/comercio/DepositoTransferencia'
import type { Deposito, MovimientoStock, Producto, StockItem } from '../src/comercio/tipos'

const PLATO: Producto = {
  id: 1, codigo: 'BEB-0001', nombre: 'Milanesa', descripcion: '', precio_venta: 5000, precio_costo: 2000,
  unidad: 'u', categoria: 'Platos', stock_minimo: 0, estacion: 'cocina', vendible: 1, activo: 1, tipo: 'producto',
}
const INSUMO: Producto = { ...PLATO, id: 2, codigo: null, nombre: 'Harina', estacion: '', vendible: 0, categoria: 'Insumos' }
const SERVICIO: Producto = { ...PLATO, id: 3, codigo: null, nombre: 'Consultoría', tipo: 'servicio', categoria: '', estacion: '' }

const ITEM: StockItem = { id: 1, codigo: 'Y001', nombre: 'Yerba', unidad: 'kg', categoria: '', stock_minimo: 5, activo: 1, stock_actual: 3 }
const MOV: MovimientoStock = { id: 9, producto_id: 1, producto_nombre: 'Yerba', unidad: 'kg', tipo: 'merma', cantidad: -2, referencia: 'Merma: Quemado', fecha: '2026-09-06' }
const DEPOSITO: Deposito = { id: 1, nombre: 'Central', descripcion: '', es_default: 1, activo: 1, total_productos: 2 }

let fetchMock: ReturnType<typeof vi.fn>

/** Una respuesta de verdad: `api-client` decide si parsear mirando los headers. */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Rutas → cuerpo. Lo que no está en la tabla contesta 404 con JSON, para que
 *  el error sea del test y no un "Error de conexión" mudo. */
function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const path = url.split('?')[0]
    const clave = `${init?.method ?? 'GET'} ${path}`
    if (clave in tabla) return Promise.resolve(json(tabla[clave]))
    if (path in tabla) return Promise.resolve(json(tabla[path]))
    return Promise.resolve(json({ detail: `sin respuesta para ${clave}` }, 404))
  })
}

function pedidas(): string[] {
  return fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
}

function cuerpoDe(indice: number): Record<string, unknown> {
  return JSON.parse(String((fetchMock.mock.calls[indice][1] as RequestInit).body))
}

beforeEach(() => {
  cleanup()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('Productos: lo que cada producto decide', () => {
  const tabla = { '/api/productos': [PLATO, INSUMO, SERVICIO], '/api/productos/categorias': [] }

  it('sin props es el CRUD base: ni Tipo, ni Estación, ni Insumo, ni Receta', async () => {
    responder(tabla)
    render(<MemoryRouter><Productos /></MemoryRouter>)
    await screen.findByText('Milanesa')
    expect(screen.queryByText('Tipo')).toBeNull()
    expect(screen.queryByText('Estación')).toBeNull()
    expect(screen.queryByText('Insumo')).toBeNull()
    expect(screen.queryByLabelText('Receta')).toBeNull()
  })

  it('con conTipo aparece la columna Tipo y el servicio se distingue (Contalibra)', async () => {
    responder(tabla)
    render(<MemoryRouter><Productos conTipo /></MemoryRouter>)
    await screen.findByText('Milanesa')
    expect(screen.getByText('Tipo')).toBeTruthy()
    expect(screen.getByText('Servicio')).toBeTruthy()
    expect(screen.queryByText('Insumo')).toBeNull()
  })

  it('con estaciones, vendible y receta es la forma de Restolibra', async () => {
    responder(tabla)
    render(
      <MemoryRouter>
        <Productos
          estaciones={[{ value: '', label: '— Sin comanda —' }, { value: 'cocina', label: 'Cocina' }]}
          conVendible
          rutaDeReceta={(id) => `/productos/${id}/receta`}
        />
      </MemoryRouter>,
    )
    await screen.findByText('Milanesa')
    expect(screen.getByText('Estación')).toBeTruthy()
    expect(screen.getByText('Cocina')).toBeTruthy()
    expect(screen.getByText('Insumo')).toBeTruthy()  // Harina no es vendible
    const recetas = screen.getAllByLabelText('Receta')
    expect(recetas).toHaveLength(3)
    expect(recetas[0].getAttribute('href')).toBe('/productos/1/receta')
  })

  it('el alta manda sólo los campos que este producto edita', async () => {
    responder({ ...tabla, 'POST /api/productos': PLATO })
    const user = userEvent.setup()
    render(<MemoryRouter><Productos conTipo /></MemoryRouter>)
    await screen.findByText('Milanesa')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    await user.type(screen.getByLabelText('Nombre'), 'Fideos')
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/productos'))
    const cuerpo = cuerpoDe(pedidas().indexOf('POST /api/productos'))
    expect(cuerpo.nombre).toBe('Fideos')
    expect(cuerpo.tipo).toBe('producto')
    // Sin `estaciones` ni `conVendible`, esos campos no viajan: el backend les
    // aplica el default histórico y un producto que no los edita no los toca.
    expect('estacion' in cuerpo).toBe(false)
    expect('vendible' in cuerpo).toBe(false)
  })
})

describe('Stock: la merma es dato del backend, el historial es prop', () => {
  it('sin motivos de merma el ajuste tiene tres modos y el historial se abre en la misma pantalla', async () => {
    responder({ '/api/stock': { productos: [ITEM], alertas: [ITEM] }, '/api/stock/motivos-merma': [], '/api/stock/movimientos': [MOV] })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(screen.getByText(/1 producto con stock bajo mínimo/)).toBeTruthy()
    await user.click(screen.getByLabelText('Ajustar stock'))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: /Fijar en/ })).toBeTruthy()
    expect(within(dialogo).queryByRole('button', { name: 'Merma' })).toBeNull()
    // El botón «Ver movimientos» es un botón, no un link: despliega acá.
    expect(screen.getByLabelText('Ver movimientos').tagName).toBe('BUTTON')
  })

  it('con motivos de merma aparece el modo Merma y manda el motivo', async () => {
    responder({
      '/api/stock': { productos: [ITEM], alertas: [] },
      '/api/stock/motivos-merma': ['Quemado', 'Otro'],
      'POST /api/stock/1/ajuste': { producto: {}, stock_actual: 1 },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock rutaDeMovimientos={(id) => `/stock/movimientos?producto_id=${id}`} /></MemoryRouter>)
    await screen.findByText('Yerba')
    // Con ruta, «Ver movimientos» es un link a la página propia.
    expect(screen.getByLabelText('Ver movimientos').getAttribute('href')).toBe('/stock/movimientos?producto_id=1')
    await user.click(screen.getByLabelText('Ajustar stock'))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Merma' }))
    await user.clear(within(dialogo).getByLabelText(/Cantidad a retirar/))
    await user.type(within(dialogo).getByLabelText(/Cantidad a retirar/), '2')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/stock/1/ajuste'))
    const cuerpo = cuerpoDe(pedidas().indexOf('POST /api/stock/1/ajuste'))
    expect(cuerpo.modo).toBe('merma')
    expect(cuerpo.cantidad).toBe(2)
    expect(cuerpo.motivo).toBe('Otro')
  })

  it('una cantidad en cero en un modo relativo se frena antes de pedir', async () => {
    responder({ '/api/stock': { productos: [ITEM], alertas: [] }, '/api/stock/motivos-merma': [] })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Yerba')
    await user.click(screen.getByLabelText('Ajustar stock'))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Entrada' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    expect(await within(dialogo).findByText('La cantidad debe ser mayor a 0.')).toBeTruthy()
    expect(pedidas().filter((p) => p.startsWith('POST'))).toHaveLength(0)
  })
})

describe('StockMovimientos y depósitos', () => {
  it('el historial lee los filtros de la URL y muestra la merma con su etiqueta', async () => {
    responder({ '/api/productos': [PLATO], '/api/stock/movimientos': [MOV] })
    render(
      <MemoryRouter initialEntries={['/stock/movimientos?producto_id=1']}>
        <Routes><Route path="/stock/movimientos" element={<StockMovimientos />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Merma')).toBeTruthy()
    expect(pedidas().some((p) => p.includes('/api/stock/movimientos?producto_id=1'))).toBe(true)
    expect(screen.getByText('06-09-2026')).toBeTruthy()
  })

  it('los depósitos se listan y el default no se puede borrar desde la tarjeta', async () => {
    responder({ '/api/depositos': [DEPOSITO, { ...DEPOSITO, id: 2, nombre: 'Sucursal', es_default: 0 }] })
    render(<MemoryRouter><Depositos rutaDelDetalle={(id) => `/dep/${id}`} /></MemoryRouter>)
    await screen.findByText('Central')
    expect(screen.getByText('Por defecto')).toBeTruthy()
    expect(screen.getAllByLabelText('Eliminar depósito')).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /Ver stock/ })[0].getAttribute('href')).toBe('/dep/1')
  })

  it('la transferencia manda producto, origen, destino y cantidad', async () => {
    responder({
      '/api/depositos': [DEPOSITO, { ...DEPOSITO, id: 2, nombre: 'Sucursal', es_default: 0 }],
      '/api/productos': [PLATO],
      '/api/depositos/stock-producto/1': [{ id: 1, nombre: 'Central', es_default: 1, stock_actual: 10 }],
      'POST /api/depositos/transferir': { ok: true },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><DepositoTransferencia /></MemoryRouter>)
    await screen.findByText('Transferir stock entre depósitos')
    // El producto es un SelectBuscable (combobox con listbox); los depósitos son
    // Selects de shadcn, que el stub rendea como <select> nativos, en orden.
    await user.click(screen.getByRole('combobox', { name: 'Producto' }))
    await user.click(await screen.findByRole('option', { name: /Milanesa/ }))
    const selects = () => screen.getAllByRole('combobox').filter((el) => el.tagName === 'SELECT')
    await waitFor(() => expect(selects()).toHaveLength(2))
    await user.selectOptions(selects()[0], '1')
    await user.selectOptions(selects()[1], '2')
    await user.type(screen.getByLabelText('Cantidad'), '4')
    await user.click(screen.getByRole('button', { name: /Confirmar transferencia/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/depositos/transferir'))
    const cuerpo = cuerpoDe(pedidas().indexOf('POST /api/depositos/transferir'))
    expect(cuerpo).toMatchObject({ producto_id: 1, origen_id: 1, destino_id: 2, cantidad: 4 })
    expect(await screen.findByText('Transferencia realizada correctamente.')).toBeTruthy()
  })
})

// Los flujos de las pantallas de catálogo, stock y depósitos: editar, borrar,
// buscar, ajustar, transferir, y lo que pasa cuando la API falla (P9-M1).
//
// `comercio.test.tsx` prueba las costuras (las props); esto prueba que cada
// acción llame a la API con lo que corresponde y que un error de la API llegue
// a la pantalla. Es lo que sostiene el piso de cobertura del paquete al sumar
// 1.900 líneas de pantallas.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import { Stock } from '../src/comercio/Stock'
import { StockMovimientos } from '../src/comercio/StockMovimientos'
import { Depositos } from '../src/comercio/Depositos'
import { DepositoDetalle } from '../src/comercio/DepositoDetalle'
import { DepositoTransferencia } from '../src/comercio/DepositoTransferencia'
import { opcionesProducto, type Deposito, type MovimientoStock, type Producto, type StockItem } from '../src/comercio/tipos'

const PLATO: Producto = {
  id: 1, codigo: 'BEB-0001', nombre: 'Milanesa', descripcion: 'con papas', precio_venta: 5000, precio_costo: 2000,
  unidad: 'u', categoria: 'Platos', stock_minimo: 0, estacion: 'cocina', vendible: 1, activo: 1, tipo: 'producto',
}
const INACTIVO: Producto = { ...PLATO, id: 2, codigo: null, nombre: 'Viejo', activo: 0, estacion: '' }
const ITEM: StockItem = { id: 1, codigo: 'Y001', nombre: 'Yerba', unidad: 'kg', categoria: 'Almacén', stock_minimo: 5, activo: 1, stock_actual: 8 }
const SIN: StockItem = { ...ITEM, id: 2, codigo: null, nombre: 'Agotado', stock_actual: 0, stock_minimo: 0 }
const MOV: MovimientoStock = { id: 9, producto_id: 1, producto_nombre: 'Yerba', unidad: 'kg', tipo: 'entrada', cantidad: 3, referencia: '', fecha: '2026-09-06' }
const CENTRAL: Deposito = { id: 1, nombre: 'Central', descripcion: 'el de siempre', es_default: 1, activo: 1, total_productos: 1 }
const SUCURSAL: Deposito = { id: 2, nombre: 'Sucursal', descripcion: '', es_default: 0, activo: 0, total_productos: 0 }

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Como en `comercio.test.tsx`, más un valor especial: `'!caida'` hace que la
 *  llamada rechace como si no hubiera red, y `{ status, detail }` contesta ese
 *  error de la API. */
function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const path = url.split('?')[0]
    const clave = `${init?.method ?? 'GET'} ${path}`
    const valor = clave in tabla ? tabla[clave] : tabla[path]
    if (valor === '!caida') return Promise.reject(new TypeError('sin red'))
    if (valor && typeof valor === 'object' && 'status' in (valor as object) && 'detail' in (valor as object)) {
      const e = valor as { status: number; detail: string }
      return Promise.resolve(json({ detail: e.detail }, e.status))
    }
    if (valor === undefined) return Promise.resolve(json({ detail: `sin respuesta para ${clave}` }, 404))
    return Promise.resolve(json(valor))
  })
}

function pedidas(): string[] {
  return fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
}

function cuerpoDe(clave: string): Record<string, unknown> {
  const i = pedidas().indexOf(clave)
  return JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body))
}

beforeEach(() => {
  cleanup()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('Productos: editar, borrar, buscar y fallar', () => {
  const tabla = { '/api/productos': [PLATO, INACTIVO], '/api/productos/categorias': [{ id: 1, nombre: 'Platos' }] }

  it('editar carga el producto en el diálogo y manda PUT con estación y vendible', async () => {
    responder({ ...tabla, 'PUT /api/productos/1': PLATO })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Productos estaciones={[{ value: '', label: '— Sin comanda —' }, { value: 'cocina', label: 'Cocina' }]} conVendible codigoAutogenerado rutaDeReceta={(id) => `/r/${id}`} />
      </MemoryRouter>,
    )
    await screen.findByText('Milanesa')
    await user.click(screen.getAllByLabelText('Editar producto')[0])
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Editar producto')).toBeTruthy()
    expect((within(dialogo).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Milanesa')
    expect(within(dialogo).getByPlaceholderText('Autogenerado')).toBeTruthy()
    expect(within(dialogo).getByRole('link', { name: /Receta \/ insumos/ }).getAttribute('href')).toBe('/r/1')
    await user.clear(within(dialogo).getByLabelText('Precio de venta'))
    await user.type(within(dialogo).getByLabelText('Precio de venta'), '6000')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    const cuerpo = cuerpoDe('PUT /api/productos/1')
    expect(cuerpo).toMatchObject({ nombre: 'Milanesa', precio_venta: 6000, estacion: 'cocina', vendible: true, activo: true })
    expect('tipo' in cuerpo).toBe(false)
  })

  it('un nombre vacío no llega a la API; un error de la API se muestra en el diálogo', async () => {
    responder({ ...tabla, 'POST /api/productos': { status: 422, detail: 'Ese código ya existe.' } })
    const user = userEvent.setup()
    render(<MemoryRouter><Productos /></MemoryRouter>)
    await screen.findByText('Milanesa')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear producto' }))
    expect(await within(dialogo).findByText('El nombre es obligatorio')).toBeTruthy()
    expect(pedidas().filter((p) => p.startsWith('POST'))).toHaveLength(0)
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Repetido')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear producto' }))
    expect(await within(dialogo).findByText('Ese código ya existe.')).toBeTruthy()
  })

  it('borrar pide confirmación y recién entonces manda DELETE', async () => {
    responder({ ...tabla, 'DELETE /api/productos/1': { ok: true } })
    const user = userEvent.setup()
    render(<MemoryRouter><Productos /></MemoryRouter>)
    await screen.findByText('Milanesa')
    await user.click(screen.getAllByLabelText('Eliminar producto')[0])
    const alerta = await screen.findByRole('alertdialog')
    expect(within(alerta).getByText('¿Eliminar Milanesa?')).toBeTruthy()
    await user.click(within(alerta).getByRole('button', { name: 'Cancelar' }))
    expect(pedidas().filter((p) => p.startsWith('DELETE'))).toHaveLength(0)
    await user.click(screen.getAllByLabelText('Eliminar producto')[0])
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/productos/1'))
  })

  it('buscar manda q, limpiar vuelve al listado entero, y sin red se avisa', async () => {
    responder(tabla)
    const user = userEvent.setup()
    render(<MemoryRouter><Productos /></MemoryRouter>)
    await screen.findByText('Milanesa')
    await user.type(screen.getByPlaceholderText(/Buscar por nombre/), 'mila{Enter}')
    await waitFor(() => expect(pedidas().some((p) => p.endsWith('/api/productos?q=mila'))).toBe(true))
    await user.click(screen.getByRole('button', { name: /Limpiar/ }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'GET /api/productos')).toHaveLength(2))
    responder({ '/api/productos': '!caida', '/api/productos/categorias': [] })
    await user.click(screen.getByRole('button', { name: /Buscar/ }))
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

describe('Stock: ajustes, historial inline y errores', () => {
  const base = { '/api/stock': { productos: [ITEM, SIN], alertas: [] }, '/api/stock/motivos-merma': [] }

  it('fijar en negativo se frena; entrada con conversión multiplica y manda unidad y factor', async () => {
    responder({ ...base, 'POST /api/stock/1/ajuste': { producto: {}, stock_actual: 1008 } })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock conConversionDeUnidad /></MemoryRouter>)
    await screen.findByText('Yerba')
    await user.click(screen.getAllByLabelText('Ajustar stock')[0])
    const dialogo = await screen.findByRole('dialog')
    const campo = () => within(dialogo).getByRole('spinbutton', { name: /Stock nuevo|Cantidad/ })
    await user.clear(campo())
    await user.type(campo(), '-1')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    expect(await within(dialogo).findByText('La cantidad no puede ser negativa.')).toBeTruthy()
    await user.click(within(dialogo).getByRole('button', { name: 'Entrada' }))
    await user.type(campo(), '2')
    await user.type(within(dialogo).getByPlaceholderText('bolsa, caja…'), 'bolsa')
    await user.clear(within(dialogo).getByLabelText('Factor'))
    await user.type(within(dialogo).getByLabelText('Factor'), '500')
    expect(within(dialogo).getByText(/Stock resultante: 1008/)).toBeTruthy()
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/stock/1/ajuste'))
    expect(cuerpoDe('POST /api/stock/1/ajuste')).toMatchObject({ modo: 'entrada', cantidad: 2, unidad_compra: 'bolsa', factor: 500 })
  })

  it('un factor en cero se frena, y el error de la API queda en el diálogo', async () => {
    responder({ ...base, 'POST /api/stock/1/ajuste': { status: 422, detail: 'Modo inválido.' } })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock conConversionDeUnidad /></MemoryRouter>)
    await screen.findByText('Yerba')
    await user.click(screen.getAllByLabelText('Ajustar stock')[0])
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Entrada' }))
    await user.type(within(dialogo).getByRole('spinbutton', { name: /Cantidad/ }), '1')
    await user.clear(within(dialogo).getByLabelText('Factor'))
    await user.type(within(dialogo).getByLabelText('Factor'), '0')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    expect(await within(dialogo).findByText('El factor debe ser mayor a 0.')).toBeTruthy()
    await user.clear(within(dialogo).getByLabelText('Factor'))
    await user.type(within(dialogo).getByLabelText('Factor'), '1')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    expect(await within(dialogo).findByText('Modo inválido.')).toBeTruthy()
  })

  it('salida manda la cantidad; el historial inline filtra por producto y se limpia', async () => {
    responder({ ...base, 'POST /api/stock/2/ajuste': { producto: {}, stock_actual: 0 }, '/api/stock/movimientos': [MOV] })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Agotado')
    expect(screen.getByText('Sin stock')).toBeTruthy()
    await user.click(screen.getAllByLabelText('Ajustar stock')[1])
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Salida' }))
    await user.type(within(dialogo).getByRole('spinbutton', { name: /Cantidad a retirar/ }), '3')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    await waitFor(() => expect(cuerpoDe('POST /api/stock/2/ajuste')).toMatchObject({ modo: 'salida', cantidad: 3 }))
    // El historial: desde la fila (filtra por ese producto) y desde el botón general.
    await user.click(screen.getAllByLabelText('Ver movimientos')[0])
    await waitFor(() => expect(pedidas().some((p) => p.endsWith('/api/stock/movimientos?producto_id=1'))).toBe(true))
    expect(await screen.findByText('Entrada')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Limpiar/ }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'GET /api/stock/movimientos')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: /Filtrar/ }))
    await user.click(screen.getByRole('button', { name: /Historial de movimientos/ }))
    expect(screen.queryByText('Movimientos de stock')).toBeNull()
  })

  it('sin red la pantalla avisa en vez de quedarse cargando', async () => {
    responder({ '/api/stock': '!caida', '/api/stock/motivos-merma': [] })
    render(<MemoryRouter><Stock /></MemoryRouter>)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

describe('StockMovimientos: filtros y errores', () => {
  it('cambiar un filtro reescribe la URL y limpiar la vacía; un 500 se muestra', async () => {
    responder({ '/api/productos': [PLATO], '/api/stock/movimientos': [MOV] })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/stock/movimientos?desde=2026-09-01']}>
        <Routes><Route path="/stock/movimientos" element={<StockMovimientos rutaDeStock="/s" />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Entrada')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Stock/ }).getAttribute('href')).toBe('/s')
    const fechas = screen.getAllByDisplayValue('2026-09-01')
    expect(fechas).toHaveLength(1)
    await user.clear(fechas[0])
    await user.type(fechas[0], '2026-09-02')
    await waitFor(() => expect(pedidas().some((p) => p.includes('desde=2026-09-02'))).toBe(true))
    await user.click(screen.getByLabelText('Limpiar filtros'))
    // Dos sin filtros: una al vaciar el campo con `clear`, otra al limpiar.
    await waitFor(() => expect(pedidas().filter((p) => p === 'GET /api/stock/movimientos')).toHaveLength(2))
    responder({ '/api/productos': [PLATO], '/api/stock/movimientos': { status: 500, detail: 'se rompió' } })
    await user.type(screen.getAllByDisplayValue('')[0], '2026-09-03')
    expect(await screen.findByText('se rompió')).toBeTruthy()
  })
})

describe('Depósitos: alta, edición, default, borrado y detalle', () => {
  it('el alta y la edición mandan lo que corresponde, predeterminar hace POST y borrar confirma', async () => {
    responder({
      '/api/depositos': [CENTRAL, SUCURSAL],
      'POST /api/depositos': CENTRAL,
      'PUT /api/depositos/2': SUCURSAL,
      'POST /api/depositos/2/set-default': SUCURSAL,
      'DELETE /api/depositos/2': { ok: true },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><Depositos /></MemoryRouter>)
    await screen.findByText('Central')
    expect(screen.getByText('Inactivo')).toBeTruthy()
    expect(screen.getByText('el de siempre')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Nuevo depósito/ }))
    let dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: /Guardar/ })).toHaveProperty('disabled', true)
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Galpón')
    await user.type(within(dialogo).getByPlaceholderText(/Almacén norte/), 'atrás')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(cuerpoDe('POST /api/depositos')).toEqual({ nombre: 'Galpón', descripcion: 'atrás' }))
    await user.click(screen.getAllByRole('button', { name: /Editar/ })[1])
    dialogo = await screen.findByRole('dialog')
    expect((within(dialogo).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Sucursal')
    await user.click(within(dialogo).getByRole('switch'))
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(cuerpoDe('PUT /api/depositos/2')).toEqual({ nombre: 'Sucursal', descripcion: '', activo: true }))
    await user.click(screen.getByRole('button', { name: /Predeterminar/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/depositos/2/set-default'))
    await user.click(screen.getByLabelText('Eliminar depósito'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/depositos/2'))
  })

  it('un error de la API al guardar queda en el diálogo, y sin red el listado avisa', async () => {
    responder({ '/api/depositos': [CENTRAL], 'POST /api/depositos': { status: 422, detail: 'El nombre es obligatorio.' } })
    const user = userEvent.setup()
    render(<MemoryRouter><Depositos /></MemoryRouter>)
    await screen.findByText('Central')
    await user.click(screen.getByRole('button', { name: /Nuevo depósito/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nombre'), 'x')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    expect(await within(dialogo).findByText('El nombre es obligatorio.')).toBeTruthy()
    cleanup()
    responder({ '/api/depositos': '!caida' })
    render(<MemoryRouter><Depositos /></MemoryRouter>)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })

  it('el detalle muestra el stock del depósito, edita, y avisa si no existe', async () => {
    responder({
      '/api/depositos': [CENTRAL],
      '/api/depositos/1/stock': [ITEM, { ...ITEM, id: 3, nombre: 'Bajo', stock_actual: 2 }, SIN],
      'PUT /api/depositos/1': { ...CENTRAL, nombre: 'Central 2' },
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/depositos/1']}>
        <Routes><Route path="/depositos/:id" element={<DepositoDetalle rutaDeDepositos="/d" />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Stock en este depósito')).toBeTruthy()
    expect(screen.getByText('3 productos')).toBeTruthy()
    expect(screen.getByText('Bajo mínimo')).toBeTruthy()
    expect(screen.getByText('Sin stock')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Volver/ }).getAttribute('href')).toBe('/d')
    await user.click(screen.getByRole('button', { name: /Editar/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.clear(within(dialogo).getByLabelText('Nombre'))
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Central 2')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(cuerpoDe('PUT /api/depositos/1')).toMatchObject({ nombre: 'Central 2', activo: true }))
    expect(await screen.findByText('Central 2')).toBeTruthy()

    cleanup()
    responder({ '/api/depositos': [CENTRAL], '/api/depositos/9/stock': [] })
    render(
      <MemoryRouter initialEntries={['/depositos/9']}>
        <Routes><Route path="/depositos/:id" element={<DepositoDetalle />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Depósito no encontrado.')).toBeTruthy()
  })

  it('la transferencia muestra el stock por depósito y el error de la API', async () => {
    responder({
      '/api/depositos': [CENTRAL, { ...SUCURSAL, activo: 1 }],
      '/api/productos': [PLATO, INACTIVO],
      '/api/depositos/stock-producto/1': [{ id: 1, nombre: 'Central', es_default: 1, stock_actual: 10 }],
      'POST /api/depositos/transferir': { status: 422, detail: 'Stock insuficiente en depósito origen (disponible: 10.0).' },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><DepositoTransferencia rutaDeDepositos="/d" /></MemoryRouter>)
    await screen.findByText('Transferir stock entre depósitos')
    await user.click(screen.getByRole('combobox', { name: 'Producto' }))
    // El inactivo no se ofrece.
    expect(screen.queryByRole('option', { name: /Viejo/ })).toBeNull()
    await user.click(await screen.findByRole('option', { name: /Milanesa/ }))
    expect(await screen.findByText(/Stock disponible por depósito/)).toBeTruthy()
    const selects = () => screen.getAllByRole('combobox').filter((el) => el.tagName === 'SELECT')
    await waitFor(() => expect(selects()).toHaveLength(2))
    await user.selectOptions(selects()[0], '1')
    await user.selectOptions(selects()[1], '2')
    await user.type(screen.getByLabelText('Cantidad'), '40')
    await user.click(screen.getByRole('button', { name: /Confirmar transferencia/ }))
    expect(await screen.findByText(/Stock insuficiente en depósito origen/)).toBeTruthy()
  })
})

describe('tipos', () => {
  it('opcionesProducto arma la pista con código y categoría', () => {
    expect(opcionesProducto([{ id: 1, nombre: 'A', codigo: 'X', categoria: 'C' }, { id: 2, nombre: 'B' }])).toEqual([
      { value: '1', label: 'A', hint: 'X · C' },
      { value: '2', label: 'B', hint: undefined },
    ])
  })
})

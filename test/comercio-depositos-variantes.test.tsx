// Variantes de un producto con sucursales y depósitos (0.78.0), todas aditivas: sin las props, y sin `depositos`
// en la respuesta del stock, las pantallas son las de Contalibra y Restolibra (lo prueba `comercio-flujos`).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Depositos, type TipoDeDeposito } from '../src/comercio/Depositos'
import { DepositoDetalle } from '../src/comercio/DepositoDetalle'
import { DepositoTransferencia } from '../src/comercio/DepositoTransferencia'
import { Stock } from '../src/comercio/Stock'
import type { Deposito, Producto, StockItem } from '../src/comercio/tipos'

const TIPOS: TipoDeDeposito[] = [
  { valor: 'store', etiqueta: 'Sucursal', plural: 'Sucursales' }, { valor: 'warehouse', etiqueta: 'Depósito' },
]
const SALON: Deposito = { id: 1, nombre: 'Salón', descripcion: '', es_default: 1, activo: 1, total_productos: 2, tipo: 'store' }
const BODEGA: Deposito = { id: 2, nombre: 'Bodega', descripcion: '', es_default: 0, activo: 1, total_productos: 0, tipo: 'warehouse' }
const PLATO: Producto = {
  id: 1, codigo: 'P1', nombre: 'Milanesa', descripcion: '', precio_venta: 5000, precio_costo: 2000,
  unidad: 'u', categoria: '', stock_minimo: 0, estacion: '', vendible: 1, activo: 1, tipo: 'producto',
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

describe('Depositos con tipos', () => {
  const base = { '/api/depositos': [SALON, BODEGA], 'POST /api/depositos': SALON }

  it('sin tipos no hay filtro ni badge de tipo, y el alta no manda tipo', async () => {
    responder(base)
    const user = userEvent.setup()
    render(<MemoryRouter><Depositos /></MemoryRouter>)
    await screen.findByText('Salón')
    expect(screen.queryByRole('group', { name: 'Filtrar por tipo' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Nuevo depósito/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Nuevo')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/depositos'))
    expect(cuerpoDe('POST /api/depositos')).toEqual({ nombre: 'Nuevo', descripcion: '' })
  })

  it('con tipos: título propio, badge y filtro por tipo con su cuenta', async () => {
    responder(base)
    const user = userEvent.setup()
    render(<MemoryRouter><Depositos tipos={TIPOS} titulo="Sucursales / depósitos" etiquetaNuevo="Nueva sucursal / depósito" /></MemoryRouter>)
    expect(await screen.findByText('Sucursales / depósitos')).toBeTruthy()
    const grupo = screen.getByRole('group', { name: 'Filtrar por tipo' })
    expect(within(grupo).getByRole('button', { name: 'Todos (2)' })).toBeTruthy()
    expect(within(grupo).getByRole('button', { name: 'Sucursales (1)' })).toBeTruthy() // el plural declarado
    await user.click(within(grupo).getByRole('button', { name: 'Depósitos (1)' }))
    expect(screen.queryByText('Salón')).toBeNull()
    expect(screen.getByText('Bodega')).toBeTruthy()
  })

  it('el alta pide el tipo (preseleccionado el del filtro) y lo manda; al editar el tipo no se cambia', async () => {
    responder({ ...base, 'PUT /api/depositos/2': BODEGA })
    const user = userEvent.setup()
    render(<MemoryRouter><Depositos tipos={TIPOS} etiquetaNuevo="Nueva ubicación" /></MemoryRouter>)
    await screen.findByText('Salón')
    await user.click(screen.getByRole('button', { name: 'Depósitos (1)' }))
    await user.click(screen.getByRole('button', { name: /Nueva ubicación/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('combobox', { name: 'Tipo' })).toHaveValue('warehouse')
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Norte')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/depositos'))
    expect(cuerpoDe('POST /api/depositos')).toEqual({ nombre: 'Norte', descripcion: '', tipo: 'warehouse' })
    cleanup()
    responder({ ...base, 'PUT /api/depositos/2': BODEGA })
    render(<MemoryRouter><Depositos tipos={TIPOS} /></MemoryRouter>)
    await screen.findByText('Bodega')
    await user.click(screen.getAllByRole('button', { name: /Editar/ })[1])
    const edicion = await screen.findByRole('dialog')
    expect(within(edicion).queryByRole('combobox', { name: 'Tipo' })).toBeNull()
    expect(within(edicion).getByText('Depósito')).toBeTruthy()
  })

  it('soloLectura no ofrece alta, edición, predeterminar ni borrar', async () => {
    responder(base)
    render(<MemoryRouter><Depositos tipos={TIPOS} soloLectura /></MemoryRouter>)
    await screen.findByText('Bodega')
    expect(screen.queryByRole('button', { name: /Nuevo/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Predeterminar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull()
    expect(screen.getAllByText('Ver stock')).toHaveLength(2)
  })

  it('el detalle ofrece editar, y en soloLectura no', async () => {
    responder({ '/api/depositos': [SALON], '/api/depositos/1/stock': [] })
    const montar = (soloLectura: boolean) => render(
      <MemoryRouter initialEntries={['/d/1']}>
        <Routes><Route path="/d/:id" element={<DepositoDetalle soloLectura={soloLectura} />} /></Routes>
      </MemoryRouter>,
    )
    montar(false)
    expect(await screen.findByRole('button', { name: /Editar/ })).toBeTruthy()
    cleanup()
    montar(true)
    await screen.findByText('Stock en este depósito')
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull()
  })
})

describe('DepositoTransferencia con historial', () => {
  const HISTORIAL = [{
    id: 5, producto_id: 1, producto: 'Milanesa', variant_id: null, cantidad: 4, origen_id: 1, origen: 'Salón',
    destino_id: 2, destino: 'Bodega', fecha: '2026-09-26T10:00:00', observaciones: 'reposición', usuario_id: 1,
  }]
  const base = {
    '/api/depositos': [SALON, BODEGA], '/api/productos': [PLATO],
    '/api/depositos/stock-producto/1': [{ id: 1, nombre: 'Salón', es_default: 1, stock_actual: 10 }],
  }

  it('sin la prop no pide el historial', async () => {
    responder(base)
    render(<MemoryRouter><DepositoTransferencia /></MemoryRouter>)
    await screen.findByText('Transferir stock entre depósitos')
    expect(pedidas().some((p) => p.includes('/transferencias'))).toBe(false)
    expect(screen.queryByText('Transferencias realizadas')).toBeNull()
  })

  it('con conHistorial lo lista, y al transferir dice cómo quedó cada lado y lo recarga', async () => {
    responder({
      ...base, '/api/depositos/transferencias': HISTORIAL,
      'POST /api/depositos/transferir': {
        ok: true, cantidad: 4, origen: { id: 1, nombre: 'Salón', stock: 6 }, destino: { id: 2, nombre: 'Bodega', stock: 4 },
      },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><DepositoTransferencia conHistorial /></MemoryRouter>)
    expect(await screen.findByText('reposición')).toBeTruthy()
    await user.click(screen.getByRole('combobox', { name: 'Producto' }))
    await user.click(await screen.findByRole('option', { name: /Milanesa/ }))
    const selects = () => screen.getAllByRole('combobox').filter((el) => el.tagName === 'SELECT')
    await waitFor(() => expect(selects()).toHaveLength(2))
    await user.selectOptions(selects()[0], '1')
    await user.selectOptions(selects()[1], '2')
    await user.type(screen.getByLabelText('Cantidad'), '4')
    const antes = pedidas().filter((p) => p === 'GET /api/depositos/transferencias').length
    await user.click(screen.getByRole('button', { name: /Confirmar transferencia/ }))
    expect(await screen.findByText(/Quedó: Salón 6, Bodega 4/)).toBeTruthy()
    await waitFor(() => expect(pedidas().filter((p) => p === 'GET /api/depositos/transferencias').length).toBe(antes + 1))
  })
})

describe('Stock por depósito', () => {
  const YERBA: StockItem = {
    id: 1, codigo: 'Y1', nombre: 'Yerba', unidad: 'kg', categoria: '', stock_minimo: 0, activo: 1,
    stock_actual: 13, por_deposito: { '1': 10, '2': 3 },
  }
  const DEPOSITOS = [
    { id: 1, nombre: 'Salón', tipo: 'store', es_default: 1 }, { id: 2, nombre: 'Bodega', tipo: 'warehouse', es_default: 0 },
  ]
  const con = { '/api/stock': { productos: [YERBA], alertas: [], depositos: DEPOSITOS }, '/api/stock/motivos-merma': [] }

  it('sin `depositos` en la respuesta no hay columnas ni selector de depósito, ni deposito_id en el ajuste', async () => {
    responder({
      '/api/stock': { productos: [{ ...YERBA, por_deposito: undefined }], alertas: [] }, '/api/stock/motivos-merma': [],
      'POST /api/stock/1/ajuste': { producto: {}, stock_actual: 1 },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(screen.queryByText('Bodega')).toBeNull()
    await user.click(screen.getByLabelText('Ajustar stock'))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).queryByRole('combobox', { name: 'Depósito' })).toBeNull()
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/stock/1/ajuste'))
    expect(cuerpoDe('POST /api/stock/1/ajuste')).not.toHaveProperty('deposito_id')
  })

  it('conFiltros busca por nombre y deja sólo los que tienen stock; sin la prop no hay filtros', async () => {
    const CERO: StockItem = { ...YERBA, id: 2, nombre: 'Azúcar', stock_actual: 0, por_deposito: {} }
    responder({ ...con, '/api/stock': { productos: [YERBA, CERO], alertas: [], depositos: DEPOSITOS } })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock conFiltros /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(screen.getByText('Azúcar')).toBeTruthy()
    await user.click(screen.getByLabelText('Sólo los que tienen stock'))
    expect(screen.queryByText('Azúcar')).toBeNull()
    await user.click(screen.getByLabelText('Sólo los que tienen stock'))
    await user.type(screen.getByLabelText('Buscar producto'), 'zúc')
    expect(screen.queryByText('Yerba')).toBeNull()
    expect(screen.getByText('Azúcar')).toBeTruthy()
    cleanup()
    responder({ ...con, '/api/stock': { productos: [YERBA, CERO], alertas: [], depositos: DEPOSITOS } })
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(screen.queryByLabelText('Buscar producto')).toBeNull()
  })

  it('con `depositos` hay una columna por depósito y el total', async () => {
    responder(con)
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Yerba')
    expect(screen.getByText('Salón')).toBeTruthy()
    expect(screen.getByText('Bodega')).toBeTruthy()
    expect(screen.getByText('Total')).toBeTruthy()
    const fila = screen.getByText('Yerba').closest('tr')!
    expect(within(fila).getByText('10')).toBeTruthy()
    expect(within(fila).getByText('3')).toBeTruthy()
    expect(within(fila).getByText('13')).toBeTruthy()
  })

  it('el ajuste elige el depósito (el predeterminado), parte del stock de ESE depósito y manda deposito_id', async () => {
    responder({ ...con, 'POST /api/stock/1/ajuste': { producto: {}, stock_actual: 13, stock_deposito: 8 } })
    const user = userEvent.setup()
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Yerba')
    await user.click(screen.getByLabelText('Ajustar stock'))
    const dialogo = await screen.findByRole('dialog')
    const selector = within(dialogo).getByRole('combobox', { name: 'Depósito' })
    expect(selector).toHaveValue('1')
    // «Fijar en…» arranca con el stock del depósito, no con el total.
    expect(within(dialogo).getByRole('spinbutton', { name: /Stock nuevo/ })).toHaveValue(10)
    await user.selectOptions(selector, '2')
    expect(within(dialogo).getByRole('spinbutton', { name: /Stock nuevo/ })).toHaveValue(3)
    await user.click(within(dialogo).getByRole('button', { name: 'Salida' }))
    await user.type(within(dialogo).getByRole('spinbutton', { name: /Cantidad/ }), '1')
    expect(within(dialogo).getByText(/Stock resultante: 2/)).toBeTruthy()  // 3 - 1, no 13 - 1
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar movimiento' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/stock/1/ajuste'))
    expect(cuerpoDe('POST /api/stock/1/ajuste')).toMatchObject({ modo: 'salida', cantidad: 1, deposito_id: 2 })
  })
})

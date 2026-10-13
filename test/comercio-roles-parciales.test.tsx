// Roles parciales (0.146.0, ADR-058): lo que el kit ofrece según lo que la persona puede hacer, y lo que no muestra cuando el motor no le manda los costos.
//
// El caso que lo pidió es VentaLibra: el depósito tiene `compras.ver` pero no `compras.escribir`, `compras.recibir` ni `costos.ver` (la API le saca `subtotal`,
// `unit_cost` y `precio_costo` de la respuesta), y el vendedor ve Stock sin `stock.ajustar`. Hasta acá el kit le ponía botones que contestaban 403 y «$NaN» en
// los importes que no llegaron. Cada prop nueva (`puedeAjustar`, `puedeEscribir`, `puedeRecibir`) tiene `true` por defecto: sin ella la pantalla es la de siempre.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Compras } from '../src/comercio/Compras'
import { CompraDetalle } from '../src/comercio/CompraDetalle'
import { ListaPrecioDetalle } from '../src/comercio/ListaPrecioDetalle'
import { Stock } from '../src/comercio/Stock'
import { _reiniciarRecepcionesEnMemoria } from '../src/comercio/recepcion-pendiente'
import type {
  Deposito, ItemListaPrecio, ListaPrecio, Producto, Proveedor, PurchaseOrder, PurchaseOrderItem, PurchaseReceipt, StockItem,
} from '../src/comercio/tipos'
import { montar, prepararFetch, pedidas, cuerpoDe, responder } from './helpers-pantallas'

// El texto de la pantalla entera: un «NaN» en cualquier parte (tabla, tarjeta, total) lo delata.
const textoDeLaPantalla = () => document.body.textContent ?? ''

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
  _reiniciarRecepcionesEnMemoria()
  sessionStorage.clear()
  anchoSimulado = 0
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
})
afterEach(() => { vi.unstubAllGlobals() })

// ── Stock ────────────────────────────────────────────────────────────────

const YERBA: StockItem = { id: 1, codigo: 'Y001', nombre: 'Yerba', unidad: 'kg', categoria: 'Almacén', stock_minimo: 5, activo: 1, stock_actual: 3 }
const SAL: StockItem = { id: 2, codigo: null, nombre: 'Sal', unidad: 'kg', categoria: '', stock_minimo: 0, activo: 1, stock_actual: 40 }
const TABLA_STOCK = { '/api/stock': { productos: [YERBA, SAL], alertas: [] }, '/api/stock/motivos-merma': [], '/api/stock/movimientos': [] }

async function abrirStock(props: { puedeAjustar?: boolean } = {}, ancho = 1600) {
  anchoSimulado = ancho
  responder(TABLA_STOCK)
  render(<MemoryRouter><Stock {...props} /></MemoryRouter>)
  await screen.findAllByText(/Sal/)
}

describe('Stock: puedeAjustar', () => {
  it('sin la prop (o en true) «Ajustar stock» está en cada fila, como siempre', async () => {
    await abrirStock()
    expect(screen.getAllByRole('button', { name: 'Ajustar stock' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Ver movimientos' })).toHaveLength(2)
    cleanup()
    await abrirStock({ puedeAjustar: true })
    expect(screen.getAllByRole('button', { name: 'Ajustar stock' })).toHaveLength(2)
  })

  it('🔴 con puedeAjustar={false} la tabla no ofrece «Ajustar stock» y conserva «Ver movimientos»', async () => {
    await abrirStock({ puedeAjustar: false })
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: 'Ajustar stock' })).toHaveLength(0)
    expect(screen.queryByText('Ajuste de stock', { exact: false })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Ver movimientos' })).toHaveLength(2)
  })

  it('🔴 con puedeAjustar={false} las tarjetas tampoco lo ofrecen', async () => {
    await abrirStock({ puedeAjustar: false }, 400)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryAllByRole('button', { name: 'Ajustar stock' })).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Ver movimientos' })).toHaveLength(2)
  })

  it('el control — en tarjetas, por defecto sí lo ofrece (el test de arriba mide algo)', async () => {
    await abrirStock({}, 400)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Ajustar stock' })).toHaveLength(2)
  })
})

// ── Compras ──────────────────────────────────────────────────────────────

const PROVEEDOR: Proveedor = { id: 1, nombre: 'Distribuidora SA', cuit_dni: '30-1', email: '', phone: '', address: '', iva_condition: '' }
const LINEA: PurchaseOrderItem = { item_id: 1, quantity_ordered: '10', quantity_received: '0', pending_quantity: '10', unit_cost: '900.00', tax_rate: '0', subtotal: '9000.00' }
// Lo que contesta el motor a un rol sin `costos.ver`: la línea SIN `unit_cost` ni `subtotal` (no vienen en cero: no vienen).
const sinCostos = (orden: PurchaseOrder): PurchaseOrder => ({ ...orden, items: orden.items.map((l) => { const { unit_cost, subtotal, ...resto } = l; void unit_cost; void subtotal; return resto as PurchaseOrderItem }) })

const ORDEN: PurchaseOrder = { id: 10, number: 'OC-000010', proveedor_id: 1, status: 'sent', items: [LINEA], is_fully_received: false }
const OTRA: PurchaseOrder = { id: 11, number: 'OC-000011', proveedor_id: 1, status: 'draft', items: [{ ...LINEA, subtotal: '150.5' }], is_fully_received: false }
const LISTA_DE_COMPRAS = { '/api/purchase-orders': [ORDEN, OTRA], '/api/proveedores': [PROVEEDOR] }

describe('Compras: puedeEscribir', () => {
  it('sin la prop «Nueva compra» está, como siempre', async () => {
    responder(LISTA_DE_COMPRAS)
    montar('/compras', <Compras />)
    await screen.findByText('OC-000010')
    expect(screen.getByRole('button', { name: /Nueva compra/ })).toBeTruthy()
  })

  it('🔴 con puedeEscribir={false} no se ofrece «Nueva compra» y la lista sigue leyéndose', async () => {
    responder(LISTA_DE_COMPRAS)
    montar('/compras', <Compras puedeEscribir={false} />)
    expect(await screen.findByText('OC-000010')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Nueva compra/ })).toBeNull()
    expect(screen.getByText('$9.000,00')).toBeTruthy()
  })
})

describe('Compras: las órdenes llegan sin costos', () => {
  const SIN_COSTOS = { ...LISTA_DE_COMPRAS, '/api/purchase-orders': [sinCostos(ORDEN), sinCostos(OTRA)] }

  it('🔴 la tabla no tiene la columna «Total» ni dice «NaN»', async () => {
    responder(SIN_COSTOS)
    montar('/compras', <Compras puedeEscribir={false} />)
    await screen.findByText('OC-000010')
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'Total' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Líneas' })).toBeTruthy()
    expect(textoDeLaPantalla()).not.toMatch(/NaN/)
    expect(textoDeLaPantalla()).not.toContain('$')
  })

  it('🔴 las tarjetas tampoco tienen «Total» ni «NaN»', async () => {
    anchoSimulado = 390
    responder(SIN_COSTOS)
    montar('/compras', <Compras />)
    await screen.findAllByText('OC-000010')
    expect(screen.queryByRole('table')).toBeNull()
    const tarjetas = within(screen.getByRole('list', { name: 'Órdenes de compra' })).getAllByRole('listitem')
    expect(tarjetas).toHaveLength(2)
    for (const t of tarjetas) {
      expect(within(t).getByText('Líneas')).toBeTruthy()
      expect(within(t).queryByText('Total')).toBeNull()
    }
    expect(textoDeLaPantalla()).not.toMatch(/NaN/)
  })

  it('el control — con los costos la columna «Total» y su importe están', async () => {
    responder(LISTA_DE_COMPRAS)
    montar('/compras', <Compras />)
    await screen.findByText('OC-000010')
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeTruthy()
    expect(screen.getByText('$9.000,00')).toBeTruthy()
    expect(screen.getByText('$150,50')).toBeTruthy()
  })

  it('una orden con costos y otra vacía: la vacía vale $0,00 (no hay con qué decidir que falten)', async () => {
    responder({ ...LISTA_DE_COMPRAS, '/api/purchase-orders': [{ ...ORDEN, items: [] }] })
    montar('/compras', <Compras />)
    await screen.findByText('OC-000010')
    expect(screen.getByText('$0,00')).toBeTruthy()
  })

  it('una orden a la que le falta el subtotal de alguna línea (con otras órdenes que lo traen) muestra «—», no «NaN»', async () => {
    const mezclada: PurchaseOrder = { ...ORDEN, id: 12, number: 'OC-000012', items: [LINEA, sinCostos({ ...ORDEN, items: [LINEA] }).items[0]] }
    responder({ ...LISTA_DE_COMPRAS, '/api/purchase-orders': [OTRA, mezclada] })
    montar('/compras', <Compras />)
    await screen.findByText('OC-000012')
    expect(textoDeLaPantalla()).not.toMatch(/NaN/)
    expect(screen.getByText('$150,50')).toBeTruthy()
    expect(within(screen.getByText('OC-000012').closest('tr')!).getByText('—')).toBeTruthy()
  })
})

// ── CompraDetalle ────────────────────────────────────────────────────────

const PRODUCTO: Producto = {
  id: 1, codigo: 'Y001', nombre: 'Yerba 1kg', descripcion: '', precio_venta: 1500, precio_costo: 900,
  unidad: 'kg', categoria: '', stock_minimo: 0, estacion: '', vendible: 1, activo: 1, tipo: 'producto',
}
const DEPOSITO: Deposito = { id: 1, nombre: 'Central', descripcion: '', es_default: 1, activo: 1 }
const BORRADOR_SUELTO: PurchaseReceipt = {
  id: 40, proveedor_id: 1, purchase_order_id: 10, status: 'draft',
  items: [{ item_id: 1, quantity: '3', unit_cost: '900', lot_code: null, expires_at: null }], received_at: null, document_reference: null,
}

function respuestasDelDetalle(orden: PurchaseOrder) {
  return {
    '/api/purchase-orders/10': orden,
    '/api/productos?solo_activos=true': [PRODUCTO],
    '/api/proveedores': [PROVEEDOR],
    '/api/depositos': [DEPOSITO],
    '/api/purchase-receipts?purchase_order_id=10': [BORRADOR_SUELTO],
    'POST /api/purchase-receipts/recibir': { ...BORRADOR_SUELTO, status: 'confirmed', repetida: false },
  }
}

describe('CompraDetalle: puedeEscribir y puedeRecibir', () => {
  it('sin props se ofrece todo, como siempre: «Agregar línea», «Recibir mercadería» y «Confirmar recepción»', async () => {
    responder(respuestasDelDetalle(ORDEN))
    montar('/compras/10', <CompraDetalle />)
    await screen.findByText(/OC-000010/)
    expect(screen.getByRole('button', { name: 'Agregar línea' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Recibir mercadería/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmar recepción' })).toBeTruthy()
  })

  it('🔴 con puedeEscribir={false} no se agregan líneas, y recibir sigue estando', async () => {
    responder(respuestasDelDetalle(ORDEN))
    montar('/compras/10', <CompraDetalle puedeEscribir={false} />)
    await screen.findByText(/OC-000010/)
    expect(screen.queryByRole('button', { name: 'Agregar línea' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Producto' })).toBeNull()
    expect(screen.getByRole('button', { name: /Recibir mercadería/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmar recepción' })).toBeTruthy()
  })

  it('🔴 con puedeRecibir={false} no se recibe ni se confirma una recepción, y agregar líneas sigue estando', async () => {
    responder(respuestasDelDetalle(ORDEN))
    montar('/compras/10', <CompraDetalle puedeRecibir={false} />)
    await screen.findByText(/OC-000010/)
    expect(screen.queryByRole('button', { name: /Recibir mercadería/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirmar recepción' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Agregar línea' })).toBeTruthy()
    // La recepción en borrador se sigue LEYENDO: está en la tabla de recepciones.
    expect(screen.getByText('#40')).toBeTruthy()
  })

  it('🔴 el depósito de VentaLibra (las dos en false) lee la orden sin ningún botón de escritura', async () => {
    responder(respuestasDelDetalle(sinCostos(ORDEN)))
    montar('/compras/10', <CompraDetalle puedeEscribir={false} puedeRecibir={false} />)
    await screen.findByText(/OC-000010/)
    const botones = screen.queryAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))
    expect(botones).toEqual([])
    expect(screen.getByRole('link', { name: /Volver/ })).toBeTruthy()
    expect(pedidas().filter((p) => !p.startsWith('GET '))).toEqual([])
  })
})

describe('CompraDetalle: la orden llega sin costos', () => {
  it('🔴 las líneas no tienen «Costo unitario» ni «Subtotal» y no dicen «NaN»', async () => {
    responder(respuestasDelDetalle(sinCostos(ORDEN)))
    montar('/compras/10', <CompraDetalle puedeEscribir={false} puedeRecibir={false} />)
    await screen.findByText(/OC-000010/)
    expect(screen.queryByRole('columnheader', { name: 'Costo unitario' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Subtotal' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Pendiente' })).toBeTruthy()
    expect(screen.getByText('Yerba 1kg')).toBeTruthy()
    expect(textoDeLaPantalla()).not.toMatch(/NaN/)
    expect(textoDeLaPantalla()).not.toContain('$')
  })

  it('«Sin líneas todavía.» ocupa todas las columnas que hay (4 sin costos, 6 con ellos)', async () => {
    responder(respuestasDelDetalle({ ...ORDEN, items: [] }))
    montar('/compras/10', <CompraDetalle />)
    const vacio = await screen.findByText('Sin líneas todavía.')
    expect(vacio.getAttribute('colspan')).toBe('6')
  })

  it('el control — con los costos están las dos columnas y los importes', async () => {
    responder(respuestasDelDetalle(ORDEN))
    montar('/compras/10', <CompraDetalle />)
    await screen.findByText(/OC-000010/)
    expect(screen.getByRole('columnheader', { name: 'Costo unitario' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Subtotal' })).toBeTruthy()
    expect(screen.getByText('$900,00')).toBeTruthy()
    expect(screen.getByText('$9.000,00')).toBeTruthy()
  })

  it('🔴 recibir con la orden sin costos: el diálogo no pide un costo que no hay y no manda `unit_cost`', async () => {
    responder(respuestasDelDetalle(sinCostos(ORDEN)))
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    await screen.findByText(/OC-000010/)
    await user.click(screen.getByRole('button', { name: /Recibir mercadería/ }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).queryByRole('columnheader', { name: 'Costo unitario' })).toBeNull()
    expect(within(dialogo).queryByLabelText(/Costo unitario de/)).toBeNull()
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    await screen.findByText(/OC-000010/)
    expect(cuerpoDe('POST /api/purchase-receipts/recibir').items).toEqual([{ item_id: 1, quantity: '10' }])
  })
})

// ── ListaPrecioDetalle ───────────────────────────────────────────────────

const MAYORISTA: ListaPrecio = { id: 1, nombre: 'Mayorista', descripcion: '', activa: 1, es_default: 0 }
const FIDEOS: ItemListaPrecio = { id: 9, codigo: 'F1', nombre: 'Fideos', unidad: 'u', categoria: 'Almacén', precio_venta: 100, precio_costo: 60, precio_lista: 90, en_lista: 1 }
const ARROZ: ItemListaPrecio = { ...FIDEOS, id: 10, codigo: null, nombre: 'Arroz', precio_lista: 0, en_lista: 0 }
const sinPrecioDeCosto = (i: ItemListaPrecio): ItemListaPrecio => { const { precio_costo, ...resto } = i; void precio_costo; return resto as ItemListaPrecio }
const LISTA = { '/api/listas-precio': [MAYORISTA], '/api/productos/categorias': [], '/api/listas-precio/1/items': [FIDEOS, ARROZ] }

// `ListaPrecioDetalle` lee su id de la ruta.
async function abrirLista(tabla: Record<string, unknown>) {
  responder(tabla)
  render(
    <MemoryRouter initialEntries={['/listas-precio/1']}>
      <Routes><Route path="/listas-precio/:id" element={<ListaPrecioDetalle />} /></Routes>
    </MemoryRouter>,
  )
  await screen.findByText('Fideos')
}

describe('ListaPrecioDetalle: los productos llegan sin precio de costo', () => {
  it('🔴 no hay columnas «P. Costo» ni «Margen» y no dice «NaN»', async () => {
    await abrirLista({ ...LISTA, '/api/listas-precio/1/items': [sinPrecioDeCosto(FIDEOS), sinPrecioDeCosto(ARROZ)] })
    expect(screen.queryByRole('columnheader', { name: 'P. Costo' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Margen' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'P. Venta' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Precio lista' })).toBeTruthy()
    expect(textoDeLaPantalla()).not.toMatch(/NaN/)
  })

  it('el control — con el costo están las dos columnas, el costo y el margen', async () => {
    await abrirLista(LISTA)
    expect(screen.getByRole('columnheader', { name: 'P. Costo' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Margen' })).toBeTruthy()
    expect(screen.getAllByText(/\$\s60,00/).length).toBeGreaterThan(0)
    expect(screen.getByText('50.0%')).toBeTruthy()
  })
})

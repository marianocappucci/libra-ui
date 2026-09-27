// Compras: órdenes y recepciones (F9 de VentaLibra, 2026-09-27) — el único
// producto de la familia con este módulo, ver el docstring de `tipos.ts`.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Compras } from '../src/comercio/Compras'
import { CompraDetalle } from '../src/comercio/CompraDetalle'
import type { Deposito, Producto, Proveedor, PurchaseOrder, PurchaseReceipt } from '../src/comercio/tipos'
import { cuerpoDe, elegirEnBuscable, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const PROVEEDOR: Proveedor = { id: 1, nombre: 'Distribuidora SA', cuit_dni: '30-1', email: '', phone: '', address: '', iva_condition: '' }
const PRODUCTO: Producto = {
  id: 1, codigo: 'Y001', nombre: 'Yerba 1kg', descripcion: '', precio_venta: 1500, precio_costo: 900,
  unidad: 'kg', categoria: '', stock_minimo: 0, estacion: '', vendible: 1, activo: 1, tipo: 'producto',
}
const DEPOSITO: Deposito = { id: 1, nombre: 'Central', descripcion: '', es_default: 1, activo: 1 }

const ORDEN_VACIA: PurchaseOrder = { id: 10, number: 'OC-000001', proveedor_id: 1, status: 'draft', items: [], is_fully_received: false }
const LINEA = { item_id: 1, quantity_ordered: '10', quantity_received: '0', pending_quantity: '10', unit_cost: '900', tax_rate: '0', subtotal: '9000' }
const ORDEN_CON_LINEA: PurchaseOrder = { ...ORDEN_VACIA, status: 'sent', items: [LINEA] }
const ORDEN_RECIBIDA: PurchaseOrder = { ...ORDEN_CON_LINEA, status: 'received', items: [{ ...LINEA, quantity_received: '10', pending_quantity: '0' }], is_fully_received: true }

beforeEach(() => {
  cleanup()
  prepararFetch()
})

describe('Compras', () => {
  it('lista, crea y navega al detalle', async () => {
    const nueva: PurchaseOrder = { id: 11, number: 'OC-000002', proveedor_id: 1, status: 'draft', items: [], is_fully_received: false }
    responder({
      '/api/purchase-orders': [ORDEN_VACIA],
      '/api/proveedores': [PROVEEDOR],
      'POST /api/purchase-orders': nueva,
    })
    const user = userEvent.setup()
    montar('/compras', <Compras />)
    expect(await screen.findByText('OC-000001')).toBeTruthy()
    expect(screen.getByText('Distribuidora SA')).toBeTruthy()
    expect(screen.getByText('Borrador')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Nueva compra/ }))
    const dialogo = screen.getByRole('dialog')
    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Proveedor' }), /Distribuidora SA/)
    await user.click(within(dialogo).getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(cuerpoDe('POST /api/purchase-orders')).toEqual({ proveedor_id: 1 }))
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/compras/11'))
  })

  it('la caída de red se avisa', async () => {
    responder({ '/api/purchase-orders': '!caida' })
    montar('/compras', <Compras />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

describe('CompraDetalle', () => {
  it('agrega una línea, recibe mercadería completa y confirma una recepción suelta', async () => {
    const recepcionSuelta: PurchaseReceipt = {
      id: 40, proveedor_id: 1, purchase_order_id: null, status: 'draft',
      items: [{ item_id: 1, quantity: '3', unit_cost: '900', lot_code: null, expires_at: null }],
      received_at: null, document_reference: null,
    }
    const recepcionCreada: PurchaseReceipt = {
      id: 50, proveedor_id: 1, purchase_order_id: 10, status: 'draft', items: [], received_at: null, document_reference: null,
    }
    const recepcionConfirmada: PurchaseReceipt = { ...recepcionCreada, status: 'confirmed', received_at: '2026-09-27T12:00:00' }

    let orden = ORDEN_VACIA
    let recepciones = [recepcionSuelta]
    responder({
      '/api/purchase-orders/10': () => orden,
      '/api/productos?solo_activos=true': [PRODUCTO],
      '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO],
      '/api/purchase-receipts?purchase_order_id=10': () => recepciones,
      'POST /api/purchase-orders/10/items': () => { orden = ORDEN_CON_LINEA; return orden },
      'POST /api/purchase-receipts': recepcionCreada,
      'POST /api/purchase-receipts/50/items': { ...recepcionCreada, items: [{ item_id: 1, quantity: '10', unit_cost: '900', lot_code: null, expires_at: null }] },
      'POST /api/purchase-receipts/50/confirm': () => { recepciones = [recepcionSuelta, recepcionConfirmada]; return recepcionConfirmada },
      'POST /api/purchase-receipts/40/confirm': () => { recepciones = [{ ...recepcionSuelta, status: 'confirmed' }]; return { ...recepcionSuelta, status: 'confirmed' } },
    })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    expect(await screen.findByText(/OC-000001/)).toBeTruthy()
    expect(screen.getByText('Sin líneas todavía.')).toBeTruthy()

    // Agregar línea: los defaults son cantidad 1 y costo 0.
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba 1kg/)
    await user.click(screen.getByRole('button', { name: 'Agregar línea' }))
    await waitFor(() => expect(cuerpoDe('POST /api/purchase-orders/10/items')).toEqual({ item_id: 1, quantity_ordered: '1', unit_cost: '0' }))
    expect(await screen.findByRole('button', { name: /Recibir mercadería/ })).toBeTruthy()

    // Recibir mercadería: la cantidad pendiente y el costo vienen precargados.
    await user.click(screen.getByRole('button', { name: /Recibir mercadería/ }))
    const recibir = screen.getByRole('dialog')
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
    expect(cuerpoDe('POST /api/purchase-receipts')).toEqual({ proveedor_id: 1, purchase_order_id: 10, document_reference: null })
    expect(cuerpoDe('POST /api/purchase-receipts/50/items')).toEqual({ item_id: 1, quantity: '10', unit_cost: '900' })
    expect(cuerpoDe('POST /api/purchase-receipts/50/confirm')).toEqual({ deposito_id: 1 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // La recepción suelta (ajena a esta orden) ofrece su propio "Confirmar".
    expect(await screen.findByText('Confirmada')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))
    const confirmar = screen.getByRole('dialog')
    await user.click(within(confirmar).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(cuerpoDe('POST /api/purchase-receipts/40/confirm')).toEqual({ deposito_id: 1 }))
  })

  it('una orden recibida no ofrece agregar línea ni recibir; la caída de red se avisa', async () => {
    responder({
      '/api/purchase-orders/10': ORDEN_RECIBIDA,
      '/api/productos?solo_activos=true': [PRODUCTO],
      '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO],
      '/api/purchase-receipts?purchase_order_id=10': [],
    })
    montar('/compras/10', <CompraDetalle />)
    expect(await screen.findByText('Recibida')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Recibir mercadería/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Agregar línea' })).toBeNull()

    cleanup()
    prepararFetch()
    responder({ '/api/purchase-orders/10': '!caida' })
    montar('/compras/10', <CompraDetalle />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

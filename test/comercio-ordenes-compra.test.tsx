// Compras: órdenes y recepciones (F9 de VentaLibra, 2026-09-27) — el único
// producto de la familia con este módulo, ver el docstring de `tipos.ts`.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Compras } from '../src/comercio/Compras'
import { CompraDetalle } from '../src/comercio/CompraDetalle'
import type { Deposito, Producto, Proveedor, PurchaseOrder, PurchaseReceipt } from '../src/comercio/tipos'
import { cuerpoDe, elegirEnBuscable, fetchMock, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

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

// ── Carga de vencimientos (0.92.0, K-1): lote y vencimiento por línea al recibir ────────────────────────────────────────────
describe('CompraDetalle: recibir mercadería con lote y vencimiento', () => {
  const LECHE: Producto = { ...PRODUCTO, id: 2, codigo: 'L002', nombre: 'Leche', unidad: 'u', vence: true }
  const SAL: Producto = { ...PRODUCTO, id: 3, codigo: 'S003', nombre: 'Sal', unidad: 'kg', vence: false }
  const linea = (item_id: number, pendiente = '10') => ({ ...LINEA, item_id, quantity_ordered: pendiente, pending_quantity: pendiente })
  // Yerba (sin `vence` en la respuesta: un producto que no usa vencimientos), Leche (vence) y Sal (vence: false).
  const ORDEN_TRES: PurchaseOrder = { ...ORDEN_CON_LINEA, items: [linea(1), linea(2, '6'), linea(3, '4')] }
  const RECEPCION: PurchaseReceipt = { id: 50, proveedor_id: 1, purchase_order_id: 10, status: 'draft', items: [], received_at: null, document_reference: null }
  const RUTAS_ITEMS = '/api/purchase-receipts/50/items'

  function base(extra: Record<string, unknown> = {}, productos: Producto[] = [PRODUCTO, LECHE, SAL]) {
    responder({
      '/api/purchase-orders/10': ORDEN_TRES,
      '/api/productos?solo_activos=true': productos,
      '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO],
      '/api/purchase-receipts?purchase_order_id=10': [],
      'POST /api/purchase-receipts': RECEPCION,
      [`POST ${RUTAS_ITEMS}`]: RECEPCION,
      'POST /api/purchase-receipts/50/confirm': { ...RECEPCION, status: 'confirmed' },
      ...extra,
    })
  }
  async function abrirRecibir(user: ReturnType<typeof userEvent.setup>) {
    montar('/compras/10', <CompraDetalle />)
    await user.click(await screen.findByRole('button', { name: /Recibir mercadería/ }))
    return screen.getByRole('dialog')
  }
  const enviosDeLineas = () => pedidas().map((p, i) => ({ p, i })).filter(({ p }) => p === `POST ${RUTAS_ITEMS}`)
    .map(({ i }) => JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body)) as Record<string, unknown>)

  it('los campos «Lote» y «Vencimiento» aparecen sólo en las líneas de productos que vencen (vence === true): ni sin `vence` ni con vence: false', async () => {
    base()
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    expect(within(recibir).getByLabelText('Lote de Leche')).toBeTruthy()
    const fecha = within(recibir).getByLabelText('Vencimiento de Leche') as HTMLInputElement
    // El tipo nativo: la validación de una fecha imposible (31/02) es del propio input.
    expect(fecha.type).toBe('date')
    expect(within(recibir).queryByLabelText('Lote de Yerba 1kg')).toBeNull()
    expect(within(recibir).queryByLabelText('Vencimiento de Yerba 1kg')).toBeNull()
    expect(within(recibir).queryByLabelText('Lote de Sal')).toBeNull()
    expect(within(recibir).queryByLabelText('Vencimiento de Sal')).toBeNull()
    expect(within(recibir).getAllByLabelText(/^Lote de /)).toHaveLength(1)
  })

  it('un producto que no vence no cambia nada: el modal y el cuerpo de la línea son los de siempre (sin lot_code ni expires_at)', async () => {
    responder({
      '/api/purchase-orders/10': ORDEN_CON_LINEA, '/api/productos?solo_activos=true': [PRODUCTO], '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO], '/api/purchase-receipts?purchase_order_id=10': [], 'POST /api/purchase-receipts': RECEPCION,
      [`POST ${RUTAS_ITEMS}`]: RECEPCION, 'POST /api/purchase-receipts/50/confirm': { ...RECEPCION, status: 'confirmed' },
    })
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    expect(within(recibir).queryByText('Lote')).toBeNull()
    expect(within(recibir).queryByText('Vencimiento')).toBeNull()
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
    expect(cuerpoDe(`POST ${RUTAS_ITEMS}`)).toEqual({ item_id: 1, quantity: '10', unit_cost: '900' })
  })

  it('un producto que vence con los dos campos vacíos también se recibe como hoy (sin lot_code ni expires_at)', async () => {
    base()
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
    expect(enviosDeLineas()).toEqual([
      { item_id: 1, quantity: '10', unit_cost: '900' },
      { item_id: 2, quantity: '6', unit_cost: '900' },
      { item_id: 3, quantity: '4', unit_cost: '900' },
    ])
  })

  it('con lote y vencimiento la línea lleva lot_code y expires_at (ISO aaaa-mm-dd, lote sin espacios) y sólo la del producto que vence', async () => {
    base()
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    fireEvent.change(within(recibir).getByLabelText('Lote de Leche'), { target: { value: '  L-0930 ' } })
    fireEvent.change(within(recibir).getByLabelText('Vencimiento de Leche'), { target: { value: '2026-12-31' } })
    // Las cantidades y los costos se siguen pudiendo cambiar y viajan.
    fireEvent.change(within(recibir).getByLabelText('Cantidad a recibir de Leche'), { target: { value: '5' } })
    fireEvent.change(within(recibir).getByLabelText('Costo unitario de Leche'), { target: { value: '120.5' } })
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
    expect(enviosDeLineas()).toEqual([
      { item_id: 1, quantity: '10', unit_cost: '900' },
      { item_id: 2, quantity: '5', unit_cost: '120.5', lot_code: 'L-0930', expires_at: '2026-12-31' },
      { item_id: 3, quantity: '4', unit_cost: '900' },
    ])
    expect(cuerpoDe('POST /api/purchase-receipts/50/confirm')).toEqual({ deposito_id: 1 })
  })

  it('o los dos o ninguno: un lote sin fecha o una fecha sin lote avisa, deshabilita «Recibir» y no manda nada', async () => {
    base()
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    const AVISO = 'Completá el lote y el vencimiento, o dejá los dos vacíos.'
    const recibirBtn = () => within(recibir).getByRole('button', { name: 'Recibir' }) as HTMLButtonElement
    expect(recibirBtn().disabled).toBe(false)

    fireEvent.change(within(recibir).getByLabelText('Lote de Leche'), { target: { value: 'L-1' } })
    expect((await within(recibir).findByRole('alert')).textContent).toBe(AVISO)
    expect(recibirBtn().disabled).toBe(true)
    await user.click(recibirBtn())
    expect(pedidas()).not.toContain('POST /api/purchase-receipts')

    fireEvent.change(within(recibir).getByLabelText('Lote de Leche'), { target: { value: '   ' } })
    expect(within(recibir).queryByRole('alert')).toBeNull()
    expect(recibirBtn().disabled).toBe(false)

    fireEvent.change(within(recibir).getByLabelText('Vencimiento de Leche'), { target: { value: '2026-12-31' } })
    expect(within(recibir).getByRole('alert').textContent).toBe(AVISO)
    expect(recibirBtn().disabled).toBe(true)

    // Completando el par, se habilita.
    fireEvent.change(within(recibir).getByLabelText('Lote de Leche'), { target: { value: 'L-1' } })
    expect(within(recibir).queryByRole('alert')).toBeNull()
    expect(recibirBtn().disabled).toBe(false)
    expect(pedidas()).not.toContain('POST /api/purchase-receipts')
  })

  it('una fecha imposible o a medio escribir (el input nativo entrega vacío con badInput) se avisa aparte y bloquea', async () => {
    base()
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    fireEvent.change(within(recibir).getByLabelText('Lote de Leche'), { target: { value: 'L-1' } })
    const fecha = within(recibir).getByLabelText('Vencimiento de Leche') as HTMLInputElement
    Object.defineProperty(fecha, 'validity', { configurable: true, value: { badInput: true } })
    fireEvent.change(fecha, { target: { value: '2026-12-31' } })
    expect(within(recibir).getByRole('alert').textContent).toBe('La fecha de vencimiento no es válida.')
    expect((within(recibir).getByRole('button', { name: 'Recibir' }) as HTMLButtonElement).disabled).toBe(true)

    Object.defineProperty(fecha, 'validity', { configurable: true, value: { badInput: false } })
    fireEvent.change(fecha, { target: { value: '2026-12-30' } })
    expect(within(recibir).queryByRole('alert')).toBeNull()
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
    expect(enviosDeLineas()[1]).toEqual({ item_id: 2, quantity: '6', unit_cost: '900', lot_code: 'L-1', expires_at: '2026-12-30' })
  })

  it('una línea que no se recibe (cantidad 0) no exige ni manda lote y vencimiento', async () => {
    base()
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    fireEvent.change(within(recibir).getByLabelText('Lote de Leche'), { target: { value: 'L-1' } })
    expect(within(recibir).getByRole('alert')).toBeTruthy()
    fireEvent.change(within(recibir).getByLabelText('Cantidad a recibir de Leche'), { target: { value: '0' } })
    expect(within(recibir).queryByRole('alert')).toBeNull()
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
    expect(enviosDeLineas().map((l) => l.item_id)).toEqual([1, 3])
  })

  it('hay UNA sola consulta de productos: abrir el modal (y las líneas que vencen) no agrega ninguna', async () => {
    base()
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    await screen.findByText(/OC-000001/)
    const antes = pedidas().filter((p) => p.includes('/api/productos')).length
    expect(antes).toBe(1)
    await user.click(screen.getByRole('button', { name: /Recibir mercadería/ }))
    expect(screen.getByLabelText('Lote de Leche')).toBeTruthy()
    expect(pedidas().filter((p) => p.includes('/api/productos'))).toHaveLength(1)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: /Recibir mercadería/ }))
    expect(pedidas().filter((p) => p.includes('/api/productos'))).toHaveLength(1)
  })

  it('una recepción cortada a mitad sigue igual: el error se ve, la recepción queda en borrador, sin confirmar, y las líneas ya enviadas llevaron su lote', async () => {
    let n = 0
    base({
      [`POST ${RUTAS_ITEMS}`]: () => { n += 1; return n === 3 ? { status: 409, detail: 'la recepción ya no admite líneas' } : RECEPCION },
      '/api/purchase-receipts?purchase_order_id=10': [{ ...RECEPCION, items: [{ item_id: 1, quantity: '10', unit_cost: '900', lot_code: null, expires_at: null }] }],
    })
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    fireEvent.change(within(recibir).getByLabelText('Lote de Leche'), { target: { value: 'L-1' } })
    fireEvent.change(within(recibir).getByLabelText('Vencimiento de Leche'), { target: { value: '2026-12-31' } })
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    expect(await within(recibir).findByText('la recepción ya no admite líneas')).toBeTruthy()
    expect(pedidas()).not.toContain('POST /api/purchase-receipts/50/confirm')
    expect(enviosDeLineas()[1]).toMatchObject({ item_id: 2, lot_code: 'L-1', expires_at: '2026-12-31' })
    // El diálogo sigue abierto con lo tipeado y la recepción en borrador aparece en «Recepciones de esta orden».
    expect((within(recibir).getByLabelText('Lote de Leche') as HTMLInputElement).value).toBe('L-1')
    expect(await screen.findByText('Borrador')).toBeTruthy()
  })

  describe('un producto de la orden que no está en la lista de activos (vencimiento desconocido)', () => {
    const DESCONOCIDO = 4 // una línea de un producto desactivado: `solo_activos=true` no lo trae
    const ORDEN_CON_DESACTIVADO: PurchaseOrder = { ...ORDEN_CON_LINEA, items: [linea(1), linea(DESCONOCIDO, '5')] }
    const AYUDA = 'No pudimos saber si este producto vence; si vence, cargá lote y vencimiento.'

    function con(productos: Producto[]) {
      base({ '/api/purchase-orders/10': ORDEN_CON_DESACTIVADO }, productos)
    }

    it('con un backend que maneja `vence` se ofrecen «Lote» y «Vencimiento» (opcionales, con su ayuda); los conocidos que no vencen, nada', async () => {
      con([{ ...PRODUCTO, vence: false }, LECHE])
      const user = userEvent.setup()
      const recibir = await abrirRecibir(user)
      expect(within(recibir).getByLabelText('Lote de #4')).toBeTruthy()
      expect((within(recibir).getByLabelText('Vencimiento de #4') as HTMLInputElement).type).toBe('date')
      expect(within(recibir).getAllByText(AYUDA)).toHaveLength(1)
      expect(within(recibir).queryByLabelText('Lote de Yerba 1kg')).toBeNull()
      // Vacíos: se recibe como hoy.
      await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
      await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
      expect(enviosDeLineas()).toEqual([
        { item_id: 1, quantity: '10', unit_cost: '900' },
        { item_id: 4, quantity: '5', unit_cost: '900' },
      ])
    })

    it('rige «ambos o ninguno» y con el par completo viajan lot_code y expires_at', async () => {
      con([{ ...PRODUCTO, vence: false }, LECHE])
      const user = userEvent.setup()
      const recibir = await abrirRecibir(user)
      fireEvent.change(within(recibir).getByLabelText('Vencimiento de #4'), { target: { value: '2026-11-30' } })
      expect(within(recibir).getByRole('alert').textContent).toBe('Completá el lote y el vencimiento, o dejá los dos vacíos.')
      expect((within(recibir).getByRole('button', { name: 'Recibir' }) as HTMLButtonElement).disabled).toBe(true)
      fireEvent.change(within(recibir).getByLabelText('Lote de #4'), { target: { value: 'D-9' } })
      await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
      await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
      expect(enviosDeLineas()[1]).toEqual({ item_id: 4, quantity: '5', unit_cost: '900', lot_code: 'D-9', expires_at: '2026-11-30' })
    })

    it('un backend SIN `vence` (ningún producto de la lista lo trae) no cambia nada: ni campos ni ayuda para los que faltan en la lista', async () => {
      con([PRODUCTO, { ...PRODUCTO, id: 2, nombre: 'Leche', codigo: 'L002' }])
      const user = userEvent.setup()
      const recibir = await abrirRecibir(user)
      expect(within(recibir).queryByLabelText(/^Lote de /)).toBeNull()
      expect(within(recibir).queryByText(AYUDA)).toBeNull()
      await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
      await waitFor(() => expect(pedidas()).toContain('POST /api/purchase-receipts/50/confirm'))
      expect(enviosDeLineas()).toEqual([
        { item_id: 1, quantity: '10', unit_cost: '900' },
        { item_id: 4, quantity: '5', unit_cost: '900' },
      ])
    })

    it('con la lista de productos vacía (no hay de dónde saber si el backend maneja `vence`) tampoco se ofrecen', async () => {
      con([])
      const user = userEvent.setup()
      const recibir = await abrirRecibir(user)
      expect(within(recibir).queryByLabelText(/^Lote de /)).toBeNull()
      expect(within(recibir).queryByText(AYUDA)).toBeNull()
    })

    it('los productos que están en la lista con vence:false nunca muestran la ayuda, aunque haya otros desconocidos', async () => {
      con([{ ...PRODUCTO, vence: false }, LECHE])
      const user = userEvent.setup()
      const recibir = await abrirRecibir(user)
      expect(within(recibir).getAllByText(AYUDA)).toHaveLength(1)
      expect(within(recibir).queryByLabelText('Vencimiento de Yerba 1kg')).toBeNull()
    })
  })
})


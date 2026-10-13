// Compras: órdenes y recepciones (F9 de VentaLibra, 2026-09-27) — el único
// producto de la familia con este módulo, ver el docstring de `tipos.ts`.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Compras } from '../src/comercio/Compras'
import { CompraDetalle } from '../src/comercio/CompraDetalle'
import { _reiniciarRecepcionesEnMemoria } from '../src/comercio/recepcion-pendiente'
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

const RECIBIR = 'POST /api/purchase-receipts/recibir'

beforeEach(() => {
  cleanup()
  prepararFetch()
  _reiniciarRecepcionesEnMemoria()
  sessionStorage.clear()
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
    const recepcionConfirmada: PurchaseReceipt = {
      id: 50, proveedor_id: 1, purchase_order_id: 10, status: 'confirmed',
      items: [{ item_id: 1, quantity: '10', unit_cost: '900', lot_code: null, expires_at: null }], received_at: '2026-09-27T12:00:00', document_reference: null,
    }

    let orden = ORDEN_VACIA
    let recepciones = [recepcionSuelta]
    responder({
      '/api/purchase-orders/10': () => orden,
      '/api/productos?solo_activos=true': [PRODUCTO],
      '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO],
      '/api/purchase-receipts?purchase_order_id=10': () => recepciones,
      'POST /api/purchase-orders/10/items': () => { orden = ORDEN_CON_LINEA; return orden },
      [RECIBIR]: () => { recepciones = [recepcionSuelta, recepcionConfirmada]; return { ...recepcionConfirmada, repetida: false } },
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
    await waitFor(() => expect(pedidas()).toContain(RECIBIR))
    // Una sola llamada con la recepción entera y la clave del intento (no las tres de antes: crear, cargar líneas, confirmar).
    expect(cuerpoDe(RECIBIR)).toEqual({
      proveedor_id: 1, purchase_order_id: 10, document_reference: null, deposito_id: 1,
      clave_operacion: expect.stringMatching(/^[0-9a-f-]{36}$/), items: [{ item_id: 1, quantity: '10', unit_cost: '900' }],
    })
    expect(pedidas().filter((p) => p.startsWith('POST /api/purchase-receipts'))).toEqual([RECIBIR])
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

  it('las cantidades se leen como cantidades: el «6.0» del motor sale «6», y una fracción con coma', async () => {
    const decimales = { ...LINEA, quantity_ordered: '6.0', quantity_received: '1.5', pending_quantity: '4.5' }
    responder({
      '/api/purchase-orders/10': { ...ORDEN_CON_LINEA, items: [decimales] },
      '/api/productos?solo_activos=true': [PRODUCTO],
      '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO],
      '/api/purchase-receipts?purchase_order_id=10': [],
    })
    montar('/compras/10', <CompraDetalle />)
    const fila = (await screen.findAllByText('Yerba 1kg'))[0].closest('tr') as HTMLElement
    const celdas = within(fila).getAllByRole('cell').map((c) => c.textContent)
    expect(celdas.slice(1, 4)).toEqual(['6', '1,5', '4,5'])
    expect(fila.textContent).not.toContain('6.0')

    await userEvent.click(screen.getByRole('button', { name: /Recibir mercadería/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('4,5')).toBeTruthy()
    // El campo editable arranca con lo pendiente, con punto decimal (es lo que se parsea), sin el «.0» sobrante.
    expect((within(dialogo).getByLabelText(/Cantidad a recibir de Yerba 1kg/) as HTMLInputElement).value).toBe('4.5')
  })
})

// ── Carga de vencimientos (0.92.0, K-1): lote y vencimiento por línea al recibir ────────────────────────────────────────────
describe('CompraDetalle: recibir mercadería con lote y vencimiento', () => {
  const LECHE: Producto = { ...PRODUCTO, id: 2, codigo: 'L002', nombre: 'Leche', unidad: 'u', vence: true }
  const SAL: Producto = { ...PRODUCTO, id: 3, codigo: 'S003', nombre: 'Sal', unidad: 'kg', vence: false }
  const linea = (item_id: number, pendiente = '10') => ({ ...LINEA, item_id, quantity_ordered: pendiente, pending_quantity: pendiente })
  // Yerba (sin `vence` en la respuesta: un producto que no usa vencimientos), Leche (vence) y Sal (vence: false).
  const ORDEN_TRES: PurchaseOrder = { ...ORDEN_CON_LINEA, items: [linea(1), linea(2, '6'), linea(3, '4')] }
  const RECEPCION: PurchaseReceipt = { id: 50, proveedor_id: 1, purchase_order_id: 10, status: 'confirmed', items: [], received_at: '2026-09-27T12:00:00', document_reference: null }

  function base(extra: Record<string, unknown> = {}, productos: Producto[] = [PRODUCTO, LECHE, SAL]) {
    responder({
      '/api/purchase-orders/10': ORDEN_TRES,
      '/api/productos?solo_activos=true': productos,
      '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO],
      '/api/purchase-receipts?purchase_order_id=10': [],
      [RECIBIR]: { ...RECEPCION, repetida: false },
      ...extra,
    })
  }
  async function abrirRecibir(user: ReturnType<typeof userEvent.setup>) {
    montar('/compras/10', <CompraDetalle />)
    await user.click(await screen.findByRole('button', { name: /Recibir mercadería/ }))
    return screen.getByRole('dialog')
  }
  /** Las líneas de la (única) recepción que se mandó. */
  const enviosDeLineas = () => (cuerpoDe(RECIBIR).items as Record<string, unknown>[])

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
      '/api/depositos': [DEPOSITO], '/api/purchase-receipts?purchase_order_id=10': [], [RECIBIR]: { ...RECEPCION, repetida: false },
    })
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    expect(within(recibir).queryByText('Lote')).toBeNull()
    expect(within(recibir).queryByText('Vencimiento')).toBeNull()
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(pedidas()).toContain(RECIBIR))
    expect(enviosDeLineas()).toEqual([{ item_id: 1, quantity: '10', unit_cost: '900' }])
  })

  it('un producto que vence con los dos campos vacíos también se recibe como hoy (sin lot_code ni expires_at)', async () => {
    base()
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(pedidas()).toContain(RECIBIR))
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
    await waitFor(() => expect(pedidas()).toContain(RECIBIR))
    expect(enviosDeLineas()).toEqual([
      { item_id: 1, quantity: '10', unit_cost: '900' },
      { item_id: 2, quantity: '5', unit_cost: '120.5', lot_code: 'L-0930', expires_at: '2026-12-31' },
      { item_id: 3, quantity: '4', unit_cost: '900' },
    ])
    expect(cuerpoDe(RECIBIR)).toMatchObject({ deposito_id: 1 })
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
    expect(pedidas()).not.toContain(RECIBIR)

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
    expect(pedidas()).not.toContain(RECIBIR)
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
    await waitFor(() => expect(pedidas()).toContain(RECIBIR))
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
    await waitFor(() => expect(pedidas()).toContain(RECIBIR))
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

  it('un rechazo del motor se ve, no queda nada pendiente y el diálogo sigue abierto con lo tipeado (ya no hay recepción a medias: es una sola transacción)', async () => {
    base({
      [RECIBIR]: { status: 422, detail: 'el producto 2 no existe' },
      '/api/purchase-receipts?purchase_order_id=10': [],
    })
    const user = userEvent.setup()
    const recibir = await abrirRecibir(user)
    fireEvent.change(within(recibir).getByLabelText('Lote de Leche'), { target: { value: 'L-1' } })
    fireEvent.change(within(recibir).getByLabelText('Vencimiento de Leche'), { target: { value: '2026-12-31' } })
    await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
    expect(await within(recibir).findByText('el producto 2 no existe')).toBeTruthy()
    expect(enviosDeLineas()[1]).toMatchObject({ item_id: 2, lot_code: 'L-1', expires_at: '2026-12-31' })
    expect(pedidas().filter((p) => p.startsWith('POST /api/purchase-receipts'))).toEqual([RECIBIR])
    // El diálogo sigue abierto con lo tipeado, sin ofrecer reenviar nada: el 422 dice que no se escribió.
    expect((within(recibir).getByLabelText('Lote de Leche') as HTMLInputElement).value).toBe('L-1')
    expect(within(recibir).queryByRole('button', { name: 'Reenviar el intento anterior' })).toBeNull()
    expect(sessionStorage.getItem('libra-ui:compras:recepciones-pendientes')).toBe('{}')
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
      await waitFor(() => expect(pedidas()).toContain(RECIBIR))
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
      await waitFor(() => expect(pedidas()).toContain(RECIBIR))
      expect(enviosDeLineas()[1]).toEqual({ item_id: 4, quantity: '5', unit_cost: '900', lot_code: 'D-9', expires_at: '2026-11-30' })
    })

    it('un backend SIN `vence` (ningún producto de la lista lo trae) no cambia nada: ni campos ni ayuda para los que faltan en la lista', async () => {
      con([PRODUCTO, { ...PRODUCTO, id: 2, nombre: 'Leche', codigo: 'L002' }])
      const user = userEvent.setup()
      const recibir = await abrirRecibir(user)
      expect(within(recibir).queryByLabelText(/^Lote de /)).toBeNull()
      expect(within(recibir).queryByText(AYUDA)).toBeNull()
      await user.click(within(recibir).getByRole('button', { name: 'Recibir' }))
      await waitFor(() => expect(pedidas()).toContain(RECIBIR))
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


// ── Idempotencia de «Recibir mercadería» (ADR-045): una clave por intento, y el intento incierto guardado ─────────────────
describe('CompraDetalle: recibir mercadería no se duplica en un reintento (clave_operacion)', () => {
  const RECEPCION: PurchaseReceipt = {
    id: 50, proveedor_id: 1, purchase_order_id: 10, status: 'confirmed',
    items: [{ item_id: 1, quantity: '10', unit_cost: '900', lot_code: null, expires_at: null }], received_at: '2026-09-27T12:00:00', document_reference: null,
  }
  const BOTON_REENVIAR = { name: 'Reenviar el intento anterior' }
  const claveDe = (i: number) => (JSON.parse(String((fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')[i][1] as RequestInit).body)) as { clave_operacion: string }).clave_operacion
  const intentos = () => pedidas().filter((p) => p === RECIBIR).length

  function base(extra: Record<string, unknown> = {}) {
    responder({
      '/api/purchase-orders/10': ORDEN_CON_LINEA,
      '/api/productos?solo_activos=true': [PRODUCTO],
      '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO],
      '/api/purchase-receipts?purchase_order_id=10': [],
      [RECIBIR]: { ...RECEPCION, repetida: false },
      ...extra,
    })
  }
  async function abrir(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /Recibir mercadería/ }))
    return screen.getByRole('dialog')
  }
  /** Un envío que se corta sin respuesta la primera vez y después contesta lo que se le diga. */
  function cortaUnaVez(despues: unknown) {
    let n = 0
    return () => { n += 1; return n === 1 ? '!caida' : despues }
  }

  it('cada intento manda una clave nueva (un UUID): dos recepciones legítimas seguidas no comparten clave', async () => {
    base()
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    const dialogo = await abrir(user)
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const primera = claveDe(0)
    expect(primera).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

    const otro = await abrir(user)
    await user.click(within(otro).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(intentos()).toBe(2))
    expect(claveDe(1)).not.toBe(primera)
  })

  it('si se corta sin respuesta NO se sabe si llegó: avisa, guarda el intento y ofrece reenviarlo; al reenviar va la MISMA clave y el MISMO cuerpo', async () => {
    base({ [RECIBIR]: cortaUnaVez({ ...RECEPCION, repetida: true }) })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    const dialogo = await abrir(user)
    fireEvent.change(within(dialogo).getByLabelText('Cantidad a recibir de Yerba 1kg'), { target: { value: '7' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))

    expect(await within(dialogo).findByText(/No se sabe si se llegó a registrar/)).toBeTruthy()
    expect(within(dialogo).getByRole('status').textContent).toMatch(/intento anterior de recibir esta orden sin confirmar/)
    expect(within(dialogo).getByText(/Yerba 1kg: 7/)).toBeTruthy()
    // El formulario no se puede tocar mientras haya un intento incierto: sólo reenviar o descartar.
    expect(within(dialogo).queryByLabelText('Cantidad a recibir de Yerba 1kg')).toBeNull()
    expect(within(dialogo).queryByRole('button', { name: 'Recibir' })).toBeNull()

    await user.click(within(dialogo).getByRole('button', BOTON_REENVIAR))
    await waitFor(() => expect(intentos()).toBe(2))
    expect(claveDe(1)).toBe(claveDe(0))
    const cuerpos = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST').map((c) => JSON.parse(String((c[1] as RequestInit).body)))
    expect(cuerpos[1]).toEqual(cuerpos[0])
    expect(cuerpos[1].items).toEqual([{ item_id: 1, quantity: '7', unit_cost: '900' }])

    // El motor contestó `repetida`: el diálogo se cierra, se le dice a la persona que no se cargó dos veces y no queda nada pendiente.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await screen.findByText(/ya estaba registrada/)).getAttribute('role')).toBe('status')
    expect(sessionStorage.getItem('libra-ui:compras:recepciones-pendientes')).toBe('{}')
  })

  it('un 5xx también es incierto (puede haber escrito antes de fallar): queda guardado para reenviar', async () => {
    base({ [RECIBIR]: { status: 502, detail: 'Bad Gateway' } })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    const dialogo = await abrir(user)
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    expect(await within(dialogo).findByText(/Bad Gateway.*No se sabe si se llegó a registrar/)).toBeTruthy()
    expect(within(dialogo).getByRole('button', BOTON_REENVIAR)).toBeTruthy()
  })

  it('un 4xx es definitivo (no se escribió): no queda pendiente y volver a apretar con los mismos datos REUSA la clave; si se cambia algo, es otra recepción y la clave cambia', async () => {
    let n = 0
    base({ [RECIBIR]: () => { n += 1; return n <= 2 ? { status: 409, detail: 'la orden ya no admite recepciones' } : { ...RECEPCION, repetida: false } } })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    const dialogo = await abrir(user)
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    expect(await within(dialogo).findByText('la orden ya no admite recepciones')).toBeTruthy()
    expect(within(dialogo).queryByRole('button', BOTON_REENVIAR)).toBeNull()

    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))    // mismos datos
    await waitFor(() => expect(intentos()).toBe(2))
    expect(claveDe(1)).toBe(claveDe(0))

    fireEvent.change(within(dialogo).getByLabelText('Cantidad a recibir de Yerba 1kg'), { target: { value: '4' } })   // otros datos
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(intentos()).toBe(3))
    expect(claveDe(2)).not.toBe(claveDe(0))
  })

  it('el intento incierto sobrevive a cerrar el diálogo y a recargar la pestaña: al reabrir se ofrece reenviarlo, con su clave', async () => {
    base({ [RECIBIR]: cortaUnaVez({ ...RECEPCION, repetida: true }) })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    const dialogo = await abrir(user)
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    await within(dialogo).findByRole('button', BOTON_REENVIAR)
    const clave = claveDe(0)
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // «Recargar la pestaña»: se pierde la memoria, queda lo de `sessionStorage`.
    cleanup()
    _reiniciarRecepcionesEnMemoria()
    montar('/compras/10', <CompraDetalle />)
    const reabierto = await abrir(user)
    expect(within(reabierto).getByRole('status').textContent).toMatch(/intento anterior de recibir esta orden sin confirmar/)
    await user.click(within(reabierto).getByRole('button', BOTON_REENVIAR))
    await waitFor(() => expect(intentos()).toBe(2))
    expect(claveDe(1)).toBe(clave)
  })

  it('descartar el intento anterior pide confirmación con la advertencia; después se puede recibir de nuevo y es OTRA clave', async () => {
    base({ [RECIBIR]: cortaUnaVez({ ...RECEPCION, repetida: false }) })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    const dialogo = await abrir(user)
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    await within(dialogo).findByRole('button', BOTON_REENVIAR)

    await user.click(within(dialogo).getByRole('button', { name: 'Descartar el intento anterior…' }))
    expect(within(dialogo).getByRole('alert').textContent).toMatch(/podrías duplicar el ingreso de stock/)
    await user.click(within(dialogo).getByRole('button', { name: 'No, volver' }))
    expect(within(dialogo).getByRole('button', BOTON_REENVIAR)).toBeTruthy()   // volver no descarta

    await user.click(within(dialogo).getByRole('button', { name: 'Descartar el intento anterior…' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Sí, descartar el intento anterior' }))
    expect(sessionStorage.getItem('libra-ui:compras:recepciones-pendientes')).toBe('{}')

    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(intentos()).toBe(2))
    expect(claveDe(1)).not.toBe(claveDe(0))
  })

  it('sin dónde guardar el intento (sessionStorage falla) NO se envía: con la respuesta perdida un reintento sería otra recepción', async () => {
    base()
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    const dialogo = await abrir(user)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cuota', 'QuotaExceededError') })
    try {
      await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
      expect(await within(dialogo).findByText(/No se pudo guardar el intento en este navegador/)).toBeTruthy()
      expect(intentos()).toBe(0)
      expect((within(dialogo).getByRole('button', { name: 'Recibir' }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      setItem.mockRestore()
    }
    // Con el storage de vuelta, el mismo botón envía.
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(intentos()).toBe(1))
  })

  it('la recepción de siempre sigue siendo una sola llamada y una respuesta sin `repetida` (un motor viejo) no rompe el cierre', async () => {
    base({ [RECIBIR]: RECEPCION })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    const dialogo = await abrir(user)
    await user.click(within(dialogo).getByRole('button', { name: 'Recibir' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText(/ya estaba registrada/)).toBeNull()
  })
})

// ── Enviar y cancelar la orden (0.147.0, motor >= 0.59.0, ADR-055 del motor; ADR-059 de libra-ui) ──────────────────────────
describe('CompraDetalle: enviar al proveedor y cancelar la orden', () => {
  const BORRADOR: PurchaseOrder = { ...ORDEN_VACIA, status: 'draft', items: [LINEA] }
  const ENVIADA: PurchaseOrder = { ...BORRADOR, status: 'sent' }
  const CANCELADA: PurchaseOrder = { ...BORRADOR, status: 'cancelled' }
  const PARCIAL: PurchaseOrder = { ...BORRADOR, status: 'partial', items: [{ ...LINEA, quantity_received: '4', pending_quantity: '6' }] }
  const ENVIAR = 'POST /api/purchase-orders/10/enviar'
  const CANCELAR = 'POST /api/purchase-orders/10/cancelar'
  const RECEPCION_EN_BORRADOR: PurchaseReceipt = {
    id: 40, proveedor_id: 1, purchase_order_id: 10, status: 'draft',
    items: [{ item_id: 1, quantity: '3', unit_cost: '900', lot_code: null, expires_at: null }], received_at: null, document_reference: null,
  }

  /** El motor de mentira: la orden que sirve cambia con cada transición, como la real. */
  function motor(inicial: PurchaseOrder, extra: Record<string, unknown> = {}, recepciones: PurchaseReceipt[] = []) {
    let orden = inicial
    responder({
      '/api/purchase-orders/10': () => orden,
      '/api/productos?solo_activos=true': [PRODUCTO],
      '/api/proveedores': [PROVEEDOR],
      '/api/depositos': [DEPOSITO],
      '/api/purchase-receipts?purchase_order_id=10': recepciones,
      [ENVIAR]: () => { orden = { ...orden, status: 'sent' }; return orden },
      [CANCELAR]: () => { orden = { ...orden, status: 'cancelled' }; return orden },
      ...extra,
    })
  }
  const boton = (nombre: string) => screen.queryByRole('button', { name: nombre })
  const lecturasDeLaOrden = () => pedidas().filter((p) => p === 'GET /api/purchase-orders/10')

  it('un borrador ofrece «Enviar al proveedor», «Cancelar orden» y «Recibir mercadería»; una enviada, sólo cancelar y recibir', async () => {
    motor(BORRADOR)
    montar('/compras/10', <CompraDetalle />)
    await screen.findByText('Borrador')
    expect(boton('Enviar al proveedor')).toBeTruthy()
    expect(boton('Cancelar orden')).toBeTruthy()
    expect(boton('Recibir mercadería')).toBeTruthy()
    cleanup()
    motor(ENVIADA)
    montar('/compras/10', <CompraDetalle />)
    await screen.findByText('Enviada')
    expect(boton('Enviar al proveedor')).toBeNull()
    expect(boton('Cancelar orden')).toBeTruthy()
    expect(boton('Recibir mercadería')).toBeTruthy()
  })

  it('«Enviar al proveedor» llama a /enviar, vuelve a mostrar la orden como «Enviada», lo avisa y ya no ofrece enviar', async () => {
    motor(BORRADOR)
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    await user.click(await screen.findByRole('button', { name: 'Enviar al proveedor' }))
    await waitFor(() => expect(pedidas()).toContain(ENVIAR))
    expect(await screen.findByText('Enviada')).toBeTruthy()
    expect(screen.queryByText('Borrador')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('La orden se marcó como enviada al proveedor.')
    expect(boton('Enviar al proveedor')).toBeNull()
    expect(boton('Cancelar orden')).toBeTruthy()
    expect(cuerpoDe(ENVIAR)).toEqual({})                                          // sin cuerpo: el id va en la ruta
  })

  it('un segundo clic mientras envía no manda dos veces', async () => {
    motor(BORRADOR)
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    await user.dblClick(await screen.findByRole('button', { name: 'Enviar al proveedor' }))
    await screen.findByText('Enviada')
    expect(pedidas().filter((p) => p === ENVIAR)).toHaveLength(1)
  })

  it('«Cancelar orden» pide confirmación: «Cancelar» (me arrepentí) no escribe nada; confirmar llama a /cancelar y la orden queda «Cancelada»', async () => {
    motor(ENVIADA)
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    await user.click(await screen.findByRole('button', { name: 'Cancelar orden' }))
    const confirmacion = screen.getByRole('alertdialog')
    expect(within(confirmacion).getByText('¿Cancelar la orden OC-000001?')).toBeTruthy()
    expect(within(confirmacion).getByText(/ya no se le puede recibir mercadería/)).toBeTruthy()
    await user.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(pedidas()).not.toContain(CANCELAR)
    expect(screen.getByText('Enviada')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cancelar orden' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar la orden' }))
    await waitFor(() => expect(pedidas()).toContain(CANCELAR))
    expect(await screen.findByText('Cancelada')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('La orden se canceló.')
  })

  it('🔴 una orden cancelada no ofrece recibir mercadería, enviar, cancelar, agregar líneas ni confirmar una recepción que había quedado en borrador', async () => {
    motor(CANCELADA, {}, [RECEPCION_EN_BORRADOR])
    montar('/compras/10', <CompraDetalle />)
    await screen.findByText('Cancelada')
    expect(boton('Recibir mercadería')).toBeNull()
    expect(boton('Enviar al proveedor')).toBeNull()
    expect(boton('Cancelar orden')).toBeNull()
    expect(boton('Agregar línea')).toBeNull()
    expect(boton('Confirmar recepción')).toBeNull()
    expect(screen.getByText('#40')).toBeTruthy()                                   // la recepción se sigue LEYENDO
  })

  it('cancelar una orden recibida o parcial no se ofrece (el motor contesta 409); enviar tampoco', async () => {
    for (const orden of [PARCIAL, { ...ORDEN_RECIBIDA, status: 'received' as const }]) {
      cleanup()
      prepararFetch()
      motor(orden)
      montar('/compras/10', <CompraDetalle />)
      await screen.findByText(orden.status === 'partial' ? 'Recibida parcial' : 'Recibida')
      expect(boton('Cancelar orden')).toBeNull()
      expect(boton('Enviar al proveedor')).toBeNull()
    }
  })

  it('🔴 con puedeEscribir={false} no se envía ni se cancela (sí se recibe: es otra capacidad)', async () => {
    motor(BORRADOR)
    montar('/compras/10', <CompraDetalle puedeEscribir={false} />)
    await screen.findByText('Borrador')
    expect(boton('Enviar al proveedor')).toBeNull()
    expect(boton('Cancelar orden')).toBeNull()
    expect(boton('Recibir mercadería')).toBeTruthy()
    cleanup()
    motor(ENVIADA)
    montar('/compras/10', <CompraDetalle puedeEscribir={false} />)
    await screen.findByText('Enviada')
    expect(boton('Cancelar orden')).toBeNull()
  })

  it('un 409 muestra el mensaje del servidor, no cambia nada por su cuenta y vuelve a leer la orden: ahora está recibida y ya no ofrece enviar ni cancelar', async () => {
    const MENSAJE = "la orden 10 está en estado 'received': no se puede cancelar una orden que ya recibió mercadería"
    let orden = ENVIADA
    motor(ENVIADA, { '/api/purchase-orders/10': () => orden, [CANCELAR]: () => { orden = { ...ORDEN_RECIBIDA, status: 'received' }; return { status: 409, detail: MENSAJE } } })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    await user.click(await screen.findByRole('button', { name: 'Cancelar orden' }))
    const lecturasAntes = lecturasDeLaOrden().length
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar la orden' }))
    expect((await screen.findByRole('alert')).textContent).toBe(MENSAJE)
    await waitFor(() => expect(lecturasDeLaOrden().length).toBe(lecturasAntes + 1))
    expect(await screen.findByText('Recibida')).toBeTruthy()
    expect(boton('Cancelar orden')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()                                // no hay aviso de éxito
  })

  it('🔑 un motor anterior (405, o el 404 genérico «Not Found» de una ruta que no existe) dice claro que falta actualizar y la pantalla sigue entera', async () => {
    const SIN_RUTA = 'Este servidor todavía no permite enviar ni cancelar órdenes de compra: hace falta actualizar el motor (libracommerce 0.59.0 o posterior).'
    const user = userEvent.setup()
    for (const falla of [{ status: 404, detail: 'Not Found' }, { status: 405, detail: 'Method Not Allowed' }]) {
      cleanup()
      prepararFetch()
      motor(BORRADOR, { [ENVIAR]: falla, [CANCELAR]: falla })
      montar('/compras/10', <CompraDetalle />)
      await user.click(await screen.findByRole('button', { name: 'Enviar al proveedor' }))
      expect((await screen.findByRole('alert')).textContent).toBe(SIN_RUTA)
      expect(screen.getByText('Borrador')).toBeTruthy()                            // la orden sigue como estaba
      expect(boton('Enviar al proveedor')).toBeTruthy()                            // y se puede reintentar
      expect(boton('Enviar al proveedor')).not.toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Cancelar orden' }))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar la orden' }))
      await waitFor(() => expect(pedidas().filter((p) => p === CANCELAR)).toHaveLength(1))
      expect((await screen.findByRole('alert')).textContent).toBe(SIN_RUTA)
      expect(screen.getByText('Borrador')).toBeTruthy()
    }
  })

  it('el 404 de una orden que no existe NO se confunde con un motor viejo: se muestra lo que dice el servidor', async () => {
    motor(BORRADOR, { [ENVIAR]: { status: 404, detail: 'purchase order not found' } })
    const user = userEvent.setup()
    montar('/compras/10', <CompraDetalle />)
    await user.click(await screen.findByRole('button', { name: 'Enviar al proveedor' }))
    expect((await screen.findByRole('alert')).textContent).toBe('purchase order not found')
  })

  it('un 403 (sin permiso) y la caída de red se avisan en castellano y no tocan la orden', async () => {
    const user = userEvent.setup()
    motor(BORRADOR, { [ENVIAR]: { status: 403, detail: 'forbidden' } })
    montar('/compras/10', <CompraDetalle />)
    await user.click(await screen.findByRole('button', { name: 'Enviar al proveedor' }))
    expect((await screen.findByRole('alert')).textContent).toBe('No tenés permiso para hacer esto.')
    cleanup()
    prepararFetch()
    motor(BORRADOR, { [ENVIAR]: '!caida' })
    montar('/compras/10', <CompraDetalle />)
    await user.click(await screen.findByRole('button', { name: 'Enviar al proveedor' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Error de conexión.')
    expect(screen.getByText('Borrador')).toBeTruthy()
  })

  it('los botones de la cabecera miden 44 px bajo `lg` (objetivo táctil), todos parejos', async () => {
    motor(BORRADOR)
    montar('/compras/10', <CompraDetalle />)
    await screen.findByText('Borrador')
    for (const nombre of ['Enviar al proveedor', 'Cancelar orden', 'Recibir mercadería']) {
      expect(screen.getByRole('button', { name: nombre }).className, nombre).toContain('max-lg:h-11')
    }
    expect(screen.getByRole('link', { name: 'Volver' }).className).toContain('max-lg:h-11')
  })
})

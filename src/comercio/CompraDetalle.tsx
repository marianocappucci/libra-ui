// El detalle de una orden de compra: líneas, alta de línea (mientras la orden
// admite), y "Recibir mercadería" -- la recepción se hace DENTRO de la orden.
//
// La confirmación de una recepción (con el depósito de destino) también vive
// acá, en la sección "Recepciones de esta orden": si "Recibir mercadería" se
// corta a mitad de camino, la recepción que quedó en borrador aparece ahí con
// su botón "Confirmar" -- no queda un estado sin salida.
//
// Extraída de `pages/CompraDetalle.tsx` de VentaLibra (F9, 2026-09-27): el
// único producto de la familia con este módulo (ver el docstring de `tipos.ts`).
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, PackageCheck, ShoppingBag } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { fechaHora } from '@/lib/fechas'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { SelectBuscable } from '../SelectBuscable'
import { esFechaISOValida } from './fecha-iso'
import {
  opcionesProducto, PURCHASE_ORDER_STATUS_LABELS, PURCHASE_ORDER_STATUS_TONO,
  PURCHASE_RECEIPT_STATUS_LABELS, PURCHASE_RECEIPT_STATUS_TONO,
  type Producto, type Deposito, type PurchaseOrder, type PurchaseReceipt, type Proveedor,
} from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

/** El motor limita el lote a 64 caracteres (`add_movimiento_stock`). */
const MAX_LARGO_LOTE = 64
const LOTE_Y_FECHA = 'Completá el lote y el vencimiento, o dejá los dos vacíos.'
const FECHA_INVALIDA = 'La fecha de vencimiento no es válida.'

function money(value: string | number): string {
  return Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export type CompraDetalleProps = {
  /** A dónde lleva «Volver». */
  rutaDeCompras?: string
}

export function CompraDetalle({ rutaDeCompras = '/compras' }: CompraDetalleProps) {
  const { id } = useParams<{ id: string }>()
  const orderId = Number(id)

  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [items, setItems] = useState<Producto[]>([])
  const [suppliers, setSuppliers] = useState<Proveedor[]>([])
  const [locations, setLocations] = useState<Deposito[]>([])
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [lineItemId, setLineItemId] = useState('')
  const [lineQuantity, setLineQuantity] = useState('1')
  const [lineCost, setLineCost] = useState('0')
  const [savingLine, setSavingLine] = useState(false)

  const [recibirOpen, setRecibirOpen] = useState(false)

  useEffect(() => {
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function cargarTodo() {
    setLoading(true)
    setError(null)
    try {
      const [o, i, s, l, r] = await Promise.all([
        api.get<PurchaseOrder>(`/api/purchase-orders/${orderId}`),
        api.get<Producto[]>('/api/productos?solo_activos=true'),
        api.get<Proveedor[]>('/api/proveedores'),
        api.get<Deposito[]>('/api/depositos'),
        api.get<PurchaseReceipt[]>(`/api/purchase-receipts?purchase_order_id=${orderId}`),
      ])
      setOrder(o)
      setItems(i)
      setSuppliers(s)
      setLocations(l.filter((d) => !!d.activo))
      setReceipts(r)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function cargarOrden() {
    setOrder(await api.get<PurchaseOrder>(`/api/purchase-orders/${orderId}`))
  }

  async function cargarRecepciones() {
    setReceipts(await api.get<PurchaseReceipt[]>(`/api/purchase-receipts?purchase_order_id=${orderId}`))
  }

  function itemName(itemId: number): string {
    return items.find((i) => i.id === itemId)?.nombre ?? `#${itemId}`
  }

  /** ¿El producto maneja lotes y vencimiento? Sale de la misma consulta de productos que arma la pantalla (`GET /api/productos`
   *  trae `vence` si el producto habilita vencimientos): no hay una consulta más por abrir el modal ni una por línea. Sin
   *  `vence` en la respuesta (un producto que no usa vencimientos) o un producto que no está en la lista, `false`. */
  function venceDe(itemId: number): boolean {
    return items.find((i) => i.id === itemId)?.vence === true
  }

  function supplierName(supplierId: number): string {
    return suppliers.find((s) => s.id === supplierId)?.nombre ?? `#${supplierId}`
  }

  async function agregarLinea() {
    if (!order || !lineItemId) return
    setSavingLine(true)
    setError(null)
    try {
      const updated = await api.post<PurchaseOrder>(`/api/purchase-orders/${order.id}/items`, {
        item_id: Number(lineItemId), quantity_ordered: lineQuantity, unit_cost: lineCost,
      })
      setOrder(updated)
      setLineItemId('')
      setLineQuantity('1')
      setLineCost('0')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSavingLine(false)
    }
  }

  const pendientes = order?.items.filter((l) => Number(l.pending_quantity) > 0) ?? []
  const puedeRecibir = !!order
    && pendientes.length > 0
    && order.status !== 'received' && order.status !== 'cancelled'
  // `is_fully_received()` da vacuamente `true` para una orden sin líneas
  // (`all()` sobre una colección vacía) -- el gate real de "se pueden seguir
  // agregando líneas" es el status, mismo criterio que valida
  // `erp.compras.agregar_linea_orden` del lado del motor.
  const puedeAgregarLinea = order?.status === 'draft' || order?.status === 'sent'

  if (loading || !order) {
    return (
      <div className="grid gap-4">
        <TituloPantalla icono={ShoppingBag}>Orden de compra</TituloPantalla>
        {error ? <p className="text-sm text-destructive">{error}</p> : (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPantalla icono={ShoppingBag}>
          Orden {order.number}{' '}
          <BadgeEstado tono={PURCHASE_ORDER_STATUS_TONO[order.status] ?? 'neutro'}>
            {PURCHASE_ORDER_STATUS_LABELS[order.status] ?? order.status}
          </BadgeEstado>
        </TituloPantalla>
        <div className="flex flex-wrap gap-2">
          {puedeRecibir && (
            <Button size="sm" onClick={() => setRecibirOpen(true)}>
              <PackageCheck />Recibir mercadería
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to={rutaDeCompras}><ArrowLeft />Volver</Link>
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{supplierName(order.proveedor_id)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Líneas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Recibido</TableHead>
                <TableHead>Pendiente</TableHead>
                <TableHead>Costo unitario</TableHead>
                <TableHead>Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Sin líneas todavía.</TableCell></TableRow>
              )}
              {order.items.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell>{itemName(line.item_id)}</TableCell>
                  <TableCell>{line.quantity_ordered}</TableCell>
                  <TableCell>{line.quantity_received}</TableCell>
                  <TableCell>{line.pending_quantity}</TableCell>
                  <TableCell>${money(line.unit_cost)}</TableCell>
                  <TableCell>${money(line.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {puedeAgregarLinea && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="grid gap-2">
                <Label>Producto</Label>
                <SelectBuscable
                  value={lineItemId}
                  onChange={setLineItemId}
                  opciones={opcionesProducto(items)}
                  placeholder="Producto…"
                  ariaLabel="Producto"
                  className="w-48"
                />
              </div>
              <div className="grid gap-2">
                <Label>Cantidad</Label>
                <Input value={lineQuantity} onChange={(e) => setLineQuantity(e.target.value)} className="w-24" />
              </div>
              <div className="grid gap-2">
                <Label>Costo unitario</Label>
                <Input value={lineCost} onChange={(e) => setLineCost(e.target.value)} className="w-28" />
              </div>
              <Button onClick={agregarLinea} disabled={savingLine || !lineItemId}>Agregar línea</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <RecepcionesDeLaOrden
        receipts={receipts}
        locations={locations}
        onConfirmada={async () => { await Promise.all([cargarOrden(), cargarRecepciones()]) }}
      />

      {recibirOpen && order && (
        <RecibirMercaderiaDialog
          order={order}
          locations={locations}
          itemName={itemName}
          venceDe={venceDe}
          onCerrar={() => setRecibirOpen(false)}
          onRecibida={async () => {
            setRecibirOpen(false)
            await Promise.all([cargarOrden(), cargarRecepciones()])
          }}
          onRecargarRecepciones={cargarRecepciones}
        />
      )}
    </div>
  )
}

/** El modal de "Recibir mercadería": una fila por línea pendiente, con la
 *  cantidad y el costo precargados y editables, el depósito de destino y un
 *  remito opcional. Las líneas de un producto que VENCE (`venceDe`) ofrecen además «Lote» y
 *  «Vencimiento», opcionales y de a par: o los dos o ninguno (una fecha sin lote o un lote sin
 *  fecha no sirven para FEFO). Se mandan como `lot_code` y `expires_at` (ISO `aaaa-mm-dd`, tal
 *  como lo entrega el `<input type="date">`); un producto que no vence no cambia nada. Al confirmar hace los tres pasos del backend en orden
 *  (crear recepción → cargar líneas → confirmar) -- si alguno falla a mitad de
 *  camino, la recepción que quedó en borrador sigue viendose y confirmable
 *  desde "Recepciones de esta orden" (por eso, ante un error, se recargan las
 *  recepciones con `onRecargarRecepciones` — y NO con `onRecibida`, que cierra
 *  el modal y se llevaría el mensaje de error antes de que se lea). */
function RecibirMercaderiaDialog({
  order, locations, itemName, venceDe, onCerrar, onRecibida, onRecargarRecepciones,
}: {
  order: PurchaseOrder
  locations: Deposito[]
  itemName: (itemId: number) => string
  venceDe: (itemId: number) => boolean
  onCerrar: () => void
  onRecibida: () => void | Promise<void>
  onRecargarRecepciones: () => void | Promise<void>
}) {
  const pendientes = useMemo(
    () => order.items.filter((l) => Number(l.pending_quantity) > 0),
    [order],
  )

  const [cantidades, setCantidades] = useState<Record<number, string>>(
    () => Object.fromEntries(pendientes.map((l) => [l.item_id, l.pending_quantity])),
  )
  const [costos, setCostos] = useState<Record<number, string>>(
    () => Object.fromEntries(pendientes.map((l) => [l.item_id, l.unit_cost])),
  )
  const [lotes, setLotes] = useState<Record<number, string>>({})
  const [vencimientos, setVencimientos] = useState<Record<number, string>>({})
  // `<input type="date">` entrega `''` tanto si está vacío como si lo tipeado no es una fecha (31/02, día o año a medio
  // escribir): `validity.badInput` es lo que los distingue.
  const [fechasIncompletas, setFechasIncompletas] = useState<Record<number, boolean>>({})
  const [locationId, setLocationId] = useState(() => {
    const porDefecto = locations.find((l) => !!l.es_default)
    return porDefecto ? String(porDefecto.id) : (locations[0] ? String(locations[0].id) : '')
  })
  const [documentReference, setDocumentReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function errorDeLinea(itemId: number, pendiente: string): string | null {
    const valor = cantidades[itemId] ?? ''
    if (valor === '') return null
    const n = Number(valor)
    if (Number.isNaN(n) || n < 0) return 'Tiene que ser un número igual o mayor a 0.'
    if (n > Number(pendiente)) return `No puede superar lo pendiente (${pendiente}).`
    return null
  }

  /** El aviso del par lote/vencimiento de una línea, o `null` si está bien (los dos o ninguno, con una fecha que existe). Una
   *  línea que no se recibe (cantidad 0 o vacía) no se manda, así que no se le exige nada. */
  function errorDeLote(itemId: number): string | null {
    if (!venceDe(itemId) || !(Number(cantidades[itemId]) > 0)) return null
    const lote = (lotes[itemId] ?? '').trim()
    const fecha = vencimientos[itemId] ?? ''
    if (fechasIncompletas[itemId] || (fecha !== '' && !esFechaISOValida(fecha))) return FECHA_INVALIDA
    return (lote === '') === (fecha === '') ? null : LOTE_Y_FECHA
  }

  const hayErrores = pendientes.some((l) => errorDeLinea(l.item_id, l.pending_quantity) !== null || errorDeLote(l.item_id) !== null)
  const hayAlgunaCantidad = pendientes.some((l) => Number(cantidades[l.item_id]) > 0)
  const puedeConfirmar = hayAlgunaCantidad && !hayErrores && !!locationId && !busy

  async function recibir() {
    if (!puedeConfirmar) return
    setBusy(true)
    setError(null)
    try {
      const receipt = await api.post<PurchaseReceipt>('/api/purchase-receipts', {
        proveedor_id: order.proveedor_id,
        purchase_order_id: order.id,
        document_reference: documentReference.trim() || null,
      })
      for (const linea of pendientes) {
        const cantidad = cantidades[linea.item_id]
        if (!cantidad || Number(cantidad) <= 0) continue
        const lote = (lotes[linea.item_id] ?? '').trim()
        const vence = vencimientos[linea.item_id] ?? ''
        await api.post(`/api/purchase-receipts/${receipt.id}/items`, {
          item_id: linea.item_id,
          quantity: cantidad,
          unit_cost: costos[linea.item_id] ?? linea.unit_cost,
          // Sólo un producto que vence, y sólo con el par completo (`errorDeLote` no deja pasar uno a medias).
          ...(venceDe(linea.item_id) && lote !== '' && vence !== '' ? { lot_code: lote, expires_at: vence } : {}),
        })
      }
      await api.post(`/api/purchase-receipts/${receipt.id}/confirm`, { deposito_id: Number(locationId) })
      await onRecibida()
    } catch (err) {
      // La recepción puede haber quedado creada (en borrador, con algunas o
      // ninguna línea): se avisa el error y se recarga igual, para que quede
      // visible en "Recepciones de esta orden" -- no queda un estado sin
      // salida al que sólo se llega recargando la página a mano.
      setError(describeError(err))
      await Promise.resolve(onRecargarRecepciones()).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recibir mercadería — Orden {order.number}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="max-h-72 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Pendiente</TableHead>
                <TableHead>Recibir</TableHead>
                <TableHead>Costo unitario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendientes.map((linea) => {
                const err = errorDeLinea(linea.item_id, linea.pending_quantity)
                const vence = venceDe(linea.item_id)
                const errLote = errorDeLote(linea.item_id)
                return (
                  <Fragment key={linea.item_id}>
                    <TableRow className={vence ? 'border-b-0' : undefined}>
                      <TableCell>{itemName(linea.item_id)}</TableCell>
                      <TableCell className="tabular-nums">{linea.pending_quantity}</TableCell>
                      <TableCell>
                        <Input
                          value={cantidades[linea.item_id] ?? ''}
                          onChange={(e) => setCantidades((prev) => ({ ...prev, [linea.item_id]: e.target.value }))}
                          aria-label={`Cantidad a recibir de ${itemName(linea.item_id)}`}
                          className="w-24 tabular-nums"
                        />
                        {err && <p className="text-xs text-destructive">{err}</p>}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={costos[linea.item_id] ?? ''}
                          onChange={(e) => setCostos((prev) => ({ ...prev, [linea.item_id]: e.target.value }))}
                          aria-label={`Costo unitario de ${itemName(linea.item_id)}`}
                          className="w-28 tabular-nums"
                        />
                      </TableCell>
                    </TableRow>
                    {vence && (
                      <TableRow>
                        <TableCell colSpan={4} className="pt-0">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="grid gap-1">
                              <Label htmlFor={`recepcion-lote-${linea.item_id}`} className="text-xs text-muted-foreground">Lote</Label>
                              <Input
                                id={`recepcion-lote-${linea.item_id}`} value={lotes[linea.item_id] ?? ''} maxLength={MAX_LARGO_LOTE}
                                onChange={(e) => setLotes((prev) => ({ ...prev, [linea.item_id]: e.target.value }))}
                                aria-label={`Lote de ${itemName(linea.item_id)}`} aria-invalid={errLote !== null}
                                placeholder="Opcional" className="w-36"
                              />
                            </div>
                            <div className="grid gap-1">
                              <Label htmlFor={`recepcion-vence-${linea.item_id}`} className="text-xs text-muted-foreground">Vencimiento</Label>
                              <Input
                                id={`recepcion-vence-${linea.item_id}`} type="date" value={vencimientos[linea.item_id] ?? ''}
                                onChange={(e) => {
                                  const incompleta = e.currentTarget.validity?.badInput === true
                                  setVencimientos((prev) => ({ ...prev, [linea.item_id]: e.target.value }))
                                  setFechasIncompletas((prev) => ({ ...prev, [linea.item_id]: incompleta }))
                                }}
                                aria-label={`Vencimiento de ${itemName(linea.item_id)}`} aria-invalid={errLote !== null}
                                className="w-40"
                              />
                            </div>
                          </div>
                          {errLote && <p role="alert" className="mt-1 text-xs text-destructive">{errLote}</p>}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="recepcion-deposito">Depósito de destino</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="recepcion-deposito" className="w-48"><SelectValue placeholder="Depósito…" /></SelectTrigger>
              <SelectContent>
                {locations.map((loc) => <SelectItem key={loc.id} value={String(loc.id)}>{loc.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recepcion-remito">Remito / comprobante</Label>
            <Input
              id="recepcion-remito" value={documentReference}
              onChange={(e) => setDocumentReference(e.target.value)}
              placeholder="Opcional" className="w-48"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={busy}>Cancelar</Button>
          <Button onClick={recibir} disabled={!puedeConfirmar}>
            {busy ? 'Recibiendo…' : 'Recibir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Las recepciones de ESTA orden (`GET /api/purchase-receipts?purchase_order_id=`,
 *  filtro server-side desde el motor v0.21.0). Una recepción en borrador -la
 *  que puede haber quedado de un "Recibir mercadería" cortado a mitad de
 *  camino- ofrece acá su propio "Confirmar", con el depósito. */
function RecepcionesDeLaOrden({
  receipts, locations, onConfirmada,
}: { receipts: PurchaseReceipt[]; locations: Deposito[]; onConfirmada: () => void | Promise<void> }) {
  const [confirmando, setConfirmando] = useState<PurchaseReceipt | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recepciones de esta orden</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Remito</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Líneas</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Sin recepciones todavía.</TableCell></TableRow>
            )}
            {receipts.map((receipt) => (
              <TableRow key={receipt.id}>
                <TableCell>#{receipt.id}</TableCell>
                <TableCell>{receipt.received_at ? fechaHora(receipt.received_at) : '—'}</TableCell>
                <TableCell>{receipt.document_reference ?? '—'}</TableCell>
                <TableCell>
                  <BadgeEstado tono={PURCHASE_RECEIPT_STATUS_TONO[receipt.status] ?? 'neutro'}>
                    {PURCHASE_RECEIPT_STATUS_LABELS[receipt.status] ?? receipt.status}
                  </BadgeEstado>
                </TableCell>
                <TableCell>{receipt.items.length}</TableCell>
                <TableCell>
                  {/* Sin líneas el motor rechaza la confirmación ("no se puede
                      confirmar una recepción sin líneas"): ofrecer el botón
                      sería mandar a un error seguro. */}
                  {receipt.status === 'draft' && receipt.items.length > 0 && (
                    <Button size="icon" variant="outline" className="size-8"
                            title="Confirmar recepción" aria-label="Confirmar recepción"
                            onClick={() => setConfirmando(receipt)}>
                      <Check />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {confirmando && (
        <ConfirmarRecepcionDialog
          receipt={confirmando}
          locations={locations}
          onCerrar={() => setConfirmando(null)}
          onConfirmada={async () => { setConfirmando(null); await onConfirmada() }}
        />
      )}
    </Card>
  )
}

function ConfirmarRecepcionDialog({
  receipt, locations, onCerrar, onConfirmada,
}: {
  receipt: PurchaseReceipt
  locations: Deposito[]
  onCerrar: () => void
  onConfirmada: () => void | Promise<void>
}) {
  const [locationId, setLocationId] = useState(() => {
    const porDefecto = locations.find((l) => !!l.es_default)
    return porDefecto ? String(porDefecto.id) : (locations[0] ? String(locations[0].id) : '')
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar() {
    if (!locationId) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/api/purchase-receipts/${receipt.id}/confirm`, { deposito_id: Number(locationId) })
      await onConfirmada()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar recepción #{receipt.id}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid gap-2">
          <Label htmlFor="confirmar-deposito">Depósito de destino</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger id="confirmar-deposito" className="w-48"><SelectValue placeholder="Depósito…" /></SelectTrigger>
            <SelectContent>
              {locations.map((loc) => <SelectItem key={loc.id} value={String(loc.id)}>{loc.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={busy}>Cancelar</Button>
          <Button onClick={confirmar} disabled={busy || !locationId}>
            {busy ? 'Confirmando…' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

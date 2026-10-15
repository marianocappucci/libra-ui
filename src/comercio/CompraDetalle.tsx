// El detalle de una orden de compra: líneas, alta de línea (mientras la orden
// admite), y "Recibir mercadería" -- la recepción se hace DENTRO de la orden.
//
// La confirmación de una recepción (con el depósito de destino) también vive
// acá, en la sección "Recepciones de esta orden": una recepción en borrador
// (las de antes de la clave de operación, o las que se arman por la API a mano)
// aparece ahí con su botón "Confirmar" -- no queda un estado sin salida.
//
// 🔑 **"Recibir mercadería" es idempotente (ADR-045).** Manda la recepción entera, con su `clave_operacion`, a `POST /api/purchase-receipts/recibir`: el motor la crea, la
// carga y la confirma en UNA transacción, y un reintento con la misma clave no vuelve a mover stock (contesta `repetida: true`). El diálogo genera UNA clave por intento y la
// REUSA mientras los datos que se van a enviar no cambien (volver a apretar «Recibir» tras un rechazo del motor: no se escribió nada, la clave no se gasta); cuando la persona
// cambia algo, es otra recepción y la clave se regenera. 🔴 **Principio: mientras haya un intento INCIERTO sobre una orden, no se manda nada nuevo sobre ella que no sea reenviar
// exactamente ese intento, con su clave, o descartarlo de forma explícita.** Incierto es no saber si el motor escribió (error de red, timeout, 5xx); sólo son definitivos los 4xx
// (menos el 408) y el 503 de la migración. El intento se guarda ANTES de enviar (`recepcion-pendiente.ts`, `sessionStorage`) y falla cerrado: si no queda guardado, no se envía.
//
// **Enviar y cancelar la orden (0.147.0, motor >= 0.59.0, ADR-055 del motor; ADR-059 de libra-ui):** «Enviar al proveedor» (`draft` -> `sent`) y «Cancelar orden» (`draft` o `sent` ->
// `cancelled`, con confirmación: no hay «reabrir») contra `POST /api/purchase-orders/{id}/enviar` y `/cancelar`, con la guarda de `puedeEscribir`. 🔑 **Se ofrecen siempre que el estado
// lo admite, y el motor viejo se detecta por la respuesta:** la orden no trae ningún campo que distinga a un motor con las rutas de uno sin ellas (`_orden_dict` no cambió en 0.59.0), así
// que un 405, o un 404 con el `detail` de FastAPI «Not Found» (la ruta no existe; el 404 de una orden que no existe dice «purchase order not found»), se muestra como «este servidor todavía
// no permite…» y la pantalla sigue como estaba. Un 409 (la orden ya recibió mercadería, o ya está cancelada) muestra el mensaje del servidor y vuelve a leer la orden, para que los botones
// digan la verdad. Una orden cancelada no ofrece recibir mercadería ni confirmar una recepción que había quedado en borrador (el motor contesta 409).
//
// Extraída de `pages/CompraDetalle.tsx` de VentaLibra (F9, 2026-09-27): el
// único producto de la familia con este módulo (ver el docstring de `tipos.ts`).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, Check, PackageCheck, Send } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { formatoMonto } from '../formatos'
import { fechaHora } from '../fechas'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'
import { SelectBuscable } from '../SelectBuscable'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { nuevaClaveDeOperacion } from './clave-de-operacion'
import { esFechaISOValida } from './fecha-iso'
import {
  esResultadoDefinitivo, guardarRecepcionPendiente, leerRecepcionPendiente, quitarRecepcionPendiente,
  type CuerpoDeRecepcion, type LineaDeRecepcion, type RecepcionPendiente,
} from './recepcion-pendiente'
import {
  formatoCantidad, llegoElCosto, opcionesProducto, PURCHASE_ORDER_STATUS_LABELS, PURCHASE_ORDER_STATUS_TONO,
  PURCHASE_RECEIPT_STATUS_LABELS, PURCHASE_RECEIPT_STATUS_TONO,
  type Producto, type Deposito, type PurchaseOrder, type PurchaseReceipt, type Proveedor, type RecepcionRecibida,
} from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

const RUTA_RECIBIR = '/api/purchase-receipts/recibir'
const SIN_TRANSICIONES = 'Este servidor todavía no permite enviar ni cancelar órdenes de compra: hace falta actualizar el motor (libracommerce 0.59.0 o posterior).'
type Transicion = 'enviar' | 'cancelar'
const AVISO_DE_TRANSICION: Record<Transicion, string> = { enviar: 'La orden se marcó como enviada al proveedor.', cancelar: 'La orden se canceló.' }

/** ¿La ruta no existe? Un 405, o el 404 genérico de FastAPI (`{"detail": "Not Found"}`): un motor anterior a 0.59.0 no tiene `/enviar` ni `/cancelar`. El 404 de una orden que no existe
 *  trae otro texto («purchase order not found») y se muestra tal cual. */
function esRutaInexistente(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 405 || (err.status === 404 && err.detail.trim().toLowerCase() === 'not found'))
}
const AVISO_INCIERTO = 'No se sabe si se llegó a registrar: reenviá el intento anterior y, si ya estaba registrado, no se duplica.'
const SIN_ALMACEN =
  'No se pudo guardar el intento en este navegador (¿modo privado o almacenamiento lleno?). No se envía para no arriesgar una recepción ' +
  'duplicada si se pierde la respuesta. Liberá espacio o usá otra ventana e intentá de nuevo.'
const FORMATO_DE_HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** El motor limita el lote a 64 caracteres (`add_movimiento_stock`). */
const MAX_LARGO_LOTE = 64
const LOTE_Y_FECHA = 'Completá el lote y el vencimiento, o dejá los dos vacíos.'
const FECHA_INVALIDA = 'La fecha de vencimiento no es válida.'

/** Bajo `lg` los botones de la cabecera miden 44 px de alto, el objetivo táctil de WCAG 2.5.5 (la misma frontera y la misma clase que `VentaDetalle`, ADR-022). */
const BOTON_TACTIL = 'max-lg:h-11'

/** `$1.234,50`, o «—» si el importe no llegó (el rol no tiene `costos.ver`). Nunca «$NaN». */
function importe(valor: string | undefined): string {
  return llegoElCosto(valor) ? `$${formatoMonto(valor as string)}` : '—'
}

export type CompraDetalleProps = {
  /** A dónde lleva «Volver». */
  rutaDeCompras?: string
  /** Si la persona puede cargar líneas en la orden (`compras.escribir` en VentaLibra). Con `false` no se ofrece «Agregar línea». Sin la prop (`true`), la
   *  pantalla es la de siempre. */
  puedeEscribir?: boolean
  /** Si la persona puede recibir mercadería (`compras.recibir` en VentaLibra: crear la recepción, cargarla y confirmarla). Con `false` no se ofrece «Recibir
   *  mercadería» ni «Confirmar recepción»: el depósito lee las órdenes y recepciones, pero el motor le contesta 403. Sin la prop (`true`), la pantalla es la de siempre. */
  puedeRecibir?: boolean
}

export function CompraDetalle({ rutaDeCompras = '/compras', puedeEscribir = true, puedeRecibir = true }: CompraDetalleProps) {
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
  const [aviso, setAviso] = useState<string | null>(null)
  // Enviar o cancelar en curso, y el diálogo de «Cancelar orden». La guarda síncrona frena un segundo clic que entre antes de que el estado deshabilite el botón.
  const [transicion, setTransicion] = useState<Transicion | null>(null)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const guardaTransicion = useRef(false)

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
   *  trae `vence` si el producto habilita vencimientos): no hay una consulta más por abrir el modal ni una por línea.
   *  - `'si'`: está en la lista con `vence: true`. `'no'`: está en la lista con `vence: false` o sin la clave (un backend sin la opción).
   *  - `'desconocido'`: NO está en la lista (la consulta es de productos activos: una orden vieja puede tener uno desactivado que
   *    vence) y el backend sí maneja `vence` (algún producto de la lista lo trae). No se asume que no vence: se ofrecen los campos
   *    igual. Si ningún producto trae `vence` (consumidores sin la opción), un producto fuera de la lista es `'no'`. */
  const backendConVence = items.some((i) => typeof i.vence === 'boolean')
  function vencimientoDe(itemId: number): 'si' | 'no' | 'desconocido' {
    const p = items.find((i) => i.id === itemId)
    if (!p) return backendConVence ? 'desconocido' : 'no'
    return p.vence === true ? 'si' : 'no'
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

  async function pasarA(que: Transicion) {
    if (!order || guardaTransicion.current) return
    guardaTransicion.current = true
    setTransicion(que)
    setError(null)
    setAviso(null)
    try {
      setOrder(await api.post<PurchaseOrder>(`/api/purchase-orders/${order.id}/${que}`))
      setAviso(AVISO_DE_TRANSICION[que])
    } catch (err) {
      setError(esRutaInexistente(err) ? SIN_TRANSICIONES : describeError(err))
      // Un 409 dice que la orden ya no está como se la veía (alguien la recibió o la canceló): se vuelve a leer para que los botones digan la verdad.
      if (err instanceof ApiError && err.status === 409) await cargarOrden().catch(() => {})
    } finally {
      guardaTransicion.current = false
      setTransicion(null)
    }
  }

  const pendientes = order?.items.filter((l) => Number(l.pending_quantity) > 0) ?? []
  const hayQueRecibir = !!order
    && pendientes.length > 0
    && order.status !== 'received' && order.status !== 'cancelled'
  // `is_fully_received()` da vacuamente `true` para una orden sin líneas
  // (`all()` sobre una colección vacía) -- el gate real de "se pueden seguir
  // agregando líneas" es el status, mismo criterio que valida
  // `erp.compras.agregar_linea_orden` del lado del motor.
  const puedeAgregarLinea = puedeEscribir && (order?.status === 'draft' || order?.status === 'sent')
  // Enviar sólo desde borrador; cancelar mientras no entró mercadería (el motor contesta 409 desde `partial` y `received`).
  const puedeEnviar = puedeEscribir && order?.status === 'draft'
  const puedeCancelar = puedeEscribir && (order?.status === 'draft' || order?.status === 'sent')

  // Ninguna línea trae el costo ni el subtotal: el rol no ve costos (`costos.ver`) y las columnas sólo mostrarían «—» (o «$NaN»). Sin líneas no hay con qué decidir.
  const sinUnitario = !!order && order.items.length > 0 && order.items.every((l) => !llegoElCosto(l.unit_cost))
  const sinSubtotal = !!order && order.items.length > 0 && order.items.every((l) => !llegoElCosto(l.subtotal))

  if (loading || !order) {
    return (
      <div className="grid gap-4">
        <TituloPantalla icono={ICONOS.ordenesDeCompra}>Orden de compra</TituloPantalla>
        {error ? <p className="text-sm text-destructive">{error}</p> : (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPantalla icono={ICONOS.ordenesDeCompra}>
          Orden {order.number}{' '}
          <BadgeEstado tono={PURCHASE_ORDER_STATUS_TONO[order.status] ?? 'neutro'}>
            {PURCHASE_ORDER_STATUS_LABELS[order.status] ?? order.status}
          </BadgeEstado>
        </TituloPantalla>
        <div className="flex flex-wrap gap-2">
          {puedeEnviar && (
            <Button size="sm" variant="outline" className={BOTON_TACTIL} disabled={transicion !== null} onClick={() => pasarA('enviar')}>
              <Send />{transicion === 'enviar' ? 'Enviando…' : 'Enviar al proveedor'}
            </Button>
          )}
          {puedeRecibir && hayQueRecibir && (
            <Button size="sm" className={BOTON_TACTIL} onClick={() => { setAviso(null); setRecibirOpen(true) }}>
              <PackageCheck />Recibir mercadería
            </Button>
          )}
          {puedeCancelar && (
            <Button size="sm" variant="outline" className={`${BOTON_TACTIL} text-destructive`} disabled={transicion !== null} onClick={() => setConfirmandoCancelar(true)}>
              <Ban />{transicion === 'cancelar' ? 'Cancelando…' : 'Cancelar orden'}
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className={BOTON_TACTIL}>
            <Link to={rutaDeCompras}><ArrowLeft />Volver</Link>
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {aviso && <p role="status" className="text-sm text-muted-foreground">{aviso}</p>}

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
                {!sinUnitario && <TableHead>Costo unitario</TableHead>}
                {!sinSubtotal && <TableHead>Subtotal</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.length === 0 && (
                <TableRow><TableCell colSpan={6 - Number(sinUnitario) - Number(sinSubtotal)} className="text-center text-sm text-muted-foreground">Sin líneas todavía.</TableCell></TableRow>
              )}
              {order.items.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell>{itemName(line.item_id)}</TableCell>
                  <TableCell className="tabular-nums">{formatoCantidad(line.quantity_ordered)}</TableCell>
                  <TableCell className="tabular-nums">{formatoCantidad(line.quantity_received)}</TableCell>
                  <TableCell className="tabular-nums">{formatoCantidad(line.pending_quantity)}</TableCell>
                  {!sinUnitario && <TableCell>{importe(line.unit_cost)}</TableCell>}
                  {!sinSubtotal && <TableCell>{importe(line.subtotal)}</TableCell>}
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
        puedeConfirmar={puedeRecibir && order.status !== 'cancelled'}
        onConfirmada={async () => { await Promise.all([cargarOrden(), cargarRecepciones()]) }}
      />

      <ConfirmDialog
        open={confirmandoCancelar}
        onOpenChange={setConfirmandoCancelar}
        title={`¿Cancelar la orden ${order.number}?`}
        description="La orden deja de contar como pedida en la reposición y ya no se le puede recibir mercadería. No se puede reabrir."
        confirmLabel="Sí, cancelar la orden"
        onConfirm={() => { setConfirmandoCancelar(false); void pasarA('cancelar') }}
      />

      {recibirOpen && order && (
        <RecibirMercaderiaDialog
          order={order}
          locations={locations}
          itemName={itemName}
          vencimientoDe={vencimientoDe}
          onCerrar={() => setRecibirOpen(false)}
          onRecibida={async (repetida) => {
            setRecibirOpen(false)
            setAviso(repetida ? 'Esa recepción ya estaba registrada (era un reintento): no se cargó dos veces.' : null)
            await Promise.all([cargarOrden(), cargarRecepciones()])
          }}
        />
      )}
    </div>
  )
}

/** El modal de "Recibir mercadería": una fila por línea pendiente, con la
 *  cantidad y el costo precargados y editables, el depósito de destino y un
 *  remito opcional. Las líneas de un producto que VENCE o cuyo vencimiento se DESCONOCE (`vencimientoDe`) ofrecen además «Lote» y
 *  «Vencimiento», opcionales y de a par: o los dos o ninguno (una fecha sin lote o un lote sin
 *  fecha no sirven para FEFO). Se mandan como `lot_code` y `expires_at` (ISO `aaaa-mm-dd`, tal
 *  como lo entrega el `<input type="date">`); un producto que no vence no cambia nada. Al confirmar manda la recepción ENTERA, con su `clave_operacion`,
 *  a `POST /api/purchase-receipts/recibir` (ver el encabezado del archivo): o queda registrada completa o no queda nada. Con un intento anterior sin confirmar
 *  sobre esta orden, el formulario se reemplaza por «Reenviar el intento anterior» / «Descartar…». */
function RecibirMercaderiaDialog({
  order, locations, itemName, vencimientoDe, onCerrar, onRecibida,
}: {
  order: PurchaseOrder
  locations: Deposito[]
  itemName: (itemId: number) => string
  vencimientoDe: (itemId: number) => 'si' | 'no' | 'desconocido'
  onCerrar: () => void
  /** `repetida`: el motor contestó que esa recepción ya estaba registrada (un reintento). */
  onRecibida: (repetida: boolean) => void | Promise<void>
}) {
  const pendientes = useMemo(
    () => order.items.filter((l) => Number(l.pending_quantity) > 0),
    [order],
  )
  // Si las líneas llegaron sin `unit_cost` (el rol no tiene `costos.ver`) no hay costo que precargar ni que editar: la columna sobra y el cuerpo no lo manda.
  const conCosto = pendientes.some((l) => llegoElCosto(l.unit_cost))
  /** ¿Se ofrecen «Lote» y «Vencimiento» en la línea? Sí si vence o no se sabe; no si se sabe que no. */
  const venceDe = (itemId: number) => vencimientoDe(itemId) !== 'no'

  const [cantidades, setCantidades] = useState<Record<number, string>>(
    () => Object.fromEntries(pendientes.map((l) => [l.item_id, String(Number(l.pending_quantity))])),
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
  // El intento anterior sin confirmar de ESTA orden (de otra apertura del diálogo, de una recarga, o de un corte de este mismo envío).
  const [pendiente, setPendiente] = useState<RecepcionPendiente | null>(() => leerRecepcionPendiente(order.id))
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)
  // Una guarda síncrona: dos clics pueden entrar antes de que el estado deshabilite el botón.
  const guarda = useRef(false)
  // La clave del intento: la misma mientras los datos que se van a enviar sean los mismos, otra cuando cambian.
  const clave = useRef<{ huella: string; valor: string } | null>(null)

  function errorDeLinea(itemId: number, pendiente: string): string | null {
    const valor = cantidades[itemId] ?? ''
    if (valor === '') return null
    const n = Number(valor)
    if (Number.isNaN(n) || n < 0) return 'Tiene que ser un número igual o mayor a 0.'
    if (n > Number(pendiente)) return `No puede superar lo pendiente (${formatoCantidad(pendiente)}).`
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

  /** Lo que se va a enviar, sin la clave: las líneas con cantidad, con el par lote/vencimiento sólo si está completo y el producto lo admite. */
  function cuerpoDelFormulario(): Omit<CuerpoDeRecepcion, 'clave_operacion'> {
    const items: LineaDeRecepcion[] = []
    for (const linea of pendientes) {
      const cantidad = cantidades[linea.item_id]
      if (!cantidad || Number(cantidad) <= 0) continue
      const lote = (lotes[linea.item_id] ?? '').trim()
      const vence = vencimientos[linea.item_id] ?? ''
      items.push({
        item_id: linea.item_id,
        quantity: cantidad,
        unit_cost: costos[linea.item_id] ?? linea.unit_cost,
        // Sólo un producto que vence, y sólo con el par completo (`errorDeLote` no deja pasar uno a medias).
        ...(venceDe(linea.item_id) && lote !== '' && vence !== '' ? { lot_code: lote, expires_at: vence } : {}),
      })
    }
    return {
      proveedor_id: order.proveedor_id,
      purchase_order_id: order.id,
      document_reference: documentReference.trim() || null,
      deposito_id: Number(locationId),
      items,
    }
  }

  /** Guarda el intento ANTES de mandarlo (falla cerrado) y lo borra sólo con un resultado definitivo. Un reenvío conserva la hora del intento original. */
  async function enviar(cuerpo: CuerpoDeRecepcion, creado: number) {
    if (guarda.current) return
    guarda.current = true
    setBusy(true)
    setError(null)
    const intento: RecepcionPendiente = { cuerpo, creado }
    if (!guardarRecepcionPendiente(order.id, intento)) {
      // Sin el cuerpo y la clave guardados de forma recuperable, si se perdiera la respuesta un reintento sería otra recepción y el stock entraría dos veces.
      guarda.current = false
      setBusy(false)
      setError(SIN_ALMACEN)
      return
    }
    let respuesta: RecepcionRecibida
    try {
      respuesta = await api.post<RecepcionRecibida>(RUTA_RECIBIR, cuerpo)
    } catch (err) {
      if (esResultadoDefinitivo(err)) {
        // El motor dijo que no escribió (y no gasta la clave): no queda nada pendiente y el formulario sigue como estaba.
        quitarRecepcionPendiente(order.id)
        setPendiente(null)
        setError(describeError(err))
      } else {
        // Se queda guardado, con su cuerpo y su clave: lo único que se puede hacer es reenviarlo o descartarlo.
        setPendiente(intento)
        setError(`${describeError(err)} ${AVISO_INCIERTO}`)
      }
      guarda.current = false
      setBusy(false)
      return
    }
    quitarRecepcionPendiente(order.id)
    guarda.current = false
    setBusy(false)
    await Promise.resolve(onRecibida(respuesta.repetida === true)).catch(() => {})
  }

  async function recibir() {
    if (!puedeConfirmar || pendiente) return
    const cuerpo = cuerpoDelFormulario()
    const huella = JSON.stringify(cuerpo)
    if (clave.current?.huella !== huella) clave.current = { huella, valor: nuevaClaveDeOperacion() }
    await enviar({ ...cuerpo, clave_operacion: clave.current.valor }, Date.now())
  }

  async function reenviar() {
    if (pendiente) await enviar(pendiente.cuerpo, pendiente.creado)
  }

  function descartar() {
    quitarRecepcionPendiente(order.id)
    // Lo que venga después es otra operación y no puede heredar la clave del intento descartado.
    clave.current = null
    setPendiente(null)
    setConfirmandoDescarte(false)
    setError(null)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recibir mercadería — Orden {order.number}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {pendiente ? (
          <IntentoPendiente
            pendiente={pendiente} itemName={itemName} depositoNombre={locations.find((l) => l.id === pendiente.cuerpo.deposito_id)?.nombre ?? `#${pendiente.cuerpo.deposito_id}`}
            busy={busy} confirmando={confirmandoDescarte} onConfirmando={setConfirmandoDescarte} onDescartar={descartar}
          />
        ) : (<>
        <div className="max-h-72 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Pendiente</TableHead>
                <TableHead>Recibir</TableHead>
                {conCosto && <TableHead>Costo unitario</TableHead>}
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
                      <TableCell className="tabular-nums">{formatoCantidad(linea.pending_quantity)}</TableCell>
                      <TableCell>
                        <Input
                          value={cantidades[linea.item_id] ?? ''}
                          onChange={(e) => setCantidades((prev) => ({ ...prev, [linea.item_id]: e.target.value }))}
                          aria-label={`Cantidad a recibir de ${itemName(linea.item_id)}`}
                          className="w-24 tabular-nums"
                        />
                        {err && <p className="text-xs text-destructive">{err}</p>}
                      </TableCell>
                      {conCosto && (
                        <TableCell>
                          <Input
                            value={costos[linea.item_id] ?? ''}
                            onChange={(e) => setCostos((prev) => ({ ...prev, [linea.item_id]: e.target.value }))}
                            aria-label={`Costo unitario de ${itemName(linea.item_id)}`}
                            className="w-28 tabular-nums"
                          />
                        </TableCell>
                      )}
                    </TableRow>
                    {vence && (
                      <TableRow>
                        <TableCell colSpan={conCosto ? 4 : 3} className="pt-0">
                          {vencimientoDe(linea.item_id) === 'desconocido' && (
                            <p className="mb-1 text-xs text-muted-foreground">
                              No pudimos saber si este producto vence; si vence, cargá lote y vencimiento.
                            </p>
                          )}
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
            <SelectBuscable
              id="recepcion-deposito"
              value={locationId}
              onChange={setLocationId}
              opciones={locations.map((loc) => ({ value: String(loc.id), label: loc.nombre }))}
              placeholder="Depósito…"
              className="w-48"
            />
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
        </>)}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={busy}>Cancelar</Button>
          {pendiente ? (
            <Button onClick={reenviar} disabled={busy}>
              {busy ? 'Recibiendo…' : 'Reenviar el intento anterior'}
            </Button>
          ) : (
            <Button onClick={recibir} disabled={!puedeConfirmar}>
              {busy ? 'Recibiendo…' : 'Recibir'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Lo que hay que hacer con un intento anterior sin confirmar: reenviarlo tal cual (con «Reenviar el intento anterior», que es el botón de confirmar del diálogo) o descartarlo,
 *  y descartar pide una confirmación con la advertencia. Muestra QUÉ se había mandado: es lo que se va a reenviar, no lo que haya en el formulario. */
function IntentoPendiente({ pendiente, itemName, depositoNombre, busy, confirmando, onConfirmando, onDescartar }: {
  pendiente: RecepcionPendiente
  itemName: (itemId: number) => string
  depositoNombre: string
  busy: boolean
  confirmando: boolean
  onConfirmando: (confirmando: boolean) => void
  onDescartar: () => void
}) {
  const { cuerpo } = pendiente
  return (
    <div className="grid gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
      <p role="status">
        Hay un intento anterior de recibir esta orden sin confirmar (del {FORMATO_DE_HORA.format(pendiente.creado)}), para el depósito {depositoNombre}
        {cuerpo.document_reference ? `, remito ${cuerpo.document_reference}` : ''}. Al reenviarlo se manda lo mismo con la misma clave, así que no se duplica.
        Mientras esté pendiente no se puede recibir otra cosa sobre esta orden.
      </p>
      <ul className="list-disc pl-5">
        {cuerpo.items.map((l) => (
          <li key={l.item_id}>
            {itemName(l.item_id)}: {formatoCantidad(l.quantity)}{l.lot_code ? ` (lote ${l.lot_code}, vence ${l.expires_at})` : ''}
          </li>
        ))}
      </ul>
      {confirmando ? (
        <div className="grid gap-2">
          <p role="alert" className="font-medium">
            Sólo descartalo si verificaste en las recepciones que NO se registró; si se registró y lo descartás, podrías duplicar el ingreso de stock.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={onDescartar}>Sí, descartar el intento anterior</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onConfirmando(false)}>No, volver</Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onConfirmando(true)}>
            Descartar el intento anterior…
          </Button>
        </div>
      )}
    </div>
  )
}

/** Las recepciones de ESTA orden (`GET /api/purchase-receipts?purchase_order_id=`,
 *  filtro server-side desde el motor v0.21.0). Una recepción en borrador -la
 *  que puede haber quedado de un "Recibir mercadería" cortado a mitad de
 *  camino- ofrece acá su propio "Confirmar", con el depósito. */
function RecepcionesDeLaOrden({
  receipts, locations, puedeConfirmar, onConfirmada,
}: { receipts: PurchaseReceipt[]; locations: Deposito[]; puedeConfirmar: boolean; onConfirmada: () => void | Promise<void> }) {
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
                  {puedeConfirmar && receipt.status === 'draft' && receipt.items.length > 0 && (
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
          <SelectBuscable
            id="confirmar-deposito"
            value={locationId}
            onChange={setLocationId}
            opciones={locations.map((loc) => ({ value: String(loc.id), label: loc.nombre }))}
            placeholder="Depósito…"
            className="w-48"
          />
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

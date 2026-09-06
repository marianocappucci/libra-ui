// El detalle de una venta: datos, pagos, artículos, la factura y el remito
// vinculados, el cobro por QR de MercadoPago y la anulación (P9-M3).
//
// Extraída de `pages/VentaDetalle.tsx` de Contalibra y Restolibra. Lo que
// difería, y cómo quedó:
// - Contalibra tenía el poll del QR con tope de espera, la campanita al
//   acreditarse y el botón «Generar factura» contra `POST /facturar`;
//   Restolibra el poll sin tope y un link al formulario de factura. Queda lo
//   de Contalibra; el link al formulario es la prop `rutaDeFacturaManual`, para
//   el producto que quiera además ofrecer editar el comprobante antes de emitir.
// - Contalibra pegaba a `/ventas/{id}/mp-qr` (router legado) y Restolibra a
//   `/api/ventas/{id}/mp-qr`. Queda `/api/ventas`, que es donde
//   `libracore.ventas_cobro_router` lo monta en los dos.
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Ban, CheckCircle2, FileCheck, Loader2, PackageCheck, Printer, QrCode, ReceiptText, ShoppingCart,
} from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { esElectronico } from '../medios-pago'
import { TituloPantalla } from '../titulo-pantalla'
import { useEtiquetaDeMedio } from './medios-pago'
import { ESTADO_VENTA_TONO, etiquetaDeEstadoDeVenta, formatoMoneda, type Venta } from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { fecha } from '@/lib/fechas'

type QrEstado = 'idle' | 'creando' | 'esperando' | 'acreditado'

/** Dos notas cortas, sintetizadas. Sin archivo de audio a propósito: no hay
 *  nada que descargar ni que sirva el backend, y suena igual sin internet.
 *
 *  El `AudioContext` se crea con el click de "Cobrar con QR" y no al acreditar:
 *  los navegadores bloquean el audio que no nace de un gesto del usuario, y la
 *  acreditación llega desde un `setInterval`, que no cuenta como gesto. */
function crearAudio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    return Ctor ? new Ctor() : null
  } catch {
    return null
  }
}

function sonarCampanita(ctx: AudioContext | null) {
  if (!ctx) return
  // Un contexto creado antes de cualquier gesto puede quedar suspendido.
  if (ctx.state === 'suspended') void ctx.resume()
  const notas = [
    { hz: 1318.5, en: 0 },      // mi6
    { hz: 1760.0, en: 0.13 },   // la6
  ]
  for (const { hz, en } of notas) {
    const osc = ctx.createOscillator()
    const vol = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = hz
    const t = ctx.currentTime + en
    vol.gain.setValueAtTime(0.0001, t)
    vol.gain.exponentialRampToValueAtTime(0.28, t + 0.01)
    vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
    osc.connect(vol).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.45)
  }
}

export const POLL_MS = 3000
// Cinco minutos: pasado eso el cliente ya se fue del mostrador. Cortar el poll
// no cancela nada del lado de MercadoPago — si paga después, el webhook lo
// acredita igual.
export const ESPERA_MAXIMA_MS = 5 * 60 * 1000

export type VentaDetalleProps = {
  /** Si la sesión puede anular ventas (los productos: rol admin). */
  puedeAnular?: boolean
  rutaDeVentas?: string
  rutaDeFactura?: (id: number) => string
  rutaDeRemito?: (id: number) => string
  rutaDeRemitoNuevo?: string
  /** Si se da, además del botón que emite directo se ofrece un link al
   *  formulario de factura precargado con la venta (Restolibra). */
  rutaDeFacturaManual?: (ventaId: number) => string
}

export function VentaDetalle({
  puedeAnular = false,
  rutaDeVentas = '/ventas',
  rutaDeFactura = (id) => `/facturas/${id}`,
  rutaDeRemito = (id) => `/remitos/${id}`,
  rutaDeRemitoNuevo = '/remitos/nuevo',
  rutaDeFacturaManual,
}: VentaDetalleProps = {}) {
  const etiquetaDeMedio = useEtiquetaDeMedio()
  const { id } = useParams<{ id: string }>()
  const ventaId = Number(id)

  const [detalle, setDetalle] = useState<Venta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmAnular, setConfirmAnular] = useState(false)
  const [facturando, setFacturando] = useState(false)
  const [qrEstado, setQrEstado] = useState<QrEstado>('idle')
  const [qrError, setQrError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaId])

  // Sin esto el poll sigue corriendo contra una venta que ya no está en
  // pantalla: el usuario navega a otra y cada 3 segundos sale un request.
  useEffect(() => frenarPoll, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      setDetalle(await api.get<Venta>(`/api/ventas/${ventaId}`))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function anular() {
    if (!detalle) return
    setError(null)
    try {
      await api.post(`/api/ventas/${detalle.id}/anular`)
      await cargar()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function frenarPoll() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  // Empuja el monto de la venta al punto de venta de MercadoPago. El QR es el
  // fijo de la caja —el cartel impreso—, así que no hay nada que mostrar en
  // pantalla: lo que cambia es qué cobra ese QR cuando alguien lo escanea.
  //
  // 🔑 Pegarle repetido a `mp-status` es seguro: acredita de forma idempotente
  // —sólo toca lo que está `pendiente`—, así que ni el poll ni el webhook
  // llegando en el medio duplican el ingreso en la caja.
  async function cobrarConQr() {
    if (!detalle) return
    // Acá, con el click todavía en curso, es el único momento en que el
    // navegador deja abrir el audio.
    audioRef.current = audioRef.current ?? crearAudio()
    setQrError(null)
    setQrEstado('creando')
    try {
      await api.post(`/api/ventas/${detalle.id}/mp-qr`)
    } catch (err) {
      setQrError(describeError(err))
      setQrEstado('idle')
      return
    }
    setQrEstado('esperando')
    const hasta = Date.now() + ESPERA_MAXIMA_MS
    pollRef.current = window.setInterval(async () => {
      let estado: string
      try {
        estado = (await api.get<{ status: string }>(`/api/ventas/${detalle.id}/mp-status`)).status
      } catch (err) {
        frenarPoll()
        setQrEstado('idle')
        setQrError(describeError(err))
        return
      }
      if (estado === 'approved') {
        frenarPoll()
        sonarCampanita(audioRef.current)
        setQrEstado('acreditado')
        await cargar()
        return
      }
      if (estado === 'rejected' || estado === 'cancelled') {
        frenarPoll()
        setQrEstado('idle')
        setQrError('El pago fue rechazado o cancelado en MercadoPago.')
        return
      }
      if (Date.now() > hasta) {
        frenarPoll()
        setQrEstado('idle')
        setQrError('Se agotó la espera. Si el cliente pagó igual, el cobro se acredita solo cuando MercadoPago avise; si no, volvé a intentar.')
      }
    }, POLL_MS)
  }

  async function facturar() {
    if (!detalle) return
    setError(null)
    setFacturando(true)
    try {
      await api.post(`/api/ventas/${detalle.id}/facturar`)
      await cargar()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setFacturando(false)
    }
  }

  // Sin una fila de pago con un medio electrónico no hay dónde sellar la
  // referencia del cobro, así que el botón no se ofrece.
  const puedeCobrarConQr = !!detalle
    && detalle.estado !== 'anulada'
    && !detalle.mp_payment_id
    && detalle.pagos.some((p) => esElectronico(p.medio))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPantalla icono={ShoppingCart}>{detalle ? <>Venta {detalle.numero} <BadgeEstado tono={ESTADO_VENTA_TONO[detalle.estado] ?? 'neutro'}>{etiquetaDeEstadoDeVenta(detalle.estado)}</BadgeEstado></> : 'Venta'}</TituloPantalla>
        {detalle && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><a href={`/ventas/${detalle.id}/ticket`} target="_blank" rel="noreferrer"><Printer />Ticket</a></Button>
            {detalle.pagos.length > 0 && (
              <Button asChild size="sm" variant="outline"><a href={`/ventas/${detalle.id}/recibo`} target="_blank" rel="noreferrer"><FileCheck />Recibo</a></Button>
            )}
            <Button asChild size="sm" variant="outline"><Link to={rutaDeVentas}><ArrowLeft />Volver</Link></Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading || !detalle ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Datos de la venta</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p><span className="text-muted-foreground">Fecha:</span> {fecha(detalle.fecha)}</p>
                <p><span className="text-muted-foreground">Cliente:</span> {detalle.cliente_nombre || '— Consumidor final —'}</p>
                {detalle.observaciones && <p><span className="text-muted-foreground">Obs.:</span> {detalle.observaciones}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="size-4" />Pagos recibidos</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {detalle.pagos.length === 0 ? (
                  <p className="text-muted-foreground">Sin pagos registrados.</p>
                ) : (
                  <>
                    {detalle.pagos.map((p, i) => (
                      <div key={i} className="grid gap-0.5">
                        <div className="flex justify-between">
                          <Badge variant="outline">{etiquetaDeMedio(p.medio)}</Badge>
                          <span className="font-medium">{formatoMoneda(p.monto)}</span>
                        </div>
                        {p.referencia && <p className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-600" />Ref: {p.referencia}</p>}
                      </div>
                    ))}
                    <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold">
                      <span>Total cobrado</span><span>{formatoMoneda(detalle.pagos.reduce((a, p) => a + p.monto, 0))}</span>
                    </div>
                    {detalle.mp_payment_id ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><QrCode className="size-3.5" />Cobrado por QR de MercadoPago.</p>
                    ) : puedeCobrarConQr && (
                      <div className="mt-2 grid gap-2 border-t pt-2">
                        {qrEstado === 'esperando' ? (
                          <>
                            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                              <Loader2 className="size-3.5 animate-spin" />Esperando el pago…
                            </p>
                            <p className="text-xs text-muted-foreground">
                              El QR de la caja ya está cobrando {formatoMoneda(detalle.total)}. Pedile al cliente que lo escanee.
                            </p>
                          </>
                        ) : qrEstado === 'acreditado' ? (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5" />Pago acreditado.
                          </p>
                        ) : (
                          <Button size="sm" variant="outline" disabled={qrEstado === 'creando'} onClick={cobrarConQr}>
                            <QrCode />{qrEstado === 'creando' ? 'Preparando el QR…' : 'Cobrar con QR'}
                          </Button>
                        )}
                        {qrError && <p className="text-xs text-destructive">{qrError}</p>}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {(detalle.factura_display || detalle.remito_id) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {detalle.factura_display && (
                <p className="flex items-center gap-2 rounded-md border bg-muted/50 p-3 text-sm"><ReceiptText className="size-4 text-emerald-600" />Factura generada: <Link to={rutaDeFactura(detalle.factura_id as number)} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">{detalle.factura_display}</Link></p>
              )}
              {detalle.remito_id && (
                <p className="flex items-center gap-2 rounded-md border bg-muted/50 p-3 text-sm"><PackageCheck className="size-4 text-primary" />Remito generado: <Link to={rutaDeRemito(detalle.remito_id)} className="font-semibold text-primary hover:underline">ver remito</Link></p>
              )}
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Artículos vendidos</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left font-medium">Descripción</th>
                    <th className="p-3 text-right font-medium">Cant.</th>
                    <th className="p-3 text-right font-medium">Precio unit.</th>
                    <th className="p-3 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((it, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-3">{it.nombre}</td>
                      <td className="p-3 text-right">{it.qty}</td>
                      <td className="p-3 text-right">{formatoMoneda(it.precio)}</td>
                      <td className="p-3 text-right font-medium">{formatoMoneda(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-medium">
                  <tr><td colSpan={3} className="p-3 text-right text-muted-foreground">Subtotal</td><td className="p-3 text-right">{formatoMoneda(detalle.subtotal)}</td></tr>
                  {detalle.descuento > 0 && (
                    <tr><td colSpan={3} className="p-3 text-right text-muted-foreground">Descuento</td><td className="p-3 text-right text-destructive">− {formatoMoneda(detalle.descuento)}</td></tr>
                  )}
                  <tr className="text-base"><td colSpan={3} className="p-3 text-right font-semibold">TOTAL</td><td className="p-3 text-right font-semibold text-primary">{formatoMoneda(detalle.total)}</td></tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {(detalle.estado === 'cobrada' || detalle.estado === 'parcial') && (
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              {!detalle.factura_id && (
                <>
                  <Button size="sm" variant="outline" disabled={facturando} onClick={facturar}>
                    <ReceiptText />{facturando ? 'Facturando…' : 'Generar factura'}
                  </Button>
                  {rutaDeFacturaManual && (
                    <Button asChild size="sm" variant="ghost"><Link to={rutaDeFacturaManual(detalle.id)}>Facturar con el formulario</Link></Button>
                  )}
                </>
              )}
              {!detalle.remito_id && <Button asChild size="sm" variant="outline"><Link to={rutaDeRemitoNuevo}><PackageCheck />Generar remito</Link></Button>}
              {puedeAnular && (
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmAnular(true)}><Ban />Anular venta</Button>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmAnular}
        onOpenChange={setConfirmAnular}
        title="¿Anular esta venta?"
        description="Se repondrá el stock, se revertirán los movimientos de caja y, si tenía pago a cuenta corriente, se acreditará la deuda del cliente."
        confirmLabel="Anular"
        onConfirm={() => { anular(); setConfirmAnular(false) }}
      />
    </div>
  )
}

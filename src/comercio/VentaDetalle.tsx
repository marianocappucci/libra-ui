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
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Ban, CheckCircle2, FileCheck, FileMinus, Loader2, PackageCheck, Printer, QrCode, ReceiptText, ShoppingCart,
} from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { esElectronico } from '../medios-pago'
import { TituloPantalla } from '../titulo-pantalla'
import { useEtiquetaDeMedio } from './medios-pago'
import { useImprimirTicket } from './useImprimirTicket'
import { ESTADO_VENTA_TONO, etiquetaDeEstadoDeVenta, formatoMoneda, type Venta } from './tipos'
// Re-exportado para quien escriba `accionesExtra`: es el tipo de `ctx.detalle`
// sin tener que importar aparte desde `libra-ui/comercio/tipos`.
export type { Venta }
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

/** Lo que recibe `accionesExtra`: la venta ya cargada (con los `items` y su
 *  `id` de línea, cuando el backend lo manda) y una forma de volver a pedirla
 *  después de una acción propia del producto (p. ej. una devolución). */
export type VentaDetalleAccionesExtraCtx = {
  detalle: Venta
  recargar: () => void
}

/** Bajo `lg` (la misma frontera que `FILA_MOVIL`) los botones miden 44 px de alto, el objetivo táctil de WCAG 2.5.5; en escritorio, los 32 de `sm`. ADR-022. */
const BOTON_TACTIL = 'max-lg:h-11'

// Cada artículo de la tabla como bloque en un móvil: las celdas de cantidad, precio y subtotal pasan a una línea «etiqueta … valor» (la etiqueta sale del `data-label`). Los totales, uno por línea.
const FILA_MOVIL = 'max-lg:flex max-lg:justify-between max-lg:gap-4 max-lg:p-0 max-lg:pt-1 max-lg:font-normal max-lg:text-muted-foreground max-lg:before:content-[attr(data-label)]'
const TOTAL_MOVIL = 'max-lg:flex max-lg:justify-between max-lg:gap-4 max-lg:px-3 max-lg:py-1'

export type VentaDetalleProps = {
  /** Si la sesión puede anular ventas (los productos: rol admin). */
  puedeAnular?: boolean
  rutaDeVentas?: string
  /** `null` oculta el link a la factura —el dato (`factura_display`) se sigue
   *  mostrando como texto—; sin la prop, la ruta de siempre (F4, 2026-09-15:
   *  VentaLibra no tiene pantalla de factura). */
  rutaDeFactura?: ((id: number) => string) | null
  /** `null` oculta el bloque «Remito generado» con su link; sin la prop, la
   *  ruta de siempre (VentaLibra no tiene pantalla de remito). */
  rutaDeRemito?: ((id: number) => string) | null
  /** `null` oculta el botón «Generar remito»; sin la prop, la ruta de siempre. */
  rutaDeRemitoNuevo?: string | null
  /** Si se da, además del botón que emite directo se ofrece un link al
   *  formulario de factura precargado con la venta (Restolibra). */
  rutaDeFacturaManual?: (ventaId: number) => string
  /** A dónde imprimir el ticket (F4, 2026-09-15). `null` oculta el link
   *  —VentaLibra lo sirve por otra ruta—; sin la prop, la de siempre. */
  rutaDeTicket?: ((id: number) => string) | null
  /** Igual que `rutaDeTicket`, para el recibo. `null` oculta el link
   *  —VentaLibra no tiene recibo—. */
  rutaDeRecibo?: ((id: number) => string) | null
  /** Si la sesión puede emitir la nota de crédito de una factura con CAE (los productos: rol admin). Sin la prop no se
   *  ofrece el botón y el aviso sólo dice que hace falta la nota. */
  puedeEmitirNota?: boolean
  /** A dónde se pide la nota de crédito de una factura (`libracore.facturas_router`); es la misma en todos los productos. */
  rutaDeNotaDeCredito?: (facturaId: number) => string
  /** Un espacio para acciones propias del producto (F4, 2026-09-15) —p. ej.
   *  la devolución parcial de VentaLibra—, renderizado junto a las acciones
   *  existentes (anular/QR/facturar). Sin la prop no se renderiza nada nuevo. */
  accionesExtra?: (ctx: VentaDetalleAccionesExtraCtx) => ReactNode
}

export function VentaDetalle({
  puedeAnular = false,
  rutaDeVentas = '/ventas',
  rutaDeFactura = (id) => `/facturas/${id}`,
  rutaDeRemito = (id) => `/remitos/${id}`,
  rutaDeRemitoNuevo = '/remitos/nuevo',
  rutaDeFacturaManual,
  rutaDeTicket = (id) => `/ventas/${id}/ticket`,
  rutaDeRecibo = (id) => `/ventas/${id}/recibo`,
  puedeEmitirNota = false,
  rutaDeNotaDeCredito = (facturaId) => `/api/facturas/${facturaId}/nota-credito`,
  accionesExtra,
}: VentaDetalleProps = {}) {
  const etiquetaDeMedio = useEtiquetaDeMedio()
  const { imprimir, dialogo: dialogoTicket } = useImprimirTicket()
  const { id } = useParams<{ id: string }>()
  const ventaId = Number(id)

  const [detalle, setDetalle] = useState<Venta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmAnular, setConfirmAnular] = useState(false)
  const [confirmNota, setConfirmNota] = useState(false)
  // La nota puede ser por el total o por un importe (parcial): lo elige quien la emite, con el saldo a la vista.
  const [notaParcial, setNotaParcial] = useState(false)
  const [importeNota, setImporteNota] = useState('')
  const [emitiendoNota, setEmitiendoNota] = useState(false)
  // Respaldo para un motor que todavía no manda `nota_credito_display` (ADR-034 de libracommerce): con él la nota se lee del detalle y sobrevive a recargar la venta.
  const [notaEmitidaLocal, setNotaEmitidaLocal] = useState(false)
  const errorRef = useRef<HTMLParagraphElement | null>(null)
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

  // El error se anuncia (`role="alert"`) y se trae a la vista: se muestra arriba de la pantalla y quien lo provocó está más abajo, en los botones (en un móvil quedaba fuera de pantalla).
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

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

  // La nota de crédito de la factura (total o por un importe; la emite ARCA). La venta NO se anula sola: después de la
  // nota se anula con el botón de siempre, cuando la factura ya está acreditada por completo.
  async function emitirNota() {
    if (!detalle?.factura_id) return
    setError(null)
    setEmitiendoNota(true)
    try {
      // Sin cuerpo la nota es TOTAL (como siempre); con `importe`, parcial (libracore v1.130.0).
      if (notaParcial && importeValido !== null) await api.post(rutaDeNotaDeCredito(detalle.factura_id), { importe: importeValido })
      else await api.post(rutaDeNotaDeCredito(detalle.factura_id))
      setNotaEmitidaLocal(true)
      setConfirmNota(false)
      // Se recarga el detalle: trae la nota emitida (`nota_credito_display`) y deja la pantalla igual a como la vería quien la abra de nuevo.
      await cargar()
    } catch (err) {
      setError(describeError(err))
      setConfirmNota(false)
    } finally {
      setEmitiendoNota(false)
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

  // Lo que queda de `descuento` una vez descontadas las promociones (que ya lo incluyen): sin
  // promociones es el descuento entero, igual que siempre. Redondeado a centavos para no mostrar
  // polvo de punto flotante como si fuera un descuento.
  const ahorroDePromociones = (detalle?.promociones ?? []).reduce((suma, p) => suma + p.ahorro, 0)
  const descuentoRestante = !detalle ? 0
    : (detalle.promociones?.length ? Math.round((detalle.descuento - ahorroDePromociones) * 100) / 100 : detalle.descuento)

  const notaDisplay = detalle?.nota_credito_display ?? null
  // Con el saldo (libracommerce v0.44.0) la pantalla sabe si la factura ya está acreditada POR COMPLETO: una nota parcial
  // no alcanza para anular. Sin él (un motor anterior) vale lo de antes: haya o no una nota.
  const totalFactura = detalle?.factura_total ?? null
  const saldo = detalle?.factura_saldo_acreditable ?? null
  const conSaldo = saldo !== null && totalFactura !== null
  const hayNotas = conSaldo ? totalFactura - saldo > 0.004 : (notaEmitidaLocal || notaDisplay !== null)
  const acreditadaPorCompleto = conSaldo ? saldo <= 0.004 : hayNotas
  // El importe que se escribió, como número, o `null` si no sirve (vacío, no numérico, cero, de más o con más de 2 decimales).
  const importeTecleado = Number(importeNota.replace(',', '.'))
  const importeValido: number | null =
    importeNota.trim() !== '' && Number.isFinite(importeTecleado) && importeTecleado > 0
    && Math.abs(importeTecleado * 100 - Math.round(importeTecleado * 100)) < 1e-6
    && (!conSaldo || importeTecleado <= saldo + 0.004)
      ? Math.round(importeTecleado * 100) / 100 : null

  function abrirNota() {
    // Con notas ya emitidas la total no corresponde (copia la factura entera): arranca por el saldo.
    setNotaParcial(hayNotas)
    setImporteNota(conSaldo && hayNotas ? String(saldo) : '')
    setConfirmNota(true)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPantalla icono={ShoppingCart}>{detalle ? <>Venta {detalle.numero} <BadgeEstado tono={ESTADO_VENTA_TONO[detalle.estado] ?? 'neutro'}>{etiquetaDeEstadoDeVenta(detalle.estado)}</BadgeEstado></> : 'Venta'}</TituloPantalla>
        {detalle && (
          <div className="flex flex-wrap gap-2">
            {rutaDeTicket && (
              <Button size="sm" variant="outline" className={BOTON_TACTIL} onClick={() => imprimir(rutaDeTicket(detalle.id))}><Printer />Ticket</Button>
            )}
            {rutaDeRecibo && detalle.pagos.length > 0 && (
              <Button asChild size="sm" variant="outline" className={BOTON_TACTIL}><a href={rutaDeRecibo(detalle.id)} target="_blank" rel="noreferrer"><FileCheck />Recibo</a></Button>
            )}
            <Button asChild size="sm" variant="outline" className={BOTON_TACTIL}><Link to={rutaDeVentas}><ArrowLeft />Volver</Link></Button>
          </div>
        )}
      </div>

      {error && <p ref={errorRef} role="alert" tabIndex={-1} className="text-sm text-destructive outline-none">{error}</p>}

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
                        {p.referencia && <p className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-exito" />Ref: {p.referencia}</p>}
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
                          <p className="flex items-center gap-1.5 text-xs font-medium text-exito">
                            <CheckCircle2 className="size-3.5" />Pago acreditado.
                          </p>
                        ) : (
                          <Button size="sm" variant="outline" className={BOTON_TACTIL} disabled={qrEstado === 'creando'} onClick={cobrarConQr}>
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
                <p className="flex items-center gap-2 rounded-md border bg-muted/50 p-3 text-sm">
                  <ReceiptText className="size-4 text-exito" />Factura generada: {rutaDeFactura
                    ? <Link to={rutaDeFactura(detalle.factura_id as number)} className="font-semibold text-exito hover:underline">{detalle.factura_display}</Link>
                    : <span className="font-semibold">{detalle.factura_display}</span>}
                </p>
              )}
              {detalle.remito_id && rutaDeRemito && (
                <p className="flex items-center gap-2 rounded-md border bg-muted/50 p-3 text-sm"><PackageCheck className="size-4 text-primary" />Remito generado: <Link to={rutaDeRemito(detalle.remito_id)} className="font-semibold text-primary hover:underline">ver remito</Link></p>
              )}
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Artículos vendidos</CardTitle></CardHeader>
            <CardContent className="p-0">
              {/* Sin scroll horizontal: desde `lg` (1024 px) es la tabla; en un móvil (medido en Chromium: 386 px de mínimo contra los ~340 de la tarjeta) cada artículo es un bloque con su
                  etiqueta (`data-label`, que sale por CSS) y los totales van uno por línea. */}
              <table className="w-full text-sm max-lg:block">
                <thead className="border-b text-muted-foreground max-lg:hidden">
                  <tr>
                    <th className="p-3 text-left font-medium">Descripción</th>
                    <th className="p-3 text-right font-medium">Cant.</th>
                    <th className="p-3 text-right font-medium">Precio unit.</th>
                    <th className="p-3 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="max-lg:block">
                  {detalle.items.map((it, i) => (
                    <tr key={i} className="border-b last:border-0 max-lg:block max-lg:p-3">
                      <td className="p-3 max-lg:block max-lg:break-words max-lg:p-0 max-lg:font-medium">{it.nombre}</td>
                      <td data-label="Cantidad" className={`p-3 text-right ${FILA_MOVIL}`}>{it.qty}</td>
                      <td data-label="Precio unit." className={`p-3 text-right ${FILA_MOVIL}`}>{formatoMoneda(it.precio)}</td>
                      <td data-label="Subtotal" className={`p-3 text-right font-medium ${FILA_MOVIL}`}>{formatoMoneda(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-medium max-lg:block">
                  <tr className={TOTAL_MOVIL}><td colSpan={3} className="p-3 text-right text-muted-foreground max-lg:p-0">Subtotal</td><td className="p-3 text-right max-lg:p-0">{formatoMoneda(detalle.subtotal)}</td></tr>
                  {/* Las promociones aplicadas van una por fila. El `descuento` de la venta YA las incluye,
                      así que «Descuento» muestra sólo lo que quede (uno manual): no se cuenta dos veces. */}
                  {(detalle.promociones ?? []).map((promo, i) => (
                    <tr key={`promo-${i}`} className={TOTAL_MOVIL}>
                      <td colSpan={3} className="p-3 text-right text-muted-foreground max-lg:p-0 max-lg:text-left">
                        Promoción {promo.nombre}{promo.veces > 1 ? ` × ${promo.veces}` : ''}
                      </td>
                      <td className="p-3 text-right text-exito max-lg:p-0">− {formatoMoneda(promo.ahorro)}</td>
                    </tr>
                  ))}
                  {descuentoRestante > 0 && (
                    <tr className={TOTAL_MOVIL}><td colSpan={3} className="p-3 text-right text-muted-foreground max-lg:p-0">Descuento</td><td className="p-3 text-right text-destructive max-lg:p-0">− {formatoMoneda(descuentoRestante)}</td></tr>
                  )}
                  <tr className={`text-base ${TOTAL_MOVIL}`}><td colSpan={3} className="p-3 text-right font-semibold max-lg:p-0">TOTAL</td><td className="p-3 text-right font-semibold text-primary max-lg:p-0">{formatoMoneda(detalle.total)}</td></tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {(detalle.estado === 'cobrada' || detalle.estado === 'parcial') && detalle.factura_cae && (
            // 🔴 Con CAE la factura la tiene ARCA: anular acá no la deshace. Se revierte con la nota de crédito, y recién
            // después se anula la venta (el servidor contesta 409 si falta la nota).
            <p role="note" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              {acreditadaPorCompleto
                ? `La nota de crédito${notaDisplay ? ` ${notaDisplay}` : ''} está emitida: ya podés anular la venta.`
                : hayNotas && conSaldo
                  ? <>La factura {detalle.factura_display} está acreditada sólo en parte: faltan {formatoMoneda(saldo)} por acreditar. Para anular la venta hay que emitir antes una nota por ese saldo{puedeEmitirNota ? '.' : ': pedísela a un administrador.'}</>
                  : <>La factura {detalle.factura_display} la emitió ARCA (CAE {detalle.factura_cae}). Para anular la venta hay que emitir antes la nota de crédito{puedeEmitirNota ? '.' : ': pedísela a un administrador.'}</>}
            </p>
          )}

          {(detalle.estado === 'cobrada' || detalle.estado === 'parcial') && (
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              {!detalle.factura_id && (
                <>
                  <Button size="sm" variant="outline" className={BOTON_TACTIL} disabled={facturando} onClick={facturar}>
                    <ReceiptText />{facturando ? 'Facturando…' : 'Generar factura'}
                  </Button>
                  {rutaDeFacturaManual && (
                    <Button asChild size="sm" variant="ghost" className={BOTON_TACTIL}><Link to={rutaDeFacturaManual(detalle.id)}>Facturar con el formulario</Link></Button>
                  )}
                </>
              )}
              {!detalle.remito_id && rutaDeRemitoNuevo && <Button asChild size="sm" variant="outline" className={BOTON_TACTIL}><Link to={rutaDeRemitoNuevo}><PackageCheck />Generar remito</Link></Button>}
              {puedeEmitirNota && detalle.factura_id && detalle.factura_cae && !acreditadaPorCompleto && (
                <Button size="sm" variant="outline" className={BOTON_TACTIL} disabled={emitiendoNota} onClick={abrirNota}>
                  <FileMinus />{emitiendoNota ? 'Emitiendo…' : 'Emitir nota de crédito'}
                </Button>
              )}
              {puedeAnular && (
                <Button size="sm" variant="outline" className={`${BOTON_TACTIL} text-destructive hover:text-destructive`} onClick={() => setConfirmAnular(true)}><Ban />Anular venta</Button>
              )}
              {accionesExtra?.({ detalle, recargar: cargar })}
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

      <Dialog open={confirmNota} onOpenChange={setConfirmNota}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir nota de crédito</DialogTitle>
            <DialogDescription>
              Se emite ante ARCA y queda asociada a la factura {detalle?.factura_display}. No se puede deshacer.
              {conSaldo && <> Total de la factura {formatoMoneda(totalFactura)}{hayNotas ? <>; ya acreditado {formatoMoneda(totalFactura - saldo)}</> : null}; <strong>saldo acreditable {formatoMoneda(saldo)}</strong>.</>}
            </DialogDescription>
          </DialogHeader>
          {conSaldo && (
            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="tipo-nota" checked={!notaParcial} disabled={hayNotas}
                       onChange={() => setNotaParcial(false)} />
                Por el total de la factura{hayNotas ? ' (no disponible: ya tiene notas)' : ` (${formatoMoneda(totalFactura)})`}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="tipo-nota" checked={notaParcial} onChange={() => setNotaParcial(true)} />
                Por un importe
              </label>
              {notaParcial && (
                <div className="grid gap-1">
                  <Label htmlFor="importe-nota">Importe a acreditar (con IVA)</Label>
                  <Input id="importe-nota" inputMode="decimal" value={importeNota} autoFocus
                         onChange={(e) => setImporteNota(e.target.value)} aria-invalid={importeNota.trim() !== '' && importeValido === null} />
                  {importeNota.trim() !== '' && importeValido === null && (
                    <p role="alert" className="text-sm text-destructive">
                      Tiene que ser un monto mayor que cero, con hasta dos decimales y no más que el saldo ({formatoMoneda(saldo)}).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className={BOTON_TACTIL} onClick={() => setConfirmNota(false)}>Cancelar</Button>
            <Button className={BOTON_TACTIL} disabled={emitiendoNota || (notaParcial && importeValido === null)} onClick={emitirNota}>
              {emitiendoNota ? 'Emitiendo…' : 'Emitir nota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialogoTicket}
    </div>
  )
}

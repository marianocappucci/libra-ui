// Los componentes de LibraEdge en la pantalla (ADR-077): el cartel de un nodo sin conexión y las piezas de la bandeja de
// comprobantes pendientes. La lógica (la consulta compartida, los hooks y los textos) está en `nodo-offline.ts`.
import { useState } from 'react'
import { ReceiptText, WifiOff } from 'lucide-react'

import { api, ApiError } from './api-client'
import { AvisoEstado, BadgeEstado } from './badge-estado'
import {
  CODIGO_SIN_CONEXION, ETIQUETA_VENTA_SIN_CONEXION, MENSAJE_FACTURAR_AHORA_SIN_CONEXION, RUTA_FACTURAR_PENDIENTES_DEL_NODO,
  TEXTO_CARTEL_SIN_CONEXION, codigoDelError, marcarSinConexion, refrescarConexionDelNodo, useConexionDelNodo,
  useConsultarConexionDelNodo, ventasParaFacturar, type ResultadoFacturarPendientes,
} from './nodo-offline'
import { Button } from '@/components/ui/button'

/** El cartel fijo de un nodo sin conexión. Fuera de un nodo, o con conexión, no dibuja nada. Lo monta `createLayout`
 *  con `conexionDelNodo: true`; un producto con layout propio lo pone arriba del contenido. */
export function CartelSinConexion({ ruta: rutaPedida, intervaloMs, className }: { ruta?: string; intervaloMs?: number; className?: string } = {}) {
  const { sinConexion, aFacturar } = useConsultarConexionDelNodo({ ruta: rutaPedida, intervaloMs })
  if (!sinConexion) return null
  return (
    <AvisoEstado
      tono="atencion"
      role="status"
      data-slot="cartel-sin-conexion"
      className={`sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 bg-background ${className ?? ''}`}
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span>{TEXTO_CARTEL_SIN_CONEXION}</span>
      {aFacturar > 0 && <span className="font-medium">{ventasParaFacturar(aFacturar)}</span>}
    </AvisoEstado>
  )
}

/** La etiqueta de una fila de la bandeja que dejó una venta sin conexión. */
export function EtiquetaVentaSinConexion() {
  return <BadgeEstado tono="atencion"><WifiOff className="size-3.5" aria-hidden="true" />{ETIQUETA_VENTA_SIN_CONEXION}</BadgeEstado>
}

/** «Facturar ahora» de las ventas que el nodo dejó en la bandeja: `POST /api/nodo/facturar-pendientes` (lo mismo que
 *  hace sola la tanda automática). Deshabilitado sin conexión. `onFacturado` recarga la bandeja. */
export function BotonFacturarPendientesDelNodo({
  onFacturado, ruta: rutaPedida = RUTA_FACTURAR_PENDIENTES_DEL_NODO, size = 'sm',
}: {
  onFacturado?: (resultado: ResultadoFacturarPendientes) => void
  ruta?: string
  size?: 'sm' | 'default'
}) {
  const { sinConexion } = useConexionDelNodo()
  const [facturando, setFacturando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)

  async function facturar() {
    setFacturando(true)
    setMensaje(null)
    try {
      const r = await api.post<ResultadoFacturarPendientes>(rutaPedida)
      const partes = [r.facturadas.length === 1 ? '1 venta facturada' : `${r.facturadas.length} ventas facturadas`]
      if (r.errores.length > 0) partes.push(r.errores.length === 1 ? '1 con error' : `${r.errores.length} con error`)
      if (r.quedan > 0) partes.push(`quedan ${r.quedan}`)
      setMensaje({ texto: `${partes.join('; ')}.`, error: r.errores.length > 0 })
      void refrescarConexionDelNodo()
      onFacturado?.(r)
    } catch (err) {
      if (codigoDelError(err) === CODIGO_SIN_CONEXION) marcarSinConexion()
      setMensaje({ texto: err instanceof ApiError ? err.detail : 'Error de conexión.', error: true })
    } finally {
      setFacturando(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size={size} variant="outline" disabled={facturando || sinConexion} onClick={facturar}
        title={sinConexion ? MENSAJE_FACTURAR_AHORA_SIN_CONEXION : undefined}
      >
        <ReceiptText />{facturando ? 'Facturando…' : 'Facturar ahora'}
      </Button>
      {mensaje && <span role={mensaje.error ? 'alert' : 'status'} className={`text-xs ${mensaje.error ? 'text-destructive' : 'text-muted-foreground'}`}>{mensaje.texto}</span>}
    </span>
  )
}

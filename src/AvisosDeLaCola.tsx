// Los avisos de la cola de comprobantes del nodo (ADR-094): la etiqueta de estado de un pedido, el aviso «sin CPE válida» que el
// producto pone en la orden de carga o en el viaje, y el aviso del 202 `en_cola`. La lógica y los textos están en
// `cola-del-nodo.ts`; la bandeja, en `BandejaDeLaCola.tsx`.
import { TriangleAlert, X } from 'lucide-react'

import { AvisoEstado, BadgeEstado } from './badge-estado'
import {
  ESTADOS_ABIERTOS, ETIQUETA_DE_ESTADO, TONO_DE_ESTADO, TEXTO_CPE_EN_COLA, TEXTO_SE_EMITE_AL_VOLVER, TEXTO_SIN_CPE_VALIDA,
  esCpeEnCola, estaAbierto, pedidoDeCpeAbierto, pideRevision, useColaDelNodo,
  type EstadoDePedido, type PedidoDeCola, type RespuestaEnCola,
} from './cola-del-nodo'
import { cn } from './utils'
import { Button } from '@/components/ui/button'

/** La etiqueta de estado de un pedido de la cola. */
export function EtiquetaDePedido({ estado, className }: { estado: EstadoDePedido; className?: string }) {
  return <BadgeEstado tono={TONO_DE_ESTADO[estado]} data-estado={estado} className={className}>{ETIQUETA_DE_ESTADO[estado]}</BadgeEstado>
}

// Lo que dice el aviso según el estado de la CPE (el titular es siempre el mismo y no cambia: es el límite legal).
const DETALLE_SIN_CPE: Partial<Record<EstadoDePedido, string>> = {
  esperando: 'La carta de porte quedó en cola y se emite sola cuando vuelva la conexión.',
  emitiendo: 'Se está emitiendo ahora; hasta que ARCA la confirme no hay CPE válida.',
  a_revisar: 'ARCA no la aceptó o falló la emisión: hay que revisarla en la cola de comprobantes.',
  incierto: 'No se sabe si ARCA llegó a emitirla: consultala en ARCA y resolvelo en la cola de comprobantes.',
}

export type AvisoSinCpeValidaProps = {
  /** El pedido de CPE de esta carga, si el producto ya lo tiene a mano (de `useColaDelNodo`, de la copia del central…). */
  pedido?: Pick<PedidoDeCola, 'estado' | 'ultimo_error'> | null
  /** Sólo el estado, si es lo único que se sabe. */
  estado?: EstadoDePedido | null
  /** El motivo que dejó el pedido (el mensaje de ARCA); con `pedido` sale de `ultimo_error`. */
  motivo?: string
  /** En vez de `pedido`/`estado`: el `origen_id` del pedido de esta carga. El aviso busca solo su CPE abierta en la cola del nodo
   *  (`GET /api/nodo/cola?tipo=cpe`) y no dibuja nada si no hay. */
  origenId?: string | number
  /** Como `origenId`, para el producto que arma el `origen_id` de otra forma: LibraCargo usa `orden41:<uuid>` y deja el id de la orden
   *  en `datos.orden_id`, así que ahí va `coincide={(p) => p.datos.orden_id === orden.id}`. */
  coincide?: (pedido: PedidoDeCola) => boolean
  /** Dónde el producto montó la cola; sólo con `origenId` o `coincide`. */
  ruta?: string
  /** Cada cuánto vuelve a mirar la cola; sólo con `origenId` o `coincide`. */
  intervaloMs?: number
  className?: string
}

/** 🔴 **«Esta carga todavía no tiene CPE válida: no puede viajar hasta que se emita.»** El producto lo pone en la orden de carga o en
 *  el viaje cuando su CPE está en cola (`esperando`, `emitiendo`) o en revisión (`a_revisar`, `incierto`).
 *
 *  Con una CPE emitida, descartada o sin pedido **no dibuja nada**. Es `role="alert"` y rojo: es un límite legal, no una demora.
 *
 *      <AvisoSinCpeValida pedido={pedido} />                                          // si ya lo tenés
 *      <AvisoSinCpeValida coincide={(p) => p.datos.orden_id === orden.id} />          // si no: lo busca en la cola del nodo
 *
 *  Con `origenId` o `coincide` mientras todavía no sabe, o si la cola no contesta, tampoco dibuja nada: no avisa lo que no sabe. */
export function AvisoSinCpeValida({ pedido, estado, motivo, origenId, coincide, ruta, intervaloMs, className }: AvisoSinCpeValidaProps) {
  const quien = coincide ?? origenId
  const buscar = pedido === undefined && estado === undefined && quien !== undefined
  const { pedidos } = useColaDelNodo({ ruta, intervaloMs, tipo: 'cpe', estados: ESTADOS_ABIERTOS, habilitada: buscar })

  const encontrado = buscar ? pedidoDeCpeAbierto(pedidos, quien) : undefined
  const actual = pedido ?? (estado ? { estado, ultimo_error: motivo ?? '' } : encontrado)
  if (!actual || !estaAbierto(actual.estado)) return null
  const detalle = DETALLE_SIN_CPE[actual.estado]
  const porQue = motivo ?? actual.ultimo_error

  return (
    <AvisoEstado
      tono="negativo"
      role="alert"
      data-slot="aviso-sin-cpe-valida"
      data-estado={actual.estado}
      className={cn('flex items-start gap-3', className)}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{TEXTO_SIN_CPE_VALIDA}</p>
        {detalle && <p>{detalle}</p>}
        {porQue && pideRevision(actual.estado) && <p className="[overflow-wrap:anywhere]">{porQue}</p>}
      </div>
    </AvisoEstado>
  )
}

/** El aviso del 202 `en_cola`: «Se emite al volver la conexión.» No es un toast flotante —el kit no tiene— sino un bloque que el
 *  producto pone donde estaba el comprobante que no se pudo mostrar (arriba del detalle de la reserva o de la orden). Se cierra con
 *  `onCerrar`. Para una carta de porte es rojo y `role="alert"`, con el aviso legal; para una factura, ámbar y `role="status"`.
 *
 *      const { aviso, registrar, cerrar } = useAvisoDeEnCola()
 *      …
 *      <AvisoEnCola aviso={aviso} onCerrar={cerrar} />
 */
export function AvisoEnCola({ aviso, onCerrar, className }: { aviso: RespuestaEnCola | null; onCerrar?: () => void; className?: string }) {
  if (!aviso) return null
  const cpe = esCpeEnCola(aviso)
  const revision = pideRevision(aviso.estado)
  // En una revisión el mensaje del emisor es lo que importa (qué dijo ARCA); en una espera, el motivo (por qué sigue esperando).
  const detalle = revision ? (aviso.mensaje || aviso.motivo) : aviso.motivo
  return (
    <AvisoEstado
      tono={cpe ? 'negativo' : 'atencion'}
      role={cpe ? 'alert' : 'status'}
      data-slot="aviso-en-cola"
      className={cn('flex items-start gap-3', className)}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">{revision ? 'Quedó en la cola para revisar.' : TEXTO_SE_EMITE_AL_VOLVER}</p>
        {cpe && <p>{TEXTO_CPE_EN_COLA}</p>}
        {detalle && <p className="[overflow-wrap:anywhere]">{detalle}</p>}
      </div>
      {onCerrar && (
        <Button type="button" size="sm" variant="ghost" aria-label="Cerrar aviso" onClick={onCerrar}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      )}
    </AvisoEstado>
  )
}

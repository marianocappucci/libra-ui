// Las etiquetas de una reserva dada en un nodo sin conexión (ADR-094): «Sin subir al central» y «En conflicto». La lógica y los textos
// (y por qué la primera no se llama «Provisoria») están en `reservas-del-nodo.ts`.
import { CalendarX, CloudUpload } from 'lucide-react'

import { BadgeEstado } from './badge-estado'
import {
  AYUDA_EN_CONFLICTO, AYUDA_SIN_SUBIR, ETIQUETA_EN_CONFLICTO, ETIQUETA_SIN_SUBIR, esReservaProvisoria, estaEnConflicto,
} from './reservas-del-nodo'

/** La reserva se dio en este nodo y todavía no subió al central (id negativo). Azul: está en camino. */
export function EtiquetaReservaSinSubir({ className }: { className?: string }) {
  return (
    <BadgeEstado tono="curso" title={AYUDA_SIN_SUBIR} data-slot="etiqueta-reserva-sin-subir" className={className}>
      <CloudUpload className="size-3.5" aria-hidden="true" />{ETIQUETA_SIN_SUBIR}
    </BadgeEstado>
  )
}

/** La reserva chocó con otra que llegó antes al central y no ocupa la cancha. Ámbar, como el aviso de conflictos de LibraClub: no frena
 *  nada, pide que alguien la resuelva. */
export function EtiquetaReservaEnConflicto({ className }: { className?: string }) {
  return (
    <BadgeEstado tono="atencion" title={AYUDA_EN_CONFLICTO} data-slot="etiqueta-reserva-en-conflicto" className={className}>
      <CalendarX className="size-3.5" aria-hidden="true" />{ETIQUETA_EN_CONFLICTO}
    </BadgeEstado>
  )
}

/** Las etiquetas que le tocan a una reserva, según su `id` y su `estado`: ninguna, una o las dos (una reserva del nodo puede haber
 *  quedado en conflicto en el central y seguir con id negativo en el nodo hasta que baje la definitiva). Se pone al lado de la
 *  etiqueta de estado del producto:
 *
 *      <EtiquetasDeReservaDelNodo id={r.id} estado={r.estado} />
 */
export function EtiquetasDeReservaDelNodo({ id, estado, className }: { id?: number | string | null; estado?: string | null; className?: string }) {
  const sinSubir = esReservaProvisoria(id)
  const enConflicto = estaEnConflicto(estado)
  if (!sinSubir && !enConflicto) return null
  return (
    <span className={className ?? 'inline-flex flex-wrap items-center gap-1.5'} data-slot="etiquetas-reserva-del-nodo">
      {sinSubir && <EtiquetaReservaSinSubir />}
      {enConflicto && <EtiquetaReservaEnConflicto />}
    </span>
  )
}

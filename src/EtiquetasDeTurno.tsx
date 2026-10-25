// Las etiquetas de un turno atendido en un nodo sin conexión (ADR-095): «Atendido sin conexión» y «A revisar». La lógica y los textos
// (los motivos en lenguaje simple, y por qué una atención que ya subió no es «atendida sin conexión») están en `turnos-del-nodo.ts`.
import { ClipboardCheck, CloudUpload } from 'lucide-react'

import { EtiquetaDelNodo } from './EtiquetaDelNodo'
import {
  AYUDA_ATENDIDO_SIN_CONEXION, AYUDA_A_REVISAR, ETIQUETA_ATENDIDO_SIN_CONEXION, ETIQUETA_A_REVISAR, textoDelMotivo,
} from './turnos-del-nodo'

/** La atención está en esta PC y todavía no subió a la web. Azul: está en camino. */
export function EtiquetaAtendidoSinConexion({ className }: { className?: string }) {
  return (
    <EtiquetaDelNodo
      tono="curso" icono={CloudUpload} texto={ETIQUETA_ATENDIDO_SIN_CONEXION} ayuda={AYUDA_ATENDIDO_SIN_CONEXION}
      slot="etiqueta-turno-atendido-sin-conexion" className={className}
    />
  )
}

/** Subió, pero en la web el turno cambió mientras tanto. Ámbar, como «En conflicto» de una reserva: no frena nada, pide que alguien lo
 *  acomode. Con el `motivo` de libragenda, el `title` dice qué pasó en lenguaje simple. */
export function EtiquetaTurnoARevisar({ motivo, className }: { motivo?: string | null; className?: string }) {
  return (
    <EtiquetaDelNodo
      tono="atencion" icono={ClipboardCheck} texto={ETIQUETA_A_REVISAR} ayuda={motivo ? textoDelMotivo(motivo).explicacion : AYUDA_A_REVISAR}
      slot="etiqueta-turno-a-revisar" className={className}
    />
  )
}

export type EtiquetasDeTurnoDelNodoProps = {
  /** El turno tiene una atención hecha en esta PC que todavía no subió (en el nodo: tiene fila propia sin aplicar). */
  atendidoSinConexion?: boolean
  /** El turno está en la lista «a revisar» (`turnos_a_revisar`): subió y en la web cambió. */
  aRevisar?: boolean
  /** El motivo de libragenda (`movido`, `cancelado`…) para el `title` de «A revisar». */
  motivo?: string | null
  className?: string
}

/** La etiqueta que le toca a un turno: ninguna, «Atendido sin conexión» o «A revisar». **Nunca las dos**: si ya subió y quedó a revisar, ya
 *  no está pendiente de subir. Va al lado de la etiqueta de estado de la agenda:
 *
 *      <EtiquetasDeTurnoDelNodo atendidoSinConexion={t.atendido_en_la_pc} aRevisar={t.a_revisar} motivo={t.motivo} />
 */
export function EtiquetasDeTurnoDelNodo({ atendidoSinConexion, aRevisar, motivo, className }: EtiquetasDeTurnoDelNodoProps) {
  if (!atendidoSinConexion && !aRevisar) return null
  return (
    <span className={className ?? 'inline-flex flex-wrap items-center gap-1.5'} data-slot="etiquetas-turno-del-nodo">
      {aRevisar ? <EtiquetaTurnoARevisar motivo={motivo} /> : <EtiquetaAtendidoSinConexion />}
    </span>
  )
}

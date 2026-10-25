// La pastilla de lo que pasó en un nodo sin conexión (ADR-094 y ADR-095): un tono, un ícono, dos o tres palabras y, en el `title`, lo que
// quiere decir. Es lo común a «Sin subir al central» y «En conflicto» de una reserva, y a «Atendido sin conexión», «A revisar» y
// «Provisorio»: el mismo `BadgeEstado` con el ícono chico, para que todas se lean como de la misma familia. Interna del kit (no está en
// `exports`); los productos usan las etiquetas.
import type { ComponentType } from 'react'

import { BadgeEstado, type TonoEstado } from './badge-estado'

export function EtiquetaDelNodo({ tono, icono: Icono, texto, ayuda, slot, className }: {
  tono: TonoEstado
  icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  texto: string
  /** Lo que significa, en el `title`. */
  ayuda: string
  /** El `data-slot` de la pastilla, para los tests y los guards de los productos. */
  slot: string
  className?: string
}) {
  return (
    <BadgeEstado tono={tono} title={ayuda} data-slot={slot} className={className}>
      <Icono className="size-3.5" aria-hidden="true" />{texto}
    </BadgeEstado>
  )
}

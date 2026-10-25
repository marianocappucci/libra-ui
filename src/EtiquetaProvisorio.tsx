// La etiqueta «Provisorio» de un paciente o un cliente dado de alta en un nodo sin conexión (ADR-095). La regla del id y los textos están en
// `ids-provisorios.ts`.
import { UserRoundPlus } from 'lucide-react'

import { EtiquetaDelNodo } from './EtiquetaDelNodo'
import { ETIQUETA_PROVISORIO, ayudaDelProvisorio, esIdProvisorio, type PersonaProvisoria } from './ids-provisorios'

/** La ficha se dio de alta sin conexión y tiene un número provisorio. Azul: el definitivo está en camino. */
export function EtiquetaProvisorio({ persona, className }: { persona?: PersonaProvisoria; className?: string }) {
  return (
    <EtiquetaDelNodo
      tono="curso" icono={UserRoundPlus} texto={ETIQUETA_PROVISORIO} ayuda={ayudaDelProvisorio(persona)}
      slot="etiqueta-provisorio" className={className}
    />
  )
}

/** «Provisorio» si el `id` es el de un alta del nodo (negativo: `-3` o `"-3"`) y nada si no. Va al lado del nombre, en la ficha y en la lista:
 *
 *      <EtiquetaDePersonaDelNodo id={paciente.id} persona="paciente" />
 *
 *  Un `id` que falta no es provisorio: no dibuja nada. */
export function EtiquetaDePersonaDelNodo({ id, persona, className }: { id?: number | string | null; persona?: PersonaProvisoria; className?: string }) {
  if (!esIdProvisorio(id)) return null
  return <EtiquetaProvisorio persona={persona} className={className} />
}

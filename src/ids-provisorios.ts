// Los ids provisorios de lo que se da de alta en un nodo sin conexión (LibraEdge ADR-021; ADR-095 del kit), y los textos de la etiqueta
// «Provisorio» de un paciente o un cliente.
//
// ## Qué es un id provisorio
//
// Lo que se carga en la PC del local sin conexión (una reserva, un cliente, un paciente) recibe ahí un id **negativo**: `-3`, o el
// texto `"-3"` cuando los ids de la tabla son texto (libragenda: uuid en GestioLibra, `p-042` en MedLibra). El id definitivo lo pone
// la web al recibirlo, y recién ahí baja a la PC. Una forma común de reconocerlos: la usan la reserva sin subir (`reservas-del-nodo`),
// el paciente o cliente «Provisorio» (`EtiquetaProvisorio`) y cualquier otro alta del nodo.
//
// ## Cómo se llama en pantalla
//
// Una persona dada de alta sin conexión es «Provisorio»: así lo decidió el humano (2026-10-25, «número provisorio con cartel»). La
// reserva de LibraClub con id negativo, en cambio, **no** se llama «Provisoria» (ver `reservas-del-nodo`): ahí la palabra ya es el turno
// retenido esperando el pago, y el cajero vería dos con significados opuestos. Un paciente o un cliente no tiene ese otro sentido.

/** ¿Es un id que se dio en un nodo y todavía no tiene el definitivo? Los ids de la web nunca son negativos. Acepta el número `-3` y el
 *  texto `"-3"`; lo que no es un entero negativo (`0`, vacío, `"p-042"`, `-1.5`, `null`) no es provisorio. */
export function esIdProvisorio(id: number | string | null | undefined): boolean {
  if (id === null || id === undefined || id === '') return false
  const n = Number(id)
  return Number.isInteger(n) && n < 0
}

export type PersonaProvisoria = 'paciente' | 'cliente'

export const ETIQUETA_PROVISORIO = 'Provisorio'

/** Lo que explica la etiqueta (el `title` y el texto de ayuda). Sin jerga: «esta PC», «la web», «cuando vuelva la conexión». */
export function ayudaDelProvisorio(persona?: PersonaProvisoria): string {
  const quien = persona === 'paciente' ? 'Este paciente' : persona === 'cliente' ? 'Este cliente' : 'Esta ficha'
  return `${quien} se dio de alta sin conexión y tiene un número provisorio. Recibe el definitivo cuando vuelva la conexión; si ya estaba cargado en la web, se une a su ficha.`
}

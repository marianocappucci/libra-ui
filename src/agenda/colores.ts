/** Un color por carril, para que la semana se lea de un vistazo.
 *
 *  Un **carril** es lo que agrupa a los eventos del calendario: una cuadrilla
 *  en LibraDesk, un recurso (profesional, box, sillón) en las agendas de
 *  turnos. Es lo que convierte la grilla en un calendario: sin color, siete
 *  columnas de chips grises obligan a leer el nombre en cada uno para saber
 *  quién atiende qué, que es justamente la pregunta que la vista tiene que
 *  contestar sin leer.
 *
 *  🔴 **Las clases van escritas enteras y a mano**, no armadas con plantillas
 *  (`` `bg-${color}-100` ``). Tailwind escanea el texto del fuente para decidir
 *  qué CSS generar: una clase construida en runtime no aparece en ningún lado y
 *  el color sale sin estilo.
 *
 *  ⚠️ Y por eso mismo, **el producto consumidor tiene que escanear este
 *  paquete**: su `@source` de Tailwind debe incluir `node_modules/libra-ui`, o
 *  estas ocho paletas no se emiten y los bloques salen sin fondo. Es la misma
 *  condición que ya tienen el resto de los componentes de acá.
 *
 *  Ocho y no más: son los carriles que puede tener un negocio de este tamaño
 *  con margen. Si algún día hay nueve, la novena repite el color de la primera
 *  — preferible a un noveno tono que no se distinga de sus vecinos.
 */

/** El bloque de un evento: fondo, texto y borde, en claro y en oscuro. */
const CHIP = [
  'bg-sky-100 text-sky-950 border-sky-300 dark:bg-sky-950/60 dark:text-sky-50 dark:border-sky-800',
  'bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-950/60 dark:text-amber-50 dark:border-amber-800',
  'bg-emerald-100 text-emerald-950 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-50 dark:border-emerald-800',
  'bg-violet-100 text-violet-950 border-violet-300 dark:bg-violet-950/60 dark:text-violet-50 dark:border-violet-800',
  'bg-rose-100 text-rose-950 border-rose-300 dark:bg-rose-950/60 dark:text-rose-50 dark:border-rose-800',
  'bg-teal-100 text-teal-950 border-teal-300 dark:bg-teal-950/60 dark:text-teal-50 dark:border-teal-800',
  'bg-orange-100 text-orange-950 border-orange-300 dark:bg-orange-950/60 dark:text-orange-50 dark:border-orange-800',
  'bg-blue-100 text-blue-950 border-blue-300 dark:bg-blue-950/60 dark:text-blue-50 dark:border-blue-800',
]

/** El puntito de la referencia. Mismo orden que `CHIP`, un tono más saturado
 *  porque cuatro píxeles de `-100` no se ven. */
const PUNTO = [
  'bg-sky-400',
  'bg-amber-400',
  'bg-emerald-400',
  'bg-violet-400',
  'bg-rose-400',
  'bg-teal-400',
  'bg-orange-400',
  'bg-blue-400',
]

/** Por índice en la lista de carriles y no por `id`: dos recursos con ids 3 y
 *  11 caerían en el mismo color con un `id % 8` aunque sean los dos únicos del
 *  negocio. Por posición, los primeros ocho siempre se distinguen entre sí. */
export function claseChip(indice: number): string {
  return CHIP[indice % CHIP.length]
}

export function clasePunto(indice: number): string {
  return PUNTO[indice % PUNTO.length]
}

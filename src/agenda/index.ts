/** El calendario compartido de la familia Libra.
 *
 *  Salió de LibraDesk el 2026-08-22, al pedir el humano *"en gestiolibra hay
 *  que importar la agenda que usa libradesk con su ui y su mecanismo"*. Se
 *  extrajo en vez de copiarse: dos calendarios con la misma forma divergen, y
 *  el de LibraDesk ya llevaba tres rondas de correcciones reportadas a mano
 *  (el encabezado pegado, las flechas que se corrían, el racimo de bloques
 *  superpuestos) que la copia habría tenido que volver a pagar.
 *
 *  ## Qué es de acá y qué es de cada producto
 *
 *  **De acá**: la aritmética de días, la paleta por posición, el reparto de
 *  ancho entre bloques que se pisan, la rejilla horaria, las vistas de semana y
 *  de mes, el chip, la barra de navegación y la referencia de colores.
 *
 *  **Del producto**: de dónde salen los datos (el endpoint es distinto en cada
 *  uno), qué es un evento (un trabajo de cuadrilla, un turno), a dónde linkea,
 *  qué filtros tiene la pantalla, y **la vista de día** — que es una rejilla
 *  con una columna por carril, y el encabezado de esa columna es justamente lo
 *  más específico de cada producto (en LibraDesk lleva la patente del vehículo
 *  y el botón de la hoja de ruta).
 *
 *  El producto arma `EventoRejilla[]` por día y esto los dibuja.
 */
export { claseChip, clasePunto } from './colores'
export { colocar, minutos, ventanaHoraria, type Colocado } from './colocacion'
export {
  NOMBRES_DIAS, celdasGrillaMes, diaCorto, diaLargo, hora, hoyLocal,
  inicioGrillaMes, lunesDe, mesLargo, mismoMes, rangoSemana, sumarDias,
  sumarMeses,
} from './fechas'
export { ChipEvento } from './chip'
export { NavegadorCalendario, ReferenciaDeColores } from './navegacion'
export {
  RejillaHoraria, type ColumnaRejilla, type EventoRejilla,
} from './rejilla-horaria'
export { VistaMes } from './vista-mes'
export { VistaSemana } from './vista-semana'
export {
  LABEL_VISTA, VISTAS, correrVista, diaDeLaUrl, rangoDeVista, tituloDeVista,
  vistaDeLaUrl, type Vista,
} from './vistas'

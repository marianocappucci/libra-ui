/** Las tres vistas del calendario y la aritmética que las distingue.
 *
 *  En archivo aparte de `navegacion.tsx` por lo mismo que `colocacion.ts` está
 *  aparte de la rejilla: se puede probar sin montar nada, y exportar funciones
 *  desde un archivo que también exporta componentes rompe el fast-refresh de
 *  React.
 */
import {
  celdasGrillaMes, diaLargo, inicioGrillaMes, lunesDe, mesLargo, rangoSemana,
  sumarDias, sumarMeses,
} from './fechas'

export type Vista = 'dia' | 'semana' | 'mes'

export const VISTAS: readonly Vista[] = ['dia', 'semana', 'mes']

export const LABEL_VISTA: Record<Vista, string> = {
  dia: 'Día', semana: 'Semana', mes: 'Mes',
}

/** La vista que pide la URL, o `semana` si pide cualquier otra cosa.
 *
 *  La semana es el default porque es lo que hace que esto sea un calendario y
 *  no un listado: se ve hoy **y los próximos**. El día sigue a un click de
 *  distancia y es a donde llevan todos los encabezados de la grilla.
 */
export function vistaDeLaUrl(crudo: string | null): Vista {
  return VISTAS.includes(crudo as Vista) ? (crudo as Vista) : 'semana'
}

/** El día que pide la URL, o `porDefecto` si no es un `YYYY-MM-DD`. */
export function diaDeLaUrl(crudo: string | null, porDefecto: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(crudo ?? '') ? crudo! : porDefecto
}

/** El rango que hay que pedir para dibujar cada vista.
 *
 *  El mes pide **la grilla, no el mes**: arranca en el lunes anterior al día 1
 *  y llega hasta el domingo que cierra la última semana. Pedir sólo el mes
 *  dejaría esas celdas de los bordes vacías aunque tengan eventos — y son días
 *  reales.
 */
export function rangoDeVista(vista: Vista, dia: string): { desde: string; dias: number } {
  if (vista === 'semana') return { desde: lunesDe(dia), dias: 7 }
  if (vista === 'mes') return { desde: inicioGrillaMes(dia), dias: celdasGrillaMes(dia) }
  return { desde: dia, dias: 1 }
}

/** Cuánto se mueve la flecha en cada vista. */
export function correrVista(vista: Vista, dia: string, signo: 1 | -1): string {
  if (vista === 'semana') return sumarDias(dia, 7 * signo)
  if (vista === 'mes') return sumarMeses(dia, signo)
  return sumarDias(dia, signo)
}

/** El rótulo grande de la barra de navegación. */
export function tituloDeVista(vista: Vista, dia: string): string {
  if (vista === 'semana') return rangoSemana(lunesDe(dia))
  if (vista === 'mes') return mesLargo(dia)
  return diaLargo(dia)
}

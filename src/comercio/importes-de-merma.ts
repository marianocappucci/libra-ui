// Qué dice el «Importe» de una merma en el historial de movimientos de stock (ADR-063 del kit, motor ADR-059): lo comparten `StockMovimientos` (la página propia) y `Stock` (el historial
// embebido). La celda que lo dibuja está en `importe-de-merma.tsx` (aparte, para no mezclar funciones y componentes en un mismo módulo).
//
// **Se detecta por los datos, no por una prop.** El motor suma `costo_unitario`, `costo_total` y `sin_costo` a cada fila sólo si el producto prende `con_costo_de_merma`, y un
// producto que no deja ver costos a un rol SACA las claves de la respuesta (`SinCostos` en VentaLibra). Es el criterio de `Compras`: el kit oculta sólo los importes que el backend
// no manda. Con las claves ausentes —un motor viejo, un rol sin `costos.ver`— no aparece la columna ni nada.
import { formatoMoneda } from '../formatos'
import type { MovimientoStock } from './tipos'

/** ¿El backend mandó los importes? Basta con que UNA fila traiga alguna de las claves (aunque sea en `null`: el motor las manda en todas las filas, y en los tipos que no son merma valen `null`). */
export function traeImportes(movimientos: MovimientoStock[]): boolean {
  return movimientos.some((m) => m.costo_total !== undefined || m.costo_unitario !== undefined || m.sin_costo !== undefined)
}

/** Lo que dice la columna de una fila: el importe de la merma, `sinCosto` si es una merma sin costo cargado, o `null` (celda vacía) para cualquier otro movimiento. */
export function importeDeMovimiento(m: MovimientoStock): { importe: string | null; sinCosto: boolean } | null {
  if (m.costo_total !== undefined && m.costo_total !== null) return { importe: formatoMoneda(m.costo_total), sinCosto: false }
  if (m.sin_costo === true) return { importe: null, sinCosto: true }
  return null
}

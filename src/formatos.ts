/**
 * Cómo se escriben los **números** en pantalla, **para toda la familia Libra**:
 * la plata y las cantidades, siempre en es-AR (`1.234,56`).
 *
 * Vive en el nivel general del kit, al lado de `fechas`, y no dentro de
 * `comercio/`: una cantidad o un importe lo muestra cualquier producto, no sólo
 * los de comercio.
 *
 * ## Por qué existe este archivo
 *
 * Cada pantalla traía su copia del formateador (`formatCurrency`, `moneda`,
 * `numero`): veinticinco de plata y cuatro de cantidades, todas iguales hasta
 * que una dejaba de serlo. Es lo que pasó con las cantidades de Compras, que
 * salían con el «.0» del motor («6.0») porque la copia de esa pantalla no
 * existía y se mostraba el texto crudo. Con una sola definición el arreglo es
 * uno.
 *
 * ## Por qué las cantidades no recortan decimales
 *
 * El motor ya las redondeó a la escala de la unidad (0 decimales para unidades,
 * 3 para kilos, hasta 6 en otras). Un tope más bajo que el suyo muestra como 0
 * una cantidad que no lo es (0,0004 de una unidad de 6 decimales). Por eso
 * `maximumFractionDigits: 10`: lo que sobra no se imprime (`Intl` no agrega
 * ceros), lo que hay se ve entero.
 *
 * Los porcentajes y los indicadores con un decimal a propósito
 * (`TarjetaIndicador`, `Margen`) **no** son cantidades: tienen su propio tope y
 * no pasan por acá.
 */

const MONEDA = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

// Se construyen una sola vez: `Intl.NumberFormat` es caro de instanciar y estas
// funciones se llaman por cada celda de cada tabla.
const CANTIDAD = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 10 })

/** `$ 1.234,56`, como lo escribían las pantallas — cada una con su copia. */
export function formatoMoneda(valor: number): string {
  return MONEDA.format(valor)
}

/** Una cantidad como la lee una persona: `6`, `1,5`, `1.250`. El motor las manda como texto decimal (`"6.0"`) y
 *  ya redondeadas a la escala de la unidad, así que no se recortan decimales (una de 6 decimales no muestra 0,0004 como 0).
 *  Lo que no es un número finito se devuelve como vino, para no esconder un dato raro detrás de un «NaN». */
export function formatoCantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isFinite(n) ? CANTIDAD.format(n) : String(valor)
}

/**
 * El día de hoy, y la aritmética de días, **para toda la familia Libra**.
 *
 * Es el espejo de `services/fecha.py` del backend, que se apoya en el
 * `_ar_now()` de LibraCore. Tener dos definiciones de "hoy" —una en el servidor
 * y otra en el navegador— es volver a tener el problema, más difícil de ver.
 *
 * ## Por qué existe este archivo
 *
 * 🔴 `new Date().toISOString().slice(0, 10)` **da la fecha en UTC**. A las
 * 21:00 de Argentina ya es el día siguiente en Londres, así que toda pantalla
 * que proponía "hoy" de esa forma proponía **mañana** durante las últimas tres
 * horas de cada día. Y no se ve: es una fecha plausible, prellenada en un campo
 * que nadie mira dos veces. Se descubre recién cuando no cierra un listado por
 * día, o cuando un movimiento de cuenta corriente aparece un día adelantado del
 * comprobante que lo originó.
 *
 * El backend cerró este mismo defecto el 2026-08-23 —92 llamadas repartidas en
 * seis productos— pero la barrida no cruzó al frontend. Este archivo es esa
 * mitad.
 *
 * ## Por qué la zona es fija y no la del navegador
 *
 * La regla del ecosistema (2026-08-12) es **UTC-3 fijo, sin horario de
 * verano**, no "la zona de quien mira". Un `getFullYear()/getMonth()/getDate()`
 * también arregla el corrimiento de las 21:00, pero deja que la fecha del
 * comprobante la decida la máquina del cliente: una notebook de viaje, o
 * simplemente mal configurada, vuelve a emitir con la fecha equivocada y esta
 * vez sin ninguna franja horaria que lo delate.
 *
 * ## Por qué la aritmética se ancla al mediodía UTC
 *
 * Sumarle días a una fecha local se corre una hora en los saltos de horario de
 * verano de otros husos, y una hora alcanza para caer en el día equivocado.
 * Anclando al mediodía UTC no hay corrimiento posible: ningún huso del mundo
 * está a más de 12 horas de UTC, así que el día nunca cambia.
 */

/** UTC-3 fijo. Argentina no aplica horario de verano. */
export const ZONA_AR = 'America/Argentina/Buenos_Aires'

/**
 * `en-CA` formatea como `aaaa-mm-dd`, que es exactamente ISO 8601.
 *
 * Se construye una sola vez: `Intl.DateTimeFormat` es caro de instanciar y
 * estas funciones se llaman en el render de cualquier pantalla con un
 * `<input type="date">`.
 */
const ISO_AR = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_AR,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Hoy en Argentina, en ISO (`aaaa-mm-dd`).
 *
 * ISO y no `dd-mm-aaaa`: el formato con guiones es **de presentación** y vive
 * en el formateador de cada producto. Esto es lo que va en el `value` de un
 * `<input type="date">` y en los parámetros de fecha de la API, que siguen en
 * ISO 8601 por regla del proyecto.
 */
export function hoyISO(): string {
  return ISO_AR.format(new Date())
}

/** Un `aaaa-mm-dd` a `Date` anclada al mediodía UTC. Ver la nota de arriba. */
function aFecha(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia, 12))
}

/**
 * `iso` corrido `n` días. `n` negativo va para atrás.
 *
 * Opera sobre el `aaaa-mm-dd` y devuelve otro: no toma ni devuelve un instante,
 * porque un día del calendario no es un instante.
 */
export function sumarDiasISO(iso: string, n: number): string {
  const d = aFecha(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Hoy en Argentina, corrido `n` días. `enDiasISO(30)` es el vencimiento a 30
 * días de un presupuesto emitido hoy.
 *
 * 🔴 No es lo mismo que `d.setDate(d.getDate() + n)` sobre un `new Date()` y
 * después `toISOString()`: eso arrastra el mismo corrimiento a UTC que
 * `hoyISO()` viene a evitar, sólo que ahora escondido detrás de una suma que
 * parece inocente.
 */
export function enDiasISO(n: number): string {
  return sumarDiasISO(hoyISO(), n)
}

/**
 * El primer día del mes en curso en Argentina, en ISO. El arranque del rango
 * por defecto de casi todo reporte.
 *
 * 🔴 Se deriva de `hoyISO()` y no de
 * `new Date(d.getFullYear(), d.getMonth(), 1).toISOString()`. Aquél **hoy no
 * falla en Argentina** —la medianoche local del día 1 es la mañana del día 1 en
 * UTC, así que el recorte da el día correcto— y por eso sobrevivió a la barrida
 * anterior. Pero da el día anterior en cualquier huso de offset positivo, y
 * sobre todo decide **qué mes** es con la zona del navegador: a las 21:00 del
 * 31 de agosto empieza a decir que el mes en curso es septiembre.
 */
export function primerDiaDelMesISO(): string {
  return `${hoyISO().slice(0, 7)}-01`
}

/**
 * El día de hoy, la aritmética de días y **cómo se escribe una fecha en pantalla**, para toda la familia Libra.
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
 *
 * ## Las fechas para mostrar (0.146.0, ADR-058)
 *
 * Hasta 0.145.0 este archivo sólo tenía lo de arriba y decía que `dd-mm-aaaa` «vive en el formateador de cada producto». Cada producto
 * traía el suyo en `@/lib/fechas` (ocho, de los cuales cinco eran el mismo código con otro comentario) y el kit se lo pedía prestado con
 * ese alias. Ahora es de acá: `fecha`, `fechaHora`, `hora` y `horaConSegundos`, más `fechaDeTexto` y `fechaHoraDeTexto` para el texto
 * sin zona. El kit ya no importa `@/lib/fechas`.
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

// ── Para mostrar: `dd-mm-aaaa` ──────────────────────────────────────────────────────────────────────────────────────────────────
//
// La API habla ISO 8601 y `dd-mm-aaaa` es **sólo presentación** (regla del ecosistema, 2026-08-12): la base sigue guardando ISO, los parámetros de
// fecha de las URLs siguen en ISO y los `<input type="date">` no se tocan. Este es el único lugar del kit donde se escribe una fecha para una persona.

/** Un `aaaa-mm-dd` pelado, tal como lo serializa una columna `date`. */
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** `aaaa-mm-dd HH:MM[:SS]`: lo que el backend guarda **sin zona**. Acepta el espacio y la `T`: la misma columna sale con espacio por SQLite y con
 *  `T` por PostgreSQL. */
const FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/

/** Un ISO que trae zona explícita (`Z` o `-03:00`).
 *
 *  🔴 Ése SÍ es un instante y hay que convertirlo, no reordenarle el texto. Un `timestamptz` se serializa en la zona de la **sesión**, así que la misma
 *  columna puede salir `…Z` o `…-03:00` según dónde corra el motor. Reordenar el texto de un `2026-08-22T01:00:00Z` mostraría el 22, cuando en
 *  Argentina son las 22:00 del 21. Con offset se convierte; sin offset (naive, ya en hora de Argentina) se reordena. */
const CON_ZONA = /(?:Z|[+-]\d{2}:?\d{2})$/

type Valor = string | Date | null | undefined

// Se construyen una sola vez, como `ISO_AR`: `Intl.DateTimeFormat` es caro de instanciar y estas funciones se llaman por cada celda de cada tabla.
// 🔴 `formatToParts` y no el `format()` de `es-AR`: ése devuelve `22/08/2026`, **con barras**, y la convención es con guiones. Leyendo el código,
// `es-AR` + `2-digit` parece que ya diera el formato pedido; lo agarró el test. `hourCycle: 'h23'` y no `hour12: false`: éste último escribe
// «24:05» para las 00:05 en algunos motores.
const PARTES_FECHA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_AR, day: '2-digit', month: '2-digit', year: 'numeric' })
const PARTES_FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_AR, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

const PARTES_HORA_SEGUNDOS = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_AR, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** Un instante → `dd-mm-aaaa[ HH:MM]` en hora de Argentina. Vacío si el `Date` no es válido. */
function deInstante(d: Date, conHora: boolean): string {
  if (Number.isNaN(d.getTime())) return ''
  const partes = (conHora ? PARTES_FECHA_HORA : PARTES_FECHA).formatToParts(d)
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? ''
  const dia = `${p('day')}-${p('month')}-${p('year')}`
  return conHora ? `${dia} ${p('hour')}:${p('minute')}` : dia
}

/** `dd-mm-aaaa`. Acepta un ISO (con hora o sin ella) o un `Date`.
 *
 *  🔴 **Un `aaaa-mm-dd` no es un instante: es un día del calendario.** `new Date('2026-08-22')` es medianoche UTC, que en Argentina son las 21:00
 *  del 21: convertirlo de zona lo corre un día para atrás SIEMPRE, no sólo de noche. Y los timestamps del backend son naive en hora de Argentina:
 *  pasarlos por `Date` los interpreta como hora del navegador y los vuelve a mover. Por eso los dos casos se resuelven reordenando el TEXTO, sin
 *  construir un `Date`: no hay zona de la que convertir, así que no hay nada que corromper. Sólo un ISO con zona explícita se convierte.
 *
 *  Lo que no es ninguna de esas formas se devuelve tal cual, no recortado a ciegas: mejor mostrar lo que vino que una cadena armada con pedazos de
 *  otra cosa. Vacío para `null`, `undefined`, `''` y un `Date` inválido. */
export function fecha(valor: Valor): string {
  if (!valor) return ''
  if (typeof valor === 'string') {
    const solo = SOLO_FECHA.exec(valor)
    if (solo) return `${solo[3]}-${solo[2]}-${solo[1]}`
    if (CON_ZONA.test(valor)) return deInstante(new Date(valor), false)
    const conHora = FECHA_HORA.exec(valor)
    if (conHora) return `${conHora[3]}-${conHora[2]}-${conHora[1]}`
    return valor
  }
  return deInstante(valor, false)
}

/** `dd-mm-aaaa HH:MM`, reloj de 24 h. Un valor sin hora sale sólo como fecha. */
export function fechaHora(valor: Valor): string {
  if (!valor) return ''
  if (typeof valor === 'string') {
    if (CON_ZONA.test(valor)) return deInstante(new Date(valor), true)
    const conHora = FECHA_HORA.exec(valor)
    if (conHora) return `${conHora[3]}-${conHora[2]}-${conHora[1]} ${conHora[4]}:${conHora[5]}`
    return fecha(valor)
  }
  return deInstante(valor, true)
}

/** Sólo `HH:MM`. Vacío si el valor no trae hora. */
export function hora(valor: Valor): string {
  if (!valor) return ''
  if (typeof valor === 'string') {
    if (CON_ZONA.test(valor)) return deInstante(new Date(valor), true).slice(11)
    const conHora = FECHA_HORA.exec(valor)
    return conHora ? `${conHora[4]}:${conHora[5]}` : ''
  }
  return deInstante(valor, true).slice(11)
}

/** `HH:MM:SS` (o `HH:MM` si el texto sin zona no trae segundos). La columna Hora del log de actividad muestra los segundos: dos movimientos del mismo
 *  minuto se distinguen por ahí. Un `Date` o un ISO con zona se convierten a hora de Argentina; el copiado de los productos reordenaba el texto de un
 *  `…T01:00:00Z` y mostraba la hora UTC, y daba vacío con un `Date`. */
export function horaConSegundos(valor: Valor): string {
  if (!valor) return ''
  if (typeof valor !== 'string' || CON_ZONA.test(valor)) {
    const d = typeof valor === 'string' ? new Date(valor) : valor
    if (Number.isNaN(d.getTime())) return ''
    const partes = PARTES_HORA_SEGUNDOS.formatToParts(d)
    const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? ''
    return `${p('hour')}:${p('minute')}:${p('second')}`
  }
  const conHora = FECHA_HORA.exec(valor)
  if (!conHora) return ''
  return conHora[6] ? `${conHora[4]}:${conHora[5]}:${conHora[6]}` : `${conHora[4]}:${conHora[5]}`
}

// ── El texto sin zona: se reordena, nunca se convierte ─────────────────────────────────────────────────────────────────────────────

/** `dd-mm-aaaa` de lo que empiece con `aaaa-mm-dd`, **sin mirar lo que sigue**: no distingue un sufijo de zona (`Z`, `-03:00`) de uno de hora.
 *
 *  Es la variante de LibraCargo (`formatearFecha`), aparte de `fecha` a propósito. `fecha` convierte un ISO con zona porque es un instante; ésta es para
 *  el valor que **ya es hora de pared** de quien lo mandó (el `mtime` de una copia de backup, la hora del reloj del servidor) aunque venga con un sufijo
 *  de zona: convertirlo lo correría de día. Lo que no empieza con una fecha se devuelve como vino. Vacío para `null` y `undefined`. */
export function fechaDeTexto(valor: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (valor ?? '')
}

/** `dd-mm-aaaa HH:MM` de lo que empiece con `aaaa-mm-dd[ T]HH:MM`, con el mismo criterio que `fechaDeTexto`: se reordena el texto y se ignora la zona.
 *  Sin hora, sale como `fechaDeTexto`. Es `formatearFechaHoraDeTexto` de LibraCargo. */
export function fechaHoraDeTexto(valor: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(valor ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}` : fechaDeTexto(valor)
}

/** El guard de que todo desplegable de DATOS de la suite se puede buscar escribiendo (ADR-039). Uno para los nueve.
 *
 *  🔴 **Lee los FUENTES, no el DOM**, por lo mismo que `auditoria-de-titulos` y `auditoria-de-indicadores`. Lo que hay que impedir no es que una
 *  pantalla se rompa (ninguna se rompe con un `<Select>` de 300 clientes: se ve bien con 9) sino que **vuelva a nacer** un desplegable de datos
 *  que no se puede buscar, que es lo que el humano pidió que no exista (2026-10-08). Eso no se ve en ningún render con datos de prueba; se ve
 *  en el JSX.
 *
 *  **La regla.** Un desplegable es de *datos* si las opciones las arma el código a partir de algo que llegó de afuera: un `.map(…)` sobre una
 *  lista, una llamada, una variable, un componente que las dibuja. Ese desplegable tiene que ser `SelectBuscable`. Es *cerrado* si las opciones
 *  son `<SelectItem>` / `<option>` escritos a mano, y alcanzan **hasta `MAX_CERRADO` (8)**: estado, tipo, sí/no, alícuota, cantidad por página.
 *  Más de 8 opciones fijas (provincias, meses) se buscan igual que las de datos. Aplica a los dos: el `<Select>` de shadcn y el `<select>` nativo.
 *
 *  **La excepción es explícita y vive en el código.** Una lista que sale de una constante del código y es corta de verdad (`ESTADOS.map(…)`) se
 *  marca con un comentario `select-cerrado: <motivo>` en el mismo renglón del `<Select>` o en los tres de arriba (en JSX, el comentario de
 *  llaves de siempre, con esa palabra adentro). El motivo es obligatorio: sin él la marca no vale y es una infracción más. El guard cuenta las
 *  marcas (`marcados`) para que se vea si se abusa de ellas.
 *
 *  ⚠️ **Es de test: importa `node:fs`.** No lo importe código de aplicación — entraría al bundle y el build se cae. Va sólo desde un
 *  `*.test.ts`. Lo copian los productos igual que `auditarIndicadores`:
 *
 *      const r = auditarSelects(resolve(__dirname, '..'))
 *      expect(r.desplegables).toBeGreaterThan(0)         // el control: midió algo
 *      expect(describirInfracciones(r.infracciones)).toEqual([])
 *
 *  ⚠️ **Devuelve también cuánto midió** (`archivos`, `desplegables`), no sólo qué encontró mal. Una lista de infracciones vacía no prueba nada si
 *  el lector no encontró ningún desplegable: su forma de fallar es devolver cero, que sin control se lee como «está todo bien».
 *
 *  Lo que NO ve: un desplegable armado con otro componente propio que envuelve al `Select` (se audita el envoltorio, no cada uso), una lista
 *  que llega por `{children}` desde afuera de la etiqueta, y los `<option>` de un `<datalist>`. Lo que sí cubre es lo que el relevamiento
 *  encontró: el `.map` en una o en varias líneas, el `{opciones}` suelto, el `<Opciones />` y la llamada `{renderItems()}`, con o sin
 *  condicional alrededor.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Hasta cuántas opciones escritas a mano puede tener un desplegable cerrado. Más que eso se recorre a ojo con fastidio: se busca. */
export const MAX_CERRADO = 8

/** La palabra que abre la marca de «esta lista es cerrada a propósito». */
export const MARCA_CERRADO = 'select-cerrado'

export type TipoDeSelect = 'nativo' | 'shadcn'

export type Desplegable = {
  archivo: string
  linea: number
  tipo: TipoDeSelect
  /** `datos`: las opciones las arma el código (`.map`, llamada, variable, componente). `fijo`: sólo `<SelectItem>` / `<option>` escritos a mano. */
  origen: 'datos' | 'fijo'
  /** Cuántos `<SelectItem>` / `<option>` literales tiene. */
  opciones: number
  /** El motivo de la marca `select-cerrado:`, si la lleva (`''` si la marca no dice nada). */
  marca?: string
  /** Qué elige, para el que lee el informe: la etiqueta de al lado, el `aria-label`, el placeholder o el `value`. Mejor esfuerzo. */
  pista: string
  /** La expresión de `value=`, tal cual está escrita. */
  valor: string
  /** Cómo está armada la lista cuando es de datos: la expresión que se recorre (`cajas`, `listas.filter(…)`) o `(llamada)`. */
  lista?: string
}

export type Infraccion = { archivo: string; linea: number; tipo: TipoDeSelect; razon: 'datos' | 'muchas' | 'nativo' | 'marca-sin-motivo'; detalle: string }

export type AuditoriaDeSelects = {
  /** Cuántos archivos `.ts`/`.tsx` recorrió (sin tests ni la carpeta `ui/`). */
  archivos: number
  /** Cuántos desplegables (`<Select>` y `<select>`) encontró. Es el control positivo. */
  desplegables: number
  nativos: number
  shadcn: number
  /** Cuántos son cerrados y están permitidos: opciones fijas, hasta `MAX_CERRADO`. */
  cerrados: number
  /** Cuántos están permitidos sólo porque llevan la marca `select-cerrado:`. */
  marcados: number
  /** Todos, para el informe: lo que midió y cómo lo clasificó. */
  todos: Desplegable[]
  infracciones: Infraccion[]
}

// ── El lector ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Los comentarios pasan a espacios, **sin mover un solo carácter**: los renglones y las posiciones del texto limpio son los del original. */
export function sinComentarios(fuente: string): string {
  const blanquear = (s: string) => s.replace(/[^\n]/g, ' ')
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, blanquear)
    .replace(/^([ \t]*)\/\/.*$/gm, (m) => blanquear(m))
}

/** Dónde termina el `>` que cierra una etiqueta de apertura que empieza en `desde`. Respeta las llaves y las comillas: el `=>` de una flecha y el `>`
 *  de un `a > b` dentro de `{…}` no la cierran. `-1` si no se cierra. */
function finDeEtiqueta(texto: string, desde: number): number {
  let llaves = 0
  let comilla: string | null = null
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i]
    if (comilla) {
      if (c === '\\') i++
      else if (c === comilla) comilla = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') comilla = c
    else if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0 && texto[i - 1] !== '=') return i
  }
  return -1
}

/** El contenido de las llaves que abren en `desde` (que apunta a la `{`), y dónde cierran. */
function llaveCompleta(texto: string, desde: number): { dentro: string; fin: number } | null {
  let llaves = 0
  let comilla: string | null = null
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i]
    if (comilla) {
      if (c === '\\') i++
      else if (c === comilla) comilla = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') comilla = c
    else if (c === '{') llaves++
    else if (c === '}') {
      llaves--
      if (llaves === 0) return { dentro: texto.slice(desde + 1, i), fin: i }
    }
  }
  return null
}

/** El valor de un atributo de una etiqueta de apertura: `value="x"` → `"x"`, `value={a ?? b}` → `a ?? b`. `''` si no está. */
export function atributo(etiqueta: string, nombre: string): string {
  const m = new RegExp(`(?:^|[\\s])${nombre.replace('-', '\\-')}\\s*=\\s*`).exec(etiqueta)
  if (!m) return ''
  const i = m.index + m[0].length
  if (etiqueta[i] === '{') return llaveCompleta(etiqueta, i)?.dentro.trim() ?? ''
  const comilla = etiqueta[i]
  if (comilla === '"' || comilla === "'") {
    const fin = etiqueta.indexOf(comilla, i + 1)
    return fin < 0 ? '' : etiqueta.slice(i, fin + 1)
  }
  return ''
}

const ESTRUCTURA = 'SelectTrigger|SelectValue|SelectContent|SelectGroup|SelectLabel|SelectSeparator|SelectScrollUpButton|SelectScrollDownButton|optgroup'

/** Los argumentos de flecha o de más de 40 caracteres, como `(…)`: el renglón del informe tiene que leerse. */
function abreviar(cadena: string): string {
  let salida = ''
  for (let i = 0; i < cadena.length; i++) {
    if (cadena[i] !== '(') { salida += cadena[i]; continue }
    let profundidad = 0
    let j = i
    for (; j < cadena.length; j++) {
      if (cadena[j] === '(') profundidad++
      else if (cadena[j] === ')' && --profundidad === 0) break
    }
    const grupo = cadena.slice(i, j + 1)
    salida += grupo.includes('=>') || grupo.length > 40 ? '(…)' : grupo
    i = j
  }
  return salida
}

/** Lo que se recorre en `lista.filter((l) => l.activa).map(…)`: la cadena que termina en `fin` (donde empieza el `.map`), con los argumentos largos o de
 *  flecha abreviados a `(…)` para que el renglón del informe se lea. */
function receptorDe(expr: string, fin: number): string {
  let i = fin
  while (i > 0) {
    const c = expr[i - 1]
    if (c === ')') {
      let profundidad = 0
      let j = i - 1
      for (; j >= 0; j--) {
        if (expr[j] === ')') profundidad++
        else if (expr[j] === '(' && --profundidad === 0) break
      }
      if (j < 0) break
      i = j
    } else if (/[\w$.?[\]\s]/.test(c)) i--
    else break
  }
  const cadena = expr.slice(i, fin).replace(/\s*([.?])\s*/g, '$1').replace(/\s+/g, ' ').trim()
  return abreviar(cadena) || '(llamada)'
}

/** Qué hay entre `<Select …>` y `</Select>` (o `<select>`): cuántos ítems literales y si algo más arma la lista. Pura. */
export function leerOpciones(hijos: string): { literales: number; datos: boolean; lista?: string } {
  let literales = 0
  // 1. Los ítems escritos a mano se van: cuentan y no molestan. Los que están adentro de un `.map` también se van, y el `.map` queda a la vista.
  let resto = hijos.replace(/<(SelectItem|option)\b[\s\S]*?<\/\1>/g, () => { literales++; return ' ' })
  // 2. El disparador entero (con su `<SelectValue>`, su ícono y sus llamadas a `cn(…)`) no son opciones. Adentro de un formulario de shadcn va
  //    envuelto en `<FormControl>`, que tampoco lo es.
  resto = resto.replace(/<FormControl\b[\s\S]*?<\/FormControl>/g, ' ').replace(/<SelectTrigger\b[\s\S]*?<\/SelectTrigger>/g, ' ')
  // 3. Las etiquetas de estructura: sus atributos (`className={cn(…)}`, `onCloseAutoFocus={(e) => …}`) tampoco.
  let salida = ''
  for (let i = 0; i < resto.length;) {
    const m = new RegExp(`<(?:${ESTRUCTURA})\\b`).exec(resto.slice(i))
    if (!m) { salida += resto.slice(i); break }
    const ini = i + m.index
    salida += resto.slice(i, ini)
    const fin = finDeEtiqueta(resto, ini + m[0].length)
    i = fin < 0 ? resto.length : fin + 1
  }
  resto = salida.replace(new RegExp(`</(?:${ESTRUCTURA})>`, 'g'), ' ')

  // 4. Lo que queda: expresiones `{…}` y, si los hay, componentes propios.
  if (/<[A-Z][\w.]*/.test(resto)) return { literales, datos: true, lista: '(componente)' }
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] !== '{') continue
    const llave = llaveCompleta(resto, i)
    if (!llave) break
    const dentro = llave.dentro.trim()
    i = llave.fin
    if (!dentro) continue
    const recorre = /\.\s*(?:flatMap|map)\s*\(/.exec(dentro)
    if (recorre) return { literales, datos: true, lista: receptorDe(dentro, recorre.index) }
    if (/^[\w$.?[\]]+$/.test(dentro)) return { literales, datos: true, lista: dentro }
    if (/[\w$\])]\s*\(/.test(dentro.replace(/<[^>]*>/g, ' '))) return { literales, datos: true, lista: '(llamada)' }
  }
  return { literales, datos: false }
}

/** El texto de una etiqueta de campo (`<Label>`, `<FormLabel>`, `<label>`) que está justo antes de `pos`, para saber qué elige el desplegable. */
function etiquetaDeAlLado(texto: string, pos: number): string {
  const desde = Math.max(0, pos - 600)
  const ventana = texto.slice(desde, pos)
  let ultima = ''
  for (const m of ventana.matchAll(/<((?:Form)?[Ll]abel)(?=[\s>])/g)) {
    const fin = finDeEtiqueta(texto, desde + m.index + m[0].length)
    if (fin < 0) continue
    const cierre = texto.indexOf(`</${m[1]}>`, fin)
    // Una etiqueta que envuelve al desplegable (`<label>Deporte <select>`) cierra después de él: su texto es lo que va hasta acá.
    ultima = texto.slice(fin + 1, cierre >= 0 && cierre < pos ? cierre : pos)
  }
  // El texto de la etiqueta es lo que va antes del primer elemento o expresión que lleve adentro.
  return ultima.split(/[<{]/)[0].replace(/\s+/g, ' ').trim()
}

function marcaCerca(original: string, linea: number): string | undefined {
  const renglones = original.split('\n')
  for (let i = linea - 1; i >= Math.max(0, linea - 4); i--) {
    const m = new RegExp(`${MARCA_CERRADO}(?:\\s*:(.*))?`).exec(renglones[i])
    if (m) return (m[1] ?? '').replace(/\*\/\s*\}?\s*$/, '').replace(/^[\s:–—-]+/, '').trim()
  }
  return undefined
}

/** Los desplegables de un fuente. Pura. */
export function desplegablesEn(fuente: string, archivo = ''): Desplegable[] {
  const limpio = sinComentarios(fuente)
  const hallados: Desplegable[] = []
  for (const m of limpio.matchAll(/<(Select|select)(?=[\s>/])/g)) {
    const tipo: TipoDeSelect = m[1] === 'select' ? 'nativo' : 'shadcn'
    const ini = m.index
    const finApertura = finDeEtiqueta(limpio, ini + m[0].length)
    if (finApertura < 0 || limpio[finApertura - 1] === '/') continue
    const cierre = limpio.indexOf(`</${m[1]}>`, finApertura)
    if (cierre < 0) continue
    const apertura = limpio.slice(ini, finApertura + 1)
    const hijos = limpio.slice(finApertura + 1, cierre)
    const { literales, datos, lista } = leerOpciones(hijos)
    const linea = limpio.slice(0, ini).split('\n').length
    const trigger = /<SelectTrigger\b/.exec(hijos)
    const etiquetaTrigger = trigger ? hijos.slice(trigger.index, finDeEtiqueta(hijos, trigger.index + 13) + 1) : ''
    const placeholder = /<SelectValue\b[^>]*placeholder\s*=\s*"([^"]*)"/.exec(hijos)?.[1]
    const valor = atributo(apertura, 'value')
    const pista = (
      atributo(apertura, 'aria-label') || atributo(etiquetaTrigger, 'aria-label') || etiquetaDeAlLado(limpio, ini) || placeholder || valor
    ).replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim()
    hallados.push({ archivo, linea, tipo, origen: datos ? 'datos' : 'fijo', opciones: literales, marca: marcaCerca(fuente, linea), pista, valor, lista })
  }
  return hallados
}

// ── El recorrido ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Los fuentes que se auditan: nada de tests, de la carpeta `ui/` (las primitivas de shadcn SON el `<Select>`), ni de `node_modules`. */
export function esFuenteAuditable(nombre: string): boolean {
  return /\.tsx?$/.test(nombre) && !/\.(test|spec|stories)\.tsx?$/.test(nombre) && !/\.d\.ts$/.test(nombre)
}

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === 'ui' || nombre === 'assets' || nombre === '__tests__') return []
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return fuentes(ruta)
    return esFuenteAuditable(nombre) ? [ruta] : []
  })
}

/** Si un desplegable viola la regla, y por qué. `null` si está bien. */
export function infraccionDe(d: Desplegable, opciones: { maxCerrado?: number; prohibirNativos?: boolean } = {}): Infraccion | null {
  const max = opciones.maxCerrado ?? MAX_CERRADO
  const base = { archivo: d.archivo, linea: d.linea, tipo: d.tipo }
  const que = d.pista ? ` (${d.pista})` : ''
  if (d.marca !== undefined) {
    return d.marca === ''
      ? { ...base, razon: 'marca-sin-motivo', detalle: `lleva «${MARCA_CERRADO}» sin decir por qué es cerrada${que}` }
      : null
  }
  if (d.origen === 'datos') {
    const de = d.lista && d.lista !== '(componente)' && d.lista !== '(llamada)' ? ` de ${d.lista}` : ''
    return { ...base, razon: 'datos', detalle: `las opciones vienen de datos${de}${que}` }
  }
  if (d.opciones > max) return { ...base, razon: 'muchas', detalle: `tiene ${d.opciones} opciones fijas, más de ${max}${que}` }
  if (d.tipo === 'nativo' && opciones.prohibirNativos) return { ...base, razon: 'nativo', detalle: `es un <select> nativo${que}` }
  return null
}

/** Audita un `src/` entero (el del kit o el `frontend/src` de un producto).
 *  - `maxCerrado`: cuántas opciones fijas admite un desplegable cerrado (defecto `MAX_CERRADO`).
 *  - `prohibirNativos`: además, ningún `<select>` nativo, ni cerrado (la regla más estricta: la apariencia de la suite es la de shadcn). */
export function auditarSelects(
  raizSrc: string,
  opciones: { maxCerrado?: number; prohibirNativos?: boolean } = {},
): AuditoriaDeSelects {
  const todosLosFuentes = fuentes(raizSrc)
  const todos: Desplegable[] = []
  const infracciones: Infraccion[] = []
  for (const ruta of todosLosFuentes) {
    const relativa = relative(raizSrc, ruta).replaceAll('\\', '/')
    for (const d of desplegablesEn(readFileSync(ruta, 'utf8'), relativa)) {
      todos.push(d)
      const i = infraccionDe(d, opciones)
      if (i) infracciones.push(i)
    }
  }
  return {
    archivos: todosLosFuentes.length,
    desplegables: todos.length,
    nativos: todos.filter((d) => d.tipo === 'nativo').length,
    shadcn: todos.filter((d) => d.tipo === 'shadcn').length,
    cerrados: todos.filter((d) => d.origen === 'fijo' && d.opciones <= (opciones.maxCerrado ?? MAX_CERRADO)).length,
    marcados: todos.filter((d) => d.marca).length,
    todos,
    infracciones,
  }
}

/** Un renglón por desplegable, para que el test falle diciendo qué arreglar. */
export function describirInfracciones(infracciones: Infraccion[]): string[] {
  return infracciones.map((i) => {
    const donde = `${i.archivo}:${i.linea}`
    const que = i.tipo === 'nativo' ? '<select>' : '<Select>'
    if (i.razon === 'marca-sin-motivo') return `${donde}: ${que} ${i.detalle}; escribí el motivo después de «${MARCA_CERRADO}:»`
    if (i.razon === 'nativo') return `${donde}: ${que} ${i.detalle}; usá el Select de libra-ui/ui/select (lista cerrada) o SelectBuscable (libra-ui/SelectBuscable)`
    return `${donde}: ${que} ${i.detalle}; usá SelectBuscable (libra-ui/SelectBuscable) para que se pueda buscar escribiendo, o, si la lista es corta y cerrada de verdad, marcala con «${MARCA_CERRADO}: <motivo>»`
  })
}

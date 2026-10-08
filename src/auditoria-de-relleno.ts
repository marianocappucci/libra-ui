/** El guard de que una pantalla no agrega relleno propio arriba de lo que ya le da el `Layout` (ADR-040). Uno para los nueve productos.
 *
 *  🔴 **Lee los FUENTES, no el DOM**, por lo mismo que `auditoria-de-titulos` y `auditoria-de-indicadores`. Una pantalla con un `p-6` de más
 *  no se rompe: se ve «un espacio vacío arriba» y el título más abajo que el nombre de la app (pedido del humano, 2026-10-08, con la captura
 *  del Dashboard de LibraCargo). Y vuelve sola: la próxima pantalla copia el `<div className="p-6">` de la de al lado. Se ve en el JSX.
 *
 *  **La regla.** El `Layout` del kit ya rellena el contenido (`p-4 md:p-6`) y baja el título hasta la altura de la marca del sidebar
 *  (`md:pt-3.5`, ADR-040). El elemento raíz de una pantalla (`pages/**`) NO agrega `p-N`, `py-N`, `pt-N`, `mt-N` ni `my-N` (con `sm:`…`2xl:`
 *  o sin prefijo; `p-0` no cuenta; `container … py-N` cuenta por el `py`; un `py-N` sobre un mensaje `text-center` tampoco: es el aire de un
 *  «Cargando…», no el relleno de la pantalla). Si hay que separar bloques, `space-y-N` o `gap-N` adentro. La raíz
 *  son los `return` del componente de la pantalla (los de arriba de todo y los de `if (cargando) return …`), o el cuerpo de una flecha sin
 *  llaves; si la raíz es un fragmento `<>`, sus hijos directos.
 *
 *  **Excepciones, explícitas y con motivo.** Una pantalla que se dibuja FUERA del `Layout` (el login, el reseteo de contraseña, las páginas
 *  públicas, la hoja que se imprime) sí necesita su propio relleno. Va en `opciones.excepciones`: `{ 'pages/Login.tsx': 'fuera del Layout' }`.
 *  Una excepción que ya no hace falta (el archivo no existe o ya no viola) se informa en `sobrantes` y el test del producto tiene que fallar:
 *  si no, la lista sólo crece.
 *
 *  ⚠️ **Es de test: importa `node:fs`.** No lo importe código de aplicación — entraría al bundle y el build se cae. Va sólo desde un
 *  `*.test.ts`. Lo copian los productos igual que `auditarIndicadores`:
 *
 *      const r = auditarRelleno(resolve(__dirname, '..'), { excepciones: { 'pages/Login.tsx': 'fuera del Layout' } })
 *      expect(r.pantallas).toBeGreaterThan(0)            // el control: midió algo
 *      expect(describirInfracciones(r.infracciones)).toEqual([])
 *      expect(r.sobrantes).toEqual([])
 *
 *  ⚠️ **Devuelve también cuánto midió** (`archivos`, `pantallas`, `raices`), no sólo qué encontró mal: una lista vacía no prueba nada si el
 *  parser no encontró ninguna pantalla, y su forma de fallar (leer TSX con expresiones regulares) es devolver cero.
 *
 *  Lo que NO ve: el relleno que pone un componente envoltorio propio (`<Pagina>` que por adentro hace `p-6`: ahí hay que mirar el envoltorio),
 *  un `className` armado por una función, y las raíces de un componente que no sea el de la pantalla. Lo que sí cubre es lo que el
 *  relevamiento encontró: `p-6`, `py-8`, `container mx-auto py-8`, `space-y-6 p-6`, el `className` en varias líneas, con `cn(…)` o con
 *  plantilla, y el `return` dentro de un `if`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Los prefijos que dejan pasar el relleno hasta el escritorio. `hover:`, `print:`, `max-md:`… no son relleno de la pantalla en reposo. */
const PREFIJOS_DE_ANCHO = new Set(['sm', 'md', 'lg', 'xl', '2xl'])

/** `p-6`, `py-8`, `pt-3.5`, `mt-4`, `my-6`, `p-[10px]`, `pt-px`. El `0` no cuenta (`pt-0` no agrega nada). */
const RELLENO = /^(?:p|py|pt|mt|my)-(?!0$)(?:\d+(?:\.\d+)?|px|\[[^\]]+\])$/

/** Los que sólo vuelcan aire arriba y abajo, sin tocar el costado: en un mensaje centrado (`text-center`) son el aire del propio mensaje
 *  («Cargando…», «No hay nada»), que no se alinea con el título de todos modos. */
const SOLO_VERTICAL = /^(?:py|pt|my|mt)-/

/** Los tokens de una lista de clases que agregan relleno o margen arriba. Pura. Un `py-N` sobre un texto centrado (`text-center`) no cuenta:
 *  es el aire de un mensaje de «cargando» o de «vacío», no el relleno de la pantalla. */
export function rellenoDeClases(clases: string): string[] {
  const lista = clases.split(/\s+/).filter(Boolean)
  const centrado = lista.includes('text-center')
  const hallados: string[] = []
  for (const token of lista) {
    const partes = token.split(':')
    const base = partes.pop() as string
    if (partes.some((p) => !PREFIJOS_DE_ANCHO.has(p))) continue
    if (!RELLENO.test(base)) continue
    if (centrado && SOLO_VERTICAL.test(base)) continue
    hallados.push(token)
  }
  return hallados
}

/** Reemplaza los comentarios por blancos del mismo largo, para que los números de línea no se muevan. */
function sinComentarios(fuente: string): string {
  const enBlancos = (m: string) => m.replace(/[^\n]/g, ' ')
  return fuente.replace(/\/\*[\s\S]*?\*\//g, enBlancos).replace(/^[ \t]*\/\/.*$/gm, enBlancos)
}

/** Dónde termina la apertura de la etiqueta que empieza en `desde` (`<`): el `>` que no está adentro de una llave ni de un string. */
function finDeApertura(texto: string, desde: number): number {
  let llaves = 0
  let comilla = ''
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i]
    if (comilla) {
      if (c === '\\') i++
      else if (c === comilla) comilla = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') comilla = c
    else if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0) return i
  }
  return texto.length
}

/** Las clases de una etiqueta de apertura: todo lo que hay escrito en su `className` (un string, una plantilla, un `cn(…)`), como una sola
 *  lista. No evalúa nada: junta lo escrito, así `cn(cargando && 'p-6')` también cuenta. `null` si no tiene `className`. */
function clasesDeApertura(apertura: string): string | null {
  const i = apertura.search(/\bclassName\s*=/)
  if (i < 0) return null
  const resto = apertura.slice(apertura.indexOf('=', i) + 1).trimStart()
  let valor = ''
  if (resto[0] === '"' || resto[0] === "'") {
    valor = resto.slice(1, resto.indexOf(resto[0], 1))
  } else if (resto[0] === '{') {
    let profundidad = 0
    let comilla = ''
    let j = 0
    for (; j < resto.length; j++) {
      const c = resto[j]
      if (comilla) {
        if (c === '\\') j++
        else if (c === comilla) comilla = ''
        continue
      }
      if (c === '"' || c === "'" || c === '`') comilla = c
      else if (c === '{') profundidad++
      else if (c === '}' && --profundidad === 0) break
    }
    valor = resto.slice(1, j)
  }
  // Se parte por blancos, comillas, paréntesis y operadores; el `:` se deja porque es el de `md:p-6`.
  return valor.split(/[\s"'`(){},?&|]+/).join(' ')
}

type Bloque = { nombre: string; desde: number; hasta: number; exportado: boolean; porDefecto: boolean; flecha: boolean }

const DECLARACION = /^(export\s+)?(default\s+)?(?:async\s+)?(?:function\s*\*?\s*([A-Za-z_$][\w$]*)?|(?:const|let)\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/
const OTRA_DECLARACION_DE_RAIZ = /^(?:export\b|function\b|async\s+function\b|const\b|let\b|var\b|class\b|type\b|interface\b|enum\b|declare\b)/

/** Parte el fuente en los bloques de primer nivel (las declaraciones que empiezan en la columna 0). */
function bloquesDe(lineas: string[], texto: string): Bloque[] {
  const bloques: Bloque[] = []
  const reexportados = new Set<string>()
  let porDefectoPorNombre = ''
  for (const m of texto.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const e of m[1].split(',')) {
      const [local, alias] = e.trim().split(/\s+as\s+/)
      if (local) reexportados.add(local)
      if (alias === 'default') porDefectoPorNombre = local
    }
  }
  const m0 = texto.match(/^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m)
  if (m0) porDefectoPorNombre = m0[1]

  let actual: Bloque | null = null
  lineas.forEach((linea, i) => {
    if (!OTRA_DECLARACION_DE_RAIZ.test(linea)) return
    if (actual) actual.hasta = i
    actual = null
    if (/^export\s+default\s+(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/.test(linea)) {
      // `export default () => (…)`: el componente sin nombre.
      actual = { nombre: '', desde: i, hasta: lineas.length, exportado: true, porDefecto: true, flecha: true }
      bloques.push(actual)
      return
    }
    const m = linea.match(DECLARACION)
    if (!m) return
    const nombre = m[3] ?? m[4] ?? m[5] ?? ''
    const porDefecto = Boolean(m[2]) || (nombre !== '' && nombre === porDefectoPorNombre)
    const exportado = Boolean(m[1]) || reexportados.has(nombre) || porDefecto
    const esFuncion = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/.test(linea) || /^(?:export\s+)?(?:const|let)\b/.test(linea)
    if (!esFuncion) return
    actual = { nombre, desde: i, hasta: lineas.length, exportado, porDefecto, flecha: /^(?:export\s+)?(?:const|let)\b/.test(linea) }
    bloques.push(actual)
  })
  return bloques
}

/** Los componentes que SON la pantalla del archivo: el `export default`; si no hay, el exportado que se llama como el archivo; si tampoco,
 *  todos los exportados que empiezan en mayúscula. */
function pantallasDe(bloques: Bloque[], archivo: string): Bloque[] {
  const base = (archivo.split('/').pop() ?? '').replace(/\.[jt]sx?$/, '')
  const candidatos = bloques.filter((b) => b.exportado && (b.nombre === '' || /^[A-Z]/.test(b.nombre)))
  const porDefecto = candidatos.filter((b) => b.porDefecto)
  if (porDefecto.length > 0) return porDefecto
  const homonimo = candidatos.filter((b) => b.nombre === base)
  return homonimo.length > 0 ? homonimo : candidatos
}

export type Raiz = { linea: number; etiqueta: string; clases: string | null }

/** Los elementos raíz que devuelve un componente (`lineas[desde..hasta)`), con la línea (1-based) de cada uno. */
function raicesDe(lineas: string[], bloque: Bloque, texto: string, inicios: number[]): Raiz[] {
  const raices: Raiz[] = []
  const vistas = new Set<number>()
  const agregar = (posicion: number, etiqueta: string) => {
    if (vistas.has(posicion)) return
    vistas.add(posicion)
    const linea = inicios.findIndex((s, k) => s <= posicion && (inicios[k + 1] ?? Infinity) > posicion) + 1
    raices.push({ linea, etiqueta, clases: clasesDeApertura(texto.slice(posicion, finDeApertura(texto, posicion) + 1)) })
  }
  const inicio = inicios[bloque.desde]
  const fin = bloque.hasta < lineas.length ? inicios[bloque.hasta] : texto.length
  const cuerpo = texto.slice(inicio, fin)

  const desdeRetorno = (posRelativa: number, etiqueta: string) => {
    const pos = inicio + posRelativa
    if (etiqueta !== '>') return agregar(pos, etiqueta)
    // Fragmento: los hijos directos, o sea las etiquetas que empiezan en la sangría del primer hijo hasta el `</>`.
    const resto = texto.slice(pos + 1, fin)
    const cierre = resto.search(/<\/>/)
    const dentro = cierre >= 0 ? resto.slice(0, cierre) : resto
    const primero = dentro.match(/\n([ \t]*)\S/)
    if (!primero) return
    const hijos = dentro.matchAll(new RegExp(String.raw`\n${primero[1]}<([A-Za-z][\w.]*)`, 'g'))
    for (const h of hijos) agregar(pos + 1 + (h.index as number) + 1 + primero[1].length, h[1])
  }

  // (a) `return <X` / `return (<X`, con la sangría del cuerpo de la función (2) o la de un `if (…) {` de primer nivel (4).
  const retorno = /^( {2}| {4}|\t|\t\t)(?:if\s*\([^\n]*\)\s*)?return\s*\(?\s*<([A-Za-z][\w.]*|>)/gm
  for (const m of cuerpo.matchAll(retorno)) {
    const sangria = m[1].replaceAll('\t', '  ').length
    if (sangria === 4) {
      // Sólo si cuelga de un `if`/`else` de primer nivel: si no, es el `return` de una función anidada.
      const antes = cuerpo.slice(0, m.index).trimEnd().split('\n').pop() ?? ''
      if (!/^( {2}|\t)(?:\}\s*)?(?:else\s*)?(?:if\b[^\n]*)?\{$/.test(antes) && !/^( {2}|\t)(?:\}\s*)?else\s*\{$/.test(antes)) continue
    }
    const abre = (m.index as number) + m[0].lastIndexOf('<')
    desdeRetorno(abre, m[2])
  }

  // (b) Una flecha de cuerpo-expresión: `export const X = () => (\n  <div …`.
  if (bloque.flecha) {
    for (let i = bloque.desde; i < Math.min(bloque.hasta, bloque.desde + 40); i++) {
      if (/=>\s*\{\s*$/.test(lineas[i])) break
      const m = lineas[i].match(/=>\s*\(?\s*(?:<([A-Za-z][\w.]*|>))?\s*$/) ?? lineas[i].match(/=>\s*\(?\s*<([A-Za-z][\w.]*|>)/)
      if (!m) continue
      const buscado = texto.slice(inicios[i] + (m.index as number) + 2, fin).match(/^\s*\(?\s*<([A-Za-z][\w.]*|>)/)
      if (buscado) {
        const rel = inicios[i] + (m.index as number) + 2 + buscado[0].lastIndexOf('<') - inicio
        desdeRetorno(rel, buscado[1])
      }
      break
    }
  }
  return raices.sort((a, b) => a.linea - b.linea)
}

export type Infraccion = {
  /** Ruta relativa al `src/` auditado, con `/`. */
  archivo: string
  /** Línea (1-based) del elemento raíz. */
  linea: number
  /** `div`, `section`, `Card`… */
  etiqueta: string
  /** Los tokens que agregan relleno (`p-6`, `md:py-8`). */
  relleno: string[]
  /** Todas las clases de esa raíz, para ubicarla. */
  clases: string
}

/** Lo que se lee de UN fuente: cuántos componentes de pantalla y cuántas raíces miró, y cuáles tienen relleno. Pura; el test del kit la usa para
 *  cubrir cada forma de escribirlo sin tocar el disco. */
export function analizarFuente(fuente: string, archivo = 'pages/Pantalla.tsx'): { componentes: number; raices: number; infracciones: Infraccion[] } {
  const texto = sinComentarios(fuente)
  const lineas = texto.split('\n')
  const inicios: number[] = []
  let acumulado = 0
  for (const l of lineas) {
    inicios.push(acumulado)
    acumulado += l.length + 1
  }
  const bloques = bloquesDe(lineas, texto)
  const pantallas = pantallasDe(bloques, archivo)
  const infracciones: Infraccion[] = []
  let raices = 0
  for (const b of pantallas) {
    for (const r of raicesDe(lineas, b, texto, inicios)) {
      raices++
      const relleno = r.clases ? rellenoDeClases(r.clases) : []
      if (relleno.length > 0) infracciones.push({ archivo, linea: r.linea, etiqueta: r.etiqueta, relleno, clases: r.clases as string })
    }
  }
  return { componentes: pantallas.length, raices, infracciones }
}

export type AuditoriaDeRelleno = {
  /** Cuántos archivos `.ts`/`.tsx` recorrió. */
  archivos: number
  /** Cuántos archivos eran una pantalla (por `esPantalla`). Es el control positivo. */
  pantallas: number
  /** Cuántos elementos raíz leyó en total (cada `return` de cada pantalla). Si es 0 con pantallas > 0, el parser no entendió el JSX. */
  raices: number
  /** Las raíces con relleno propio que NO están exceptuadas. */
  infracciones: Infraccion[]
  /** Las pantallas exceptuadas que sí tienen relleno propio (con su motivo, como las escribió el producto). */
  exceptuadas: { archivo: string; motivo: string }[]
  /** Excepciones que sobran: el archivo no existe, no es una pantalla o ya no tiene relleno propio. Sacarlas de la lista. */
  sobrantes: string[]
}

/** Si un archivo es una pantalla: cualquier `.tsx` bajo un directorio `pages/`, salvo tests. */
export function esPantallaDeProducto(ruta: string): boolean {
  const r = ruta.replaceAll('\\', '/')
  return /(^|\/)pages\//.test(r) && /\.tsx$/.test(r) && !/\.(test|spec)\.[jt]sx?$/.test(r)
}

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === 'assets') return []
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return fuentes(ruta)
    return /\.[jt]sx?$/.test(nombre) ? [ruta] : []
  })
}

/** Audita un `src/` entero (el del kit o el `frontend/src` de un producto). `opciones.esPantalla` reemplaza la regla por ruta (el kit audita
 *  `comercio/`, `agenda/`…); `opciones.excepciones` mapea ruta relativa → motivo, para las pantallas que se dibujan fuera del `Layout`. */
export function auditarRelleno(
  raizSrc: string,
  opciones: { esPantalla?: (ruta: string) => boolean; excepciones?: Record<string, string> } = {},
): AuditoriaDeRelleno {
  const esPantalla = opciones.esPantalla ?? esPantallaDeProducto
  const excepciones = opciones.excepciones ?? {}
  const todos = fuentes(raizSrc)
  const infracciones: Infraccion[] = []
  const exceptuadas: { archivo: string; motivo: string }[] = []
  const usadas = new Set<string>()
  let pantallas = 0
  let raices = 0
  for (const ruta of todos) {
    const relativa = relative(raizSrc, ruta).replaceAll('\\', '/')
    if (!esPantalla(relativa)) continue
    pantallas++
    const r = analizarFuente(readFileSync(ruta, 'utf8'), relativa)
    raices += r.raices
    if (r.infracciones.length === 0) continue
    if (relativa in excepciones) {
      usadas.add(relativa)
      exceptuadas.push({ archivo: relativa, motivo: excepciones[relativa] })
    } else {
      infracciones.push(...r.infracciones)
    }
  }
  const sobrantes = Object.keys(excepciones).filter((a) => !usadas.has(a))
  return { archivos: todos.length, pantallas, raices, infracciones, exceptuadas, sobrantes }
}

/** Un renglón por raíz, para que el test falle diciendo qué arreglar. */
export function describirInfracciones(infracciones: Infraccion[]): string[] {
  return infracciones.map(
    (i) =>
      `${i.archivo}:${i.linea}: la pantalla arranca con <${i.etiqueta} className="${i.clases}"> y el relleno (${i.relleno.join(', ')}) duplica el del Layout, que ya la separa del borde y baja el título a la altura de la marca. ` +
      'Sacá esas clases de la raíz (separá los bloques con space-y-N o gap-N); si la pantalla se dibuja FUERA del Layout, declarala en `excepciones` con el motivo (ADR-040)',
  )
}

/** Un renglón por excepción que sobra. */
export function describirSobrantes(sobrantes: string[]): string[] {
  return sobrantes.map((a) => `${a}: figura en \`excepciones\` pero ya no tiene relleno propio (o no es una pantalla / no existe). Sacala de la lista`)
}

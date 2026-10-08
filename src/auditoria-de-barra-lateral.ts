/** El guard de que el fondo, el hover y el borde de la barra lateral los da el kit y no cada producto (ADR-042). Uno para los nueve.
 *
 *  🔴 **Lee las HOJAS DE ESTILO, no el DOM**, por lo mismo que `auditoria-de-relleno` y `auditoria-de-selects`. Lo que hay que impedir no es que la
 *  barra se vea mal hoy sino que **vuelva a divergir**: que un producto copie del de al lado el bloque de variables de shadcn (`--sidebar:
 *  oklch(0.985 0 0)`) y la suite quede con dos tonos de menú. Eso no se ve en ningún test de componente; se ve en el `index.css`.
 *
 *  **La regla.** Ninguna hoja `.css` de un producto declara `--sidebar`, `--sidebar-accent` ni `--sidebar-border` (en `:root`, `.dark` ni en otro
 *  lado): su defecto, en claro y en oscuro, es el de `libra-ui/tema.css`. Se siguen declarando en el producto el resto de las `--sidebar-*`
 *  (`-foreground`, `-primary`, `-primary-foreground`, `-accent-foreground`, `-ring`), que no cambian con el tono de la barra. Y la hoja principal tiene que
 *  traer `@import "libra-ui/tema.css"`: sin eso, al sacar las variables la barra quedaría sin fondo (`control`: `importaElTema`).
 *
 *  ⚠️ **Es de test: importa `node:fs`.** No lo importe código de aplicación. Va desde un `*.test.ts` del producto:
 *
 *      const r = auditarBarraLateral(resolve(__dirname, '..'))
 *      expect(r.hojas).toBeGreaterThan(0)                // el control: midió algo
 *      expect(r.importaElTema).toBe(true)                // y el producto trae el tema del kit
 *      expect(describirInfracciones(r.infracciones)).toEqual([])
 *
 *  ⚠️ **Devuelve también cuánto midió** (`hojas`, `importaElTema`): una lista vacía de infracciones no prueba nada si el barrido no encontró ninguna hoja.
 *
 *  Lo que NO ve: una variable fijada desde JS (`style.setProperty('--sidebar', …)`; es lo que hace `aplicarTema`, a propósito) ni una utilidad de Tailwind
 *  con valor arbitrario (`bg-[#fafafa]` en el menú; eso lo cubre la revisión).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Las variables cuyo defecto es del kit. Los nombres exactos: `--sidebar-accent-foreground` no es `--sidebar-accent`. */
export const VARIABLES_DE_LA_BARRA: readonly string[] = ['--sidebar', '--sidebar-accent', '--sidebar-border']

export type Infraccion = { archivo: string; linea: number; variable: string }

export type AuditoriaDeBarraLateral = {
  /** Cuántas hojas `.css` recorrió. Es el control positivo. */
  hojas: number
  /** Si alguna hoja trae `@import "libra-ui/tema.css"` (sin eso el defecto del kit no llega al producto). */
  importaElTema: boolean
  /** Las declaraciones que sobran. */
  infracciones: Infraccion[]
}

/** El CSS sin comentarios, con los mismos saltos de línea (así los números de línea siguen siendo los del archivo). */
function sinComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
}

/** Las declaraciones de `--sidebar`, `--sidebar-accent` y `--sidebar-border` de un CSS. Pura. */
export function declaracionesDeLaBarra(css: string, variables: readonly string[] = VARIABLES_DE_LA_BARRA): { variable: string; linea: number }[] {
  const limpio = sinComentarios(css)
  const encontradas: { variable: string; linea: number }[] = []
  for (const m of limpio.matchAll(/(?<![\w-])(--sidebar(?:-accent|-border)?)\s*:/g)) {
    if (!variables.includes(m[1])) continue
    encontradas.push({ variable: m[1], linea: limpio.slice(0, m.index).split('\n').length })
  }
  return encontradas
}

/** Si el CSS importa el tema del kit (`@import "libra-ui/tema.css"`, con o sin `url()` ni comillas simples). Pura. */
export function importaElTemaDelKit(css: string): boolean {
  return /@import\s+(?:url\()?\s*['"]libra-ui\/tema\.css['"]/.test(sinComentarios(css))
}

function hojas(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === 'assets') return []
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return hojas(ruta)
    return nombre.endsWith('.css') ? [ruta] : []
  })
}

/** Audita un `src/` entero (el `frontend/src` de un producto). `opciones.excepciones` son rutas relativas de hojas que pueden declararlas. */
export function auditarBarraLateral(raizSrc: string, opciones: { excepciones?: readonly string[] } = {}): AuditoriaDeBarraLateral {
  const todas = hojas(raizSrc)
  const infracciones: Infraccion[] = []
  let importaElTema = false
  for (const ruta of todas) {
    const relativa = relative(raizSrc, ruta).replaceAll('\\', '/')
    const css = readFileSync(ruta, 'utf8')
    if (importaElTemaDelKit(css)) importaElTema = true
    if (opciones.excepciones?.includes(relativa)) continue
    for (const d of declaracionesDeLaBarra(css)) infracciones.push({ archivo: relativa, ...d })
  }
  return { hojas: todas.length, importaElTema, infracciones }
}

/** Un renglón por declaración, para que el test falle diciendo qué quitar. */
export function describirInfracciones(infracciones: Infraccion[]): string[] {
  return infracciones.map(
    (i) => `${i.archivo}:${i.linea}: declara ${i.variable}; quitala: el defecto de la barra lateral es de libra-ui/tema.css (ADR-042)`,
  )
}

/** El guard de que los reportes y los tableros toman sus íconos del catálogo (ADR-038). Uno para los nueve.
 *
 *  🔴 **Lee los FUENTES, no el DOM**, por lo mismo que `auditoria-de-titulos` y `espaciado-de-campos`. Lo que hay que impedir no es que una
 *  pantalla se rompa (ninguna se rompe con el ícono equivocado) sino que **vuelvan a divergir**: que la próxima tarjeta de «Productos más
 *  vendidos» importe `Boxes` de lucide porque quedaba bien, y que el menú diga `Package` y el reporte `Boxes`. Eso no se ve en ningún render;
 *  se ve en el `import`.
 *
 *  **La regla.** En una pantalla de reporte o de tablero (por el nombre del archivo: `Reportes*`, `Reporte*`, `Dashboard*`, `Tablero*`,
 *  `Inicio*`, `Indicador*`, `Kpi*`) no se importa de `lucide-react` ningún ícono que nombre un CONCEPTO. Se pasa el concepto a
 *  `TarjetaReporte` / `TarjetaIndicador` / `IconoIndicador`, o se usa `ICONOS.<concepto>` del catálogo de identidad para el título. Lo único
 *  que sigue permitido son los íconos que no nombran nada que se mida: flechas y chevrones, descargar, imprimir, cerrar, el tilde y el
 *  glifo de «no hay nada» (`LUCIDE_PERMITIDOS`). Un producto con un glifo de acción propio lo pasa en `opciones.permitidos`.
 *
 *  ⚠️ **Es de test: importa `node:fs`.** No lo importe código de aplicación — entraría al bundle y el build se cae. Va sólo desde un
 *  `*.test.ts`. Lo copian los productos igual que `auditarTitulos`:
 *
 *      const r = auditarIndicadores(resolve(__dirname, '..'))
 *      expect(r.pantallas).toBeGreaterThan(0)            // el control: midió algo
 *      expect(describirInfracciones(r.infracciones)).toEqual([])
 *
 *  ⚠️ **Devuelve también cuánto midió** (`archivos`, `pantallas`), no sólo qué encontró mal. Una lista de infracciones vacía no prueba nada si
 *  el parser no encontró ninguna pantalla: su forma de fallar es devolver cero, que sin control se lee como «está todo bien».
 *
 *  Lo que NO ve: un ícono de la familia `iconos-accion` (Fluent) o de otro paquete, y un ícono que llega por una variable. Lo que sí cubre
 *  es lo que el relevamiento encontró: el `import` de lucide, con o sin alias, en una línea o en varias, el `import * as` y la ruta profunda.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import * as lucide from 'lucide-react'

/** Los íconos de lucide que se pueden importar en una pantalla de reporte o de tablero sin pasar por el catálogo: no nombran un concepto
 *  que se mida, son acción, navegación o estado. Se comparan por componente, no por nombre (`CheckCircle2` es `CircleCheck`). */
export const LUCIDE_PERMITIDOS: readonly string[] = [
  // Navegación
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ChevronLeft', 'ChevronRight', 'ChevronUp', 'ChevronDown',
  // Acciones
  'Download', 'FileDown', 'Upload', 'Printer', 'Plus', 'Minus', 'X', 'Search', 'RefreshCw', 'ExternalLink',
  // Estados
  'Check', 'CircleCheck', 'CheckCircle2', 'Loader2', 'Info',
  // El glifo de «no hay nada que mostrar» de un bloque vacío (no es la bandeja de comprobantes: no está solo en una tarjeta).
  'Inbox',
]

/** Si un archivo es una pantalla de reporte o de tablero, por su nombre. Pura. */
export function esPantallaDeIndicadores(ruta: string): boolean {
  const nombre = ruta.replaceAll('\\', '/').split('/').pop() ?? ''
  if (/\.(test|spec)\.[jt]sx?$/.test(nombre) || !/\.[jt]sx?$/.test(nombre)) return false
  return /^(reportes?|dashboard|tablero|inicio|indicadores?|kpis?)/i.test(nombre)
}

/** Los íconos de lucide que importa un fuente (el nombre de lucide, no el alias local). `'*'` es `import * as …`. Los imports de sólo tipo
 *  (`import type { LucideIcon }`, `{ type LucideIcon }`) no cuentan: no dibujan nada. */
export function lucideImportadosEn(fuente: string): string[] {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const nombres: string[] = []

  for (const m of sinComentarios.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) {
    if (m[1]) continue
    for (const especificador of m[2].split(',')) {
      const limpio = especificador.trim()
      if (!limpio || /^type\s/.test(limpio)) continue
      nombres.push(limpio.split(/\s+as\s+/)[0].trim())
    }
  }
  if (/import\s+\*\s+as\s+\w+\s+from\s*['"]lucide-react['"]/.test(sinComentarios)) nombres.push('*')
  // `import Package from 'lucide-react/dist/esm/icons/package'` y `…/icons/package`: la ruta profunda es el mismo ícono, escrito de otro modo.
  for (const m of sinComentarios.matchAll(/import\s+(?!type\b)(\w+)\s+from\s*['"]lucide-react\/[^'"]+['"]/g)) nombres.push(m[1])
  return nombres
}

/** Los íconos que ese fuente importa de lucide y que NO son de los permitidos: los que tenían que pasar por el catálogo. */
export function iconosDeConceptoEn(fuente: string, permitidos: readonly string[] = LUCIDE_PERMITIDOS): string[] {
  const componentes = lucide as unknown as Record<string, unknown>
  const ok = new Set<unknown>(permitidos.map((n) => componentes[n]).filter((c) => c !== undefined))
  return lucideImportadosEn(fuente).filter((n) => !ok.has(componentes[n]))
}

export type Infraccion = { archivo: string; iconos: string[] }

export type AuditoriaDeIndicadores = {
  /** Cuántos archivos `.ts`/`.tsx` recorrió. */
  archivos: number
  /** Cuántos eran una pantalla de reporte o de tablero. Es el control positivo. */
  pantallas: number
  /** Las pantallas que importan íconos de lucide por su cuenta. */
  infracciones: Infraccion[]
}

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === 'ui' || nombre === 'assets') return []
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return fuentes(ruta)
    return /\.[jt]sx?$/.test(nombre) ? [ruta] : []
  })
}

/** Audita un `src/` entero (el del kit o el `frontend/src` de un producto). `opciones.esPantalla` reemplaza la regla por nombre (para auditar
 *  una lista de archivos concreta); `opciones.permitidos` amplía los íconos que se pueden importar suelto. */
export function auditarIndicadores(
  raizSrc: string,
  opciones: { permitidos?: readonly string[]; esPantalla?: (ruta: string) => boolean } = {},
): AuditoriaDeIndicadores {
  const esPantalla = opciones.esPantalla ?? esPantallaDeIndicadores
  const todos = fuentes(raizSrc)
  const infracciones: Infraccion[] = []
  let pantallas = 0
  for (const ruta of todos) {
    const relativa = relative(raizSrc, ruta).replaceAll('\\', '/')
    if (!esPantalla(relativa)) continue
    pantallas++
    const iconos = iconosDeConceptoEn(readFileSync(ruta, 'utf8'), opciones.permitidos)
    if (iconos.length > 0) infracciones.push({ archivo: relativa, iconos: [...new Set(iconos)] })
  }
  return { archivos: todos.length, pantallas, infracciones }
}

/** Un renglón por pantalla, para que el test falle diciendo qué arreglar. */
export function describirInfracciones(infracciones: Infraccion[]): string[] {
  return infracciones.map((i) => `${i.archivo}: importa ${i.iconos.join(', ')} de lucide-react; pasá el concepto a TarjetaReporte / TarjetaIndicador / IconoIndicador (iconos-indicador)`)
}

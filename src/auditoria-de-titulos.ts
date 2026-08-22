/** El guard de que el icono del título es el del sidebar. Uno para los ocho.
 *
 *  🔴 **Lee los FUENTES, no el DOM**, y es a propósito — mismo criterio que
 *  `espaciado-de-campos`. Lo que hay que impedir no es que una pantalla se
 *  rompa (ninguna se rompe con el icono equivocado) sino que las pantallas
 *  **vuelvan a divergir**. Eso no se ve en ningún render: se ve comparando el
 *  mapa de navegación contra cada pantalla, y sólo si alguien se acuerda de
 *  comparar. Al 2026-08-21, antes de este guard, había **15 pantallas en
 *  Contalibra y 22 en RestoLibra** con un icono de título distinto al de su
 *  propia entrada del menú.
 *
 *  ⚠️ **Es de test: importa `node:fs`.** No lo importe código de aplicación —
 *  entraría al bundle y el build se cae. Va sólo desde un `*.test.ts`.
 *
 *  ⚠️ **Devuelve también cuánto midió, no sólo qué encontró mal.** Una lista de
 *  desajustes vacía no prueba nada si el parser no encontró ninguna pantalla:
 *  el test del producto tiene que afirmar `pantallas` y `conIcono` además de
 *  que `distinto` y `sinIcono` estén vacíos. Los dos parsers son frágiles por
 *  naturaleza —leen TSX con expresiones regulares— y su forma de fallar es
 *  devolver cero, que sin control se lee como "está todo bien".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Lo que hay entre `element={` y la pantalla de verdad en el App.tsx. Sin esta
 *  lista, seis de los ocho productos devuelven `ProtectedRoute` para todas sus
 *  rutas y el informe sale vacío. */
const ENVOLTORIOS = new Set([
  'ProtectedRoute', 'StandaloneRoute', 'Navigate', 'Suspense', 'Layout',
  'AppLayout', 'RequireAuth', 'Fragment', 'Route', 'Routes',
])

function leer(ruta: string): string {
  try {
    return readFileSync(ruta, 'utf8')
  } catch {
    return ''
  }
}

/** `{ruta: Icono}` del mapa de navegación.
 *
 *  🔴 El `icon:` se busca **hacia adelante y hasta el próximo `to:`**. Una
 *  ventana centrada en el `to:` agarra el icono del objeto vecino: con eso
 *  `/clientes` daba `FileText` cuando el fuente dice `Users`, y el informe
 *  marcaba como desajuste casi todo.
 */
export function iconosDelNav(fuenteLayout: string): Map<string, string> {
  const marcas: { ruta: string; fin: number }[] = []
  const re = /to:\s*'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fuenteLayout)) !== null) marcas.push({ ruta: m[1], fin: re.lastIndex })

  const out = new Map<string, string>()
  marcas.forEach(({ ruta, fin }, i) => {
    const hasta = i + 1 < marcas.length ? marcas[i + 1].fin : fuenteLayout.length
    const ic = /icon:\s*([A-Z][A-Za-z0-9]*)/.exec(fuenteLayout.slice(fin, hasta))
    if (ic) out.set(ruta, ic[1])
  })
  return out
}

/** `{ruta: NombreDeComponente}` del router, salteando envoltorios. */
export function rutasDelRouter(fuenteApp: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /path="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fuenteApp)) !== null) {
    const ventana = fuenteApp.slice(re.lastIndex, re.lastIndex + 500)
    const comp = /<\s*([A-Z][A-Za-z0-9]*)/g
    let c: RegExpExecArray | null
    while ((c = comp.exec(ventana)) !== null) {
      if (!ENVOLTORIOS.has(c[1])) { out.set(m[1], c[1]); break }
    }
  }
  return out
}

/** El icono que una pantalla pone al lado de su título. */
export function iconoDelTitulo(fuentePagina: string): { icono: string | null; forma: string } {
  const conComponente = /<TituloPantalla\s+icono=\{([A-Z][A-Za-z0-9]*)\}/.exec(fuentePagina)
  if (conComponente) return { icono: conComponente[1], forma: 'TituloPantalla' }
  // La forma escrita a mano: `<h2 …><Icono …/>`.
  const aMano = /<h[12][^>]*>\s*\n?\s*<([A-Z][A-Za-z0-9]*)[\s/]/.exec(fuentePagina)
  if (aMano) return { icono: aMano[1], forma: 'h a mano' }
  if (/<h[12]/.test(fuentePagina)) return { icono: null, forma: 'título SIN icono' }
  return { icono: null, forma: 'sin título' }
}

/** El nombre con el que se importó un identificador, resolviendo el `as`.
 *
 *  🔴 **Sin esto el guard inventa desajustes.** LibraDesk importa
 *  `{ Activos as IconoActivos }`: comparar los nombres locales daba
 *  `IconoActivos ≠ Activos` y marcaba como error dos pantallas que usan
 *  exactamente el icono que corresponde.
 */
export function resolverAlias(fuente: string, local: string): string {
  const re = new RegExp(`([A-Za-z0-9_$]+)\\s+as\\s+${local}\\b`)
  const m = re.exec(fuente)
  return m ? m[1] : local
}

export type Desajuste = { ruta: string; pantalla: string; titulo: string | null; sidebar: string; forma: string }

export type Auditoria = {
  /** Cuántas entradas tiene el mapa de navegación. */
  rutasDelNav: number
  /** Cuántas pantallas del router caen bajo una entrada del nav. */
  pantallas: number
  /** Cuántas de ésas ya usan el icono correcto. Es el control positivo. */
  conIcono: number
  /** Usan un icono distinto al del sidebar. */
  distinto: Desajuste[]
  /** Tienen título y le falta el icono. Esto SÍ es trabajo pendiente. */
  sinIcono: Desajuste[]
  /** No tienen título propio. **No es un desajuste**: son las sub-pantallas
   *  que se rinden adentro del encabezado de otra (las cuatro de
   *  `/configuracion/*` en LibraDesk). Se informan aparte para que el guard no
   *  mande a ponerle un icono a un archivo que no tiene dónde. */
  sinTitulo: Desajuste[]
}

/** Audita un producto entero. `raizSrc` es su `frontend/src`. */
export function auditarTitulos(raizSrc: string): Auditoria {
  const fuenteLayout = leer(join(raizSrc, 'components', 'Layout.tsx'))
  const nav = iconosDelNav(fuenteLayout)
  const rutas = rutasDelRouter(leer(join(raizSrc, 'App.tsx')))

  const distinto: Desajuste[] = []
  const sinIcono: Desajuste[] = []
  const sinTitulo: Desajuste[] = []
  let pantallas = 0
  let conIcono = 0

  for (const [ruta, pantalla] of [...rutas].sort()) {
    // Una pantalla de detalle (`/clientes/:id`) hereda el icono de su entrada
    // del menú (`/clientes`): el sidebar no tiene una fila por cada detalle.
    const base = '/' + ruta.replace(/^\/+/, '').split('/')[0]
    const sidebarLocal = nav.get(ruta) ?? nav.get(base)
    if (!sidebarLocal) continue
    pantallas++

    const fuentePagina = leer(join(raizSrc, 'pages', `${pantalla}.tsx`))
    const { icono, forma } = iconoDelTitulo(fuentePagina)
    // Los dos lados se resuelven contra SU propio archivo: el mismo icono
    // puede estar importado con alias en la pantalla y sin alias en el Layout.
    const sidebar = resolverAlias(fuenteLayout, sidebarLocal)
    const fila = { ruta, pantalla, titulo: icono, sidebar, forma }

    if (icono === null) {
      (forma === 'sin título' ? sinTitulo : sinIcono).push(fila)
    } else if (resolverAlias(fuentePagina, icono) !== sidebar) {
      distinto.push(fila)
    } else {
      conIcono++
    }
  }

  return { rutasDelNav: nav.size, pantallas, conIcono, distinto, sinIcono, sinTitulo }
}

/** Un renglón por desajuste, para que el test falle diciendo qué arreglar. */
export function describirDesajustes(ds: Desajuste[]): string[] {
  return ds.map((d) => `${d.ruta} (${d.pantalla}): título=${d.titulo ?? d.forma}, sidebar=${d.sidebar}`)
}

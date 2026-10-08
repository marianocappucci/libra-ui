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
import * as lucide from 'lucide-react'
import { ICONOS, iconoDelConcepto, type Concepto } from './iconos-identidad'
import type { Producto } from './identidad'

/** Cómo se escribe un icono en un `icon:` o un `icono={…}`: un componente (`Users`) o una entrada del catálogo (`ICONOS.clientes`,
 *  `ICONOS_LC.proveedores`: ADR-035). */
const EXPR_ICONO = String.raw`[A-Z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9]*)?`

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
    const ic = new RegExp(String.raw`icon:\s*(${EXPR_ICONO})`).exec(fuenteLayout.slice(fin, hasta))
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
  // `icono` puede no ser la primera prop (`<TituloPantalla acciones={…} icono={…}>`, ADR-038): se acepta cualquier cosa hasta `icono=`, sin cruzar
  // a otro `<TituloPantalla` y con un tope, para que un título sin `icono` (que el tipo no admite) no se lleve el de la pantalla de al lado.
  const conComponente = new RegExp(String.raw`<TituloPantalla\b(?:(?!<TituloPantalla|\bicono=)[\s\S]){0,600}?\bicono=\{(${EXPR_ICONO})\}`).exec(fuentePagina)
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

/** A qué componente de lucide apunta una expresión de icono, para comparar un `icon: Users` del menú con un `icono={ICONOS.clientes}` del título
 *  (o al revés) sin marcar un desajuste que no existe. `X.concepto` se resuelve contra el catálogo (con las excepciones de `producto`); un
 *  nombre suelto, contra lucide (`BarChart3` y `ChartColumn` son el mismo); lo que no es ninguna de las dos cosas (un icono propio del
 *  producto) se compara por su nombre. */
function comparable(expresion: string, fuente: string, producto?: Producto): string {
  const miembro = /^[A-Z][A-Za-z0-9_]*\.([a-z][A-Za-z0-9]*)$/.exec(expresion)
  if (miembro) {
    return miembro[1] in ICONOS
      ? (iconoDelConcepto(miembro[1] as Concepto, producto) as { displayName?: string }).displayName ?? expresion
      : expresion
  }
  const nombre = resolverAlias(fuente, expresion)
  return (lucide as unknown as Record<string, { displayName?: string } | undefined>)[nombre]?.displayName ?? nombre
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

/** Audita un producto entero. `raizSrc` es su `frontend/src`. `producto` sólo hace falta si algún `ICONOS.concepto` del menú o de los títulos
 *  tiene excepción en ese producto (LibraCargo). */
export function auditarTitulos(raizSrc: string, producto?: Producto): Auditoria {
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
    const sidebar = sidebarLocal.includes('.') ? sidebarLocal : resolverAlias(fuenteLayout, sidebarLocal)
    const fila = { ruta, pantalla, titulo: icono, sidebar, forma }

    if (icono === null) {
      (forma === 'sin título' ? sinTitulo : sinIcono).push(fila)
    } else if (comparable(icono, fuentePagina, producto) !== comparable(sidebar, fuenteLayout, producto)) {
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

export type DesajusteDeCatalogo = { ruta: string; concepto: Concepto; esperado: string; encontrado: string | null }

/** El guard del catálogo (ADR-035) para el menú de un producto: cada ruta de `rutaAConcepto` tiene que llevar en su `icon:` el ícono del
 *  catálogo para ese concepto. Lee el fuente del `Layout.tsx`, por lo mismo que `auditarTitulos`: el menú no se exporta y lo que hay que
 *  impedir es que vuelva a divergir. Acepta las dos formas, `icon: ICONOS.caja` y el nombre suelto de lucide (`icon: Wallet`), así un producto
 *  puede migrar de a una entrada.
 *
 *  Devuelve también cuánto midió (`medidas`) y las rutas del mapa que el menú no tiene (`faltan`): una lista `mal` vacía no prueba nada si el
 *  parser no encontró ninguna entrada. El test del producto afirma `medidas === Object.keys(mapa).length` además de `mal` y `faltan` vacíos. */
export function auditarMenuContraCatalogo(
  fuenteLayout: string,
  rutaAConcepto: Record<string, Concepto>,
  producto?: Producto,
): { medidas: number; mal: DesajusteDeCatalogo[]; faltan: string[] } {
  const nav = iconosDelNav(fuenteLayout)
  const mal: DesajusteDeCatalogo[] = []
  const faltan: string[] = []
  let medidas = 0
  for (const [ruta, concepto] of Object.entries(rutaAConcepto)) {
    const encontrado = nav.get(ruta)
    if (!encontrado) { faltan.push(ruta); continue }
    medidas++
    const esperado = (iconoDelConcepto(concepto, producto) as { displayName?: string }).displayName ?? concepto
    if (comparable(encontrado, fuenteLayout, producto) !== esperado) mal.push({ ruta, concepto, esperado, encontrado })
  }
  return { medidas, mal, faltan }
}

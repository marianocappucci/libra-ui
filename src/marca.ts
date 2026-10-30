// La marca de la instancia: el nombre, el logo y el color con los que un revendedor vende el sistema como propio (ADR-098, marca blanca).
//
// Es el hermano de `tema.ts` (ADR-007/008): cada instancia guarda su marca (`libracore.marca_router`, ADR-092) y la SPA la lee de ELLA, no del
// backoffice. Una instancia sin marca propia (`propia: false`) se ve exactamente como siempre: todo lo de acá es opt-in.
//
// ## Qué hace
//
//   1. **Un almacén en memoria** (`leerMarca`, `suscribirMarca`, `useMarca`) del que leen `Layout`, `Login` y `PasswordReset`: con marca propia
//      el nombre y el logo salen de acá en lugar de las props del producto, y NO se dibuja la identidad de Libra (su ícono ni su fondo).
//   2. **El documento:** el `<title>`, el favicon, el `apple-touch-icon` y el `theme-color`. Lo que había se fotografía la primera vez y se
//      restaura si la marca cambia o se borra, así que no importa en qué orden arranque el producto (`aplicarIdentidad` ya está avisada).
//   3. **El acento:** el color de la marca es el acento por defecto (`fijarAcentoDeMarca`); un `acento` explícito del tema le gana.
//
// ## Cómo se usa (en `main.tsx`, antes de montar React)
//
//     import { cargarMarca } from 'libra-ui/marca'
//     void cargarMarca().finally(() => createRoot(...).render(...))
//
// `cargarMarca` no falla nunca. Con una marca guardada en este navegador la aplica al instante y devuelve sin esperar (refresca de fondo);
// en la primerísima visita espera la respuesta, con un tope corto, para que un login de marca blanca no arranque diciendo «VentaLibra».
//
// ## Lo que NO puede hacer
//
// El `<title>` y el favicon que trae el `index.html` se ven hasta que corre el JavaScript, y un enlace compartido (WhatsApp, redes) lee ese
// HTML sin ejecutarlo. Para «estricta» ahí hace falta que el servidor reescriba el `index.html`; no es de este módulo.
import { useSyncExternalStore } from 'react'
import type { ProductLogo } from './branding'
import { fijarAcentoDeMarca } from './tema'

/** Lo que devuelve `GET /api/marca`. `propia: false` es «esta instancia usa la marca de su producto». */
export type Marca = {
  propia: boolean
  nombre: string
  nombre_corto: string
  /** `#rrggbb` en minúsculas, o vacío. */
  color: string
  /** Ruta del logo (`/api/marca/logo?v=…`), o vacío. */
  logo: string
}

export const MARCA_VACIA: Marca = Object.freeze({ propia: false, nombre: '', nombre_corto: '', color: '', logo: '' })

export const CLAVE_DE_CACHE_DE_LA_MARCA = 'libra.marca'

const MAX_NOMBRE = 40
const MAX_NOMBRE_CORTO = 12
const COLOR = /^#[0-9a-f]{6}$/i
/** Sólo el logo de esta misma instancia: una URL de otro origen (o con otro camino) no se carga, venga de donde venga. */
const LOGO = /^\/api\/marca\/logo(\?v=[0-9a-f]{12})?$/

function texto(valor: unknown, maximo: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, maximo) : ''
}

/** La marca que se puede mostrar a partir de lo que llegó (de la red o de la caché). Nunca lanza: lo que no cumple se descarta. */
export function validarMarca(crudo: unknown): Marca {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return MARCA_VACIA
  const c = crudo as Record<string, unknown>
  if (c.propia !== true) return MARCA_VACIA
  const nombre = texto(c.nombre, MAX_NOMBRE)
  const nombre_corto = texto(c.nombre_corto, MAX_NOMBRE_CORTO)
  const color = typeof c.color === 'string' && COLOR.test(c.color.trim()) ? c.color.trim().toLowerCase() : ''
  const logo = typeof c.logo === 'string' && LOGO.test(c.logo) ? c.logo : ''
  // `propia` sin nada que mostrar no es una marca: la instancia se ve como la de su producto.
  if (!nombre && !color && !logo) return MARCA_VACIA
  return { propia: true, nombre, nombre_corto, color, logo }
}

// ── El almacén ─────────────────────────────────────────────────────────────

let actual: Marca = MARCA_VACIA
const oyentes = new Set<() => void>()

export function leerMarca(): Marca {
  return actual
}

/** `true` si la instancia tiene marca propia: `aplicarIdentidad` lo mira para no pisar el favicon ni el `theme-color`. */
export function hayMarcaPropia(): boolean {
  return actual.propia
}

export function suscribirMarca(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export function useMarca(): Marca {
  return useSyncExternalStore(suscribirMarca, leerMarca, () => MARCA_VACIA)
}

/** Cómo se llama LibraEdge en pantalla (ADR-099): con marca propia no se dice «LibraEdge» (es un nombre de Libra, y no sale de `productName`):
 *  se nombra lo que hace, igual que la entrada del menú. */
export const NOMBRE_DE_LIBRAEDGE = 'LibraEdge'
export const NOMBRE_NEUTRO_DE_LIBRAEDGE = 'Sucursal sin internet'
export function nombreDeLibraEdge(marcaPropia: boolean): string {
  return marcaPropia ? NOMBRE_NEUTRO_DE_LIBRAEDGE : NOMBRE_DE_LIBRAEDGE
}

/** Lo que `Layout`, `Login` y `PasswordReset` dibujan, resuelto contra las props del producto. */
export type MarcaVisible = {
  nombre: string
  inicial: string
  /** El logo de la marca, si lo tiene. Sin él, con marca propia se dibuja la inicial del nombre. */
  logo: ProductLogo | undefined
  /** `true` si la marca reemplaza la identidad de Libra: no se dibuja su ícono (`producto`, `icon`) ni su fondo. */
  reemplaza: boolean
}

export function resolverMarca(marca: Marca, productName: string, productInitial: string): MarcaVisible {
  const nombre = marca.propia && marca.nombre ? marca.nombre : productName
  const inicial = marca.propia && marca.nombre ? ([...marca.nombre][0] ?? productInitial).toUpperCase() : productInitial
  return {
    nombre,
    inicial,
    logo: marca.propia && marca.logo ? { src: marca.logo, alt: nombre } : undefined,
    // Un color solo cambia el acento: la identidad de Libra se reemplaza cuando la marca trae nombre o logo.
    reemplaza: marca.propia && !!(marca.nombre || marca.logo),
  }
}

export function useMarcaVisible(productName: string, productInitial: string): MarcaVisible {
  const marca = useMarca()
  return resolverMarca(marca, productName, productInitial)
}

// ── El documento ───────────────────────────────────────────────────────────

type Atributos = Record<string, string | null>
type Fila = { selector: string; nuevo: () => Element; atributos: string[] }

const FILAS: Record<'favicon' | 'apple' | 'tema', Fila> = {
  favicon: { selector: 'link[rel~="icon"]', nuevo: () => Object.assign(document.createElement('link'), { rel: 'icon' }), atributos: ['href', 'type'] },
  apple: { selector: 'link[rel="apple-touch-icon"]', nuevo: () => Object.assign(document.createElement('link'), { rel: 'apple-touch-icon' }), atributos: ['href'] },
  tema: { selector: 'meta[name="theme-color"]', nuevo: () => Object.assign(document.createElement('meta'), { name: 'theme-color' }), atributos: ['content'] },
}

/** Lo que el documento tenía antes de la primera marca. `null` en una fila = ese elemento no existía. */
let originales: { titulo: string; filas: Record<keyof typeof FILAS, Atributos | null> } | null = null

function instantanea(fila: Fila): Atributos | null {
  const el = document.head.querySelector(fila.selector)
  return el ? Object.fromEntries(fila.atributos.map((a) => [a, el.getAttribute(a)])) : null
}

function escribir(fila: Fila, valores: Atributos | null): void {
  let el = document.head.querySelector(fila.selector)
  if (valores === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = fila.nuevo()
    document.head.appendChild(el)
  }
  for (const [atributo, valor] of Object.entries(valores)) {
    if (valor === null) el.removeAttribute(atributo)
    else el.setAttribute(atributo, valor)
  }
}

function versionDeIconos(m: Marca): string {
  const hash = m.logo.split('v=')[1] ?? ''
  const v = `${hash}${m.color.replace('#', '')}`
  return v ? `?v=${v}` : ''
}

/** Pone en el documento lo que la marca define y restaura lo demás a como estaba. Idempotente. */
function aplicarAlDocumento(m: Marca): void {
  if (typeof document === 'undefined') return
  originales ??= {
    titulo: document.title,
    filas: { favicon: instantanea(FILAS.favicon), apple: instantanea(FILAS.apple), tema: instantanea(FILAS.tema) },
  }
  const v = versionDeIconos(m)
  document.title = m.propia && m.nombre ? m.nombre : originales.titulo
  escribir(FILAS.favicon, m.propia && m.logo ? { href: `/api/marca/icono/192.png${v}`, type: 'image/png' } : originales.filas.favicon)
  escribir(FILAS.apple, m.propia && m.logo ? { href: `/api/marca/icono/apple.png${v}` } : originales.filas.apple)
  escribir(FILAS.tema, m.propia && m.color ? { content: m.color } : originales.filas.tema)
}

function fijar(m: Marca): void {
  const cambio = JSON.stringify(m) !== JSON.stringify(actual)
  actual = m
  aplicarAlDocumento(m)
  fijarAcentoDeMarca(m.propia && m.color ? m.color : undefined)
  if (cambio) oyentes.forEach((oyente) => oyente())
}

/** Sólo para los tests: vuelve al estado inicial y restaura el documento. */
export function reiniciarMarca(): void {
  fijar(MARCA_VACIA)
  originales = null
}

// ── La carga ───────────────────────────────────────────────────────────────

function leerCache(): Marca | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_DE_CACHE_DE_LA_MARCA)
    return crudo === null ? null : validarMarca(JSON.parse(crudo))
  } catch {
    return null
  }
}

function guardarCache(m: Marca): void {
  try {
    window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, JSON.stringify(m))
  } catch {
    // Sin almacenamiento (navegación privada, cuota): la marca se aplica igual, sólo que sin caché.
  }
}

async function pedir(url: string, tiempoMs: number): Promise<Marca | null> {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), tiempoMs)
  try {
    const respuesta = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: control.signal })
    if (!respuesta.ok) return null
    const cuerpo = (await respuesta.json()) as unknown
    // Sin un objeto con `propia` la respuesta está rota (un proxy que devuelve otra cosa, una versión vieja del motor): se conserva lo que había.
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || typeof (cuerpo as { propia?: unknown }).propia !== 'boolean') return null
    return validarMarca(cuerpo)
  } catch {
    return null
  } finally {
    clearTimeout(reloj)
  }
}

/** Carga la marca de la instancia. Se llama UNA vez, en `main.tsx`, antes de montar React. **Nunca lanza.**
 *
 * - **Con una marca guardada en este navegador** (también «sin marca»): la aplica en el acto, devuelve sin esperar y refresca de fondo; si
 *   cambió, la pantalla se actualiza sola.
 * - **Sin nada guardado** (la primera visita): espera la respuesta hasta `tiempoMs`, para no pintar un cuadro con la marca del producto.
 *   Una respuesta buena se guarda, así que esa espera ocurre una sola vez por navegador.
 * - Sin red, con un error o con una respuesta rota: queda lo que había. Una marca es un adorno, no puede impedir entrar al sistema. */
export async function cargarMarca(
  { url = '/api/marca', tiempoMs = 2000 }: { url?: string; tiempoMs?: number } = {},
): Promise<Marca> {
  if (typeof window === 'undefined') return MARCA_VACIA
  const guardada = leerCache()
  if (guardada) {
    fijar(guardada)
    void pedir(url, tiempoMs).then((m) => {
      if (!m) return
      guardarCache(m)
      fijar(m)
    })
    return guardada
  }
  const m = await pedir(url, tiempoMs)
  if (!m) return actual
  guardarCache(m)
  fijar(m)
  return m
}

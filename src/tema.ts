// El tema de la suite: qué colores se pueden cambiar, con qué valores y cómo se aplican (ADR-007, `v0.93.0`).
//
// 🔴 **Esta es la ÚNICA lista de colores editables.** La leen tres lugares y ninguno debe tener su copia: el backoffice (para
// armar la pantalla «Apariencia»), la instancia (para validar lo que le llega) y la SPA (para aplicarlo). Un color nuevo se
// agrega acá, en `tema.css` si es una variable propia, y en nada más.
//
// Sólo se ofrecen colores de una lista cerrada, a propósito: dejar elegir «cualquier variable» permitiría un texto ilegible
// que nadie ve hasta que un cliente lo reporta. Cada color pasa por `validarTema`, y el texto que va encima de un fondo
// elegido NO se elige: se calcula (`textoSobre`) para que el contraste cumpla WCAG AA.

/** Las claves de los colores editables. */
export const CLAVES_DE_TEMA = ['menuActivoFondo', 'menuActivoBorde'] as const
export type ClaveDeTema = (typeof CLAVES_DE_TEMA)[number]

/** Un valor por clave, en `#rrggbb`. Parcial: lo que falta usa el defecto. */
export type Tema = Partial<Record<ClaveDeTema, string>>

export type DefinicionDeColor = {
  clave: ClaveDeTema
  /** Cómo se llama en la pantalla del backoffice. */
  etiqueta: string
  /** Qué cambia, en una línea. */
  ayuda: string
  /** La variable CSS que se fija (`tema.css` declara su defecto). */
  variable: string
  /** El valor de siempre, `#rrggbb` en minúsculas. */
  porDefecto: string
  /** Si el color lleva texto encima: la variable CSS donde se guarda el texto calculado y el piso de contraste. */
  textoSobre?: { variable: string; contrasteMinimo: number }
}

export const COLORES_DE_TEMA: readonly DefinicionDeColor[] = [
  {
    clave: 'menuActivoFondo',
    etiqueta: 'Ítem activo del menú: fondo',
    ayuda: 'El fondo de la opción del menú lateral en la que estás parado.',
    variable: '--libra-menu-activo-fondo',
    porDefecto: '#ecfdf5',
    textoSobre: { variable: '--libra-menu-activo-texto', contrasteMinimo: 4.5 },
  },
  {
    clave: 'menuActivoBorde',
    etiqueta: 'Ítem activo del menú: borde',
    ayuda: 'El borde de esa misma opción. Tiene que distinguirse del fondo de la barra.',
    variable: '--libra-menu-activo-borde',
    porDefecto: '#5ee9b5',
  },
]

const HEX = /^#[0-9a-f]{6}$/

/** `#rgb` o `#rrggbb` (cualquier mayúscula) -> `#rrggbb` en minúsculas, o `null` si no es un color. */
export function normalizarHex(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const v = valor.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return HEX.test(v) ? v : null
}

function canal(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa WCAG de un `#rrggbb` (0 negro, 1 blanco). */
export function luminancia(hex: string): number {
  const n = normalizarHex(hex)
  if (!n) throw new Error(`no es un color: ${hex}`)
  const r = parseInt(n.slice(1, 3), 16)
  const g = parseInt(n.slice(3, 5), 16)
  const b = parseInt(n.slice(5, 7), 16)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Relación de contraste WCAG entre dos colores, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const TEXTO_OSCURO = '#0f172a'
const TEXTO_CLARO = '#ffffff'

/** El texto (oscuro o claro) que mejor se lee sobre ese fondo. */
export function textoSobre(fondo: string): string {
  return contraste(fondo, TEXTO_OSCURO) >= contraste(fondo, TEXTO_CLARO) ? TEXTO_OSCURO : TEXTO_CLARO
}

export type ResultadoDeTema = {
  /** El tema limpio: sólo claves conocidas, en `#rrggbb` minúsculas. */
  tema: Tema
  /** Por qué se rechazó cada clave (la que está acá no está en `tema`). */
  errores: Partial<Record<string, string>>
}

/** Valida y normaliza lo que llegó (del formulario del backoffice o del cable). Una clave desconocida o un valor que no es un
 *  color se rechaza con el motivo; un fondo cuyo mejor texto no llega al contraste mínimo, también. Nunca lanza. */
export function validarTema(crudo: unknown): ResultadoDeTema {
  const tema: Tema = {}
  const errores: Partial<Record<string, string>> = {}
  const entrada = crudo && typeof crudo === 'object' ? (crudo as Record<string, unknown>) : {}
  for (const clave of Object.keys(entrada)) {
    const def = COLORES_DE_TEMA.find((d) => d.clave === clave)
    if (!def) {
      errores[clave] = 'color desconocido'
      continue
    }
    const hex = normalizarHex(entrada[clave])
    if (!hex) {
      errores[clave] = 'no es un color (se espera #rrggbb)'
      continue
    }
    if (def.textoSobre) {
      const mejor = contraste(hex, textoSobre(hex))
      if (mejor < def.textoSobre.contrasteMinimo) {
        errores[clave] = `ningún texto se lee sobre ese fondo (contraste ${mejor.toFixed(1)}, mínimo ${def.textoSobre.contrasteMinimo})`
        continue
      }
    }
    tema[def.clave] = hex
  }
  return { tema, errores }
}

/** Fija el tema en un elemento (por defecto, `<html>`): un estilo en línea le gana al `:root` de `tema.css`. Lo que no está en el
 *  tema se limpia, así «restaurar valores por defecto» es aplicar `{}`. Calcula también el texto de los fondos. */
export function aplicarTema(tema: Tema, elemento: HTMLElement = document.documentElement): void {
  const { tema: limpio } = validarTema(tema)
  for (const def of COLORES_DE_TEMA) {
    const valor = limpio[def.clave]
    if (valor) {
      elemento.style.setProperty(def.variable, valor)
      if (def.textoSobre) elemento.style.setProperty(def.textoSobre.variable, textoSobre(valor))
    } else {
      elemento.style.removeProperty(def.variable)
      if (def.textoSobre) elemento.style.removeProperty(def.textoSobre.variable)
    }
  }
}

/** Dónde se guarda la última versión del tema que vino de la instancia. */
export const CLAVE_DE_CACHE_DEL_TEMA = 'libra.tema'

function leerCache(): Tema {
  try {
    return validarTema(JSON.parse(window.localStorage.getItem(CLAVE_DE_CACHE_DEL_TEMA) ?? 'null')).tema
  } catch {
    return {}
  }
}

function guardarCache(tema: Tema): void {
  try {
    if (Object.keys(tema).length) window.localStorage.setItem(CLAVE_DE_CACHE_DEL_TEMA, JSON.stringify(tema))
    else window.localStorage.removeItem(CLAVE_DE_CACHE_DEL_TEMA)
  } catch {
    // Sin almacenamiento (navegación privada, cuota): el tema se aplica igual, sólo que sin caché.
  }
}

/** Carga el tema de la suite al arrancar la SPA. Se llama UNA vez, en `main.tsx`, **antes** de montar React:
 *
 *     import { cargarTema } from 'libra-ui/tema'
 *     void cargarTema()
 *
 * 1. **Síncrono:** aplica lo último que se guardó en `localStorage`, así la página se pinta con los colores de la suite desde el primer
 *    cuadro (sólo la primerísima visita de un navegador arranca con los de siempre).
 * 2. **Después** pide `GET /api/tema` a la propia instancia (no al backoffice: una instancia de cliente no puede depender de que el plano
 *    de control esté arriba), valida lo que llegó, lo aplica y lo guarda. Un tema vacío limpia la caché: es «restaurar los valores por
 *    defecto».
 *
 * **Nunca lanza ni se queda colgada:** sin red, con un error del servidor, con una respuesta rota o pasados `tiempoMs`, queda aplicado lo
 * que ya había y la app arranca igual. Un color es un adorno, no puede impedir entrar al sistema. */
export async function cargarTema(
  { url = '/api/tema', tiempoMs = 3000, elemento }: { url?: string; tiempoMs?: number; elemento?: HTMLElement } = {},
): Promise<Tema> {
  if (typeof window === 'undefined') return {}
  const guardado = leerCache()
  aplicarTema(guardado, elemento)

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), tiempoMs)
  try {
    const respuesta = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: control.signal })
    if (!respuesta.ok) return guardado
    const cuerpo = (await respuesta.json()) as { tema?: unknown } | null
    // Sin un objeto `tema` la respuesta está rota (un proxy que devuelve otra cosa, una versión vieja): se conserva lo que había. Sólo
    // un `{}` explícito es «restaurar los valores por defecto».
    const crudo = cuerpo?.tema
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return guardado
    const { tema } = validarTema(crudo)
    aplicarTema(tema, elemento)
    guardarCache(tema)
    return tema
  } catch {
    return guardado
  } finally {
    clearTimeout(reloj)
  }
}

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

import { iniciarModo } from './modo'

export const CLAVES_DE_TEMA = [
  'acento',
  'barraLateralFondo',
  'exito',
  'posEncabezadoInicio',
  'posEncabezadoFin',
  'menuActivoFondo',
  'menuActivoBorde',
] as const
export type ClaveDeTema = (typeof CLAVES_DE_TEMA)[number]

/** Un valor por clave, en `#rrggbb`. Parcial: lo que falta usa el defecto. */
export type Tema = Partial<Record<ClaveDeTema, string>>

export type DefinicionDeColor = {
  clave: ClaveDeTema
  /** Cómo se llama en la pantalla del backoffice. */
  etiqueta: string
  /** Qué cambia, en una línea. */
  ayuda: string
  /** La variable CSS que se fija (`tema.css` declara su defecto, salvo si `defectoPorProducto`). */
  variable: string
  /** Otras variables que reciben el mismo color (p. ej. el anillo de foco sigue al acento). */
  tambien?: readonly string[]
  /** El valor de siempre, `#rrggbb` en minúsculas. Si `defectoPorProducto`, es sólo una referencia para la vista previa. */
  porDefecto: string
  /** El «valor de siempre» depende del producto (lo declara su `index.css`): mientras no se elija uno, no se toca la variable. */
  defectoPorProducto?: boolean
  /** Si el color lleva texto encima: la variable CSS donde se guarda el texto calculado y el piso de contraste. */
  textoSobre?: {
    variable: string
    contrasteMinimo: number
    /** Otras variables que reciben el mismo texto calculado. */
    tambien?: readonly string[]
    /** Usa texto blanco mientras llegue al mínimo (botones y franjas de color: así el defecto de siempre sigue en blanco). */
    prefiereBlanco?: boolean
  }
  /** Si el color es de superficie (barra lateral): variables derivadas (hover, borde) que se mezclan con el texto calculado. */
  derivadas?: readonly { variable: string; mezcla: number }[]
  /** Si el color se usa como texto o ícono sobre la página: debe distinguirse del fondo claro Y del oscuro (contraste mínimo). */
  legibleSobrePagina?: number
  /** Variantes del color para usarlo como TEXTO (no como fondo) en cada modo: se ajustan hasta llegar a 4,5:1 contra el fondo de ese modo, así
   *  el texto de éxito se lee en los dos aunque el color elegido sea el mismo. */
  comoTexto?: { claro: string; oscuro: string }
}

export const COLORES_DE_TEMA: readonly DefinicionDeColor[] = [
  {
    clave: 'acento',
    etiqueta: 'Acento principal',
    ayuda: 'Botones principales, enlaces destacados y el anillo de foco. Vale igual en modo claro y oscuro.',
    variable: '--primary',
    tambien: ['--ring', '--sidebar-primary'],
    porDefecto: '#171717',
    defectoPorProducto: true,
    textoSobre: { variable: '--primary-foreground', tambien: ['--sidebar-primary-foreground'], contrasteMinimo: 4.5 },
    legibleSobrePagina: 3,
  },
  {
    clave: 'barraLateralFondo',
    etiqueta: 'Barra lateral: fondo',
    ayuda: 'El fondo del menú lateral. El texto, los íconos, el borde y el color al pasar el mouse se calculan solos.',
    variable: '--sidebar',
    porDefecto: '#fafafa',
    defectoPorProducto: true,
    textoSobre: { variable: '--sidebar-foreground', tambien: ['--sidebar-accent-foreground'], contrasteMinimo: 4.5 },
    derivadas: [
      { variable: '--sidebar-accent', mezcla: 0.08 },
      { variable: '--sidebar-border', mezcla: 0.14 },
    ],
  },
  {
    clave: 'exito',
    etiqueta: 'Color de éxito',
    ayuda: 'Montos a favor, estados «cobrada» o «pagada» y el botón de confirmar. Tiene que verse sobre fondo claro y oscuro.',
    variable: '--libra-exito',
    porDefecto: '#059669',
    textoSobre: { variable: '--libra-exito-texto', contrasteMinimo: 3, prefiereBlanco: true },
    legibleSobrePagina: 3,
    comoTexto: { claro: '--libra-exito-como-texto-claro', oscuro: '--libra-exito-como-texto-oscuro' },
  },
  {
    clave: 'posEncabezadoInicio',
    etiqueta: 'Encabezado del POS: inicio',
    ayuda: 'El color de la izquierda de la franja superior del punto de venta. Iguales inicio y fin dan un color liso.',
    variable: '--libra-pos-encabezado-inicio',
    porDefecto: '#0284c7',
    textoSobre: { variable: '--libra-pos-encabezado-texto', contrasteMinimo: 3, prefiereBlanco: true },
  },
  {
    clave: 'posEncabezadoFin',
    etiqueta: 'Encabezado del POS: fin',
    ayuda: 'El color de la derecha de esa franja.',
    variable: '--libra-pos-encabezado-fin',
    porDefecto: '#4f46e5',
  },
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

const FONDO_CLARO = '#ffffff'
const FONDO_OSCURO = '#0a0a0a'
const TEXTO_OSCURO = '#0f172a'
const TEXTO_CLARO = '#ffffff'

/** El texto (oscuro o claro) que mejor se lee sobre ese fondo. */
export function textoSobre(fondo: string): string {
  return contraste(fondo, TEXTO_OSCURO) >= contraste(fondo, TEXTO_CLARO) ? TEXTO_OSCURO : TEXTO_CLARO
}

/** Mezcla `a` con `b` en la proporción `t` de `b` (0 = a, 1 = b), en `#rrggbb`. */
export function mezclar(a: string, b: string, t: number): string {
  const x = normalizarHex(a)
  const y = normalizarHex(b)
  if (!x || !y) throw new Error(`no es un color: ${a} / ${b}`)
  const c = (i: number) => Math.round(parseInt(x.slice(i, i + 2), 16) * (1 - t) + parseInt(y.slice(i, i + 2), 16) * t)
  return `#${[1, 3, 5].map((i) => c(i).toString(16).padStart(2, '0')).join('')}`
}

/** El fondo contra el que se mide un texto en cada modo (la tarjeta, y el tinte de éxito que se le pone encima en oscuro). */
const FONDO_TEXTO_CLARO = '#ffffff'
const FONDO_TEXTO_OSCURO = '#162420'

/** Acerca `hex` al negro (fondo claro) o al blanco (fondo oscuro) de a poco hasta que el contraste contra `fondo` llegue a `minimo`. Si ya
 *  llega, lo devuelve igual. */
export function ajustarContraste(hex: string, fondo: string, minimo: number): string {
  const hacia = luminancia(fondo) > 0.5 ? '#000000' : '#ffffff'
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mezclar(hex, hacia, Math.min(t, 1))
    if (contraste(c, fondo) >= minimo) return c
  }
  return hacia
}

function textoPara(def: DefinicionDeColor, fondo: string): string {
  return def.textoSobre?.prefiereBlanco && contraste(fondo, TEXTO_CLARO) >= def.textoSobre.contrasteMinimo ? TEXTO_CLARO : textoSobre(fondo)
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
      const mejor = contraste(hex, textoPara(def, hex))
      if (mejor < def.textoSobre.contrasteMinimo) {
        errores[clave] = `ningún texto se lee sobre ese fondo (contraste ${mejor.toFixed(1)}, mínimo ${def.textoSobre.contrasteMinimo})`
        continue
      }
    }
    if (def.derivadas && def.textoSobre) {
      // Los colores derivados (hover, borde) se mezclan hacia el texto: el texto tiene que seguir leyéndose sobre el más claro/oscuro.
      const texto = textoPara(def, hex)
      const peor = Math.min(...def.derivadas.map((d) => contraste(mezclar(hex, texto, d.mezcla), texto)))
      if (peor < def.textoSobre.contrasteMinimo) {
        errores[clave] = `el texto no se lee sobre el color al pasar el mouse (contraste ${peor.toFixed(1)}, mínimo ${def.textoSobre.contrasteMinimo}); elegí un fondo más claro u oscuro`
        continue
      }
    }
    if (def.legibleSobrePagina) {
      const peor = Math.min(contraste(hex, FONDO_CLARO), contraste(hex, FONDO_OSCURO))
      if (peor < def.legibleSobrePagina) {
        errores[clave] = `no se distingue del fondo de la página (contraste ${peor.toFixed(1)}, mínimo ${def.legibleSobrePagina}, en claro y en oscuro)`
        continue
      }
    }
    tema[def.clave] = hex
  }
  // La franja del POS lleva UN texto, calculado sobre el inicio: inicio y fin (el elegido o el de siempre) tienen que leerse con él.
  if (tema.posEncabezadoInicio || tema.posEncabezadoFin) {
    const inicioDef = COLORES_DE_TEMA.find((d) => d.clave === 'posEncabezadoInicio')!
    const finDef = COLORES_DE_TEMA.find((d) => d.clave === 'posEncabezadoFin')!
    const inicio = tema.posEncabezadoInicio ?? inicioDef.porDefecto
    const fin = tema.posEncabezadoFin ?? finDef.porDefecto
    const texto = textoPara(inicioDef, inicio)
    const minimo = inicioDef.textoSobre?.contrasteMinimo ?? 3
    const c = contraste(fin, texto)
    if (c < minimo) {
      // El error va en la clave que se está tocando: si se eligió el inicio, el que desentona es el fin de siempre.
      const clave = tema.posEncabezadoFin ? 'posEncabezadoFin' : 'posEncabezadoInicio'
      errores[clave] = `el texto de la franja no se lee sobre el ${tema.posEncabezadoFin ? 'final' : 'final de siempre'} (contraste ${c.toFixed(1)}, mínimo ${minimo}); elegí también un final que combine`
      delete tema[clave]
    }
  }
  return { tema, errores }
}

/** Fija el tema en un elemento (por defecto, `<html>`): un estilo en línea le gana al `:root` de `tema.css`. Lo que no está en el
 *  tema se limpia, así «restaurar valores por defecto» es aplicar `{}`. Calcula también el texto de los fondos. */
export function aplicarTema(tema: Tema, elemento: HTMLElement = document.documentElement): void {
  const { tema: limpio } = validarTema(tema)
  for (const def of COLORES_DE_TEMA) {
    const variables = [def.variable, ...(def.tambien ?? [])]
    const deTexto = def.textoSobre ? [def.textoSobre.variable, ...(def.textoSobre.tambien ?? [])] : []
    const propias = [
      ...variables, ...deTexto, ...(def.derivadas ?? []).map((d) => d.variable),
      ...(def.comoTexto ? [def.comoTexto.claro, def.comoTexto.oscuro] : []),
    ]
    const valor = limpio[def.clave]
    if (!valor) {
      for (const v of propias) elemento.style.removeProperty(v)
      continue
    }
    for (const v of variables) elemento.style.setProperty(v, valor)
    const texto = textoPara(def, valor)
    for (const v of deTexto) elemento.style.setProperty(v, texto)
    for (const d of def.derivadas ?? []) elemento.style.setProperty(d.variable, mezclar(valor, texto, d.mezcla))
    if (def.comoTexto) {
      elemento.style.setProperty(def.comoTexto.claro, ajustarContraste(valor, FONDO_TEXTO_CLARO, 4.5))
      elemento.style.setProperty(def.comoTexto.oscuro, ajustarContraste(valor, FONDO_TEXTO_OSCURO, 4.5))
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
  iniciarModo()
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

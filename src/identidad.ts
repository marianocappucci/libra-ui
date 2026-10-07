// La identidad de cada producto de la familia: su nombre, su rubro, su color y su ícono (ADR-033, `v0.123.0`).
//
// 🔴 **Esta es la ÚNICA tabla de identidad de las apps.** La misma tabla vive en `libra-web-kit/libra_web_kit/identidad.py` (las landings, con el
// nombre del ícono de Bootstrap Icons) y en la página `identidad-de-producto-diseno` del wiki. Si cambia un color o un ícono, cambia en las tres, en
// la misma tanda: `test/identidad.test.ts` compara este registro contra la tabla del wiki y falla si una copia diverge. Los colores ya eran los de
// las landings (`SITES` de `site_css_tokens.py`); LibraCargo y LibraClub se midieron del ícono de `kit-libra-v1`.
//
// Cada color tiene un papel, y el nombre del campo lo dice:
//   - `color`            la marca: el cuadrado del ícono, el favicon, el `theme-color`, el anillo de foco.
//   - `colorOscuro`      un tono más hondo, para cuando el de marca no alcanza como fondo de un botón con texto blanco.
//   - `colorClaro`       el fondo suave (chips, filas resaltadas) de la landing y de LibraSuite.
//   - `colorSobreOscuro` la variante para el modo oscuro de la app y para los fondos oscuros.
//   - `colorAccion`      el fondo real del botón principal y del ítem activo: `colorOscuro` en los productos cuyo `color` no llega a 4,5:1
//                        contra blanco (RestoLibra 3,6:1, MedLibra 3,7:1, VentaLibra 3,2:1); en el resto, el `color` de marca.
// El ítem activo del menú (ADR-036) no tiene campo propio: se deriva de estos (`menuActivoDeProducto`), así no hay una tabla más que mantener.
import {
  CalendarCheck, Coffee, HeartPulse, Headset, ReceiptText, ScanBarcode, Trophy, Truck,
  type LucideIcon,
} from 'lucide-react'
import { faviconDeMarca } from './marcas'
import { COLORES_DE_TEMA, ajustarContraste, mezclar, type ClaveDeTema } from './tema'

export type Producto =
  | 'contalibra'
  | 'restolibra'
  | 'gestiolibra'
  | 'medlibra'
  | 'ventalibra'
  | 'libradesk'
  | 'libracargo'
  | 'libraclub'

export type IdentidadDeProducto = {
  /** Cómo se escribe el nombre del producto. */
  nombre: string
  /** A quién le sirve, en una línea. */
  rubro: string
  /** La marca, `#rrggbb`. */
  color: string
  /** Tono más hondo de la marca, `#rrggbb`. */
  colorOscuro: string
  /** Fondo suave, `#rrggbb`. */
  colorClaro: string
  /** Variante para el modo oscuro y los fondos oscuros, `#rrggbb`. */
  colorSobreOscuro: string
  /** Fondo de la acción principal (texto blanco encima): cumple 4,5:1 contra blanco, `#rrggbb`. */
  colorAccion: string
  /** El ícono de lucide del producto. Desde `v0.124.0` la marca es el dibujo de `marcas.ts` (ADR-034); éste queda para quien necesite el
   *  glifo de una línea (un menú, un chip), con el trazo y el color del texto. */
  icono: LucideIcon
}

export const IDENTIDAD: Record<Producto, IdentidadDeProducto> = {
  contalibra: {
    nombre: 'ContaLibra',
    rubro: 'Comercios y PyMEs',
    color: '#2563eb',
    colorOscuro: '#1d4ed8',
    colorClaro: '#eff6ff',
    colorSobreOscuro: '#60a5fa',
    colorAccion: '#2563eb',
    icono: ReceiptText,
  },
  restolibra: {
    nombre: 'RestoLibra',
    rubro: 'Restaurantes, bares y delivery',
    color: '#ea580c',
    colorOscuro: '#c2410c',
    colorClaro: '#fff7ed',
    colorSobreOscuro: '#fb923c',
    colorAccion: '#c2410c',
    icono: Coffee,
  },
  gestiolibra: {
    nombre: 'GestioLibra',
    rubro: 'Negocios de servicios',
    color: '#7c3aed',
    colorOscuro: '#6d28d9',
    colorClaro: '#f5f3ff',
    colorSobreOscuro: '#a78bfa',
    colorAccion: '#7c3aed',
    icono: CalendarCheck,
  },
  medlibra: {
    nombre: 'MedLibra',
    rubro: 'Consultorios y centros médicos',
    color: '#0d9488',
    colorOscuro: '#0f766e',
    colorClaro: '#f0fdfa',
    colorSobreOscuro: '#2dd4bf',
    colorAccion: '#0f766e',
    icono: HeartPulse,
  },
  ventalibra: {
    nombre: 'VentaLibra',
    rubro: 'Punto de venta para retail',
    color: '#d97706',
    colorOscuro: '#b45309',
    colorClaro: '#fffbeb',
    colorSobreOscuro: '#fbbf24',
    colorAccion: '#b45309',
    icono: ScanBarcode,
  },
  libradesk: {
    nombre: 'LibraDesk',
    rubro: 'Empresas de IT',
    color: '#4f46e5',
    colorOscuro: '#4338ca',
    colorClaro: '#eef2ff',
    colorSobreOscuro: '#818cf8',
    colorAccion: '#4f46e5',
    icono: Headset,
  },
  libracargo: {
    nombre: 'LibraCargo',
    rubro: 'Agencias de cargas',
    color: '#012c83',
    colorOscuro: '#001d5c',
    colorClaro: '#eef3fc',
    colorSobreOscuro: '#7aa2f7',
    colorAccion: '#012c83',
    icono: Truck,
  },
  libraclub: {
    nombre: 'LibraClub',
    rubro: 'Complejos deportivos',
    color: '#017b4b',
    colorOscuro: '#015c38',
    colorClaro: '#ecfdf5',
    colorSobreOscuro: '#34d399',
    colorAccion: '#017b4b',
    icono: Trophy,
  },
}

const ID_DEL_ESTILO = 'libra-identidad'
// Texto sobre el acento en modo oscuro: el azul casi negro de la familia. Los `colorSobreOscuro` son tonos claros (los más oscuros, #7aa2f7 y
// #34d399 entre ellos, quedan arriba de 7:1 contra esto), así que el texto del botón se lee en los ocho.
export const TEXTO_SOBRE_ACENTO_OSCURO = '#0b1324'

// Cuánto del color de marca lleva el borde del ítem activo, mezclado con `colorClaro`. Con 0,45 el borde se distingue de la barra (#fafafa) con
// 1,6:1 a 2,7:1 según el producto, nunca menos que el verde de antes (#5ee9b5, 1,46:1), y sigue siendo un borde y no un marco: el 100% del color
// de marca alrededor de un chip pálido pesaba más que el texto.
const MEZCLA_DEL_BORDE_ACTIVO = 0.45
// Contraste mínimo del texto del ítem activo sobre su fondo (WCAG AA, texto normal).
const CONTRASTE_DEL_TEXTO_ACTIVO = 4.5

export type MenuActivoDeProducto = {
  /** El fondo del chip: el fondo suave del producto (`colorClaro`). */
  fondo: string
  /** El borde: el color de marca mezclado con el fondo, para que se distinga de la barra sin gritar. */
  borde: string
  /** El texto (y el ícono): `colorOscuro` oscurecido, si hace falta, hasta llegar a 4,5:1 contra el fondo. */
  texto: string
}

/** Los tres colores del ítem activo del menú lateral para un producto (ADR-036). Función pura, sin DOM. */
export function menuActivoDeProducto(producto: Producto): MenuActivoDeProducto {
  const { color, colorOscuro, colorClaro } = IDENTIDAD[producto]
  return {
    fondo: colorClaro,
    borde: mezclar(colorClaro, color, MEZCLA_DEL_BORDE_ACTIVO),
    texto: ajustarContraste(colorOscuro, colorClaro, CONTRASTE_DEL_TEXTO_ACTIVO),
  }
}

/**
 * El valor «de siempre» de cada color editable del tema (`COLORES_DE_TEMA`) para ESE producto: lo que se ve mientras la instancia no eligió
 * nada. El backoffice lo usa para el botón «De siempre» y la vista previa de «Apariencia», así lo que muestra es lo que el producto pinta de verdad
 * (ADR-036).
 *
 * - `acento`: el `colorAccion` del producto (lo que `aplicarIdentidad` fija en `--primary`, en modo claro).
 * - `menuActivoFondo` / `menuActivoBorde`: los de `menuActivoDeProducto`.
 * - `barraLateralFondo`: no sale de la identidad. Los ocho productos heredan el `--sidebar` de shadcn (`oklch(0.985 0 0)` = `#fafafa`) y ninguno lo
 *   cambia, así que vale la referencia de `COLORES_DE_TEMA`. Si un producto pasa a tener la barra de otro color, se agrega acá.
 * - El resto (éxito, encabezado del POS): el mismo en todos, el de `COLORES_DE_TEMA`.
 */
export function defectosDelProducto(producto: Producto): Record<ClaveDeTema, string> {
  const base = Object.fromEntries(COLORES_DE_TEMA.map((d) => [d.clave, d.porDefecto])) as Record<ClaveDeTema, string>
  const { fondo, borde } = menuActivoDeProducto(producto)
  return { ...base, acento: IDENTIDAD[producto].colorAccion, menuActivoFondo: fondo, menuActivoBorde: borde }
}

/** El CSS que fija el acento del producto. Exportado para poder testearlo sin DOM. */
export function cssDeIdentidad(producto: Producto): string {
  const { color, colorAccion, colorSobreOscuro } = IDENTIDAD[producto]
  const activo = menuActivoDeProducto(producto)
  // `:root:root` y `.dark.dark` (especificidad 0,2,0) y no `:root` y `.dark` (0,1,0): los `index.css` de los productos declaran esos mismos
  // tokens con `:root` y `.dark`, y a igual especificidad decide el ORDEN de las hojas, que no controlamos (en el build Vite pone un
  // `<link>` en el `<head>`, en dev inyecta `<style>` y el HMR los reordena). Con 0,2,0 el acento gana siempre, en cualquier orden.
  // `.dark.dark` va después de `:root:root` en la misma hoja, así que en modo oscuro (mismo elemento, 0,2,0 los dos) gana el oscuro.
  // Un color puesto en línea (`aplicarTema` fija `--primary` en `document.documentElement.style`) sigue ganando a esto: el backoffice puede
  // cambiar el acento de una instancia por encima de la identidad del producto.
  // El ítem activo del menú (ADR-036) va sólo en `:root:root`: el chip es claro en los dos modos (un chip claro sobre la barra oscura), así que
  // no hay variante `.dark`. Si el backoffice elige `menuActivoFondo`, `aplicarTema` pone en línea fondo y texto, y ganan a esto.
  return `:root:root {
  --primary: ${colorAccion};
  --primary-foreground: #ffffff;
  --ring: ${color};
  --sidebar-primary: ${colorAccion};
  --sidebar-primary-foreground: #ffffff;
  --sidebar-ring: ${color};
  --libra-menu-activo-fondo: ${activo.fondo};
  --libra-menu-activo-borde: ${activo.borde};
  --libra-menu-activo-texto: ${activo.texto};
}
.dark.dark {
  --primary: ${colorSobreOscuro};
  --primary-foreground: ${TEXTO_SOBRE_ACENTO_OSCURO};
  --ring: ${colorSobreOscuro};
  --sidebar-primary: ${colorSobreOscuro};
  --sidebar-primary-foreground: ${TEXTO_SOBRE_ACENTO_OSCURO};
  --sidebar-ring: ${colorSobreOscuro};
}
`
}

/**
 * Fija el acento del producto en toda la app: `--primary`, `--ring`, `--sidebar-primary` y `--sidebar-ring`, en claro y en oscuro, los tres
 * colores del ítem activo del menú (`--libra-menu-activo-*`, ADR-036) y el `theme-color` del navegador, y pone el favicon del producto (`faviconDeMarca`, ADR-034). Se llama una vez, en `main.tsx`, antes de montar.
 *
 * **Por qué inyecta un `<style>` y no pone las variables en línea**: en línea (`documentElement.style`) las variables no distinguen entre
 * claro y oscuro, y `aplicarTema` ya usa ese lugar para el acento que el backoffice elige por instancia. Con un `<style>` las dos capas
 * conviven: la identidad es el defecto del producto y la elección de la instancia, por ser en línea, la pisa.
 *
 * Idempotente: si el `<style id="libra-identidad">` ya existe se reemplaza su contenido, no se agrega otro. Sin `document` (SSR, tests de
 * node) no hace nada.
 */
export function aplicarIdentidad(producto: Producto): void {
  if (typeof document === 'undefined') return
  const { color } = IDENTIDAD[producto]

  let estilo = document.getElementById(ID_DEL_ESTILO)
  if (!estilo) {
    estilo = document.createElement('style')
    estilo.id = ID_DEL_ESTILO
    document.head.appendChild(estilo)
  }
  estilo.textContent = cssDeIdentidad(producto)

  let tema = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!tema) {
    tema = document.createElement('meta')
    tema.name = 'theme-color'
    document.head.appendChild(tema)
  }
  tema.content = color

  // El favicon: se reemplaza el `href` del `<link rel="icon">` que traiga el `index.html` del producto (o se crea uno), así cada app estrena
  // la marca nueva con sólo subir el pin. El `index.html` puede seguir apuntando a su archivo: es lo que se ve hasta que corre el JS.
  let favicon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.rel = 'icon'
    document.head.appendChild(favicon)
  }
  favicon.type = 'image/svg+xml'
  favicon.href = faviconDeMarca(producto)
}

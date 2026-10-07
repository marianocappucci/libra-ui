// La marca dibujada de cada producto: un SVG propio, plano, sobre el cuadrado redondeado de su color (ADR-034, `v0.124.0`).
//
// Reemplaza al ícono de lucide sobre el cuadrado (ADR-033): aquél era el mismo dibujo que trae cualquier pack. Ésta junta lo plano de la serie
// de lucide con la composición de la ilustrada de `kit-libra-v1`, con cuatro reglas que la hacen de la familia:
//   1. Dos piezas: un objeto principal y otro que lo completa (recibo y calculadora, agenda y reloj).
//   2. El corte: donde una pieza pisa a otra, las separa un filo del color de fondo (`corte()`). Hace de sombra sin serlo.
//   3. Formas llenas con detalles calados, nunca el trazo fino de 2 px de los packs.
//   4. Blanco, blanco translúcido, la `tinta` y el `claro` del producto, y un solo detalle de acento.
//
// Hay dos variantes. `icono` es la marca completa (sidebar, login, landing, LibraSuite). `favicon` es una sola pieza del ícono, engrosada, para
// que se lea a 16 px. El diseño y su porqué viven en el wiki (`identidad-de-producto-diseno`, y la lámina `diseños/iconos-familia-libra-v2.html`).
//
// 🔴 **Estos strings son la fuente.** Los `marcas/*.svg` del paquete salen de acá (`npm run marcas`) y `test/marcas.test.ts` falla si un archivo
// no coincide con lo que devuelve `svgDeMarca`. `libra-web-kit` y LibraSuite copian esos archivos: no se redibujan en otro lado.
import { IDENTIDAD, type Producto } from './identidad'

export type VarianteDeMarca = 'icono' | 'favicon'

const BLANCO = '#ffffff'
const AMARILLO = '#fbbf24'

// Los dos tonos propios del dibujo, que no son colores de la interfaz y por eso no están en `IDENTIDAD`: la `tinta` (el detalle oscuro dentro
// de las piezas blancas) y el `claro` (renglones, celdas, agujeros).
const TONOS: Record<Producto, { tinta: string; claro: string }> = {
  contalibra: { tinta: '#172554', claro: '#bfdbfe' },
  restolibra: { tinta: '#7c2d12', claro: '#fed7aa' },
  gestiolibra: { tinta: '#3b0764', claro: '#ddd6fe' },
  medlibra: { tinta: '#134e4a', claro: '#99f6e4' },
  ventalibra: { tinta: '#451a03', claro: '#fde68a' },
  libradesk: { tinta: '#1e1b4b', claro: '#c7d2fe' },
  libracargo: { tinta: '#001d5c', claro: '#93b4f0' },
  libraclub: { tinta: '#022c1c', claro: '#a7f3d0' },
}

type Paleta = { fondo: string; tinta: string; claro: string }

// El corte de la familia: un trazo del color de fondo pintado DEBAJO del relleno (`paint-order`), así separa la pieza de lo que pisa sin
// agrandarla hacia adentro.
const corte = (c: Paleta, ancho: number) =>
  `stroke="${c.fondo}" stroke-width="${ancho}" paint-order="stroke" stroke-linejoin="round"`

const repetir = <T>(xs: T[], f: (x: T, i: number) => string) => xs.map(f).join('')

// Los dibujos, en un lienzo de 120 × 120. El de `icono` se achica al 85 % y se centra (`translate(9 9) scale(.85)`) para dejar aire contra el
// borde del cuadrado; el de `favicon` usa el lienzo entero, porque a 16 px cada píxel cuenta.
const ICONO: Record<Producto, (c: Paleta) => string> = {
  contalibra: (c) => `
<rect x="22" y="26" width="44" height="60" rx="5" fill="${BLANCO}" opacity=".35" transform="rotate(-9 44 56)"/>
<path d="M32 24a4 4 0 0 1 4-4h36a4 4 0 0 1 4 4v70l-5.5-4-5.5 4-5.5-4-5.5 4-5.5-4-5.5 4-5.5-4-5.5 4z" fill="${BLANCO}"/>
<rect x="39" y="30" width="22" height="6" rx="3" fill="${c.tinta}"/>
<rect x="39" y="42" width="29" height="4" rx="2" fill="${c.claro}"/>
<rect x="39" y="51" width="24" height="4" rx="2" fill="${c.claro}"/>
<rect x="39" y="60" width="16" height="4" rx="2" fill="${AMARILLO}"/>
<rect x="62" y="56" width="36" height="42" rx="7" fill="${c.tinta}" ${corte(c, 8)}/>
<rect x="67" y="61" width="26" height="9" rx="2.5" fill="${AMARILLO}"/>
${repetir([0, 1, 2], (i) => repetir([0, 1], (j) => `<rect x="${67 + i * 9.5}" y="${75 + j * 10}" width="7" height="7" rx="2" fill="${i === 2 && j === 1 ? AMARILLO : BLANCO}"/>`))}`,

  restolibra: (c) => `
${repetir([46, 60, 74], (x) => `<path d="M${x} 18c-4 4 4 7 0 11" fill="none" stroke="${BLANCO}" stroke-width="4" stroke-linecap="round" opacity=".5"/>`)}
<path d="M26 78a34 34 0 0 1 68 0z" fill="${BLANCO}"/>
<path d="M38 70a23 23 0 0 1 13-17" fill="none" stroke="${c.claro}" stroke-width="4.5" stroke-linecap="round"/>
<circle cx="60" cy="42" r="6" fill="${AMARILLO}" ${corte(c, 6)}/>
<rect x="18" y="82" width="84" height="8" rx="4" fill="${BLANCO}"/>
<rect x="34" y="94" width="52" height="5" rx="2.5" fill="${BLANCO}" opacity=".4"/>`,

  gestiolibra: (c) => `
<rect x="20" y="28" width="64" height="60" rx="9" fill="${BLANCO}"/>
<path d="M29 28h46a9 9 0 0 1 9 9v8H20v-8a9 9 0 0 1 9-9z" fill="${c.claro}"/>
<rect x="34" y="20" width="7" height="15" rx="3.5" fill="${c.tinta}"/>
<rect x="63" y="20" width="7" height="15" rx="3.5" fill="${c.tinta}"/>
${repetir([0, 1, 2], (i) => repetir([0, 1, 2], (j) => `<rect x="${29 + i * 14}" y="${52 + j * 11}" width="9" height="7" rx="2" fill="${i === 1 && j === 1 ? c.fondo : c.claro}"/>`))}
<circle cx="83" cy="80" r="18" fill="${AMARILLO}" ${corte(c, 8)}/>
<path d="M83 70v10l7 5" fill="none" stroke="${c.tinta}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`,

  medlibra: (c) => `
<rect x="24" y="26" width="54" height="68" rx="8" fill="${BLANCO}"/>
<rect x="38" y="19" width="26" height="13" rx="4.5" fill="${c.tinta}"/>
<path d="M46 42h10v9h9v10h-9v9H46v-9h-9V51h9z" fill="${c.fondo}" stroke="${c.fondo}" stroke-width="2" stroke-linejoin="round"/>
<rect x="34" y="77" width="20" height="4.5" rx="2.25" fill="${c.claro}"/>
<rect x="34" y="85" width="12" height="4.5" rx="2.25" fill="${c.claro}"/>
<path d="M81 99C67 90 61 83 61 75a10 10 0 0 1 20-4 10 10 0 0 1 20 4c0 8-6 15-20 24z" fill="#fb7185" ${corte(c, 8)}/>
<path d="M66 80h6l3.5-6 4.5 11 3.5-6h9" fill="none" stroke="${BLANCO}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,

  ventalibra: (c) => `
<g transform="rotate(16 56 56)" opacity=".35"><path d="M38 30h40a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H38L20 54z" fill="${BLANCO}"/></g>
<g transform="rotate(-12 56 56)">
<path d="M38 32h44a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H38L18 56z" fill="${BLANCO}"/>
<circle cx="33" cy="56" r="5" fill="${c.fondo}"/>
${repetir([[46, 3], [51, 2], [55, 4.5], [62, 2], [66, 3], [71, 2], [75, 4.5]], ([x, w]) => `<rect x="${x}" y="42" width="${w}" height="22" rx="1" fill="${c.tinta}"/>`)}
<rect x="46" y="68" width="18" height="4" rx="2" fill="${c.claro}"/>
</g>
<rect x="62" y="62" width="38" height="38" rx="10" fill="${c.tinta}" ${corte(c, 8)}/>
<path d="M70 77v-7h7M92 77v-7h-7M70 85v7h7M92 85v7h-7" fill="none" stroke="${BLANCO}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="67" y="79.5" width="28" height="3.5" rx="1.75" fill="#f87171"/>`,

  libradesk: (c) => `
<path d="M32 22h32a12 12 0 0 1 12 12v14a12 12 0 0 1-12 12H42l-10 9v-9a12 12 0 0 1-12-12V34a12 12 0 0 1 12-12z" fill="${BLANCO}"/>
<path d="M48 30l10 17H38z" fill="#f97316" stroke="#f97316" stroke-width="3" stroke-linejoin="round"/>
<rect x="46.6" y="35" width="2.8" height="6" rx="1.4" fill="${BLANCO}"/>
<circle cx="48" cy="44" r="1.6" fill="${BLANCO}"/>
<path d="M58 52h30a12 12 0 0 1 12 12v12a12 12 0 0 1-12 12v9l-10-9H58a12 12 0 0 1-12-12V64a12 12 0 0 1 12-12z" fill="${c.claro}" ${corte(c, 8)}/>
<circle cx="73" cy="70" r="11" fill="#22c55e"/>
<path d="M67.5 70.5l4 4 7.5-8" fill="none" stroke="${BLANCO}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M86 32l6-6M90 40h8M82 28v-8" fill="none" stroke="${AMARILLO}" stroke-width="3.5" stroke-linecap="round"/>`,

  libracargo: (c) => `
<rect x="16" y="94" width="88" height="4" rx="2" fill="${BLANCO}" opacity=".3"/>
<rect x="16" y="40" width="54" height="40" rx="5" fill="${BLANCO}"/>
${repetir([27, 39, 51], (x) => `<rect x="${x}" y="48" width="5" height="24" rx="2.5" fill="${c.claro}"/>`)}
<path d="M74 52h13a4 4 0 0 1 3.4 1.9l8 12.6a4 4 0 0 1 .6 2.1V78a2 2 0 0 1-2 2H74z" fill="${BLANCO}"/>
<path d="M78 57h9l5.5 9H78z" fill="${c.fondo}"/>
<circle cx="33" cy="82" r="9" fill="${BLANCO}" ${corte(c, 8)}/><circle cx="33" cy="82" r="3.5" fill="${c.fondo}"/>
<circle cx="84" cy="82" r="9" fill="${BLANCO}" ${corte(c, 8)}/><circle cx="84" cy="82" r="3.5" fill="${c.fondo}"/>
<path d="M88 46c-7-7.5-11-12-11-17.5a11 11 0 0 1 22 0c0 5.5-4 10-11 17.5z" fill="${AMARILLO}" ${corte(c, 6)}/>
<circle cx="88" cy="28.5" r="4" fill="${c.fondo}"/>`,

  libraclub: (c) => `
<rect x="18" y="20" width="54" height="80" rx="6" fill="${BLANCO}" opacity=".16"/>
<g fill="none" stroke="${BLANCO}" stroke-linecap="round" opacity=".6">
<rect x="18" y="20" width="54" height="80" rx="6" stroke-width="3.5"/>
<path d="M18 40h54M18 80h54M45 40v40" stroke-width="3"/>
</g>
<path d="M12 60h66" fill="none" stroke="${BLANCO}" stroke-width="5" stroke-linecap="round"/>
<circle cx="12" cy="60" r="4" fill="${BLANCO}"/><circle cx="78" cy="60" r="4" fill="${BLANCO}"/>
<g transform="rotate(30 82 62)">
<rect x="78" y="68" width="9" height="32" rx="4" fill="${BLANCO}" ${corte(c, 8)}/>
<rect x="78" y="86" width="9" height="14" rx="4" fill="${c.tinta}"/>
<rect x="64" y="24" width="37" height="48" rx="17" fill="${BLANCO}" ${corte(c, 8)}/>
${repetir([[75, 37], [90, 37], [82.5, 45], [75, 53], [90, 53], [82.5, 61]], ([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${c.claro}"/>`)}
</g>
<circle cx="34" cy="34" r="10" fill="${AMARILLO}" ${corte(c, 6)}/>
<path d="M25.5 30a11 11 0 0 0 17 0" fill="none" stroke="${c.tinta}" stroke-width="2" opacity=".35"/>`,
}

// El favicon: una sola pieza del ícono, más grande y con trazos gruesos.
const FAVICON: Record<Producto, (c: Paleta) => string> = {
  contalibra: (c) => `
<path d="M30 22a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v84l-10-7-10 7-10-7-10 7-10-7-10 7z" fill="${BLANCO}"/>
<rect x="42" y="34" width="36" height="10" rx="5" fill="${c.tinta}"/>
<rect x="42" y="54" width="36" height="9" rx="4.5" fill="${c.claro}"/>
<rect x="42" y="72" width="22" height="9" rx="4.5" fill="${AMARILLO}"/>`,

  restolibra: (c) => `
<path d="M18 80a42 42 0 0 1 84 0z" fill="${BLANCO}"/>
<circle cx="60" cy="34" r="9" fill="${AMARILLO}" ${corte(c, 8)}/>
<rect x="10" y="86" width="100" height="12" rx="6" fill="${BLANCO}"/>`,

  gestiolibra: (c) => `
<rect x="16" y="24" width="88" height="82" rx="14" fill="${BLANCO}"/>
<path d="M30 24h60a14 14 0 0 1 14 14v10H16V38a14 14 0 0 1 14-14z" fill="${c.tinta}"/>
<rect x="34" y="12" width="10" height="22" rx="5" fill="${c.tinta}" ${corte(c, 6)}/>
<rect x="76" y="12" width="10" height="22" rx="5" fill="${c.tinta}" ${corte(c, 6)}/>
<path d="M40 76l13 12 27-26" fill="none" stroke="${c.fondo}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,

  medlibra: (c) => `
<rect x="20" y="20" width="80" height="88" rx="12" fill="${BLANCO}"/>
<rect x="40" y="10" width="40" height="20" rx="7" fill="${c.tinta}" ${corte(c, 6)}/>
<path d="M51 42h18v15h15v18H69v15H51V75H36V57h15z" fill="${c.fondo}" stroke="${c.fondo}" stroke-width="3" stroke-linejoin="round"/>`,

  ventalibra: (c) => `
<path d="M22 44V24h20M98 44V24H78M22 76v20h20M98 76v20H78" fill="none" stroke="${BLANCO}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
${repetir([[38, 7], [50, 5], [60, 9], [74, 5], [84, 7]], ([x, w]) => `<rect x="${x}" y="40" width="${w}" height="40" rx="1.5" fill="${BLANCO}" opacity=".55"/>`)}
<rect x="16" y="55" width="88" height="10" rx="5" fill="${c.tinta}"/>`,

  libradesk: () => `
<path d="M32 18h56a16 16 0 0 1 16 16v38a16 16 0 0 1-16 16H58l-20 18V88h-6a16 16 0 0 1-16-16V34a16 16 0 0 1 16-16z" fill="${BLANCO}"/>
<path d="M40 53l13 13 27-27" fill="none" stroke="#16a34a" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,

  libracargo: (c) => `
<rect x="8" y="28" width="66" height="54" rx="7" fill="${BLANCO}"/>
<path d="M78 44h16a6 6 0 0 1 5 2.7l11 16.6a6 6 0 0 1 1 3.3V82H78z" fill="${BLANCO}"/>
<circle cx="30" cy="86" r="13" fill="${BLANCO}" ${corte(c, 9)}/><circle cx="30" cy="86" r="5" fill="${c.fondo}"/>
<circle cx="92" cy="86" r="13" fill="${BLANCO}" ${corte(c, 9)}/><circle cx="92" cy="86" r="5" fill="${c.fondo}"/>`,

  libraclub: (c) => `
<g transform="rotate(35 60 60)">
<rect x="54" y="74" width="13" height="40" rx="6" fill="${BLANCO}" ${corte(c, 8)}/>
<rect x="54" y="96" width="13" height="18" rx="6" fill="${c.tinta}"/>
<rect x="34" y="8" width="53" height="70" rx="26" fill="${BLANCO}" ${corte(c, 8)}/>
${repetir([[50, 30], [71, 30], [60.5, 43], [50, 56], [71, 56]], ([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${c.claro}"/>`)}
</g>
<circle cx="27" cy="88" r="14" fill="${AMARILLO}" ${corte(c, 8)}/>`,
}

/**
 * El SVG completo de la marca: el cuadrado redondeado del color de marca y el dibujo encima. Sin `width` ni `height`: llena lo que le den.
 * `icono` lleva un `<title>` con el nombre; quien lo incruste como decoración (`MarcaProducto`) lo esconde con `aria-hidden`.
 */
export function svgDeMarca(producto: Producto, variante: VarianteDeMarca = 'icono'): string {
  const { nombre, color } = IDENTIDAD[producto]
  const paleta: Paleta = { fondo: color, ...TONOS[producto] }
  // El favicon redondea un poco más (30 contra 27): achicado a 16 px, el radio del ícono se ve casi recto.
  const cuerpo =
    variante === 'favicon'
      ? `<rect width="120" height="120" rx="30" fill="${color}"/>${FAVICON[producto](paleta)}`
      : `<rect width="120" height="120" rx="27" fill="${color}"/><g transform="translate(9 9) scale(.85)">${ICONO[producto](paleta)}</g>`
  // Compacto: sin saltos de línea ni sangría, para que el archivo y el data URL pesen lo justo.
  const dibujo = cuerpo.replace(/\n/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><title>${nombre}</title>${dibujo}</svg>`
}

/** El favicon como `data:` URL, listo para un `<link rel="icon">`. */
export function faviconDeMarca(producto: Producto): string {
  return `data:image/svg+xml,${encodeURIComponent(svgDeMarca(producto, 'favicon'))}`
}

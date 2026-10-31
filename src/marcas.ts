// La marca dibujada de cada producto: un SVG propio sobre el cuadrado redondeado de su color (ADR-034, `v0.124.0`). Se dibuja plana y se
// le da volumen al armarla (`VOLUMEN`, ADR-090): desde `v0.176.0` las diez marcas van en 3D, con el tratamiento que estrenó LibraBot.
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

// LibraEdge no es un producto: es el complemento de la suite que deja vender sin internet desde la PC del local (ADR-078). Tiene marca
// —la usan su sección en LibraSuite y las landings, la pantalla del nodo y el instalador de Windows— pero no identidad de app: no tiene
// pantalla propia, ni acento, ni `theme-color`. Por eso su nombre y su color viven acá y no en `IDENTIDAD`, que es la tabla de las ocho apps
// y la que comparan las landings y el wiki.
//
// LibraBot, el chatbot con IA para el sitio de cada empresa (ADR-088), entra igual: tiene marca —su landing y LibraSuite— y todavía no tiene
// pantalla propia en el kit.
export type Complemento = 'libraedge' | 'librabot'
export type Marca = Producto | Complemento

const COMPLEMENTOS: Record<Complemento, { nombre: string; color: string }> = {
  // Cian: el único tono que no estaba tomado por los ocho (el más cercano, el verde azulado de MedLibra, es más verde y más claro).
  libraedge: { nombre: 'LibraEdge', color: '#0e7490' },
  // Rojo frambuesa, elegido por el humano (2026-10-21): ninguna de las ocho apps ni LibraEdge lo usan.
  librabot: { nombre: 'LibraBot', color: '#e11d48' },
}

/** El nombre y el color de fondo de una marca, sea app o complemento. */
export function datosDeMarca(marca: Marca): { nombre: string; color: string } {
  const { nombre, color } = marca in COMPLEMENTOS ? COMPLEMENTOS[marca as Complemento] : IDENTIDAD[marca as Producto]
  return { nombre, color }
}

const BLANCO = '#ffffff'
const AMARILLO = '#fbbf24'

// Los dos tonos propios del dibujo, que no son colores de la interfaz y por eso no están en `IDENTIDAD`: la `tinta` (el detalle oscuro dentro
// de las piezas blancas) y el `claro` (renglones, celdas, agujeros).
const TONOS: Record<Marca, { tinta: string; claro: string }> = {
  contalibra: { tinta: '#172554', claro: '#bfdbfe' },
  restolibra: { tinta: '#7c2d12', claro: '#fed7aa' },
  gestiolibra: { tinta: '#3b0764', claro: '#ddd6fe' },
  medlibra: { tinta: '#134e4a', claro: '#99f6e4' },
  ventalibra: { tinta: '#451a03', claro: '#fde68a' },
  libradesk: { tinta: '#1e1b4b', claro: '#c7d2fe' },
  libracargo: { tinta: '#001d5c', claro: '#93b4f0' },
  libraclub: { tinta: '#022c1c', claro: '#a7f3d0' },
  librainmo: { tinta: '#1a2e05', claro: '#d9f99d' },
  librafarma: { tinta: '#4a044e', claro: '#f5d0fe' },
  libraedge: { tinta: '#083344', claro: '#a5f3fc' },
  librabot: { tinta: '#4c0519', claro: '#fecdd3' },
}

/** Todas las marcas dibujadas: las ocho apps y los complementos. Sale de `TONOS` y no de `IDENTIDAD` porque `identidad.ts` importa este
 *  módulo (el favicon): leer `IDENTIDAD` al cargar daría `undefined` por el import circular. El test la compara contra `IDENTIDAD`. */
export const MARCAS = Object.keys(TONOS) as Marca[]

// `sombra`: el id del filtro con que la marca en 3D separa una pieza de lo que pisa, en lugar del corte (ver `corte`).
type Paleta = { fondo: string; tinta: string; claro: string; sombra?: string }

// El corte de la familia: un trazo del color de fondo pintado DEBAJO del relleno (`paint-order`), así separa la pieza de lo que pisa sin
// agrandarla hacia adentro. En 3D (ADR-090) el fondo es un degradé y un filo de color liso se vería como un contorno: ahí la pieza lleva
// su propia sombra corta, que la separa igual.
const corte = (c: Paleta, ancho: number) =>
  c.sombra
    ? `filter="url(#${c.sombra})"`
    : `stroke="${c.fondo}" stroke-width="${ancho}" paint-order="stroke" stroke-linejoin="round"`

const repetir = <T>(xs: T[], f: (x: T, i: number) => string) => xs.map(f).join('')

// Los dibujos, en un lienzo de 120 × 120. El de `icono` se achica al 85 % y se centra (`translate(9 9) scale(.85)`) para dejar aire contra el
// borde del cuadrado; el de `favicon` usa el lienzo entero, porque a 16 px cada píxel cuenta.
const ICONO: Record<Marca, (c: Paleta) => string> = {
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

  // La cápsula (2026-10-28, elegida por el humano): «medicamento» sin emblemas de salud protegidos. Las dos piezas de la familia, la mitad
  // blanca y la amarilla, que la pisa con su corte; la costura en `tinta` y el brillo en `claro`.
  librafarma: (c) => `
<rect x="16" y="100" width="88" height="4" rx="2" fill="${BLANCO}" opacity=".3"/>
<g transform="rotate(-35 60 58)">
<path d="M60 36H33a22 22 0 0 0 0 44H60z" fill="${BLANCO}"/>
<rect x="24" y="45" width="26" height="6" rx="3" fill="${c.claro}"/>
<path d="M60 36h27a22 22 0 0 1 0 44H60z" fill="${AMARILLO}" ${corte(c, 8)}/>
<rect x="58" y="36" width="4" height="44" fill="${c.tinta}" opacity=".35"/>
</g>`,

  // La casa y la llave (2026-10-27, elegida sobre una muestra): la propiedad y quien la administra. La llave pisa la casa abajo a la derecha.
  librainmo: (c) => `
<rect x="10" y="100" width="76" height="4" rx="2" fill="${BLANCO}" opacity=".3"/>
<path d="M45.5 21.5Q50 18 54.5 21.5L83 45.5Q86 48 86 52V92a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V52Q14 48 17 45.5Z" fill="${BLANCO}"/>
<rect x="24" y="56" width="14" height="13" rx="3" fill="${c.claro}"/>
<rect x="62" y="56" width="14" height="13" rx="3" fill="${c.claro}"/>
<path d="M42 98V76a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v22z" fill="${c.tinta}"/>
<rect x="44" y="34" width="12" height="12" rx="6" fill="${c.claro}"/>
<g transform="rotate(-35 82 88)">
<circle cx="82" cy="88" r="13" fill="${AMARILLO}" ${corte(c, 8)}/>
<rect x="91" y="84.5" width="25" height="7" rx="3.5" fill="${AMARILLO}" ${corte(c, 8)}/>
<rect x="104" y="89" width="4.5" height="9" rx="2" fill="${AMARILLO}"/>
<rect x="111" y="89" width="4.5" height="6" rx="2" fill="${AMARILLO}"/>
<circle cx="82" cy="88" r="5" fill="${c.fondo}"/>
</g>`,

  // La nube de la central atrás, translúcida (está, pero el local no depende de ella), la PC del local adelante y el círculo de sincronía:
  // lo que se vendió sin internet sube solo al volver.
  libraedge: (c) => `
<path d="M34 58a15 15 0 0 1-2-29.8A21 21 0 0 1 72 24a17 17 0 0 1 14 34z" fill="${BLANCO}" opacity=".4"/>
<rect x="8" y="100" width="96" height="5" rx="2.5" fill="${BLANCO}" opacity=".3"/>
<rect x="10" y="56" width="82" height="40" rx="9" fill="${BLANCO}" ${corte(c, 8)}/>
<rect x="21" y="66" width="34" height="7" rx="3.5" fill="${c.tinta}"/>
<rect x="21" y="80" width="22" height="5" rx="2.5" fill="${c.claro}"/>
<circle cx="90" cy="88" r="18" fill="${AMARILLO}" ${corte(c, 8)}/>
<g fill="none" stroke="${c.tinta}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M79.5 86a11 11 0 0 1 18.5-6.5"/><path d="M99 72.5v7h-7"/><path d="M100.5 90a11 11 0 0 1-18.5 6.5"/><path d="M81 103.5v-7h7"/>
</g>`,
  // La idea es del humano: una burbuja de chat con cara, dos ojos y una sonrisa. Desde ADR-089 va **en 3D**, como la burbuja del
  // fondo de su landing: volumen con degradés, ojos con reflejo, sombra, y la respuesta translúcida detrás. Es la única marca con
  // el volumen dibujado a mano (`VOLUMEN`, abajo). Las coordenadas son las del lienzo de 120 entero: el primer `<g>` deshace el `translate(9 9) scale(.85)`.
  librabot: (c) => `
<g transform="scale(1.17647) translate(-9 -9)"><g filter="url(#lbS)">
<g transform="translate(102 12) scale(-.5 .5) rotate(-4 50 44)"><path d="M18 0h64a18 18 0 0 1 18 18v36a18 18 0 0 1-18 18H38L20 88V72h-2A18 18 0 0 1 0 54V18A18 18 0 0 1 18 0z" fill="url(#lbR)"/></g>
<g transform="translate(10 30) scale(.8) rotate(-5 50 44)"><path d="M18 0h64a18 18 0 0 1 18 18v36a18 18 0 0 1-18 18H38L20 88V72h-2A18 18 0 0 1 0 54V18A18 18 0 0 1 18 0z" fill="url(#lbB)"/>
<circle cx="35" cy="31" r="7.5" fill="url(#lbO)"/>
<circle cx="65" cy="31" r="7.5" fill="url(#lbO)"/>
<circle cx="32.6" cy="28.4" r="2.4" fill="${BLANCO}" opacity=".9"/>
<circle cx="62.6" cy="28.4" r="2.4" fill="${BLANCO}" opacity=".9"/>
<path d="M34 47q16 13 32 0" fill="none" stroke="${c.tinta}" stroke-width="6.5" stroke-linecap="round"/>
<path d="M14 9q4-5 12-6" fill="none" stroke="${BLANCO}" stroke-width="4" stroke-linecap="round" opacity=".9"/>
</g></g></g>`,
}

// El favicon: una sola pieza del ícono, más grande y con trazos gruesos.
const FAVICON: Record<Marca, (c: Paleta) => string> = {
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

  // La casa sola, con la puerta y la ventana redonda en amarillo: a 16 px la llave se empasta.
  librainmo: (c) => `
<path d="M54 12Q60 7.5 66 12L106 44Q110 47.5 110 53V102a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8V53Q10 47.5 14 44Z" fill="${BLANCO}"/>
<path d="M46 110V80a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v30z" fill="${c.tinta}"/>
<circle cx="60" cy="48" r="9" fill="${AMARILLO}"/>`,

  // La cápsula sola, más gruesa y sin brillo: a 16 px la costura y el reflejo se empastan.
  librafarma: () => `
<g transform="rotate(-35 60 60)">
<path d="M60 32H38a28 28 0 0 0 0 56H60z" fill="${BLANCO}"/>
<path d="M60 32h22a28 28 0 0 1 0 56H60z" fill="${AMARILLO}"/>
</g>`,

  // La PC del local sola, con la luz prendida: a 16 px el círculo de sincronía y la nube se empastan.
  libraedge: (c) => `
<rect x="8" y="34" width="104" height="56" rx="13" fill="${BLANCO}"/>
<rect x="22" y="50" width="44" height="10" rx="5" fill="${c.tinta}"/>
<rect x="22" y="68" width="28" height="8" rx="4" fill="${c.claro}"/>
<circle cx="92" cy="62" r="9" fill="${AMARILLO}"/>`,
  librabot: (c) => `
<g filter="url(#lbS)" transform="translate(8 14) scale(1.04) rotate(-4 50 44)"><path d="M18 0h64a18 18 0 0 1 18 18v36a18 18 0 0 1-18 18H38L20 88V72h-2A18 18 0 0 1 0 54V18A18 18 0 0 1 18 0z" fill="url(#lbB)"/>
<circle cx="33" cy="31" r="10" fill="${c.tinta}"/>
<circle cx="67" cy="31" r="10" fill="${c.tinta}"/>
<path d="M31 49q19 15 38 0" fill="none" stroke="${c.tinta}" stroke-width="9" stroke-linecap="round"/>
</g>`,
}

// El volumen de las marcas (ADR-090; LibraBot lo estrenó en ADR-089): `defs` con los degradés y las sombras, y `luz`, un segundo cuadrado
// con un degradé radial que va ENCIMA del fondo de color (el primero sigue siendo el de MARCA, que es lo que mira el test). Los ids llevan el
// prefijo de la marca para no chocar con otros SVG en línea de la misma página.
type Volumen = {
  defs: (c: Paleta) => string
  luz: string
  /** El filtro que reemplaza al corte (`corte`). LibraBot no lo usa: su dibujo no tiene piezas que se pisen. */
  sombra?: string
  /** Lo que se le hace al dibujo plano para darle volumen. Sin esto, el dibujo ya viene en 3D (LibraBot). */
  pintar?: (dibujo: string, c: Paleta) => string
}

// Mezcla dos colores `#rrggbb` (`t` = 0 es `a`, 1 es `b`): las luces y las sombras de cada marca salen de sus propios tonos.
const mezclar = (a: string, b: string, t: number) =>
  '#' +
  [1, 3, 5]
    .map((i) => {
      const x = parseInt(a.slice(i, i + 2), 16)
      const y = parseInt(b.slice(i, i + 2), 16)
      return Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
    })
    .join('')

const filtroDeSombra = (id: string, desvio: number, caida: number, opacidad: number, margen: number) =>
  `<filter id="${id}" x="-${margen}%" y="-${margen}%" width="${100 + 2 * margen}%" height="${110 + 2 * margen}%"><feGaussianBlur in="SourceAlpha" stdDeviation="${desvio}"/><feOffset dy="${caida}"/><feComponentTransfer><feFuncA type="linear" slope="${opacidad}"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`

// El volumen de las nueve marcas dibujadas planas: el mismo tratamiento que LibraBot, sacado de la paleta de cada una. Las piezas blancas
// llenas pasan a un degradé del blanco al `claro`, la `tinta` y el amarillo de acento toman luz arriba a la izquierda, y todo el dibujo
// proyecta una sombra suave. Sólo los RELLENOS: un trazo con degradé por caja desaparece si la línea es recta (su caja no tiene alto), así que
// los trazos quedan lisos. Tampoco los blancos translúcidos (`opacity`): son lo que está atrás, y atrás no se ilumina.
const volumenComun = (p: string): Volumen => ({
  defs: (c) => `<defs>
<radialGradient id="${p}F" cx="30%" cy="22%" r="95%"><stop offset="0" stop-color="${mezclar(c.fondo, BLANCO, 0.38)}"/><stop offset=".55" stop-color="${c.fondo}"/><stop offset="1" stop-color="${mezclar(c.fondo, '#000000', 0.22)}"/></radialGradient>
<linearGradient id="${p}B" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="${BLANCO}"/><stop offset=".7" stop-color="${mezclar(BLANCO, c.claro, 0.25)}"/><stop offset="1" stop-color="${mezclar(BLANCO, c.claro, 0.6)}"/></linearGradient>
<radialGradient id="${p}O" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="${mezclar(c.tinta, c.fondo, 0.45)}"/><stop offset="1" stop-color="${c.tinta}"/></radialGradient>
<radialGradient id="${p}A" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fde68a"/><stop offset=".6" stop-color="${AMARILLO}"/><stop offset="1" stop-color="#f59e0b"/></radialGradient>
${filtroDeSombra(`${p}S`, 4, 6, 0.32, 30)}
${filtroDeSombra(`${p}s`, 2.6, 3.5, 0.38, 40)}
</defs>`,
  luz: `url(#${p}F)`,
  sombra: `${p}s`,
  pintar: (dibujo, c) =>
    `<g filter="url(#${p}S)">` +
    dibujo
      .replace(new RegExp(`fill="${BLANCO}"(?![^>]*opacity)`, 'g'), `fill="url(#${p}B)"`)
      .replace(new RegExp(`fill="${AMARILLO}"`, 'g'), `fill="url(#${p}A)"`)
      .replace(new RegExp(`fill="${c.tinta}"`, 'g'), `fill="url(#${p}O)"`) +
    '</g>',
})

const VOLUMEN: Record<Marca, Volumen> = {
  ...(Object.fromEntries(MARCAS.map((m) => [m, volumenComun(m)])) as Record<Marca, Volumen>),
  // LibraBot (ADR-089) trae su volumen dibujado a mano: la burbuja, la respuesta translúcida y los ojos con reflejo.
  librabot: {
    defs: (c) => `<defs>
<radialGradient id="lbF" cx="30%" cy="22%" r="95%"><stop offset="0" stop-color="#fb7185"/><stop offset=".55" stop-color="${c.fondo}"/><stop offset="1" stop-color="#be123c"/></radialGradient>
<linearGradient id="lbB" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="${BLANCO}"/><stop offset=".7" stop-color="#fdf2f4"/><stop offset="1" stop-color="#f9d5dd"/></linearGradient>
<linearGradient id="lbR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BLANCO}" stop-opacity=".75"/><stop offset="1" stop-color="${c.claro}" stop-opacity=".6"/></linearGradient>
<radialGradient id="lbO" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#881337"/><stop offset="1" stop-color="${c.tinta}"/></radialGradient>
<filter id="lbS" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="4"/><feOffset dy="6"/><feComponentTransfer><feFuncA type="linear" slope=".32"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`,
    luz: 'url(#lbF)',
  },
}

/**
 * El SVG completo de la marca: el cuadrado redondeado del color de marca y el dibujo encima. Sin `width` ni `height`: llena lo que le den.
 * `icono` lleva un `<title>` con el nombre; quien lo incruste como decoración (`MarcaProducto`) lo esconde con `aria-hidden`.
 */
export function svgDeMarca(marca: Marca, variante: VarianteDeMarca = 'icono'): string {
  const { nombre, color } = datosDeMarca(marca)
  const volumen = VOLUMEN[marca]
  const paleta: Paleta = { fondo: color, ...TONOS[marca], sombra: volumen.sombra }
  // El favicon redondea un poco más (30 contra 27): achicado a 16 px, el radio del ícono se ve casi recto.
  const rx = variante === 'favicon' ? 30 : 27
  const fondo = `<rect width="120" height="120" rx="${rx}" fill="${color}"/><rect width="120" height="120" rx="${rx}" fill="${volumen.luz}"/>`
  const plano = (variante === 'favicon' ? FAVICON : ICONO)[marca](paleta)
  const dibujo3d = volumen.pintar ? volumen.pintar(plano, paleta) : plano
  const cuerpo =
    volumen.defs(paleta) +
    (variante === 'favicon' ? `${fondo}${dibujo3d}` : `${fondo}<g transform="translate(9 9) scale(.85)">${dibujo3d}</g>`)
  // Compacto: sin saltos de línea ni sangría, para que el archivo y el data URL pesen lo justo.
  const dibujo = cuerpo.replace(/\n/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><title>${nombre}</title>${dibujo}</svg>`
}

/** El favicon como `data:` URL, listo para un `<link rel="icon">`. */
export function faviconDeMarca(marca: Marca): string {
  return `data:image/svg+xml,${encodeURIComponent(svgDeMarca(marca, 'favicon'))}`
}

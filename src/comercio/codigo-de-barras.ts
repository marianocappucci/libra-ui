// El código de barras de una etiqueta de góndola, generado acá y sin dependencia.
//
// ## Por qué se escribe y no se instala `jsbarcode`
//
// libra-ui sólo trae dos dependencias (`@tanstack/react-table` y `altcha`) y llega a cada producto como fuente,
// pineada al tag: una dependencia más se instala en los ocho consumidores y entra a su `package-lock`. Lo que hace
// falta es chico y cerrado —dos simbologías, tablas fijas de una norma— y el resultado es un SVG, que imprime
// vectorial y nítido a cualquier tamaño. Las tablas se validan en `test/comercio-codigo-de-barras.test.ts` contra
// vectores conocidos de la norma (no contra este mismo código) y con las invariantes de cada simbología.
//
// ## Qué simbología sale para cada código
//
// 🔴 **El código impreso tiene que ser, carácter por carácter, el que está guardado**: el POS lo busca con
// `item_codes.code = ?` (`libracommerce.erp.catalogo.escanear`), así que una etiqueta que el lector traduzca a otro
// texto no vende nada. Por eso:
//
// - **EAN-13** si son 13 dígitos (no empieza en 0, ver abajo) con el dígito verificador bien; **EAN-8** si son 8 y también cierra. Es lo que trae
//   impreso un envase de góndola y lo que cualquier lector espera.
// - **Code 128** para todo lo demás: el código interno que genera el alta (`BEB-0001`, ver
//   `catalogo.generar_codigo_producto`), un SKU o un EAN con el dígito mal cargado. Code 128 admite cualquier ASCII
//   imprimible, así que un producto sin EAN de fábrica igual se puede escanear. Con sólo dígitos y cantidad par usa el
//   juego C (dos dígitos por símbolo), que da un código a la mitad de ancho.
// - Un UPC-A de 12 dígitos **no** se dibuja como EAN-13 con un cero adelante, y un EAN-13 que **empieza en 0** tampoco
//   se dibuja como EAN-13: las dos cosas son el mismo símbolo, y un lector lo entrega como UPC-A, sin el cero (medido
//   con ZXing: `0813954181356` vuelve como `813954181356`). Ya no coincidiría con lo guardado. Van en Code 128, que
//   devuelve el texto tal cual. Los EAN argentinos empiezan en 779, así que es el caso raro.
// - Un carácter fuera de ASCII imprimible (una `ñ`, un acento) no se puede codificar: `codificarBarras` devuelve
//   `null` y la etiqueta sale sólo con el texto.
//
// El resultado es una cadena de módulos —`'1'` barra, `'0'` espacio— sin la zona de silencio, que agrega el
// componente que lo dibuja.

export type FormatoDeBarras = 'ean13' | 'ean8' | 'code128'

export type CodigoCodificado = {
  formato: FormatoDeBarras
  /** `'1'` es una barra de un módulo y `'0'` un espacio de un módulo, de izquierda a derecha. */
  modulos: string
}

// ── EAN ──────────────────────────────────────────────────────────────────

// Los dígitos 0-9 del juego L (paridad impar). El R es el complemento y el G es el R al revés: se derivan para no
// escribir tres tablas.
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']

const complemento = (bits: string) => bits.split('').map((b) => (b === '1' ? '0' : '1')).join('')
const alReves = (bits: string) => bits.split('').reverse().join('')
const EAN_R = EAN_L.map(complemento)
const EAN_G = EAN_R.map(alReves)

// Qué juego (L o G) lleva cada uno de los seis dígitos de la izquierda del EAN-13, según su primer dígito.
const EAN13_PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

const GUARDA = '101'
const GUARDA_CENTRAL = '01010'

/** El dígito verificador de un EAN de 8 o 13: los dígitos de derecha a izquierda (sin el verificador) pesan 3, 1, 3… */
export function digitoVerificadorEan(cuerpo: string): number {
  let suma = 0
  for (let i = 0; i < cuerpo.length; i++) {
    const desdeLaDerecha = cuerpo.length - 1 - i
    suma += Number(cuerpo[i]) * (desdeLaDerecha % 2 === 0 ? 3 : 1)
  }
  return (10 - (suma % 10)) % 10
}

function esEanValido(codigo: string, largo: 8 | 13): boolean {
  if (!new RegExp(`^\\d{${largo}}$`).test(codigo)) return false
  return digitoVerificadorEan(codigo.slice(0, -1)) === Number(codigo[largo - 1])
}

function ean13(codigo: string): string {
  const paridad = EAN13_PARIDAD[Number(codigo[0])]
  const izquierda = codigo.slice(1, 7).split('').map((d, i) => (paridad[i] === 'L' ? EAN_L : EAN_G)[Number(d)]).join('')
  const derecha = codigo.slice(7).split('').map((d) => EAN_R[Number(d)]).join('')
  return GUARDA + izquierda + GUARDA_CENTRAL + derecha + GUARDA
}

function ean8(codigo: string): string {
  const izquierda = codigo.slice(0, 4).split('').map((d) => EAN_L[Number(d)]).join('')
  const derecha = codigo.slice(4).split('').map((d) => EAN_R[Number(d)]).join('')
  return GUARDA + izquierda + GUARDA_CENTRAL + derecha + GUARDA
}

// ── Code 128 ─────────────────────────────────────────────────────────────

// Los anchos alternados barra/espacio de cada símbolo, del valor 0 al 105; el 103, 104 y 105 son los tres «Start».
const CODE128_ANCHOS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232',
]
const CODE128_PARADA = '2331112'
const START_B = 104
const START_C = 105

function modulosDeAnchos(anchos: string): string {
  // Empieza con una barra y alterna: la primera cifra es barra, la segunda espacio…
  return anchos.split('').map((n, i) => (i % 2 === 0 ? '1' : '0').repeat(Number(n))).join('')
}

function code128(codigo: string): string | null {
  const soloDigitosPares = /^\d+$/.test(codigo) && codigo.length % 2 === 0
  let inicio: number
  let valores: number[]
  if (soloDigitosPares) {
    inicio = START_C
    valores = (codigo.match(/\d{2}/g) ?? []).map(Number)
  } else {
    inicio = START_B
    valores = []
    for (const caracter of codigo) {
      const ascii = caracter.charCodeAt(0)
      if (ascii < 32 || ascii > 126) return null
      valores.push(ascii - 32)
    }
  }
  const verificador = (inicio + valores.reduce((suma, valor, i) => suma + valor * (i + 1), 0)) % 103
  return [inicio, ...valores, verificador].map((v) => modulosDeAnchos(CODE128_ANCHOS[v])).join('') + modulosDeAnchos(CODE128_PARADA)
}

// ── Elegir ───────────────────────────────────────────────────────────────

/** Codifica el código de un producto para la etiqueta. `null` si está vacío o tiene un carácter que Code 128 no puede
 *  llevar: en ese caso la etiqueta imprime el texto sin barras. */
export function codificarBarras(codigo: string | null | undefined): CodigoCodificado | null {
  if (!codigo || codigo.trim() === '') return null
  if (esEanValido(codigo, 13) && codigo[0] !== '0') return { formato: 'ean13', modulos: ean13(codigo) }
  if (esEanValido(codigo, 8)) return { formato: 'ean8', modulos: ean8(codigo) }
  const modulos = code128(codigo)
  return modulos === null ? null : { formato: 'code128', modulos }
}

/** Las barras como tramos `[inicio, ancho]` en módulos: lo que el SVG dibuja como un rectángulo cada uno. */
export function tramosDeBarras(modulos: string): [number, number][] {
  const tramos: [number, number][] = []
  let desde = -1
  for (let i = 0; i <= modulos.length; i++) {
    const barra = modulos[i] === '1'
    if (barra && desde < 0) desde = i
    if (!barra && desde >= 0) {
      tramos.push([desde, i - desde])
      desde = -1
    }
  }
  return tramos
}

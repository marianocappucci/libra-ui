// El código de barras de la etiqueta de góndola: la codificación (EAN-13, EAN-8 y Code 128) y el SVG que la dibuja.
//
// 🔴 Lo que estos tests cuidan es que **la etiqueta impresa se escanee como el texto guardado**: el POS busca el
// código con `item_codes.code = ?`. Los vectores de abajo NO salen de `codigo-de-barras.ts`: son la salida de
// `jsbarcode` 3.x, una implementación independiente, para códigos elegidos de modo que entre todos usen cada dígito
// en cada juego de la norma (L, G y R). Además el mismo código se decodificó con ZXing (un lector real) al escribirlo
// — ver el reporte de la tanda —; eso no queda acá para no sumar una dependencia de desarrollo.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CodigoDeBarras } from '../src/comercio/CodigoDeBarras'
import { codificarBarras, digitoVerificadorEan, tramosDeBarras } from '../src/comercio/codigo-de-barras'

// [código, módulos]: 9 EAN-13 (uno por cada primer dígito 1-9, o sea cada patrón de paridad) que cubren los 30 pares
// (dígito, juego); el 0 va aparte, ver abajo.
const EAN13: [string, string][] = [
  ['1259342778934', '10100100110110001001011101111010011101001101101010100010010001001001000111010010000101011100101'],
  ['2829070479770', '10101101110010011001011101001110111011010011101010101110010001001110100100010010001001110010101'],
  ['3428471936227', '10101000110010011000100100111010010001001100101010111010010000101010000110110011011001000100101'],
  ['4127641128699', '10100110010011011011101101011110011101011001101010110011011011001001000101000011101001110100101'],
  ['5996042366417', '10100010110010111000010100011010100011001101101010100001010100001010000101110011001101000100101'],
  ['6059693052951', '10100011010111001001011100001010001011011110101010111001010011101101100111010010011101100110101'],
  ['7645444509974', '10101011110011101011000100111010100011001110101010100111011100101110100111010010001001011100101'],
  ['8782262166565', '10101110110001001001001100110110000101001001101010110011010100001010000100111010100001001110101'],
  ['9834390168191', '10101101110100001001110101111010010111000110101010110011010100001001000110011011101001100110101'],
  // El ejemplo de Wikipedia.
  ['5901234123457', '10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101'],
]

const EAN8: [string, string][] = [
  ['68091484', '1010101111011011100011010001011010101100110101110010010001011100101'],
  ['52182327', '1010110001001001100110010110111010101101100100001011011001000100101'],
  ['67435609', '1010101111011101101000110111101010101001110101000011100101110100101'],
]

const CODE128: [string, string][] = [
  ['BEB-0001', '110100100001000101100010001101000100010110001001101110010011101100100111011001001110110010011100110101100100001100011101011'],
  ['Yerba 500g', '1101001000011101101000101100100001001001111010010000110100101100001101100110011011100100100111011001001110110010011010000101111011101100011101011'],
  ['a', '1101001000010010110000100100001101100011101011'],
  ['~ !"#', '110100100001000101111011011001100110011011001100110011010010011000110011100101100011101011'],
  // Sólo dígitos y cantidad par: juego C, dos dígitos por símbolo.
  ['00', '1101001110011011001100110011001101100011101011'],
  ['1234', '110100111001011001110010001011000100100111101100011101011'],
  ['9900112233', '110100111001011101111011011001100110001001001100111010010100011000110000101001100011101011'],
]

describe('codificarBarras', () => {
  it.each(EAN13)('EAN-13 %s', (codigo, modulos) => {
    expect(codificarBarras(codigo)).toEqual({ formato: 'ean13', modulos })
  })

  it.each(EAN8)('EAN-8 %s', (codigo, modulos) => {
    expect(codificarBarras(codigo)).toEqual({ formato: 'ean8', modulos })
  })

  it.each(CODE128)('Code 128 %s', (codigo, modulos) => {
    expect(codificarBarras(codigo)).toEqual({ formato: 'code128', modulos })
  })

  it('el ancho: 95 módulos el EAN-13, 67 el EAN-8 y 11 por símbolo + 13 de parada el Code 128', () => {
    expect(codificarBarras('5901234123457')!.modulos).toHaveLength(95)
    expect(codificarBarras('68091484')!.modulos).toHaveLength(67)
    // BEB-0001: inicio + 8 caracteres + verificador = 10 símbolos de 11, más la parada de 13.
    expect(codificarBarras('BEB-0001')!.modulos).toHaveLength(10 * 11 + 13)
    // 10 dígitos en juego C: inicio + 5 símbolos + verificador.
    expect(codificarBarras('9900112233')!.modulos).toHaveLength(7 * 11 + 13)
  })

  it('el dígito verificador del EAN: 12 cifras → 7, 7 cifras → 4', () => {
    expect(digitoVerificadorEan('590123412345')).toBe(7)
    expect(digitoVerificadorEan('6809148')).toBe(4)
  })

  it('🔴 un EAN-13 con el verificador mal NO se dibuja como EAN: va en Code 128 y conserva el texto', () => {
    // El 5901234123458 no cierra (el bueno termina en 7). Dibujarlo como EAN-13 lo haría ilegible para el lector, que
    // lo descarta por checksum; en Code 128 se lee tal cual.
    expect(codificarBarras('5901234123458')?.formato).toBe('code128')
    expect(codificarBarras('68091485')?.formato).toBe('code128')
  })

  it('🔴 un EAN-13 que empieza en 0 (o un UPC-A de 12) va en Code 128: como EAN el lector lo devuelve sin el 0', () => {
    // 0813954181356 es válido, pero es el mismo símbolo que el UPC-A 813954181356 y ZXing lo devuelve así. Guardado
    // con el cero, el POS no lo encontraría.
    expect(codificarBarras('0813954181356')?.formato).toBe('code128')
    expect(codificarBarras('813954181356')?.formato).toBe('code128')
  })

  it('un código con un carácter fuera de ASCII imprimible no se puede codificar', () => {
    expect(codificarBarras('AZÚCAR-1')).toBeNull()
    expect(codificarBarras('línea\n2')).toBeNull()
  })

  it('un código vacío, en blanco o ausente no genera barras', () => {
    expect(codificarBarras('')).toBeNull()
    expect(codificarBarras('   ')).toBeNull()
    expect(codificarBarras(null)).toBeNull()
    expect(codificarBarras(undefined)).toBeNull()
  })

  it('las invariantes de cualquier Code 128: termina en la parada y cada símbolo tiene 11 módulos', () => {
    const { modulos } = codificarBarras('Yerba 500g')!
    expect(modulos.endsWith('1100011101011')).toBe(true)
    expect((modulos.length - 13) % 11).toBe(0)
  })
})

describe('tramosDeBarras', () => {
  it('cada tramo es una barra continua: [inicio, ancho] en módulos', () => {
    expect(tramosDeBarras('0110100111')).toEqual([[1, 2], [4, 1], [7, 3]])
  })

  it('sin barras no hay tramos', () => {
    expect(tramosDeBarras('000')).toEqual([])
  })
})

describe('CodigoDeBarras', () => {
  it('dibuja el SVG del formato que corresponde, con zona de silencio a los lados', () => {
    const { container } = render(<CodigoDeBarras codigo="5901234123457" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('data-formato', 'ean13')
    expect(svg).toHaveAttribute('aria-label', 'Código de barras 5901234123457')
    // 95 módulos + 11 de silencio de cada lado.
    expect(svg).toHaveAttribute('viewBox', '0 0 117 1')
    // La primera barra (la guarda de inicio) arranca después del silencio.
    expect(svg.querySelector('path')!.getAttribute('d')!.startsWith('M11 0h1v1h-1z')).toBe(true)
  })

  it('un código de interno (BEB-0001) sale en Code 128', () => {
    const { container } = render(<CodigoDeBarras codigo="BEB-0001" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-formato', 'code128')
  })

  it('no dibuja nada si el código no se puede codificar', () => {
    const { container } = render(<CodigoDeBarras codigo="AZÚCAR" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

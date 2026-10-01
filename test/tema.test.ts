import { describe, expect, it } from 'vitest'

import {
  CLAVES_DE_TEMA, COLORES_DE_TEMA, aplicarTema, contraste, luminancia, normalizarHex, textoSobre, validarTema,
} from '../src/tema'

describe('colores', () => {
  it('normalizarHex acepta #rgb y #rrggbb en cualquier mayúscula y rechaza el resto', () => {
    expect(normalizarHex('#ECFDF5')).toBe('#ecfdf5')
    expect(normalizarHex(' #0F0 ')).toBe('#00ff00')
    for (const malo of ['ecfdf5', '#ecfdf', '#gggggg', 'rgb(0,0,0)', '', null, 12, undefined]) {
      expect(normalizarHex(malo)).toBeNull()
    }
  })

  it('el contraste es el de WCAG: 21 entre negro y blanco, 1 entre iguales', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contraste('#336699', '#336699')).toBeCloseTo(1, 5)
    expect(luminancia('#ffffff')).toBeCloseTo(1, 5)
  })

  it('el texto sobre un fondo claro es oscuro y sobre uno oscuro es claro', () => {
    expect(textoSobre('#ecfdf5')).toBe('#0f172a')
    expect(textoSobre('#064e3b')).toBe('#ffffff')
  })
})

describe('el catálogo', () => {
  it('tiene una definición por clave, sin repetidos, con defectos válidos', () => {
    expect(COLORES_DE_TEMA.map((d) => d.clave).sort()).toEqual([...CLAVES_DE_TEMA].sort())
    for (const d of COLORES_DE_TEMA) {
      expect(normalizarHex(d.porDefecto)).toBe(d.porDefecto)
      expect(d.variable).toMatch(/^--/)
    }
  })

  it('el valor por defecto de cada color pasa su propia validación', () => {
    const defectos = Object.fromEntries(COLORES_DE_TEMA.map((d) => [d.clave, d.porDefecto]))
    const { tema, errores } = validarTema(defectos)
    expect(errores).toEqual({})
    expect(tema).toEqual(defectos)
  })
})

describe('validarTema', () => {
  it('normaliza y acepta un tema válido', () => {
    const { tema, errores } = validarTema({ menuActivoFondo: '#FDF2F8', menuActivoBorde: '#F9A8D4' })
    expect(errores).toEqual({})
    expect(tema).toEqual({ menuActivoFondo: '#fdf2f8', menuActivoBorde: '#f9a8d4' })
  })

  it('rechaza una clave desconocida y un valor que no es un color, sin lanzar', () => {
    const { tema, errores } = validarTema({ colorInventado: '#ffffff', menuActivoBorde: 'verde' })
    expect(tema).toEqual({})
    expect(errores.colorInventado).toMatch(/desconocido/)
    expect(errores.menuActivoBorde).toMatch(/no es un color/)
  })

  it('rechaza un fondo sobre el que ningún texto se lee (contraste < 4,5)', () => {
    const { tema, errores } = validarTema({ menuActivoFondo: '#7b7b7b' })
    expect(tema).toEqual({})
    expect(errores.menuActivoFondo).toMatch(/ningún texto se lee/)
  })

  it('una entrada que no es un objeto da un tema vacío', () => {
    for (const x of [null, undefined, 'x', 3, []]) expect(validarTema(x)).toEqual({ tema: {}, errores: {} })
  })
})

describe('aplicarTema', () => {
  it('fija el color y recalcula el texto; aplicar {} restaura los valores por defecto', () => {
    const el = document.createElement('div')
    aplicarTema({ menuActivoFondo: '#1e3a8a', menuActivoBorde: '#93c5fd' }, el)
    expect(el.style.getPropertyValue('--libra-menu-activo-fondo')).toBe('#1e3a8a')
    expect(el.style.getPropertyValue('--libra-menu-activo-borde')).toBe('#93c5fd')
    expect(el.style.getPropertyValue('--libra-menu-activo-texto')).toBe('#ffffff')
    aplicarTema({}, el)
    expect(el.style.getPropertyValue('--libra-menu-activo-fondo')).toBe('')
    expect(el.style.getPropertyValue('--libra-menu-activo-texto')).toBe('')
  })

  it('ignora lo inválido en vez de aplicarlo', () => {
    const el = document.createElement('div')
    aplicarTema({ menuActivoFondo: '#7b7b7b' }, el)
    expect(el.style.getPropertyValue('--libra-menu-activo-fondo')).toBe('')
  })
})

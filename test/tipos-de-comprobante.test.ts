// La copia TypeScript de la tabla de tipos del motor (`libracore/tipos_comprobante.py`): si el motor suma un tipo y acá no, el comprobante
// pierde el botón de cobrar sin error. Estos números son los del motor v1.178.0 (ADR-066).
import { describe, expect, it } from 'vitest'

import {
  COBRABLES, FACTURAS, NC, ND, discriminaIva, esCobrable, esFactura, esFce, letraDe, nombreDe, prefijoDe, rotuloDe, siglaDe,
} from '../src/tipos-de-comprobante'

describe('tipos de comprobante', () => {
  it('son los 18 de ARCA que emite la familia (6 facturas, 6 notas de débito, 6 de crédito), con las FCE', () => {
    expect([...FACTURAS]).toEqual([1, 6, 11, 201, 206, 211])
    expect([...ND]).toEqual([2, 7, 12, 202, 207, 212])
    expect([...NC]).toEqual([3, 8, 13, 203, 208, 213])
  })

  it('lo cobrable son las facturas y las notas de débito: 12 tipos, sin ninguna nota de crédito', () => {
    expect(COBRABLES).toHaveLength(12)
    expect(new Set(COBRABLES)).toEqual(new Set([...FACTURAS, ...ND]))
    for (const t of NC) expect(esCobrable(t)).toBe(false)
    for (const t of [...FACTURAS, ...ND]) expect(esCobrable(t)).toBe(true)
  })

  it('«factura» es sólo la factura: la nota de débito se cobra pero no se acredita', () => {
    for (const t of FACTURAS) expect(esFactura(t)).toBe(true)
    for (const t of [...ND, ...NC]) expect(esFactura(t)).toBe(false)
    expect(esFactura(99)).toBe(false)
    expect(esCobrable(99)).toBe(false)
  })
})

// Los rótulos (ADR-075). La tabla de letras y de nombres es la `LETRA`/`NOMBRE` de `libracore/tipos_comprobante.py` (v1.178.0).
const LOS_18 = [...FACTURAS, ...ND, ...NC]

describe('la letra y los rótulos salen de un solo lugar (ADR-075)', () => {
  it('cada uno de los 18 tipos tiene letra, y la FCE conserva la de su factura común', () => {
    for (const t of LOS_18) expect(letraDe(t)).toMatch(/^[ABC]$/)
    expect([201, 202, 203].map(letraDe)).toEqual(['A', 'A', 'A'])
    expect([206, 207, 208].map(letraDe)).toEqual(['B', 'B', 'B'])
    expect([211, 212, 213].map(letraDe)).toEqual(['C', 'C', 'C'])
    expect([1, 2, 3].map(letraDe)).toEqual(['A', 'A', 'A'])
    expect(letraDe(99)).toBeUndefined()
  })

  it('el IVA se discrimina en toda clase menos la C: 11/12/13 **y 211/212/213** no lo discriminan', () => {
    for (const t of [11, 12, 13, 211, 212, 213]) expect(discriminaIva(t), `tipo ${t}`).toBe(false)
    for (const t of [1, 2, 3, 6, 7, 8, 201, 202, 203, 206, 207, 208]) expect(discriminaIva(t), `tipo ${t}`).toBe(true)
    // Un tipo que la pantalla no conoce discrimina, como antes (`tipo !== 11`).
    expect(discriminaIva(99)).toBe(true)
  })

  it('los nombres son los del motor, palabra por palabra', () => {
    expect(nombreDe(11)).toBe('Factura C')
    expect(nombreDe(13)).toBe('Nota de Crédito C')
    expect(nombreDe(2)).toBe('Nota de Débito A')
    expect(nombreDe(201)).toBe('FCE MiPyME A')
    expect(nombreDe(211)).toBe('FCE MiPyME C')
    expect(nombreDe(207)).toBe('Nota de Débito FCE B')
    expect(nombreDe(208)).toBe('Nota de Crédito FCE B')
    expect(nombreDe(99)).toBe('Comprobante')
  })

  it('ninguno de los 18 sale «?»: ni el nombre, ni la sigla, ni el rótulo, ni el prefijo del número', () => {
    for (const t of LOS_18) {
      expect(nombreDe(t), `nombre ${t}`).not.toBe('Comprobante')
      expect(siglaDe(t), `sigla ${t}`).not.toContain('?')
      expect(rotuloDe(t), `rótulo ${t}`).not.toMatch(/^\d+$/)
      expect(prefijoDe(t), `prefijo ${t}`).not.toContain('?')
    }
    expect(siglaDe(99)).toBe('?')
    expect(prefijoDe(99)).toBe('?')
    expect(rotuloDe(99)).toBe('99')
  })

  it('cada tipo se distingue de los demás: dos tipos no comparten sigla, rótulo, prefijo ni nombre', () => {
    for (const f of [siglaDe, rotuloDe, prefijoDe, nombreDe]) expect(new Set(LOS_18.map(f)).size, f.name).toBe(18)
  })

  it('los rótulos de los nueve tipos de siempre no cambian, y los de las FCE se leen igual de claro', () => {
    expect([1, 6, 11, 3, 13, 2, 12].map(siglaDe)).toEqual(['FA', 'FB', 'FC', 'NCA', 'NCC', 'NDA', 'NDC'])
    expect([1, 6, 11, 3, 13, 2, 12].map(rotuloDe)).toEqual(['FAC A', 'FAC B', 'FAC C', 'NC A', 'NC C', 'ND A', 'ND C'])
    expect([1, 6, 11, 3, 13, 2, 12].map(prefijoDe)).toEqual(['A', 'B', 'C', 'NC-A', 'NC-C', 'ND-A', 'ND-C'])
    expect([201, 211, 202, 203].map(siglaDe)).toEqual(['FEA', 'FEC', 'NDEA', 'NCEA'])
    expect([201, 211, 202, 203].map(rotuloDe)).toEqual(['FCE A', 'FCE C', 'ND FCE A', 'NC FCE A'])
    expect([201, 211, 202, 203].map(prefijoDe)).toEqual(['FCE-A', 'FCE-C', 'ND-FCE-A', 'NC-FCE-A'])
  })

  it('«es FCE» son los nueve códigos 20x/21x', () => {
    expect(LOS_18.filter(esFce)).toEqual([201, 206, 211, 202, 207, 212, 203, 208, 213])
    expect(esFce(11)).toBe(false)
  })
})

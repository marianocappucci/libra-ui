// La copia TypeScript de la tabla de tipos del motor (`libracore/tipos_comprobante.py`): si el motor suma un tipo y acá no, el comprobante
// pierde el botón de cobrar sin error. Estos números son los del motor v1.178.0 (ADR-066).
import { describe, expect, it } from 'vitest'

import { COBRABLES, FACTURAS, NC, ND, esCobrable, esFactura } from '../src/tipos-de-comprobante'

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

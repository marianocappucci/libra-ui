// El id provisorio de lo que se da de alta en un nodo sin conexión (ADR-095): una sola regla para la reserva, el paciente y el cliente.
import { describe, expect, it } from 'vitest'

import { ETIQUETA_PROVISORIO, ayudaDelProvisorio, esIdProvisorio } from '../src/ids-provisorios'
import { esReservaProvisoria } from '../src/reservas-del-nodo'

describe('esIdProvisorio', () => {
  it('es el entero negativo, número o texto', () => {
    expect(esIdProvisorio(-3)).toBe(true)
    expect(esIdProvisorio('-3')).toBe(true)
    expect(esIdProvisorio(-1)).toBe(true)
  })

  it('el id de la web no lo es: positivo, un uuid, el `p-042` de MedLibra', () => {
    expect(esIdProvisorio(12)).toBe(false)
    expect(esIdProvisorio('12')).toBe(false)
    expect(esIdProvisorio('3f2c8a0e-6a51-4b7e-9d3c-0b1f5e7a9c21')).toBe(false)
    expect(esIdProvisorio('p-042')).toBe(false)
  })

  it('lo que no es un id no es provisorio', () => {
    for (const v of [0, '0', '', null, undefined, 'abc', -1.5, NaN]) expect(esIdProvisorio(v)).toBe(false)
  })

  it('la reserva sin subir usa la misma regla (no son dos copias)', () => {
    expect(esReservaProvisoria).toBe(esIdProvisorio)
  })
})

describe('los textos', () => {
  it('«Provisorio» (de una persona; la reserva sigue sin llamarse «Provisoria»)', () => {
    expect(ETIQUETA_PROVISORIO).toBe('Provisorio')
  })

  it('la ayuda dice a quién le toca y qué pasa al volver la conexión, sin jerga', () => {
    expect(ayudaDelProvisorio('paciente')).toMatch(/^Este paciente se dio de alta sin conexión/)
    expect(ayudaDelProvisorio('cliente')).toMatch(/^Este cliente se dio de alta sin conexión/)
    expect(ayudaDelProvisorio()).toMatch(/^Esta ficha se dio de alta sin conexión/)
    for (const p of ['paciente', 'cliente', undefined] as const) {
      expect(ayudaDelProvisorio(p)).toMatch(/cuando vuelva la conexión/)
      expect(ayudaDelProvisorio(p)).toMatch(/se une a su ficha/)
      expect(ayudaDelProvisorio(p)).not.toMatch(/nodo|outbox|central/i)
    }
  })
})

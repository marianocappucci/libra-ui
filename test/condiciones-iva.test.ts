// Las condiciones frente al IVA que ofrece el kit (decisión del humano, 2026-10-16: «IVA No Responsable» se saca, 0.158.2).
import { describe, expect, it } from 'vitest'

import { IVA_CONDITIONS, condicionDeIvaDeArca, condicionesIvaPara } from '../src/facturas'

describe('condiciones frente al IVA', () => {
  it('«IVA No Responsable» ya no se ofrece', () => {
    expect(IVA_CONDITIONS).not.toContain('IVA No Responsable')
    expect(IVA_CONDITIONS).toEqual(['Responsable Inscripto', 'Monotributista', 'IVA Exento', 'Consumidor Final', 'No Alcanzado'])
  })

  it('🔴 un formulario que edita una ficha vieja la sigue mostrando, para no vaciarla', () => {
    expect(condicionesIvaPara('IVA No Responsable')).toEqual([...IVA_CONDITIONS, 'IVA No Responsable'])
    expect(condicionesIvaPara('Monotributista')).toBe(IVA_CONDITIONS)
    expect(condicionesIvaPara('')).toBe(IVA_CONDITIONS)
    expect(condicionesIvaPara(null)).toBe(IVA_CONDITIONS)
  })

  it('si ARCA informa «IVA No Responsable», la consulta no toca el campo', () => {
    expect(condicionDeIvaDeArca('IVA No Responsable')).toBeUndefined()
  })
})

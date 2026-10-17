// El destino de la plata de la nota de crédito (ADR-073): las cuentas chicas que decide la pantalla. El diálogo entero se prueba en
// `FacturaDetalle.test.tsx` y `comercio-ventas.test.tsx`.
import { describe, expect, it } from 'vitest'

import {
  SIN_ELEGIR, avisoDeReintegro, cuerpoDeDestino, faltaElegirDestino, medioDeDevolucion, type OfertaDeDestino,
} from '../src/destino-de-nota'

const OFERTA: OfertaDeDestino = {
  aplica: true, monto: 400, excedente: 0, medios: [{ id: 'efectivo', label: 'Efectivo' }],
  medio_sugerido: 'efectivo', cliente_identificado: true, sin_turno: false,
}

describe('faltaElegirDestino', () => {
  it('sin oferta no falta nada: la nota sale como siempre', () => {
    expect(faltaElegirDestino(null, SIN_ELEGIR)).toBe(false)
  })
  it('con plata que mover hay que elegir', () => {
    expect(faltaElegirDestino(OFERTA, SIN_ELEGIR)).toBe(true)
    expect(faltaElegirDestino(OFERTA, { destino: 'devolver', medio: '' })).toBe(false)   // el sugerido alcanza
    expect(faltaElegirDestino(OFERTA, { destino: 'a_favor', medio: '' })).toBe(false)
  })
  it('devolver sin medio sugerido pide el medio; sin turno no se puede; a favor sin cliente no se puede', () => {
    expect(faltaElegirDestino({ ...OFERTA, medio_sugerido: null }, { destino: 'devolver', medio: '' })).toBe(true)
    expect(faltaElegirDestino({ ...OFERTA, medio_sugerido: null }, { destino: 'devolver', medio: 'efectivo' })).toBe(false)
    expect(faltaElegirDestino({ ...OFERTA, sin_turno: true }, { destino: 'devolver', medio: 'efectivo' })).toBe(true)
    expect(faltaElegirDestino({ ...OFERTA, cliente_identificado: false }, { destino: 'a_favor', medio: '' })).toBe(true)
  })
})

describe('cuerpoDeDestino', () => {
  it('es vacío sin oferta o sin elegir: nunca se manda un destino que el motor no pidió', () => {
    expect(cuerpoDeDestino(null, { destino: 'devolver', medio: 'efectivo' })).toEqual({})
    expect(cuerpoDeDestino(OFERTA, SIN_ELEGIR)).toEqual({})
  })
  it('devolver lleva el medio (el elegido, o el sugerido); a favor no lleva medio', () => {
    expect(cuerpoDeDestino(OFERTA, { destino: 'devolver', medio: '' })).toEqual({ destino: 'devolver', medio_pago: 'efectivo' })
    expect(cuerpoDeDestino(OFERTA, { destino: 'devolver', medio: 'transferencia' })).toEqual({ destino: 'devolver', medio_pago: 'transferencia' })
    expect(cuerpoDeDestino(OFERTA, { destino: 'a_favor', medio: 'transferencia' })).toEqual({ destino: 'a_favor' })
    expect(medioDeDevolucion({ ...OFERTA, medio_sugerido: null }, SIN_ELEGIR)).toBe('')
  })
})

describe('avisoDeReintegro', () => {
  it('sólo avisa cuando la plata no se movió y el motor dice por qué', () => {
    expect(avisoDeReintegro({ reintegro: { movido: false, motivo: 'sin CAE' } })).toBe('sin CAE')
    expect(avisoDeReintegro({ reintegro: { movido: true, motivo: 'x' } })).toBeNull()
    expect(avisoDeReintegro({ reintegro: { movido: false } })).toBeNull()
    expect(avisoDeReintegro({ id: 1 })).toBeNull()
    expect(avisoDeReintegro(null)).toBeNull()
  })
})

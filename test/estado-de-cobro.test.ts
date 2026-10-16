// La cuenta de «cuánto falta cobrar» (ADR-059 del motor, libra-ui ADR-068): una sola, para el listado, el
// detalle y el tablero. Lo que se fija acá es la tabla de casos de una factura de 1.000 y el respaldo para un
// motor viejo, que no manda `pendiente` ni `total_acreditado`.
import { describe, expect, it } from 'vitest'
import {
  acreditadoDe, cuentaDelDetalle, estaAcreditadaPorCompleto, estadoDeCobro, pendienteDe, puedeCobrar, tienePendiente,
  type CuentaDeCobro,
} from '../src/estado-de-cobro'

/** Una factura de 1.000 con lo que mande el motor. */
const f = (resto: Partial<CuentaDeCobro> = {}): CuentaDeCobro => ({ total: 1000, ...resto })

describe('el rótulo, con los campos del motor nuevo', () => {
  // [cobrado, acreditado, pendiente que dice el motor, rótulo, ¿se puede cobrar?]
  const CASOS: [string, CuentaDeCobro, string, boolean][] = [
    ['sin cobrar',                         f({ total_cobrado: 0,    total_acreditado: 0,    pendiente: 1000 }), 'sin_cobrar', true],
    ['cobrada a medias',                   f({ total_cobrado: 400,  total_acreditado: 0,    pendiente: 600 }),  'parcial',    true],
    ['cobrada',                            f({ total_cobrado: 1000, total_acreditado: 0,    pendiente: 0 }),    'cobrada',    false],
    ['acreditada por completo, sin cobros', f({ total_cobrado: 0,   total_acreditado: 1000, pendiente: 0 }),    'acreditada', false],
    ['cobrada y después acreditada',       f({ total_cobrado: 1000, total_acreditado: 1000, pendiente: 0 }),    'acreditada', false],
    ['nota parcial, nada cobrado',         f({ total_cobrado: 0,    total_acreditado: 400,  pendiente: 600 }),  'sin_cobrar', true],
    ['nota parcial y cobrado el resto',    f({ total_cobrado: 600,  total_acreditado: 400,  pendiente: 0 }),    'cobrada',    false],
    ['nota parcial y cobrada a medias',    f({ total_cobrado: 200,  total_acreditado: 400,  pendiente: 400 }),  'parcial',    true],
    ['acreditada de más (dos notas)',      f({ total_cobrado: 0,    total_acreditado: 1200, pendiente: 0 }),    'acreditada', false],
  ]
  it.each(CASOS)('%s', (_nombre, cuenta, rotulo, cobrable) => {
    expect(estadoDeCobro(cuenta)).toBe(rotulo)
    expect(puedeCobrar(cuenta)).toBe(cobrable)
    expect(tienePendiente(cuenta)).toBe(cobrable)
  })

  it('manda el `pendiente` del motor, aunque la resta a mano diera otra cosa', () => {
    // El motor excluye las notas sin CAE y las anuladas: la pantalla no vuelve a hacer esa cuenta.
    expect(pendienteDe(f({ total_cobrado: 0, total_acreditado: 400, pendiente: 750 }))).toBe(750)
  })

  it('nunca es negativo, ni un cobro de más de antes del tope', () => {
    expect(pendienteDe(f({ total_cobrado: 1500, pendiente: -500 }))).toBe(0)
    expect(estadoDeCobro(f({ total_cobrado: 1500, pendiente: -500 }))).toBe('cobrada')
  })

  it('menos de medio centavo no es «falta cobrar» (la tolerancia del motor)', () => {
    expect(tienePendiente(f({ total_cobrado: 999.996, pendiente: 0.004 }))).toBe(false)
    expect(tienePendiente(f({ total_cobrado: 999.99, pendiente: 0.01 }))).toBe(true)
    expect(estaAcreditadaPorCompleto(f({ total_acreditado: 999.996 }))).toBe(true)
  })
})

describe('un motor viejo: sin `pendiente` ni `total_acreditado` se cae en total − cobrado', () => {
  it.each([
    ['sin ningún dato de cobro', f(), 'sin_cobrar', 1000, true],
    ['cobrado en parte', f({ total_cobrado: 400 }), 'parcial', 600, true],
    ['cobrado entero', f({ total_cobrado: 1000 }), 'cobrada', 0, false],
    ['cobrado de más', f({ total_cobrado: 1200 }), 'cobrada', 0, false],
    ['los campos llegan en null', f({ total_cobrado: null, total_acreditado: null, pendiente: null }), 'sin_cobrar', 1000, true],
  ] as [string, CuentaDeCobro, string, number, boolean][])('%s', (_n, cuenta, rotulo, pendiente, cobrable) => {
    expect(estadoDeCobro(cuenta)).toBe(rotulo)
    expect(pendienteDe(cuenta)).toBe(pendiente)
    expect(puedeCobrar(cuenta)).toBe(cobrable)
  })

  it('sin el dato de las notas nunca inventa «Acreditada»', () => {
    expect(acreditadoDe(f())).toBe(0)
    expect(estaAcreditadaPorCompleto(f({ total_cobrado: 0 }))).toBe(false)
  })

  it('si falta sólo `pendiente` pero llega `total_acreditado`, la resta lo incluye', () => {
    expect(pendienteDe(f({ total_cobrado: 100, total_acreditado: 400 }))).toBe(500)
  })

  it('un total en cero no es «Acreditada»', () => {
    expect(estadoDeCobro({ total: 0, total_cobrado: 0 })).toBe('cobrada')
  })
})

describe('la cuenta de un detalle', () => {
  it('toma el total de `factura` y el resto del costado', () => {
    expect(cuentaDelDetalle({ factura: { total: 1000 }, total_cobrado: 100, total_acreditado: 400, pendiente: 500 }))
      .toEqual({ total: 1000, total_cobrado: 100, total_acreditado: 400, pendiente: 500 })
  })
})

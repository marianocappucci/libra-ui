// El reloj se fija a las **23:30 del 31 de agosto, hora de Argentina**, que en
// UTC ya es el 1 de septiembre a las 02:30.
//
// 🔴 Ese instante no es decorativo, y elegirlo mal vuelve toda esta suite
// inútil. El defecto sólo se manifiesta entre las 21:00 y la medianoche: a
// mediodía, `toISOString()` y el helper correcto devuelven exactamente lo
// mismo, así que un test escrito a mediodía da el mismo verde con el código
// roto y con el sano. Es la misma trampa que casi deja pasar la barrida del
// backend del 2026-08-23: aquel chequeo comparaba la FECHA a las 00:05 —cuando
// las dos coinciden— y dio "COINCIDE" en los ocho productos estando seis mal.
//
// Y es fin de mes a propósito: en ese instante el patrón viejo no sólo cambia
// de día, cambia de MES. Es el único momento en que `primerDiaDelMesISO` puede
// fallar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { enDiasISO, hoyISO, primerDiaDelMesISO, sumarDiasISO } from '../src/fechas'

/** 23:30 del 31-08-2026 en Argentina = 02:30 UTC del 01-09-2026. */
const NOCHE_DE_FIN_DE_MES = new Date('2026-09-01T02:30:00Z')

describe('el día de hoy en Argentina', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOCHE_DE_FIN_DE_MES)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('el patrón viejo devuelve MAÑANA en este instante', () => {
    // 🔴 Control POSITIVO, y es la pieza que sostiene todo lo demás. Sin él,
    // un instante mal elegido —o un `setSystemTime` que no tomó— daría
    // exactamente el mismo verde que un helper correcto. Este assert es lo
    // único que prueba que el reloj está donde creemos y que el defecto que
    // estamos arreglando está vivo en este escenario.
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('hoyISO devuelve el día de Argentina, no el de UTC', () => {
    expect(hoyISO()).toBe('2026-08-31')
  })

  it('primerDiaDelMesISO no se pasa al mes siguiente', () => {
    // El patrón viejo (`new Date(y, m, 1)`) leería el mes con la zona del
    // navegador. Con el proceso en UTC eso da septiembre, y el reporte
    // arrancaría el 01-09 sobre datos de agosto.
    expect(primerDiaDelMesISO()).toBe('2026-08-01')
  })

  it('enDiasISO parte del día de Argentina', () => {
    expect(enDiasISO(30)).toBe('2026-09-30')
    expect(enDiasISO(1)).toBe('2026-09-01')
    expect(enDiasISO(0)).toBe('2026-08-31')
    expect(enDiasISO(-1)).toBe('2026-08-30')
  })
})

describe('la zona es fija, no la del navegador', () => {
  const TZ_ORIGINAL = process.env.TZ

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOCHE_DE_FIN_DE_MES)
  })
  afterEach(() => {
    process.env.TZ = TZ_ORIGINAL
    vi.useRealTimers()
  })

  // 🔴 Ésta es la propiedad que un `getFullYear()/getMonth()/getDate()` NO
  // cumple: aquél arregla el corrimiento de las 21:00 sólo para quien tenga la
  // máquina en Argentina. Acá el mismo instante se lee desde husos muy
  // separados —incluido uno de offset positivo, donde el patrón viejo falla en
  // la dirección contraria— y tiene que dar siempre el día de Argentina.
  it.each(['UTC', 'Europe/Madrid', 'Pacific/Auckland', 'America/Los_Angeles'])(
    'con el proceso en %s sigue dando el 31-08', (tz) => {
      process.env.TZ = tz
      expect(hoyISO()).toBe('2026-08-31')
      expect(primerDiaDelMesISO()).toBe('2026-08-01')
    },
  )

  it('el control: la zona del proceso SÍ cambia lo que hace Date', () => {
    // Sin este assert, el `it.each` de arriba podría estar pasando porque
    // `process.env.TZ` no tiene ningún efecto en runtime —en cuyo caso los
    // cuatro casos serían el mismo caso repetido cuatro veces— en vez de
    // porque el helper sea inmune a la zona.
    process.env.TZ = 'Pacific/Auckland'
    const enAuckland = new Date().getDate()
    process.env.TZ = 'America/Los_Angeles'
    const enLosAngeles = new Date().getDate()
    expect(enAuckland).not.toBe(enLosAngeles)
  })
})

describe('aritmética de días sobre el calendario', () => {
  it('cruza fin de mes y fin de año', () => {
    expect(sumarDiasISO('2026-08-31', 1)).toBe('2026-09-01')
    expect(sumarDiasISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDiasISO('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('cuenta bien un año bisiesto', () => {
    expect(sumarDiasISO('2028-02-28', 1)).toBe('2028-02-29')
    expect(sumarDiasISO('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('no se corre de día en los saltos de horario de verano de otros husos', () => {
    // 29-03-2026: cambio de hora en Europa. Con la aritmética hecha sobre una
    // fecha local, sumar un día acá se corre una hora — y una hora alcanza
    // para caer del otro lado de la medianoche.
    const TZ_ORIGINAL = process.env.TZ
    process.env.TZ = 'Europe/Madrid'
    try {
      expect(sumarDiasISO('2026-03-28', 1)).toBe('2026-03-29')
      expect(sumarDiasISO('2026-03-29', 1)).toBe('2026-03-30')
    } finally {
      process.env.TZ = TZ_ORIGINAL
    }
  })
})

// Las fechas para mostrar, del kit (0.146.0, ADR-058): `fecha`, `fechaHora`, `hora`, `horaConSegundos` y las dos de texto sin zona.
//
// Hasta 0.145.0 cada producto traía las suyas en `@/lib/fechas` (cinco de los ocho eran el mismo código con otro comentario) y el kit se las pedía prestadas.
// Los casos de abajo son los de la copia de Contalibra —la que tienen cinco productos— más lo que las otras tres variantes hacían distinto (LibraClub, LibraCargo
// y LibraDesk), que es lo que esta suite fija para que el kit y los productos que migren digan lo mismo.
//
// 🔴 El proceso corre en varios husos (`process.env.TZ`) a propósito: un formateador que dependa de la zona del navegador pasa todos los casos en la máquina de quien lo escribe
// (Argentina) y falla en la de quien viaja. Y los instantes están elegidos cerca de la medianoche, donde `toISOString()` y la hora de Argentina no coinciden.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { fecha, fechaDeTexto, fechaHora, fechaHoraDeTexto, hora, horaConSegundos } from '../src/fechas'

const TZ_ORIGINAL = process.env.TZ
afterEach(() => { process.env.TZ = TZ_ORIGINAL })

/** 22:30 del 21-08-2026 en Argentina = 01:30 UTC del 22. */
const NOCHE = '2026-08-22T01:30:00Z'

describe('fecha', () => {
  it('un `aaaa-mm-dd` es un día del calendario: se reordena, sin pasar por Date', () => {
    expect(fecha('2026-08-22')).toBe('22-08-2026')
    expect(fecha('2026-01-05')).toBe('05-01-2026')
  })

  it.each(['UTC', 'Europe/Madrid', 'Pacific/Auckland', 'America/Los_Angeles'])('🔴 con el proceso en %s un `aaaa-mm-dd` NO se corre de día', (tz) => {
    process.env.TZ = tz
    // `new Date('2026-08-22')` es medianoche UTC: en Los Angeles (y en Argentina) son las del 21.
    expect(fecha('2026-08-22')).toBe('22-08-2026')
    expect(fecha('2026-08-22 23:59:59')).toBe('22-08-2026')
  })

  it('el control — un `Date` de verdad sí cambia de día según la zona (el caso anterior mide algo)', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(new Date('2026-08-22').getDate()).toBe(21)
    process.env.TZ = 'UTC'
    expect(new Date('2026-08-22').getDate()).toBe(22)
  })

  it('un timestamp sin zona (lo que guarda el backend) se reordena: es hora de Argentina', () => {
    expect(fecha('2026-08-22 10:30:00')).toBe('22-08-2026')
    expect(fecha('2026-08-22T10:30:00')).toBe('22-08-2026')
    expect(fecha('2026-08-22T23:30')).toBe('22-08-2026')
  })

  it.each(['UTC', 'Europe/Madrid', 'Pacific/Auckland', 'America/Los_Angeles'])('🔴 un ISO con zona se convierte a Argentina, en %s', (tz) => {
    process.env.TZ = tz
    // 01:30Z del 22 es el 21 a las 22:30 en Argentina: reordenar el texto diría 22.
    expect(fecha(NOCHE)).toBe('21-08-2026')
    expect(fecha('2026-08-22T01:30:00-03:00')).toBe('22-08-2026')
    expect(fecha('2026-08-22T01:30:00+0000')).toBe('21-08-2026')
  })

  it('acepta un `Date` y lo escribe en hora de Argentina, con guiones', () => {
    process.env.TZ = 'Pacific/Auckland'
    expect(fecha(new Date(NOCHE))).toBe('21-08-2026')
  })

  it('🔴 con guiones y no con barras: `es-AR` a secas escribe 21/08/2026', () => {
    expect(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(NOCHE))).toContain('/')
    expect(fecha(new Date(NOCHE))).not.toContain('/')
  })

  it('vacío para lo que no hay, y lo que no es una fecha se devuelve como vino', () => {
    expect(fecha(null)).toBe('')
    expect(fecha(undefined)).toBe('')
    expect(fecha('')).toBe('')
    expect(fecha(new Date('no es una fecha'))).toBe('')
    expect(fecha('pendiente')).toBe('pendiente')
    expect(fecha('22/08/2026')).toBe('22/08/2026')
  })
})

describe('fechaHora', () => {
  it('un timestamp sin zona: fecha y hora reordenadas, reloj de 24 h', () => {
    expect(fechaHora('2026-08-22 10:30:00')).toBe('22-08-2026 10:30')
    expect(fechaHora('2026-08-22T18:05')).toBe('22-08-2026 18:05')
    expect(fechaHora('2026-08-22 00:05:59')).toBe('22-08-2026 00:05')
  })

  it.each(['UTC', 'Europe/Madrid', 'Pacific/Auckland', 'America/Los_Angeles'])('🔴 un ISO con zona se convierte a hora de Argentina, en %s', (tz) => {
    process.env.TZ = tz
    expect(fechaHora(NOCHE)).toBe('21-08-2026 22:30')
    expect(fechaHora('2026-08-22T01:30:00-03:00')).toBe('22-08-2026 01:30')
  })

  it('🔴 la medianoche es 00:05 y no 24:05', () => {
    // 00:05 del 01-09 en Argentina = 03:05Z.
    expect(fechaHora('2026-09-01T03:05:00Z')).toBe('01-09-2026 00:05')
    expect(fechaHora(new Date('2026-09-01T03:05:00Z'))).toBe('01-09-2026 00:05')
  })

  it('un valor sin hora sale sólo como fecha, y lo vacío o roto, como en `fecha`', () => {
    expect(fechaHora('2026-08-22')).toBe('22-08-2026')
    expect(fechaHora(null)).toBe('')
    expect(fechaHora(new Date('x'))).toBe('')
    expect(fechaHora('pendiente')).toBe('pendiente')
  })
})

describe('hora', () => {
  it('sólo HH:MM, de un texto sin zona o de un instante', () => {
    expect(hora('2026-08-22 10:30:45')).toBe('10:30')
    expect(hora('2026-08-22T08:05')).toBe('08:05')
    expect(hora(NOCHE)).toBe('22:30')
    expect(hora(new Date(NOCHE))).toBe('22:30')
  })

  it('vacío si el valor no trae hora', () => {
    expect(hora('2026-08-22')).toBe('')
    expect(hora(null)).toBe('')
    expect(hora('pendiente')).toBe('')
  })
})

describe('horaConSegundos', () => {
  it('HH:MM:SS de un texto sin zona; sin segundos, HH:MM', () => {
    expect(horaConSegundos('2026-08-22 10:30:45')).toBe('10:30:45')
    expect(horaConSegundos('2026-08-22T10:30:45.123456')).toBe('10:30:45')
    expect(horaConSegundos('2026-08-22 10:30')).toBe('10:30')
  })

  it('🔴 un ISO con zona o un Date se convierten a Argentina (el copiado de los productos mostraba la hora UTC, o nada)', () => {
    process.env.TZ = 'Europe/Madrid'
    expect(horaConSegundos('2026-08-22T01:30:15Z')).toBe('22:30:15')
    expect(horaConSegundos(new Date('2026-09-01T03:05:09Z'))).toBe('00:05:09')
  })

  it('vacío si no hay hora', () => {
    expect(horaConSegundos('2026-08-22')).toBe('')
    expect(horaConSegundos(null)).toBe('')
    expect(horaConSegundos('')).toBe('')
    expect(horaConSegundos(new Date('x'))).toBe('')
  })
})

describe('fechaDeTexto y fechaHoraDeTexto (la variante de LibraCargo: se reordena, nunca se convierte)', () => {
  it('🔴 ignoran la zona: el reloj de pared del servidor no se corre de día', () => {
    // El `mtime` de una copia de backup es hora de pared del servidor. Aunque llegue con un sufijo, `fecha`/`fechaHora` lo convertirían.
    expect(fechaHoraDeTexto('2026-08-22 01:30:00Z')).toBe('22-08-2026 01:30')
    expect(fechaDeTexto('2026-08-22T01:30:00Z')).toBe('22-08-2026')
    // El control: la otra, con el mismo valor, convierte.
    expect(fechaHora('2026-08-22 01:30:00Z')).toBe('21-08-2026 22:30')
  })

  it.each(['UTC', 'Pacific/Auckland', 'America/Los_Angeles'])('no dependen de la zona del proceso (%s)', (tz) => {
    process.env.TZ = tz
    expect(fechaHoraDeTexto('2026-08-22 23:59:59')).toBe('22-08-2026 23:59')
    expect(fechaDeTexto('2026-08-22')).toBe('22-08-2026')
  })

  it('sin hora, `fechaHoraDeTexto` sale como `fechaDeTexto`; lo que no es una fecha, como vino; null y undefined, vacío', () => {
    expect(fechaHoraDeTexto('2026-08-22')).toBe('22-08-2026')
    expect(fechaHoraDeTexto('pendiente')).toBe('pendiente')
    expect(fechaDeTexto('pendiente')).toBe('pendiente')
    expect(fechaDeTexto(null)).toBe('')
    expect(fechaHoraDeTexto(undefined)).toBe('')
  })
})

describe('el kit usa sus fechas, no las del consumidor', () => {
  // Desde 0.146.0 ningún módulo del kit importa `@/lib/fechas`: un producto ya no tiene que exportarlas para que el kit compile ni para que escriba una fecha.
  const SRC = resolve(__dirname, '..', 'src')
  function fuentes(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fuentes(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []))
  }

  it('🔴 ningún fuente importa `@/lib/fechas`', () => {
    const archivos = fuentes(SRC)
    expect(archivos.length).toBeGreaterThan(50) // el control: el barrido vio los fuentes
    const importan = archivos.filter((f) => /from\s+['"]@\/lib\/fechas['"]/.test(readFileSync(f, 'utf8')))
    expect(importan).toEqual([])
  })
})

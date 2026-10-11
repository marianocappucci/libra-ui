// `formatos` es la única definición de cómo se escriben la plata y las cantidades en toda la familia (ADR-050).
// Antes eran veinticinco copias de `formatCurrency` y cuatro de `numero`: cada una podía dejar de coincidir con las
// otras sin que ningún test lo notara (así salían las cantidades de Compras con el «.0» del motor).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as formatos from '../src/formatos'
import * as tipos from '../src/comercio/tipos'
import { formatoCantidad, formatoMoneda } from '../src/formatos'

describe('formatoCantidad', () => {
  it('un entero se muestra sin decimales', () => {
    expect(formatoCantidad(6)).toBe('6')
    expect(formatoCantidad(0)).toBe('0')
  })

  it('una fracción lleva coma decimal, no punto', () => {
    expect(formatoCantidad(1.5)).toBe('1,5')
    expect(formatoCantidad(0.25)).toBe('0,25')
  })

  it('los miles llevan punto', () => {
    expect(formatoCantidad(1250)).toBe('1.250')
    expect(formatoCantidad(1234567.5)).toBe('1.234.567,5')
  })

  it('el texto decimal del motor pierde los ceros que sobran (el «.0» de Compras)', () => {
    expect(formatoCantidad('6.0')).toBe('6')
    expect(formatoCantidad('1.50')).toBe('1,5')
    expect(formatoCantidad('1250.000')).toBe('1.250')
    expect(formatoCantidad('0.000400')).toBe('0,0004')
  })

  it('no recorta decimales: una cantidad de 6 decimales no se muestra como 0', () => {
    expect(formatoCantidad('0.000123')).toBe('0,000123')
    expect(formatoCantidad(0.0004)).toBe('0,0004')
  })

  it('un valor negativo conserva el signo', () => {
    expect(formatoCantidad(-3)).toBe('-3')
    expect(formatoCantidad('-1.50')).toBe('-1,5')
  })

  it('lo que no es un número se devuelve como vino, sin «NaN»', () => {
    expect(formatoCantidad('abc')).toBe('abc')
    expect(formatoCantidad(Number.NaN)).toBe('NaN')
    expect(formatoCantidad(Infinity)).toBe('Infinity')
    expect(formatoCantidad('')).toBe('0') // Number('') es 0: el texto vacío no es un dato raro, es cero
  })
})

describe('formatoMoneda', () => {
  it('pesos con punto de miles, coma decimal y dos decimales', () => {
    expect(formatoMoneda(1234.5)).toMatch(/^\$\s1\.234,50$/)
    expect(formatoMoneda(0)).toMatch(/^\$\s0,00$/)
  })

  it('un importe negativo conserva el signo', () => {
    expect(formatoMoneda(-1500)).toMatch(/^-\$\s1\.500,00$/)
  })
})

describe('compatibilidad con comercio/tipos', () => {
  it('🔴 comercio/tipos sigue exportando las dos funciones: los productos las importan de ahí', () => {
    expect(tipos.formatoMoneda).toBe(formatos.formatoMoneda)
    expect(tipos.formatoCantidad).toBe(formatos.formatoCantidad)
    expect(tipos.formatoCantidad('6.0')).toBe('6')
  })
})

// El control contra la vuelta de las copias: una pantalla nueva que arma su propio `Intl.NumberFormat` de plata o de
// cantidades vuelve a abrir el problema que cerró el ADR-050.
describe('no quedan copias locales', () => {
  const SRC = resolve(__dirname, '..', 'src')

  function fuentes(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? fuentes(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
    )
  }

  // Dashboard muestra los pesos enteros (`maximumFractionDigits: 0`): no es una copia sino otro formato, y no pasa por acá.
  const CON_FORMATO_PROPIO = new Set(['comercio/Dashboard.tsx'])

  function dondeAparece(patron: RegExp): string[] {
    return fuentes(SRC)
      .map((f) => relative(SRC, f))
      .filter((f) => f !== 'formatos.ts' && !CON_FORMATO_PROPIO.has(f))
      .filter((f) => patron.test(readFileSync(join(SRC, f), 'utf8')))
  }

  it('🔴 ninguna pantalla arma su propio formateador de pesos', () => {
    expect(dondeAparece(/style:\s*'currency'/)).toEqual([])
  })

  it('🔴 ninguna pantalla arma su propio formateador de cantidades con 10 decimales', () => {
    expect(dondeAparece(/maximumFractionDigits:\s*10\b/)).toEqual([])
  })

  it('el control — el guard sabe encontrar una copia', () => {
    // Si `fuentes` devolviera una lista vacía, los dos casos de arriba pasarían igual.
    expect(fuentes(SRC).length).toBeGreaterThan(50)
    expect(readFileSync(join(SRC, 'formatos.ts'), 'utf8')).toMatch(/style:\s*'currency'/)
  })
})

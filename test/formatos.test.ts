// `formatos` es la única definición de cómo se escriben la plata y las cantidades en toda la familia (ADR-050).
// Antes eran veinticinco copias de `formatCurrency` y cuatro de `numero`: cada una podía dejar de coincidir con las
// otras sin que ningún test lo notara (así salían las cantidades de Compras con el «.0» del motor).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as formatos from '../src/formatos'
import * as tipos from '../src/comercio/tipos'
import { formatoCantidad, formatoMoneda, formatoMonedaEntera } from '../src/formatos'

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

describe('formatoMonedaEntera', () => {
  it('pesos con punto de miles y sin centavos', () => {
    expect(formatoMonedaEntera(1234)).toMatch(/^\$\s1\.234$/)
    expect(formatoMonedaEntera(0)).toMatch(/^\$\s0$/)
    expect(formatoMonedaEntera(1234567)).toMatch(/^\$\s1\.234\.567$/)
  })

  it('redondea los centavos, no los trunca', () => {
    expect(formatoMonedaEntera(1234.49)).toMatch(/^\$\s1\.234$/)
    expect(formatoMonedaEntera(1234.5)).toMatch(/^\$\s1\.235$/)
    expect(formatoMonedaEntera(0.4)).toMatch(/^\$\s0$/)
  })

  it('un importe negativo conserva el signo', () => {
    expect(formatoMonedaEntera(-1500)).toMatch(/^-\$\s1\.500$/)
  })

  it('🔴 es lo que mostraba el Dashboard: ARS con maximumFractionDigits 0, mismo texto exacto', () => {
    // La función local que reemplaza. Si alguien toca las opciones de `formatos.ts`, esto avisa que el Dashboard cambió.
    const anterior = (v: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v)
    for (const v of [0, 1, 999, 1234, 1234.49, 1234.5, -1500, 1234567.89, 0.4]) {
      expect(formatoMonedaEntera(v)).toBe(anterior(v))
    }
  })

  it('no muestra centavos aunque formatoMoneda sí', () => {
    expect(formatoMoneda(1234.5)).toMatch(/,50$/)
    expect(formatoMonedaEntera(1234.5)).not.toMatch(/,/)
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

  function dondeAparece(patron: RegExp): string[] {
    return fuentes(SRC)
      .map((f) => relative(SRC, f))
      .filter((f) => f !== 'formatos.ts')
      .filter((f) => patron.test(readFileSync(join(SRC, f), 'utf8')))
  }

  it('🔴 ninguna pantalla arma su propio formateador de pesos', () => {
    expect(dondeAparece(/style:\s*'currency'/)).toEqual([])
  })

  it('🔴 ninguna pantalla arma su propio formateador de pesos enteros', () => {
    // Cubre también el que no pone `style: 'currency'` en el mismo literal (`toLocaleString`, o las opciones en una constante).
    expect(dondeAparece(/maximumFractionDigits:\s*0\b/)).toEqual([])
  })

  it('🔴 ninguna pantalla arma su propio formateador de cantidades con 10 decimales', () => {
    expect(dondeAparece(/maximumFractionDigits:\s*10\b/)).toEqual([])
  })

  // Las formas sueltas de formatear un número: `new Intl.NumberFormat(…)` o `valor.toLocaleString(…)` fuera de `formatos.ts`.
  // Es lo que hacían las copias de Reposición, Vencimientos y reposicion-ordenes (y la de `Productos`): no usaban
  // `maximumFractionDigits: 10` a secas, pero eran lo mismo. Las fechas (`dateStyle`/`timeStyle`) no son números.
  // Cada excepción dice por qué es legítima y cuántas veces aparece: si aparece una más, o la razón deja de valer, falla.
  const SUELTAS = /Intl\.NumberFormat|\.toLocaleString\(/
  const EXCEPCIONES: Record<string, { veces: number; razon: string }> = {
    'CampoArchivo.tsx': { veces: 1, razon: 'tamaño de archivo: 0 decimales en bytes y 1 en KB/MB/GB' },
    'TarjetaIndicador.tsx': { veces: 2, razon: 'porcentajes e indicadores con un decimal a propósito (con y sin signo)' },
    'comercio/Margen.tsx': { veces: 1, razon: 'porcentaje de margen con un decimal' },
    'comercio/Compras.tsx': { veces: 1, razon: 'monto sin símbolo con 2 decimales fijos (`money`); ver ADR-050, «lo que no cubre»' },
    'comercio/CompraDetalle.tsx': { veces: 1, razon: 'monto sin símbolo con 2 decimales fijos (`money`); ver ADR-050, «lo que no cubre»' },
    'comercio/Productos.tsx': { veces: 1, razon: '`textoDecimal`: serializa a un decimal en-US sin separadores para el campo, no es texto de pantalla' },
  }

  function sueltas(): Record<string, number> {
    const hallado: Record<string, number> = {}
    for (const f of fuentes(SRC)) {
      const rel = relative(SRC, f)
      if (rel === 'formatos.ts') continue
      const lineas = readFileSync(f, 'utf8').split('\n').filter((l) => {
        const t = l.trim()
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && SUELTAS.test(l) && !/dateStyle|timeStyle/.test(l)
      })
      if (lineas.length) hallado[rel] = lineas.length
    }
    return hallado
  }

  it('🔴 ninguna pantalla formatea números por su cuenta (`Intl.NumberFormat` o `toLocaleString`) salvo las excepciones justificadas', () => {
    const esperado = Object.fromEntries(Object.entries(EXCEPCIONES).map(([f, e]) => [f, e.veces]))
    expect(sueltas()).toEqual(esperado)
  })

  it('el guard de formas sueltas reconoce las que usaban las copias (y no confunde las fechas)', () => {
    expect(SUELTAS.test("new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 })")).toBe(true)
    expect(SUELTAS.test("valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })")).toBe(true)
    expect(SUELTAS.test("MAX.toLocaleString('es-AR')")).toBe(true)
    expect(SUELTAS.test('formatoCantidad(valor)')).toBe(false)
  })

  it('el control — el guard sabe encontrar una copia', () => {
    // Si `fuentes` devolviera una lista vacía, los dos casos de arriba pasarían igual.
    expect(fuentes(SRC).length).toBeGreaterThan(50)
    const propio = readFileSync(join(SRC, 'formatos.ts'), 'utf8')
    expect(propio).toMatch(/style:\s*'currency'/)
    expect(propio).toMatch(/maximumFractionDigits:\s*0\b/)
  })
})

/** La factura de crédito electrónica MiPyME en la configuración de ARCA: las cuentas donde se cobra, su validación y
 *  la ayuda para elegir la modalidad de transmisión. Aparte de `arca.tsx` para que ese archivo exporte sólo componentes. */

/** Una cuenta para cobrar las facturas de crédito: el CBU (22 dígitos), su alias bancario (opcional) y un nombre para
 *  reconocerla. Al facturar se elige por alias o por CBU; a ARCA va siempre el CBU. */
export type CbuFce = { cbu: string; alias: string; etiqueta: string }

/** Las dos modalidades de transmisión de una FCE que acepta ARCA. */
export const MODALIDADES_FCE = [
  { valor: 'SCA', etiqueta: 'SCA — Sistema de Circulación Abierta' },
  { valor: 'ADC', etiqueta: 'ADC — Agente de Depósito Colectivo' },
] as const


/** El CBU como lo guarda el motor: sólo los dígitos. Se aceptan los espacios y guiones de un CBU copiado. */
export function cbuLimpio(texto: string): string {
  return texto.replace(/[\s-]/g, '')
}

/** Qué tiene de malo un CBU escrito, o `null` si sirve. */
export function problemaDelCbu(texto: string): string | null {
  const cbu = cbuLimpio(texto)
  if (!cbu) return 'Falta el CBU.'
  if (!/^\d+$/.test(cbu)) return 'El CBU lleva sólo números.'
  if (cbu.length !== 22) return `El CBU tiene 22 dígitos (hay ${cbu.length}).`
  return null
}

/** El alias como lo guarda el motor: sin espacios y en minúsculas. */
export function aliasLimpio(texto: string): string {
  return texto.trim().toLowerCase()
}

/** Qué tiene de malo un alias bancario, o `null` si sirve (vacío también: es opcional). */
export function problemaDelAlias(texto: string): string | null {
  const alias = aliasLimpio(texto)
  if (!alias) return null
  if (!/^[a-z0-9.-]+$/.test(alias)) return 'El alias lleva sólo letras, números, puntos y guiones.'
  if (alias.length < 6 || alias.length > 20) return `El alias tiene de 6 a 20 caracteres (hay ${alias.length}).`
  return null
}

/** El primer problema de la lista (con el número de fila), o `null` si se puede guardar. Una lista vacía sirve: es
 *  «no emito FCE». */
export function problemaDeLosCbus(lista: CbuFce[]): string | null {
  const vistos = new Set<string>()
  const aliasVistos = new Set<string>()
  for (const [i, c] of lista.entries()) {
    const problema = problemaDelCbu(c.cbu) ?? problemaDelAlias(c.alias)
    if (problema) return `CBU ${i + 1}: ${problema}`
    const cbu = cbuLimpio(c.cbu)
    if (vistos.has(cbu)) return `CBU ${i + 1}: está repetido.`
    vistos.add(cbu)
    const alias = aliasLimpio(c.alias)
    if (alias && aliasVistos.has(alias)) return `CBU ${i + 1}: el alias está repetido.`
    if (alias) aliasVistos.add(alias)
  }
  return null
}

/** Cuándo conviene cada modalidad, para quien la elige (texto del humano, 2026-10-09). */
export const AYUDA_MODALIDAD_FCE = {
  SCA: 'Elegí SCA si vas a operar, ceder o descontar el documento directamente a través de bancos.',
  ADC: 'Elegí ADC si vas a operar o descontar la factura mediante el Mercado de Valores (Bolsa).',
} as const

/** Cómo se reconoce una cuenta en el resumen: su nombre, si no su alias y, a falta de los dos, los últimos dígitos del CBU. */
function nombreDeLaCuenta(c: CbuFce): string {
  const cbu = cbuLimpio(c.cbu)
  return c.etiqueta.trim() || aliasLimpio(c.alias) || (cbu ? `CBU …${cbu.slice(-4)}` : 'sin datos')
}

/** El resumen de una línea de la factura de crédito, para mostrarlo con el editor cerrado: cuántas cuentas hay, cuál es la
 *  predeterminada y la modalidad de transmisión. «Sin cargar» cuando no hay ni una cosa ni la otra. */
export function resumenDeLaFce(cbus: CbuFce[], predeterminado: number, transmision: string): string {
  if (cbus.length === 0 && !transmision) return 'Sin cargar'
  const partes = [cbus.length === 0 ? 'Sin cuentas' : `${cbus.length} ${cbus.length === 1 ? 'cuenta' : 'cuentas'}`]
  const cuenta = cbus[predeterminado]
  if (cuenta) partes.push(`predeterminada: ${nombreDeLaCuenta(cuenta)}`)
  partes.push(transmision || 'sin modalidad')
  return partes.join(' · ')
}

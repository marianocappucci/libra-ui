// `cn` es la que resuelve los conflictos de clases de Tailwind en los 6
// productos. Parece trivial pero es la que hace que un `className` del
// consumidor le gane al del componente -- comportamiento del que dependen
// PasswordInput, data-table y Layout.
import { describe, expect, it } from 'vitest'
import { cn } from '../src/utils'

describe('cn', () => {
  it('junta clases sueltas', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('descarta condicionales falsas', () => {
    expect(cn('base', false && 'off', undefined, null, 'on')).toBe('base on')
  })

  it('acepta objetos y arrays (la forma de clsx)', () => {
    expect(cn(['a', { b: true, c: false }])).toBe('a b')
  })

  it('ante clases en conflicto gana la ultima', () => {
    // Es la razon de usar tailwind-merge y no una simple concatenacion:
    // con clsx solo, quedarian las dos y ganaria la del CSS, no la
    // intencion de quien escribio el componente.
    expect(cn('pr-9', 'pr-20')).toBe('pr-20')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
  })

  it('no toca clases que no compiten entre si', () => {
    expect(cn('pr-9', 'mt-4')).toBe('pr-9 mt-4')
  })

  it('sin argumentos devuelve vacio', () => {
    expect(cn()).toBe('')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CLAVE_DE_MODO, aplicarModo, fijarModo, iniciarModo, leerModo, suscribirseAlModo } from '../src/modo'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
})

describe('modo claro / oscuro', () => {
  it('sin nada guardado es claro, como hasta ahora', () => {
    expect(leerModo()).toBe('claro')
    iniciarModo()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('fijar oscuro pone la clase `dark`, guarda y avisa; volver a claro la saca', () => {
    const oyente = vi.fn()
    const baja = suscribirseAlModo(oyente)
    fijarModo('oscuro')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(window.localStorage.getItem(CLAVE_DE_MODO)).toBe('oscuro')
    expect(oyente).toHaveBeenCalledWith('oscuro')
    fijarModo('claro')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    baja()
  })

  it('al arrancar se aplica el modo guardado; un valor roto se trata como claro', () => {
    window.localStorage.setItem(CLAVE_DE_MODO, 'oscuro')
    iniciarModo()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    window.localStorage.setItem(CLAVE_DE_MODO, 'violeta')
    expect(leerModo()).toBe('claro')
  })

  it('`sistema` sigue la preferencia del sistema operativo', () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never
    aplicarModo('sistema')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    window.matchMedia = original
  })
})

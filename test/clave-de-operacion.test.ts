// La clave de operación (`clave_operacion`) identifica un intento que se puede reintentar sin duplicar. `crypto.randomUUID` sólo existe en
// contextos seguros (https o localhost): un producto servido por http en la red local cae a `getRandomValues`. Se prueban las dos ramas.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nuevaClaveDeOperacion } from '../src/comercio/clave-de-operacion'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('nuevaClaveDeOperacion', () => {
  it('devuelve un UUID v4 y distinto cada vez', () => {
    const a = nuevaClaveDeOperacion()
    const b = nuevaClaveDeOperacion()
    expect(a).toMatch(UUID_V4)
    expect(b).toMatch(UUID_V4)
    expect(a).not.toBe(b)
  })

  it('usa randomUUID cuando existe', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555')
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() })
    expect(nuevaClaveDeOperacion()).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('🔴 en un contexto no seguro (sin randomUUID) cae a getRandomValues y sigue siendo un UUID v4', () => {
    const getRandomValues = vi.fn((b: Uint8Array) => {
      b.fill(0xff) // el peor caso: los bits de versión y variante se tienen que forzar igual
      return b
    })
    vi.stubGlobal('crypto', { getRandomValues })
    const clave = nuevaClaveDeOperacion()
    expect(getRandomValues).toHaveBeenCalledTimes(1)
    expect(clave).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(clave).toMatch(UUID_V4)
  })

  it('sin randomUUID, dos claves seguidas son distintas', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(b: T) => real.getRandomValues(b) })
    const a = nuevaClaveDeOperacion()
    const b = nuevaClaveDeOperacion()
    expect(a).toMatch(UUID_V4)
    expect(a).not.toBe(b)
  })
})

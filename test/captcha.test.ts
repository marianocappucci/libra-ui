// La sonda del captcha (`src/captcha.ts`): cuándo una respuesta de `GET /auth/captcha` quiere decir «hay que resolver un
// desafío». El cableado en el login y en «olvidé mi contraseña» está en `Login.test.tsx` y `PasswordReset.test.tsx`; acá la
// regla sola, sin DOM (v0.177.0, ADR-091).
import { describe, expect, it } from 'vitest'
import { captchaRequerido, esDesafio } from '../src/captcha'

const DESAFIO = { parameters: { algorithm: 'PBKDF2/SHA-256' }, signature: 'firma' }

describe('captchaRequerido', () => {
  it('un desafío lo pide', () => {
    expect(esDesafio(DESAFIO)).toBe(true)
    expect(captchaRequerido(DESAFIO)).toBe(true)
  })

  it.each([
    ['🔴 `{ requerido: false }`, lo que contesta un nodo de LibraEdge', { requerido: false }],
    ['`requerido: false` manda aunque venga la forma de un desafío', { ...DESAFIO, requerido: false }],
    ['un JSON sin la forma de un desafío', { totp: true }],
    ['un texto (el index.html del catch-all)', '<!doctype html>'],
    ['null', null],
    ['undefined', undefined],
  ])('%s no lo pide', (_caso, info) => {
    expect(captchaRequerido(info)).toBe(false)
  })

  it('`requerido` que no es el booleano false no apaga el desafío', () => {
    // Sólo `false` es la señal; un `"false"` o un `0` vienen de un cuerpo que no es el contrato.
    expect(captchaRequerido({ ...DESAFIO, requerido: 'false' })).toBe(true)
    expect(captchaRequerido({ ...DESAFIO, requerido: true })).toBe(true)
  })
})

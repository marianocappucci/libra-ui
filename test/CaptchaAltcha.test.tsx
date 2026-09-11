// El envoltorio del widget de ALTCHA. El web component de verdad no corre en
// jsdom (necesita workers y WebCrypto), así que se mockean sus módulos y se
// prueba lo que es de ESTE paquete: que registre el worker del algoritmo que
// emite libraauth, que le pase la ruta del desafío, y que traduzca los
// cambios de estado a "hay solución" o "no hay".
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { registrar, WorkerFalso } = vi.hoisted(() => {
  class WorkerFalso {}
  const registrar = vi.fn()
  ;(globalThis as unknown as { $altcha: unknown }).$altcha = { algorithms: { set: registrar } }
  return { registrar, WorkerFalso }
})

vi.mock('altcha/external', () => ({}))
vi.mock('altcha/altcha.css', () => ({}))
vi.mock('altcha/i18n/es-419', () => ({}))
vi.mock('altcha/workers/pbkdf2?worker', () => ({ default: WorkerFalso }))

import CaptchaAltcha from '../src/CaptchaAltcha'

function widget(container: HTMLElement) {
  const el = container.querySelector('altcha-widget')
  if (!el) throw new Error('no se dibujó el widget')
  return el
}

function cambiar(el: Element, detail: unknown) {
  el.dispatchEvent(new CustomEvent('statechange', { detail }))
}

describe('el widget de ALTCHA', () => {
  // `registrar` se llama una sola vez, al importar el módulo: el `restoreAllMocks`
  // del setup no lo borra, pero se lee su historial antes de cualquier otro test.
  it('registra el worker de PBKDF2/SHA-256, el único que emite libraauth', () => {
    expect(registrar).toHaveBeenCalledWith('PBKDF2/SHA-256', expect.any(Function))
    const fabrica = registrar.mock.calls[0][1] as () => unknown
    expect(fabrica()).toBeInstanceOf(WorkerFalso)
  })

  let onCambio: ReturnType<typeof vi.fn>
  beforeEach(() => { onCambio = vi.fn() })

  it('le pasa la ruta del desafío y lo pide en castellano, como casilla', () => {
    const { container } = render(<CaptchaAltcha challengeUrl="/auth/captcha" onCambio={onCambio} />)
    const el = widget(container)
    expect(el.getAttribute('challenge')).toBe('/auth/captcha')
    expect(el.getAttribute('language')).toBe('es-419')
    expect(el.getAttribute('type')).toBe('checkbox')
  })

  it('verificado con solución: la entrega', () => {
    const { container } = render(<CaptchaAltcha challengeUrl="/auth/captcha" onCambio={onCambio} />)
    cambiar(widget(container), { state: 'verified', payload: 'PAYLOAD' })
    expect(onCambio).toHaveBeenLastCalledWith('PAYLOAD')
  })

  it.each([
    ['vencido', { state: 'expired' }],
    ['verificando', { state: 'verifying' }],
    ['error', { state: 'error' }],
    ['verificado pero sin solución', { state: 'verified' }],
    ['sin detalle', undefined],
  ])('%s: no hay solución que mandar', (_nombre, detail) => {
    const { container } = render(<CaptchaAltcha challengeUrl="/auth/captcha" onCambio={onCambio} />)
    const el = widget(container)
    cambiar(el, { state: 'verified', payload: 'VIEJO' })
    cambiar(el, detail)
    // 🔴 Después de vencer, la solución anterior ya no vale: si quedara, el
    // login la mandaría y el servidor contestaría 400.
    expect(onCambio).toHaveBeenLastCalledWith('')
  })

  it('al desmontarse deja de escuchar', () => {
    const { container, unmount } = render(<CaptchaAltcha challengeUrl="/auth/captcha" onCambio={onCambio} />)
    const el = widget(container)
    unmount()
    cambiar(el, { state: 'verified', payload: 'TARDE' })
    expect(onCambio).not.toHaveBeenCalled()
  })
})

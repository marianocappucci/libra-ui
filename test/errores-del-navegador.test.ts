// `instalarReporteDeErrores` (ADR-053): los errores del navegador que nadie atrapó van a `POST /api/errores-cliente`.
// Lo que importa: que mande lo que debe, que NO mande lo que el backend ya registró (un `ApiError`), que no se
// repita ni se desborde, y que mandar nunca sea un error.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api-client'
import {
  ENDPOINT_ERRORES,
  MAX_REPORTES_POR_PESTANA,
  _reiniciarReporteDeErrores,
  instalarReporteDeErrores,
  reportarError,
} from '../src/errores-del-navegador'

let beacon: ReturnType<typeof vi.fn>

/** Lo que `sendBeacon` recibió, ya leído: `[endpoint, objeto]`. */
async function enviados() {
  return Promise.all(
    (beacon.mock.calls as [string, Blob][]).map(
      async ([url, blob]) => [url, JSON.parse(await blob.text()), blob.type] as const,
    ),
  )
}

function lanzaError(error: unknown, message = 'falló') {
  window.dispatchEvent(new ErrorEvent('error', { error, message, cancelable: true }))
}

/** Un error sin atrapar que NADIE escucha lo cuenta vitest como excepción de la corrida. Estos tests lo provocan a
 *  propósito (sin instalar, o ya desinstalado): se lo atrapa y se lo ignora, igual que haría el navegador. */
function conErroresSilenciados(fn: () => void) {
  const callar = (ev: Event) => ev.preventDefault()
  window.addEventListener('error', callar)
  try { fn() } finally { window.removeEventListener('error', callar) }
}

function rechazo(reason: unknown) {
  const ev = new Event('unhandledrejection') as Event & { reason: unknown }
  ev.reason = reason
  window.dispatchEvent(ev)
}

beforeEach(() => {
  beacon = vi.fn(() => true)
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true })
  window.history.replaceState({}, '', '/clientes/12?token=secreto#frag')
})

afterEach(() => {
  _reiniciarReporteDeErrores()
  vi.unstubAllGlobals()
})

describe('qué se manda', () => {
  it('🔴 un error sin atrapar va a /api/errores-cliente con mensaje, stack, página y release', async () => {
    instalarReporteDeErrores({ release: 'build-7' })
    lanzaError(new TypeError('x es undefined'))

    const [[url, cuerpo, tipoMime]] = await enviados()
    expect(url).toBe(ENDPOINT_ERRORES)
    expect(ENDPOINT_ERRORES).toBe('/api/errores-cliente')
    expect(tipoMime).toBe('application/json')
    expect(cuerpo).toMatchObject({ tipo: 'error', mensaje: 'x es undefined', release: 'build-7' })
    expect(cuerpo.stack).toContain('TypeError')
  })

  it('la página es la RUTA: nunca la query ni el fragmento', async () => {
    instalarReporteDeErrores()
    lanzaError(new Error('a'))
    const [[, cuerpo]] = await enviados()
    expect(cuerpo.pagina).toBe('/clientes/12')
    expect(JSON.stringify(cuerpo)).not.toContain('secreto')
  })

  it('una promesa rechazada sin atrapar se manda como unhandledrejection', async () => {
    instalarReporteDeErrores()
    rechazo(new Error('se cayó la promesa'))
    const [[, cuerpo]] = await enviados()
    expect(cuerpo).toMatchObject({ tipo: 'unhandledrejection', mensaje: 'se cayó la promesa' })
  })

  it('un rechazo que no es un Error (un string, un objeto) también se manda', async () => {
    instalarReporteDeErrores()
    rechazo('se rechazó con un texto')
    rechazo({ codigo: 7 })
    const todos = await enviados()
    expect(todos.map(([, c]) => c.mensaje)).toEqual(['se rechazó con un texto', '{"codigo":7}'])
  })

  it('sin release no manda la clave en null: simplemente no la trae', async () => {
    instalarReporteDeErrores()
    lanzaError(new Error('a'))
    const [[, cuerpo]] = await enviados()
    expect(cuerpo.release).toBeUndefined()
  })
})

describe('qué NO se manda', () => {
  it.each([400, 401, 403, 404, 422, 500, 503])('🔴 un ApiError %i no se reporta (el backend ya sabe)', (status) => {
    instalarReporteDeErrores()
    rechazo(new ApiError(status, 'algo', undefined, status >= 500 ? 'a1b2c3d4' : undefined))
    lanzaError(new ApiError(status, 'algo'))
    expect(beacon).not.toHaveBeenCalled()
  })

  it('el ruido del navegador no es un defecto de la aplicación', () => {
    instalarReporteDeErrores()
    lanzaError(new Error('ResizeObserver loop completed with undelivered notifications.'))
    lanzaError(new Error('ResizeObserver loop limit exceeded'))
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    window.dispatchEvent(new ErrorEvent('error', { message: '' }))
    expect(beacon).not.toHaveBeenCalled()
  })

  it('sin instalar, no manda nada (ni siquiera con reportarError)', () => {
    conErroresSilenciados(() => lanzaError(new Error('a')))
    reportarError(new Error('b'))
    expect(beacon).not.toHaveBeenCalled()
  })

  it('después de desinstalar, deja de escuchar', () => {
    const quitar = instalarReporteDeErrores()
    quitar()
    conErroresSilenciados(() => lanzaError(new Error('a')))
    expect(beacon).not.toHaveBeenCalled()
  })
})

describe('no se repite ni se desborda', () => {
  it('el mismo error (mismo mensaje y stack) se manda una sola vez', () => {
    instalarReporteDeErrores()
    const e = new Error('repetido')
    for (let i = 0; i < 5; i++) lanzaError(e)
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('el mismo mensaje con otro stack es otro error', () => {
    instalarReporteDeErrores()
    const a = new Error('igual')
    const b = new Error('igual')
    b.stack = 'Error: igual\n    at otroLado (otro.js:1:1)'
    lanzaError(a)
    lanzaError(b)
    expect(beacon).toHaveBeenCalledTimes(2)
  })

  it(`🔴 como máximo ${MAX_REPORTES_POR_PESTANA} por pestaña`, () => {
    expect(MAX_REPORTES_POR_PESTANA).toBe(10)
    instalarReporteDeErrores()
    for (let i = 0; i < 40; i++) lanzaError(new Error(`error distinto ${i}`))
    expect(beacon).toHaveBeenCalledTimes(10)
  })

  it('instalar dos veces no duplica los reportes y se queda con el último release', async () => {
    instalarReporteDeErrores({ release: 'uno' })
    instalarReporteDeErrores({ release: 'dos' })
    lanzaError(new Error('a'))
    const todos = await enviados()
    expect(todos).toHaveLength(1)
    expect(todos[0][1].release).toBe('dos')
  })

  it('el payload entra en los 4 KB del backend aunque el stack sea enorme', async () => {
    instalarReporteDeErrores({ release: 'r' })
    const e = new Error('m'.repeat(5000))
    e.stack = 'Error\n' + '    at funcion (archivo.js:1:1)\n'.repeat(2000)
    lanzaError(e)
    const [[, cuerpo]] = await enviados()
    expect(new TextEncoder().encode(JSON.stringify(cuerpo)).length).toBeLessThanOrEqual(4096)
    expect(cuerpo.mensaje.length).toBeLessThanOrEqual(500)
  })
})

describe('mandar nunca es un error', () => {
  it('sin sendBeacon cae a fetch con keepalive', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true, writable: true })
    const f = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', f)
    instalarReporteDeErrores()
    lanzaError(new Error('a'))
    expect(f).toHaveBeenCalledTimes(1)
    const [url, opciones] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/errores-cliente')
    expect(opciones).toMatchObject({ method: 'POST', keepalive: true })
  })

  it('si sendBeacon rechaza el envío (cola llena) cae a fetch', () => {
    beacon.mockReturnValue(false)
    const f = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', f)
    instalarReporteDeErrores()
    lanzaError(new Error('a'))
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('un sendBeacon que lanza no se propaga', () => {
    beacon.mockImplementation(() => { throw new Error('boom') })
    instalarReporteDeErrores()
    expect(() => lanzaError(new Error('a'))).not.toThrow()
  })

  it('un fetch que falla no genera un rechazo sin atrapar (que volvería a reportarse en bucle)', async () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true, writable: true })
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))))
    instalarReporteDeErrores()
    lanzaError(new Error('a'))
    await new Promise((r) => setTimeout(r, 0))
    expect(true).toBe(true) // si el rechazo escapara, vitest lo marcaría como error de la corrida
  })

  it('un error con un getter que lanza al leer el mensaje no rompe el escuchador', () => {
    instalarReporteDeErrores()
    const raro = { get message(): string { throw new Error('no me leas') } }
    expect(() => rechazo(raro)).not.toThrow()
  })
})

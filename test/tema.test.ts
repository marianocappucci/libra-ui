import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CLAVES_DE_TEMA, CLAVE_DE_CACHE_DEL_TEMA, COLORES_DE_TEMA, aplicarTema, cargarTema, contraste, luminancia, normalizarHex, textoSobre, validarTema,
} from '../src/tema'

describe('colores', () => {
  it('normalizarHex acepta #rgb y #rrggbb en cualquier mayúscula y rechaza el resto', () => {
    expect(normalizarHex('#ECFDF5')).toBe('#ecfdf5')
    expect(normalizarHex(' #0F0 ')).toBe('#00ff00')
    for (const malo of ['ecfdf5', '#ecfdf', '#gggggg', 'rgb(0,0,0)', '', null, 12, undefined]) {
      expect(normalizarHex(malo)).toBeNull()
    }
  })

  it('el contraste es el de WCAG: 21 entre negro y blanco, 1 entre iguales', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contraste('#336699', '#336699')).toBeCloseTo(1, 5)
    expect(luminancia('#ffffff')).toBeCloseTo(1, 5)
  })

  it('el texto sobre un fondo claro es oscuro y sobre uno oscuro es claro', () => {
    expect(textoSobre('#ecfdf5')).toBe('#0f172a')
    expect(textoSobre('#064e3b')).toBe('#ffffff')
  })
})

describe('el catálogo', () => {
  it('tiene una definición por clave, sin repetidos, con defectos válidos', () => {
    expect(COLORES_DE_TEMA.map((d) => d.clave).sort()).toEqual([...CLAVES_DE_TEMA].sort())
    for (const d of COLORES_DE_TEMA) {
      expect(normalizarHex(d.porDefecto)).toBe(d.porDefecto)
      expect(d.variable).toMatch(/^--/)
    }
  })

  it('el valor por defecto de cada color pasa su propia validación', () => {
    const defectos = Object.fromEntries(COLORES_DE_TEMA.map((d) => [d.clave, d.porDefecto]))
    const { tema, errores } = validarTema(defectos)
    expect(errores).toEqual({})
    expect(tema).toEqual(defectos)
  })
})

describe('validarTema', () => {
  it('normaliza y acepta un tema válido', () => {
    const { tema, errores } = validarTema({ menuActivoFondo: '#FDF2F8', menuActivoBorde: '#F9A8D4' })
    expect(errores).toEqual({})
    expect(tema).toEqual({ menuActivoFondo: '#fdf2f8', menuActivoBorde: '#f9a8d4' })
  })

  it('rechaza una clave desconocida y un valor que no es un color, sin lanzar', () => {
    const { tema, errores } = validarTema({ colorInventado: '#ffffff', menuActivoBorde: 'verde' })
    expect(tema).toEqual({})
    expect(errores.colorInventado).toMatch(/desconocido/)
    expect(errores.menuActivoBorde).toMatch(/no es un color/)
  })

  it('rechaza un fondo sobre el que ningún texto se lee (contraste < 4,5)', () => {
    const { tema, errores } = validarTema({ menuActivoFondo: '#7b7b7b' })
    expect(tema).toEqual({})
    expect(errores.menuActivoFondo).toMatch(/ningún texto se lee/)
  })

  it('una entrada que no es un objeto da un tema vacío', () => {
    for (const x of [null, undefined, 'x', 3, []]) expect(validarTema(x)).toEqual({ tema: {}, errores: {} })
  })
})

describe('aplicarTema', () => {
  it('fija el color y recalcula el texto; aplicar {} restaura los valores por defecto', () => {
    const el = document.createElement('div')
    aplicarTema({ menuActivoFondo: '#1e3a8a', menuActivoBorde: '#93c5fd' }, el)
    expect(el.style.getPropertyValue('--libra-menu-activo-fondo')).toBe('#1e3a8a')
    expect(el.style.getPropertyValue('--libra-menu-activo-borde')).toBe('#93c5fd')
    expect(el.style.getPropertyValue('--libra-menu-activo-texto')).toBe('#ffffff')
    aplicarTema({}, el)
    expect(el.style.getPropertyValue('--libra-menu-activo-fondo')).toBe('')
    expect(el.style.getPropertyValue('--libra-menu-activo-texto')).toBe('')
  })

  it('ignora lo inválido en vez de aplicarlo', () => {
    const el = document.createElement('div')
    aplicarTema({ menuActivoFondo: '#7b7b7b' }, el)
    expect(el.style.getPropertyValue('--libra-menu-activo-fondo')).toBe('')
  })
})

describe('cargarTema', () => {
  const FONDO = '--libra-menu-activo-fondo'
  const fondo = (el: HTMLElement) => el.style.getPropertyValue(FONDO)

  function respuesta(cuerpo: unknown, ok = true) {
    return Promise.resolve({ ok, json: () => Promise.resolve(cuerpo) } as Response)
  }

  beforeEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('aplica la caché ANTES de que conteste la red y después aplica y guarda lo que llegó', async () => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DEL_TEMA, JSON.stringify({ menuActivoFondo: '#1e3a8a' }))
    let resolver: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolver = r })))
    const el = document.createElement('div')
    const promesa = cargarTema({ elemento: el })
    expect(fondo(el)).toBe('#1e3a8a')
    resolver({ ok: true, json: () => Promise.resolve({ tema: { menuActivoFondo: '#fdf2f8' } }) } as Response)
    expect(await promesa).toEqual({ menuActivoFondo: '#fdf2f8' })
    expect(fondo(el)).toBe('#fdf2f8')
    expect(JSON.parse(window.localStorage.getItem(CLAVE_DE_CACHE_DEL_TEMA) ?? '{}')).toEqual({ menuActivoFondo: '#fdf2f8' })
  })

  it('pide el tema a la propia instancia, sin credenciales ni caché del navegador', async () => {
    const f = vi.fn(() => respuesta({ tema: {} }))
    vi.stubGlobal('fetch', f)
    await cargarTema({ elemento: document.createElement('div') })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/tema')
    expect(init.credentials).toBe('omit')
    expect(init.cache).toBe('no-store')
  })

  it('un tema vacío del servidor restaura los valores por defecto y limpia la caché', async () => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DEL_TEMA, JSON.stringify({ menuActivoFondo: '#1e3a8a' }))
    vi.stubGlobal('fetch', vi.fn(() => respuesta({ tema: {} })))
    const el = document.createElement('div')
    await cargarTema({ elemento: el })
    expect(fondo(el)).toBe('')
    expect(window.localStorage.getItem(CLAVE_DE_CACHE_DEL_TEMA)).toBeNull()
  })

  it.each([
    ['error de red', () => Promise.reject(new Error('sin red'))],
    ['un 500', () => respuesta({}, false)],
    ['un 200 sin el campo `tema`', () => respuesta({})],
    ['un 200 con `tema` que no es un objeto', () => respuesta({ tema: 'x' })],
    ['un cuerpo que no es JSON', () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('x')) } as Response)],
  ])('con %s queda lo que ya había y no lanza', async (_nombre, falla) => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DEL_TEMA, JSON.stringify({ menuActivoFondo: '#1e3a8a' }))
    vi.stubGlobal('fetch', vi.fn(falla))
    const el = document.createElement('div')
    await expect(cargarTema({ elemento: el })).resolves.toEqual({ menuActivoFondo: '#1e3a8a' })
    expect(fondo(el)).toBe('#1e3a8a')
  })

  it('no se cuelga: pasado el tiempo corta y la app arranca igual', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, rechazar) => {
      init.signal?.addEventListener('abort', () => rechazar(new Error('abortado')))
    })))
    await expect(cargarTema({ tiempoMs: 20, elemento: document.createElement('div') })).resolves.toEqual({})
  })

  it('ignora lo inválido que mande el servidor y una caché corrupta', async () => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DEL_TEMA, '{no es json')
    vi.stubGlobal('fetch', vi.fn(() => respuesta({ tema: { menuActivoFondo: '#7b7b7b', colorFuturo: '#000000' } })))
    const el = document.createElement('div')
    expect(await cargarTema({ elemento: el })).toEqual({})
    expect(fondo(el)).toBe('')
  })

  it('sin localStorage aplica igual', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.stubGlobal('fetch', vi.fn(() => respuesta({ tema: { menuActivoFondo: '#fdf2f8' } })))
    const el = document.createElement('div')
    await cargarTema({ elemento: el })
    expect(fondo(el)).toBe('#fdf2f8')
    vi.restoreAllMocks()
  })
})

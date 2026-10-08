import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CLAVES_DE_TEMA, CLAVE_DE_CACHE_DEL_TEMA, COLORES_DE_TEMA, ajustarContraste, aplicarTema, cargarTema, contraste, luminancia, normalizarHex, textoSobre, validarTema,
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
    // Los de `defectoPorProducto` son sólo una referencia para la vista previa: el valor de siempre lo declara cada producto.
    const defectos = Object.fromEntries(COLORES_DE_TEMA.filter((d) => !d.defectoPorProducto).map((d) => [d.clave, d.porDefecto]))
    const { tema, errores } = validarTema(defectos)
    expect(errores).toEqual({})
    expect(tema).toEqual(defectos)
  })
})

describe('el ítem activo del menú (ADR-036)', () => {
  it('fondo y borde son de cada producto: defectoPorProducto, como el acento (la barra ya no: es del kit, ADR-042)', () => {
    for (const clave of ['acento', 'menuActivoFondo', 'menuActivoBorde']) {
      expect(COLORES_DE_TEMA.find((d) => d.clave === clave)?.defectoPorProducto, clave).toBe(true)
    }
  })

  it('🔴 tema.css ya no trae el verde: su último recurso es el neutro de COLORES_DE_TEMA', () => {
    const css = readFileSync(resolve(__dirname, '../src/tema.css'), 'utf8')
    const fondo = COLORES_DE_TEMA.find((d) => d.clave === 'menuActivoFondo')!
    const borde = COLORES_DE_TEMA.find((d) => d.clave === 'menuActivoBorde')!
    expect(css).toContain(`--libra-menu-activo-fondo: ${fondo.porDefecto};`)
    expect(css).toContain(`--libra-menu-activo-borde: ${borde.porDefecto};`)
    expect(css).not.toMatch(/ecfdf5|5ee9b5|064e3b/i)
    // El texto del neutro se lee sobre su fondo.
    const texto = /--libra-menu-activo-texto: (#[0-9a-f]{6});/.exec(css)![1]
    expect(contraste(texto, fondo.porDefecto)).toBeGreaterThanOrEqual(4.5)
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

describe('los colores ampliados (ADR-009)', () => {
  const limpio = () => {
    const el = document.createElement('div')
    return el
  }

  it('el acento fija --primary, el anillo y el sidebar-primary, y calcula el texto de los botones', () => {
    const el = limpio()
    aplicarTema({ acento: '#0f766e' }, el)
    for (const v of ['--primary', '--ring', '--sidebar-primary']) expect(el.style.getPropertyValue(v)).toBe('#0f766e')
    expect(el.style.getPropertyValue('--primary-foreground')).toBe('#ffffff')
    expect(el.style.getPropertyValue('--sidebar-primary-foreground')).toBe('#ffffff')
  })

  it('un acento casi negro (se pierde en modo oscuro) o casi blanco (se pierde en claro) se rechaza', () => {
    expect(validarTema({ acento: '#171717' }).errores.acento).toMatch(/no se distingue del fondo/)
    expect(validarTema({ acento: '#fafafa' }).errores.acento).toMatch(/no se distingue del fondo/)
  })

  it('la barra lateral calcula el texto y deriva el hover y el borde', () => {
    const el = limpio()
    aplicarTema({ barraLateralFondo: '#0f172a' }, el)
    expect(el.style.getPropertyValue('--sidebar')).toBe('#0f172a')
    expect(el.style.getPropertyValue('--sidebar-foreground')).toBe('#ffffff')
    expect(el.style.getPropertyValue('--sidebar-accent-foreground')).toBe('#ffffff')
    // Mezcla con el texto: más claro que el fondo, y el borde más que el hover.
    expect(luminancia(el.style.getPropertyValue('--sidebar-accent'))).toBeGreaterThan(luminancia('#0f172a'))
    expect(luminancia(el.style.getPropertyValue('--sidebar-border'))).toBeGreaterThan(luminancia(el.style.getPropertyValue('--sidebar-accent')))
  })

  it('el éxito conserva el texto blanco mientras llegue a 3:1 y se rechaza si se pierde en un modo', () => {
    const el = limpio()
    aplicarTema({ exito: '#059669' }, el)
    expect(el.style.getPropertyValue('--libra-exito-texto')).toBe('#ffffff')
    expect(validarTema({ exito: '#bbf7d0' }).errores.exito).toBeTruthy()
    expect(validarTema({ exito: '#052e16' }).errores.exito).toBeTruthy()
  })

  it('el final de la franja del POS tiene que leerse con el texto del inicio', () => {
    expect(validarTema({ posEncabezadoInicio: '#1e3a8a', posEncabezadoFin: '#fde68a' }).errores.posEncabezadoFin).toMatch(/texto de la franja/)
    expect(validarTema({ posEncabezadoInicio: '#1e3a8a', posEncabezadoFin: '#7c3aed' }).errores).toEqual({})
    expect(validarTema({ posEncabezadoFin: '#fde68a' }).errores.posEncabezadoFin).toMatch(/texto de la franja/)
  })

  it('Codex: un inicio claro solo se valida contra el final de siempre, y un fondo de barra cuyo hover pierde contraste se rechaza', () => {
    expect(validarTema({ posEncabezadoInicio: '#fde68a' }).errores.posEncabezadoInicio).toMatch(/texto de la franja/)
    expect(validarTema({ posEncabezadoInicio: '#fde68a', posEncabezadoFin: '#f59e0b' }).errores).toEqual({})
    expect(validarTema({ barraLateralFondo: '#767676' }).errores.barraLateralFondo).toMatch(/pasar el mouse/)
    expect(validarTema({ barraLateralFondo: '#0f172a' }).errores).toEqual({})
  })

  it('aplicar un tema vacío limpia TODAS las variables, incluidas las derivadas', () => {
    const el = limpio()
    aplicarTema({ acento: '#0f766e', barraLateralFondo: '#0f172a', exito: '#047857', posEncabezadoInicio: '#1e3a8a' }, el)
    expect(el.getAttribute('style')).toBeTruthy()
    aplicarTema({}, el)
    expect((el.getAttribute('style') ?? '').trim()).toBe('')
  })
})

describe('el éxito como texto (ADR-009, pasada visual en oscuro)', () => {
  it('ajustarContraste llega al mínimo contra el fondo de cada modo y no toca lo que ya llega', () => {
    expect(contraste(ajustarContraste('#059669', '#ffffff', 4.5), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contraste(ajustarContraste('#059669', '#162420', 4.5), '#162420')).toBeGreaterThanOrEqual(4.5)
    expect(ajustarContraste('#000000', '#ffffff', 4.5)).toBe('#000000')
  })

  it('aplicar el éxito fija las dos variantes de texto y un tema vacío las limpia', () => {
    const el = document.createElement('div')
    aplicarTema({ exito: '#059669' }, el)
    const claro = el.style.getPropertyValue('--libra-exito-como-texto-claro')
    const oscuro = el.style.getPropertyValue('--libra-exito-como-texto-oscuro')
    expect(contraste(claro, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contraste(oscuro, '#162420')).toBeGreaterThanOrEqual(4.5)
    aplicarTema({}, el)
    expect((el.getAttribute('style') ?? '').trim()).toBe('')
  })
})

describe('tema.css: el lugar de la barra de scroll (ADR-027)', () => {
  it('reserva siempre el lugar de la barra vertical: sin eso, Ventas y Stock cambiaban de modo según hacia dónde se redimensionara', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const css = readFileSync(resolve(process.cwd(), 'src/tema.css'), 'utf8')
    expect(css).toMatch(/html\s*\{\s*scrollbar-gutter:\s*stable;\s*\}/)
  })
})

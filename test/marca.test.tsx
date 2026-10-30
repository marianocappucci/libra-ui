// La marca de la instancia (ADR-098): lo que se carga, lo que se rechaza, lo que cambia en el documento y lo que dibujan Layout, Login y
// PasswordReset cuando la instancia es de un revendedor. Lo que más importa: con marca propia NO queda ningún «Libra» a la vista, y sin ella
// todo es exactamente lo de siempre.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createForgotPassword } from '../src/PasswordReset'
import { createLayout } from '../src/Layout'
import { createLogin } from '../src/Login'
import { aplicarIdentidad } from '../src/identidad'
import {
  CLAVE_DE_CACHE_DE_LA_MARCA, MARCA_VACIA, cargarMarca, hayMarcaPropia, leerMarca, reiniciarMarca, resolverMarca, useMarca, validarMarca,
} from '../src/marca'
import { aplicarTema } from '../src/tema'

vi.mock('../src/CaptchaAltcha', () => ({ default: () => null }))

const LOGO = '/api/marca/logo?v=0123456789ab'
const MARCA = { propia: true, nombre: 'Gestión Sur', nombre_corto: 'Gestión Sur', color: '#2563eb', logo: LOGO }
const SIN_MARCA = { propia: false, nombre: '', nombre_corto: '', color: '', logo: '' }

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
}
const pendiente = () => new Promise<Response>(() => {})

function prepararDocumento() {
  document.head.innerHTML = '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#f39200">'
  document.title = 'VentaLibra'
}
const favicon = () => document.head.querySelector('link[rel~="icon"]')
const apple = () => document.head.querySelector('link[rel="apple-touch-icon"]')
const temaDelNavegador = () => document.head.querySelector('meta[name="theme-color"]')

beforeEach(() => {
  window.localStorage.clear()
  reiniciarMarca()
  prepararDocumento()
})

afterEach(() => {
  cleanup() // desmontar antes de reiniciar: si no, el reinicio re-renderiza componentes montados fuera de `act`
  reiniciarMarca()
  aplicarTema({})
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
})

// ── La forma ───────────────────────────────────────────────────────────────

describe('validarMarca', () => {
  it('lo que no es un objeto, o no es propia, es «sin marca» aunque traiga datos', () => {
    for (const crudo of [null, undefined, 'x', 5, [], { propia: false, nombre: 'X', logo: LOGO }, { nombre: 'X' }, { propia: 'true', nombre: 'X' }]) {
      expect(validarMarca(crudo)).toBe(MARCA_VACIA)
    }
  })

  it('normaliza: recorta, pasa el color a minúsculas y corta lo largo', () => {
    const m = validarMarca({ propia: true, nombre: `  ${'x'.repeat(60)}  `, nombre_corto: 'y'.repeat(20), color: '#2563EB', logo: LOGO })
    expect(m.nombre).toBe('x'.repeat(40))
    expect(m.nombre_corto).toBe('y'.repeat(12))
    expect(m.color).toBe('#2563eb')
  })

  it.each([
    'https://sitio-ajeno.example/logo.png',
    '//sitio-ajeno.example/logo.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '/api/marca/logo?v=ZZZZZZZZZZZZ',
    '/api/marca/logo?v=0123456789ab&x=1',
    '/api/marca/logo/../../etc/passwd',
    '/otra/ruta.png',
  ])('el logo %s no se carga: sólo el de esta instancia', (logo) => {
    expect(validarMarca({ propia: true, nombre: 'X', logo }).logo).toBe('')
  })

  it('el logo sin versión es válido; un color que no es #rrggbb se descarta', () => {
    expect(validarMarca({ propia: true, nombre: 'X', logo: '/api/marca/logo' }).logo).toBe('/api/marca/logo')
    expect(validarMarca({ propia: true, nombre: 'X', color: 'rojo' }).color).toBe('')
  })

  it('propia sin nada válido que mostrar es «sin marca»', () => {
    expect(validarMarca({ propia: true, nombre: '  ', color: 'rojo', logo: 'https://x.example/l.png' })).toBe(MARCA_VACIA)
  })
})

describe('resolverMarca', () => {
  it('sin marca, es lo del producto', () => {
    expect(resolverMarca(MARCA_VACIA, 'VentaLibra', 'V')).toEqual({ nombre: 'VentaLibra', inicial: 'V', logo: undefined, reemplaza: false })
  })

  it('con nombre y logo, reemplaza la identidad de Libra', () => {
    const v = resolverMarca(validarMarca(MARCA), 'VentaLibra', 'V')
    expect(v).toEqual({ nombre: 'Gestión Sur', inicial: 'G', logo: { src: LOGO, alt: 'Gestión Sur' }, reemplaza: true })
  })

  it('con nombre sin logo, dibuja la inicial del nombre (sin partir un emoji)', () => {
    expect(resolverMarca(validarMarca({ propia: true, nombre: 'ñandú' }), 'VentaLibra', 'V').inicial).toBe('Ñ')
    expect(resolverMarca(validarMarca({ propia: true, nombre: '🚀 Cohete' }), 'VentaLibra', 'V').inicial).toBe('🚀')
  })

  it('un color solo NO reemplaza la identidad: cambia el acento y nada más', () => {
    const v = resolverMarca(validarMarca({ propia: true, color: '#2563eb' }), 'VentaLibra', 'V')
    expect(v.reemplaza).toBe(false)
    expect(v.nombre).toBe('VentaLibra')
  })
})

// ── La carga ───────────────────────────────────────────────────────────────

describe('cargarMarca', () => {
  it('la primera visita espera la respuesta, la aplica y la guarda', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(MARCA)))
    const m = await cargarMarca()
    expect(m).toEqual(MARCA)
    expect(leerMarca()).toEqual(MARCA)
    expect(hayMarcaPropia()).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(CLAVE_DE_CACHE_DE_LA_MARCA)!)).toEqual(MARCA)
  })

  it('pide la marca a la propia instancia, sin credenciales ni caché del navegador', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(SIN_MARCA))
    vi.stubGlobal('fetch', fetchMock)
    await cargarMarca()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/marca')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store' })
  })

  it('«sin marca» también se guarda: la espera ocurre una sola vez por navegador', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(SIN_MARCA)))
    await cargarMarca()
    expect(window.localStorage.getItem(CLAVE_DE_CACHE_DE_LA_MARCA)).not.toBeNull()
    vi.stubGlobal('fetch', vi.fn(pendiente))
    const t0 = Date.now()
    await cargarMarca() // con la caché no espera al servidor, que acá no contesta nunca
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('con una marca guardada la aplica en el acto y refresca de fondo', async () => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, JSON.stringify(MARCA))
    let contestar!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { contestar = r })))

    const m = await cargarMarca()
    expect(m).toEqual(MARCA) // devolvió sin esperar al servidor
    expect(document.title).toBe('Gestión Sur')

    contestar(json({ ...MARCA, nombre: 'Gestión Norte' }))
    await waitFor(() => expect(document.title).toBe('Gestión Norte'))
    expect(JSON.parse(window.localStorage.getItem(CLAVE_DE_CACHE_DE_LA_MARCA)!).nombre).toBe('Gestión Norte')
  })

  it.each([
    ['sin red', () => Promise.reject(new TypeError('network'))],
    ['un 500', () => Promise.resolve(json({ detail: 'x' }, 500))],
    ['un 404 de una versión vieja del motor', () => Promise.resolve(json({ detail: 'Not Found' }, 404))],
    ['un cuerpo sin «propia» (un proxy que devuelve otra cosa)', () => Promise.resolve(json({ tema: {} }))],
    ['HTML con 200 (el catch-all de la SPA)', () => Promise.resolve(new Response('<html></html>', { status: 200 }))],
    ['un array', () => Promise.resolve(json([]))],
  ])('%s: queda todo como estaba y no lanza', async (_caso, respuesta) => {
    vi.stubGlobal('fetch', vi.fn(respuesta))
    const m = await cargarMarca()
    expect(m).toBe(MARCA_VACIA)
    expect(document.title).toBe('VentaLibra')
    expect(window.localStorage.getItem(CLAVE_DE_CACHE_DE_LA_MARCA)).toBeNull() // lo roto no se guarda: la próxima visita lo reintenta
  })

  it('pasado el tope, sigue sin marca (el servidor que no contesta no frena la app)', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_ok, no) => {
      init.signal!.addEventListener('abort', () => no(new DOMException('abort', 'AbortError')))
    })))
    const m = await cargarMarca({ tiempoMs: 20 })
    expect(m).toBe(MARCA_VACIA)
  })

  it('una caché corrupta se ignora y se pide de nuevo', async () => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, '{no es json')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(MARCA)))
    expect(await cargarMarca()).toEqual(MARCA)
  })

  it('una URL de logo ajena, venga de la red o de la caché, no llega a ningún lado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...MARCA, logo: 'https://sitio-ajeno.example/l.png' })))
    const m = await cargarMarca()
    expect(m.logo).toBe('')
    expect(favicon()!.getAttribute('href')).toBe('/favicon.svg')
  })
})

// ── El documento ───────────────────────────────────────────────────────────

describe('el documento', () => {
  it('con marca propia cambia el título, el favicon, el apple-touch-icon y el theme-color', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(MARCA)))
    await cargarMarca()
    expect(document.title).toBe('Gestión Sur')
    expect(favicon()!.getAttribute('href')).toBe('/api/marca/icono/192.png?v=0123456789ab2563eb')
    expect(favicon()!.getAttribute('type')).toBe('image/png')
    expect(apple()!.getAttribute('href')).toBe('/api/marca/icono/apple.png?v=0123456789ab2563eb')
    expect(temaDelNavegador()!.getAttribute('content')).toBe('#2563eb')
  })

  it('al borrar la marca vuelve todo a como estaba, y saca lo que la marca había creado', async () => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, JSON.stringify(MARCA))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(SIN_MARCA)))
    await cargarMarca()
    await waitFor(() => expect(document.title).toBe('VentaLibra'))
    expect(favicon()!.getAttribute('href')).toBe('/favicon.svg')
    expect(favicon()!.getAttribute('type')).toBe('image/svg+xml')
    expect(temaDelNavegador()!.getAttribute('content')).toBe('#f39200')
    expect(apple()).toBeNull() // el index.html no tenía uno: no queda el de la marca
    expect(hayMarcaPropia()).toBe(false)
  })

  it('lo que la marca no define vuelve a lo original (nombre sin logo: el favicon es el del producto)', async () => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, JSON.stringify(MARCA))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ propia: true, nombre: 'Gestión Sur', nombre_corto: '', color: '', logo: '' })))
    await cargarMarca()
    await waitFor(() => expect(favicon()!.getAttribute('href')).toBe('/favicon.svg'))
    expect(document.title).toBe('Gestión Sur')
    expect(temaDelNavegador()!.getAttribute('content')).toBe('#f39200')
  })

  it('aplicarIdentidad corra antes o después, no pisa el favicon ni el theme-color de la marca', async () => {
    aplicarIdentidad('ventalibra') // antes
    const delProducto = favicon()!.getAttribute('href')
    expect(delProducto).not.toBe('/favicon.svg') // la identidad sí lo cambió
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(MARCA)))
    await cargarMarca()
    aplicarIdentidad('ventalibra') // después
    expect(favicon()!.getAttribute('href')).toContain('/api/marca/icono/192.png')
    expect(temaDelNavegador()!.getAttribute('content')).toBe('#2563eb')
  })

  it('al sacar la marca vuelve el favicon que había puesto la identidad del producto', async () => {
    aplicarIdentidad('ventalibra')
    const delProducto = favicon()!.getAttribute('href')
    window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, JSON.stringify(MARCA))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(SIN_MARCA)))
    await cargarMarca()
    await waitFor(() => expect(favicon()!.getAttribute('href')).toBe(delProducto))
  })
})

// ── El acento ──────────────────────────────────────────────────────────────

describe('el acento', () => {
  const primario = () => document.documentElement.style.getPropertyValue('--primary')

  it('el color de la marca es el acento por defecto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(MARCA)))
    await cargarMarca()
    expect(primario()).toBe('#2563eb')
  })

  it('un acento explícito del tema le gana, en cualquier orden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(MARCA)))
    aplicarTema({ acento: '#b91c1c' })
    await cargarMarca()
    expect(primario()).toBe('#b91c1c')
    aplicarTema({}) // sin acento en el tema, vuelve el de la marca
    expect(primario()).toBe('#2563eb')
  })

  it('al sacar la marca se saca el acento', async () => {
    window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, JSON.stringify(MARCA))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(SIN_MARCA)))
    await cargarMarca()
    expect(primario()).toBe('#2563eb')
    await waitFor(() => expect(primario()).toBe(''))
  })

  it('un color sin contraste suficiente no se aplica: la marca no deja un botón ilegible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...MARCA, color: '#fdfdfd' })))
    await cargarMarca()
    expect(primario()).toBe('')
  })
})

// ── Los componentes ────────────────────────────────────────────────────────

describe('useMarca', () => {
  it('re-renderiza cuando llega la marca', async () => {
    function Nombre() {
      return <p>{useMarca().nombre || 'sin nombre'}</p>
    }
    render(<Nombre />)
    expect(screen.getByText('sin nombre')).toBeInTheDocument()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(MARCA)))
    await act(async () => {
      await cargarMarca()
    })
    expect(screen.getByText('Gestión Sur')).toBeInTheDocument()
  })
})

async function conMarca(marca: object | null) {
  if (marca) {
    window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, JSON.stringify(marca))
    vi.stubGlobal('fetch', vi.fn(pendiente))
    await cargarMarca()
  }
}

function montarLogin() {
  const Login = createLogin<{ id: string }>({
    productName: 'VentaLibra',
    productInitial: 'V',
    redirectTo: '/',
    producto: 'ventalibra',
    useAuth: () => ({ login: vi.fn() }),
  })
  return render(<MemoryRouter><Login /></MemoryRouter>)
}

function montarLayout() {
  const Layout = createLayout<{ name: string }>({
    productName: 'VentaLibra',
    productInitial: 'V',
    producto: 'ventalibra',
    navItems: [],
    useAuth: () => ({ user: { name: 'Ana' }, logout: vi.fn() }),
  })
  return render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

/** Todo lo que una persona puede leer de la pantalla: el texto, los `alt`, los `title` y los `aria-label`. */
function loVisible(contenedor: HTMLElement): string {
  const atributos = [...contenedor.querySelectorAll('[alt],[title],[aria-label]')]
    .flatMap((el) => [el.getAttribute('alt'), el.getAttribute('title'), el.getAttribute('aria-label')])
  return [contenedor.textContent, ...atributos].filter(Boolean).join(' | ')
}

describe('Login', () => {
  it('sin marca es el de siempre: el nombre y el fondo del producto', () => {
    const { container } = montarLogin()
    expect(screen.getByText('VentaLibra')).toBeInTheDocument()
    expect(container.querySelector('[data-fondo]')?.getAttribute('data-fondo')).toBe('ventalibra')
  })

  it('con marca propia muestra su nombre y su logo, sin el fondo ni el nombre de Libra', async () => {
    await conMarca(MARCA)
    const { container } = montarLogin()
    expect(screen.getByText('Gestión Sur')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Gestión Sur' })).toHaveAttribute('src', LOGO)
    expect(container.querySelector('[data-fondo]')?.getAttribute('data-fondo')).toBeFalsy()
    expect(loVisible(container)).not.toMatch(/libra/i)
  })

  it('con nombre y sin logo dibuja la inicial del nombre, no la del producto', async () => {
    await conMarca({ ...MARCA, logo: '' })
    const { container } = montarLogin()
    expect(screen.getByText('G')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(loVisible(container)).not.toMatch(/libra/i)
  })

  it('con sólo un color, la identidad del producto queda como estaba', async () => {
    await conMarca({ propia: true, nombre: '', nombre_corto: '', color: '#2563eb', logo: '' })
    montarLogin()
    expect(screen.getByText('VentaLibra')).toBeInTheDocument()
  })
})

describe('Layout', () => {
  it('sin marca es el de siempre', () => {
    montarLayout()
    expect(screen.getByText('VentaLibra')).toBeInTheDocument()
  })

  it('con marca propia el encabezado lleva su nombre y su logo, y no queda «Libra» a la vista', async () => {
    await conMarca(MARCA)
    const { container } = montarLayout()
    expect(screen.getByText('Gestión Sur')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Gestión Sur' })).toHaveAttribute('src', LOGO)
    expect(loVisible(container)).not.toMatch(/libra/i)
  })

  it('con nombre y sin logo, la inicial del nombre', async () => {
    await conMarca({ ...MARCA, logo: '' })
    const { container } = montarLayout()
    expect(screen.getByText('G')).toBeInTheDocument()
    expect(loVisible(container)).not.toMatch(/libra/i)
  })

  it('el logo de la marca se muestra sin la clase del logo del producto', async () => {
    await conMarca(MARCA)
    const Layout = createLayout<{ name: string }>({
      productName: 'VentaLibra',
      productInitial: 'V',
      logo: { src: '/assets/logo-ventalibra.png', className: 'h-9 w-9 clase-del-producto' },
      navItems: [],
      useAuth: () => ({ user: { name: 'Ana' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>x</p></Layout></MemoryRouter>)
    const logo = screen.getByRole('img', { name: 'Gestión Sur' })
    expect(logo).toHaveAttribute('src', LOGO)
    expect(logo.className).not.toContain('clase-del-producto')
  })
})

describe('PasswordReset', () => {
  function montar() {
    const Olvide = createForgotPassword({ productName: 'VentaLibra', productInitial: 'V' })
    return render(<MemoryRouter><Olvide /></MemoryRouter>)
  }

  it('sin marca es el de siempre', () => {
    montar()
    expect(screen.getByText('VentaLibra')).toBeInTheDocument()
    expect(screen.getByText('V')).toBeInTheDocument()
  })

  it('con marca propia lleva su nombre y su logo, y no queda «Libra» a la vista', async () => {
    await conMarca(MARCA)
    const { container } = montar()
    expect(screen.getByText('Gestión Sur')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Gestión Sur' })).toHaveAttribute('src', LOGO)
    expect(loVisible(container)).not.toMatch(/libra/i)
  })
})

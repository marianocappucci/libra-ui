// El registro de identidad de los productos (ADR-033, v0.123.0).
//
// La tabla de abajo está escrita a mano A PROPÓSITO, copiada de la página `identidad-de-producto-diseno` del wiki: es el guardián de divergencia.
// `src/identidad.ts`, `libra_web_kit/identidad.py` (las landings) y esa página son la misma tabla en tres lugares; si alguien cambia un color en
// uno solo, este test falla. Cambiar un valor acá sin cambiarlo en los otros dos es justo lo que NO hay que hacer.
import { Coffee, CalendarCheck, HeartPulse, Headset, ReceiptText, ScanBarcode, Trophy, Truck } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { IDENTIDAD, aplicarIdentidad, cssDeIdentidad, defectosDelProducto, menuActivoDeProducto, type Producto } from '../src/identidad'
import { COLORES_DE_TEMA, aplicarTema, validarTema } from '../src/tema'
import { faviconDeMarca } from '../src/marcas'

const TABLA_DEL_WIKI = {
  contalibra: { nombre: 'ContaLibra', rubro: 'Comercios y PyMEs', color: '#2563eb', colorOscuro: '#1d4ed8', colorClaro: '#eff6ff', colorSobreOscuro: '#60a5fa', icono: ReceiptText },
  restolibra: { nombre: 'RestoLibra', rubro: 'Restaurantes, bares y delivery', color: '#ea580c', colorOscuro: '#c2410c', colorClaro: '#fff7ed', colorSobreOscuro: '#fb923c', icono: Coffee },
  gestiolibra: { nombre: 'GestioLibra', rubro: 'Negocios de servicios', color: '#7c3aed', colorOscuro: '#6d28d9', colorClaro: '#f5f3ff', colorSobreOscuro: '#a78bfa', icono: CalendarCheck },
  medlibra: { nombre: 'MedLibra', rubro: 'Consultorios y centros médicos', color: '#0d9488', colorOscuro: '#0f766e', colorClaro: '#f0fdfa', colorSobreOscuro: '#2dd4bf', icono: HeartPulse },
  ventalibra: { nombre: 'VentaLibra', rubro: 'Punto de venta para retail', color: '#d97706', colorOscuro: '#b45309', colorClaro: '#fffbeb', colorSobreOscuro: '#fbbf24', icono: ScanBarcode },
  libradesk: { nombre: 'LibraDesk', rubro: 'Empresas de IT', color: '#4f46e5', colorOscuro: '#4338ca', colorClaro: '#eef2ff', colorSobreOscuro: '#818cf8', icono: Headset },
  libracargo: { nombre: 'LibraCargo', rubro: 'Agencias de cargas', color: '#012c83', colorOscuro: '#001d5c', colorClaro: '#eef3fc', colorSobreOscuro: '#7aa2f7', icono: Truck },
  libraclub: { nombre: 'LibraClub', rubro: 'Complejos deportivos', color: '#017b4b', colorOscuro: '#015c38', colorClaro: '#ecfdf5', colorSobreOscuro: '#34d399', icono: Trophy },
} as const satisfies Record<Producto, object>

const PRODUCTOS = Object.keys(TABLA_DEL_WIKI) as Producto[]
// Los tres cuyo color de marca no llega a 4,5:1 contra blanco: ahí el botón usa `colorOscuro`.
const CON_COLOR_DE_ACCION_OSCURO: Producto[] = ['restolibra', 'medlibra', 'ventalibra']

// Luminancia relativa y razón de contraste de WCAG 2.x.
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2)
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('el registro de identidad', () => {
  it('tiene exactamente los ocho productos', () => {
    expect(Object.keys(IDENTIDAD).sort()).toEqual([...PRODUCTOS].sort())
    expect(PRODUCTOS).toHaveLength(8)
  })

  it.each(PRODUCTOS)('🔴 %s coincide con la tabla del wiki', (p) => {
    const { colorAccion: _, ...sinAccion } = IDENTIDAD[p]
    expect(sinAccion).toEqual(TABLA_DEL_WIKI[p])
  })

  it.each(PRODUCTOS)('%s: todos los colores son #rrggbb en minúsculas', (p) => {
    const { color, colorOscuro, colorClaro, colorSobreOscuro, colorAccion } = IDENTIDAD[p]
    for (const c of [color, colorOscuro, colorClaro, colorSobreOscuro, colorAccion]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('🔴 colorAccion es colorOscuro en RestoLibra, MedLibra y VentaLibra, y el color de marca en el resto', () => {
    for (const p of PRODUCTOS) {
      const { color, colorOscuro, colorAccion } = IDENTIDAD[p]
      expect(colorAccion, p).toBe(CON_COLOR_DE_ACCION_OSCURO.includes(p) ? colorOscuro : color)
    }
  })

  it.each(PRODUCTOS)('🔴 %s: el texto blanco sobre colorAccion llega a 4,5:1 (WCAG AA)', (p) => {
    expect(contraste(IDENTIDAD[p].colorAccion, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('el control — la fórmula de contraste distingue: los tres de marca flojos NO llegan con su color de marca', () => {
    // Sin esto, un `contraste()` que devolviera siempre 21 dejaría verde el test de arriba. Son los números del wiki: 3,6 / 3,7 / 3,2.
    expect(contraste('#ea580c', '#ffffff')).toBeLessThan(4.5)
    expect(contraste('#0d9488', '#ffffff')).toBeLessThan(4.5)
    expect(contraste('#d97706', '#ffffff')).toBeLessThan(4.5)
    expect(contraste('#d97706', '#ffffff')).toBeCloseTo(3.2, 1)
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it.each(PRODUCTOS)('%s: el texto oscuro del modo oscuro se lee sobre colorSobreOscuro', (p) => {
    expect(contraste(IDENTIDAD[p].colorSobreOscuro, '#0b1324')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('aplicarIdentidad', () => {
  afterEach(() => {
    document.getElementById('libra-identidad')?.remove()
    document.head.querySelector('meta[name="theme-color"]')?.remove()
    document.head.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove())
  })

  it('🔴 pone el favicon del producto (ADR-034) en un <link rel="icon">', () => {
    aplicarIdentidad('gestiolibra')
    const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe(faviconDeMarca('gestiolibra'))
    expect(links[0].type).toBe('image/svg+xml')
  })

  it('reusa el <link rel="icon"> que traía el index.html y le cambia el href', () => {
    const previo = document.createElement('link')
    previo.rel = 'icon'
    previo.href = '/favicon.png'
    document.head.appendChild(previo)
    aplicarIdentidad('ventalibra')
    aplicarIdentidad('ventalibra')
    const links = document.head.querySelectorAll('link[rel~="icon"]')
    expect(links).toHaveLength(1)
    expect(links[0]).toBe(previo)
    expect(previo.getAttribute('href')).toBe(faviconDeMarca('ventalibra'))
  })

  it('inyecta un único <style id="libra-identidad"> con el acento en claro y en oscuro', () => {
    aplicarIdentidad('ventalibra')
    const estilos = document.head.querySelectorAll('style#libra-identidad')
    expect(estilos).toHaveLength(1)
    const css = estilos[0].textContent ?? ''
    const { color, colorAccion, colorSobreOscuro } = IDENTIDAD.ventalibra
    // Claro: el acento es el de la acción (más hondo que la marca en VentaLibra); el anillo de foco, la marca.
    expect(css).toContain(`--primary: ${colorAccion};`)
    expect(css).toContain(`--sidebar-primary: ${colorAccion};`)
    expect(css).toContain(`--ring: ${color};`)
    expect(css).toContain(`--sidebar-ring: ${color};`)
    expect(css).toContain('--primary-foreground: #ffffff;')
    // Oscuro: la variante clara, con texto oscuro encima.
    const oscuro = css.slice(css.indexOf('.dark'))
    expect(oscuro).toContain(`--primary: ${colorSobreOscuro};`)
    expect(oscuro).toContain(`--ring: ${colorSobreOscuro};`)
    expect(oscuro).toContain(`--sidebar-primary: ${colorSobreOscuro};`)
    expect(oscuro).toContain('--primary-foreground: #0b1324;')
    expect(oscuro).toContain('--sidebar-primary-foreground: #0b1324;')
  })

  it('🔴 los selectores ganan por especificidad a los `:root` y `.dark` de los index.css de los productos', () => {
    const css = cssDeIdentidad('contalibra')
    expect(css).toContain(':root:root {')
    expect(css).toContain('.dark.dark {')
    // El modo oscuro va DESPUÉS del claro: a igual especificidad (los dos matchean con <html class="dark">) gana el último.
    expect(css.indexOf('.dark.dark')).toBeGreaterThan(css.indexOf(':root:root'))
  })

  it('crea el <meta name="theme-color"> con el color de la marca', () => {
    aplicarIdentidad('libracargo')
    const metas = document.head.querySelectorAll('meta[name="theme-color"]')
    expect(metas).toHaveLength(1)
    expect(metas[0].getAttribute('content')).toBe('#012c83')
  })

  it('reusa el <meta name="theme-color"> que ya traía el index.html', () => {
    const previo = document.createElement('meta')
    previo.name = 'theme-color'
    previo.content = '#ffffff'
    document.head.appendChild(previo)
    aplicarIdentidad('libraclub')
    const metas = document.head.querySelectorAll('meta[name="theme-color"]')
    expect(metas).toHaveLength(1)
    expect(metas[0]).toBe(previo)
    expect(previo.content).toBe('#017b4b')
  })

  it('🔴 es idempotente: llamarla de nuevo reemplaza el contenido, no agrega otro <style> ni otro <meta>', () => {
    aplicarIdentidad('contalibra')
    aplicarIdentidad('contalibra')
    expect(document.head.querySelectorAll('style#libra-identidad')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1)
    aplicarIdentidad('medlibra')
    const estilos = document.head.querySelectorAll('style#libra-identidad')
    expect(estilos).toHaveLength(1)
    expect(estilos[0].textContent).toContain(`--primary: ${IDENTIDAD.medlibra.colorAccion};`)
    expect(estilos[0].textContent).not.toContain(IDENTIDAD.contalibra.colorAccion)
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0d9488')
  })
})

describe('el ítem activo del menú es del producto (ADR-036)', () => {
  // Valores medidos de los ocho (fondo = colorClaro; borde = 45% de la marca sobre el fondo; texto = colorOscuro ajustado a 4,5:1).
  const ESPERADO = {
    contalibra: { fondo: '#eff6ff', borde: '#94b4f6', texto: '#1d4ed8' },
    restolibra: { fondo: '#fff7ed', borde: '#f6af88', texto: '#c2410c' },
    gestiolibra: { fondo: '#f5f3ff', borde: '#bfa0f7', texto: '#6d28d9' },
    medlibra: { fondo: '#f0fdfa', borde: '#8acec7', texto: '#0f766e' },
    ventalibra: { fondo: '#fffbeb', borde: '#eec084', texto: '#b45309' },
    libradesk: { fondo: '#eef2ff', borde: '#a6a5f3', texto: '#4338ca' },
    libracargo: { fondo: '#eef3fc', borde: '#8399c6', texto: '#001d5c' },
    libraclub: { fondo: '#ecfdf5', borde: '#82c3a9', texto: '#015c38' },
  } as const satisfies Record<Producto, object>
  const VERDE_DE_ANTES = { fondo: '#ecfdf5', borde: '#5ee9b5' }
  const BARRA = '#fafafa'

  afterEach(() => {
    document.getElementById('libra-identidad')?.remove()
    document.documentElement.removeAttribute('style')
  })

  it.each(PRODUCTOS)('%s: fondo, borde y texto son los medidos', (p) => {
    expect(menuActivoDeProducto(p)).toEqual(ESPERADO[p])
  })

  it.each(PRODUCTOS)('🔴 %s: el texto del ítem activo llega a 4,5:1 sobre su fondo', (p) => {
    const { fondo, texto } = menuActivoDeProducto(p)
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(PRODUCTOS)('%s: el borde se distingue de la barra, al menos como el verde de antes', (p) => {
    const { borde } = menuActivoDeProducto(p)
    expect(contraste(borde, BARRA)).toBeGreaterThanOrEqual(contraste(VERDE_DE_ANTES.borde, BARRA))
  })

  it.each(PRODUCTOS)('%s: el fondo es el colorClaro del producto, no el verde de antes (salvo LibraClub, cuyo colorClaro es ese verde)', (p) => {
    const { fondo } = menuActivoDeProducto(p)
    expect(fondo).toBe(IDENTIDAD[p].colorClaro)
    if (p !== 'libraclub') expect(fondo).not.toBe(VERDE_DE_ANTES.fondo)
    expect(menuActivoDeProducto(p).borde).not.toBe(VERDE_DE_ANTES.borde)
  })

  it.each(PRODUCTOS)('🔴 %s: el CSS de identidad trae las tres variables del ítem activo', (p) => {
    const css = cssDeIdentidad(p)
    const { fondo, borde, texto } = menuActivoDeProducto(p)
    expect(css).toContain(`--libra-menu-activo-fondo: ${fondo};`)
    expect(css).toContain(`--libra-menu-activo-borde: ${borde};`)
    expect(css).toContain(`--libra-menu-activo-texto: ${texto};`)
    // Dentro del bloque claro (`:root:root`), que es el que gana a tema.css: el chip es claro en los dos modos.
    const claro = css.slice(0, css.indexOf('.dark.dark'))
    expect(claro).toContain('--libra-menu-activo-fondo')
    expect(css.slice(css.indexOf('.dark.dark'))).not.toContain('--libra-menu-activo')
  })

  it('🔴 un tema de instancia en línea sigue ganando a la identidad, y al restaurarlo vuelve la del producto', () => {
    aplicarIdentidad('contalibra')
    expect(document.getElementById('libra-identidad')?.textContent).not.toContain('!important')
    const raiz = document.documentElement
    // En línea (lo que hace `aplicarTema`) gana al `<style>` por cascada; lo que se mide es que se fije y se limpie sin tocar el de identidad.
    aplicarTema({ menuActivoFondo: '#fdf2f8', menuActivoBorde: '#f9a8d4' })
    expect(raiz.style.getPropertyValue('--libra-menu-activo-fondo')).toBe('#fdf2f8')
    expect(raiz.style.getPropertyValue('--libra-menu-activo-borde')).toBe('#f9a8d4')
    expect(raiz.style.getPropertyValue('--libra-menu-activo-texto')).toBe('#0f172a')
    expect(document.getElementById('libra-identidad')?.textContent).toContain(`--libra-menu-activo-fondo: ${ESPERADO.contalibra.fondo};`)
    aplicarTema({})
    expect(raiz.style.getPropertyValue('--libra-menu-activo-fondo')).toBe('')
    expect(raiz.style.getPropertyValue('--libra-menu-activo-texto')).toBe('')
  })

  it('aplicarIdentidad cambia el ítem activo al cambiar de producto', () => {
    aplicarIdentidad('contalibra')
    aplicarIdentidad('restolibra')
    const css = document.getElementById('libra-identidad')?.textContent ?? ''
    expect(css).toContain(`--libra-menu-activo-fondo: ${ESPERADO.restolibra.fondo};`)
    expect(css).not.toContain(ESPERADO.contalibra.borde)
  })
})

describe('defectosDelProducto', () => {
  it.each(PRODUCTOS)('🔴 %s: coincide con IDENTIDAD (acento = colorAccion; ítem activo = el de menuActivoDeProducto)', (p) => {
    const d = defectosDelProducto(p)
    const { fondo, borde } = menuActivoDeProducto(p)
    expect(d.acento).toBe(IDENTIDAD[p].colorAccion)
    expect(d.menuActivoFondo).toBe(fondo)
    expect(d.menuActivoBorde).toBe(borde)
  })

  it.each(PRODUCTOS)('%s: trae todas las claves del tema, en #rrggbb, y el ítem activo pasa validarTema', (p) => {
    const d = defectosDelProducto(p)
    expect(Object.keys(d).sort()).toEqual(COLORES_DE_TEMA.map((c) => c.clave).sort())
    for (const v of Object.values(d)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
    // El fondo y el borde del ítem activo se podrían guardar como elegidos sin que la instancia los rechace.
    const { tema, errores } = validarTema({ menuActivoFondo: d.menuActivoFondo, menuActivoBorde: d.menuActivoBorde })
    expect(errores).toEqual({})
    expect(tema).toEqual({ menuActivoFondo: d.menuActivoFondo, menuActivoBorde: d.menuActivoBorde })
  })

  it('🔴 el acento de LibraCargo (#012c83) es un defecto válido pero NO una elección válida: «De siempre» tiene que ser vaciar, no guardar el defecto', () => {
    // 1,6:1 contra la página oscura (#0a0a0a): `legibleSobrePagina` (3:1, vale en claro y oscuro) lo rechaza. Es el acento real del producto, que
    // lo pinta `aplicarIdentidad` con su propio juego claro/oscuro; sólo no se puede ELEGIR por instancia. Los otros siete sí pasan.
    expect(validarTema({ acento: defectosDelProducto('libracargo').acento }).errores.acento).toMatch(/no se distingue del fondo/)
    for (const p of PRODUCTOS.filter((x) => x !== 'libracargo')) {
      expect(validarTema({ acento: defectosDelProducto(p).acento }).errores, p).toEqual({})
    }
  })

  it('lo que no sale de la identidad es lo de COLORES_DE_TEMA (la barra #fafafa de shadcn, el éxito y el POS)', () => {
    const d = defectosDelProducto('libradesk')
    for (const c of COLORES_DE_TEMA) {
      if (['acento', 'menuActivoFondo', 'menuActivoBorde'].includes(c.clave)) continue
      expect(d[c.clave], c.clave).toBe(c.porDefecto)
    }
    expect(d.barraLateralFondo).toBe('#fafafa')
  })

  it('los ocho tienen defectos distintos de acento y de ítem activo (no hay un verde común)', () => {
    const acentos = new Set(PRODUCTOS.map((p) => defectosDelProducto(p).acento))
    const fondos = new Set(PRODUCTOS.map((p) => defectosDelProducto(p).menuActivoFondo))
    expect(acentos.size).toBe(8)
    expect(fondos.size).toBe(8)
  })
})

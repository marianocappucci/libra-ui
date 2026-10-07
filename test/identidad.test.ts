// El registro de identidad de los productos (ADR-033, v0.123.0).
//
// La tabla de abajo está escrita a mano A PROPÓSITO, copiada de la página `identidad-de-producto-diseno` del wiki: es el guardián de divergencia.
// `src/identidad.ts`, `libra_web_kit/identidad.py` (las landings) y esa página son la misma tabla en tres lugares; si alguien cambia un color en
// uno solo, este test falla. Cambiar un valor acá sin cambiarlo en los otros dos es justo lo que NO hay que hacer.
import { Coffee, CalendarCheck, HeartPulse, Headset, ReceiptText, ScanBarcode, Trophy, Truck } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { IDENTIDAD, aplicarIdentidad, cssDeIdentidad, type Producto } from '../src/identidad'

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

// `MarcaProducto` y la prop `producto` de `createLayout` y `createLogin` (ADR-033, v0.123.0; el dibujo propio, ADR-034, v0.124.0).
//
// Cada caso con producto trae su control SIN producto, por lo mismo que en `logo-de-producto.test.tsx`: un «la inicial ya no está» pasaría en verde
// aunque la inicial nunca hubiera estado ahí.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createLayout } from '../src/Layout'
import { createLogin } from '../src/Login'
import type { ProductLogo } from '../src/branding'
import { IDENTIDAD, type Producto } from '../src/identidad'
import { MarcaProducto } from '../src/MarcaProducto'
import { svgDeMarca } from '../src/marcas'

// El color del cuadrado: el primer <rect> del SVG, que es el fondo.
const fondoDe = (marca: HTMLElement) => marca.querySelector('svg > rect')!.getAttribute('fill')
// El dibujo de `svgDeMarca` tal como lo deja el parser de HTML (el mismo que usa `dangerouslySetInnerHTML`), sin el <title>, que
// `MarcaProducto` saca.
function dibujoDe(svg: string) {
  const div = document.createElement('div')
  div.innerHTML = svg
  div.querySelector('title')?.remove()
  return div.querySelector('svg')!.innerHTML
}

const Icono = () => <svg />
const IconoDeEncabezado = () => <svg data-testid="icono-de-encabezado" />

function montarLogin(extra: { producto?: Producto; logo?: ProductLogo } = {}) {
  const Login = createLogin({
    productName: 'ContaLibra',
    productInitial: 'C',
    redirectTo: '/dashboard',
    useAuth: () => ({ login: vi.fn() }),
    ...extra,
  })
  render(<MemoryRouter><Login /></MemoryRouter>)
}

function montarLayout(extra: { producto?: Producto; logo?: ProductLogo; icon?: typeof Icono } = {}) {
  const Layout = createLayout<{ role?: string; name?: string }>({
    productName: 'ContaLibra',
    productInitial: 'C',
    navItems: [{ to: '/agenda', label: 'Agenda', icon: Icono }],
    useAuth: () => ({ user: { role: 'admin', name: 'Ana' }, logout: vi.fn() }),
    ...extra,
  })
  render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

describe('MarcaProducto', () => {
  it('es una imagen con el nombre del producto como nombre accesible, y el ícono escondido', () => {
    const { container } = render(<MarcaProducto producto="medlibra" />)
    const marca = screen.getByRole('img', { name: 'MedLibra' })
    expect(marca).toHaveAttribute('aria-label', 'MedLibra')
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('pinta el cuadrado con el color de marca', () => {
    render(<MarcaProducto producto="libracargo" />)
    expect(fondoDe(screen.getByRole('img'))).toBe(IDENTIDAD.libracargo.color)
  })

  it('🔴 dibuja la marca propia de `marcas.ts`, no un ícono de lucide', () => {
    const { container } = render(<MarcaProducto producto="libracargo" />)
    expect(container.querySelector('svg.lucide')).toBeNull()
    expect(container.querySelector('svg')!.innerHTML).toBe(dibujoDe(svgDeMarca('libracargo')))
  })

  it('🔴 usa el color de MARCA y no el de acción: RestoLibra queda #ea580c aunque el botón use #c2410c', () => {
    render(<MarcaProducto producto="restolibra" />)
    expect(fondoDe(screen.getByRole('img'))).toBe('#ea580c')
  })

  it('por defecto mide 32 px y no se achica (shrink-0)', () => {
    render(<MarcaProducto producto="contalibra" />)
    const marca = screen.getByRole('img')
    expect(marca.className).toContain('h-8')
    expect(marca.className).toContain('w-8')
    expect(marca.className).toContain('shrink-0')
  })

  it('el className pisa el tamaño por defecto; el SVG llena el cuadrado', () => {
    const { container } = render(<MarcaProducto producto="contalibra" className="h-12 w-12" />)
    const marca = screen.getByRole('img')
    expect(marca.className).toContain('h-12')
    expect(marca.className).not.toContain('h-8')
    expect(container.querySelector('svg')).toHaveAttribute('width', '100%')
  })

  it('iconoClassName (de antes de v0.124.0) se acepta y no rompe nada', () => {
    render(<MarcaProducto producto="contalibra" iconoClassName="size-5" />)
    expect(screen.getByRole('img', { name: 'ContaLibra' })).toBeInTheDocument()
  })

  it('el control — variante favicon dibuja otra cosa que el ícono', () => {
    const { container } = render(<><MarcaProducto producto="medlibra" /><MarcaProducto producto="medlibra" variante="favicon" /></>)
    const [icono, favicon] = container.querySelectorAll('svg')
    expect(favicon.innerHTML).not.toBe(icono.innerHTML)
    expect(favicon.innerHTML).toBe(dibujoDe(svgDeMarca('medlibra', 'favicon')))
  })

  it('🔴 sin el <title> del SVG: el nombre lo da el aria-label, una sola vez, y no aparece como texto junto al nombre del encabezado', () => {
    const { container } = render(<MarcaProducto producto="libraclub" />)
    expect(container.querySelector('title')).toBeNull()
    expect(screen.queryByText('LibraClub')).toBeNull()
    expect(screen.getAllByRole('img', { name: 'LibraClub' })).toHaveLength(1)
  })

  it.each(Object.keys(IDENTIDAD) as Producto[])('%s se dibuja con su nombre', (p) => {
    render(<MarcaProducto producto={p} />)
    expect(screen.getByRole('img', { name: IDENTIDAD[p].nombre })).toBeInTheDocument()
  })
})

describe('sidebar: producto', () => {
  it('el control — sin producto, la inicial está y no hay imagen', () => {
    montarLayout()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('🔴 con producto, aparece la marca de 32 px y la inicial desaparece', () => {
    montarLayout({ producto: 'contalibra' })
    const marca = screen.getByRole('img', { name: 'ContaLibra' })
    expect(fondoDe(marca)).toBe('#2563eb')
    expect(marca.className).toContain('h-8')
    expect(marca.className).toContain('shrink-0')
    expect(screen.queryByText('C')).not.toBeInTheDocument()
    // El nombre sigue siendo `productName`: la prop cambia la marca, no el texto.
    expect(screen.getByText('ContaLibra')).toBeInTheDocument()
  })

  it('🔴 precedencia: producto le gana a logo y a icon', () => {
    montarLayout({ producto: 'contalibra', logo: { src: '/assets/logo.png' }, icon: IconoDeEncabezado })
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'ContaLibra')
    expect(screen.queryByTestId('icono-de-encabezado')).not.toBeInTheDocument()
  })

  it('el control — sin producto, el logo y el icon siguen funcionando como antes', () => {
    montarLayout({ logo: { src: '/assets/logo.png' } })
    expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/logo.png')
    document.body.innerHTML = ''
    montarLayout({ icon: IconoDeEncabezado })
    expect(screen.getByTestId('icono-de-encabezado')).toBeInTheDocument()
  })
})

describe('login: producto', () => {
  it('el control — sin producto, la inicial está y no hay imagen', () => {
    montarLogin()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('🔴 con producto, aparece la marca de 48 px y la inicial desaparece', () => {
    montarLogin({ producto: 'contalibra' })
    const marca = screen.getByRole('img', { name: 'ContaLibra' })
    expect(fondoDe(marca)).toBe('#2563eb')
    expect(marca.className).toContain('h-12')
    expect(marca.className).toContain('w-12')
    expect(marca.className).not.toContain('h-8')
    expect(screen.queryByText('C')).not.toBeInTheDocument()
  })

  it('🔴 precedencia: producto le gana a logo', () => {
    montarLogin({ producto: 'contalibra', logo: { src: '/assets/logo.png' } })
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'ContaLibra')
  })
})

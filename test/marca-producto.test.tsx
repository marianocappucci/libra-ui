// `MarcaProducto` y la prop `producto` de `createLayout` y `createLogin` (ADR-033, v0.123.0).
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

  it('pinta el cuadrado con el color de marca, en línea', () => {
    render(<MarcaProducto producto="libracargo" />)
    expect(screen.getByRole('img')).toHaveStyle({ backgroundColor: IDENTIDAD.libracargo.color })
  })

  it('🔴 usa el color de MARCA y no el de acción: RestoLibra queda #ea580c aunque el botón use #c2410c', () => {
    render(<MarcaProducto producto="restolibra" />)
    expect(screen.getByRole('img')).toHaveStyle({ backgroundColor: '#ea580c' })
  })

  it('por defecto mide 32 px, no se achica (shrink-0) y es redondeado', () => {
    render(<MarcaProducto producto="contalibra" />)
    const marca = screen.getByRole('img')
    expect(marca.className).toContain('h-8')
    expect(marca.className).toContain('w-8')
    expect(marca.className).toContain('shrink-0')
    expect(marca.className).toContain('rounded-lg')
  })

  it('el className pisa el tamaño por defecto y iconoClassName el del ícono', () => {
    const { container } = render(<MarcaProducto producto="contalibra" className="h-10 w-10" iconoClassName="size-5" />)
    const marca = screen.getByRole('img')
    expect(marca.className).toContain('h-10')
    expect(marca.className).not.toContain('h-8')
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toContain('size-5')
    expect(svg.getAttribute('class')).not.toContain('size-4')
  })

  it('el ícono por defecto es de 16 px (size-4)', () => {
    const { container } = render(<MarcaProducto producto="contalibra" />)
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('size-4')
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
    expect(marca).toHaveStyle({ backgroundColor: '#2563eb' })
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

  it('🔴 con producto, aparece la marca de 40 px con ícono de 20 px y la inicial desaparece', () => {
    montarLogin({ producto: 'contalibra' })
    const marca = screen.getByRole('img', { name: 'ContaLibra' })
    expect(marca).toHaveStyle({ backgroundColor: '#2563eb' })
    expect(marca.className).toContain('h-10')
    expect(marca.className).toContain('w-10')
    expect(marca.className).not.toContain('h-8')
    expect(marca.querySelector('svg')!.getAttribute('class')).toContain('size-5')
    expect(screen.queryByText('C')).not.toBeInTheDocument()
  })

  it('🔴 precedencia: producto le gana a logo', () => {
    montarLogin({ producto: 'contalibra', logo: { src: '/assets/logo.png' } })
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'ContaLibra')
  })
})

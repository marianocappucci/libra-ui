// El logo de producto (v0.23.0) — la imagen que reemplaza al box con la
// inicial en el login y en la sidebar. Lo pidió LibraDesk; los otros cinco
// productos no pasan `logo` y tienen que seguir viendo su inicial.
//
// Por eso cada caso viene con su control **sin** logo. Sin esa mitad, un
// "la inicial ya no está" pasaría en verde aunque la inicial nunca hubiera
// estado ahí, y el test no probaría nada.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createLogin } from '../src/Login'
import { createLayout } from '../src/Layout'
import type { ProductLogo } from '../src/branding'

const SRC = '/assets/logo-libradesk.png'
const Icono = () => <svg />
// Distinto del de los ítems de navegación a propósito: si fuera el mismo, el
// `getByTestId` del encabezado encontraría también el de "Agenda" y el test
// fallaría por duplicado en vez de por lo que quiere medir.
const IconoDeEncabezado = () => <svg data-testid="icono-de-encabezado" />

function montarLogin(extra: { logo?: ProductLogo; wordmarkClassName?: string } = {}) {
  const Login = createLogin({
    productName: 'LibraDesk',
    productInitial: 'L',
    redirectTo: '/dashboard',
    useAuth: () => ({ login: vi.fn() }),
    ...extra,
  })
  render(<MemoryRouter><Login /></MemoryRouter>)
}

function montarLayout(
  extra: {
    logo?: ProductLogo
    wordmarkClassName?: string
    icon?: typeof Icono
    getUserSubtitle?: (u: { role?: string; name?: string }) => string | undefined
  } = {},
) {
  const Layout = createLayout<{ role?: string; name?: string }>({
    productName: 'LibraDesk',
    productInitial: 'L',
    navItems: [{ to: '/agenda', label: 'Agenda', icon: Icono }],
    useAuth: () => ({ user: { role: 'admin', name: 'Ana' }, logout: vi.fn() }),
    ...extra,
  })
  render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

describe('login: el logo reemplaza a la inicial', () => {
  it('el control — sin logo, la inicial está y no hay imagen', () => {
    montarLogin()
    expect(screen.getByText('L')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('🔴 con logo, aparece la imagen y la inicial desaparece', () => {
    montarLogin({ logo: { src: SRC } })
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', SRC)
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })

  it('el alt por defecto es el nombre del producto, y se puede pisar', () => {
    montarLogin({ logo: { src: SRC } })
    expect(screen.getByRole('img')).toHaveAccessibleName('LibraDesk')
  })

  it('el alt propio gana', () => {
    montarLogin({ logo: { src: SRC, alt: 'Logo de LibraDesk' } })
    expect(screen.getByRole('img')).toHaveAccessibleName('Logo de LibraDesk')
  })

  it('el className del logo se suma al tamaño por defecto y lo pisa', () => {
    // 40 px es el default (h-10 w-10); LibraDesk pide 72.
    montarLogin({ logo: { src: SRC, className: 'h-[72px] w-[72px]' } })
    const img = screen.getByRole('img')
    expect(img.className).toContain('h-[72px]')
    // 🔴 Lo que importa: `cn` mergea y el default NO sobrevive. Si sobreviviera,
    // ganaría el que Tailwind emita último y el tamaño sería impredecible.
    expect(img.className).not.toContain('h-10')
    expect(img.className).not.toContain('w-10')
  })
})

describe('login: el wordmark', () => {
  it('el control — sin wordmarkClassName queda el text-xl de siempre', () => {
    montarLogin()
    expect(screen.getByText('LibraDesk').className).toContain('text-xl')
  })

  it('🔴 las clases del producto pisan el tamaño por defecto', () => {
    montarLogin({ wordmarkClassName: 'font-montserrat font-bold text-[22px] text-[#2d2d2d]' })
    const nombre = screen.getByText('LibraDesk')
    expect(nombre.className).toContain('font-montserrat')
    expect(nombre.className).toContain('text-[#2d2d2d]')
    expect(nombre.className).toContain('text-[22px]')
    expect(nombre.className).not.toContain('text-xl')
  })
})

describe('sidebar: el logo reemplaza a la inicial', () => {
  it('el control — sin logo, la inicial está', () => {
    montarLayout()
    expect(screen.getByText('L')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('🔴 con logo, aparece la imagen y la inicial desaparece', () => {
    montarLayout({ logo: { src: SRC } })
    expect(screen.getByRole('img')).toHaveAttribute('src', SRC)
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })

  it('el control — con `icon` y sin logo, se dibuja el icono', () => {
    montarLayout({ icon: IconoDeEncabezado })
    expect(screen.getByTestId('icono-de-encabezado')).toBeInTheDocument()
  })

  it('🔴 el logo le gana a `icon`: son dos formas de llenar el mismo hueco', () => {
    montarLayout({ icon: IconoDeEncabezado, logo: { src: SRC } })
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.queryByTestId('icono-de-encabezado')).not.toBeInTheDocument()
  })

  it('🔴 las clases del producto pisan el tamaño y el peso del nombre', () => {
    montarLayout({
      logo: { src: SRC, className: 'h-9 w-9' },
      wordmarkClassName: 'font-montserrat font-bold text-[15px] text-[#2d2d2d]',
    })
    const img = screen.getByRole('img')
    expect(img.className).toContain('h-9')
    expect(img.className).not.toContain('h-8')
    const nombre = screen.getByText('LibraDesk')
    expect(nombre.className).toContain('font-bold')
    // `truncate` no está en conflicto con nada, así que sobrevive al merge.
    expect(nombre.className).toContain('truncate')
    expect(nombre.className).not.toContain('font-semibold')
  })
})

describe('el encabezado: las dos lineas contra el alto del logo', () => {
  // La ALTURA no se puede medir aca — jsdom no aplica Tailwind. Esto fija la
  // intencion; el alto real se midio en un navegador (ver el PR).
  it('🔴 las dos lineas llevan interlineado ajustado', () => {
    // Sin esto el bloque suma 36 px (20 del nombre + 16 de la empresa) contra
    // los 32 del box del logo: al encabezado lo estira el TEXTO, no la marca.
    montarLayout({ getUserSubtitle: () => 'Tecno Servicios SRL' })
    expect(screen.getByText('LibraDesk').className).toContain('leading-none')
    expect(screen.getByText('Tecno Servicios SRL').className).toContain('leading-tight')
  })

  it('el control — sin empresa, el nombre igual va ajustado', () => {
    // Los cinco productos que no mandan `getUserSubtitle` tienen una sola linea,
    // y no por eso tiene que quedar con el interlineado suelto.
    montarLayout()
    expect(screen.getByText('LibraDesk').className).toContain('leading-none')
    expect(screen.queryByText('Tecno Servicios SRL')).not.toBeInTheDocument()
  })

  it('🔴 el producto todavia puede pisar el interlineado', () => {
    // El merge de `cn` tiene que seguir dejando decidir al consumidor: si el
    // default ganara, `wordmarkClassName` seria mentira para esta propiedad.
    montarLayout({
      getUserSubtitle: () => 'Tecno Servicios SRL',
      wordmarkClassName: 'leading-loose',
    })
    const nombre = screen.getByText('LibraDesk')
    expect(nombre.className).toContain('leading-loose')
    expect(nombre.className).not.toContain('leading-none')
  })
})

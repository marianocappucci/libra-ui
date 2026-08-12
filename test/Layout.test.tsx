// El menú lateral de los seis productos. Lo que se prueba acá es **quién ve
// qué**, que es lo único de este componente que puede fallar en silencio: un
// ítem de más se ve enseguida, uno de menos parece que el producto no lo tiene.
//
// Agregado el 2026-08-06 con el visitante de la demo: pedido del humano de que
// vea todos los menús "como si fuera admin aunque no deje modificar".
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createLayout } from '../src/Layout'

type Usuario = { role?: string; name?: string; demo_readonly?: boolean }

// El menú renderiza `<item.icon />` sin guarda, así que el icono no es
// opcional en la práctica: pasar items sin él revienta con "Element type is
// invalid". Uno de mentira alcanza — lo que se prueba acá es el filtro.
const Icono = () => <svg />

function montar(user: Usuario | null) {
  const Layout = createLayout<Usuario>({
    productName: 'MedLibra',
    productInitial: 'M',
    navItems: [
      { to: '/agenda', label: 'Agenda', icon: Icono },
      { to: '/pacientes', label: 'Pacientes', icon: Icono },
      { to: '/reportes', label: 'Dashboard', icon: Icono, adminOnly: true },
      { to: '/usuarios', label: 'Usuarios', icon: Icono, adminOnly: true },
      { to: '/configuracion', label: 'Configuración', icon: Icono, adminOnly: true },
    ],
    useAuth: () => ({ user, logout: vi.fn() }),
  })
  // El Layout envuelve a la pantalla: `children` es obligatorio.
  render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

const SIEMPRE = ['Agenda', 'Pacientes']
const DE_ADMIN = ['Dashboard', 'Usuarios', 'Configuración']

describe('quién ve los menús de administración', () => {
  it('un admin los ve', () => {
    montar({ role: 'admin', name: 'Ana' })
    for (const label of [...SIEMPRE, ...DE_ADMIN]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('un staff común NO los ve', () => {
    // La mitad que hace útil al test de abajo: sin esto, "el visitante los ve"
    // podría estar pasando porque el filtro no filtra nada.
    montar({ role: 'staff', name: 'Pedro' })
    for (const label of SIEMPRE) expect(screen.getByText(label)).toBeInTheDocument()
    for (const label of DE_ADMIN) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })

  it('🔴 el visitante de la demo los ve, con su rol intacto', () => {
    // Es el pedido: la demo tiene que mostrarse entera. El backend le abre
    // sólo la lectura, así que ver el menú no le da poder de escribir.
    montar({ role: 'staff', name: 'Visitante', demo_readonly: true })
    for (const label of [...SIEMPRE, ...DE_ADMIN]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('la bandera en false se comporta como un staff cualquiera', () => {
    montar({ role: 'staff', name: 'Pedro', demo_readonly: false })
    for (const label of DE_ADMIN) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })
})

// ── El gate por MÓDULO ────────────────────────────────────────────────────────
//
// Es el que decide si un cliente ve una pantalla que su plan no incluye, y el
// que menos se nota cuando falla: un ítem de más se lo ve enseguida, uno de
// menos parece que el producto no lo tiene. Agregado el 2026-08-12 — la rama
// estaba sin cubrir entera (`Layout.tsx` tenía 37% de ramas).

function montarConModulos(
  user: Usuario | null,
  hasModule?: (u: Usuario, m: string) => boolean,
) {
  const Layout = createLayout<Usuario>({
    productName: 'VentaLibra',
    productInitial: 'V',
    navItems: [
      { to: '/ventas', label: 'Ventas', icon: Icono },
      { to: '/facturacion', label: 'Facturación', icon: Icono, module: 'facturacion' },
      { to: '/stock', label: 'Stock', icon: Icono, module: 'stock' },
    ],
    hasModule,
    useAuth: () => ({ user, logout: vi.fn() }),
  })
  render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

describe('el gate por módulo', () => {
  it('esconde el ítem cuyo módulo el plan no tiene', () => {
    montarConModulos({ role: 'admin' }, (_u, m) => m === 'stock')
    // el que no declara módulo se ve siempre
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    expect(screen.getByText('Stock')).toBeInTheDocument()
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument()
  })

  it('sin `hasModule`, los ítems con módulo se ven', () => {
    // Es el caso de los productos que todavía no gatean por plan: no se les
    // puede esconder media aplicación por no haber pasado la función.
    montarConModulos({ role: 'admin' })
    for (const l of ['Ventas', 'Facturación', 'Stock']) {
      expect(screen.getByText(l)).toBeInTheDocument()
    }
  })

  it('🔴 sin usuario, los ítems con módulo NO se ven', () => {
    // `moduleVisible` devuelve false sin usuario. Importa: durante el arranque
    // el layout puede renderizar antes de que la sesión resuelva, y mostrar
    // ahí un módulo que el cliente no pagó es peor que no mostrar nada.
    montarConModulos(null, () => true)
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument()
    expect(screen.queryByText('Stock')).not.toBeInTheDocument()
  })
})

// ── `hideFor`, secciones y submenús ───────────────────────────────────────────

describe('secciones, hideFor y submenús', () => {
  function montarSecciones(user: Usuario) {
    const Layout = createLayout<Usuario>({
      productName: 'LibraDesk',
      productInitial: 'L',
      navSections: [
        {
          label: 'Operación',
          items: [
            { to: '/tickets', label: 'Tickets', icon: Icono },
            { to: '/equipos', label: 'Equipos', icon: Icono, hideFor: (u) => u.role === 'staff' },
          ],
        },
        {
          label: 'Sólo dueños',
          hideFor: (u) => u.role !== 'admin',
          items: [{ to: '/rentabilidad', label: 'Rentabilidad', icon: Icono }],
        },
      ],
      useAuth: () => ({ user, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
  }

  it('un admin ve las dos secciones enteras', () => {
    montarSecciones({ role: 'admin' })
    expect(screen.getByText('Operación')).toBeInTheDocument()
    expect(screen.getByText('Sólo dueños')).toBeInTheDocument()
    expect(screen.getByText('Rentabilidad')).toBeInTheDocument()
    expect(screen.getByText('Equipos')).toBeInTheDocument()
  })

  it('`hideFor` esconde el ítem y, si vacía la sección, también el título', () => {
    // Las dos mitades juntas: sin la segunda, una sección vacía dejaría un
    // encabezado colgado sin nada debajo.
    montarSecciones({ role: 'staff' })
    expect(screen.getByText('Tickets')).toBeInTheDocument()
    expect(screen.queryByText('Equipos')).not.toBeInTheDocument()
    expect(screen.queryByText('Sólo dueños')).not.toBeInTheDocument()
    expect(screen.queryByText('Rentabilidad')).not.toBeInTheDocument()
  })

  it('el submenú se filtra por módulo, igual que el ítem padre', () => {
    const Layout = createLayout<Usuario>({
      productName: 'Contalibra',
      productInitial: 'C',
      navItems: [{
        to: '/ventas', label: 'Ventas', icon: Icono,
        children: [
          { to: '/ventas/pos', label: 'POS' },
          { to: '/ventas/remitos', label: 'Remitos', module: 'remitos' },
        ],
      }],
      hasModule: () => false,
      useAuth: () => ({ user: { role: 'admin' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    expect(screen.getByText('POS')).toBeInTheDocument()
    expect(screen.queryByText('Remitos')).not.toBeInTheDocument()
  })

  it('el badge sale sólo cuando la función devuelve algo', () => {
    const Layout = createLayout<Usuario>({
      productName: 'LibraDesk',
      productInitial: 'L',
      navItems: [
        { to: '/pendientes', label: 'Pendientes', icon: Icono, badge: () => 7 },
        { to: '/cerrados', label: 'Cerrados', icon: Icono, badge: () => null },
      ],
      useAuth: () => ({ user: { role: 'admin' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    expect(screen.getByText('7')).toBeInTheDocument()
    // el de `null` no tiene que dejar un badge vacío colgado
    expect(screen.getByText('Cerrados')).toBeInTheDocument()
  })
})

// ── La cabecera ───────────────────────────────────────────────────────────────

describe('la cabecera del menú', () => {
  it('sin `icon` usa la inicial del producto', () => {
    const Layout = createLayout<Usuario>({
      productName: 'MedLibra', productInitial: 'M',
      navItems: [{ to: '/a', label: 'Agenda', icon: Icono }],
      useAuth: () => ({ user: { role: 'admin', name: 'Ana Perez' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('con `getUserSubtitle` lo muestra, y con el nombre arma las iniciales', () => {
    const Layout = createLayout<Usuario>({
      productName: 'MedLibra', productInitial: 'M',
      navItems: [{ to: '/a', label: 'Agenda', icon: Icono }],
      getUserName: (u) => u.name ?? '',
      getUserSubtitle: () => 'Consultorio Central',
      useAuth: () => ({ user: { role: 'admin', name: 'Ana Perez' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    expect(screen.getByText('Consultorio Central')).toBeInTheDocument()
    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
  })
})

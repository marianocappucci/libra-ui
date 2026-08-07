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

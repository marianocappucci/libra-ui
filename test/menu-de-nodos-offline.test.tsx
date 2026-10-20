// La entrada «Sucursal sin internet» del menú (ADR-080, punto 5; ADR-085): LibraEdge está incluido en todos los planes,
// así que se ve SIEMPRE para el administrador y el layout ya no le pregunta nada al backend.
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLayout } from '../src/Layout'
import {
  RUTA_MENU_DE_NODOS_OFFLINE, consultarMenuDeNodosOffline, refrescarMenuDeNodosOffline, useMenuDeNodosOffline,
} from '../src/menu-de-nodos-offline'

type Usuario = { role?: string; demo_readonly?: boolean }
const Icono = () => <svg />

let fetchMock: ReturnType<typeof vi.fn>

function montar(user: Usuario | null) {
  const Layout = createLayout<Usuario>({
    productName: 'VentaLibra',
    productInitial: 'V',
    navItems: [
      { to: '/usuarios', label: 'Usuarios', icon: Icono, adminOnly: true },
      { to: '/sucursal-sin-internet', label: 'Sucursal sin internet', icon: Icono, adminOnly: true, nodosOffline: true },
    ],
    useAuth: () => ({ user, logout: vi.fn() }),
  })
  return render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('la entrada «Sucursal sin internet»', () => {
  it('se ve siempre para el administrador, sin preguntarle al backend', () => {
    montar({ role: 'admin' })
    expect(screen.getByText('Sucursal sin internet')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter((c) => c[0] === RUTA_MENU_DE_NODOS_OFFLINE)).toHaveLength(0)
  })

  it('también para el visitante de una demo, que ve los menús de administración', () => {
    montar({ role: 'cajero', demo_readonly: true })
    expect(screen.getByText('Sucursal sin internet')).toBeInTheDocument()
  })

  it('un no admin no la ve', () => {
    montar({ role: 'cajero' })
    expect(screen.queryByText('Sucursal sin internet')).not.toBeInTheDocument()
  })

  it('las funciones viejas quedan por compatibilidad y no piden nada', () => {
    consultarMenuDeNodosOffline()
    refrescarMenuDeNodosOffline()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useMenuDeNodosOffline(true)).toBe(true)
    expect(useMenuDeNodosOffline(false)).toBe(false)
  })
})

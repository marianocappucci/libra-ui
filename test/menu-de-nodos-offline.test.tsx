// La entrada «Sucursal sin internet» del menú (ADR-080, punto 5): se ve con el adicional `offline` **o** con nodos
// activos, según `GET /api/nodos-offline/menu`, pedido UNA vez por página y sólo para un admin.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLayout } from '../src/Layout'
import {
  RUTA_MENU_DE_NODOS_OFFLINE, _reiniciarMenuDeNodosOffline, refrescarMenuDeNodosOffline,
} from '../src/menu-de-nodos-offline'

type Usuario = { role?: string }
const Icono = () => <svg />

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function responder(visible: boolean, status = 200) {
  fetchMock.mockImplementation(() => Promise.resolve(
    status === 200 ? json({ contratado: false, nodos_activos: visible ? 1 : 0, visible }) : json({ detail: 'x' }, status),
  ))
}

function montar(user: Usuario | null, conEntrada = true) {
  const Layout = createLayout<Usuario>({
    productName: 'VentaLibra',
    productInitial: 'V',
    navItems: [
      { to: '/usuarios', label: 'Usuarios', icon: Icono, adminOnly: true },
      ...(conEntrada ? [{ to: '/sucursal-sin-internet', label: 'Sucursal sin internet', icon: Icono, adminOnly: true, nodosOffline: true }] : []),
    ],
    useAuth: () => ({ user, logout: vi.fn() }),
  })
  return render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

const pedidos = () => fetchMock.mock.calls.filter((c) => c[0] === RUTA_MENU_DE_NODOS_OFFLINE).length

beforeEach(() => {
  _reiniciarMenuDeNodosOffline()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('la entrada «Sucursal sin internet»', () => {
  it('se ve cuando el backend dice visible (adicional contratado o nodos activos)', async () => {
    responder(true)
    montar({ role: 'admin' })
    expect(await screen.findByText('Sucursal sin internet')).toBeInTheDocument()
    expect(screen.getByText('Usuarios')).toBeInTheDocument()
  })

  it('no se ve sin adicional ni nodos activos', async () => {
    responder(false)
    montar({ role: 'admin' })
    await waitFor(() => expect(pedidos()).toBe(1))
    expect(screen.queryByText('Sucursal sin internet')).not.toBeInTheDocument()
  })

  it('no se ve si la consulta falla (un 403, un 404 o la red)', async () => {
    responder(true, 403)
    montar({ role: 'admin' })
    await waitFor(() => expect(pedidos()).toBe(1))
    expect(screen.queryByText('Sucursal sin internet')).not.toBeInTheDocument()
  })

  it('🔴 se pide UNA sola vez por página, aunque el layout se vuelva a montar', async () => {
    responder(true)
    const { unmount } = montar({ role: 'admin' })
    expect(await screen.findByText('Sucursal sin internet')).toBeInTheDocument()
    unmount()
    montar({ role: 'admin' })
    expect(await screen.findByText('Sucursal sin internet')).toBeInTheDocument()
    expect(pedidos()).toBe(1)
  })

  it('un no admin no la ve y no pide nada; sin la entrada en el menú tampoco se pide', async () => {
    responder(true)
    montar({ role: 'cajero' })
    cleanup()
    montar({ role: 'admin' }, false)
    await new Promise((r) => setTimeout(r, 0))
    expect(pedidos()).toBe(0)
    expect(screen.queryByText('Sucursal sin internet')).not.toBeInTheDocument()
  })

  it('refrescar vuelve a preguntar: dar de baja el último nodo sin el adicional la esconde', async () => {
    responder(true)
    montar({ role: 'admin' })
    expect(await screen.findByText('Sucursal sin internet')).toBeInTheDocument()
    responder(false)
    await act(async () => { refrescarMenuDeNodosOffline() })
    await waitFor(() => expect(screen.queryByText('Sucursal sin internet')).not.toBeInTheDocument())
    expect(pedidos()).toBe(2)
  })
})

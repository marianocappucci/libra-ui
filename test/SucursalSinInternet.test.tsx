// «Sucursal sin internet» (ADR-080): el alta del nodo de LibraEdge desde el central.
//
// Lo que más importa: la carga del nodo trae el secreto y **no pasa por la pantalla**. Se baja como Blob y se guarda
// tal cual; ni el texto de la carga ni el secreto aparecen en el documento.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nombreDeArchivo } from '../src/api-client'
import {
  SucursalSinInternet, TEXTO_SIN_ADICIONAL, nombreDelProducto, ultimaSincronizacion,
  type EstadoNodosOffline,
} from '../src/SucursalSinInternet'

const SECRETO = 'secreto-de-prueba-que-no-se-muestra'

const ESTADO: EstadoNodosOffline = {
  producto: 'ventalibra',
  contratado: true,
  instalador_url: 'https://github.com/marianocappucci/libraedge/releases/latest/download/libraedge-nodo-ventalibra.exe',
  central_url: 'https://demo.ventalibra.com.ar',
  central_url_error: null,
  emisor_faltan: [],
  emisor_error: null,
  umbral_minutos: 15,
  sucursales: [
    { id: '1', nombre: 'Centro', activa: true, nodo: 'nodo-1-abc123' },
    { id: '2', nombre: 'Norte', activa: true, nodo: null },
    { id: '3', nombre: 'Cerrada', activa: false, nodo: null },
  ],
  nodos: [
    {
      node_id: 'nodo-1-abc123', sucursal_id: '1', sucursal: 'Centro', prefijo: 'S01', activo: true,
      registrado: '2026-10-19T10:00:00+00:00', ultima_sincronizacion: '2026-10-19T12:00:00+00:00',
      minutos_sin_verse: 3, estado: 'al_dia',
    },
    {
      node_id: 'nodo-1-viejo1', sucursal_id: '1', sucursal: 'Centro', prefijo: 'S01B', activo: false,
      registrado: null, ultima_sincronizacion: null, minutos_sin_verse: null, estado: 'baja',
    },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>
let guardados: { nombre: string; blob: Blob }[]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function carga(nodeId: string) {
  return new Response(JSON.stringify({ formato: 'libraedge-carga/1', entorno: { LIBRAEDGE_NODE_SECRET: SECRETO } }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="carga-nodo-${nodeId}.json"`,
      'x-libraedge-node-id': nodeId,
      'x-libraedge-prefijo': 'S02',
    },
  })
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  guardados = []
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:prueba'),
    revokeObjectURL: vi.fn(),
  }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    guardados.push({ nombre: this.download, blob: (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function responder(estado: EstadoNodosOffline, extra?: (url: string, init?: RequestInit) => Response | undefined) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const propia = extra?.(url, init)
    return Promise.resolve(propia ?? json(estado))
  })
}

async function montar(estado = ESTADO, extra?: Parameters<typeof responder>[1]) {
  responder(estado, extra)
  render(<SucursalSinInternet />)
  await waitFor(() => expect(screen.getByText('1. El instalador')).toBeInTheDocument())
}

describe('la pantalla', () => {
  it('ofrece el instalador del producto y lista sucursales activas y nodos con su estado', async () => {
    await montar()
    const link = screen.getByRole('link', { name: /Descargar el instalador de VentaLibra/ })
    expect(link).toHaveAttribute('href', ESTADO.instalador_url)

    const sucursales = screen.getByRole('list', { name: 'Sucursales' })
    expect(within(sucursales).getByText('Centro')).toBeInTheDocument()
    expect(within(sucursales).getByText('Nodo nodo-1-abc123')).toBeInTheDocument()
    expect(within(sucursales).queryByText('Cerrada')).not.toBeInTheDocument()
    expect(within(sucursales).getAllByRole('button', { name: /Dar de alta el nodo/ })).toHaveLength(1)

    const nodos = screen.getByRole('list', { name: 'Nodos' })
    expect(within(nodos).getByText('Al día')).toBeInTheDocument()
    expect(within(nodos).getByText('Dado de baja')).toBeInTheDocument()
    expect(within(nodos).getByText(/prefijo S01 · última sincronización/)).toBeInTheDocument()
    expect(within(nodos).getByText('hace 3 min')).toBeInTheDocument()
    // Un nodo dado de baja no ofrece acciones.
    expect(within(nodos).getAllByRole('button', { name: /Dar de baja/ })).toHaveLength(1)
  })

  it('sin el adicional lo explica y no deja dar de alta', async () => {
    await montar({ ...ESTADO, contratado: false })
    expect(screen.getByText(TEXTO_SIN_ADICIONAL)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dar de alta el nodo/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Carga nueva/ })).toBeDisabled()
    // Dar de baja sigue: un nodo instalado se tiene que poder revocar igual.
    expect(screen.getByRole('button', { name: /Dar de baja/ })).toBeEnabled()
  })

  it('sin URL del central o con el CUIT mal cargado no deja emitir', async () => {
    await montar({ ...ESTADO, central_url: null, central_url_error: 'Definir LIBRAEDGE_CENTRAL_URL.' })
    expect(screen.getByText('Definir LIBRAEDGE_CENTRAL_URL.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dar de alta el nodo/ })).toBeDisabled()
  })

  it('avisa si faltan los datos de la empresa para facturar', async () => {
    await montar({ ...ESTADO, emisor_faltan: ['empresa_cuit'] })
    expect(screen.getByText(/no va a\s+poder facturar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dar de alta el nodo/ })).toBeEnabled()
  })

  it('un error al cargar se muestra', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'No tenés permiso para hacer esto.' }, 403))
    render(<SucursalSinInternet />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso')
  })
})

describe('🔴 la carga del nodo', () => {
  it('el alta baja la carga como archivo y el secreto no aparece en la pantalla', async () => {
    const usuario = userEvent.setup()
    await montar(ESTADO, (_url, init) => (init?.method === 'POST' ? carga('nodo-2-def456') : undefined))
    await usuario.click(screen.getByRole('button', { name: /Dar de alta el nodo/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('una sola vez')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Dar de alta y descargar la carga' }))

    await waitFor(() => expect(guardados).toHaveLength(1))
    expect(guardados[0].nombre).toBe('carga-nodo-nodo-2-def456.json')
    expect(guardados[0].blob.size).toBeGreaterThan(0)  // el archivo entero, tal cual vino
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(post[0]).toBe('/api/nodos-offline')
    expect(JSON.parse(post[1].body)).toEqual({ sucursal_id: '2' })

    expect(await screen.findByRole('status')).toHaveTextContent('Se descargó la carga del nodo nodo-2-def456 (prefijo S02)')
    expect(document.body.textContent).not.toContain(SECRETO)
    expect(document.body.innerHTML).not.toContain(SECRETO)
  })

  it('un rechazo del motor se muestra en el diálogo y no descarga nada', async () => {
    const usuario = userEvent.setup()
    await montar(ESTADO, (_url, init) => (init?.method === 'POST'
      ? json({ detail: { codigo: 'adicional_offline', mensaje: 'El plan no incluye «Modo offline».' } }, 403)
      : undefined))
    await usuario.click(screen.getByRole('button', { name: /Dar de alta el nodo/ }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Dar de alta y descargar/ }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('El plan no incluye «Modo offline».')
    expect(guardados).toHaveLength(0)
  })

  it('una carga nueva va a la ruta del nodo y avisa que invalida la anterior', async () => {
    const usuario = userEvent.setup()
    await montar(ESTADO, (_url, init) => (init?.method === 'POST' ? carga('nodo-1-abc123') : undefined))
    await usuario.click(screen.getByRole('button', { name: /Carga nueva/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('La carga anterior deja de servir')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Emitir y descargar' }))
    await waitFor(() => expect(guardados).toHaveLength(1))
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(post[0]).toBe('/api/nodos-offline/nodo-1-abc123/carga')
  })
})

describe('la baja', () => {
  it('pide confirmación y llama al DELETE del nodo', async () => {
    const usuario = userEvent.setup()
    await montar(ESTADO, (_url, init) => (init?.method === 'DELETE' ? json({ node_id: 'nodo-1-abc123', ya_estaba: false }) : undefined))
    await usuario.click(screen.getByRole('button', { name: /Dar de baja/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('No se puede deshacer')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }))
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true))
    const del = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE')!
    expect(del[0]).toBe('/api/nodos-offline/nodo-1-abc123')
    expect(await screen.findByRole('status')).toHaveTextContent('quedó dado de baja')
  })
})

describe('piezas', () => {
  it('el nombre del archivo sale del Content-Disposition', () => {
    expect(nombreDeArchivo('attachment; filename="carga-nodo-x.json"')).toBe('carga-nodo-x.json')
    expect(nombreDeArchivo('attachment; filename=otra.json')).toBe('otra.json')
    expect(nombreDeArchivo(null)).toBeNull()
    expect(nombreDeArchivo('inline')).toBeNull()
  })

  it('la última sincronización en palabras', () => {
    expect(ultimaSincronizacion({ ultima_sincronizacion: null, minutos_sin_verse: null })).toBe('Nunca')
    expect(ultimaSincronizacion({ ultima_sincronizacion: 'x', minutos_sin_verse: 1 })).toBe('Recién')
    expect(ultimaSincronizacion({ ultima_sincronizacion: 'x', minutos_sin_verse: 45 })).toBe('Hace 45 min')
    expect(ultimaSincronizacion({ ultima_sincronizacion: 'x', minutos_sin_verse: 150 })).toBe('Hace 2,5 h')
    expect(ultimaSincronizacion({ ultima_sincronizacion: '2026-10-15T15:30:00-03:00', minutos_sin_verse: 5000 }))
      .toBe('15-10-2026 15:30')
  })

  it('el nombre del producto', () => {
    expect(nombreDelProducto('contalibra')).toBe('ContaLibra')
    expect(nombreDelProducto('otro')).toBe('otro')
  })
})

// «Sucursal sin internet» (ADR-080 y ADR-085): el alta del nodo de LibraEdge desde el central.
//
// Lo que más importa: el secreto del nodo **no pasa por la pantalla**. Con el código (ADR-085) la pantalla muestra la
// dirección y un código de un solo uso, y el secreto sale recién en el canje del instalador; con el archivo de soporte
// la carga se baja como Blob y se guarda tal cual. LibraEdge está incluido en todos los planes: no hay adicional.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nombreDeArchivo } from '../src/api-client'
import {
  CLAVE_DE_LA_SECCION, PUERTO_DEL_NODO, SucursalSinInternet, TEXTO_PUESTO, TEXTO_CODIGO, comandoDeUbuntu,
  descargasDePuesto, descargasDelNodo,
  nombreDelProducto, seccionSucursalSinInternet, textoEntrarPorLaCopiaLocal, ultimaSincronizacion,
  type CodigoDeVinculacion, type EstadoNodosOffline,
} from '../src/SucursalSinInternet'

const SECRETO = 'secreto-de-prueba-que-no-se-muestra'

const ESTADO: EstadoNodosOffline = {
  producto: 'ventalibra',
  contratado: true,
  instalador_url: 'https://github.com/marianocappucci/libraedge/releases/latest/download/libraedge-nodo-ventalibra.exe',
  central_url: 'https://demo.ventalibra.com.ar',
  central_url_error: null,
  direccion: 'demo.ventalibra.com.ar',
  vinculacion_minutos: 15,
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

const CODIGO: CodigoDeVinculacion = {
  node_id: 'nodo-2-def456', prefijo: 'S02', sucursal: { id: '2', nombre: 'Norte' },
  direccion: 'demo.ventalibra.com.ar', central_url: 'https://demo.ventalibra.com.ar',
  codigo: 'K7Q4-M2XP', vence: '2026-10-20T18:15:00+00:00', vinculacion_minutos: 15,
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
  await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())
}

const RELEASES = 'https://github.com/marianocappucci/libraedge/releases/latest/download'

describe('la pantalla', () => {
  it('ofrece el instalador del producto y lista sucursales activas y nodos con su estado', async () => {
    await montar()
    expect(screen.getByRole('heading', { name: 'Sucursal sin internet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Instalador de VentaLibra para Windows/ }))
      .toHaveAttribute('href', ESTADO.instalador_url)
    expect(screen.getByRole('link', { name: /Paquete de VentaLibra para Ubuntu/ }))
      .toHaveAttribute('href', `${RELEASES}/libraedge-nodo-ventalibra_amd64.deb`)
    expect(screen.getByText(
      `curl -fsSL ${RELEASES}/instalar-nodo.sh | sudo bash -s ventalibra --codigo <código> --direccion <dirección>`,
    )).toBeInTheDocument()
    expect(screen.getByText(/Está incluido en tu plan/)).toBeInTheDocument()

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

  it('🔴 LibraEdge está incluido en todos los planes: aunque un backend viejo diga contratado=false, ofrece todo', async () => {
    await montar({ ...ESTADO, contratado: false })
    expect(screen.getByText('1. El instalador')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dar de alta el nodo/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Código nuevo/ })).toBeEnabled()
    expect(screen.queryByText(/adicional/i)).not.toBeInTheDocument()
  })

  it('sin ningún nodo igual ofrece el instalador y el alta', async () => {
    await montar({ ...ESTADO, nodos: [] })
    expect(screen.getByText('Todavía no hay ningún nodo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Instalador de VentaLibra para Windows/ })).toBeInTheDocument()
  })

  it('un nodo con un código pendiente lo dice, con su vencimiento, y ofrece anularlo', async () => {
    await montar({
      ...ESTADO,
      nodos: [{ ...ESTADO.nodos[0], vinculacion: { vence: '2026-10-20T18:15:00+00:00' } }, ESTADO.nodos[1]],
    })
    const nodos = screen.getByRole('list', { name: 'Nodos' })
    expect(within(nodos).getByText('Código pendiente hasta las 15:15')).toBeInTheDocument()
    expect(within(nodos).getByRole('button', { name: /Anular código/ })).toBeInTheDocument()
  })

  it('sin URL del central o con el CUIT mal cargado no deja emitir', async () => {
    await montar({ ...ESTADO, central_url: null, central_url_error: 'Definir LIBRAEDGE_CENTRAL_URL.' })
    expect(screen.getByText('Definir LIBRAEDGE_CENTRAL_URL.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dar de alta el nodo/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Código nuevo/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Archivo de carga/ })).toBeDisabled()
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

describe('las otras PC del local: la app de puesto (ADR-086)', () => {
  it('la tarjeta del instalador ofrece la app de puesto con una línea de para qué es', async () => {
    await montar()
    const puesto = document.querySelector('[data-descargas="puesto"]') as HTMLElement
    expect(puesto).not.toBeNull()
    expect(within(puesto).getByRole('heading', { name: 'Para las otras PC del local' })).toBeInTheDocument()
    expect(puesto).toHaveTextContent(TEXTO_PUESTO)
    expect(within(puesto).getByRole('link', { name: /VentaLibra para otro puesto \(Windows\)/ }))
      .toHaveAttribute('href', `${RELEASES}/libraedge-puesto-ventalibra.exe`)
    expect(within(puesto).getByRole('link', { name: /VentaLibra para otro puesto \(Ubuntu\)/ }))
      .toHaveAttribute('href', `${RELEASES}/libraedge-puesto-ventalibra_amd64.deb`)
  })

  it('con un instalador servido de otro lado no se inventa el puesto', async () => {
    await montar({ ...ESTADO, instalador_url: 'https://otro.lado/instalador.exe' })
    expect(document.querySelector('[data-descargas="puesto"]')).toBeNull()
  })

  it('las descargas de puesto salen del instalador del nodo, o del backend si las manda', () => {
    expect(descargasDePuesto(ESTADO)).toEqual({
      windows: `${RELEASES}/libraedge-puesto-ventalibra.exe`,
      ubuntu: `${RELEASES}/libraedge-puesto-ventalibra_amd64.deb`,
    })
    expect(descargasDePuesto({ instalador_url: 'https://otro.lado/instalador.exe' })).toBeNull()
    expect(descargasDePuesto({
      instalador_url: 'https://otro.lado/instalador.exe', puesto_url: 'https://otro.lado/c.exe',
      puesto_deb_url: 'https://otro.lado/c.deb',
    })).toEqual({ windows: 'https://otro.lado/c.exe', ubuntu: 'https://otro.lado/c.deb' })
  })
})

describe('🔴 en el local se entra por la copia local (ADR-084)', () => {
  it('la tarjeta del instalador lo dice con el acceso directo del producto y las dos direcciones', async () => {
    await montar()
    const aviso = screen.getByRole('note')
    expect(aviso).toHaveTextContent(textoEntrarPorLaCopiaLocal('VentaLibra'))
    expect(aviso).toHaveTextContent('entrá siempre por la copia local, aunque haya internet')
    expect(aviso).toHaveTextContent('el acceso directo «VentaLibra» que deja el instalador')
    expect(aviso).toHaveTextContent('http://localhost:8000')
    expect(aviso).toHaveTextContent('http://<IP de esa PC>:8000')
    expect(aviso).toHaveTextContent('desde los otros puestos, con la app de puesto, que encuentra sola esa PC en la red')
    expect(aviso).toHaveTextContent('La dirección de la nube es para entrar desde afuera del local.')
  })

  it('el alta del nodo lo repite antes de mostrar el código', async () => {
    const usuario = userEvent.setup()
    await montar()
    await usuario.click(screen.getByRole('button', { name: /Dar de alta el nodo/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('note')).toHaveTextContent(textoEntrarPorLaCopiaLocal('VentaLibra'))
  })

  it('el código nuevo y la baja no lo repiten', async () => {
    const usuario = userEvent.setup()
    await montar()
    await usuario.click(screen.getByRole('button', { name: /Código nuevo/ }))
    expect(within(await screen.findByRole('dialog')).queryByRole('note')).not.toBeInTheDocument()
  })

  it('el puerto sale del backend si lo manda', async () => {
    await montar({ ...ESTADO, puerto_local: 8100 })
    expect(screen.getByRole('note')).toHaveTextContent('http://localhost:8100')
    expect(screen.getByRole('note')).toHaveTextContent('http://<IP de esa PC>:8100')
    expect(PUERTO_DEL_NODO).toBe(8000)
  })
})

describe('🔴 el código de vinculación (ADR-085)', () => {
  function conCodigo(url: string, init?: RequestInit) {
    if (init?.method === 'POST' && url.endsWith('/vinculacion')) return json(CODIGO)
    if (init?.method === 'DELETE' && url.endsWith('/vinculacion')) return json({ node_id: CODIGO.node_id, anulados: 1 })
    return undefined
  }

  it('el alta muestra la dirección y el código para el instalador, sin el secreto', async () => {
    const usuario = userEvent.setup()
    await montar(ESTADO, conCodigo)
    await usuario.click(screen.getByRole('button', { name: /Dar de alta el nodo/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('15 minutos y una sola vez')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Dar de alta y ver el código' }))

    const tarjeta = await screen.findByLabelText('Código de vinculación')
    expect(tarjeta).toHaveTextContent('Vincular el nodo de Norte')
    expect(tarjeta).toHaveTextContent(TEXTO_CODIGO)
    expect(within(tarjeta).getByText('demo.ventalibra.com.ar')).toBeInTheDocument()
    expect(within(tarjeta).getByText('K7Q4-M2XP')).toBeInTheDocument()
    expect(tarjeta).toHaveTextContent('Vence a las 15:15 (15 minutos) y sirve una sola vez.')
    expect(within(tarjeta).getByText(
      `curl -fsSL ${RELEASES}/instalar-nodo.sh | sudo bash -s ventalibra --codigo K7Q4-M2XP --direccion demo.ventalibra.com.ar`,
    )).toBeInTheDocument()
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(post[0]).toBe('/api/nodos-offline/vinculacion')
    expect(JSON.parse(post[1].body)).toEqual({ sucursal_id: '2' })
    // Nada se descargó y el secreto no existe en esta respuesta.
    expect(guardados).toHaveLength(0)
    expect(document.body.innerHTML).not.toContain('SECRET')
  })

  it('copiar el código usa el portapapeles', async () => {
    const usuario = userEvent.setup()
    const escribir = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true })
    await montar(ESTADO, conCodigo)
    await usuario.click(screen.getByRole('button', { name: /Dar de alta el nodo/ }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dar de alta y ver el código' }))
    await usuario.click(await screen.findByRole('button', { name: 'Copiar código' }))
    expect(escribir).toHaveBeenCalledWith('K7Q4-M2XP')
    await usuario.click(screen.getByRole('button', { name: 'Copiar dirección' }))
    expect(escribir).toHaveBeenCalledWith('demo.ventalibra.com.ar')
  })

  it('pedir otro código y anularlo van a las rutas del nodo', async () => {
    const usuario = userEvent.setup()
    await montar(ESTADO, conCodigo)
    await usuario.click(screen.getByRole('button', { name: /Código nuevo/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('sigue funcionando hasta que se instale con el código nuevo')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Pedir el código' }))
    expect(await screen.findByText('K7Q4-M2XP')).toBeInTheDocument()
    expect(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![0]).toBe('/api/nodos-offline/nodo-1-abc123/vinculacion')

    await usuario.click(screen.getByRole('button', { name: /Pedir otro código/ }))
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(2))
    await usuario.click(screen.getByRole('button', { name: /Anular el código/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true))
    expect(fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE')![0]).toBe('/api/nodos-offline/nodo-2-def456/vinculacion')
    expect(await screen.findByRole('status')).toHaveTextContent('quedó anulado')
    expect(screen.queryByText('K7Q4-M2XP')).not.toBeInTheDocument()
  })

  it('un rechazo del motor se muestra en el diálogo y no muestra ningún código', async () => {
    const usuario = userEvent.setup()
    await montar(ESTADO, (_url, init) => (init?.method === 'POST'
      ? json({ detail: { codigo: 'sucursal_con_nodo', mensaje: 'La sucursal ya tiene un nodo.' } }, 409)
      : undefined))
    await usuario.click(screen.getByRole('button', { name: /Dar de alta el nodo/ }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Dar de alta y ver el código/ }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('La sucursal ya tiene un nodo.')
    expect(screen.queryByLabelText('Código de vinculación')).not.toBeInTheDocument()
  })
})

describe('🔴 el archivo de carga (soporte)', () => {
  it('baja la carga como archivo y el secreto no aparece en la pantalla', async () => {
    const usuario = userEvent.setup()
    await montar(ESTADO, (_url, init) => (init?.method === 'POST' ? carga('nodo-1-abc123') : undefined))
    await usuario.click(screen.getByRole('button', { name: /Archivo de carga/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('una sola vez')
    expect(dialogo).toHaveTextContent('el código pendiente dejan de servir')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Emitir y descargar' }))

    await waitFor(() => expect(guardados).toHaveLength(1))
    expect(guardados[0].nombre).toBe('carga-nodo-nodo-1-abc123.json')
    expect(guardados[0].blob.size).toBeGreaterThan(0)  // el archivo entero, tal cual vino
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(post[0]).toBe('/api/nodos-offline/nodo-1-abc123/carga')

    expect(await screen.findByRole('status')).toHaveTextContent('Se descargó la carga del nodo nodo-1-abc123 (prefijo S02)')
    expect(document.body.textContent).not.toContain(SECRETO)
    expect(document.body.innerHTML).not.toContain(SECRETO)
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

describe('en Configuración (ADR-082)', () => {
  it('la sección no repite el título de pantalla y tiene su clave para ?seccion=', async () => {
    const seccion = seccionSucursalSinInternet()
    expect(seccion).toMatchObject({ clave: CLAVE_DE_LA_SECCION, label: 'Sucursal sin internet' })
    expect(CLAVE_DE_LA_SECCION).toBe('sucursal-sin-internet')
    responder(ESTADO)
    render(<>{seccion.contenido}</>)
    await waitFor(() => expect(screen.getByText('1. El instalador')).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Sucursal sin internet' })).not.toBeInTheDocument()
  })

  it('la ruta propia del producto llega a la sección', async () => {
    responder(ESTADO)
    render(<>{seccionSucursalSinInternet({ ruta: '/api/otra/nodos' }).contenido}</>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/otra/nodos')
  })
})

describe('piezas', () => {
  it('las descargas salen del instalador de Windows, o del backend si las manda', () => {
    expect(descargasDelNodo(ESTADO)).toEqual({
      windows: ESTADO.instalador_url,
      ubuntu: `${RELEASES}/libraedge-nodo-ventalibra_amd64.deb`,
      script: `${RELEASES}/instalar-nodo.sh`,
    })
    expect(descargasDelNodo({ instalador_url: 'https://otro.lado/instalador.exe' }))
      .toEqual({ windows: 'https://otro.lado/instalador.exe', ubuntu: null, script: null })
    expect(descargasDelNodo({
      instalador_url: 'https://otro.lado/instalador.exe', instalador_deb_url: 'https://otro.lado/x.deb',
      instalar_script_url: 'https://otro.lado/i.sh',
    })).toEqual({ windows: 'https://otro.lado/instalador.exe', ubuntu: 'https://otro.lado/x.deb', script: 'https://otro.lado/i.sh' })
    expect(comandoDeUbuntu('https://x/i.sh', 'contalibra'))
      .toBe('curl -fsSL https://x/i.sh | sudo bash -s contalibra --codigo <código> --direccion <dirección>')
    expect(comandoDeUbuntu('https://x/i.sh', 'contalibra', 'K7Q4-M2XP', 'sistema.contalibra.com.ar'))
      .toBe('curl -fsSL https://x/i.sh | sudo bash -s contalibra --codigo K7Q4-M2XP --direccion sistema.contalibra.com.ar')
  })

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

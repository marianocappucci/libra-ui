// LibraEdge en la pantalla (ADR-077; el motor es ADR-074 de libracore): la consulta compartida de la conexión del nodo,
// el cartel «sin conexión», el QR apagado, el 409 `factura_pendiente` como aviso y las piezas de la bandeja.
import { useState } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../src/api-client'
import {
  BotonFacturarPendientesDelNodo, CartelSinConexion, EtiquetaVentaSinConexion,
} from '../src/CartelSinConexion'
import { createLayout } from '../src/Layout'
import { LineasDePago } from '../src/comercio/LineasDePago'
import { Ventas } from '../src/comercio/Ventas'
import { VentaDetalle } from '../src/comercio/VentaDetalle'
import { _resetCacheDeMedios } from '../src/comercio/medios-pago'
import { MEDIO_DEL_QR, lineaVacia, type LineaDePago } from '../src/comercio/pagos'
import type { Venta } from '../src/comercio/tipos'
import {
  INTERVALO_CONEXION_MS, MENSAJE_QR_SIN_CONEXION, RUTA_CONEXION_DEL_NODO, TEXTO_CARTEL_SIN_CONEXION,
  _reiniciarConexionDelNodo, codigoDelError, consultarConexionDelNodo, esVentaSinConexion, marcarSinConexion,
  refrescarConexionDelNodo, useConexionDelNodo, ventasParaFacturar,
} from '../src/nodo-offline'

// Datos ficticios.
const VENTA: Venta = {
  id: 7, numero: 'V-00007', fecha: '2026-09-06', items: [{ nombre: 'Yerba', qty: 2, precio: 100, subtotal: 200, producto_id: 3 }],
  subtotal: 200, descuento: 0, total: 200, cliente_id: null, cliente_nombre: '', observaciones: '',
  estado: 'cobrada', pagos: [{ medio: 'efectivo', monto: 200, referencia: '' }],
  factura_id: null, factura_display: null, remito_id: null, mp_order_id: '', mp_payment_id: '',
}
const CON_QR: Venta = {
  ...VENTA, id: 8, numero: 'V-00008', estado: 'pendiente', pagos: [{ medio: 'mercadopago', monto: 200, referencia: '', estado: 'pendiente' }],
}
const MEDIOS = [{ id: 'efectivo', label: 'Efectivo' }, { id: 'mercadopago', label: 'MercadoPago' }]
const NODO_SIN_CONEXION = { es_nodo: true, en_linea: false, node_id: 'nodo-demo-1', a_facturar: 3 }
const NODO_EN_LINEA = { ...NODO_SIN_CONEXION, en_linea: true, a_facturar: 0 }
const FUERA_DE_NODO = { es_nodo: false, en_linea: true, node_id: null, a_facturar: 0 }

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** `{status, detail}` contesta un error con ese `detail` (texto u objeto); una función se llama en cada pedido. */
function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const path = String(entrada).split('?')[0]
    const clave = `${init?.method ?? 'GET'} ${path}`
    let valor = clave in tabla ? tabla[clave] : tabla[path]
    if (typeof valor === 'function') valor = (valor as () => unknown)()
    if (valor === '!caida') return Promise.reject(new TypeError('sin red'))
    if (valor && typeof valor === 'object' && 'status' in valor && 'detail' in valor) {
      const e = valor as { status: number; detail: unknown }
      return Promise.resolve(json({ detail: e.detail }, e.status))
    }
    if (valor === undefined) return Promise.resolve(json({ detail: 'Not Found' }, 404))
    return Promise.resolve(json(valor))
  })
}

const pedidas = () => fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
const consultasDeConexion = () => pedidas().filter((p) => p === `GET ${RUTA_CONEXION_DEL_NODO}`).length

beforeEach(() => {
  cleanup()
  _reiniciarConexionDelNodo()
  _resetCacheDeMedios()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  // Desmontar antes de olvidar: si no, el aviso del almacén le llega a una pantalla todavía montada, fuera de `act`.
  cleanup()
  _reiniciarConexionDelNodo()
  vi.useRealTimers()
})

async function avanzar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

// ── La lógica ───────────────────────────────────────────────────────────

describe('los ayudantes', () => {
  it('ventasParaFacturar, esVentaSinConexion y codigoDelError', () => {
    expect(ventasParaFacturar(1)).toBe('1 venta para facturar')
    expect(ventasParaFacturar(4)).toBe('4 ventas para facturar')
    expect(esVentaSinConexion({ origen_tipo: 'venta' })).toBe(true)
    expect(esVentaSinConexion({ origen_tipo: 'remito' })).toBe(false)
    expect(esVentaSinConexion({})).toBe(false)
    expect(codigoDelError(new ApiError(409, 'x', { codigo: 'sin_conexion', mensaje: 'x' }))).toBe('sin_conexion')
    expect(codigoDelError(new ApiError(409, 'x', { mensaje: 'x' }))).toBeNull()
    expect(codigoDelError(new ApiError(409, 'texto', 'texto'))).toBeNull()
    expect(codigoDelError(new Error('otra cosa'))).toBeNull()
  })
})

describe('la consulta de la conexión', () => {
  it('🔴 fuera de un nodo (`es_nodo: false`) no muestra nada y no sigue consultando', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({ [RUTA_CONEXION_DEL_NODO]: FUERA_DE_NODO })
    render(<CartelSinConexion />)
    await waitFor(() => expect(consultasDeConexion()).toBe(1))
    await avanzar(INTERVALO_CONEXION_MS * 4)
    expect(consultasDeConexion()).toBe(1)
    expect(screen.queryByRole('status')).toBeNull()
    // Ni remontando: un equipo no se vuelve nodo sin reinstalarse.
    cleanup()
    render(<CartelSinConexion />)
    await avanzar(INTERVALO_CONEXION_MS * 2)
    expect(consultasDeConexion()).toBe(1)
    // Y un 409 `sin_conexion` suelto no lo prende.
    act(() => marcarSinConexion())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('🔴 un producto que no monta la ruta (404) tampoco: una consulta y basta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({})
    render(<CartelSinConexion />)
    await waitFor(() => expect(consultasDeConexion()).toBe(1))
    await avanzar(INTERVALO_CONEXION_MS * 3)
    expect(consultasDeConexion()).toBe(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('en un nodo sigue consultando; un 500 o un corte de red dejan lo último que se supo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let respuesta: unknown = NODO_SIN_CONEXION
    responder({ [RUTA_CONEXION_DEL_NODO]: () => respuesta })
    render(<CartelSinConexion />)
    expect(await screen.findByText(TEXTO_CARTEL_SIN_CONEXION)).toBeTruthy()
    respuesta = { status: 500, detail: 'Error interno' }
    await avanzar(INTERVALO_CONEXION_MS + 10)
    expect(consultasDeConexion()).toBe(2)
    expect(screen.getByText(TEXTO_CARTEL_SIN_CONEXION)).toBeTruthy()
    respuesta = '!caida'
    await avanzar(INTERVALO_CONEXION_MS + 10)
    expect(consultasDeConexion()).toBe(3)
    expect(screen.getByText(TEXTO_CARTEL_SIN_CONEXION)).toBeTruthy()
    // Volvió la conexión: el cartel se va.
    respuesta = NODO_EN_LINEA
    await avanzar(INTERVALO_CONEXION_MS + 10)
    await waitFor(() => expect(screen.queryByText(TEXTO_CARTEL_SIN_CONEXION)).toBeNull())
  })

  it('varios a la vez comparten un reloj, y sin nadie consultando se frena', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({ [RUTA_CONEXION_DEL_NODO]: NODO_EN_LINEA })
    const soltarA = consultarConexionDelNodo()
    const soltarB = consultarConexionDelNodo()
    await avanzar(INTERVALO_CONEXION_MS + 10)
    expect(consultasDeConexion()).toBe(2)
    soltarA()
    await avanzar(INTERVALO_CONEXION_MS)
    expect(consultasDeConexion()).toBe(3)
    soltarB()
    soltarB()
    await avanzar(INTERVALO_CONEXION_MS * 3)
    expect(consultasDeConexion()).toBe(3)
    // `refrescar` pregunta ya, sin reloj.
    await act(async () => { await refrescarConexionDelNodo() })
    expect(consultasDeConexion()).toBe(4)
  })

  it('la ruta y el intervalo se pueden cambiar; una respuesta sin datos no rompe', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({ '/otra/conexion': { es_nodo: true, en_linea: false, a_facturar: 'x' } })
    function Lector() {
      const { esNodo, sinConexion, aFacturar, conexion } = useConexionDelNodo()
      return <p>{`${esNodo}-${sinConexion}-${aFacturar}-${conexion?.node_id ?? 'sin-id'}`}</p>
    }
    render(<><CartelSinConexion ruta="/otra/conexion" intervaloMs={1000} /><Lector /></>)
    expect(await screen.findByText('true-true-0-sin-id')).toBeTruthy()
    await avanzar(1010)
    expect(pedidas().filter((p) => p === 'GET /otra/conexion')).toHaveLength(2)
    // Sin «N ventas» cuando no hay ninguna.
    expect(screen.queryByText(/para facturar/)).toBeNull()
  })

  it('un 200 vacío se toma como «no es un nodo»', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    render(<CartelSinConexion />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('status')).toBeNull()
  })
})

// ── El cartel y el layout ───────────────────────────────────────────────

describe('el cartel «sin conexión»', () => {
  it('dice qué pasa y cuántas ventas esperan la factura', async () => {
    responder({ [RUTA_CONEXION_DEL_NODO]: NODO_SIN_CONEXION })
    render(<CartelSinConexion />)
    const cartel = await screen.findByRole('status')
    expect(cartel.textContent).toContain(TEXTO_CARTEL_SIN_CONEXION)
    expect(cartel.textContent).toContain('3 ventas para facturar')
    expect(cartel.getAttribute('data-tono')).toBe('atencion')
  })

  it('lleva la marca de LibraEdge en la variante chica, a 20 px (ADR-079)', async () => {
    responder({ [RUTA_CONEXION_DEL_NODO]: NODO_SIN_CONEXION })
    render(<CartelSinConexion />)
    const cartel = await screen.findByRole('status')
    const marca = within(cartel).getByRole('img', { name: 'LibraEdge' })
    expect(marca.className).toContain('h-5')
    expect(marca.querySelector('svg > rect')!.getAttribute('fill')).toBe('#0e7490')
    expect(marca.innerHTML).toContain('rx="30"') // el cuadrado del favicon, no el del ícono (27)
    // El nombre lo da el aria-label: el texto del cartel no cambia.
    expect(cartel.textContent!.startsWith(TEXTO_CARTEL_SIN_CONEXION)).toBe(true)
  })

  it('con conexión no dibuja nada', async () => {
    responder({ [RUTA_CONEXION_DEL_NODO]: NODO_EN_LINEA })
    render(<CartelSinConexion />)
    await waitFor(() => expect(consultasDeConexion()).toBe(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  const Icono = () => <svg />
  function montarLayout(conexionDelNodo?: boolean | { ruta?: string }) {
    const Layout = createLayout({
      productName: 'VentaLibra', productInitial: 'V', navItems: [{ to: '/ventas', label: 'Ventas', icon: Icono }],
      useAuth: () => ({ user: { role: 'admin', name: 'Cajera Demo' }, logout: vi.fn() }), conexionDelNodo,
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
  }

  it('el layout lo monta con `conexionDelNodo`, arriba del contenido', async () => {
    responder({ [RUTA_CONEXION_DEL_NODO]: { ...NODO_SIN_CONEXION, a_facturar: 1 } })
    montarLayout(true)
    const cartel = await screen.findByText(TEXTO_CARTEL_SIN_CONEXION)
    expect(screen.getByText('1 venta para facturar')).toBeTruthy()
    const contenido = screen.getByText('contenido')
    expect(cartel.compareDocumentPosition(contenido) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('con la ruta del producto', async () => {
    responder({ '/api/edge/conexion': NODO_SIN_CONEXION })
    montarLayout({ ruta: '/api/edge/conexion' })
    expect(await screen.findByText(TEXTO_CARTEL_SIN_CONEXION)).toBeTruthy()
  })

  it('🔴 sin la prop el layout no pide nada', async () => {
    responder({ [RUTA_CONEXION_DEL_NODO]: NODO_SIN_CONEXION })
    montarLayout()
    expect(screen.getByText('contenido')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(TEXTO_CARTEL_SIN_CONEXION)).toBeNull()
  })
})

// ── La venta ────────────────────────────────────────────────────────────

function montarDetalle(id: number) {
  return render(
    <MemoryRouter initialEntries={[`/ventas/${id}`]}>
      <Routes><Route path="/ventas/:id" element={<VentaDetalle />} /></Routes>
    </MemoryRouter>,
  )
}

describe('el detalle de la venta en un nodo', () => {
  it('sin conexión, «Cobrar con QR» se apaga y dice por qué', async () => {
    responder({ '/api/cajas/medios-disponibles': MEDIOS, '/api/ventas/8': CON_QR })
    montarDetalle(8)
    const boton = await screen.findByRole('button', { name: /Cobrar con QR/ })
    expect(boton).not.toBeDisabled()
    act(() => marcarSinConexion())
    expect(boton).toBeDisabled()
    expect(boton.getAttribute('title')).toBe(MENSAJE_QR_SIN_CONEXION)
    expect(screen.getByText(MENSAJE_QR_SIN_CONEXION).id).toBe(boton.getAttribute('aria-describedby'))
  })

  it('si igual llega el 409 `sin_conexion` al pedir el QR, muestra el mensaje del motor y apaga el botón', async () => {
    responder({
      '/api/cajas/medios-disponibles': MEDIOS, '/api/ventas/8': CON_QR,
      'POST /api/ventas/8/mp-qr': { status: 409, detail: { codigo: 'sin_conexion', mensaje: MENSAJE_QR_SIN_CONEXION } },
    })
    const user = userEvent.setup()
    montarDetalle(8)
    await user.click(await screen.findByRole('button', { name: /Cobrar con QR/ }))
    expect(await screen.findByText(MENSAJE_QR_SIN_CONEXION)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cobrar con QR/ })).toBeDisabled()
  })

  it('un 409 `sin_conexion` en el poll del QR también', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({
      '/api/cajas/medios-disponibles': MEDIOS, '/api/ventas/8': CON_QR, 'POST /api/ventas/8/mp-qr': {},
      '/api/ventas/8/mp-status': { status: 409, detail: { codigo: 'sin_conexion', mensaje: 'Sin conexión con el central.' } },
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montarDetalle(8)
    await user.click(await screen.findByRole('button', { name: /Cobrar con QR/ }))
    await avanzar(3010)
    expect(await screen.findByText('Sin conexión con el central.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cobrar con QR/ })).toBeDisabled()
  })

  it('«Generar factura» con 409 `factura_pendiente`: aviso (no error), reimprimir el ticket y «Pendiente de facturar»', async () => {
    let actual: Venta = VENTA
    responder({
      '/api/cajas/medios-disponibles': MEDIOS, '/api/ventas/7': () => actual,
      [RUTA_CONEXION_DEL_NODO]: NODO_SIN_CONEXION,
      'POST /api/ventas/7/facturar': () => {
        actual = { ...VENTA, factura_pendiente: { id: 12, estado: 'pendiente' } }
        return { status: 409, detail: { codigo: 'factura_pendiente', mensaje: 'Sin conexión: la venta quedó con su ticket.', comprobante_pendiente_id: 12 } }
      },
      '/ventas/7/ticket': { status: 500, detail: 'no hay impresora en el test' },
    })
    const user = userEvent.setup()
    montarDetalle(7)
    await user.click(await screen.findByRole('button', { name: /Generar factura/ }))
    expect(await screen.findByText('Quedó para facturar al volver la conexión.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Pendiente de facturar (sin conexión)')).toBeTruthy()
    // Recarga la venta y pregunta la conexión para actualizar las «N ventas».
    expect(pedidas().filter((p) => p === 'GET /api/ventas/7')).toHaveLength(2)
    await waitFor(() => expect(consultasDeConexion()).toBe(1))
    await user.click(screen.getByRole('button', { name: /Reimprimir ticket/ }))
    await waitFor(() => expect(pedidas()).toContain('GET /ventas/7/ticket'))
  })

  it('la venta que ya viene marcada `factura_pendiente` lo muestra al abrirla', async () => {
    responder({ '/api/cajas/medios-disponibles': MEDIOS, '/api/ventas/7': { ...VENTA, factura_pendiente: true } })
    montarDetalle(7)
    expect(await screen.findByText('Pendiente de facturar (sin conexión)')).toBeTruthy()
    expect(screen.queryByText('Quedó para facturar al volver la conexión.')).toBeNull()
  })

  it('422 `nodo_sin_arca` es un error de configuración, con el mensaje del motor', async () => {
    responder({
      '/api/cajas/medios-disponibles': MEDIOS, '/api/ventas/7': VENTA,
      'POST /api/ventas/7/facturar': { status: 422, detail: { codigo: 'nodo_sin_arca', mensaje: 'Este equipo no tiene la configuración de ARCA del central.' } },
    })
    const user = userEvent.setup()
    montarDetalle(7)
    await user.click(await screen.findByRole('button', { name: /Generar factura/ }))
    expect((await screen.findByRole('alert')).textContent)
      .toBe('Error de configuración: Este equipo no tiene la configuración de ARCA del central.')
    expect(screen.queryByText('Pendiente de facturar (sin conexión)')).toBeNull()
  })
})

describe('el punto de venta en un nodo', () => {
  it('sin conexión «Cobrar con QR ahora» se apaga y se destilda', async () => {
    let ultimas: LineaDePago[] = []
    function Pantalla() {
      const [lineas, setLineas] = useState<LineaDePago[]>([{ ...lineaVacia(MEDIO_DEL_QR, '200'), cobrarConQr: true }])
      ultimas = lineas
      return <LineasDePago lineas={lineas} onChange={setLineas} medios={MEDIOS} aPagar={200} formatCurrency={String} />
    }
    render(<Pantalla />)
    const casilla = screen.getByLabelText(/Cobrar con QR ahora/)
    expect(casilla).toBeChecked()
    act(() => marcarSinConexion())
    await waitFor(() => expect(ultimas[0].cobrarConQr).toBe(false))
    expect(casilla).not.toBeChecked()
    expect(casilla).toBeDisabled()
    expect(casilla.closest('label')?.getAttribute('title')).toBe(MENSAJE_QR_SIN_CONEXION)
    expect(screen.getByText('(sin conexión)')).toBeTruthy()
  })

  it('el listado marca la venta que espera la factura en la bandeja', async () => {
    responder({ '/api/cajas/medios-disponibles': MEDIOS, '/api/ventas': [{ ...VENTA, factura_pendiente: true }, CON_QR] })
    render(<MemoryRouter><Ventas /></MemoryRouter>)
    expect(await screen.findByText('Pendiente (sin conexión)')).toBeTruthy()
  })
})

// ── La bandeja ──────────────────────────────────────────────────────────

describe('las piezas de la bandeja de comprobantes pendientes', () => {
  it('la etiqueta', () => {
    render(<EtiquetaVentaSinConexion />)
    expect(screen.getByText('Venta sin conexión').closest('[data-tono]')?.getAttribute('data-tono')).toBe('atencion')
  })

  it('«Facturar ahora» llama a la tanda del nodo, informa y avisa para recargar', async () => {
    const onFacturado = vi.fn()
    responder({
      [RUTA_CONEXION_DEL_NODO]: NODO_EN_LINEA,
      'POST /api/nodo/facturar-pendientes': {
        es_nodo: true, en_linea: true, facturadas: [{ venta_id: 1, factura_id: 9, cae: '1' }, { venta_id: 2, factura_id: 10, cae: '2' }],
        descartadas: [], errores: [{ venta_id: 3, error: 'ValueError' }], quedan: 1,
      },
    })
    const user = userEvent.setup()
    render(<BotonFacturarPendientesDelNodo onFacturado={onFacturado} />)
    await user.click(screen.getByRole('button', { name: /Facturar ahora/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('2 ventas facturadas; 1 con error; quedan 1.')
    expect(onFacturado).toHaveBeenCalledWith(expect.objectContaining({ quedan: 1 }))
    expect(pedidas()).toContain('POST /api/nodo/facturar-pendientes')
  })

  it('el resultado en singular; sin errores es un estado y no una alerta', async () => {
    responder({
      'POST /api/nodo/facturar-pendientes': { es_nodo: true, en_linea: true, facturadas: [{ venta_id: 1, factura_id: 9, cae: '1' }], descartadas: [], errores: [{ venta_id: 2, error: 'x' }, { venta_id: 3, error: 'y' }], quedan: 0 },
    })
    const user = userEvent.setup()
    render(<BotonFacturarPendientesDelNodo />)
    await user.click(screen.getByRole('button', { name: /Facturar ahora/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('1 venta facturada; 2 con error.')
    cleanup()
    responder({ 'POST /api/nodo/facturar-pendientes': { es_nodo: true, en_linea: true, facturadas: [], descartadas: [], errores: [], quedan: 0 } })
    render(<BotonFacturarPendientesDelNodo />)
    await user.click(screen.getByRole('button', { name: /Facturar ahora/ }))
    expect((await screen.findByRole('status')).textContent).toBe('0 ventas facturadas.')
  })

  it('sin conexión está deshabilitado y dice por qué', () => {
    render(<BotonFacturarPendientesDelNodo />)
    act(() => marcarSinConexion())
    const boton = screen.getByRole('button', { name: /Facturar ahora/ })
    expect(boton).toBeDisabled()
    expect(boton.getAttribute('title')).toBe('Sin conexión: las ventas se facturan solas cuando vuelva.')
  })

  it('un 409 `sin_conexion` lo apaga con el mensaje del motor; un corte de red lo dice', async () => {
    responder({
      'POST /api/nodo/facturar-pendientes': { status: 409, detail: { codigo: 'sin_conexion', mensaje: 'Sin conexión: las ventas se facturan cuando vuelva la conexión.' } },
    })
    const user = userEvent.setup()
    render(<BotonFacturarPendientesDelNodo />)
    await user.click(screen.getByRole('button', { name: /Facturar ahora/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Sin conexión: las ventas se facturan cuando vuelva la conexión.')
    expect(screen.getByRole('button', { name: /Facturar ahora/ })).toBeDisabled()
    cleanup()
    _reiniciarConexionDelNodo()
    responder({ 'POST /api/nodo/facturar-pendientes': '!caida' })
    render(<BotonFacturarPendientesDelNodo />)
    await user.click(screen.getByRole('button', { name: /Facturar ahora/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Error de conexión.')
    expect(screen.getByRole('button', { name: /Facturar ahora/ })).not.toBeDisabled()
  })
})

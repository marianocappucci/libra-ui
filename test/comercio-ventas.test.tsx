// El punto de venta (P9-M3, 2026-09-06): las cuentas de los pagos, las líneas
// de pago con vuelto, el hook de medios, el listado y alta de ventas, y el
// detalle con el cobro por QR y la factura desde la venta.
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LineasDePago } from '../src/comercio/LineasDePago'
import { Ventas } from '../src/comercio/Ventas'
import { VentaDetalle, ESPERA_MAXIMA_MS, POLL_MS } from '../src/comercio/VentaDetalle'
import { _resetCacheDeMedios, useEtiquetaDeMedio, useMediosPago } from '../src/comercio/medios-pago'
import {
  MEDIO_DEL_QR, lineaVacia, numero, pagosPayload, redondear, totalDeclarado, vueltoDe, type LineaDePago,
} from '../src/comercio/pagos'
import { etiquetaDeEstadoDeVenta, formatoMoneda, opcionesCliente, type Venta } from '../src/comercio/tipos'

const MEDIOS = [
  { id: 'efectivo', label: 'Efectivo' }, { id: 'transferencia', label: 'Transferencia' },
  { id: 'mercadopago', label: 'MercadoPago' }, { id: 'tarjeta_debito', label: 'Tarjeta de débito' },
]

const VENTA: Venta = {
  id: 7, numero: 'V-00007', fecha: '2026-09-06', items: [{ nombre: 'Yerba', qty: 2, precio: 100, subtotal: 200, producto_id: 3 }],
  subtotal: 200, descuento: 0, total: 200, cliente_id: null, cliente_nombre: '', observaciones: '',
  estado: 'cobrada', pagos: [{ medio: 'efectivo', monto: 200, referencia: '' }],
  factura_id: null, factura_display: null, remito_id: null, mp_order_id: '', mp_payment_id: '',
}
const PENDIENTE: Venta = {
  ...VENTA, id: 8, numero: 'V-00008', estado: 'pendiente', pagos: [{ medio: 'mercadopago', monto: 200, referencia: '', estado: 'pendiente' }],
}
const FACTURADA: Venta = {
  ...VENTA, id: 9, numero: 'V-00009', factura_id: 55, factura_display: 'FACTURA C 0005-00000011', remito_id: 4, observaciones: 'sin bolsa',
  cliente_nombre: 'Ana', descuento: 20, total: 180,
}

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const path = url.split('?')[0]
    const clave = `${init?.method ?? 'GET'} ${path}`
    let valor = clave in tabla ? tabla[clave] : (url in tabla ? tabla[url] : tabla[path])
    if (typeof valor === 'function') valor = (valor as () => unknown)()
    if (valor === '!caida') return Promise.reject(new TypeError('sin red'))
    if (valor && typeof valor === 'object' && 'status' in (valor as object) && 'detail' in (valor as object)) {
      const e = valor as { status: number; detail: string }
      return Promise.resolve(json({ detail: e.detail }, e.status))
    }
    if (valor === undefined) return Promise.resolve(json({ detail: `sin respuesta para ${clave}` }, 404))
    return Promise.resolve(json(valor))
  })
}

function pedidas(): string[] {
  return fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
}

function cuerpoDe(clave: string): Record<string, unknown> {
  const i = pedidas().findIndex((p) => p.startsWith(clave))
  return JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body))
}

function Ubicacion() {
  const l = useLocation()
  return <p data-testid="ubicacion">{l.pathname}</p>
}

beforeEach(() => {
  cleanup()
  _resetCacheDeMedios()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
})

// ── pagos.ts ─────────────────────────────────────────────────────────────

describe('las cuentas de los pagos', () => {
  it('numero y redondear toleran basura', () => {
    expect(numero('abc')).toBe(0)
    expect(numero('12.5')).toBe(12.5)
    expect(redondear(1.005)).toBe(1)
    expect(redondear(2.345)).toBe(2.35)
  })

  it('el vuelto es sólo del efectivo, y sólo cuando dio de más', () => {
    expect(vueltoDe({ ...lineaVacia('efectivo', '4300'), recibido: '5000' })).toBe(700)
    expect(vueltoDe({ ...lineaVacia('efectivo', '4300'), recibido: '4000' })).toBe(0)
    expect(vueltoDe(lineaVacia('efectivo', '4300'))).toBe(0)
    expect(vueltoDe({ ...lineaVacia('transferencia', '4300'), recibido: '5000' })).toBe(0)
  })

  it('el payload no lleva el recibido, filtra los vacíos y declara el QR sólo en su medio', () => {
    const lineas: LineaDePago[] = [
      { ...lineaVacia('efectivo', '100'), recibido: '200' },
      lineaVacia('transferencia', ''),
      { ...lineaVacia(MEDIO_DEL_QR, '50'), cobrarConQr: true, referencia: ' ref ' },
      { ...lineaVacia('transferencia', '25'), cobrarConQr: true },
    ]
    expect(totalDeclarado(lineas)).toBe(175)
    expect(pagosPayload(lineas)).toEqual([
      { medio: 'efectivo', monto: 100, referencia: '', cobrar_con_qr: false },
      { medio: 'mercadopago', monto: 50, referencia: 'ref', cobrar_con_qr: true },
      { medio: 'transferencia', monto: 25, referencia: '', cobrar_con_qr: false },
    ])
  })

  it('los helpers de tipos', () => {
    expect(formatoMoneda(1234.5)).toMatch(/1\.234,50/)
    expect(etiquetaDeEstadoDeVenta('parcial')).toBe('Pago parcial')
    expect(etiquetaDeEstadoDeVenta('otro')).toBe('otro')
    expect(opcionesCliente([{ id: 1, name: 'Ana', cuit_dni: '20', activo: 1 }, { id: 2, name: 'Beto', activo: 0 }])).toEqual([
      { value: '1', label: 'Ana', hint: '20' }, { value: '2', label: 'Beto', hint: 'inactivo' },
    ])
  })
})

// ── LineasDePago ─────────────────────────────────────────────────────────

function Armador({ inicial, aPagar = 1000 }: { inicial?: LineaDePago[]; aPagar?: number }) {
  const [lineas, setLineas] = useState<LineaDePago[]>(inicial ?? [lineaVacia()])
  return (
    <>
      <LineasDePago lineas={lineas} onChange={setLineas} medios={MEDIOS} aPagar={aPagar} formatCurrency={formatoMoneda} />
      <pre data-testid="estado">{JSON.stringify(lineas)}</pre>
    </>
  )
}

function estado(): LineaDePago[] {
  return JSON.parse(screen.getByTestId('estado').textContent ?? '[]')
}

describe('LineasDePago', () => {
  it('completa lo que falta, calcula el vuelto y avisa cuando no alcanza', async () => {
    const user = userEvent.setup()
    render(<Armador />)
    expect(screen.getByText(/Falta/)).toBeTruthy()
    await user.click(screen.getByLabelText('Completar el importe que falta en el pago 1'))
    expect(estado()[0].monto).toBe('1000')
    expect(screen.getByText('Pago exacto')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Paga con'), { target: { value: '1500' } })
    expect(screen.getByText(/Vuelto:/).textContent).toMatch(/500/)
    fireEvent.change(screen.getByLabelText('Paga con'), { target: { value: '800' } })
    expect(screen.getByText(/no alcanza/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '1200' } })
    expect(screen.getByText(/de más/)).toBeTruthy()
  })

  it('agregar trae el restante; cambiar de medio apaga el QR y el recibido; quitar saca la fila', async () => {
    const user = userEvent.setup()
    render(<Armador inicial={[{ ...lineaVacia('efectivo', '400'), recibido: '500' }]} />)
    await user.click(screen.getByRole('button', { name: /Agregar otro medio/ }))
    expect(estado()[1].monto).toBe('600')
    await user.selectOptions(screen.getByLabelText('Medio de pago', { selector: '#pago-medio-1' }), 'mercadopago')
    expect(screen.getByLabelText('Referencia (opcional)')).toBeTruthy()
    await user.click(screen.getByLabelText('Cobrar con QR ahora'))
    expect(estado()[1].cobrarConQr).toBe(true)
    fireEvent.change(screen.getByLabelText('Referencia (opcional)'), { target: { value: 'op-1' } })
    expect(estado()[1].referencia).toBe('op-1')
    await user.selectOptions(screen.getByLabelText('Medio de pago', { selector: '#pago-medio-1' }), 'transferencia')
    expect(estado()[1].cobrarConQr).toBe(false)
    await user.selectOptions(screen.getByLabelText('Medio de pago', { selector: '#pago-medio-0' }), 'tarjeta_debito')
    expect(estado()[0].recibido).toBe('')
    await user.click(screen.getByLabelText('Quitar el pago 2'))
    expect(estado()).toHaveLength(1)
    // Sin restante, agregar trae una línea vacía; completar sin nada que cubrir la deja vacía.
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '1000' } })
    await user.click(screen.getByRole('button', { name: /Agregar otro medio/ }))
    expect(estado()[1].monto).toBe('')
    await user.click(screen.getByLabelText('Completar el importe que falta en el pago 2'))
    expect(estado()[1].monto).toBe('')
  })
})

// ── el hook de medios ────────────────────────────────────────────────────

function Medios() {
  const { medios, etiqueta, etiquetaCorta } = useMediosPago()
  return <p>{medios.length}|{etiqueta('tarjeta_debito')}|{etiquetaCorta('tarjeta_debito')}</p>
}

function SoloEtiqueta() {
  const etiqueta = useEtiquetaDeMedio()
  return <p>{etiqueta('raro')}|{etiqueta('efectivo')}</p>
}

describe('useMediosPago', () => {
  it('pide los medios una vez, etiqueta con lo del backend y cae al slug', async () => {
    responder({ '/api/cajas/medios-disponibles': MEDIOS })
    render(<Medios />)
    expect(await screen.findByText('4|Tarjeta de débito|T. déb.')).toBeTruthy()
    cleanup()
    render(<SoloEtiqueta />)
    expect(screen.getByText('raro|Efectivo')).toBeTruthy()
    expect(pedidas().filter((p) => p.includes('medios-disponibles'))).toHaveLength(1)
  })

  it('un cuerpo que no es lista se trata como vacío, y sin red no rompe', async () => {
    responder({ '/api/cajas/medios-disponibles': { html: true } })
    render(<Medios />)
    await waitFor(() => expect(pedidas()).toContain('GET /api/cajas/medios-disponibles'))
    expect(screen.getByText('0|tarjeta_debito|T. déb.')).toBeTruthy()
    _resetCacheDeMedios(); cleanup()
    responder({ '/api/cajas/medios-disponibles': '!caida' })
    render(<Medios />)
    await waitFor(() => expect(pedidas()).toHaveLength(2))
    expect(screen.getByText('0|tarjeta_debito|T. déb.')).toBeTruthy()
  })
})

// ── Ventas ───────────────────────────────────────────────────────────────

function montarVentas(props: Parameters<typeof Ventas>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={['/ventas']}>
      <Routes>
        <Route path="/ventas" element={<><Ventas {...props} /><Ubicacion /></>} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
}

const BASE = { '/api/cajas/medios-disponibles': MEDIOS, '/api/ventas': [VENTA, PENDIENTE, FACTURADA] }

describe('Ventas', () => {
  it('lista con la factura, el estado, los medios abreviados y las acciones según el rol', async () => {
    responder(BASE)
    montarVentas()
    expect(await screen.findByText('V-00007')).toBeTruthy()
    expect(screen.getByText('FACTURA C 0005-00000011').closest('a')?.getAttribute('href')).toBe('/facturas/55')
    // La pestaña más las dos ventas sin comprobante.
    expect(screen.getAllByText('Sin facturar')).toHaveLength(3)
    expect(screen.getByText('Pendiente')).toBeTruthy()
    expect(screen.getAllByText(/Efec\.:/)).toHaveLength(2)
    expect(screen.getByText(/MP:/)).toBeTruthy()
    expect(screen.queryByLabelText('Anular')).toBeNull()
    expect(screen.getAllByLabelText('Ver venta')[0].getAttribute('href')).toBe('/ventas/7')
    expect(screen.getAllByLabelText('Ver recibo')).toHaveLength(3)
    cleanup()
    montarVentas({ puedeAnular: true, rutaDeDetalle: (id) => `/v/${id}`, rutaDeFactura: (id) => `/f/${id}` })
    expect(await screen.findByText('V-00007')).toBeTruthy()
    expect(screen.getAllByLabelText('Anular')).toHaveLength(3)
    expect(screen.getAllByLabelText('Ver venta')[0].getAttribute('href')).toBe('/v/7')
    expect(screen.getByText('FACTURA C 0005-00000011').closest('a')?.getAttribute('href')).toBe('/f/55')
  })

  it('las pestañas y los filtros arman la query; limpiar la deja vacía; sin red avisa', async () => {
    responder({ ...BASE, '/api/ventas': (() => []) })
    const user = userEvent.setup()
    montarVentas()
    expect(await screen.findByText('No hay ventas registradas aún.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: /Sin facturar/ }))
    expect(await screen.findByText('No hay ventas pendientes de facturar.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: /Facturadas/ }))
    expect(await screen.findByText('No hay ventas facturadas aún.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'ana' } })
    fireEvent.keyDown(screen.getByLabelText('Buscar'), { key: 'Enter' })
    await waitFor(() => expect(pedidas()).toContain('GET /api/ventas?tab=facturadas&q=ana&desde=2026-09-01&hasta=2026-09-30'))
    await user.click(screen.getByRole('button', { name: 'Filtrar' }))
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/ventas?tab=facturadas'))
    cleanup()
    responder({ ...BASE, '/api/ventas': '!caida' })
    montarVentas()
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })

  it('anular pega al endpoint y recarga; el error de la API se muestra', async () => {
    responder({ ...BASE, 'POST /api/ventas/7/anular': VENTA, 'POST /api/ventas/8/anular': { status: 409, detail: 'ya cobrada' } })
    const user = userEvent.setup()
    montarVentas({ puedeAnular: true })
    await screen.findByText('V-00007')
    await user.click(screen.getAllByLabelText('Anular')[0])
    await waitFor(() => expect(pedidas()).toContain('POST /api/ventas/7/anular'))
    await user.click(screen.getAllByLabelText('Anular')[1])
    expect(await screen.findByText('ya cobrada')).toBeTruthy()
  })

  it('click en la fila navega al detalle', async () => {
    responder(BASE)
    const user = userEvent.setup()
    montarVentas()
    await user.click(await screen.findByText('V-00008'))
    expect(await screen.findByText('/ventas/8')).toBeTruthy()
  })

  it('el alta: autocompletado, ítems, cliente, lista de precio, pagos y el payload', async () => {
    responder({
      ...BASE, '/api/clientes': [{ id: 1, name: 'Ana', cuit_dni: '20', activo: 1 }, { id: 2, name: 'Inactivo', activo: 0 }],
      '/api/listas-precio': [{ id: 5, nombre: 'Mayorista', descripcion: '', activa: 1, es_default: 0 }],
      '/productos/buscar': [{ id: 3, codigo: 'Y1', nombre: 'Yerba', precio_venta: 150, precio_base: 100, unidad: 'u' }],
      'POST /api/ventas': { ...VENTA, id: 77 },
    })
    const user = userEvent.setup()
    montarVentas()
    await screen.findByText('V-00007')
    await user.click(screen.getByRole('button', { name: /Nueva venta/ }))
    const dialogo = await screen.findByRole('dialog')
    await waitFor(() => expect(pedidas()).toContain('GET /api/clientes'))
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Lista de precios' }), '5')
    // Un texto corto no busca; dos letras sí, con la lista elegida.
    await user.type(within(dialogo).getByLabelText('Ítem 1'), 'Y')
    expect(pedidas().some((p) => p.includes('/productos/buscar'))).toBe(false)
    await user.type(within(dialogo).getByLabelText('Ítem 1'), 'e')
    await waitFor(() => expect(pedidas()).toContain('GET /productos/buscar?q=Ye&lista_id=5'))
    await user.click(await within(dialogo).findByRole('button', { name: /Yerba —/ }))
    expect(within(dialogo).getByLabelText('Precio 1')).toHaveValue(150)
    fireEvent.change(within(dialogo).getByLabelText('Cantidad 1'), { target: { value: '2' } })
    await user.click(within(dialogo).getByRole('button', { name: /Agregar ítem/ }))
    fireEvent.change(within(dialogo).getByLabelText('Ítem 2'), { target: { value: 'Bolsa' } })
    fireEvent.change(within(dialogo).getByLabelText('Precio 2'), { target: { value: '10' } })
    await user.click(within(dialogo).getByRole('button', { name: /Agregar ítem/ }))
    await user.click(within(dialogo).getAllByRole('button', { name: /Quitar/ })[2])
    expect(within(dialogo).queryByLabelText('Ítem 3')).toBeNull()
    fireEvent.change(within(dialogo).getByLabelText('Descuento'), { target: { value: '10' } })
    expect(within(dialogo).getByText(/Total:/).textContent).toMatch(/300,00/)
    // Cliente por el select con búsqueda.
    await user.click(within(dialogo).getByRole('combobox', { name: 'Cliente' }))
    await user.click(await within(dialogo).findByRole('option', { name: /Ana/ }))
    fireEvent.change(within(dialogo).getByLabelText('Observaciones'), { target: { value: 'lleva' } })
    // Pagos: de más se corta; con vuelto se muestra.
    fireEvent.change(within(dialogo).getByLabelText('Importe'), { target: { value: '400' } })
    await user.click(within(dialogo).getByRole('button', { name: /Registrar venta/ }))
    expect(await screen.findByText(/suman más que el total/)).toBeTruthy()
    expect(pedidas().some((p) => p === 'POST /api/ventas')).toBe(false)
    fireEvent.change(within(dialogo).getByLabelText('Importe'), { target: { value: '300' } })
    fireEvent.change(within(dialogo).getByLabelText('Paga con'), { target: { value: '500' } })
    expect(within(dialogo).getAllByText(/Vuelto:/).length).toBeGreaterThan(0)
    await user.click(within(dialogo).getByRole('button', { name: /Registrar venta/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/ventas'))
    const cuerpo = cuerpoDe('POST /api/ventas')
    expect(cuerpo.items).toEqual([
      { nombre: 'Yerba', qty: 2, precio: 150, producto_id: 3 }, { nombre: 'Bolsa', qty: 1, precio: 10, producto_id: null },
    ])
    expect(cuerpo.descuento).toBe(10)
    expect(cuerpo.cliente_id).toBe(1)
    expect(cuerpo.observaciones).toBe('lleva')
    expect(cuerpo.pagos).toEqual([{ medio: 'efectivo', monto: 300, referencia: '', cobrar_con_qr: false }])
    expect(await screen.findByText('/ventas/77')).toBeTruthy()
  })

  it('el cliente rápido se crea y queda elegido; el error del alta se muestra; cancelar cierra', async () => {
    let intentos = 0
    responder({
      ...BASE, '/api/clientes': [], '/api/listas-precio': [],
      'POST /api/clientes': { id: 9, name: 'Nuevo', cuit_dni: '', activo: 1 },
      'POST /api/ventas': () => (++intentos === 1 ? { status: 422, detail: 'Debe agregar al menos un ítem.' } : { ...VENTA, id: 78 }),
    })
    const user = userEvent.setup()
    montarVentas()
    await screen.findByText('V-00007')
    await user.click(screen.getByRole('button', { name: /Nueva venta/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByLabelText('Agregar nuevo cliente'))
    expect(within(dialogo).getByRole('button', { name: /Crear cliente/ })).toBeDisabled()
    fireEvent.change(within(dialogo).getByLabelText('Nombre *'), { target: { value: 'Nuevo' } })
    fireEvent.change(within(dialogo).getByLabelText('CUIT/DNI'), { target: { value: '20' } })
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Condición IVA' }), 'Monotributista')
    fireEvent.change(within(dialogo).getByLabelText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(within(dialogo).getByLabelText('Teléfono'), { target: { value: '11' } })
    await user.click(within(dialogo).getByRole('button', { name: /Crear cliente/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/clientes'))
    expect(cuerpoDe('POST /api/clientes')).toEqual({ name: 'Nuevo', cuit_dni: '20', iva_condition: 'Monotributista', email: 'a@b.c', phone: '11' })
    await waitFor(() => expect(within(dialogo).queryByLabelText('Nombre *')).toBeNull())
    // Sin ítems el backend rebota y el mensaje se ve.
    await user.click(within(dialogo).getByRole('button', { name: /Registrar venta/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/ventas'))
    expect(await screen.findByText(/Debe agregar al menos un ítem/)).toBeTruthy()
    // Abrir el panel del cliente y cancelarlo (el primer "Cancelar" es el del panel).
    await user.click(within(dialogo).getByLabelText('Agregar nuevo cliente'))
    await user.click(within(dialogo).getAllByRole('button', { name: 'Cancelar' })[0])
    expect(within(dialogo).queryByLabelText('Nombre *')).toBeNull()
    // El nuevo quedó elegido: viaja como cliente_id en la venta.
    await user.click(within(dialogo).getByRole('button', { name: /Registrar venta/ }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'POST /api/ventas')).toHaveLength(2))
    const i = pedidas().lastIndexOf('POST /api/ventas')
    expect(JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body)).cliente_id).toBe(9)
  })

  it('el cliente rápido con error de red lo dice', async () => {
    responder({ ...BASE, '/api/clientes': [], '/api/listas-precio': [], 'POST /api/clientes': '!caida' })
    const user = userEvent.setup()
    montarVentas()
    await screen.findByText('V-00007')
    await user.click(screen.getByRole('button', { name: /Nueva venta/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByLabelText('Agregar nuevo cliente'))
    fireEvent.change(within(dialogo).getByLabelText('Nombre *'), { target: { value: 'X' } })
    await user.click(within(dialogo).getByRole('button', { name: /Crear cliente/ }))
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
    // Y el autocompletado caído no rompe: se limpia.
    responder({ ...BASE, '/productos/buscar': '!caida' })
    await user.type(within(dialogo).getByLabelText('Ítem 1'), 'ab')
    await waitFor(() => expect(pedidas().some((p) => p.includes('/productos/buscar'))).toBe(true))
    expect(within(dialogo).queryByRole('button', { name: /—/ })).toBeNull()
  })
})

// ── VentaDetalle ─────────────────────────────────────────────────────────

function montarDetalle(id: number, props: Parameters<typeof VentaDetalle>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={[`/ventas/${id}`]}>
      <Routes><Route path="/ventas/:id" element={<VentaDetalle {...props} />} /></Routes>
    </MemoryRouter>,
  )
}

describe('VentaDetalle', () => {
  it('muestra datos, pagos, artículos, factura y remito; y las rutas son del producto', async () => {
    responder({ ...BASE, '/api/ventas/9': FACTURADA })
    montarDetalle(9, { rutaDeFactura: (id) => `/f/${id}`, rutaDeRemito: (id) => `/r/${id}` })
    expect(await screen.findByText(/Venta V-00009/)).toBeTruthy()
    expect(screen.getByText('06-09-2026')).toBeTruthy()
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getByText('sin bolsa')).toBeTruthy()
    expect(screen.getByText('FACTURA C 0005-00000011').getAttribute('href')).toBe('/f/55')
    expect(screen.getByText('ver remito').getAttribute('href')).toBe('/r/4')
    expect(screen.getByText('Descuento')).toBeTruthy()
    expect(screen.queryByText(/Generar factura/)).toBeNull()
    expect(screen.queryByText(/Generar remito/)).toBeNull()
    expect(screen.queryByText(/Cobrar con QR/)).toBeNull()
    expect(screen.getByText('Volver').getAttribute('href')).toBe('/ventas')
  })

  it('factura por el endpoint y ofrece el formulario si el producto lo pide; anular confirma', async () => {
    let actual = VENTA
    responder({
      ...BASE, '/api/ventas/7': () => actual,
      'POST /api/ventas/7/facturar': () => { actual = { ...VENTA, factura_id: 55, factura_display: 'FACTURA C 0005-00000011' }; return {} },
      'POST /api/ventas/7/anular': () => { actual = { ...actual, estado: 'anulada' }; return actual },
    })
    const user = userEvent.setup()
    montarDetalle(7, { puedeAnular: true, rutaDeFacturaManual: (id) => `/facturas/nueva?from_venta=${id}` })
    await screen.findByText(/Venta V-00007/)
    expect(screen.getByText('Facturar con el formulario').getAttribute('href')).toBe('/facturas/nueva?from_venta=7')
    expect(screen.getByText(/Generar remito/).getAttribute('href')).toBe('/remitos/nuevo')
    await user.click(screen.getByRole('button', { name: /Generar factura/ }))
    expect(await screen.findByText('FACTURA C 0005-00000011')).toBeTruthy()
    expect(screen.queryByText(/Generar factura/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Anular venta/ }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(pedidas().filter((p) => p.includes('anular'))).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /Anular venta/ }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Anular' }))
    expect(await screen.findByText('Anulada')).toBeTruthy()
  })

  it('los errores de facturar, anular y cargar se muestran', async () => {
    responder({
      ...BASE, '/api/ventas/7': VENTA,
      'POST /api/ventas/7/facturar': { status: 422, detail: 'La venta 7 está anulada.' },
      'POST /api/ventas/7/anular': '!caida',
    })
    const user = userEvent.setup()
    montarDetalle(7, { puedeAnular: true })
    await screen.findByText(/Venta V-00007/)
    await user.click(screen.getByRole('button', { name: /Generar factura/ }))
    expect(await screen.findByText('La venta 7 está anulada.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Anular venta/ }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Anular' }))
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
    cleanup()
    responder({ ...BASE, '/api/ventas/7': { status: 404, detail: 'Venta no encontrada' } })
    montarDetalle(7)
    expect(await screen.findByText('Venta no encontrada')).toBeTruthy()
  })

  it('el cobro por QR: pone el monto, pollea, suena al acreditarse y recarga', async () => {
    const osc = { type: '', frequency: { value: 0 }, connect: vi.fn(() => ({ connect: vi.fn() })), start: vi.fn(), stop: vi.fn() }
    const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
    const resume = vi.fn()
    class AudioFalso {
      state = 'suspended'
      currentTime = 0
      destination = {}
      resume = resume
      createOscillator() { return osc }
      createGain() { return gain }
    }
    vi.stubGlobal('AudioContext', AudioFalso)
    let status = 'pending'
    let actual = PENDIENTE
    responder({
      ...BASE, '/api/ventas/8': () => actual, 'POST /api/ventas/8/mp-qr': {},
      '/api/ventas/8/mp-status': () => ({ status }),
    })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montarDetalle(8)
    await screen.findByText(/Venta V-00008/)
    await user.click(screen.getByRole('button', { name: /Cobrar con QR/ }))
    expect(await screen.findByText(/Esperando el pago/)).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10) })
    expect(pedidas().filter((p) => p.includes('mp-status'))).toHaveLength(1)
    status = 'approved'
    actual = { ...PENDIENTE, estado: 'cobrada', mp_payment_id: '987' }
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10) })
    expect(await screen.findByText(/Cobrado por QR de MercadoPago/)).toBeTruthy()
    expect(osc.start).toHaveBeenCalledTimes(2)
    expect(resume).toHaveBeenCalled()
    // Con la venta ya acreditada, el poll no sigue.
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 2) })
    expect(pedidas().filter((p) => p.includes('mp-status'))).toHaveLength(2)
  })

  it('el QR rechazado, la espera agotada, el error de red y el 400 al crear se avisan', async () => {
    vi.stubGlobal('AudioContext', undefined)
    let status = 'rejected'
    responder({
      ...BASE, '/api/ventas/8': PENDIENTE, 'POST /api/ventas/8/mp-qr': {},
      '/api/ventas/8/mp-status': () => ({ status }),
    })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    montarDetalle(8)
    await screen.findByText(/Venta V-00008/)
    await user.click(screen.getByRole('button', { name: /Cobrar con QR/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10) })
    expect(await screen.findByText(/rechazado o cancelado/)).toBeTruthy()
    // Se agota la espera.
    status = 'pending'
    const ahora = Date.now()
    await user.click(screen.getByRole('button', { name: /Cobrar con QR/ }))
    vi.setSystemTime(ahora + ESPERA_MAXIMA_MS + 1000)
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10) })
    expect(await screen.findByText(/Se agotó la espera/)).toBeTruthy()
    // Error de red en el poll.
    responder({ ...BASE, '/api/ventas/8': PENDIENTE, 'POST /api/ventas/8/mp-qr': {}, '/api/ventas/8/mp-status': '!caida' })
    await user.click(screen.getByRole('button', { name: /Cobrar con QR/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10) })
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
    // El 400 al poner la orden.
    responder({ ...BASE, '/api/ventas/8': PENDIENTE, 'POST /api/ventas/8/mp-qr': { status: 400, detail: 'Configurá el POS ID' } })
    await user.click(screen.getByRole('button', { name: /Cobrar con QR/ }))
    expect(await screen.findByText('Configurá el POS ID')).toBeTruthy()
  })

  it('un AudioContext que revienta no impide cobrar', async () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('sin audio') } })
    responder({ ...BASE, '/api/ventas/8': PENDIENTE, 'POST /api/ventas/8/mp-qr': {} })
    const user = userEvent.setup()
    montarDetalle(8)
    await screen.findByText(/Venta V-00008/)
    await user.click(screen.getByRole('button', { name: /Cobrar con QR/ }))
    expect(await screen.findByText(/Esperando el pago/)).toBeTruthy()
  })
})

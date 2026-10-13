// Las listas de uso diario sin scroll horizontal (0.145.0, ADR-057): Clientes, Productos, Turnos, Compras y Proveedores son la tabla cuando entra y tarjetas
// cuando no, como Ventas (ADR-020) y Stock (ADR-016), con el mismo mecanismo (`TablaOTarjetas`).
// jsdom no mide el layout, así que el ancho se simula con un `ResizeObserver` falso que informa el que fije cada test, y `matchMedia` dice si la ventana
// es menor a 1024 px (donde los botones de la tabla miden 44). Lo medido en Chromium (0 px de desborde de página y de scroll interno, botones de 44 y 36)
// está en el ADR-057.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Clientes } from '../src/comercio/Clientes'
import { Compras } from '../src/comercio/Compras'
import { Productos } from '../src/comercio/Productos'
import { Proveedores } from '../src/comercio/Proveedores'
import { Turnos } from '../src/comercio/Turnos'
import type { Producto, Proveedor, PurchaseOrder, Turno } from '../src/comercio/tipos'
import type { Cliente } from '../src/mp'
import { cuerpoDe, pedidas, prepararFetch, responder } from './helpers-pantallas'

const TACTIL_BAJO_LG = ['max-lg:[&_a]:size-11', 'max-lg:[&_button]:size-11']
const NOMBRE_LARGO = 'Distribuidora Mayorista del Litoral Sociedad Anónima Comercial e Industrial'

let anchoSimulado = 0
class ObservadorFalso {
  constructor(private readonly cb: (e: { contentRect: { width: number } }[]) => void) {}
  observe() { this.cb([{ contentRect: { width: anchoSimulado } }]) }
  disconnect() {}
  unobserve() {}
}

/** `matchMedia` con una respuesta fija: `true` es una ventana de menos de 1024 px. */
function ventanaBajoLg(si: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: si, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  }))
}

beforeEach(() => {
  cleanup()
  prepararFetch()
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
})
afterEach(() => { vi.unstubAllGlobals() })

const abrir = (pantalla: React.ReactElement) => render(<MemoryRouter>{pantalla}</MemoryRouter>)
const tarjetasDe = (nombre: string) => within(screen.getByRole('list', { name: nombre })).getAllByRole('listitem')
const clases = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/)
/** El contenedor de los botones de acción de la fila (el `flex justify-end`). */
const contenedorDeBotones = (boton: HTMLElement) => boton.closest('div.justify-end')

// ── Clientes ─────────────────────────────────────────────────────────────

const ANA: Cliente = { id: 1, name: NOMBRE_LARGO, address: '', cuit_dni: '30-71234567-9', email: 'ana@x.com', phone: '341 555-1234', iva_condition: 'Responsable Inscripto', auto_facturar: 0, activo: 1 }
const BETO: Cliente = { ...ANA, id: 2, name: 'Beto', cuit_dni: '', phone: '', iva_condition: '', email: 'beto@x.com', activo: 0 }

describe('Clientes: tabla o tarjetas según el ancho', () => {
  async function abrirClientes(ancho: number) {
    anchoSimulado = ancho
    responder({ '/api/clientes': [ANA, BETO], 'POST /api/clientes/2/activar': {}, 'POST /api/clientes/1/desactivar': {} })
    abrir(<Clientes />)
    await screen.findAllByText(new RegExp(NOMBRE_LARGO))
  }

  it('con ancho de sobra es la tabla de siempre, con sus tres botones', async () => {
    await abrirClientes(1600)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Clientes' })).toBeNull()
    const fila = screen.getAllByRole('row')[1]
    expect(within(fila).getByLabelText('Ver ficha')).toBeTruthy()
    expect(within(fila).getByLabelText('Editar cliente')).toBeTruthy()
    expect(within(fila).getByLabelText('Eliminar cliente')).toBeTruthy()
  })

  it('con menos ancho que la suma de sus columnas pasa a tarjetas: lo mismo que la fila y las mismas acciones', async () => {
    await abrirClientes(390)
    expect(screen.queryByRole('table')).toBeNull()
    const [ana, beto] = tarjetasDe('Clientes')
    expect(within(ana).getByRole('link', { name: NOMBRE_LARGO }).getAttribute('href')).toBe('/clientes/1')
    // Los tres datos de la fila, rotulados.
    expect(within(ana).getByText('CUIT / DNI').nextElementSibling!.textContent).toBe('30-71234567-9')
    expect(within(ana).getByText('Condición IVA').nextElementSibling!.textContent).toBe('Responsable Inscripto')
    expect(within(ana).getByText('Teléfono').nextElementSibling!.textContent).toBe('341 555-1234')
    expect(within(ana).getByLabelText('Ver ficha')).toBeTruthy()
    expect(within(ana).getByLabelText('Editar cliente')).toBeTruthy()
    expect(within(ana).getByLabelText('Eliminar cliente')).toBeTruthy()
    // Un inactivo: la pastilla, «—» por cada dato vacío, atenuado, y sólo ver y reactivar (como la tabla).
    expect(within(beto).getByText('Inactivo')).toBeTruthy()
    expect(within(beto).getByText('CUIT / DNI').nextElementSibling!.textContent).toBe('—')
    expect(beto.className).toContain('opacity-50')
    expect(within(beto).queryByLabelText('Editar cliente')).toBeNull()
    expect(within(beto).getByLabelText('Reactivar cliente')).toBeTruthy()
  })

  it('la tarjeta no ensancha la página: columna minmax(0,1fr) y el nombre largo parte la línea', async () => {
    await abrirClientes(390)
    const [ana] = tarjetasDe('Clientes')
    expect(ana.className).toContain('grid-cols-[minmax(0,1fr)]')
    expect(within(ana).getByRole('link', { name: NOMBRE_LARGO }).closest('div')!.className).toContain('[overflow-wrap:anywhere]')
  })

  it('las acciones de la tarjeta andan: reactivar manda el POST', async () => {
    const user = userEvent.setup()
    await abrirClientes(390)
    await user.click(within(tarjetasDe('Clientes')[1]).getByLabelText('Reactivar cliente'))
    expect(pedidas()).toContain('POST /api/clientes/2/activar')
  })

  it('en tarjetas se sigue buscando (el buscador de la tabla viaja con la lista) y el vacío lo dice', async () => {
    const user = userEvent.setup()
    await abrirClientes(390)
    const buscador = screen.getByRole('searchbox', { name: 'Buscar cliente' })
    await user.type(buscador, 'beto@x')   // el email entra en la búsqueda aunque no sea dato de la tarjeta
    expect(tarjetasDe('Clientes')).toHaveLength(1)
    expect(within(tarjetasDe('Clientes')[0]).getByText('Beto')).toBeTruthy()
    await user.clear(buscador)
    await user.type(buscador, 'zzz')
    expect(screen.getByText('Sin resultados para «zzz».')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Clientes' })).toBeNull()
  })

  it('el umbral es la suma de los `size`: 782 px con los botones de 36 (escritorio) y 806 con los de 44 (bajo 1024)', async () => {
    // 220 (nombre) + 130 + 170 + 130 + acciones (3 botones: 3 × 36 + 2 × 4 + 16 = 132, o 3 × 44 + 8 + 16 = 156).
    await abrirClientes(782)
    expect(screen.getByRole('table')).toBeTruthy()
    cleanup()
    await abrirClientes(781)
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    ventanaBajoLg(true)
    await abrirClientes(805)
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    await abrirClientes(806)
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('sin medida (sin ResizeObserver) se queda en la tabla', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    responder({ '/api/clientes': [ANA, BETO] })
    abrir(<Clientes />)
    await screen.findAllByText(new RegExp(NOMBRE_LARGO))
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('en la tabla los botones de la fila son de 44 px bajo 1024 px (y 36 desde ahí): la clase va en el contenedor', async () => {
    await abrirClientes(1600)
    const botones = contenedorDeBotones(within(screen.getAllByRole('row')[1]).getByLabelText('Ver ficha'))
    expect(clases(botones)).toEqual(expect.arrayContaining(TACTIL_BAJO_LG))
  })
})

// ── Proveedores ──────────────────────────────────────────────────────────

const ACME: Proveedor = { id: 1, nombre: NOMBRE_LARGO, cuit_dni: '30-11111111-1', email: 'ventas.mayoristas.zona.norte@proveedor-largo.com.ar', phone: '0341-555-0001', address: '', iva_condition: '' }
const PELADO: Proveedor = { id: 2, nombre: 'Pelado', cuit_dni: '', email: '', phone: '', address: '', iva_condition: '' }

describe('Proveedores: tabla o tarjetas según el ancho', () => {
  async function abrirProveedores(ancho: number) {
    anchoSimulado = ancho
    responder({ '/api/proveedores': [ACME, PELADO] })
    abrir(<Proveedores />)
    await screen.findAllByText(new RegExp(NOMBRE_LARGO))
  }

  it('con ancho de sobra es la tabla; con menos que la suma de sus columnas, tarjetas con los mismos datos y botones', async () => {
    await abrirProveedores(1600)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(within(screen.getAllByRole('row')[1]).getByLabelText('Ver proveedor').getAttribute('href')).toBe('/proveedores/1')
    cleanup()
    await abrirProveedores(390)
    expect(screen.queryByRole('table')).toBeNull()
    const [acme, pelado] = tarjetasDe('Proveedores')
    expect(within(acme).getByRole('link', { name: NOMBRE_LARGO }).getAttribute('href')).toBe('/proveedores/1')
    expect(within(acme).getByText('Email').nextElementSibling!.textContent).toBe(ACME.email)
    expect(within(acme).getByText('CUIT/DNI').nextElementSibling!.textContent).toBe('30-11111111-1')
    expect(within(acme).getByText('Teléfono').nextElementSibling!.textContent).toBe('0341-555-0001')
    expect(within(acme).getByLabelText('Ver proveedor').getAttribute('href')).toBe('/proveedores/1')
    expect(within(acme).getByLabelText('Editar proveedor').getAttribute('href')).toBe('/proveedores/1')
    expect(within(pelado).getByText('Email').nextElementSibling!.textContent).toBe('—')
    // El email sin espacios parte la línea: no ensancha la página.
    expect(within(acme).getByText('Email').nextElementSibling!.className).toContain('[overflow-wrap:anywhere]')
  })

  it('la tabla lleva los botones de 44 px bajo 1024 px y el umbral cuenta los 8 px de más por botón (2 botones: 16)', async () => {
    // 200 (nombre) + 130 + 200 + 130 + acciones (2 botones: 92, o 108 con los de 44) = 752 o 768.
    await abrirProveedores(752)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(clases(contenedorDeBotones(within(screen.getAllByRole('row')[1]).getByLabelText('Ver proveedor')))).toEqual(expect.arrayContaining(TACTIL_BAJO_LG))
    cleanup()
    await abrirProveedores(751)
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    ventanaBajoLg(true)
    await abrirProveedores(767)
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    await abrirProveedores(768)
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('el vacío con búsqueda lo dice también en tarjetas', async () => {
    anchoSimulado = 390
    responder({ '/api/proveedores': [] })
    abrir(<Proveedores />)
    expect(await screen.findByText('No hay proveedores registrados aún.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

// ── Compras ──────────────────────────────────────────────────────────────

const ORDEN = (id: number, estado: PurchaseOrder['status'], subtotal: string): PurchaseOrder => ({
  id, number: `OC-00${id}`, proveedor_id: id, status: estado, is_fully_received: false,
  items: [{ item_id: id, quantity_ordered: '10', quantity_received: '0', pending_quantity: '10', unit_cost: '10.00', tax_rate: '21', subtotal }],
})

describe('Compras: tabla o tarjetas según el ancho', () => {
  async function abrirCompras(ancho: number) {
    anchoSimulado = ancho
    responder({
      '/api/purchase-orders': [ORDEN(1, 'draft', '1234.50'), ORDEN(2, 'received', '99.00')],
      '/api/proveedores': [{ ...ACME, id: 1 }, { ...PELADO, id: 2 }],
    })
    abrir(<Compras />)
    await screen.findAllByText('OC-001')
  }

  it('con ancho de sobra es la tabla (la fila lleva al detalle); con menos que sus columnas, tarjetas con número, proveedor, estado, líneas y total', async () => {
    await abrirCompras(1600)
    expect(screen.getByRole('table')).toBeTruthy()
    cleanup()
    await abrirCompras(390)
    expect(screen.queryByRole('table')).toBeNull()
    const [primera, segunda] = tarjetasDe('Órdenes de compra')
    expect(within(primera).getByRole('link', { name: 'OC-001' }).getAttribute('href')).toBe('/compras/1')
    expect(within(primera).getByText(NOMBRE_LARGO)).toBeTruthy()
    expect(within(primera).getByText('Borrador')).toBeTruthy()
    expect(within(primera).getByText('Líneas').nextElementSibling!.textContent).toBe('1')
    expect(within(primera).getByText('Total').nextElementSibling!.textContent).toBe('$1.234,50')
    expect(within(segunda).getByText('Recibida')).toBeTruthy()
    expect(within(segunda).getByText('Pelado')).toBeTruthy()
  })

  it('sin columna de acciones, el número de la tarjeta es un link de 44 px de alto (la acción de la fila es entrar al detalle)', async () => {
    await abrirCompras(390)
    expect(clases(screen.getByRole('link', { name: 'OC-001' }))).toEqual(expect.arrayContaining(['min-h-11']))
  })

  it('en tarjetas se sigue buscando por número o proveedor', async () => {
    const user = userEvent.setup()
    await abrirCompras(390)
    await user.type(screen.getByRole('searchbox', { name: 'Buscar orden de compra' }), 'pelado')
    const quedan = tarjetasDe('Órdenes de compra')
    expect(quedan).toHaveLength(1)
    expect(within(quedan[0]).getByRole('link', { name: 'OC-002' })).toBeTruthy()
  })

  it('el umbral es el que pide la tabla: 640 px (proveedor sin `size` vale 150)', async () => {
    await abrirCompras(640)
    expect(screen.getByRole('table')).toBeTruthy()
    cleanup()
    await abrirCompras(639)
    expect(screen.queryByRole('table')).toBeNull()
  })
})

// ── Turnos ───────────────────────────────────────────────────────────────

const TURNO_CERRADO: Turno = {
  id: 12, usuario_id: 1, usuario_nombre: 'Cajero con un nombre bastante largo Apellido Compuesto', apertura: '2026-10-05 08:00:00', cierre: '2026-10-05 16:30:00', monto_inicial: 5000,
  monto_declarado_cierre: 1234567.89, monto_esperado_cierre: 1234500, estado: 'cerrado', notas: '', caja: { id: 1, nombre: 'Caja principal del salón' }, sucursal: { id: 1, nombre: 'Central' },
}
const TURNO_ABIERTO: Turno = { ...TURNO_CERRADO, id: 13, cierre: null, monto_declarado_cierre: null, monto_esperado_cierre: null, estado: 'abierto', usuario_nombre: 'María', caja: null }

describe('Turnos: tabla o tarjetas según el ancho', () => {
  async function abrirTurnos(ancho: number) {
    anchoSimulado = ancho
    responder({ '/api/turnos': { turnos: [TURNO_CERRADO, TURNO_ABIERTO], turno_activo: null } })
    abrir(<Turnos esAdmin conCaja />)
    await screen.findAllByText(/Caja principal del salón/)
  }

  it('con ancho de sobra es la tabla; con menos que sus columnas, tarjetas con cajero, caja, fechas, importes, diferencia y estado', async () => {
    await abrirTurnos(1600)
    expect(screen.getByRole('table')).toBeTruthy()
    cleanup()
    await abrirTurnos(390)
    expect(screen.queryByRole('table')).toBeNull()
    const [cerrado, abierto] = tarjetasDe('Turnos')
    expect(within(cerrado).getByRole('link', { name: 'Turno N° 12' }).getAttribute('href')).toBe('/turnos/12')
    expect(within(cerrado).getByText(`${TURNO_CERRADO.usuario_nombre} · Caja principal del salón`)).toBeTruthy()
    expect(within(cerrado).getByText('Cerrado')).toBeTruthy()
    expect(within(cerrado).getByText('Apertura').nextElementSibling!.textContent).toMatch(/^05.10.2026 08:00$/)   // sin los segundos, como la tabla
    expect(within(cerrado).getByText('Cierre').nextElementSibling!.textContent).toMatch(/^05.10.2026 16:30$/)
    expect(within(cerrado).getByText('Esperado').nextElementSibling!.textContent).toMatch(/1\.234\.500,00/)
    expect(within(cerrado).getByText('Declarado').nextElementSibling!.textContent).toMatch(/1\.234\.567,89/)
    expect(within(cerrado).getByText('Diferencia').nextElementSibling!.textContent).toMatch(/\+.*67,89/)
    expect(within(cerrado).getByLabelText('Ver detalle').getAttribute('href')).toBe('/turnos/12')
    // El abierto no tiene cierre ni importes: «—», como la tabla; sin caja el subtítulo es sólo el cajero.
    expect(within(abierto).getByText('Abierto')).toBeTruthy()
    expect(within(abierto).getByText('Cierre').nextElementSibling!.textContent).toBe('—')
    expect(within(abierto).getByText('Esperado').nextElementSibling!.textContent).toBe('—')
    expect(within(abierto).getByText('María')).toBeTruthy()
  })

  it('la tabla lleva el botón de 44 px bajo 1024 px y la columna lo cuenta: el umbral sube 8 px', async () => {
    // Con esAdmin y caja, sin la opcional «Fondo inicial» (no cuenta): 45 + 85 + 110 + 126 + 126 + 114 + 114 + 100 + 80 + acciones (1 botón: 52 o 60) = 952 o 960.
    await abrirTurnos(952)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(clases(contenedorDeBotones(within(screen.getAllByRole('row')[1]).getByLabelText('Ver detalle')))).toEqual(expect.arrayContaining(TACTIL_BAJO_LG))
    cleanup()
    await abrirTurnos(951)
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    ventanaBajoLg(true)
    await abrirTurnos(959)
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    await abrirTurnos(960)
    expect(screen.getByRole('table')).toBeTruthy()
  })
})

// ── Productos ────────────────────────────────────────────────────────────

const PRODUCTO = (id: number, extra: Partial<Producto> = {}): Producto => ({
  id, codigo: `COD-${id}`, nombre: `Producto ${id}`, descripcion: '', precio_venta: 1500, precio_costo: 900, unidad: 'kg', categoria: 'Almacén', stock_minimo: 0, estacion: '', vendible: 1, activo: 1, tipo: 'producto', ...extra,
})
const YERBA = PRODUCTO(1, { nombre: 'Yerba mate compuesta con hierbas serranas selección especial paquete de 500 gramos', precio_venta: 12345.5 })
const INACTIVO = PRODUCTO(2, { nombre: 'Viejo', activo: 0, codigo: null, categoria: '' })

describe('Productos: tabla o tarjetas según el ancho', () => {
  async function abrirProductos(ancho: number, props: React.ComponentProps<typeof Productos> = {}) {
    anchoSimulado = ancho
    responder({
      '/api/productos': [YERBA, INACTIVO], '/api/productos/categorias': [], '/api/productos/unidades': ['u', 'kg'],
      '/api/stock': { productos: [{ id: 1, stock_actual: 14 }, { id: 2, stock_actual: 0 }] }, '/api/proveedores': [],
    })
    abrir(<Productos conDetalle conStockTotal conEliminar {...props} />)
    await screen.findAllByText(new RegExp(YERBA.nombre))
  }

  it('con ancho de sobra es la tabla; con menos que sus columnas, tarjetas con código, categoría, precios, stock total, estado y los tres botones', async () => {
    await abrirProductos(1600)
    expect(screen.getByRole('table')).toBeTruthy()
    cleanup()
    await abrirProductos(390)
    expect(screen.queryByRole('table')).toBeNull()
    const [yerba, viejo] = tarjetasDe('Productos')
    expect(within(yerba).getByText(YERBA.nombre)).toBeTruthy()
    expect(within(yerba).getByText('COD-1 · Almacén')).toBeTruthy()
    expect(within(yerba).getByText('Activo')).toBeTruthy()
    expect(within(yerba).getByText('Precio venta').nextElementSibling!.textContent).toMatch(/12\.345,50.*\/ kg/)
    expect(within(yerba).getByText('Precio costo').nextElementSibling!.textContent).toMatch(/900,00/)
    expect(within(yerba).getByText('Stock total').nextElementSibling!.textContent).toBe('14 kg')
    expect(within(yerba).getByLabelText('Editar producto')).toBeTruthy()
    expect(within(yerba).getByLabelText('Gestionar códigos y variantes')).toBeTruthy()
    expect(within(yerba).getByLabelText('Eliminar producto')).toBeTruthy()
    expect(within(viejo).getByText('Inactivo')).toBeTruthy()
    expect(viejo.className).toContain('opacity-60')
  })

  it('editar desde la tarjeta abre el mismo diálogo (el botón lleva `data-editar-producto`, de donde el foco vuelve)', async () => {
    const user = userEvent.setup()
    await abrirProductos(390)
    const editar = within(tarjetasDe('Productos')[0]).getByLabelText('Editar producto')
    expect(editar.getAttribute('data-editar-producto')).toBe('1')
    await user.click(editar)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('un insumo (conVendible) lleva la pastilla «Insumo» también en la tarjeta', async () => {
    anchoSimulado = 390
    responder({
      '/api/productos': [PRODUCTO(3, { nombre: 'Harina', vendible: 0 })], '/api/productos/categorias': [], '/api/productos/unidades': ['u'], '/api/stock': { productos: [] }, '/api/proveedores': [],
    })
    abrir(<Productos conVendible />)
    await screen.findAllByText('Harina')
    expect(within(tarjetasDe('Productos')[0]).getByText('Insumo')).toBeTruthy()
  })

  it('sin costo (el rol no lo ve) la tarjeta no tiene «Precio costo», como la tabla no tiene la columna', async () => {
    anchoSimulado = 390
    const sinCosto = (p: Producto) => { const { precio_costo: _c, ...resto } = p; return resto }
    responder({
      '/api/productos': [sinCosto(YERBA)], '/api/productos/categorias': [], '/api/productos/unidades': ['u'], '/api/stock': { productos: [] }, '/api/proveedores': [],
    })
    abrir(<Productos />)
    await screen.findAllByText(new RegExp(YERBA.nombre))
    expect(screen.queryByText('Precio costo')).toBeNull()
  })

  it('la tabla lleva los botones de 44 px bajo 1024 px y el umbral cuenta los 3 botones a 44: 912 → 936', async () => {
    // 88 + 110 + 96 + 70 + 114 + 114 + 110 + 78 + acciones (3 botones: 132 o 156) = 912 o 936.
    await abrirProductos(912)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(clases(contenedorDeBotones(within(screen.getAllByRole('row')[1]).getByLabelText('Editar producto')))).toEqual(expect.arrayContaining(TACTIL_BAJO_LG))
    cleanup()
    await abrirProductos(911)
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    ventanaBajoLg(true)
    await abrirProductos(935)
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    await abrirProductos(936)
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('el cuerpo del pedido de edición no cambia por haber abierto la tarjeta (guardar manda lo mismo)', async () => {
    const user = userEvent.setup()
    responder({
      '/api/productos': [YERBA], '/api/productos/categorias': [], '/api/productos/unidades': ['u', 'kg'], '/api/stock': { productos: [] }, '/api/proveedores': [], 'PUT /api/productos/1': YERBA,
    })
    anchoSimulado = 390
    abrir(<Productos />)
    await screen.findAllByText(new RegExp(YERBA.nombre))
    await user.click(within(tarjetasDe('Productos')[0]).getByLabelText('Editar producto'))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.submit(dialogo.querySelector('form')!)
    await vi.waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    expect(cuerpoDe('PUT /api/productos/1')).toMatchObject({ nombre: YERBA.nombre })
  })
})

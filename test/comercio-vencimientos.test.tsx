// Vencimientos y lotes (0.91.0, A-2 del roadmap de VentaLibra): la pantalla sobre `/api/vencimientos`. Los lotes, los
// saldos y los estados son del motor; lo que se prueba acá es lo que la pantalla decide: qué pide, qué valida, qué avisa,
// qué NO muestra (datos de una consulta vieja) y, sobre todo, cómo escribe: con UNA `clave_operacion` por intento, la misma
// al reintentar y otra cuando los datos cambian, sin doble envío.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Vencimientos } from '../src/comercio/Vencimientos'
import { _reiniciarPendientesEnMemoria } from '../src/comercio/vencimientos-pendientes'
import type { VencimientoLote, VencimientoSinLote, VencimientosData } from '../src/comercio/tipos'
import { elegirEnBuscable, fetchMock, json, montar, opcionesDe, pedidas, prepararFetch, responder } from './helpers-pantallas'

const lote = (o: Partial<VencimientoLote>): VencimientoLote => ({
  producto_id: 1, codigo: null, nombre: '', unidad: 'u', categoria: '', deposito_id: 1, deposito: 'Depósito Centro',
  deposito_activo: true, sucursal_id: 1, sucursal: 'Centro', variante_id: null, variante: null, lote: null, vence: '2026-10-01',
  dias_para_vencer: 1, saldo: 0, estado: 'por_vencer', ...o,
})

// En el orden del motor: por vencimiento (el más próximo primero, los vencidos delante).
const YERBA = lote({
  producto_id: 1, codigo: 'Y-1', nombre: 'Yerba', categoria: 'Almacén', lote: 'L1', vence: '2026-09-25', dias_para_vencer: -5,
  saldo: 4, estado: 'vencido',
})
const CREMA = lote({
  producto_id: 2, codigo: 'C-2', nombre: 'Crema', lote: 'C9', vence: '2026-09-29', dias_para_vencer: -1, saldo: 2, estado: 'vencido',
  deposito_id: 2, deposito: 'Depósito Norte', sucursal_id: 2, sucursal: 'Norte',
})
const HARINA = lote({
  producto_id: 3, codigo: 'H-9', nombre: 'Harina', unidad: 'kg', lote: 'H7', vence: '2026-09-30', dias_para_vencer: 0, saldo: 1.5,
  variante_id: 7, variante: 'x500',
})
const LECHE = lote({
  producto_id: 4, codigo: null, nombre: 'Leche', lote: null, vence: '2026-10-01', dias_para_vencer: 1, saldo: 1234.5,
  deposito_id: 3, deposito: 'Depósito viejo', deposito_activo: false, sucursal_id: null, sucursal: null,
})
const QUESO = lote({ producto_id: 5, codigo: 'Q-5', nombre: 'Queso', lote: 'Q3', vence: '2026-10-10', dias_para_vencer: 10, saldo: 12 })

const sinLote = (o: Partial<VencimientoSinLote>): VencimientoSinLote => ({
  producto_id: 6, codigo: null, nombre: '', unidad: 'u', categoria: '', deposito_id: 1, deposito: 'Depósito Centro',
  deposito_activo: true, sucursal_id: 1, sucursal: 'Centro', variante_id: null, variante: null, saldo: 0, situacion: 'sin_fecha', ...o,
})
const ARROZ = sinLote({ producto_id: 6, codigo: 'A-1', nombre: 'Arroz', saldo: 20, categoria: 'Almacén' })
const ARROZ_NORTE = sinLote({
  producto_id: 6, codigo: 'A-1', nombre: 'Arroz', saldo: 5, deposito_id: 2, deposito: 'Depósito Norte', sucursal_id: 2, sucursal: 'Norte',
  variante_id: 2, variante: 'x1kg',
})
const FIDEOS = sinLote({ producto_id: 8, nombre: 'Fideos', saldo: -3, situacion: 'salidas_sin_lote' })

const DATA: VencimientosData = {
  sucursal_id: null, deposito_id: null, categoria: null, producto_id: null, incluir_vencidos: true,
  hoy: '2026-09-30', dias: 15, hasta: '2026-10-15',
  resumen: {
    lotes_por_vencer: 3, lotes_vencidos: 2, unidades_por_vencer: 1248, unidades_vencidas: 6, productos: 5,
    productos_sin_lote: 1, productos_con_salidas_sin_lote: 1, saldos_sin_fecha: 2, saldos_con_salidas_sin_lote: 1,
  },
  lotes: [YERBA, CREMA, HARINA, LECHE, QUESO],
  sin_lote: [FIDEOS, ARROZ, ARROZ_NORTE],
}

const RUTA = '/api/vencimientos'
const SUCURSALES = [
  { id: 1, nombre: 'Centro', codigo: null, direccion: null, activa: 1, es_default: 1, deposito_predeterminado_id: 1, depositos: 1 },
  { id: 2, nombre: 'Norte', codigo: null, direccion: null, activa: 1, es_default: 0, deposito_predeterminado_id: 2, depositos: 1 },
]
const CATEGORIAS = [{ id: 1, nombre: 'Almacén' }, { id: 2, nombre: 'Lácteos' }]
const producto = (id: number, nombre: string, extra: Record<string, unknown> = {}) => ({
  id, codigo: `P-${id}`, nombre, descripcion: '', precio_venta: 1, precio_costo: 1, unidad: 'u', categoria: '', stock_minimo: 0,
  estacion: '', vendible: 1, activo: 1, tipo: 'producto', ...extra,
})
const PRODUCTOS = [producto(1, 'Yerba'), producto(2, 'Crema'), producto(9, 'Consultoría', { tipo: 'servicio' }), producto(10, 'Viejo', { activo: 0 })]
const MERMA_OK = { producto_id: 1, deposito_id: 1, variante_id: null, lote: 'L1', vence: '2026-09-25', cantidad: 4, saldo_restante: 0, repetida: false }
const ASIGNAR_OK = {
  producto_id: 6, deposito_id: 1, variante_id: null, lote: 'A-2026', vence: '2027-03-15', cantidad: 20, referencia: 'Asignación de vencimiento',
  saldo_sin_lote: 0, repetida: false,
}
const TODO = {
  [RUTA]: DATA, '/api/sucursales': SUCURSALES, '/api/productos/categorias': CATEGORIAS, '/api/productos': PRODUCTOS,
  'POST /api/vencimientos/merma': MERMA_OK, 'POST /api/vencimientos/asignar': ASIGNAR_OK,
}

/** La consulta con los defaults del motor; `extra` va al final (`&sucursal_id=2`). */
const consulta = (extra = '', p = 'dias=15&incluir_vencidos=true') => `${p}${extra}`
const pide = (extra = '', p?: string) => `GET ${RUTA}?${consulta(extra, p)}`
/** Sólo los pedidos al reporte (la pantalla también pide sucursales, categorías y productos). */
const pedidasAlReporte = () => pedidas().filter((p) => p.startsWith(`GET ${RUTA}?`))
const ultimaConsulta = () => pedidasAlReporte().at(-1)

/** Sin espacios raros ni saltos. */
const texto = (el: HTMLElement | null) => (el?.textContent ?? '').replace(/\s+/g, ' ')
/** Las tablas: la de lotes y la de «sin lote». */
const tablaDeLotes = () => screen.getAllByRole('table')[0]
const fila = (nombre: string) => within(tablaDeLotes()).getByText(nombre).closest('tr')!
const filaSinLote = (nombre: string, n = 0) => within(screen.getAllByRole('table')[1]).getAllByText(nombre)[n].closest('tr')!
const nombresEnTabla = () => within(tablaDeLotes()).getAllByRole('row').slice(1)
  .map((tr) => tr.querySelector('td span.font-medium')?.textContent)

/** Lo que se mandó a un POST, en orden. */
const enviosA = (ruta: string) => fetchMock.mock.calls
  .filter((c) => String(c[0]) === ruta && (c[1] as RequestInit | undefined)?.method === 'POST')
  .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>)
const clavesDe = (ruta: string) => enviosA(ruta).map((e) => e.clave_operacion)

/** Las respuestas de un POST, una por intento (la última se repite): una función que devuelve la `Response`, o `'caida'`. */
function secuencia(ruta: string, respuestas: (() => Response | Promise<Response> | 'caida')[]) {
  const base = fetchMock.getMockImplementation()!
  let i = 0
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    if (String(entrada) === ruta && init?.method === 'POST') {
      const r = respuestas[Math.min(i++, respuestas.length - 1)]()
      return r === 'caida' ? Promise.reject(new TypeError('sin red')) : Promise.resolve(r)
    }
    return base(entrada, init)
  })
}

async function abrir(tabla: Record<string, unknown> = TODO, props: { puedeMover?: boolean; puedeMarcar?: boolean } = {}) {
  responder(tabla)
  montar('/vencimientos', <Vencimientos {...props} />)
  await screen.findByText('5 lotes')
}

/** El `detail` real del 503 de `SinRevision` (libracommerce/erp/vencimientos.py): el único 503 que dice que no se escribió. */
const DETALLE_SIN_REVISION = 'Falta la revisión 0002_vencimientos_lotes del motor: corré `libracommerce-migrar upgrade` (--prefijo del producto) antes de usar vencimientos y lotes.'
const MERMA = '/api/vencimientos/merma'
const ASIGNAR = '/api/vencimientos/asignar'
const dialogo = () => screen.getByRole('dialog')
const confirmar = () => within(dialogo()).getByRole('button', { name: /Confirmar|Guardando|Reenviar el intento anterior/ })

async function abrirMerma(user: ReturnType<typeof userEvent.setup>, nombre = 'Yerba') {
  await user.click(within(fila(nombre)).getByRole('button', { name: /Dar de baja/ }))
  return dialogo()
}
async function abrirAsignar(user: ReturnType<typeof userEvent.setup>, nombre = 'Arroz', n = 0) {
  await user.click(within(filaSinLote(nombre, n)).getByRole('button', { name: /Asignar vencimiento/ }))
  return dialogo()
}
function completarAsignacion(lote = 'A-2026', vence = '2027-03-15') {
  fireEvent.change(within(dialogo()).getByLabelText('Lote'), { target: { value: lote } })
  fireEvent.change(within(dialogo()).getByLabelText('Fecha de vencimiento'), { target: { value: vence } })
}

beforeEach(() => {
  cleanup()
  sessionStorage.clear()
  _reiniciarPendientesEnMemoria()
  prepararFetch()
})

describe('Vencimientos: lo que muestra', () => {
  it('una respuesta que no es lo que promete el motor se avisa y no rompe la pantalla', async () => {
    for (const rara of [{}, { lotes: [], resumen: {} }, { lotes: 'x', sin_lote: [], resumen: {} }, { lotes: [], sin_lote: [] }, [], 'hola']) {
      responder({ ...TODO, [RUTA]: rara })
      montar('/vencimientos', <Vencimientos />)
      expect((await screen.findByText('La respuesta del servidor no tiene el formato esperado.')).getAttribute('role')).toBe('alert')
      expect(screen.queryByRole('table')).toBeNull()
      cleanup()
    }
  })

  it('pide con los defaults (15 días, con vencidos) y muestra los lotes con fecha dd-mm-aaaa y saldo tal como lo manda el motor', async () => {
    await abrir()
    expect(pedidasAlReporte()).toEqual([pide()])
    expect(screen.getByRole('heading', { name: /Vencimientos y lotes/ })).toBeTruthy()
    expect((screen.getByLabelText('Días de anticipación') as HTMLInputElement).value).toBe('15')
    expect((screen.getByLabelText('Incluir vencidos') as HTMLInputElement).checked).toBe(true)

    // El resumen sale de los contadores del motor, no de contar filas.
    const resumen = texto(screen.getByText('5 lotes').closest('div'))
    expect(resumen).toContain('3 por vencer (1.248 unid.)')
    expect(resumen).toContain('2 vencidos (6 unid.)')
    expect(resumen).toContain('5 productos')
    expect(nombresEnTabla()).toEqual(['Yerba', 'Crema', 'Harina', 'Leche', 'Queso'])

    const yerba = within(fila('Yerba')).getAllByRole('cell').map((c) => texto(c))
    expect(yerba.slice(0, 5)).toEqual(['YerbaAlmacén', 'Y-1', 'Centro · Depósito Centro', 'L1', '25-09-2026'])
    expect(yerba[6]).toBe('4 u')

    // Fraccionables: decimales del motor con coma, miles con punto; sin código ni lote, un guion; la variante junto al nombre.
    const harina = texto(fila('Harina'))
    expect(harina).toContain('x500')
    expect(harina).toContain('1,5 kg')
    expect(harina).toContain('30-09-2026')
    const leche = within(fila('Leche')).getAllByRole('cell')
    expect(texto(leche[1])).toBe('—')
    expect(texto(leche[3])).toBe('—')
    expect(texto(leche[6])).toBe('1.234,5 u')
    // Sin sucursal (un depósito suelto) sólo el depósito, y uno inactivo se dice.
    expect(texto(leche[2])).toBe('Depósito viejoDepósito inactivo')
    expect(texto(fila('Yerba'))).not.toContain('inactivo')

    expect(texto(screen.getByText(/se listan los lotes que vencen hasta el/))).toContain('Hoy es 30-09-2026')
    expect(texto(screen.getByText(/se listan los lotes que vencen hasta el/))).toContain('hasta el 15-10-2026')
  })

  it('cada estado sale en color y en texto: vencido hace N días, vence hoy, vence en N días', async () => {
    await abrir()
    const badge = (n: string) => within(fila(n)).getByText(/Vence|Vencido/)
    expect(badge('Yerba').textContent).toBe('Vencido hace 5 días')
    expect(badge('Yerba').getAttribute('data-estado')).toBe('vencido')
    expect(badge('Crema').textContent).toBe('Vencido hace 1 día')
    expect(badge('Harina').textContent).toBe('Vence hoy')
    expect(badge('Harina').getAttribute('data-estado')).toBe('por_vencer')
    expect(badge('Harina').className).toContain('amber')
    expect(badge('Leche').textContent).toBe('Vence en 1 día')
    expect(badge('Queso').textContent).toBe('Vence en 10 días')
  })

  it('el aviso de que el saldo por lote puede ser mayor al real es una nota permanente, sin botón para cerrarla', async () => {
    await abrir()
    const nota = screen.getAllByRole('note')[0]
    expect(texto(nota)).toBe(
      'Las ventas, devoluciones y transferencias anteriores al descuento por lote, y los ajustes de stock, restaron del stock “sin lote”: ' +
      'el saldo de cada lote puede ser MAYOR al real. Contrastá con el conteo físico antes de decidir.')
    expect(within(nota).queryByRole('button')).toBeNull()
    // Ya no promete un «hasta que»: desde A-4 las ventas descuentan por lote.
    expect(texto(nota)).not.toContain('Hasta que')
    // Arriba de la tabla.
    expect(nota.compareDocumentPosition(tablaDeLotes()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('el aviso está también mientras carga, con error y con un parámetro inválido', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    montar('/vencimientos', <Vencimientos />)
    expect(await screen.findByText('Cargando…')).toBeTruthy()
    expect(screen.getAllByRole('note')).toHaveLength(1)

    cleanup()
    responder({ ...TODO, [RUTA]: { status: 422, detail: 'la sucursal 9 no existe' } })
    montar('/vencimientos', <Vencimientos />)
    await screen.findByText('la sucursal 9 no existe')
    expect(screen.getAllByRole('note')).toHaveLength(1)

    cleanup()
    await abrir()
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '0' } })
    await screen.findByText('Corregí los días de anticipación para ver los lotes.')
    expect(screen.getAllByRole('note')).toHaveLength(1)
  })

  it('«Sin lote / sin fecha» muestra cada situación con su explicación en llano y sus filas por depósito y variante', async () => {
    await abrir()
    const seccion = screen.getByRole('heading', { name: /Sin lote \/ sin fecha/ }).parentElement!
    expect(texto(seccion)).toContain('2 sin fecha')
    expect(texto(seccion)).toContain('1 con salidas sin lote')
    // Qué significa cada una.
    expect(texto(seccion)).toContain('Sin fecha: Hay stock que no tiene lote ni fecha de vencimiento')
    expect(texto(seccion)).toContain('Salidas sin lote: Hubo ventas, devoluciones o ajustes que restaron de “sin lote”')
    expect(texto(seccion)).toContain('los lotes de este producto en este depósito muestran más de lo que hay')

    // Una fila por depósito y variante: Arroz aparece dos veces, sin sumarse.
    const filasSinLote = within(screen.getAllByRole('table')[1]).getAllByRole('row').slice(1)
    expect(filasSinLote).toHaveLength(3)
    expect(texto(filaSinLote('Fideos'))).toContain('-3')
    expect(filaSinLote('Fideos').querySelector('[data-situacion="salidas_sin_lote"]')?.textContent).toBe('Salidas sin lote')
    expect(filaSinLote('Arroz', 0).querySelector('[data-situacion="sin_fecha"]')?.textContent).toBe('Sin fecha')
    expect(texto(filaSinLote('Arroz', 0))).toContain('Centro · Depósito Centro')
    expect(texto(filaSinLote('Arroz', 1))).toContain('x1kg')
    expect(texto(filaSinLote('Arroz', 1))).toContain('Norte · Depósito Norte')
    expect(texto(filaSinLote('Arroz', 1))).toContain('5 u')
  })

  it('sin lotes ni saldos sin lote lo dice claro y no hay tablas', async () => {
    responder({ ...TODO, [RUTA]: { ...DATA, lotes: [], sin_lote: [], resumen: { ...DATA.resumen, lotes_por_vencer: 0, lotes_vencidos: 0, productos: 0 } } })
    montar('/vencimientos', <Vencimientos />)
    expect(await screen.findByText('No hay lotes por vencer con estos parámetros')).toBeTruthy()
    expect(screen.getByText('No hay stock sin lote en los productos marcados')).toBeTruthy()
    expect(screen.getByText('0 lotes')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('Vencimientos: lo que pide', () => {
  it('«Toda la instancia» no manda sucursal, y elegir una manda su id (y volver la saca)', async () => {
    const user = userEvent.setup()
    await abrir()
    const selector = await screen.findByLabelText('Sucursal')
    expect(await opcionesDe(user, selector)).toEqual(['Toda la instancia', 'Centro', 'Norte'])
    await elegirEnBuscable(user, selector, 'Norte')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&sucursal_id=2')))
    await elegirEnBuscable(user, selector, 'Toda la instancia')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide()))
  })

  it('la categoría viaja por nombre, «Todas las categorías» la saca, y sin categorías o sucursales la pantalla sigue sin ese filtro', async () => {
    const user = userEvent.setup()
    await abrir()
    const selector = await screen.findByLabelText('Categoría')
    expect(await opcionesDe(user, selector)).toEqual(['Todas las categorías', 'Almacén', 'Lácteos'])
    await elegirEnBuscable(user, selector, 'Lácteos')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&categoria=L%C3%A1cteos')))
    await elegirEnBuscable(user, selector, 'Todas las categorías')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide()))

    cleanup()
    responder({ ...TODO, '/api/productos/categorias': { status: 403, detail: 'Sin permiso' }, '/api/sucursales': { status: 403, detail: 'Sin permiso' } })
    montar('/vencimientos', <Vencimientos />)
    expect(await screen.findByText('5 lotes')).toBeTruthy()
    expect(screen.queryByLabelText('Categoría')).toBeNull()
    expect(screen.queryByLabelText('Sucursal')).toBeNull()
    expect(screen.queryByText('Sin permiso')).toBeNull()
  })

  it('los días son editables (los topes 1 y 365 valen) y «Incluir vencidos» se puede desmarcar', async () => {
    const user = userEvent.setup()
    await abrir()
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '365' } })
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias=365&incluir_vencidos=true')))
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '1' } })
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias=1&incluir_vencidos=true')))
    expect(screen.queryByRole('alert')).toBeNull()

    await user.click(screen.getByLabelText('Incluir vencidos'))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias=1&incluir_vencidos=false')))
    expect(texto(screen.getByText(/Se listan los lotes con saldo/))).not.toContain('ya vencieron')
    await user.click(screen.getByLabelText('Incluir vencidos'))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias=1&incluir_vencidos=true')))
    expect(texto(screen.getByText(/Se listan los lotes con saldo/))).toContain('y los que ya vencieron')
  })
})

describe('Vencimientos: validación de los días', () => {
  it.each(['0', '366', '', '1.5', '-3', 'abc'])('días = "%s" no se manda: se avisa el rango, no se muestra una lista que no corresponde y no hay CSV', async (valor) => {
    await abrir()
    const pedidosAntes = pedidasAlReporte().length
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: valor } })

    expect((await screen.findByRole('alert')).textContent).toBe('Tiene que ser un entero entre 1 y 365.')
    expect(screen.getByLabelText('Días de anticipación').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Días de anticipación').getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
    expect(screen.getByText('Corregí los días de anticipación para ver los lotes.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('link', { name: /CSV/ })).toBeNull()
    expect(pedidasAlReporte()).toHaveLength(pedidosAntes)
  })

  it('al corregir el valor vuelve a pedir y la lista reaparece', async () => {
    await abrir()
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '0' } })
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '7' } })
    expect(await screen.findByText('Yerba')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(ultimaConsulta()).toBe(pide('', 'dias=7&incluir_vencidos=true'))
  })
})

describe('Vencimientos: cargando, errores y consultas viejas', () => {
  it('el error de la API o de la red se muestra; el 503 dice qué migración falta', async () => {
    responder({ ...TODO, [RUTA]: { status: 422, detail: 'la sucursal 9 no existe' } })
    montar('/vencimientos', <Vencimientos />)
    expect((await screen.findByText('la sucursal 9 no existe')).getAttribute('role')).toBe('alert')
    expect(screen.queryByRole('table')).toBeNull()

    cleanup()
    responder({ ...TODO, [RUTA]: { status: 503, detail: DETALLE_SIN_REVISION } })
    montar('/vencimientos', <Vencimientos />)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'La base no tiene aplicada la revisión de vencimientos; pedí al administrador que ejecute libracommerce-migrar upgrade.')

    cleanup()
    responder({ ...TODO, [RUTA]: '!caida' })
    montar('/vencimientos', <Vencimientos />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })

  it('mientras contesta una consulta nueva no se muestran los lotes de la anterior bajo los controles nuevos', async () => {
    await abrir()
    let soltar!: () => void
    const lenta = new Promise<Response>((resolve) => {
      soltar = () => resolve(json({ ...DATA, dias: 30, lotes: [{ ...YERBA, nombre: 'Nueva' }], resumen: { ...DATA.resumen, lotes_por_vencer: 0, lotes_vencidos: 1 } }))
    })
    fetchMock.mockImplementation((entrada: RequestInfo | URL) => (String(entrada).startsWith(`${RUTA}?`) ? lenta : Promise.resolve(json([]))))
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '30' } })

    // Los controles ya dicen 30: la tabla vieja (15 días) no puede seguir ahí, ni su resumen, ni su CSV, ni lo de «sin lote».
    expect(await screen.findByText('Cargando…')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('Yerba')).toBeNull()
    expect(screen.queryByText('Arroz')).toBeNull()
    expect(screen.queryByText('5 lotes')).toBeNull()
    expect(screen.queryByRole('link', { name: /CSV/ })).toBeNull()
    expect(screen.getAllByRole('note')).toHaveLength(1)

    soltar()
    expect(await screen.findByText('Nueva')).toBeTruthy()
    expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toContain('dias=30')
  })

  it('un error tras una lista buena saca la lista, y el siguiente pedido bueno la trae de nuevo', async () => {
    await abrir()
    responder({ ...TODO, [RUTA]: { status: 403, detail: 'Solo admin' } })
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '20' } })
    expect(await screen.findByText('Solo admin')).toBeTruthy()
    expect(screen.queryByText('Yerba')).toBeNull()
    responder(TODO)
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '21' } })
    expect(await screen.findByText('Yerba')).toBeTruthy()
    expect(screen.queryByText('Solo admin')).toBeNull()
  })

  it('una respuesta lenta de parámetros viejos no pisa a la de los nuevos', async () => {
    let soltarLaVieja!: () => void
    const vieja = new Promise<Response>((resolve) => {
      soltarLaVieja = () => resolve(json({ ...DATA, lotes: [{ ...YERBA, nombre: 'Vieja' }] }))
    })
    fetchMock.mockImplementation((entrada: RequestInfo | URL) => {
      const url = String(entrada)
      if (url.startsWith(`${RUTA}?dias=15`)) return vieja
      if (url.startsWith(`${RUTA}?`)) return Promise.resolve(json({ ...DATA, lotes: [{ ...YERBA, nombre: 'Nueva' }] }))
      return Promise.resolve(json([]))
    })
    montar('/vencimientos', <Vencimientos />)
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(1))
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '60' } })
    expect(await screen.findByText('Nueva')).toBeTruthy()
    soltarLaVieja()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Vieja')).toBeNull()
    expect(screen.getByText('Nueva')).toBeTruthy()
  })
})

describe('Vencimientos: orden y CSV', () => {
  it('por defecto es el del motor; ordenar es de la pantalla (no pide de nuevo) y se vuelve con «Orden por vencimiento»', async () => {
    const user = userEvent.setup()
    await abrir()
    for (const th of screen.getAllByRole('columnheader').slice(0, 7)) expect(th.getAttribute('aria-sort')).toBe('none')
    expect(screen.queryByRole('button', { name: 'Orden por vencimiento' })).toBeNull()
    const pedidos = pedidasAlReporte().length

    await user.click(screen.getByRole('button', { name: 'Producto' }))
    expect(nombresEnTabla()).toEqual(['Crema', 'Harina', 'Leche', 'Queso', 'Yerba'])
    expect(screen.getByRole('columnheader', { name: /Producto ▲/ }).getAttribute('aria-sort')).toBe('ascending')
    await user.click(screen.getByRole('button', { name: /Producto/ }))
    expect(nombresEnTabla()).toEqual(['Yerba', 'Queso', 'Leche', 'Harina', 'Crema'])
    // Las cifras arrancan de mayor a menor.
    await user.click(screen.getByRole('button', { name: 'Saldo' }))
    expect(nombresEnTabla()).toEqual(['Leche', 'Queso', 'Yerba', 'Crema', 'Harina'])
    expect(pedidasAlReporte()).toHaveLength(pedidos)

    await user.click(screen.getByRole('button', { name: 'Orden por vencimiento' }))
    expect(nombresEnTabla()).toEqual(['Yerba', 'Crema', 'Harina', 'Leche', 'Queso'])
    expect(screen.queryByRole('button', { name: 'Orden por vencimiento' })).toBeNull()
  })

  it('cada columna ordena por su valor, y lo que no tiene valor (código, lote) va al final', async () => {
    const user = userEvent.setup()
    await abrir()
    const casos: [string, string[]][] = [
      ['Código', ['Crema', 'Harina', 'Queso', 'Yerba', 'Leche']],
      ['Sucursal / depósito', ['Yerba', 'Harina', 'Queso', 'Leche', 'Crema']],
      ['Lote', ['Crema', 'Harina', 'Yerba', 'Queso', 'Leche']],
      ['Vence', ['Yerba', 'Crema', 'Harina', 'Leche', 'Queso']],
      ['Días para vencer', ['Yerba', 'Crema', 'Harina', 'Leche', 'Queso']],
    ]
    for (const [columna, esperado] of casos) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${columna}`) }))
      expect(nombresEnTabla(), columna).toEqual(esperado)
    }
    // Sin valor va al final también en el otro sentido.
    await user.click(screen.getByRole('button', { name: /^Lote/ }))
    expect(nombresEnTabla().at(-1)).toBe('Leche')
  })

  it('el CSV apunta al export del motor con la misma consulta que la lista, y reordenar la tabla no lo cambia', async () => {
    const user = userEvent.setup()
    await abrir()
    expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(`${RUTA}/export?${consulta()}`)

    await elegirEnBuscable(user, await screen.findByLabelText('Sucursal'), 'Norte')
    await elegirEnBuscable(user, screen.getByLabelText('Categoría'), 'Almacén')
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '60' } })
    await user.click(screen.getByLabelText('Incluir vencidos'))
    await waitFor(() => expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(
      `${RUTA}/export?dias=60&incluir_vencidos=false&sucursal_id=2&categoria=Almac%C3%A9n`))
    // El JSON pidió exactamente lo mismo: una sola forma de armar la consulta.
    expect(ultimaConsulta()).toBe(`GET ${RUTA}?dias=60&incluir_vencidos=false&sucursal_id=2&categoria=Almac%C3%A9n`)

    const antes = screen.getByRole('link', { name: /CSV/ }).getAttribute('href')
    await user.click(screen.getByRole('button', { name: 'Producto' }))
    expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(antes)
  })
})

describe('Vencimientos: dar de baja (merma)', () => {
  it('el diálogo repite el aviso del saldo, propone todo el lote y manda el cuerpo exacto con una clave_operacion', async () => {
    const user = userEvent.setup()
    await abrir()
    await abrirMerma(user)
    // El aviso de la página y el del diálogo.
    expect(screen.getAllByRole('note')).toHaveLength(2)
    expect(texto(within(dialogo()).getByRole('note'))).toContain('el saldo de cada lote puede ser MAYOR al real')
    expect(texto(dialogo())).toContain('Yerba')
    expect(texto(dialogo())).toContain('lote L1')
    expect(texto(dialogo())).toContain('vence 25-09-2026')
    expect((within(dialogo()).getByLabelText('Cantidad a dar de baja') as HTMLInputElement).value).toBe('4')
    expect((within(dialogo()).getByLabelText('Motivo') as HTMLInputElement).value).toBe('vencimiento')

    fireEvent.change(within(dialogo()).getByLabelText('Cantidad a dar de baja'), { target: { value: '2.5' } })
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: ' se rompió la cadena de frío ' } })
    fireEvent.change(within(dialogo()).getByLabelText('Motivo'), { target: { value: ' rotura ' } })
    await user.click(confirmar())

    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(1))
    const [cuerpo] = enviosA(MERMA)
    expect(cuerpo).toEqual({
      producto_id: 1, deposito_id: 1, variante_id: null, lote: 'L1', vence: '2026-09-25', cantidad: 2.5, motivo: 'rotura',
      nota: 'se rompió la cadena de frío', clave_operacion: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })

  it('con una variante y un lote sin código manda los del bucket tal cual', async () => {
    const user = userEvent.setup()
    await abrir()
    await abrirMerma(user, 'Harina')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(1))
    expect(enviosA(MERMA)[0]).toMatchObject({ producto_id: 3, variante_id: 7, lote: 'H7', vence: '2026-09-30', cantidad: 1.5 })

    cleanup()
    prepararFetch()
    await abrir()
    await abrirMerma(user, 'Leche')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(1))
    expect(enviosA(MERMA)[0]).toMatchObject({ producto_id: 4, deposito_id: 3, lote: null, vence: '2026-10-01', cantidad: 1234.5 })
  })

  it('un éxito cierra el diálogo, lo cuenta y vuelve a pedir la consulta actual', async () => {
    const user = userEvent.setup()
    await abrir()
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '20' } })
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(2))
    await abrirMerma(user)
    await user.click(confirmar())

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(texto(await screen.findByText(/Se dieron de baja 4 u de Yerba, lote L1/))).toContain('Saldo del lote: 0 u')
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(3))
    // La misma consulta, no la de los defaults.
    expect(ultimaConsulta()).toBe(pide('', 'dias=20&incluir_vencidos=true'))
    expect(await screen.findByText('5 lotes')).toBeTruthy()
  })

  it('🔑 tras un error de red la clave se REUSA: volver a apretar «Confirmar» manda exactamente lo mismo', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida', () => json({ ...MERMA_OK, repetida: true })])
    await abrirMerma(user)
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toContain('Error de conexión.')
    expect(dialogo()).toBeTruthy()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const envios = enviosA(MERMA)
    expect(envios).toHaveLength(2)
    expect(envios[1]).toEqual(envios[0])
    expect(new Set(clavesDe(MERMA)).size).toBe(1)
  })

  it('🔑 tras un 409 sin cambiar nada se reintenta con la misma clave; al cambiar la cantidad o la nota, con otra', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => json({ detail: 'el lote L1 tiene 1 y se quieren dar de baja 4' }, 409)])
    await abrirMerma(user)
    await user.click(confirmar())
    await within(dialogo()).findByText('el lote L1 tiene 1 y se quieren dar de baja 4')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(2))
    const [k1, k2] = clavesDe(MERMA)
    expect(k2).toBe(k1)

    fireEvent.change(within(dialogo()).getByLabelText('Cantidad a dar de baja'), { target: { value: '1' } })
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(3))
    const k3 = clavesDe(MERMA)[2]
    expect(k3).not.toBe(k1)

    // Reintentar con estos datos: la clave nueva se conserva.
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(4))
    expect(clavesDe(MERMA)[3]).toBe(k3)

    // La nota también es un dato: la operación cambió.
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'otra' } })
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(5))
    expect(clavesDe(MERMA)[4]).not.toBe(k3)
  })

  it('🔑 cerrar y abrir el diálogo de nuevo es otro intento: otra clave', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => json({ detail: 'saldo insuficiente' }, 409)])
    await abrirMerma(user)
    await user.click(confirmar())
    await within(dialogo()).findByText('saldo insuficiente')
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await abrirMerma(user)
    expect(within(dialogo()).queryByText('saldo insuficiente')).toBeNull()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(2))
    expect(clavesDe(MERMA)[1]).not.toBe(clavesDe(MERMA)[0])
  })

  it('🔑 dos lotes distintos no comparten clave', async () => {
    const user = userEvent.setup()
    await abrir()
    await abrirMerma(user, 'Yerba')
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await abrirMerma(user, 'Crema')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(2))
    expect(clavesDe(MERMA)[1]).not.toBe(clavesDe(MERMA)[0])
  })

  it('repetida: true se muestra como éxito («ya estaba registrado»), no como error', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => json({ ...MERMA_OK, repetida: true })])
    await abrirMerma(user)
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const aviso = await screen.findByText(/Ya estaba registrado/)
    expect(aviso.getAttribute('role')).toBe('status')
    expect(aviso.textContent).toContain('no se volvió a descontar')
    expect(screen.queryByRole('alert')).toBeNull()
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(2))
  })

  it.each([
    [409, 'la clave_operacion ya se usó en este producto con otros parámetros', 'la clave_operacion ya se usó en este producto con otros parámetros'],
    [422, 'hace falta el lote o el vencimiento', 'hace falta el lote o el vencimiento'],
    [404, 'el producto 1 no existe', 'el producto 1 no existe'],
    [503, DETALLE_SIN_REVISION, 'La base no tiene aplicada la revisión de vencimientos; pedí al administrador que ejecute libracommerce-migrar upgrade.'],
    [403, 'Sin permiso', 'Sin permiso'],
  ])('un %i deja el diálogo abierto con el mensaje del motor y no refresca', async (status, detail, esperado) => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => json({ detail }, status)])
    await abrirMerma(user)
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe(esperado)
    expect(pedidasAlReporte()).toHaveLength(1)
    expect(screen.queryByText(/Se dieron de baja/)).toBeNull()
    // Y se puede volver a intentar: el botón no quedó trabado.
    expect((confirmar() as HTMLButtonElement).disabled).toBe(false)
  })

  it('un 422 de validación del cuerpo (una lista) muestra los mensajes, no «[object Object]»', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => new Response(JSON.stringify({ detail: [{ loc: ['body', 'cantidad'], msg: 'Input should be greater than 0' }] }), {
      status: 422, statusText: 'Unprocessable Entity', headers: { 'content-type': 'application/json' } })])
    await abrirMerma(user)
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('Input should be greater than 0')
  })

  it('una cantidad en 0, vacía o mayor al saldo no se manda y dice por qué', async () => {
    const user = userEvent.setup()
    await abrir()
    await abrirMerma(user)
    const campo = within(dialogo()).getByLabelText('Cantidad a dar de baja')
    for (const [valor, mensaje] of [
      ['0', 'Tiene que ser un número mayor a 0.'], ['', 'Tiene que ser un número mayor a 0.'], ['-1', 'Tiene que ser un número mayor a 0.'],
      ['4.5', 'No puede pasar del saldo (4).'],
    ]) {
      fireEvent.change(campo, { target: { value: valor } })
      await user.click(confirmar())
      expect((await within(dialogo()).findByRole('alert')).textContent, valor).toBe(mensaje)
      expect(campo.getAttribute('aria-invalid')).toBe('true')
    }
    expect(enviosA(MERMA)).toHaveLength(0)
    // El tope es válido.
    fireEvent.change(campo, { target: { value: '4' } })
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(1))
  })

  it('doble clic en «Confirmar»: un solo envío, y el botón queda deshabilitado mientras está en vuelo', async () => {
    const user = userEvent.setup()
    await abrir()
    let soltar!: () => void
    secuencia(MERMA, [() => new Promise<Response>((resolve) => { soltar = () => resolve(json(MERMA_OK)) })])
    await abrirMerma(user)
    await user.dblClick(confirmar())
    await user.click(confirmar())
    expect(enviosA(MERMA)).toHaveLength(1)
    const boton = confirmar() as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    expect(boton.textContent).toContain('Guardando…')
    expect((within(dialogo()).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true)

    soltar()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(MERMA)).toHaveLength(1)
  })

  it('dos clics dentro del mismo tick (antes de que React deshabilite el botón) también mandan una sola vez', async () => {
    const user = userEvent.setup()
    await abrir()
    let soltar!: () => void
    secuencia(MERMA, [() => new Promise<Response>((resolve) => { soltar = () => resolve(json(MERMA_OK)) })])
    await abrirMerma(user)
    const boton = confirmar()
    act(() => { boton.click(); boton.click() })
    expect(enviosA(MERMA)).toHaveLength(1)
    soltar()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(MERMA)).toHaveLength(1)
  })

  it('puedeMover=false oculta «Dar de baja» y la columna de acciones', async () => {
    await abrir(TODO, { puedeMover: false })
    expect(screen.queryByRole('button', { name: /Dar de baja/ })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(nombresEnTabla()).toHaveLength(5)
  })
})

describe('Vencimientos: asignar vencimiento', () => {
  it('sólo el saldo positivo se puede asignar: «salidas sin lote» no tiene botón', async () => {
    await abrir()
    expect(within(filaSinLote('Fideos')).queryByRole('button')).toBeNull()
    expect(within(filaSinLote('Arroz', 0)).getByRole('button', { name: /Asignar vencimiento/ })).toBeTruthy()
    expect(within(filaSinLote('Arroz', 1)).getByRole('button', { name: /Asignar vencimiento/ })).toBeTruthy()
  })

  it('el diálogo repite el aviso, tiene el <input type="date"> nativo y manda el cuerpo exacto con la fecha en ISO y una clave', async () => {
    const user = userEvent.setup()
    await abrir()
    await abrirAsignar(user)
    expect(screen.getAllByRole('note')).toHaveLength(2)
    expect(texto(within(dialogo()).getByRole('note'))).toContain('el saldo de cada lote puede ser MAYOR al real')
    const fechaInput = within(dialogo()).getByLabelText('Fecha de vencimiento') as HTMLInputElement
    expect(fechaInput.type).toBe('date')
    expect((within(dialogo()).getByLabelText('Cantidad') as HTMLInputElement).value).toBe('20')

    completarAsignacion('  A-2026 ', '2027-03-15')
    fireEvent.change(within(dialogo()).getByLabelText('Cantidad'), { target: { value: '12.5' } })
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'conteo del lunes' } })
    await user.click(confirmar())

    await waitFor(() => expect(enviosA(ASIGNAR)).toHaveLength(1))
    expect(enviosA(ASIGNAR)[0]).toEqual({
      producto_id: 6, deposito_id: 1, variante_id: null, lote: 'A-2026', vence: '2027-03-15', cantidad: 12.5, nota: 'conteo del lunes',
      clave_operacion: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(texto(await screen.findByText(/Se asignó el lote A-2026/))).toContain('vence 15-03-2027')
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(2))
  })

  it('la variante y el depósito de la fila viajan en el cuerpo', async () => {
    const user = userEvent.setup()
    await abrir()
    await abrirAsignar(user, 'Arroz', 1)
    completarAsignacion()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ASIGNAR)).toHaveLength(1))
    expect(enviosA(ASIGNAR)[0]).toMatchObject({ producto_id: 6, deposito_id: 2, variante_id: 2, cantidad: 5 })
  })

  it('sin lote, sin fecha o con una cantidad fuera de rango no se manda y dice qué falta', async () => {
    const user = userEvent.setup()
    await abrir()
    await abrirAsignar(user)
    await user.click(confirmar())
    const alertas = within(dialogo()).getAllByRole('alert').map((a) => a.textContent)
    expect(alertas).toEqual(['Escribí el código del lote.', 'Elegí la fecha de vencimiento.'])
    expect(enviosA(ASIGNAR)).toHaveLength(0)

    completarAsignacion()
    fireEvent.change(within(dialogo()).getByLabelText('Cantidad'), { target: { value: '21' } })
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('No puede pasar del saldo (20).')
    fireEvent.change(within(dialogo()).getByLabelText('Cantidad'), { target: { value: '0' } })
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('Tiene que ser un número mayor a 0.')
    expect(enviosA(ASIGNAR)).toHaveLength(0)
  })

  it('🔑 la clave se REUSA al reintentar tras un error de red, y CAMBIA al modificar el lote, la fecha, la cantidad o al abrir de nuevo', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(ASIGNAR, [() => 'caida', () => json({ detail: 'el saldo sin lote es 1 y se quieren asignar 20' }, 409)])
    await abrirAsignar(user)
    completarAsignacion()
    await user.click(confirmar())
    await within(dialogo()).findByText(/Error de conexión/)
    await user.click(confirmar())
    await within(dialogo()).findByText('el saldo sin lote es 1 y se quieren asignar 20')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ASIGNAR)).toHaveLength(3))
    const claves = clavesDe(ASIGNAR)
    expect(new Set(claves).size).toBe(1)
    expect(enviosA(ASIGNAR)[1]).toEqual(enviosA(ASIGNAR)[0])

    let n = 3
    for (const cambiar of [
      () => fireEvent.change(within(dialogo()).getByLabelText('Lote'), { target: { value: 'A-2027' } }),
      () => fireEvent.change(within(dialogo()).getByLabelText('Fecha de vencimiento'), { target: { value: '2027-04-01' } }),
      () => fireEvent.change(within(dialogo()).getByLabelText('Cantidad'), { target: { value: '10' } }),
    ]) {
      cambiar()
      await user.click(confirmar())
      n += 1
      await waitFor(() => expect(enviosA(ASIGNAR)).toHaveLength(n))
      expect(new Set(clavesDe(ASIGNAR)).size).toBe(n - 2)
    }

    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    await abrirAsignar(user)
    completarAsignacion()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ASIGNAR)).toHaveLength(n + 1))
    expect(clavesDe(ASIGNAR).slice(0, n).includes(clavesDe(ASIGNAR)[n] as string)).toBe(false)
  })

  it('repetida: true es un éxito; 409, 422 y 503 muestran su mensaje y dejan el diálogo abierto', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(ASIGNAR, [() => json({ ...ASIGNAR_OK, repetida: true })])
    await abrirAsignar(user)
    completarAsignacion()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await screen.findByText(/Ya estaba registrado/)).getAttribute('role')).toBe('status')

    for (const [status, detail, esperado] of [
      [409, 'el producto 6 no está marcado como perecedero: marcalo antes de asignar un vencimiento', 'el producto 6 no está marcado como perecedero: marcalo antes de asignar un vencimiento'],
      [422, 'fecha ilegible', 'fecha ilegible'],
      [503, DETALLE_SIN_REVISION, 'La base no tiene aplicada la revisión de vencimientos; pedí al administrador que ejecute libracommerce-migrar upgrade.'],
    ] as const) {
      secuencia(ASIGNAR, [() => json({ detail }, status)])
      await abrirAsignar(user)
      completarAsignacion()
      await user.click(confirmar())
      expect((await within(dialogo()).findByRole('alert')).textContent).toBe(esperado)
      await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    }
  })

  it('doble clic en «Confirmar»: un solo envío', async () => {
    const user = userEvent.setup()
    await abrir()
    let soltar!: () => void
    secuencia(ASIGNAR, [() => new Promise<Response>((resolve) => { soltar = () => resolve(json(ASIGNAR_OK)) })])
    await abrirAsignar(user)
    completarAsignacion()
    await user.dblClick(confirmar())
    expect(enviosA(ASIGNAR)).toHaveLength(1)
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true)
    soltar()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(ASIGNAR)).toHaveLength(1)
  })

  it('puedeMover=false oculta «Asignar vencimiento» y la columna de acciones', async () => {
    await abrir(TODO, { puedeMover: false })
    expect(screen.queryByRole('button', { name: /Asignar vencimiento/ })).toBeNull()
    expect(within(screen.getAllByRole('table')[1]).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(screen.getAllByText('Arroz')).toHaveLength(2)
  })
})

const ALMACEN = 'libra-ui:vencimientos:pendientes'
type Guardado = Record<string, { tipo: string; cuerpo: Record<string, unknown>; creado: number }>
const guardado = () => JSON.parse(sessionStorage.getItem(ALMACEN) ?? '{}') as Guardado
const panel = () => within(dialogo()).queryByText(/Hay un intento anterior sin confirmar para esta misma operación/)
const cancelar = (user: ReturnType<typeof userEvent.setup>) => user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
const enBotones = (nombre: string | RegExp) => within(dialogo()).getByRole('button', { name: nombre })
/** La firma del destino de una merma sobre la fila de Yerba (tipo, producto, depósito, variante, lote, fecha). */
const FIRMA_YERBA = JSON.stringify(['merma', 1, 1, null, 'L1', '2026-09-25'])

describe('Vencimientos: un intento incierto bloquea el destino hasta reenviarlo o descartarlo', () => {
  it.each([
    ['sin respuesta (red)', () => 'caida' as const],
    ['un 500', () => json({ detail: 'Internal Server Error' }, 500)],
    ['un 502', () => json({ detail: 'Bad Gateway' }, 502)],
    ['un 503 genérico (un proxy)', () => json({ detail: 'Service Unavailable' }, 503)],
    ['un 503 que no es el de la migración', () => json({ detail: 'Falta la revisión de algo, no sé de qué' }, 503)],
    ['un 408', () => json({ detail: 'Request Timeout' }, 408)],
  ])('🔑 merma: %s → queda guardado, bloquea, sobrevive a cerrar, y reenviarlo (repetida:true) cierra como éxito y limpia', async (_caso, fallo) => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [fallo, () => json({ ...MERMA_OK, repetida: true }), () => json(MERMA_OK)])
    await abrirMerma(user)
    await user.click(confirmar())
    expect((await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)).getAttribute('role')).toBe('alert')

    // Guardado con el cuerpo completo y la clave, bajo la firma del destino, con la hora.
    const entradas = Object.entries(guardado())
    expect(entradas).toHaveLength(1)
    expect(entradas[0][0]).toBe(FIRMA_YERBA)
    expect(entradas[0][1].cuerpo).toEqual(enviosA(MERMA)[0])
    // Bloqueado: el aviso con la hora, los campos apagados y sólo reenviar o descartar.
    expect(texto(panel())).toMatch(/intento del \d{2}:\d{2}/)
    for (const campo of ['Cantidad a dar de baja', 'Motivo', 'Nota']) expect((within(dialogo()).getByLabelText(campo) as HTMLInputElement).disabled).toBe(true)
    expect(enBotones('Reenviar el intento anterior')).toBeTruthy()
    expect(enBotones('Descartar el intento anterior…')).toBeTruthy()
    expect(within(dialogo()).queryByRole('button', { name: 'Confirmar' })).toBeNull()
    // La fila lo marca.
    await cancelar(user)
    expect(within(fila('Yerba')).getByText('Intento sin confirmar')).toBeTruthy()

    await abrirMerma(user)
    expect(panel()).toBeTruthy()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(MERMA)).toHaveLength(2)
    expect(enviosA(MERMA)[1]).toEqual(enviosA(MERMA)[0])
    expect((await screen.findByText(/Ya estaba registrado/)).getAttribute('role')).toBe('status')
    expect(guardado()).toEqual({})
    expect(within(fila('Yerba')).queryByText('Intento sin confirmar')).toBeNull()

    // Con el resultado definitivo se puede operar de nuevo, con clave nueva.
    await abrirMerma(user)
    expect(panel()).toBeNull()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(3))
    expect(clavesDe(MERMA)[2]).not.toBe(clavesDe(MERMA)[0])
  })

  it('🔑 el 503 de la migración SÍ es definitivo: no queda nada guardado y se puede reintentar (la clave no se gastó)', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => json({ detail: DETALLE_SIN_REVISION }, 503)])
    await abrirMerma(user)
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe(
      'La base no tiene aplicada la revisión de vencimientos; pedí al administrador que ejecute libracommerce-migrar upgrade.')
    expect(guardado()).toEqual({})
    expect(panel()).toBeNull()
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(false)
    expect(within(dialogo()).queryByText(/No se sabe si se llegó a registrar/)).toBeNull()
  })

  it('🔑 tras un timeout, corregir la nota no crea otra operación: los campos están bloqueados y confirmar reenvía el cuerpo ORIGINAL con la misma clave', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida', () => json(MERMA_OK)])
    await abrirMerma(user)
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'nota original' } })
    fireEvent.change(within(dialogo()).getByLabelText('Cantidad a dar de baja'), { target: { value: '3' } })
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)

    const nota = within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement
    expect(nota.disabled).toBe(true)
    await user.type(nota, ' corregida')
    expect(nota.value).toBe('nota original')
    expect((within(dialogo()).getByLabelText('Cantidad a dar de baja') as HTMLInputElement).value).toBe('3')

    await user.click(enBotones('Reenviar el intento anterior'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(MERMA)).toHaveLength(2)
    expect(enviosA(MERMA)[1]).toEqual(enviosA(MERMA)[0])
    expect(enviosA(MERMA)[1]).toMatchObject({ nota: 'nota original', cantidad: 3 })
    expect(clavesDe(MERMA)[1]).toBe(clavesDe(MERMA)[0])
  })

  it('🔑 tras un timeout, cualquier respuesta definitiva al reenvío (409) limpia lo guardado y desbloquea', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida', () => json({ detail: 'el lote L1 tiene 1 y se quieren dar de baja 4' }, 409)])
    await abrirMerma(user)
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    await user.click(confirmar())
    await within(dialogo()).findByText('el lote L1 tiene 1 y se quieren dar de baja 4')
    expect(guardado()).toEqual({})
    expect(panel()).toBeNull()
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(false)
    expect(clavesDe(MERMA)[1]).toBe(clavesDe(MERMA)[0])
  })

  it('🔑 descartar exige confirmación con la advertencia; sólo entonces se habilita otra operación, con clave NUEVA (aun con los mismos datos)', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida', () => json(MERMA_OK)])
    await abrirMerma(user)
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)

    await user.click(enBotones('Descartar el intento anterior…'))
    expect(texto(within(dialogo()).getByText(/Sólo descartalo si verificaste/))).toBe(
      'Sólo descartalo si verificaste en el stock que NO se registró; si se registró y lo descartás, podrías duplicar el movimiento.')
    // Todavía no se descartó nada.
    expect(Object.keys(guardado())).toHaveLength(1)
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(true)
    await user.click(enBotones('No, volver'))
    expect(Object.keys(guardado())).toHaveLength(1)
    expect(enBotones('Descartar el intento anterior…')).toBeTruthy()

    await user.click(enBotones('Descartar el intento anterior…'))
    await user.click(enBotones('Sí, descartar el intento anterior'))
    expect(guardado()).toEqual({})
    expect(panel()).toBeNull()
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(false)
    expect(within(fila('Yerba')).queryByText('Intento sin confirmar')).toBeNull()

    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(2))
    expect(clavesDe(MERMA)[1]).not.toBe(clavesDe(MERMA)[0])
  })

  it('🔑 asignar: bloquea el saldo sin lote (lote, fecha, cantidad y nota), reenvía el original y no bloquea a otro depósito o variante', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(ASIGNAR, [() => 'caida', () => json({ ...ASIGNAR_OK, repetida: true }), () => json(ASIGNAR_OK)])
    await abrirAsignar(user)
    completarAsignacion()
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'conteo' } })
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    expect(Object.values(guardado())[0]).toMatchObject({ tipo: 'asignar', cuerpo: enviosA(ASIGNAR)[0] })
    expect((within(dialogo()).getByLabelText('Cantidad') as HTMLInputElement).disabled).toBe(true)
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(true)

    // Lote y fecha también quedan bloqueados: el recurso es el saldo sin lote, no el lote.
    expect((within(dialogo()).getByLabelText('Lote') as HTMLInputElement).disabled).toBe(true)
    expect((within(dialogo()).getByLabelText('Fecha de vencimiento') as HTMLInputElement).disabled).toBe(true)
    expect(panel()).toBeTruthy()

    await cancelar(user)
    expect(within(filaSinLote('Arroz', 0)).getByText('Intento sin confirmar')).toBeTruthy()
    // La otra fila de Arroz es otro depósito y otra variante: sin marca y sin bloqueo, aunque se escriba el mismo lote y fecha.
    expect(within(filaSinLote('Arroz', 1)).queryByText('Intento sin confirmar')).toBeNull()
    await abrirAsignar(user, 'Arroz', 1)
    completarAsignacion()
    expect(panel()).toBeNull()
    await cancelar(user)

    // Reabrir la fila del intento: viene con su lote y su fecha, bloqueada, y reenviar manda lo original.
    await abrirAsignar(user)
    expect((within(dialogo()).getByLabelText('Lote') as HTMLInputElement).value).toBe('A-2026')
    expect(panel()).toBeTruthy()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(ASIGNAR)).toHaveLength(2)
    expect(enviosA(ASIGNAR)[1]).toEqual(enviosA(ASIGNAR)[0])
    expect(enviosA(ASIGNAR)[1]).toMatchObject({ nota: 'conteo', cantidad: 20 })
    expect(guardado()).toEqual({})
  })

  it('🔑 asignar: tras un timeout, cambiar el lote o la fecha (aunque se fuerce) NO crea otra operación: sigue bloqueado y reenvía el original con la misma clave', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(ASIGNAR, [() => 'caida', () => json({ ...ASIGNAR_OK, repetida: true })])
    await abrirAsignar(user)
    completarAsignacion('A-2026', '2027-03-15')
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)

    const lote = within(dialogo()).getByLabelText('Lote') as HTMLInputElement
    const vence = within(dialogo()).getByLabelText('Fecha de vencimiento') as HTMLInputElement
    await user.type(lote, 'OTRO')
    fireEvent.change(lote, { target: { value: 'A-OTRO' } })
    fireEvent.change(vence, { target: { value: '2028-01-01' } })
    expect(lote.value).toBe('A-2026')
    expect(vence.value).toBe('2027-03-15')
    expect(panel()).toBeTruthy()

    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(ASIGNAR)).toHaveLength(2)
    expect(enviosA(ASIGNAR)[1]).toEqual(enviosA(ASIGNAR)[0])
    expect(enviosA(ASIGNAR)[1]).toMatchObject({ lote: 'A-2026', vence: '2027-03-15' })
    expect(clavesDe(ASIGNAR)[1]).toBe(clavesDe(ASIGNAR)[0])
  })

  it('asignar: tras descartar (con confirmación) sí se puede elegir otro lote y fecha, con clave nueva', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(ASIGNAR, [() => 'caida', () => json(ASIGNAR_OK)])
    await abrirAsignar(user)
    completarAsignacion('A-2026', '2027-03-15')
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    await user.click(enBotones('Descartar el intento anterior…'))
    await user.click(enBotones('Sí, descartar el intento anterior'))
    expect((within(dialogo()).getByLabelText('Lote') as HTMLInputElement).disabled).toBe(false)
    completarAsignacion('A-NUEVO', '2027-05-01')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ASIGNAR)).toHaveLength(2))
    expect(enviosA(ASIGNAR)[1]).toMatchObject({ lote: 'A-NUEVO', vence: '2027-05-01' })
    expect(clavesDe(ASIGNAR)[1]).not.toBe(clavesDe(ASIGNAR)[0])
  })

  it('una operación sobre OTRO lote u otro depósito no se bloquea, y usa otra clave', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida', () => json(MERMA_OK)])
    await abrirMerma(user, 'Yerba')
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    await cancelar(user)

    await abrirMerma(user, 'Crema')
    expect(panel()).toBeNull()
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(false)
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(2))
    expect(clavesDe(MERMA)[1]).not.toBe(clavesDe(MERMA)[0])
    // Y el de Yerba sigue pendiente.
    expect(Object.keys(guardado())).toEqual([FIRMA_YERBA])
  })
})

describe('Vencimientos: los intentos inciertos sobreviven a la pantalla y a recargar', () => {
  it('desmontar la pantalla y volver a montarla recupera el intento (marca en la fila, aviso y reenvío con la misma clave)', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida'])
    await abrirMerma(user)
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    const original = enviosA(MERMA)[0]

    cleanup()
    prepararFetch()
    await abrir()
    expect(within(fila('Yerba')).getByText('Intento sin confirmar')).toBeTruthy()
    await abrirMerma(user)
    expect(panel()).toBeTruthy()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(MERMA)).toEqual([original])
  })

  it('una recarga de la pestaña (sessionStorage con un intento de antes) también: muestra la hora del intento y reenvía lo guardado', async () => {
    const user = userEvent.setup()
    const cuerpo = { producto_id: 1, deposito_id: 1, variante_id: null, lote: 'L1', vence: '2026-09-25', cantidad: 3, motivo: 'vencimiento', nota: 'de antes', clave_operacion: 'clave-de-la-sesion-anterior' }
    // 15:30 UTC = 12:30 en Argentina (UTC-3 fijo).
    sessionStorage.setItem(ALMACEN, JSON.stringify({ [FIRMA_YERBA]: { firma: FIRMA_YERBA, tipo: 'merma', cuerpo, creado: Date.UTC(2026, 8, 30, 15, 30) } }))
    await abrir()
    await abrirMerma(user)
    expect(texto(panel())).toContain('intento del 12:30')
    expect(texto(panel())).toContain('dar de baja 3 u')
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).value).toBe('de antes')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(1))
    expect(enviosA(MERMA)[0]).toEqual(cuerpo)
  })

  it('un intento se guarda ANTES de enviar: si la pestaña se recarga a mitad de un envío, queda', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => new Promise<Response>(() => {})])
    await abrirMerma(user)
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(1))
    expect(Object.values(guardado())[0].cuerpo).toEqual(enviosA(MERMA)[0])
  })

  it('un almacenamiento ilegible o con basura no rompe la pantalla ni inventa intentos', async () => {
    sessionStorage.setItem(ALMACEN, '{esto no es json')
    await abrir()
    expect(screen.queryByText('Intento sin confirmar')).toBeNull()

    cleanup()
    prepararFetch()
    sessionStorage.setItem(ALMACEN, JSON.stringify({ [FIRMA_YERBA]: { firma: FIRMA_YERBA, tipo: 'merma' }, otro: 7, ok: null }))
    await abrir()
    expect(screen.queryByText('Intento sin confirmar')).toBeNull()

    cleanup()
    prepararFetch()
    sessionStorage.setItem(ALMACEN, '"un texto"')
    await abrir()
    expect(screen.queryByText('Intento sin confirmar')).toBeNull()
  })

  const SIN_ALMACEN = 'No se pudo guardar el intento en este navegador (¿modo privado o almacenamiento lleno?). No se envía para no arriesgar un movimiento duplicado si se pierde la respuesta. Liberá espacio o usá otra ventana e intentá de nuevo.'

  it('🔑 falla cerrado: si setItem falla (cuota) NO se envía, se ve el error, el botón sigue habilitado, y al volver a funcionar el storage el MISMO diálogo envía', async () => {
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida', () => json(MERMA_OK)])
    await abrirMerma(user)
    await user.click(confirmar())
    expect((await within(dialogo()).findByText(SIN_ALMACEN)).getAttribute('role')).toBe('alert')
    // No salió ningún POST, no quedó nada pendiente (no se mandó nada) y se puede reintentar.
    expect(enviosA(MERMA)).toHaveLength(0)
    expect(guardado()).toEqual({})
    expect(panel()).toBeNull()
    expect((confirmar() as HTMLButtonElement).disabled).toBe(false)
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(false)
    await user.click(confirmar())
    await within(dialogo()).findByText(SIN_ALMACEN)
    expect(enviosA(MERMA)).toHaveLength(0)
    expect(within(fila('Yerba')).queryByText('Intento sin confirmar')).toBeNull()

    // El storage vuelve a andar: el mismo diálogo, con los mismos datos, guarda y envía.
    espia.mockRestore()
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    expect(enviosA(MERMA)).toHaveLength(1)
    expect(Object.values(guardado())[0].cuerpo).toEqual(enviosA(MERMA)[0])
    expect(within(dialogo()).queryByText(SIN_ALMACEN)).toBeNull()
  })

  it('falla cerrado también en asignar', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    const user = userEvent.setup()
    await abrir()
    await abrirAsignar(user)
    completarAsignacion()
    await user.click(confirmar())
    await within(dialogo()).findByText(SIN_ALMACEN)
    expect(enviosA(ASIGNAR)).toHaveLength(0)
    expect((confirmar() as HTMLButtonElement).disabled).toBe(false)
  })

  it('🔑 sin sessionStorage (o si lanza al leer y escribir, modo privado) tampoco se envía', async () => {
    const real = globalThis.sessionStorage
    const user = userEvent.setup()
    await abrir()
    await abrirMerma(user)
    vi.stubGlobal('sessionStorage', undefined)
    try {
      await user.click(confirmar())
      await within(dialogo()).findByText(SIN_ALMACEN)
      expect(enviosA(MERMA)).toHaveLength(0)
    } finally {
      vi.stubGlobal('sessionStorage', real)
    }

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError') })
    await user.click(confirmar())
    await within(dialogo()).findByText(SIN_ALMACEN)
    expect(enviosA(MERMA)).toHaveLength(0)
    expect(panel()).toBeNull()
  })

  it('🔑 si setItem falla, un intento incierto que ya estaba guardado NO se borra ni se pisa', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida', () => json(MERMA_OK)])
    await abrirMerma(user, 'Yerba')
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    await cancelar(user)
    const antes = guardado()
    expect(Object.keys(antes)).toEqual([FIRMA_YERBA])

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    // Otra operación (Crema): no se puede guardar, no se envía, y lo de Yerba sigue intacto.
    await abrirMerma(user, 'Crema')
    await user.click(confirmar())
    await within(dialogo()).findByText(SIN_ALMACEN)
    expect(enviosA(MERMA)).toHaveLength(1)
    await cancelar(user)
    expect(guardado()).toEqual(antes)
    expect(within(fila('Yerba')).getByText('Intento sin confirmar')).toBeTruthy()

    // Reenviar el de Yerba sí se puede: ya estaba guardado (es recuperable), aunque el storage no deje escribir.
    await abrirMerma(user, 'Yerba')
    expect(panel()).toBeTruthy()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(MERMA)).toHaveLength(2)
    expect(enviosA(MERMA)[1]).toEqual(enviosA(MERMA)[0])
  })

  it('si lo guardado desapareció del storage (se vació) y no se puede volver a escribir, reenviar tampoco envía, pero el intento sigue pendiente en memoria', async () => {
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => 'caida', () => json(MERMA_OK)])
    await abrirMerma(user)
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    const original = enviosA(MERMA)[0]

    sessionStorage.clear()
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    await user.click(confirmar())
    await within(dialogo()).findByText(SIN_ALMACEN)
    expect(enviosA(MERMA)).toHaveLength(1)
    // Sigue pendiente (bloqueado, con su cuerpo y su clave), no se perdió.
    expect(panel()).toBeTruthy()
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(true)

    espia.mockRestore()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(MERMA)).toEqual([original, original])
  })

  it('🔑 borrar limpia memoria y storage: si el borrado no se puede escribir, lo viejo del storage no resucita el intento', async () => {
    const cuerpo = { producto_id: 1, deposito_id: 1, variante_id: null, lote: 'L1', vence: '2026-09-25', cantidad: 3, motivo: 'vencimiento', nota: '', clave_operacion: 'clave-vieja' }
    sessionStorage.setItem(ALMACEN, JSON.stringify({ [FIRMA_YERBA]: { firma: FIRMA_YERBA, tipo: 'merma', cuerpo, creado: Date.UTC(2026, 8, 30, 15, 30) } }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    const user = userEvent.setup()
    await abrir()
    secuencia(MERMA, [() => json({ detail: 'el lote L1 tiene 1 y se quieren dar de baja 3' }, 409)])
    await abrirMerma(user)
    expect(panel()).toBeTruthy()
    await user.click(confirmar())
    await within(dialogo()).findByText('el lote L1 tiene 1 y se quieren dar de baja 3')
    expect(panel()).toBeNull()
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(false)
    await cancelar(user)
    expect(within(fila('Yerba')).queryByText('Intento sin confirmar')).toBeNull()
    // El storage sigue teniendo lo viejo (no se pudo escribir), pero no cuenta.
    expect(Object.keys(guardado())).toEqual([FIRMA_YERBA])
    await abrirMerma(user)
    expect(panel()).toBeNull()
  })
})

describe('Vencimientos: la clave de operación', () => {
  it('sin crypto.randomUUID (un producto servido por http) se genera igual un UUID v4', async () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array<ArrayBuffer>) => real.getRandomValues(a) })
    try {
      const user = userEvent.setup()
      await abrir()
      await abrirMerma(user)
      await user.click(confirmar())
      await waitFor(() => expect(enviosA(MERMA)).toHaveLength(1))
      expect(enviosA(MERMA)[0].clave_operacion).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      vi.stubGlobal('crypto', real)
    }
  })
})

describe('Vencimientos: productos que vencen', () => {
  const FICHA = (vence: boolean) => ({ producto: { producto_id: 1, codigo: 'P-1', nombre: 'Yerba', unidad: 'u', vence }, hoy: '2026-09-30', lotes: [] })
  const RUTA_FICHA = '/api/vencimientos/productos/1/lotes'
  const RUTA_MARCA = '/api/vencimientos/productos/1'

  it('sólo ofrece productos activos que no son servicios, y consulta si el elegido vence', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [RUTA_FICHA]: FICHA(false) })
    await user.click(screen.getByRole('combobox', { name: 'Producto' }))
    const opciones = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(opciones.map((o) => o.textContent)).toEqual([expect.stringContaining('Yerba'), expect.stringContaining('Crema')])
    await user.click(screen.getByRole('option', { name: /Yerba/ }))

    expect(await screen.findByText(/no está marcado como perecedero/)).toBeTruthy()
    expect(pedidas()).toContain(`GET ${RUTA_FICHA}`)
    expect(screen.getByRole('button', { name: 'Marcar como perecedero' })).toBeTruthy()
    // Se documenta el límite en la propia pantalla.
    expect(texto(screen.getByText(/No hay un listado de los productos marcados/))).toContain('se consulta de a uno')
  })

  it('marcar manda {vence: true} por PUT, actualiza el estado y refresca el reporte', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [RUTA_FICHA]: FICHA(false), [`PUT ${RUTA_MARCA}`]: { producto_id: 1, vence: true } })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    await user.click(await screen.findByRole('button', { name: 'Marcar como perecedero' }))

    await waitFor(() => expect(pedidas()).toContain(`PUT ${RUTA_MARCA}`))
    const put = fetchMock.mock.calls.find((c) => String(c[0]) === RUTA_MARCA)!
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ vence: true })
    expect(await screen.findByText(/quedó marcado como perecedero/)).toBeTruthy()
    expect(screen.getByText(/está marcado como perecedero/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dejar de marcar como perecedero' })).toBeTruthy()
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(2))
  })

  it('desmarcar manda {vence: false}', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [RUTA_FICHA]: FICHA(true), [`PUT ${RUTA_MARCA}`]: { producto_id: 1, vence: false } })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    await user.click(await screen.findByRole('button', { name: 'Dejar de marcar como perecedero' }))
    await waitFor(() => expect(pedidas()).toContain(`PUT ${RUTA_MARCA}`))
    const put = fetchMock.mock.calls.find((c) => String(c[0]) === RUTA_MARCA)!
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ vence: false })
    expect(await screen.findByText(/ya no se marca como perecedero/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Marcar como perecedero' })).toBeTruthy()
  })

  it('un error al marcar (409, 503, red) se muestra y no cambia el estado; doble clic no manda dos veces', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [RUTA_FICHA]: FICHA(false), [`PUT ${RUTA_MARCA}`]: { status: 409, detail: 'un servicio no tiene inventario' } })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    await user.click(await screen.findByRole('button', { name: 'Marcar como perecedero' }))
    expect((await screen.findByText('un servicio no tiene inventario')).getAttribute('role')).toBe('alert')
    expect(screen.getByText(/no está marcado como perecedero/)).toBeTruthy()
    expect(pedidasAlReporte()).toHaveLength(1)

    responder({ ...TODO, [RUTA_FICHA]: FICHA(false), [`PUT ${RUTA_MARCA}`]: { status: 503, detail: DETALLE_SIN_REVISION } })
    await user.click(screen.getByRole('button', { name: 'Marcar como perecedero' }))
    expect(await screen.findByText(/pedí al administrador que ejecute libracommerce-migrar upgrade/)).toBeTruthy()

    let soltar!: () => void
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) =>
      (init?.method === 'PUT' ? new Promise<Response>((r) => { soltar = () => r(json({ producto_id: 1, vence: true })) }) : Promise.resolve(json(String(entrada).startsWith(`${RUTA}?`) ? DATA : []))))
    const puts = () => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT').length
    const antes = puts()
    await user.dblClick(screen.getByRole('button', { name: 'Marcar como perecedero' }))
    expect(puts() - antes).toBe(1)
    expect((screen.getByRole('button', { name: 'Marcar como perecedero' }) as HTMLButtonElement).disabled).toBe(true)
    soltar()
    await screen.findByText(/quedó marcado/)
  })

  it('dos clics dentro del mismo tick en «Marcar» mandan un solo PUT', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [RUTA_FICHA]: FICHA(false) })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    const boton = await screen.findByRole('button', { name: 'Marcar como perecedero' })
    let soltar!: () => void
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) =>
      (init?.method === 'PUT' ? new Promise<Response>((r) => { soltar = () => r(json({ producto_id: 1, vence: true })) }) : base(entrada, init)))
    act(() => { boton.click(); boton.click() })
    expect(fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')).toHaveLength(1)
    soltar()
    await screen.findByText(/quedó marcado/)
  })

  it('mientras un PUT está en vuelo no se puede cambiar de producto: la respuesta tardía de A no puede pisar la ficha de B', async () => {
    const user = userEvent.setup()
    await abrir({
      ...TODO, [RUTA_FICHA]: FICHA(false),
      '/api/vencimientos/productos/2/lotes': { producto: { producto_id: 2, codigo: 'P-2', nombre: 'Crema', unidad: 'u', vence: true }, hoy: '2026-09-30', lotes: [] },
    })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    const boton = await screen.findByRole('button', { name: 'Marcar como perecedero' })
    let soltar!: () => void
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) =>
      (init?.method === 'PUT' ? new Promise<Response>((r) => { soltar = () => r(json({ producto_id: 1, vence: true })) }) : base(entrada, init)))
    await user.click(boton)
    const selector = screen.getByRole('combobox', { name: 'Producto' })
    expect((selector as HTMLButtonElement).disabled).toBe(true)
    await user.click(selector)
    expect(screen.queryByRole('listbox')).toBeNull()

    soltar()
    await screen.findByText(/quedó marcado/)
    expect((screen.getByRole('combobox', { name: 'Producto' }) as HTMLButtonElement).disabled).toBe(false)
    // Ahora sí se puede pasar a B, y B muestra lo suyo (no queda en «Consultando…»).
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Crema/)
    expect(await screen.findByText((_, el) => el?.tagName === 'P' && /^Crema está marcado como perecedero/.test(texto(el as HTMLElement)))).toBeTruthy()
    expect(screen.queryByText('Consultando…')).toBeNull()
  })

  it('puedeMarcar=false deja ver si vence pero sin el botón de marcar', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [RUTA_FICHA]: FICHA(true) }, { puedeMarcar: false })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    expect(await screen.findByText(/está marcado como perecedero/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /perecedero/ })).toBeNull()
    // Y las otras acciones siguen (son otro permiso).
    expect(screen.getAllByRole('button', { name: /Dar de baja/ }).length).toBeGreaterThan(0)
  })

  it('el estado de un producto no se muestra bajo otro: mientras llega la ficha del nuevo, «Consultando…»', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [RUTA_FICHA]: FICHA(true) })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    await screen.findByText(/está marcado como perecedero/)
    fetchMock.mockImplementation(() => new Promise(() => {}))
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Crema/)
    expect(await screen.findByText('Consultando…')).toBeTruthy()
    expect(screen.queryByText(/marcado como perecedero/)).toBeNull()
  })

  it('si la ficha falla (404) lo dice, y si no se puede cargar la lista de productos también', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [RUTA_FICHA]: { status: 404, detail: 'el producto 1 no existe' } })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    expect((await screen.findByText('el producto 1 no existe')).getAttribute('role')).toBe('alert')
    expect(screen.queryByRole('button', { name: /perecedero/ })).toBeNull()

    cleanup()
    await abrir({ ...TODO, '/api/productos': { status: 403, detail: 'Sin permiso de productos' } })
    expect((await screen.findByText('Sin permiso de productos')).getAttribute('role')).toBe('alert')
    expect(screen.queryByRole('combobox', { name: 'Producto' })).toBeNull()
  })

  it('un producto sin código ofrece igual su nombre', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, '/api/productos': [producto(1, 'Yerba', { codigo: null })], [RUTA_FICHA]: FICHA(false) })
    await user.click(screen.getByRole('combobox', { name: 'Producto' }))
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
  })
})

// ── Carga de vencimientos (0.92.0, K-1): el bloque de ayuda, «Cargar stock con lote» y el estado vacío ─────────────────────

const ENTRADA = '/api/vencimientos/entrada'
const DEPOSITOS = [
  { id: 1, nombre: 'Depósito Centro', descripcion: '', es_default: 1, activo: 1, branch_id: 1 },
  { id: 2, nombre: 'Depósito Norte', descripcion: '', es_default: 0, activo: 1, branch_id: 2 },
  { id: 3, nombre: 'Depósito viejo', descripcion: '', es_default: 0, activo: 0 },
]
const FICHA_DE = (vence: boolean, unidad = 'u', id = 1, nombre = 'Yerba') => (
  { producto: { producto_id: id, codigo: `P-${id}`, nombre, unidad, vence }, hoy: '2026-09-30', lotes: [] })
const ENTRADA_OK = {
  producto_id: 1, deposito_id: 1, variante_id: null, lote: 'L-2026', vence: '2027-03-15', cantidad: 12, referencia: 'Entrada con lote',
  saldo_lote: 12, repetida: false,
}
const TODO_ENTRADA = {
  ...TODO, '/api/depositos': DEPOSITOS, '/api/vencimientos/productos/1/lotes': FICHA_DE(true), '/api/productos/1/variantes': [],
  [`POST ${ENTRADA}`]: ENTRADA_OK,
}
/** La firma del destino de una entrada de Yerba al depósito 1, sin variante, lote L-2026 que vence el 15-03-2027. */
const FIRMA_ENTRADA = JSON.stringify(['entrada', 1, 1, null, 'L-2026', '2027-03-15'])

async function abrirEntrada(user: ReturnType<typeof userEvent.setup>, producto: string | RegExp = /Yerba/) {
  await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
  await elegirEnBuscable(user, within(dialogo()).getByRole('combobox', { name: 'Producto' }), producto)
  await within(dialogo()).findByLabelText('Lote')
  // La confirmación espera a la lista de variantes del producto: se sigue cuando ya está habilitada.
  await waitFor(() => expect((confirmar() as HTMLButtonElement).disabled).toBe(false))
  return dialogo()
}
function completarEntrada(lote = 'L-2026', vence = '2027-03-15', cantidad = '12') {
  fireEvent.change(within(dialogo()).getByLabelText('Lote'), { target: { value: lote } })
  fireEvent.change(within(dialogo()).getByLabelText('Fecha de vencimiento'), { target: { value: vence } })
  fireEvent.change(within(dialogo()).getByLabelText('Cantidad'), { target: { value: cantidad } })
}

describe('Vencimientos: el bloque «Cómo cargar vencimientos» y el orden de la pantalla', () => {
  it('explica los tres pasos en llano, arriba del todo (debajo del aviso permanente) y antes de «Productos que vencen» y de las tablas', async () => {
    await abrir()
    const guia = screen.getByRole('heading', { name: 'Cómo cargar vencimientos' }).closest('div')!.parentElement!
    const pasos = within(guia).getAllByRole('listitem').map((li) => texto(li))
    expect(pasos).toHaveLength(3)
    expect(pasos[0]).toContain('Marcá el producto como perecedero')
    expect(pasos[0]).toContain('en el formulario del producto o acá mismo, en «Productos que vencen»')
    expect(pasos[1]).toContain('Al recibir una compra, cargá el lote y el vencimiento de cada línea')
    expect(pasos[2]).toContain('«Cargar stock con lote»')
    expect(pasos[2]).toContain('«Asignar vencimiento»')

    const antes = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const aviso = screen.getAllByRole('note')[0]
    const productosQueVencen = screen.getByRole('heading', { name: 'Productos que vencen' })
    expect(antes(screen.getByRole('heading', { name: /Vencimientos y lotes/ }), aviso)).toBe(true)
    expect(antes(aviso, guia)).toBe(true)
    expect(antes(guia, productosQueVencen)).toBe(true)
    expect(antes(productosQueVencen, screen.getByLabelText('Días de anticipación'))).toBe(true)
    expect(antes(productosQueVencen, tablaDeLotes())).toBe(true)
    // El aviso ámbar sigue siendo uno solo y permanente.
    expect(screen.getAllByRole('note')).toHaveLength(1)
  })

  it('«Productos que vencen» sigue funcionando desde su nueva posición (una sola consulta de productos para la pantalla y el diálogo)', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, '/api/vencimientos/productos/1/lotes': FICHA_DE(false), 'PUT /api/vencimientos/productos/1': { producto_id: 1, vence: true } })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    await user.click(await screen.findByRole('button', { name: 'Marcar como perecedero' }))
    expect(await screen.findByText(/quedó marcado como perecedero/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    expect(pedidas().filter((p) => p === 'GET /api/productos')).toHaveLength(1)
  })

  it('con el reporte vacío el mensaje explica los pasos (sin suponer que no hay productos marcados: no hay listado)', async () => {
    responder({ ...TODO, [RUTA]: { ...DATA, lotes: [], sin_lote: [], resumen: { ...DATA.resumen, lotes_por_vencer: 0, lotes_vencidos: 0, productos: 0 } } })
    montar('/vencimientos', <Vencimientos />)
    expect(await screen.findByText('No hay lotes por vencer con estos parámetros')).toBeTruthy()
    const vacio = texto(screen.getByTestId('vencimientos-vacio'))
    expect(vacio).toContain('Todavía no hay nada para mostrar')
    expect(vacio).toContain('que los filtros de arriba no estén dejando ver')
    expect(vacio).toContain('1) marcá el producto como perecedero, 2) al recibir una compra cargá lote y vencimiento por línea')
    expect(vacio).toContain('«Cargar stock con lote» o «Asignar vencimiento»')
  })

  it('con datos, o con sólo una de las dos listas vacía, no se muestra el mensaje de los pasos', async () => {
    await abrir()
    expect(screen.queryByTestId('vencimientos-vacio')).toBeNull()
    cleanup()
    responder({ ...TODO, [RUTA]: { ...DATA, lotes: [] } })
    montar('/vencimientos', <Vencimientos />)
    expect(await screen.findByText('No hay lotes por vencer con estos parámetros')).toBeTruthy()
    expect(screen.queryByTestId('vencimientos-vacio')).toBeNull()
  })
})

describe('Vencimientos: cargar stock con lote (entrada)', () => {
  it('el botón está a la vista con puedeMover (el default) y no con puedeMover=false; el bloque de ayuda se queda', async () => {
    await abrir(TODO_ENTRADA)
    expect(screen.getByRole('button', { name: 'Cargar stock con lote' })).toBeTruthy()
    cleanup()
    await abrir(TODO_ENTRADA, { puedeMover: false })
    expect(screen.queryByRole('button', { name: 'Cargar stock con lote' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Cómo cargar vencimientos' })).toBeTruthy()
  })

  it('el diálogo repite el aviso del saldo; ofrece los mismos productos que «Productos que vencen»; el depósito predeterminado viene elegido y sólo hay activos', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    expect(screen.getAllByRole('note')).toHaveLength(2)
    expect(texto(within(dialogo()).getByRole('note'))).toContain('el saldo de cada lote puede ser MAYOR al real')
    await user.click(within(dialogo()).getByRole('combobox', { name: 'Producto' }))
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent))
      .toEqual([expect.stringContaining('Yerba'), expect.stringContaining('Crema')])
    await user.click(screen.getByRole('option', { name: /Yerba/ }))

    const deposito = await within(dialogo()).findByLabelText('Depósito')
    expect(deposito).toHaveValue('Centro · Depósito Centro')
    // Con el nombre de su sucursal cuando la tiene; uno inactivo no se ofrece.
    expect(await opcionesDe(user, deposito)).toEqual(['Centro · Depósito Centro', 'Norte · Depósito Norte'])
    expect((within(dialogo()).getByLabelText('Fecha de vencimiento') as HTMLInputElement).type).toBe('date')
    expect(pedidas().filter((p) => p === 'GET /api/depositos')).toHaveLength(1)
  })

  it('manda el cuerpo exacto con una clave_operacion y la fecha ISO; un éxito cierra, lo cuenta con dd-mm-aaaa y refresca la consulta actual', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    fireEvent.change(screen.getByLabelText('Días de anticipación'), { target: { value: '20' } })
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(2))
    await abrirEntrada(user)
    await elegirEnBuscable(user, within(dialogo()).getByLabelText('Depósito'), 'Norte · Depósito Norte')
    completarEntrada('  L-2026 ', '2027-03-15', '12.5')
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: ' pallet 4 ' } })
    await user.click(confirmar())

    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0]).toEqual({
      producto_id: 1, deposito_id: 2, variante_id: null, lote: 'L-2026', vence: '2027-03-15', cantidad: 12.5, nota: 'pallet 4',
      clave_operacion: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const aviso = texto(await screen.findByText(/Se cargaron 12 u de Yerba al lote L-2026/))
    expect(aviso).toContain('vence 15-03-2027')
    expect(aviso).toContain('Saldo del lote: 12 u')
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(3))
    expect(ultimaConsulta()).toBe(pide('', 'dias=20&incluir_vencidos=true'))
    expect(guardado()).toEqual({})
  })

  it('usa la unidad del producto en los mensajes y deja fracciones (step="any"): el motor valida la escala', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, '/api/vencimientos/productos/1/lotes': FICHA_DE(true, 'kg'), [`POST ${ENTRADA}`]: { ...ENTRADA_OK, cantidad: 2.5, saldo_lote: 2.5 } })
    await abrirEntrada(user)
    expect((within(dialogo()).getByLabelText('Cantidad') as HTMLInputElement).step).toBe('any')
    completarEntrada('L-2026', '2027-03-15', '2.5')
    await user.click(confirmar())
    expect(await screen.findByText(/Se cargaron 2,5 kg de Yerba/)).toBeTruthy()
    expect(enviosA(ENTRADA)[0].cantidad).toBe(2.5)
  })

  it('sin producto marcado el diálogo no pide lote: lo dice y ofrece marcarlo ahí mismo (PUT), y recién entonces aparecen los campos', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, '/api/vencimientos/productos/1/lotes': FICHA_DE(false), 'PUT /api/vencimientos/productos/1': { producto_id: 1, vence: true } })
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    expect(within(dialogo()).queryByLabelText('Lote')).toBeNull()
    await elegirEnBuscable(user, within(dialogo()).getByRole('combobox', { name: 'Producto' }), /Yerba/)
    expect(await within(dialogo()).findByText(/no está marcado como perecedero: hay que marcarlo antes de cargarle un lote/)).toBeTruthy()
    expect(within(dialogo()).queryByLabelText('Lote')).toBeNull()
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true)

    await user.click(within(dialogo()).getByRole('button', { name: 'Marcar como perecedero' }))
    expect(await within(dialogo()).findByLabelText('Lote')).toBeTruthy()
    const put = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/vencimientos/productos/1' && (c[1] as RequestInit)?.method === 'PUT')!
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ vence: true })
    expect(enviosA(ENTRADA)).toHaveLength(0)
  })

  it('sin permiso para marcar (puedeMarcar=false) lo dice y no ofrece el botón; un error al marcar se muestra dentro del diálogo', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, '/api/vencimientos/productos/1/lotes': FICHA_DE(false) }, { puedeMarcar: false })
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    await elegirEnBuscable(user, within(dialogo()).getByRole('combobox', { name: 'Producto' }), /Yerba/)
    expect(await within(dialogo()).findByText(/Pedile a quien tenga el permiso que lo marque/)).toBeTruthy()
    expect(within(dialogo()).queryByRole('button', { name: 'Marcar como perecedero' })).toBeNull()

    cleanup()
    await abrir({ ...TODO_ENTRADA, '/api/vencimientos/productos/1/lotes': FICHA_DE(false), 'PUT /api/vencimientos/productos/1': { status: 403, detail: 'No tenés permiso para marcar' } })
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    await elegirEnBuscable(user, within(dialogo()).getByRole('combobox', { name: 'Producto' }), /Yerba/)
    await user.click(await within(dialogo()).findByRole('button', { name: 'Marcar como perecedero' }))
    expect((await within(dialogo()).findByText('No tenés permiso para marcar')).getAttribute('role')).toBe('alert')
    expect(within(dialogo()).queryByLabelText('Lote')).toBeNull()
  })

  it('marcar desde el diálogo actualiza «Productos que vencen» si ese mismo producto estaba elegido ahí', async () => {
    const user = userEvent.setup()
    let vence = false
    await abrir({
      ...TODO_ENTRADA, '/api/vencimientos/productos/1/lotes': () => FICHA_DE(vence),
      'PUT /api/vencimientos/productos/1': () => { vence = true; return { producto_id: 1, vence: true } },
    })
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Producto' }), /Yerba/)
    expect(await screen.findByText(/no está marcado como perecedero\./)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    await elegirEnBuscable(user, within(dialogo()).getByRole('combobox', { name: 'Producto' }), /Yerba/)
    await user.click(await within(dialogo()).findByRole('button', { name: 'Marcar como perecedero' }))
    await within(dialogo()).findByLabelText('Lote')
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText(/está marcado como perecedero\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dejar de marcar como perecedero' })).toBeTruthy()
  })

  it('un producto con variantes exige elegir la variante (o «Sin variante») y la manda; sin variantes no hay selector', async () => {
    const user = userEvent.setup()
    const VARIANTES = [
      { id: 7, producto_id: 1, sku: 'Y-500', nombre: 'x500', atributos: {}, activa: true },
      { id: 8, producto_id: 1, sku: 'Y-1K', nombre: 'x1kg', atributos: {}, activa: true },
      { id: 9, producto_id: 1, sku: 'Y-OLD', nombre: 'vieja', atributos: {}, activa: false },
    ]
    await abrir({ ...TODO_ENTRADA, '/api/productos/1/variantes': VARIANTES })
    await abrirEntrada(user)
    const selector = await within(dialogo()).findByLabelText('Variante')
    expect(await opcionesDe(user, selector)).toEqual(['Sin variante', 'x500 (Y-500)', 'x1kg (Y-1K)'])
    completarEntrada()
    await user.click(confirmar())
    expect(await within(dialogo()).findByText('Elegí la variante, o «Sin variante».')).toBeTruthy()
    expect(enviosA(ENTRADA)).toHaveLength(0)

    await elegirEnBuscable(user, selector, 'x1kg (Y-1K)')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0]).toMatchObject({ producto_id: 1, variante_id: 8 })

    cleanup()
    sessionStorage.clear()
    prepararFetch()
    await abrir({ ...TODO_ENTRADA, '/api/productos/1/variantes': VARIANTES })
    await abrirEntrada(user)
    await elegirEnBuscable(user, await within(dialogo()).findByLabelText('Variante'), 'Sin variante')
    completarEntrada()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0].variante_id).toBeNull()

    cleanup()
    prepararFetch()
    await abrir(TODO_ENTRADA)
    await abrirEntrada(user)
    expect(within(dialogo()).queryByLabelText('Variante')).toBeNull()
  })

  it('sin lote, sin fecha, con una fecha incompleta o con una cantidad en 0 o vacía no se manda y dice qué falta', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    await abrirEntrada(user)
    await user.click(confirmar())
    const alertas = () => within(dialogo()).getAllByRole('alert').map((a) => a.textContent)
    expect(alertas()).toEqual(expect.arrayContaining(['Escribí el código del lote.', 'Elegí la fecha de vencimiento.', 'Tiene que ser un número mayor a 0.']))

    completarEntrada('L1', '2027-03-15', '0')
    await user.click(confirmar())
    expect(alertas()).toEqual(['Tiene que ser un número mayor a 0.'])
    completarEntrada('L1', '2027-03-15', '-2')
    await user.click(confirmar())
    expect(alertas()).toEqual(['Tiene que ser un número mayor a 0.'])

    // Una fecha imposible (31/02) o a medio escribir: el input nativo entrega '' y marca `validity.badInput`.
    completarEntrada('L1', '', '5')
    const fechaInput = within(dialogo()).getByLabelText('Fecha de vencimiento') as HTMLInputElement
    Object.defineProperty(fechaInput, 'validity', { configurable: true, value: { badInput: true } })
    fireEvent.change(fechaInput, { target: { value: '2027-03-15' } })
    await user.click(confirmar())
    expect(alertas()).toEqual(['La fecha no es válida.'])
    Object.defineProperty(fechaInput, 'validity', { configurable: true, value: { badInput: false } })
    fireEvent.change(fechaInput, { target: { value: '2027-03-16' } })
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0]).toMatchObject({ lote: 'L1', vence: '2027-03-16', cantidad: 5 })
  })

  it('🔑 la clave se REUSA tras un 409 o un error de red con los mismos datos, y CAMBIA al modificar el lote, la fecha, la cantidad, la nota o al abrir de nuevo', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    secuencia(ENTRADA, [() => json({ detail: 'el producto 1 no está marcado como perecedero' }, 409), () => json({ detail: 'cantidad inválida' }, 422), () => json(ENTRADA_OK)])
    await abrirEntrada(user)
    completarEntrada()
    await user.click(confirmar())
    await within(dialogo()).findByText('el producto 1 no está marcado como perecedero')
    await user.click(confirmar())
    await within(dialogo()).findByText('cantidad inválida')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(3))
    expect(new Set(clavesDe(ENTRADA)).size).toBe(1)
    expect(enviosA(ENTRADA)[1]).toEqual(enviosA(ENTRADA)[0])
  })

  it('🔑 cada cambio de datos es otra clave (lote, fecha, cantidad, nota) y cerrar y abrir de nuevo también', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    // 409 definitivo cada vez: no deja nada pendiente y el diálogo sigue abierto.
    secuencia(ENTRADA, [() => json({ detail: 'rechazado' }, 409)])
    await abrirEntrada(user)
    completarEntrada()
    let n = 0
    const enviar = async () => { await user.click(confirmar()); n += 1; await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(n)); await within(dialogo()).findByText('rechazado') }
    await enviar()
    for (const cambiar of [
      () => fireEvent.change(within(dialogo()).getByLabelText('Lote'), { target: { value: 'L-2027' } }),
      () => fireEvent.change(within(dialogo()).getByLabelText('Fecha de vencimiento'), { target: { value: '2027-04-01' } }),
      () => fireEvent.change(within(dialogo()).getByLabelText('Cantidad'), { target: { value: '10' } }),
      () => fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'otra' } }),
    ]) {
      cambiar()
      await enviar()
      expect(new Set(clavesDe(ENTRADA)).size).toBe(n)
    }
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    await abrirEntrada(user)
    completarEntrada('L-2027', '2027-04-01', '10')
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'otra' } })
    await enviar()
    expect(new Set(clavesDe(ENTRADA)).size).toBe(n)
  })

  it('repetida: true es un éxito («ya estaba registrado»), no un error', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, [`POST ${ENTRADA}`]: { ...ENTRADA_OK, repetida: true, saldo_lote: 30 } })
    await abrirEntrada(user)
    completarEntrada()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const aviso = await screen.findByText(/Ya estaba registrado: esta carga se había guardado antes, no se sumó de nuevo/)
    expect(aviso.getAttribute('role')).toBe('status')
    expect(texto(aviso)).toContain('Saldo del lote: 30 u')
    expect(aviso.textContent).not.toContain('Se cargaron')
  })

  it.each([
    ['409 (producto sin marcar o servicio)', 409, 'el producto 1 no está marcado como perecedero: marcalo antes de cargarle un lote'],
    ['422 (depósito inactivo)', 422, 'el depósito 1 no está activo'],
    ['422 (variante de otro producto)', 422, 'la variante 7 no es del producto 1'],
    ['422 (escala de la unidad)', 422, 'la cantidad 2.5 no respeta la unidad: tiene que ser entera'],
  ])('%s: muestra el mensaje del motor, deja el diálogo abierto con lo tipeado y no deja nada pendiente', async (_caso, status, detail) => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, [`POST ${ENTRADA}`]: { status, detail } })
    await abrirEntrada(user)
    completarEntrada('L-2026', '2027-03-15', '2.5')
    await user.click(confirmar())
    expect((await within(dialogo()).findByText(detail)).getAttribute('role')).toBe('alert')
    expect((within(dialogo()).getByLabelText('Lote') as HTMLInputElement).value).toBe('L-2026')
    expect((within(dialogo()).getByLabelText('Cantidad') as HTMLInputElement).value).toBe('2.5')
    expect(guardado()).toEqual({})
    expect(panel()).toBeNull()
    expect(within(dialogo()).queryByText(/No se sabe si se llegó a registrar/)).toBeNull()
  })

  it('un 422 de validación del cuerpo (una lista) muestra los mensajes, no «[object Object]»', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    secuencia(ENTRADA, [() => json({ detail: [{ msg: 'Input should be greater than 0' }, { msg: 'Field required' }] }, 422)])
    await abrirEntrada(user)
    completarEntrada()
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('Input should be greater than 0 Field required')
  })

  it('🔑 el 503 de la migración es definitivo (nada guardado, se puede reintentar); cualquier otro 503 es incierto y queda pendiente', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    secuencia(ENTRADA, [() => json({ detail: DETALLE_SIN_REVISION }, 503), () => json({ detail: 'Service Unavailable' }, 503)])
    await abrirEntrada(user)
    completarEntrada()
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe(
      'La base no tiene aplicada la revisión de vencimientos; pedí al administrador que ejecute libracommerce-migrar upgrade.')
    expect(guardado()).toEqual({})
    expect(panel()).toBeNull()

    await user.click(confirmar())
    expect((await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)).getAttribute('role')).toBe('alert')
    expect(Object.keys(guardado())).toEqual([FIRMA_ENTRADA])
    // Es el mismo intento (misma clave): el 503 definitivo no la gastó.
    expect(new Set(clavesDe(ENTRADA)).size).toBe(1)
  })

  it('doble clic en «Confirmar»: un solo envío, y el botón queda deshabilitado mientras está en vuelo', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    let liberar: (r: Response) => void = () => {}
    secuencia(ENTRADA, [() => new Promise<Response>((r) => { liberar = r }) as unknown as Response])
    await abrirEntrada(user)
    completarEntrada()
    await user.dblClick(confirmar())
    expect(enviosA(ENTRADA)).toHaveLength(1)
    expect((within(dialogo()).getByRole('button', { name: 'Guardando…' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { liberar(json(ENTRADA_OK)) })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(ENTRADA)).toHaveLength(1)
  })

  it.each([
    ['sin respuesta (red)', () => 'caida' as const],
    ['un 500', () => json({ detail: 'Internal Server Error' }, 500)],
    ['un 408', () => json({ detail: 'Request Timeout' }, 408)],
  ])('🔑 %s: queda guardado bajo el destino, bloquea cantidad y nota, y reenviarlo (repetida: true) cierra como éxito y limpia', async (_caso, fallo) => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    secuencia(ENTRADA, [fallo, () => json({ ...ENTRADA_OK, repetida: true })])
    await abrirEntrada(user)
    completarEntrada()
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'la primera' } })
    await user.click(confirmar())
    expect((await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)).getAttribute('role')).toBe('alert')

    const entradas = Object.entries(guardado())
    expect(entradas.map(([k]) => k)).toEqual([FIRMA_ENTRADA])
    expect(entradas[0][1].tipo).toBe('entrada')
    expect(entradas[0][1].cuerpo).toEqual(enviosA(ENTRADA)[0])
    expect(texto(panel())).toMatch(/intento del \d{2}:\d{2}/)
    expect(texto(panel())).toContain('cargar 12 u al lote L-2026 (vence 15-03-2027)')
    expect((within(dialogo()).getByLabelText('Cantidad') as HTMLInputElement).disabled).toBe(true)
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(true)
    expect(within(dialogo()).queryByRole('button', { name: 'Confirmar' })).toBeNull()
    expect(enBotones('Descartar el intento anterior…')).toBeTruthy()

    // Reenviar manda EXACTAMENTE lo original con la misma clave.
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(ENTRADA)).toHaveLength(2)
    expect(enviosA(ENTRADA)[1]).toEqual(enviosA(ENTRADA)[0])
    expect((await screen.findByText(/Ya estaba registrado/)).getAttribute('role')).toBe('status')
    expect(guardado()).toEqual({})
  })

  it('🔑 tras un timeout, el mismo destino no admite otra carga (aunque se cambie la cantidad a la fuerza); otro lote, fecha o depósito sí, con clave nueva', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    secuencia(ENTRADA, [() => 'caida', () => json(ENTRADA_OK)])
    await abrirEntrada(user)
    completarEntrada()
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)

    // Forzar la cantidad (el campo está apagado) no cambia lo que se manda: se reenvía el original.
    const cantidad = within(dialogo()).getByLabelText('Cantidad') as HTMLInputElement
    fireEvent.change(cantidad, { target: { value: '999' } })
    expect(cantidad.value).toBe('12')
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(ENTRADA)[1]).toEqual(enviosA(ENTRADA)[0])
    expect(enviosA(ENTRADA)[1].cantidad).toBe(12)

    // Otro destino en otro intento: primero dejamos uno incierto, y cambiamos de lote, de fecha y de depósito.
    secuencia(ENTRADA, [() => 'caida', () => json(ENTRADA_OK)])
    await abrirEntrada(user)
    completarEntrada()
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    for (const cambiar of [
      () => fireEvent.change(within(dialogo()).getByLabelText('Lote'), { target: { value: 'L-OTRO' } }),
      () => fireEvent.change(within(dialogo()).getByLabelText('Fecha de vencimiento'), { target: { value: '2027-03-16' } }),
    ]) {
      cambiar()
      expect(panel()).toBeNull()
      expect((within(dialogo()).getByLabelText('Cantidad') as HTMLInputElement).disabled).toBe(false)
      expect(enBotones('Confirmar')).toBeTruthy()
      // Volver al destino original lo bloquea otra vez.
      completarEntrada('L-2026', '2027-03-15', '12')
      expect(panel()).toBeTruthy()
    }
    await elegirEnBuscable(user, within(dialogo()).getByLabelText('Depósito'), 'Norte · Depósito Norte')
    expect(panel()).toBeNull()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(4))
    expect(enviosA(ENTRADA)[3]).toMatchObject({ deposito_id: 2 })
    expect(clavesDe(ENTRADA)[3]).not.toBe(clavesDe(ENTRADA)[2])
  })

  it('🔑 una carga incierta queda a la vista tras cerrar y tras desmontar la pantalla: «Revisar» abre el diálogo con su destino, su cantidad y su nota, y descartar exige confirmación y da clave nueva', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    secuencia(ENTRADA, [() => 'caida'])
    await abrirEntrada(user)
    completarEntrada()
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'pallet 4' } })
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    const original = enviosA(ENTRADA)[0]
    await cancelar(user)
    expect(screen.getByText(/Hay una carga de stock sin confirmar/)).toBeTruthy()
    expect(texto(screen.getByText(/Yerba · lote L-2026/))).toContain('vence 15-03-2027')

    cleanup()
    prepararFetch()
    await abrir(TODO_ENTRADA)
    await user.click(screen.getByRole('button', { name: 'Revisar la carga sin confirmar' }))
    await within(dialogo()).findByLabelText('Lote')
    expect((within(dialogo()).getByLabelText('Lote') as HTMLInputElement).value).toBe('L-2026')
    expect((within(dialogo()).getByLabelText('Fecha de vencimiento') as HTMLInputElement).value).toBe('2027-03-15')
    expect((within(dialogo()).getByLabelText('Cantidad') as HTMLInputElement).value).toBe('12')
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).value).toBe('pallet 4')
    expect(panel()).toBeTruthy()

    await user.click(enBotones('Descartar el intento anterior…'))
    expect(guardado()).not.toEqual({})
    await user.click(enBotones('Sí, descartar el intento anterior'))
    expect(guardado()).toEqual({})
    expect(panel()).toBeNull()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(clavesDe(ENTRADA)[0]).not.toBe(original.clave_operacion)
    expect(screen.queryByText(/Hay una carga de stock sin confirmar/)).toBeNull()
  })

  it('sin puedeMover no se ofrece revisar una carga pendiente (tampoco el botón)', async () => {
    sessionStorage.setItem(ALMACEN, JSON.stringify({ [FIRMA_ENTRADA]: {
      firma: FIRMA_ENTRADA, tipo: 'entrada', creado: Date.UTC(2026, 8, 30, 15, 30),
      cuerpo: { producto_id: 1, deposito_id: 1, variante_id: null, lote: 'L-2026', vence: '2027-03-15', cantidad: 12, nota: '', clave_operacion: 'k' },
    } }))
    await abrir(TODO_ENTRADA, { puedeMover: false })
    expect(screen.queryByText(/Hay una carga de stock sin confirmar/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revisar la carga sin confirmar' })).toBeNull()
  })

  it('🔑 falla cerrado: si setItem falla NO se envía la entrada, y al volver a funcionar el storage el mismo diálogo envía', async () => {
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    secuencia(ENTRADA, [() => json(ENTRADA_OK)])
    await abrirEntrada(user)
    completarEntrada()
    await user.click(confirmar())
    expect((await within(dialogo()).findByText(/No se pudo guardar el intento en este navegador/)).getAttribute('role')).toBe('alert')
    expect(enviosA(ENTRADA)).toHaveLength(0)
    expect((confirmar() as HTMLButtonElement).disabled).toBe(false)
    espia.mockRestore()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
  })

  it('una entrada incierta no bloquea una merma ni una asignación (destinos de otro tipo)', async () => {
    const user = userEvent.setup()
    await abrir(TODO_ENTRADA)
    secuencia(ENTRADA, [() => 'caida'])
    await abrirEntrada(user)
    completarEntrada()
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    await cancelar(user)
    await abrirMerma(user)
    expect(panel()).toBeNull()
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(MERMA)).toHaveLength(1))
  })

  it('si la lista de productos no carga, el diálogo lo dice y no ofrece el selector', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, '/api/productos': { status: 403, detail: 'Sin permiso de productos' } })
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    expect(within(dialogo()).getByText('Sin permiso de productos')).toBeTruthy()
    expect(within(dialogo()).queryByRole('combobox', { name: 'Producto' })).toBeNull()
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Vencimientos: cargar stock con lote: las variantes se conocen ANTES de confirmar', () => {
  const VARIANTES = [
    { id: 7, producto_id: 1, sku: 'Y-500', nombre: 'x500', atributos: {}, activa: true },
    { id: 8, producto_id: 1, sku: 'Y-1K', nombre: 'x1kg', atributos: {}, activa: true },
  ]
  const RUTA_VARIANTES_1 = '/api/productos/1/variantes'
  const RUTA_VARIANTES_2 = '/api/productos/2/variantes'

  /** Retiene un GET hasta que el test lo libere (lo que queda en vuelo no contesta solo). */
  function retener(ruta: string) {
    const base = fetchMock.getMockImplementation()!
    let liberar: (r: Response) => void = () => {}
    const promesa = new Promise<Response>((r) => { liberar = r })
    let pedidos = 0
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === ruta && (init?.method ?? 'GET') === 'GET') { pedidos += 1; return promesa }
      return base(entrada, init)
    })
    return { liberar, pedidos: () => pedidos }
  }
  /** Cambia cómo contesta un GET (para que el reintento ya ande). */
  function contestar(ruta: string, cuerpo: unknown) {
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) =>
      String(entrada) === ruta && (init?.method ?? 'GET') === 'GET' ? Promise.resolve(json(cuerpo)) : base(entrada, init))
  }
  async function elegir(user: ReturnType<typeof userEvent.setup>, producto: string | RegExp) {
    await elegirEnBuscable(user, within(dialogo()).getByRole('combobox', { name: 'Producto' }), producto)
  }

  it('con la consulta de variantes en vuelo no se confirma: el botón está apagado, se dice «Consultando variantes…» y no sale ningún POST; al llegar, sí', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, [RUTA_VARIANTES_1]: VARIANTES })
    const variantes = retener(RUTA_VARIANTES_1)
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    await elegir(user, /Yerba/)
    await within(dialogo()).findByLabelText('Lote')
    completarEntrada()
    expect(within(dialogo()).getByText('Consultando variantes…')).toBeTruthy()
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true)
    await user.click(confirmar())
    fireEvent.click(confirmar())
    expect(enviosA(ENTRADA)).toHaveLength(0)
    expect(guardado()).toEqual({})

    await act(async () => { variantes.liberar(json(VARIANTES)) })
    await within(dialogo()).findByLabelText('Variante')
    expect(within(dialogo()).queryByText('Consultando variantes…')).toBeNull()
    // Con variantes hay que elegir: sin elegir, tampoco sale.
    await user.click(confirmar())
    expect(enviosA(ENTRADA)).toHaveLength(0)
    await elegirEnBuscable(user, within(dialogo()).getByLabelText('Variante'), 'x500 (Y-500)')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0]).toMatchObject({ producto_id: 1, variante_id: 7 })
  })

  it('si la consulta de variantes falla no se confirma (nunca variante_id: null por omisión), se ve el error con «Reintentar»; tras un reintento exitoso se carga con la variante elegida o «Sin variante»', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, [RUTA_VARIANTES_1]: { status: 500, detail: 'falló el catálogo' } })
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    await elegir(user, /Yerba/)
    await within(dialogo()).findByLabelText('Lote')
    completarEntrada()
    const alerta = await within(dialogo()).findByText(/No se pudieron consultar las variantes del producto: falló el catálogo/)
    expect(alerta.getAttribute('role')).toBe('alert')
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true)
    await user.click(confirmar())
    expect(enviosA(ENTRADA)).toHaveLength(0)
    expect(within(dialogo()).queryByLabelText('Variante')).toBeNull()

    contestar(RUTA_VARIANTES_1, VARIANTES)
    await user.click(within(dialogo()).getByRole('button', { name: 'Reintentar' }))
    await within(dialogo()).findByLabelText('Variante')
    expect(within(dialogo()).queryByRole('button', { name: 'Reintentar' })).toBeNull()
    // Lo tipeado sigue ahí.
    expect((within(dialogo()).getByLabelText('Lote') as HTMLInputElement).value).toBe('L-2026')
    await elegirEnBuscable(user, within(dialogo()).getByLabelText('Variante'), 'Sin variante')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0]).toMatchObject({ producto_id: 1, variante_id: null })
  })

  it('tras un reintento exitoso con la lista vacía (el producto no tiene variantes) se carga en la base', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO_ENTRADA, [RUTA_VARIANTES_1]: { status: 403, detail: 'Sin permiso de variantes' } })
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    await elegir(user, /Yerba/)
    await within(dialogo()).findByLabelText('Lote')
    completarEntrada()
    await within(dialogo()).findByText(/Sin permiso de variantes/)
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true)
    contestar(RUTA_VARIANTES_1, [])
    await user.click(within(dialogo()).getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect((confirmar() as HTMLButtonElement).disabled).toBe(false))
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0]).toMatchObject({ producto_id: 1, variante_id: null })
  })

  it('carrera: la respuesta vieja de otro producto no habilita la confirmación ni se usa; al cambiar de producto se reinicia', async () => {
    const user = userEvent.setup()
    await abrir({
      ...TODO_ENTRADA, [RUTA_VARIANTES_1]: VARIANTES, [RUTA_VARIANTES_2]: [],
      '/api/vencimientos/productos/2/lotes': FICHA_DE(true, 'u', 2, 'Crema'),
      [`POST ${ENTRADA}`]: { ...ENTRADA_OK, producto_id: 2 },
    })
    const de1 = retener(RUTA_VARIANTES_1)
    const de2 = retener(RUTA_VARIANTES_2)
    await user.click(screen.getByRole('button', { name: 'Cargar stock con lote' }))
    await elegir(user, /Yerba/)
    await within(dialogo()).findByLabelText('Lote')
    await elegir(user, /Crema/)
    await waitFor(() => expect(de2.pedidos()).toBe(1))
    await within(dialogo()).findByLabelText('Lote')
    completarEntrada()
    // Llega la respuesta de Yerba (vieja): no vale para Crema.
    await act(async () => { de1.liberar(json(VARIANTES)) })
    expect(within(dialogo()).queryByLabelText('Variante')).toBeNull()
    expect(within(dialogo()).getByText('Consultando variantes…')).toBeTruthy()
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true)
    await user.click(confirmar())
    expect(enviosA(ENTRADA)).toHaveLength(0)

    // Llega la de Crema (sin variantes): ahora sí, a la base y de Crema.
    await act(async () => { de2.liberar(json([])) })
    await waitFor(() => expect((confirmar() as HTMLButtonElement).disabled).toBe(false))
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0]).toMatchObject({ producto_id: 2, variante_id: null })
  })

  it('volver a elegir un producto no reusa la variante elegida para el anterior', async () => {
    const user = userEvent.setup()
    await abrir({
      ...TODO_ENTRADA, [RUTA_VARIANTES_1]: VARIANTES, [RUTA_VARIANTES_2]: VARIANTES.map((v) => ({ ...v, producto_id: 2 })),
      '/api/vencimientos/productos/2/lotes': FICHA_DE(true, 'u', 2, 'Crema'),
    })
    await abrirEntrada(user)
    await elegirEnBuscable(user, within(dialogo()).getByLabelText('Variante'), 'x1kg (Y-1K)')
    await elegir(user, /Crema/)
    await waitFor(() => expect((within(dialogo()).getByLabelText('Variante') as HTMLSelectElement)).toBeTruthy())
    completarEntrada()
    await user.click(confirmar())
    expect(await within(dialogo()).findByText('Elegí la variante, o «Sin variante».')).toBeTruthy()
    expect(enviosA(ENTRADA)).toHaveLength(0)
  })

  it('reenviar un intento guardado no depende de la consulta de variantes (se manda el cuerpo original)', async () => {
    const user = userEvent.setup()
    const cuerpo = { producto_id: 1, deposito_id: 1, variante_id: 8, lote: 'L-2026', vence: '2027-03-15', cantidad: 12, nota: '', clave_operacion: 'k-viejo' }
    const firma = JSON.stringify(['entrada', 1, 1, 8, 'L-2026', '2027-03-15'])
    sessionStorage.setItem(ALMACEN, JSON.stringify({ [firma]: { firma, tipo: 'entrada', cuerpo, creado: Date.UTC(2026, 8, 30, 15, 30) } }))
    await abrir({ ...TODO_ENTRADA, [RUTA_VARIANTES_1]: { status: 500, detail: 'caído' } })
    await user.click(screen.getByRole('button', { name: 'Revisar la carga sin confirmar' }))
    await within(dialogo()).findByText(/Hay un intento anterior sin confirmar/)
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(ENTRADA)).toHaveLength(1))
    expect(enviosA(ENTRADA)[0]).toEqual(cuerpo)
  })
})


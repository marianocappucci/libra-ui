// Libros IVA, logs, reportes y caja por medio (P9-M4, 2026-09-07), extraídas de
// Contalibra y Restolibra: las cuatro pantallas de lectura con sus filtros y
// sus exports.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { LibrosIva } from '../src/comercio/LibrosIva'
import { Logs, aFechaLocal } from '../src/comercio/Logs'
import { Reportes } from '../src/comercio/Reportes'
import { CajaMedios } from '../src/comercio/CajaMedios'
import type { CajaMediosData, LibrosIvaData, LogsData, ReportesData } from '../src/comercio/tipos'
import { montar, pedidas, prepararFetch, responder, selectConOpcion } from './helpers-pantallas'

const LIBROS: LibrosIvaData = {
  desde: '2026-09-01', hasta: '2026-09-30', empresa_cuit: '30-1',
  facturas: [
    { id: 1, tipo: 6, punto_venta: 5, numero: 11, fecha: '2026-09-01', cliente_razon: 'Ana', cliente_cuit: '20123456789', subtotal: 100, iva_amount: 21, total: 121, cae: '777' },
    { id: 2, tipo: 11, punto_venta: 5, numero: 12, fecha: '2026-09-02', cliente_razon: 'Beto', cliente_cuit: '', subtotal: 50, iva_amount: 0, total: 50 },
  ],
  egresos: [
    { id: 5, fecha: '2026-09-03', proveedor_nombre: 'ACME', numero: '0001-00000042', monto_neto: 1000, iva_monto: 210, total: 1210, proveedor_cuit: '30111111111', iva_pct: 0.21 },
    { id: 6, fecha: '2026-09-04', proveedor_nombre: '', numero: '', monto_neto: 0, iva_monto: 0, total: 100, iva_pct: 0.105 },
  ],
  resumen_v: { cbtes: 2, neto: 150, iva: 21, total: 171, por_tasa: { '21': { neto: 100, iva: 21, cbtes: 1 }, '0': { neto: 50, iva: 0, cbtes: 1 } } },
  resumen_c: { cbtes: 2, neto: 1000, iva: 210, total: 1310, por_tasa: {} },
}
const LOGS: LogsData = {
  actividad: [
    { ts: '2026-09-02 10:00:05', fecha: '2026-09-02', tipo: 'venta', descripcion: 'Venta V-00007 (cobrada)', monto: 200, usuario: 'Cajero', turno_id: 3, ref_tabla: 'ventas', ref_id: 7 },
    { ts: '2026-09-02 09:00:00', fecha: '2026-09-02', tipo: 'stock', descripcion: 'venta Yerba (-2.0 u)', monto: 2, usuario: '', turno_id: null, ref_tabla: 'movimientos_stock', ref_id: 9 },
    { ts: '2026-09-01 18:30:00', fecha: '2026-09-01', tipo: 'caja', descripcion: 'egreso: Hielo', monto: 0, usuario: 'Admin', turno_id: null },
  ],
  tipo_meta: { venta: { label: 'Venta', color: '#111' }, caja: { label: 'Caja', color: '#222' }, stock: { label: 'Stock', color: '#333' } },
  total: 3, total_pages: 2, page: 1,
  usuarios: [{ id: 1, nombre: 'Admin', role: 'admin' }, { id: 7, nombre: 'Cajero', role: 'cajero' }],
  auth_log: [
    { id: 1, evento: 'login', username: 'admin', ip: '10.0.0.1', ts: '2026-09-02 08:00:00' },
    { id: 2, evento: 'login_fallido', username: 'x', ip: '', ts: '2026-09-02 08:01:00' },
    { id: 3, evento: 'otro', username: 'y', ip: '', ts: '2026-09-02 08:02:00' },
  ],
}
const REPORTES: ReportesData = {
  desde: '2026-09-01', hasta: '2026-09-30', agrupacion: 'dia',
  resumen: { ventas_cantidad: 3, ventas_total: 450, facturas_cantidad: 1, caja_saldo: 450 },
  ventas_ts: [{ periodo: '2026-09-01', cantidad: 1, total: 100 }, { periodo: '2026-09-02', cantidad: 2, total: 350 }],
  medios: [{ medio: 'efectivo', operaciones: 2, total: 300 }, { medio: 'tarjeta', operaciones: 1, total: 150 }],
  productos: [{ nombre: 'Yerba', cantidad: 4, total: 400 }, { nombre: '', cantidad: 1, total: 50 }],
  caja: [{ tipo: 'ingreso', cantidad: 3, total: 450 }, { tipo: 'egreso', cantidad: 1, total: 30 }],
  stock_bajo: [{ id: 2, nombre: 'Azúcar', codigo: null, stock_actual: 1, stock_minimo: 5 }],
  medio_label: { efectivo: 'Efectivo', tarjeta: 'Tarjeta (histórico)' },
}
const CAJA_MEDIOS: CajaMediosData = {
  desde: '2026-09-01', hasta: '2026-09-30',
  cajas_config: [
    { id: 1, nombre: 'Principal', descripcion: '', medios_pago: [], es_default: 1, activo: 1, punto_venta: null },
    { id: 2, nombre: 'POS 2', descripcion: '', medios_pago: [], es_default: 0, activo: 1, punto_venta: null },
  ],
  cajas: [
    { id: 1, nombre: 'Principal', medios: { efectivo: { ingresos: 300, ingresos_ops: 2, egresos: 30, egresos_ops: 1 }, transferencia: { ingresos: 0, ingresos_ops: 0, egresos: 20, egresos_ops: 1 } }, total_ingresos: 300, total_egresos: 50, saldo: 250 },
    { id: 2, nombre: 'POS 2', medios: { efectivo: { ingresos: 100, ingresos_ops: 1, egresos: 0, egresos_ops: 0 } }, total_ingresos: 100, total_egresos: 200, saldo: -100 },
  ],
  totales: { efectivo: { ingresos: 400, ingresos_ops: 3, egresos: 30, egresos_ops: 1 }, transferencia: { ingresos: 0, ingresos_ops: 0, egresos: 20, egresos_ops: 1 } },
  medio_label: { efectivo: 'Efectivo' },
}

beforeEach(() => {
  cleanup()
  prepararFetch()
})

// ── LibrosIva ────────────────────────────────────────────────────────────

describe('LibrosIva', () => {
  it('muestra ventas y compras con sus resúmenes, el CUIT formateado y los cuatro exports', async () => {
    responder({ '/api/libros-iva': LIBROS })
    const user = userEvent.setup()
    montar('/libros-iva', <LibrosIva />)
    expect(await screen.findByText('Comprobantes emitidos')).toBeTruthy()
    expect(pedidas()[0]).toMatch(/^GET \/api\/libros-iva\?desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-\d{2}$/)
    expect(screen.getByText('FAC B')).toBeTruthy()
    expect(screen.getByText('0005-00000011')).toBeTruthy()
    expect(screen.getByText('20-12345678-9')).toBeTruthy()
    expect(screen.getByText('Resumen por alícuota')).toBeTruthy()
    expect(screen.getByText('21%')).toBeTruthy()
    const exportsVentas = screen.getAllByRole('link', { name: /REGINFO_VENTAS/ })
    expect(exportsVentas.map((a) => a.getAttribute('href'))).toEqual([
      expect.stringMatching(/^\/libros-iva\/export\/ventas-cbte\?desde=/), expect.stringMatching(/^\/libros-iva\/export\/ventas-alicuotas\?desde=/),
    ])

    await user.click(screen.getByRole('tab', { name: /IVA Compras/ }))
    expect(await screen.findByText('Comprobantes recibidos')).toBeTruthy()
    expect(screen.getByText('30-11111111-1')).toBeTruthy()
    // La alícuota se deriva del importe (21 %) o del `iva_pct` si no hay neto (10,5 %).
    expect(screen.getByText('21%')).toBeTruthy()
    expect(screen.getByText('11%')).toBeTruthy()
    expect(screen.queryByText('Resumen por alícuota')).toBeNull()
    expect(screen.getAllByRole('link', { name: /REGINFO_COMPRAS/ })).toHaveLength(2)

    // "Mes actual" cierra el período al último día del mes de `desde`.
    const [desde, hasta] = document.querySelectorAll('input[type="date"]')
    fireEvent.change(desde, { target: { value: '2026-02-10' } })
    fireEvent.change(hasta, { target: { value: '2026-03-10' } })
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/libros-iva?desde=2026-02-10&hasta=2026-03-10'))
    await user.click(screen.getByRole('button', { name: 'Mes actual' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/libros-iva?desde=2026-02-01&hasta=2026-02-28'))
  })

  it('el error de carga se muestra', async () => {
    responder({ '/api/libros-iva': { status: 403, detail: 'Solo admin' } })
    montar('/libros-iva', <LibrosIva />)
    expect(await screen.findByText('Solo admin')).toBeTruthy()
    cleanup()
    responder({ '/api/libros-iva': '!caida' })
    montar('/libros-iva', <LibrosIva />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── Logs ─────────────────────────────────────────────────────────────────

describe('Logs (actividad)', () => {
  it('aFechaLocal sólo convierte un ISO de fecha', () => {
    expect(aFechaLocal('2026-09-02')).toBe('02-09-2026')
    expect(aFechaLocal('ayer')).toBe('ayer')
  })

  it('agrupa por día con la hora, los links y el turno; filtra por tipo, usuario, turno y fechas; pagina', async () => {
    responder({ '/api/logs': LOGS })
    const user = userEvent.setup()
    montar('/logs', <Logs />)
    expect(await screen.findByText('Venta V-00007 (cobrada)')).toBeTruthy()
    expect(pedidas()[0]).toBe('GET /api/logs?page=1')
    expect(screen.getByText('02-09-2026')).toBeTruthy()
    expect(screen.getByText('01-09-2026')).toBeTruthy()
    expect(screen.getByText('10:00:05')).toBeTruthy()
    expect(screen.getByTitle('Ver').getAttribute('href')).toBe('/ventas/7')
    expect(screen.getByText('#3').closest('a')?.getAttribute('href')).toBe('/turnos/3')
    // El stock muestra la cantidad cruda; sin monto va un guion.
    expect(screen.getByText('venta Yerba (-2.0 u)').closest('tr')?.textContent).toContain('2')
    expect(screen.getByText('egreso: Hielo').closest('tr')?.textContent).toContain('—')
    expect(screen.getByText('Mostrando', { exact: false }).textContent).toBe('Mostrando 3 de 3 registros')
    expect(screen.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href')).toBe('/admin/logs/export')

    // Tocar una píldora saca ese tipo; tocar todas vuelve a "todos".
    await user.click(screen.getByRole('button', { name: 'Venta' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/logs?page=1&tipo=caja%2Cstock'))
    expect(screen.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href')).toBe('/admin/logs/export?tipo=caja%2Cstock')
    await user.click(screen.getByRole('button', { name: 'Venta' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/logs?page=1'))
    await user.selectOptions(selectConOpcion('Cajero (cajero)'), '7')
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/logs?page=1&usuario_id=7'))
    fireEvent.change(screen.getByPlaceholderText('Todos'), { target: { value: '3' } })
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/logs?page=1&usuario_id=7&turno_id=3'))
    const [desde, hasta] = document.querySelectorAll('input[type="date"]')
    fireEvent.change(desde, { target: { value: '2026-09-01' } })
    fireEvent.change(hasta, { target: { value: '2026-09-02' } })
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/logs?page=1&usuario_id=7&turno_id=3&desde=2026-09-01&hasta=2026-09-02'))
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/logs?page=1'))

    const [anterior, siguiente] = screen.getByText(/Pág 1 \/ 2/).parentElement!.querySelectorAll('button')
    expect(anterior).toBeDisabled()
    await user.click(siguiente)
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/logs?page=2'))
    await user.click(screen.getByText(/Pág 1 \/ 2/).parentElement!.querySelectorAll('button')[0])
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/logs?page=1'))
  })

  it('los accesos, el vacío y el error', async () => {
    responder({ '/api/logs': LOGS })
    const user = userEvent.setup()
    montar('/logs', <Logs />)
    await screen.findByText('Venta V-00007 (cobrada)')
    await user.click(screen.getByRole('tab', { name: /Accesos de usuarios/ }))
    expect(screen.getByText('Últimos 100 eventos')).toBeTruthy()
    expect(screen.getByText('Login')).toBeTruthy()
    expect(screen.getByText('Intento fallido')).toBeTruthy()
    expect(screen.getByText('otro')).toBeTruthy()
    expect(screen.getByText(/10\.0\.0\.1 · 02-09-2026 08:00/)).toBeTruthy()

    cleanup()
    responder({ '/api/logs': { ...LOGS, actividad: [], auth_log: [], total: 0, total_pages: 1 } })
    montar('/logs', <Logs />)
    expect(await screen.findByText('No hay registros para los filtros seleccionados.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: /Accesos de usuarios/ }))
    expect(screen.getByText('Aún no hay eventos de acceso registrados.')).toBeTruthy()

    cleanup()
    responder({ '/api/logs': { status: 403, detail: 'Solo admin' } })
    montar('/logs', <Logs />)
    expect(await screen.findByText('Solo admin')).toBeTruthy()
    // Sin datos, las píldoras salen del set canónico.
    expect(screen.getByRole('button', { name: 'presupuesto' })).toBeTruthy()
    cleanup()
    responder({ '/api/logs': '!caida' })
    montar('/logs', <Logs />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── Reportes ─────────────────────────────────────────────────────────────

describe('Reportes', () => {
  it('muestra el resumen, las cuatro tablas con sus exports y el stock bajo; cambia la agrupación', async () => {
    responder({ '/api/reportes': REPORTES })
    const user = userEvent.setup()
    montar('/reportes', <Reportes />)
    expect(await screen.findByText('Ventas en el período')).toBeTruthy()
    expect(pedidas()[0]).toMatch(/^GET \/api\/reportes\?desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-\d{2}&agrupacion=dia$/)
    expect(screen.getByText('operaciones').previousElementSibling?.textContent).toBe('3')
    expect(screen.getByText('01-09-2026')).toBeTruthy()
    expect(screen.getByText('Tarjeta (histórico)')).toBeTruthy()
    expect(screen.getByText('2 operaciones · 66.7%')).toBeTruthy()
    expect(screen.getByText('(sin nombre)')).toBeTruthy()
    expect(screen.getByText('ingreso')).toBeTruthy()
    expect(screen.getByText('Stock bajo mínimo (1 producto)')).toBeTruthy()
    expect(screen.getByText('Azúcar').closest('tr')?.textContent).toMatch(/—Azúcar154$/)
    expect(screen.getAllByRole('link', { name: 'CSV' }).map((a) => a.getAttribute('href')?.split('?')[0])).toEqual([
      '/reportes/export/ventas', '/reportes/export/medios', '/reportes/export/productos',
    ])
    await user.selectOptions(selectConOpcion('Semana'), 'semana')
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/agrupacion=semana$/))
    expect(screen.getAllByRole('link', { name: 'CSV' })[0].getAttribute('href')).toMatch(/agrupacion=semana$/)
    const [desde, hasta] = document.querySelectorAll('input[type="date"]')
    fireEvent.change(desde, { target: { value: '2026-08-01' } })
    fireEvent.change(hasta, { target: { value: '2026-08-31' } })
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/reportes?desde=2026-08-01&hasta=2026-08-31&agrupacion=semana'))
  })

  it('los vacíos, sin stock bajo, y el error', async () => {
    responder({ '/api/reportes': { ...REPORTES, ventas_ts: [], medios: [], productos: [], caja: [], stock_bajo: [] } })
    montar('/reportes', <Reportes />)
    expect(await screen.findByText('Sin ventas en el período.')).toBeTruthy()
    expect(screen.getAllByText('Sin datos en el período.')).toHaveLength(2)
    expect(screen.getByText('Sin movimientos en el período.')).toBeTruthy()
    expect(screen.queryByText(/Stock bajo mínimo/)).toBeNull()
    cleanup()
    responder({ '/api/reportes': '!caida' })
    montar('/reportes', <Reportes />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── CajaMedios ───────────────────────────────────────────────────────────

describe('CajaMedios', () => {
  it('muestra los totales, el pivot por medio y el detalle por caja; filtra por caja', async () => {
    responder({ '/api/reportes/caja-medios': CAJA_MEDIOS })
    const user = userEvent.setup()
    montar('/reportes/caja-medios', <CajaMedios />)
    expect(await screen.findByText('Ingresos por medio de cobro — todas las cajas')).toBeTruthy()
    expect(pedidas()[0]).toMatch(/caja_id=0$/)
    expect(screen.getByText('Total Ingresos').nextElementSibling?.textContent).toMatch(/400,00/)
    expect(screen.getByText('Saldo Neto').nextElementSibling?.textContent).toMatch(/150,00/)
    // El medio sin etiqueta sale con su clave.
    expect(screen.getAllByText('transferencia').length).toBeGreaterThan(0)
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByText('Subtotal Principal')).toBeTruthy()
    expect(screen.getByText('Subtotal POS 2').closest('tr')?.textContent).toMatch(/-\s?\$\s?100,00/)
    expect(screen.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href')).toMatch(/^\/reportes\/caja-medios\/export\?desde=.*&caja_id=0$/)
    expect(screen.getByRole('link', { name: 'Reportes' }).getAttribute('href')).toBe('/reportes')
    await user.selectOptions(selectConOpcion('Todas las cajas'), '2')
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/caja_id=2$/))
    const [desde, hasta] = document.querySelectorAll('input[type="date"]')
    fireEvent.change(hasta, { target: { value: '2026-09-15' } })
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/hasta=2026-09-15&caja_id=2$/))
    fireEvent.change(desde, { target: { value: '2026-09-10' } })
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/desde=2026-09-10&hasta=2026-09-15&caja_id=2$/))
  })

  it('sin movimientos lo dice, con una sola caja no hay selector, y el error se muestra', async () => {
    responder({ '/api/reportes/caja-medios': { ...CAJA_MEDIOS, cajas_config: [CAJA_MEDIOS.cajas_config[0]], cajas: [], totales: {} } })
    montar('/reportes/caja-medios', <CajaMedios />)
    expect(await screen.findByText('No hay movimientos de caja en el período seleccionado.')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    cleanup()
    responder({ '/api/reportes/caja-medios': { status: 500, detail: 'Base caída' } })
    montar('/reportes/caja-medios', <CajaMedios />)
    expect(await screen.findByText('Base caída')).toBeTruthy()
  })
})

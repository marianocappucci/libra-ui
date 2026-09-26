// Caja, cajas y turnos (P9-M3, 2026-09-06), extraídas de Contalibra y
// Restolibra: los movimientos y su alta, los puntos de cobro con el punto de
// venta de ARCA, y el ciclo del turno (abrir, ver, cerrar con arqueo).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Caja } from '../src/comercio/Caja'
import { Cajas } from '../src/comercio/Cajas'
import { Turnos } from '../src/comercio/Turnos'
import { TurnoDetalle } from '../src/comercio/TurnoDetalle'
import { TurnoCerrar } from '../src/comercio/TurnoCerrar'
import { _resetCacheDeMedios } from '../src/comercio/medios-pago'
import type { CajaConfig, CajaMovimiento, ResumenTurno, Turno } from '../src/comercio/tipos'

const MEDIOS = [{ id: 'efectivo', label: 'Efectivo' }, { id: 'transferencia', label: 'Transferencia' }, { id: 'mercadopago', label: 'MercadoPago' }]
const PRINCIPAL: CajaConfig = { id: 1, nombre: 'Caja Principal', descripcion: 'Caja por defecto', medios_pago: ['efectivo'], es_default: 1, activo: 1, punto_venta: null, mp_pos_id: null }
const POS2: CajaConfig = { id: 2, nombre: 'POS 2', descripcion: '', medios_pago: [], es_default: 0, activo: 0, punto_venta: 4, mp_pos_id: null }
const POSQR: CajaConfig = { id: 3, nombre: 'Caja QR', descripcion: '', medios_pago: ['mercadopago'], es_default: 0, activo: 1, punto_venta: null, mp_pos_id: 'BIOKOCAJA01' }
const INGRESO: CajaMovimiento = { id: 10, fecha: '2026-09-06', tipo: 'ingreso', concepto: 'Venta V-00001 — Efectivo', monto: 200, referencia: '', factura_id: 55, caja_id: 1, caja_nombre: 'Caja Principal', usuario_nombre: 'Cajero', medio_pago: 'efectivo' }
const EGRESO: CajaMovimiento = { id: 11, fecha: '2026-09-06', tipo: 'egreso', concepto: 'Hielo', monto: 30, referencia: 'tk 1', factura_id: null, caja_id: 1, caja_nombre: null, usuario_nombre: null, medio_pago: 'efectivo', anulado: 1 }
const RESUMEN = { ingresos: 200, egresos: 30, saldo_periodo: 170, saldo_total: -5 }
const ABIERTO: Turno = { id: 3, usuario_id: 7, usuario_nombre: 'Cajero', apertura: '2026-09-06 08:00:00', cierre: null, monto_inicial: 1000, monto_declarado_cierre: null, monto_esperado_cierre: null, estado: 'abierto', notas: '' }
const CERRADO: Turno = { ...ABIERTO, id: 2, cierre: '2026-09-05 20:00:00', monto_declarado_cierre: 1190, monto_esperado_cierre: 1200, estado: 'cerrado', notas: 'faltan 10' }
const CUADRADO: Turno = { ...CERRADO, id: 1, monto_declarado_cierre: 1200 }
const SOBRANTE: Turno = { ...CERRADO, id: 0, monto_declarado_cierre: 1250 }
const RESUMEN_TURNO: ResumenTurno = {
  ventas: [{ id: 7, numero: 'V-00007', fecha: '2026-09-06 10:00:00', cliente_nombre: '', total: 200, estado: 'cobrada' },
    { id: 8, numero: 'V-00008', fecha: '2026-09-06 11:00:00', cliente_nombre: 'Ana', total: 100, estado: 'anulada' },
    { id: 9, numero: 'V-00009', fecha: '2026-09-06 12:00:00', cliente_nombre: '', total: 50, estado: 'parcial' }],
  pagos_por_medio: { efectivo: 200, transferencia: 100 }, total_ventas: 300, efectivo_ventas: 200,
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
  return <p data-testid="ubicacion">{l.pathname}{l.search}</p>
}

function montar(ruta: string, elemento: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path={ruta.split('?')[0].replace(/\/\d+(?=\/|$)/, '/:id')} element={<>{elemento}<Ubicacion /></>} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  _resetCacheDeMedios()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

const BASE = { '/api/cajas/medios-disponibles': MEDIOS, '/api/cajas': [PRINCIPAL, POS2], '/api/caja': { movimientos: [INGRESO, EGRESO], resumen: RESUMEN } }

// ── Caja ─────────────────────────────────────────────────────────────────

describe('Caja', () => {
  it('lista los movimientos con el anulado marcado, el resumen, y filtra por caja y período', async () => {
    responder(BASE)
    const user = userEvent.setup()
    montar('/caja', <Caja />)
    expect(await screen.findByText('Venta V-00001 — Efectivo')).toBeTruthy()
    expect(screen.getByText('anulado')).toBeTruthy()
    expect(screen.getByTitle('Ver factura').getAttribute('href')).toBe('/facturas/55')
    expect(screen.getAllByLabelText('Anular movimiento')).toHaveLength(1)
    expect(screen.getByText('Saldo actual').parentElement?.textContent).toMatch(/-?\$\s?5,00/)
    expect(screen.getByText('Caja / Medio')).toBeTruthy()
    // Filtro por caja y período: cada cambio recarga.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Caja' }), '2')
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/GET \/api\/caja\?desde=.*&caja_id=2$/))
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-01-01' } })
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/desde=2026-01-01/))
    await user.click(screen.getByLabelText('Limpiar filtros'))
    await waitFor(() => expect(pedidas().at(-1)).not.toMatch(/caja_id/))
    await user.click(screen.getByLabelText('Recargar'))
    // El deep-link `?nuevo=1` abre el diálogo.
    cleanup()
    montar('/caja?nuevo=1', <Caja />)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('el alta: la caja acota los medios, el concepto es obligatorio, y con factura_id vuelve a la factura', async () => {
    responder({ ...BASE, 'POST /api/caja': { id: 12 } })
    const user = userEvent.setup()
    montar('/caja?factura_id=55', <Caja />)
    await screen.findByText('Venta V-00001 — Efectivo')
    await user.click(screen.getByRole('button', { name: /Nuevo movimiento/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: /Guardar movimiento/ })).toBeDisabled()
    // La caja principal sólo tiene efectivo; la POS 2 no tiene medios: caen todos los del motor.
    expect(within(dialogo).getAllByRole('option').map((o) => o.textContent)).toContain('Efectivo')
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Caja' }), '2')
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Medio de pago' }), 'transferencia')
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Tipo' }), 'egreso')
    fireEvent.change(within(dialogo).getByLabelText('Fecha'), { target: { value: '2026-09-06' } })
    fireEvent.change(within(dialogo).getByLabelText('Concepto'), { target: { value: 'Cobro' } })
    fireEvent.change(within(dialogo).getByLabelText('Monto'), { target: { value: '150' } })
    fireEvent.change(within(dialogo).getByLabelText('Referencia'), { target: { value: 'op 9' } })
    await user.click(within(dialogo).getByRole('button', { name: /Guardar movimiento/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/caja'))
    expect(cuerpoDe('POST /api/caja')).toEqual({ fecha: '2026-09-06', tipo: 'egreso', concepto: 'Cobro', monto: 150, referencia: 'op 9', caja_id: 2, medio_pago: 'transferencia', factura_id: 55 })
    expect(await screen.findByText('/facturas/55')).toBeTruthy()
  })

  it('el alta sin factura recarga; el error de la API se muestra; anular confirma', async () => {
    responder({ ...BASE, 'POST /api/caja': { status: 422, detail: 'El monto debe ser mayor a cero.' }, 'DELETE /api/caja/10': { ok: true } })
    const user = userEvent.setup()
    montar('/caja', <Caja />)
    await screen.findByText('Venta V-00001 — Efectivo')
    await user.click(screen.getByRole('button', { name: /Nuevo movimiento/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Concepto'), { target: { value: 'X' } })
    fireEvent.change(within(dialogo).getByLabelText('Monto'), { target: { value: '5' } })
    await user.click(within(dialogo).getByRole('button', { name: /Guardar movimiento/ }))
    expect(await screen.findByText('El monto debe ser mayor a cero.')).toBeTruthy()
    responder({ ...BASE, 'POST /api/caja': { id: 13 }, 'DELETE /api/caja/10': { ok: true } })
    await user.click(within(dialogo).getByRole('button', { name: /Guardar movimiento/ }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'GET /api/caja' || p.startsWith('GET /api/caja?')).length).toBeGreaterThan(1))
    await user.click(screen.getByLabelText('Anular movimiento'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/caja/10'))
    // Y un anular caído lo dice.
    responder({ ...BASE, 'DELETE /api/caja/10': '!caida' })
    await user.click(screen.getByLabelText('Anular movimiento'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })

  it('con una sola caja no se muestra ni el filtro ni la columna; sin red avisa', async () => {
    responder({ ...BASE, '/api/cajas': [PRINCIPAL] })
    montar('/caja', <Caja />)
    await screen.findByText('Venta V-00001 — Efectivo')
    expect(screen.queryByText('Caja / Medio')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Caja' })).toBeNull()
    cleanup()
    responder({ ...BASE, '/api/caja': '!caida' })
    montar('/caja', <Caja />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── Cajas ────────────────────────────────────────────────────────────────

describe('Cajas', () => {
  it('lista con default/inactiva y medios; alta con punto de venta; el 409 se muestra', async () => {
    responder({ ...BASE, 'POST /api/cajas': { status: 409, detail: 'El punto de venta 4 ya lo tiene POS 2' } })
    const user = userEvent.setup()
    montar('/cajas', <Cajas />)
    expect(await screen.findByText('Caja Principal')).toBeTruthy()
    expect(screen.getByText('Por defecto')).toBeTruthy()
    expect(screen.getByText('Inactiva')).toBeTruthy()
    expect(screen.getByText('Sin medios configurados')).toBeTruthy()
    expect(screen.getAllByText('Ver movimientos')[1].getAttribute('href')).toBe('/caja?caja_id=2')
    await user.click(screen.getByRole('button', { name: /Nueva caja/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: /Crear caja/ })).toBeDisabled()
    expect(within(dialogo).queryByLabelText('Activa')).toBeNull()
    fireEvent.change(within(dialogo).getByLabelText('Nombre'), { target: { value: 'POS 3' } })
    fireEvent.change(within(dialogo).getByLabelText('Descripción'), { target: { value: 'barra' } })
    fireEvent.change(within(dialogo).getByLabelText('Punto de venta de ARCA'), { target: { value: '4' } })
    await user.click(within(dialogo).getByLabelText('Efectivo'))
    await user.click(within(dialogo).getByLabelText('Transferencia'))
    await user.click(within(dialogo).getByLabelText('Transferencia'))
    await user.click(within(dialogo).getByRole('button', { name: /Crear caja/ }))
    expect(await screen.findByText('El punto de venta 4 ya lo tiene POS 2')).toBeTruthy()
    expect(cuerpoDe('POST /api/cajas')).toEqual({ nombre: 'POS 3', descripcion: 'barra', medios_pago: ['efectivo'], activo: true, punto_venta: 4, mp_pos_id: null })
  })

  it('editar manda PUT con el punto de venta vacío como null; predeterminar y borrar', async () => {
    responder({ ...BASE, 'PUT /api/cajas/2': POS2, 'POST /api/cajas/2/set-default': POS2, 'DELETE /api/cajas/2': { ok: true } })
    const user = userEvent.setup()
    montar('/cajas', <Cajas />)
    await screen.findByText('POS 2')
    await user.click(screen.getAllByRole('button', { name: /Editar/ })[1])
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Punto de venta de ARCA')).toHaveValue(4)
    fireEvent.change(within(dialogo).getByLabelText('Punto de venta de ARCA'), { target: { value: '' } })
    await user.click(within(dialogo).getByLabelText('Activa'))
    await user.click(within(dialogo).getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/cajas/2'))
    expect(cuerpoDe('PUT /api/cajas/2')).toEqual({ nombre: 'POS 2', descripcion: '', medios_pago: [], activo: true, punto_venta: null, mp_pos_id: null })
    await user.click(screen.getByRole('button', { name: /Predeterminar/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/cajas/2/set-default'))
    const botones = screen.getAllByRole('button')
    await user.click(botones[botones.length - 1])
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/cajas/2'))
  })

  it('muestra el POS de MercadoPago en la tarjeta y lo guarda alfanumérico', async () => {
    responder({ ...BASE, '/api/cajas': [PRINCIPAL, POSQR], 'PUT /api/cajas/3': POSQR })
    const user = userEvent.setup()
    montar('/cajas', <Cajas />)
    expect(await screen.findByText('Caja QR')).toBeTruthy()
    expect(screen.getByText(/QR:/)).toBeTruthy()
    expect(screen.getByText('BIOKOCAJA01')).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: /Editar/ })[1])
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('POS ID de MercadoPago (QR)'), { target: { value: 'BIOKOCAJA02' } })
    await user.click(within(dialogo).getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/cajas/3'))
    expect(cuerpoDe('PUT /api/cajas/3')).toEqual({ nombre: 'Caja QR', descripcion: '', medios_pago: ['mercadopago'], activo: true, punto_venta: null, mp_pos_id: 'BIOKOCAJA02' })
  })

  it('los errores de predeterminar, borrar y cargar se muestran; sin cajas lo dice', async () => {
    responder({ ...BASE, 'POST /api/cajas/2/set-default': '!caida', 'DELETE /api/cajas/2': { status: 422, detail: 'No se puede eliminar' } })
    const user = userEvent.setup()
    montar('/cajas', <Cajas />)
    await screen.findByText('POS 2')
    await user.click(screen.getByRole('button', { name: /Predeterminar/ }))
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
    const botones = screen.getAllByRole('button')
    await user.click(botones[botones.length - 1])
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('No se puede eliminar')).toBeTruthy()
    cleanup()
    responder({ ...BASE, '/api/cajas': [] })
    montar('/cajas', <Cajas />)
    expect(await screen.findByText('No hay cajas configuradas.')).toBeTruthy()
    cleanup()
    responder({ ...BASE, '/api/cajas': '!caida' })
    montar('/cajas', <Cajas />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── Turnos ───────────────────────────────────────────────────────────────

describe('Turnos', () => {
  it('lista con la diferencia y el cajero sólo para el admin; con turno abierto ofrece cerrar', async () => {
    responder({ ...BASE, '/api/turnos': { turnos: [ABIERTO, CERRADO, CUADRADO, SOBRANTE], turno_activo: ABIERTO } })
    montar('/turnos', <Turnos esAdmin />)
    expect(await screen.findByText('Todos los turnos')).toBeTruthy()
    expect(screen.getAllByText('Cajero').length).toBeGreaterThan(0)
    expect(screen.getByText(/Turno abierto/)).toBeTruthy()
    expect(screen.getByText('Cerrar turno').getAttribute('href')).toBe('/turnos/3/cerrar')
    expect(screen.getByText('OK')).toBeTruthy()
    expect(screen.getByText(/−\$\s?10,00/)).toBeTruthy()
    expect(screen.getByText(/\+\$\s?50,00/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Abrir turno/ })).toBeNull()
    cleanup()
    responder({ ...BASE, '/api/turnos': { turnos: [CERRADO], turno_activo: null } })
    montar('/turnos', <Turnos />)
    expect(await screen.findByText('Mis turnos')).toBeTruthy()
    expect(screen.queryByText('Cajero')).toBeNull()
    expect(screen.getByRole('button', { name: /Abrir turno/ })).toBeTruthy()
  })

  it('abrir un turno navega al detalle; el error se muestra; sin red avisa', async () => {
    responder({ ...BASE, '/api/turnos': { turnos: [], turno_activo: null }, 'POST /api/turnos/abrir': { status: 422, detail: 'no' } })
    const user = userEvent.setup()
    montar('/turnos', <Turnos />)
    expect(await screen.findByText('No hay turnos registrados.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Abrir turno/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Fondo inicial'), { target: { value: '500' } })
    fireEvent.change(within(dialogo).getByLabelText('Notas'), { target: { value: 'mañana' } })
    await user.click(within(dialogo).getByRole('button', { name: /Abrir turno ahora/ }))
    expect(await screen.findByText('no')).toBeTruthy()
    responder({ ...BASE, 'POST /api/turnos/abrir': ABIERTO })
    await user.click(within(dialogo).getByRole('button', { name: /Abrir turno ahora/ }))
    expect(cuerpoDe('POST /api/turnos/abrir')).toEqual({ monto_inicial: 500, notas: 'mañana' })
    expect(await screen.findByText('/turnos/3')).toBeTruthy()
    cleanup()
    responder({ ...BASE, '/api/turnos': '!caida' })
    montar('/turnos', <Turnos />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

describe('TurnoDetalle', () => {
  it('muestra datos, recaudación, resultado del cierre y las ventas', async () => {
    responder({ ...BASE, '/api/turnos/2': { turno: CERRADO, resumen: RESUMEN_TURNO } })
    montar('/turnos/2', <TurnoDetalle />)
    expect(await screen.findByText(/Turno #2/)).toBeTruthy()
    expect(screen.getByText('Cerrado')).toBeTruthy()
    expect(screen.getByText('faltan 10')).toBeTruthy()
    expect(screen.getByText('Resultado del cierre')).toBeTruthy()
    expect(screen.getByText('V-00007').getAttribute('href')).toBe('/ventas/7')
    expect(screen.getByText('Cobrada')).toBeTruthy()
    expect(screen.getByText('Anulada')).toBeTruthy()
    expect(screen.getByText('parcial')).toBeTruthy()
    expect(screen.getAllByText('— Consumidor final —')).toHaveLength(2)
    expect(screen.queryByText('Cerrar turno')).toBeNull()
    cleanup()
    responder({ ...BASE, '/api/turnos/3': { turno: ABIERTO, resumen: { ...RESUMEN_TURNO, ventas: [], pagos_por_medio: {} } } })
    montar('/turnos/3', <TurnoDetalle />)
    expect(await screen.findByText('Cerrar turno')).toBeTruthy()
    expect(screen.getByText('Sin ventas en este turno.')).toBeTruthy()
    expect(screen.getByText('No hay ventas en este turno todavía.')).toBeTruthy()
    cleanup()
    responder({ ...BASE, '/api/turnos/3': { status: 404, detail: 'Turno no encontrado' } })
    montar('/turnos/3', <TurnoDetalle />)
    expect(await screen.findByText('Turno no encontrado')).toBeTruthy()
  })
})

describe('TurnoCerrar', () => {
  it('precarga el esperado, calcula la diferencia y cierra; cancelar vuelve', async () => {
    responder({ ...BASE, '/api/turnos/3': { turno: ABIERTO, resumen: RESUMEN_TURNO }, 'POST /api/turnos/3/cerrar': ABIERTO })
    const user = userEvent.setup()
    montar('/turnos/3/cerrar', <TurnoCerrar />)
    expect(await screen.findByText(/Cerrar turno #3/)).toBeTruthy()
    expect(screen.getByLabelText('Efectivo contado en caja')).toHaveValue(1200)
    expect(screen.getByText('OK')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Efectivo contado en caja'), { target: { value: '1150' } })
    expect(screen.getByText(/−\$\s?50,00/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Notas de cierre'), { target: { value: 'faltó' } })
    await user.click(screen.getByRole('button', { name: /Confirmar cierre/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/turnos/3/cerrar'))
    expect(cuerpoDe('POST /api/turnos/3/cerrar')).toEqual({ monto_declarado: 1150, notas: 'faltó' })
    expect(await screen.findByText('/turnos/3')).toBeTruthy()
  })

  it('el error al cerrar se muestra; cancelar navega; sin red avisa', async () => {
    responder({ ...BASE, '/api/turnos/3': { turno: ABIERTO, resumen: { ...RESUMEN_TURNO, pagos_por_medio: {} } }, 'POST /api/turnos/3/cerrar': { status: 422, detail: 'El turno ya está cerrado.' } })
    const user = userEvent.setup()
    montar('/turnos/3/cerrar', <TurnoCerrar />)
    await screen.findByText(/Cerrar turno #3/)
    expect(screen.getByText('Sin ventas en este turno.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Confirmar cierre/ }))
    expect(await screen.findByText('El turno ya está cerrado.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('/turnos/3')).toBeTruthy()
    cleanup()
    responder({ ...BASE, '/api/turnos/3': '!caida' })
    montar('/turnos/3/cerrar', <TurnoCerrar />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── Variantes de un producto con sucursales (0.77.0) ─────────────────────

const SUCURSALES = [
  { id: 1, nombre: 'Salón', admiteCajas: true },
  { id: 2, nombre: 'Depósito Norte', admiteCajas: false },
  { id: 3, nombre: 'Centro', admiteCajas: true },
]
const CAJA_SALON: CajaConfig = { ...PRINCIPAL, id: 10, nombre: 'Caja 1', sucursal_id: 1, sucursal_nombre: 'Salón', tiene_turno_abierto: true }
const CAJA_CENTRO: CajaConfig = { ...POS2, id: 11, nombre: 'Caja Centro', sucursal_id: 3, activo: 1, es_default: 1, tiene_turno_abierto: false, mp_pos_id: 'QR1' }
const CAJA_VIEJA: CajaConfig = { ...POS2, id: 12, nombre: 'Caja vieja', sucursal_id: 2, activo: 0, es_default: 0, tiene_turno_abierto: false }
const CON_SEDES = { ...BASE, '/api/cajas': [CAJA_SALON, CAJA_CENTRO, CAJA_VIEJA] }

describe('Cajas con sucursales', () => {
  it('sin las props es la pantalla de siempre: sin sucursal, sin botón de baja, con movimientos', async () => {
    responder({ ...BASE, '/api/cajas': [CAJA_SALON, CAJA_CENTRO] })
    montar('/cajas', <Cajas />)
    await screen.findByText('Caja 1')
    expect(screen.queryByText(/Sucursal:/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Desactivar/ })).toBeNull()
    expect(screen.getAllByText('Ver movimientos').length).toBe(2)
    expect(screen.queryByRole('combobox', { name: 'Filtrar por sucursal' })).toBeNull()
  })

  it('muestra la sucursal y el turno abierto de cada caja, y filtra por sucursal', async () => {
    responder(CON_SEDES)
    const user = userEvent.setup()
    montar('/cajas', <Cajas sucursales={SUCURSALES} verMovimientos={false} />)
    await screen.findByText('Caja 1')
    expect(screen.getByText('Sucursal: Salón')).toBeTruthy()
    // La caja vieja de un depósito conserva el nombre aunque el depósito no admita cajas nuevas.
    expect(screen.getByText('Sucursal: Depósito Norte')).toBeTruthy()
    expect(screen.getAllByText('Turno abierto')).toHaveLength(1)
    expect(screen.queryByText('Ver movimientos')).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por sucursal' }), '3')
    expect(screen.queryByText('Caja 1')).toBeNull()
    expect(screen.getByText('Caja Centro')).toBeTruthy()
  })

  it('el alta pide la sucursal (sólo las que admiten cajas) y la manda', async () => {
    responder({ ...CON_SEDES, 'POST /api/cajas': CAJA_CENTRO })
    const user = userEvent.setup()
    montar('/cajas', <Cajas sucursales={SUCURSALES} />)
    await screen.findByText('Caja 1')
    await user.click(screen.getByRole('button', { name: /Nueva caja/ }))
    const dialogo = await screen.findByRole('dialog')
    const selector = within(dialogo).getByRole('combobox', { name: 'Sucursal' })
    expect(Array.from(selector.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['Salón', 'Centro'])
    await user.selectOptions(selector, '3')
    fireEvent.change(within(dialogo).getByLabelText('Nombre'), { target: { value: 'Caja 2' } })
    await user.click(within(dialogo).getByRole('button', { name: /Crear caja/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/cajas'))
    expect(cuerpoDe('POST /api/cajas')).toMatchObject({ nombre: 'Caja 2', sucursal_id: 3 })
    // Al editar no se cambia de sucursal.
    cleanup()
    responder(CON_SEDES)
    montar('/cajas', <Cajas sucursales={SUCURSALES} />)
    await screen.findByText('Caja 1')
    await user.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    expect(within(await screen.findByRole('dialog')).queryByRole('combobox', { name: 'Sucursal' })).toBeNull()
  })

  it('sin sucursales que admitan cajas no se puede crear una', async () => {
    responder(CON_SEDES)
    montar('/cajas', <Cajas sucursales={[{ id: 2, nombre: 'Depósito Norte', admiteCajas: false }]} />)
    await screen.findByText('Caja 1')
    expect(screen.getByRole('button', { name: /Nueva caja/ })).toBeDisabled()
  })

  it('desactivar/activar manda todos los campos (no borra el POS de MercadoPago) y el 409 se muestra', async () => {
    responder({ ...CON_SEDES, 'PUT /api/cajas/11': { status: 409, detail: 'La sucursal necesita al menos una caja activa' } })
    const user = userEvent.setup()
    montar('/cajas', <Cajas sucursales={SUCURSALES} conActivarDesactivar />)
    await screen.findByText('Caja Centro')
    await user.click(screen.getByRole('button', { name: 'Desactivar Caja Centro' }))
    expect(await screen.findByText('La sucursal necesita al menos una caja activa')).toBeTruthy()
    expect(cuerpoDe('PUT /api/cajas/11')).toEqual({
      nombre: 'Caja Centro', descripcion: '', medios_pago: [], punto_venta: 4, mp_pos_id: 'QR1', activo: false,
    })
    // Una inactiva se ofrece para activar.
    responder({ ...CON_SEDES, 'PUT /api/cajas/12': CAJA_VIEJA })
    await user.click(screen.getByRole('button', { name: 'Activar Caja vieja' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/cajas/12'))
    expect(cuerpoDe('PUT /api/cajas/12')).toMatchObject({ activo: true })
  })
})

describe('Turnos con caja', () => {
  const LIBRE: CajaConfig = { ...CAJA_CENTRO, id: 11 }
  const TURNO_CON_CAJA: Turno = {
    ...ABIERTO, id: 5, caja_id: 10, caja: { id: 10, nombre: 'Caja 1', punto_venta: null }, sucursal: { id: 1, nombre: 'Salón' },
  }

  it('sin la prop el turno se abre suelto y no se pide caja', async () => {
    responder({ ...BASE, '/api/turnos': { turnos: [], turno_activo: null }, 'POST /api/turnos/abrir': ABIERTO })
    const user = userEvent.setup()
    montar('/turnos', <Turnos />)
    await screen.findByText('No hay turnos registrados.')
    await user.click(screen.getByRole('button', { name: /Abrir turno/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).queryByRole('combobox', { name: 'Caja' })).toBeNull()
    await user.click(within(dialogo).getByRole('button', { name: /Abrir turno ahora/ }))
    expect(cuerpoDe('POST /api/turnos/abrir')).toEqual({ monto_inicial: 0, notas: '' })
  })

  it('con conCaja ofrece sólo las cajas activas y libres, la predeterminada preseleccionada, y manda caja_id', async () => {
    responder({
      ...BASE, '/api/turnos': { turnos: [], turno_activo: null }, 'POST /api/turnos/abrir': TURNO_CON_CAJA,
      '/api/cajas': [CAJA_SALON, LIBRE, CAJA_VIEJA],
    })
    const user = userEvent.setup()
    montar('/turnos', <Turnos conCaja />)
    await screen.findByText('No hay turnos registrados.')
    await user.click(screen.getByRole('button', { name: /Abrir turno/ }))
    const dialogo = await screen.findByRole('dialog')
    const selector = await within(dialogo).findByRole('combobox', { name: 'Caja' })
    // Caja 1 tiene turno abierto y Caja vieja está inactiva.
    await waitFor(() => expect(Array.from(selector.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['Caja Centro']))
    expect(selector).toHaveValue('11')
    await user.click(within(dialogo).getByRole('button', { name: /Abrir turno ahora/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/turnos/abrir'))
    expect(cuerpoDe('POST /api/turnos/abrir')).toEqual({ monto_inicial: 0, notas: '', caja_id: 11 })
  })

  it('sin una caja libre no deja abrir', async () => {
    responder({ ...BASE, '/api/turnos': { turnos: [], turno_activo: null }, '/api/cajas': [CAJA_SALON] })
    const user = userEvent.setup()
    montar('/turnos', <Turnos conCaja />)
    await screen.findByText('No hay turnos registrados.')
    await user.click(screen.getByRole('button', { name: /Abrir turno/ }))
    const dialogo = await screen.findByRole('dialog')
    await waitFor(() => expect(pedidas()).toContain('GET /api/cajas'))
    expect(within(dialogo).getByRole('button', { name: /Abrir turno ahora/ })).toBeDisabled()
  })

  it('el listado, el detalle y el cierre dicen en qué caja y sucursal es el turno, si lo traen', async () => {
    responder({ ...BASE, '/api/turnos': { turnos: [TURNO_CON_CAJA, CERRADO], turno_activo: null } })
    montar('/turnos', <Turnos esAdmin />)
    expect(await screen.findByText('Todos los turnos')).toBeTruthy()
    expect(screen.getByText('Caja 1')).toBeTruthy()
    cleanup()
    responder({ ...BASE, '/api/turnos': { turnos: [CERRADO], turno_activo: null } })
    montar('/turnos', <Turnos esAdmin />)
    await screen.findByText('Todos los turnos')
    expect(screen.queryByText('Caja')).toBeNull()
    cleanup()
    responder({ ...BASE, '/api/turnos/5': { turno: TURNO_CON_CAJA, resumen: RESUMEN_TURNO } })
    montar('/turnos/5', <TurnoDetalle />)
    expect(await screen.findByText('Caja 1 — Salón')).toBeTruthy()
    cleanup()
    montar('/turnos/5/cerrar', <TurnoCerrar />)
    expect(await screen.findByText('Caja 1 — Salón')).toBeTruthy()
  })
})

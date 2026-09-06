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
const PRINCIPAL: CajaConfig = { id: 1, nombre: 'Caja Principal', descripcion: 'Caja por defecto', medios_pago: ['efectivo'], es_default: 1, activo: 1, punto_venta: null }
const POS2: CajaConfig = { id: 2, nombre: 'POS 2', descripcion: '', medios_pago: [], es_default: 0, activo: 0, punto_venta: 4 }
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
    expect(cuerpoDe('POST /api/cajas')).toEqual({ nombre: 'POS 3', descripcion: 'barra', medios_pago: ['efectivo'], activo: true, punto_venta: 4 })
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
    expect(cuerpoDe('PUT /api/cajas/2')).toEqual({ nombre: 'POS 2', descripcion: '', medios_pago: [], activo: true, punto_venta: null })
    await user.click(screen.getByRole('button', { name: /Predeterminar/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/cajas/2/set-default'))
    const botones = screen.getAllByRole('button')
    await user.click(botones[botones.length - 1])
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/cajas/2'))
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

// Tesorería (P9-M4, 2026-09-07), extraída de Contalibra y Restolibra: las
// cuentas con sus saldos, el alta, la transferencia, y el detalle de una cuenta
// con sus movimientos, la edición y el archivo.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { MovTipoBadge, Tesoreria } from '../src/comercio/Tesoreria'
import { TesoreriaDetalle } from '../src/comercio/TesoreriaDetalle'
import type { CuentaTesoreria, MovimientoTesoreria } from '../src/comercio/tipos'
import {
  cuerpoDe, montar, pedidas, prepararFetch, responder, selectConOpcion,
} from './helpers-pantallas'
import { render } from '@testing-library/react'

const BANCO: CuentaTesoreria = { id: 1, nombre: 'Banco Galicia', tipo: 'banco', banco: 'Galicia', numero: '1234', descripcion: 'Cuenta corriente', saldo_inicial: 1000, saldo: 1500, activa: 1 }
const CAJA_CHICA: CuentaTesoreria = { id: 2, nombre: 'Caja chica', tipo: 'efectivo', banco: '', numero: '', descripcion: '', saldo_inicial: 0, saldo: -50, activa: 1 }
const ARCHIVADA: CuentaTesoreria = { id: 3, nombre: 'Vieja', tipo: 'otro', banco: '', numero: '', descripcion: '', saldo_inicial: 0, saldo: 0, activa: 0 }
const MOV = (extra: Partial<MovimientoTesoreria>): MovimientoTesoreria => ({
  id: 10, fecha: '2026-09-01', cuenta_id: 1, cuenta_nombre: 'Banco Galicia', cuenta_destino_id: null, cuenta_destino_nombre: null,
  tipo: 'ingreso', monto: 500, concepto: 'Cobro', referencia: '', transferencia_id: null, usuario_nombre: 'Cajero', ...extra,
})
const MOVS = [
  MOV({}),
  MOV({ id: 11, tipo: 'egreso', monto: 100, concepto: 'Pago luz', referencia: 'f-1', usuario_nombre: null }),
  MOV({ id: 12, tipo: 'transferencia_salida', monto: 50, concepto: 'A caja', cuenta_destino_id: 2, cuenta_destino_nombre: 'Caja chica', transferencia_id: 3 }),
  MOV({ id: 13, tipo: 'transferencia_entrada', monto: 50, concepto: 'De banco', cuenta_id: 2, cuenta_nombre: 'Caja chica', cuenta_destino_id: 1, cuenta_destino_nombre: 'Banco Galicia', transferencia_id: 3 }),
  MOV({ id: 14, tipo: 'ajuste', monto: 1, concepto: 'Redondeo' }),
]

beforeEach(() => {
  cleanup()
  prepararFetch()
})

describe('MovTipoBadge', () => {
  it('etiqueta los cinco tipos', () => {
    const { container } = render(<>{MOVS.map((m) => <MovTipoBadge key={m.id} m={m} />)}</>)
    expect(container.textContent).toBe('IngresoEgresohacia Caja chicadesde Banco Galiciaajuste')
  })
})

// ── Tesoreria ────────────────────────────────────────────────────────────

describe('Tesoreria', () => {
  const BASE = { '/api/tesoreria': { cuentas: [BANCO, CAJA_CHICA, ARCHIVADA], movimientos: MOVS, resumen: { total: 1450 } } }

  it('muestra las cuentas con su saldo y estado, el total y los últimos movimientos', async () => {
    responder(BASE)
    montar('/tesoreria', <Tesoreria />)
    expect(await screen.findByText('Cuenta corriente')).toBeTruthy()
    expect(screen.getAllByText('Banco Galicia').length).toBeGreaterThan(1)
    expect(screen.getByText('Saldo total').nextElementSibling?.textContent).toMatch(/1\.450,00/)
    expect(screen.getByText(/Banco · Galicia · 1234/)).toBeTruthy()
    expect(screen.getByText('Cuenta corriente')).toBeTruthy()
    expect(screen.getByText('Archivada')).toBeTruthy()
    expect(screen.getByText('Vieja').closest('[class*="opacity-50"]')).not.toBeNull()
    expect(screen.getAllByText('Movimientos')[0].closest('a')?.getAttribute('href')).toBe('/tesoreria/1')
    expect(screen.getByText('Últimos movimientos')).toBeTruthy()
    expect(screen.getByText('hacia Caja chica')).toBeTruthy()
    expect(screen.getByText('Pago luz').closest('tr')?.textContent).toMatch(/−\s?\$\s?100,00/)
  })

  it('crea una cuenta: el tipo efectivo esconde banco y número; y transfiere entre dos', async () => {
    responder({ ...BASE, 'POST /api/tesoreria/cuentas': { id: 4 }, 'POST /api/tesoreria/transferencia': {} })
    const user = userEvent.setup()
    montar('/tesoreria', <Tesoreria />)
    await screen.findByText('Cuenta corriente')
    await user.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
    let dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: 'Crear cuenta' })).toBeDisabled()
    fireEvent.change(within(dialogo).getByPlaceholderText('Ej: Banco Galicia Cta. Cte., Caja chica, MercadoPago…'), { target: { value: 'MercadoPago' } })
    expect(within(dialogo).getByPlaceholderText('Ej: Galicia, BBVA, MP…')).toBeTruthy()
    await user.selectOptions(selectConOpcion('Billetera digital'), 'digital')
    fireEvent.change(within(dialogo).getByPlaceholderText('Ej: Galicia, BBVA, MP…'), { target: { value: 'MP' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('Últimos 4 dígitos o alias'), { target: { value: 'mi.alias' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('0.00'), { target: { value: '250' } })
    await user.selectOptions(selectConOpcion('Efectivo'), 'efectivo')
    expect(within(dialogo).queryByPlaceholderText('Ej: Galicia, BBVA, MP…')).toBeNull()
    fireEvent.change(within(dialogo).getByPlaceholderText('Nota interna sobre esta cuenta'), { target: { value: 'nota' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Crear cuenta' }))
    await waitFor(() => expect(cuerpoDe('POST /api/tesoreria/cuentas')).toEqual({ nombre: 'MercadoPago', tipo: 'efectivo', banco: 'MP', numero: 'mi.alias', descripcion: 'nota', saldo_inicial: 250 }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Transferir' }))
    dialogo = screen.getByRole('dialog')
    const transferir = within(dialogo).getByRole('button', { name: 'Transferir' })
    expect(transferir).toBeDisabled()
    const [origen, destino] = within(dialogo).getAllByRole('combobox') as HTMLSelectElement[]
    expect(within(origen).getByRole('option', { name: /Banco Galicia — \$\s?1\.500,00/ })).toBeTruthy()
    await user.selectOptions(origen, '1')
    await user.selectOptions(destino, '2')
    fireEvent.change(within(dialogo).getByRole('spinbutton'), { target: { value: '300' } })
    fireEvent.change(dialogo.querySelector('input[type="date"]')!, { target: { value: '2026-09-05' } })
    fireEvent.change(within(dialogo).getByDisplayValue('Transferencia entre cuentas'), { target: { value: 'Fondeo' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('N° op., comprobante…'), { target: { value: 'op-3' } })
    await user.click(transferir)
    await waitFor(() => expect(cuerpoDe('POST /api/tesoreria/transferencia')).toMatchObject({ cuenta_origen_id: 1, cuenta_destino_id: 2, monto: 300, fecha: '2026-09-05', concepto: 'Fondeo', referencia: 'op-3' }))
    expect(pedidas().filter((p) => p === 'GET /api/tesoreria')).toHaveLength(3)
  })

  it('sin cuentas ofrece crear la primera y no deja transferir; los errores se muestran', async () => {
    responder({ '/api/tesoreria': { cuentas: [], movimientos: [], resumen: { total: 0 } }, 'POST /api/tesoreria/cuentas': { status: 400, detail: 'Nombre repetido' } })
    const user = userEvent.setup()
    montar('/tesoreria', <Tesoreria />)
    expect(await screen.findByText('No hay cuentas creadas aún.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Transferir' }))
    expect(screen.getByRole('dialog').textContent).toContain('Necesitás al menos dos cuentas para transferir.')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Crear primera cuenta' }))
    fireEvent.change(screen.getByPlaceholderText('Ej: Banco Galicia Cta. Cte., Caja chica, MercadoPago…'), { target: { value: 'X' } })
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText('Nombre repetido')).toBeTruthy()

    cleanup()
    responder({ ...BASE, 'POST /api/tesoreria/transferencia': { status: 400, detail: 'Saldo insuficiente' } })
    montar('/tesoreria', <Tesoreria />)
    await screen.findByText('Cuenta corriente')
    await user.click(screen.getByRole('button', { name: 'Transferir' }))
    const dialogo = screen.getByRole('dialog')
    const [origen, destino] = within(dialogo).getAllByRole('combobox')
    await user.selectOptions(origen, '2')
    await user.selectOptions(destino, '1')
    fireEvent.change(within(dialogo).getByRole('spinbutton'), { target: { value: '9' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Transferir' }))
    expect(await screen.findByText('Saldo insuficiente')).toBeTruthy()

    cleanup()
    responder({ '/api/tesoreria': '!caida' })
    montar('/tesoreria', <Tesoreria />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── TesoreriaDetalle ─────────────────────────────────────────────────────

describe('TesoreriaDetalle', () => {
  const BASE = {
    '/api/tesoreria': { cuentas: [BANCO, CAJA_CHICA, ARCHIVADA] },
    '/api/tesoreria/cuentas/1': { cuenta: BANCO, movimientos: MOVS.filter((m) => m.cuenta_id === 1) },
  }

  it('muestra la cuenta, filtra por fechas, registra y borra movimientos', async () => {
    responder({ ...BASE, 'POST /api/tesoreria/cuentas/1/movimiento': {}, 'DELETE /api/tesoreria/movimientos/11': {} })
    const user = userEvent.setup()
    montar('/tesoreria/1', <TesoreriaDetalle />)
    expect(await screen.findByText('Cobro')).toBeTruthy()
    expect(pedidas()).toContain('GET /api/tesoreria/cuentas/1?desde=&hasta=')
    expect(screen.getByText('Saldo inicial').nextElementSibling?.textContent).toMatch(/1\.000,00/)
    expect(screen.getByText('Saldo actual').nextElementSibling?.textContent).toMatch(/1\.500,00/)
    expect(screen.getByText('Galicia')).toBeTruthy()
    expect(screen.getByText('1234')).toBeTruthy()

    const [desde, hasta] = document.querySelectorAll('input[type="date"]')
    fireEvent.change(desde, { target: { value: '2026-09-01' } })
    fireEvent.change(hasta, { target: { value: '2026-09-30' } })
    await user.click(screen.getByRole('button', { name: 'Filtrar' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/tesoreria/cuentas/1?desde=2026-09-01&hasta=2026-09-30'))
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/tesoreria/cuentas/1?desde=&hasta='))

    await user.click(screen.getByRole('button', { name: 'Movimiento' }))
    const dialogo = screen.getByRole('dialog')
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar' })
    expect(guardar).toBeDisabled()
    await user.click(within(dialogo).getByRole('button', { name: 'Egreso' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Ingreso' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Egreso' }))
    fireEvent.change(within(dialogo).getByRole('spinbutton'), { target: { value: '80' } })
    fireEvent.change(dialogo.querySelector('input[type="date"]')!, { target: { value: '2026-09-06' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('Ej: Cobro cliente, Pago proveedor, Retiro…'), { target: { value: 'Pago agua' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('N° cheque, transferencia, etc.'), { target: { value: 'ch-1' } })
    await user.click(guardar)
    await waitFor(() => expect(cuerpoDe('POST /api/tesoreria/cuentas/1/movimiento')).toMatchObject({ tipo: 'egreso', monto: 80, fecha: '2026-09-06', concepto: 'Pago agua', referencia: 'ch-1' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getAllByLabelText('Eliminar movimiento')[1])
    expect(screen.getByRole('alertdialog').textContent).toContain('¿Eliminar este movimiento?')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(screen.getAllByLabelText('Eliminar movimiento')[1])
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/tesoreria/movimientos/11'))
  })

  it('transfiere a otra cuenta, edita y archiva', async () => {
    responder({ ...BASE, 'POST /api/tesoreria/transferencia': {}, 'PUT /api/tesoreria/cuentas/1': {}, 'DELETE /api/tesoreria/cuentas/1': {} })
    const user = userEvent.setup()
    montar('/tesoreria/1', <TesoreriaDetalle />)
    await screen.findByText('Cobro')
    await user.click(await screen.findByRole('button', { name: 'Transferir' }))
    let dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).toContain('Transferir desde Banco Galicia')
    // Las otras cuentas, sin la propia.
    expect(within(dialogo).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Caja chica'), expect.stringContaining('Vieja')])
    await user.selectOptions(within(dialogo).getByRole('combobox'), '2')
    fireEvent.change(within(dialogo).getByRole('spinbutton'), { target: { value: '25' } })
    fireEvent.change(dialogo.querySelector('input[type="date"]')!, { target: { value: '2026-09-07' } })
    fireEvent.change(within(dialogo).getByDisplayValue('Transferencia entre cuentas'), { target: { value: 'A caja' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('N° op., comprobante…'), { target: { value: 'op-5' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Transferir' }))
    await waitFor(() => expect(cuerpoDe('POST /api/tesoreria/transferencia')).toMatchObject({ cuenta_origen_id: 1, cuenta_destino_id: 2, monto: 25, fecha: '2026-09-07', concepto: 'A caja', referencia: 'op-5' }))

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    dialogo = screen.getByRole('dialog')
    const nombre = within(dialogo).getByPlaceholderText('Ej: Banco Galicia Cta. Cte., Caja chica, MercadoPago…') as HTMLInputElement
    expect(nombre.value).toBe('Banco Galicia')
    fireEvent.change(nombre, { target: { value: 'Galicia CC' } })
    await user.selectOptions(within(dialogo).getByRole('combobox'), 'efectivo')
    expect(within(dialogo).queryByPlaceholderText('Ej: Galicia, BBVA, MP…')).toBeNull()
    await user.selectOptions(within(dialogo).getByRole('combobox'), 'banco')
    fireEvent.change(within(dialogo).getByPlaceholderText('Ej: Galicia, BBVA, MP…'), { target: { value: 'Galicia SA' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('Últimos 4 dígitos o alias'), { target: { value: '5678' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('Nota interna sobre esta cuenta'), { target: { value: 'nota' } })
    fireEvent.change(within(dialogo).getByPlaceholderText('0.00'), { target: { value: '' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(cuerpoDe('PUT /api/tesoreria/cuentas/1')).toEqual({ nombre: 'Galicia CC', tipo: 'banco', banco: 'Galicia SA', numero: '5678', descripcion: 'nota', saldo_inicial: 0 }))

    await user.click(screen.getByRole('button', { name: 'Archivar cuenta' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('Los movimientos se conservan.')
    await user.click(screen.getByRole('button', { name: 'Archivar' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/tesoreria'))
  })

  it('los errores de cada acción se muestran, y la carga caída también', async () => {
    responder({
      ...BASE,
      'POST /api/tesoreria/cuentas/1/movimiento': { status: 400, detail: 'Monto inválido' },
      'DELETE /api/tesoreria/movimientos/10': { status: 409, detail: 'Conciliado' },
      'POST /api/tesoreria/transferencia': { status: 400, detail: 'Sin saldo' },
      'PUT /api/tesoreria/cuentas/1': { status: 400, detail: 'Nombre repetido' },
      'DELETE /api/tesoreria/cuentas/1': { status: 409, detail: 'Tiene saldo' },
    })
    const user = userEvent.setup()
    montar('/tesoreria/1', <TesoreriaDetalle />)
    await screen.findByText('Cobro')
    await user.click(screen.getByRole('button', { name: 'Movimiento' }))
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('spinbutton'), { target: { value: '1' } })
    fireEvent.change(within(screen.getByRole('dialog')).getByPlaceholderText('Ej: Cobro cliente, Pago proveedor, Retiro…'), { target: { value: 'x' } })
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Monto inválido')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getAllByLabelText('Eliminar movimiento')[0])
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Conciliado')).toBeTruthy()
    await user.click(await screen.findByRole('button', { name: 'Transferir' }))
    await user.selectOptions(within(screen.getByRole('dialog')).getByRole('combobox'), '2')
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('spinbutton'), { target: { value: '1' } })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transferir' }))
    expect(await screen.findByText('Sin saldo')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Nombre repetido')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Archivar cuenta' }))
    await user.click(screen.getByRole('button', { name: 'Archivar' }))
    expect(await screen.findByText('Tiene saldo')).toBeTruthy()

    cleanup()
    responder({ '/api/tesoreria': { cuentas: [BANCO] }, '/api/tesoreria/cuentas/1': '!caida' })
    montar('/tesoreria/1', <TesoreriaDetalle />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Transferir' })).toBeNull()
  })
})

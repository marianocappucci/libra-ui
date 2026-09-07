// Proveedores y egresos (P9-M4, 2026-09-07), extraídas de Contalibra y
// Restolibra: el listado y la ficha del proveedor, y los egresos con su alta,
// sus pagos y su baja.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Proveedores } from '../src/comercio/Proveedores'
import { ProveedorDetalle } from '../src/comercio/ProveedorDetalle'
import { Egresos } from '../src/comercio/Egresos'
import { EgresoDetalle } from '../src/comercio/EgresoDetalle'
import { _resetCacheDeMedios } from '../src/comercio/medios-pago'
import type { Egreso, PagoEgreso, Proveedor } from '../src/comercio/tipos'
import { IVA_CONDITIONS } from '../src/facturas'
import {
  cuerpoDe, elegirEnBuscable, montar, pedidas, prepararFetch, responder, selectConOpcion,
} from './comercio-m4.helpers'

const ACME: Proveedor = { id: 1, nombre: 'ACME', cuit_dni: '30-11111111-1', email: 'acme@x.com', phone: '222', address: 'Ruta 8', iva_condition: IVA_CONDITIONS[0] }
const PELADO: Proveedor = { id: 2, nombre: 'Pelado', cuit_dni: '', email: '', phone: '', address: '', iva_condition: '' }
const EGRESO: Egreso = {
  id: 5, fecha: '2026-09-01', proveedor_id: 1, proveedor_nombre: 'ACME', tipo_comprobante: 'factura', numero: '0001-00000042',
  categoria: 'Alquiler', concepto: 'Alquiler local', monto_neto: 1000, iva_pct: 0.21, iva_monto: 210, total: 1210, estado: 'pendiente', observaciones: 'septiembre',
}
const PAGADO: Egreso = { ...EGRESO, id: 6, concepto: 'Internet', categoria: '', proveedor_id: null, proveedor_nombre: '', numero: '', tipo_comprobante: 'ticket', monto_neto: 500, iva_pct: 0, iva_monto: 0, total: 500, estado: 'pagado', observaciones: '' }
const PARCIAL: Egreso = { ...EGRESO, id: 7, concepto: 'Luz', estado: 'parcial', total: 1210 }
const RESUMEN = { total_periodo: 2920, pagado: 500, pendiente: 2420 }
const CATEGORIAS = [{ id: 1, nombre: 'Alquiler' }, { id: 2, nombre: 'Servicios' }]
const MEDIOS = [{ id: 'efectivo', label: 'Efectivo' }, { id: 'transferencia', label: 'Transferencia' }]
const CAJA = { id: 1, nombre: 'Caja principal', descripcion: '', medios_pago: ['efectivo', 'transferencia'], es_default: 1, activo: 1, punto_venta: null }
const CAJA2 = { ...CAJA, id: 2, nombre: 'Caja 2', medios_pago: ['efectivo'], es_default: 0 }
const PAGO: PagoEgreso = { id: 90, egreso_id: 7, fecha: '2026-09-02', monto: 700, caja_id: 1, medio_pago: 'transferencia', referencia: 'op-7' }

beforeEach(() => {
  cleanup()
  _resetCacheDeMedios()
  prepararFetch()
})

// ── Proveedores ──────────────────────────────────────────────────────────

describe('Proveedores', () => {
  it('lista, busca con Enter y limpia, y crea con validación', async () => {
    responder({ '/api/proveedores': [ACME, PELADO], 'POST /api/proveedores': { id: 3 } })
    const user = userEvent.setup()
    montar('/proveedores', <Proveedores />)
    expect(await screen.findByText('ACME')).toBeTruthy()
    expect(screen.getByText('Pelado')).toBeTruthy()
    expect(screen.getAllByLabelText('Ver proveedor')[0].getAttribute('href')).toBe('/proveedores/1')
    expect(screen.getAllByLabelText('Editar proveedor')).toHaveLength(2)

    const buscador = screen.getByPlaceholderText('Buscar por nombre o CUIT…')
    fireEvent.change(buscador, { target: { value: 'ac' } })
    fireEvent.keyDown(buscador, { key: 'Enter' })
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/proveedores?q=ac'))
    // El botón de limpiar aparece con texto en el buscador.
    const barra = buscador.parentElement!
    expect(within(barra).getAllByRole('button')).toHaveLength(2)
    await user.click(within(barra).getAllByRole('button')[1])
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/proveedores'))
    expect((buscador as HTMLInputElement).value).toBe('')
    await user.click(within(barra).getAllByRole('button')[0])
    expect(pedidas().filter((p) => p === 'GET /api/proveedores')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    const dialogo = screen.getByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear proveedor' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('El nombre es obligatorio')
    fireEvent.change(within(dialogo).getByLabelText('Nombre'), { target: { value: 'Nuevo SA' } })
    fireEvent.change(within(dialogo).getByLabelText('CUIT/DNI'), { target: { value: '30-2' } })
    await user.selectOptions(within(dialogo).getByLabelText('Condición de IVA'), IVA_CONDITIONS[0])
    await user.click(within(dialogo).getByRole('button', { name: 'Crear proveedor' }))
    await waitFor(() => expect(cuerpoDe('POST /api/proveedores')).toEqual({ nombre: 'Nuevo SA', cuit_dni: '30-2', email: '', phone: '', address: '', iva_condition: IVA_CONDITIONS[0] }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('el vacío con búsqueda lo dice, y los errores se muestran', async () => {
    responder({ '/api/proveedores': [], 'GET /api/proveedores?q=zzz': [] })
    montar('/proveedores', <Proveedores />)
    expect(await screen.findByText('No hay proveedores registrados aún.')).toBeTruthy()
    const buscador = screen.getByPlaceholderText('Buscar por nombre o CUIT…')
    fireEvent.change(buscador, { target: { value: 'zzz' } })
    fireEvent.keyDown(buscador, { key: 'Enter' })
    expect(await screen.findByText('No se encontraron proveedores para "zzz".')).toBeTruthy()

    cleanup()
    responder({ '/api/proveedores': [], 'POST /api/proveedores': { status: 400, detail: 'CUIT inválido' } })
    const user = userEvent.setup()
    montar('/proveedores', <Proveedores />)
    await screen.findByText('No hay proveedores registrados aún.')
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'X' } })
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }))
    expect(await screen.findByText('CUIT inválido')).toBeTruthy()

    cleanup()
    responder({ '/api/proveedores': '!caida' })
    montar('/proveedores', <Proveedores />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── ProveedorDetalle ─────────────────────────────────────────────────────

describe('ProveedorDetalle', () => {
  it('muestra la ficha y los egresos con su total, edita y elimina con confirmación', async () => {
    let lista = [ACME, PELADO]
    responder({
      '/api/proveedores': () => lista,
      '/api/egresos': { items: [EGRESO, PAGADO] },
      'PUT /api/proveedores/1': () => { lista = [{ ...ACME, nombre: 'ACME SRL' }, PELADO]; return {} },
      'DELETE /api/proveedores/1': {},
    })
    const user = userEvent.setup()
    montar('/proveedores/1', <ProveedorDetalle />)
    expect(await screen.findByText('Datos del proveedor')).toBeTruthy()
    expect(screen.getByText('30-11111111-1')).toBeTruthy()
    expect(screen.getByText('acme@x.com').getAttribute('href')).toBe('mailto:acme@x.com')
    expect(pedidas().some((p) => /GET \/api\/egresos\?proveedor_id=1&desde=2000-01-01&hasta=\d{4}-\d{2}-\d{2}$/.test(p))).toBe(true)
    expect(await screen.findByText('Alquiler local')).toBeTruthy()
    expect(screen.getByText('Pendiente')).toBeTruthy()
    expect(screen.getByText('Pagado')).toBeTruthy()
    expect(screen.getByText('Total:').textContent).toMatch(/1\.710,00/)

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const dialogo = screen.getByRole('dialog')
    expect((within(dialogo).getByLabelText('Nombre') as HTMLInputElement).value).toBe('ACME')
    fireEvent.change(within(dialogo).getByLabelText('Nombre'), { target: { value: 'ACME SRL' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(cuerpoDe('PUT /api/proveedores/1')).toMatchObject({ nombre: 'ACME SRL', cuit_dni: '30-11111111-1' }))
    expect(await screen.findByRole('heading', { name: /ACME SRL/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Eliminar proveedor' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('Solo es posible si no tiene egresos asociados.')
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/proveedores'))
  })

  it('sin datos ni egresos lo dice; el que no existe, la baja rechazada y la caída avisan', async () => {
    responder({ '/api/proveedores': [ACME, PELADO], '/api/egresos': { items: [] }, 'DELETE /api/proveedores/2': { status: 409, detail: 'Tiene egresos' }, 'PUT /api/proveedores/2': { status: 400, detail: 'Nombre repetido' } })
    const user = userEvent.setup()
    montar('/proveedores/2', <ProveedorDetalle />)
    expect(await screen.findByText('Sin datos adicionales cargados.')).toBeTruthy()
    expect(await screen.findByText('No hay egresos registrados para este proveedor.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Eliminar proveedor' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Tiene egresos')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Nombre repetido')).toBeTruthy()

    cleanup()
    responder({ '/api/proveedores': [ACME], '/api/egresos': { items: [] } })
    montar('/proveedores/9', <ProveedorDetalle />)
    expect(await screen.findByText('Proveedor no encontrado')).toBeTruthy()

    cleanup()
    responder({ '/api/proveedores': [ACME], '/api/egresos': '!caida' })
    montar('/proveedores/1', <ProveedorDetalle />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── Egresos ──────────────────────────────────────────────────────────────

describe('Egresos', () => {
  const BASE = {
    '/api/egresos/categorias': CATEGORIAS,
    '/api/proveedores': [ACME, PELADO],
    '/api/egresos': { items: [EGRESO, PAGADO, PARCIAL], resumen: RESUMEN },
  }

  it('lista con el resumen del período, y filtra por categoría y estado', async () => {
    responder(BASE)
    const user = userEvent.setup()
    montar('/egresos', <Egresos />)
    expect(await screen.findByText('Alquiler local')).toBeTruthy()
    expect(screen.getByText('Total del período').nextElementSibling?.textContent).toMatch(/2\.920,00/)
    expect(screen.getByText('Pendiente / Parcial').nextElementSibling?.textContent).toMatch(/2\.420,00/)
    expect(screen.getAllByText('0001-00000042')).toHaveLength(2)
    expect(screen.getByText('Luz').closest('tr')?.textContent).toContain('Parcial')
    expect(screen.getAllByLabelText('Ver egreso')[0].getAttribute('href')).toBe('/egresos/5')
    expect(pedidas().some((p) => /GET \/api\/egresos\?desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-\d{2}$/.test(p))).toBe(true)

    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Filtrar por categoría' }), 'Servicios')
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/categoria=Servicios$/))
    await user.selectOptions(selectConOpcion('Todos los estados'), 'parcial')
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/categoria=Servicios&estado=parcial$/))
    const [desde, hasta] = document.querySelectorAll('input[type="date"]')
    fireEvent.change(desde, { target: { value: '2026-01-01' } })
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/desde=2026-01-01/))
    fireEvent.change(hasta, { target: { value: '2026-01-31' } })
    await waitFor(() => expect(pedidas().at(-1)).toMatch(/desde=2026-01-01&hasta=2026-01-31/))
    await user.click(screen.getByTitle('Filtrar'))
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => expect(pedidas().at(-1)).not.toMatch(/categoria|estado/))
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
  })

  it('el alta: calcula el IVA y el total, valida el concepto y guarda', async () => {
    responder({ ...BASE, 'POST /api/egresos': { id: 8 } })
    const user = userEvent.setup()
    montar('/egresos', <Egresos />)
    await screen.findByText('Alquiler local')
    await user.click(screen.getByRole('button', { name: 'Nuevo egreso' }))
    const dialogo = screen.getByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar egreso' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('El concepto es obligatorio')

    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Proveedor' }), /^Pelado/)
    await user.selectOptions(within(dialogo).getByLabelText('Comprobante'), 'factura')
    fireEvent.change(within(dialogo).getByLabelText('Número'), { target: { value: '0001-00000099' } })
    fireEvent.change(within(dialogo).getByLabelText('Concepto'), { target: { value: 'Alquiler octubre' } })
    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Categoría' }), 'Alquiler')
    fireEvent.change(within(dialogo).getByLabelText('Fecha'), { target: { value: '2026-10-01' } })
    fireEvent.change(within(dialogo).getByLabelText('Monto neto'), { target: { value: '1000' } })
    await user.selectOptions(within(dialogo).getByLabelText('IVA'), '0.21')
    expect(dialogo.textContent).toMatch(/Total\$\s?1\.210,00/)
    fireEvent.change(within(dialogo).getByLabelText('Observaciones'), { target: { value: 'ok' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar egreso' }))
    await waitFor(() => expect(cuerpoDe('POST /api/egresos')).toEqual({
      fecha: '2026-10-01', proveedor_id: 2, concepto: 'Alquiler octubre', categoria: 'Alquiler', tipo_comprobante: 'factura',
      numero: '0001-00000099', monto_neto: 1000, iva_pct: 0.21, observaciones: 'ok',
    }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Sin proveedor ni categoría: van vacíos, y el error de la API se muestra.
    responder({ ...BASE, 'POST /api/egresos': { status: 400, detail: 'Fecha fuera del período' } })
    await user.click(screen.getByRole('button', { name: 'Nuevo egreso' }))
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Varios' } })
    await user.click(screen.getByRole('button', { name: 'Guardar egreso' }))
    expect(await screen.findByText('Fecha fuera del período')).toBeTruthy()
    expect(cuerpoDe('POST /api/egresos', pedidas().length - 1)).toMatchObject({ proveedor_id: null, categoria: '', numero: '', observaciones: '' })
  })

  it('el vacío y la caída', async () => {
    responder({ ...BASE, '/api/egresos': { items: [], resumen: RESUMEN } })
    montar('/egresos', <Egresos />)
    expect(await screen.findByText('Sin egresos en el período.')).toBeTruthy()
    cleanup()
    responder({ ...BASE, '/api/egresos': '!caida' })
    montar('/egresos', <Egresos />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── EgresoDetalle ────────────────────────────────────────────────────────

describe('EgresoDetalle', () => {
  const BASE = {
    '/api/cajas/medios-disponibles': MEDIOS,
    '/api/egresos/cajas': [CAJA, CAJA2],
    '/api/egresos': { items: [EGRESO, PAGADO, PARCIAL] },
    '/api/egresos/5/pagos': [],
    '/api/egresos/6/pagos': [{ ...PAGO, egreso_id: 6, monto: 500 }],
    '/api/egresos/7/pagos': [PAGO],
  }

  it('el pendiente muestra los datos, los montos y registra un pago desde la caja default', async () => {
    responder({ ...BASE, 'POST /api/egresos/5/pagar': {} })
    const user = userEvent.setup()
    montar('/egresos/5', <EgresoDetalle />)
    expect(await screen.findByText('Pendiente de pago')).toBeTruthy()
    expect(pedidas()).toContain('GET /api/egresos?desde=2000-01-01&hasta=2999-12-31')
    expect(screen.getByText('septiembre')).toBeTruthy()
    expect(screen.getByText('Factura', { exact: false }).textContent).toContain('0001-00000042')
    expect(screen.getByText('IVA (21%):').parentElement?.textContent).toMatch(/210,00/)
    expect(screen.queryByText('Pagos registrados')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    const dialogo = screen.getByRole('dialog')
    expect((within(dialogo).getByLabelText('Monto') as HTMLInputElement).value).toBe('1210')
    expect((within(dialogo).getByLabelText('Caja') as HTMLSelectElement).value).toBe('1')
    // Los medios son los de la caja elegida; al cambiar de caja se acotan.
    expect(within(dialogo).getAllByRole('option').map((o) => o.textContent)).toContain('Transferencia')
    await user.selectOptions(within(dialogo).getByLabelText('Caja'), '2')
    expect(within(dialogo).getAllByRole('option').map((o) => o.textContent)).not.toContain('Transferencia')
    await user.selectOptions(within(dialogo).getByLabelText('Caja'), '1')
    await user.selectOptions(within(dialogo).getByLabelText('Medio de pago'), 'transferencia')
    fireEvent.change(within(dialogo).getByLabelText('Monto'), { target: { value: '700' } })
    fireEvent.change(within(dialogo).getByLabelText('Referencia'), { target: { value: 'op-7' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar pago' }))
    await waitFor(() => expect(cuerpoDe('POST /api/egresos/5/pagar')).toMatchObject({ monto: 700, medio_pago: 'transferencia', caja_id: 1, referencia: 'op-7' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('el parcial lista los pagos y sugiere lo que falta; el pagado no ofrece pagar; la baja navega', async () => {
    responder({ ...BASE, 'DELETE /api/egresos/7': {} })
    const user = userEvent.setup()
    montar('/egresos/7', <EgresoDetalle />)
    expect(await screen.findByText('Pago parcial')).toBeTruthy()
    expect(await screen.findByText('Pagos registrados')).toBeTruthy()
    expect(await screen.findByText('Transferencia')).toBeTruthy()
    expect(screen.getByText('(op-7)')).toBeTruthy()
    expect(screen.getByText('Pendiente:').parentElement?.textContent).toMatch(/510,00/)
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect((screen.getByLabelText('Monto') as HTMLInputElement).value).toBe('510')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('¿Eliminar este egreso?')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/egresos'))

    cleanup()
    responder({ ...BASE, 'DELETE /api/egresos/6': { status: 409, detail: 'Tiene pagos' }, 'POST /api/egresos/6/pagar': { status: 400, detail: 'Ya pagado' } })
    montar('/egresos/6', <EgresoDetalle />)
    expect(await screen.findByText('Pagado completo')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).toBeNull()
    // Un ticket sin neto discriminado no muestra el desglose.
    expect(screen.queryByText(/IVA \(/)).toBeNull()
    expect(screen.getByText('Ticket / Recibo')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Tiene pagos')).toBeTruthy()
  })

  it('el pago rechazado avisa; el egreso inexistente, los pagos caídos y la red caída también', async () => {
    responder({ ...BASE, 'POST /api/egresos/5/pagar': { status: 400, detail: 'Caja cerrada' } })
    const user = userEvent.setup()
    montar('/egresos/5', <EgresoDetalle />)
    await screen.findByText('Pendiente de pago')
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }))
    expect(await screen.findByText('Caja cerrada')).toBeTruthy()

    cleanup()
    responder({ ...BASE, '/api/egresos/9/pagos': '!caida' })
    montar('/egresos/9', <EgresoDetalle />)
    expect(await screen.findByText('No se encontró el egreso.')).toBeTruthy()

    cleanup()
    responder({ ...BASE, '/api/egresos': '!caida' })
    montar('/egresos/5', <EgresoDetalle />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

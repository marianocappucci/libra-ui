// Clientes y cuenta corriente (P9-M4, 2026-09-07), extraídas de Contalibra y
// Restolibra: el listado con alta y baja, la ficha con alias, lista de precio y
// comprobantes, y la cuenta corriente con el pago a cuenta y el recibo.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Clientes } from '../src/comercio/Clientes'
import { ClienteDetalle } from '../src/comercio/ClienteDetalle'
import { CuentaCorriente } from '../src/comercio/CuentaCorriente'
import { CuentaCorrienteDetalle } from '../src/comercio/CuentaCorrienteDetalle'
import { _resetCacheDeMedios } from '../src/comercio/medios-pago'
import type { ClienteConAlias, MovimientoCC } from '../src/comercio/tipos'
import { IVA_CONDITIONS } from '../src/facturas'
import type { Cliente } from '../src/mp'
import {
  cuerpoDe, montar, pedidas, prepararFetch, responder, selectConOpcion, ventanaFalsa,
} from './helpers-pantallas'

const ANA: Cliente = { id: 1, name: 'Ana', address: 'Calle 1', cuit_dni: '20-12345678-9', email: 'ana@x.com', phone: '111', iva_condition: IVA_CONDITIONS[0], auto_facturar: 0, activo: 1 }
const BETO: Cliente = { ...ANA, id: 2, name: 'Beto', cuit_dni: '', email: '', phone: '', address: '', iva_condition: '', activo: 0 }
const FICHA: ClienteConAlias = {
  ...ANA,
  alias_facturacion: [{ id: 30, tipo: 'cuit', valor: '27-11111111-1', cliente_id: 1 }],
  facturas: [
    { id: 55, tipo: 6, punto_venta: 5, numero: 11, fecha: '2026-09-01', cliente_cuit: '', cliente_razon: 'Ana', items: [], subtotal: 100, iva_amount: 21, total: 121, concepto: 1, cae: '123', cae_vto: '', observaciones: '', condicion_venta: '' },
    { id: 56, tipo: 99, punto_venta: 5, numero: 12, fecha: '2026-09-02', cliente_cuit: '', cliente_razon: 'Ana', items: [], subtotal: 100, iva_amount: 0, total: 79, concepto: 1, cae: 'PENDIENTE', cae_vto: '', observaciones: '', condicion_venta: '' },
  ],
  presupuestos: [
    { id: 8, number: 'P-0008', date: '2026-08-30', valid_until: '2026-09-30', status: 'aceptado', total: 500 },
    { id: 9, number: 'P-0009', date: '2026-08-31', status: 'borrador', total: 50 },
  ],
  remitos: [{ id: 4, number: 'R-0004', date: '2026-08-29', total: 300 }],
}
const MEDIOS = [{ id: 'efectivo', label: 'Efectivo' }, { id: 'transferencia', label: 'Transferencia' }]
const CAJA = { id: 1, nombre: 'Caja principal', descripcion: '', medios_pago: ['efectivo', 'transferencia'], es_default: 1, activo: 1, punto_venta: null }
const MOVS: MovimientoCC[] = [
  { fecha: '2026-09-01', tipo: 'debito', concepto: 'Venta V-00003', monto: 1000, referencia: '', medio: '', cc_pago_id: null, usuario_nombre: 'Cajero', venta_id: 3, factura_id: null },
  { fecha: '2026-09-02', tipo: 'debito', concepto: 'Factura B 0005-00000011', monto: 121, referencia: '', medio: '', cc_pago_id: null, usuario_nombre: null, venta_id: null, factura_id: 55 },
  { fecha: '2026-09-03', tipo: 'credito', concepto: 'Pago a cuenta', monto: 400, referencia: 'op-1', medio: 'transferencia', cc_pago_id: 9, usuario_nombre: 'Cajero', venta_id: null, factura_id: null },
]

beforeEach(() => {
  cleanup()
  _resetCacheDeMedios()
  prepararFetch()
})

// ── Clientes ─────────────────────────────────────────────────────────────

describe('Clientes', () => {
  it('lista con el inactivo marcado, busca, y da de baja y reactiva con confirmación', async () => {
    responder({ '/api/clientes': [ANA, BETO], 'POST /api/clientes/1/desactivar': {}, 'POST /api/clientes/2/activar': {} })
    const user = userEvent.setup()
    montar('/clientes', <Clientes />)
    expect(await screen.findByText('Ana')).toBeTruthy()
    expect(screen.getByText('Inactivo')).toBeTruthy()
    expect(screen.getByText('Beto').closest('tr')?.className).toContain('opacity-50')
    expect(screen.getByLabelText('Ver ficha', { selector: 'a[href="/clientes/1"]' })).toBeTruthy()
    // El activo se edita y se elimina; el inactivo sólo se reactiva.
    expect(screen.getAllByLabelText('Editar cliente')).toHaveLength(1)
    expect(screen.getAllByLabelText('Eliminar cliente')).toHaveLength(1)
    expect(screen.getAllByLabelText('Reactivar cliente')).toHaveLength(1)

    await user.click(screen.getByLabelText('Eliminar cliente'))
    expect(screen.getByRole('alertdialog').textContent).toContain('¿Eliminar a Ana?')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(screen.getByLabelText('Eliminar cliente'))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/clientes/1/desactivar'))
    await user.click(screen.getByLabelText('Reactivar cliente'))
    await waitFor(() => expect(pedidas()).toContain('POST /api/clientes/2/activar'))

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'bet' } })
    await waitFor(() => expect(screen.queryByText('Ana')).toBeNull())
    expect(screen.getByText('Beto')).toBeTruthy()
  })

  it('el alta: valida el nombre, consulta el CUIT en ARCA y crea', async () => {
    responder({
      '/api/clientes': [ANA],
      'POST /api/clientes': { id: 3 },
      'GET /api/consultar-cuit/20123456789': { nombre: 'ACME SA', domicilio: 'Ruta 8', iva_condition: IVA_CONDITIONS[0], estado: 'ACTIVO' },
      'GET /api/consultar-cuit/20999999999': { error: 'CUIT inexistente' },
      'GET /api/consultar-cuit/20111111111': '!caida',
    })
    const user = userEvent.setup()
    montar('/clientes', <Clientes />)
    await screen.findByText('Ana')
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    const dialogo = screen.getByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear cliente' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('El nombre es obligatorio')

    // Un CUIT corto no consulta; uno válido completa el formulario.
    await user.click(within(dialogo).getByTitle('Consultar datos en ARCA'))
    expect(dialogo.textContent).toContain('Ingresá un CUIT de 11 dígitos antes de consultar.')
    fireEvent.change(within(dialogo).getByLabelText('CUIT/DNI'), { target: { value: '20-12345678-9' } })
    await user.click(within(dialogo).getByTitle('Consultar datos en ARCA'))
    await waitFor(() => expect(dialogo.textContent).toContain('Datos importados desde ARCA — Estado: ACTIVO.'))
    expect((within(dialogo).getByLabelText('Nombre') as HTMLInputElement).value).toBe('ACME SA')
    expect((within(dialogo).getByLabelText('Dirección') as HTMLInputElement).value).toBe('Ruta 8')
    // Lo que ARCA no conoce, y la caída.
    fireEvent.change(within(dialogo).getByLabelText('CUIT/DNI'), { target: { value: '20999999999' } })
    await user.click(within(dialogo).getByTitle('Consultar datos en ARCA'))
    await waitFor(() => expect(dialogo.textContent).toContain('CUIT inexistente'))
    fireEvent.change(within(dialogo).getByLabelText('CUIT/DNI'), { target: { value: '20111111111' } })
    await user.click(within(dialogo).getByTitle('Consultar datos en ARCA'))
    await waitFor(() => expect(dialogo.textContent).toContain('No se pudo conectar con ARCA.'))

    fireEvent.change(within(dialogo).getByLabelText('Email'), { target: { value: 'acme@x.com' } })
    await user.selectOptions(within(dialogo).getByLabelText('Condición de IVA'), IVA_CONDITIONS[1])
    await user.click(within(dialogo).getByRole('button', { name: 'Crear cliente' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/clientes'))
    expect(cuerpoDe('POST /api/clientes')).toMatchObject({ name: 'ACME SA', cuit_dni: '20111111111', email: 'acme@x.com', iva_condition: IVA_CONDITIONS[1], auto_facturar: false })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('muestra el detalle del error de la API al crear, y el de conexión al cargar', async () => {
    responder({ '/api/clientes': [ANA], 'POST /api/clientes': { status: 400, detail: 'Ya existe' } })
    const user = userEvent.setup()
    montar('/clientes', <Clientes />)
    await screen.findByText('Ana')
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otra' } })
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect(await screen.findByText('Ya existe')).toBeTruthy()

    cleanup()
    responder({ '/api/clientes': '!caida' })
    montar('/clientes', <Clientes />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

// ── ClienteDetalle ───────────────────────────────────────────────────────

describe('ClienteDetalle', () => {
  it('muestra la ficha, el resumen y las tres tablas de comprobantes', async () => {
    responder({ '/api/clientes/1': FICHA })
    montar('/clientes/1', <ClienteDetalle />)
    expect(await screen.findByText('Datos del cliente')).toBeTruthy()
    expect(screen.getByText('20-12345678-9')).toBeTruthy()
    expect(screen.getByText('Total facturado').nextElementSibling?.textContent).toMatch(/200,00/)
    // Facturas: tipo, número armado, CAE.
    expect(screen.getByText('Factura B')).toBeTruthy()
    expect(screen.getByText('Cbte.')).toBeTruthy()
    expect(screen.getByText('0005-00000011')).toBeTruthy()
    expect(screen.getByText('Autorizada')).toBeTruthy()
    expect(screen.getAllByText('Pendiente')).toHaveLength(1)
    // Presupuestos con su estado y remitos.
    expect(screen.getByText('Aceptado')).toBeTruthy()
    expect(screen.getByText('borrador')).toBeTruthy()
    expect(screen.getByText('R-0004')).toBeTruthy()
    expect(document.querySelector('a[href="/presupuestos/8"]')).not.toBeNull()
    expect(document.querySelector('a[href="/remitos/4"]')).not.toBeNull()
    // Sin lista de precio no se pide nada del mayorista.
    expect(pedidas().some((p) => p.includes('lista-precio'))).toBe(false)
    expect(screen.queryByText('Lista de precios (mayorista)')).toBeNull()
  })

  it('los alias: agrega, quita con confirmación, y muestra el error', async () => {
    let alias = FICHA.alias_facturacion
    responder({
      '/api/clientes/1': () => ({ ...FICHA, alias_facturacion: alias }),
      'POST /api/clientes/1/alias-facturacion': () => { alias = [...alias, { id: 31, tipo: 'email', valor: 'otro@x.com', cliente_id: 1 }]; return alias },
      'DELETE /api/clientes/1/alias-facturacion/30': () => { alias = alias.filter((a) => a.id !== 30); return alias },
    })
    const user = userEvent.setup()
    montar('/clientes/1', <ClienteDetalle />)
    expect(await screen.findByText('27-11111111-1')).toBeTruthy()
    const agregar = screen.getByRole('button', { name: 'Agregar alias' })
    expect(agregar).toBeDisabled()
    await user.selectOptions(selectConOpcion('Email'), 'email')
    fireEvent.change(screen.getByPlaceholderText('20-12345678-9 o correo@ejemplo.com'), { target: { value: 'otro@x.com' } })
    await user.click(agregar)
    expect(await screen.findByText('otro@x.com')).toBeTruthy()
    expect(cuerpoDe('POST /api/clientes/1/alias-facturacion')).toEqual({ tipo: 'email', valor: 'otro@x.com' })
    // Quitar el primero: primero arrepentirse, después confirmar.
    const fila = screen.getByText('27-11111111-1').closest('li')!
    await user.click(within(fila).getByRole('button'))
    expect(screen.getByRole('alertdialog').textContent).toContain('¿Quitar este alias de facturación?')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(within(fila).getByRole('button'))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.queryByText('27-11111111-1')).toBeNull())
    // Los errores al agregar, al quitar, al reactivar y al cambiar la auto-factura se muestran.
    responder({
      '/api/clientes/1': { ...FICHA, activo: 0 },
      'POST /api/clientes/1/alias-facturacion': { status: 409, detail: 'Alias repetido' },
      'DELETE /api/clientes/1/alias-facturacion/31': { status: 409, detail: 'Alias en uso' },
      'POST /api/clientes/1/activar': { status: 400, detail: 'No se puede activar' },
      'POST /api/clientes/1/toggle-auto-facturar': { status: 400, detail: 'Sin CUIT' },
    })
    fireEvent.change(screen.getByPlaceholderText('20-12345678-9 o correo@ejemplo.com'), { target: { value: 'x' } })
    await user.click(screen.getByRole('button', { name: 'Agregar alias' }))
    expect(await screen.findByText('Alias repetido')).toBeTruthy()
    await user.click(within(screen.getByText('otro@x.com').closest('li')!).getByRole('button'))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Alias en uso')).toBeTruthy()
    await user.click(screen.getByRole('switch'))
    expect(await screen.findByText('Sin CUIT')).toBeTruthy()
    cleanup()
    montar('/clientes/1', <ClienteDetalle />)
    await user.click(await screen.findByRole('button', { name: 'Reactivar cliente' }))
    expect(await screen.findByText('No se puede activar')).toBeTruthy()
  })

  it('auto-factura, edición inline y la baja desde la ficha', async () => {
    let ficha = FICHA
    responder({
      '/api/clientes/1': () => ficha,
      'POST /api/clientes/1/toggle-auto-facturar': () => { ficha = { ...ficha, auto_facturar: 1 }; return {} },
      'PUT /api/clientes/1': () => { ficha = { ...ficha, name: 'Ana Editada' }; return {} },
      'POST /api/clientes/1/desactivar': {},
    })
    const user = userEvent.setup()
    montar('/clientes/1', <ClienteDetalle />)
    await screen.findByText('Datos del cliente')
    expect(screen.getByText('Inactiva')).toBeTruthy()
    await user.click(screen.getByRole('switch'))
    expect(await screen.findByText('Activa')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const dialogo = screen.getByRole('dialog')
    expect((within(dialogo).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Ana')
    fireEvent.change(within(dialogo).getByLabelText('Nombre'), { target: { value: 'Ana Editada' } })
    // El CUIT precargado es válido: la consulta sale, y acá nadie contesta.
    await user.click(within(dialogo).getByTitle('Consultar datos en ARCA'))
    await waitFor(() => expect(dialogo.textContent).toContain('Error al consultar ARCA.'))
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(cuerpoDe('PUT /api/clientes/1')).toMatchObject({ name: 'Ana Editada', auto_facturar: true }))
    expect(await screen.findByRole('heading', { name: /Ana Editada/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Eliminar cliente' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('¿Eliminar a Ana Editada?')
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/clientes'))
    expect(pedidas()).toContain('POST /api/clientes/1/desactivar')
  })

  it('el inactivo se reactiva; sin comprobantes ofrece crear; y un id que no existe vuelve al listado', async () => {
    let activo = 0
    responder({
      '/api/clientes/2': () => ({ ...FICHA, ...BETO, activo, alias_facturacion: [], facturas: [], presupuestos: [], remitos: [] }),
      'POST /api/clientes/2/activar': () => { activo = 1; return {} },
    })
    const user = userEvent.setup()
    montar('/clientes/2', <ClienteDetalle />)
    expect(await screen.findByText('Este cliente no tiene comprobantes asociados todavía.')).toBeTruthy()
    expect(screen.getByText('Todavía no hay alias configurados para este cliente.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reactivar cliente' }))
    expect(await screen.findByRole('button', { name: 'Editar' })).toBeTruthy()

    cleanup()
    responder({ '/api/clientes/7': { status: 404, detail: 'Cliente no encontrado' } })
    montar('/clientes/7', <ClienteDetalle />)
    expect(await screen.findByText('Cliente no encontrado')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Volver al listado' }))
    expect(screen.getByTestId('ubicacion').textContent).toBe('/clientes')

    cleanup()
    responder({ '/api/clientes/7': '!caida' })
    montar('/clientes/7', <ClienteDetalle />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })

  it('con `conListaDePrecio` muestra y guarda la lista del add-on mayorista', async () => {
    responder({
      '/api/clientes/1': FICHA,
      '/api/listas-precio': [{ id: 1, nombre: 'Mayorista' }, { id: 2, nombre: 'Distribuidor' }],
      '/api/clientes/1/lista-precio': { lista_id: 2 },
      'PUT /api/clientes/1/lista-precio': {},
    })
    const user = userEvent.setup()
    montar('/clientes/1', <ClienteDetalle conListaDePrecio />)
    expect(await screen.findByText('Lista de precios (mayorista)')).toBeTruthy()
    const select = selectConOpcion('Distribuidor')
    await waitFor(() => expect(select.value).toBe('2'))
    await user.selectOptions(select, '1')
    await waitFor(() => expect(cuerpoDe('PUT /api/clientes/1/lista-precio')).toEqual({ lista_id: 1 }))
    await user.selectOptions(select, '__base__')
    await waitFor(() => expect(cuerpoDe('PUT /api/clientes/1/lista-precio', pedidas().length - 1)).toEqual({ lista_id: null }))
    // Y el error al guardar.
    responder({ '/api/clientes/1': FICHA, 'PUT /api/clientes/1/lista-precio': { status: 400, detail: 'Lista inválida' } })
    await user.selectOptions(select, '1')
    expect(await screen.findByText('Lista inválida')).toBeTruthy()
  })
})

// ── CuentaCorriente ──────────────────────────────────────────────────────

describe('CuentaCorriente', () => {
  it('lista los saldos con su tono y el total de deuda', async () => {
    responder({ '/api/cuenta-corriente': { clientes: [
      { id: 1, name: 'Ana', cuit_dni: '20-1', saldo: 1500 }, { id: 2, name: 'Beto', cuit_dni: '', saldo: -200 }, { id: 3, name: 'Ceci', cuit_dni: '', saldo: 0 },
    ], total_deuda: 1500 } })
    montar('/cuenta-corriente', <CuentaCorriente />)
    expect(await screen.findByText('Ana')).toBeTruthy()
    expect(screen.getByText('Total deuda pendiente').nextElementSibling?.textContent).toMatch(/1\.500,00/)
    expect(screen.getByText('3 clientes')).toBeTruthy()
    expect(screen.getByText(/A favor/).textContent).toMatch(/200,00/)
    expect(screen.getAllByLabelText('Ver cuenta corriente')[1].getAttribute('href')).toBe('/cuenta-corriente/2')

    cleanup()
    responder({ '/api/cuenta-corriente': { status: 500, detail: 'Base caída' } })
    montar('/cuenta-corriente', <CuentaCorriente />)
    expect(await screen.findByText('Base caída')).toBeTruthy()
  })
})

// ── CuentaCorrienteDetalle ───────────────────────────────────────────────

describe('CuentaCorrienteDetalle', () => {
  const BASE = {
    '/api/cajas/medios-disponibles': MEDIOS,
    '/api/cuenta-corriente/cajas': [CAJA],
    '/api/cuenta-corriente/1': { cliente: ANA, movimientos: MOVS, saldo: 721 },
  }

  it('muestra el saldo, los totales y los movimientos con sus links; sin props no hay acciones', async () => {
    responder(BASE)
    montar('/cuenta-corriente/1', <CuentaCorrienteDetalle />)
    expect(await screen.findByText('Historial de movimientos')).toBeTruthy()
    expect(screen.getByText(/^Debe/).textContent).toMatch(/721,00/)
    expect(screen.getByText('Total cargado').nextElementSibling?.textContent).toMatch(/1\.121,00/)
    expect(screen.getByText('Total abonado').nextElementSibling?.textContent).toMatch(/400,00/)
    expect(screen.getByText('Venta V-00003').closest('a')?.getAttribute('href')).toBe('/ventas/3')
    expect(screen.getByText('Factura B 0005-00000011').closest('a')?.getAttribute('href')).toBe('/facturas/55')
    expect(screen.getAllByText('Cargo')).toHaveLength(2)
    expect(screen.getByText('Abono')).toBeTruthy()
    // La etiqueta del medio llega con el hook, después de la primera pintura.
    expect(await screen.findByText('Transferencia')).toBeTruthy()
    expect(screen.queryByLabelText('Ver recibo')).toBeNull()
    expect(screen.queryByLabelText('Eliminar pago')).toBeNull()
    expect(screen.getByText('Ficha cliente').closest('a')?.getAttribute('href')).toBe('/clientes/1')
  })

  it('el pago a cuenta: monto sugerido, caja default y sin recibo no abre ventana', async () => {
    const abrir = vi.fn()
    vi.stubGlobal('open', abrir)
    responder({ ...BASE, 'POST /api/cuenta-corriente/1/pagar': { movimientos: MOVS, saldo: 0, recibo_id: null } })
    const user = userEvent.setup()
    montar('/cuenta-corriente/1', <CuentaCorrienteDetalle />)
    await screen.findByText('Historial de movimientos')
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).toContain('Saldo pendiente:')
    expect((within(dialogo).getByRole('spinbutton') as HTMLInputElement).value).toBe('721')
    await user.selectOptions(selectConOpcion('Transferencia'), 'transferencia')
    fireEvent.change(within(dialogo).getByPlaceholderText('N° transferencia, cheque…'), { target: { value: 'op-9' } })
    fireEvent.change(within(dialogo).getByDisplayValue('Pago a cuenta'), { target: { value: 'Adelanto' } })
    fireEvent.change(dialogo.querySelector('input[type="date"]')!, { target: { value: '2026-09-04' } })
    // La caja se puede no registrar.
    await user.selectOptions(selectConOpcion('— No registrar en caja —'), 'ninguna')
    await user.selectOptions(selectConOpcion('— No registrar en caja —'), '1')
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(cuerpoDe('POST /api/cuenta-corriente/1/pagar')).toMatchObject({ monto: 721, fecha: '2026-09-04', concepto: 'Adelanto', referencia: 'op-9', medio_pago: 'transferencia', caja_id: 1 }))
    expect(abrir).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Saldo $0')).toBeTruthy()
  })

  it('con recibos abre el PDF al pagar y por movimiento; el error cierra la ventana', async () => {
    const ventana = ventanaFalsa()
    responder({
      ...BASE,
      'POST /api/cuenta-corriente/1/pagar': { movimientos: MOVS, saldo: -100, recibo_id: 77 },
      'POST /api/recibos/cobranza/9': { id: 78 },
    })
    const user = userEvent.setup()
    montar('/cuenta-corriente/1', <CuentaCorrienteDetalle conRecibos />)
    await screen.findByText('Historial de movimientos')
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(ventana.location.href).toBe('/api/recibos/77/pdf'))
    expect(screen.getByText(/A favor/).textContent).toMatch(/100,00/)
    await user.click(screen.getByLabelText('Ver recibo'))
    await waitFor(() => expect(ventana.location.href).toBe('/api/recibos/78/pdf'))
    expect(screen.queryByLabelText('Eliminar pago')).toBeNull()

    // Sin id de recibo se cierra la ventana; con error también, y se avisa.
    // Con saldo a favor el monto no viene sugerido: hay que escribirlo.
    responder({ ...BASE, 'POST /api/cuenta-corriente/1/pagar': { movimientos: MOVS, saldo: 0, recibo_id: null }, 'POST /api/recibos/cobranza/9': { status: 500, detail: 'Sin plantilla' } })
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar pago' })).toBeDisabled()
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('spinbutton'), { target: { value: '50' } })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(ventana.close).toHaveBeenCalledTimes(1))
    await user.click(screen.getByLabelText('Ver recibo'))
    expect(await screen.findByText('Sin plantilla')).toBeTruthy()
    expect(ventana.close).toHaveBeenCalledTimes(2)
    responder({ ...BASE, 'POST /api/cuenta-corriente/1/pagar': { status: 400, detail: 'Monto inválido' } })
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('spinbutton'), { target: { value: '50' } })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByText('Monto inválido')).toBeTruthy()
    expect(ventana.close).toHaveBeenCalledTimes(3)
  })

  it('el admin borra un pago con confirmación y recarga; la carga fallida avisa', async () => {
    responder({ ...BASE, 'DELETE /api/cuenta-corriente/pagos/9': {} })
    const user = userEvent.setup()
    montar('/cuenta-corriente/1', <CuentaCorrienteDetalle esAdmin />)
    await screen.findByText('Historial de movimientos')
    expect(screen.queryByLabelText('Ver recibo')).toBeNull()
    await user.click(screen.getByLabelText('Eliminar pago'))
    expect(screen.getByRole('alertdialog').textContent).toContain('¿Eliminar este pago?')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(screen.getByLabelText('Eliminar pago'))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/cuenta-corriente/pagos/9'))
    expect(pedidas().filter((p) => p === 'GET /api/cuenta-corriente/1')).toHaveLength(2)
    responder({ ...BASE, 'DELETE /api/cuenta-corriente/pagos/9': { status: 409, detail: 'Ya conciliado' } })
    await user.click(screen.getByLabelText('Eliminar pago'))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Ya conciliado')).toBeTruthy()

    cleanup()
    responder({ ...BASE, '/api/cuenta-corriente/1': '!caida' })
    montar('/cuenta-corriente/1', <CuentaCorrienteDetalle />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

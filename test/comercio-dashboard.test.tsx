// El tablero (fase 13, 2026-09-27): extraído de Contalibra, el único de los tres productos con
// pantalla propia. Lo que cada producto agrega o apaga son props aditivas -- acá se prueba el default
// (Contalibra) y una variante sin documentos que otro producto no tiene (VentaLibra).
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { Dashboard } from '../src/comercio/Dashboard'
import type { DashboardData } from '../src/comercio/tipos'
import { montar, prepararFetch, responder } from './helpers-pantallas'

const DATA: DashboardData = {
  mes_desde: '2026-09-01', mes_hasta: '2026-09-27',
  facturado_mes: 100000, cobrado_mes: 80000, egresos_mes: 20000, saldo_total: 150000,
  cant_facturas_mes: 3,
  facturas_sin_cobrar: [
    { id: 11, tipo: 11, punto_venta: 5, numero: 42, fecha: '2026-09-20', cliente_razon: 'Cliente SA', total: 5000, letra: 'C', label_numero: '0005-00000042' },
  ],
  presupuestos_pendientes: [
    { id: 3, number: 'P-0003', date: '2026-09-18', client_name: 'Otro Cliente', total: 8000 },
  ],
  ultimos_movimientos: [
    { id: 1, fecha: '2026-09-27', tipo: 'ingreso', concepto: 'Venta V-1', monto: 1000, referencia: '', factura_id: null, medio_pago: 'efectivo' },
    { id: 2, fecha: '2026-09-26', tipo: 'egreso', concepto: 'Alquiler', monto: 500, referencia: 'op-1', factura_id: null, medio_pago: 'efectivo' },
  ],
}

const VACIO: DashboardData = {
  ...DATA, facturas_sin_cobrar: [], presupuestos_pendientes: [], ultimos_movimientos: [],
}

beforeEach(() => {
  prepararFetch()
})

describe('Dashboard: default (Contalibra)', () => {
  it('muestra los KPIs, los cuatro accesos rápidos y las dos tarjetas con sus links', async () => {
    responder({ '/api/dashboard': DATA })
    montar('/dashboard', <Dashboard />)
    expect(await screen.findByText('Facturado este mes')).toBeTruthy()
    expect(screen.getByText('3 facturas')).toBeTruthy()
    expect(screen.getByText('+ Nueva Factura').closest('a')).toHaveAttribute('href', '/facturas/nueva')
    expect(screen.getByText('+ Nuevo Presupuesto').closest('a')).toHaveAttribute('href', '/presupuestos/nuevo')
    expect(screen.getByText('+ Nuevo Remito').closest('a')).toHaveAttribute('href', '/remitos/nuevo')
    expect(screen.getByText('+ Nuevo Movimiento de Caja').closest('a')).toHaveAttribute('href', '/caja?nuevo=1')

    expect(screen.getByText('0005-00000042')).toBeTruthy()
    expect(screen.getByText('Cliente SA — 20-09-2026')).toBeTruthy()
    expect(screen.getAllByText('Ver')[0].closest('a')).toHaveAttribute('href', '/facturas/11')
    expect(screen.getByText('Ver todas').closest('a')).toHaveAttribute('href', '/facturas')

    expect(screen.getByText('P-0003')).toBeTruthy()
    expect(screen.getByText('Ver todos').closest('a')).toHaveAttribute('href', '/presupuestos')

    expect(screen.getByText('Venta V-1')).toBeTruthy()
    expect(screen.getByText('Ver caja completa').closest('a')).toHaveAttribute('href', '/caja')
  })

  it('los vacíos avisan sin roturas, y la caída de red se muestra', async () => {
    responder({ '/api/dashboard': VACIO })
    montar('/dashboard', <Dashboard />)
    expect(await screen.findByText('Todas las facturas están cobradas.')).toBeTruthy()
    expect(screen.getByText('Sin presupuestos pendientes.')).toBeTruthy()
    expect(screen.getByText('Sin movimientos registrados.')).toBeTruthy()

    prepararFetch()
    responder({ '/api/dashboard': '!caida' })
    montar('/dashboard', <Dashboard />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })

  it('un 403 de plan se muestra tal cual llega del motor', async () => {
    responder({ '/api/dashboard': { status: 403, detail: "modulo 'dashboard' no incluido en el plan actual" } })
    montar('/dashboard', <Dashboard />)
    expect(await screen.findByText("modulo 'dashboard' no incluido en el plan actual")).toBeTruthy()
  })
})

describe('Dashboard: variante sin los documentos que VentaLibra no tiene', () => {
  it('sin accionesRapidas, sin presupuestos y sin los links a factura/caja que no existen', async () => {
    responder({ '/api/dashboard': DATA })
    montar('/dashboard', (
      <Dashboard accionesRapidas={[]} conPresupuestos={false} rutaDeFactura={null} rutaDeFacturas={null} rutaDeCaja={null} />
    ))
    await screen.findByText('Facturado este mes')
    expect(screen.queryByText('+ Nueva Factura')).toBeNull()
    expect(screen.queryByText('Presupuestos sin respuesta')).toBeNull()
    // La tarjeta de facturas sin cobrar sigue -- sólo se apagan los links que no tienen a dónde ir.
    expect(screen.getByText('0005-00000042')).toBeTruthy()
    expect(screen.queryByText('Ver')).toBeNull()
    expect(screen.queryByText('Ver todas')).toBeNull()
    expect(screen.queryByText('Ver caja completa')).toBeNull()
  })
})

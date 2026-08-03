// Detalle de un comprobante (v0.11.0), extraído de Contalibra y Restolibra.
//
// El grueso de la pantalla ya lo cubren las suites de los dos productos, que
// la ejercen a través de su propio router. Lo que se prueba acá es la **única
// costura nueva** que creó la extracción: el rol dejó de leerse de un
// `useAuth` —que en este paquete apunta a otro contexto que el del producto y
// daría siempre vacío— y pasó a entrar como prop.
//
// Si esa prop se cablea mal, la pantalla no explota: simplemente le faltan (o
// le sobran) acciones de administrador, que es la clase de regresión que nadie
// ve hasta que un operador puede borrar un comprobante.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FacturaDetalle } from '../src/FacturaDetalle'
import type { FacturaDetalle as FacturaDetalleType } from '../src/facturas'

const SIN_CAE: FacturaDetalleType = {
  factura: {
    id: 1, tipo: 11, punto_venta: 5, numero: 1, fecha: '2026-08-03',
    cliente_cuit: '30111111118', cliente_razon: 'Cliente SA',
    items: [{ description: 'Servicio', qty: 1, unit_price: 1000, subtotal: 1000 }],
    subtotal: 1000, iva_amount: 0, total: 1000, concepto: 1,
    cae: '', cae_vto: '', observaciones: '', condicion_venta: 'Contado',
  },
  tipo_label: 'FACTURA C', concepto_label: 'Productos', iva_label: '',
  notas_credito: [], notas_debito: [], factura_original: null,
  cobros: [], total_cobrado: 0, pendiente: 1000, cliente_email: '',
}

const CON_CAE: FacturaDetalleType = {
  ...SIN_CAE,
  factura: { ...SIN_CAE.factura, cae: '75123456789012', cae_vto: '20260813' },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function montar(detalle: FacturaDetalleType, props: { esAdmin?: boolean } = {}) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(String(url).includes('/api/cajas') ? json([]) : json(detalle)),
  )
  render(
    <MemoryRouter initialEntries={['/facturas/1']}>
      <Routes>
        <Route path="/facturas/:id" element={<FacturaDetalle {...props} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('acciones gateadas por rol', () => {
  it('con esAdmin, un comprobante autorizado ofrece notas de crédito y débito', async () => {
    montar(CON_CAE, { esAdmin: true })
    expect(await screen.findByRole('button', { name: /Nota de Crédito/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nota de Débito/ })).toBeInTheDocument()
  })

  it('sin esAdmin, el mismo comprobante no las ofrece', async () => {
    montar(CON_CAE, { esAdmin: false })
    // Se espera a que la pantalla haya cargado antes de afirmar una ausencia:
    // si no, el "no está" podría ser sólo que todavía no renderizó.
    expect(await screen.findAllByText('0005-00000001')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Nota de Crédito/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nota de Débito/ })).not.toBeInTheDocument()
  })

  it('con esAdmin, un comprobante sin CAE se puede eliminar', async () => {
    montar(SIN_CAE, { esAdmin: true })
    expect(await screen.findByRole('button', { name: /Eliminar/ })).toBeInTheDocument()
  })

  it('sin esAdmin, ese mismo comprobante no se puede eliminar', async () => {
    montar(SIN_CAE, { esAdmin: false })
    expect(await screen.findAllByText('0005-00000001')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument()
  })

  it('el default es NO admin: un producto que olvide la prop queda de menos, no de más', async () => {
    montar(SIN_CAE)
    expect(await screen.findAllByText('0005-00000001')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument()
  })
})

describe('lo que la pantalla muestra del comprobante', () => {
  it('una factura de servicios muestra el período facturado', async () => {
    montar({
      ...CON_CAE,
      factura: {
        ...CON_CAE.factura, concepto: 2,
        fch_serv_desde: '2026-07-01', fch_serv_hasta: '2026-07-31',
        fch_vto_pago: '2026-08-13',
      },
    })
    expect(await screen.findByText(/2026-07-01 al 2026-07-31/)).toBeInTheDocument()
    expect(screen.getByText('2026-08-13')).toBeInTheDocument()
  })

  it('una factura de productos no muestra ningún período', async () => {
    montar(CON_CAE)
    expect(await screen.findAllByText('0005-00000001')).not.toHaveLength(0)
    expect(screen.queryByText('Per. facturado:')).not.toBeInTheDocument()
  })

  it('el diálogo de cobro ofrece medios reales, pero no la cuenta corriente', async () => {
    // Hay que ABRIR el diálogo: con el diálogo cerrado no se rendea ninguna
    // opción y la afirmación pasaría por no encontrar nada, no por el filtro.
    // Sin cajas configuradas la pantalla cae al listado por defecto, que es
    // justamente el que tiene que venir filtrado.
    montar(CON_CAE)
    await userEvent.click(await screen.findByRole('button', { name: /Registrar cobro/ }))

    // Primero que el diálogo abrió y hay opciones: si esto falla, lo de abajo
    // no prueba nada.
    expect(await screen.findByRole('option', { name: 'Efectivo' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Transferencia' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Cuenta corriente' })).not.toBeInTheDocument()
  })
})

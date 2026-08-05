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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

// Lo que sigue se agregó el 2026-08-06 para devolver el CI de este repo a
// verde: la extracción de esta pantalla (v0.11.0) trajo 530 líneas con tests
// sólo de la costura nueva, y eso dejó la cobertura de funciones global en
// 76% contra un piso de 95% — el CI venía en rojo desde el 2026-08-03 sin que
// nadie lo mirara. El razonamiento original ("el grueso ya lo cubren las
// suites de los dos productos") es cierto para el riesgo, pero el trinquete
// mide ESTE repo.

describe('cobro', () => {
  const CAJAS = [
    { id: 1, nombre: 'Caja mostrador', es_default: 1, medios_pago: ['efectivo', 'cuenta_corriente'] },
    { id: 2, nombre: 'Caja online', es_default: 0, medios_pago: ['transferencia', 'mercadopago'] },
  ]

  function montarConCajas(detalle = CON_CAE) {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(String(url).includes('/api/cajas') ? json(CAJAS) : json(detalle)),
    )
    render(
      <MemoryRouter initialEntries={['/facturas/1']}>
        <Routes><Route path="/facturas/:id" element={<FacturaDetalle />} /></Routes>
      </MemoryRouter>,
    )
  }

  it('arranca en la caja marcada por defecto', async () => {
    montarConCajas()
    await userEvent.click(await screen.findByRole('button', { name: /Registrar cobro/ }))

    const selects = screen.getAllByRole('combobox')
    expect(selects[0]).toHaveValue('1')
  })

  it('los medios salen de la caja elegida, sin la cuenta corriente', async () => {
    montarConCajas()
    await userEvent.click(await screen.findByRole('button', { name: /Registrar cobro/ }))

    // Caja mostrador declara efectivo + cuenta corriente: sólo el primero es
    // un medio de cobro real de un comprobante.
    expect(await screen.findByRole('option', { name: 'Efectivo' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Cuenta corriente' })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '2')
    expect(await screen.findByRole('option', { name: 'Transferencia' })).toBeInTheDocument()
  })

  it('el monto se prellena con lo pendiente y el POST manda lo que corresponde', async () => {
    montarConCajas()
    await userEvent.click(await screen.findByRole('button', { name: /Registrar cobro/ }))

    expect(screen.getByDisplayValue('1000')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Confirmar cobro/ }))

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes('/cobrar'))
      expect(llamada).toBeTruthy()
      const cuerpo = JSON.parse(String(llamada![1].body))
      expect(cuerpo.caja_id).toBe(1)
      expect(cuerpo.pagos).toEqual([{ medio_id: 'efectivo', monto: 1000, referencia: '' }])
    })
  })

  it('un medio agregado y dejado en cero no viaja', async () => {
    // Agregar una fila y no completarla es lo normal al cobrar con un solo
    // medio; mandarla haría un movimiento de caja de $0.
    montarConCajas()
    await userEvent.click(await screen.findByRole('button', { name: /Registrar cobro/ }))
    await userEvent.click(screen.getByRole('button', { name: /Agregar medio/ }))
    await userEvent.click(screen.getByRole('button', { name: /Confirmar cobro/ }))

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes('/cobrar'))
      expect(JSON.parse(String(llamada![1].body)).pagos).toHaveLength(1)
    })
  })

  it('si el cobro falla, el error se ve y el diálogo no se cierra', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/api/cajas')) return Promise.resolve(json(CAJAS))
      if (u.includes('/cobrar')) return Promise.resolve(json({ detail: 'la caja está cerrada' }, 422))
      return Promise.resolve(json(CON_CAE))
    })
    render(
      <MemoryRouter initialEntries={['/facturas/1']}>
        <Routes><Route path="/facturas/:id" element={<FacturaDetalle />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /Registrar cobro/ }))
    await userEvent.click(screen.getByRole('button', { name: /Confirmar cobro/ }))

    expect(await screen.findByText('la caja está cerrada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar cobro/ })).toBeInTheDocument()
  })
})

describe('email', () => {
  it('se prellena con el mail del cliente y lo manda', async () => {
    montar({ ...CON_CAE, cliente_email: 'cliente@ejemplo.com' })
    await userEvent.click(await screen.findByRole('button', { name: /Enviar por email/ }))

    expect(screen.getByDisplayValue('cliente@ejemplo.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Enviar$/ }))

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes('/enviar-email'))
      expect(JSON.parse(String(llamada![1].body))).toEqual({ email: 'cliente@ejemplo.com' })
    })
  })

  it('sin destinatario el botón está deshabilitado', async () => {
    montar(CON_CAE)
    await userEvent.click(await screen.findByRole('button', { name: /Enviar por email/ }))
    expect(screen.getByRole('button', { name: /^Enviar$/ })).toBeDisabled()
  })
})

describe('ARCA, notas y borrado', () => {
  it('un comprobante sin CAE ofrece reintentar la autorización', async () => {
    montar(SIN_CAE)
    await userEvent.click(await screen.findByRole('button', { name: /Reintentar autorización ARCA/ }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/autorizar'))).toBe(true)
    })
  })

  it('el error de ARCA se muestra tal cual lo manda el backend', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/api/cajas')) return Promise.resolve(json([]))
      if (u.includes('/autorizar')) return Promise.resolve(json({ detail: 'ARCA: CUIT no habilitado' }, 400))
      return Promise.resolve(json(SIN_CAE))
    })
    render(
      <MemoryRouter initialEntries={['/facturas/1']}>
        <Routes><Route path="/facturas/:id" element={<FacturaDetalle />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /Reintentar autorización ARCA/ }))
    expect(await screen.findByText('ARCA: CUIT no habilitado')).toBeInTheDocument()
  })

  it('generar una nota de crédito avisa qué anula antes de hacerlo', async () => {
    montar(CON_CAE, { esAdmin: true })
    await userEvent.click(await screen.findByRole('button', { name: /Nota de Crédito/ }))

    const confirmacion = await screen.findByRole('alertdialog')
    // El texto nombra el comprobante y el importe: es una acción que no se
    // puede deshacer y va a ARCA.
    expect(confirmacion).toHaveTextContent('C 0005-00000001')
    expect(confirmacion).toHaveTextContent('Cliente SA')

    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Generar' }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/nota-credito'))).toBe(true)
    })
  })

  it('la nota de débito dice que está asociada, no que anula', async () => {
    montar(CON_CAE, { esAdmin: true })
    await userEvent.click(await screen.findByRole('button', { name: /Nota de Débito/ }))

    const confirmacion = await screen.findByRole('alertdialog')
    expect(confirmacion).toHaveTextContent('está asociada a')
    expect(confirmacion).not.toHaveTextContent('anula el comprobante')
  })

  it('eliminar pide confirmación y recién ahí borra', async () => {
    montar(SIN_CAE, { esAdmin: true })
    await userEvent.click(await screen.findByRole('button', { name: /Eliminar/ }))

    const confirmacion = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE')
      expect(String(llamada![0])).toContain('/api/facturas/1')
    })
  })

  it('duplicar arma el borrador en el backend', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/api/cajas')) return Promise.resolve(json([]))
      if (u.includes('/duplicar')) {
        return Promise.resolve(json({
          tipo: 11, client_id: 3, client_name: 'Cliente SA', concepto: 1,
          condicion_venta: 'Contado', items: [], tax_rate: 0,
        }))
      }
      return Promise.resolve(json(CON_CAE))
    })
    render(
      <MemoryRouter initialEntries={['/facturas/1']}>
        <Routes><Route path="/facturas/:id" element={<FacturaDetalle />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /Duplicar/ }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/duplicar'))).toBe(true)
    })
  })
})

describe('cancelar lo que no se puede deshacer', () => {
  it('arrepentirse de la nota no la genera', async () => {
    montar(CON_CAE, { esAdmin: true })
    await userEvent.click(await screen.findByRole('button', { name: /Nota de Crédito/ }))

    const confirmacion = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/nota-credito'))).toBe(false)
  })

  it('arrepentirse del borrado no borra', async () => {
    montar(SIN_CAE, { esAdmin: true })
    await userEvent.click(await screen.findByRole('button', { name: /Eliminar/ }))

    const confirmacion = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false)
  })
})

describe('editar los campos del cobro y del email', () => {
  it('se puede escribir otro destinatario', async () => {
    montar({ ...CON_CAE, cliente_email: 'viejo@ejemplo.com' })
    await userEvent.click(await screen.findByRole('button', { name: /Enviar por email/ }))

    const campo = screen.getByDisplayValue('viejo@ejemplo.com')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'otro@ejemplo.com')
    await userEvent.click(screen.getByRole('button', { name: /^Enviar$/ }))

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes('/enviar-email'))
      expect(JSON.parse(String(llamada![1].body))).toEqual({ email: 'otro@ejemplo.com' })
    })
  })

  it('el medio, el monto y la referencia de cada pago se editan', async () => {
    montar(CON_CAE)
    await userEvent.click(await screen.findByRole('button', { name: /Registrar cobro/ }))

    // Sin cajas configuradas hay un solo combobox: el del medio.
    await userEvent.selectOptions(screen.getByRole('combobox'), 'transferencia')
    const [monto, referencia] = screen.getAllByRole('textbox').length
      ? [screen.getByDisplayValue('1000'), screen.getByPlaceholderText('Referencia')]
      : [screen.getByDisplayValue('1000'), screen.getByPlaceholderText('Referencia')]
    await userEvent.clear(monto)
    await userEvent.type(monto, '600')
    await userEvent.type(referencia, 'transf 4471')

    await userEvent.click(screen.getByRole('button', { name: /Confirmar cobro/ }))

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes('/cobrar'))
      expect(JSON.parse(String(llamada![1].body)).pagos).toEqual([
        { medio_id: 'transferencia', monto: 600, referencia: 'transf 4471' },
      ])
    })
  })

  it('un comprobante ya cobrado ofrece el cobro igual, para un pago parcial más', async () => {
    // Es la otra rama del botón: con `pendiente > 0` sale junto al resumen de
    // cobros, no en la barra principal.
    montar({
      ...CON_CAE,
      cobros: [{ id: 1, fecha: '2026-08-04', medio_pago: 'efectivo', monto: 400, referencia: '' }],
      total_cobrado: 400, pendiente: 600,
    })
    const botones = await screen.findAllByRole('button', { name: /Registrar cobro/ })
    await userEvent.click(botones[0])

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('comprobantes relacionados', () => {
  it('una nota muestra de qué comprobante viene', async () => {
    montar({
      ...CON_CAE,
      factura: { ...CON_CAE.factura, tipo: 13 },
      tipo_label: 'NOTA DE CRÉDITO C',
      factura_original: { ...CON_CAE.factura, id: 9, numero: 7 },
    })
    // Aparece dos veces (el aviso de arriba y el link al original), que es
    // justamente lo que se quiere: se ve sin scrollear y se puede abrir.
    expect(await screen.findAllByText(/0005-00000007/)).not.toHaveLength(0)
  })

  it('un comprobante con notas asociadas las lista', async () => {
    montar({
      ...CON_CAE,
      notas_credito: [{ ...CON_CAE.factura, id: 5, numero: 3, tipo: 13, total: 1000 }],
      notas_debito: [{ ...CON_CAE.factura, id: 6, numero: 4, tipo: 12, total: 250 }],
    })
    expect(await screen.findByText(/0005-00000003/)).toBeInTheDocument()
    expect(screen.getByText(/0005-00000004/)).toBeInTheDocument()
  })

  it('las observaciones se muestran si las hay', async () => {
    montar({
      ...CON_CAE,
      factura: { ...CON_CAE.factura, observaciones: 'Pago a 30 días acordado' },
    })
    expect(await screen.findByText('Pago a 30 días acordado')).toBeInTheDocument()
  })
})

describe('estados de carga', () => {
  it('si el comprobante no carga, lo dice y no rompe', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(String(url).includes('/api/cajas')
        ? json([])
        : json({ detail: 'comprobante inexistente' }, 404)),
    )
    render(
      <MemoryRouter initialEntries={['/facturas/99']}>
        <Routes><Route path="/facturas/:id" element={<FacturaDetalle />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('comprobante inexistente')).toBeInTheDocument()
  })

  it('el recibo sólo se ofrece si hay cobros', async () => {
    montar(CON_CAE)
    expect(await screen.findAllByText('0005-00000001')).not.toHaveLength(0)
    expect(screen.queryByRole('link', { name: /Recibo/ })).not.toBeInTheDocument()

    cleanup()
    montar({
      ...CON_CAE,
      cobros: [{ id: 1, fecha: '2026-08-04', medio_pago: 'efectivo', monto: 1000, referencia: '' }],
      total_cobrado: 1000, pendiente: 0,
    })
    expect(await screen.findByRole('link', { name: /Recibo/ })).toBeInTheDocument()
  })
})

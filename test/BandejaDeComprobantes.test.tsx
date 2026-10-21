// La bandeja de comprobantes pendientes de facturar, subida al kit desde Contalibra (ADR-087).
//
// Lo que se fija es lo que la pantalla decide y no el render de las primitivas: la regla del agrupado (varios comprobantes,
// pero sólo del mismo cliente, porque una factura tiene un solo receptor), que **la bandeja no factura por su cuenta**
// (entrega el formulario armado a `alFacturar`), y que una venta cobrada sin conexión en el nodo no se tilda ni se descarta
// (libracore ≥ v1.186.1 contesta 409 a las dos cosas). Lo demás son las costuras de la extracción: las rutas, los permisos
// y los textos que ahora son del producto.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Package } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BandejaDeComprobantes } from '../src/BandejaDeComprobantes'
import { ORIGENES_DE_COMPROBANTE, TEXTO_BANDEJA_DE_CONSULTA, periodoDelComprobante, type PrefillComprobantes } from '../src/comprobantes-pendientes'
import { _reiniciarConexionDelNodo } from '../src/nodo-offline'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  _reiniciarConexionDelNodo()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  _reiniciarConexionDelNodo()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Datos ficticios.
function comprobante(over: Record<string, unknown> = {}) {
  return {
    id: 1, origen_producto: 'libradesk', origen_instancia: 'demo', origen_tipo: 'cuota_contrato', origen_id: '1',
    cliente_id: null, cliente_cuit: '30-00000000-1', cliente_razon: 'Ferretería Demo', cliente_domicilio: '',
    periodo_desde: '2026-08-01', periodo_hasta: '2026-08-31', concepto: 'Alquiler', condicion_venta: 'Contado', observaciones: '',
    items: [{ description: 'Alquiler impresora', qty: 1, unit_price: 45000, iva_rate: 0.21 }],
    total: 54450, estado: 'pendiente', factura_id: null, motivo_descarte: '', resuelto_at: '', resuelto_por: '',
    created_at: '2026-09-01 10:00:00', ...over,
  }
}
const otroCliente = (id: number) => comprobante({ id, origen_id: String(id), cliente_cuit: '27-00000000-4', cliente_razon: 'Otra SRL' })
const ventaDelNodo = (over: Record<string, unknown> = {}) => comprobante({
  id: 9, origen_producto: 'ventalibra', origen_instancia: 'nodo-demo-1', origen_tipo: 'venta', origen_id: '41',
  cliente_cuit: '', cliente_razon: 'Consumidor Final', periodo_desde: '', periodo_hasta: '', ...over,
})

const PREFILL: PrefillComprobantes = {
  comprobantes_ids: [1, 2], avisos: ['Dos tasas de IVA: se usó 21%'], concepto: 2, condicion_venta: 'Contado', tax_rate: 21,
  client_id: null, client_name: 'Ferretería Demo', client_cuit: '30-00000000-1', client_address: '', fecha: '2026-09-02',
  observations: '', items: [{ description: 'Alquiler impresora', qty: 1, unit_price: 45000 }],
  fch_serv_desde: '2026-08-01', fch_serv_hasta: '2026-08-31', fch_vto_pago: '2026-09-10',
}

type Bandeja = { pendientes?: unknown[]; facturados?: unknown[]; descartados?: unknown[] }
const bandeja = (b: Bandeja) => ({
  pendientes: [], facturados: [], descartados: [], ...b, total_pendientes: (b.pendientes ?? []).length,
})

/** Contesta la bandeja (que puede cambiar entre pedidos: es una función) y, si se pasa, lo demás por «MÉTODO ruta». */
function conBandeja(datos: Bandeja | (() => Bandeja), extra: Record<string, () => Response> = {}, ruta = '/api/comprobantes-pendientes') {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const clave = `${init?.method ?? 'GET'} ${String(entrada).split('?')[0]}`
    if (clave in extra) return Promise.resolve(extra[clave]())
    if (clave === `GET ${ruta}`) return Promise.resolve(json(bandeja(typeof datos === 'function' ? datos() : datos)))
    if (clave === 'GET /api/nodo/conexion') return Promise.resolve(json({ es_nodo: true, en_linea: true, node_id: 'nodo-demo-1', a_facturar: 0 }))
    return Promise.resolve(json({ detail: 'Not Found' }, 404))
  })
}

const pedidas = () => fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
const cuerpoDe = (clave: string) => {
  const llamada = fetchMock.mock.calls.find((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}` === clave)
  return JSON.parse(String((llamada?.[1] as RequestInit).body))
}

function montar(props: Partial<React.ComponentProps<typeof BandejaDeComprobantes>> = {}) {
  return render(<MemoryRouter><BandejaDeComprobantes alFacturar={vi.fn()} {...props} /></MemoryRouter>)
}

// Las casillas se vuelven a consultar después de cada click: la tabla se rerenderiza y los nodos de antes quedan
// desprendidos del documento.
const casilla = (i: number) => screen.getAllByRole('checkbox')[i]
// «Descartar» es también el título del botón de la fila: el de confirmar es el que está dentro del formulario.
const confirmarDescarte = () => within(screen.getByLabelText('Motivo').closest('div')!.parentElement!).getByRole('button', { name: 'Descartar' })

describe('lo que muestra', () => {
  it('lo que otro sistema dejó pendiente, con el origen rotulado y el período', async () => {
    conBandeja({ pendientes: [comprobante()] })
    montar()
    expect(await screen.findByText('Ferretería Demo')).toBeInTheDocument()
    expect(screen.getByText('Cuota de contrato')).toBeInTheDocument()
    expect(screen.getByText('01-08-2026 → 31-08-2026')).toBeInTheDocument()
    expect(screen.getByText('Comprobantes a facturar')).toBeInTheDocument()
    expect(screen.getByText('Pendientes (1)')).toBeInTheDocument()
  })

  it('avisa cuando no hay nada esperando', async () => {
    conBandeja({})
    montar()
    expect(await screen.findByText(/No hay nada esperando para facturar/)).toBeInTheDocument()
  })

  it('un error de la carga se ve; un corte de red también', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'Sin permiso' }, 403)))
    montar()
    expect((await screen.findByRole('alert')).textContent).toBe('Sin permiso')
    cleanup()
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('sin red')))
    montar()
    expect((await screen.findByRole('alert')).textContent).toBe('Error de conexión.')
  })

  it('el período: un día, un rango, sin período', () => {
    expect(periodoDelComprobante({ periodo_desde: '', periodo_hasta: '' })).toBe('—')
    expect(periodoDelComprobante({ periodo_desde: '2026-08-01', periodo_hasta: '2026-08-01' })).toBe('01-08-2026')
    expect(periodoDelComprobante({ periodo_desde: '', periodo_hasta: '2026-08-31' })).toBe('— → 31-08-2026')
  })

  it('el detalle suma «+N» y un origen que el kit no conoce se muestra como llega', async () => {
    conBandeja({
      pendientes: [comprobante({
        origen_tipo: 'algo_nuevo',
        items: [{ description: 'Uno', qty: 1, unit_price: 1, iva_rate: 0.21 }, { description: 'Dos', qty: 1, unit_price: 1, iva_rate: 0.21 }],
      })],
    })
    montar()
    expect(await screen.findByText('Uno +1')).toBeInTheDocument()
    expect(screen.getByText('algo_nuevo')).toBeInTheDocument()
  })
})

describe('el agrupado', () => {
  it('deja tildar dos comprobantes del mismo cliente y suma el total', async () => {
    conBandeja({ pendientes: [comprobante({ id: 1, total: 1000 }), comprobante({ id: 2, origen_id: '2', total: 500 })] })
    montar()
    await screen.findAllByText('Ferretería Demo')
    await userEvent.click(casilla(0))
    await userEvent.click(casilla(1))
    expect(await screen.findByText(/2 comprobantes elegidos/)).toBeInTheDocument()
    expect(screen.getByText(/1\.500,00/)).toBeInTheDocument()
  })

  it('bloquea el de otro cliente en cuanto se tilda uno, y destildar lo vuelve a habilitar', async () => {
    conBandeja({ pendientes: [comprobante({ id: 1 }), otroCliente(2)] })
    montar()
    await screen.findByText('Otra SRL')
    expect(casilla(1)).toBeEnabled()

    await userEvent.click(casilla(0))
    await waitFor(() => expect(casilla(1)).toBeDisabled())
    expect(screen.getByText(/1 comprobante elegido/)).toBeInTheDocument()

    await userEvent.click(casilla(0))
    await waitFor(() => expect(casilla(1)).toBeEnabled())
  })

  it('«Limpiar» y cambiar de pestaña vacían la elección', async () => {
    conBandeja({ pendientes: [comprobante()] })
    montar()
    await screen.findByText('Ferretería Demo')
    await userEvent.click(casilla(0))
    await userEvent.click(await screen.findByRole('button', { name: 'Limpiar' }))
    expect(screen.queryByText(/comprobante elegido/)).not.toBeInTheDocument()

    await userEvent.click(casilla(0))
    await userEvent.click(screen.getByRole('tab', { name: 'Facturados' }))
    await userEvent.click(screen.getByRole('tab', { name: /Pendientes/ }))
    expect(screen.queryByText(/comprobante elegido/)).not.toBeInTheDocument()
  })
})

describe('«Facturar»: la bandeja no factura por su cuenta', () => {
  it('arma el formulario con los ids elegidos y se lo entrega a `alFacturar`', async () => {
    const alFacturar = vi.fn()
    conBandeja({ pendientes: [comprobante({ id: 1 }), comprobante({ id: 2, origen_id: '2' })] }, {
      'POST /api/comprobantes-pendientes/facturar-prefill': () => json(PREFILL),
    })
    montar({ alFacturar })
    await screen.findAllByText('Ferretería Demo')
    await userEvent.click(casilla(0))
    await userEvent.click(casilla(1))
    await userEvent.click(await screen.findByRole('button', { name: /Facturar/ }))

    await waitFor(() => expect(alFacturar).toHaveBeenCalledWith(PREFILL))
    expect(cuerpoDe('POST /api/comprobantes-pendientes/facturar-prefill')).toEqual({ ids: [1, 2] })
    // Nada se emite, nada se marca: eso pasa en el formulario del producto.
    expect(pedidas().filter((p) => p.startsWith('POST'))).toEqual(['POST /api/comprobantes-pendientes/facturar-prefill'])
  })

  it('un 422 del motor (clientes mezclados) se ve y no llama a `alFacturar`', async () => {
    const alFacturar = vi.fn()
    conBandeja({ pendientes: [comprobante()] }, {
      'POST /api/comprobantes-pendientes/facturar-prefill': () => json({ detail: 'Son de clientes distintos' }, 422),
    })
    montar({ alFacturar })
    await screen.findByText('Ferretería Demo')
    await userEvent.click(casilla(0))
    await userEvent.click(await screen.findByRole('button', { name: /Facturar/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Son de clientes distintos')
    expect(alFacturar).not.toHaveBeenCalled()
  })

  it('un 409 `se_factura_desde_la_venta` muestra el mensaje del motor', async () => {
    conBandeja({ pendientes: [comprobante()] }, {
      'POST /api/comprobantes-pendientes/facturar-prefill': () => json({
        detail: { codigo: 'se_factura_desde_la_venta', mensaje: 'Las ventas cobradas sin conexión se facturan desde la venta: 9' },
      }, 409),
    })
    montar()
    await screen.findByText('Ferretería Demo')
    await userEvent.click(casilla(0))
    await userEvent.click(await screen.findByRole('button', { name: /Facturar/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Las ventas cobradas sin conexión se facturan desde la venta: 9')
  })

  it('sin `alFacturar` la bandeja es de consulta: ni casillas ni «Facturar», y el texto lo dice', async () => {
    conBandeja({ pendientes: [comprobante()] })
    render(<MemoryRouter><BandejaDeComprobantes /></MemoryRouter>)
    await screen.findByText('Ferretería Demo')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Facturar/ })).not.toBeInTheDocument()
    expect(screen.getByText(TEXTO_BANDEJA_DE_CONSULTA)).toBeInTheDocument()
  })
})

describe('descartar', () => {
  it('pide el motivo, descarta y recarga', async () => {
    let hechas = false
    conBandeja(() => bandeja({ pendientes: hechas ? [] : [comprobante()] }), {
      'POST /api/comprobantes-pendientes/1/descartar': () => { hechas = true; return json({}) },
    })
    montar()
    await screen.findByText('Ferretería Demo')
    await userEvent.click(screen.getByTitle('Descartar'))
    await userEvent.type(screen.getByLabelText('Motivo'), 'se cobró por fuera')
    await userEvent.click(confirmarDescarte())

    expect(await screen.findByText(/No hay nada esperando para facturar/)).toBeInTheDocument()
    expect(cuerpoDe('POST /api/comprobantes-pendientes/1/descartar')).toEqual({ motivo: 'se cobró por fuera' })
  })

  it('«Cancelar» cierra el formulario sin pedir nada', async () => {
    conBandeja({ pendientes: [comprobante()] })
    montar()
    await screen.findByText('Ferretería Demo')
    await userEvent.click(screen.getByTitle('Descartar'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument()
    expect(pedidas().filter((p) => p.startsWith('POST'))).toEqual([])
  })

  it('un error del motor al descartar se ve y el formulario sigue abierto', async () => {
    conBandeja({ pendientes: [comprobante()] }, {
      'POST /api/comprobantes-pendientes/1/descartar': () => json({ detail: 'El comprobante ya estaba resuelto' }, 409),
    })
    montar()
    await screen.findByText('Ferretería Demo')
    await userEvent.click(screen.getByTitle('Descartar'))
    await userEvent.click(confirmarDescarte())
    expect((await screen.findByRole('alert')).textContent).toBe('El comprobante ya estaba resuelto')
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument()
  })

  it('sin permiso (`puedeDescartar={false}`) no hay botón de descartar', async () => {
    conBandeja({ pendientes: [comprobante()] })
    montar({ puedeDescartar: false })
    await screen.findByText('Ferretería Demo')
    expect(screen.queryByTitle('Descartar')).not.toBeInTheDocument()
    expect(casilla(0)).toBeInTheDocument()
  })
})

// Las ventas que el nodo cobró sin conexión (ADR-077) aparecen en la misma bandeja pero se facturan desde la venta.
describe('las ventas del nodo de LibraEdge', () => {
  it('se rotulan «Venta sin conexión» y no se pueden tildar: llevan «Facturar ahora»', async () => {
    conBandeja({ pendientes: [comprobante({ id: 1 }), ventaDelNodo()] })
    montar()
    await screen.findByText('Consumidor Final')
    expect(screen.getByText('Venta sin conexión')).toBeInTheDocument()
    // Una sola casilla: la del comprobante de LibraDesk.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Facturar ahora/ })).toBeInTheDocument()
  })

  it('no ofrecen «Descartar» (ya están cobradas: se facturan)', async () => {
    conBandeja({ pendientes: [comprobante({ id: 1 }), ventaDelNodo()] })
    montar()
    await screen.findByText('Consumidor Final')
    expect(screen.getAllByTitle('Descartar')).toHaveLength(1)
  })

  it('con sólo ventas del nodo y sin `alFacturar` (RestoLibra, VentaLibra) la bandeja igual las muestra y las factura', async () => {
    let lista: unknown[] = [ventaDelNodo()]
    conBandeja(() => bandeja({ pendientes: lista }), {
      'POST /api/nodo/facturar-pendientes': () => {
        lista = []
        return json({ es_nodo: true, en_linea: true, facturadas: [{ venta_id: 41, factura_id: 3, cae: '70000000000001' }], descartadas: [], errores: [], quedan: 0 })
      },
    })
    render(<MemoryRouter><BandejaDeComprobantes /></MemoryRouter>)
    await screen.findByText('Consumidor Final')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Facturar ahora/ }))
    expect(await screen.findByText(/No hay nada esperando para facturar/)).toBeInTheDocument()
    expect(pedidas().filter((p) => p === 'POST /api/nodo/facturar-pendientes')).toHaveLength(1)
  })

  it('al recargar, lo que ya no está pendiente sale de la elección', async () => {
    let lista: unknown[] = [comprobante({ id: 1 }), ventaDelNodo()]
    conBandeja(() => bandeja({ pendientes: lista }), {
      'POST /api/nodo/facturar-pendientes': () => {
        // Mientras tanto otra persona resolvió el comprobante tildado.
        lista = []
        return json({ es_nodo: true, en_linea: true, facturadas: [], descartadas: [], errores: [], quedan: 0 })
      },
    })
    montar()
    await screen.findByText('Consumidor Final')
    await userEvent.click(casilla(0))
    expect(await screen.findByText(/1 comprobante elegido/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Facturar ahora/ }))
    await waitFor(() => expect(screen.queryByText(/comprobante elegido/)).not.toBeInTheDocument())
  })

  it('usa la ruta de la tanda que le pasa el producto', async () => {
    conBandeja({ pendientes: [ventaDelNodo()] }, {
      'POST /api/mi/nodo/facturar': () => json({ es_nodo: true, en_linea: true, facturadas: [], descartadas: [], errores: [], quedan: 0 }),
    })
    montar({ rutaFacturarPendientes: '/api/mi/nodo/facturar' })
    await screen.findByText('Consumidor Final')
    await userEvent.click(screen.getByRole('button', { name: /Facturar ahora/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/mi/nodo/facturar'))
  })

  it('sin ventas del nodo no pregunta nada del nodo', async () => {
    conBandeja({ pendientes: [comprobante()] })
    montar()
    await screen.findByText('Ferretería Demo')
    expect(screen.queryByRole('button', { name: /Facturar ahora/ })).not.toBeInTheDocument()
    expect(pedidas().some((p) => p.includes('/api/nodo'))).toBe(false)
  })
})

describe('el historial', () => {
  const resueltos = {
    facturados: [
      comprobante({ id: 3, estado: 'facturado', factura_id: 77, resuelto_at: '2026-09-02', resuelto_por: 'ana' }),
      comprobante({ id: 4, estado: 'facturado', factura_id: null, cliente_razon: 'Sin Factura SA' }),
    ],
    descartados: [comprobante({ id: 5, estado: 'descartado', cliente_razon: 'Descartada SA', motivo_descarte: 'se cobró por fuera' }), comprobante({ id: 6, estado: 'descartado', cliente_razon: 'Sin Motivo SA' })],
  }

  it('«Ver factura» lleva a la factura (por defecto /facturas/<id>)', async () => {
    conBandeja(resueltos)
    montar()
    await userEvent.click(await screen.findByRole('tab', { name: 'Facturados' }))
    expect(screen.getByRole('link', { name: /Ver factura/ })).toHaveAttribute('href', '/facturas/77')
    expect(screen.getByText('Facturado')).toBeInTheDocument()
    expect(screen.getByText('ana')).toBeInTheDocument()
  })

  it('`rutaFactura` es del producto', async () => {
    conBandeja(resueltos)
    montar({ rutaFactura: (id) => `/ventas/facturas/${id}/ver` })
    await userEvent.click(await screen.findByRole('tab', { name: 'Facturados' }))
    expect(screen.getByRole('link', { name: /Ver factura/ })).toHaveAttribute('href', '/ventas/facturas/77/ver')
  })

  it('los descartados muestran el motivo, o «Descartado»', async () => {
    conBandeja(resueltos)
    montar()
    await userEvent.click(await screen.findByRole('tab', { name: 'Descartados' }))
    expect(screen.getByText('se cobró por fuera')).toBeInTheDocument()
    expect(within(screen.getByText('Sin Motivo SA').closest('tr') as HTMLElement).getByText('Descartado')).toBeInTheDocument()
  })

  it('una pestaña vacía lo dice', async () => {
    conBandeja({})
    montar()
    await userEvent.click(await screen.findByRole('tab', { name: 'Descartados' }))
    expect(screen.getByText('Todavía no hay nada acá.')).toBeInTheDocument()
  })
})

describe('lo que es del producto', () => {
  it('monta el router en la ruta que diga el producto', async () => {
    conBandeja({ pendientes: [comprobante()] }, {
      'POST /api/facturacion/pendientes/facturar-prefill': () => json(PREFILL),
    }, '/api/facturacion/pendientes')
    const alFacturar = vi.fn()
    montar({ ruta: '/api/facturacion/pendientes', alFacturar })
    await screen.findByText('Ferretería Demo')
    await userEvent.click(casilla(0))
    await userEvent.click(await screen.findByRole('button', { name: /Facturar/ }))
    await waitFor(() => expect(alFacturar).toHaveBeenCalled())
    expect(pedidas().every((p) => !p.includes('/api/comprobantes-pendientes'))).toBe(true)
  })

  it('el título, la introducción y los orígenes se cambian; la introducción se puede sacar', async () => {
    conBandeja({ pendientes: [comprobante({ origen_tipo: 'reserva' })] })
    montar({
      titulo: 'Por facturar', introduccion: 'Texto del producto.',
      origenes: { reserva: { label: 'Reserva de mesa', icon: Package } },
    })
    expect(await screen.findByText('Reserva de mesa')).toBeInTheDocument()
    expect(screen.getByText('Por facturar')).toBeInTheDocument()
    expect(screen.getByText('Texto del producto.')).toBeInTheDocument()
    expect(screen.queryByText('Comprobantes a facturar')).not.toBeInTheDocument()
    cleanup()

    conBandeja({ pendientes: [comprobante()] })
    montar({ introduccion: null })
    await screen.findByText('Ferretería Demo')
    expect(screen.queryByText(/Lo que otros sistemas dejaron/)).not.toBeInTheDocument()
    // Los orígenes de la familia siguen estando aunque el producto sume los suyos.
    expect(Object.keys(ORIGENES_DE_COMPROBANTE)).toEqual(['cuota_contrato', 'incidencia', 'remito', 'presupuesto'])
  })

  it('con `alFacturar` el texto explica el agrupado por cliente', async () => {
    conBandeja({ pendientes: [comprobante()] })
    montar()
    await screen.findByText('Ferretería Demo')
    expect(screen.getByText('mismo cliente').tagName).toBe('STRONG')
  })
})

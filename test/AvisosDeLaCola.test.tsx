// Los avisos de la cola de comprobantes del nodo (ADR-094): «sin CPE válida», el 202 `en_cola` y la etiqueta de estado.
//
// 🔴 Lo que se fija del aviso «sin CPE válida» es que **no se puede perder**: dice en claro que la carga no puede viajar, es
// `role="alert"` (un lector de pantalla lo anuncia sin que nadie lo busque) y aparece en todos los estados en que la CPE todavía no
// salió —en cola, emitiéndose, a revisar, incierta—; con la CPE emitida o sin pedido no dibuja nada.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AvisoEnCola, AvisoSinCpeValida, EtiquetaDePedido } from '../src/AvisosDeLaCola'
import {
  ESTADOS_ABIERTOS, ESTADOS_DE_PEDIDO, TEXTO_SIN_CPE_VALIDA, TONO_DE_ESTADO, type PedidoDeCola, type RespuestaEnCola,
} from '../src/cola-del-nodo'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(cleanup)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function pedido(over: Partial<PedidoDeCola> = {}): PedidoDeCola {
  return {
    id: 1, origen_producto: 'libracargo', origen_instancia: 'nodo-demo-1', origen_tipo: 'cpe', origen_id: '41',
    estado: 'esperando', datos: {}, fecha_ref: '2026-10-22', concepto: 1, intentos: 0, ultimo_error: '', resultado: null,
    revision: 1, created_at: '2026-10-22 09:15:00', updated_at: '2026-10-22 09:15:00', resuelto_at: '', ...over,
  }
}

describe('AvisoSinCpeValida', () => {
  it('🔴 dice en claro que la carga no puede viajar, y es una alerta', () => {
    render(<AvisoSinCpeValida estado="esperando" />)

    const aviso = screen.getByRole('alert')
    expect(aviso).toHaveTextContent('Esta carga todavía no tiene CPE válida: no puede viajar hasta que se emita.')
    expect(aviso).toHaveTextContent('La carta de porte quedó en cola y se emite sola cuando vuelva la conexión.')
    expect(aviso).toBeVisible()
    expect(TEXTO_SIN_CPE_VALIDA).toBe('Esta carga todavía no tiene CPE válida: no puede viajar hasta que se emita.')
  })

  it.each(ESTADOS_ABIERTOS)('aparece con la CPE en «%s»', (estado) => {
    render(<AvisoSinCpeValida estado={estado} />)
    expect(screen.getByRole('alert')).toHaveTextContent(TEXTO_SIN_CPE_VALIDA)
  })

  it.each(['emitido', 'descartado'] as const)('con la CPE «%s» no dibuja nada', (estado) => {
    const { container } = render(<AvisoSinCpeValida estado={estado} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sin pedido ni estado no dibuja nada', () => {
    const { container } = render(<AvisoSinCpeValida />)
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un pedido `a_revisar` muestra además qué dijo ARCA y manda a la cola', () => {
    render(<AvisoSinCpeValida pedido={pedido({ estado: 'a_revisar', ultimo_error: 'ARCA rechazó: el CUIT del chofer no es válido.' })} />)

    const aviso = screen.getByRole('alert')
    expect(aviso).toHaveTextContent('ARCA no la aceptó o falló la emisión: hay que revisarla en la cola de comprobantes.')
    expect(aviso).toHaveTextContent('ARCA rechazó: el CUIT del chofer no es válido.')
  })

  it('un pedido `incierto` dice que no se sabe si ARCA la emitió', () => {
    render(<AvisoSinCpeValida pedido={pedido({ estado: 'incierto' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se sabe si ARCA llegó a emitirla')
  })

  it('un `esperando` no muestra el error técnico: la espera ya se explica sola', () => {
    render(<AvisoSinCpeValida pedido={pedido({ estado: 'esperando', ultimo_error: 'Sin conexión con el central' })} />)
    expect(screen.getByRole('alert')).not.toHaveTextContent('Sin conexión con el central')
  })

  it('con `origenId` busca solo la CPE abierta de esa carga en la cola del nodo', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({
      es_nodo: true, en_linea: false, node_id: 'n', cuentas: {}, a_revisar: 0,
      pedidos: [pedido({ id: 5, origen_id: '99', estado: 'esperando' }), pedido({ id: 6, origen_id: '41', estado: 'incierto' })],
    })))
    render(<AvisoSinCpeValida origenId={41} intervaloMs={0} />)

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveAttribute('data-estado', 'incierto')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/nodo/cola?')
    expect(url).toContain('tipo=cpe')
    expect(url).toContain('estado=esperando')
    expect(url).toContain('estado=incierto')
  })

  it('🔑 LibraCargo arma el `origen_id` como «orden41:<uuid>»: ahí se reconoce la carga por `coincide` (con `datos.orden_id`)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({
      es_nodo: true, en_linea: false, node_id: 'n', cuentas: {}, a_revisar: 0,
      pedidos: [
        pedido({ id: 5, origen_id: 'orden99:a1b2', datos: { orden_id: 99 }, estado: 'esperando' }),
        pedido({ id: 6, origen_id: 'orden41:c3d4', datos: { orden_id: 41 }, estado: 'a_revisar', ultimo_error: 'ARCA rechazó la patente.' }),
      ],
    })))
    const { unmount } = render(<AvisoSinCpeValida origenId={41} intervaloMs={0} />)
    // Con el `origenId` pelado no la encuentra: el `origen_id` no es el de la orden.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
    unmount()

    render(<AvisoSinCpeValida coincide={(p) => p.datos.orden_id === 41} intervaloMs={0} />)
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveAttribute('data-estado', 'a_revisar')
    expect(aviso).toHaveTextContent('ARCA rechazó la patente.')
  })

  it('con `origenId` sin pedido abierto (o ya emitida) no dibuja nada', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ es_nodo: true, en_linea: true, node_id: 'n', cuentas: {}, a_revisar: 0, pedidos: [pedido({ origen_id: '7' })] })))
    const { container } = render(<AvisoSinCpeValida origenId={41} intervaloMs={0} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('fuera de un nodo o si la cola no contesta, no avisa lo que no sabe', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'Not Found' }, 404)))
    const { container } = render(<AvisoSinCpeValida origenId={41} intervaloMs={0} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('con el `pedido` a mano no consulta nada', () => {
    render(<AvisoSinCpeValida pedido={pedido()} origenId={41} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('AvisoEnCola', () => {
  it('sin aviso no dibuja nada', () => {
    const { container } = render(<AvisoEnCola aviso={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('una factura en cola dice «Se emite al volver la conexión.» y es un estado, no una alerta', () => {
    const aviso: RespuestaEnCola = { en_cola: true, estado: 'esperando', pedido_id: 3, mensaje: 'Sin conexión: la factura queda en la cola y se emite sola cuando vuelva la conexión.' }
    render(<AvisoEnCola aviso={aviso} />)

    const el = screen.getByRole('status')
    expect(el).toHaveTextContent('Se emite al volver la conexión.')
    expect(el).not.toHaveTextContent('CPE')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('🔴 una CPE en cola es una alerta y dice que el camión no puede viajar', () => {
    render(<AvisoEnCola aviso={{ codigo: 'cpe_en_cola', estado: 'esperando', pedido_id: 4, mensaje: 'x', motivo: 'Sin conexión con el central' }} />)

    const el = screen.getByRole('alert')
    expect(el).toHaveTextContent('Se emite al volver la conexión.')
    expect(el).toHaveTextContent('Hasta que se emita, esta carga no tiene CPE válida: no puede viajar.')
    expect(el).toHaveTextContent('Sin conexión con el central')
  })

  it('el `codigo` «en_cola» de LibraCargo se muestra igual que el `en_cola: true` de LibraClub', () => {
    render(<AvisoEnCola aviso={{ codigo: 'en_cola', estado: 'esperando' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Se emite al volver la conexión.')
  })

  it('un pedido que quedó para revisar muestra el mensaje del emisor', () => {
    render(<AvisoEnCola aviso={{ en_cola: true, estado: 'a_revisar', mensaje: 'ARCA rechazó la factura: CUIT inválido.' }} />)
    const el = screen.getByRole('status')
    expect(el).toHaveTextContent('Quedó en la cola para revisar.')
    expect(el).toHaveTextContent('ARCA rechazó la factura: CUIT inválido.')
  })

  it('se cierra con el botón, si el producto pasa `onCerrar`', async () => {
    const onCerrar = vi.fn()
    const { rerender } = render(<AvisoEnCola aviso={{ en_cola: true }} />)
    expect(screen.queryByRole('button')).toBeNull()

    rerender(<AvisoEnCola aviso={{ en_cola: true }} onCerrar={onCerrar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })
})

describe('EtiquetaDePedido', () => {
  it('cada estado tiene su rótulo y un tono', () => {
    const rotulos = ESTADOS_DE_PEDIDO.map((estado) => {
      const { unmount } = render(<EtiquetaDePedido estado={estado} />)
      const texto = document.querySelector(`[data-estado="${estado}"]`)?.textContent
      unmount()
      return texto
    })
    expect(rotulos).toEqual(['En cola', 'Emitiéndose', 'Emitido', 'A revisar', 'Incierto', 'Descartado'])
    // Lo que pide a una persona es rojo; lo que sólo espera, ámbar; lo emitido, verde.
    expect(TONO_DE_ESTADO).toMatchObject({ a_revisar: 'negativo', incierto: 'negativo', esperando: 'atencion', emitido: 'ok' })
  })
})

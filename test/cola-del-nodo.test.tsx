// La lógica de la cola de comprobantes del nodo (ADR-094): el manejo del 202 `en_cola` y de los 409 del nodo con el cliente HTTP del
// kit, los helpers de pedidos y el hook que lee `GET /api/nodo/cola`.
//
// 🔑 Del 202 se fija que **no es un error y no se confunde con el comprobante emitido**: `api.post` lo devuelve como cualquier 2xx, y
// lo que decide si hay que mostrar «Se emite al volver la conexión» es el cuerpo, en las dos formas que contestan los productos.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../src/api-client'
import {
  CODIGO_CONFIRMACION_REQUERIDA, CODIGO_SOLO_EN_EL_CENTRAL, ESTADOS_ABIERTOS, INTERVALO_COLA_MS, comprobantesEnCola, cpeSinEmitir,
  esCpeEnCola, esRespuestaEnCola, estaAbierto, pedidoDeCpeAbierto, pideRevision, resultadoDelPedido, rutaDeLaCola,
  useAvisoDeEnCola, useColaDelNodo, type PedidoDeCola,
} from '../src/cola-del-nodo'
import { CODIGO_SIN_CONEXION, codigoDelError } from '../src/nodo-offline'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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
const cola = (pedidos: PedidoDeCola[], over: Record<string, unknown> = {}) =>
  ({ es_nodo: true, en_linea: true, node_id: 'nodo-demo-1', cuentas: {}, a_revisar: 0, pedidos, ...over })

describe('el 202 `en_cola`', () => {
  it('🔑 `api.post` lo devuelve como cualquier 2xx (no lanza) y el cuerpo dice que quedó en la cola — LibraClub', async () => {
    // Lo que contesta `POST /api/reservas/{id}/facturar` en un nodo sin conexión (libraclub ADR-023).
    fetchMock.mockResolvedValue(json({ en_cola: true, estado: 'esperando', pedido_id: 7, mensaje: 'Sin conexión: la factura queda en la cola.' }, 202))

    const r = await api.post('/api/reservas/9/facturar')

    expect(esRespuestaEnCola(r)).toBe(true)
    expect(esCpeEnCola(r as never)).toBe(false)
  })

  it('LibraCargo lo contesta con `codigo`: `en_cola` una factura, `cpe_en_cola` una carta de porte', async () => {
    fetchMock.mockResolvedValueOnce(json({ codigo: 'en_cola', mensaje: 'x', pedido_id: 1, estado: 'esperando', motivo: '' }, 202))
    fetchMock.mockResolvedValueOnce(json({ codigo: 'cpe_en_cola', mensaje: 'x', pedido_id: 2, estado: 'esperando', motivo: '' }, 202))

    const factura = await api.post('/api/comprobantes/desde-ordenes')
    const cpe = await api.post('/api/cartas-porte/emision/emitir')

    expect(esRespuestaEnCola(factura)).toBe(true)
    expect(esCpeEnCola(factura as never)).toBe(false)
    expect(esRespuestaEnCola(cpe)).toBe(true)
    expect(esCpeEnCola(cpe as never)).toBe(true)
  })

  it('el comprobante emitido (201) NO es una respuesta en cola', () => {
    expect(esRespuestaEnCola({ id: 5, tipo: 'B', numero: 12, cae: '123', total: 100 })).toBe(false)
    expect(esRespuestaEnCola({ en_cola: false })).toBe(false)
    expect(esRespuestaEnCola({ codigo: 'solo_en_el_central' })).toBe(false)
    expect(esRespuestaEnCola(null)).toBe(false)
    expect(esRespuestaEnCola(undefined)).toBe(false)
    expect(esRespuestaEnCola('en_cola')).toBe(false)
  })

  it('`useAvisoDeEnCola.registrar` guarda el aviso y avisa si era un 202; con un comprobante emitido no guarda nada', () => {
    const { result } = renderHook(() => useAvisoDeEnCola())
    expect(result.current.aviso).toBeNull()

    let enCola = true
    act(() => { enCola = result.current.registrar({ id: 5, cae: '123' }) })
    expect(enCola).toBe(false)
    expect(result.current.aviso).toBeNull()

    act(() => { enCola = result.current.registrar({ en_cola: true, estado: 'esperando' }) })
    expect(enCola).toBe(true)
    expect(result.current.aviso).toEqual({ en_cola: true, estado: 'esperando' })

    act(() => result.current.cerrar())
    expect(result.current.aviso).toBeNull()
  })
})

describe('los 409 del nodo con `detail.mensaje`', () => {
  it.each([
    [CODIGO_SOLO_EN_EL_CENTRAL, 'Este dato sólo se cambia desde el central.'],
    [CODIGO_SIN_CONEXION, 'Sin conexión: la cancelación de una reserva de la web espera a la conexión.'],
  ])('«%s»: el cliente HTTP muestra el `mensaje`, no «[object Object]» ni «Conflict»', async (codigo, mensaje) => {
    fetchMock.mockResolvedValue(json({ detail: { codigo, mensaje } }, 409))

    const error = await api.post('/api/reservas/9/estado', { estado: 'cancelada' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).detail).toBe(mensaje)
    expect((error as ApiError).message).toBe(mensaje)
    expect(codigoDelError(error)).toBe(codigo)
  })

  it('el 422 `confirmacion_requerida` de reintentar un `incierto` también trae su mensaje', async () => {
    fetchMock.mockResolvedValue(json({ detail: { codigo: CODIGO_CONFIRMACION_REQUERIDA, mensaje: 'No se sabe si ARCA lo emitió.' } }, 422))

    const error = await api.post('/api/nodo/cola/3/reintentar', {}).catch((e: unknown) => e)

    expect((error as ApiError).detail).toBe('No se sabe si ARCA lo emitió.')
    expect(codigoDelError(error)).toBe('confirmacion_requerida')
  })
})

describe('los pedidos', () => {
  it('abierto es lo que todavía no salió; revisión es lo que pide a una persona', () => {
    expect(ESTADOS_ABIERTOS.every((e) => estaAbierto(e))).toBe(true)
    expect(estaAbierto('emitido')).toBe(false)
    expect(estaAbierto('descartado')).toBe(false)
    expect(estaAbierto(undefined)).toBe(false)
    expect(pideRevision('a_revisar')).toBe(true)
    expect(pideRevision('incierto')).toBe(true)
    expect(pideRevision('esperando')).toBe(false)
  })

  it('`cpeSinEmitir` deja las CPE abiertas; `pedidoDeCpeAbierto` busca la de una carga (el id viaja como texto)', () => {
    const pedidos = [
      pedido({ id: 1, origen_id: '41', estado: 'emitido' }),
      pedido({ id: 2, origen_id: '41', estado: 'esperando' }),
      pedido({ id: 3, origen_id: '41', estado: 'incierto' }),
      pedido({ id: 4, origen_tipo: 'documento', origen_id: '41' }),
      pedido({ id: 5, origen_id: '50', estado: 'a_revisar' }),
    ]
    expect(cpeSinEmitir(pedidos).map((p) => p.id)).toEqual([2, 3, 5])
    // Con dos abiertos de la misma carga, el más nuevo.
    expect(pedidoDeCpeAbierto(pedidos, 41)?.id).toBe(3)
    expect(pedidoDeCpeAbierto(pedidos, '50')?.id).toBe(5)
    expect(pedidoDeCpeAbierto(pedidos, 99)).toBeUndefined()
    // Con una función, para el producto que arma el `origen_id` de otra forma (`orden41:<uuid>` en LibraCargo).
    const deCargo = [pedido({ id: 8, origen_id: 'orden41:c3d4', datos: { orden_id: 41 } })]
    expect(pedidoDeCpeAbierto(deCargo, 41)).toBeUndefined()
    expect(pedidoDeCpeAbierto(deCargo, (p) => p.datos.orden_id === 41)?.id).toBe(8)
  })

  it('`resultadoDelPedido` resume el CTG o la factura', () => {
    expect(resultadoDelPedido({ origen_tipo: 'cpe', resultado: { ctg: '10123456789' } })).toBe('CTG 10123456789')
    expect(resultadoDelPedido({ origen_tipo: 'documento', resultado: { factura_id: 41, cae: '7412' } })).toBe('Factura 41 · CAE 7412')
    expect(resultadoDelPedido({ origen_tipo: 'documento', resultado: { factura_id: 41 } })).toBe('Factura 41')
    expect(resultadoDelPedido({ origen_tipo: 'cpe', resultado: null })).toBe('')
    expect(resultadoDelPedido({ origen_tipo: 'cpe', resultado: { otra: 1 } })).toBe('')
  })

  it('los plurales', () => {
    expect(comprobantesEnCola(1)).toBe('1 comprobante en cola')
    expect(comprobantesEnCola(3)).toBe('3 comprobantes en cola')
  })

  it('la ruta lleva los filtros que entiende el motor (`estado` repetido, `tipo`, `limite`)', () => {
    expect(rutaDeLaCola({})).toBe('/api/nodo/cola')
    expect(rutaDeLaCola({ estados: ['esperando', 'incierto'], tipo: 'cpe', limite: 50 })).toBe('/api/nodo/cola?estado=esperando&estado=incierto&tipo=cpe&limite=50')
    expect(rutaDeLaCola({ ruta: '/api/otra' })).toBe('/api/otra')
  })
})

describe('useColaDelNodo', () => {
  it('lee la cola y devuelve los pedidos', async () => {
    fetchMock.mockResolvedValue(json(cola([pedido()], { a_revisar: 0, cuentas: { esperando: 1 } })))
    const { result } = renderHook(() => useColaDelNodo({ intervaloMs: 0 }))

    expect(result.current.cargando).toBe(true)
    await waitFor(() => expect(result.current.disponible).toBe(true))
    expect(result.current.cargando).toBe(false)
    expect(result.current.pedidos).toHaveLength(1)
    expect(result.current.cola?.cuentas).toEqual({ esperando: 1 })
    expect(result.current.error).toBeNull()
  })

  it('fuera de un nodo (`es_nodo: false`) no está disponible', async () => {
    fetchMock.mockResolvedValue(json({ es_nodo: false, en_linea: true, node_id: null, cuentas: {}, a_revisar: 0, pedidos: [] }))
    const { result } = renderHook(() => useColaDelNodo({ intervaloMs: 0 }))
    await waitFor(() => expect(result.current.disponible).toBe(false))
    expect(result.current.cola).toBeNull()
    expect(result.current.pedidos).toEqual([])
  })

  it('un 404 o 405 (el producto no monta la ruta) tampoco es un error', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'Not Found' }, 404))
    const { result } = renderHook(() => useColaDelNodo({ intervaloMs: 0 }))
    await waitFor(() => expect(result.current.disponible).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('un 500 o un corte de red avisa y deja lo último que se supo', async () => {
    fetchMock.mockResolvedValueOnce(json(cola([pedido()])))
    const { result } = renderHook(() => useColaDelNodo({ intervaloMs: 0 }))
    await waitFor(() => expect(result.current.pedidos).toHaveLength(1))

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => { await result.current.recargar() })

    expect(result.current.error).toBe('Error de conexión.')
    expect(result.current.pedidos).toHaveLength(1)
    expect(result.current.disponible).toBe(true)
  })

  it('pide con los filtros, y un arreglo nuevo en cada render no rehace la consulta', async () => {
    fetchMock.mockResolvedValue(json(cola([])))
    const { rerender } = renderHook(() => useColaDelNodo({ intervaloMs: 0, tipo: 'cpe', estados: ['esperando', 'a_revisar'] }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender()
    rerender()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/nodo/cola?estado=esperando&estado=a_revisar&tipo=cpe')
  })

  it('`habilitada: false` no pide nada', async () => {
    const { result } = renderHook(() => useColaDelNodo({ habilitada: false }))
    await act(async () => { await result.current.recargar() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.cargando).toBe(false)
    expect(result.current.disponible).toBeNull()
  })

  it('repite cada `INTERVALO_COLA_MS` y deja de hacerlo al desmontar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock.mockImplementation(() => Promise.resolve(json(cola([]))))
    const { unmount } = renderHook(() => useColaDelNodo())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_COLA_MS) })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_COLA_MS * 3) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('la respuesta lenta de una consulta vieja no pisa a la más nueva', async () => {
    let soltarLaVieja: (r: Response) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolver) => { soltarLaVieja = resolver }))
    const { result } = renderHook(() => useColaDelNodo({ intervaloMs: 0 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fetchMock.mockResolvedValueOnce(json(cola([pedido({ id: 2, estado: 'emitiendo' })])))
    await act(async () => { await result.current.recargar() })
    expect(result.current.pedidos.map((p) => p.id)).toEqual([2])

    await act(async () => { soltarLaVieja(json(cola([pedido({ id: 1 })]))) })
    expect(result.current.pedidos.map((p) => p.id)).toEqual([2])
  })
})

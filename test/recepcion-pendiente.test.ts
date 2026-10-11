// El almacén del intento incierto de «Recibir mercadería» (ADR-045): la memoria de la pestaña manda, `sessionStorage` recupera tras una recarga, y guardar falla cerrado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../src/api-client'
import {
  _reiniciarRecepcionesEnMemoria, esResultadoDefinitivo, guardarRecepcionPendiente, leerRecepcionPendiente, quitarRecepcionPendiente,
  type RecepcionPendiente,
} from '../src/comercio/recepcion-pendiente'

const CLAVE_DE_ALMACEN = 'libra-ui:compras:recepciones-pendientes'
const intento = (clave: string, ordenId = 10): RecepcionPendiente => ({
  creado: 1_700_000_000_000,
  cuerpo: {
    proveedor_id: 1, purchase_order_id: ordenId, document_reference: null, deposito_id: 1, clave_operacion: clave,
    items: [{ item_id: 1, quantity: '10', unit_cost: '900' }],
  },
})

beforeEach(() => {
  _reiniciarRecepcionesEnMemoria()
  sessionStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('recepcion-pendiente', () => {
  it('guarda el cuerpo completo con su clave, uno por orden, y lo devuelve igual', () => {
    expect(guardarRecepcionPendiente(10, intento('a'))).toBe(true)
    expect(guardarRecepcionPendiente(11, intento('b', 11))).toBe(true)
    expect(leerRecepcionPendiente(10)).toEqual(intento('a'))
    expect(leerRecepcionPendiente(11)?.cuerpo.clave_operacion).toBe('b')
    expect(leerRecepcionPendiente(12)).toBeNull()
    // Reenviar guarda el mismo intento otra vez: sigue siendo uno solo por orden.
    expect(guardarRecepcionPendiente(10, intento('a'))).toBe(true)
    expect(Object.keys(JSON.parse(sessionStorage.getItem(CLAVE_DE_ALMACEN)!))).toEqual(['10', '11'])
  })

  it('tras una recarga (memoria vacía) se recupera de sessionStorage', () => {
    guardarRecepcionPendiente(10, intento('a'))
    _reiniciarRecepcionesEnMemoria()
    expect(leerRecepcionPendiente(10)).toEqual(intento('a'))
  })

  it('quitar limpia la memoria y el storage, y lo quitado no resucita aunque el storage no se pueda escribir', () => {
    guardarRecepcionPendiente(10, intento('a'))
    quitarRecepcionPendiente(10)
    expect(leerRecepcionPendiente(10)).toBeNull()
    expect(JSON.parse(sessionStorage.getItem(CLAVE_DE_ALMACEN)!)).toEqual({})

    guardarRecepcionPendiente(10, intento('b'))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cuota', 'QuotaExceededError') })
    quitarRecepcionPendiente(10)                       // el borrado no se pudo persistir...
    expect(leerRecepcionPendiente(10)).toBeNull()      // ...pero lo viejo del storage no lo resucita
  })

  it('guardar FALLA CERRADO: si no queda en el storage devuelve false y no queda como pendiente', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cuota', 'QuotaExceededError') })
    expect(guardarRecepcionPendiente(10, intento('a'))).toBe(false)
    expect(leerRecepcionPendiente(10)).toBeNull()
    setItem.mockRestore()
    expect(guardarRecepcionPendiente(10, intento('a'))).toBe(true)
  })

  it('un storage ilegible o con otra forma cuenta como vacío', () => {
    sessionStorage.setItem(CLAVE_DE_ALMACEN, '{no es json')
    expect(leerRecepcionPendiente(10)).toBeNull()
    sessionStorage.setItem(CLAVE_DE_ALMACEN, JSON.stringify({ 10: { creado: 1, cuerpo: { clave_operacion: '' } }, 11: 'basura' }))
    expect(leerRecepcionPendiente(10)).toBeNull()
    expect(leerRecepcionPendiente(11)).toBeNull()
  })

  it('sólo es definitivo (no se escribió) un 4xx menos el 408, o el 503 de la migración 0006; red, 5xx, 408 y otro 503 son inciertos', () => {
    const e = (status: number, detail = 'x') => new ApiError(status, detail)
    expect(esResultadoDefinitivo(e(409))).toBe(true)
    expect(esResultadoDefinitivo(e(422))).toBe(true)
    expect(esResultadoDefinitivo(e(404))).toBe(true)
    expect(esResultadoDefinitivo(e(408))).toBe(false)
    expect(esResultadoDefinitivo(e(500))).toBe(false)
    expect(esResultadoDefinitivo(e(502))).toBe(false)
    expect(esResultadoDefinitivo(e(503, 'Service Unavailable'))).toBe(false)
    expect(esResultadoDefinitivo(e(503, 'Falta la revisión 0006_clave_operacion_recepciones del motor: corré `libracommerce-migrar upgrade` (--prefijo del producto)'))).toBe(true)
    expect(esResultadoDefinitivo(new TypeError('sin red'))).toBe(false)
  })
})

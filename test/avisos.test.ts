// Los helpers de `avisos.ts` (ADR-097): el cuerpo del PUT, el enmascarado del destino y las URLs del cliente.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clienteDeAvisos, cuerpoParaGuardar, enmascararDestino, estadoDeWhatsApp, etiquetaDeTipoPorDefecto } from '../src/avisos'

const datos = { modo: 'evolution', url: ' https://e.test ', instancia: ' club ' }

describe('cuerpoParaGuardar', () => {
  it('🔴 OMITE la apikey si no se tipeó nada (vacío o sólo espacios)', () => {
    expect('apikey' in cuerpoParaGuardar(datos, '', false)).toBe(false)
    expect('apikey' in cuerpoParaGuardar(datos, '   ', false)).toBe(false)
  })
  it('recorta la URL y la instancia y manda el modo', () => {
    expect(cuerpoParaGuardar(datos, '', false)).toEqual({ modo: 'evolution', url: 'https://e.test', instancia: 'club' })
  })
  it('manda la apikey tipeada, recortada', () => {
    expect(cuerpoParaGuardar(datos, ' abc ', false).apikey).toBe('abc')
  })
  it('quitar le gana a lo tipeado y no manda apikey', () => {
    const c = cuerpoParaGuardar(datos, 'abc', true)
    expect(c.quitar_apikey).toBe(true)
    expect('apikey' in c).toBe(false)
  })
})

describe('enmascararDestino', () => {
  it('de un teléfono deja los últimos cuatro dígitos', () => {
    expect(enmascararDestino('5491155551234')).toBe('••••••••1234')
    expect(enmascararDestino('+54 9 11 5555-1234')).toBe('••••••••1234')
  })
  it('de un mail deja la primera letra y el dominio', () => {
    expect(enmascararDestino('ana.perez@club.test')).toBe('a•••@club.test')
  })
  it('lo vacío es un guion y lo muy corto no deja nada a la vista', () => {
    expect(enmascararDestino('')).toBe('—')
    expect(enmascararDestino('123')).toBe('••••')
  })
})

describe('etiquetaDeTipoPorDefecto', () => {
  it('deja legible el tipo del producto', () => {
    expect(etiquetaDeTipoPorDefecto('recordatorio_24h')).toBe('Recordatorio 24h')
    expect(etiquetaDeTipoPorDefecto('')).toBe('—')
  })
})

describe('estadoDeWhatsApp', () => {
  const base = { modo: 'registro', modos: [], url: '', instancia: '', apikey_cargada: false, disponible: true, motivo: '' }
  it('un modo por cada caso', () => {
    expect(estadoDeWhatsApp({ ...base, modo: 'apagado', disponible: false, motivo: 'WhatsApp está apagado.' }).tono).toBe('neutro')
    expect(estadoDeWhatsApp(base).tono).toBe('curso')
    expect(estadoDeWhatsApp({ ...base, modo: 'evolution' }).tono).toBe('ok')
    expect(estadoDeWhatsApp({ ...base, modo: 'evolution', disponible: false, motivo: 'Falta la URL.' })).toMatchObject({ tono: 'atencion', detalle: 'Falta la URL.' })
  })
})

describe('clienteDeAvisos', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('arma las rutas y la query sin los filtros vacíos', async () => {
    const f = vi.fn(() => Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })))
    vi.stubGlobal('fetch', f)
    await clienteDeAvisos().envios({ canal: 'email', estado: '', tipo: undefined, limite: 50 })
    await clienteDeAvisos('/x/avisos').envios()
    await clienteDeAvisos().probar('1155551234')
    expect(f.mock.calls.map((c) => [(c as unknown[])[0], ((c as unknown[])[1] as RequestInit).method])).toEqual([
      ['/api/avisos/envios?canal=email&limite=50', 'GET'],
      ['/x/avisos/envios', 'GET'],
      ['/api/avisos/probar', 'POST'],
    ])
  })
})

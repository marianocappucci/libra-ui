// El buscador de la familia (tabla, select con buscador y etiquetas de gondola)
// ignora los separadores entre numeros: un CUIT se guarda con guiones en un
// producto y sin ellos en otro, y se teclea de las dos formas. ADR-032.
import { describe, expect, it } from 'vitest'
import { coincideBusqueda, sinSeparadoresNumericos } from '../src/utils'

describe('coincideBusqueda con CUIT y numeros', () => {
  it('encuentra un CUIT guardado con guiones tecleandolo sin guiones', () => {
    expect(coincideBusqueda('Agro Norte SA 20-12345678-6', '20123456786')).toBe(true)
    expect(coincideBusqueda('Agro Norte SA 20-12345678-6', '2012345678')).toBe(true)
  })

  it('encuentra un CUIT guardado sin guiones tecleandolo con guiones', () => {
    expect(coincideBusqueda('Agro Norte SA 20123456786', '20-12345678-6')).toBe(true)
    expect(coincideBusqueda('Agro Norte SA 20123456786', '20-1234')).toBe(true)
  })

  it('tal cual sigue andando', () => {
    expect(coincideBusqueda('Agro Norte SA 20-12345678-6', '20-12345678')).toBe(true)
  })

  it('un CUIT que no esta no coincide', () => {
    expect(coincideBusqueda('Agro Norte SA 20-12345678-6', '27999')).toBe(false)
  })

  it('importes con puntos de miles', () => {
    expect(coincideBusqueda('Flete $ 1.580.000,00', '1580000')).toBe(true)
  })

  it('mezcla nombre y CUIT, en cualquier orden y sin acentos', () => {
    expect(coincideBusqueda('Agronomía del Sur 30-12345678-1', '3012345678 agronomia')).toBe(true)
  })

  it('no une numeros separados por espacios ni letras', () => {
    expect(coincideBusqueda('Lote 20 y 12', '2012')).toBe(false)
    expect(sinSeparadoresNumericos('20-ab-12')).toBe('20-ab-12')
  })

  it('saca guiones, puntos y barras sólo entre digitos', () => {
    expect(sinSeparadoresNumericos('20-12.345/6 a-b')).toBe('20123456 a-b')
  })
})

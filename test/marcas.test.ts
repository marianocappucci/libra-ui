// La marca dibujada de cada producto (ADR-034, v0.124.0) y de LibraEdge, el complemento de la suite (ADR-078, v0.164.0).
//
// Además de mirar que cada SVG esté bien armado, este test es el guardián de los archivos de `marcas/`: las landings (`libra-web-kit`) y LibraSuite
// los copian, así que tienen que ser exactamente lo que devuelve `svgDeMarca`. Si cambia un dibujo, `npm run marcas` los regenera (corre este mismo
// archivo con `ACTUALIZAR_MARCAS=1`) y el diff de los `.svg` entra en el mismo commit.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IDENTIDAD, type Producto } from '../src/identidad'
import { MARCAS, datosDeMarca, faviconDeMarca, svgDeMarca, type Marca, type VarianteDeMarca } from '../src/marcas'

const PRODUCTOS = MARCAS
const VARIANTES: VarianteDeMarca[] = ['icono', 'favicon']
const CARPETA = join(__dirname, '..', 'marcas')
const archivo = (p: Marca, v: VarianteDeMarca) => join(CARPETA, v === 'icono' ? `${p}.svg` : `${p}-favicon.svg`)

if (process.env.ACTUALIZAR_MARCAS) {
  for (const p of PRODUCTOS) for (const v of VARIANTES) writeFileSync(archivo(p, v), svgDeMarca(p, v) + '\n')
}

const parsear = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml')

describe.each(VARIANTES)('svgDeMarca, variante %s', (variante) => {
  it.each(PRODUCTOS)('%s es un SVG bien formado de 120 × 120', (p) => {
    const doc = parsear(svgDeMarca(p, variante))
    expect(doc.querySelector('parsererror')).toBeNull()
    const raiz = doc.documentElement
    expect(raiz.tagName).toBe('svg')
    expect(raiz.getAttribute('viewBox')).toBe('0 0 120 120')
  })

  it.each(PRODUCTOS)('🔴 %s: el fondo es el cuadrado redondeado del color de MARCA', (p) => {
    const fondo = parsear(svgDeMarca(p, variante)).querySelector('svg > rect')!
    expect(fondo.getAttribute('width')).toBe('120')
    expect(fondo.getAttribute('fill')).toBe(datosDeMarca(p).color)
    expect(Number(fondo.getAttribute('rx'))).toBeGreaterThan(0)
  })

  it.each(PRODUCTOS)('%s lleva el nombre del producto como <title>', (p) => {
    expect(parsear(svgDeMarca(p, variante)).querySelector('title')?.textContent).toBe(datosDeMarca(p).nombre)
  })

  it.each(PRODUCTOS)('%s es compacto: sin saltos de línea ni `undefined` colado de un tono faltante', (p) => {
    const svg = svgDeMarca(p, variante)
    expect(svg).not.toContain('\n')
    expect(svg).not.toContain('undefined')
  })
})

describe('las dos variantes', () => {
  it.each(PRODUCTOS)('🔴 %s: el favicon es otro dibujo, no el ícono achicado', (p) => {
    expect(svgDeMarca(p, 'favicon')).not.toBe(svgDeMarca(p, 'icono'))
  })

  it('🔴 los diez dibujos son distintos entre sí', () => {
    for (const v of VARIANTES) {
      const dibujos = PRODUCTOS.map((p) => svgDeMarca(p, v).replace(/<title>.*?<\/title>/, '').replaceAll(datosDeMarca(p).color, ''))
      expect(new Set(dibujos).size).toBe(PRODUCTOS.length)
    }
  })

  it('por defecto es el ícono', () => {
    expect(svgDeMarca('medlibra')).toBe(svgDeMarca('medlibra', 'icono'))
  })

  it('faviconDeMarca es el SVG del favicon como data URL', () => {
    const url = faviconDeMarca('libracargo')
    expect(url.startsWith('data:image/svg+xml,')).toBe(true)
    expect(decodeURIComponent(url.slice('data:image/svg+xml,'.length))).toBe(svgDeMarca('libracargo', 'favicon'))
  })
})

describe('🔴 las diez marcas en 3D (ADR-090)', () => {
  const casos = PRODUCTOS.flatMap((p) => VARIANTES.map((v) => [p, v] as const))

  it.each(casos)('%s (%s): la luz va encima del fondo de color y el dibujo lleva sombra', (p, v) => {
    const doc = parsear(svgDeMarca(p, v))
    const [fondo, luz] = Array.from(doc.querySelectorAll('svg > rect'))
    expect(fondo.getAttribute('fill')).toBe(datosDeMarca(p).color)
    expect(luz.getAttribute('fill')).toMatch(/^url\(#.+\)$/)
    expect(doc.querySelector('filter')).not.toBeNull()
  })

  it.each(casos)('%s (%s): sin corte de color liso ni trazos con degradé', (p, v) => {
    const svg = svgDeMarca(p, v)
    expect(svg).not.toContain('paint-order="stroke"')
    expect(svg).not.toMatch(/stroke="url\(/)
  })

  it('los ids de dos marcas distintas no se repiten (van en línea en la misma página)', () => {
    const ids = PRODUCTOS.map((p) => new Set([...svgDeMarca(p).matchAll(/id="([^"]+)"/g)].map((m) => m[1])))
    const todos = ids.flatMap((s) => [...s])
    expect(new Set(todos).size).toBe(todos.length)
  })
})

describe('🔴 los archivos de marcas/ (los que copian las landings)', () => {
  it('son exactamente los dieciocho, uno por marca y variante', () => {
    const esperados = PRODUCTOS.flatMap((p) => VARIANTES.map((v) => archivo(p, v).slice(CARPETA.length + 1))).sort()
    expect(readdirSync(CARPETA).filter((f) => f.endsWith('.svg')).sort()).toEqual(esperados)
  })

  it.each(PRODUCTOS.flatMap((p) => VARIANTES.map((v) => [p, v] as const)))('%s (%s) coincide con svgDeMarca', (p, v) => {
    expect(existsSync(archivo(p, v))).toBe(true)
    expect(readFileSync(archivo(p, v), 'utf8')).toBe(svgDeMarca(p, v) + '\n')
  })
})

describe('LibraEdge, el complemento (ADR-078)', () => {
  const productos = Object.keys(IDENTIDAD) as Producto[]

  it('está entre las marcas pero 🔴 NO en IDENTIDAD: no es una app (sin acento ni theme-color, y la tabla que comparan las landings sigue en ocho)', () => {
    expect(MARCAS).toEqual([...productos, 'libraedge', 'librabot'])
    expect(Object.keys(IDENTIDAD)).not.toContain('libraedge')
  })

  it('🔴 su color de fondo no es el de ninguna de las ocho apps', () => {
    expect(productos.map((p) => IDENTIDAD[p].color)).not.toContain(datosDeMarca('libraedge').color)
  })

  it('🔴 LibraBot (ADR-088) tampoco es una app de IDENTIDAD y su color no es el de ninguna marca', () => {
    expect(Object.keys(IDENTIDAD)).not.toContain('librabot')
    const otros = [...productos.map((p) => IDENTIDAD[p].color), datosDeMarca('libraedge').color]
    expect(otros).not.toContain(datosDeMarca('librabot').color)
    expect(datosDeMarca('librabot')).toEqual({ nombre: 'LibraBot', color: '#e11d48' })
  })

  it('las ocho apps siguen con el nombre y el color de IDENTIDAD', () => {
    for (const p of productos) expect(datosDeMarca(p)).toEqual({ nombre: IDENTIDAD[p].nombre, color: IDENTIDAD[p].color })
  })
})

// La marca dibujada de cada producto (ADR-034, v0.124.0).
//
// Además de mirar que cada SVG esté bien armado, este test es el guardián de los archivos de `marcas/`: las landings (`libra-web-kit`) y LibraSuite
// los copian, así que tienen que ser exactamente lo que devuelve `svgDeMarca`. Si cambia un dibujo, `npm run marcas` los regenera (corre este mismo
// archivo con `ACTUALIZAR_MARCAS=1`) y el diff de los `.svg` entra en el mismo commit.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IDENTIDAD, type Producto } from '../src/identidad'
import { faviconDeMarca, svgDeMarca, type VarianteDeMarca } from '../src/marcas'

const PRODUCTOS = Object.keys(IDENTIDAD) as Producto[]
const VARIANTES: VarianteDeMarca[] = ['icono', 'favicon']
const CARPETA = join(__dirname, '..', 'marcas')
const archivo = (p: Producto, v: VarianteDeMarca) => join(CARPETA, v === 'icono' ? `${p}.svg` : `${p}-favicon.svg`)

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
    expect(fondo.getAttribute('fill')).toBe(IDENTIDAD[p].color)
    expect(Number(fondo.getAttribute('rx'))).toBeGreaterThan(0)
  })

  it.each(PRODUCTOS)('%s lleva el nombre del producto como <title>', (p) => {
    expect(parsear(svgDeMarca(p, variante)).querySelector('title')?.textContent).toBe(IDENTIDAD[p].nombre)
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

  it('🔴 los ocho dibujos son distintos entre sí', () => {
    for (const v of VARIANTES) {
      const dibujos = PRODUCTOS.map((p) => svgDeMarca(p, v).replace(/<title>.*?<\/title>/, '').replaceAll(IDENTIDAD[p].color, ''))
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

describe('🔴 los archivos de marcas/ (los que copian las landings)', () => {
  it('son exactamente los dieciséis, uno por producto y variante', () => {
    const esperados = PRODUCTOS.flatMap((p) => VARIANTES.map((v) => archivo(p, v).slice(CARPETA.length + 1))).sort()
    expect(readdirSync(CARPETA).filter((f) => f.endsWith('.svg')).sort()).toEqual(esperados)
  })

  it.each(PRODUCTOS.flatMap((p) => VARIANTES.map((v) => [p, v] as const)))('%s (%s) coincide con svgDeMarca', (p, v) => {
    expect(existsSync(archivo(p, v))).toBe(true)
    expect(readFileSync(archivo(p, v), 'utf8')).toBe(svgDeMarca(p, v) + '\n')
  })
})

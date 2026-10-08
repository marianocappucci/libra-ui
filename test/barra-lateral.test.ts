// La barra lateral (ADR-042): su fondo, su hover y su borde por defecto son del kit, y ningún producto los vuelve a declarar.
//
// Dos cosas: (1) los valores que el dueño aprobó sobre la maqueta (tono «C») están en `tema.css`, en claro y en oscuro, y el texto y el ítem activo se
// leen sobre ellos con el contraste que se midió; (2) el guard `auditoria-de-barra-lateral` ve lo que dice ver, con hojas de juguete, porque lo copian
// los productos. Lo que este archivo NO puede probar es cómo se ve en un navegador: eso se midió en Chromium y está en el ADR.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  auditarBarraLateral, declaracionesDeLaBarra, describirInfracciones, importaElTemaDelKit, VARIABLES_DE_LA_BARRA,
} from '../src/auditoria-de-barra-lateral'
import { IDENTIDAD, menuActivoDeProducto, type Producto } from '../src/identidad'
import { COLORES_DE_TEMA, contraste, mezclar, validarTema } from '../src/tema'

const CSS = readFileSync(resolve(__dirname, '..', 'src', 'tema.css'), 'utf8')

/** El valor de una variable dentro del bloque de un selector de `tema.css` (`:root` / `.dark`), el último que la declara. */
function valorEn(selector: ':root' | '.dark', variable: string): string | undefined {
  const bloques = [...CSS.matchAll(new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'gm'))].map((m) => m[1])
  let valor: string | undefined
  for (const b of bloques) {
    const m = b.match(new RegExp(`(?<![\\w-])${variable}\\s*:\\s*([^;]+);`))
    if (m) valor = m[1].trim()
  }
  return valor
}

// Los hex de los oklch grises (L³ -> sRGB), medidos con un script aparte; son los que el navegador pinta.
const BARRA = '#ebebeb' // oklch(0.94 0 0)
const HOVER = '#e1e1e1' // oklch(0.91 0 0)
const TEXTO = '#0a0a0a' // --sidebar-foreground: oklch(0.145 0 0)
const CONTENIDO = '#ffffff'

describe('tema.css da el defecto de la barra lateral (tono «C», 2026-10-08)', () => {
  it.each([
    [':root', '--sidebar', 'oklch(0.94 0 0)'],
    [':root', '--sidebar-accent', 'oklch(0.91 0 0)'],
    [':root', '--sidebar-border', 'oklch(0.89 0 0)'],
    ['.dark', '--sidebar', 'oklch(0.205 0 0)'],
    ['.dark', '--sidebar-accent', 'oklch(0.269 0 0)'],
    ['.dark', '--sidebar-border', 'oklch(1 0 0 / 10%)'],
  ] as const)('%s declara %s: %s', (selector, variable, esperado) => {
    expect(valorEn(selector, variable)).toBe(esperado)
  })

  it('declara exactamente las variables que el guard prohíbe en los productos', () => {
    const declaradas = declaracionesDeLaBarra(CSS).map((d) => d.variable)
    expect([...new Set(declaradas)].sort()).toEqual([...VARIABLES_DE_LA_BARRA].sort())
    expect(declaradas).toHaveLength(VARIABLES_DE_LA_BARRA.length * 2) // claro y oscuro
  })

  it('🔴 la barra se distingue del contenido (era 1,04:1 con #fafafa) y el hover de la barra', () => {
    expect(contraste(BARRA, CONTENIDO)).toBeGreaterThanOrEqual(1.15)
    expect(contraste(HOVER, BARRA)).toBeGreaterThanOrEqual(1.09)
  })

  it('🔴 el texto del menú llega a 4,5:1 sobre la barra, sobre el hover y atenuado al 70% (los rótulos de grupo)', () => {
    expect(contraste(TEXTO, BARRA)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(TEXTO, HOVER)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(mezclar(TEXTO, BARRA, 0.3), BARRA)).toBeGreaterThanOrEqual(4.5)
  })

  it('el «de siempre» de Apariencia es el que pinta tema.css, y el catálogo ya no lo trata como de cada producto', () => {
    const def = COLORES_DE_TEMA.find((d) => d.clave === 'barraLateralFondo')!
    expect(def.porDefecto).toBe(BARRA)
    expect(def.defectoPorProducto).toBeUndefined()
    // …y como ya no es de cada producto, un tema que lo trae entero (el defecto) valida.
    expect(validarTema({ barraLateralFondo: def.porDefecto }).errores).toEqual({})
  })
})

describe('el ítem activo sobre la barra nueva', () => {
  const PRODUCTOS = Object.keys(IDENTIDAD) as Producto[]

  it.each(PRODUCTOS)('🔴 %s: el texto del ítem activo llega a 4,5:1 sobre su chip (que ya no depende de la barra)', (p) => {
    const { fondo, texto } = menuActivoDeProducto(p)
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5)
  })

  // Medido: el borde (que mezcla la marca al 45%) baja ~10% de contraste contra la barra más oscura (de 1,61-2,74:1 a 1,41-2,40:1; el más bajo es
  // VentaLibra, ámbar). El chip, en cambio, se despega más (de 1,00-1,07:1 a 1,07-1,15:1, salvo LibraDesk y LibraCargo que quedan en 1,07): las dos cosas juntas se leen igual. Y el piso de
  // ADR-036 —nunca menos que el verde de antes sobre la MISMA barra— lo sigue comprobando `identidad.test.ts` con la barra nueva.
  it.each(PRODUCTOS)('%s: el chip se despega de la barra nueva (>= 1,05:1; pasa de más oscuro a más claro que la barra en LibraDesk, LibraCargo y GestioLibra)', (p) => {
    expect(contraste(menuActivoDeProducto(p).fondo, BARRA)).toBeGreaterThanOrEqual(1.05)
  })

  it.each(PRODUCTOS)('%s: el chip sigue siendo más claro que la barra (se lee como una pastilla, no como un hueco)', (p) => {
    expect(contraste(menuActivoDeProducto(p).fondo, BARRA)).toBeGreaterThanOrEqual(1)
    expect(menuActivoDeProducto(p).fondo.toLowerCase() > BARRA).toBe(true)
  })
})

// ── El guard ────────────────────────────────────────────────────────────────

const tmp: string[] = []
afterEach(() => {
  while (tmp.length) rmSync(tmp.pop() as string, { recursive: true, force: true })
})

function srcDeJuguete(archivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'barra-'))
  tmp.push(dir)
  for (const [ruta, fuente] of Object.entries(archivos)) {
    mkdirSync(join(dir, ruta, '..'), { recursive: true })
    writeFileSync(join(dir, ruta), fuente)
  }
  return dir
}

const IMPORTA = '@import "tailwindcss";\n@import "libra-ui/tema.css";\n'

describe('declaracionesDeLaBarra', () => {
  it.each([
    ':root { --sidebar: oklch(0.985 0 0); }',
    ':root{--sidebar:#fafafa}',
    '.dark {\n  --sidebar: oklch(0.205 0 0);\n}',
    ':root { --sidebar-accent: oklch(0.97 0 0); }',
    ':root { --sidebar-border : oklch(0.922 0 0); }',
    '@layer base { :root { --sidebar: red; } }',
  ])('🔴 ve %j', (css) => {
    expect(declaracionesDeLaBarra(css)).toHaveLength(1)
  })

  it.each([
    ':root { --sidebar-foreground: oklch(0.145 0 0); }',
    ':root { --sidebar-primary: oklch(0.205 0 0); --sidebar-primary-foreground: #fff; }',
    ':root { --sidebar-accent-foreground: oklch(0.205 0 0); --sidebar-ring: oklch(0.708 0 0); }',
    '@theme inline { --color-sidebar: var(--sidebar); --color-sidebar-accent: var(--sidebar-accent); --color-sidebar-border: var(--sidebar-border); }',
    '.panel { background: var(--sidebar); border-color: var(--sidebar-border) }',
    '/* :root { --sidebar: red; } */',
    '/* el viejo\n   --sidebar: oklch(0.985 0 0);\n*/',
  ])('no ve %j', (css) => {
    expect(declaracionesDeLaBarra(css)).toEqual([])
  })

  it('da el número de línea del archivo, también después de un comentario de varias líneas', () => {
    const css = '/* uno\n dos\n tres */\n:root {\n  --radius: 1rem;\n  --sidebar: red;\n}\n'
    expect(declaracionesDeLaBarra(css)).toEqual([{ variable: '--sidebar', linea: 6 }])
  })

  it('ve las tres en claro y en oscuro, que es lo que tenía cada index.css', () => {
    const css = ':root { --sidebar: a; --sidebar-accent: b; --sidebar-border: c; }\n.dark { --sidebar: d; --sidebar-accent: e; --sidebar-border: f; }'
    expect(declaracionesDeLaBarra(css)).toHaveLength(6)
  })
})

describe('importaElTemaDelKit', () => {
  it.each(['@import "libra-ui/tema.css";', "@import 'libra-ui/tema.css';", '@import url("libra-ui/tema.css");'])('🔴 %s sí', (css) => {
    expect(importaElTemaDelKit(css)).toBe(true)
  })
  it.each(['@import "tailwindcss";', '/* @import "libra-ui/tema.css"; */', '@import "libra-ui/otra.css";'])('%s no', (css) => {
    expect(importaElTemaDelKit(css)).toBe(false)
  })
})

describe('auditarBarraLateral', () => {
  it('un producto sin las variables y con el tema del kit pasa, y el control dice que midió', () => {
    const src = srcDeJuguete({ 'index.css': `${IMPORTA}:root { --sidebar-foreground: #0a0a0a; --sidebar-primary: #111; }\n.dark { --sidebar-ring: #888; }\n` })
    const r = auditarBarraLateral(src)
    expect(r.hojas).toBe(1)
    expect(r.importaElTema).toBe(true)
    expect(r.infracciones).toEqual([])
  })

  it('🔴 un producto que vuelve a declarar el fondo falla, y el mensaje dice archivo, línea y variable', () => {
    const src = srcDeJuguete({ 'index.css': `${IMPORTA}:root {\n  --sidebar: oklch(0.985 0 0);\n}\n.dark {\n  --sidebar-border: oklch(1 0 0 / 10%);\n}\n` })
    const r = auditarBarraLateral(src)
    expect(describirInfracciones(r.infracciones)).toEqual([
      'index.css:4: declara --sidebar; quitala: el defecto de la barra lateral es de libra-ui/tema.css (ADR-042)',
      'index.css:7: declara --sidebar-border; quitala: el defecto de la barra lateral es de libra-ui/tema.css (ADR-042)',
    ])
  })

  it('recorre las subcarpetas y salta node_modules y assets', () => {
    const src = srcDeJuguete({
      'index.css': IMPORTA,
      'estilos/barra.css': ':root { --sidebar-accent: red; }',
      'node_modules/x/y.css': ':root { --sidebar: red; }',
      'assets/z.css': ':root { --sidebar: red; }',
    })
    const r = auditarBarraLateral(src)
    expect(r.hojas).toBe(2)
    expect(r.infracciones.map((i) => i.archivo)).toEqual(['estilos/barra.css'])
  })

  it('una excepción explícita (ruta relativa) las deja pasar, y se sigue contando la hoja', () => {
    const src = srcDeJuguete({ 'index.css': IMPORTA, 'tema-propio.css': ':root { --sidebar: red; }' })
    const r = auditarBarraLateral(src, { excepciones: ['tema-propio.css'] })
    expect(r.hojas).toBe(2)
    expect(r.infracciones).toEqual([])
  })

  it('🔴 sin el import del tema el control lo dice (sacar las variables dejaría la barra sin fondo)', () => {
    const src = srcDeJuguete({ 'index.css': '@import "tailwindcss";\n:root { --sidebar-foreground: #000; }\n' })
    expect(auditarBarraLateral(src).importaElTema).toBe(false)
  })

  it('un src sin hojas devuelve cero: el test del producto tiene que exigir `hojas > 0`', () => {
    const src = srcDeJuguete({ 'main.tsx': 'export {}' })
    expect(auditarBarraLateral(src)).toEqual({ hojas: 0, importaElTema: false, infracciones: [] })
  })
})

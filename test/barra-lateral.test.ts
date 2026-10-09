// La barra lateral (ADR-042, grafito desde ADR-043): su fondo, su hover y su borde por defecto son del kit, y ningún producto los vuelve a declarar.
//
// Dos cosas: (1) los valores que el dueño aprobó sobre la maqueta (grafito, «C» de la segunda maqueta) están en `tema.css`, en claro y en oscuro, y el texto y el ítem activo se
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

/** El valor de una variable dentro del bloque de un selector de `tema.css` (`:root:root` / `.dark.dark`), el último que la declara. */
function valorEn(selector: ':root:root' | '.dark.dark', variable: string): string | undefined {
  const bloques = [...CSS.matchAll(new RegExp(`^${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`, 'gm'))].map((m) => m[1])
  let valor: string | undefined
  for (const b of bloques) {
    const m = b.match(new RegExp(`(?<![\\w-])${variable}\\s*:\\s*([^;]+);`))
    if (m) valor = m[1].trim()
  }
  return valor
}

// Los hex de los oklch (OKLab -> sRGB), medidos con un script aparte; son los que el navegador pinta.
const BARRA = '#1c1e22' // oklch(0.235 0.008 265)
const HOVER = '#282a2f' // oklch(0.285 0.01 265)
const BARRA_OSCURA = '#101215' // oklch(0.18 0.008 265)
const HOVER_OSCURO = '#1b1d22' // oklch(0.23 0.01 265)
const TEXTO = '#f4f4f5'
const CONTENIDO = '#ffffff'
const CONTENIDO_OSCURO = '#0a0a0a' // --background oscuro: oklch(0.145 0 0)

describe('tema.css da el defecto de la barra lateral (grafito, ADR-043, 2026-10-09)', () => {
  it.each([
    [':root:root', '--sidebar', 'oklch(0.235 0.008 265)'],
    [':root:root', '--sidebar-accent', 'oklch(0.285 0.01 265)'],
    [':root:root', '--sidebar-border', 'oklch(0.295 0.01 265)'],
    [':root:root', '--sidebar-foreground', TEXTO],
    [':root:root', '--sidebar-accent-foreground', TEXTO],
    ['.dark.dark', '--sidebar', 'oklch(0.18 0.008 265)'],
    ['.dark.dark', '--sidebar-accent', 'oklch(0.23 0.01 265)'],
    ['.dark.dark', '--sidebar-border', 'oklch(0.24 0.01 265)'],
    ['.dark.dark', '--sidebar-foreground', TEXTO],
    ['.dark.dark', '--sidebar-accent-foreground', TEXTO],
  ] as const)('%s declara %s: %s', (selector, variable, esperado) => {
    expect(valorEn(selector, variable)).toBe(esperado)
  })

  it('🔴 el texto de la barra va con especificidad 0,2,0: el `:root` del producto (texto oscuro de la barra clara) no le gana', () => {
    expect(CSS).not.toMatch(/^:root\s*\{[^}]*--sidebar-foreground/m)
    expect(CSS).not.toMatch(/^\.dark\s*\{[^}]*--sidebar-foreground/m)
  })

  it('declara exactamente las variables que el guard prohíbe en los productos', () => {
    const declaradas = declaracionesDeLaBarra(CSS).map((d) => d.variable)
    expect([...new Set(declaradas)].sort()).toEqual([...VARIABLES_DE_LA_BARRA].sort())
    expect(declaradas).toHaveLength(VARIABLES_DE_LA_BARRA.length * 2) // claro y oscuro
  })

  it('🔴 la barra se distingue del contenido en los dos modos, y el hover de la barra', () => {
    expect(contraste(BARRA, CONTENIDO)).toBeGreaterThanOrEqual(10)
    expect(contraste(BARRA_OSCURA, CONTENIDO_OSCURO)).toBeGreaterThanOrEqual(1.05)
    expect(contraste(HOVER, BARRA)).toBeGreaterThanOrEqual(1.09)
    expect(contraste(HOVER_OSCURO, BARRA_OSCURA)).toBeGreaterThanOrEqual(1.09)
  })

  it.each([
    ['claro', BARRA, HOVER],
    ['oscuro', BARRA_OSCURA, HOVER_OSCURO],
  ])('🔴 %s: el texto del menú llega a 4,5:1 sobre la barra, sobre el hover y atenuado al 70% (rótulos, empresa, rol)', (_, barra, hover) => {
    expect(contraste(TEXTO, barra)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(TEXTO, hover)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(mezclar(TEXTO, barra, 0.3), barra)).toBeGreaterThanOrEqual(4.5)
  })

  it('el «de siempre» de Apariencia es el que pinta tema.css, y el catálogo no lo trata como de cada producto', () => {
    const def = COLORES_DE_TEMA.find((d) => d.clave === 'barraLateralFondo')!
    expect(def.porDefecto).toBe(BARRA)
    expect(def.defectoPorProducto).toBeUndefined()
    expect(validarTema({ barraLateralFondo: def.porDefecto }).errores).toEqual({})
  })
})

describe('el ítem activo sobre la barra grafito', () => {
  const PRODUCTOS = Object.keys(IDENTIDAD) as Producto[]

  it.each(PRODUCTOS)('🔴 %s: el texto del ítem activo llega a 4,5:1 sobre su fondo', (p) => {
    const { fondo, texto } = menuActivoDeProducto(p)
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5)
  })

  // La franja no es texto: el piso de WCAG para un componente gráfico es 3:1 (1.4.11). Medido: de 4,50:1 (LibraDesk) a 8,04:1 (VentaLibra) sobre el ítem.
  it.each(PRODUCTOS)('🔴 %s: la franja del color del producto se ve sobre el ítem y sobre la barra, en los dos modos', (p) => {
    const { fondo, borde } = menuActivoDeProducto(p)
    expect(contraste(borde, fondo)).toBeGreaterThanOrEqual(3)
    expect(contraste(borde, BARRA)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(borde, BARRA_OSCURA)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(PRODUCTOS)('%s: el ítem es un punto más claro que la barra (se lee como una pastilla, no como un hueco)', (p) => {
    const { fondo } = menuActivoDeProducto(p)
    expect(contraste(fondo, BARRA)).toBeGreaterThanOrEqual(1.2)
    expect(contraste(fondo, HOVER)).toBeGreaterThan(1)
  })

  it('🔴 la regla del ítem activo pinta una franja a la izquierda, no un marco', () => {
    expect(CSS).toContain('box-shadow: inset 3px 0 0 var(--libra-menu-activo-borde);')
    expect(CSS).not.toContain('inset 0 0 0 1px var(--libra-menu-activo-borde)')
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

// Los desbordes a 390 px que midió el e2e de Contalibra (`navegacion-y-ancho.e2e.ts`, 2026-10-15, kit 0.152.1) y su arreglo de fondo (ADR-067).
// jsdom no mide el layout: lo que se fija son las clases que, medidas en Chromium, dejan el desborde en 0 px (el cómo y el cuánto, en el ADR).
//
// Lo medido (Chromium, ancho del documento a 390 px de ventana; antes → después):
//   /facturas 579 → 375 · /mp-bandeja 670 → 375 · /logs 394 → 375 · /libros-iva 415 → 375 · /facturas/:id 429 → 375 · /turnos/:id 487 → 375
//   /presupuestos/nuevo 405 → 375 · /facturas/nueva 405 → 375 (la de Contalibra, que es una copia del formulario del kit).
// (375 = 390 menos los 15 px que reserva `scrollbar-gutter: stable`: sin desborde.)
//
// Tres defectos, tres causas, y ninguna era la que el e2e suponía para las filas `flex-wrap`:
//   · Pestañas: `TabsList` era `h-9 w-fit` sin wrap y cada pestaña es `whitespace-nowrap`. Se arregla en el componente base.
//   · Tablas: `<table className="w-full text-sm">` suelta, sin contenedor con scroll: la grilla de la pantalla crece al mínimo de la tabla.
//   · Formulario de ítems: la tabla mide 362 px (columnas fijas de cantidad, precio y subtotal) y la tarjeta tiene ~340. NO era el campo `flex-1`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PresupuestoForm } from '../src/PresupuestoForm'
import { LibrosIva } from '../src/comercio/LibrosIva'
import type { LibrosIvaData } from '../src/comercio/tipos'
import { Table } from '../src/ui/table'
import { Tabs, TabsList, TabsTrigger } from '../src/ui/tabs'
import { montar, prepararFetch, responder } from './helpers-pantallas'

const raiz = resolve(__dirname, '..')
const clases = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/)
const tiene = (el: Element | null | undefined, ...esperadas: string[]) => {
  const c = clases(el)
  for (const e of esperadas) expect(c, `falta la clase «${e}» en <${el?.tagName.toLowerCase()} class="${el?.getAttribute('class')}">`).toContain(e)
}

beforeEach(() => { cleanup(); prepararFetch() })
afterEach(() => { vi.unstubAllGlobals() })

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return /\.tsx$/.test(nombre) ? [ruta] : []
  })
}

describe('TabsList (el componente base): la fila de pestañas se parte cuando no entra', () => {
  function barra(className?: string) {
    render(
      <Tabs defaultValue="a">
        <TabsList className={className}>
          <TabsTrigger value="a">Cobros sincronizados</TabsTrigger>
          <TabsTrigger value="b">Pendientes de factura</TabsTrigger>
        </TabsList>
      </Tabs>,
    )
    return screen.getByRole('tablist')
  }

  it('🔴 por defecto hace wrap, no pasa del ancho de su columna y crece en alto (antes `h-9 w-fit` sin wrap: 579, 670 y 394 px a 390)', () => {
    const lista = barra()
    tiene(lista, 'flex-wrap', 'max-w-full', 'min-h-9', 'w-fit')
    // Lo que no puede volver: la altura fija (cortaría el segundo renglón) y el `nowrap` del contenedor.
    expect(clases(lista)).not.toContain('h-9')
    expect(clases(lista)).not.toContain('flex-nowrap')
  })

  it('una pantalla puede seguir pasando su `className` (Configuración, Logs, ARCA ya lo hacen) sin perder el wrap', () => {
    const lista = barra('justify-start')
    tiene(lista, 'flex-wrap', 'max-w-full', 'justify-start')
    expect(clases(lista)).not.toContain('justify-center')
  })

  it('cada pestaña sigue sin partirse por dentro: el wrap es entre pestañas, no dentro de una', () => {
    barra()
    tiene(screen.getAllByRole('tab')[0], 'whitespace-nowrap')
  })

  it('guard: ninguna pantalla del kit apaga el wrap de sus pestañas (`flex-nowrap`, `h-9`, `overflow-hidden`)', () => {
    const malas: string[] = []
    for (const ruta of archivos(join(raiz, 'src'))) {
      readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
        if (/<TabsList\b[^>]*className="[^"]*(flex-nowrap|\bh-9\b|overflow-hidden)/.test(linea)) malas.push(`${relative(raiz, ruta)}:${i + 1}`)
      })
    }
    expect(malas).toEqual([])
  })
})

describe('las tablas: ninguna `<table>` suelta del kit, todas con su contenedor de scroll', () => {
  it('`Table` del kit trae el contenedor `overflow-x-auto` por defecto', () => {
    render(<Table><tbody><tr><td>x</td></tr></tbody></Table>)
    const contenedor = screen.getByRole('table').parentElement
    tiene(contenedor, 'overflow-x-auto', 'w-full')
    expect(contenedor?.getAttribute('data-slot')).toBe('table-container')
  })

  // Dos `<table>` sueltas a propósito y con su razón: el detalle de venta se vuelve tarjetas bajo `lg` (ADR-022, `max-lg:block`: no hay nada que
  // scrollear) y los «Cambios» de Logs viven dentro de una celda de la tabla de actividad, que ya scrollea.
  const A_PROPOSITO = new Set(['src/comercio/VentaDetalle.tsx', 'src/Logs.tsx:Cambios'])

  it('guard: cada `<table` de src está dentro de `<Table>` del kit o justo debajo de un `overflow-x-auto`', () => {
    const sueltas: string[] = []
    for (const ruta of archivos(join(raiz, 'src'))) {
      const rel = relative(raiz, ruta)
      if (rel === 'src/ui/table.tsx') continue
      const lineas = readFileSync(ruta, 'utf8').split('\n')
      lineas.forEach((linea, i) => {
        if (!/<table\b/.test(linea)) return
        const arriba = lineas.slice(Math.max(0, i - 3), i).join('\n')
        if (/overflow-x-auto/.test(arriba)) return
        const cambios = rel === 'src/Logs.tsx' && lineas.slice(Math.max(0, i - 4), i).join('\n').includes('function Cambios')
        if (A_PROPOSITO.has(rel) || (cambios && A_PROPOSITO.has('src/Logs.tsx:Cambios'))) return
        sueltas.push(`${rel}:${i + 1}`)
      })
    }
    expect(sueltas, 'una <table> suelta ensancha la página cuando sus columnas no entran: usá <Table> de ./ui/table o envolvela en un overflow-x-auto').toEqual([])
  })

  const LIBROS: LibrosIvaData = {
    desde: '2026-09-01', hasta: '2026-09-30', empresa_cuit: '30-1', facturas: [], egresos: [],
    // `ResumenPorTasa` no dibuja nada sin alícuotas: una sola alcanza para que haya tabla.
    resumen_v: { cbtes: 1, neto: 1000, iva: 210, total: 1210, por_tasa: { '21': { neto: 1000, iva: 210, cbtes: 1 } } },
    resumen_c: { cbtes: 0, neto: 0, iva: 0, total: 0, por_tasa: {} },
  }

  it('Libros IVA: el resumen por alícuota scrollea dentro de su tarjeta (415 px a 390, medido)', async () => {
    responder({ '/api/libros-iva': LIBROS })
    montar('/libros-iva', <LibrosIva />)
    const tabla = (await screen.findByText('Alícuota IVA')).closest('table')
    expect(tabla).not.toBeNull()
    tiene(tabla!.parentElement, 'overflow-x-auto')
  })
})

describe('el formulario de ítems (PresupuestoForm): la tabla scrollea por dentro bajo `sm` y el marco puede achicarse', () => {
  it('🔴 el marco lleva `min-w-0` (sin él la grilla de la tarjeta crece al mínimo de la tabla: 362 px contra ~340) y la tabla, su scroll bajo `sm`', async () => {
    responder({ 'GET /api/clientes': [], 'GET /productos/buscar': [] })
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    const tabla = await screen.findByRole('table')
    const scroll = tabla.parentElement
    tiene(scroll, 'max-sm:overflow-x-auto')
    // Sólo bajo `sm`: en escritorio un `overflow-x-auto` recortaría el desplegable de sugerencias (`absolute`).
    expect(clases(scroll)).not.toContain('overflow-x-auto')
    tiene(scroll?.parentElement, 'min-w-0', 'rounded-md', 'border')
    await waitFor(() => expect(tabla).toBeInTheDocument())
  })
})

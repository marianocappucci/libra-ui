// Guard: los reportes y los tableros toman sus íconos del catálogo, no de lucide (ADR-038).
//
// 🔴 La regla que busca es la propiedad final —«ninguna pantalla de reporte o de tablero importa de `lucide-react` un ícono que nombre un
// concepto»—, no el nombre de la pantalla que lo hacía: la próxima tarjeta va a ser otra. Si no, «Productos más vendidos» vuelve a tener el
// ícono del stock porque quedaba bien, y el menú dice una cosa y el reporte otra.
//
// Lee el FUENTE en vez de renderizar, por lo mismo que `campo-archivo-unico` y `sin-hoy-en-utc`: son decenas de pantallas, muchas detrás de
// una sesión. El parser (`src/auditoria-de-indicadores.ts`) es el que copian los productos; los tests de abajo lo prueban con fuentes de
// juguete para que, cuando un producto lo copie, sepa qué formas de escribir un import cubre.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  auditarIndicadores, describirInfracciones, esPantallaDeIndicadores, iconosDeConceptoEn, LUCIDE_PERMITIDOS, lucideImportadosEn,
} from '../src/auditoria-de-indicadores'

const SRC = resolve(__dirname, '..', 'src')
/** El paquete tiene ~100 módulos; si el barrido ve menos de 40, algo no anduvo. */
const MINIMO_DE_ARCHIVOS = 40

/** Las pantallas del kit que son de reporte o de tablero, por nombre. Si aparece una nueva (o se va una), el test lo dice. */
const PANTALLAS_DEL_KIT = ['comercio/Dashboard.tsx', 'comercio/Reportes.tsx']

/** Pantallas del kit con tarjetas de KPI armadas a mano, que todavía no pasaron al catálogo. **Son deuda, no excepciones**: cada una se
 *  migra a `TarjetaIndicador` y se saca de acá (el test de abajo exige que sigan violando: si una ya migró, hay que sacarla de la lista, y
 *  entonces pasa a estar cubierta por `auditarIndicadores` con la lista de `PANTALLAS_GUARDADAS`). */
const PENDIENTES_DE_MIGRAR = ['comercio/Caja.tsx', 'comercio/Egresos.tsx', 'comercio/Margen.tsx']

describe('los reportes y tableros del kit usan el catálogo', () => {
  const r = auditarIndicadores(SRC)

  it('el barrido vio los fuentes', () => {
    expect(r.archivos).toBeGreaterThanOrEqual(MINIMO_DE_ARCHIVOS)
  })

  it('el control — encontró las pantallas de reporte y de tablero (un parser que devuelve cero sería un falso verde)', () => {
    expect(r.pantallas).toBe(PANTALLAS_DEL_KIT.length)
    for (const p of PANTALLAS_DEL_KIT) {
      expect(esPantallaDeIndicadores(p), p).toBe(true)
      expect(readFileSync(join(SRC, p), 'utf8')).toContain('TarjetaIndicador')
    }
  })

  it('🔴 ninguna pantalla de reporte o de tablero importa un ícono de concepto de lucide', () => {
    expect(describirInfracciones(r.infracciones)).toEqual([])
  })

  it('🔴 Reportes y Dashboard sólo importan de lucide íconos de acción o de estado', () => {
    for (const p of PANTALLAS_DEL_KIT) {
      const importados = lucideImportadosEn(readFileSync(join(SRC, p), 'utf8'))
      for (const n of importados) expect(LUCIDE_PERMITIDOS, `${p} importa ${n}`).toContain(n)
    }
  })

  it('🔴 y no pasan un componente de ícono a una tarjeta: el tipo sólo admite el concepto', () => {
    for (const p of PANTALLAS_DEL_KIT) {
      const fuente = readFileSync(join(SRC, p), 'utf8')
      expect(fuente, p).not.toMatch(/<Tarjeta(?:Indicador|Reporte)[^>]*\bicono=/)
      expect(fuente, p).not.toMatch(/<IconoIndicador[^>]*\bicono=/)
    }
  })
})

describe('la deuda del kit está a la vista', () => {
  it.each(PENDIENTES_DE_MIGRAR)('%s todavía arma sus KPI con íconos de lucide (migrarla es sacarla de PENDIENTES_DE_MIGRAR)', (archivo) => {
    const fuera = iconosDeConceptoEn(readFileSync(join(SRC, archivo), 'utf8'))
    expect(fuera.length, `${archivo} ya no importa íconos de concepto: sacala de PENDIENTES_DE_MIGRAR`).toBeGreaterThan(0)
  })

  it('un pendiente migrado quedaría cubierto: el barrido con una lista explícita lo vería', () => {
    const r = auditarIndicadores(SRC, { esPantalla: (ruta) => PENDIENTES_DE_MIGRAR.includes(ruta) })
    expect(r.pantallas).toBe(PENDIENTES_DE_MIGRAR.length)
    expect(r.infracciones.map((i) => i.archivo)).toEqual(PENDIENTES_DE_MIGRAR)
  })
})

describe('esPantallaDeIndicadores — qué archivos son pantallas de reporte o de tablero', () => {
  it.each([
    'pages/Reportes.tsx', 'pages/Reporte.tsx', 'pages/ReportesIndice.tsx', 'pages/ReportesSalon.tsx', 'pages/ReporteCostos.tsx',
    'pages/ReporteDetalle.tsx', 'pages/reportes-definicion.tsx', 'pages/Dashboard.tsx', 'pages/Inicio.tsx', 'pages/Tablero.tsx',
    'pages/Indicadores.tsx', 'pages/Kpis.tsx', 'comercio\\Dashboard.tsx',
  ])('%s sí', (ruta) => {
    expect(esPantallaDeIndicadores(ruta)).toBe(true)
  })

  it.each([
    'pages/Caja.tsx', 'pages/Clientes.tsx', 'components/Layout.tsx', 'pages/Dashboard.test.tsx', 'pages/Reportes.spec.tsx',
    'pages/Reportes.css', 'TarjetaIndicador.tsx', 'iconos-indicador.ts', 'components/EncabezadoDeReportes.tsx',
  ])('%s no', (ruta) => {
    expect(esPantallaDeIndicadores(ruta)).toBe(false)
  })
})

describe('lucideImportadosEn — las formas de escribir un import', () => {
  it.each([
    ["import { Package } from 'lucide-react'", ['Package']],
    ['import { Package } from "lucide-react"', ['Package']],
    ["import {Package,Boxes} from 'lucide-react'", ['Package', 'Boxes']],
    ["import {\n  ShoppingCart, DollarSign,\n  Receipt,\n} from 'lucide-react'", ['ShoppingCart', 'DollarSign', 'Receipt']],
    ["import { Package as Producto } from 'lucide-react'", ['Package']],
    ["import { Package, type LucideIcon } from 'lucide-react'", ['Package']],
    ["import * as Iconos from 'lucide-react'", ['*']],
    ["import Package from 'lucide-react/dist/esm/icons/package'", ['Package']],
    ["import Boxes from 'lucide-react/icons/boxes'", ['Boxes']],
  ])('%j', (fuente, esperado) => {
    expect(lucideImportadosEn(fuente)).toEqual(esperado)
  })

  it.each([
    "import type { LucideIcon } from 'lucide-react'",
    "import { type LucideIcon } from 'lucide-react'",
    "import { Package } from './iconos'",
    "import { Package } from 'otra-lib'",
    "// import { Package } from 'lucide-react'",
    "/* import { Package } from 'lucide-react' */",
    "const texto = 'sin imports'",
  ])('no cuenta %j', (fuente) => {
    expect(lucideImportadosEn(fuente)).toEqual([])
  })

  it('suma varios imports del mismo archivo', () => {
    const fuente = "import { Package } from 'lucide-react'\nimport { Download } from 'lucide-react'\n"
    expect(lucideImportadosEn(fuente)).toEqual(['Package', 'Download'])
  })
})

describe('iconosDeConceptoEn — qué se puede importar suelto', () => {
  it('🔴 un ícono de concepto se marca', () => {
    expect(iconosDeConceptoEn("import { Boxes, Download } from 'lucide-react'")).toEqual(['Boxes'])
  })

  it('las acciones, las flechas y el glifo de vacío pasan', () => {
    const fuente = "import { ArrowRight, ChevronRight, Download, Printer, CheckCircle2, Inbox, X } from 'lucide-react'"
    expect(iconosDeConceptoEn(fuente)).toEqual([])
  })

  it('se compara por componente: el nombre viejo y el nuevo de lucide son lo mismo', () => {
    // `CheckCircle2` es `CircleCheck`; `BarChart3` es `ChartColumn` (un concepto: Reportes).
    expect(iconosDeConceptoEn("import { CircleCheck } from 'lucide-react'")).toEqual([])
    expect(iconosDeConceptoEn("import { CheckCircle2 } from 'lucide-react'")).toEqual([])
    expect(iconosDeConceptoEn("import { BarChart3 } from 'lucide-react'")).toEqual(['BarChart3'])
  })

  it('el alias no esquiva el guard', () => {
    expect(iconosDeConceptoEn("import { Wallet as Billetera } from 'lucide-react'")).toEqual(['Wallet'])
  })

  it('`import * as` no se puede auditar ícono por ícono y se marca', () => {
    expect(iconosDeConceptoEn("import * as Iconos from 'lucide-react'")).toEqual(['*'])
  })

  it('un nombre que lucide no tiene también se marca (no es una acción conocida)', () => {
    expect(iconosDeConceptoEn("import { NoExiste } from 'lucide-react'")).toEqual(['NoExiste'])
  })

  it('un producto amplía la lista con sus propios glifos de acción', () => {
    expect(iconosDeConceptoEn("import { Share2 } from 'lucide-react'")).toEqual(['Share2'])
    expect(iconosDeConceptoEn("import { Share2 } from 'lucide-react'", [...LUCIDE_PERMITIDOS, 'Share2'])).toEqual([])
  })

  it('la lista de permitidos son todos íconos que lucide tiene (si no, el permiso no permitiría nada)', async () => {
    const lucide = (await import('lucide-react')) as unknown as Record<string, unknown>
    expect(LUCIDE_PERMITIDOS.filter((n) => lucide[n] === undefined)).toEqual([])
  })
})

describe('auditarIndicadores — un src entero', () => {
  const temporales: string[] = []
  afterEach(() => {
    while (temporales.length) rmSync(temporales.pop()!, { recursive: true, force: true })
  })

  function conArchivos(archivos: Record<string, string>): string {
    const raiz = mkdtempSync(join(tmpdir(), 'indicadores-'))
    temporales.push(raiz)
    for (const [ruta, contenido] of Object.entries(archivos)) {
      mkdirSync(join(raiz, ruta, '..'), { recursive: true })
      writeFileSync(join(raiz, ruta), contenido)
    }
    return raiz
  }

  it('🔴 el control — una violación se pone roja y dice qué arreglar', () => {
    const raiz = conArchivos({
      'pages/Reportes.tsx': "import { Boxes, Download } from 'lucide-react'\n<TituloPantalla icono={ICONOS.reportes}>Reportes</TituloPantalla>",
      'pages/Dashboard.tsx': "import { TarjetaIndicador } from 'libra-ui/TarjetaIndicador'\nimport { Download } from 'lucide-react'",
      'pages/Caja.tsx': "import { Wallet } from 'lucide-react'",
    })
    const r = auditarIndicadores(raiz)
    expect(r.archivos).toBe(3)
    expect(r.pantallas).toBe(2)
    expect(r.infracciones).toEqual([{ archivo: 'pages/Reportes.tsx', iconos: ['Boxes'] }])
    expect(describirInfracciones(r.infracciones)).toEqual([
      'pages/Reportes.tsx: importa Boxes de lucide-react; pasá el concepto a TarjetaReporte / TarjetaIndicador / IconoIndicador (iconos-indicador)',
    ])
  })

  it('un src limpio no marca nada, pero cuenta las pantallas que midió', () => {
    const raiz = conArchivos({
      'pages/Reportes.tsx': "import { ArrowRight } from 'lucide-react'",
      'pages/Inicio.tsx': 'export const x = 1',
    })
    const r = auditarIndicadores(raiz)
    expect(r.pantallas).toBe(2)
    expect(r.infracciones).toEqual([])
  })

  it('no mira los tests, ni la carpeta ui, ni node_modules', () => {
    const raiz = conArchivos({
      'pages/Reportes.test.tsx': "import { Boxes } from 'lucide-react'",
      'ui/Reportes.tsx': "import { Boxes } from 'lucide-react'",
      'node_modules/x/Dashboard.tsx': "import { Boxes } from 'lucide-react'",
    })
    const r = auditarIndicadores(raiz)
    expect(r.pantallas).toBe(0)
    expect(r.infracciones).toEqual([])
  })

  it('cada ícono se informa una sola vez por archivo', () => {
    const raiz = conArchivos({ 'Reportes.tsx': "import { Boxes } from 'lucide-react'\nimport { Boxes as Otra } from 'lucide-react'" })
    expect(auditarIndicadores(raiz).infracciones[0].iconos).toEqual(['Boxes'])
  })

  it('`esPantalla` reemplaza la regla por nombre', () => {
    const raiz = conArchivos({ 'pages/Margen.tsx': "import { TrendingUp } from 'lucide-react'" })
    expect(auditarIndicadores(raiz).pantallas).toBe(0)
    const r = auditarIndicadores(raiz, { esPantalla: (ruta) => ruta === 'pages/Margen.tsx' })
    expect(r.infracciones).toEqual([{ archivo: 'pages/Margen.tsx', iconos: ['TrendingUp'] }])
  })
})

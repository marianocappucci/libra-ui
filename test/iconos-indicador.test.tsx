// El catálogo de íconos de reportes e indicadores (ADR-038, v0.128.0).
//
// Las tablas de abajo están escritas a mano A PROPÓSITO: son el guardián de divergencia, igual que en `iconos-identidad.test.tsx`. Si alguien
// cambia un ícono en `src/iconos-indicador.ts` sin cambiarlo acá (y en la tabla del README), este test falla. Cambiar un
// valor acá sin cambiarlo en los otros dos es justo lo que NO hay que hacer.
import { render } from '@testing-library/react'
import {
  Banknote, BadgePercent, Bell, CircleArrowDown, CircleArrowUp, ClipboardList, DollarSign, Droplets, FileBadge, FilePenLine, Gauge, Headset,
  Hourglass, Monitor, PackageMinus, Route, ShieldCheck, Store, Ticket, Timer, TrendingUp, Truck, Weight, Wrench,
  type LucideIcon,
} from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { IconoIndicador } from '../src/IconoIndicador'
import { ICONOS, type Concepto } from '../src/iconos-identidad'
import {
  conceptoCanonico, esDeIdentidad, ICONOS_PROPIOS_DE_INDICADOR, iconoDelIndicador, INDICADORES, SINONIMOS_DE_INDICADOR,
  type ConceptoIndicador,
} from '../src/iconos-indicador'
import { IDENTIDAD, type Producto } from '../src/identidad'

// Los conceptos que se miden y no están en la identidad. `CircleArrowDown` es el `ArrowDownCircle` que usaban Contalibra y el kit (lucide
// renombró el ícono y dejó el nombre viejo como alias del mismo componente).
const PROPIOS = {
  cobros: CircleArrowDown,
  pagos: CircleArrowUp,
  montoVendido: DollarSign,
  porCobrar: Hourglass,
  margen: TrendingUp,
  stockBajo: PackageMinus,
  tiempo: Timer,
  recordatorios: Bell,
  ordenesDeCarga: ClipboardList,
  rutas: Route,
  toneladas: Weight,
  kilometros: Gauge,
  comisiones: BadgePercent,
  liquidaciones: Banknote,
  cartasDePorte: FileBadge,
  incidencias: Ticket,
  equipos: Monitor,
  garantias: ShieldCheck,
  contratos: FilePenLine,
  reparaciones: Wrench,
  tecnicos: Headset,
  insumos: Droplets,
} as const satisfies Record<string, LucideIcon>

// Los sinónimos y el concepto al que apuntan.
const SINONIMOS = {
  facturado: 'comprobantes',
  gastos: 'egresos',
  saldos: 'cuentaCorriente',
  pacientes: 'clientes',
  turnos: 'agenda',
  iva: 'librosDeIva',
  mediosDePago: 'cajaPorMedio',
  auditoria: 'logDeActividad',
  fletes: 'ordenesDeCarga',
  horas: 'tiempo',
  foodCost: 'margen',
} as const satisfies Record<string, string>

const DE_IDENTIDAD = Object.keys(ICONOS) as Concepto[]
const NOMBRES_PROPIOS = Object.keys(PROPIOS) as (keyof typeof PROPIOS)[]
const NOMBRES_SINONIMOS = Object.keys(SINONIMOS) as (keyof typeof SINONIMOS)[]
const PRODUCTOS = Object.keys(IDENTIDAD) as Producto[]

/** Los grupos de conceptos que comparten componente, ordenados. */
function duplicados(vista: Readonly<Record<string, LucideIcon>>): string[][] {
  const porIcono = new Map<LucideIcon, string[]>()
  for (const [concepto, icono] of Object.entries(vista)) porIcono.set(icono, [...(porIcono.get(icono) ?? []), concepto])
  return [...porIcono.values()].filter((g) => g.length > 1).map((g) => [...g].sort()).sort()
}

describe('los conceptos propios', () => {
  it('🔴 son exactamente los de la tabla, ni uno más ni uno menos', () => {
    expect(Object.keys(ICONOS_PROPIOS_DE_INDICADOR).sort()).toEqual([...NOMBRES_PROPIOS].sort())
    // El control: la tabla no está vacía, así que la igualdad de arriba mide algo.
    expect(NOMBRES_PROPIOS).toHaveLength(22)
  })

  it.each(NOMBRES_PROPIOS)('🔴 «%s» lleva el ícono de la tabla', (concepto) => {
    expect(ICONOS_PROPIOS_DE_INDICADOR[concepto]).toBe(PROPIOS[concepto])
    expect(INDICADORES[concepto]).toBe(PROPIOS[concepto])
    expect(iconoDelIndicador(concepto)).toBe(PROPIOS[concepto])
  })

  it('🔴 ningún propio usa un ícono del catálogo de identidad: un ícono no significa dos cosas', () => {
    const deIdentidad = new Set<LucideIcon>(Object.values(ICONOS))
    const chocan = NOMBRES_PROPIOS.filter((c) => deIdentidad.has(PROPIOS[c]))
    expect(chocan).toEqual([])
  })

  it('🔴 dos propios no comparten ícono', () => {
    expect(duplicados(ICONOS_PROPIOS_DE_INDICADOR)).toEqual([])
  })

  it('el cobro y el pago son el par de flechas que ya usaban Contalibra y el kit', () => {
    expect(iconoDelIndicador('cobros')).toBe(CircleArrowDown)
    expect(iconoDelIndicador('pagos')).toBe(CircleArrowUp)
  })
})

describe('los conceptos de identidad (ADR-035)', () => {
  it.each(DE_IDENTIDAD)('🔴 «%s» es el mismo ícono que en el menú', (concepto) => {
    expect(INDICADORES[concepto]).toBe(ICONOS[concepto])
    expect(iconoDelIndicador(concepto)).toBe(ICONOS[concepto])
    expect(esDeIdentidad(concepto)).toBe(true)
  })

  it('los propios no son de identidad', () => {
    for (const c of NOMBRES_PROPIOS) expect(esDeIdentidad(c), c).toBe(false)
  })
})

describe('los sinónimos', () => {
  it('🔴 son exactamente los de la tabla, cada uno apuntando donde dice', () => {
    expect({ ...SINONIMOS_DE_INDICADOR }).toEqual(SINONIMOS)
    expect(NOMBRES_SINONIMOS).toHaveLength(11)
  })

  it.each(NOMBRES_SINONIMOS)('🔴 «%s» es el ícono de «%s»', (sinonimo) => {
    const destino = SINONIMOS[sinonimo] as ConceptoIndicador
    expect(conceptoCanonico(sinonimo)).toBe(destino)
    expect(iconoDelIndicador(sinonimo)).toBe(iconoDelIndicador(destino))
    expect(INDICADORES[sinonimo]).toBe(INDICADORES[destino])
  })

  it('🔴 un sinónimo apunta a un concepto que existe y no a otro sinónimo', () => {
    const existentes = new Set<string>([...DE_IDENTIDAD, ...NOMBRES_PROPIOS])
    for (const s of NOMBRES_SINONIMOS) expect(existentes.has(SINONIMOS[s]), `${s} -> ${SINONIMOS[s]}`).toBe(true)
  })

  it('🔴 un sinónimo no pisa a un concepto: las claves de los tres grupos no se repiten', () => {
    const todas = [...DE_IDENTIDAD, ...NOMBRES_PROPIOS, ...NOMBRES_SINONIMOS]
    expect(new Set(todas).size).toBe(todas.length)
  })

  it('los de identidad conservan la excepción de su producto: «gastos» en LibraCargo sigue siendo Egresos', () => {
    expect(iconoDelIndicador('gastos', 'libracargo')).toBe(ICONOS.egresos)
    expect(iconoDelIndicador('pacientes', 'medlibra')).toBe(ICONOS.clientes)
  })
})

describe('el catálogo entero', () => {
  const TODOS = Object.keys(INDICADORES) as ConceptoIndicador[]

  it('🔴 tiene los de identidad, los propios y los sinónimos', () => {
    expect([...TODOS].sort()).toEqual([...DE_IDENTIDAD, ...NOMBRES_PROPIOS, ...NOMBRES_SINONIMOS].sort())
    expect(TODOS).toHaveLength(33 + 22 + 11)
  })

  it('🔴 dos conceptos no comparten ícono, salvo los sinónimos (que son el mismo concepto) y proveedores/fleteros (que se separan en LibraCargo)', () => {
    const canonicos = Object.fromEntries(TODOS.filter((c) => !NOMBRES_SINONIMOS.includes(c as never)).map((c) => [c, INDICADORES[c]]))
    expect(duplicados(canonicos)).toEqual([['fleteros', 'proveedores']])
  })

  it('todo concepto es un componente de lucide que se puede rendear', () => {
    for (const concepto of TODOS) {
      const Icono = INDICADORES[concepto]
      expect(typeof (Icono as { displayName?: string }).displayName, concepto).toBe('string')
      const { container, unmount } = render(<Icono />)
      expect(container.querySelector('svg'), concepto).not.toBeNull()
      unmount()
    }
  })

  it('el catálogo está congelado: un producto no lo cambia, pide el concepto acá', () => {
    for (const objeto of [INDICADORES, ICONOS_PROPIOS_DE_INDICADOR, SINONIMOS_DE_INDICADOR]) expect(Object.isFrozen(objeto)).toBe(true)
    expect(() => { (INDICADORES as Record<string, LucideIcon>).cobros = Store }).toThrow()
    expect(() => { delete (INDICADORES as Record<string, LucideIcon>).cobros }).toThrow()
    expect(INDICADORES.cobros).toBe(CircleArrowDown)
  })

  it('🔴 las divergencias que encontró el relevamiento hoy son distintas', () => {
    // Productos más vendidos usaba `Boxes` (el stock); la comisión usaba `ClipboardList` (las órdenes); el tablero de egresos, dos íconos.
    expect(INDICADORES.productos).not.toBe(INDICADORES.stock)
    expect(INDICADORES.comisiones).not.toBe(INDICADORES.ordenesDeCarga)
    expect(INDICADORES.stockBajo).not.toBe(INDICADORES.stock)
    expect(INDICADORES.cobros).not.toBe(INDICADORES.pagos)
    expect(INDICADORES.montoVendido).not.toBe(INDICADORES.ventas)
    expect(INDICADORES.tecnicos).not.toBe(INDICADORES.usuarios)
    expect(INDICADORES.incidencias).not.toBe(INDICADORES.reportes)
  })
})

describe('las excepciones por producto (ADR-035) llegan a los indicadores', () => {
  it('🔴 en LibraCargo «proveedores» es Store y los fleteros siguen en Truck', () => {
    expect(iconoDelIndicador('proveedores', 'libracargo')).toBe(Store)
    expect(iconoDelIndicador('fleteros', 'libracargo')).toBe(Truck)
  })

  it('en el resto de la familia «proveedores» sigue con Truck', () => {
    for (const p of PRODUCTOS.filter((x) => x !== 'libracargo')) expect(iconoDelIndicador('proveedores', p), p).toBe(Truck)
    expect(iconoDelIndicador('proveedores')).toBe(Truck)
  })

  it('los propios y los sinónimos de un propio no tienen excepciones: valen igual en todos los productos', () => {
    for (const p of PRODUCTOS) {
      for (const c of NOMBRES_PROPIOS) expect(iconoDelIndicador(c, p), `${p}/${c}`).toBe(PROPIOS[c])
      expect(iconoDelIndicador('horas', p)).toBe(Timer)
    }
  })

  it('el catálogo base no se toca al pedir el de LibraCargo', () => {
    iconoDelIndicador('proveedores', 'libracargo')
    expect(INDICADORES.proveedores).toBe(Truck)
  })
})

describe('IconoIndicador', () => {
  it('rinde el ícono del concepto, decorativo y de 16 px', () => {
    const { container } = render(<IconoIndicador concepto="cobros" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('data-concepto')).toBe('cobros')
    expect(svg.getAttribute('class')).toContain('size-4')
    const referencia = render(<CircleArrowDown />).container.querySelector('svg')!
    expect(svg.innerHTML).toBe(referencia.innerHTML)
  })

  it('suma las clases del llamador sin perder el tamaño, y deja pasar otras props', () => {
    const { container } = render(<IconoIndicador concepto="stockBajo" className="text-amber-600" data-testid="x" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toContain('text-amber-600')
    expect(svg.getAttribute('class')).toContain('size-4')
    expect(svg.getAttribute('data-testid')).toBe('x')
  })

  it('aplica la excepción del producto', () => {
    const { container } = render(<IconoIndicador concepto="proveedores" producto="libracargo" />)
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('lucide-store')
    const base = render(<IconoIndicador concepto="proveedores" />).container.querySelector('svg')!
    expect(base.getAttribute('class')).toContain('lucide-truck')
  })

  it('un sinónimo rinde el ícono de su concepto', () => {
    const a = render(<IconoIndicador concepto="gastos" />).container.querySelector('svg')!.innerHTML
    const b = render(<IconoIndicador concepto="egresos" />).container.querySelector('svg')!.innerHTML
    expect(a).toBe(b)
  })
})

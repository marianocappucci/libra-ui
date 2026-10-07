// El catálogo de íconos de identidad (ADR-035, v0.125.0).
//
// La tabla de abajo está escrita a mano A PROPÓSITO, copiada de «Propuesta de catálogo» en la página `catalogo-iconos-identidad-diseno` del wiki
// (aprobada por el humano el 2026-10-07): es el guardián de divergencia, igual que en `identidad.test.ts`. Si alguien cambia un ícono en
// `src/iconos-identidad.ts` sin cambiarlo en el wiki (y acá), este test falla. Cambiar un valor acá sin cambiarlo en los otros dos es justo lo
// que NO hay que hacer.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import {
  BarChart3, BookOpen, BookText, Boxes, Calculator, CalendarCheck, CalendarClock, CalendarDays, Clock, Coins, CreditCard, FileClock,
  FileSpreadsheet, FileText, HandCoins, Inbox, Landmark, LayoutDashboard, MapPin, Package, PackagePlus, Percent, Receipt, ReceiptText,
  ScanBarcode, ScrollText, Settings, ShoppingBag, ShoppingBasket, ShoppingCart, SquareStack, Store, Tags, TrendingUp, Truck, UserCog, Users,
  Wallet, Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConfiguracion } from '../src/Configuracion'
import { Logs } from '../src/Logs'
import { Usuarios } from '../src/Usuarios'
import { Caja } from '../src/comercio/Caja'
import { CajaMedios } from '../src/comercio/CajaMedios'
import { Cajas } from '../src/comercio/Cajas'
import { Clientes } from '../src/comercio/Clientes'
import { Compras } from '../src/comercio/Compras'
import { CuentaCorriente } from '../src/comercio/CuentaCorriente'
import { Dashboard } from '../src/comercio/Dashboard'
import { Depositos } from '../src/comercio/Depositos'
import { Egresos } from '../src/comercio/Egresos'
import { LibrosIva } from '../src/comercio/LibrosIva'
import { ListasPrecio } from '../src/comercio/ListasPrecio'
import { Logs as LogsDeActividad } from '../src/comercio/Logs'
import { Proveedores } from '../src/comercio/Proveedores'
import { Reportes } from '../src/comercio/Reportes'
import { Stock } from '../src/comercio/Stock'
import { Sucursales } from '../src/comercio/Sucursales'
import { Tesoreria } from '../src/comercio/Tesoreria'
import { Turnos } from '../src/comercio/Turnos'
import { Ventas } from '../src/comercio/Ventas'
import { Remitos } from '../src/Remitos'
import { Presupuestos } from '../src/Presupuestos'
import { MpBandeja } from '../src/MpBandeja'
import {
  ICONOS, ICONOS_POR_PRODUCTO, iconoDelConcepto, iconosDe, type Concepto,
} from '../src/iconos-identidad'
import { IDENTIDAD, type Producto } from '../src/identidad'

// La tabla del wiki. `BarChart3` está escrito como en la tabla (y como lo importan los productos hoy): en lucide es el MISMO componente que
// `ChartColumn`, que es el que usa `src/iconos-identidad.ts`.
const TABLA_DEL_WIKI = {
  dashboard: LayoutDashboard,
  agenda: CalendarDays,
  clientes: Users,
  cuentaCorriente: BookOpen,
  comprobantes: Receipt,
  recibos: ReceiptText,
  preFacturas: FileClock,
  comprobantesAFacturar: Inbox,
  presupuestos: Calculator,
  remitos: FileText,
  ventas: ShoppingCart,
  ordenesDeCompra: ShoppingBasket,
  proveedores: Truck,
  fleteros: Truck,
  egresos: ShoppingBag,
  senas: HandCoins,
  productos: Package,
  listasDePrecio: Tags,
  stock: Boxes,
  depositos: Warehouse,
  sucursales: MapPin,
  caja: Wallet,
  cajas: SquareStack,
  cajaPorMedio: Coins,
  turnosDeCaja: Clock,
  cierreDiario: CalendarCheck,
  tesoreria: Landmark,
  pagosMercadoPago: CreditCard,
  reportes: BarChart3,
  librosDeIva: BookText,
  configuracion: Settings,
  usuarios: UserCog,
  logDeActividad: ScrollText,
} as const satisfies Record<string, LucideIcon>

const CONCEPTOS = Object.keys(TABLA_DEL_WIKI) as Concepto[]
const PRODUCTOS = Object.keys(IDENTIDAD) as Producto[]

/** Los grupos de conceptos que comparten componente en una vista del catálogo, ordenados. */
function duplicados(vista: Readonly<Record<string, LucideIcon>>): string[][] {
  const porIcono = new Map<LucideIcon, string[]>()
  for (const [concepto, icono] of Object.entries(vista)) porIcono.set(icono, [...(porIcono.get(icono) ?? []), concepto])
  return [...porIcono.values()].filter((g) => g.length > 1).map((g) => [...g].sort()).sort()
}

describe('el catálogo base', () => {
  it('🔴 tiene exactamente los conceptos de la tabla del wiki, ni uno más ni uno menos', () => {
    expect(Object.keys(ICONOS).sort()).toEqual([...CONCEPTOS].sort())
    // El control: la tabla de este archivo no está vacía, así que la igualdad de arriba mide algo.
    expect(CONCEPTOS).toHaveLength(33)
  })

  it.each(CONCEPTOS)('🔴 «%s» lleva el ícono de la tabla', (concepto) => {
    expect(ICONOS[concepto]).toBeDefined()
    expect(ICONOS[concepto]).toBe(TABLA_DEL_WIKI[concepto])
  })

  it('todo concepto es un componente de lucide que se puede rendear', () => {
    for (const concepto of CONCEPTOS) {
      const Icono = ICONOS[concepto]
      expect(typeof (Icono as { displayName?: string }).displayName, concepto).toBe('string')
      const { container, unmount } = render(<Icono />)
      expect(container.querySelector('svg'), concepto).not.toBeNull()
      unmount()
    }
  })

  it('🔴 dos conceptos no comparten ícono, salvo proveedores y fleteros, que se separan en LibraCargo', () => {
    // La única repetición del catálogo base y está a propósito: `fleteros` es el camión de LibraCargo, y ahí `proveedores` pasa a `Store`.
    expect(duplicados(ICONOS)).toEqual([['fleteros', 'proveedores']])
  })

  it('el ícono que se repite en el base es el camión', () => {
    expect(ICONOS.proveedores).toBe(Truck)
    expect(ICONOS.fleteros).toBe(Truck)
  })

  it('🔴 las parejas que antes chocaban en los productos hoy son distintas', () => {
    // El relevamiento del 2026-10-06 encontró un mismo ícono para conceptos distintos: estas son esas parejas.
    const parejas: [Concepto, Concepto][] = [
      ['caja', 'cuentaCorriente'], ['caja', 'egresos'], ['caja', 'cajaPorMedio'], ['caja', 'cajas'],
      ['ventas', 'ordenesDeCompra'], ['comprobantes', 'remitos'], ['recibos', 'ventas'],
      ['remitos', 'presupuestos'], ['remitos', 'preFacturas'], ['depositos', 'sucursales'],
    ]
    for (const [a, b] of parejas) expect(ICONOS[a], `${a} / ${b}`).not.toBe(ICONOS[b])
  })

  it('el catálogo está congelado: un producto no lo cambia, pide la excepción acá', () => {
    expect(Object.isFrozen(ICONOS)).toBe(true)
    expect(() => { (ICONOS as Record<string, LucideIcon>).caja = Store }).toThrow()
    expect(() => { delete (ICONOS as Record<string, LucideIcon>).caja }).toThrow()
    expect(ICONOS.caja).toBe(Wallet)
  })

  it('BarChart3 y ChartColumn son el mismo componente: el renombre de lucide no cambia nada', () => {
    expect(ICONOS.reportes).toBe(BarChart3)
  })
})

describe('las excepciones por producto', () => {
  it('🔴 hay una sola excepción en toda la familia: LibraCargo, proveedores', () => {
    expect(Object.keys(ICONOS_POR_PRODUCTO)).toEqual(['libracargo'])
    expect(Object.keys(ICONOS_POR_PRODUCTO.libracargo!)).toEqual(['proveedores'])
    expect(ICONOS_POR_PRODUCTO.libracargo!.proveedores).toBe(Store)
  })

  it('🔴 en LibraCargo el camión es de los fleteros y Proveedores lleva Store', () => {
    expect(iconoDelConcepto('fleteros', 'libracargo')).toBe(Truck)
    expect(iconoDelConcepto('proveedores', 'libracargo')).toBe(Store)
    expect(iconosDe('libracargo').proveedores).toBe(Store)
  })

  it('en el resto de la familia Proveedores sigue con Truck', () => {
    for (const p of PRODUCTOS.filter((x) => x !== 'libracargo')) expect(iconoDelConcepto('proveedores', p), p).toBe(Truck)
    expect(iconoDelConcepto('proveedores')).toBe(Truck)
  })

  it('🔴 LibraCargo difiere del catálogo base en un solo concepto', () => {
    const distintos = CONCEPTOS.filter((c) => iconosDe('libracargo')[c] !== ICONOS[c])
    expect(distintos).toEqual(['proveedores'])
  })

  it('🔴 dentro de LibraCargo ningún ícono se repite; en los otros siete sólo el par que no usan juntos', () => {
    expect(duplicados(iconosDe('libracargo'))).toEqual([])
    for (const p of PRODUCTOS.filter((x) => x !== 'libracargo')) {
      expect(duplicados(iconosDe(p)), p).toEqual([['fleteros', 'proveedores']])
    }
  })

  it('sin producto, o con uno sin excepciones, `iconosDe` devuelve el catálogo mismo', () => {
    expect(iconosDe()).toBe(ICONOS)
    expect(iconosDe('contalibra')).toBe(ICONOS)
  })

  it('la vista de LibraCargo es siempre el mismo objeto, está congelada y no toca al catálogo base', () => {
    expect(iconosDe('libracargo')).toBe(iconosDe('libracargo'))
    expect(Object.isFrozen(iconosDe('libracargo'))).toBe(true)
    expect(Object.isFrozen(ICONOS_POR_PRODUCTO)).toBe(true)
    expect(Object.isFrozen(ICONOS_POR_PRODUCTO.libracargo)).toBe(true)
    expect(ICONOS.proveedores).toBe(Truck)
  })

  it('`iconoDelConcepto` es pura y se compara con ===', () => {
    expect(iconoDelConcepto('caja')).toBe(ICONOS.caja)
    expect(iconoDelConcepto('caja', 'ventalibra')).toBe(Wallet)
    expect(iconoDelConcepto('cajaPorMedio', 'contalibra')).toBe(Coins)
  })
})

// ── Las pantallas del kit toman su ícono del catálogo ────────────────────

/** El SVG que rinde un componente, como texto: lucide le pone `class="lucide lucide-<nombre>"`, así que dos íconos distintos nunca coinciden. */
function svgDe(Icono: LucideIcon): string {
  const { container, unmount } = render(<Icono />)
  const svg = container.querySelector('svg')!.outerHTML
  unmount()
  return svg
}

function respuestaVacia() {
  return Promise.resolve(new Response(JSON.stringify({
    actividad: [], accesos: [], total: 0, total_pages: 1, page: 1, entidades: [], usuarios: [], acciones: {},
  }), { status: 200, headers: { 'content-type': 'application/json' } }))
}

describe('las pantallas del kit rinden el ícono del catálogo en su título', () => {
  beforeEach(() => {
    // Un pedido que nunca vuelve: la pantalla queda en «Cargando…» y el título ya está. Es todo lo que hace falta para mirar el ícono.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  const ConfiguracionDelKit = createConfiguracion({ producto: 'Contalibra' })
  const PANTALLAS: [string, Concepto, () => ReactElement][] = [
    ['Caja', 'caja', () => <Caja />],
    ['Cajas', 'cajas', () => <Cajas />],
    ['Caja por medio de cobro', 'cajaPorMedio', () => <CajaMedios />],
    ['Cuenta corriente', 'cuentaCorriente', () => <CuentaCorriente />],
    ['Egresos', 'egresos', () => <Egresos />],
    ['Proveedores', 'proveedores', () => <Proveedores />],
    ['Compras (órdenes de compra)', 'ordenesDeCompra', () => <Compras />],
    ['Ventas', 'ventas', () => <Ventas />],
    ['Clientes', 'clientes', () => <Clientes />],
    ['Dashboard', 'dashboard', () => <Dashboard />],
    ['Tesorería', 'tesoreria', () => <Tesoreria />],
    ['Sucursales', 'sucursales', () => <Sucursales />],
    ['Depósitos', 'depositos', () => <Depositos />],
    ['Stock', 'stock', () => <Stock rutaDeMovimientos={(id) => `/stock/${id}`} />],
    ['Listas de precio', 'listasDePrecio', () => <ListasPrecio />],
    ['Turnos de caja', 'turnosDeCaja', () => <Turnos />],
    ['Libros de IVA', 'librosDeIva', () => <LibrosIva />],
    ['Reportes', 'reportes', () => <Reportes />],
    ['Pagos de Mercado Pago', 'pagosMercadoPago', () => <MpBandeja />],
    ['Presupuestos', 'presupuestos', () => <Presupuestos />],
    ['Remitos', 'remitos', () => <Remitos />],
    ['Log de actividad (comercio)', 'logDeActividad', () => <LogsDeActividad />],
    ['Usuarios, sin pasar `icono`', 'usuarios', () => <Usuarios />],
    ['Configuración, sin pasar `icono`', 'configuracion', () => <ConfiguracionDelKit />],
  ]

  it.each(PANTALLAS)('🔴 %s lleva el ícono de «%s»', (_nombre, concepto, pantalla) => {
    const { container } = render(<MemoryRouter>{pantalla()}</MemoryRouter>)
    const titulo = container.querySelector('[data-slot="icono-tile"] svg')
    expect(titulo, 'la pantalla no rindió el título con su ícono').not.toBeNull()
    expect(titulo!.outerHTML).toBe(svgDe(ICONOS[concepto]))
  })

  it('🔴 Log de actividad (el compartido, sin pasar `icono`) lleva ScrollText', async () => {
    vi.stubGlobal('fetch', vi.fn(respuestaVacia))
    render(<Logs />)
    await screen.findByRole('heading', { name: /Logs/ })
    expect(document.querySelector('[data-slot="icono-tile"] svg')!.outerHTML).toBe(svgDe(ICONOS.logDeActividad))
  })

  it('el ícono que se pasa a mano sigue ganando (compatibilidad con los productos que ya lo pasan)', () => {
    const { container } = render(<MemoryRouter><Usuarios icono={Store} /></MemoryRouter>)
    expect(container.querySelector('[data-slot="icono-tile"] svg')!.outerHTML).toBe(svgDe(Store))
  })

  it('🔴 el control — Caja y Cajas no se confunden: el título de Caja ya no es SquareStack', () => {
    const { container } = render(<MemoryRouter><Caja /></MemoryRouter>)
    const titulo = container.querySelector('[data-slot="icono-tile"] svg')!.outerHTML
    expect(titulo).toBe(svgDe(Wallet))
    expect(titulo).not.toBe(svgDe(SquareStack))
  })

  it('🔴 el control — el catálogo cubre la pantalla: Caja por medio es Coins, ya no Wallet', () => {
    const { container } = render(<MemoryRouter><CajaMedios /></MemoryRouter>)
    expect(container.querySelector('[data-slot="icono-tile"] svg')!.outerHTML).toBe(svgDe(Coins))
  })
})

// ── Ninguna pantalla del kit esquiva el catálogo ─────────────────────────

describe('el fuente del kit', () => {
  const SRC = resolve(__dirname, '..', 'src')

  function archivos(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = join(dir, e.name)
      if (e.isDirectory()) return e.name === 'ui' ? [] : archivos(ruta)
      return /\.tsx$/.test(e.name) ? [ruta] : []
    })
  }

  // Las pantallas del kit cuyo concepto NO está en el catálogo (existen en un solo producto): su ícono propio, que no puede chocar con uno
  // del catálogo. Si una pantalla nueva del kit se agrega acá, tiene que ser porque no hay concepto equivalente en la tabla.
  const FUERA_DEL_CATALOGO: Record<string, [string, LucideIcon]> = {
    'comercio/Promociones.tsx': ['Percent', Percent],
    'comercio/Vencimientos.tsx': ['CalendarClock', CalendarClock],
    'comercio/Margen.tsx': ['TrendingUp', TrendingUp],
    'comercio/Reposicion.tsx': ['PackagePlus', PackagePlus],
    'comercio/EtiquetasGondola.tsx': ['ScanBarcode', ScanBarcode],
    'comercio/ActualizacionMasivaPrecios.tsx': ['FileSpreadsheet', FileSpreadsheet],
  }

  const titulos: { archivo: string; icono: string }[] = []
  for (const ruta of archivos(SRC)) {
    const fuente = readFileSync(ruta, 'utf8')
    for (const m of fuente.matchAll(/<TituloPantalla\s+icono=\{([^}]+)\}/g)) {
      titulos.push({ archivo: relative(SRC, ruta).replaceAll('\\', '/'), icono: m[1] })
    }
  }

  it('el control — encontró los títulos (un parser que devuelve cero sería un falso verde)', () => {
    expect(titulos.length).toBeGreaterThan(50)
  })

  it('🔴 todo `<TituloPantalla icono={…}>` es `ICONOS.<concepto>`, `icono` (la prop de las tres pantallas compartidas) o está en la lista de afuera del catálogo', () => {
    const sueltos = titulos.filter(({ archivo, icono }) => {
      const concepto = /^ICONOS\.([a-zA-Z]+)$/.exec(icono)
      if (concepto) return !(concepto[1] in ICONOS)
      if (icono === 'icono') return !['Usuarios.tsx', 'Logs.tsx', 'Configuracion.tsx'].includes(archivo)
      return FUERA_DEL_CATALOGO[archivo]?.[0] !== icono
    })
    expect(sueltos).toEqual([])
  })

  it('🔴 las pantallas de afuera del catálogo usan una de esas listas, no un ícono del catálogo con otro significado', () => {
    const delCatalogo = new Set<LucideIcon>(Object.values(ICONOS))
    for (const [archivo, [nombre, Icono]] of Object.entries(FUERA_DEL_CATALOGO)) {
      expect(delCatalogo.has(Icono), `${archivo}: ${nombre} es un ícono del catálogo`).toBe(false)
      expect(titulos.some((t) => t.archivo === archivo && t.icono === nombre), `${archivo} ya no usa ${nombre}`).toBe(true)
    }
  })

  it('🔴 ningún título del kit usa suelto `Wallet`, `Truck` ni `SquareStack` (los tres que chocaban): van por `ICONOS`', () => {
    const conWallet = titulos.filter((t) => t.icono === 'Wallet' || t.icono === 'Truck' || t.icono === 'SquareStack')
    expect(conWallet).toEqual([])
  })
})

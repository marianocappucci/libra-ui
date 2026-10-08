// El catálogo de íconos de REPORTES e INDICADORES de la familia: un concepto, un ícono (ADR-038, `v0.128.0`).
//
// 🔴 **Es el ícono de cada tarjeta de un índice de reportes, de cada KPI de un tablero y del título de cada bloque de un reporte.** Responde
// «qué se mide»: ventas, cobros, saldos, stock bajo, órdenes de carga. Es el hermano de `iconos-identidad` (ADR-035), que responde «qué
// pantalla es»: no lo reemplaza, lo extiende.
//
// **La regla.** Un concepto lleva un solo ícono en todos los reportes y tableros de todos los productos, y es el mismo que ese concepto tiene en
// el menú. Antes cada pantalla elegía el suyo con un `import { … } from 'lucide-react'` suelto; el relevamiento del 2026-10-08 encontró, por
// ejemplo, «productos» como `Package` en el menú y `Boxes` (que es el stock) en la tarjeta de «Productos más vendidos», «comisión» como
// `ClipboardList` (que son las órdenes) en LibraCargo, y el KPI de egresos como `ArrowUpCircle` en un lugar y `ShoppingBag` en otro.
//
// **Cómo se arma.** Tres partes, y la clave es siempre un concepto en camelCase español:
//   1. **Los conceptos de identidad** (ADR-035): TODOS entran con su misma clave y el mismo componente, tomado de `ICONOS`. No se copian: se
//      leen de ahí, así que un cambio en el catálogo de identidad llega solo y no hay forma de que diverjan (el test lo mide igual).
//   2. **Los sinónimos** (`SINONIMOS`): otra palabra para un concepto que ya existe (`facturado` es `comprobantes`, `gastos` es `egresos`,
//      `pacientes` es `clientes`). Existen porque quien arma un tablero piensa en «gastos» y no en el nombre del menú.
//   3. **Los propios** (`PROPIOS`): conceptos que se miden pero no son una pantalla (cobros, pagos, stock bajo) o que son de un solo producto
//      (órdenes de carga, incidencias, garantías). Cada uno lleva un ícono de lucide que NO esté en el catálogo de identidad ni en otro propio.
//
// **Las excepciones por producto viven en `iconos-identidad`**, no acá: `iconoDelIndicador('proveedores', 'libracargo')` devuelve `Store`
// porque ahí el camión es de los fleteros. Un concepto propio no tiene excepciones.
//
// **Cómo se usa.** No se importa un ícono de lucide para una tarjeta de reporte o un KPI: se pasa el CONCEPTO.
//   - `<TarjetaReporte concepto="saldos" titulo=… a=… />`  y  `<TarjetaIndicador concepto="cobros" etiqueta=… valor=… />`.
//   - Un ícono suelto al lado de un título de bloque: `<IconoIndicador concepto="productos" />`.
//   - Un test compara con `===`:  `expect(iconoDelIndicador('cobros')).toBe(CircleArrowDown)`.
//   `test/iconos-indicador.test.tsx` repite esta tabla a mano y falla si la copia diverge; `test/indicadores-por-catalogo.test.ts` falla si
//   una pantalla de reporte o de tablero importa un ícono de lucide en vez de pasar por acá (`auditoria-de-indicadores`).
//
// **Cómo se agrega un concepto.** (1) Mirar si ya existe con otro nombre (identidad, sinónimos, propios); (2) la clave en `PROPIOS` con un
// ícono que nadie use, y una línea que diga qué mide y dónde se vio; (3) la fila en la tabla de `test/iconos-indicador.test.tsx`; (4) subir la
// versión del kit. Un sinónimo es una línea en `SINONIMOS` y otra en el test. Los conceptos que existen en un solo producto SÍ entran acá (a
// diferencia de la identidad): el reporte de un producto tiene que decir lo mismo que su menú, y el catálogo es lo que lo garantiza.
import {
  Banknote, BadgePercent, Bell, CircleArrowDown, CircleArrowUp, ClipboardList, DollarSign, Droplets, FileBadge, FilePenLine, Gauge, Headset,
  Hourglass, Monitor, PackageMinus, Route, ShieldCheck, Ticket, Timer, TrendingUp, Weight, Wrench,
  type LucideIcon,
} from 'lucide-react'
import { ICONOS, iconoDelConcepto, type Concepto } from './iconos-identidad'
import type { Producto } from './identidad'

/** Los conceptos que se miden y NO están en el catálogo de identidad. Cada uno, con lo que mide y dónde se vio. */
const PROPIOS = {
  /** Plata que entró: «Cobrado este mes», «Ingresos del período». Contalibra (Dashboard, Caja), LibraCargo (Inicio). */
  cobros: CircleArrowDown,
  /** Plata que salió: «Pagado», «Pago a fleteros». Es el par de `cobros`; no es el rubro Egresos (`egresos`, que es un gasto cargado). */
  pagos: CircleArrowUp,
  /** El monto de lo vendido, en pesos: «Total vendido». La cantidad de ventas es `ventas`; el monto, éste. */
  montoVendido: DollarSign,
  /** Lo que todavía no se cobró: «Facturas sin cobrar», «Pendiente / Parcial». Contalibra (Dashboard, Egresos). */
  porCobrar: Hourglass,
  /** Margen y rentabilidad: «Margen y rotación» (Margen del kit), «Food cost y margen por plato» (RestoLibra). */
  margen: TrendingUp,
  /** Productos por debajo de su mínimo: «Stock bajo mínimo». Es `stock` con una alerta; no se dibuja con el triángulo de advertencia. */
  stockBajo: PackageMinus,
  /** Tiempo medido: «Horas invertidas» (LibraDesk), «Tiempos de comanda por estación» (RestoLibra). */
  tiempo: Timer,
  /** Recordatorios enviados: Dashboard de MedLibra y GestioLibra. */
  recordatorios: Bell,

  // ── LibraCargo ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Las órdenes de carga (el flete): menú, Inicio, reportes. */
  ordenesDeCarga: ClipboardList,
  /** Origen → destino: «Rutas más transitadas». */
  rutas: Route,
  /** Peso transportado, en toneladas (los kilos de la carta de porte). Todavía sin tarjeta que lo use; lo pidió el dueño. */
  toneladas: Weight,
  /** Distancia recorrida. Todavía sin tarjeta que lo use; lo pidió el dueño. */
  kilometros: Gauge,
  /** La comisión de las órdenes: «Comisión del mes», «Fleteros». Antes `ClipboardList`, que es el ícono de las órdenes. */
  comisiones: BadgePercent,
  /** Lo que se le liquida a un transportista: «Pre liquidación de transportistas». Plata a pagar a un tercero. */
  liquidaciones: Banknote,
  /** Las cartas de porte electrónicas (CPE): documento que habilita el traslado. */
  cartasDePorte: FileBadge,

  // ── LibraDesk ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Los tickets de la mesa de ayuda: «Incidencias por período», el grupo «Incidencias» de los reportes. */
  incidencias: Ticket,
  /** El parque instalado: «Equipamiento», «Equipos». */
  equipos: Monitor,
  /** «Garantías por vencer». */
  garantias: ShieldCheck,
  /** Contratos de alquiler: «Contratos por vencer». */
  contratos: FilePenLine,
  /** Equipos en el taller: «En el taller». */
  reparaciones: Wrench,
  /** «Por técnico». Antes `UserCog`, que es Usuarios. */
  tecnicos: Headset,
  /** Consumibles de los equipos: «Insumos por equipo». */
  insumos: Droplets,
} as const satisfies Record<string, LucideIcon>

type Propio = keyof typeof PROPIOS

/** Otra palabra para un concepto que ya existe. Comparte ícono con él **por construcción** (se resuelve a la misma clave). */
const SINONIMOS = {
  /** «Facturado este mes»: lo que sale en los comprobantes. */
  facturado: 'comprobantes',
  /** «Gastos en caja», «Listado de comprobantes de proveedores»: lo que se carga en Egresos. */
  gastos: 'egresos',
  /** «Saldo de clientes / fleteros / proveedores»: los saldos de las cuentas corrientes. */
  saldos: 'cuentaCorriente',
  /** Los pacientes de MedLibra son los clientes (ADR-035). */
  pacientes: 'clientes',
  /** «Turnos» de GestioLibra y MedLibra: lo que está en la agenda. No son los turnos de caja (`turnosDeCaja`). */
  turnos: 'agenda',
  /** El IVA se lee en los libros de IVA. */
  iva: 'librosDeIva',
  /** «Medios de pago»: el reparto por medio es la caja por medio de cobro. */
  mediosDePago: 'cajaPorMedio',
  /** Auditoría y logs: el log de actividad. */
  auditoria: 'logDeActividad',
  /** Fletes: las órdenes de carga. */
  fletes: 'ordenesDeCarga',
  /** Horas: el tiempo. */
  horas: 'tiempo',
  /** Food cost: el margen por plato. */
  foodCost: 'margen',
} as const satisfies Record<string, Concepto | Propio>

type Sinonimo = keyof typeof SINONIMOS

/** Todo lo que se puede pasar como `concepto` a una tarjeta de reporte o de indicador. */
export type ConceptoIndicador = Concepto | Propio | Sinonimo

/** Los íconos propios (los conceptos que no están en la identidad), congelado. Lo usan los tests y el guard. */
export const ICONOS_PROPIOS_DE_INDICADOR: Readonly<Record<Propio, LucideIcon>> = Object.freeze({ ...PROPIOS })

/** Cada sinónimo y el concepto al que apunta, congelado. */
export const SINONIMOS_DE_INDICADOR: Readonly<Record<Sinonimo, Concepto | Propio>> = Object.freeze({ ...SINONIMOS })

function esPropio(c: string): c is Propio {
  return Object.hasOwn(PROPIOS, c)
}

function esSinonimo(c: string): c is Sinonimo {
  return Object.hasOwn(SINONIMOS, c)
}

/** El concepto de verdad detrás de una palabra: un sinónimo se resuelve a su concepto; el resto, a sí mismo. */
export function conceptoCanonico(concepto: ConceptoIndicador): Concepto | Propio {
  return esSinonimo(concepto) ? SINONIMOS[concepto] : (concepto as Concepto | Propio)
}

/** Si el concepto sale del catálogo de identidad (y por lo tanto admite las excepciones por producto). */
export function esDeIdentidad(concepto: ConceptoIndicador): boolean {
  return !esPropio(conceptoCanonico(concepto))
}

/** El catálogo base: concepto → ícono de lucide, con los de identidad, los sinónimos y los propios. Congelado. */
export const INDICADORES: Readonly<Record<ConceptoIndicador, LucideIcon>> = Object.freeze({
  ...ICONOS,
  ...PROPIOS,
  ...Object.fromEntries(
    (Object.keys(SINONIMOS) as Sinonimo[]).map((s) => {
      const destino = SINONIMOS[s]
      return [s, esPropio(destino) ? PROPIOS[destino] : ICONOS[destino as Concepto]]
    }),
  ),
} as Record<ConceptoIndicador, LucideIcon>)

/** El ícono de un concepto de reporte o de indicador, para ese producto. Pura, para que un test compare con `===`. Los conceptos que vienen
 *  del catálogo de identidad llevan sus excepciones por producto (`proveedores` es `Store` en LibraCargo); los propios, ninguna. */
export function iconoDelIndicador(concepto: ConceptoIndicador, producto?: Producto): LucideIcon {
  const canonico = conceptoCanonico(concepto)
  return esPropio(canonico) ? PROPIOS[canonico] : iconoDelConcepto(canonico, producto)
}

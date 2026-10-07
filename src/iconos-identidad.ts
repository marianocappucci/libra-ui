// El catálogo de íconos de IDENTIDAD de la familia: un concepto, un ícono (ADR-035, `v0.125.0`).
//
// 🔴 **Es el ícono de cada entrada del menú y del título de su pantalla.** No es el de la marca del producto (`identidad.ts`, ADR-033: ése es un
// cuadrado de color con el ícono del producto) ni el de una acción o un estado (`iconos-accion.tsx`: borrar, ver, pagado). Es el que responde
// «qué es esto»: Caja, Cuenta corriente, Egresos, Usuarios.
//
// **La regla.** Un concepto lleva un solo ícono, en el menú y en el título de su pantalla, en todos los productos. Dos conceptos no comparten
// ícono. Antes de esto cada producto elegía los suyos y el relevamiento del 2026-10-06 encontró trece conceptos con íconos distintos según el
// producto y seis íconos que significaban dos cosas (`Wallet` era la caja, la cuenta corriente, los egresos o la caja por medio). La tabla vive en
// el wiki, `catalogo-iconos-identidad-diseno`; `test/iconos-identidad.test.ts` la repite a mano y falla si esta copia diverge, igual que
// `identidad.test.ts` con la tabla de colores.
//
// **La excepción vive acá, no en el producto.** Hay una sola por producto aprobada (decisión del humano, 2026-10-07): en LibraCargo el camión
// (`Truck`) es de los fleteros y Proveedores lleva `Store`. Está en `ICONOS_POR_PRODUCTO.libracargo`. Un producto que necesite otro ícono para un
// concepto del catálogo no lo cambia en su menú: lo pide acá, con la razón, y el test de ESTE paquete es el que tiene que autorizarlo.
//
// **Cómo se usa.**
//   - Pantalla del kit o de un producto sin excepciones:  `icono={ICONOS.cuentaCorriente}`.
//   - Producto con excepciones (LibraCargo):               `const ICONOS_LC = iconosDe('libracargo')` y `icono={ICONOS_LC.proveedores}`.
//   - Un test del producto compara con `===`:              `expect(iconoDeLaEntrada).toBe(iconoDelConcepto('caja', 'ventalibra'))`.
//     Si el menú del producto está en un `Layout.tsx` que no se exporta, `auditarMenuContraCatalogo` (`auditoria-de-titulos`) lo lee del fuente.
//
// **Cómo se agrega un concepto.** (1) La fila en la tabla del wiki; (2) la clave acá, en camelCase español, con un ícono de lucide que NO esté
// usado por otro concepto; (3) la fila en la tabla de `test/iconos-identidad.test.ts`; (4) subir la versión del kit. Los conceptos que existen
// en un solo producto (KDS, buffet, torneos, vencimientos…) no entran hasta que un segundo producto los necesite o choquen con uno del catálogo.
//
// 📌 **`BarChart3` es `ChartColumn`.** Lucide renombró el ícono y dejó el nombre viejo como alias del MISMO componente
// (`BarChart3 === ChartColumn`, medido en lucide-react 1.43). La tabla del wiki dice `BarChart3` porque así lo importan los productos hoy; acá se
// usa el nombre vigente. Los dos son el mismo ícono y no hay nada que cambiar en un producto que importe el viejo.
import {
  BookOpen, BookText, Boxes, Calculator, CalendarCheck, CalendarDays, ChartColumn, Clock, Coins, CreditCard, FileClock, FileText, HandCoins,
  Inbox, Landmark, LayoutDashboard, MapPin, Package, Receipt, ReceiptText, ScrollText, Settings, ShoppingBag, ShoppingBasket, ShoppingCart,
  SquareStack, Store, Tags, Truck, UserCog, Users, Wallet, Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { Producto } from './identidad'

const CATALOGO = {
  dashboard: LayoutDashboard,
  agenda: CalendarDays,
  /** Clientes, y los pacientes de MedLibra. */
  clientes: Users,
  cuentaCorriente: BookOpen,
  /** Las facturas emitidas. */
  comprobantes: Receipt,
  recibos: ReceiptText,
  preFacturas: FileClock,
  /** La bandeja de comprobantes a facturar. */
  comprobantesAFacturar: Inbox,
  presupuestos: Calculator,
  remitos: FileText,
  /** Ventas y punto de venta. */
  ventas: ShoppingCart,
  ordenesDeCompra: ShoppingBasket,
  proveedores: Truck,
  /** Los transportistas de LibraCargo. Comparte `Truck` con `proveedores` en el catálogo base; LibraCargo, el único que usa los dos, mueve
   *  `proveedores` a `Store` (`ICONOS_POR_PRODUCTO`), así que dentro de un mismo producto nunca se repiten. */
  fleteros: Truck,
  /** Egresos, gastos y comprobantes de proveedores. */
  egresos: ShoppingBag,
  senas: HandCoins,
  productos: Package,
  listasDePrecio: Tags,
  stock: Boxes,
  depositos: Warehouse,
  sucursales: MapPin,
  /** La caja: el libro de movimientos de plata. */
  caja: Wallet,
  /** Las cajas: los mostradores, en configuración. */
  cajas: SquareStack,
  cajaPorMedio: Coins,
  turnosDeCaja: Clock,
  cierreDiario: CalendarCheck,
  tesoreria: Landmark,
  pagosMercadoPago: CreditCard,
  reportes: ChartColumn,
  librosDeIva: BookText,
  configuracion: Settings,
  usuarios: UserCog,
  logDeActividad: ScrollText,
} as const satisfies Record<string, LucideIcon>

export type Concepto = keyof typeof CATALOGO

/** El catálogo base: concepto → ícono de lucide. Congelado: un producto no lo muta, pide la excepción acá. */
export const ICONOS: Readonly<Record<Concepto, LucideIcon>> = Object.freeze({ ...CATALOGO })

/** Las excepciones por producto. **Sólo ahí, nunca en el producto.** Cada una es una decisión del humano, con su fecha y su porqué. */
export const ICONOS_POR_PRODUCTO: Readonly<Partial<Record<Producto, Readonly<Partial<Record<Concepto, LucideIcon>>>>>> = Object.freeze({
  // 2026-10-07: en LibraCargo el camión es de los fleteros (`fleteros` ya es `Truck`) y los proveedores llevan `Store`.
  libracargo: Object.freeze({ proveedores: Store }),
})

const RESUELTOS = new Map<Producto, Readonly<Record<Concepto, LucideIcon>>>()

/** El catálogo tal como lo ve un producto: `ICONOS` con las excepciones de ese producto encima. Sin producto, o con uno sin excepciones, es
 *  `ICONOS` mismo. El resultado es siempre el mismo objeto para el mismo producto. */
export function iconosDe(producto?: Producto): Readonly<Record<Concepto, LucideIcon>> {
  const excepciones = producto ? ICONOS_POR_PRODUCTO[producto] : undefined
  if (!producto || !excepciones) return ICONOS
  let resuelto = RESUELTOS.get(producto)
  if (!resuelto) {
    resuelto = Object.freeze({ ...ICONOS, ...excepciones })
    RESUELTOS.set(producto, resuelto)
  }
  return resuelto
}

/** El ícono de un concepto, para ese producto. Pura, para que un test compare con `===`. */
export function iconoDelConcepto(concepto: Concepto, producto?: Producto): LucideIcon {
  return iconosDe(producto)[concepto]
}

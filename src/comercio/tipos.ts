// Los tipos del catálogo, el stock y los depósitos: el contrato JSON de las
// factories de `libracommerce.web.catalogo_router` (P9-M1, 2026-09-06).
//
// Estaban escritos dos veces, en el `api.ts` de Contalibra y el de Restolibra,
// y diferían sólo en lo que cada uno tipaba de más: `tipo` en uno, los tipos de
// movimiento con `merma`/`produccion` en el otro. Acá va la **unión**, que es
// exactamente lo que el motor devuelve a los dos. Cada producto puede seguir
// re-exportando estos nombres desde su `api.ts` para no tocar sus imports.

import type { OpcionSelect } from '../SelectBuscable'
import type { TonoEstado } from '../badge-estado'

export type Producto = {
  id: number
  codigo: string | null
  nombre: string
  descripcion: string
  precio_venta: number
  precio_costo: number
  unidad: string
  categoria: string
  stock_minimo: number
  estacion: string
  vendible: number
  activo: number
  tipo: 'producto' | 'servicio'
}

export type CategoriaProducto = { id: number; nombre: string }

export type Deposito = {
  id: number
  nombre: string
  descripcion: string
  es_default: number
  activo: number
  total_productos?: number
}

export type StockItem = {
  id: number
  codigo: string | null
  nombre: string
  unidad: string
  categoria: string
  stock_minimo: number
  activo: number
  stock_actual: number
}

export type StockListado = { productos: StockItem[]; alertas: StockItem[] }

export type TipoDeMovimiento = 'entrada' | 'salida' | 'ajuste' | 'venta' | 'merma' | 'produccion'

export type MovimientoStock = {
  id: number
  producto_id: number
  producto_nombre: string
  unidad: string
  tipo: TipoDeMovimiento | string
  cantidad: number
  referencia: string
  fecha: string
  usuario_id?: number | null
  venta_id?: number | null
  created_at?: string
}

export type StockPorDeposito = { id: number; nombre: string; es_default: number; stock_actual: number }

/** Las unidades que ofrece el alta. Mismas que `GET /api/productos/unidades`. */
export const UNIDADES = ['u', 'kg', 'g', 'lt', 'ml', 'm', 'cm', 'm²', 'caja', 'par', 'docena', 'pack'] as const

/** Etiquetas de los tipos de movimiento (unión de los dos productos). */
export const TIPO_MOVIMIENTO_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
  venta: 'Venta',
  merma: 'Merma',
  produccion: 'Producción',
}

/** Una estación de comanda (Restolibra): a qué pantalla de cocina va el ítem. */
export type Estacion = { value: string; label: string }

/** Las opciones de un `SelectBuscable` de productos: el nombre como etiqueta y
 *  el código/categoría como pista, que es lo que se tipea cuando se lo sabe de
 *  memoria o está impreso en la etiqueta. */
export function opcionesProducto(
  productos: { id: number; nombre: string; codigo?: string | null; categoria?: string }[],
): OpcionSelect[] {
  return productos.map((p) => ({
    value: String(p.id),
    label: p.nombre,
    hint: [p.codigo, p.categoria].filter(Boolean).join(' · ') || undefined,
  }))
}

// ── Listas de precio (P9-M2) ─────────────────────────────────────────────

export type ListaPrecio = {
  id: number
  nombre: string
  descripcion: string
  activa: number
  es_default: number
}

/** Una fila del editor de precios de una lista: el producto con su precio de
 *  venta y de costo, y el precio en esta lista (0 y `en_lista: 0` si no está). */
export type ItemListaPrecio = {
  id: number
  codigo: string | null
  nombre: string
  unidad: string
  categoria: string
  precio_venta: number
  precio_costo: number
  precio_lista: number
  en_lista: number
}

/** Un quiebre por cantidad: desde `min_quantity` unidades, `amount`. */
export type Quiebre = { min_quantity: number; amount: number }

/** Lo que devuelve `GET /productos/buscar`, el autocompletado del punto de venta:
 *  `precio_venta` ya resuelto por la lista pedida, `precio_base` el del producto. */
export type ProductoBusqueda = {
  id: number
  codigo: string
  nombre: string
  precio_venta: number
  precio_base: number
  unidad: string
}


// ── Ventas, caja y turnos (P9-M3) ────────────────────────────────────────
// El contrato JSON de `libracommerce.web.ventas_router`,
// `libracore.ventas_cobro_router` y `libracore.caja_router`. Unión de lo que
// tipaban los dos `api.ts`: Contalibra tenía `mp_order_id`/`mp_payment_id` en
// la venta y Restolibra `punto_venta` en la caja; el backend devuelve todo a
// los dos.

export type VentaItem = { nombre: string; qty: number; precio: number; subtotal: number; producto_id: number | null }
export type VentaPago = { id?: number; medio: string; monto: number; referencia: string; estado?: string }

export type Venta = {
  id: number
  numero: string
  fecha: string
  items: VentaItem[]
  subtotal: number
  descuento: number
  total: number
  cliente_id: number | null
  cliente_nombre: string
  observaciones: string
  estado: 'pendiente' | 'parcial' | 'cobrada' | 'anulada'
  pagos: VentaPago[]
  factura_id: number | null
  factura_display: string | null
  remito_id: number | null
  /** Los devuelve `obtener_venta` desde siempre. Vacíos si no hubo QR. */
  mp_order_id: string
  mp_payment_id: string
}

export type Turno = {
  id: number
  usuario_id: number
  usuario_nombre: string
  apertura: string
  cierre: string | null
  monto_inicial: number
  monto_declarado_cierre: number | null
  monto_esperado_cierre: number | null
  estado: 'abierto' | 'cerrado'
  notas: string
  caja_id?: number | null
}

export type ResumenTurno = {
  ventas: { id: number; numero: string; fecha: string; cliente_nombre: string; total: number; estado: string }[]
  pagos_por_medio: Record<string, number>
  total_ventas: number
  efectivo_ventas: number
}

export type CajaConfig = {
  id: number
  nombre: string
  descripcion: string
  medios_pago: string[]
  es_default: number
  activo: number
  /** El punto de venta de ARCA de este mostrador. `null` = usa el de la
   *  empresa, que es el caso de toda instancia con un solo POS. */
  punto_venta: number | null
}

export type CajaMovimiento = {
  id: number
  fecha: string
  tipo: string
  concepto: string
  monto: number
  referencia: string
  factura_id: number | null
  caja_id: number | null
  caja_nombre: string | null
  usuario_nombre: string | null
  medio_pago: string
  /** 1 = anulado. La fila **queda** y sale de los totales del arqueo: un
   *  movimiento de caja se anula, no se borra. */
  anulado?: number
}

export type ResumenCaja = { ingresos: number; egresos: number; saldo_periodo: number; saldo_total: number }

/** Lo que el alta de venta necesita de un cliente: la ficha de LibraCore. */
export type ClienteDeVenta = { id: number; name: string; cuit_dni?: string; activo?: number }

/** Las opciones de un `SelectBuscable` de clientes. Estaba escrita igual en
 *  los dos `api.ts`. */
export function opcionesCliente(clientes: ClienteDeVenta[]): OpcionSelect[] {
  return clientes.map((c) => ({
    value: String(c.id),
    label: c.name,
    hint: [c.cuit_dni, c.activo ? null : 'inactivo'].filter(Boolean).join(' · ') || undefined,
  }))
}

/** `$ 1.234,56`, como lo escribían las diez pantallas — cada una con su copia. */
export function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor)
}

export const ESTADO_VENTA_TONO: Record<string, TonoEstado> = {
  cobrada: 'ok', parcial: 'atencion', pendiente: 'neutro', anulada: 'negativo',
}

const ESTADO_VENTA_LABEL: Record<string, string> = {
  cobrada: 'Cobrada', parcial: 'Pago parcial', pendiente: 'Pendiente', anulada: 'Anulada',
}

export function etiquetaDeEstadoDeVenta(estado: string): string {
  return ESTADO_VENTA_LABEL[estado] ?? estado
}

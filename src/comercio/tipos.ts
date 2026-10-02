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
import type { Factura } from '../facturas'
import type { Cliente } from '../mp'

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
  /** Sólo si el backend lo trae (v0.19.0): el `id` de la categoría, para quien la filtra por id. */
  categoria_id?: number | null
  /** Sólo si el backend lo trae (carga de vencimientos, opt-in `OpcionesCatalogo.con_vencimientos`): si el producto está
   *  marcado como perecedero (maneja lotes y fecha de vencimiento). Ausente = el producto no usa vencimientos y las
   *  pantallas no muestran nada de eso. */
  vence?: boolean
}

/** Un código de un producto (`GET /api/productos/{id}/codigos`): barras, SKU, balanza… El principal es el de `Producto.codigo`. */
export type CodigoProducto = { id: number; producto_id: number; tipo: string; codigo: string; es_principal: boolean }

/** Una variante de un producto (`GET /api/productos/{id}/variantes`): talle/color, presentaciones. */
export type VarianteProducto = {
  id: number; producto_id: number; sku: string; nombre: string; atributos: Record<string, string>; activa: boolean
}

export type CategoriaProducto = { id: number; nombre: string }

export type Deposito = {
  id: number
  nombre: string
  descripcion: string
  es_default: number
  activo: number
  total_productos?: number
  /** `locations.location_type`, en un producto con sucursales y depósitos (VentaLibra: `store`/`warehouse`). */
  tipo?: string | null
  /** La sucursal a la que pertenece, en el modelo jerárquico sucursal → depósitos (`/api/sucursales`). */
  branch_id?: number | null
}

/** Una sucursal del modelo jerárquico (`GET /api/sucursales`): agrupa depósitos, y el stock vive sólo en éstos. */
export type Sucursal = {
  id: number
  nombre: string
  codigo: string | null
  direccion: string | null
  activa: number | boolean
  /** La sucursal predeterminada de la instancia. */
  es_default: number | boolean
  /** El depósito de venta de la sucursal (el predeterminado de la sucursal). */
  deposito_predeterminado_id: number | null
  /** La cantidad de depósitos activos de la sucursal. */
  depositos: number
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
  /** Stock en cada depósito (`{depositoId: cantidad}`), en un producto con varios (`OpcionesStock.por_deposito`). */
  por_deposito?: Record<string, number>
}

/** Un depósito como columna del stock, en un producto con varios. */
export type DepositoColumna = { id: number; nombre: string; tipo?: string | null; es_default?: number }

export type StockListado = { productos: StockItem[]; alertas: StockItem[]; depositos?: DepositoColumna[] }

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
  deposito_id?: number | null
}

/** Una transferencia del historial (`GET /api/depositos/transferencias`). */
export type TransferenciaDeStock = {
  id: number
  producto_id: number
  producto: string
  variant_id: number | null
  cantidad: number
  origen_id: number
  origen: string
  destino_id: number
  destino: string
  fecha: string
  observaciones: string
  usuario_id: number | null
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

/** Una promoción (`GET /api/promociones`): "llevá N pagá M" o un combo fijo.
 *  `nxm`: un solo ítem, `cantidad` = las que se llevan y `paga` = las que se pagan.
 *  `combo`: dos o más ítems y un `precio` cerrado para el paquete entero. */
export type ItemPromocion = { producto_id: number; cantidad: number; nombre?: string }
export type Promocion = {
  id: number
  nombre: string
  tipo: 'nxm' | 'combo'
  paga: number | null
  precio: number | null
  desde: string | null
  hasta: string | null
  activa: number
  items: ItemPromocion[]
}

/** Qué promoción se aplicó a un carrito y cuánto ahorró (`POST /api/promociones/calcular`,
 *  y `promociones` en el detalle de una venta). `promocion_id` es `null` si se borró después. */
export type PromocionAplicada = { promocion_id: number | null; nombre: string; veces: number; ahorro: number }
export type CalculoPromociones = { aplicadas: PromocionAplicada[]; ahorro: number }

/** Una fila de `item_prices` con vigencia y/o sucursal real (no el flat ni un
 *  quiebre): `GET/DELETE /api/listas-precio/items/{producto_id}/vigencias`. */
export type PrecioVigente = {
  id: number
  producto_id: number
  lista_id: number
  monto: number
  moneda: string
  desde: string
  hasta: string | null
  cantidad_minima: number | null
  sucursal_id: number | null
}

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

export type VentaItem = {
  nombre: string; qty: number; precio: number; subtotal: number; producto_id: number | null
  /** El id de `sale_items` (F4, 2026-09-15): opcional porque el alta y los
   *  fixtures de test arman el ítem sin él. Lo devuelve `obtener_venta` desde
   *  que existe `POST /{vid}/devolver` — sin esto ningún consumidor puede
   *  armar ese payload (pide `sale_item_id`) sin leer la base directamente. */
  id?: number
}
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
  /** Las promociones que se aplicaron a la venta (`sale_promotions`). Sólo las trae un producto que las
   *  monta (VentaLibra); su ahorro ya está dentro de `descuento`. */
  promociones?: PromocionAplicada[]
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
  /** La caja y la sucursal donde está abierto, cuando el producto las trae
   *  (VentaLibra: `enriquecer` de `build_turnos_router`). Sin ellas no se muestra nada. */
  caja?: { id: number; nombre: string; punto_venta?: number | null } | null
  sucursal?: { id: number; nombre: string } | null
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
  /** El `external_id` del POS de MercadoPago de este mostrador. Cada caja
   *  con QR necesita el suyo propio; `null` o vacío deja la caja sin QR. */
  mp_pos_id: string | null
  /** Sólo en un producto con sucursales (`CajaPayload.sucursal_id`). */
  sucursal_id?: number | null
  /** El nombre de la sucursal, si el producto lo agrega (`OpcionesCajas.enriquecer`). */
  sucursal_nombre?: string | null
  /** Si hay un turno abierto en esta caja, de cualquier cajero: no se ofrece para abrir otro. */
  tiene_turno_abierto?: boolean
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

// ── P9-M4 (2026-09-07): lo financiero y transversal ──────────────────────
// Los tipos que las catorce pantallas de clientes, proveedores, egresos,
// tesorería, cuenta corriente, libros IVA, logs y reportes declaraban en el
// `api.ts` de cada producto — iguales en los dos. El contrato es el de las
// factories de `libracore` (`clientes_router`, `egresos_router`, ...).

export type AliasFacturacion = {
  id: number
  tipo: 'cuit' | 'email'
  valor: string
  cliente_id: number
}

/** Lo que la ficha muestra de un presupuesto o un remito del cliente
 *  (`GET /api/clientes/{id}`). */
export type PresupuestoDeCliente = {
  id: number; number: string; date: string; valid_until?: string; status: string; total: number
}
export type RemitoDeCliente = { id: number; number: string; date: string; total: number }

export type ClienteConAlias = Cliente & {
  alias_facturacion: AliasFacturacion[]
  facturas: Factura[]
  presupuestos: PresupuestoDeCliente[]
  remitos: RemitoDeCliente[]
}

export type Proveedor = {
  id: number
  nombre: string
  cuit_dni: string
  email: string
  phone: string
  address: string
  iva_condition: string
}

export type Egreso = {
  id: number
  fecha: string
  proveedor_id: number | null
  proveedor_nombre: string
  tipo_comprobante: string
  numero: string
  categoria: string
  concepto: string
  monto_neto: number
  iva_pct: number
  iva_monto: number
  total: number
  estado: 'pendiente' | 'parcial' | 'pagado'
  observaciones: string
}

export type ResumenEgresos = {
  total_periodo: number
  pagado: number
  pendiente: number
}

export type CategoriaEgreso = { id: number; nombre: string }

export type PagoEgreso = {
  id: number
  egreso_id: number
  fecha: string
  monto: number
  caja_id: number | null
  medio_pago: string
  referencia: string
}

export const TIPOS_COMPROBANTE = [
  { id: 'factura', label: 'Factura' },
  { id: 'ticket', label: 'Ticket / Recibo' },
  { id: 'recibo', label: 'Recibo oficial' },
  { id: 'otro', label: 'Otro' },
] as const

export function opcionesProveedor(proveedores: Proveedor[]): OpcionSelect[] {
  return proveedores.map((p) => ({
    value: String(p.id),
    label: p.nombre,
    hint: p.cuit_dni || undefined,
  }))
}

/** Las categorías de egreso se guardan por NOMBRE en el egreso, no por id. */
export function opcionesCategoriaPorNombre(categorias: { id: number; nombre: string }[]): OpcionSelect[] {
  return categorias.map((c) => ({ value: c.nombre, label: c.nombre }))
}

// ── Compras (F9, 2026-09-27) ──────────────────────────────────────────────
// El contrato de `libracommerce.web.compras_router` (v0.21.0), extraído de
// VentaLibra: el único producto de la familia que compra con seguimiento de
// pedido/recibido y movimiento de stock (Contalibra/Restolibra resuelven
// "comprarle a un proveedor" con Egresos, sin eso). Los campos hablan el
// vocabulario del dominio, salvo `proveedor_id`: lo único que un producto
// puede traducir a su propio esquema de ids (`OpcionesCompras`).

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Borrador', sent: 'Enviada', partial: 'Recibida parcial',
  received: 'Recibida', cancelled: 'Cancelada',
}

export const PURCHASE_ORDER_STATUS_TONO: Record<PurchaseOrderStatus, TonoEstado> = {
  draft: 'neutro', sent: 'curso', partial: 'atencion',
  received: 'ok', cancelled: 'negativo',
}

export type PurchaseOrderItem = {
  item_id: number
  quantity_ordered: string
  quantity_received: string
  pending_quantity: string
  unit_cost: string
  tax_rate: string
  subtotal: string
}

export type PurchaseOrder = {
  id: number
  number: string
  /** El `proveedor_id` del producto: con el que se pide y se nombra al proveedor. Nunca `supplier_party_id`
   *  (el motor lo traduce puertas adentro, ver `OpcionesCompras.resolver_proveedor`/`proveedor_de`). */
  proveedor_id: number
  status: PurchaseOrderStatus
  items: PurchaseOrderItem[]
  is_fully_received: boolean
}

export type PurchaseReceiptStatus = 'draft' | 'confirmed'

export const PURCHASE_RECEIPT_STATUS_LABELS: Record<PurchaseReceiptStatus, string> = {
  draft: 'Borrador', confirmed: 'Confirmada',
}

export const PURCHASE_RECEIPT_STATUS_TONO: Record<PurchaseReceiptStatus, TonoEstado> = {
  draft: 'neutro', confirmed: 'ok',
}

export type PurchaseReceiptItem = {
  item_id: number
  quantity: string
  unit_cost: string
  lot_code: string | null
  expires_at: string | null
}

export type PurchaseReceipt = {
  id: number
  proveedor_id: number
  purchase_order_id: number | null
  status: PurchaseReceiptStatus
  items: PurchaseReceiptItem[]
  received_at: string | null
  document_reference: string | null
}

export type ClienteConSaldoCC = { id: number; name: string; cuit_dni: string; saldo: number }

export type MovimientoCC = {
  fecha: string
  tipo: 'debito' | 'credito'
  concepto: string
  monto: number
  referencia: string
  medio: string
  cc_pago_id: number | null
  usuario_nombre: string | null
  venta_id: number | null
  factura_id: number | null
}

/** Una factura a cuenta corriente sin cobro: a estas se le puede aplicar un pago. */
export type FacturaPendienteCC = {
  id: number
  concepto: string
  fecha: string
  total: number
  pendiente: number
}

export type CuentaTesoreria = {
  id: number
  nombre: string
  tipo: string
  banco: string
  numero: string
  descripcion: string
  saldo_inicial: number
  saldo: number
  activa: number
}

export type MovimientoTesoreria = {
  id: number
  fecha: string
  cuenta_id: number
  cuenta_nombre: string
  cuenta_destino_id: number | null
  cuenta_destino_nombre: string | null
  tipo: string
  monto: number
  concepto: string
  referencia: string
  transferencia_id: number | null
  usuario_nombre: string | null
}

export const TIPOS_CUENTA_TESORERIA = [
  { value: 'banco', label: 'Banco' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'digital', label: 'Billetera digital' },
  { value: 'otro', label: 'Otro' },
] as const

export type LibroIvaFactura = {
  id: number; tipo: number; punto_venta: number; numero: number; fecha: string
  cliente_razon: string; cliente_cuit: string; subtotal: number; iva_amount: number; total: number
  cae?: string
}

export type LibroIvaEgreso = {
  id: number; fecha: string; proveedor_nombre: string; numero: string
  monto_neto: number; iva_monto: number; total: number
  proveedor_cuit?: string; iva_pct?: number
}

export type ResumenIva = {
  cbtes: number; neto: number; iva: number; total: number
  por_tasa: Record<string, { neto: number; iva: number; cbtes: number }>
}

export type LibrosIvaData = {
  desde: string; hasta: string; empresa_cuit: string
  facturas: LibroIvaFactura[]; egresos: LibroIvaEgreso[]
  resumen_v: ResumenIva; resumen_c: ResumenIva
}

export type ReporteResumen = {
  ventas_cantidad: number; ventas_total: number; facturas_cantidad: number; caja_saldo: number
}
export type ReporteVentaTs = { periodo: string; cantidad: number; total: number }
export type ReporteMedio = { medio: string; operaciones: number; total: number }
export type ReporteProducto = { nombre: string; cantidad: number; total: number }
export type ReporteCaja = { tipo: string; cantidad: number; total: number }
export type ReporteStockBajo = { id: number; nombre: string; codigo: string | null; stock_actual: number; stock_minimo: number }

export type ReportesData = {
  desde: string; hasta: string; agrupacion: string
  resumen: ReporteResumen; ventas_ts: ReporteVentaTs[]; medios: ReporteMedio[]
  productos: ReporteProducto[]; caja: ReporteCaja[]; stock_bajo: ReporteStockBajo[]
  /** Cómo se llama cada medio, **incluidos los históricos**: un reporte mira
   *  meses para atrás y ahí hay filas con `tarjeta` y `mercado_pago`. Viene del
   *  backend porque la pantalla ya no declara el vocabulario. */
  medio_label: Record<string, string>
}

// ── Margen y rotación (`GET /api/reportes/margen`, `libracommerce.erp.margen`) ──

/** Lo que comparten el resumen, cada producto y cada período. `costo_estimado`: alguna línea usó el costo
 *  de HOY porque la venta no guardó el suyo. `sin_costo`: alguna línea no tiene costo de ningún lado, y su
 *  margen figura como si fuera todo ganancia. */
export type MargenCifras = {
  unidades: number; ingreso: number; costo: number; margen: number
  /** `null` cuando no hubo ingreso: dividir por cero no es un 0 %. */
  margen_pct: number | null
  costo_estimado: boolean; sin_costo: boolean
}
export type MargenProducto = MargenCifras & {
  producto_id: number; nombre: string
  /** `null` cuando el rango no está cerrado (falta `desde` o `hasta`). */
  unidades_por_dia: number | null
}
export type MargenPeriodo = MargenCifras & { periodo: string }
export type MargenResumen = MargenCifras & {
  productos: number; productos_costo_estimado: number; productos_sin_costo: number; dias: number | null
}
export type MargenOrden = 'margen' | 'margen_pct' | 'ingreso' | 'costo' | 'unidades' | 'unidades_por_dia' | 'nombre'
export type MargenSentido = 'asc' | 'desc'
export type MargenAgrupacion = 'dia' | 'semana' | 'mes'

export type MargenData = {
  desde: string; hasta: string; agrupacion: MargenAgrupacion
  producto_id: number | null; orden: MargenOrden; sentido: MargenSentido
  resumen: MargenResumen; productos: MargenProducto[]; periodos: MargenPeriodo[]
}

// ── Reposición sugerida (`GET /api/reportes/reposicion`, `libracommerce.erp.reposicion`, ADR-017) ──

/** Por qué se sugiere pedir: `bajo_minimo` (lo que hay más lo que viene no llega al stock mínimo), `por_rotacion`
 *  (no alcanza para lo que se vende en el horizonte) o `ambos`. `null` cuando no hay nada que pedir (sólo con
 *  `solo_a_pedir=false`). */
export type ReposicionMotivo = 'bajo_minimo' | 'por_rotacion' | 'ambos'

/** Las cantidades vienen ya redondeadas a la escala de la unidad del producto (entero, o con decimales si la
 *  unidad admite fracciones): la pantalla las muestra tal cual. */
export type ReposicionProducto = {
  producto_id: number
  codigo: string | null
  nombre: string
  unidad: string
  /** `''` si el producto no tiene categoría. */
  categoria: string
  stock: number
  /** La parte de `stock` que está en lotes ya vencidos y la sugerencia no cuenta (motor >= 0.31.0, ADR-019). Falta con un
   *  motor anterior: se toma como 0. */
  vencido?: number
  /** Lo pedido a proveedores que todavía no llegó (órdenes abiertas, `draft` incluido). */
  en_camino: number
  /** La parte de `en_camino` que sale de órdenes sin sucursal: con una sucursal elegida se cuenta igual. */
  en_camino_sin_sucursal: number
  stock_minimo: number
  unidades_vendidas: number
  dias_con_stock: number
  rotacion_diaria: number
  /** `null` sin ventas en la ventana: no hay rotación con qué calcularla. */
  cobertura_dias: number | null
  sugerido: number
  motivo: ReposicionMotivo | null
  sin_ventas: boolean
  /** Stock <= 0 o algún día sin stock en la ventana: la rotación es una estimación, posiblemente baja. */
  posible_quiebre: boolean
  variantes: number
  /** El proveedor habitual del producto (motor >= 0.33.0, ADR-021). Faltan con un motor anterior; `null` sin proveedor definido. */
  proveedor_id?: number | null
  proveedor?: string | null
}

export type ReposicionResumen = { productos: number; a_pedir: number; posible_quiebre: number; sin_ventas: number }

export type ReposicionData = {
  dias_rotacion: number; dias_cobertura: number; plazo_entrega_dias: number
  sucursal_id: number | null; categoria: string | null; producto_id: number | null; solo_a_pedir: boolean
  /** El proveedor por el que se filtró (motor >= 0.33.0). La clave misma dice que el motor maneja proveedores: falta con uno anterior. */
  proveedor_id?: number | null
  resumen: ReposicionResumen
  /** En orden de urgencia: menor cobertura primero, después mayor `sugerido`; sin rotación al final. */
  productos: ReposicionProducto[]
}

// ── Vencimientos y lotes (`/api/vencimientos`, `libracommerce.erp.vencimientos`, ADR-018) ──
//
// Los nombres son los del motor, tal cual. Las cantidades (`saldo`, `cantidad`, …) vienen como `int` si son enteras y
// `float` si no, ya limpias del ruido de la suma: la pantalla las muestra como llegan.

/** `vencido` si `vence < hoy`; un lote que vence hoy es `por_vencer` (con `dias_para_vencer = 0`). */
export type VencimientoEstado = 'vencido' | 'por_vencer'

/** Un lote con saldo > 0 de un producto marcado (`lotes` de `GET /api/vencimientos`), por vencimiento. */
export type VencimientoLote = {
  producto_id: number
  codigo: string | null
  nombre: string
  unidad: string
  /** `''` si el producto no tiene categoría. */
  categoria: string
  deposito_id: number
  deposito: string
  /** Un depósito que ya no se usa igual se mira: la mercadería existe aunque el depósito esté dado de baja. */
  deposito_activo: boolean
  sucursal_id: number | null
  sucursal: string | null
  variante_id: number | null
  variante: string | null
  /** `null` si el lote no tiene código pero sí fecha. */
  lote: string | null
  /** `'AAAA-MM-DD'`. */
  vence: string
  /** Negativo = ya vencido. */
  dias_para_vencer: number
  saldo: number
  estado: VencimientoEstado
}

/** `sin_fecha`: saldo sin lote positivo (hay que asignarle un vencimiento). `salidas_sin_lote`: saldo sin lote
 *  negativo, o sea salidas que hasta A-4 no bajaron ningún lote: los saldos de los lotes están sobreestimados. */
export type VencimientoSituacion = 'sin_fecha' | 'salidas_sin_lote'

/** Un saldo «sin lote» ≠ 0 de un producto marcado: uno por producto, depósito y variante (`sin_lote` de `GET /api/vencimientos`). */
export type VencimientoSinLote = {
  producto_id: number
  codigo: string | null
  nombre: string
  unidad: string
  categoria: string
  deposito_id: number
  deposito: string
  deposito_activo: boolean
  sucursal_id: number | null
  sucursal: string | null
  variante_id: number | null
  variante: string | null
  saldo: number
  situacion: VencimientoSituacion
}

export type VencimientosResumen = {
  lotes_por_vencer: number
  lotes_vencidos: number
  /** Suma de cantidades, cada una en la unidad de su producto (kg y u se suman como números). */
  unidades_por_vencer: number
  unidades_vencidas: number
  productos: number
  productos_sin_lote: number
  productos_con_salidas_sin_lote: number
  saldos_sin_fecha: number
  saldos_con_salidas_sin_lote: number
}

export type VencimientosData = {
  sucursal_id: number | null
  deposito_id: number | null
  categoria: string | null
  producto_id: number | null
  incluir_vencidos: boolean
  /** La fecha de hoy en Argentina según el motor, `'AAAA-MM-DD'`. */
  hoy: string
  dias: number
  /** `hoy + dias`, inclusive. */
  hasta: string
  resumen: VencimientosResumen
  lotes: VencimientoLote[]
  sin_lote: VencimientoSinLote[]
}

/** `GET /api/vencimientos/productos/{id}/lotes`: la ficha (`vence` dice si está marcado). */
export type VencimientoFicha = { producto_id: number; codigo: string | null; nombre: string; unidad: string; vence: boolean }

/** Una existencia por lote de un producto (saldo ≠ 0), incluido el bucket sin lote (`lote` y `vence` en `null`). */
export type VencimientoExistencia = {
  producto_id: number
  deposito_id: number
  deposito: string
  deposito_activo: boolean
  sucursal_id: number | null
  sucursal: string | null
  variante_id: number | null
  variante: string | null
  lote: string | null
  vence: string | null
  dias_para_vencer: number | null
  saldo: number
  sin_lote: boolean
  estado: 'vencido' | 'vigente' | 'sin_fecha'
}

export type VencimientoProductoLotes = { producto: VencimientoFicha; hoy: string; lotes: VencimientoExistencia[] }

/** `PUT /api/vencimientos/productos/{id}` (cuerpo `{vence}`, estricto: un booleano) devuelve `{producto_id, vence}`. */
export type VencimientoMarca = { producto_id: number; vence: boolean }

/** `POST /api/vencimientos/merma`. `clave_operacion` es obligatoria: una por intento del usuario, que se reenvía IGUAL al
 *  reintentar (con la misma clave y los mismos datos el motor no descuenta otra vez y contesta `repetida: true`). */
export type VencimientoMermaPayload = {
  producto_id: number
  deposito_id: number
  variante_id: number | null
  /** Con `vence`: los del bucket tal como los devuelve el reporte. */
  lote: string | null
  vence: string | null
  cantidad: number
  clave_operacion: string
  motivo: string
  nota: string
}

export type VencimientoMermaRespuesta = {
  producto_id: number
  deposito_id: number
  variante_id: number | null
  lote: string | null
  vence: string | null
  cantidad: number
  saldo_restante: number
  repetida: boolean
}

/** `POST /api/vencimientos/asignar`: le pone lote y vencimiento a saldo que hoy no lo tiene. Misma regla de la clave. */
export type VencimientoAsignarPayload = {
  producto_id: number
  deposito_id: number
  variante_id: number | null
  lote: string
  /** `'AAAA-MM-DD'`. */
  vence: string
  cantidad: number
  clave_operacion: string
  nota: string
}

export type VencimientoAsignarRespuesta = {
  producto_id: number
  deposito_id: number
  variante_id: number | null
  lote: string
  vence: string
  cantidad: number
  referencia: string
  /** Lo que quedó sin lote al terminar la operación. */
  saldo_sin_lote: number
  repetida: boolean
}

/** `POST /api/vencimientos/entrada`: una entrada manual de stock NUEVO con lote y vencimiento (suma stock; no toca el «sin
 *  lote»). Misma regla de la clave que `merma` y `asignar`. */
export type VencimientoEntradaPayload = {
  producto_id: number
  deposito_id: number
  variante_id: number | null
  lote: string
  /** `'AAAA-MM-DD'`. */
  vence: string
  cantidad: number
  clave_operacion: string
  nota: string
}

export type VencimientoEntradaRespuesta = {
  producto_id: number
  deposito_id: number
  variante_id: number | null
  lote: string
  vence: string
  cantidad: number
  referencia: string
  /** El saldo de ese lote (en ese depósito y variante) tras la entrada. */
  saldo_lote: number
  repetida: boolean
}

export type CajaMedioVals = { ingresos: number; ingresos_ops: number; egresos: number; egresos_ops: number }

export type CajaMedioPivot = {
  id: number; nombre: string; medios: Record<string, CajaMedioVals>
  total_ingresos: number; total_egresos: number; saldo: number
}

export type CajaMediosData = {
  desde: string; hasta: string
  cajas_config: CajaConfig[]
  cajas: CajaMedioPivot[]
  totales: Record<string, CajaMedioVals>
  medio_label: Record<string, string>
}

export type LogActividad = {
  ts: string
  fecha: string
  tipo: string
  descripcion: string
  monto: number
  usuario: string
  turno_id: number | null
  /** Para el link "Ver" por fila; opcionales por si un registro viejo no los trae. */
  ref_tabla?: string | null
  ref_id?: number | null
}

export type LogAuth = { id: number; evento: string; username: string; ip: string; ts: string }

export type LogsData = {
  actividad: LogActividad[]
  tipo_meta: Record<string, { label: string; color: string }>
  total: number
  total_pages: number
  page: number
  usuarios: { id: number; nombre: string; role: string }[]
  auth_log: LogAuth[]
}

// ── Dashboard (fase 13, 2026-09-27) ───────────────────────────────────────
// El contrato de `libracore.dashboard_router.build_dashboard_router`.
// Extraído de `pages/Dashboard.tsx` de Contalibra (F9, el único de los tres
// productos con pantalla propia: Restolibra lo redirige a `/salon` sin
// llegar a renderizarlo).

export type FacturaSinCobrar = {
  id: number
  tipo: number
  punto_venta: number
  numero: number
  fecha: string
  cliente_razon: string
  total: number
  letra: string
  label_numero: string
}

export type PresupuestoPendiente = {
  id: number
  number: string
  date: string
  client_name: string
  total: number
}

/** Un movimiento crudo de `caja_movimientos` (`SELECT *`, sin el `JOIN` a cajas/usuarios que sí trae
 *  `CajaMovimiento`): lo que devuelve el tablero en `ultimos_movimientos`. */
export type MovimientoDashboard = {
  id: number
  fecha: string
  tipo: string
  concepto: string
  monto: number
  referencia: string
  factura_id: number | null
  medio_pago: string
}

export type DashboardData = {
  mes_desde: string
  mes_hasta: string
  facturado_mes: number
  cobrado_mes: number
  egresos_mes: number
  saldo_total: number
  cant_facturas_mes: number
  facturas_sin_cobrar: FacturaSinCobrar[]
  presupuestos_pendientes: PresupuestoPendiente[]
  ultimos_movimientos: MovimientoDashboard[]
}

// ── Actualización masiva de precios (roadmap de producto, 2026-09-28) ───────
export type LineaActualizada = {
  producto_id: number
  codigo: string
  nombre: string
  costo_actual: number
  costo_nuevo: number
  venta_actual: number
  venta_nueva: number
  margen_calculado: boolean
}
export type LineaNoEncontrada = { codigo: string; motivo: string }
export type ResultadoPlanilla = { actualizaciones: LineaActualizada[]; no_encontrados: LineaNoEncontrada[] }

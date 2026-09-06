// Los tipos del catálogo, el stock y los depósitos: el contrato JSON de las
// factories de `libracommerce.web.catalogo_router` (P9-M1, 2026-09-06).
//
// Estaban escritos dos veces, en el `api.ts` de Contalibra y el de Restolibra,
// y diferían sólo en lo que cada uno tipaba de más: `tipo` en uno, los tipos de
// movimiento con `merma`/`produccion` en el otro. Acá va la **unión**, que es
// exactamente lo que el motor devuelve a los dos. Cada producto puede seguir
// re-exportando estos nombres desde su `api.ts` para no tocar sus imports.

import type { OpcionSelect } from '../SelectBuscable'

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

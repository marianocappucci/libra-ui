/**
 * La tabla de la familia Libra: que features monta y como se tipan sus
 * columnas.
 *
 * Vive aparte de `data-table.tsx` porque `libraFeatures` es un **valor** y no
 * un componente: exportarlo desde el mismo archivo que `DataTable` rompe el
 * Fast Refresh de Vite (`react(only-export-components)`).
 */
import {
  type ColumnDef as ColumnDefTanstack,
  type RowData,
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/table-core'

// --- las features que este kit usa, y nada mas ----------------------------
//
// TanStack Table v9 es modular: la tabla declara que features monta, y los
// tipos se derivan de esa declaracion. Se listan solo las cinco que
// `DataTable` usa de verdad -- ordenar, filtrar (por columna y global), y el
// ancho/resize de columnas -- asi el resto no entra al bundle.
export const libraFeatures = tableFeatures({
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  // La que aporta `row.getVisibleCells()`, que el cuerpo de la tabla usa para
  // renderizar las celdas. En v9 nada esta disponible por defecto: si la
  // feature no se declara, el metodo no existe -- y lo dice el typecheck, no
  // un undefined en runtime.
  columnVisibilityFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns,
  sortFns,
})

export type LibraFeatures = typeof libraFeatures

/**
 * La restriccion que TanStack le pone a la fila (`any[] | Record<string, any>`).
 *
 * Se re-exporta porque un consumidor que escribe su **propio helper generico**
 * sobre `ColumnDef` --por ejemplo una `columnaDeAcciones<T>()` compartida-- tiene
 * que acotar su `T`, y desde que el kit se quedo con `@tanstack/react-table`
 * como dependencia propia ya no puede importarla de ahi. Sin esto, el consumidor
 * tendria que volver a declarar el motor solo para nombrar un tipo, que es
 * exactamente el acoplamiento del que este cambio lo saca.
 */
export type { RowData }

/**
 * El `ColumnDef` de la familia Libra.
 *
 * 🔴 **Los consumidores importan ESTE, no el de `@tanstack/react-table`.**
 *
 * En v9 el tipo de TanStack lleva un parametro de features
 * (`ColumnDef<TFeatures, TData>`), y hacer que los diez consumidores lo
 * declaren significaria tocar cada definicion de columnas del parque y volver
 * a acoplarlos a la version del motor. Con este alias el kit **absorbe** ese
 * parametro: la firma que ve un consumidor es la misma de siempre,
 * `ColumnDef<MiFila>`, y `@tanstack/react-table` deja de ser algo que cada
 * producto tenga que declarar y mantener en version.
 *
 * Es la leccion del salto v8 -> v9: un peer del kit que cambia de major rompe
 * a los diez a la vez. Lo que el kit expone es su propia superficie.
 */
export type ColumnDef<TData extends RowData, TValue = unknown> =
  ColumnDefTanstack<LibraFeatures, TData, TValue>

/** El ancho de columna que TanStack usa cuando la columna no declara `size`. */
const ANCHO_POR_DEFECTO = 150

/** Cuánto necesita la tabla para no scrollear: lo mismo que `DataTable` fija como `min-width` (la suma de lo que mide cada columna visible). 0 si ninguna columna declara `size` (entonces la
 *  tabla es de layout automático y no hay un mínimo que comparar). */
export function anchoMinimoDeColumnas<TData extends RowData>(columns: ColumnDef<TData>[]): number {
  if (!columns.some((c) => c.size !== undefined)) return 0
  return columns.reduce((total, c) => {
    // `meta.opcional` lo declara `data-table.tsx`; acá se lee sin depender de que ese módulo esté en el programa (quien importa sólo `libra-ui/tabla` no tiene la ampliación de `ColumnMeta`).
    if ((c.meta as { opcional?: boolean } | undefined)?.opcional) return total
    return total + Math.min(Math.max(c.minSize ?? 20, c.size ?? ANCHO_POR_DEFECTO), c.maxSize ?? Infinity)
  }, 0)
}


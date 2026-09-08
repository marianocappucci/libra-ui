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

// v0.2.0 (2026-07-27): reemplaza la version original (extraida 2026-07-26
// de Gestiolibra/MedLibra/VentaLibra, solo sorting) por la version mas
// avanzada desarrollada en Contalibra -- resize de columnas por drag,
// columnas elasticas (meta.stretch) y click en fila (onRowClick). Ver
// wiki/entities/libra-ui.md para el detalle de la migracion.
//
// Gating por `anySized` (nuevo en esta version): si NINGUNA columna
// declara `size` explicito, el componente renderiza exactamente como la
// version anterior (tabla simple, layout automatico del navegador, sin
// resize) -- preserva pixel a pixel a los consumidores que no especifican
// anchos de columna (Gestiolibra/MedLibra/VentaLibra hoy, y cualquier
// tabla de Contalibra/Restolibra que tampoco los declare). Si alguna
// columna SI declara `size`, se activa el modo completo (table-fixed +
// colgroup + resize + columnas elasticas), igual que el comportamiento
// que ya tenia Contalibra.
import {
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    // Clase opcional para ocultar/priorizar columnas segun breakpoint,
    // ej. 'hidden md:table-cell' en columnas secundarias -- evita que
    // tablas con muchas columnas fuercen scroll horizontal en mobile.
    className?: string
    // Columna elastica: absorbe el ancho sobrante en vez de quedarse en su
    // `size`. Permite fijar las columnas angostas (numero, fecha, estado,
    // acciones) al ancho de su contenido y que la columna larga (cliente,
    // descripcion) se quede con el resto, de modo que la tabla llene el
    // ancho disponible sin desbordarlo. Deja de ser elastica en cuanto el
    // usuario la redimensiona a mano -- ahi manda lo que el usuario eligio.
    stretch?: boolean
    // Marca la columna como secundaria: se oculta por CSS en pantallas
    // angostas (via `className`, ej. 'hidden min-[1400px]:table-cell') Y se
    // excluye del ancho minimo de la tabla. Sin esto ultimo la columna
    // seguiria reservando su `size` en el minWidth y la tabla pediria scroll
    // por una columna que ni se ve. El breakpoint del className se elige de
    // modo que, cuando la columna reaparece, ya haya ancho para todas.
    opcional?: boolean
    // Clase equivalente para el <col> del <colgroup>, que ademas de ocultarse
    // tiene que dejar de reservar su ancho. OJO: un <col> NO puede usar
    // `table-cell` (lo convierte en celda anonima y descoloca todo el
    // colgroup) -- va `table-column`, ej. 'hidden min-[1400px]:table-column'.
    colClassName?: string
  }
}

// Piezas del layout de una celda de acciones. Son los valores reales de las
// clases de Tailwind que usan todas las tablas de la familia, no numeros
// elegidos a ojo: `size="icon"` es `size-9`, los botones van en un flex con
// `gap-1`, y `TableCell` de shadcn trae `p-2` (8px por lado).
const ANCHO_BOTON_ICONO = 36
const GAP_ENTRE_BOTONES = 4
const PADDING_CELDA = 16

/**
 * Ancho para la columna de acciones de una tabla, a partir de la cantidad
 * MAXIMA de botones de icono que puede llegar a mostrar una fila.
 *
 * Existe porque la cuenta hecha a mano se venia haciendo mal: es facil sumar
 * botones y gaps y olvidarse del `p-2` de la celda. En la tabla de
 * comprobantes de Contalibra eso dejaba la columna en 116px cuando tres
 * botones necesitan 132 — como el contenido va alineado a la derecha
 * (`justify-end`) y la celda tiene `overflow: hidden`, el recorte se comia
 * 16px del PRIMER boton, no del ultimo (bug real reportado 2026-07-28).
 *
 * Si una fila puede mostrar un boton condicional, pasar el maximo: la
 * columna tiene un unico ancho para toda la tabla.
 */
export function anchoColumnaAcciones(cantidadBotones: number): number {
  if (cantidadBotones <= 0) return PADDING_CELDA
  return (
    cantidadBotones * ANCHO_BOTON_ICONO +
    (cantidadBotones - 1) * GAP_ENTRE_BOTONES +
    PADDING_CELDA
  )
}

export function sortableHeader(label: string) {
  return ({ column }: { column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' } }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label}
      <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
    </Button>
  )
}

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  emptyMessage?: ReactNode
  // Clase opcional por fila -- restaura el atenuado que las tablas Bootstrap
  // viejas aplicaban a filas inactivas (ej. `opacity-50` en clientes/list.html,
  // `table-secondary` en productos/list.html).
  getRowClassName?: (row: TData) => string | undefined
  // Navegacion al hacer click en cualquier parte de la fila que no sea un
  // control interactivo propio (boton/link dentro de una celda de acciones).
  onRowClick?: (row: TData) => void
}

export function DataTable<TData, TValue>({
  columns, data, emptyMessage = 'Sin resultados.', getRowClassName, onRowClick,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})

  // Si ninguna columna declara `size`, se desactiva el resize por completo y
  // se preserva el layout automatico de siempre (ver comentario de arriba).
  const anySized = columns.some((c) => c.size !== undefined)

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableColumnResizing: anySized,
    columnResizeMode: 'onChange',
    onColumnSizingChange: setColumnSizing,
    state: { sorting, columnSizing },
  })

  // Una columna elastica (meta.stretch) se emite sin ancho en el <colgroup>:
  // con table-layout:fixed el navegador le da todo el sobrante, asi la tabla
  // llena el ancho disponible. Si el usuario la redimensiona a mano deja de
  // ser elastica y pasa a respetar el ancho elegido.
  const headers = table.getFlatHeaders()
  const esElastica = (header: (typeof headers)[number]) =>
    Boolean(header.column.columnDef.meta?.stretch) && columnSizing[header.column.id] === undefined

  // Las columnas `opcional` (ocultas por CSS en pantallas angostas) no cuentan
  // para el ancho minimo: si contaran, la tabla pediria scroll por una columna
  // que no se esta viendo.
  const anchoMinimo = headers.reduce(
    (total, header) => (header.column.columnDef.meta?.opcional ? total : total + header.getSize()),
    0,
  )

  return (
    <Table
      className={anySized ? 'table-fixed' : undefined}
      // minWidth = suma de las columnas visibles siempre: si no entran, el
      // overflow-x-auto del contenedor scrollea (comportamiento de siempre).
      // width 100% evita que sobre espacio a la derecha cuando si entran -- el
      // sobrante se lo lleva la columna elastica, o se reparte entre todas.
      style={anySized ? { width: '100%', minWidth: anchoMinimo } : undefined}
    >
      {anySized && (
        <colgroup>
          {headers.map((header) => (
            <col
              key={header.id}
              // Clase propia del <col> (ver meta.colClassName): sin esto el col
              // seguiria reservando su ancho aunque las celdas esten ocultas.
              className={header.column.columnDef.meta?.colClassName}
              style={esElastica(header) ? undefined : { width: header.getSize() }}
            />
          ))}
        </colgroup>
      )}
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id} className={cn(anySized && 'relative select-none overflow-hidden', header.column.columnDef.meta?.className)}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
                {anySized && header.column.getCanResize() && (
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none select-none',
                      'after:absolute after:right-0 after:top-1 after:bottom-1 after:w-px after:bg-border hover:after:bg-primary',
                      header.column.getIsResizing() && 'after:bg-primary after:w-0.5',
                    )}
                  />
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(onRowClick && 'cursor-pointer', getRowClassName?.(row.original))}
              onClick={onRowClick && ((e: MouseEvent) => {
                if ((e.target as HTMLElement).closest('button, a')) return
                onRowClick(row.original)
              })}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className={cn(anySized && 'overflow-hidden', cell.column.columnDef.meta?.className)}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

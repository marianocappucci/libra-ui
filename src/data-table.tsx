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
//
// v0.8.0 (2026-07-31): busqueda opcional (prop `search`). Tambien con
// gating -- sin la prop el componente devuelve exactamente el mismo
// <Table> de antes, sin envoltorio ni row model de filtrado, asi que los
// consumidores que no la usan renderizan igual que en v0.7.0.
import {
  type ColumnDef,
  type ColumnSizingState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type MouseEvent, type ReactNode,
} from 'react'
import { ArrowUpDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { coincideBusqueda } from './utils'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
    // Marca la columna de acciones cuando su `id` no es 'actions'. El
    // componente la mide y le da exactamente el ancho que ocupan sus
    // botones, sin que la pagina tenga que calcularlo (ver medirAcciones).
    acciones?: boolean
  }
}

// `p-2` de TableCell/TableHead de shadcn: 8px por lado. Es lo unico que la
// medicion no puede leer del contenido, porque mide el hijo de la celda.
const PADDING_CELDA = 16

// Una columna es "de acciones" por convencion de id (todas las tablas de la
// familia la declaran como `id: 'actions'`) o marcandola explicitamente con
// `meta.acciones`.
function esColumnaDeAcciones(id: string, meta?: { acciones?: boolean }): boolean {
  return id === 'actions' || meta?.acciones === true
}

/**
 * Ancho estimado de una columna de acciones con `n` botones de icono.
 *
 * **No hace falta usarlo**: desde v0.4.0 `DataTable` mide la columna de
 * acciones y le da el ancho exacto que ocupan sus botones, sin que la pagina
 * declare nada. Se mantiene como `size` inicial opcional para que el primer
 * frame (antes de que corra la medicion) ya salga con un ancho sensato en vez
 * del default de 150px de TanStack.
 *
 * Los valores son los de las clases reales: `size-9` (36px) por boton,
 * `gap-1` (4px) entre botones y el `p-2` (16px) de la celda.
 */
export function anchoColumnaAcciones(cantidadBotones: number): number {
  if (cantidadBotones <= 0) return PADDING_CELDA
  return cantidadBotones * 36 + (cantidadBotones - 1) * 4 + PADDING_CELDA
}


export type DataTableSearch<TData> = {
  /**
   * Valores sobre los que busca cada fila.
   *
   * Lo declara la pagina y no el componente porque **el dato crudo no es lo
   * que se ve**: la columna Cliente de una tabla de equipos guarda
   * `cliente_id: 3` y renderiza "Compulibra", y quien busca escribe lo
   * segundo. Un filtro generico sobre los valores de las celdas encontraria
   * el 3.
   *
   * Los `null`/`undefined`/vacios se descartan solos.
   */
  campos: (row: TData) => (string | number | null | undefined)[]
  placeholder?: string
  /** Etiqueta accesible del input. Default: el placeholder. */
  ariaLabel?: string
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
  // Buscador sobre la tabla. Sin esta prop no se renderiza input alguno y el
  // row model de filtrado ni se arma (ver DataTableSearch).
  search?: DataTableSearch<TData>
}

export function DataTable<TData, TValue>({
  columns, data, emptyMessage = 'Sin resultados.', getRowClassName, onRowClick,
  search,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const [consulta, setConsulta] = useState('')

  // Si ninguna columna declara `size`, se desactiva el resize por completo y
  // se preserva el layout automatico de siempre (ver comentario de arriba).
  const anySized = columns.some((c) => c.size !== undefined)

  // Todos los terminos tienen que aparecer, en cualquier orden y en cualquier
  // campo: "hp admision" encuentra la impresora HP de Admision aunque marca y
  // sector sean columnas distintas. Con un solo `includes` de la frase
  // entera esa busqueda -- la natural -- no daria nada.
  const filtrarFila: FilterFn<TData> = useCallback((row, _columnId, valor: string) => {
    //  vive en utils y lo comparte con SelectBuscable: los
    // dos buscadores del paquete filtran con el mismo criterio, asi que quien
    // aprende a buscar en una tabla busca igual en un select.
    const texto = (search?.campos(row.original) ?? [])
      .filter((v) => v !== null && v !== undefined && v !== '')
      .join(' ')
    return coincideBusqueda(texto, valor)
  }, [search])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Se filtra por fila y no por celda, asi que da igual que columna evalua
    // TanStack: `getColumnCanGlobalFilter` en true evita que el default
    // (mirar el tipo del valor de la celda) deje afuera una tabla entera
    // cuando ninguna columna expone un accessor de texto.
    ...(search ? { getFilteredRowModel: getFilteredRowModel() } : {}),
    globalFilterFn: filtrarFila,
    getColumnCanGlobalFilter: () => true,
    onGlobalFilterChange: setConsulta,
    onSortingChange: setSorting,
    enableColumnResizing: anySized,
    columnResizeMode: 'onChange',
    onColumnSizingChange: setColumnSizing,
    state: { sorting, columnSizing, globalFilter: search ? consulta : '' },
  })

  const headers = table.getFlatHeaders()

  // --- ancho automatico de la columna de acciones ---------------------
  //
  // La columna de acciones no declara un ancho util: depende de cuantos
  // botones renderice cada fila, y eso cambia por producto, por permisos y
  // por estado de la fila. Calcularlo a mano en cada pagina salia mal (en
  // Contalibra la columna de comprobantes quedaba en 116px cuando tres
  // botones necesitan 132, y como van alineados a la derecha con overflow
  // hidden el recorte se comia el PRIMER boton). Asi que se mide: se toma
  // el contenido real de la celda mas ancha y se le suma el padding.
  //
  // Si el usuario redimensiona la columna a mano, manda su eleccion.
  const cuerpoRef = useRef<HTMLTableSectionElement>(null)
  const cabeceraRef = useRef<HTMLTableSectionElement>(null)
  const [anchoAcciones, setAnchoAcciones] = useState<number | null>(null)

  const indiceAcciones = headers.findIndex((h) =>
    esColumnaDeAcciones(h.column.id, h.column.columnDef.meta),
  )
  const accionesRedimensionada =
    indiceAcciones >= 0 && columnSizing[headers[indiceAcciones].column.id] !== undefined

  const medirAcciones = useCallback(() => {
    if (indiceAcciones < 0 || accionesRedimensionada) return
    let maximo = 0

    const filas = cuerpoRef.current?.rows
    for (let i = 0; filas && i < filas.length; i++) {
      const contenido = filas[i].cells[indiceAcciones]?.firstElementChild
      if (!contenido) continue
      // OJO: no sirve el scrollWidth del contenedor. Los botones van con
      // `justify-end`, asi que cuando no entran desbordan hacia la IZQUIERDA
      // y scrollWidth no mide ese lado -- reporta el ancho recortado y la
      // medicion se quedaria clavada en el ancho que ya tiene. Hay que sumar
      // los hijos, que no se encogen (size-9 fija su ancho).
      const hijos = Array.from(contenido.children)
      if (!hijos.length) continue
      const gap = parseFloat(getComputedStyle(contenido).columnGap) || 0
      const ancho =
        hijos.reduce((total, hijo) => total + hijo.getBoundingClientRect().width, 0) +
        gap * (hijos.length - 1)
      maximo = Math.max(maximo, ancho)
    }

    // La cabecera ("Acciones") tambien tiene que entrar: con una sola accion
    // el titulo es mas ancho que el boton. Se mide con un Range porque el
    // texto va alineado a la derecha y sufre el mismo problema de arriba.
    const th = cabeceraRef.current?.rows[0]?.cells[indiceAcciones]?.firstElementChild
    if (th && typeof document.createRange === 'function') {
      const rango = document.createRange()
      rango.selectNodeContents(th)
      maximo = Math.max(maximo, rango.getBoundingClientRect().width)
    }

    if (maximo > 0) {
      const nuevo = Math.ceil(maximo) + PADDING_CELDA
      setAnchoAcciones((previo) => (previo === nuevo ? previo : nuevo))
    }
  }, [indiceAcciones, accionesRedimensionada])

  useLayoutEffect(() => { medirAcciones() })

  // Los iconos llegan con las fuentes/SVG ya resueltos casi siempre, pero un
  // re-layout posterior (fuente que carga tarde, zoom del navegador) puede
  // cambiar el ancho: se remide sin re-renderizar de mas.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !cuerpoRef.current) return
    const obs = new ResizeObserver(() => medirAcciones())
    obs.observe(cuerpoRef.current)
    return () => obs.disconnect()
  }, [medirAcciones])

  // Ancho efectivo: el medido para la columna de acciones, el declarado para
  // el resto.
  const anchoDeColumna = (header: (typeof headers)[number]): number => {
    if (
      esColumnaDeAcciones(header.column.id, header.column.columnDef.meta) &&
      anchoAcciones !== null &&
      !accionesRedimensionada
    ) {
      return anchoAcciones
    }
    return header.getSize()
  }

  // Una columna elastica (meta.stretch) se emite sin ancho en el <colgroup>:
  // con table-layout:fixed el navegador le da todo el sobrante, asi la tabla
  // llena el ancho disponible. Si el usuario la redimensiona a mano deja de
  // ser elastica y pasa a respetar el ancho elegido.
  const esElastica = (header: (typeof headers)[number]) =>
    Boolean(header.column.columnDef.meta?.stretch) && columnSizing[header.column.id] === undefined

  // Las columnas `opcional` (ocultas por CSS en pantallas angostas) no cuentan
  // para el ancho minimo: si contaran, la tabla pediria scroll por una columna
  // que no se esta viendo.
  const anchoMinimo = headers.reduce(
    (total, header) => (header.column.columnDef.meta?.opcional ? total : total + anchoDeColumna(header)),
    0,
  )

  // Buscar y no encontrar nada no es lo mismo que no tener datos: sin esto
  // una tabla con 53 equipos y un filtro sin resultados dice "Sin equipos
  // todavia", que hace pensar que se perdieron.
  const buscando = Boolean(search) && consulta.trim() !== ''
  const mensajeVacio = buscando
    ? <>Sin resultados para «{consulta.trim()}».</>
    : emptyMessage

  const tabla = (
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
              style={esElastica(header) ? undefined : { width: anchoDeColumna(header) }}
            />
          ))}
        </colgroup>
      )}
      <TableHeader ref={cabeceraRef}>
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
      <TableBody ref={cuerpoRef}>
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
              {mensajeVacio}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )

  // Sin buscador se devuelve la tabla pelada, sin ningun elemento nuevo
  // alrededor: los consumidores que no pasan `search` renderizan igual que
  // antes de esta version.
  if (!search) return tabla

  return (
    <div className="grid gap-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder={search.placeholder ?? 'Buscar…'}
          aria-label={search.ariaLabel ?? search.placeholder ?? 'Buscar'}
          className="pl-8"
        />
        {consulta !== '' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
            title="Limpiar búsqueda"
            aria-label="Limpiar búsqueda"
            onClick={() => setConsulta('')}
          >
            <X />
          </Button>
        )}
      </div>
      {tabla}
    </div>
  )
}

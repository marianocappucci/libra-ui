/** Una lista que es **tabla cuando entra y tarjetas cuando no** (ADR-057): nunca scrollea de costado.
 *
 *  Es el mecanismo que Stock (ADR-016) y Ventas (ADR-020) escribieron a mano, sacado a un lugar para las pantallas de uso diario que lo suman
 *  (Clientes, Productos, Turnos, Compras, Proveedores):
 *
 *      <TablaOTarjetas
 *        columns={columns} data={clientes} clave={(c) => c.id} etiqueta="Clientes"
 *        tarjeta={(c) => <TarjetaDeFila titulo={…} datos={[…]} acciones={acciones(c)} />}
 *      />
 *
 *  - Un `ResizeObserver` mide el contenedor (`useAncho`). Si es **más angosto que lo que la tabla necesita** —la suma de los `size` de sus
 *    columnas, la misma cuenta del `DataTable`: sin `size` vale 150, no cuentan las `meta.opcional`— la lista pasa a tarjetas. El umbral no es un
 *    número fijo: sigue valiendo con cualquier cantidad de columnas.
 *  - **Sin medida (0: sin `ResizeObserver`, como en jsdom) se queda la tabla.** Una tabla sin ningún `size` tampoco pasa a tarjetas (no hay con qué
 *    medirla: es la tabla de layout automático de siempre).
 *  - Cada tarjeta lleva lo mismo que la fila: el dato principal arriba, unos pocos secundarios, y las **mismas acciones** a 44 px. Si la tabla tiene
 *    buscador (`search`), las tarjetas también (`BuscadorDeTabla`, el mismo cuadro y el mismo criterio).
 *  - **Lo que las tarjetas no tienen:** el orden por columna (la lista se ve en el orden en que llega; Stock sí ofrece un «Ordenar por» propio) y el
 *    click en toda la fila (el título de la tarjeta es el link).
 *
 *  La columna de acciones tiene que declarar su `size` con `anchoColumnaAcciones(n, useBajoLg())`: bajo `lg` los botones de la tabla miden 44 px
 *  (`TACTIL_BAJO_LG`) y la columna, 8 px más por botón; con los 36 de escritorio el umbral quedaba chico y la tabla scrolleaba justo en la franja
 *  entre los dos anchos.
 */
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { BuscadorDeTabla, DataTable, type DataTableSearch } from './data-table'
import { anchoMinimoDeColumnas, type ColumnDef, type RowData } from './tabla'
import { TACTIL, useAncho } from './use-ancho'
import { cn, coincideBusqueda } from './utils'

/** Una fila como tarjeta: el dato principal arriba (con su estado a la derecha), unos pocos datos secundarios rotulados y las acciones a 44 px. Pensada para ser lo que devuelve `tarjeta` de `TablaOTarjetas`. */
export function TarjetaDeFila({
  titulo, subtitulo, estado, datos, acciones, className,
}: {
  /** El dato principal: el nombre, el número. Un link al detalle si la tabla lo tiene. Parte la línea si es largo. */
  titulo: ReactNode
  /** Una línea chica debajo del título. */
  subtitulo?: ReactNode
  /** Una pastilla de estado a la derecha del título. */
  estado?: ReactNode
  /** Los datos secundarios (2 a 4): `dt`/`dd` en una grilla. Un dato vacío se escribe «—», como en la tabla. */
  datos?: { etiqueta: string; valor: ReactNode }[]
  /** Los mismos botones de la columna de acciones de la tabla. */
  acciones?: ReactNode
  className?: string
}) {
  return (
    <li className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-md border p-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium [overflow-wrap:anywhere]">{titulo}</div>
          {subtitulo != null && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{subtitulo}</p>}
        </div>
        {estado != null && <div className="min-w-0 shrink-0">{estado}</div>}
      </div>
      {datos && datos.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
          {datos.map((d) => (
            <Fragment key={d.etiqueta}>
              <dt className="text-muted-foreground">{d.etiqueta}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">{d.valor}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {acciones != null && <div className={TACTIL}>{acciones}</div>}
    </li>
  )
}

export function TablaOTarjetas<TData extends RowData>({
  columns, data, tarjeta, clave, etiqueta, cargando = false, emptyMessage = 'Sin resultados.', getRowClassName, onRowClick, search,
}: {
  columns: ColumnDef<TData>[]
  data: TData[]
  /** La tarjeta de una fila (`TarjetaDeFila`). */
  tarjeta: (fila: TData) => ReactNode
  /** La clave estable de una fila (el `id`). */
  clave: (fila: TData) => string | number
  /** El nombre accesible de la lista de tarjetas. */
  etiqueta: string
  /** Mientras carga se ve «Cargando…» en lugar de la lista; el contenedor medido sigue montado. */
  cargando?: boolean
  emptyMessage?: ReactNode
  /** Sólo para la tabla (el atenuado de una fila inactiva): en la tarjeta va como `className` de `TarjetaDeFila`. */
  getRowClassName?: (fila: TData) => string | undefined
  /** Sólo para la tabla: en la tarjeta, el título es el link. */
  onRowClick?: (fila: TData) => void
  search?: DataTableSearch<TData>
}) {
  const [medida, ancho] = useAncho()
  const [consulta, setConsulta] = useState('')
  const anchoMinimo = useMemo(() => anchoMinimoDeColumnas(columns), [columns])
  const enTarjetas = ancho > 0 && ancho < anchoMinimo

  const visibles = useMemo(() => {
    if (!search || consulta.trim() === '') return data
    return data.filter((fila) => {
      const texto = search.campos(fila).filter((v) => v !== null && v !== undefined && v !== '').join(' ')
      return coincideBusqueda(texto, consulta)
    })
  }, [data, search, consulta])

  const buscando = Boolean(search) && consulta.trim() !== ''
  const sinFilas = buscando ? <>Sin resultados para «{consulta.trim()}».</> : emptyMessage

  return (
    <div ref={medida} className="min-w-0">
      {cargando ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : enTarjetas ? (
        <div className="grid gap-3">
          {search && <BuscadorDeTabla valor={consulta} onChange={setConsulta} search={search} />}
          {visibles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{sinFilas}</p>
          ) : (
            <ul className="grid gap-3" aria-label={etiqueta}>
              {visibles.map((fila) => <Fragment key={clave(fila)}>{tarjeta(fila)}</Fragment>)}
            </ul>
          )}
        </div>
      ) : (
        <DataTable columns={columns} data={data} emptyMessage={emptyMessage} getRowClassName={getRowClassName} onRowClick={onRowClick} search={search} />
      )}
    </div>
  )
}

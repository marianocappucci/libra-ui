// El stock: listado con alertas de mínimo, ajuste de stock en un Dialog y el
// historial de movimientos (P9-M1, 2026-09-06).
//
// Estaba escrito dos veces —Contalibra y Restolibra— y las copias diferían en
// **498 líneas**, casi todas de forma y no de dominio. Lo de dominio eran tres
// cosas, y las tres son props o datos del backend:
//
// - Los **modos de ajuste**: Contalibra tiene fijar/entrada/salida; Restolibra
//   además «merma», con un motivo de una lista cerrada. La merma aparece si el
//   backend devuelve motivos (`GET /api/stock/motivos-merma`): es dato, no prop.
// - La **conversión de unidad de compra** en el modo entrada («2 bolsas × 500
//   g»), que sólo Restolibra tiene: `conConversionDeUnidad`.
// - Dónde vive el **historial**: Contalibra lo despliega en la misma pantalla;
//   Restolibra tiene una página propia. Con `rutaDeMovimientos` el botón
//   navega; sin ella, el historial se abre acá abajo.
// - Los **depósitos** (VentaLibra, con varias sucursales): si el backend devuelve `depositos` (y `por_deposito` en
//   cada producto) el detalle de cada producto dice cuánto hay en cada uno, el ajuste elige en qué depósito va y el
//   historial dice cuál. Es dato, no prop: sin `depositos` la pantalla es la de siempre.
//
// La tabla lleva sólo lo que se mira de un vistazo —producto, stock, estado y acciones, más la categoría en
// pantallas anchas— y el resto (código, unidad, mínimo y el stock de cada depósito) se despliega al hacer click en
// la fila (ADR-093). Antes había una columna por depósito: con varias sucursales la tabla no entraba y la pantalla
// pasaba a tarjetas, poco prácticas con muchos productos. Las tarjetas quedan para cuando ni la tabla compacta entra
// (el celular, ADR-016).
//
// El formulario de ajuste toma la forma de Contalibra (estado simple, sin
// react-hook-form) con las validaciones que Restolibra tenía en su schema:
// cantidad mayor a cero en los modos relativos, factor mayor a cero.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '../data-table'
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Filter, History, Pencil, RefreshCw, RotateCcw, ShoppingCart, TriangleAlert, X,
} from 'lucide-react'

import { api, ApiError } from '../api-client'
import { anchoColumnaAcciones, DataTable, sortableHeader } from '../data-table'
import { BadgeEstado, type TonoEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'
import { SelectBuscable } from '../SelectBuscable'
import { ANCHO_COLUMNA_DETALLE, anchoMinimoDeColumnas } from '../tabla'
import { TACTIL, TACTIL_BAJO_LG, useAncho, useBajoLg } from '../use-ancho'
// Alias: `fecha` ya es el estado del campo de fecha del ajuste de stock.
import { hoyISO, fecha as formatearFecha } from '../fechas'
import {
  opcionesProducto, TIPO_MOVIMIENTO_LABELS, type DepositoColumna, type MovimientoStock, type StockItem,
  type StockListado,
} from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog'
import { formatoCantidad } from '../formatos'
import { ImporteDeMerma } from './importe-de-merma'
import { importeDeMovimiento, traeImportes } from './importes-de-merma'

export const TIPO_BADGE: Record<string, { tono: TonoEstado; icon: typeof ArrowDownToLine }> = {
  entrada: { tono: 'ok', icon: ArrowDownToLine },
  salida: { tono: 'negativo', icon: ArrowUpFromLine },
  venta: { tono: 'curso', icon: ShoppingCart },
  ajuste: { tono: 'neutro', icon: RotateCcw },
  merma: { tono: 'atencion', icon: TriangleAlert },
  produccion: { tono: 'neutro', icon: RefreshCw },
}

export function TipoBadge({ tipo }: { tipo: string }) {
  const info = TIPO_BADGE[tipo]
  if (!info) return <BadgeEstado tono="neutro">{TIPO_MOVIMIENTO_LABELS[tipo] ?? tipo}</BadgeEstado>
  const Icon = info.icon
  return <BadgeEstado tono={info.tono}><Icon />{TIPO_MOVIMIENTO_LABELS[tipo] ?? tipo}</BadgeEstado>
}

export function estadoStock(p: StockItem): { label: string; tono: TonoEstado } {
  if (p.stock_actual <= 0) return { label: 'Sin stock', tono: 'negativo' }
  if (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo) return { label: 'Bajo mínimo', tono: 'atencion' }
  return { label: 'OK', tono: 'ok' }
}

type Modo = 'absoluto' | 'entrada' | 'salida' | 'merma'

const MODOS: { value: Modo; label: string; icon: typeof RefreshCw }[] = [
  { value: 'absoluto', label: 'Fijar en…', icon: RefreshCw },
  { value: 'entrada', label: 'Entrada', icon: ArrowDownToLine },
  { value: 'salida', label: 'Salida', icon: ArrowUpFromLine },
  { value: 'merma', label: 'Merma', icon: TriangleAlert },
]

export type StockProps = {
  /** Si se pasa, «Ver movimientos» navega a esa ruta (página propia). Sin
   *  esto el historial se despliega en la misma pantalla, con sus filtros. */
  rutaDeMovimientos?: (productoId: number) => string
  /** Conversión de unidad de compra en el modo entrada: cantidad × factor,
   *  con el detalle guardado en la referencia. Restolibra. */
  conConversionDeUnidad?: boolean
  /** A dónde lleva el link «Crear un producto» de la lista vacía. */
  rutaDeProductos?: string
  /** Un buscador por nombre y un «sólo los que tienen stock» sobre la lista: con muchos productos y varios
   *  depósitos la pregunta es «¿de dónde saco esto?». Sin esto, la lista es la de siempre. */
  conFiltros?: boolean
  /** Si la persona puede ajustar el stock (`stock.ajustar` en VentaLibra). Con `false` no se ofrece «Ajustar stock», ni en la tabla ni en las
   *  tarjetas, y queda «Ver movimientos». El vendedor ve el stock pero el motor le contesta 403 al ajuste. Sin la prop (`true`), la pantalla es la de siempre. */
  puedeAjustar?: boolean
}

/** Bajo este ancho el historial de movimientos pasa de tabla a lista (con las columnas que hacen wrap la tabla entra desde ahí). */
const ANCHO_MINIMO_HISTORIAL = 720
/** Lo que suma la columna «Importe» (ADR-063) cuando el backend manda los importes de las mermas: la tabla del historial necesita ese ancho más. */
const ANCHO_DE_LA_COLUMNA_IMPORTE = 110

type OrdenTarjetas = 'producto' | 'total-asc' | 'total-desc'

const claseDeCantidad = (n: number) => (n < 0 ? 'font-medium text-destructive' : n === 0 ? 'text-muted-foreground' : '')

/** Un producto como tarjeta: lo que la tabla reparte en columnas, apilado, para cuando la tabla no entra en el ancho que hay (nunca se scrollea de costado). */
function TarjetaDeStock({ p, depositos, acciones }: { p: StockItem; depositos: DepositoColumna[]; acciones: ReactNode }) {
  const e = estadoStock(p)
  const clase = p.stock_actual <= 0 ? 'text-destructive' : (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo) ? 'text-amber-800 dark:text-amber-400' : 'text-exito'
  const aparte = [p.codigo, p.categoria].filter(Boolean).join(' · ')
  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium [overflow-wrap:anywhere]">{p.nombre}</p>
          {aparte && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{aparte}</p>}
        </div>
        <BadgeEstado tono={e.tono}>{e.label}</BadgeEstado>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span>{depositos.length > 0 ? 'Total' : 'Stock'}: <strong className={`text-base tabular-nums ${clase}`}>{formatoCantidad(p.stock_actual)}</strong> <span className="text-muted-foreground">{p.unidad}</span></span>
        {p.stock_minimo > 0 && <span className="text-muted-foreground">Mínimo: {formatoCantidad(p.stock_minimo)}</span>}
      </div>
      {depositos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Stock por depósito">
          {depositos.map((d) => {
            const n = p.por_deposito?.[String(d.id)] ?? 0
            return (
              <li key={d.id} className="flex min-w-0 max-w-full items-baseline gap-1 rounded-md border px-2 py-0.5 text-xs" title={`${d.nombre}: ${formatoCantidad(n)}`}>
                <span className="truncate">{d.nombre}:</span>
                <span className={`shrink-0 tabular-nums ${claseDeCantidad(n)}`}>{formatoCantidad(n)}</span>
              </li>
            )
          })}
        </ul>
      )}
      <div className={TACTIL}>{acciones}</div>
    </li>
  )
}

/** Lo que la tabla no muestra de un producto, en la fila desplegada (ADR-093): código, categoría, unidad, mínimo y, con depósitos, cuánto hay en cada uno. */
function DetalleDeStock({ p, depositos }: { p: StockItem; depositos: DepositoColumna[] }) {
  const datos: [string, string][] = [
    ['Código', p.codigo || '—'],
    ['Categoría', p.categoria || '—'],
    ['Unidad', p.unidad || '—'],
    ['Stock mínimo', p.stock_minimo > 0 ? `${formatoCantidad(p.stock_minimo)} ${p.unidad}` : '—'],
  ]
  return (
    <div className="grid min-w-0 gap-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {datos.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
            <dd className="[overflow-wrap:anywhere]">{valor}</dd>
          </div>
        ))}
      </dl>
      {depositos.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">Stock por depósito</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Stock por depósito">
            {depositos.map((d) => {
              const n = p.por_deposito?.[String(d.id)] ?? 0
              return (
                <li key={d.id} className="flex min-w-0 max-w-full items-baseline gap-1.5 rounded-md border bg-background px-2 py-1 text-sm" title={`${d.nombre}: ${formatoCantidad(n)}`}>
                  <span className="truncate">{d.nombre}:</span>
                  <span className={`shrink-0 font-medium tabular-nums ${claseDeCantidad(n)}`}>{formatoCantidad(n)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export function Stock({
  rutaDeMovimientos, conConversionDeUnidad = false, rutaDeProductos = '/productos', conFiltros = false, puedeAjustar = true,
}: StockProps) {
  const [productos, setProductos] = useState<StockItem[]>([])
  const [alertas, setAlertas] = useState<StockItem[]>([])
  const [motivosMerma, setMotivosMerma] = useState<string[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [soloConStock, setSoloConStock] = useState(false)
  const [depositos, setDepositos] = useState<DepositoColumna[]>([])
  const [depositoAjuste, setDepositoAjuste] = useState('')
  const [orden, setOrden] = useState<OrdenTarjetas>('producto')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [movLoading, setMovLoading] = useState(false)
  const [medidaTabla, anchoTabla] = useAncho()
  const [medidaHistorial, anchoHistorial] = useAncho()
  const [movimientosVisible, setMovimientosVisible] = useState(false)
  const [movFiltroProducto, setMovFiltroProducto] = useState('')
  const [movDesde, setMovDesde] = useState('')
  const [movHasta, setMovHasta] = useState('')

  const [editing, setEditing] = useState<StockItem | null>(null)
  const [modo, setModo] = useState<Modo>('absoluto')
  const [cantidad, setCantidad] = useState('')
  const [unidadCompra, setUnidadCompra] = useState('')
  const [factor, setFactor] = useState('1')
  const [motivo, setMotivo] = useState('Otro')
  const [fecha, setFecha] = useState(hoyISO())
  const [referencia, setReferencia] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const conDepositos = depositos.length > 0
  const visibles = useMemo(() => {
    if (!conFiltros) return productos
    const q = busqueda.trim().toLowerCase()
    return productos.filter((p) => (!soloConStock || p.stock_actual !== 0) && (!q || p.nombre.toLowerCase().includes(q) || (p.codigo ?? '').toLowerCase().includes(q)))
  }, [productos, conFiltros, busqueda, soloConStock])
  const conMerma = motivosMerma.length > 0
  const modos = MODOS.filter((m) => m.value !== 'merma' || conMerma)

  useEffect(() => {
    load()
    api.get<string[]>('/api/stock/motivos-merma').then((m) => setMotivosMerma(m ?? [])).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<StockListado>('/api/stock')
      setProductos(data.productos)
      setAlertas(data.alertas)
      setDepositos(data.depositos ?? [])
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function cargarMovimientos(filtroProducto = movFiltroProducto) {
    setMovLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtroProducto) params.set('producto_id', filtroProducto)
      if (movDesde) params.set('desde', movDesde)
      if (movHasta) params.set('hasta', movHasta)
      const qs = params.toString()
      setMovimientos(await api.get<MovimientoStock[]>(`/api/stock/movimientos${qs ? `?${qs}` : ''}`))
    } catch {
      // el historial no es crítico para la pantalla principal
    } finally {
      setMovLoading(false)
    }
  }

  function toggleMovimientos() {
    setMovimientosVisible((v) => {
      const next = !v
      if (next) cargarMovimientos()
      return next
    })
  }

  function verMovimientos(productoId: number) {
    setMovFiltroProducto(String(productoId))
    setMovimientosVisible(true)
    cargarMovimientos(String(productoId))
  }

  function limpiarFiltroMovimientos() {
    setMovFiltroProducto('')
    setMovDesde('')
    setMovHasta('')
    setTimeout(() => cargarMovimientos(''), 0)
  }

  function abrirAjuste(p: StockItem) {
    const dep = String((depositos.find((d) => d.es_default) ?? depositos[0])?.id ?? '')
    setDepositoAjuste(dep)
    setEditing(p)
    setModo('absoluto')
    setCantidad(String(dep ? (p.por_deposito?.[dep] ?? 0) : p.stock_actual))
    setUnidadCompra('')
    setFactor('1')
    setMotivo('Otro')
    setFecha(hoyISO())
    setReferencia('')
    setFormError(null)
  }

  // El stock sobre el que se ajusta: el del depósito elegido, o el total si el producto no tiene depósitos.
  const stockBase = !editing ? 0 : conDepositos ? (editing.por_deposito?.[depositoAjuste] ?? 0) : editing.stock_actual

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo)
    setCantidad(nuevo === 'absoluto' ? String(stockBase) : '')
  }

  function cambiarDeposito(id: string) {
    setDepositoAjuste(id)
    if (modo === 'absoluto' && editing) setCantidad(String(editing.por_deposito?.[id] ?? 0))
  }

  function validar(): string | null {
    const val = Number(cantidad)
    if (Number.isNaN(val)) return 'La cantidad no es un número.'
    if (modo === 'absoluto' && val < 0) return 'La cantidad no puede ser negativa.'
    if (modo !== 'absoluto' && val <= 0) return 'La cantidad debe ser mayor a 0.'
    if (modo === 'entrada' && conConversionDeUnidad && Number(factor) <= 0) return 'El factor debe ser mayor a 0.'
    return null
  }

  async function guardarAjuste() {
    if (!editing) return
    const invalido = validar()
    if (invalido) { setFormError(invalido); return }
    setSaving(true)
    setFormError(null)
    try {
      await api.post(`/api/stock/${editing.id}/ajuste`, {
        modo,
        cantidad: Number(cantidad),
        referencia,
        fecha,
        unidad_compra: modo === 'entrada' && conConversionDeUnidad ? unidadCompra : '',
        factor: modo === 'entrada' && conConversionDeUnidad ? (Number(factor) || 1) : 1,
        motivo: modo === 'merma' ? (motivo || 'Otro') : 'Otro',
        ...(conDepositos ? { deposito_id: Number(depositoAjuste) } : {}),
      })
      setEditing(null)
      await load()
      if (movimientosVisible) await cargarMovimientos()
    } catch (err) {
      setFormError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  const resultado = useMemo(() => {
    if (!editing) return null
    const val = Number(cantidad) || 0
    const f = modo === 'entrada' && conConversionDeUnidad ? (Number(factor) || 1) : 1
    if (modo === 'absoluto') return val
    if (modo === 'entrada') return stockBase + val * f
    return stockBase - val
  }, [editing, modo, cantidad, factor, conConversionDeUnidad, stockBase])

  /** Los botones de cada producto, en la tabla y en la tarjeta: los dos, o sólo «Ver movimientos» si no puede ajustar. */
  const acciones = (p: StockItem) => (
    <div className={`flex justify-end gap-1 ${TACTIL_BAJO_LG}`}>
      {rutaDeMovimientos ? (
        <Button asChild size="icon" variant="outline" title="Ver movimientos" aria-label="Ver movimientos">
          <Link to={rutaDeMovimientos(p.id)}><History /></Link>
        </Button>
      ) : (
        <Button size="icon" variant="outline" title="Ver movimientos" aria-label="Ver movimientos" onClick={() => verMovimientos(p.id)}><History /></Button>
      )}
      {puedeAjustar && (
        <Button size="icon" variant="outline" title="Ajustar stock" aria-label="Ajustar stock" onClick={() => abrirAjuste(p)}><Pencil /></Button>
      )}
    </div>
  )

  const bajoLg = useBajoLg()
  const columns = useMemo<ColumnDef<StockItem>[]>(() => [
    {
      accessorKey: 'nombre',
      header: sortableHeader('Producto'),
      size: 200,
      minSize: 110,
      meta: { stretch: true },
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.nombre}>
          <span className="font-medium">{row.original.nombre}</span>
          {row.original.codigo && <span className="ml-1.5 text-xs text-muted-foreground">· {row.original.codigo}</span>}
        </span>
      ),
    },
    // Opcional: se ve desde 1280 px y no cuenta para el umbral de las tarjetas; en el detalle está siempre.
    {
      accessorKey: 'categoria',
      header: 'Categoría',
      size: 140,
      minSize: 90,
      meta: { opcional: true, className: 'hidden xl:table-cell', colClassName: 'hidden xl:table-column' },
      cell: ({ row }) => <span className="block truncate text-muted-foreground" title={row.original.categoria ?? undefined}>{row.original.categoria || '—'}</span>,
    },
    {
      accessorKey: 'stock_actual',
      header: sortableHeader('Stock'),
      size: 130,
      minSize: 95,
      cell: ({ row }) => {
        const p = row.original
        const cls = p.stock_actual <= 0 ? 'text-destructive' : (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo) ? 'text-amber-800 dark:text-amber-400' : 'text-exito'
        return (
          <div className="truncate" title={`${formatoCantidad(p.stock_actual)} ${p.unidad}`}>
            <span className={`text-base font-bold tabular-nums ${cls}`}>{formatoCantidad(p.stock_actual)}</span>
            <span className="ml-1 text-xs text-muted-foreground">{p.unidad}</span>
          </div>
        )
      },
    },
    {
      id: 'estado',
      header: () => <div className="text-center">Estado</div>,
      size: 125,
      minSize: 95,
      cell: ({ row }) => {
        const e = estadoStock(row.original)
        return <div className="flex justify-center"><BadgeEstado tono={e.tono}>{e.label}</BadgeEstado></div>
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      size: anchoColumnaAcciones(puedeAjustar ? 2 : 1, bajoLg),
      minSize: anchoColumnaAcciones(puedeAjustar ? 2 : 1, bajoLg),
      cell: ({ row }) => acciones(row.original),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [rutaDeMovimientos, depositos, bajoLg, puedeAjustar])

  // La tabla necesita la suma de los `size` de sus columnas más la del chevron (`DataTable` la fija como `min-width`): si el contenedor es más angosto, en vez de
  // scrollear de costado la pantalla pasa a tarjetas. Sin medida (0) se queda la tabla.
  const anchoMinimoTabla = useMemo(() => anchoMinimoDeColumnas(columns) + ANCHO_COLUMNA_DETALLE, [columns])
  const enTarjetas = anchoTabla > 0 && anchoTabla < anchoMinimoTabla
  const tarjetas = useMemo(() => {
    const orden_ = [...visibles]
    if (orden === 'producto') return orden_.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    return orden_.sort((a, b) => (orden === 'total-asc' ? a.stock_actual - b.stock_actual : b.stock_actual - a.stock_actual))
  }, [visibles, orden])
  // El importe de las mermas se muestra sólo si el backend lo manda (ADR-063): sin las claves, el historial es el de siempre.
  const conImporte = useMemo(() => traeImportes(movimientos), [movimientos])
  const historialEnLista = anchoHistorial > 0 && anchoHistorial < ANCHO_MINIMO_HISTORIAL + (conImporte ? ANCHO_DE_LA_COLUMNA_IMPORTE : 0)

  const movColumns = useMemo<ColumnDef<MovimientoStock>[]>(() => [
    { accessorKey: 'fecha', header: 'Fecha', cell: ({ row }) => formatearFecha(row.original.fecha) },
    {
      accessorKey: 'producto_nombre',
      header: 'Producto',
      meta: { className: 'whitespace-normal [overflow-wrap:anywhere]' },
      cell: ({ row }) => (
        <button type="button" className="font-semibold hover:underline" onClick={() => verMovimientos(row.original.producto_id)}>
          {row.original.producto_nombre}
        </button>
      ),
    },
    { accessorKey: 'tipo', header: 'Tipo', cell: ({ row }) => <TipoBadge tipo={row.original.tipo} /> },
    {
      accessorKey: 'cantidad',
      header: 'Cantidad',
      cell: ({ row }) => (
        <span className={row.original.cantidad >= 0 ? 'font-semibold text-exito' : 'font-semibold text-destructive'}>
          {row.original.cantidad >= 0 ? '+' : ''}{formatoCantidad(row.original.cantidad)}
        </span>
      ),
    },
    ...(conDepositos ? [{
      id: 'deposito', header: 'Depósito', meta: { className: 'whitespace-normal [overflow-wrap:anywhere]' },
      cell: ({ row }: { row: { original: MovimientoStock } }) => (
        <span className="text-muted-foreground">{depositos.find((d) => d.id === row.original.deposito_id)?.nombre ?? '—'}</span>
      ),
    } as ColumnDef<MovimientoStock>] : []),
    ...(conImporte ? [{
      id: 'importe', header: () => <div className="text-right">Importe</div>,
      cell: ({ row }: { row: { original: MovimientoStock } }) => <div className="text-right"><ImporteDeMerma movimiento={row.original} /></div>,
    } as ColumnDef<MovimientoStock>] : []),
    { accessorKey: 'referencia', header: 'Referencia', meta: { className: 'whitespace-normal [overflow-wrap:anywhere]' }, cell: ({ row }) => <span className="text-muted-foreground">{row.original.referencia || '—'}</span> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [depositos, conImporte])

  const etiquetaCantidad = modo === 'absoluto'
    ? `Stock nuevo (${editing?.unidad ?? ''})`
    : modo === 'entrada' && conConversionDeUnidad
      ? 'Cantidad comprada'
      : modo === 'entrada'
        ? `Cantidad a ingresar (${editing?.unidad ?? ''})`
        : `Cantidad a retirar (${editing?.unidad ?? ''})`

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TituloPantalla icono={ICONOS.stock}>Stock</TituloPantalla>
        {!rutaDeMovimientos && (
          <Button variant="outline" onClick={toggleMovimientos}><History />Historial de movimientos</Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {alertas.length > 0 && (
        <div className="flex min-w-0 items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-amber-400" />
          {/* `min-w-0` en el aviso (es un ítem de la grilla de la pantalla: sin él su mínimo es el ancho de la pastilla más larga y arrastra a toda la página, medido a 390 y 768 px) y en el contenedor de las pastillas, que topan con `max-w-full` + `truncate`. */}
          <div className="min-w-0">
            <strong>{alertas.length} producto{alertas.length > 1 ? 's' : ''} con stock bajo mínimo:</strong>{' '}
            {alertas.map((a) => (
              <BadgeEstado key={a.id} tono="atencion" className="ml-1 max-w-full" title={`${a.nombre} (${formatoCantidad(a.stock_actual)} ${a.unidad})`}>
                <span className="truncate">{a.nombre} ({formatoCantidad(a.stock_actual)} {a.unidad})</span>
              </BadgeEstado>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="grid gap-4">
          {conFiltros && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="grid gap-2">
                <Label htmlFor="stock-buscar">Buscar producto</Label>
                <Input id="stock-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o código" className="w-64 max-w-full" />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} className="size-4" />
                Sólo los que tienen stock
              </label>
            </div>
          )}
          <div ref={medidaTabla} className="min-w-0">
            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : enTarjetas ? (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="stock-orden">Ordenar por</Label>
                  <Select value={orden} onValueChange={(v) => v && setOrden(v as OrdenTarjetas)}>
                    <SelectTrigger id="stock-orden" className="w-full min-w-0 sm:w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producto">Producto (A a Z)</SelectItem>
                      <SelectItem value="total-asc">Stock total (de menor a mayor)</SelectItem>
                      <SelectItem value="total-desc">Stock total (de mayor a menor)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {tarjetas.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No hay productos activos. <Link to={rutaDeProductos} className="text-primary hover:underline">Crear un producto</Link>.</p>
                ) : (
                  <ul className="grid gap-3">
                    {tarjetas.map((p) => <TarjetaDeStock key={p.id} p={p} depositos={depositos} acciones={acciones(p)} />)}
                  </ul>
                )}
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={visibles}
                detalle={{ render: (p) => <DetalleDeStock p={p} depositos={depositos} />, etiqueta: (p) => `Ver detalle de ${p.nombre}` }}
                emptyMessage={<>No hay productos activos. <Link to={rutaDeProductos} className="text-primary hover:underline">Crear un producto</Link>.</>}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="size-4" />Ajuste de stock — {editing?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="flex gap-4">
              <div className="text-center">
                <div className={`text-3xl font-bold ${stockBase <= 0 ? 'text-destructive' : (editing?.stock_minimo ?? 0) > 0 && stockBase <= (editing?.stock_minimo ?? 0) ? 'text-amber-800 dark:text-amber-400' : 'text-exito'}`}>
                  {formatoCantidad(stockBase)}
                </div>
                <div className="text-sm text-muted-foreground">Stock actual ({editing?.unidad})</div>
              </div>
              {(editing?.stock_minimo ?? 0) > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-muted-foreground">{formatoCantidad(editing?.stock_minimo ?? 0)}</div>
                  <div className="text-sm text-muted-foreground">Mínimo</div>
                </div>
              )}
            </div>

            {conDepositos && (
              <div className="grid gap-2">
                <Label htmlFor="ajuste-deposito">Depósito</Label>
                <SelectBuscable
                  id="ajuste-deposito"
                  value={depositoAjuste}
                  onChange={cambiarDeposito}
                  opciones={depositos.map((d) => ({ value: String(d.id), label: d.nombre }))}
                  limpiable={false}
                  className="w-64"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Tipo de ajuste</Label>
              <div className="flex flex-wrap gap-2">
                {modos.map((m) => (
                  <Button
                    key={m.value}
                    type="button"
                    size="sm"
                    variant={modo === m.value ? 'default' : 'outline'}
                    onClick={() => cambiarModo(m.value)}
                  >
                    <m.icon />{m.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label>{etiquetaCantidad}</Label>
                <Input type="number" step="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-40" aria-label={etiquetaCantidad} />
              </div>
              {modo === 'entrada' && conConversionDeUnidad && (
                <>
                  <div className="grid gap-2">
                    <Label>Unidad de compra</Label>
                    <Input value={unidadCompra} onChange={(e) => setUnidadCompra(e.target.value)} className="w-32" placeholder="bolsa, caja…" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Factor a {editing?.unidad ?? 'unidad'}</Label>
                    <Input type="number" step="any" value={factor} onChange={(e) => setFactor(e.target.value)} className="w-28" aria-label="Factor" />
                  </div>
                </>
              )}
              {modo === 'merma' && (
                <div className="grid gap-2">
                  <Label>Motivo</Label>
                  <SelectBuscable
                    value={motivo}
                    onChange={setMotivo}
                    opciones={motivosMerma.map((m) => ({ value: m, label: m }))}
                    ariaLabel="Motivo de la merma"
                    limpiable={false}
                    className="w-48"
                  />
                </div>
              )}
              <div className="grid gap-2"><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" /></div>
              <div className="grid gap-2"><Label>Referencia</Label><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} className="w-56" placeholder="Ej: Compra, conteo físico, rotura…" /></div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            {resultado !== null && (
              <p className={`text-sm ${resultado < 0 ? 'text-destructive' : 'text-exito'}`}>
                Stock resultante: {formatoCantidad(resultado)} {editing?.unidad}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button disabled={saving} onClick={guardarAjuste}>{saving ? 'Guardando…' : 'Guardar movimiento'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!rutaDeMovimientos && movimientosVisible && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="size-4" />Movimientos de stock</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <SelectBuscable
                value={movFiltroProducto || 'todos'}
                onChange={(v) => setMovFiltroProducto(v === 'todos' ? '' : v)}
                opciones={[
                  { value: 'todos', label: '— Todos los productos —' },
                  ...opcionesProducto(productos),
                ]}
                ariaLabel="Filtrar por producto"
                className="w-56"
              />
              <Input type="date" value={movDesde} onChange={(e) => setMovDesde(e.target.value)} className="w-40" />
              <Input type="date" value={movHasta} onChange={(e) => setMovHasta(e.target.value)} className="w-40" />
              <Button size="sm" variant="outline" onClick={() => cargarMovimientos()}><Filter />Filtrar</Button>
              {(movFiltroProducto || movDesde || movHasta) && (
                <Button size="sm" variant="outline" onClick={limpiarFiltroMovimientos}><X />Limpiar</Button>
              )}
            </div>
            <div ref={medidaHistorial} className="min-w-0">
              {movLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
              ) : historialEnLista ? (
                movimientos.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No hay movimientos registrados.</p>
                ) : (
                  <ul className="grid gap-2">
                    {movimientos.map((m) => (
                      <li key={m.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-md border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">{formatearFecha(m.fecha)}</span>
                          <TipoBadge tipo={m.tipo} />
                          <span className={m.cantidad >= 0 ? 'font-semibold text-exito' : 'font-semibold text-destructive'}>
                            {m.cantidad >= 0 ? '+' : ''}{formatoCantidad(m.cantidad)}
                          </span>
                          {conImporte && importeDeMovimiento(m) && <span className="text-xs">Importe: <ImporteDeMerma movimiento={m} /></span>}
                        </div>
                        <button type="button" className="text-left font-semibold [overflow-wrap:anywhere] hover:underline" onClick={() => verMovimientos(m.producto_id)}>{m.producto_nombre}</button>
                        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {[conDepositos ? (depositos.find((d) => d.id === m.deposito_id)?.nombre ?? null) : null, m.referencia || null].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <DataTable columns={movColumns} data={movimientos} emptyMessage="No hay movimientos registrados." />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

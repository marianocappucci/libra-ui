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
//
// El formulario de ajuste toma la forma de Contalibra (estado simple, sin
// react-hook-form) con las validaciones que Restolibra tenía en su schema:
// cantidad mayor a cero en los modos relativos, factor mayor a cero.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Filter, History, Pencil,
  RefreshCw, RotateCcw, ShoppingCart, TriangleAlert, X,
} from 'lucide-react'

import { api, ApiError } from '../api-client'
import { anchoColumnaAcciones, DataTable, sortableHeader } from '../data-table'
import { BadgeEstado, type TonoEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { SelectBuscable } from '../SelectBuscable'
import { hoyISO } from '../fechas'
import {
  opcionesProducto, TIPO_MOVIMIENTO_LABELS, type MovimientoStock, type StockItem, type StockListado,
} from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { formatEntero } from '@/lib/utils'

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
}

export function Stock({ rutaDeMovimientos, conConversionDeUnidad = false, rutaDeProductos = '/productos' }: StockProps) {
  const [productos, setProductos] = useState<StockItem[]>([])
  const [alertas, setAlertas] = useState<StockItem[]>([])
  const [motivosMerma, setMotivosMerma] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [movLoading, setMovLoading] = useState(false)
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
    setEditing(p)
    setModo('absoluto')
    setCantidad(String(p.stock_actual))
    setUnidadCompra('')
    setFactor('1')
    setMotivo('Otro')
    setFecha(hoyISO())
    setReferencia('')
    setFormError(null)
  }

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo)
    setCantidad(nuevo === 'absoluto' ? String(editing?.stock_actual ?? 0) : '')
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
    if (modo === 'entrada') return editing.stock_actual + val * f
    return editing.stock_actual - val
  }, [editing, modo, cantidad, factor, conConversionDeUnidad])

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
    { accessorKey: 'categoria', header: 'Categoría', size: 120, minSize: 90, cell: ({ row }) => <span className="block truncate text-muted-foreground" title={row.original.categoria ?? undefined}>{row.original.categoria || '—'}</span> },
    { accessorKey: 'unidad', header: () => <div className="text-center">Unidad</div>, size: 85, minSize: 70, cell: ({ row }) => <div className="truncate text-center text-muted-foreground">{row.original.unidad}</div> },
    { accessorKey: 'stock_minimo', header: () => <div className="text-center">Mínimo</div>, size: 100, minSize: 85, cell: ({ row }) => <div className="truncate text-center text-muted-foreground">{row.original.stock_minimo > 0 ? formatEntero(row.original.stock_minimo) : '—'}</div> },
    {
      accessorKey: 'stock_actual',
      header: () => <div className="text-center">Stock actual</div>,
      size: 115,
      minSize: 95,
      cell: ({ row }) => {
        const p = row.original
        const cls = p.stock_actual <= 0 ? 'text-destructive' : (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
        return <div className={`truncate text-center text-base font-bold ${cls}`}>{formatEntero(p.stock_actual)}</div>
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
      size: anchoColumnaAcciones(2),
      minSize: anchoColumnaAcciones(2),
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          {rutaDeMovimientos ? (
            <Button asChild size="icon" variant="outline" title="Ver movimientos" aria-label="Ver movimientos">
              <Link to={rutaDeMovimientos(row.original.id)}><History /></Link>
            </Button>
          ) : (
            <Button size="icon" variant="outline" title="Ver movimientos" aria-label="Ver movimientos" onClick={() => verMovimientos(row.original.id)}><History /></Button>
          )}
          <Button size="icon" variant="outline" title="Ajustar stock" aria-label="Ajustar stock" onClick={() => abrirAjuste(row.original)}><Pencil /></Button>
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [rutaDeMovimientos])

  const movColumns = useMemo<ColumnDef<MovimientoStock>[]>(() => [
    { accessorKey: 'fecha', header: 'Fecha' },
    {
      accessorKey: 'producto_nombre',
      header: 'Producto',
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
        <span className={row.original.cantidad >= 0 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-destructive'}>
          {row.original.cantidad >= 0 ? '+' : ''}{formatEntero(row.original.cantidad)}
        </span>
      ),
    },
    { accessorKey: 'referencia', header: 'Referencia', cell: ({ row }) => <span className="text-muted-foreground">{row.original.referencia || '—'}</span> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

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
        <TituloPantalla icono={Boxes}>Stock</TituloPantalla>
        {!rutaDeMovimientos && (
          <Button variant="outline" onClick={toggleMovimientos}><History />Historial de movimientos</Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {alertas.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            <strong>{alertas.length} producto{alertas.length > 1 ? 's' : ''} con stock bajo mínimo:</strong>{' '}
            {alertas.map((a) => (
              <BadgeEstado key={a.id} tono="atencion" className="ml-1">{a.nombre} ({formatEntero(a.stock_actual)} {a.unidad})</BadgeEstado>
            ))}
          </p>
        </div>
      )}

      <Card>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <DataTable
              columns={columns}
              data={productos}
              emptyMessage={<>No hay productos activos. <Link to={rutaDeProductos} className="text-primary hover:underline">Crear un producto</Link>.</>}
            />
          )}
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
                <div className={`text-3xl font-bold ${(editing?.stock_actual ?? 0) <= 0 ? 'text-destructive' : (editing?.stock_minimo ?? 0) > 0 && (editing?.stock_actual ?? 0) <= (editing?.stock_minimo ?? 0) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {formatEntero(editing?.stock_actual ?? 0)}
                </div>
                <div className="text-sm text-muted-foreground">Stock actual ({editing?.unidad})</div>
              </div>
              {(editing?.stock_minimo ?? 0) > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-muted-foreground">{formatEntero(editing?.stock_minimo ?? 0)}</div>
                  <div className="text-sm text-muted-foreground">Mínimo</div>
                </div>
              )}
            </div>

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
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger className="w-48" aria-label="Motivo de la merma"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {motivosMerma.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2"><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" /></div>
              <div className="grid gap-2"><Label>Referencia</Label><Input value={referencia} onChange={(e) => setReferencia(e.target.value)} className="w-56" placeholder="Ej: Compra, conteo físico, rotura…" /></div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            {resultado !== null && (
              <p className={`text-sm ${resultado < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                Stock resultante: {resultado.toFixed(3)} {editing?.unidad}
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
            {movLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : (
              <DataTable columns={movColumns} data={movimientos} emptyMessage="No hay movimientos registrados." />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

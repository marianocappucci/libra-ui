// El catálogo de productos: listado con búsqueda, alta y edición en un Dialog,
// categorías por datalist, borrado con confirmación (P9-M1, 2026-09-06).
//
// Estaba escrito dos veces —Contalibra y Restolibra, 460 y 497 líneas— y las
// dos copias diferían en **una sola cosa de dominio**: qué campos extra tiene
// un producto. Contalibra distingue producto de servicio (`tipo`); Restolibra
// tiene la estación de comanda, el switch «vendible» (insumo vs. plato) y el
// link a la receta. Todo lo demás —el formulario, el margen en vivo, el
// datalist de categorías, el borrado— era el mismo código.
//
// ## Lo que cada producto decide
//
// Cada diferencia es una prop, no un `if producto`. Sin props se obtiene el
// CRUD base que los dos comparten; con `conTipo` la forma de Contalibra; con
// `estaciones` + `conVendible` + `rutaDeReceta` la de Restolibra. El backend es
// el mismo para los dos (`build_productos_router` de LibraCommerce), que
// acepta la unión de los campos y aplica los defaults históricos a los que no
// se mandan.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { ClipboardList, Package, Pencil, Plus, Search, Trash2, TrendingUp, X } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { anchoColumnaAcciones, DataTable, sortableHeader } from '../data-table'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { UNIDADES, type CategoriaProducto, type Estacion, type Producto } from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

const productoSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  codigo: z.string().trim().optional(),
  descripcion: z.string().trim().optional(),
  precio_venta: z.coerce.number().min(0, 'No puede ser negativo'),
  precio_costo: z.coerce.number().min(0, 'No puede ser negativo'),
  unidad: z.string(),
  categoria: z.string().trim().optional(),
  stock_minimo: z.coerce.number().min(0, 'No puede ser negativo'),
  // Un servicio no tiene inventario: el backend lo excluye de Stock y nunca
  // genera movimiento al venderse.
  tipo: z.enum(['producto', 'servicio']),
  // "" (sin comanda) / una estación del producto.
  estacion: z.string(),
  vendible: z.boolean(),
  // Solo se edita en modo edición: en alta siempre nace activo.
  activo: z.boolean(),
})

type Valores = z.infer<typeof productoSchema>

const EMPTY_VALUES: Valores = {
  nombre: '', codigo: '', descripcion: '', precio_venta: 0, precio_costo: 0,
  unidad: 'u', categoria: '', stock_minimo: 0, tipo: 'producto', estacion: '', vendible: true, activo: true,
}

// Radix Select no admite value="" (reservado): la estación vacía viaja como un
// sentinel, mismo patrón que Egresos ("__sin__") y Ventas ("__none__").
const SIN_ESTACION = '__ninguna__'

export type ProductosProps = {
  /** Muestra el selector y la columna **Tipo** (producto / servicio). Es la
   *  forma de Contalibra: un servicio se factura pero no tiene inventario. */
  conTipo?: boolean
  /** Las estaciones de comanda. Con lista aparece el selector «Estación» y la
   *  columna; sin lista no se muestra nada. Es lo de Restolibra. */
  estaciones?: Estacion[]
  /** Muestra el switch «Vendible» y el badge «Insumo» en el listado. Un
   *  producto no vendible no aparece en el punto de venta, pero sí en recetas
   *  y stock. */
  conVendible?: boolean
  /** El backend genera el código cuando el alta viene sin uno
   *  (`generar_codigo_si_falta`): el campo lo dice como placeholder. */
  codigoAutogenerado?: boolean
  /** A dónde lleva la receta / ficha técnica del producto. Sin esto no se
   *  dibuja el botón, ni en la fila ni en el diálogo. */
  rutaDeReceta?: (id: number) => string
  /** Controles extra del encabezado, a la derecha del alta. */
  acciones?: ReactNode
}

export function Productos({
  conTipo = false,
  estaciones,
  conVendible = false,
  codigoAutogenerado = false,
  rutaDeReceta,
  acciones,
}: ProductosProps) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Producto | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const conEstacion = Boolean(estaciones && estaciones.length > 0)

  // Sin generic explícito en useForm: con z.coerce.number() el tipo de entrada
  // del resolver difiere del de salida; se deja inferir desde el resolver.
  const form = useForm({
    resolver: zodResolver(productoSchema),
    defaultValues: EMPTY_VALUES,
  })

  // Margen en vivo.
  const precioVenta = Number(form.watch('precio_venta')) || 0
  const precioCosto = Number(form.watch('precio_costo')) || 0
  const margen = precioCosto > 0 && precioVenta > 0 ? ((precioVenta - precioCosto) / precioCosto) * 100 : null

  useEffect(() => {
    loadProductos()
    api.get<CategoriaProducto[]>('/api/productos/categorias').then(setCategorias).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function loadProductos(query = q) {
    setLoading(true)
    setError(null)
    try {
      const path = query ? `/api/productos?q=${encodeURIComponent(query)}` : '/api/productos'
      setProductos(await api.get<Producto[]>(path))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  function limpiarBusqueda() {
    setQ('')
    loadProductos('')
  }

  function abrirNuevo() {
    setEditingProducto(null)
    form.reset(EMPTY_VALUES)
    setFormError(null)
    setDialogOpen(true)
  }

  function abrirEditar(producto: Producto) {
    setEditingProducto(producto)
    form.reset({
      nombre: producto.nombre,
      codigo: producto.codigo ?? '',
      descripcion: producto.descripcion ?? '',
      precio_venta: producto.precio_venta,
      precio_costo: producto.precio_costo,
      unidad: producto.unidad || 'u',
      categoria: producto.categoria ?? '',
      stock_minimo: producto.stock_minimo,
      tipo: producto.tipo || 'producto',
      estacion: producto.estacion ?? '',
      vendible: !producto.vendible ? false : true,
      activo: !!producto.activo,
    })
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(values: Valores) {
    setSaving(true)
    setFormError(null)
    // Se manda sólo lo que este producto edita: lo que no se manda toma el
    // default histórico en el backend (tipo=producto, estación vacía,
    // vendible). Así un producto sin `conTipo` no cambia el tipo al editar.
    const payload: Record<string, unknown> = {
      nombre: values.nombre,
      codigo: values.codigo || '',
      descripcion: values.descripcion || '',
      precio_venta: values.precio_venta,
      precio_costo: values.precio_costo,
      unidad: values.unidad,
      categoria: values.categoria || '',
      stock_minimo: values.stock_minimo,
      // Alta: siempre nace activo. Edición: viaja el switch «Producto activo».
      activo: editingProducto ? values.activo : true,
    }
    if (conTipo) payload.tipo = values.tipo
    if (conEstacion) payload.estacion = values.estacion || ''
    if (conVendible) payload.vendible = values.vendible
    try {
      if (editingProducto) {
        await api.put<Producto>(`/api/productos/${editingProducto.id}`, payload)
      } else {
        await api.post<Producto>('/api/productos', payload)
      }
      setDialogOpen(false)
      await loadProductos()
    } catch (err) {
      setFormError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  async function eliminar(producto: Producto) {
    setError(null)
    try {
      await api.del(`/api/productos/${producto.id}`)
      await loadProductos()
    } catch (err) {
      setError(describeError(err))
    }
  }

  const columns = useMemo<ColumnDef<Producto>[]>(() => {
    const cols: ColumnDef<Producto>[] = [
      { accessorKey: 'codigo', header: 'Código', size: 88, minSize: 78, cell: ({ row }) => <span className="block truncate font-mono text-xs" title={row.original.codigo ?? undefined}>{row.original.codigo || '—'}</span> },
      {
        accessorKey: 'nombre',
        header: sortableHeader('Nombre'),
        size: 110,
        minSize: 90,
        meta: { stretch: true },
        cell: ({ row }) => (
          <span className="flex w-full items-center gap-1.5 font-medium">
            <span className="truncate" title={row.original.nombre}>{row.original.nombre}</span>
            {conVendible && !row.original.vendible && <Badge variant="secondary" className="shrink-0">Insumo</Badge>}
          </span>
        ),
      },
    ]
    if (conTipo) {
      cols.push({
        accessorKey: 'tipo',
        header: 'Tipo',
        size: 74,
        minSize: 66,
        cell: ({ row }) => (
          <Badge variant={row.original.tipo === 'servicio' ? 'outline' : 'secondary'}>
            {row.original.tipo === 'servicio' ? 'Servicio' : 'Producto'}
          </Badge>
        ),
      })
    }
    cols.push({ accessorKey: 'categoria', header: 'Categoría', size: 96, minSize: 84, cell: ({ row }) => <span className="block truncate" title={row.original.categoria ?? undefined}>{row.original.categoria || '—'}</span> })
    if (conEstacion) {
      cols.push({
        accessorKey: 'estacion',
        header: 'Estación',
        size: 96,
        minSize: 84,
        cell: ({ row }) => {
          const est = estaciones!.find((e) => e.value === row.original.estacion)
          return <span className="block truncate text-muted-foreground">{est && est.value ? est.label : '—'}</span>
        },
      })
    }
    cols.push(
      { accessorKey: 'unidad', header: 'Unidad', size: 70, minSize: 64, cell: ({ row }) => <span className="block truncate">{row.original.unidad}</span> },
      { accessorKey: 'precio_venta', header: () => <div className="text-right">Precio venta</div>, size: 114, minSize: 100, cell: ({ row }) => <div className="truncate text-right">{formatCurrency(row.original.precio_venta)}</div> },
      { accessorKey: 'precio_costo', header: () => <div className="text-right">Precio costo</div>, size: 114, minSize: 100, cell: ({ row }) => <div className="truncate text-right text-muted-foreground">{formatCurrency(row.original.precio_costo)}</div> },
      {
        accessorKey: 'activo',
        header: () => <div className="text-center">Estado</div>,
        size: 78,
        minSize: 72,
        cell: ({ row }) => (
          <div className="text-center">
            <BadgeEstado tono={row.original.activo ? 'ok' : 'neutro'}>
              {row.original.activo ? 'Activo' : 'Inactivo'}
            </BadgeEstado>
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Acciones</div>,
        size: anchoColumnaAcciones(rutaDeReceta ? 3 : 2),
        minSize: anchoColumnaAcciones(rutaDeReceta ? 3 : 2),
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {rutaDeReceta && (
              <Button size="icon" variant="outline" title="Receta" aria-label="Receta" asChild>
                <Link to={rutaDeReceta(row.original.id)}><ClipboardList /></Link>
              </Button>
            )}
            <Button size="icon" variant="outline" title="Editar producto" aria-label="Editar producto" onClick={() => abrirEditar(row.original)}><Pencil /></Button>
            <Button size="icon" variant="outline" title="Eliminar producto" aria-label="Eliminar producto" onClick={() => setConfirmDelete(row.original)}><Trash2 /></Button>
          </div>
        ),
      },
    )
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conTipo, conEstacion, conVendible, rutaDeReceta])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TituloPantalla icono={Package}>Productos</TituloPantalla>
        <div className="flex items-center gap-2">
          {acciones}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={abrirNuevo}><Plus />Nuevo producto</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="size-4" />{editingProducto ? 'Editar producto' : 'Nuevo producto'}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form className="flex flex-wrap items-start gap-3" onSubmit={form.handleSubmit(handleSubmit)}>
                  {formError && <p className="w-full text-sm text-destructive">{formError}</p>}
                  <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input {...field} className="w-48" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="codigo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código</FormLabel>
                        <FormControl>
                          <Input {...field} className="w-32" placeholder={codigoAutogenerado ? 'Autogenerado' : undefined} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="categoria"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoría</FormLabel>
                        <FormControl>
                          <Input {...field} className="w-40" list="categorias-producto" placeholder="Elegir o escribir…" />
                        </FormControl>
                        <datalist id="categorias-producto">
                          {categorias.map((c) => <option key={c.id} value={c.nombre} />)}
                        </datalist>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="unidad"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unidad</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {conTipo && (
                    <FormField
                      control={form.control}
                      name="tipo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="producto">Producto</SelectItem>
                              <SelectItem value="servicio">Servicio</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {conEstacion && (
                    <FormField
                      control={form.control}
                      name="estacion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estación (comanda)</FormLabel>
                          <Select
                            value={field.value || SIN_ESTACION}
                            onValueChange={(v) => field.onChange(v === SIN_ESTACION ? '' : v)}
                          >
                            <FormControl>
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {estaciones!.map((e) => (
                                <SelectItem key={e.value || SIN_ESTACION} value={e.value || SIN_ESTACION}>{e.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="precio_venta"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio de venta</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value as number} className="w-32" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="precio_costo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio de costo</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value as number} className="w-32" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="stock_minimo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stock mínimo</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value as number} className="w-28" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="descripcion"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>Descripción</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {margen !== null && (
                    <p className={`flex w-full items-center gap-1.5 text-sm ${margen >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                      <TrendingUp className="size-4 shrink-0" />Margen: <strong>{margen.toFixed(1)}%</strong>
                    </p>
                  )}
                  {conVendible && (
                    <FormField
                      control={form.control}
                      name="vendible"
                      render={({ field }) => (
                        <FormItem className="flex w-full flex-row items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="grid gap-0.5">
                            <FormLabel className="!mt-0">Vendible</FormLabel>
                            <p className="text-xs text-muted-foreground">
                              Si lo desactivás, este producto es un insumo: no aparece en el punto de
                              venta, pero sí en recetas y stock.
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                  )}
                  {editingProducto && (
                    <FormField
                      control={form.control}
                      name="activo"
                      render={({ field }) => (
                        <FormItem className="flex w-full flex-row items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="!mt-0">Producto activo</FormLabel>
                        </FormItem>
                      )}
                    />
                  )}
                  <DialogFooter className="w-full">
                    {editingProducto && rutaDeReceta && (
                      <Button type="button" variant="outline" className="mr-auto" asChild>
                        <Link to={rutaDeReceta(editingProducto.id)}><ClipboardList />Receta / insumos</Link>
                      </Button>
                    )}
                    <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                    <Button type="submit" disabled={saving}>
                      {saving ? 'Guardando…' : editingProducto ? 'Guardar cambios' : 'Crear producto'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadProductos()}
            placeholder="Buscar por nombre, código o categoría…"
            className="w-72"
          />
          <Button size="sm" variant="outline" onClick={() => loadProductos()}><Search />Buscar</Button>
          {q && <Button size="sm" variant="ghost" onClick={limpiarBusqueda}><X />Limpiar</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <DataTable
              columns={columns}
              data={productos}
              emptyMessage={q ? `No se encontraron productos para "${q}".` : 'No hay productos registrados aún.'}
              getRowClassName={(p) => !p.activo ? 'opacity-60' : undefined}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`¿Eliminar ${confirmDelete?.nombre ?? ''}?`}
        onConfirm={() => {
          if (confirmDelete) eliminar(confirmDelete)
          setConfirmDelete(null)
        }}
      />
    </div>
  )
}

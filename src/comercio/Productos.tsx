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
import { useEffect, useMemo, useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ColumnDef } from '../data-table'
import { Barcode, ClipboardList, Package, Pencil, Plus, Search, Trash2, TrendingUp, X } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { anchoColumnaAcciones, DataTable, sortableHeader } from '../data-table'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { UNIDADES, type CategoriaProducto, type Estacion, type Producto } from './tipos'
import { ProductoCodigosVariantes } from './ProductoCodigosVariantes'
import { formatEntero } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
  // Carga de vencimientos (opt-in, sólo si el backend trae `vence`): si el producto es perecedero. Viaja SÓLO si el usuario
  // lo cambió respecto de lo que había (ver `handleSubmit`).
  vence: z.boolean(),
  // Solo se edita en modo edición: en alta siempre nace activo.
  activo: z.boolean(),
})

type Valores = z.infer<typeof productoSchema>

const EMPTY_VALUES: Valores = {
  nombre: '', codigo: '', descripcion: '', precio_venta: 0, precio_costo: 0,
  unidad: 'u', categoria: '', stock_minimo: 0, tipo: 'producto', estacion: '', vendible: true, vence: false, activo: true,
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
  /** Un botón por fila que abre los **códigos** (barras, SKU, balanza) y las **variantes** del producto. Es lo de
   *  VentaLibra: un producto con varios códigos y con talle/color. */
  conDetalle?: boolean
  /** Una columna «Stock total» (la suma de todos los depósitos, de `GET /api/stock`). */
  conStockTotal?: boolean
  /** El botón de eliminar. Un producto con historial no se elimina sino que se desactiva: quien lo aplica lo apaga. */
  conEliminar?: boolean
  /** El interruptor «Vence» del formulario (producto perecedero: maneja lotes y fecha de vencimiento). **Por defecto se decide
   *  solo: aparece si el backend trae `vence` en los productos** (`OpcionesCatalogo.con_vencimientos`), y un producto que no
   *  lo manda no ve nada nuevo. Con un catálogo todavía vacío no hay de dónde leerlo: `true` lo fuerza (y `false` lo apaga). */
  conVencimientos?: boolean
  /** «Plazo de entrega» y «Stock máximo» propios del producto, que usa la **reposición sugerida** (`GET`/`PUT
   *  /api/productos/{id}/reposicion`, `libracommerce.web.reposicion_router.build_reposicion_parametros_router`, ADR-020 del motor). **Opt-in
   *  por prop** (por defecto no se muestra): el backend tiene que montar ese router. Se guardan aparte del producto, después de él. */
  conParametrosDeReposicion?: boolean
}

/** Los topes del motor (`erp.reposicion.MAX_PLAZO_ENTREGA_DIAS`). */
const MAX_PLAZO_REPOSICION = 180
type ParametrosReposicion = { plazo_entrega_dias: number | null; stock_maximo: number | null }
type EstadoReposicion = 'sin' | 'cargando' | 'listo' | 'error'

/** Valida los dos campos de texto (vacío = sin valor propio). Devuelve el error, o los valores a mandar. */
function leerParametrosReposicion(plazo: string, techo: string, minimo: number):
  { error: string } | { valores: ParametrosReposicion } {
  const p = plazo.trim()
  const t = techo.trim().replace(',', '.')
  let plazoDias: number | null = null
  if (p !== '') {
    if (!/^\d+$/.test(p) || Number(p) < 1 || Number(p) > MAX_PLAZO_REPOSICION) {
      return { error: `El plazo de entrega tiene que ser un entero entre 1 y ${MAX_PLAZO_REPOSICION} días (o vacío, para usar el general).` }
    }
    plazoDias = Number(p)
  }
  let maximo: number | null = null
  if (t !== '') {
    if (!/^\d+(\.\d+)?$/.test(t) || !Number.isFinite(Number(t)) || Number(t) <= 0) {
      return { error: 'El stock máximo tiene que ser mayor que 0 (o vacío, sin techo).' }
    }
    maximo = Number(t)
    if (minimo > 0 && maximo < minimo) return { error: `El stock máximo no puede ser menor que el stock mínimo (${minimo}).` }
  }
  return { valores: { plazo_entrega_dias: plazoDias, stock_maximo: maximo } }
}

const AYUDA_VENCE =
  'Marcalo si el producto es perecedero: vas a poder cargar lote y fecha al recibir compras y verlo en “Vencimientos y lotes”.'
const AYUDA_VENCE_SERVICIO = 'Un servicio no tiene inventario: no puede tener lotes ni vencimiento.'

export function Productos({
  conTipo = false,
  estaciones,
  conVendible = false,
  codigoAutogenerado = false,
  rutaDeReceta,
  acciones,
  conDetalle = false,
  conStockTotal = false,
  conEliminar = true,
  conVencimientos,
  conParametrosDeReposicion = false,
}: ProductosProps) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  // Las unidades las dice el backend (`OpcionesCatalogo.unidades`; VentaLibra las administra en su base); la lista de
  // siempre es el respaldo si no contesta.
  const [unidades, setUnidades] = useState<string[]>([...UNIDADES])
  const [detalle, setDetalle] = useState<Producto | null>(null)
  const [stockTotal, setStockTotal] = useState<Record<number, number>>({})
  const [confirmDelete, setConfirmDelete] = useState<Producto | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Opt-in por datos: una vez que algún producto trajo `vence` (aun uno que no vence: `false`) el backend lo maneja, y se
  // recuerda aunque una búsqueda posterior devuelva una lista vacía.
  const [backendConVence, setBackendConVence] = useState(false)
  const conVence = conVencimientos ?? backendConVence
  // Plazo y techo de reposición del producto que se edita: texto de los dos campos, lo que había (para mandar sólo si cambió) y si
  // se pudieron leer (si no, no se muestran ni se mandan: no se pisa lo que no se vio).
  const [repoPlazo, setRepoPlazo] = useState('')
  const [repoTecho, setRepoTecho] = useState('')
  const [repoOriginal, setRepoOriginal] = useState<ParametrosReposicion>({ plazo_entrega_dias: null, stock_maximo: null })
  const [repoEstado, setRepoEstado] = useState<EstadoReposicion>('sin')
  // Cada apertura del diálogo numera su lectura: la respuesta de un producto anterior que llega tarde no pisa a la del actual.
  const repoLectura = useRef(0)
  // Los valores del producto tal como se abrió el diálogo de edición (para saber si el usuario tocó algo del producto o sólo del plazo/techo).
  const valoresIniciales = useRef<Valores | null>(null)
  // El producto que se edita llegó SIN `precio_costo` (el rol no tiene `costos.ver`): el 0 del formulario es de relleno y nunca se guarda.
  const costoOculto = useRef(false)
  // Ningún producto de la lista trae `precio_costo`: el rol no ve costos y la columna sobraría (se mostraría «NaN»).
  const sinCosto = productos.length > 0 && productos.every((p) => p.precio_costo === undefined || p.precio_costo === null)
  // El producto que se está editando llegó sin costo: el campo «Precio de costo» y el margen no se ofrecen (el 0 sería inventado).
  const costoOcultoEnForm = editingProducto !== null && (editingProducto.precio_costo === undefined || editingProducto.precio_costo === null)

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
    api.get<string[]>('/api/productos/unidades').then((u) => { if (Array.isArray(u) && u.length > 0) setUnidades(u) }).catch(() => {})
    if (conStockTotal) {
      api.get<{ productos: { id: number; stock_actual: number }[] }>('/api/stock')
        .then((d) => setStockTotal(Object.fromEntries((d?.productos ?? []).map((p) => [p.id, p.stock_actual]))))
        .catch(() => setStockTotal({}))
    }
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
      const lista = await api.get<Producto[]>(path)
      if (lista.some((p) => typeof p.vence === 'boolean')) setBackendConVence(true)
      setProductos(lista)
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
    valoresIniciales.current = null
    costoOculto.current = false
    setFormError(null)
    setRepoPlazo('')
    setRepoTecho('')
    setRepoOriginal({ plazo_entrega_dias: null, stock_maximo: null })
    setRepoEstado(conParametrosDeReposicion ? 'listo' : 'sin')
    repoLectura.current += 1
    setDialogOpen(true)
  }

  function abrirEditar(producto: Producto) {
    setEditingProducto(producto)
    const iniciales: Valores = {
      nombre: producto.nombre,
      codigo: producto.codigo ?? '',
      descripcion: producto.descripcion ?? '',
      precio_venta: producto.precio_venta,
      // Un rol sin `costos.ver` recibe el producto SIN `precio_costo` (VentaLibra, ADR-049): sin un número el formulario no valida y quien sólo
      // decide la reposición (el depósito) no podría guardar ni el plazo ni el techo. Se muestra 0 (nunca se guarda: ver `productoSinCambios`).
      precio_costo: producto.precio_costo ?? 0,
      unidad: producto.unidad || 'u',
      categoria: producto.categoria ?? '',
      stock_minimo: producto.stock_minimo,
      tipo: producto.tipo || 'producto',
      estacion: producto.estacion ?? '',
      vendible: !producto.vendible ? false : true,
      vence: producto.vence === true,
      activo: !!producto.activo,
    }
    form.reset(iniciales)
    valoresIniciales.current = iniciales
    costoOculto.current = producto.precio_costo === undefined || producto.precio_costo === null
    setFormError(null)
    setRepoPlazo('')
    setRepoTecho('')
    setRepoOriginal({ plazo_entrega_dias: null, stock_maximo: null })
    setRepoEstado(conParametrosDeReposicion ? 'cargando' : 'sin')
    const lectura = ++repoLectura.current
    setDialogOpen(true)
    if (conParametrosDeReposicion) {
      api.get<ParametrosReposicion>(`/api/productos/${producto.id}/reposicion`)
        .then((d) => {
          if (lectura !== repoLectura.current) return
          const original = { plazo_entrega_dias: d?.plazo_entrega_dias ?? null, stock_maximo: d?.stock_maximo ?? null }
          setRepoOriginal(original)
          setRepoPlazo(original.plazo_entrega_dias === null ? '' : String(original.plazo_entrega_dias))
          setRepoTecho(original.stock_maximo === null ? '' : String(original.stock_maximo))
          setRepoEstado('listo')
        })
        .catch(() => { if (lectura === repoLectura.current) setRepoEstado('error') })
    }
  }

  async function handleSubmit(values: Valores) {
    // No se guarda mientras se leen el plazo y el techo: sin verlos no se puede validar el mínimo contra el máximo que ya había.
    if (repoEstado === 'cargando') return
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
    // `vence` viaja sólo si el usuario cambió el interruptor: el backend no toca la marca si no viene (editar otra cosa nunca la
    // pierde) y cambiarla exige un permiso que quizá no tenga quien sólo corrige un precio.
    if (conVence && values.vence !== (editingProducto?.vence === true)) payload.vence = values.vence
    // Plazo y techo se validan ANTES de escribir nada: un valor inválido no deja el producto a medias.
    let repoAMandar: ParametrosReposicion | null = null
    if (conParametrosDeReposicion && repoEstado === 'listo') {
      const leidos = leerParametrosReposicion(repoPlazo, repoTecho, Number(values.stock_minimo) || 0)
      if ('error' in leidos) {
        setFormError(leidos.error)
        setSaving(false)
        return
      }
      const v = leidos.valores
      if (v.plazo_entrega_dias !== repoOriginal.plazo_entrega_dias || v.stock_maximo !== repoOriginal.stock_maximo) repoAMandar = v
    }
    let guardado = false
    try {
      let id = editingProducto?.id
      if (editingProducto) {
        // Si sólo cambió el plazo o el techo, el producto no se vuelve a guardar: quien puede decidir la reposición (el depósito) no siempre
        // puede editar el producto, y un guardado del producto que no cambia nada no tiene por qué fallarle ni escribir de más.
        const iniciales = valoresIniciales.current
        const productoSinCambios = repoAMandar !== null && iniciales !== null &&
          (Object.keys(values) as (keyof Valores)[]).every((k) => String(values[k]) === String(iniciales[k]))
        // Sin ver el costo no se puede guardar el producto: el 0 de relleno pisaría el costo real. Sólo se guarda lo de reposición.
        if (!productoSinCambios && costoOculto.current) {
          setFormError('Tu rol no ve el costo de este producto, así que no puede editar el producto: sólo el plazo de entrega y el stock máximo.')
          setSaving(false)
          return
        }
        if (!productoSinCambios) {
          await api.put<Producto>(`/api/productos/${editingProducto.id}`, payload)
          guardado = true
          // Lo que ya quedó en el servidor es la base para comparar si hay que reintentar: si el plazo/techo falla y el usuario deshace
          // su cambio al producto, ese deshacer tiene que guardarse.
          valoresIniciales.current = { ...values }
        }
      } else {
        const creado = await api.post<Producto>('/api/productos', payload)
        id = creado?.id
        guardado = true
        // Ya existe: si falla el plazo/techo y se reintenta, el diálogo pasa a editar ESE producto y no crea otro.
        if (creado && repoAMandar) setEditingProducto(creado)
      }
      if (repoAMandar && id !== undefined) await api.put(`/api/productos/${id}/reposicion`, repoAMandar)
      setDialogOpen(false)
      await loadProductos()
    } catch (err) {
      if (guardado) {
        // El producto sí quedó guardado; sólo falló el plazo/techo. Se dice y el diálogo sigue abierto para reintentar.
        setFormError(`El producto se guardó, pero no se pudieron guardar el plazo y el stock máximo: ${describeError(err)}`)
        await loadProductos()
      } else {
        setFormError(describeError(err))
      }
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
      // Sin `precio_costo` en ninguno de los productos (el rol no tiene `costos.ver`) no hay columna: no se muestra un «NaN».
      ...(sinCosto ? [] : [{ accessorKey: 'precio_costo', header: () => <div className="text-right">Precio costo</div>, size: 114, minSize: 100, cell: ({ row }) => <div className="truncate text-right text-muted-foreground">{formatCurrency(row.original.precio_costo)}</div> } as ColumnDef<Producto>]),
      ...(conStockTotal ? [{
        // 🔑 «Stock total» y no «Stock»: es la suma de TODOS los depósitos; con varias sucursales un «Stock: 10» se lee
        // como «hay 10 acá». El reparto está en la pantalla de Stock.
        id: 'stock_total',
        header: sortableHeader('Stock total'),
        size: 110,
        minSize: 90,
        accessorFn: (p: Producto) => stockTotal[p.id] ?? 0,
        cell: ({ row }: { row: { original: Producto } }) => {
          const n = stockTotal[row.original.id]
          if (n === undefined) return <span className="text-muted-foreground">—</span>
          return <span className={`tabular-nums ${n < 0 ? 'font-medium text-destructive' : n === 0 ? 'text-muted-foreground' : ''}`}>{formatEntero(n)}</span>
        },
      } as ColumnDef<Producto>] : []),
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
        size: anchoColumnaAcciones(1 + (rutaDeReceta ? 1 : 0) + (conDetalle ? 1 : 0) + (conEliminar ? 1 : 0)),
        minSize: anchoColumnaAcciones(1 + (rutaDeReceta ? 1 : 0) + (conDetalle ? 1 : 0) + (conEliminar ? 1 : 0)),
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {rutaDeReceta && (
              <Button size="icon" variant="outline" title="Receta" aria-label="Receta" asChild>
                <Link to={rutaDeReceta(row.original.id)}><ClipboardList /></Link>
              </Button>
            )}
            <Button size="icon" variant="outline" title="Editar producto" aria-label="Editar producto" onClick={() => abrirEditar(row.original)}><Pencil /></Button>
            {conDetalle && (
              <Button size="icon" variant="outline" title="Gestionar códigos y variantes" aria-label="Gestionar códigos y variantes" onClick={() => setDetalle(row.original)}><Barcode /></Button>
            )}
            {conEliminar && (
              <Button size="icon" variant="outline" title="Eliminar producto" aria-label="Eliminar producto" onClick={() => setConfirmDelete(row.original)}><Trash2 /></Button>
            )}
          </div>
        ),
      },
    )
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conTipo, conEstacion, conVendible, rutaDeReceta, conDetalle, conStockTotal, conEliminar, stockTotal, sinCosto])

  // Un servicio no tiene inventario: no se marca. Si ya estaba marcado (o se marcó antes de cambiar el tipo) el interruptor
  // sigue habilitado, para poder desmarcarlo: el backend rechaza (409) guardar un servicio marcado.
  const esServicio = form.watch('tipo') === 'servicio'
  const venceAhora = form.watch('vence')

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
                            {(unidades.includes(form.watch('unidad')) ? unidades : [...unidades, form.watch('unidad')]).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
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
                  {!costoOcultoEnForm && (
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
                  )}
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
                  {conParametrosDeReposicion && repoEstado !== 'sin' && (
                    <fieldset className="grid w-full gap-2 rounded-md border p-3" aria-label="Reposición">
                      <legend className="px-1 text-sm font-medium">Reposición sugerida</legend>
                      {repoEstado === 'error' ? (
                        <p role="status" className="text-xs text-muted-foreground">
                          No se pudieron leer el plazo ni el stock máximo de este producto; no se van a modificar.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="repo-plazo">Plazo de entrega (días)</Label>
                            <Input id="repo-plazo" inputMode="numeric" placeholder="general" className="w-32" value={repoPlazo}
                              disabled={repoEstado === 'cargando'} onChange={(e) => setRepoPlazo(e.target.value)} />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="repo-techo">Stock máximo</Label>
                            <Input id="repo-techo" inputMode="decimal" placeholder="sin tope" className="w-32" value={repoTecho}
                              disabled={repoEstado === 'cargando'} onChange={(e) => setRepoTecho(e.target.value)} />
                          </div>
                          <p className="w-full text-xs text-muted-foreground">
                            Vacíos, la reposición usa el plazo general y no pone tope. El máximo cuenta lo que ya viene en camino y no puede ser menor que el stock mínimo.
                          </p>
                        </div>
                      )}
                    </fieldset>
                  )}
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
                  {margen !== null && !costoOcultoEnForm && (
                    <p className={`flex w-full items-center gap-1.5 text-sm ${margen >= 0 ? 'text-exito' : 'text-destructive'}`}>
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
                  {conVence && (
                    <FormField
                      control={form.control}
                      name="vence"
                      render={({ field }) => (
                        <FormItem className="flex w-full flex-row items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={esServicio && !venceAhora} />
                          </FormControl>
                          <div className="grid gap-0.5">
                            <FormLabel className="!mt-0">Vence (maneja lotes y fecha de vencimiento)</FormLabel>
                            <p className="text-xs text-muted-foreground">
                              {esServicio
                                ? `${AYUDA_VENCE_SERVICIO}${venceAhora ? ' Desmarcalo para poder guardarlo.' : ''}`
                                : AYUDA_VENCE}
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
                    <Button type="submit" disabled={saving || repoEstado === 'cargando'}>
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

      {detalle && <ProductoCodigosVariantes producto={detalle} onClose={() => setDetalle(null)} />}

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

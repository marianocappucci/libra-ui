// El detalle de una lista de precios: edición de precios por producto, ajuste en
// lote, importación, configuración y —con el add-on— los quiebres por cantidad
// (P9-M2, 2026-09-06).
//
// Estaba escrita dos veces y las copias diferían en 163 líneas, casi todas de
// una sola cosa de dominio: los quiebres por cantidad, que sólo Contalibra tiene
// (add-on mayorista). Entra como `conQuiebres`; el producto lo decide leyendo
// sus módulos. El resto era forma: se toman las columnas con ancho y truncado de
// Restolibra y el resto de Contalibra.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { ArrowLeft, Check, Download, Percent, Settings, Tag, Trash2 } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { DataTable } from '../data-table'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import type { CategoriaProducto, ItemListaPrecio, ListaPrecio, Quiebre } from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/confirm-dialog'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

function margenPct(precio: number, costo: number): string {
  if (!precio || !costo) return '—'
  return `${(((precio / costo) - 1) * 100).toFixed(1)}%`
}

export type ListaPrecioDetalleProps = {
  /** Habilita los quiebres por cantidad (una columna y un editor por producto).
   *  Es el add-on mayorista de Contalibra; sin él la lista es flat. El backend
   *  correspondiente (`build_quiebres_router`) tiene que estar montado. */
  conQuiebres?: boolean
  /** A dónde vuelve «Volver» y a dónde va después de borrar la lista. */
  rutaDeListas?: string
}

export function ListaPrecioDetalle({ conQuiebres = false, rutaDeListas = '/listas-precio' }: ListaPrecioDetalleProps) {
  const { id } = useParams<{ id: string }>()
  const listaId = Number(id)
  const navigate = useNavigate()

  const [lista, setLista] = useState<ListaPrecio | null>(null)
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<ItemListaPrecio[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [precios, setPrecios] = useState<Record<number, string>>({})
  const [savingItems, setSavingItems] = useState(false)
  const [categoriaFiltro, setCategoriaFiltro] = useState('')

  const [loteOpen, setLoteOpen] = useState(false)
  const [loteBase, setLoteBase] = useState<'lista' | 'venta' | 'costo'>('lista')
  const [lotePorcentaje, setLotePorcentaje] = useState('')
  const [loteCategoria, setLoteCategoria] = useState('')
  const [loteSaving, setLoteSaving] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importFuente, setImportFuente] = useState<'venta' | 'costo' | 'lista'>('venta')
  const [importFuenteListaId, setImportFuenteListaId] = useState('')
  const [importSaving, setImportSaving] = useState(false)
  const [otrasListas, setOtrasListas] = useState<ListaPrecio[]>([])

  const [configOpen, setConfigOpen] = useState(false)
  const [configNombre, setConfigNombre] = useState('')
  const [configDescripcion, setConfigDescripcion] = useState('')
  const [configActiva, setConfigActiva] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [confirmDeleteLista, setConfirmDeleteLista] = useState(false)

  const [quiebresProducto, setQuiebresProducto] = useState<ItemListaPrecio | null>(null)
  const [quiebres, setQuiebres] = useState<{ min_quantity: string; amount: string }[]>([])
  const [quiebresSaving, setQuiebresSaving] = useState(false)
  const [quiebresError, setQuiebresError] = useState<string | null>(null)

  useEffect(() => {
    cargarLista()
    api.get<CategoriaProducto[]>('/api/productos/categorias').then(setCategorias).catch(() => {})
    api.get<ListaPrecio[]>('/api/listas-precio').then(setOtrasListas).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaId])

  useEffect(() => {
    if (lista) cargarItems('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista?.id])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  function volcarPrecios(data: ItemListaPrecio[]) {
    const map: Record<number, string> = {}
    for (const it of data) map[it.id] = it.precio_lista ? String(it.precio_lista) : ''
    setPrecios(map)
  }

  async function cargarLista() {
    setLoading(true)
    setError(null)
    try {
      const listas = await api.get<ListaPrecio[]>('/api/listas-precio')
      const encontrada = listas.find((l) => l.id === listaId) ?? null
      setLista(encontrada)
      if (encontrada) {
        setConfigNombre(encontrada.nombre)
        setConfigDescripcion(encontrada.descripcion ?? '')
        setConfigActiva(Boolean(encontrada.activa))
      }
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function cargarItems(categoria: string) {
    setItemsLoading(true)
    setError(null)
    try {
      const path = categoria
        ? `/api/listas-precio/${listaId}/items?categoria=${encodeURIComponent(categoria)}`
        : `/api/listas-precio/${listaId}/items`
      const data = await api.get<ItemListaPrecio[]>(path)
      setItems(data)
      volcarPrecios(data)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setItemsLoading(false)
    }
  }

  async function aplicarFiltroCategoria(categoria: string) {
    setCategoriaFiltro(categoria)
    await cargarItems(categoria)
  }

  async function guardarPrecios() {
    setSavingItems(true)
    setError(null)
    try {
      const payload = {
        precios: Object.fromEntries(
          Object.entries(precios)
            .filter(([, v]) => v.trim() !== '')
            .map(([pid, v]) => [pid, Number(v.replace(',', '.'))]),
        ),
      }
      setItems(await api.put<ItemListaPrecio[]>(`/api/listas-precio/${listaId}/items`, payload))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSavingItems(false)
    }
  }

  function abrirLote() {
    setLoteBase('lista')
    setLotePorcentaje('')
    setLoteCategoria(categoriaFiltro)
    setLoteOpen(true)
  }

  async function aplicarLote() {
    const pct = Number(lotePorcentaje.replace(',', '.'))
    if (Number.isNaN(pct)) {
      setError('Ingresá un porcentaje válido.')
      return
    }
    setLoteSaving(true)
    setError(null)
    try {
      await api.post(`/api/listas-precio/${listaId}/ajuste-porcentual`, {
        porcentaje: pct, base: loteBase, categoria: loteCategoria,
      })
      setLoteOpen(false)
      await cargarItems(categoriaFiltro)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoteSaving(false)
    }
  }

  function abrirImportar() {
    setImportFuente('venta')
    setImportFuenteListaId('')
    setImportOpen(true)
  }

  async function aplicarImportar() {
    if (importFuente === 'lista' && !importFuenteListaId) {
      setError('Elegí la lista de origen.')
      return
    }
    setImportSaving(true)
    setError(null)
    try {
      const data = await api.post<ItemListaPrecio[]>(`/api/listas-precio/${listaId}/importar`, {
        fuente: importFuente,
        fuente_lista_id: importFuente === 'lista' ? Number(importFuenteListaId) : null,
      })
      setItems(data)
      volcarPrecios(data)
      setImportOpen(false)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setImportSaving(false)
    }
  }

  async function guardarConfig() {
    setConfigSaving(true)
    setError(null)
    try {
      await api.put(`/api/listas-precio/${listaId}`, {
        nombre: configNombre, descripcion: configDescripcion, activa: configActiva,
      })
      setConfigOpen(false)
      await cargarLista()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setConfigSaving(false)
    }
  }

  async function eliminarLista() {
    setConfigSaving(true)
    setError(null)
    try {
      await api.del(`/api/listas-precio/${listaId}`)
      navigate(rutaDeListas)
    } catch (err) {
      setError(describeError(err))
      setConfigSaving(false)
    }
  }

  async function abrirQuiebres(producto: ItemListaPrecio) {
    setQuiebresProducto(producto)
    setQuiebresError(null)
    setQuiebres([])
    try {
      const qs = await api.get<Quiebre[]>(`/api/listas-precio/${listaId}/items/${producto.id}/quiebres`)
      setQuiebres(qs.map((q) => ({ min_quantity: String(q.min_quantity), amount: String(q.amount) })))
    } catch (err) {
      setQuiebresError(describeError(err))
    }
  }

  function agregarQuiebre() { setQuiebres((qs) => [...qs, { min_quantity: '', amount: '' }]) }
  function quitarQuiebre(i: number) { setQuiebres((qs) => qs.filter((_, idx) => idx !== i)) }
  function actualizarQuiebre(i: number, field: 'min_quantity' | 'amount', value: string) {
    setQuiebres((qs) => qs.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
  }

  async function guardarQuiebres() {
    if (!quiebresProducto) return
    setQuiebresSaving(true)
    setQuiebresError(null)
    try {
      // Sólo las filas completas; el backend valida cantidad>=2, precio>0 y no repetidos.
      const payload = {
        quiebres: quiebres
          .filter((q) => q.min_quantity && q.amount)
          .map((q) => ({ min_quantity: Number(q.min_quantity), amount: Number(q.amount) })),
      }
      await api.put(`/api/listas-precio/${listaId}/items/${quiebresProducto.id}/quiebres`, payload)
      setQuiebresProducto(null)
    } catch (err) {
      setQuiebresError(describeError(err))
    } finally {
      setQuiebresSaving(false)
    }
  }

  const itemColumns = useMemo<ColumnDef<ItemListaPrecio>[]>(() => [
    { accessorKey: 'codigo', header: 'Código', size: 90, minSize: 78, cell: ({ row }) => <span className="block truncate font-mono text-xs" title={row.original.codigo ?? undefined}>{row.original.codigo || '—'}</span> },
    { accessorKey: 'nombre', header: 'Producto', size: 160, minSize: 100, meta: { stretch: true }, cell: ({ row }) => <span className="block truncate font-medium" title={row.original.nombre}>{row.original.nombre}</span> },
    { accessorKey: 'categoria', header: 'Categoría', size: 100, minSize: 85, cell: ({ row }) => <span className="block truncate" title={row.original.categoria ?? undefined}>{row.original.categoria || '—'}</span> },
    { accessorKey: 'precio_costo', header: () => <div className="text-right">P. Costo</div>, size: 100, minSize: 85, cell: ({ row }) => <div className="truncate text-right text-muted-foreground">{formatCurrency(row.original.precio_costo)}</div> },
    { accessorKey: 'precio_venta', header: () => <div className="text-right">P. Venta</div>, size: 100, minSize: 85, cell: ({ row }) => <div className="truncate text-right text-muted-foreground">{formatCurrency(row.original.precio_venta)}</div> },
    {
      id: 'precio_lista',
      header: 'Precio lista',
      size: 150,
      minSize: 130,
      cell: ({ row }) => (
        <Input
          type="number" step="0.01" className="w-full"
          aria-label={`Precio de ${row.original.nombre}`}
          placeholder={formatCurrency(row.original.precio_venta)}
          value={precios[row.original.id] ?? ''}
          onChange={(e) => setPrecios((p) => ({ ...p, [row.original.id]: e.target.value }))}
        />
      ),
    },
    {
      id: 'margen',
      header: () => <div className="text-right">Margen</div>,
      size: 90,
      minSize: 75,
      cell: ({ row }) => {
        const precio = Number(precios[row.original.id]) || row.original.precio_venta
        const label = margenPct(precio, row.original.precio_costo)
        const cls = label === '—' ? 'text-muted-foreground' : precio >= row.original.precio_costo ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
        return <div className={`truncate text-right text-sm ${cls}`}>{label}</div>
      },
    },
    ...(conQuiebres ? [{
      id: 'quiebres',
      header: 'Quiebres',
      size: 110,
      minSize: 100,
      cell: ({ row }: { row: { original: ItemListaPrecio } }) => (
        <Button size="sm" variant="outline" onClick={() => abrirQuiebres(row.original)}>Quiebres</Button>
      ),
    }] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [precios, conQuiebres])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPantalla icono={Tag}>{lista ? lista.nombre : 'Lista de precios'}
          {lista && !lista.activa && <BadgeEstado tono="neutro">Inactiva</BadgeEstado>}</TituloPantalla>
        {lista && (
          <div className="flex flex-wrap gap-2">
            <Sheet open={loteOpen} onOpenChange={setLoteOpen}>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline" onClick={abrirLote}><Percent />Actualizar en lote</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2"><Percent className="size-4" />Actualizar precios en lote</SheetTitle>
                </SheetHeader>
                <div className="grid gap-4 px-4">
                  <div className="grid gap-2">
                    <Label>Base de cálculo</Label>
                    <Select value={loteBase} onValueChange={(v) => setLoteBase(v as typeof loteBase)}>
                      <SelectTrigger aria-label="Base de cálculo"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lista">Precios actuales de esta lista</SelectItem>
                        <SelectItem value="venta">Precio de venta de cada producto</SelectItem>
                        <SelectItem value="costo">Precio de costo de cada producto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Porcentaje de ajuste</Label>
                    <Input
                      type="number" step="0.1" value={lotePorcentaje}
                      onChange={(e) => setLotePorcentaje(e.target.value)}
                      placeholder="Ej: 10 para +10%, -5 para -5%"
                      aria-label="Porcentaje de ajuste"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Aplicar a</Label>
                    <Select value={loteCategoria || '__todas__'} onValueChange={(v) => setLoteCategoria(v === '__todas__' ? '' : v)}>
                      <SelectTrigger aria-label="Aplicar a"><SelectValue placeholder="Todos los productos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__todas__">Todos los productos</SelectItem>
                        {categorias.map((c) => <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Esta acción reemplaza los precios calculados. Los precios que no estén en la lista se van a insertar.
                  </p>
                </div>
                <SheetFooter className="flex-row justify-end gap-2">
                  <SheetClose asChild><Button variant="outline">Cancelar</Button></SheetClose>
                  <Button onClick={aplicarLote} disabled={loteSaving}>{loteSaving ? 'Aplicando…' : 'Aplicar'}</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Sheet open={importOpen} onOpenChange={setImportOpen}>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline" onClick={abrirImportar}><Download />Importar precios</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2"><Download className="size-4" />Importar precios</SheetTitle>
                </SheetHeader>
                <div className="grid gap-4 px-4">
                  <p className="text-sm text-muted-foreground">
                    Reemplaza los precios existentes en esta lista con los precios de la fuente seleccionada.
                  </p>
                  <div className="grid gap-2">
                    <Label>Importar desde</Label>
                    <Select value={importFuente} onValueChange={(v) => setImportFuente(v as typeof importFuente)}>
                      <SelectTrigger aria-label="Importar desde"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="venta">Precio de venta de cada producto</SelectItem>
                        <SelectItem value="costo">Precio de costo de cada producto</SelectItem>
                        <SelectItem value="lista">Desde otra lista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {importFuente === 'lista' && (
                    <div className="grid gap-2">
                      <Label>Lista de origen</Label>
                      <Select value={importFuenteListaId} onValueChange={setImportFuenteListaId}>
                        <SelectTrigger aria-label="Lista de origen"><SelectValue placeholder="Elegir lista…" /></SelectTrigger>
                        <SelectContent>
                          {otrasListas.filter((l) => l.id !== listaId).map((l) => (
                            <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <SheetFooter className="flex-row justify-end gap-2">
                  <SheetClose asChild><Button variant="outline">Cancelar</Button></SheetClose>
                  <Button onClick={aplicarImportar} disabled={importSaving}>{importSaving ? 'Importando…' : 'Importar'}</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Settings />Configurar</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Settings className="size-4" />Configurar lista</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label>Nombre</Label>
                    <Input value={configNombre} onChange={(e) => setConfigNombre(e.target.value)} aria-label="Nombre" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Descripción</Label>
                    <Input value={configDescripcion} onChange={(e) => setConfigDescripcion(e.target.value)} aria-label="Descripción" />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={configActiva} onChange={(e) => setConfigActiva(e.target.checked)} />
                    Lista activa (disponible en ventas)
                  </label>
                </div>
                <DialogFooter className="sm:justify-between">
                  <Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={configSaving} onClick={() => setConfirmDeleteLista(true)}>
                    <Trash2 />Eliminar lista
                  </Button>
                  <div className="flex gap-2">
                    <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                    <Button disabled={configSaving} onClick={guardarConfig}><Check />{configSaving ? 'Guardando…' : 'Guardar cambios'}</Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button asChild size="sm" variant="outline"><Link to={rutaDeListas}><ArrowLeft />Volver</Link></Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading || !lista ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {lista.descripcion && <p className="text-sm text-muted-foreground">{lista.descripcion}</p>}

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Precios</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={categoriaFiltro || '__todas__'} onValueChange={(v) => aplicarFiltroCategoria(v === '__todas__' ? '' : v)}>
                  <SelectTrigger className="w-48" aria-label="Filtrar por categoría"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas__">Todas las categorías</SelectItem>
                    {categorias.map((c) => <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">{items.length} producto{items.length !== 1 ? 's' : ''}</span>
                <Button onClick={guardarPrecios} disabled={savingItems}>
                  <Check />{savingItems ? 'Guardando…' : 'Guardar precios'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {itemsLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
              ) : (
                <DataTable columns={itemColumns} data={items} emptyMessage="No hay productos activos." />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirmDeleteLista}
        onOpenChange={setConfirmDeleteLista}
        title="¿Eliminar esta lista y todos sus precios?"
        onConfirm={() => {
          setConfirmDeleteLista(false)
          eliminarLista()
        }}
      />

      <Dialog open={quiebresProducto !== null} onOpenChange={(o) => { if (!o) setQuiebresProducto(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="size-4" />Quiebres por cantidad</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Precios por cantidad para <strong>{quiebresProducto?.nombre}</strong>. El precio base de la lista
              rige hasta el primer quiebre; de ahí en más, el precio del quiebre alcanzado.
            </p>
            {quiebresError && <p className="text-sm text-destructive">{quiebresError}</p>}
            <div className="grid gap-2">
              {quiebres.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin quiebres: el producto usa el precio base para toda cantidad.</p>
              )}
              {quiebres.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Desde</span>
                  <Input type="number" step="1" min="2" className="w-24" placeholder="Cant." aria-label={`Cantidad mínima ${i + 1}`} value={q.min_quantity}
                    onChange={(e) => actualizarQuiebre(i, 'min_quantity', e.target.value)} />
                  <span className="text-sm text-muted-foreground">u. →</span>
                  <Input type="number" step="0.01" className="w-32" placeholder="Precio" aria-label={`Precio del quiebre ${i + 1}`} value={q.amount}
                    onChange={(e) => actualizarQuiebre(i, 'amount', e.target.value)} />
                  <Button size="icon" variant="ghost" aria-label="Quitar quiebre" onClick={() => quitarQuiebre(i)}><Trash2 /></Button>
                </div>
              ))}
              <div><Button size="sm" variant="outline" onClick={agregarQuiebre}>+ Agregar quiebre</Button></div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button disabled={quiebresSaving} onClick={guardarQuiebres}>{quiebresSaving ? 'Guardando…' : 'Guardar quiebres'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

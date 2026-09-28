// Las promociones: "llevá N pagá M" (2x1, 3x2) y combos fijos (roadmap de producto,
// 2026-09-28). Listado, alta y edición en un diálogo, activar / desactivar y borrar
// con confirmación. El ahorro lo calcula el motor al registrar la venta
// (`OpcionesVentas.promociones`); esta pantalla sólo carga las reglas.
import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '../data-table'
import { Ban, Pencil, Percent, Plus, Trash2, Undo2 } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { DataTable, sortableHeader } from '../data-table'
import { BadgeEstado } from '../badge-estado'
import { SelectBuscable } from '../SelectBuscable'
import { TituloPantalla } from '../titulo-pantalla'
import { opcionesProducto, type Producto, type Promocion } from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

/** «2x1», «3x2» o el combo con su precio: lo que el cajero reconoce de un vistazo. */
function describirRegla(p: Promocion): string {
  if (p.tipo === 'nxm') {
    const it = p.items[0]
    return `Llevá ${it?.cantidad} pagá ${p.paga}${it?.nombre ? ` · ${it.nombre}` : ''}`
  }
  const partes = p.items.map((i) => (i.cantidad === 1 ? i.nombre : `${i.cantidad} × ${i.nombre}`))
  return `${partes.join(' + ')} = ${formatCurrency(p.precio ?? 0)}`
}

function describirVigencia(p: Promocion): string {
  if (!p.desde && !p.hasta) return 'Siempre'
  if (p.desde && p.hasta) return `${formatFechaHora(p.desde)} → ${formatFechaHora(p.hasta)}`
  return p.desde ? `Desde ${formatFechaHora(p.desde)}` : `Hasta ${formatFechaHora(p.hasta!)}`
}

type FilaItem = { producto_id: string; cantidad: string }
type Form = {
  nombre: string
  tipo: 'nxm' | 'combo'
  items: FilaItem[]
  paga: string
  precio: string
  desde: string
  hasta: string
  activa: boolean
}

const FORM_VACIO: Form = {
  nombre: '', tipo: 'nxm', items: [{ producto_id: '', cantidad: '2' }], paga: '1', precio: '',
  desde: '', hasta: '', activa: true,
}

/** El `datetime-local` no entiende los segundos: se recortan al cargar la edición. */
const alInput = (iso: string | null) => (iso ? iso.slice(0, 16) : '')

function formDe(p: Promocion): Form {
  return {
    nombre: p.nombre, tipo: p.tipo,
    items: p.items.map((i) => ({ producto_id: String(i.producto_id), cantidad: String(i.cantidad) })),
    paga: p.paga != null ? String(p.paga) : '1', precio: p.precio != null ? String(p.precio) : '',
    desde: alInput(p.desde), hasta: alInput(p.hasta), activa: !!p.activa,
  }
}

function payloadDe(f: Form) {
  return {
    nombre: f.nombre.trim(), tipo: f.tipo,
    items: f.items.map((i) => ({ producto_id: Number(i.producto_id), cantidad: Number(i.cantidad) })),
    paga: f.tipo === 'nxm' ? Number(f.paga) : null,
    precio: f.tipo === 'combo' ? Number(f.precio) : null,
    desde: f.desde, hasta: f.hasta, activa: f.activa,
  }
}

export function Promociones() {
  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Promocion | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    cargar()
    api.get<Producto[]>('/api/productos').then((p) => setProductos(p.filter((x) => x.activo))).catch(() => {})
  }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      setPromociones(await api.get<Promocion[]>('/api/promociones'))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function toggleActiva(p: Promocion) {
    setError(null)
    try {
      await api.put(`/api/promociones/${p.id}`, payloadDe({ ...formDe(p), activa: !p.activa }))
      await cargar()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function eliminar(p: Promocion) {
    setError(null)
    try {
      await api.del(`/api/promociones/${p.id}`)
      await cargar()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function abrirNueva() {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setFormError(null)
    setDialogOpen(true)
  }

  function abrirEdicion(p: Promocion) {
    setEditandoId(p.id)
    setForm(formDe(p))
    setFormError(null)
    setDialogOpen(true)
  }

  function cambiarTipo(tipo: 'nxm' | 'combo') {
    setForm((f) => ({
      ...f, tipo,
      items: tipo === 'nxm'
        ? [{ producto_id: f.items[0]?.producto_id ?? '', cantidad: '2' }]
        : [
          { producto_id: f.items[0]?.producto_id ?? '', cantidad: '1' },
          { producto_id: '', cantidad: '1' },
        ],
    }))
  }

  function cambiarItem(idx: number, cambio: Partial<FilaItem>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...cambio } : it)) }))
  }

  async function guardar() {
    setFormError(null)
    if (!form.nombre.trim()) return setFormError('El nombre es obligatorio.')
    if (form.items.some((i) => !i.producto_id)) return setFormError('Elegí el producto de cada fila.')
    setGuardando(true)
    try {
      const body = payloadDe(form)
      if (editandoId === null) await api.post('/api/promociones', body)
      else await api.put(`/api/promociones/${editandoId}`, body)
      setDialogOpen(false)
      await cargar()
    } catch (err) {
      setFormError(describeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const opciones = useMemo(() => opcionesProducto(productos), [productos])

  const columns = useMemo<ColumnDef<Promocion>[]>(() => [
    { accessorKey: 'nombre', header: sortableHeader('Nombre'), cell: ({ row }) => (
      <span className="font-medium">{row.original.nombre}</span>
    ) },
    { id: 'regla', header: 'Promoción', cell: ({ row }) => describirRegla(row.original) },
    { id: 'vigencia', header: 'Vigencia', cell: ({ row }) => describirVigencia(row.original) },
    {
      accessorKey: 'activa',
      header: 'Estado',
      cell: ({ row }) => (
        <BadgeEstado tono={row.original.activa ? 'ok' : 'neutro'}>
          {row.original.activa ? 'Activa' : 'Inactiva'}
        </BadgeEstado>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            size="icon" variant="outline" title="Editar promoción"
            aria-label={`Editar ${row.original.nombre}`} onClick={() => abrirEdicion(row.original)}
          ><Pencil /></Button>
          <Button
            size="icon" variant="outline"
            title={row.original.activa ? 'Desactivar promoción' : 'Activar promoción'}
            aria-label={row.original.activa ? 'Desactivar promoción' : 'Activar promoción'}
            onClick={() => toggleActiva(row.original)}
          >{row.original.activa ? <Ban /> : <Undo2 />}</Button>
          <Button
            size="icon" variant="outline" title="Eliminar promoción"
            aria-label={`Eliminar ${row.original.nombre}`} onClick={() => setConfirmDelete(row.original)}
          ><Trash2 /></Button>
        </div>
      ),
    },
  ], [])

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={Percent}>Promociones</TituloPantalla>
        <Button onClick={abrirNueva}><Plus />Nueva promoción</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <DataTable
              columns={columns}
              data={promociones}
              emptyMessage={
                <div className="flex flex-col items-center gap-3 py-4">
                  <Percent className="size-10 text-muted-foreground/40" />
                  <span>No hay promociones cargadas aún.</span>
                  <Button size="sm" onClick={abrirNueva}><Plus />Crear la primera</Button>
                </div>
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="size-4" />{editandoId === null ? 'Nueva promoción' : 'Editar promoción'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="grid gap-2">
              <Label htmlFor="promo-nombre">Nombre</Label>
              <Input
                id="promo-nombre" value={form.nombre} autoFocus
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: 2x1 en alfajores, Combo hamburguesa + papas…"
              />
            </div>

            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => cambiarTipo(v as 'nxm' | 'combo')}>
                <SelectTrigger aria-label="Tipo de promoción"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nxm">Llevá N pagá M (2x1, 3x2…)</SelectItem>
                  <SelectItem value="combo">Combo: varios productos a un precio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.tipo === 'nxm' ? (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Producto</Label>
                  <SelectBuscable
                    value={form.items[0]?.producto_id ?? ''} opciones={opciones}
                    onChange={(v) => cambiarItem(0, { producto_id: v })}
                    placeholder="Elegir producto…" ariaLabel="Producto de la promoción"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="promo-lleva">Llevás</Label>
                    <Input
                      id="promo-lleva" type="number" min="2" step="1" inputMode="numeric"
                      value={form.items[0]?.cantidad ?? ''}
                      onChange={(e) => cambiarItem(0, { cantidad: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="promo-paga">Pagás</Label>
                    <Input
                      id="promo-paga" type="number" min="1" step="1" inputMode="numeric"
                      value={form.paga} onChange={(e) => setForm({ ...form, paga: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <Label>Productos del combo</Label>
                {form.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <SelectBuscable
                        value={it.producto_id} opciones={opciones}
                        onChange={(v) => cambiarItem(idx, { producto_id: v })}
                        placeholder="Elegir producto…" ariaLabel={`Producto ${idx + 1} del combo`}
                      />
                    </div>
                    <Input
                      className="w-20" type="number" min="1" step="1" inputMode="numeric"
                      aria-label={`Cantidad del producto ${idx + 1}`} value={it.cantidad}
                      onChange={(e) => cambiarItem(idx, { cantidad: e.target.value })}
                    />
                    {form.items.length > 2 && (
                      <Button
                        type="button" size="icon" variant="ghost" aria-label={`Quitar producto ${idx + 1}`}
                        onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                      ><Trash2 /></Button>
                    )}
                  </div>
                ))}
                <div>
                  <Button
                    type="button" size="sm" variant="outline"
                    onClick={() => setForm((f) => ({ ...f, items: [...f.items, { producto_id: '', cantidad: '1' }] }))}
                  ><Plus />Agregar producto</Button>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="promo-precio">Precio del combo</Label>
                  <Input
                    id="promo-precio" type="number" min="0" step="0.01" inputMode="decimal"
                    value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2 border-t pt-4">
              <Label>Vigencia <span className="font-normal text-muted-foreground">(opcional: sin fechas rige siempre)</span></Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="promo-desde" className="font-normal">Desde</Label>
                  <Input
                    id="promo-desde" type="datetime-local" value={form.desde}
                    onChange={(e) => setForm({ ...form, desde: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="promo-hasta" className="font-normal">Hasta</Label>
                  <Input
                    id="promo-hasta" type="datetime-local" value={form.hasta}
                    onChange={(e) => setForm({ ...form, hasta: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="promo-activa" checked={form.activa}
                onCheckedChange={(v) => setForm({ ...form, activa: v })}
              />
              <Label htmlFor="promo-activa" className="font-normal">Activa</Label>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" disabled={guardando} onClick={guardar}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="¿Eliminar esta promoción?"
        onConfirm={() => {
          if (confirmDelete) eliminar(confirmDelete)
          setConfirmDelete(null)
        }}
      />
    </div>
  )
}

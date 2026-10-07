// El detalle de una sucursal del modelo jerárquico (0.84.0): sus depósitos, con alta, edición, «Depósito de venta» y
// borrado con confirmación. El stock vive sólo en los depósitos; toda sucursal tiene al menos uno y uno es su depósito
// de venta (el predeterminado de la sucursal). Las reglas (no bajar ni borrar el último activo, no borrar uno con
// movimientos ni el default de la instancia) las impone el backend: acá sólo se muestra su mensaje.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, Check, Eye, MapPin, Package, Pencil, Plus, Star, Trash2 } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'
import type { Deposito, Sucursal } from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'

export type SucursalDetalleProps = {
  /** A dónde lleva «Ver stock» de cada depósito. */
  rutaDelDeposito?: (id: number) => string
  /** A dónde lleva «Volver». */
  rutaDeSucursales?: string
  /** A dónde lleva «Transferir stock». */
  rutaDeTransferencia?: string
  /** Un usuario que sólo mira: sin alta, edición, «Depósito de venta» ni borrar (el backend igual los rechaza). */
  soloLectura?: boolean
}

export function SucursalDetalle({
  rutaDelDeposito = (id) => `/depositos/${id}`,
  rutaDeSucursales = '/sucursales',
  rutaDeTransferencia = '/depositos/transferencia',
  soloLectura = false,
}: SucursalDetalleProps) {
  const { id } = useParams<{ id: string }>()
  const sucursalId = Number(id)

  const [sucursal, setSucursal] = useState<Sucursal | null>(null)
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [loading, setLoading] = useState(true)
  const [noExiste, setNoExiste] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [activo, setActivo] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<Deposito | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function load() {
    setLoading(true)
    setError(null)
    setNoExiste(false)
    if (!Number.isInteger(sucursalId)) {
      setNoExiste(true)
      setLoading(false)
      return
    }
    try {
      const [s, todos] = await Promise.all([
        api.get<Sucursal>(`/api/sucursales/${sucursalId}`),
        api.get<Deposito[]>('/api/depositos'),
      ])
      setSucursal(s)
      setDepositos(todos.filter((d) => d.branch_id === sucursalId))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNoExiste(true)
      else setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function ponerDeVenta(d: Deposito) {
    setError(null)
    try {
      await api.post(`/api/sucursales/${sucursalId}/deposito-predeterminado`, { deposito_id: d.id })
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function eliminarReal(d: Deposito) {
    setError(null)
    try {
      await api.del(`/api/depositos/${d.id}`)
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function abrirNuevo() {
    setEditingId(null)
    setNombre('')
    setDescripcion('')
    setActivo(true)
    setFormError(null)
  }

  function abrirEditar(d: Deposito) {
    setEditingId(d.id)
    setNombre(d.nombre)
    setDescripcion(d.descripcion ?? '')
    setActivo(!!d.activo)
    setFormError(null)
  }

  async function guardar() {
    if (!nombre.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      if (editingId !== null) {
        await api.put<Deposito>(`/api/depositos/${editingId}`, { nombre, descripcion, activo })
      } else {
        await api.post<Deposito>('/api/depositos', { nombre, descripcion, branch_id: sucursalId })
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setFormError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  const volver = (
    <Button asChild size="sm" variant="outline"><Link to={rutaDeSucursales}><ArrowLeft />Volver</Link></Button>
  )

  if (noExiste) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TituloPantalla icono={ICONOS.sucursales}>Sucursal</TituloPantalla>
          {volver}
        </div>
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Sucursal no encontrada.</CardContent></Card>
      </div>
    )
  }

  return (
    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TituloPantalla icono={ICONOS.sucursales}>{sucursal ? sucursal.nombre : 'Sucursal'}</TituloPantalla>
          <div className="flex flex-wrap gap-2">
            {sucursal && <Button asChild size="sm" variant="outline"><Link to={rutaDeTransferencia}><ArrowLeftRight />Transferir stock</Link></Button>}
            {sucursal && !soloLectura && (
              <DialogTrigger asChild>
                <Button size="sm" onClick={abrirNuevo}><Plus />Nuevo depósito</Button>
              </DialogTrigger>
            )}
            {volver}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading || !sucursal ? (
          !error && <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {sucursal.es_default ? <BadgeEstado tono="ok">Por defecto</BadgeEstado> : null}
              {!sucursal.activa && <BadgeEstado tono="neutro">Inactiva</BadgeEstado>}
              <BadgeEstado tono="curso">{sucursal.depositos} depósito{sucursal.depositos !== 1 ? 's' : ''}</BadgeEstado>
              {sucursal.codigo && <span className="text-sm text-muted-foreground">Código: {sucursal.codigo}</span>}
              {sucursal.direccion && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" />{sucursal.direccion}</span>
              )}
            </div>

            {depositos.length === 0 ? (
              <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Esta sucursal no tiene depósitos.</CardContent></Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {depositos.map((d) => {
                  const deVenta = d.id === sucursal.deposito_predeterminado_id
                  const total = d.total_productos ?? 0
                  return (
                    <Card key={d.id} className={d.activo ? '' : 'opacity-50'}>
                      <CardContent className="grid gap-3">
                        <div>
                          <p className="flex items-center gap-2 font-semibold"><ICONOS.depositos className="size-4 text-primary" />{d.nombre}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {deVenta && <BadgeEstado tono="ok">Depósito de venta</BadgeEstado>}
                            {d.es_default ? <BadgeEstado tono="ok">Por defecto</BadgeEstado> : null}
                            {!d.activo && <BadgeEstado tono="neutro">Inactivo</BadgeEstado>}
                          </div>
                        </div>
                        {d.descripcion && <p className="text-sm text-muted-foreground">{d.descripcion}</p>}
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Package className="size-4" />{total} producto{total !== 1 ? 's' : ''} con stock
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline"><Link to={rutaDelDeposito(d.id)}><Eye />Ver stock</Link></Button>
                          {!soloLectura && (
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" onClick={() => abrirEditar(d)}><Pencil />Editar</Button>
                            </DialogTrigger>
                          )}
                          {!soloLectura && !deVenta && !!d.activo && (
                            <Button size="sm" variant="outline" title="Usar como depósito de venta de la sucursal" onClick={() => ponerDeVenta(d)}><Star />Depósito de venta</Button>
                          )}
                          {!soloLectura && !deVenta && !d.es_default && (
                            <Button size="sm" variant="outline" title="Eliminar depósito" aria-label="Eliminar depósito" onClick={() => setConfirmDelete(d)}><Trash2 /></Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ICONOS.depositos className="size-4" />{editingId !== null ? 'Editar' : 'Nuevo'} depósito</DialogTitle>
        </DialogHeader>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="deposito-nombre">Nombre <span className="text-destructive">*</span></Label>
            <Input id="deposito-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deposito-descripcion">Descripción</Label>
            <Textarea
              id="deposito-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2}
              placeholder="Ej: Almacén norte, Depósito de materias primas…"
            />
          </div>
          {editingId !== null && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={activo} onCheckedChange={setActivo} />Activo
            </label>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
          <Button disabled={saving || !nombre.trim()} onClick={guardar}>
            <Check />{saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`¿Eliminar el depósito «${confirmDelete?.nombre}»?`}
        onConfirm={() => {
          if (confirmDelete) eliminarReal(confirmDelete)
          setConfirmDelete(null)
        }}
      />
    </Dialog>
  )
}

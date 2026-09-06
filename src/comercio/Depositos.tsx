// Los depósitos: tarjetas con alta y edición en un Dialog, predeterminar y
// borrar con confirmación (P9-M1, 2026-09-06). Era idéntico en Contalibra y
// Restolibra salvo 9 líneas de comentarios.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Building2, Check, Eye, Package, Pencil, Plus, Star, Trash2, Warehouse } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import type { Deposito } from './tipos'
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

export type DepositosProps = {
  /** A dónde lleva «Ver stock» de cada depósito. */
  rutaDelDetalle?: (id: number) => string
  /** A dónde lleva «Transferir stock». */
  rutaDeTransferencia?: string
}

export function Depositos({
  rutaDelDetalle = (id) => `/depositos/${id}`,
  rutaDeTransferencia = '/depositos/transferencia',
}: DepositosProps) {
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [loading, setLoading] = useState(true)
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
  }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setDepositos(await api.get<Deposito[]>('/api/depositos'))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function setDefault(d: Deposito) {
    setError(null)
    try {
      await api.post(`/api/depositos/${d.id}/set-default`)
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
        await api.post<Deposito>('/api/depositos', { nombre, descripcion })
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setFormError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TituloPantalla icono={Warehouse}>Depósitos</TituloPantalla>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline"><Link to={rutaDeTransferencia}><ArrowLeftRight />Transferir stock</Link></Button>
            <DialogTrigger asChild>
              <Button onClick={abrirNuevo}><Plus />Nuevo depósito</Button>
            </DialogTrigger>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : depositos.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No hay depósitos creados.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {depositos.map((d) => (
              <Card key={d.id} className={d.activo ? '' : 'opacity-50'}>
                <CardContent className="grid gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold"><Building2 className="size-4 text-primary" />{d.nombre}</p>
                    <div className="mt-1 flex gap-1.5">
                      {d.es_default ? <BadgeEstado tono="ok">Por defecto</BadgeEstado> : null}
                      {!d.activo && <BadgeEstado tono="neutro">Inactivo</BadgeEstado>}
                    </div>
                  </div>
                  {d.descripcion && <p className="text-sm text-muted-foreground">{d.descripcion}</p>}
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="size-4" />{d.total_productos} producto{d.total_productos !== 1 ? 's' : ''} con stock
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline"><Link to={rutaDelDetalle(d.id)}><Eye />Ver stock</Link></Button>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => abrirEditar(d)}><Pencil />Editar</Button>
                    </DialogTrigger>
                    {!d.es_default && (
                      <>
                        <Button size="sm" variant="outline" title="Usar como depósito por defecto" onClick={() => setDefault(d)}><Star />Predeterminar</Button>
                        <Button size="sm" variant="outline" title="Eliminar depósito" aria-label="Eliminar depósito" onClick={() => setConfirmDelete(d)}><Trash2 /></Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="size-4" />{editingId !== null ? 'Editar depósito' : 'Nuevo depósito'}</DialogTitle>
        </DialogHeader>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus aria-label="Nombre" />
          </div>
          <div className="grid gap-2">
            <Label>Descripción</Label>
            <Textarea
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2}
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

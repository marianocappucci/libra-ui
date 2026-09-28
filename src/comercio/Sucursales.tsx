// Las sucursales del modelo jerárquico sucursal → depósitos (0.84.0): tarjetas con alta y edición en un Dialog y
// predeterminar. Una sucursal nace con su primer depósito y NO se elimina, sólo se da de baja (el backend impide
// bajar la última, la predeterminada, una con turno abierto o una con existencias). El stock vive en los depósitos:
// «Ver depósitos» lleva al detalle. `Depositos` sigue siendo la pantalla plana de Contalibra.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Check, Eye, MapPin, Pencil, Plus, Star, Store } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import type { Sucursal } from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

export type SucursalesProps = {
  /** A dónde lleva «Ver depósitos» de cada sucursal. */
  rutaDelDetalle?: (id: number) => string
  /** A dónde lleva «Transferir stock». */
  rutaDeTransferencia?: string
  /** Un usuario que sólo mira: sin alta, edición ni predeterminar (el backend igual los rechaza). */
  soloLectura?: boolean
  /** El título de la pantalla. */
  titulo?: string
  /** El texto del botón de alta. */
  etiquetaNuevo?: string
}

export function Sucursales({
  rutaDelDetalle = (id) => `/sucursales/${id}`,
  rutaDeTransferencia = '/depositos/transferencia',
  soloLectura = false,
  titulo = 'Sucursales',
  etiquetaNuevo = 'Nueva sucursal',
}: SucursalesProps) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [direccion, setDireccion] = useState('')
  const [deposito, setDeposito] = useState('')
  const [activa, setActiva] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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
      // `solo_activas=false`: sin él no llegarían las dadas de baja y no habría cómo reactivarlas.
      setSucursales(await api.get<Sucursal[]>('/api/sucursales?solo_activas=false'))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function setDefault(s: Sucursal) {
    setError(null)
    try {
      await api.post(`/api/sucursales/${s.id}/set-default`)
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function abrirNueva() {
    setEditingId(null)
    setNombre('')
    setCodigo('')
    setDireccion('')
    setDeposito('')
    setActiva(true)
    setFormError(null)
  }

  function abrirEditar(s: Sucursal) {
    setEditingId(s.id)
    setNombre(s.nombre)
    setCodigo(s.codigo ?? '')
    setDireccion(s.direccion ?? '')
    setActiva(!!s.activa)
    setFormError(null)
  }

  async function guardar() {
    if (!nombre.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      if (editingId !== null) {
        // El backend sobreescribe `codigo` y `direccion` con lo que llegue: se mandan siempre, no sólo nombre y activa.
        await api.put<Sucursal>(`/api/sucursales/${editingId}`, {
          nombre: nombre.trim(), codigo: codigo.trim(), direccion: direccion.trim(), activa,
        })
      } else {
        await api.post<Sucursal>('/api/sucursales', {
          nombre: nombre.trim(), codigo: codigo.trim(), direccion: direccion.trim(), deposito: deposito.trim(),
        })
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
          <TituloPantalla icono={Store}>{titulo}</TituloPantalla>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline"><Link to={rutaDeTransferencia}><ArrowLeftRight />Transferir stock</Link></Button>
            {!soloLectura && (
              <DialogTrigger asChild>
                <Button onClick={abrirNueva}><Plus />{etiquetaNuevo}</Button>
              </DialogTrigger>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : sucursales.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No hay sucursales creadas.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sucursales.map((s) => (
              <Card key={s.id} className={s.activa ? '' : 'opacity-50'}>
                <CardContent className="grid gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold"><Store className="size-4 text-primary" />{s.nombre}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {s.es_default ? <BadgeEstado tono="ok">Por defecto</BadgeEstado> : null}
                      {!s.activa && <BadgeEstado tono="neutro">Inactiva</BadgeEstado>}
                      <BadgeEstado tono="curso">{s.depositos} depósito{s.depositos !== 1 ? 's' : ''}</BadgeEstado>
                    </div>
                  </div>
                  {s.direccion && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4" />{s.direccion}</p>
                  )}
                  {s.codigo && <p className="text-sm text-muted-foreground">Código: {s.codigo}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline"><Link to={rutaDelDetalle(s.id)}><Eye />Ver depósitos</Link></Button>
                    {!soloLectura && (
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => abrirEditar(s)}><Pencil />Editar</Button>
                      </DialogTrigger>
                    )}
                    {!soloLectura && !s.es_default && !!s.activa && (
                      <Button size="sm" variant="outline" title="Usar como sucursal por defecto" onClick={() => setDefault(s)}><Star />Predeterminar</Button>
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
          <DialogTitle className="flex items-center gap-2"><Store className="size-4" />{editingId !== null ? 'Editar' : 'Nueva'} sucursal</DialogTitle>
        </DialogHeader>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sucursal-nombre">Nombre <span className="text-destructive">*</span></Label>
            <Input id="sucursal-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sucursal-codigo">Código</Label>
            <Input id="sucursal-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sucursal-direccion">Dirección</Label>
            <Input id="sucursal-direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
          {editingId === null && (
            <div className="grid gap-2">
              <Label htmlFor="sucursal-deposito">Nombre del primer depósito</Label>
              <Input
                id="sucursal-deposito" value={deposito} onChange={(e) => setDeposito(e.target.value)}
                placeholder="Si queda vacío se llama «Depósito <nombre>»"
              />
            </div>
          )}
          {editingId !== null && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={activa} onCheckedChange={setActiva} />Activa
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
    </Dialog>
  )
}

// Los depósitos: tarjetas con alta y edición en un Dialog, predeterminar y
// borrar con confirmación (P9-M1, 2026-09-06). Era idéntico en Contalibra y
// Restolibra salvo 9 líneas de comentarios.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Check, Eye, Package, Pencil, Plus, Star, Trash2 } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'
import type { Deposito } from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'

/** Un tipo de ubicación de un producto con sucursales y depósitos: `valor` es el código que guarda el backend y
 *  `etiqueta` lo que se ve (VentaLibra: `store` → «Sucursal», `warehouse` → «Depósito») y `plural` cómo se cuenta en el
 *  filtro («Sucursales»; sin él, la etiqueta más una «s»). */
export type TipoDeDeposito = { valor: string; etiqueta: string; plural?: string }

export type DepositosProps = {
  /** A dónde lleva «Ver stock» de cada depósito. */
  rutaDelDetalle?: (id: number) => string
  /** A dónde lleva «Transferir stock». */
  rutaDeTransferencia?: string
  /** Los tipos de ubicación del producto. Con ellos el alta pide el tipo (que después no se cambia), cada tarjeta
   *  lo muestra y la lista se filtra por tipo. Sin ellos, la pantalla es la de Contalibra y Restolibra. */
  tipos?: TipoDeDeposito[]
  /** Un usuario que sólo mira: sin alta, edición, predeterminar ni borrar (el backend igual los rechaza). */
  soloLectura?: boolean
  /** El título de la pantalla («Sucursales / depósitos»). */
  titulo?: string
  /** El texto del botón de alta («Nueva sucursal / depósito»). */
  etiquetaNuevo?: string
}

export function Depositos({
  rutaDelDetalle = (id) => `/depositos/${id}`,
  rutaDeTransferencia = '/depositos/transferencia',
  tipos,
  soloLectura = false,
  titulo = 'Depósitos',
  etiquetaNuevo = 'Nuevo depósito',
}: DepositosProps) {
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [activo, setActivo] = useState(true)
  const [tipo, setTipo] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
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

  const etiquetaDeTipo = (valor?: string | null) => tipos?.find((t) => t.valor === valor)?.etiqueta ?? valor ?? ''
  // Un tipo que el producto no declara (dato viejo) se cuenta con el último tipo, que es donde la pantalla lo lista.
  const tipoDe = (d: Deposito) => (tipos?.some((t) => t.valor === d.tipo) ? d.tipo! : tipos?.[tipos.length - 1]?.valor)
  const visibles = tipoFiltro ? depositos.filter((d) => tipoDe(d) === tipoFiltro) : depositos

  function abrirNuevo() {
    setEditingId(null)
    setNombre('')
    setDescripcion('')
    setActivo(true)
    setTipo(tipoFiltro || tipos?.[0]?.valor || '')
    setFormError(null)
  }

  function abrirEditar(d: Deposito) {
    setEditingId(d.id)
    setTipo(tipoDe(d) ?? '')
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
        await api.post<Deposito>('/api/depositos', tipos ? { nombre, descripcion, tipo } : { nombre, descripcion })
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
          <TituloPantalla icono={ICONOS.depositos}>{titulo}</TituloPantalla>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline"><Link to={rutaDeTransferencia}><ArrowLeftRight />Transferir stock</Link></Button>
            {!soloLectura && (
              <DialogTrigger asChild>
                <Button onClick={abrirNuevo}><Plus />{etiquetaNuevo}</Button>
              </DialogTrigger>
            )}
          </div>
        </div>

        {tipos && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
            <Button size="sm" variant={tipoFiltro === '' ? 'default' : 'outline'} aria-pressed={tipoFiltro === ''}
                    onClick={() => setTipoFiltro('')}>Todos ({depositos.length})</Button>
            {tipos.map((t) => (
              <Button key={t.valor} size="sm" variant={tipoFiltro === t.valor ? 'default' : 'outline'}
                      aria-pressed={tipoFiltro === t.valor} onClick={() => setTipoFiltro(t.valor)}>
                {t.plural ?? `${t.etiqueta}s`} ({depositos.filter((d) => tipoDe(d) === t.valor).length})
              </Button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : visibles.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No hay depósitos creados.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((d) => (
              <Card key={d.id} className={d.activo ? '' : 'opacity-50'}>
                <CardContent className="grid gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold"><ICONOS.depositos className="size-4 text-primary" />{d.nombre}</p>
                    <div className="mt-1 flex gap-1.5">
                      {tipos && <BadgeEstado tono="curso">{etiquetaDeTipo(tipoDe(d))}</BadgeEstado>}
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
                    {!soloLectura && (
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => abrirEditar(d)}><Pencil />Editar</Button>
                      </DialogTrigger>
                    )}
                    {!soloLectura && !d.es_default && (
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
          <DialogTitle className="flex items-center gap-2"><ICONOS.depositos className="size-4" />{editingId !== null ? 'Editar' : 'Nuevo'} {tipos ? (etiquetaDeTipo(tipo) || 'depósito').toLowerCase() : 'depósito'}</DialogTitle>
        </DialogHeader>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <div className="grid gap-4">
          {tipos && (
            <div className="grid gap-2">
              <Label htmlFor="deposito-tipo">Tipo</Label>
              {editingId !== null ? (
                // Se elige al crear: una sucursal sigue siendo sucursal y un depósito, depósito.
                <p id="deposito-tipo" className="text-sm">{etiquetaDeTipo(tipo)}</p>
              ) : (
                // select-cerrado: los tipos de ubicación los fija cada producto en el código (prop `tipos`), no salen de la base
                <Select value={tipo} onValueChange={(v) => v && setTipo(v)}>
                  <SelectTrigger id="deposito-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
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

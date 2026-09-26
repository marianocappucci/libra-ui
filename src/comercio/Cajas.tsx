// Las cajas (puntos de cobro): alta, edición, caja por defecto, baja, y el
// punto de venta de ARCA por mostrador (P9-M3, 2026-09-06). Extraída de
// `pages/Cajas.tsx` de Restolibra, que era la de Contalibra más el punto de
// venta; con el backend de LibraCore lo tienen los dos.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api-client'
import type { CajaConfig } from './tipos'
import { useMediosPago } from './medios-pago'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { BadgeEstado } from '../badge-estado'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogClose,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SquareStack, Plus, Eye, Pencil, Trash2, Star, Wallet, Check, Power, PowerOff } from 'lucide-react'
import { TituloPantalla } from '../titulo-pantalla'

// 🔴 Aca habia un `TODOS_MEDIOS = Object.keys(MEDIOS_PAGO_LABELS)`, o sea la
// copia TypeScript de la lista del motor. **Esta es la pantalla donde mas
// dolia**: es donde se elige que medios habilita una caja, asi que un medio
// que la copia no tuviera --las tarjetas-- no se podia habilitar en ninguna
// caja del mundo, y uno que tuviera de mas --`cheque`-- se podia habilitar y
// despues el backend lo rechazaba al cobrar.

/** Una sucursal de un producto con sedes. `admiteCajas: false` la deja fuera del
 *  alta (un depósito no vende) sin esconderla del nombre de las cajas que ya tenía. */
export type SucursalDeCaja = { id: number; nombre: string; admiteCajas?: boolean }

export type CajasProps = {
  /** Las sucursales del producto. Con ellas la caja se crea en una sucursal, la
   *  lista se filtra por sucursal y cada tarjeta dice a cuál pertenece. Sin
   *  ellas, la pantalla es la de Contalibra y Restolibra. */
  sucursales?: SucursalDeCaja[]
  /** Un botón por tarjeta para activar/desactivar la caja sin abrir el
   *  formulario. Una caja con movimientos no se puede eliminar: se desactiva. */
  conActivarDesactivar?: boolean
  /** El enlace «Ver movimientos» (`/caja?caja_id=`); un producto sin esa
   *  pantalla lo apaga. */
  verMovimientos?: boolean
}

export function Cajas({ sucursales, conActivarDesactivar = false, verMovimientos = true }: CajasProps = {}) {
  const { medios: TODOS_MEDIOS, etiqueta: etiquetaDeMedio } = useMediosPago()
  const [cajas, setCajas] = useState<CajaConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CajaConfig | null>(null)

  // --- Dialog "Nueva caja" / "Editar caja" (antes páginas /cajas/nueva y
  // /cajas/:id/editar, ambas servidas por el mismo componente CajaForm) ---
  const [formOpen, setFormOpen] = useState(false)
  const [editingCaja, setEditingCaja] = useState<CajaConfig | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [mediosPago, setMediosPago] = useState<string[]>([])
  const [activo, setActivo] = useState(true)
  const [puntoVenta, setPuntoVenta] = useState('')
  const [mpPosId, setMpPosId] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [sucursalFiltro, setSucursalFiltro] = useState('')
  const [saving, setSaving] = useState(false)

  const sucursalesDeAlta = (sucursales ?? []).filter((s) => s.admiteCajas !== false)
  const cajasVisibles = sucursalFiltro ? cajas.filter((c) => String(c.sucursal_id) === sucursalFiltro) : cajas
  const nombreDeSucursal = (c: CajaConfig) =>
    c.sucursal_nombre ?? sucursales?.find((s) => s.id === c.sucursal_id)?.nombre ?? null

  useEffect(() => { load() }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setCajas(await api.get<CajaConfig[]>('/api/cajas'))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function setDefault(c: CajaConfig) {
    setError(null)
    try {
      await api.post(`/api/cajas/${c.id}/set-default`)
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function eliminar(c: CajaConfig) {
    setError(null)
    try {
      await api.del(`/api/cajas/${c.id}`)
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function abrirNueva() {
    setEditingCaja(null)
    setNombre('')
    setDescripcion('')
    setMediosPago([])
    setActivo(true)
    setPuntoVenta('')
    setMpPosId('')
    setSucursalId(sucursalFiltro || String(sucursalesDeAlta[0]?.id ?? ''))
    setFormOpen(true)
  }

  function abrirEditar(c: CajaConfig) {
    setEditingCaja(c)
    setNombre(c.nombre)
    setDescripcion(c.descripcion ?? '')
    setPuntoVenta(c.punto_venta == null ? '' : String(c.punto_venta))
    setMpPosId(c.mp_pos_id ?? '')
    setMediosPago(c.medios_pago)
    setActivo(!!c.activo)
    setFormOpen(true)
  }

  function toggleMedio(medio: string) {
    setMediosPago((m) => m.includes(medio) ? m.filter((x) => x !== medio) : [...m, medio])
  }

  // Desactivar y no borrar: una caja con movimientos no se elimina, y una
  // inactiva deja de ofrecerse al abrir turno sin perder su historial. El PUT
  // manda TODOS los campos: el motor pisa el POS de MercadoPago con `null`.
  async function alternarActiva(c: CajaConfig) {
    setError(null)
    try {
      await api.put(`/api/cajas/${c.id}`, {
        nombre: c.nombre, descripcion: c.descripcion ?? '', medios_pago: c.medios_pago,
        punto_venta: c.punto_venta, mp_pos_id: c.mp_pos_id, activo: !c.activo,
      })
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function guardar() {
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)
    try {
      // Vacio significa 'usa el de la empresa', que NO es lo mismo que cero:
      // por eso null y no Number('') --que daria 0 y seria un punto de venta
      // real e invalido--.
      const payload = {
        nombre, descripcion, medios_pago: mediosPago, activo,
        punto_venta: puntoVenta.trim() === '' ? null : Number(puntoVenta),
        mp_pos_id: mpPosId.trim() === '' ? null : mpPosId.trim(),
      }
      if (editingCaja) {
        await api.put(`/api/cajas/${editingCaja.id}`, payload)
      } else {
        await api.post('/api/cajas', sucursales ? { ...payload, sucursal_id: Number(sucursalId) } : payload)
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={SquareStack}>Cajas</TituloPantalla>
        <div className="flex items-center gap-2">
          {sucursales && sucursales.length > 1 && (
            <Select value={sucursalFiltro || 'todas'} onValueChange={(v) => setSucursalFiltro(v === 'todas' ? '' : v)}>
              <SelectTrigger className="h-9 w-56" aria-label="Filtrar por sucursal"><SelectValue placeholder="Todas las sucursales" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las sucursales</SelectItem>
                {sucursales.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={abrirNueva} disabled={!!sucursales && sucursalesDeAlta.length === 0}><Plus />Nueva caja</Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : cajasVisibles.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cajasVisibles.map((c) => (
            <Card key={c.id} className={c.activo ? undefined : 'opacity-50'}>
              <CardContent className="grid gap-2 pt-6">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 font-semibold"><Wallet className="size-4 text-emerald-600 dark:text-emerald-400" />{c.nombre}</p>
                  <div className="flex gap-1">
                    {!!c.es_default && <BadgeEstado tono="ok">Por defecto</BadgeEstado>}
                    {!c.activo && <BadgeEstado tono="neutro">Inactiva</BadgeEstado>}
                    {!!c.tiene_turno_abierto && <BadgeEstado tono="ok">Turno abierto</BadgeEstado>}
                  </div>
                </div>

                {sucursales && nombreDeSucursal(c) && (
                  <p className="text-xs text-muted-foreground">Sucursal: {nombreDeSucursal(c)}</p>
                )}

                {c.descripcion && <p className="text-sm text-muted-foreground">{c.descripcion}</p>}
                {c.mp_pos_id && (
                  <p className="text-xs text-muted-foreground">
                    QR: <span className="font-mono">{c.mp_pos_id}</span>
                  </p>
                )}

                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Medios de pago:</p>
                  <div className="flex flex-wrap gap-1">
                    {c.medios_pago.length > 0 ? (
                      c.medios_pago.map((m) => <Badge key={m} variant="outline">{etiquetaDeMedio(m)}</Badge>)
                    ) : (
                      <span className="text-sm text-muted-foreground">Sin medios configurados</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {verMovimientos && (
                    <Button size="sm" variant="outline" asChild><Link to={`/caja?caja_id=${c.id}`}><Eye />Ver movimientos</Link></Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => abrirEditar(c)}><Pencil />Editar</Button>
                  {conActivarDesactivar && (
                    <Button size="sm" variant="outline" onClick={() => alternarActiva(c)}
                            title={c.activo ? 'Desactivar' : 'Activar'}
                            aria-label={`${c.activo ? 'Desactivar' : 'Activar'} ${c.nombre}`}>
                      {c.activo ? <PowerOff /> : <Power />}{c.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  )}
                  {!c.es_default && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setDefault(c)} title="Usar como caja por defecto"><Star />Predeterminar</Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(c)} aria-label="Eliminar caja" title="Eliminar caja"><Trash2 /></Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-6 text-center text-muted-foreground">No hay cajas configuradas.</CardContent></Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-primary" />{editingCaja ? 'Editar caja' : 'Nueva caja'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {sucursales && !editingCaja && (
              <div className="grid gap-2">
                <Label htmlFor="caja-sucursal">Sucursal</Label>
                <Select value={sucursalId} onValueChange={(v) => v && setSucursalId(v)}>
                  <SelectTrigger id="caja-sucursal"><SelectValue placeholder="Elegí una sucursal…" /></SelectTrigger>
                  <SelectContent>
                    {sucursalesDeAlta.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="caja-nombre">Nombre</Label><Input id="caja-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Caja mostrador, Caja online…" /></div>
              <div className="grid gap-2"><Label htmlFor="caja-desc">Descripción</Label><Input id="caja-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="caja-pv">Punto de venta de ARCA</Label>
              <Input
                id="caja-pv" type="number" min={1} value={puntoVenta}
                onChange={(e) => setPuntoVenta(e.target.value)}
                placeholder="Vacío: usa el de la empresa"
              />
              <p className="text-xs text-muted-foreground">
                Sólo hace falta si este mostrador factura con su propia numeración.
                Dejarlo vacío es lo normal cuando hay un único punto de cobro.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="caja-mp-pos">POS ID de MercadoPago (QR)</Label>
              <Input
                id="caja-mp-pos" value={mpPosId}
                onChange={(e) => setMpPosId(e.target.value)}
                placeholder="Ej: BIOKOCAJA01"
              />
              <p className="text-xs text-muted-foreground">
                El <code>external_id</code> del POS en MercadoPago. Cada caja con
                QR necesita el suyo propio; dejarlo vacío desactiva el QR en esta
                caja. Sólo letras y números, sin guiones ni espacios.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Medios de pago habilitados</Label>
              <div className="flex flex-wrap gap-3">
                {TODOS_MEDIOS.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={mediosPago.includes(m.id)} onChange={() => toggleMedio(m.id)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
            {editingCaja !== null && (
              <label className="flex w-fit items-center gap-2 text-sm">
                <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
                Activa
              </label>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button disabled={saving || !nombre.trim() || (!!sucursales && !editingCaja && !sucursalId)} onClick={guardar}><Check />{saving ? 'Guardando…' : editingCaja ? 'Guardar cambios' : 'Crear caja'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={confirmDelete ? `¿Eliminar la caja «${confirmDelete.nombre}»?` : '¿Eliminar caja?'}
        onConfirm={() => { if (confirmDelete) { eliminar(confirmDelete); setConfirmDelete(null) } }}
      />
    </div>
  )
}

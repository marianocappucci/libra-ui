// Las sucursales del modelo jerárquico sucursal → depósitos (0.84.0): tarjetas con alta y edición en un Dialog y
// predeterminar. Una sucursal nace con su primer depósito y NO se elimina, sólo se da de baja (el backend impide
// bajar la última, la predeterminada, una con turno abierto o una con existencias). El stock vive en los depósitos:
// «Ver depósitos» lleva al detalle. `Depositos` sigue siendo la pantalla plana de Contalibra.
//
// **Sucursales contratadas (ADR-048, 0.136.0).** Con `rutaDelLimite` la pantalla lee «activas vs contratadas»
// (`libracore.limites`, ADR-041 del motor) y, si hay tope, lo muestra; al llegar al tope deshabilita el alta y dice por qué. Es una ayuda:
// el que corta es el backend (409), cuyo mensaje se muestra en el formulario. Sin la prop, sin tope o con la lectura caída no cambia nada.
//
// **Alta no habilitada (ADR-052).** Con `motivoSinAlta` el producto avisa que esta instancia no puede sumar otra sucursal (le falta
// un módulo, por ejemplo): «Nueva sucursal» queda deshabilitada y el motivo ocupa el lugar del mensaje del tope, sin repetirlo. También es una
// ayuda: el que corta es el backend (403). Editar, predeterminar y «Ver depósitos» siguen andando.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Check, Eye, MapPin, Pencil, Plus, Star } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'
import type { Sucursal } from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

/** Lo que contesta `GET /api/limites/sucursales` del motor: `contratadas` es `null` cuando la instancia no tiene tope. */
export type LimiteDeSucursales = { contratadas: number | null; activas: number }

/** El mismo texto que `libracore.limites.mensaje_de_limite` (el que da el 409 del alta): si cambia allá, cambia acá. */
export function mensajeDeLimite(contratadas: number): string {
  const plural = contratadas === 1 ? 'sucursal' : 'sucursales'
  return `Tu plan incluye ${contratadas} ${plural}. Para sumar otra, comunicate con nosotros.`
}

/** La lectura del límite, o `null` si no hay tope o la respuesta no es lo que se espera. Nunca lanza. */
function limiteLeido(dato: unknown): LimiteDeSucursales | null {
  const d = dato as Partial<LimiteDeSucursales> | null
  if (!d || typeof d.contratadas !== 'number' || !Number.isInteger(d.contratadas) || d.contratadas < 1) return null
  if (typeof d.activas !== 'number' || !Number.isFinite(d.activas)) return null
  return { contratadas: d.contratadas, activas: d.activas }
}

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
  /** Dónde leer las sucursales contratadas (`GET`, en el motor `/api/limites/sucursales`). Sin ella la pantalla no pide nada: los productos
   *  que no montan ese router no hacen un pedido de más. Si la lectura falla (403 de quien no administra, red caída) o no hay tope, la
   *  pantalla queda como siempre: un error de lectura no bloquea nada. */
  rutaDelLimite?: string
  /** Por qué esta instancia no puede dar de alta otra sucursal (un módulo sin activar, por ejemplo). Si viene con texto, «Nueva sucursal» queda
   *  deshabilitada y se muestra este motivo —una sola vez, aun si además se llegó al tope de contratadas—. Sin ella (o vacía) no cambia nada.
   *  Sin efecto en `soloLectura`, que no tiene alta. El texto lo pone el producto: es el que sabe qué falta. */
  motivoSinAlta?: string
}

export function Sucursales({
  rutaDelDetalle = (id) => `/sucursales/${id}`,
  rutaDeTransferencia = '/depositos/transferencia',
  soloLectura = false,
  titulo = 'Sucursales',
  etiquetaNuevo = 'Nueva sucursal',
  rutaDelLimite,
  motivoSinAlta,
}: SucursalesProps) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [limite, setLimite] = useState<LimiteDeSucursales | null>(null)

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
    cargarLimite()
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

  async function cargarLimite() {
    if (!rutaDelLimite) return
    try {
      setLimite(limiteLeido(await api.get<unknown>(rutaDelLimite)))
    } catch {
      // Sin permiso o sin red: se queda como estaba (sin aviso). El backend sigue siendo la guarda.
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
      await cargarLimite() // dar de alta (o reactivar) mueve las activas
    } catch (err) {
      setFormError(describeError(err))
      if (err instanceof ApiError && err.status === 409) await cargarLimite() // alguien más pudo haber usado el cupo
    } finally {
      setSaving(false)
    }
  }

  const alLimite = !soloLectura && limite !== null && limite.contratadas !== null && limite.activas >= limite.contratadas
  // El motivo del producto manda sobre el del tope: dos razones para lo mismo serían dos avisos.
  const sinAlta = !soloLectura && !!motivoSinAlta
  const altaDeshabilitada = sinAlta || alLimite
  const hayAviso = limite?.contratadas != null || sinAlta

  return (
    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TituloPantalla icono={ICONOS.sucursales}>{titulo}</TituloPantalla>
          {/* `flex-wrap` también en el grupo: «Transferir stock» y el alta juntos no entran a 320 px y ensanchaban la página 17 px (medido contra VentaLibra dev). */}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline"><Link to={rutaDeTransferencia}><ArrowLeftRight />Transferir stock</Link></Button>
            {!soloLectura && (
              <DialogTrigger asChild>
                <Button onClick={abrirNueva} disabled={altaDeshabilitada} aria-describedby={altaDeshabilitada ? 'sucursales-limite' : undefined}>
                  <Plus />{etiquetaNuevo}
                </Button>
              </DialogTrigger>
            )}
          </div>
        </div>

        {hayAviso && (
          <div id="sucursales-limite" className="grid gap-1 text-sm text-muted-foreground">
            {limite?.contratadas != null && (
              <p>{limite.activas} de {limite.contratadas} {limite.contratadas === 1 ? 'sucursal contratada' : 'sucursales contratadas'}</p>
            )}
            {sinAlta ? <p>{motivoSinAlta}</p> : alLimite && limite?.contratadas != null && <p>{mensajeDeLimite(limite.contratadas)}</p>}
          </div>
        )}

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
                    <p className="flex items-center gap-2 font-semibold"><ICONOS.sucursales className="size-4 text-primary" />{s.nombre}</p>
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
          <DialogTitle className="flex items-center gap-2"><ICONOS.sucursales className="size-4" />{editingId !== null ? 'Editar' : 'Nueva'} sucursal</DialogTitle>
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

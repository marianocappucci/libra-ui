/** «Sucursal sin internet»: el alta del nodo de LibraEdge desde el central (ADR-080; el motor es ADR-011 de libraedge).
 *
 *  El administrador de la instancia da de alta el nodo de una sucursal (la PC del local que sigue vendiendo sin
 *  internet) y se lleva lo que necesita para instalarlo: **el instalador** de su producto (un link fijo a los Releases
 *  de LibraEdge, que manda el backend) y **la carga del nodo** (`carga-nodo-….json`). También ve los nodos de la
 *  instancia con su última sincronización y puede emitir una carga nueva o darlos de baja.
 *
 *  Todo lo dice `GET /api/nodos-offline` (`libraedge.pantalla_del_central.create_nodos_router`): el producto sólo
 *  monta el router con su guarda de administrador y pone esta pantalla en el menú, gateada por el módulo `offline`.
 *
 *  ## 🔴 El secreto del nodo no pasa por la pantalla
 *
 *  La carga trae el secreto con el que el nodo se autentica contra el central. La respuesta del alta **es el archivo**:
 *  se pide con `api.postArchivo`, vuelve como `Blob` y se guarda tal cual (`guardarArchivo`), sin leerlo como texto ni
 *  como JSON, sin guardarlo en el estado y sin mostrarlo. Lo único que se muestra es el `node_id` y el prefijo, que el
 *  backend manda en cabeceras aparte. No hay «volver a bajar»: el central guarda sólo el hash; una carga perdida se
 *  reemplaza con «Carga nueva», que invalida la anterior.
 */
import { useCallback, useEffect, useState } from 'react'
import { Download, FileKey2, Loader2, PlugZap, Trash2 } from 'lucide-react'

import { api, ApiError, guardarArchivo } from './api-client'
import { AvisoEstado, BadgeEstado, type TonoEstado } from './badge-estado'
import { fechaHora } from './fechas'
import { formatoCantidad } from './formatos'
import { ICONOS } from './iconos-identidad'
import { IDENTIDAD } from './identidad'
import { MarcaProducto } from './MarcaProducto'
import { refrescarMenuDeNodosOffline } from './menu-de-nodos-offline'
import { TituloPantalla } from './titulo-pantalla'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog'

export const RUTA_NODOS_OFFLINE = '/api/nodos-offline'

export type EstadoDelNodo = 'al_dia' | 'sin_noticias' | 'nunca' | 'baja'

export type NodoOffline = {
  node_id: string
  sucursal_id: string
  sucursal: string | null
  prefijo: string | null
  activo: boolean
  registrado: string | null
  ultima_sincronizacion: string | null
  minutos_sin_verse: number | null
  estado: EstadoDelNodo
}

export type SucursalConNodo = { id: string; nombre: string; activa: boolean; nodo: string | null }

/** Lo que contesta `GET /api/nodos-offline`. */
export type EstadoNodosOffline = {
  producto: string
  contratado: boolean
  instalador_url: string
  central_url: string | null
  central_url_error: string | null
  emisor_faltan: string[]
  emisor_error: string | null
  umbral_minutos: number
  sucursales: SucursalConNodo[]
  nodos: NodoOffline[]
  /** Nodos no dados de baja (libraedge ≥ v0.11.0). */
  nodos_activos?: number
}

const ESTADOS: Record<EstadoDelNodo, { texto: string; tono: TonoEstado }> = {
  al_dia: { texto: 'Al día', tono: 'ok' },
  sin_noticias: { texto: 'Sin noticias', tono: 'atencion' },
  nunca: { texto: 'Sin instalar', tono: 'neutro' },
  baja: { texto: 'Dado de baja', tono: 'negativo' },
}

export const TEXTO_ADICIONAL_APAGADO_CON_NODOS =
  'El adicional LibraEdge (sucursal sin internet) está apagado: no se pueden dar de alta nodos nuevos ni emitir cargas. ' +
  'Los nodos que siguen activos sólo se pueden dar de baja.'
export const TEXTO_SIN_ADICIONAL =
  'Tu plan no incluye LibraEdge (sucursal sin internet). Para sumarlo a una sucursal, consultanos por WhatsApp.'
export const TEXTO_CARGA_DESCARGADA =
  'La carga tiene la clave del nodo: llevala a la PC del local, instalá con ella y después borrala de Descargas. ' +
  'No se puede volver a descargar; si se pierde, se emite una carga nueva.'

export function nombreDelProducto(producto: string): string {
  return (IDENTIDAD as Record<string, { nombre: string } | undefined>)[producto]?.nombre ?? producto
}

/** «hace 3 min», «hace 2,5 h», «Nunca». La hora exacta va en el `title`. */
export function ultimaSincronizacion(nodo: Pick<NodoOffline, 'ultima_sincronizacion' | 'minutos_sin_verse'>): string {
  const m = nodo.minutos_sin_verse
  if (!nodo.ultima_sincronizacion || m === null) return 'Nunca'
  if (m < 2) return 'Recién'
  if (m < 120) return `Hace ${Math.round(m)} min`
  if (m < 48 * 60) return `Hace ${formatoCantidad(Math.round(m / 6) / 10)} h`
  return fechaHora(nodo.ultima_sincronizacion)
}

function describirError(err: unknown): string {
  return err instanceof ApiError ? err.detail : 'Error de conexión.'
}

type Accion =
  | { tipo: 'alta'; sucursal: SucursalConNodo }
  | { tipo: 'carga'; nodo: NodoOffline }
  | { tipo: 'baja'; nodo: NodoOffline }

const TEXTOS_DE_ACCION = {
  alta: {
    titulo: 'Dar de alta el nodo',
    boton: 'Dar de alta y descargar la carga',
  },
  carga: {
    titulo: 'Emitir una carga nueva',
    boton: 'Emitir y descargar',
  },
  baja: {
    titulo: 'Dar de baja el nodo',
    boton: 'Dar de baja',
  },
} as const

function DescripcionDeAccion({ accion }: { accion: Accion }) {
  if (accion.tipo === 'alta') {
    return (
      <>
        Se registra el nodo de <strong>{accion.sucursal.nombre}</strong> y se descarga su carga. La carga tiene la clave
        del nodo y se descarga <strong>una sola vez</strong>.
      </>
    )
  }
  if (accion.tipo === 'carga') {
    return (
      <>
        Para reinstalar <strong>la misma PC</strong> de {accion.nodo.sucursal ?? accion.nodo.sucursal_id} si se perdió la
        carga. La carga anterior deja de servir: si el nodo está instalado con ella, deja de sincronizar hasta que se
        reinstale con la nueva. Para otra PC, dalo de baja y da de alta un nodo nuevo.
      </>
    )
  }
  return (
    <>
      El nodo {accion.nodo.node_id} deja de poder sincronizar con el central (por ejemplo, si la PC se robó o se
      reemplaza). Lo que haya vendido sin subir queda en esa PC. No se puede deshacer: después se da de alta un nodo nuevo.
    </>
  )
}

export function SucursalSinInternet({ ruta = RUTA_NODOS_OFFLINE }: { ruta?: string } = {}) {
  const [estado, setEstado] = useState<EstadoNodosOffline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [errorDeAccion, setErrorDeAccion] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setEstado(await api.get<EstadoNodosOffline>(ruta))
      setError(null)
    } catch (err) {
      setError(describirError(err))
    }
  }, [ruta])

  useEffect(() => { void cargar() }, [cargar])

  function abrir(a: Accion) {
    setErrorDeAccion(null)
    setAccion(a)
  }

  async function confirmar() {
    if (!accion) return
    setOcupado(true)
    setErrorDeAccion(null)
    try {
      if (accion.tipo === 'baja') {
        await api.del(`${ruta}/${encodeURIComponent(accion.nodo.node_id)}`)
        setAviso(`El nodo ${accion.nodo.node_id} quedó dado de baja.`)
      } else {
        const archivo = accion.tipo === 'alta'
          ? await api.postArchivo(ruta, { sucursal_id: accion.sucursal.id })
          : await api.postArchivo(`${ruta}/${encodeURIComponent(accion.nodo.node_id)}/carga`)
        const nodeId = archivo.headers.get('x-libraedge-node-id') ?? ''
        const prefijo = archivo.headers.get('x-libraedge-prefijo')
        // 🔴 Se guarda el Blob tal cual: el secreto no se lee ni queda en el estado.
        guardarArchivo(archivo.blob, archivo.nombre ?? `carga-nodo-${nodeId || 'nueva'}.json`)
        setAviso(`Se descargó la carga del nodo ${nodeId}${prefijo ? ` (prefijo ${prefijo})` : ''}. ${TEXTO_CARGA_DESCARGADA}`)
      }
      setAccion(null)
      // Un alta o una baja cambia si el menú muestra esta entrada (sin el adicional, sólo con nodos activos).
      refrescarMenuDeNodosOffline()
      await cargar()
    } catch (err) {
      setErrorDeAccion(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  const producto = estado ? nombreDelProducto(estado.producto) : ''
  const activas = estado?.sucursales.filter((s) => s.activa) ?? []
  const puedeEmitir = !!estado && estado.contratado && !estado.central_url_error && !estado.emisor_error

  return (
    <div className="space-y-6">
      <TituloPantalla icono={ICONOS.sucursalSinInternet}>Sucursal sin internet</TituloPantalla>

      <div className="flex items-start gap-3 text-sm text-muted-foreground">
        <MarcaProducto producto="libraedge" className="h-10 w-10 shrink-0" />
        <p>
          Con <strong className="text-foreground">LibraEdge</strong> la PC del local sigue vendiendo cuando se corta
          internet: cobra e imprime el ticket, y al volver la conexión las ventas suben solas al central y se facturan.
          Se instala una vez por sucursal: descargá el instalador, da de alta el nodo de la sucursal para descargar su
          carga y, en la PC del local, ejecutá el instalador y elegí la carga.
        </p>
      </div>

      {error && <AvisoEstado tono="negativo" role="alert">{error}</AvisoEstado>}
      {aviso && <AvisoEstado tono="ok" role="status">{aviso}</AvisoEstado>}

      {!estado && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Cargando…</p>
      )}

      {estado && (
        <>
          {!estado.contratado && (
            // Sin el adicional la pantalla sólo se abre si quedan nodos activos (el menú, ADR-080): ahí lo único que se puede
            // hacer es darlos de baja, y tiene que quedar dicho.
            <AvisoEstado tono="atencion" role="note">
              {estado.nodos.some((n) => n.activo) ? TEXTO_ADICIONAL_APAGADO_CON_NODOS : TEXTO_SIN_ADICIONAL}
            </AvisoEstado>
          )}
          {estado.central_url_error && <AvisoEstado tono="negativo">{estado.central_url_error}</AvisoEstado>}
          {estado.emisor_error && (
            <AvisoEstado tono="negativo">Los datos de la empresa en Configuración: {estado.emisor_error}</AvisoEstado>
          )}
          {!estado.emisor_error && estado.emisor_faltan.length > 0 && (
            <AvisoEstado tono="atencion">
              Faltan el CUIT o la condición de IVA de la empresa en Configuración: el nodo va a vender, pero no va a
              poder facturar hasta que se carguen y se emita una carga nueva.
            </AvisoEstado>
          )}

          <Card>
            <CardHeader className="pb-2"><h2 className="text-base font-semibold">1. El instalador</h2></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Es el mismo para todas las sucursales y no tiene ninguna clave. Va en la PC del local (Windows 10 u 11).
              </p>
              <Button asChild variant="outline">
                <a href={estado.instalador_url} rel="noopener noreferrer"><Download />Descargar el instalador de {producto}</a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><h2 className="text-base font-semibold">2. El nodo de cada sucursal</h2></CardHeader>
            <CardContent className="text-sm">
              {activas.length === 0 ? (
                <p className="text-muted-foreground">No hay sucursales activas. Creá la sucursal primero.</p>
              ) : (
                <ul className="divide-y" aria-label="Sucursales">
                  {activas.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="font-medium">{s.nombre}</span>
                      {s.nodo ? (
                        <span className="text-muted-foreground">Nodo {s.nodo}</span>
                      ) : (
                        <Button size="sm" disabled={!puedeEmitir} onClick={() => abrir({ tipo: 'alta', sucursal: s })}>
                          <PlugZap />Dar de alta el nodo
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><h2 className="text-base font-semibold">Nodos</h2></CardHeader>
            <CardContent className="text-sm">
              {estado.nodos.length === 0 ? (
                <p className="text-muted-foreground">Todavía no hay ningún nodo.</p>
              ) : (
                <ul className="divide-y" aria-label="Nodos">
                  {estado.nodos.map((n) => (
                    <li key={n.node_id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-nodo={n.node_id}>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{n.sucursal ?? `Sucursal ${n.sucursal_id}`}</span>
                          <BadgeEstado tono={ESTADOS[n.estado].tono}>{ESTADOS[n.estado].texto}</BadgeEstado>
                        </div>
                        <p className="break-all text-muted-foreground">
                          {n.node_id} · prefijo {n.prefijo ?? '—'} · última sincronización{' '}
                          <span title={n.ultima_sincronizacion ? fechaHora(n.ultima_sincronizacion) : undefined}>
                            {ultimaSincronizacion(n).toLowerCase()}
                          </span>
                        </p>
                      </div>
                      {n.activo && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={!puedeEmitir} onClick={() => abrir({ tipo: 'carga', nodo: n })}>
                            <FileKey2 />Carga nueva
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => abrir({ tipo: 'baja', nodo: n })}>
                            <Trash2 />Dar de baja
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!accion} onOpenChange={(abierto) => { if (!abierto && !ocupado) setAccion(null) }}>
        {accion && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{TEXTOS_DE_ACCION[accion.tipo].titulo}</DialogTitle>
              <DialogDescription><DescripcionDeAccion accion={accion} /></DialogDescription>
            </DialogHeader>
            {errorDeAccion && <AvisoEstado tono="negativo" role="alert">{errorDeAccion}</AvisoEstado>}
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" disabled={ocupado}>Cancelar</Button></DialogClose>
              <Button
                variant={accion.tipo === 'baja' ? 'destructive' : 'default'}
                disabled={ocupado}
                onClick={() => void confirmar()}
              >
                {ocupado && <Loader2 className="animate-spin" />}{TEXTOS_DE_ACCION[accion.tipo].boton}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

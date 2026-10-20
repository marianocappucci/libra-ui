/** «Sucursal sin internet»: el alta del nodo de LibraEdge desde el central (ADR-080 y ADR-085; el motor es ADR-011 y
 *  ADR-014 de libraedge).
 *
 *  El administrador de la instancia da de alta el nodo de una sucursal (la PC del local que sigue vendiendo sin
 *  internet) y se lleva lo que necesita para instalarlo: **el instalador** de su producto (un link fijo a los Releases
 *  de LibraEdge, que manda el backend) y **la dirección del sistema y un código de vinculación** para escribir en el
 *  instalador (ADR-085). También ve los nodos de la instancia con su última sincronización, puede pedir otro código,
 *  anularlo, bajar el archivo de carga (la alternativa para soporte) o darlos de baja.
 *
 *  Todo lo dice `GET /api/nodos-offline` (`libraedge.pantalla_del_central.create_nodos_router`): el producto sólo
 *  monta el router con su guarda de administrador y pone esta pantalla como sección de Configuración
 *  (`seccionSucursalSinInternet`, ADR-082), sólo para el administrador.
 *
 *  ## LibraEdge es parte del sistema (decisión del humano, 2026-10-20)
 *
 *  Está incluido en todos los planes: no hay adicional que contratar, así que la pantalla ofrece siempre el instalador,
 *  el alta y la carga nueva. `contratado` del backend ya no se mira (libraedge ≥ v0.14.0 lo manda siempre en `true`).
 *
 *  ## El código, en lugar del archivo (ADR-085)
 *
 *  El alta y «Código nuevo» devuelven `{direccion, codigo, vence}`: se muestran en grande, con botones para copiar, y
 *  el instalador (Windows o Ubuntu) los pide. El código vale **15 minutos y una sola vez**; el instalador lo canjea por
 *  la carga contra el central. **El secreto del nodo no pasa por la pantalla**: sale recién en ese canje.
 *
 *  El archivo de carga queda para soporte («Archivo de carga» en cada nodo): la respuesta **es el archivo**, se pide
 *  con `api.postArchivo`, vuelve como `Blob` y se guarda tal cual (`guardarArchivo`), sin leerlo, sin guardarlo en el
 *  estado y sin mostrarlo.
 *
 *  ## Las otras PC del local (ADR-086)
 *
 *  La tarjeta del instalador ofrece también la **app de caja** (`descargasDeCaja`, libraedge ADR-017): sólo la versión
 *  de escritorio, para las otras PC del local, que busca sola la PC principal en la red.
 *
 *  ## En el local se entra siempre por la copia local (ADR-084)
 *
 *  En la PC con el nodo, el producto corre en `http://localhost:<puerto>` y sincroniza por detrás: se entra **siempre**
 *  por ahí (el acceso directo «<Producto>» que deja el instalador), aunque haya internet. Lo dicen la tarjeta del
 *  instalador y el alta del nodo (`textoEntrarPorLaCopiaLocal`); el instalador y la bandeja de LibraEdge lo repiten
 *  con la IP ya completa.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Download, FileKey2, KeyRound, Loader2, PlugZap, Trash2, X } from 'lucide-react'

import { api, ApiError, guardarArchivo } from './api-client'
import { AvisoEstado, BadgeEstado, type TonoEstado } from './badge-estado'
import { fechaHora, hora } from './fechas'
import { formatoCantidad } from './formatos'
import { ICONOS } from './iconos-identidad'
import { IDENTIDAD } from './identidad'
import { MarcaProducto } from './MarcaProducto'
import type { SeccionConfig } from './Configuracion'
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
  /** El código de vinculación pendiente (sin usar ni vencer), sólo con su vencimiento: el código no se vuelve a
   *  mostrar (el central guarda el hash). libraedge ≥ v0.14.0. */
  vinculacion?: { vence: string } | null
}

export type SucursalConNodo = { id: string; nombre: string; activa: boolean; nodo: string | null }

/** Lo que contesta `GET /api/nodos-offline`. */
export type EstadoNodosOffline = {
  producto: string
  /** @deprecated LibraEdge está incluido en todos los planes (libraedge ADR-014): el backend lo manda siempre en
   *  `true` y la pantalla ya no lo mira. */
  contratado?: boolean
  instalador_url: string
  central_url: string | null
  central_url_error: string | null
  /** Lo que se escribe en el instalador: la URL del central sin `https://` (libraedge ≥ v0.14.0). */
  direccion?: string | null
  /** Cuánto vale un código (15 minutos). */
  vinculacion_minutos?: number
  emisor_faltan: string[]
  emisor_error: string | null
  umbral_minutos: number
  sucursales: SucursalConNodo[]
  nodos: NodoOffline[]
  /** Nodos no dados de baja (libraedge ≥ v0.11.0). */
  nodos_activos?: number
  /** El `.deb` de Ubuntu y el script de una línea, si el backend los manda; si no, salen de `instalador_url`. */
  instalador_deb_url?: string
  instalar_script_url?: string
  /** La app de caja para las otras PC del local (libraedge ADR-017), si el backend la manda; si no, sale de
   *  `instalador_url`. */
  caja_url?: string
  caja_deb_url?: string
  /** El puerto del producto en la PC del nodo, si el backend lo manda; si no, `PUERTO_DEL_NODO`. */
  puerto_local?: number
}

/** Lo que devuelven el alta con código y «Código nuevo» (`POST .../vinculacion`, libraedge ADR-014). */
export type CodigoDeVinculacion = {
  node_id: string
  prefijo: string | null
  sucursal: { id: string; nombre: string } | null
  direccion: string
  central_url: string
  codigo: string
  vence: string
  vinculacion_minutos?: number
}

/** El puerto en el que el nodo deja el producto en la PC del local: el `puerto` de
 *  `instalador/productos/<producto>.json` de libraedge, 8000 en los tres productos. */
export const PUERTO_DEL_NODO = 8000

/** Cómo se entra en el local que tiene el nodo (ADR-084): por la copia local, aunque haya internet. */
export function textoEntrarPorLaCopiaLocal(producto: string, puerto: number = PUERTO_DEL_NODO): string {
  return (
    `En ese local, entrá siempre por la copia local, aunque haya internet: en la PC del nodo, con el acceso directo ` +
    `«${producto}» que deja el instalador (o http://localhost:${puerto}); desde las otras cajas, con la app de caja, ` +
    `que encuentra sola esa PC en la red (o con http://<IP de esa PC>:${puerto}). La dirección de la nube es para ` +
    `entrar desde afuera del local.`
  )
}

/** Lo que se baja para instalar el nodo: el `.exe` de Windows, el `.deb` de Ubuntu y el script de una línea. */
export type DescargasDelNodo = { windows: string; ubuntu: string | null; script: string | null }

/** Las tres descargas. Los Releases de LibraEdge publican, junto a `libraedge-nodo-<producto>.exe`, el alias
 *  `libraedge-nodo-<producto>_amd64.deb` y `instalar-nodo.sh` (libraedge ADR-010 y ADR-012): mientras el backend no los
 *  mande, se arman al lado del `.exe`. Con otra URL (un instalador servido de otro lado) no se inventa nada. */
export function descargasDelNodo(
  estado: Pick<EstadoNodosOffline, 'instalador_url' | 'instalador_deb_url' | 'instalar_script_url'>,
): DescargasDelNodo {
  const m = /^(.*)\/libraedge-nodo-([a-z0-9]+)\.exe$/.exec(estado.instalador_url)
  return {
    windows: estado.instalador_url,
    ubuntu: estado.instalador_deb_url ?? (m ? `${m[1]}/libraedge-nodo-${m[2]}_amd64.deb` : null),
    script: estado.instalar_script_url ?? (m ? `${m[1]}/instalar-nodo.sh` : null),
  }
}

/** La app de caja de las otras PC del local (libraedge ADR-017): sólo la versión de escritorio, sin nodo, que busca
 *  sola la PC principal en la red. Los Releases la publican al lado del instalador del nodo
 *  (`libraedge-caja-<producto>.exe` y `libraedge-caja-<producto>_amd64.deb`): mientras el backend no la mande, se arma
 *  ahí, como las otras descargas. Con otra URL de instalador no se inventa nada (`null`). */
export type DescargasDeCaja = { windows: string; ubuntu: string }

export function descargasDeCaja(
  estado: Pick<EstadoNodosOffline, 'instalador_url' | 'caja_url' | 'caja_deb_url'>,
): DescargasDeCaja | null {
  const m = /^(.*)\/libraedge-nodo-([a-z0-9]+)\.exe$/.exec(estado.instalador_url)
  const windows = estado.caja_url ?? (m ? `${m[1]}/libraedge-caja-${m[2]}.exe` : null)
  const ubuntu = estado.caja_deb_url ?? (m ? `${m[1]}/libraedge-caja-${m[2]}_amd64.deb` : null)
  return windows && ubuntu ? { windows, ubuntu } : null
}

/** Para qué es la app de caja, en una línea (la tarjeta del instalador). */
export const TEXTO_CAJA =
  'Para las otras PC del local: la app de caja no tiene nodo ni base de datos; busca sola la PC principal en la red ' +
  'y abre el sistema desde ella, aunque no haya internet.'

/** La línea para instalar en Ubuntu con el código (libraedge ADR-014). Sin código ni dirección, con los lugares a
 *  completar. */
export function comandoDeUbuntu(script: string, producto: string, codigo?: string, direccion?: string): string {
  return `curl -fsSL ${script} | sudo bash -s ${producto} --codigo ${codigo ?? '<código>'} --direccion ${direccion ?? '<dirección>'}`
}

const ESTADOS: Record<EstadoDelNodo, { texto: string; tono: TonoEstado }> = {
  al_dia: { texto: 'Al día', tono: 'ok' },
  sin_noticias: { texto: 'Sin noticias', tono: 'atencion' },
  nunca: { texto: 'Sin instalar', tono: 'neutro' },
  baja: { texto: 'Dado de baja', tono: 'negativo' },
}

export const TEXTO_CODIGO =
  'En la PC del local, ejecutá el instalador y escribí la dirección y el código cuando los pida. El código vale una ' +
  'sola vez; si vence antes de usarlo, pedí otro.'
export const TEXTO_CARGA_DESCARGADA =
  'La carga tiene la clave del nodo: llevala a la PC del local, instalá con ella y después borrala de Descargas. ' +
  'No se puede volver a descargar; si se pierde, se emite otra o se pide un código.'

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
  | { tipo: 'codigo'; nodo: NodoOffline }
  | { tipo: 'archivo'; nodo: NodoOffline }
  | { tipo: 'baja'; nodo: NodoOffline }

const TEXTOS_DE_ACCION = {
  alta: { titulo: 'Dar de alta el nodo', boton: 'Dar de alta y ver el código' },
  codigo: { titulo: 'Pedir un código nuevo', boton: 'Pedir el código' },
  archivo: { titulo: 'Archivo de carga (soporte)', boton: 'Emitir y descargar' },
  baja: { titulo: 'Dar de baja el nodo', boton: 'Dar de baja' },
} as const

/** El aviso de cómo se entra en el local (ADR-084), en la tarjeta del instalador y en el alta del nodo. */
function EntrarPorLaCopiaLocal({ producto, puerto }: { producto: string; puerto?: number }) {
  return (
    <AvisoEstado tono="atencion" role="note" data-aviso="copia-local">
      {textoEntrarPorLaCopiaLocal(producto, puerto)}
    </AvisoEstado>
  )
}

function DescripcionDeAccion({ accion, minutos }: { accion: Accion; minutos: number }) {
  if (accion.tipo === 'alta') {
    return (
      <>
        Se registra el nodo de <strong>{accion.sucursal.nombre}</strong> y se muestran la dirección del sistema y un
        código para escribir en el instalador. El código vale <strong>{minutos} minutos y una sola vez</strong>.
      </>
    )
  }
  if (accion.tipo === 'codigo') {
    return (
      <>
        Para instalar o reinstalar <strong>la misma PC</strong> de {accion.nodo.sucursal ?? accion.nodo.sucursal_id}, o
        si el código anterior venció. El código anterior deja de servir. Si el nodo ya está instalado, sigue funcionando
        hasta que se instale con el código nuevo. Para otra PC, dalo de baja y da de alta un nodo nuevo.
      </>
    )
  }
  if (accion.tipo === 'archivo') {
    return (
      <>
        La alternativa al código, para soporte: se descarga <strong>una sola vez</strong> un archivo con la clave del
        nodo de {accion.nodo.sucursal ?? accion.nodo.sucursal_id}, que se elige en el instalador. La clave anterior y el
        código pendiente dejan de servir: si el nodo está instalado, deja de sincronizar hasta que se reinstale.
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

/** Un valor para copiar (la dirección o el código), con su botón. */
function ValorParaCopiar({ etiqueta, valor, grande = false }: { etiqueta: string; valor: string; grande?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  function copiar() {
    void navigator.clipboard?.writeText(valor).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }, () => undefined)
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <dt className="w-24 shrink-0 text-muted-foreground">{etiqueta}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <code
          className={grande
            ? 'rounded-md border bg-muted px-3 py-1 font-mono text-2xl font-semibold tracking-[0.2em]'
            : 'break-all font-mono text-sm'}
          data-valor={etiqueta.toLowerCase()}
        >
          {valor}
        </code>
        <Button type="button" size="sm" variant="ghost" onClick={copiar} aria-label={`Copiar ${etiqueta.toLowerCase()}`}>
          {copiado ? <Check /> : <Copy />}
        </Button>
      </dd>
    </div>
  )
}

/** El código recién emitido: la dirección y el código para el instalador, el vencimiento y la línea de Ubuntu. */
function CodigoEmitido({ codigo, script, producto, ocupado, onOtro, onAnular, onCerrar }: {
  codigo: CodigoDeVinculacion
  script: string | null
  producto: string
  ocupado: boolean
  onOtro: () => void
  onAnular: () => void
  onCerrar: () => void
}) {
  const sucursal = codigo.sucursal?.nombre ?? codigo.node_id
  return (
    <Card aria-label="Código de vinculación" data-vinculacion={codigo.node_id} className="border-primary/40">
      <CardHeader className="pb-2">
        <h2 className="text-base font-semibold">Vincular el nodo de {sucursal}</h2>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">{TEXTO_CODIGO}</p>
        <dl className="space-y-2">
          <ValorParaCopiar etiqueta="Dirección" valor={codigo.direccion} />
          <ValorParaCopiar etiqueta="Código" valor={codigo.codigo} grande />
        </dl>
        <p>
          Vence a las <strong>{hora(codigo.vence)}</strong> ({codigo.vinculacion_minutos ?? 15} minutos) y sirve una
          sola vez.
        </p>
        {script && (
          <div className="space-y-1">
            <p className="text-muted-foreground">En Ubuntu, en una sola línea:</p>
            <pre className="overflow-x-auto rounded-md border bg-muted px-3 py-2 text-xs">
              <code>{comandoDeUbuntu(script, producto, codigo.codigo, codigo.direccion)}</code>
            </pre>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={ocupado} onClick={onOtro}><KeyRound />Pedir otro código</Button>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={onAnular}><X />Anular el código</Button>
          <Button size="sm" variant="ghost" onClick={onCerrar}>Listo</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SucursalSinInternet({ ruta = RUTA_NODOS_OFFLINE, enConfiguracion = false }: {
  ruta?: string
  /** Como sección de Configuración (ADR-082): sin el título de pantalla, que ya lo pone Configuración. */
  enConfiguracion?: boolean
} = {}) {
  const [estado, setEstado] = useState<EstadoNodosOffline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [errorDeAccion, setErrorDeAccion] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // 🔴 El código se muestra mientras la persona lo copia; no se guarda en ningún otro lado (el central tiene el hash).
  const [codigo, setCodigo] = useState<CodigoDeVinculacion | null>(null)

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

  const rutaDelNodo = (nodeId: string) => `${ruta}/${encodeURIComponent(nodeId)}`

  async function confirmar() {
    if (!accion) return
    setOcupado(true)
    setErrorDeAccion(null)
    try {
      if (accion.tipo === 'baja') {
        await api.del(rutaDelNodo(accion.nodo.node_id))
        if (codigo?.node_id === accion.nodo.node_id) setCodigo(null)
        setAviso(`El nodo ${accion.nodo.node_id} quedó dado de baja.`)
      } else if (accion.tipo === 'archivo') {
        const archivo = await api.postArchivo(`${rutaDelNodo(accion.nodo.node_id)}/carga`)
        const nodeId = archivo.headers.get('x-libraedge-node-id') ?? ''
        const prefijo = archivo.headers.get('x-libraedge-prefijo')
        // 🔴 Se guarda el Blob tal cual: el secreto no se lee ni queda en el estado.
        guardarArchivo(archivo.blob, archivo.nombre ?? `carga-nodo-${nodeId || 'nueva'}.json`)
        if (codigo?.node_id === accion.nodo.node_id) setCodigo(null)
        setAviso(`Se descargó la carga del nodo ${nodeId}${prefijo ? ` (prefijo ${prefijo})` : ''}. ${TEXTO_CARGA_DESCARGADA}`)
      } else {
        const emitido = accion.tipo === 'alta'
          ? await api.post<CodigoDeVinculacion>(`${ruta}/vinculacion`, { sucursal_id: accion.sucursal.id })
          : await api.post<CodigoDeVinculacion>(`${rutaDelNodo(accion.nodo.node_id)}/vinculacion`)
        setCodigo(emitido)
        setAviso(null)
      }
      setAccion(null)
      await cargar()
    } catch (err) {
      setErrorDeAccion(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function anularCodigo(nodeId: string) {
    setOcupado(true)
    try {
      await api.del(`${rutaDelNodo(nodeId)}/vinculacion`)
      if (codigo?.node_id === nodeId) setCodigo(null)
      setAviso(`El código del nodo ${nodeId} quedó anulado.`)
      setError(null)
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function pedirOtro(nodeId: string) {
    setOcupado(true)
    try {
      setCodigo(await api.post<CodigoDeVinculacion>(`${rutaDelNodo(nodeId)}/vinculacion`))
      setError(null)
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  const producto = estado ? nombreDelProducto(estado.producto) : ''
  const activas = estado?.sucursales.filter((s) => s.activa) ?? []
  const puedeEmitir = !!estado && !estado.central_url_error && !estado.emisor_error
  const descargas = estado ? descargasDelNodo(estado) : null
  const caja = estado ? descargasDeCaja(estado) : null
  const minutos = estado?.vinculacion_minutos ?? 15

  return (
    <div className="space-y-6">
      {!enConfiguracion && <TituloPantalla icono={ICONOS.sucursalSinInternet}>Sucursal sin internet</TituloPantalla>}

      <div className="flex items-start gap-3 text-sm text-muted-foreground">
        <MarcaProducto producto="libraedge" className="h-10 w-10 shrink-0" />
        <p>
          Con <strong className="text-foreground">LibraEdge</strong> la PC del local sigue vendiendo cuando se corta
          internet: cobra e imprime el ticket, y al volver la conexión las ventas suben solas al central y se facturan.
          Está incluido en tu plan. Se instala una vez por sucursal: descargá el instalador, da de alta el nodo de la
          sucursal y, en la PC del local, ejecutá el instalador y escribí la dirección y el código que aparecen acá.
        </p>
      </div>

      {error && <AvisoEstado tono="negativo" role="alert">{error}</AvisoEstado>}
      {aviso && <AvisoEstado tono="ok" role="status">{aviso}</AvisoEstado>}

      {!estado && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Cargando…</p>
      )}

      {estado && codigo && (
        <CodigoEmitido
          codigo={codigo}
          script={descargas?.script ?? null}
          producto={estado.producto}
          ocupado={ocupado}
          onOtro={() => void pedirOtro(codigo.node_id)}
          onAnular={() => void anularCodigo(codigo.node_id)}
          onCerrar={() => setCodigo(null)}
        />
      )}

      {estado && (
        <>
          {estado.central_url_error && <AvisoEstado tono="negativo">{estado.central_url_error}</AvisoEstado>}
          {estado.emisor_error && (
            <AvisoEstado tono="negativo">Los datos de la empresa en Configuración: {estado.emisor_error}</AvisoEstado>
          )}
          {!estado.emisor_error && estado.emisor_faltan.length > 0 && (
            <AvisoEstado tono="atencion">
              Faltan el CUIT o la condición de IVA de la empresa en Configuración: el nodo va a vender, pero no va a
              poder facturar hasta que se carguen y se reinstale con un código nuevo.
            </AvisoEstado>
          )}

          {descargas && (
            <Card>
              <CardHeader className="pb-2"><h2 className="text-base font-semibold">1. El instalador</h2></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Es el mismo para todas las sucursales y no tiene ninguna clave. Va en la PC del local: Windows 10 u 11, o
                  Ubuntu, de 64 bits.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <a href={descargas.windows} rel="noopener noreferrer"><Download />Instalador de {producto} para Windows</a>
                  </Button>
                  {descargas.ubuntu && (
                    <Button asChild variant="outline">
                      <a href={descargas.ubuntu} rel="noopener noreferrer"><Download />Paquete de {producto} para Ubuntu</a>
                    </Button>
                  )}
                </div>
                {descargas.script && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      En Ubuntu también se instala con una sola línea, que agrega PostgreSQL 16 y verifica el paquete:
                    </p>
                    <pre className="overflow-x-auto rounded-md border bg-muted px-3 py-2 text-xs"><code>{comandoDeUbuntu(descargas.script, estado.producto)}</code></pre>
                  </div>
                )}
                <EntrarPorLaCopiaLocal producto={producto} puerto={estado.puerto_local} />
                {caja && (
                  <div className="space-y-2 border-t pt-3" data-descargas="caja">
                    <h3 className="font-medium">Para las otras PC del local</h3>
                    <p className="text-muted-foreground">{TEXTO_CAJA}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline">
                        <a href={caja.windows} rel="noopener noreferrer"><Download />{producto} para otra caja (Windows)</a>
                      </Button>
                      <Button asChild variant="outline">
                        <a href={caja.ubuntu} rel="noopener noreferrer"><Download />{producto} para otra caja (Ubuntu)</a>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
                          {n.activo && n.vinculacion && (
                            <BadgeEstado tono="atencion">Código pendiente hasta las {hora(n.vinculacion.vence)}</BadgeEstado>
                          )}
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
                          <Button size="sm" variant="outline" disabled={!puedeEmitir} onClick={() => abrir({ tipo: 'codigo', nodo: n })}>
                            <KeyRound />Código nuevo
                          </Button>
                          {n.vinculacion && (
                            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void anularCodigo(n.node_id)}>
                              <X />Anular código
                            </Button>
                          )}
                          <Button
                            size="sm" variant="ghost" disabled={!puedeEmitir} title="Para soporte: la alternativa al código"
                            onClick={() => abrir({ tipo: 'archivo', nodo: n })}
                          >
                            <FileKey2 />Archivo de carga
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
              <DialogDescription><DescripcionDeAccion accion={accion} minutos={minutos} /></DialogDescription>
            </DialogHeader>
            {accion.tipo === 'alta' && <EntrarPorLaCopiaLocal producto={producto} puerto={estado?.puerto_local} />}
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

/** La sección «Sucursal sin internet» de Configuración (ADR-082). El producto la suma a `propias` **sólo para el
 *  administrador** (el backend corta igual): `createConfiguracion({ propias: [..., seccionSucursalSinInternet()] })`. */
export function seccionSucursalSinInternet({ ruta = RUTA_NODOS_OFFLINE }: { ruta?: string } = {}): SeccionConfig {
  return {
    clave: CLAVE_DE_LA_SECCION,
    label: 'Sucursal sin internet',
    icono: ICONOS.sucursalSinInternet,
    contenido: <SucursalSinInternet ruta={ruta} enConfiguracion />,
  }
}

/** `?seccion=` de la sección: la ruta vieja `/sucursal-sin-internet` del producto redirige a
 *  `/configuracion?seccion=sucursal-sin-internet`. */
export const CLAVE_DE_LA_SECCION = 'sucursal-sin-internet'

/** La sección "Datos / Backup", una sola para toda la familia.
 *
 *  Reúne lo que estaba en dos lugares: el `DatosTab` de Contalibra —con el
 *  aviso de la copia externa, la lista de backups automáticos y la restauración
 *  detrás de un modal— y el `DatosBackupCard` de este paquete, que además tiene
 *  el botón de **guardar una copia en el servidor** (`POST /backups`) que
 *  Contalibra no tenía.
 *
 *  El archivo es un **ZIP con las bases y los archivos de la instancia**, no un
 *  `.db` suelto: tres productos de la familia tienen `usuarios` en una base
 *  separada del dominio, y MedLibra guarda además los documentos clínicos en
 *  disco. Ver `libracore/respaldo.py`.
 *
 *  🔴 **Elegir el archivo NO dispara la restauración.** Es la acción que
 *  reemplaza todos los datos del cliente: elegirla y confirmarla son dos pasos,
 *  y el segundo es el modal.
 *
 *  La **copia externa** (add-on) se conecta desde acá desde el 2026-09-10: el
 *  cliente elige Google Drive o Dropbox, da el permiso en el proveedor y vuelve.
 *  El token queda en la instancia (`libracore.resguardo_enlace`) y la subida la
 *  sigue haciendo el cron del host. Ver `ResguardoExternoCard`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Cloud, Database, Download, Unlink, Upload } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { fechaHora } from '@/lib/fechas'

export type BackupGuardado = {
  filename: string
  size_mb: number
  mtime: string
}

/** Estado de la copia del backup en la nube del cliente (add-on).
 *
 *  `contratado: false` es "no tenés el add-on", **no** una falla: la pantalla no
 *  puede mostrarle una alarma a quien no lo contrató. Y `al_dia: false` con
 *  `contratado: true` sí lo es — el backend distingue en `motivo` si la última
 *  subida falló o si anduvo pero es de hace días, que desde afuera se ven igual.
 */
export type ResguardoExterno = {
  contratado: boolean
  al_dia: boolean | null
  motivo: string | null
  detalle: {
    cuando: string | null
    archivo: string | null
    destino: string | null
    bytes: number | null
    en_destino: number | null
    error: string | null
  } | null
}

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

/** Lo que contesta `GET …/resguardo-externo/enlace` (`libracore.resguardo_enlace`).
 *
 *  `proveedores` son sólo los que el servidor tiene habilitados —con client ID
 *  cargado—: un botón que termina en un error de Google es peor que no tenerlo.
 */
export type EnlaceNube = {
  proveedores: { clave: string; nombre: string }[]
  enlace: {
    proveedor: string
    nombre: string
    cuenta: string | null
    carpeta: string
    desde: string
  } | null
}

/** `'sin-plan'` es un 403: la instancia no tiene el módulo `resguardo_externo`.
 *  `null` es que el endpoint no está —un LibraCore anterior al enlace— o no se
 *  pudo leer; en los dos casos la tarjeta se porta como antes de que existiera. */
type RespuestaEnlace = EnlaceNube | 'sin-plan' | null

type Retorno = { ok: boolean; detalle: string | null }

/** Lo que dejó en la URL la vuelta del proveedor (`?resguardo=ok|error`).
 *
 *  Sólo lee. Limpiar la URL es un efecto y va en un `useEffect`: en StrictMode
 *  el inicializador de `useState` corre dos veces, y si la primera limpiara, la
 *  segunda ya no encontraría nada que mostrar. */
function leerRetorno(): Retorno | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const r = params.get('resguardo')
  if (r !== 'ok' && r !== 'error') return null
  return { ok: r === 'ok', detalle: params.get('detalle') }
}

/** Saca `resguardo` y `detalle` de la URL, dejando `seccion`. Sin esto, recargar
 *  la página vuelve a mostrar "quedó conectada" — o el error de hace una hora. */
function limpiarRetorno() {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('resguardo')) return
  params.delete('resguardo')
  params.delete('detalle')
  const q = params.toString()
  window.history.replaceState(
    window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`,
  )
}

function irA(url: string) {
  window.location.assign(url)
}

function UltimaCopia({ detalle }: { detalle: ResguardoExterno['detalle'] }) {
  if (!detalle) return null
  return (
    <p className="text-xs text-muted-foreground">
      Última copia: {detalle.cuando}
      {detalle.archivo && <> — <span className="font-mono">{detalle.archivo}</span></>}
      {detalle.en_destino != null && <> · {detalle.en_destino} copias guardadas afuera</>}
    </p>
  )
}

/** La tarjeta de la copia externa: ofrecerla, conectarla y mostrar cómo va.
 *
 *  Los estados, en el orden en que se deciden:
 *
 *  1. **Conectada desde esta pantalla** — a qué cuenta, cómo va la subida y el
 *     botón de desconectar.
 *  2. **Conectada a mano en el servidor** (`cliente.json`) — sólo el estado,
 *     como antes: esa conexión no se toca desde acá.
 *  3. **Con el plan y sin conectar** — los botones de los proveedores.
 *  4. **Sin el plan** — la propuesta. No es una alarma.
 *
 *  🔴 La conexión la hace el navegador del cliente yendo a Google o Dropbox y
 *  volviendo: el backend redirige de vuelta a Configuración con
 *  `?resguardo=ok|error`, y es esta tarjeta la que lo cuenta.
 */
export function ResguardoExternoCard({ basePath = '/api/config', navegar = irA }: {
  basePath?: string
  /** A dónde mandar al navegador para el consentimiento. Por defecto
   *  `window.location.assign`, que en jsdom no se puede espiar. */
  navegar?: (url: string) => void
} = {}) {
  const [retorno] = useState(leerRetorno)
  const [estado, setEstado] = useState<ResguardoExterno | null>(null)
  const [enlace, setEnlace] = useState<RespuestaEnlace>(null)
  const [cargado, setCargado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState<string | null>(
    retorno && !retorno.ok ? (retorno.detalle ?? 'No se pudo conectar la cuenta.') : null,
  )
  const [aviso, setAviso] = useState<string | null>(
    retorno?.ok ? 'Listo: la copia externa quedó conectada. La primera se sube esta noche.' : null,
  )

  useEffect(() => { limpiarRetorno() }, [])

  const cargar = useCallback(async () => {
    // Ninguno de los dos pedidos bloquea la pantalla: si fallan, la tarjeta se
    // achica o no aparece, y los backups locales se listan igual.
    const [e, n] = await Promise.all([
      api.get<ResguardoExterno>(`${basePath}/resguardo-externo`).catch(() => null),
      api.get<EnlaceNube>(`${basePath}/resguardo-externo/enlace`).then(
        (d): RespuestaEnlace => (d && Array.isArray(d.proveedores) ? d : null),
        (err): RespuestaEnlace => (err instanceof ApiError && err.status === 403 ? 'sin-plan' : null),
      ),
    ])
    setEstado(e)
    setEnlace(n)
    setCargado(true)
  }, [basePath])

  useEffect(() => { void cargar() }, [cargar])

  async function conectar(clave: string) {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      const r = await api.post<{ url: string }>(`${basePath}/resguardo-externo/enlace/${clave}`)
      // Queda "ocupado" a propósito: el navegador se está yendo de la página.
      navegar(r.url)
    } catch (err) {
      setError(describirError(err))
      setOcupado(false)
    }
  }

  async function desconectar(nombre: string) {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      const r = await api.del<{ revocado?: boolean }>(`${basePath}/resguardo-externo/enlace`)
      setAviso(r?.revocado
        ? 'Copia externa desconectada.'
        : `Copia externa desconectada. El permiso puede seguir figurando en tu cuenta de ${nombre}: si querés, quitalo desde ahí.`)
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  if (!cargado) return null

  const conPlan = enlace && enlace !== 'sin-plan' ? enlace : null
  const vinculo = conPlan?.enlace ?? null
  const subida = estado?.contratado ? estado : null

  const mensaje = (error || aviso) && (
    <p className={`text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error ?? aviso}</p>
  )

  if (vinculo) {
    const alDia = subida?.al_dia === true
    return (
      <Card className={`sm:col-span-2 ${!subida ? '' : alDia ? 'border-emerald-500/40' : 'border-amber-500/60'}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-base ${subida && !alDia ? 'text-amber-600 dark:text-amber-400' : ''}`}>
            <Cloud className="size-4" />
            Copia externa {!subida ? 'conectada' : alDia ? 'al día' : 'con problemas'}
          </CardTitle>
          <CardDescription>
            En tu {vinculo.nombre}
            {vinculo.cuenta && <> (<span className="font-medium">{vinculo.cuenta}</span>)</>}, carpeta{' '}
            <span className="font-mono">{vinculo.carpeta}</span>. Conectada el {fechaHora(vinculo.desde)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!subida ? (
            <p className="text-xs text-muted-foreground">
              Todavía no se subió ninguna copia: la primera sale esta noche, después del backup automático.
            </p>
          ) : alDia ? (
            <UltimaCopia detalle={subida.detalle} />
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400">{subida.motivo}</p>
          )}
          {mensaje}
          <div>
            <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => setConfirmar(true)}>
              <Unlink />Desconectar
            </Button>
          </div>
        </CardContent>
        <ConfirmDialog
          open={confirmar}
          onOpenChange={setConfirmar}
          title="¿Desconectar la copia externa?"
          description={`Las copias dejan de subirse a ${vinculo.nombre}. Las que ya están allá no se borran.`}
          confirmLabel="Desconectar"
          onConfirm={() => void desconectar(vinculo.nombre)}
        />
      </Card>
    )
  }

  if (subida) {
    return (
      <Card className={`sm:col-span-2 ${subida.al_dia ? 'border-emerald-500/40' : 'border-amber-500/60'}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-base ${subida.al_dia ? '' : 'text-amber-600 dark:text-amber-400'}`}>
            <Database className="size-4" />
            Copia externa {subida.al_dia ? 'al día' : 'con problemas'}
          </CardTitle>
          <CardDescription>
            {subida.al_dia
              ? <>Tus copias también se guardan fuera de este servidor, en <span className="font-mono">{subida.detalle?.destino}</span>.</>
              : subida.motivo}
          </CardDescription>
        </CardHeader>
        {subida.al_dia && subida.detalle && (
          <CardContent>
            <UltimaCopia detalle={subida.detalle} />
          </CardContent>
        )}
      </Card>
    )
  }

  if (conPlan) {
    return (
      <Card className="sm:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="size-4" />Copia externa
          </CardTitle>
          <CardDescription>
            Conectá tu propia cuenta y todas las noches se guarda ahí una copia de tus
            datos, así siguen estando aunque este servidor no esté. El sistema sólo ve
            la carpeta que crea para las copias, no el resto de tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {conPlan.proveedores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              La conexión con la nube todavía no está habilitada en este servidor. Consultanos.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {conPlan.proveedores.map((p) => (
                <Button key={p.clave} type="button" disabled={ocupado} onClick={() => void conectar(p.clave)}>
                  <Cloud />Conectar {p.nombre}
                </Button>
              ))}
            </div>
          )}
          {mensaje}
        </CardContent>
      </Card>
    )
  }

  if (enlace === 'sin-plan' || estado) {
    return (
      <Card className="border-dashed sm:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
            <Database className="size-4" />Copia externa
          </CardTitle>
          <CardDescription>
            Tus copias viven en este servidor. Con el resguardo externo se guardan
            todas las noches en tu propia cuenta de Google Drive o Dropbox, así
            siguen estando aunque el servidor no esté. Consultanos para activarlo.
          </CardDescription>
        </CardHeader>
        {mensaje && <CardContent>{mensaje}</CardContent>}
      </Card>
    )
  }

  return null
}

export function DatosBackupCard({ basePath = '/api/config' }: { basePath?: string } = {}) {
  const [backups, setBackups] = useState<BackupGuardado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aRestaurar, setARestaurar] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const recargar = useCallback(async () => {
    setError(null)
    try {
      setBackups(await api.get<BackupGuardado[]>(`${basePath}/backups`))
    } catch (err) {
      setError(describirError(err))
    }
  }, [basePath])

  useEffect(() => { void recargar() }, [recargar])

  function limpiarSeleccion() {
    setARestaurar(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function crear() {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      await api.post(`${basePath}/backups`)
      setAviso('Copia guardada en el servidor.')
      await recargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function restaurar(archivo: File) {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      const form = new FormData()
      form.append('backup_file', archivo)
      const r = await api.postForm<{ backup_previo?: string }>(`${basePath}/restore`, form)
      setAviso(r.backup_previo
        ? `Datos restaurados. El estado anterior quedó guardado como ${r.backup_previo}.`
        : 'Datos restaurados. Se guardó una copia del estado anterior antes de reemplazar.')
      await recargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
      limpiarSeleccion()
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="size-4" />Copia de tus datos
          </CardTitle>
          <CardDescription>
            Un archivo ZIP con la base de datos y los archivos del sistema.
            Guardalo fuera del servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {/* Link directo y no `fetch`: el navegador maneja la descarga con la
              misma cookie, sin pasar el ZIP entero por memoria del JS. */}
          <Button asChild className="w-full">
            <a href={`${basePath}/backup-ahora`} download><Download />Descargar copia ahora</a>
          </Button>
          <Button type="button" variant="outline" className="w-full" disabled={ocupado} onClick={() => void crear()}>
            {ocupado ? 'Trabajando…' : 'Guardar copia en el servidor'}
          </Button>
          <p className="text-xs text-muted-foreground">
            El .zip contiene todos tus datos más tus archivos —el logo y, si facturás,
            los certificados de ARCA—.
          </p>
        </CardContent>
      </Card>

      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
            <Upload className="size-4" />Restaurar base de datos
          </CardTitle>
          <CardDescription>
            Reemplaza <strong>todos</strong> los datos actuales por los del archivo.
            Antes de hacerlo, el sistema guarda solo una copia del estado actual.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Label htmlFor="backup-archivo">Archivo de backup (.zip)</Label>
          <Input
            id="backup-archivo" ref={inputRef} type="file" accept=".zip,application/zip"
            disabled={ocupado}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setARestaurar(f) }}
          />
        </CardContent>
      </Card>

      {/* Arriba de la lista: si la copia externa está fallando, es lo primero
          que el cliente tiene que ver al entrar a esta pantalla. */}
      <ResguardoExternoCard basePath={basePath} />

      {(error || aviso) && (
        <p className={`sm:col-span-2 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {error ?? aviso}
        </p>
      )}

      <Card className="sm:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4" />Copias guardadas en el servidor
          </CardTitle>
          <CardDescription>
            Se conservan las 10 más recientes. Se generan todas las noches, y también
            justo antes de cada restauración.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backups === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : backups.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Todavía no hay ninguna.</p>
          ) : (
            <ul className="divide-y">
              {backups.map((b) => (
                <li key={b.filename} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-mono font-medium">{b.filename}</p>
                    <p className="text-muted-foreground">{fechaHora(b.mtime)} — {b.size_mb} MB</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={`${basePath}/backups/${b.filename}`} download><Download />Descargar</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={aRestaurar !== null}
        onOpenChange={(abierto) => { if (!abierto) limpiarSeleccion() }}
        title="¿Estás seguro?"
        description={`Se van a reemplazar TODOS los datos actuales por los de ${aRestaurar?.name ?? ''}. El estado de ahora queda guardado como copia por si hace falta volver.`}
        confirmLabel="Restaurar"
        onConfirm={() => { if (aRestaurar) void restaurar(aRestaurar) }}
      />
    </div>
  )
}

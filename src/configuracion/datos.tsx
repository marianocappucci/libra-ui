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
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, Download, Upload } from 'lucide-react'

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

/** La tarjeta del resguardo externo, con sus tres estados. */
export function ResguardoExternoCard({ basePath = '/api/config' }: { basePath?: string } = {}) {
  const [estado, setEstado] = useState<ResguardoExterno | null>(null)

  useEffect(() => {
    // No bloquea la pantalla: si el endpoint no está —una instancia con un
    // LibraCore anterior a v1.32.0— la tarjeta simplemente no aparece.
    api.get<ResguardoExterno>(`${basePath}/resguardo-externo`)
      .then(setEstado)
      .catch(() => setEstado(null))
  }, [basePath])

  if (!estado) return null

  if (!estado.contratado) {
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
      </Card>
    )
  }

  return (
    <Card className={`sm:col-span-2 ${estado.al_dia ? 'border-emerald-500/40' : 'border-amber-500/60'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 text-base ${estado.al_dia ? '' : 'text-amber-600 dark:text-amber-400'}`}>
          <Database className="size-4" />
          Copia externa {estado.al_dia ? 'al día' : 'con problemas'}
        </CardTitle>
        <CardDescription>
          {estado.al_dia
            ? <>Tus copias también se guardan fuera de este servidor, en <span className="font-mono">{estado.detalle?.destino}</span>.</>
            : estado.motivo}
        </CardDescription>
      </CardHeader>
      {estado.al_dia && estado.detalle && (
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Última copia: {estado.detalle.cuando}
            {estado.detalle.archivo && <> — <span className="font-mono">{estado.detalle.archivo}</span></>}
            {estado.detalle.en_destino != null && <> · {estado.detalle.en_destino} copias guardadas afuera</>}
          </p>
        </CardContent>
      )}
    </Card>
  )
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

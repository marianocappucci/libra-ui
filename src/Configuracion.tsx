/** La pantalla de Configuración compartida (ítem 5 de los pendientes
 *  transversales del 2026-08-04).
 *
 *  > *"Todo el menú de configuración de contalibra disponible en todas las
 *  > suites según corresponda o no. (solo administradores)."*
 *
 *  El **"según corresponda"** es la parte importante del pedido, y por eso el
 *  producto declara sus secciones en vez de recibir una pantalla cerrada:
 *  MedLibra no imprime tickets de comanda, LibraDesk no factura por ARCA,
 *  VentaLibra sí hace las dos cosas. Mismo idioma que `createLayout({navItems})`.
 *
 *      export const Configuracion = createConfiguracion({
 *        secciones: [
 *          ...SECCIONES_BASE,                       // empresa, correo, datos
 *          { clave: 'ticket', label: 'Ticket', contenido: <ConfigTicket /> },
 *        ],
 *      })
 *
 *  ## El conmutador es propio y no `@/components/ui/tabs`
 *
 *  De los cuatro consumidores, **sólo MedLibra tiene el componente `tabs`**
 *  instalado (medido el 2026-08-05). Un paquete compartido que lo importara
 *  rompería el build de los otros tres, y agregarlo en cada uno para esto sería
 *  arrastrar una dependencia por un conmutador de cuatro botones.
 *
 *  ## La sección activa va en la URL
 *
 *  `?seccion=datos`, para que se pueda mandar "andá a Datos / Backup" por
 *  mensaje y el botón "atrás" del navegador haga lo que se espera. Es lo mismo
 *  que LibraDesk resolvió con una ruta por pestaña; acá va en el query para que
 *  el producto monte **una sola** ruta.
 */
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Database, Download, Mail, Receipt, Upload } from 'lucide-react'
import { api, ApiError } from './api-client'
import { ConfiguracionSmtp } from './ConfiguracionSmtp'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export type SeccionConfig = {
  clave: string
  label: string
  icono?: ComponentType<{ className?: string }>
  contenido: ReactNode
}

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}


// ── Empresa ───────────────────────────────────────────────────────────────

export type DatosEmpresa = {
  empresa_nombre: string
  empresa_direccion: string
  empresa_cuit: string
  empresa_telefono: string
  empresa_email: string
  empresa_iibb: string
  empresa_iva_condition: string
  empresa_inicio_actividades: string
}

const VACIO: DatosEmpresa = {
  empresa_nombre: '', empresa_direccion: '', empresa_cuit: '', empresa_telefono: '',
  empresa_email: '', empresa_iibb: '', empresa_iva_condition: 'Monotributista',
  empresa_inicio_actividades: '',
}

const CAMPOS: { key: keyof DatosEmpresa; label: string; placeholder?: string }[] = [
  { key: 'empresa_nombre', label: 'Nombre o razón social' },
  { key: 'empresa_cuit', label: 'CUIT', placeholder: '20-12345678-9' },
  { key: 'empresa_direccion', label: 'Dirección' },
  { key: 'empresa_telefono', label: 'Teléfono' },
  { key: 'empresa_email', label: 'Email' },
  { key: 'empresa_iibb', label: 'Ingresos brutos' },
  { key: 'empresa_inicio_actividades', label: 'Inicio de actividades', placeholder: '01/2020' },
]

const CONDICIONES_IVA = [
  'Responsable Inscripto', 'Monotributista', 'IVA Exento',
  'Consumidor Final', 'No Alcanzado',
]

/** Los ocho campos que encabezan comprobantes y PDF. */
export function EmpresaCard() {
  const [datos, setDatos] = useState<DatosEmpresa>(VACIO)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    try {
      setDatos(await api.get<DatosEmpresa>('/api/config/empresa'))
    } catch (err) {
      setError(describirError(err))
    } finally {
      setCargando(false)
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setGuardado(false)
    try {
      setDatos(await api.put<DatosEmpresa>('/api/config/empresa', datos))
      setGuardado(true)
    } catch (err) {
      setError(describirError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos de la empresa</CardTitle>
        <CardDescription>
          Encabezan los comprobantes y los PDF. Si quedan vacíos, salen sin datos
          del emisor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <form className="grid gap-4" onSubmit={guardar}>
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS.map(({ key, label, placeholder }) => (
                <div key={key} className="grid gap-2">
                  <Label htmlFor={`cfg-${key}`}>{label}</Label>
                  <Input
                    id={`cfg-${key}`}
                    value={datos[key]}
                    placeholder={placeholder}
                    onChange={(e) => setDatos({ ...datos, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="grid gap-2">
                <Label>Condición frente al IVA</Label>
                <Select
                  value={datos.empresa_iva_condition}
                  onValueChange={(v) => setDatos({ ...datos, empresa_iva_condition: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDICIONES_IVA.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {guardado && <p className="text-sm text-muted-foreground">Datos guardados.</p>}

            <div>
              <Button type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}


/** El logo que encabeza los comprobantes.
 *
 *  El generador de PDF de LibraCore ya lo buscaba en `LOGO_DIR`; lo que no
 *  existía hasta v1.10.0 era el modo de ponerlo ahí sin entrar al volumen del
 *  contenedor.
 */
export function LogoCard() {
  // `version` fuerza a recargar la imagen después de subir o borrar: el
  // navegador cachea la URL y sin esto se sigue viendo el logo anterior aunque
  // el nuevo ya esté en el servidor.
  const [version, setVersion] = useState(0)
  const [hayLogo, setHayLogo] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/config/empresa/logo', { credentials: 'include' })
      .then((r) => { if (vivo) setHayLogo(r.ok) })
      .catch(() => { if (vivo) setHayLogo(false) })
    return () => { vivo = false }
  }, [version])

  async function subir(archivo: File) {
    setSubiendo(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('logo', archivo)
      await api.postForm('/api/config/empresa/logo', form)
      setVersion((v) => v + 1)
    } catch (err) {
      setError(describirError(err))
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function borrar() {
    setError(null)
    try {
      await api.del('/api/config/empresa/logo')
      setVersion((v) => v + 1)
    } catch (err) {
      setError(describirError(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logo</CardTitle>
        <CardDescription>
          Sale en el encabezado de los comprobantes. PNG o JPG.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {hayLogo === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : hayLogo ? (
          <img
            src={`/api/config/empresa/logo?v=${version}`}
            alt="Logo de la empresa"
            className="max-h-24 w-auto rounded border bg-white object-contain p-2"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no hay logo cargado; los comprobantes salen sin él.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f) }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={subiendo}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {subiendo ? 'Subiendo…' : hayLogo ? 'Reemplazar' : 'Subir logo'}
          </Button>
          {hayLogo && (
            <Button type="button" variant="outline" onClick={borrar}>Quitar</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}


// ── Datos / Backup ────────────────────────────────────────────────────────

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

/** La tarjeta del resguardo externo, con sus tres estados.
 *
 *  Vive acá y no en cada producto porque `libra-ui` es lo que comparten las
 *  pantallas de Configuración de Gestiolibra, MedLibra y VentaLibra: escrita una
 *  vez, la tienen los tres.
 */
export function ResguardoExternoCard() {
  const [estado, setEstado] = useState<ResguardoExterno | null>(null)

  useEffect(() => {
    // No bloquea la pantalla: si el endpoint no está —una instancia con un
    // LibraCore anterior a v1.32.0— la tarjeta simplemente no aparece.
    api.get<ResguardoExterno>('/api/config/resguardo-externo')
      .then(setEstado)
      .catch(() => setEstado(null))
  }, [])

  if (!estado) return null

  if (!estado.contratado) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">Copia externa</CardTitle>
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
    <Card className={estado.al_dia ? 'border-emerald-500/40' : 'border-amber-500/60'}>
      <CardHeader>
        <CardTitle className={`text-base ${estado.al_dia ? '' : 'text-amber-600 dark:text-amber-400'}`}>
          Copia externa {estado.al_dia ? 'al día' : 'con problemas'}
        </CardTitle>
        <CardDescription>
          {estado.al_dia
            ? <>También se guarda fuera de este servidor, en <span className="font-mono">{estado.detalle?.destino}</span>.</>
            : estado.motivo}
        </CardDescription>
      </CardHeader>
      {estado.al_dia && estado.detalle && (
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Última copia: {estado.detalle.cuando}
            {estado.detalle.en_destino != null && <> · {estado.detalle.en_destino} guardadas afuera</>}
          </p>
        </CardContent>
      )}
    </Card>
  )
}

/** Bajar una copia de los datos, y volver a una anterior.
 *
 *  El archivo es un **ZIP con las bases y los archivos de la instancia**, no un
 *  `.db` suelto: tres productos de la familia tienen `usuarios` en una base
 *  separada del dominio, y MedLibra guarda además los documentos clínicos en
 *  disco. Ver `libracore/respaldo.py`.
 */
export function DatosBackupCard() {
  const [backups, setBackups] = useState<BackupGuardado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aRestaurar, setARestaurar] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { recargar() }, [])

  async function recargar() {
    setError(null)
    try {
      setBackups(await api.get<BackupGuardado[]>('/api/config/backups'))
    } catch (err) {
      setError(describirError(err))
    }
  }

  async function crear() {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      await api.post('/api/config/backups')
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
      const r = await api.postForm<{ backup_previo: string }>('/api/config/restore', form)
      setAviso(`Datos restaurados. El estado anterior quedó guardado como ${r.backup_previo}.`)
      await recargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
      setARestaurar(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="grid gap-4">
      {/* Va arriba de todo: si la copia externa está fallando, es lo primero
          que el cliente tiene que ver al entrar a esta pantalla. */}
      <ResguardoExternoCard />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Copia de tus datos</CardTitle>
          <CardDescription>
            Un archivo ZIP con la base de datos y los archivos del sistema.
            Guardalo fuera del servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {/* Link directo y no `fetch`: el navegador maneja la descarga con la
              misma cookie, sin pasar el ZIP entero por memoria del JS. */}
          <Button asChild>
            <a href="/api/config/backup-ahora">
              <Download className="mr-2 h-4 w-4" />
              Descargar copia
            </a>
          </Button>
          <Button type="button" variant="outline" disabled={ocupado} onClick={crear}>
            {ocupado ? 'Trabajando…' : 'Guardar copia en el servidor'}
          </Button>
        </CardContent>
      </Card>

      {(error || aviso) && (
        <p className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {error ?? aviso}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Copias guardadas en el servidor</CardTitle>
          <CardDescription>
            Se conservan las 10 más recientes. Las de <code>antes_restore</code> las
            hace el sistema solo, justo antes de restaurar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backups === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay ninguna.</p>
          ) : (
            <ul className="grid gap-2">
              {backups.map((b) => (
                <li key={b.filename} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">{b.mtime}</Badge>
                  <span className="text-muted-foreground">{b.size_mb} MB</span>
                  <a className="underline" href={`/api/config/backups/${b.filename}`}>
                    {b.filename}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restaurar</CardTitle>
          <CardDescription>
            Reemplaza <strong>todos</strong> los datos actuales por los del archivo.
            Antes de hacerlo, el sistema guarda solo una copia del estado actual.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setARestaurar(f) }}
          />
          {aRestaurar === null ? (
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={ocupado}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Elegir archivo y restaurar
              </Button>
            </div>
          ) : (
            // Confirmación en dos pasos, en la misma tarjeta. No se usa un
            // diálogo porque `alert-dialog` no está instalado en los tres
            // consumidores; lo que importa es que **elegir el archivo no
            // dispare el restore**, y eso se cumple igual.
            <div className="grid gap-2 rounded border border-destructive/40 p-3">
              <p className="text-sm">
                Se van a reemplazar todos los datos actuales por los de{' '}
                <strong>{aRestaurar.name}</strong>. El estado de ahora queda
                guardado como copia por si hace falta volver.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={ocupado}
                  onClick={() => restaurar(aRestaurar)}
                >
                  {ocupado ? 'Restaurando…' : 'Restaurar'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => {
                    setARestaurar(null)
                    if (inputRef.current) inputRef.current.value = ''
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


// ── ARCA ──────────────────────────────────────────────────────────────────

export type ConfigArca = {
  empresa: string
  cuit: string
  punto_venta: number
  ambiente: string
  certificado_path: string
  clave_path: string
}

/** Facturación electrónica. Los tres verticales de instancia única
 *  (Gestiolibra, MedLibra, VentaLibra) tienen el mismo `GET`/`PUT
 *  /config/arca` — se verificó que los routers son idénticos antes de
 *  compartir esta pantalla. */
export function ArcaCard() {
  const [cuit, setCuit] = useState('')
  const [puntoVenta, setPuntoVenta] = useState('1')
  const [certificadoPath, setCertificadoPath] = useState('')
  const [clavePath, setClavePath] = useState('')
  const [ambiente, setAmbiente] = useState('homologacion')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    try {
      const cfg = await api.get<ConfigArca | null>('/config/arca')
      if (cfg) {
        setCuit(cfg.cuit)
        setPuntoVenta(String(cfg.punto_venta))
        setCertificadoPath(cfg.certificado_path)
        setClavePath(cfg.clave_path)
        setAmbiente(cfg.ambiente)
      }
    } catch (err) {
      setError(describirError(err))
    } finally {
      setCargando(false)
    }
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    setGuardado(false)
    try {
      await api.put('/config/arca', {
        cuit, punto_venta: Number(puntoVenta),
        certificado_path: certificadoPath, clave_path: clavePath, ambiente,
      })
      setGuardado(true)
    } catch (err) {
      setError(describirError(err))
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Facturación electrónica (ARCA)</CardTitle>
        <CardDescription>
          El certificado y la clave se referencian por path en el servidor —
          subir el archivo real sigue siendo una tarea manual.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-w-lg gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="arca-cuit">CUIT</Label>
          <Input id="arca-cuit" value={cuit} onChange={(e) => setCuit(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="arca-pv">Punto de venta</Label>
          <Input
            id="arca-pv" className="w-32" value={puntoVenta}
            onChange={(e) => setPuntoVenta(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Ambiente</Label>
          <Select value={ambiente} onValueChange={setAmbiente}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="homologacion">Homologación</SelectItem>
              <SelectItem value="produccion">Producción</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="arca-cert">Path del certificado</Label>
          <Input
            id="arca-cert" value={certificadoPath}
            onChange={(e) => setCertificadoPath(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="arca-clave">Path de la clave privada</Label>
          <Input
            id="arca-clave" value={clavePath}
            onChange={(e) => setClavePath(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {guardado && <p className="text-sm text-muted-foreground">Guardado.</p>}
        <div>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}


// ── El armado ─────────────────────────────────────────────────────────────

/** Las tres secciones que aplican a **los seis** productos.
 *
 *  El producto las extiende con las suyas — el "según corresponda" del pedido
 *  se declara ahí, no acá.
 */
export const SECCIONES_BASE: SeccionConfig[] = [
  {
    clave: 'empresa',
    label: 'Empresa',
    icono: Building2,
    contenido: <><EmpresaCard /><LogoCard /></>,
  },
  {
    clave: 'correo',
    label: 'Correo',
    icono: Mail,
    // Sin esto el `forgot-password` de las seis suites devuelve
    // `503 "el envío de correo no está configurado"`: el mecanismo está
    // terminado desde libraauth v0.5.0 y lo que faltaba era la pantalla para
    // cargar el SMTP.
    contenido: <ConfiguracionSmtp />,
  },
  {
    clave: 'datos',
    label: 'Datos / Backup',
    icono: Database,
    contenido: <DatosBackupCard />,
  },
]

/** La sección de ARCA, para los productos que facturan. */
export const SECCION_ARCA: SeccionConfig = {
  clave: 'arca',
  label: 'ARCA',
  icono: Receipt,
  contenido: <ArcaCard />,
}

export function createConfiguracion({ secciones }: { secciones: SeccionConfig[] }) {
  if (secciones.length === 0) {
    throw new Error('createConfiguracion necesita al menos una sección')
  }

  return function Configuracion() {
    const [params, setParams] = useSearchParams()
    const pedida = params.get('seccion')
    const actual = secciones.find((s) => s.clave === pedida) ?? secciones[0]

    return (
      <div className="grid gap-4">
        <h2 className="text-lg font-semibold">Configuración</h2>

        <nav className="flex flex-wrap gap-1 border-b" aria-label="Secciones de configuración">
          {secciones.map((s) => {
            const activa = s.clave === actual.clave
            const Icono = s.icono
            return (
              <button
                key={s.clave}
                type="button"
                aria-current={activa ? 'page' : undefined}
                onClick={() => setParams({ seccion: s.clave })}
                className={
                  'flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ' +
                  (activa
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground')
                }
              >
                {Icono && <Icono className="h-4 w-4" />}
                {s.label}
              </button>
            )
          })}
        </nav>

        <div className="grid gap-4">{actual.contenido}</div>
      </div>
    )
  }
}

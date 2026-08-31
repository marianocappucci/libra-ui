// Pantalla de configuración del correo saliente (v0.10.0), contraparte de
// los endpoints de libraauth v0.6.x.
//
// Vive acá y no en cada producto por lo mismo que Usuarios y PasswordReset:
// son seis productos, y esta pantalla tiene una regla que es fácil de romper
// escribiéndola seis veces — ver `cuerpoAGuardar` más abajo.
import { useEffect, useState } from 'react'
import { api, ApiError } from './api-client'
import { PasswordInput } from './PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export type EstadoSmtp = {
  origen: 'base' | 'entorno'
  host: string
  port: number
  user: string
  from_email: string
  from_name: string
  password_definida: boolean
  password_indescifrable: boolean
  configurado: boolean
}

type Formulario = {
  host: string
  port: string
  user: string
  from_email: string
  from_name: string
}

const VACIO: Formulario = { host: '', port: '587', user: '', from_email: '', from_name: '' }

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

function aFormulario(e: EstadoSmtp): Formulario {
  return {
    host: e.host, port: String(e.port || 587), user: e.user,
    from_email: e.from_email, from_name: e.from_name,
  }
}

/**
 * Arma el cuerpo del PUT. **Es la parte delicada de esta pantalla.**
 *
 * El backend distingue tres intenciones sobre la contraseña y las distingue
 * por la PRESENCIA de la clave, no por su valor:
 *
 *   - clave ausente  -> dejarla como está
 *   - `null` o `""`  -> borrarla
 *   - un string      -> reemplazarla
 *
 * Mandar `password: ''` porque el campo del formulario está vacío —que es lo
 * que sale natural— **borraría en silencio** la contraseña guardada cada vez
 * que alguien edita el remitente. Por eso la clave sólo se incluye si se
 * tipeó algo o si se pidió borrarla explícitamente.
 */
export function cuerpoAGuardar(
  form: Formulario, passwordTipeada: string, borrarPassword: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    host: form.host.trim(),
    port: Number(form.port) || 587,
    user: form.user.trim(),
    from_email: form.from_email.trim(),
    from_name: form.from_name.trim(),
  }
  if (borrarPassword) return { ...base, password: '' }
  if (passwordTipeada !== '') return { ...base, password: passwordTipeada }
  return base
}

// `basePath` es la ruta de los endpoints en el backend. Default
// '/admin/smtp', que es donde montan el router del motor los 4 productos
// FastAPI; Contalibra y Restolibra escriben endpoints propios en
// '/api/config/smtp' y pasan esa ruta. Mismo criterio que el `basePath` de
// Usuarios.
/** Donde seis de los ocho productos montan el router de SMTP de libraauth
 *  —es el default de ese router—. Se exporta para que `EmailCard` arme la
 *  URL de *Probar conexión* con **el mismo valor** que el formulario usa
 *  para leer y guardar: dos defaults iguales escritos en dos lugares es uno
 *  que se olvida de cambiar. */
export const RUTA_SMTP_POR_DEFECTO = '/admin/smtp'

export function ConfiguracionSmtp(
  { basePath = RUTA_SMTP_POR_DEFECTO }: { basePath?: string } = {},
) {
  const [estado, setEstado] = useState<EstadoSmtp | null>(null)
  const [form, setForm] = useState<Formulario>(VACIO)
  const [passwordTipeada, setPasswordTipeada] = useState('')
  const [borrarPassword, setBorrarPassword] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    setCargando(true)
    try {
      const e = await api.get<EstadoSmtp>(basePath)
      setEstado(e)
      setForm(aFormulario(e))
    } catch (err) {
      setError(describirError(err))
    } finally {
      setCargando(false)
    }
  }

  function actualizar(campo: keyof Formulario, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function guardar() {
    if (!form.host.trim()) {
      setError('El servidor SMTP es obligatorio.')
      return
    }
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const nuevo = await api.put<EstadoSmtp>(
        basePath, cuerpoAGuardar(form, passwordTipeada, borrarPassword),
      )
      setEstado(nuevo)
      setForm(aFormulario(nuevo))
      setPasswordTipeada('')
      setBorrarPassword(false)
      setAviso('Configuración guardada.')
    } catch (err) {
      setError(describirError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function volverAlEntorno() {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const nuevo = await api.del<EstadoSmtp>(basePath)
      setEstado(nuevo)
      setForm(aFormulario(nuevo))
      setPasswordTipeada('')
      setBorrarPassword(false)
      setAviso('Se borró la configuración guardada. Vuelve a usarse la del entorno.')
    } catch (err) {
      setError(describirError(err))
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Correo saliente</CardTitle>
          <CardDescription>
            Servidor por el que se envían los correos de recuperación de contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {estado && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <p>
                <span className="font-medium">Estado: </span>
                {estado.configurado
                  ? 'configurado — se pueden enviar correos.'
                  : 'sin configurar — los pedidos de recuperación de contraseña van a fallar.'}
              </p>
              <p className="text-muted-foreground">
                {estado.origen === 'base'
                  ? 'Se está usando esta configuración, guardada en el sistema.'
                  : 'Todavía no se guardó nada acá: se están usando las variables de entorno del servidor.'}
              </p>
              {estado.password_indescifrable && (
                <p className="font-medium text-destructive">
                  La contraseña guardada no se puede leer. Suele pasar cuando se cambió
                  la clave de seguridad del sistema: escribila de nuevo y guardá.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          {aviso && <p className="text-sm font-medium text-primary">{aviso}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtp-host">Servidor</Label>
              <Input
                id="smtp-host" value={form.host} placeholder="smtp.miempresa.com"
                onChange={(e) => actualizar('host', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">Puerto</Label>
              <Input
                id="smtp-port" type="number" value={form.port}
                onChange={(e) => actualizar('port', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-user">Usuario</Label>
              <Input
                id="smtp-user" value={form.user} placeholder="cuenta@miempresa.com"
                onChange={(e) => actualizar('user', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-password">Contraseña</Label>
              <PasswordInput
                id="smtp-password"
                value={passwordTipeada}
                disabled={borrarPassword}
                placeholder={
                  estado?.password_definida
                    ? 'Guardada — dejalo vacío para no cambiarla'
                    : 'Sin contraseña'
                }
                onChange={(e) => setPasswordTipeada(e.target.value)}
              />
              {estado?.password_definida && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox" checked={borrarPassword}
                    onChange={(e) => {
                      setBorrarPassword(e.target.checked)
                      if (e.target.checked) setPasswordTipeada('')
                    }}
                  />
                  Quitar la contraseña guardada
                </label>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-from-email">Remitente</Label>
              <Input
                id="smtp-from-email" value={form.from_email} placeholder="no-responder@miempresa.com"
                onChange={(e) => actualizar('from_email', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Si lo dejás vacío se usa el usuario. La mayoría de los proveedores exige
                que coincidan.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-from-name">Nombre del remitente</Label>
              <Input
                id="smtp-from-name" value={form.from_name} placeholder="Soporte"
                onChange={(e) => actualizar('from_name', e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
            {estado?.origen === 'base' && (
              <Button variant="outline" onClick={volverAlEntorno} disabled={guardando}>
                Borrar y usar la del servidor
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            La contraseña se guarda cifrada y no vuelve a mostrarse.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// Pantallas de recuperación de contraseña (v0.7.0), contraparte de los
// endpoints opt-in de libraauth v0.5.0 (`POST /auth/forgot-password` y
// `POST /auth/reset-password`).
//
// Viven acá y no en cada producto por lo mismo que Login/Usuarios: son seis
// productos y el texto de estas pantallas tiene que ser cuidadoso (ver el
// comentario sobre no revelar existencia, abajo). Escribirlo seis veces es
// seis oportunidades de que una lo diga distinto.
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError, type User } from './api-client'
import { PasswordInput } from './PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Branding = {
  productName: string
  productInitial: string
  // Ruta del router de auth en el backend. Default '/auth', que es donde lo
  // montan los 6 productos; existe por la misma razón que el `basePath` de
  // Usuarios -- que un producto pueda no seguir la convención.
  basePath?: string
  loginPath?: string
}

function Shell({ productName, productInitial, title, description, children }: {
  productName: string; productInitial: string; title: string
  description: string; children: ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
            {productInitial}
          </div>
          <CardTitle className="text-xl">{productName}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <h1 className="sr-only">{title}</h1>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}

export function createForgotPassword({
  productName, productInitial, basePath = '/auth', loginPath = '/login',
}: Branding) {
  return function ForgotPassword() {
    const [identificador, setIdentificador] = useState('')
    const [enviado, setEnviado] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent) {
      event.preventDefault()
      setError(null)
      setSubmitting(true)
      try {
        await api.post(`${basePath}/forgot-password`, { identificador })
        setEnviado(true)
      } catch (err) {
        // El 503 (instancia sin SMTP configurado) se muestra tal cual: no
        // depende de si la cuenta existe, así que decirlo no filtra nada, y
        // callarlo dejaría a la persona esperando un mail que nadie puede
        // mandar.
        setError(err instanceof ApiError && err.status === 503
          ? 'El envío de correo no está configurado en este sistema. Avisale a quien lo administra.'
          : 'No pudimos procesar el pedido. Probá de nuevo en un momento.')
      } finally {
        setSubmitting(false)
      }
    }

    if (enviado) {
      return (
        <Shell productName={productName} productInitial={productInitial}
               title="Revisá tu correo" description="Revisá tu correo">
          {/* El mensaje NO confirma que la cuenta exista: el backend
              responde igual en los dos casos justamente para que este
              endpoint no sirva para averiguar quién está dado de alta, y
              un texto tipo "te mandamos un mail" lo delataría igual. */}
          <p className="text-sm text-muted-foreground">
            Si hay una cuenta con ese usuario o correo, te enviamos un enlace para
            elegir una contraseña nueva. El enlace vence en una hora.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            ¿No te llegó? Fijate en el correo no deseado, o probá de nuevo.
          </p>
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link to={loginPath}>Volver al inicio de sesión</Link>
          </Button>
        </Shell>
      )
    }

    return (
      <Shell productName={productName} productInitial={productInitial}
             title="Recuperar contraseña" description="Recuperá tu contraseña">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="identificador">Usuario o correo</Label>
            <Input
              id="identificador"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              Te mandamos un enlace al correo asociado a la cuenta.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Enviando…' : 'Enviar enlace'}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to={loginPath}>Volver</Link>
          </Button>
        </form>
      </Shell>
    )
  }
}

export function createResetPassword({
  productName, productInitial, basePath = '/auth', loginPath = '/login',
  minLength = 6,
}: Branding & { minLength?: number }) {
  return function ResetPassword() {
    const [params] = useSearchParams()
    const token = params.get('token') ?? ''
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [repetida, setRepetida] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [listo, setListo] = useState(false)

    async function handleSubmit(event: FormEvent) {
      event.preventDefault()
      // Se chequea acá y no solo en el backend porque el motor no recibe la
      // repetición: es una confirmación de tipeo, no una regla de dominio.
      if (password !== repetida) {
        setError('Las dos contraseñas no coinciden.')
        return
      }
      setError(null)
      setSubmitting(true)
      try {
        await api.post<User>(`${basePath}/reset-password`, { token, new_password: password })
        setListo(true)
        // El backend no crea sesión a propósito: entrar con la contraseña
        // nueva es lo que confirma que quedó bien.
        setTimeout(() => navigate(loginPath, { replace: true }), 2500)
      } catch (err) {
        setError(err instanceof ApiError
          ? (err.status === 400
              ? 'El enlace no es válido o ya venció. Pedí uno nuevo.'
              : err.detail)
          : 'Error de conexión.')
      } finally {
        setSubmitting(false)
      }
    }

    if (!token) {
      return (
        <Shell productName={productName} productInitial={productInitial}
               title="Enlace incompleto" description="Enlace incompleto">
          <p className="text-sm text-muted-foreground">
            Este enlace no trae el código de recuperación. Copialo completo desde el
            correo, o pedí uno nuevo.
          </p>
          <Button asChild className="mt-4 w-full">
            <Link to={loginPath}>Volver al inicio de sesión</Link>
          </Button>
        </Shell>
      )
    }

    if (listo) {
      return (
        <Shell productName={productName} productInitial={productInitial}
               title="Contraseña actualizada" description="Contraseña actualizada">
          <p className="text-sm text-muted-foreground">
            Listo. Ya podés entrar con tu contraseña nueva.
          </p>
          <Button asChild className="mt-4 w-full">
            <Link to={loginPath}>Ir al inicio de sesión</Link>
          </Button>
        </Shell>
      )
    }

    return (
      <Shell productName={productName} productInitial={productInitial}
             title="Elegir contraseña nueva" description="Elegí una contraseña nueva">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña nueva</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={minLength}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">Mínimo {minLength} caracteres.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="repetida">Repetir contraseña</Label>
            <PasswordInput
              id="repetida"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      </Shell>
    )
  }
}

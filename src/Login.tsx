// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era idéntico salvo branding/redirectTo -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md. `createLogin()`
// recibe esa parte propia de cada producto como config.
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { api, ApiError, type User } from './api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordInput } from './PasswordInput'
import type { ProductLogo } from './branding'
import { cn } from './utils'

// Default = User (el tipo concreto de la instancia pre-configurada de
// AuthContext.tsx) -- coincide con lo que devuelve el `useAuth` por
// defecto de mas abajo cuando no se pasa `useAuth` propio, evitando un
// mismatch de tipos para Gestiolibra/MedLibra/VentaLibra (que no pasan
// TUser explicito). Contalibra/Restolibra pasan su propio `TUser` +
// `useAuth` juntos, consistentes entre si.
export function createLogin<TUser = User>({
  productName, productInitial, redirectTo, onLoginSuccess, useAuth: useAuthOverride, formatError,
  forgotPasswordPath, demoPath, logo, wordmarkClassName,
}: {
  productName: string
  productInitial: string
  redirectTo: string
  // Logo del producto, arriba del nombre. Si se pasa, reemplaza al box con la
  // inicial; si no, no cambia nada. Ver `branding.ts`.
  logo?: ProductLogo
  // Clases extra para el nombre del producto. Se mergean con `text-xl` via
  // `cn`, así que el producto puede pisar tamaño, peso y color sin perder el
  // resto. LibraDesk lo usa para su Montserrat Bold.
  wordmarkClassName?: string
  // Decide el destino segun el usuario logueado (ej. redirigir un rol
  // especifico a una pantalla propia) -- si no se pasa, siempre navega a
  // `redirectTo`, comportamiento identico al de antes de v0.3.0.
  onLoginSuccess?: (user: TUser) => string
  // Hook `useAuth` a usar -- por defecto el de la instancia pre-configurada
  // de este mismo modulo (Gestiolibra/MedLibra/VentaLibra). Productos con
  // su propia `createAuthContext` (Contalibra/Restolibra) pasan el suyo.
  useAuth?: () => { login: (username: string, password: string) => Promise<TUser> }
  // Mensaje de error a mostrar ante un ApiError -- por defecto un mensaje
  // generico ("Usuario o contraseña incorrectos."), igual que siempre.
  // Contalibra/Restolibra muestran el detalle real del backend
  // (`err.detail`, que puede incluir cosas como "Cuenta suspendida").
  formatError?: (err: ApiError) => string
  // Ruta de la pantalla de "olvidé mi contraseña" (ej. '/forgot-password').
  // **Opt-in**: sin esto no se muestra el enlace, porque la recuperación es
  // opt-in también en el backend (libraauth v0.5.0) — mostrarlo en un
  // producto que no la tenga prendida sería un link a una pantalla que
  // termina en 404.
  forgotPasswordPath?: string
  // Ruta del auto-login de la demo pública (ej. '/auth/demo', o '/api/demo'
  // en Contalibra/Restolibra). **Opt-in en la config, y además condicionado
  // en runtime**: aunque el producto la pase, el botón sólo aparece si la
  // instancia contesta la sonda con JSON.
  //
  // 🔴 **Por qué no alcanza con que el producto lo declare, ni con un 200.**
  // La imagen de la demo y la del cliente salen del mismo código, así que
  // esto no se puede decidir en tiempo de build. Y la sonda no se puede
  // evaluar por código de estado: estos productos sirven la SPA con un
  // catch-all, así que un GET a una ruta inexistente devuelve **200 con el
  // index.html** — medido el 2026-08-06. Un botón condicionado a "me
  // contestó 200" aparecería en la instancia de todos los clientes.
  // `api.get` devuelve `undefined` cuando la respuesta no es JSON, y de ahí
  // sale el chequeo de forma de abajo.
  demoPath?: string
}) {
  return function Login() {
    // Cast puntual: TS no puede unificar el tipo generico TUser (para
    // quien pasa `useAuthOverride`) con el tipo concreto `User` de la
    // instancia por defecto dentro del cuerpo de una funcion generica --
    // limitacion conocida de TS con defaults de tipo. Ambas ramas
    // devuelven la misma forma en runtime, el cast es seguro.
    const { login } = (useAuthOverride ?? useAuth)() as { login: (username: string, password: string) => Promise<TUser> }
    const navigate = useNavigate()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [demo, setDemo] = useState<{ username: string } | null>(null)
    const [entrandoALaDemo, setEntrandoALaDemo] = useState(false)

    useEffect(() => {
      if (!demoPath) return
      let vivo = true
      api.get<{ enabled?: boolean; username?: string } | undefined>(demoPath)
        .then((info) => {
          // Se exige la FORMA, no el resultado de la request. Ver el
          // comentario de `demoPath`: acá llega `undefined` tanto por un 200
          // con HTML como por un 204, y ninguno de los dos es una demo.
          if (vivo && info?.enabled === true && typeof info.username === 'string') {
            setDemo({ username: info.username })
          }
        })
        // Una instancia normal contesta 404/405 y `api.get` tira: no es un
        // error que mostrar, es la respuesta esperada en 5 de cada 6 casos.
        .catch(() => {})
      return () => { vivo = false }
    }, [])

    async function entrarALaDemo() {
      setError(null)
      setEntrandoALaDemo(true)
      try {
        await api.post(demoPath as string)
        // Recarga entera en vez de `navigate`: el POST deja la cookie de
        // sesión puesta, pero el `AuthProvider` ya montó con `user = null` y
        // no tiene forma de enterarse — navegar sin recargar rebota contra
        // el guard de rutas y devuelve al login, que es exactamente el
        // síntoma que se está arreglando. Recargando, el provider vuelve a
        // pedir `/me` y entra con la sesión que acaba de crearse.
        window.location.assign(redirectTo)
      } catch (err) {
        setError(err instanceof ApiError
          // El 503 del motor es informativo ("demo user not provisioned"):
          // pasa cuando la instancia todavía no se sembró, y decir
          // "credenciales incorrectas" mandaría a mirar el lugar equivocado.
          ? `No se pudo entrar a la demo: ${err.detail}`
          : 'Error de conexión.')
        setEntrandoALaDemo(false)
      }
    }

    async function handleSubmit(event: FormEvent) {
      event.preventDefault()
      setError(null)
      setSubmitting(true)
      try {
        const user = await login(username, password)
        navigate(onLoginSuccess ? onLoginSuccess(user) : redirectTo, { replace: true })
      } catch (err) {
        setError(err instanceof ApiError ? (formatError ? formatError(err) : 'Usuario o contraseña incorrectos.') : 'Error de conexión.')
      } finally {
        setSubmitting(false)
      }
    }

    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            {logo ? (
              <img
                src={logo.src}
                alt={logo.alt ?? productName}
                // `max-w-none` por lo mismo que en Layout.tsx: el preflight de
                // Tailwind clampea toda imagen a `max-width: 100%`, y el logo
                // tiene que medir lo que pide el producto, no lo que le deje el
                // contenedor.
                className={cn('mx-auto mb-2 block h-10 w-10 max-w-none object-contain', logo.className)}
              />
            ) : (
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
                {productInitial}
              </div>
            )}
            <CardTitle className={cn('text-xl', wordmarkClassName)}>{productName}</CardTitle>
            <CardDescription>Iniciá sesión para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Ingresando…' : 'Ingresar'}
              </Button>
              {forgotPasswordPath && (
                <Link
                  to={forgotPasswordPath}
                  className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              )}
            </form>
            {demo && (
              // Fuera del `<form>`: acá dentro un botón de más es un botón
              // que el Enter del campo de contraseña puede terminar
              // disparando.
              <div className="mt-4 grid gap-2 border-t pt-4">
                <p className="text-center text-sm text-muted-foreground">
                  Ésta es la demo pública de {productName}: entrás como «{demo.username}»,
                  con datos de prueba que se reponen todos los días.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={entrandoALaDemo}
                  onClick={entrarALaDemo}
                >
                  {entrandoALaDemo ? 'Entrando…' : 'Entrar a la demo'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }
}

// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era idéntico salvo branding/redirectTo -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md. `createLogin()`
// recibe esa parte propia de cada producto como config.
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { ApiError, type User } from './api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordInput } from './PasswordInput'

// Default = User (el tipo concreto de la instancia pre-configurada de
// AuthContext.tsx) -- coincide con lo que devuelve el `useAuth` por
// defecto de mas abajo cuando no se pasa `useAuth` propio, evitando un
// mismatch de tipos para Gestiolibra/MedLibra/VentaLibra (que no pasan
// TUser explicito). Contalibra/Restolibra pasan su propio `TUser` +
// `useAuth` juntos, consistentes entre si.
export function createLogin<TUser = User>({
  productName, productInitial, redirectTo, onLoginSuccess, useAuth: useAuthOverride, formatError,
}: {
  productName: string
  productInitial: string
  redirectTo: string
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
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
              {productInitial}
            </div>
            <CardTitle className="text-xl">{productName}</CardTitle>
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
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }
}

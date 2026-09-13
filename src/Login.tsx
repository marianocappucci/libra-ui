// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era idéntico salvo branding/redirectTo -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md. `createLogin()`
// recibe esa parte propia de cada producto como config.
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, SegundoFactorRequerido } from './AuthContext'
import { api, ApiError, type User } from './api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PasswordInput } from './PasswordInput'
import { CodigoPorDigitos } from './CodigoPorDigitos'
import type { ProductLogo } from './branding'
import { cn } from './utils'
import { useCaptcha } from './captcha'
import { CampoCaptcha } from './CampoCaptcha'

// `detail` del backend cuando el desafío del paso 2 venció ("El código
// venció: volvé a ingresar."), a diferencia de un código incorrecto ("Código
// incorrecto."). Se distingue por CONTENIDO y no por status -- los dos casos
// son 401 -- así que un cambio menor de redacción ("Venció" con mayúscula,
// por ejemplo) no lo rompe: sólo importa que siga hablando de vencimiento.
function esDesafioVencido(err: ApiError): boolean {
  return err.status === 401 && err.detail.toLowerCase().includes('venci')
}

// Default = User (el tipo concreto de la instancia pre-configurada de
// AuthContext.tsx) -- coincide con lo que devuelve el `useAuth` por
// defecto de mas abajo cuando no se pasa `useAuth` propio, evitando un
// mismatch de tipos para Gestiolibra/MedLibra/VentaLibra (que no pasan
// TUser explicito). Contalibra/Restolibra pasan su propio `TUser` +
// `useAuth` juntos, consistentes entre si.
export function createLogin<TUser = User>({
  productName, productInitial, redirectTo, onLoginSuccess, useAuth: useAuthOverride, formatError,
  forgotPasswordPath, forgotPasswordHint, demoPath, captchaPath, logo, wordmarkClassName,
  // `totpPath` NO se desestructura: sigue en el tipo de acá abajo (deprecado)
  // para que el backoffice compile sin cambiar una línea, pero el cuerpo de
  // esta función no lo usa para nada -- ver el comentario del prop.
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
  useAuth?: () => {
    login: (username: string, password: string, extra?: Record<string, unknown>) => Promise<TUser>
    // Paso 2 del login en dos pasos (v0.70.0). Opcional: un `useAuth` que no
    // lo trae simplemente no puede completar el segundo paso -- ver el
    // manejo de `SegundoFactorRequerido` más abajo, que muestra un error en
    // vez de romper.
    confirmarCodigo?: (desafio: string, codigo: string) => Promise<TUser>
  }
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
  // Texto en el lugar del enlace, para cuando NO hay recuperación por correo
  // (v0.69.1). El caso es el backoffice: las credenciales del superadmin salen
  // del entorno del servidor, no hay a quién mandarle un correo, y sin nada
  // escrito la pantalla no le dice a nadie qué hacer. Si también hay
  // `forgotPasswordPath`, gana el enlace.
  forgotPasswordHint?: string
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
  /** @deprecated Segundo factor de una sola pantalla (v0.60.0, F2): probaba
   *  `GET {totpPath}` y, si contestaba `{ totp: true }`, agregaba el campo
   *  «Código de verificación» arriba, desde el principio, mandando `{ codigo
   *  }` junto a usuario y contraseña en el mismo POST.
   *
   *  Reemplazado en v0.70.0 por el login en dos pasos (ver
   *  `SegundoFactorRequerido`/`confirmarCodigo` en `AuthContext.tsx`): ahora
   *  el código se pide en un modal aparte, DESPUÉS de que el backend confirme
   *  usuario y contraseña. **Este prop queda tipado y se ignora** -- lo sigue
   *  pasando el backoffice de superadmin, que todavía no migró a la sonda
   *  nueva, y no tiene por qué dejar de compilar mientras eso pase. */
  totpPath?: string
  // Ruta del desafío del captcha «No soy un robot» (v0.69.0, ALTCHA), ej.
  // '/auth/captcha'. **Opt-in y condicionado en runtime**, por lo mismo que
  // `totpPath`: el recuadro aparece sólo si esa ruta contesta con la forma de
  // un desafío, y mientras no esté tildado el botón «Ingresar» queda
  // deshabilitado. La solución viaja en `{ captcha }`, junto a las
  // credenciales. Ver `captcha.tsx`.
  captchaPath?: string
}) {
  return function Login() {
    // Cast puntual: TS no puede unificar el tipo generico TUser (para
    // quien pasa `useAuthOverride`) con el tipo concreto `User` de la
    // instancia por defecto dentro del cuerpo de una funcion generica --
    // limitacion conocida de TS con defaults de tipo. Ambas ramas
    // devuelven la misma forma en runtime, el cast es seguro.
    const { login, confirmarCodigo } = (useAuthOverride ?? useAuth)() as {
      login: (username: string, password: string, extra?: Record<string, unknown>) => Promise<TUser>
      confirmarCodigo?: (desafio: string, codigo: string) => Promise<TUser>
    }
    const navigate = useNavigate()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [demo, setDemo] = useState<{ username: string } | null>(null)
    const [codigoDemo, setCodigoDemo] = useState('')
    // Sólo importa en una demo: es lo que despliega el login de credenciales,
    // que ahí arranca plegado. En el resto de las instancias no se usa — el
    // formulario se dibuja siempre.
    const [mostrarLogin, setMostrarLogin] = useState(false)
    const [entrandoALaDemo, setEntrandoALaDemo] = useState(false)
    // Segundo factor en dos pasos (v0.70.0): el modal se abre cuando `login`
    // lanza `SegundoFactorRequerido`. `desafio` es lo que hay que devolverle
    // al backend junto al código; sin él no hay modal que mostrar.
    const [mostrarModalCodigo, setMostrarModalCodigo] = useState(false)
    const [desafio, setDesafio] = useState<string | null>(null)
    const [codigo, setCodigo] = useState('')
    const [errorCodigo, setErrorCodigo] = useState<string | null>(null)
    const [verificandoCodigo, setVerificandoCodigo] = useState(false)
    const captcha = useCaptcha(captchaPath)

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

    // Cierra el modal de código, sin importar por qué (Cancelar, Escape, click
    // afuera -- todo pasa por el `onOpenChange` del Dialog, ver más abajo).
    // Reinicia el captcha porque un nuevo intento de login va a necesitar uno
    // nuevo: el de este intento ya se gastó en el paso 1. Usuario y
    // contraseña NO se tocan -- la persona no tiene por qué volver a tipearlos.
    function cerrarModalCodigo() {
      setMostrarModalCodigo(false)
      setDesafio(null)
      setCodigo('')
      setErrorCodigo(null)
      captcha.reiniciar()
    }

    async function confirmarCodigoIngresado(codigoIngresado: string) {
      if (verificandoCodigo || !desafio) return
      if (!confirmarCodigo) {
        // No debería pasar en un producto bien configurado -- ver el
        // comentario de `confirmarCodigo` más arriba -- pero si pasa, un error
        // visible es mejor que un modal que nunca puede completarse.
        setErrorCodigo('Esta pantalla no tiene el segundo factor configurado.')
        return
      }
      setVerificandoCodigo(true)
      setErrorCodigo(null)
      try {
        const user = await confirmarCodigo(desafio, codigoIngresado)
        setMostrarModalCodigo(false)
        navigate(onLoginSuccess ? onLoginSuccess(user) : redirectTo, { replace: true })
      } catch (err) {
        if (err instanceof ApiError && esDesafioVencido(err)) {
          // El desafío ya no sirve: hay que volver a arrancar desde el
          // usuario y contraseña, con un captcha nuevo.
          cerrarModalCodigo()
          setError(err.detail)
        } else if (err instanceof ApiError) {
          // Código incorrecto (401) o bloqueo (429): se queda en el modal.
          // Sólo el código incorrecto limpia los casilleros -- un 429 no fue
          // culpa de lo tipeado, y borrarlo obligaría a retipearlo de nuevo
          // apenas se levante el bloqueo.
          setErrorCodigo(err.detail)
          if (err.status === 401) setCodigo('')
        } else {
          setErrorCodigo('Error de conexión.')
        }
      } finally {
        setVerificandoCodigo(false)
      }
    }

    async function entrarALaDemo(event?: FormEvent) {
      event?.preventDefault()
      setError(null)
      setEntrandoALaDemo(true)
      try {
        // El código viaja SIEMPRE, aunque esté vacío. Mandar el cuerpo sólo
        // cuando hay algo tipeado dejaría que un campo en blanco pegue como
        // pegaba el botón de antes, y del otro lado eso es justamente lo que
        // dejó de alcanzar.
        await api.post(demoPath as string, { codigo: codigoDemo.trim() })
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
        // Sin captcha la llamada es la de siempre, con dos argumentos: los
        // productos que no lo usan no tienen por qué enterarse de que existe
        // `extra`. El segundo factor ya NO viaja acá -- ver `confirmarCodigo`.
        const extra: Record<string, unknown> = {}
        if (captcha.activo) extra.captcha = captcha.payload
        const user = Object.keys(extra).length > 0
          ? await login(username, password, extra)
          : await login(username, password)
        navigate(onLoginSuccess ? onLoginSuccess(user) : redirectTo, { replace: true })
      } catch (err) {
        if (err instanceof SegundoFactorRequerido) {
          if (confirmarCodigo) {
            setDesafio(err.desafio)
            setCodigo('')
            setErrorCodigo(null)
            setMostrarModalCodigo(true)
            // El captcha NO se reinicia acá: ya cumplió su función en este
            // paso 1 que salió bien (200). Sólo hace falta uno nuevo si el
            // desafío del paso 2 vence o si se cancela -- ver
            // `cerrarModalCodigo`.
          } else {
            // Ver el comentario del tipo de `useAuth` más arriba: sin
            // `confirmarCodigo` no hay forma de completar el segundo paso.
            setError('El servidor pidió un segundo factor, pero esta pantalla no lo tiene configurado.')
            captcha.reiniciar()
          }
        } else {
          setError(err instanceof ApiError ? (formatError ? formatError(err) : 'Usuario o contraseña incorrectos.') : 'Error de conexión.')
          // El servidor ya gastó ese desafío —cada uno sirve una vez—, así que
          // el próximo intento tiene que resolver otro.
          captcha.reiniciar()
        }
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
            <CardDescription>
              {demo ? 'Ingresá con tu código de acceso' : 'Iniciá sesión para continuar'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* 🔑 En una demo el código va PRIMERO y el login queda plegado.
                El visitante tiene una sola forma de entrar —la suya— y no se
                come un "usuario o contraseña incorrectos" antes de encontrar
                el campo que le corresponde.

                Fuera de una demo, `demo` es null y esto no dibuja nada: el
                login se renderiza abajo igual que siempre. */}
            {demo && (
              <form onSubmit={entrarALaDemo} className="mb-4 grid gap-2">
                <p className="text-center text-sm text-muted-foreground">
                  Ésta es la demo pública de {productName}: entrás como «{demo.username}»,
                  con datos de prueba que se reponen todos los días.
                </p>
                <Label htmlFor="codigo-demo">Código de acceso</Label>
                <Input
                  id="codigo-demo"
                  name="codigo-demo"
                  value={codigoDemo}
                  onChange={(e) => setCodigoDemo(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX"
                  // Se lo van a copiar de un WhatsApp: el autocorrector que
                  // capitaliza y el que autocompleta sobran los dos.
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus
                  // Un `<input>` en mayúsculas por CSS, no transformando el
                  // valor al tipear: eso último mueve el cursor al final en
                  // cada tecla. El backend normaliza igual.
                  className="uppercase placeholder:normal-case"
                />
                <p className="text-center text-xs text-muted-foreground">
                  ¿No tenés uno? Pedínoslo y te lo damos al momento.
                </p>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={entrandoALaDemo || codigoDemo.trim() === ''}
                >
                  {entrandoALaDemo ? 'Entrando…' : 'Entrar a la demo'}
                </Button>
              </form>
            )}

            {/* El login de credenciales. En una demo cuelga de un link, porque
                ahí es para quien administra la instancia y no para el
                visitante — pero tiene que seguir existiendo: sin él nadie
                entra a Configuración, al ABM de usuarios ni al backup. */}
            {demo && !mostrarLogin && (
              <div className="border-t pt-4 text-center">
                <button
                  type="button"
                  onClick={() => setMostrarLogin(true)}
                  aria-expanded={false}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Soy administrador
                </button>
              </div>
            )}

            {/* Plegado = NO renderizado, no escondido con `hidden`. Un form
                oculto por CSS sigue en el DOM: sus campos se alcanzan con el
                tabulador y un lector de pantalla los anuncia si la clase no
                llega a aplicarse. Sin renderizar, no hay forma de que aparezca
                por accidente. */}
            {(!demo || mostrarLogin) && (
            <form
              className={cn('grid gap-4', demo && 'border-t pt-4')}
              onSubmit={handleSubmit}
            >
              <div className="grid gap-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  // En una demo el foco se lo lleva el campo del código, que
                  // es lo primero que toca el visitante.
                  autoFocus={!demo}
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
              <CampoCaptcha captcha={captcha} />
              {/* En una demo el error del código se muestra arriba, junto al
                  campo que lo produjo; acá abajo sólo el del login. */}
              {error && !demo && <p className="text-sm text-destructive">{error}</p>}
              {error && demo && mostrarLogin && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                // Como en el login de HSI: sin tildar «No soy un robot» no se
                // puede ingresar. Sin captcha, `activo` es false y esto no cambia.
                disabled={submitting || (captcha.activo && !captcha.payload)}
                className="w-full"
              >
                {submitting ? 'Ingresando…' : 'Ingresar'}
              </Button>
              {forgotPasswordPath ? (
                <Link
                  to={forgotPasswordPath}
                  className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              ) : forgotPasswordHint ? (
                <p className="text-center text-sm text-muted-foreground">{forgotPasswordHint}</p>
              ) : null}
            </form>
            )}
          </CardContent>
        </Card>

        {/* Paso 2 del login en dos pasos (v0.70.0). `onOpenChange` es el
            único lugar que cierra el modal por las buenas -- Cancelar, Escape
            y click afuera del recuadro pasan los tres por acá (Radix lo
            dispara con `false` en los tres casos), así que `cerrarModalCodigo`
            corre una sola vez sin importar cuál de los tres fue. */}
        <Dialog
          open={mostrarModalCodigo}
          onOpenChange={(open) => { if (!open) cerrarModalCodigo() }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Código de verificación</DialogTitle>
              <DialogDescription>
                Ingresá los 6 dígitos de tu app autenticadora.
              </DialogDescription>
            </DialogHeader>
            <CodigoPorDigitos
              value={codigo}
              onChange={setCodigo}
              onComplete={(c) => { void confirmarCodigoIngresado(c) }}
              disabled={verificandoCodigo}
              autoFocus
            />
            {errorCodigo && <p className="text-center text-sm text-destructive">{errorCodigo}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                type="button"
                onClick={() => { void confirmarCodigoIngresado(codigo) }}
                disabled={codigo.length < 6 || verificandoCodigo}
              >
                {verificandoCodigo ? 'Verificando…' : 'Verificar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
}

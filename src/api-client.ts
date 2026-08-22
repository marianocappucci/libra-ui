// Cliente HTTP delgado sobre la API JSON del producto. Cookie de sesion
// manejada por el browser via `credentials: "include"` -- en dev el proxy
// de Vite mantiene todo en el mismo origen para que la cookie funcione sin
// CORS; en produccion el build del frontend se sirve desde el mismo
// proceso FastAPI, tambien mismo origen.
//
// Extraido 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// bloque (ApiError + request<T> + el objeto api con get/post/put/del) era
// byte-idéntico -- ver wiki/analyses/auditoria-duplicacion-familia-libra.md.
// Cada producto sigue teniendo su propio `src/api.ts` con sus tipos y
// endpoints propios, re-exportando esto desde acá.

export class ApiError extends Error {
  status: number
  detail: string
  /** El `detail` sin aplanar, cuando el backend manda un objeto en vez de una
   *  cadena.
   *
   *  🔴 Sin esto, un `detail` estructurado llegaba como `"[object Object]"`:
   *  `String({...})` no falla, así que el error se mostraba igual y no había
   *  forma de leer el código que traía adentro. El gate de Términos contesta
   *  `{code, version, mensaje}`, y es lo que distingue "faltan permisos" de
   *  "falta aceptar el contrato" — dos 403 que se ven iguales desde afuera. */
  detailData?: unknown

  constructor(status: number, detail: string, detailData?: unknown) {
    super(detail)
    this.status = status
    this.detail = detail
    this.detailData = detailData
  }
}

// ── Sesión vencida ────────────────────────────────────────────────────────
//
// Un 401 en una llamada de datos significa que la sesión se terminó mientras
// la pestaña seguía abierta. Sin esto, la SPA queda montada —con su menú y
// todo— imprimiendo `not authenticated` en rojo donde iban los datos, y no
// hay forma de volver al login salvo recargar a mano.
//
// 🔴 **Pasa todas las noches en las demos públicas**: el reset de las 04:30
// recrea los usuarios, así que cualquiera que la haya dejado abierta se
// encuentra esa pantalla a la mañana. Y le pasa igual a un cliente cuya sesión
// caduque. Reportado con captura el 2026-08-06 y reproducido invalidando la
// sesión con la app cargada.

//: Rutas donde un 401 es una respuesta legítima y NO significa sesión vencida.
//
// 🔴 `login` es el caso que rompe todo si se olvida: cuando la contraseña está
// mal el backend contesta 401, y redirigir ahí borraría el mensaje "usuario o
// contraseña incorrectos" y dejaría la pantalla parpadeando contra sí misma.
// `me` lo maneja el `AuthProvider`, que ya traduce el 401 a "no hay usuario".
const SIN_SESION_VENCIDA = ['/login', '/me', '/demo', '/verify', '/forgot-password', '/reset-password']

let alVencerLaSesion: () => void = () => {
  // Recarga entera y no un `navigate`: cuando la sesión muere hay estado en
  // memoria de un usuario que ya no existe, y arrastrarlo a la pantalla
  // siguiente es cómo se llega a una tabla vacía que parece un error de datos.
  if (typeof window !== 'undefined') window.location.assign('/login')
}

/** Reemplaza qué hacer cuando se detecta una sesión vencida. Por defecto
 * recarga en `/login`; un producto con otra ruta de login la cambia acá. */
export function configurarSesionVencida(accion: () => void) {
  alVencerLaSesion = accion
}

let yaAviso = false

function esSesionVencida(path: string, status: number): boolean {
  if (status !== 401) return false
  if (SIN_SESION_VENCIDA.some((r) => path.split('?')[0].endsWith(r))) return false
  // Ya estando en el login no hay a dónde mandar a nadie, y redirigir en
  // círculo es peor que el error que se está arreglando.
  if (typeof window !== 'undefined' && window.location.pathname === '/login') return false
  return true
}

function avisarSesionVencida() {
  // Una sola vez: la pantalla que se rompe suele disparar varias llamadas a la
  // vez (el dashboard hace dos), y cada una traería su propia redirección.
  if (yaAviso) return
  yaAviso = true
  alVencerLaSesion()
}

/** Sólo para tests: vuelve a habilitar el aviso. */
export function _reiniciarAvisoDeSesion() {
  yaAviso = false
}

// ── Términos y Condiciones pendientes de aceptación ───────────────────────
//
// El backend (`libraauth.terminos`) corta CUALQUIER llamada gateada por rol con
// un 403 y `detail.code = "terminos_pendientes"` mientras la instancia no haya
// aceptado la versión vigente del contrato.
//
// 🔑 **Se intercepta acá, en el cliente HTTP, y no pantalla por pantalla.** Es
// el mismo criterio que la sesión vencida y por el mismo motivo: son 40 y pico
// de pantallas entre los ocho productos, y la que se olvide de manejarlo no
// falla — muestra "forbidden" en rojo donde iban los datos, que es indistinguible
// de un problema de permisos.

/** El código que manda el backend en `detail.code`. */
export const CODIGO_TERMINOS_PENDIENTES = 'terminos_pendientes'

export type TerminosPendientes = { code: string; version: string; mensaje?: string }

let alHaberTerminosPendientes: (info: TerminosPendientes) => void = () => {}

/** Registra qué hacer cuando el backend avisa que faltan aceptar los Términos.
 *  Lo usa `GateTerminos`; un producto no necesita llamarlo. */
export function configurarTerminosPendientes(accion: (info: TerminosPendientes) => void) {
  alHaberTerminosPendientes = accion
}

function terminosPendientesDe(status: number, data: unknown): TerminosPendientes | null {
  if (status !== 403) return null
  if (!data || typeof data !== 'object' || !('detail' in data)) return null
  const detail = (data as { detail: unknown }).detail
  if (!detail || typeof detail !== 'object') return null
  const info = detail as Partial<TerminosPendientes>
  return info.code === CODIGO_TERMINOS_PENDIENTES
    ? { code: info.code, version: String(info.version ?? ''), mensaje: info.mensaje }
    : null
}

/** El `detail` de un error, aplanado a texto pero conservando el original.
 *  Un objeto se resume por su clave `mensaje` si la tiene; sin esto,
 *  `String(objeto)` deja `"[object Object]"` en la pantalla. */
function detalleDe(data: unknown, statusText: string): [string, unknown] {
  if (!data || typeof data !== 'object' || !('detail' in data)) return [statusText, undefined]
  const detail = (data as { detail: unknown }).detail
  if (detail && typeof detail === 'object') {
    const mensaje = (detail as { mensaje?: unknown }).mensaje
    return [typeof mensaje === 'string' ? mensaje : statusText, detail]
  }
  return [String(detail), detail]
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (esSesionVencida(path, response.status)) avisarSesionVencida()

  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : undefined

  if (!response.ok) {
    const pendientes = terminosPendientesDe(response.status, data)
    if (pendientes) alHaberTerminosPendientes(pendientes)
    const [detail, detailData] = detalleDe(data, response.statusText)
    throw new ApiError(response.status, detail, detailData)
  }

  return data as T
}

async function requestForm<T>(method: string, path: string, form: FormData): Promise<T> {
  const response = await fetch(path, { method, credentials: 'include', body: form })
  // Mismo trato que `request`: un upload que cae en 401 es la misma sesión
  // vencida, y omitirlo acá dejaría media aplicación con el comportamiento
  // viejo (el logo de Configuración, los certificados, el restore).
  if (esSesionVencida(path, response.status)) avisarSesionVencida()
  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : undefined
  if (!response.ok) {
    // Mismo trato que `request` también para los Términos: un upload es una
    // llamada gateada por rol como cualquier otra, y el backend la corta igual.
    const pendientes = terminosPendientesDe(response.status, data)
    if (pendientes) alHaberTerminosPendientes(pendientes)
    const [detail, detailData] = detalleDe(data, response.statusText)
    throw new ApiError(response.status, detail, detailData)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  // Uploads (logo, certificados, restore de DB) -- multipart, sin
  // Content-Type explicito para que el browser agregue el boundary.
  postForm: <T>(path: string, form: FormData) => requestForm<T>('POST', path, form),
}

// Contrato id/username/name/role/active devuelto por
// libracore.auth.build_json_api_auth_router() (POST /auth/login, GET
// /auth/me) y libracore.db.usuarios.UserRepository -- idéntico en los
// tres productos que consumen este paquete.
export type User = {
  id: string
  username: string
  name: string
  role: 'admin' | 'staff'
  active: boolean
  // Opcional a proposito: la columna existe en `libraauth` desde v0.3.0, pero
  // no todos los productos la devuelven todavia en su listado. Con el campo
  // obligatorio, el consumidor que no la devuelve no compila; con `?`, la
  // pantalla lo trata como vacio y sigue andando. Es la direccion a la que
  // llega el mail de `POST /auth/forgot-password`.
  email?: string
}

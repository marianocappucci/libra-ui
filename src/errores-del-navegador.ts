// Los errores del navegador que nadie atrapó, al registro de errores de la instancia (ADR-053; ADR-045 de libracore).
//
// Una pantalla que se rompe en el navegador de un cliente no deja rastro en ningún servidor: el usuario ve una pantalla
// en blanco, la cierra y no se lo cuenta a nadie. Esto escucha `window.onerror` y `unhandledrejection` y manda cada
// error a `POST /api/errores-cliente`, que el backend registra en `DATA_DIR/errores/` junto con los suyos.
//
//   instalarReporteDeErrores({ release: import.meta.env.VITE_RELEASE })   // en main.tsx, antes de montar la app
//
// 🔑 **No reporta lo que el backend ya registró ni lo que no es un error del sistema.** Un `ApiError` es una respuesta
// del servidor: un 4xx es del usuario (validación, permisos, sesión vencida) y un 5xx ya quedó en el registro del
// backend con su `ref`. Reportarlos acá duplicaría los 500 y llenaría el archivo de 401 y 404.
//
// 🔴 **Mandar el reporte nunca puede ser un error.** Todo está envuelto: un fallo de red, un navegador sin
// `sendBeacon` o un payload que no se pudo armar se tragan en silencio. Lo peor que puede pasar es que el error no
// llegue; lo que no puede pasar es que el reporte genere otro error y entre en un bucle.
//
// Qué se manda (el backend lo vuelve a limpiar, pero lo que no sale del navegador no hace falta limpiarlo):
// el mensaje, el stack, la RUTA de la página (`location.pathname`, nunca la query ni el fragmento) y el `release`.
import { ApiError } from './api-client'

/** A dónde se manda. Mismo origen: la CSP de las SPA es `connect-src 'self'`. */
export const ENDPOINT_ERRORES = '/api/errores-cliente'

/** Cuántos errores distintos se mandan por pestaña. El resto se ignora: un bucle que falla 10 000 veces no se manda 10 000 veces. */
export const MAX_REPORTES_POR_PESTANA = 10

/** El backend rechaza más de 4 KB (413); se queda debajo, con margen para el JSON. */
const MAX_BYTES = 3800
const MAX_MENSAJE = 500
const MAX_STACK = 2400

/** Ruido conocido del navegador que no es un defecto de la aplicación. */
const IGNORADOS = [
  /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/,
  /^Script error\.?$/, // un script de otro origen: el navegador no deja ver nada, no hay nada que diagnosticar
]

export type TipoDeReporte = 'error' | 'unhandledrejection' | 'render'

export type OpcionesDeReporte = {
  /** Identifica el bundle que está corriendo (un id de build, un hash). Opcional: el backend pone el `release` de la imagen. */
  release?: string
}

type Reporte = { tipo: TipoDeReporte; mensaje: string; stack: string; pagina: string; release?: string }

let instalado: { release?: string; quitar: () => void } | null = null
const vistos = new Set<string>()
let enviados = 0

/** ¿Es una respuesta del servidor (que ya tiene su propio trato) y no un fallo del navegador? */
const esDelServidor = (e: unknown) => e instanceof ApiError

function textoDe(e: unknown): { mensaje: string; stack: string } {
  if (e instanceof Error) return { mensaje: e.message || e.name, stack: e.stack ?? '' }
  if (typeof e === 'string') return { mensaje: e, stack: '' }
  try {
    return { mensaje: JSON.stringify(e) ?? String(e), stack: '' }
  } catch {
    return { mensaje: String(e), stack: '' }
  }
}

function armar(tipo: TipoDeReporte, e: unknown, extra: { componentStack?: string } = {}): Reporte | null {
  const { mensaje, stack } = textoDe(e)
  if (IGNORADOS.some((rx) => rx.test(mensaje))) return null
  const completo = extra.componentStack ? `${stack}\n--- componentes ---${extra.componentStack}` : stack
  const pagina = typeof window !== 'undefined' ? window.location.pathname : '/'
  return {
    tipo,
    mensaje: mensaje.slice(0, MAX_MENSAJE),
    stack: completo.slice(0, MAX_STACK),
    pagina,
    release: instalado?.release,
  }
}

/** El JSON del reporte, recortado hasta que entre en el límite del backend. */
function serializar(r: Reporte): string {
  let stack = r.stack
  let json = JSON.stringify({ ...r, stack })
  while (new TextEncoder().encode(json).length > MAX_BYTES && stack.length > 0) {
    stack = stack.slice(0, Math.floor(stack.length / 2))
    json = JSON.stringify({ ...r, stack })
  }
  return json
}

function mandar(json: string) {
  try {
    const blob = new Blob([json], { type: 'application/json' })
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' &&
        navigator.sendBeacon(ENDPOINT_ERRORES, blob)) return
    // Sin `sendBeacon` (o con la cola llena): `fetch` con `keepalive`, que también sobrevive a la descarga de la página.
    void fetch(ENDPOINT_ERRORES, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true,
    }).catch(() => {})
  } catch {
    // un reporte que no sale no es un error
  }
}

function reportar(tipo: TipoDeReporte, e: unknown, extra?: { componentStack?: string }) {
  try {
    if (!instalado || esDelServidor(e)) return
    const reporte = armar(tipo, e, extra)
    if (!reporte) return
    // Mismo error, mismo lugar: una vez. Un componente que falla en cada render no se manda en cada render.
    const clave = `${reporte.mensaje}\n${reporte.stack}`
    if (vistos.has(clave)) return
    if (enviados >= MAX_REPORTES_POR_PESTANA) return
    vistos.add(clave)
    enviados += 1
    mandar(serializar(reporte))
  } catch {
    // ídem
  }
}

/** Reporta un error que una pantalla atrapó pero que es un defecto (lo usa `ErrorBoundary`). No hace nada si
 *  `instalarReporteDeErrores` no se llamó: un producto que no lo cableó no manda nada. */
export function reportarError(e: unknown, extra?: { componentStack?: string }) {
  reportar('render', e, extra)
}

/** Empieza a reportar los errores que nadie atrapa (`window.onerror` y `unhandledrejection`) a `/api/errores-cliente`.
 *
 *  Idempotente: una segunda llamada cambia el `release` y no suma escuchas. Devuelve la función que lo desinstala
 *  (para los tests; en producción no se usa). */
export function instalarReporteDeErrores(opciones: OpcionesDeReporte = {}): () => void {
  if (typeof window === 'undefined') return () => {}
  if (instalado) {
    instalado.release = opciones.release
    return instalado.quitar
  }
  const alError = (ev: ErrorEvent) => {
    // Un `ErrorEvent` sin `error` es un script de otro origen o un recurso: nada que diagnosticar.
    if (ev.error == null && !ev.message) return
    reportar('error', ev.error ?? ev.message)
  }
  const alRechazo = (ev: PromiseRejectionEvent) => reportar('unhandledrejection', ev.reason)
  window.addEventListener('error', alError)
  window.addEventListener('unhandledrejection', alRechazo)
  const quitar = () => {
    window.removeEventListener('error', alError)
    window.removeEventListener('unhandledrejection', alRechazo)
    instalado = null
  }
  instalado = { release: opciones.release, quitar }
  return quitar
}

/** Sólo para tests: vuelve a cero lo que se vio y lo que se mandó. */
export function _reiniciarReporteDeErrores() {
  instalado?.quitar()
  vistos.clear()
  enviados = 0
}

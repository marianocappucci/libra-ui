// El texto de un error HTTP para mostrarlo en pantalla, compartido por los diálogos del producto (`Productos` y `ProductoCodigosVariantes`, ADR-013 y ADR-014).
// Es de `comercio/` y no de `api-client.ts`: éste lo usan ~75 pantallas que siguen mostrando el `detail` tal cual.
import { ApiError } from '../api-client'

/** Los `detail` GENÉRICOS que el backend manda en un 401/403 (en minúsculas, sin puntuación final): `forbidden` (403) y `not authenticated` (401) son los de `libraauth`
 *  (`session_auth.py`) y los de FastAPI por defecto; el resto, los de uso común que una dependencia de seguridad puede soltar. **Lista explícita y cerrada**: cualquier otro
 *  texto (en castellano o no) lo dijo el backend a propósito y se muestra tal cual. «No permissions» no está: no es un genérico conocido de la familia. */
const DETALLES_GENERICOS = new Set([
  'forbidden', 'not authenticated', 'unauthorized', 'not enough permissions', 'could not validate credentials',
  'operation not permitted', 'permission denied', 'access denied',
])

/** ¿Es un `detail` genérico (o vacío: un 401/403 sin cuerpo no dice nada)? Se compara normalizado: minúsculas, sin espacios de más y sin punto final. */
export const esDetalleGenerico = (texto: string) => {
  const n = texto.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!\s]+$/, '')
  return n === '' || DETALLES_GENERICOS.has(n)
}

/** El texto de un error de la API. El `detail` genérico de un 401/403 llega en inglés y pelado («forbidden», «not authenticated») y no dice qué hacer: se reemplaza
 *  (ver `DETALLES_GENERICOS`). Todo lo demás se conserva tal cual: un permiso puntual («No tenés permiso para marcar productos que vencen.»), el objeto con `mensaje`
 *  (los Términos pendientes, que distingue «faltan permisos» de «falta aceptar el contrato») y cualquier otro status. Lo que no es un `ApiError` es un corte de red. */
export function describeErrorHttp(err: unknown): string {
  if (err instanceof ApiError) {
    const generico = (err.detailData === undefined || typeof err.detailData === 'string') && esDetalleGenerico(err.detail)
    if (err.status === 403 && generico) return 'No tenés permiso para hacer esto.'
    if (err.status === 401 && generico) return 'Tu sesión venció. Volvé a iniciar sesión.'
    return err.detail
  }
  return 'Error de conexión.'
}

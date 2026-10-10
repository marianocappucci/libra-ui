// El texto de un error HTTP para mostrarlo en pantalla, compartido por los diálogos del producto (`Productos` y `ProductoCodigosVariantes`, ADR-013 y ADR-014).
// Desde ADR-046 el `ApiError` ya trae el 401/403 genérico traducido (`api-client.ts`), así que esto sólo agrega el caso de un error que no es de la API.
import { ApiError, esDetalleGenerico } from '../api-client'

export { esDetalleGenerico }

/** El texto de un error de la API. El `detail` genérico de un 401/403 ya llega traducido en el `ApiError` («No tenés permiso para hacer esto.», «Tu sesión
 *  venció…»). Todo lo demás se conserva tal cual: un permiso puntual («No tenés permiso para marcar productos que vencen.»), el objeto con `mensaje`
 *  (los Términos pendientes, que distingue «faltan permisos» de «falta aceptar el contrato») y cualquier otro status. Lo que no es un `ApiError` es un corte de red. */
export function describeErrorHttp(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

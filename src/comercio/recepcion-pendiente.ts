// El intento de «Recibir mercadería» cuyo resultado no se conoce, guardado para poder reenviarlo EXACTAMENTE igual (o descartarlo a propósito): el cuerpo COMPLETO con su
// `clave_operacion`. Ver el encabezado de `CompraDetalle.tsx` por el principio; acá está sólo el almacén. Hay a lo sumo uno por orden de compra.
//
// 🔑 **La copia en memoria es SIEMPRE la fuente de verdad de la pestaña.** `sessionStorage` sólo sirve para recuperar lo pendiente tras desmontar la pantalla o recargar la pestaña
// (misma regla que `vencimientos-pendientes.ts`). La lectura es memoria fusionada con lo guardado, y gana la memoria; el borrado limpia las dos. 🔴 Pero **guardar falla cerrado**:
// si el intento no queda en el storage (`setItem` falla, cuota, modo privado, sin `sessionStorage`), `guardarRecepcionPendiente` lo dice y NO se envía. Con la respuesta perdida y sin
// el cuerpo y la clave guardados, un reintento sería otra recepción y el stock entraría dos veces. Un borrado que no se pudo persistir queda anotado (`borrados`) para que lo viejo
// del storage no lo resucite. Límite: otra pestaña u otro navegador (otro `sessionStorage`) no lo ve; ahí lo que protege es el motor, que con la misma clave y el mismo cuerpo
// contesta `repetida: true`.
import { ApiError } from '../api-client'

/** Una línea de lo que se recibe. `quantity` y `unit_cost` viajan como texto (lo que tipeó la persona, sin pasar por `number`). */
export type LineaDeRecepcion = { item_id: number; quantity: string; unit_cost: string; lot_code?: string; expires_at?: string }

/** El cuerpo de `POST /api/purchase-receipts/recibir`. */
export type CuerpoDeRecepcion = {
  proveedor_id: number
  purchase_order_id: number
  document_reference: string | null
  deposito_id: number
  clave_operacion: string
  items: LineaDeRecepcion[]
}

/** Un intento cuyo resultado no se conoce. */
export type RecepcionPendiente = { cuerpo: CuerpoDeRecepcion; creado: number }

const CLAVE_DE_ALMACEN = 'libra-ui:compras:recepciones-pendientes'

let enMemoria: Record<string, RecepcionPendiente> = {}
/** Órdenes cuyo borrado del storage no se pudo escribir: se ocultan de lo que se lee de ahí. */
const borrados = new Set<string>()

function esPendiente(v: unknown): v is RecepcionPendiente {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<RecepcionPendiente>
  const c = p.cuerpo as Partial<CuerpoDeRecepcion> | undefined
  return typeof p.creado === 'number' && !!c && typeof c.clave_operacion === 'string' && c.clave_operacion.length > 0
    && typeof c.purchase_order_id === 'number' && typeof c.deposito_id === 'number' && Array.isArray(c.items)
}

/** Lo que hay en `sessionStorage`; ilegible, con basura o si el acceso lanza, cuenta como vacío. */
function leerDelAlmacen(): Record<string, RecepcionPendiente> {
  try {
    const crudo = sessionStorage.getItem(CLAVE_DE_ALMACEN)
    const parseado: unknown = crudo ? JSON.parse(crudo) : {}
    if (!parseado || typeof parseado !== 'object') return {}
    return Object.fromEntries(Object.entries(parseado).filter(([, v]) => esPendiente(v))) as Record<string, RecepcionPendiente>
  } catch {
    return {}
  }
}

function todos(): Record<string, RecepcionPendiente> {
  const guardados = leerDelAlmacen()
  for (const orden of borrados) delete guardados[orden]
  return { ...guardados, ...enMemoria }
}

function persistir() {
  try {
    sessionStorage.setItem(CLAVE_DE_ALMACEN, JSON.stringify(todos()))
    borrados.clear()
  } catch {
    // Sin dónde guardar: la memoria alcanza para esta pestaña.
  }
}

/** El intento pendiente de esa orden, o `null`. */
export function leerRecepcionPendiente(ordenId: number): RecepcionPendiente | null {
  return todos()[String(ordenId)] ?? null
}

/** Guarda un intento ANTES de enviarlo. 🔴 **Falla cerrado: devuelve si quedó recuperable tras una recarga**, o sea, si leyendo el `sessionStorage` de vuelta está ese intento con esa
 *  clave. Si no (cuota, modo privado, sin storage), quien llama NO tiene que enviar. Un intento nuevo que no se pudo guardar no queda en memoria (no se mandó: no está pendiente de
 *  nada); uno que ya estaba (un reenvío) sigue estándolo, y si ya estaba en el storage cuenta como recuperable. */
export function guardarRecepcionPendiente(ordenId: number, intento: RecepcionPendiente): boolean {
  const orden = String(ordenId)
  const previo = enMemoria[orden]
  const estabaBorrado = borrados.has(orden)
  enMemoria[orden] = intento
  borrados.delete(orden)
  persistir()
  if (leerDelAlmacen()[orden]?.cuerpo.clave_operacion === intento.cuerpo.clave_operacion) return true
  if (previo) enMemoria[orden] = previo
  else delete enMemoria[orden]
  if (estabaBorrado) borrados.add(orden)
  return false
}

export function quitarRecepcionPendiente(ordenId: number) {
  const orden = String(ordenId)
  delete enMemoria[orden]
  borrados.add(orden)
  persistir()
}

/** ¿No se sabe si el motor escribió? Es lo que hay que suponer salvo que la respuesta diga lo contrario: los 4xx (menos el 408, que puede venir de un proxy que cortó a mitad de
 *  camino) y el 503 de la migración son la única forma de saber que no se escribió. Sin respuesta (red, timeout), un 5xx o cualquier otro 503, es incierto. */
export function esResultadoDefinitivo(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.status === 503) return /Falta la revisión 0006_clave_operacion_recepciones.*libracommerce-migrar upgrade/s.test(err.detail)
  return err.status >= 400 && err.status < 500 && err.status !== 408
}

/** Sólo para tests: deja el almacén de memoria como recién cargada la página (lo de `sessionStorage` no se toca). */
export function _reiniciarRecepcionesEnMemoria() {
  enMemoria = {}
  borrados.clear()
}

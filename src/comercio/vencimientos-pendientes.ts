// Los intentos de escritura de Vencimientos (`asignar`, `entrada` y `merma`) cuyo resultado no se conoce: el cuerpo COMPLETO con su
// `clave_operacion`, guardados para poder reenviarlos exactamente igual (o descartarlos a propósito). Ver el encabezado
// de `Vencimientos.tsx` por el principio; acá está sólo el almacén.
//
// 🔑 **La copia en memoria es SIEMPRE la fuente de verdad de la pestaña.** `sessionStorage` sólo sirve para recuperar lo
// pendiente tras desmontar la pantalla o recargar la pestaña. La lectura es memoria fusionada con lo guardado, y gana la
// memoria; el borrado limpia las dos. 🔴 Pero **guardar falla cerrado**: si el intento no queda en el storage (`setItem`
// falla, cuota, modo privado, sin `sessionStorage`), `guardarPendiente` lo dice y NO se envía. Un borrado que no se pudo persistir queda anotado (`borrados`) para que lo viejo del storage no
// lo resucite. Límite: otra pestaña u otro navegador (otro `sessionStorage`) no lo ve; ahí lo que protege es el motor, que
// con la misma clave y el mismo cuerpo contesta `repetida: true`.
import type { VencimientoAsignarPayload, VencimientoEntradaPayload, VencimientoMermaPayload } from './tipos'

export type Payload = VencimientoMermaPayload | VencimientoAsignarPayload | VencimientoEntradaPayload
export type TipoDeEscritura = 'merma' | 'asignar' | 'entrada'

/** Un intento de escritura cuyo resultado no se conoce. `firma` es la del DESTINO (ver `firmaDeMerma` y `firmaDeAsignacion`). */
export type Pendiente = { firma: string; tipo: TipoDeEscritura; cuerpo: Payload; creado: number }

const CLAVE_DE_ALMACEN = 'libra-ui:vencimientos:pendientes'

let enMemoria: Record<string, Pendiente> = {}
/** Firmas quitadas cuyo borrado del storage no se pudo escribir: se ocultan de lo que se lee de ahí. */
const borrados = new Set<string>()

/** La firma de una merma: lote y fecha definen el destino porque la baja consume ESE lote (`dar_de_baja_lote` mide el
 *  saldo del bucket exacto). Sin cantidad, nota ni motivo. */
export function firmaDeMerma(l: { producto_id: number; deposito_id: number; variante_id: number | null; lote: string | null; vence: string | null }): string {
  return JSON.stringify(['merma', l.producto_id, l.deposito_id, l.variante_id, l.lote, l.vence])
}

/** La firma de una asignación: el recurso que consume es el saldo SIN LOTE de (producto, depósito, variante)
 *  (`asignar_vencimiento_a_saldo`), sea cual sea el lote y la fecha que se le quieran poner; por eso no los incluye. */
export function firmaDeAsignacion(s: { producto_id: number; deposito_id: number; variante_id: number | null }): string {
  return JSON.stringify(['asignar', s.producto_id, s.deposito_id, s.variante_id])
}

/** La firma de una entrada con lote: el destino es el bucket (producto, depósito, variante, lote y fecha) al que suma. Sin
 *  cantidad ni nota: una carga incierta bloquea reenviar OTRA sobre el mismo destino (como en la merma); para cargar otra
 *  cantidad hay que reenviar el intento anterior o descartarlo de forma explícita. */
export function firmaDeEntrada(l: { producto_id: number; deposito_id: number; variante_id: number | null; lote: string; vence: string }): string {
  return JSON.stringify(['entrada', l.producto_id, l.deposito_id, l.variante_id, l.lote, l.vence])
}

function esPendiente(v: unknown): v is Pendiente {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<Pendiente>
  const c = p.cuerpo as Partial<Payload> | undefined
  return typeof p.firma === 'string' && (p.tipo === 'merma' || p.tipo === 'asignar' || p.tipo === 'entrada') && typeof p.creado === 'number'
    && !!c && typeof c.clave_operacion === 'string' && typeof c.producto_id === 'number'
}

/** Lo que hay en `sessionStorage`; ilegible, con basura o si el acceso lanza, cuenta como vacío. */
function leerDelAlmacen(): Record<string, Pendiente> {
  try {
    const crudo = sessionStorage.getItem(CLAVE_DE_ALMACEN)
    const parseado: unknown = crudo ? JSON.parse(crudo) : {}
    if (!parseado || typeof parseado !== 'object') return {}
    return Object.fromEntries(Object.entries(parseado).filter(([, v]) => esPendiente(v))) as Record<string, Pendiente>
  } catch {
    return {}
  }
}

/** Todos los pendientes: lo guardado (menos lo que se borró acá) con la memoria por encima. */
export function leerPendientes(): Record<string, Pendiente> {
  const guardados = leerDelAlmacen()
  for (const firma of borrados) delete guardados[firma]
  return { ...guardados, ...enMemoria }
}

function persistir() {
  try {
    sessionStorage.setItem(CLAVE_DE_ALMACEN, JSON.stringify(leerPendientes()))
    borrados.clear()
  } catch {
    // Sin dónde guardar: la memoria alcanza para esta pestaña.
  }
}

/** Guarda un intento ANTES de enviarlo. 🔴 **Falla cerrado: devuelve si quedó recuperable tras una recarga**, o sea, si
 *  leyendo el `sessionStorage` de vuelta está ese intento con esa clave. Si no (cuota, modo privado, sin storage), quien
 *  llama NO tiene que enviar: con la respuesta perdida y sin el cuerpo y la clave guardados, un reintento duplicaría el
 *  movimiento. Un intento nuevo que no se pudo guardar no queda en memoria (no se mandó: no está pendiente de nada); uno que
 *  ya estaba (un reenvío) sigue estándolo, y si ya estaba en el storage cuenta como recuperable. */
export function guardarPendiente(p: Pendiente): boolean {
  const previo = enMemoria[p.firma]
  const estabaBorrado = borrados.has(p.firma)
  enMemoria[p.firma] = p
  borrados.delete(p.firma)
  persistir()
  if (leerDelAlmacen()[p.firma]?.cuerpo.clave_operacion === p.cuerpo.clave_operacion) return true
  if (previo) enMemoria[p.firma] = previo
  else delete enMemoria[p.firma]
  if (estabaBorrado) borrados.add(p.firma)
  return false
}

export function quitarPendiente(firma: string) {
  delete enMemoria[firma]
  borrados.add(firma)
  persistir()
}

/** Sólo para tests: deja el almacén de memoria como recién cargada la página (lo de `sessionStorage` no se toca). */
export function _reiniciarPendientesEnMemoria() {
  enMemoria = {}
  borrados.clear()
}

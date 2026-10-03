// El intento de generar órdenes en borrador cuyo resultado no se conoce, guardado para poder reenviarlo EXACTAMENTE igual tras desmontar la pantalla o recargar la
// pestaña (`sessionStorage`): la copia completa del pedido —las filas que se vieron, los parámetros y la `clave_operacion`—. Ver el encabezado de
// `reposicion-ordenes.tsx` por el principio; acá está sólo el almacén. Es uno solo (no hay dos pedidos de órdenes a la vez).
//
// Se guarda ANTES de enviar. Si el navegador no deja guardar (cuota, modo privado), el pedido se manda igual —es un borrador, visible en Compras, y lo creado ya cuenta
// como «en camino»— y queda sólo la copia en memoria de la pantalla: cubre un cierre del diálogo, no una recarga. Límite: otra pestaña no lo ve; ahí lo que protege es el
// motor, que con la misma clave contesta `repetida: true`.
import type { ReposicionProducto } from './tipos'

/** Lo que de la consulta de la pantalla viaja al motor para que calcule lo mismo que se ve. */
export type ParametrosDeOrdenes = {
  dias_rotacion: number; dias_cobertura: number; plazo_entrega_dias: number
  sucursal_id?: number; categoria?: string; proveedor_id?: number
  /** El ajuste estacional de la consulta: las órdenes se calculan con el mismo que se ve. */
  estacionalidad?: boolean
  /** Descontar lo que vence dentro del horizonte (motor >= 0.37.0): las órdenes se calculan con la misma opción que se ve. */
  descontar_por_vencer?: boolean
}

/** El pedido entero de un intento: lo que se vio, con qué parámetros y con qué clave. */
export type IntentoDeOrdenes = { clave: string; filas: ReposicionProducto[]; parametros: ParametrosDeOrdenes }

const CLAVE_DE_ALMACEN = 'libra-ui:reposicion:ordenes-pendiente'

function esIntento(v: unknown): v is IntentoDeOrdenes {
  if (!v || typeof v !== 'object') return false
  const i = v as Partial<IntentoDeOrdenes>
  const p = i.parametros as Partial<ParametrosDeOrdenes> | undefined
  return typeof i.clave === 'string' && i.clave.length > 0 && Array.isArray(i.filas) && !!p && typeof p === 'object'
    && typeof p.dias_rotacion === 'number' && typeof p.dias_cobertura === 'number' && typeof p.plazo_entrega_dias === 'number'
}

/** El intento pendiente guardado, o `null` (nada, ilegible o con otra forma: cuenta como vacío). */
export function leerIntentoPendiente(): IntentoDeOrdenes | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_DE_ALMACEN)
    const parseado: unknown = crudo ? JSON.parse(crudo) : null
    return esIntento(parseado) ? parseado : null
  } catch {
    return null
  }
}

/** Guarda el intento antes de enviarlo; devuelve si quedó recuperable tras una recarga. */
export function guardarIntentoPendiente(intento: IntentoDeOrdenes): boolean {
  try {
    sessionStorage.setItem(CLAVE_DE_ALMACEN, JSON.stringify(intento))
    return true
  } catch {
    return false
  }
}

export function borrarIntentoPendiente(): void {
  try {
    sessionStorage.removeItem(CLAVE_DE_ALMACEN)
  } catch {
    // Sin storage no hay nada que borrar.
  }
}

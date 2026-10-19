// La entrada «Sucursal sin internet» del menú (ADR-080, punto 5): se ve si el adicional `offline` está contratado **o**
// si quedan nodos activos. Decisión del humano (2026-10-19): sin el adicional el alta y la carga nueva siguen
// bloqueadas, pero un nodo que sigue activo se tiene que poder dar de baja, así que la pantalla no puede desaparecer
// con él adentro.
//
// Lo dice `GET /api/nodos-offline/menu` (`{contratado, nodos_activos, visible}`, libraedge ADR-011). **Una sola
// consulta por carga de página**: el estado vive en este módulo y el layout lo lee con `useSyncExternalStore`, así que
// ni cada render ni cada remonte del layout vuelven a pedir nada. La pantalla llama a `refrescarMenuDeNodosOffline()`
// después de un alta o una baja (dar de baja el último nodo sin el adicional esconde la entrada).
//
// Mientras no llegó la respuesta, o si falla (un 403 de un rol sin permiso, un 404 de un producto que no monta la
// ruta, la red), la entrada **no** se ve: es de administración y el que corta es el backend.
import { useEffect, useSyncExternalStore } from 'react'

import { api } from './api-client'

export const RUTA_MENU_DE_NODOS_OFFLINE = '/api/nodos-offline/menu'

/** Lo que contesta `GET /api/nodos-offline/menu`. */
export type MenuDeNodosOffline = { contratado: boolean; nodos_activos: number; visible: boolean }

let visible = false
let pedida: string | null = null
const oyentes = new Set<() => void>()

function publicar(valor: boolean) {
  visible = valor
  oyentes.forEach((o) => o())
}

async function consultar(ruta: string) {
  try {
    const r = await api.get<Partial<MenuDeNodosOffline> | null>(ruta)
    publicar(r?.visible === true)
  } catch {
    publicar(false)
  }
}

/** Pide el estado **si todavía no se pidió** en esta página. Lo llama el layout; un producto no lo necesita. */
export function consultarMenuDeNodosOffline(ruta: string = RUTA_MENU_DE_NODOS_OFFLINE) {
  if (pedida === ruta) return
  pedida = ruta
  void consultar(ruta)
}

/** Vuelve a preguntar (después de un alta o una baja). Sin una consulta previa no hace nada: no hay menú que mirarlo. */
export function refrescarMenuDeNodosOffline() {
  if (pedida !== null) void consultar(pedida)
}

/** ¿Se ve la entrada? `habilitado` en `false` (no hay entrada en el menú, o el usuario no es admin) no pide nada. */
export function useMenuDeNodosOffline(habilitado: boolean, ruta: string = RUTA_MENU_DE_NODOS_OFFLINE): boolean {
  useEffect(() => {
    if (habilitado) consultarMenuDeNodosOffline(ruta)
  }, [habilitado, ruta])
  const valor = useSyncExternalStore(
    (o) => { oyentes.add(o); return () => { oyentes.delete(o) } },
    () => visible,
    () => visible,
  )
  return habilitado && valor
}

/** Sólo para tests: vuelve al estado de una página recién cargada. */
export function _reiniciarMenuDeNodosOffline() {
  visible = false
  pedida = null
}

// La entrada «Sucursal sin internet» del menú (ADR-080, punto 5).
//
// 🔴 Desde ADR-085 (libraedge ADR-014, decisión del humano 2026-10-20) LibraEdge es parte del sistema e incluido en
// todos los planes: la entrada se ve **siempre** para quien ve los menús de administración, como cualquier otra
// `adminOnly`, y el layout **ya no pregunta** `GET /api/nodos-offline/menu`. Hasta v0.170 se veía con el adicional
// `offline` contratado o con nodos activos.
//
// El módulo queda por compatibilidad (un producto que importe estas funciones sigue compilando): `useMenuDeNodosOffline`
// devuelve `habilitado` tal cual y las demás no piden nada. El backend sigue contestando la ruta, siempre `visible`.

export const RUTA_MENU_DE_NODOS_OFFLINE = '/api/nodos-offline/menu'

/** Lo que contesta `GET /api/nodos-offline/menu` (compatibilidad: `contratado` y `visible` siempre `true`). */
export type MenuDeNodosOffline = { contratado: boolean; nodos_activos: number; visible: boolean }

/** @deprecated No pide nada: la entrada se ve siempre para el administrador (ADR-085). */
export function consultarMenuDeNodosOffline(_ruta: string = RUTA_MENU_DE_NODOS_OFFLINE) {}

/** @deprecated No pide nada (ADR-085). */
export function refrescarMenuDeNodosOffline() {}

/** @deprecated ¿Se ve la entrada? Es `habilitado` (hay entrada y el usuario ve los menús de administración): ADR-085. */
export function useMenuDeNodosOffline(habilitado: boolean, _ruta: string = RUTA_MENU_DE_NODOS_OFFLINE): boolean {
  return habilitado
}

/** Sólo para tests. No queda estado que reiniciar. */
export function _reiniciarMenuDeNodosOffline() {}

// Los estados de una reserva que se da en un nodo de LibraEdge sin conexión (ADR-094; el modelo es ADR-022 de LibraClub): la lógica
// y los textos de `EtiquetasDeReserva.tsx`.
//
// ## Dos cosas distintas que no se llaman «provisoria» en pantalla
//
// - **Sin subir** (en el código, «provisoria del nodo»): la reserva se dio en el equipo del local sin conexión y todavía no subió al
//   central. Se reconoce por su **id negativo** (`libraedge.mapeo`: el id definitivo lo pone el central al aplicarla). No es un estado
//   de la reserva: es dónde está.
// - **En conflicto** (`estado = 'en_conflicto'`): al subir chocó con otra reserva —de la web, del portal o de otro nodo— que llegó antes
//   al central. Gana la primera que llega; ésta queda guardada pero **no ocupa la cancha**, y una persona la mueve o la cancela.
//
// 🔴 `provisoria` ya es otra cosa en LibraClub: `EstadoReserva.PROVISORIA`, el turno retenido esperando el pago del portal. Por eso la
// etiqueta del id negativo dice «Sin subir al central» y no «Provisoria»: el cajero vería dos «Provisoria» con significados opuestos.

import { esIdProvisorio } from './ids-provisorios'

export const ESTADO_EN_CONFLICTO = 'en_conflicto'

export const ETIQUETA_SIN_SUBIR = 'Sin subir al central'
export const ETIQUETA_EN_CONFLICTO = 'En conflicto'
export const AYUDA_SIN_SUBIR = 'Se dio en este equipo sin conexión y todavía no subió al central. Sube sola cuando vuelva la conexión.'
export const AYUDA_EN_CONFLICTO = 'Chocó con otra reserva que llegó antes al central, así que no ocupa la cancha. Hay que llamar al cliente y moverla o cancelarla.'

/** ¿Es una reserva dada en un nodo que todavía no tiene su id definitivo? Los ids del central son positivos; los del nodo, negativos
 *  (hasta que el central la aplica y el id definitivo baja por el espejo). Es `esIdProvisorio`: la misma regla que usa el paciente o
 *  cliente «Provisorio» (ADR-095). */
export const esReservaProvisoria = esIdProvisorio

/** ¿Está en conflicto? Compara con el `estado` de la reserva de LibraClub. */
export const estaEnConflicto = (estado: string | null | undefined): boolean => estado === ESTADO_EN_CONFLICTO

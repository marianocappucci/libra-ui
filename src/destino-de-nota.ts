// Qué pasa con la plata cuando se acredita una factura al contado que ya está cobrada (ADR-073; el motor: ADR-065 de libracore).
//
// Decidido por el humano el 2026-10-16: «preguntar al emitir». Quien emite la nota elige «Devolver» (un egreso de caja, con el
// medio de pago) o «Dejar a favor del cliente» (un abono en su cuenta corriente). Sin elegir no se emite.
//
// Lo que la pantalla necesita saber —si hay plata que mover, cuánta, con qué medios, si hay cliente, si falta abrir el turno— lo
// contesta el motor en `GET /api/facturas/{id}/nota-credito/destino?importe=`; acá no se repite la cuenta. Si ese pedido falla
// (un motor anterior, un producto que no monta la ruta) no se pregunta nada y la nota sale como siempre.
import { useEffect, useState } from 'react'

import { api } from './api-client'

export type DestinoDeNota = 'devolver' | 'a_favor'

/** Lo que contesta `GET …/nota-credito/destino`. Sólo `aplica: true` se pregunta. */
export type OfertaDeDestino = {
  aplica: boolean
  /** Lo que la nota deja cobrado de más: lo que se mueve. */
  monto: number
  /** Lo que la nota acredita y no estaba cobrado. */
  excedente: number
  medios: { id: string; label: string }[]
  /** El único medio con el que se cobró, o `null` si hubo varios. */
  medio_sugerido: string | null
  cliente_identificado: boolean
  /** El producto exige turno y quien emite no tiene uno abierto: «Devolver» daría 409. */
  sin_turno: boolean
}

/** Lo que eligió quien emite. `destino: null` = todavía no eligió. */
export type DestinoElegido = { destino: DestinoDeNota | null; medio: string }

export const SIN_ELEGIR: DestinoElegido = { destino: null, medio: '' }

export const MENSAJE_SIN_CLIENTE =
  'Esta factura no tiene un cliente identificado: no hay una cuenta corriente donde dejar el saldo a favor.'
export const MENSAJE_SIN_TURNO = 'No hay una caja abierta. Abrí el turno antes de devolver.'

/** La forma, no la fe: un producto sin la ruta devuelve el HTML del catch-all con 200. */
function esOferta(dato: unknown): dato is OfertaDeDestino {
  const o = dato as Partial<OfertaDeDestino> | null
  return Boolean(o) && typeof o === 'object' && o!.aplica === true && typeof o!.monto === 'number' && Array.isArray(o!.medios)
}

const ESPERA_MS = 250

/** Pregunta al motor qué hay que preguntar. `url` `null` = no corresponde (no se pide nada). `importe` `null` = la nota total.
 *
 *  `oferta` es la respuesta, o `null` si no hay plata que mover o no se pudo saber. `cargando` es `true` desde que hay algo que
 *  preguntar hasta que el motor contesta: **quien emite la nota no puede hacerlo mientras tanto**, porque saldría sin destino y
 *  la plata no se movería. Con un importe que cambia espera un instante entre teclas; una respuesta vieja nunca pisa a una nueva. */
export function useOfertaDeDestino(url: string | null, importe: number | null): { oferta: OfertaDeDestino | null; cargando: boolean } {
  const clave = url === null ? null : `${url}|${importe ?? ''}`
  const [resuelto, setResuelto] = useState<{ clave: string; oferta: OfertaDeDestino | null } | null>(null)

  useEffect(() => {
    if (url === null || clave === null) return
    let vigente = true
    const contestar = (oferta: OfertaDeDestino | null) => { if (vigente) setResuelto({ clave, oferta }) }
    const espera = setTimeout(() => {
      api.get<unknown>(importe === null ? url : `${url}?importe=${importe}`)
        .then((dato) => contestar(esOferta(dato) ? dato : null))
        .catch(() => contestar(null))
    }, importe === null ? 0 : ESPERA_MS)
    return () => { vigente = false; clearTimeout(espera) }
  }, [url, importe, clave])

  if (clave === null) return { oferta: null, cargando: false }
  const vigente = resuelto?.clave === clave
  return { oferta: vigente ? resuelto.oferta : null, cargando: !vigente }
}

/** El medio con el que se devolvería: el elegido o, si no eligió, el único con el que se cobró. */
export function medioDeDevolucion(oferta: OfertaDeDestino, elegido: DestinoElegido): string {
  return elegido.medio || oferta.medio_sugerido || ''
}

/** ¿Falta algo para poder emitir? Si hay plata que mover, hay que elegir el destino (y, devolviendo, el medio). */
export function faltaElegirDestino(oferta: OfertaDeDestino | null, elegido: DestinoElegido): boolean {
  if (!oferta) return false
  if (elegido.destino === null) return true
  if (elegido.destino === 'a_favor') return !oferta.cliente_identificado
  return oferta.sin_turno || medioDeDevolucion(oferta, elegido) === ''
}

/** Lo que se suma al cuerpo del POST de la nota. Vacío si no hay nada que preguntar. */
export function cuerpoDeDestino(oferta: OfertaDeDestino | null, elegido: DestinoElegido): { destino?: DestinoDeNota; medio_pago?: string } {
  if (!oferta || elegido.destino === null) return {}
  if (elegido.destino === 'a_favor') return { destino: 'a_favor' }
  return { destino: 'devolver', medio_pago: medioDeDevolucion(oferta, elegido) }
}

/** El motor contesta `reintegro.movido: false` con un `motivo` cuando la nota no obtuvo CAE y por eso la plata no se movió. */
export function avisoDeReintegro(respuesta: unknown): string | null {
  const r = (respuesta as { reintegro?: { movido?: boolean; motivo?: string } } | null)?.reintegro
  return r && r.movido === false && r.motivo ? r.motivo : null
}

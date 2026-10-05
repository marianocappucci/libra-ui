// ¿A esta factura le corresponde ser FCE? El aviso del formulario de emisión (ADR-019 de libracore; ADR-026 acá).
//
// ARCA no lo frena: WSFE autoriza una factura común a un receptor obligado a recibir FCE (y una FCE a uno que no lo
// está), y una factura emitida no se cambia. Por eso el aviso va **antes de emitir**, mientras se arma el formulario:
// pregunta al motor (`GET /api/facturas/fce/corresponde`, que consulta el registro de FCE de ARCA) cada vez que cambian
// el CUIT del receptor o el total, con un respiro para no preguntar por cada tecla.
//
// 🔑 **Avisa, no frena.** Si el registro no contesta (sin ARCA, certificado sin `wsfecred`, ARCA caído) no se muestra
// nada: se emite como siempre. El producto lo pone en su formulario con una línea; la regla es del motor.
import { useEffect, useState } from 'react'
import { api } from './api-client'
import { formatoMoneda } from './comercio/tipos'

/** Lo que contesta el motor. `fce_habilitada`: si el emisor ya cargó CBU y modalidad, o sea si puede emitirla. */
export type RespuestaCorrespondeFce =
  | { disponible: true; corresponde: boolean; obligado: boolean; monto_desde: string | null; fce_habilitada: boolean }
  | { disponible: false; motivo: string; fce_habilitada: boolean }

/** Los tipos FCE de factura (201, 206, 211); las notas no se emiten desde el formulario. */
const TIPOS_FCE = new Set([201, 206, 211])

/** Cuánto se espera después del último cambio antes de preguntar. */
export const ESPERA_AVISO_FCE_MS = 500

export type AvisoFceProps = {
  /** CUIT del receptor, con o sin guiones. Sin 11 dígitos no se pregunta (consumidor final, nombre libre). */
  cuit: string | null | undefined
  /** Total de la factura, con IVA. */
  total: number
  /** El tipo elegido (código de ARCA), para decir lo que corresponde según lo que se eligió. */
  tipo: number | null | undefined
  /** Fecha de emisión (`AAAA-MM-DD`); la obligación depende de ella. Sin fecha, el motor usa hoy. */
  fecha?: string
  /** Para los tests: cuánto esperar antes de preguntar. */
  esperaMs?: number
}

export function AvisoFce({ cuit, total, tipo, fecha, esperaMs = ESPERA_AVISO_FCE_MS }: AvisoFceProps) {
  const digitos = (cuit ?? '').replace(/\D/g, '')
  const consultable = digitos.length === 11 && Number.isFinite(total) && total > 0
  const totalTexto = consultable ? total.toFixed(2) : ''
  // La pregunta que corresponde a lo que hay en pantalla. La respuesta se guarda con la pregunta que la pidió y sólo
  // vale si es la de ahora: así un cambio de CUIT o de total la invalida sin resetear estado dentro del efecto.
  const params = new URLSearchParams({ cuit: digitos, total: totalTexto })
  if (fecha) params.set('fecha', fecha)
  const pregunta = consultable ? `/api/facturas/fce/corresponde?${params}` : ''
  const [contestada, setContestada] = useState<{ pregunta: string; respuesta: RespuestaCorrespondeFce } | null>(null)

  useEffect(() => {
    if (!pregunta) return
    let vigente = true
    const espera = setTimeout(() => {
      api.get<RespuestaCorrespondeFce>(pregunta)
        // Sólo la respuesta de la última pregunta: una lenta no pisa a la que vino después.
        .then((r) => { if (vigente) setContestada({ pregunta, respuesta: r }) })
        // Un aviso que no se pudo pedir no es un error del formulario: no se muestra nada.
        .catch(() => {})
    }, esperaMs)
    return () => { vigente = false; clearTimeout(espera) }
  }, [pregunta, esperaMs])

  const respuesta = contestada && contestada.pregunta === pregunta ? contestada.respuesta : null
  if (!respuesta || !respuesta.disponible) return null
  const esFce = tipo != null && TIPOS_FCE.has(Number(tipo))
  const desde = respuesta.monto_desde != null ? formatoMoneda(Number(respuesta.monto_desde)) : null

  if (respuesta.corresponde && !esFce) {
    return (
      <div role="alert" className="rounded border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">A esta factura le corresponde ser Factura de Crédito Electrónica (FCE).</p>
        <p>
          ARCA registra a este receptor como obligado a recibir FCE{desde ? ` desde ${desde}` : ''}, y el total la
          alcanza. ARCA no lo frena al emitir: elegí el tipo FCE.
        </p>
        {!respuesta.fce_habilitada && (
          <p className="mt-1">
            Para poder elegirla, cargá el CBU y la modalidad de transmisión (SCA o ADC) en la configuración de ARCA.
          </p>
        )}
      </div>
    )
  }
  if (esFce && !respuesta.corresponde) {
    return (
      <p role="note" className="text-muted-foreground text-sm">
        {respuesta.obligado
          ? `Por este total no corresponde FCE: el receptor está obligado a recibirla${desde ? ` desde ${desde}` : ''}.`
          : 'ARCA no registra a este receptor como obligado a recibir FCE.'}
        {' '}Si igual la emitís, ARCA la autoriza.
      </p>
    )
  }
  return null
}

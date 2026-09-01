/** Los dos pares de credenciales de ARCA: qué ambientes hay y qué hay cargado.
 *
 *  Vive aparte de `arca.tsx` porque es **lógica sin JSX**: se puede probar sola,
 *  y un archivo de componentes que además exporta constantes rompe el fast
 *  refresh (`react(only-export-components)`).
 *
 *  ## Por qué existen dos pares
 *
 *  Hasta el 2026-09-01 una instancia guardaba **uno**, así que acompañar al
 *  cliente en pruebas contra homologación obligaba a **pisar** el certificado
 *  real: una operación destructiva y de ida y vuelta, justo sobre la credencial
 *  que después tiene que quedar bien para facturar.
 */

/** Los dos ambientes, en el orden en que se muestran.
 *
 *  Homologación primero **a propósito**: es el par que se carga mientras se
 *  acompaña al cliente. Producción es el que ya está y no se toca.
 */
export const AMBIENTES_ARCA = ['homologacion', 'produccion'] as const
export type AmbienteArca = (typeof AMBIENTES_ARCA)[number]

export const NOMBRE_DEL_AMBIENTE: Record<AmbienteArca, string> = {
  homologacion: 'Homologación (pruebas)',
  produccion: 'Producción',
}

export function nombreDelAmbiente(ambiente: string): string {
  return NOMBRE_DEL_AMBIENTE[ambiente as AmbienteArca] ?? ambiente
}

/** El estado de UN par de credenciales, tal como lo informa el backend.
 *
 *  🔑 `completo` viene del servidor y **no se recalcula acá**: con la cuenta
 *  escrita en los dos lados, las dos tienen que decir lo mismo o la pantalla
 *  contradice al que factura.
 */
export type ParDeArca = {
  ambiente: string
  tiene_certificado: boolean
  tiene_clave: boolean
  completo: boolean
  vence?: string
  dias_para_vencer?: number
  vencido?: boolean
  sujeto?: string
  error_certificado?: string
}

/** Lo mínimo que hace falta para decidir qué par mostrar. */
export type ConPares = {
  ambiente: string
  tiene_certificado: boolean
  tiene_clave: boolean
  pares?: Record<string, ParDeArca>
}

/** El par de un ambiente, con respaldo en los campos planos.
 *
 *  🔴 **El respaldo no es cosmético.** Un producto con un LibraCore anterior al
 *  2026-09-01 no manda `pares`. Sin esto, esa pantalla mostraría los dos
 *  ambientes vacíos y el operador volvería a subir un certificado que ya está
 *  — pisando el que funciona, que es el defecto entero otra vez.
 *
 *  Con backend viejo hay **un** par, y es el del selector: por eso el respaldo
 *  devuelve vacío para el otro ambiente en vez de repetirlo. Decir que hay un
 *  par de homologación que no existe haría fallar "Probar conexión" sin que
 *  nada en pantalla lo anticipe.
 */
export function parDe(cfg: ConPares, ambiente: string): ParDeArca {
  const informado = cfg.pares?.[ambiente]
  if (informado) return informado
  const esElSuyo = cfg.ambiente === ambiente
  return {
    ambiente,
    tiene_certificado: esElSuyo && cfg.tiene_certificado,
    tiene_clave: esElSuyo && cfg.tiene_clave,
    completo: esElSuyo && cfg.tiene_certificado && cfg.tiene_clave,
  }
}

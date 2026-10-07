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
  /** El CUIT del titular del certificado (`serialNumber=CUIT n` del sujeto). Sólo lo
   *  informa `GET /servicios` (libracore ADR-032); la facturación de siempre no lo manda. */
  cuit_certificado?: string
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

/** El servicio de ARCA de la facturación: el que se configura con el formulario de
 *  siempre y las rutas de siempre. Los demás se configuran sólo con sus credenciales. */
export const SERVICIO_FACTURACION = 'wsfe'

/** Un servicio de ARCA, tal como lo lista `GET {basePath}/servicios` (libracore ADR-032).
 *
 *  🔑 Que el backend liste **más de uno** es lo que decide cómo se ve la tarjeta: con la
 *  facturación sola es la de siempre, sin ninguna llamada ni etiqueta de más. */
export type ServicioArca = {
  servicio: string
  etiqueta: string
  ayuda?: string
  empresa?: string
  /** Hay un par completo en algún ambiente. NO dice que ande: eso lo dice «Probar». */
  configurado?: boolean
  pares: Record<string, ParDeArca>
}

/** Lo que contesta `POST {basePath}/servicios/{servicio}/probar` cuando autenticó. */
export type PruebaDeServicio = {
  ok: boolean
  servicio?: string
  ambiente?: string
  mensaje?: string
  cuit_certificado?: string
  /** El `dummy` del servicio, si lo tiene; `null` si ARCA no contestó. Es informativo. */
  servicio_en_linea?: Record<string, string> | null
}

/** Lo que se dice de un servicio cuando el backend no manda su `ayuda`. */
export const AYUDA_DEL_SERVICIO: Record<string, string> = {
  wscpe: 'El certificado puede estar a nombre de la persona que representa a la empresa.',
}

/** `GET /servicios` con un backend viejo contesta 404, y con uno que no lo conoce puede
 *  contestar cualquier cosa: sólo se acepta una lista de servicios bien formados. */
export function serviciosValidos(respuesta: unknown): ServicioArca[] {
  if (!Array.isArray(respuesta)) return []
  return respuesta.filter((s): s is ServicioArca =>
    Boolean(s) && typeof s === 'object'
    && typeof (s as ServicioArca).servicio === 'string'
    && typeof (s as ServicioArca).etiqueta === 'string'
    && typeof (s as ServicioArca).pares === 'object' && (s as ServicioArca).pares !== null,
  )
}

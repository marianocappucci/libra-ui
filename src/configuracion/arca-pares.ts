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

/** El nombre sin el aclarado entre paréntesis: el de las pestañas y la pastilla del encabezado. */
export const NOMBRE_CORTO_DEL_AMBIENTE: Record<AmbienteArca, string> = {
  homologacion: 'Homologación',
  produccion: 'Producción',
}

export function nombreCortoDelAmbiente(ambiente: string): string {
  return NOMBRE_CORTO_DEL_AMBIENTE[ambiente as AmbienteArca] ?? ambiente
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
  /** El pedido de certificado que espera su `.crt` (libracore ADR-036). **Sólo viene cuando
   *  hay uno pendiente**; la clave privada que le corresponde no sale nunca del servidor. */
  pedido?: PedidoPendiente
}

/** Un pedido de certificado generado en el servidor, a la espera del `.crt` de ARCA. */
export type PedidoPendiente = {
  pendiente: true
  servicio: string
  ambiente: string
  alias: string
  cuit: string
  razon_social: string
  /** El sujeto del `.csr` tal como lo lee el servidor (`CN=…,serialNumber=CUIT …`). */
  sujeto?: string
  /** `dd-mm-aaaa`, en hora argentina. */
  creado: string
}

/** Lo que contesta `POST …/pedido`: el pedido, más el `.csr` (que es público) en PEM. */
export type PedidoGenerado = PedidoPendiente & { csr: string }

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
  /** 🔑 El motor sabe generar el pedido de certificado (libracore ADR-036). Un LibraCore
   *  anterior no manda la clave, y entonces la pantalla no muestra un botón que daría 404. */
  admite_pedido?: boolean
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

/** Cuántos días antes de vencer se empieza a avisar. Un certificado dura dos
 *  años: con un mes hay tiempo de sobra para renovarlo, y menos que eso
 *  convierte el aviso en una urgencia. */
export const DIAS_DE_AVISO = 30

// ── El pedido de certificado (libracore ADR-036) ────────────────────────────

/** ¿Tiene sentido ofrecer «Generar pedido de certificado» para este par?
 *
 *  Sí cuando **no hay un par completo** (una empresa nueva, o a la que sólo le falta una
 *  mitad) y cuando el que hay **está vencido o por vencer** (la renovación es el mismo
 *  trámite). Con un par vigente y lejos de vencer no se ofrece: pedir otro certificado ahí es,
 *  casi siempre, un error. Con un pedido ya pendiente tampoco: se ve su estado en su lugar. */
export function puedePedirCertificado(par: ParDeArca): boolean {
  if (par.pedido?.pendiente) return false
  if (!par.completo) return true
  return Boolean(par.vencido) || (par.dias_para_vencer ?? Infinity) <= DIAS_DE_AVISO
}

/** El alias que se propone para el pedido: producto + servicio + ambiente, en minúsculas y sin
 *  signos (`libracargowscpeprod`). ARCA no admite guiones ni espacios en el alias. Es una
 *  sugerencia editable; el motor valida de 3 a 40 letras y números. */
export function aliasSugerido(producto: string, servicio: string, ambiente: string): string {
  const limpio = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '')
  const final = `${limpio(servicio)}${ambiente === 'produccion' ? 'prod' : 'homo'}`
  // El producto cede lugar antes que el servicio y el ambiente, que son lo que distingue un alias.
  return `${limpio(producto).slice(0, Math.max(0, 40 - final.length))}${final}`
}

/** Cómo nombra ARCA a cada servicio, para el paso de habilitarlo. */
const SERVICIO_EN_ARCA: Record<string, string> = {
  wsfe: 'wsfe (Facturación electrónica)',
  wscpe: 'wscpe (Carta de Porte Electrónica)',
}

/** Los pasos que hay que hacer en ARCA con el `.csr` en la mano, armados con el CUIT y el alias de
 *  **este** pedido. Texto plano: la pantalla los numera.
 *
 *  Producción y homologación son dos trámites distintos en dos sitios distintos de ARCA, y
 *  confundirlos es el error de siempre: un certificado de homologación no vale en producción. */
export function pasosParaArca(
  { ambiente, servicio, alias, cuit }: { ambiente: string; servicio: string; alias: string; cuit: string },
): string[] {
  const nombreDelServicio = SERVICIO_EN_ARCA[servicio] ?? servicio
  const descargar = `Descargá el archivo ${alias}.csr con el botón de arriba.`
  const subir = 'Subí el certificado (.crt) en esta misma pantalla. No hace falta cargar ninguna clave privada: ya está guardada en el servidor.'
  if (ambiente === 'produccion') {
    return [
      descargar,
      `Ingresá a ARCA con la clave fiscal del CUIT ${cuit} (nivel 3 o superior) y abrí el servicio «Administración de Certificados Digitales».`,
      `Agregá un alias nuevo con el nombre ${alias} y subí el archivo .csr. Descargá el certificado (.crt) que ARCA genera.`,
      `En «Administrador de Relaciones de Clave Fiscal» elegí «Nueva relación» y seleccioná el servicio ${nombreDelServicio}. Como representante, el CUIT del certificado (${cuit}); como computador fiscal, el alias ${alias}.`,
      subir,
    ]
  }
  return [
    descargar,
    'Ingresá a ARCA con tu clave fiscal y abrí el servicio «WSASS - Autogestión Certificados Homologación».',
    `Elegí «Nuevo certificado», escribí ${alias} como nombre simbólico y pegá el contenido del archivo .csr. Descargá el certificado (.crt).`,
    `En el mismo servicio elegí «Crear autorización a servicio»: seleccioná el certificado ${alias}, el CUIT ${cuit} y el servicio ${nombreDelServicio}.`,
    subir,
  ]
}

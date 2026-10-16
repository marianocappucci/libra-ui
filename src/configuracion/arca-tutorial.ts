/** Dónde está el tutorial «¿Qué servicio debo habilitar para consultar datos de clientes por CUIT?»
 *  (`TutorialArcaPadron`): la pestaña General de la tarjeta de ARCA, en Configuración → Integraciones. El ancla la
 *  usa el `<details>` del tutorial para abrirse solo cuando se llega con ella. */
export const ID_TUTORIAL_PADRON = 'tutorial-padron-a13'
export const URL_TUTORIAL_PADRON = `/configuracion?seccion=integraciones&integracion=arca#${ID_TUTORIAL_PADRON}`

/** El error de la consulta de CUIT se arregla en Configuración: 503 («Configurá los certificados ARCA…») o 403 («el
 *  certificado no tiene acceso al servicio de Padrón…»). Sólo si el cuerpo es `{error}`, el del router del motor: un
 *  403 de permisos o de módulo apagado trae `{detail}` y el tutorial no lo arregla. */
export const errorQueSeArreglaEnConfiguracion = (estado: number, cuerpo: { error?: unknown }): boolean =>
  typeof cuerpo.error === 'string' && (estado === 403 || estado === 503)

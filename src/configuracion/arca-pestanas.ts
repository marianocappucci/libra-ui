/** Las pestañas de la tarjeta de ARCA: cuáles hay, cuál se muestra y qué etiqueta de estado lleva cada una.
 *
 *  Lógica sin JSX, aparte de `arca.tsx` por lo mismo que `arca-pares.ts`: se prueba sola y el archivo de componentes
 *  exporta sólo componentes. Toda la lógica de los pares (`completo`, `vencido`, `dias_para_vencer`) la sigue
 *  calculando el motor: acá sólo se elige qué palabra le toca a cada combinación. */
import type { TonoEstado } from '../badge-estado'
import {
  AMBIENTES_ARCA, DIAS_DE_AVISO, parDe, type ParDeArca, type ServicioArca,
} from './arca-pares'

/** La pestaña con la que se abre la tarjeta: los datos de la facturación. */
export const PESTANA_GENERAL = 'general'

/** El parámetro de la URL que guarda la pestaña (`?arca=produccion`), para que «atrás» vuelva a la anterior. */
export const PARAM_PESTANA = 'arca'

/** Una etiqueta de estado: SIEMPRE con texto. El tono sólo la refuerza, nunca la sustituye. */
export type EtiquetaDeEstado = { texto: string; tono: TonoEstado }

/** Las pestañas, en orden: General, los dos ambientes de la facturación y una por cada otro servicio. */
export function pestanasDe(otros: ServicioArca[]): string[] {
  return [PESTANA_GENERAL, ...AMBIENTES_ARCA, ...otros.map((x) => x.servicio)]
}

/** La pestaña que se muestra: la pedida si existe y, si no (una URL vieja, un servicio que el motor ya no lista, o que
 *  todavía no llegó), General. */
export function pestanaActual(pedida: string | null, otros: ServicioArca[]): string {
  return pedida && pestanasDe(otros).includes(pedida) ? pedida : PESTANA_GENERAL
}

/** El estado de un ambiente de la facturación. `enUso` es el ambiente con que se factura (el guardado, no el que se
 *  está eligiendo sin guardar).
 *
 *  Si el par dice algo que pide acción (ilegible, a medias, vencido, por vencer) eso gana sobre «En uso»: la pastilla
 *  del encabezado y el aviso de la pestaña ya dicen cuál es el ambiente en uso. */
export function estadoDelAmbiente(par: ParDeArca, enUso: boolean): EtiquetaDeEstado {
  if (par.error_certificado) return { texto: 'Con error', tono: 'negativo' }
  if (!par.tiene_certificado && !par.tiene_clave) {
    // Un ambiente sin nada cargado es normal... salvo que sea con el que se factura.
    return { texto: 'Sin cargar', tono: enUso ? 'negativo' : 'neutro' }
  }
  if (!par.completo) return { texto: 'Incompleto', tono: 'atencion' }
  if (par.vencido) return { texto: 'Vencido', tono: 'negativo' }
  if ((par.dias_para_vencer ?? Infinity) <= DIAS_DE_AVISO) return { texto: 'Vence pronto', tono: 'atencion' }
  return enUso ? { texto: 'En uso', tono: 'ok' } : { texto: 'Cargado', tono: 'ok' }
}

/** El estado de un servicio que no es la facturación (sus dos ambientes juntos). */
export function estadoDelServicio(pares: ServicioArca['pares']): EtiquetaDeEstado {
  const vacio = { ambiente: '', tiene_certificado: false, tiene_clave: false, pares }
  const homologacion = parDe(vacio, 'homologacion')
  const produccion = parDe(vacio, 'produccion')
  const dos = [homologacion, produccion]

  if (dos.some((p) => p.error_certificado)) return { texto: 'Con error', tono: 'negativo' }
  if (dos.some((p) => p.completo && p.vencido)) return { texto: 'Vencido', tono: 'negativo' }
  if (homologacion.completo && produccion.completo) {
    return dos.some((p) => (p.dias_para_vencer ?? Infinity) <= DIAS_DE_AVISO)
      ? { texto: 'Vence pronto', tono: 'atencion' }
      : { texto: 'Completo', tono: 'ok' }
  }
  if (homologacion.completo) return { texto: 'Falta producción', tono: 'atencion' }
  if (produccion.completo) return { texto: 'Falta homologación', tono: 'atencion' }
  if (dos.some((p) => p.tiene_certificado || p.tiene_clave)) return { texto: 'Incompleto', tono: 'atencion' }
  return { texto: 'Sin cargar', tono: 'neutro' }
}

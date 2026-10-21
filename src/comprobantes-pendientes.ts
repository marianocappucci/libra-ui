// La bandeja de comprobantes pendientes de facturar: los tipos de lo que contesta el motor y los textos, sin componentes
// (ADR-087; el motor es `libracore.comprobantes_router.build_comprobantes_bandeja_router`). La pantalla es
// `BandejaDeComprobantes.tsx`.
import { FileSpreadsheet, FileText, Package, Wrench } from 'lucide-react'
import type { ComponentType } from 'react'

import { fecha } from './fechas'

/** El prefijo de las dos rutas de la bandeja (la de ingesta, que depositan los otros productos, y la que mira la persona). */
export const RUTA_COMPROBANTES_PENDIENTES = '/api/comprobantes-pendientes'

export type ComprobantePendienteItem = {
  description: string
  qty: number
  unit_price: number
  iva_rate: number
}

/** Una fila de la bandeja (`libracore.db.comprobantes_pendientes`). */
export type ComprobantePendiente = {
  id: number
  origen_producto: string
  origen_instancia: string
  /** Lo manda otro sistema (`cuota_contrato`, `incidencia`, `remito`, `presupuesto`…) o, con `venta`, lo dejó el nodo de
   *  LibraEdge del propio producto: una venta cobrada sin conexión (`esVentaSinConexion`). */
  origen_tipo: string
  origen_id: string
  cliente_id: number | null
  cliente_cuit: string
  cliente_razon: string
  cliente_domicilio: string
  periodo_desde: string
  periodo_hasta: string
  concepto: string
  condicion_venta: string
  observaciones: string
  items: ComprobantePendienteItem[]
  total: number
  estado: 'pendiente' | 'facturado' | 'descartado'
  factura_id: number | null
  motivo_descarte: string
  resuelto_at: string
  resuelto_por: string
  created_at: string
}

/** Lo que contesta `GET /api/comprobantes-pendientes`. Los resueltos vienen acotados (los últimos 50). */
export type BandejaDeComprobantesDatos = {
  pendientes: ComprobantePendiente[]
  facturados: ComprobantePendiente[]
  descartados: ComprobantePendiente[]
  total_pendientes: number
}

/** El formulario de factura armado a partir de los pendientes elegidos: lo que contesta `POST .../facturar-prefill`. No trae
 *  `tipo` ni `punto_venta` a propósito: los decide el producto según la condición de IVA del emisor y del receptor. */
export type PrefillComprobantes = {
  comprobantes_ids: number[]
  avisos: string[]
  concepto: number
  condicion_venta: string
  tax_rate: number
  client_id: number | null
  client_name: string
  client_cuit: string
  client_address: string
  fecha: string
  observations: string
  items: { description: string; qty: number; unit_price: number }[]
  fch_serv_desde: string
  fch_serv_hasta: string
  fch_vto_pago: string
}

export type OrigenDeComprobante = { label: string; icon: ComponentType<{ className?: string }> }

/** El origen se muestra con etiqueta propia y no con el string crudo: lo manda otro sistema y «cuota_contrato» no
 *  significa nada para quien mira la bandeja. Son los que mandan hoy los productos de la familia; un producto suma o pisa
 *  los suyos con la prop `origenes`. (`venta` no está acá: lo rotula `EtiquetaVentaSinConexion`.) */
export const ORIGENES_DE_COMPROBANTE: Record<string, OrigenDeComprobante> = {
  cuota_contrato: { label: 'Cuota de contrato', icon: Package },
  incidencia: { label: 'Ticket', icon: Wrench },
  remito: { label: 'Remito', icon: FileText },
  presupuesto: { label: 'Presupuesto', icon: FileSpreadsheet },
}

export const TITULO_BANDEJA = 'Comprobantes a facturar'
export const TEXTO_BANDEJA_DE_CONSULTA = 'Lo que quedó esperando para facturar. Las ventas cobradas sin conexión se facturan solas cuando vuelve la conexión.'

/** El período de un comprobante: `—`, un día, o `desde → hasta`. */
export function periodoDelComprobante(c: Pick<ComprobantePendiente, 'periodo_desde' | 'periodo_hasta'>): string {
  if (!c.periodo_desde && !c.periodo_hasta) return '—'
  if (c.periodo_desde === c.periodo_hasta) return fecha(c.periodo_desde)
  return `${fecha(c.periodo_desde) || '—'} → ${fecha(c.periodo_hasta) || '—'}`
}

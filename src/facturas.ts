// Dominio de facturación compartido por los dos productos que emiten
// comprobantes con pantalla propia: Contalibra y Restolibra. Los otros tres
// verticales facturan desde el turno o desde el POS y no usan nada de esto.
//
// Estos tipos vivían duplicados en el `api.ts` de cada producto, byte a byte
// -- se verificó con un diff antes de moverlos, no de memoria. Cada `api.ts`
// los re-exporta desde acá, así los ~50 archivos que hoy los importan de
// `../api` siguen andando sin tocarse (mismo patrón que `cn` en `lib/utils.ts`
// y que `api`/`ApiError` en `api-client`).
//
// El backend que los alimenta es `libracore` -- ver su `db/facturas.py` y
// `facturas_borrador.py`.

export type Caja = {
  id: number
  nombre: string
  es_default: number
  medios_pago: string[]
}

// 🔴 Acá vivía `MEDIOS_PAGO_LABELS`, una copia TypeScript de la lista del
// motor. **Divergía en las dos direcciones**: tenía `cheque`, que la lista
// canónica no ofrecía, y le faltaban las tarjetas. Como `FacturaDetalle` armaba
// con ella el fallback del selector de cobro, esta pantalla estaba ofreciendo
// medios que el backend rechazaba y escondiendo los que sí aceptaba.
//
// La lista es del backend y llega por API (`GET /api/ventas/medios-pago`); acá
// no se declara ninguna. Lo único que quedó del lado del navegador son los
// íconos y las abreviaturas, en `libra-ui/medios-pago`, y son **lookups
// parciales con fallback**: agregar un medio en LibraCore no rompe ninguna
// pantalla.
//
// Ver `wiki/concepts/medios-de-pago-familia-libra.md`.
//
// ("cuenta_corriente" sigue sin ser un medio de cobro de un comprobante: es la
// marca de venta a crédito. La pantalla de cobro lo filtra y el backend lo
// rechaza — ver `libracore.cobros`.)

export type FacturaItem = {
  description: string
  qty: number
  unit_price: number
  subtotal: number
}

export type Factura = {
  id: number
  tipo: number
  punto_venta: number
  numero: number
  fecha: string
  cliente_cuit: string
  cliente_razon: string
  cliente_domicilio?: string
  items: FacturaItem[]
  subtotal: number
  iva_amount: number
  total: number
  concepto: number
  cae: string
  cae_vto: string
  observaciones: string
  condicion_venta: string
  total_cobrado?: number
  cbte_asoc_tipo?: number
  cbte_asoc_pv?: number
  cbte_asoc_nro?: number
  fch_serv_desde?: string
  fch_serv_hasta?: string
  fch_vto_pago?: string
}

export type FacturaDetalle = {
  factura: Factura
  tipo_label: string
  concepto_label: string
  iva_label: string
  notas_credito: Factura[]
  notas_debito: Factura[]
  factura_original: Factura | null
  cobros: { id: number; monto: number; medio_pago: string; fecha: string; referencia: string }[]
  total_cobrado: number
  pendiente: number
  cliente_email: string
}

// Borrador para emitir una copia de un comprobante (POST
// /api/facturas/{id}/duplicar). Lo arma el backend con
// `libracore.facturas_borrador`, incluido el recalculo de las fechas de
// servicio y del vencimiento de pago para la fecha de hoy.
export type BorradorDuplicado = {
  tipo: number
  punto_venta: number
  concepto: number
  condicion_venta: string
  tax_rate: number
  client_id: number | null
  client_name: string
  observations: string
  items: { description: string; qty: number; unit_price: number }[]
  fch_serv_desde: string
  fch_serv_hasta: string
  fch_vto_pago: string
}

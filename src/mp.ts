// Los tipos de la bandeja de MercadoPago, compartidos por los productos que la
// montan.
//
// Estaban escritos dos veces —Contalibra y Restolibra, byte a byte iguales— al
// lado de una pantalla que también estaba escrita dos veces. Al traer la
// pantalla acá, dejarles los tipos allá habría sido partir en dos algo que se
// lee junto: el componente y la forma de lo que muestra.
//
// La forma la fija el motor: `libracore.mp_bandeja_router` es quien arma estas
// filas, y los tres productos consumen el MISMO router bajo el MISMO prefijo
// (`/api/mp-bandeja`). No hay una variante por producto que declarar.

/** La ficha del cliente, tal como la devuelve el motor junto al pago.
 *
 * 🔑 Vive acá y no en un módulo de clientes propio porque es el único lugar del
 * kit que la necesita. Los tres productos la re-exportan desde su `api.ts` para
 * no tener una segunda declaración de la misma forma. */
export type Cliente = {
  id: number
  name: string
  address: string
  cuit_dni: string
  email: string
  phone: string
  iva_condition: string
  auto_facturar: number
  activo: number
}

/** Un cobro de MercadoPago pendiente de conciliar. */
export type MpPago = {
  id: number
  mp_payment_id: string
  monto: number
  payer_email: string
  payer_name: string
  payment_type: string | null
  payment_method: string | null
  descripcion_mp: string | null
  payer_id_type: string | null
  payer_id_number: string | null
  estado_factura: string
  factura_id: number | null
  created_at: string
  cliente: Cliente | null
}

/** Un movimiento de la cuenta de MercadoPago: una transferencia que entró. */
export type MpMovimiento = {
  id: number
  mp_movement_id: string
  tipo: string
  monto: number
  fecha: string
  descripcion: string
  origen_nombre: string
  origen_banco: string | null
  origen_cbu: string | null
  payer_email: string
  payer_name: string
  payer_id_type: string | null
  payer_id_number: string | null
  estado_factura: string
  factura_id: number | null
  created_at: string
  cliente: Cliente | null
}

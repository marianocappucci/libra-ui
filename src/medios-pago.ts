/** El vocabulario de medios de pago, del lado del navegador.
 *
 *  🔴 **Esto NO es la lista.** La lista es de `libracore.medios_pago`, en el
 *  backend, y llega por API — `GET /api/ventas/medios-pago` para los selectores
 *  y el `medio_label` de los reportes para las etiquetas. Acá vive sólo lo que
 *  el backend no puede tener: **el ícono y la abreviatura**, que son decisiones
 *  de pantalla.
 *
 *  La diferencia importa. Hasta el 2026-08-24 cada producto declaraba su propia
 *  lista de medios en TypeScript, y por eso `libra-ui/facturas.ts` tenía
 *  `cheque` —que la lista canónica no tenía— y a la vez le faltaban las
 *  tarjetas. Una copia en el frontend **siempre** termina divergiendo de la del
 *  backend, porque nada las compara.
 *
 *  Este módulo está escrito para que esa divergencia no se pueda repetir:
 *
 *  - `ETIQUETA_CORTA` e `ICONO` son **lookups parciales con fallback**, no
 *    listas. Un medio que no esté acá se dibuja igual, con su ícono genérico y
 *    su nombre completo. Agregar uno al motor no rompe ninguna pantalla.
 *  - No se exporta ningún array de medios. Si una pantalla necesita "todos los
 *    medios", los pide a la API.
 *
 *  Ver `wiki/concepts/medios-de-pago-familia-libra.md` para el inventario de las
 *  28 declaraciones que había y las seis formas en que ya divergían.
 */
import {
  ArrowRightLeft, Banknote, CreditCard, Landmark, Receipt, Smartphone,
  Wallet, WalletCards,
  type LucideIcon,
} from 'lucide-react'

/** Abreviaturas para las columnas angostas (la grilla de Ventas).
 *
 *  Parcial a propósito: lo que no esté acá cae al nombre completo, que es
 *  largo pero correcto. Nunca vacío. */
export const ETIQUETA_CORTA: Record<string, string> = {
  efectivo: 'Efec.',
  transferencia: 'Transf.',
  tarjeta_debito: 'T. déb.',
  tarjeta_credito: 'T. créd.',
  mercadopago: 'MP',
  cuenta_dni: 'C. DNI',
  billetera: 'Billet.',
  cheque: 'Cheque',
  cuenta_corriente: 'Cta. Cte.',
  // Grafías históricas: hay ventas viejas con estos medios y las grillas las
  // muestran igual. Ver `HISTORICOS` en el motor.
  //
  // `mercado_pago` estaba acá y salió el 2026-08-25, junto con su entrada en el
  // motor: las filas de VentaLibra que la tenían se migraron primero. Desde
  // entonces ver el slug crudo en una grilla es la señal de que algo la volvió
  // a escribir, y taparlo con una abreviatura escondería justamente eso.
  tarjeta: 'Tarjeta',
  debito: 'T. déb.',
  credito: 'T. créd.',
}

/** El ícono de cada medio. `ICONO_POR_DEFECTO` cubre todo lo demás. */
export const ICONO: Record<string, LucideIcon> = {
  efectivo: Banknote,
  transferencia: Landmark,
  tarjeta_debito: CreditCard,
  tarjeta_credito: CreditCard,
  mercadopago: Smartphone,
  cuenta_dni: CreditCard,
  billetera: WalletCards,
  cheque: Receipt,
  cuenta_corriente: ArrowRightLeft,
  tarjeta: CreditCard,
  debito: CreditCard,
  credito: CreditCard,
}

/** 🔴 Para lo que el motor todavía no nombró. Que exista es lo que permite
 *  agregar un medio en LibraCore sin tocar ninguna pantalla. */
export const ICONO_POR_DEFECTO: LucideIcon = Wallet

export function iconoDe(medio: string): LucideIcon {
  return ICONO[medio] ?? ICONO_POR_DEFECTO
}

/** Los medios que se cobran **escaneando un QR o desde una billetera**.
 *
 *  🔴 **Espeja a `libracore.medios_pago.MEDIOS_ELECTRONICOS`**, y eso es una
 *  duplicación con la que hay que convivir: el backend la necesita para su
 *  `WHERE ... IN (...)` y el navegador para decidir si ofrece el botón del QR,
 *  y no hay forma de que una sea la otra sin un pedido de red que esta decisión
 *  no justifica.
 *
 *  Lo que sí se puede es que haya **una sola copia del lado del navegador** en
 *  vez de una por producto. Estaba escrita a mano en `VentaDetalle.tsx` de
 *  Contalibra —con `qr`— y en el de Restolibra —**sin `qr`**, ya divergiendo—,
 *  más un `frozenset` propio en VentaLibra que acepta las dos grafías de
 *  MercadoPago.
 *
 *  Incluye `qr`, que es histórico: nunca estuvo declarado en ninguna lista, así
 *  que si hay filas con ese valor no salieron de un selector — y el botón tiene
 *  que aparecer igual.
 *
 *  Incluía también `mercado_pago`, la grafía de VentaLibra, hasta el
 *  2026-08-25: salió junto con la del motor, después de migrar las filas que la
 *  tenían y verificar cero. */
export const MEDIOS_ELECTRONICOS = [
  'mercadopago', 'billetera', 'cuenta_dni', 'qr',
] as const

/** Si el pago se hizo por un medio que MercadoPago puede referenciar.
 *
 *  Es lo que decide si se ofrece el botón de cobrar con QR:
 *  `add_venta_pago_referencia_mp` sella la referencia sobre una fila de pago con
 *  uno de estos medios, y **sin esa fila el pago se acredita en MercadoPago y no
 *  queda atado a la venta**. */
export function esElectronico(medio: string): boolean {
  return (MEDIOS_ELECTRONICOS as readonly string[]).includes(medio)
}

/** La abreviatura para una columna angosta.
 *
 *  🔴 **Nunca devuelve vacío ni un guión.** Un medio que nadie nombró sólo se
 *  descubre si alguien lo ve escrito; taparlo lo esconde justo en la pantalla
 *  donde se cuadra la caja.
 *
 *  @param etiquetas el `medio_label` que devolvió la API, si la pantalla lo tiene.
 */
export function etiquetaCorta(
  medio: string, etiquetas?: Record<string, string>,
): string {
  return ETIQUETA_CORTA[medio] ?? etiquetas?.[medio] ?? medio
}

/** El nombre completo, para un selector o una ficha.
 *
 *  🔴 **Manda el backend**, y por eso va primero: si el frontend le ganara,
 *  agregar un medio en LibraCore no alcanzaría para que se vea bien acá.
 *
 *  Y **no cae en la abreviatura**: "Efec." en un selector ancho es peor que el
 *  slug. Pasó al sacar la copia de `facturas.ts` — el selector de cobro se
 *  llenó de abreviaturas y dos tests de esta casa lo agarraron.
 *
 *  ⚠️ El último recurso es **el slug crudo, sin maquillar**. Se probó
 *  humanizarlo (`tarjeta_debito` → "Tarjeta debito") y estaba mal: un medio que
 *  nadie nombró tiene que *parecer* que nadie lo nombró. Con el slug hecho
 *  título se lee como una etiqueta legítima y deja de ser una señal. Lo agarró
 *  un test que ya existía acá — *"un medio de pago que no está en el
 *  diccionario se muestra igual"*. */
export function etiqueta(
  medio: string, etiquetas?: Record<string, string>,
): string {
  return etiquetas?.[medio] ?? medio
}

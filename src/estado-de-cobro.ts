// Cuánto falta cobrar de una factura, y cómo se rotula: una sola cuenta para el listado, el detalle y el tablero.
//
// Desde el ADR-059 del motor (libracore ≥ v1.172.0) **lo pendiente es `total − cobrado − acreditado`**, donde
// «acreditado» es lo que restan las notas de crédito con CAE, y nunca es negativo. Antes cada pantalla decía
// `cobrado < total` por su cuenta, y una factura acreditada por completo figuraba «Sin cobrar» con un botón que
// daba 409. El motor ya manda la cuenta hecha (`pendiente`, `total_acreditado`); acá sólo se la lee, en un
// lugar, para que ninguna pantalla vuelva a restar a mano.
//
// **Compatibilidad con un motor viejo** (no manda `pendiente` por fila ni `total_acreditado`): se cae en la
// cuenta de siempre, `total − cobrado`, y los rótulos son los de antes. Nada se rompe ni se inventa: sin el
// dato de las notas, una factura no puede figurar «Acreditada».

/** La tolerancia del motor (`sql_con_pendiente`): menos de medio centavo no es «falta cobrar». Evita que una
 *  suma de flotantes (0,1 + 0,2) deje «Sin cobrar» a una factura que está cobrada. */
export const MEDIO_CENTAVO = 0.005

/** Lo mínimo que hace falta saber de una factura para rotularla: todo menos `total` es opcional, porque un
 *  motor viejo no lo manda. Lo cumplen la fila del listado, el detalle (armado con `cuentaDelDetalle`) y la fila
 *  del tablero. */
export type CuentaDeCobro = {
  total: number
  total_cobrado?: number | null
  total_acreditado?: number | null
  pendiente?: number | null
}

export type EstadoDeCobro = 'acreditada' | 'cobrada' | 'parcial' | 'sin_cobrar'

function numeroOnull(valor: number | null | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

/** Lo que restan las notas de crédito con CAE; 0 si el motor no lo manda. */
export function acreditadoDe(cuenta: CuentaDeCobro): number {
  return Math.max(0, numeroOnull(cuenta.total_acreditado) ?? 0)
}

/** Lo cobrado, 0 si el dato no llegó. */
export function cobradoDe(cuenta: CuentaDeCobro): number {
  return Math.max(0, numeroOnull(cuenta.total_cobrado) ?? 0)
}

/** Lo que falta cobrar, nunca negativo. Si el motor manda `pendiente`, ese; si no, `total − cobrado − acreditado`
 *  (con un motor viejo, `total − cobrado`). */
export function pendienteDe(cuenta: CuentaDeCobro): number {
  const delMotor = numeroOnull(cuenta.pendiente)
  if (delMotor !== null) return Math.max(0, delMotor)
  return Math.max(0, cuenta.total - cobradoDe(cuenta) - acreditadoDe(cuenta))
}

/** ¿Falta cobrar algo? Es lo que decide el botón de cobrar, «Sin cobrar» y «Parcial». */
export function tienePendiente(cuenta: CuentaDeCobro): boolean {
  return pendienteDe(cuenta) > MEDIO_CENTAVO
}

/** ¿Las notas de crédito cubren **todo** el total? Con un total en cero no hay nada que acreditar. */
export function estaAcreditadaPorCompleto(cuenta: CuentaDeCobro): boolean {
  return cuenta.total > 0 && acreditadoDe(cuenta) >= cuenta.total - MEDIO_CENTAVO
}

/** El rótulo de la factura en el listado:
 *  - `acreditada`: las notas de crédito cubren todo el total (aunque antes se haya cobrado);
 *  - `cobrada`: no falta nada (cobrada, o cobrada más lo que acreditó una nota parcial);
 *  - `parcial`: se cobró algo y falta algo;
 *  - `sin_cobrar`: falta todo lo que quedaba (una nota parcial sola no la convierte en «Parcial»: no se cobró nada). */
export function estadoDeCobro(cuenta: CuentaDeCobro): EstadoDeCobro {
  if (estaAcreditadaPorCompleto(cuenta)) return 'acreditada'
  if (!tienePendiente(cuenta)) return 'cobrada'
  if (cobradoDe(cuenta) > MEDIO_CENTAVO) return 'parcial'
  return 'sin_cobrar'
}

/** Sólo se ofrece cobrar lo que tiene algo pendiente: una acreditada por completo daría 409 en el motor. */
export function puedeCobrar(cuenta: CuentaDeCobro): boolean {
  return tienePendiente(cuenta)
}

/** La cuenta de un detalle (`GET /api/facturas/{id}`): el total vive en `factura`, lo demás al costado. */
export function cuentaDelDetalle(detalle: {
  factura: { total: number }
  total_cobrado?: number | null
  total_acreditado?: number | null
  pendiente?: number | null
}): CuentaDeCobro {
  return {
    total: detalle.factura.total,
    total_cobrado: detalle.total_cobrado,
    total_acreditado: detalle.total_acreditado,
    pendiente: detalle.pendiente,
  }
}

// Los tipos de comprobante de ARCA que la pantalla distingue, en un lugar: la copia TypeScript de `libracore/tipos_comprobante.py`.
//
// Antes cada pantalla decía `[1, 6, 11].includes(tipo)` por su cuenta, y eso dejaba afuera a la nota de débito (que desde el ADR-064 del
// motor tiene tope de cobro y desde el ADR-066 un «pendiente» que se ve) y a la Factura de Crédito Electrónica MiPyME (FCE: 201/206/211 y
// sus notas 202/207/212 y 203/208/213). Un tipo que falta en una lista **desaparece** de la pantalla sin error: «Registrar cobro» no
// aparece. Por eso la lista es una, y las pantallas preguntan acá.
//
// Los números son los de ARCA y los fija el motor; si el motor suma un tipo, se suma acá y en ningún otro lado.

/** Las facturas (A, B, C y FCE A, B, C): lo que se emite, se acredita (nota de crédito) y se recarga (nota de débito). */
export const FACTURAS: readonly number[] = [1, 6, 11, 201, 206, 211]

/** Las notas de crédito (A, B, C y FCE): no se cobran, restan. */
export const NC: readonly number[] = [3, 8, 13, 203, 208, 213]

/** Las notas de débito (A, B, C y FCE): suman a lo que se debe. */
export const ND: readonly number[] = [2, 7, 12, 202, 207, 212]

/** Lo que se cobra y tiene un pendiente que mostrar: las facturas **y las notas de débito** (`tipos.COBRABLES` del motor, ADR-064 y
 *  ADR-066). Las notas de crédito no se cobran. */
export const COBRABLES: readonly number[] = [...FACTURAS, ...ND]

/** ¿Es una factura (común o FCE)? Es lo que decide acreditar o recargar: las notas se emiten sobre facturas, no sobre otras notas. */
export const esFactura = (tipo: number): boolean => FACTURAS.includes(tipo)

/** ¿Se cobra? Es lo que decide «Registrar cobro», el estado de cobro y el botón «Cobrar» del listado. */
export const esCobrable = (tipo: number): boolean => COBRABLES.includes(tipo)

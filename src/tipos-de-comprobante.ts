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

// --- Cómo se lee cada tipo ---------------------------------------------------------------------------------------------------------------
//
// Los rótulos (nombre, letra, siglas) también salen de acá. Antes cada pantalla traía su tabla `{ 1: 'A', 6: 'B', 11: 'C', 3: … }` sin las FCE:
// un 211 salía «?» en el detalle y en el listado, y `tipo !== 11` lo hacía discriminar un IVA que una clase C no discrimina (ADR-075).

/** La letra de cada tipo: la `LETRA` de `libracore/tipos_comprobante.py`. La FCE conserva la letra de su factura común (201 es A, 206 es B, 211 es C). */
const LETRA: Readonly<Record<number, 'A' | 'B' | 'C'>> = {
  1: 'A', 6: 'B', 11: 'C', 3: 'A', 8: 'B', 13: 'C', 2: 'A', 7: 'B', 12: 'C',
  201: 'A', 202: 'A', 203: 'A', 206: 'B', 207: 'B', 208: 'B',
  211: 'C', 212: 'C', 213: 'C',
}

/** Cómo se lee cada tipo en un papel argentino: el `NOMBRE` del motor, palabra por palabra, para que la pantalla y `tipo_label` digan lo mismo. */
const NOMBRE: Readonly<Record<number, string>> = {
  1: 'Factura A', 6: 'Factura B', 11: 'Factura C',
  3: 'Nota de Crédito A', 8: 'Nota de Crédito B', 13: 'Nota de Crédito C',
  2: 'Nota de Débito A', 7: 'Nota de Débito B', 12: 'Nota de Débito C',
  201: 'FCE MiPyME A', 206: 'FCE MiPyME B', 211: 'FCE MiPyME C',
  202: 'Nota de Débito FCE A', 207: 'Nota de Débito FCE B', 212: 'Nota de Débito FCE C',
  203: 'Nota de Crédito FCE A', 208: 'Nota de Crédito FCE B', 213: 'Nota de Crédito FCE C',
}

const FCE: readonly number[] = [201, 202, 203, 206, 207, 208, 211, 212, 213]

/** La letra del comprobante (`'A'`, `'B'` o `'C'`), o `undefined` si el tipo no es uno de los que emite la familia. */
export const letraDe = (tipo: number): 'A' | 'B' | 'C' | undefined => LETRA[tipo]

/** ¿Es de la Factura de Crédito Electrónica MiPyME (la factura o sus notas)? */
export const esFce = (tipo: number): boolean => FCE.includes(tipo)

/** ¿Discrimina el IVA? Todos menos la clase C (11, 12, 13 **y 211, 212, 213**): en C todo el importe es neto, sin alícuotas (`tipos.C` del motor).
 *  Un tipo desconocido discrimina, como siempre. */
export const discriminaIva = (tipo: number): boolean => letraDe(tipo) !== 'C'

/** El nombre completo, el del motor: «Factura C», «Nota de Débito FCE A», «FCE MiPyME B». Un tipo desconocido, «Comprobante». */
export const nombreDe = (tipo: number): string => NOMBRE[tipo] ?? 'Comprobante'

/** Qué nota es (`'NC'`, `'ND'`) o `undefined` si es una factura. */
const notaDe = (tipo: number): 'NC' | 'ND' | undefined => (NC.includes(tipo) ? 'NC' : ND.includes(tipo) ? 'ND' : undefined)

/** La sigla del listado, la que cabe en una columna angosta: `FA`, `NCB`, `NDC`; la FCE lleva una `E`: `FEA`, `NCEB`, `NDEC`. Desconocido, `?`. */
export const siglaDe = (tipo: number): string => {
  const letra = letraDe(tipo)
  if (!letra) return '?'
  return `${notaDe(tipo) ?? 'F'}${esFce(tipo) ? 'E' : ''}${letra}`
}

/** El rótulo corto de una tabla ancha (el libro IVA, la cuenta del cliente): `FAC A`, `ND B`, `NC C`; la FCE, `FCE A`, `ND FCE B`, `NC FCE C`.
 *  Desconocido, el número tal cual. */
export const rotuloDe = (tipo: number): string => {
  const letra = letraDe(tipo)
  if (!letra) return String(tipo)
  const nota = notaDe(tipo)
  if (esFce(tipo)) return `${nota ? `${nota} ` : ''}FCE ${letra}`
  return `${nota ?? 'FAC'} ${letra}`
}

/** El prefijo del número en el detalle («A 0001-00000007», «NC-B 0001-…», «FCE-A 0001-…», «ND-FCE-C 0001-…»). Desconocido, `?`. */
export const prefijoDe = (tipo: number): string => {
  const letra = letraDe(tipo)
  if (!letra) return '?'
  const partes = [notaDe(tipo), esFce(tipo) ? 'FCE' : undefined, letra].filter(Boolean)
  return partes.join('-')
}

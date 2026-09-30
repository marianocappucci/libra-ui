// Validación de una fecha `aaaa-mm-dd` (lo que entrega un `<input type="date">`): el formato Y que el día exista. El input
// nativo ya entrega `''` para una fecha imposible (31/02) o incompleta, pero el valor que llega por otro camino (un intento
// guardado, un test) no pasó por ahí. Sin `toISOString` (un día del calendario no se deriva de un instante en UTC).

export function esFechaISOValida(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  if (!m) return false
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

// El consumidor expone su formateador de presentación en `@/lib/fechas`. Este
// paquete **no** tiene uno propio, y es a propósito: `src/fechas.ts` dice, con
// todas las letras, que `dd-mm-aaaa` es formato de presentación y que vive en
// el formateador de cada producto. Meter una cuarta implementación acá sería
// contradecir esa regla desde adentro del kit.
//
// Por eso este stub no re-exporta nada real —no hay qué re-exportar— sino que
// reproduce el contrato que los tres consumidores cumplen: `fecha()` recibe un
// ISO, un `aaaa-mm-dd HH:MM` o un `Date`, y devuelve `dd-mm-aaaa`.
//
// 🔴 **Reordena el texto, no construye un `Date`.** Un `aaaa-mm-dd` no es un
// instante sino un día del calendario: `new Date('2026-08-22')` es medianoche
// UTC, que en Argentina son las 21:00 del 21, así que convertirlo corre la
// fecha un día para atrás SIEMPRE. Es el mismo criterio que documenta el
// helper de LibraClub.
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})/

export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return ''
  if (typeof valor === 'string') {
    const partes = SOLO_FECHA.exec(valor)
    return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : valor
  }
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(valor)
  const partes = SOLO_FECHA.exec(p)
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : p
}

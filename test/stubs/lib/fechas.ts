// El consumidor expone su formateador de presentación en `@/lib/fechas`. Este
// paquete **no** tiene uno propio, y es a propósito: `src/fechas.ts` dice, con
// todas las letras, que `dd-mm-aaaa` es formato de presentación y que vive en
// el formateador de cada producto. Meter una cuarta implementación acá sería
// contradecir esa regla desde adentro del kit.
//
// Por eso este stub no re-exporta nada real —no hay qué re-exportar— sino que
// reproduce el contrato que los consumidores cumplen: `fecha()` recibe un
// ISO, un `aaaa-mm-dd HH:MM` o un `Date`, y devuelve `dd-mm-aaaa`; `fechaHora()`
// hace lo mismo agregando `HH:MM` en reloj de 24 h.
//
// 🔴 `fechaHora` entró con la Configuración canónica (v0.47.0), que lista las
// copias de backup. **Los ocho productos tienen que exportarlo desde
// `@/lib/fechas`**: seis ya lo hacían, y LibraCargo y LibraDesk —que tienen su
// formateador en otro módulo— necesitan el adaptador. Un stub que lo tenga y un
// producto que no es un build roto del lado del producto, no de acá.
//
// 🔴 **Reordena el texto, no construye un `Date`.** Un `aaaa-mm-dd` no es un
// instante sino un día del calendario: `new Date('2026-08-22')` es medianoche
// UTC, que en Argentina son las 21:00 del 21, así que convertirlo corre la
// fecha un día para atrás SIEMPRE. Es el mismo criterio que documenta el
// helper de LibraClub.
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})/
const CON_HORA = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/

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

export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return ''
  if (typeof valor === 'string') {
    const p = CON_HORA.exec(valor)
    return p ? `${p[3]}-${p[2]}-${p[1]} ${p[4]}:${p[5]}` : fecha(valor)
  }
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(valor)
  const partes = CON_HORA.exec(p.replace(',', ''))
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]} ${partes[4]}:${partes[5]}` : p
}

// El recuadro de 6 dígitos del segundo factor, uno por casillero (v0.70.0).
// Vive aparte de `Login.tsx` por la misma razón que `CampoCaptcha`: un
// componente, una responsabilidad, y así lo puede usar cualquier pantalla que
// necesite un código de un solo uso, no sólo el modal del login.
//
// No envuelve al `Input` de shadcn: necesita control fino de foco por
// casillero (flechas, backspace, pegado) que un `<input>` propio da sin
// pelearse con qué props reenvía el wrapper — y así tampoco agrega ningún
// import `@/components/ui/*` nuevo, que es justo la restricción de este
// paquete (`Login.tsx`/`PasswordInput.tsx` sólo usan los que los 10
// consumidores de `createLogin` ya tienen).
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from './utils'

/** De cualquier texto (pegado o tipeado), los dígitos nada más -- un código
 *  copiado de un mail o un SMS suele traer espacios o guiones (`123 456`,
 *  `123-456`). */
function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

function arrayDeDigitos(valor: string, longitud: number): string[] {
  const digitos = soloDigitos(valor).slice(0, longitud).split('')
  return Array.from({ length: longitud }, (_, i) => digitos[i] ?? '')
}

export type CodigoPorDigitosProps = {
  /** Cuántos casilleros. Default 6 (el largo de un TOTP). */
  length?: number
  /** El código tal como lo tiene el que llama (controlado): cambiarlo desde
   *  afuera -- por ejemplo a `''` tras un código incorrecto -- resetea los
   *  casilleros y, si no es el montaje inicial, vuelve el foco al primero. */
  value: string
  /** Se dispara en cada tecla o pegado válido, con el código acumulado hasta
   *  ese casillero (puede tener menos de `length` dígitos). */
  onChange: (value: string) => void
  /** Se dispara una vez que los `length` casilleros están completos, con el
   *  código entero -- es lo que dispara el envío automático en el login. */
  onComplete?: (codigo: string) => void
  disabled?: boolean
  /** Foco en el primer casillero al montar. */
  autoFocus?: boolean
  className?: string
}

export function CodigoPorDigitos({
  length = 6, value, onChange, onComplete, disabled, autoFocus, className,
}: CodigoPorDigitosProps) {
  const [digitos, setDigitos] = useState<string[]>(() => arrayDeDigitos(value, length))
  const refs = useRef<(HTMLInputElement | null)[]>([])
  // Sólo para no robar el foco en el primer render si `autoFocus` no se
  // pidió: el efecto de abajo distingue "value llegó vacío al montar" de
  // "value se vació después" (un reset real), y sólo el segundo caso mueve
  // el foco.
  const montado = useRef(false)

  // Sincroniza con `value` cuando cambia DESDE AFUERA (reset tras un código
  // incorrecto, o el modal que vuelve a abrirse). No se dispara por los
  // cambios que este mismo componente ya reflejó vía `onChange`, porque ahí
  // `value` termina siendo igual al `digitos.join('')` que se acaba de
  // mandar -- re-derivar el mismo array no rompe nada, pero el `if` de abajo
  // evita el robo de foco en ese caso.
  useEffect(() => {
    setDigitos(arrayDeDigitos(value, length))
    if (montado.current && value === '') {
      refs.current[0]?.focus()
    }
    montado.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length])

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
    // Sólo al montar: un autoFocus que se re-dispara en cada render le
    // robaría el foco a quien ya está tipeando el segundo dígito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function aplicar(nuevos: string[]) {
    setDigitos(nuevos)
    onChange(nuevos.join(''))
    if (nuevos.every((d) => d !== '')) onComplete?.(nuevos.join(''))
  }

  function manejarCambio(indice: number, texto: string) {
    if (texto === '') {
      // El casillero quedó vacío de verdad (Delete/backspace con contenido
      // seleccionado) -- distinto del caso de abajo, donde lo tipeado no era
      // un dígito: ahí el casillero NO se toca.
      const nuevos = [...digitos]
      nuevos[indice] = ''
      aplicar(nuevos)
      return
    }
    const limpio = soloDigitos(texto)
    if (!limpio) {
      // Sólo dígitos: una letra o símbolo se ignora y el casillero se queda
      // como estaba -- React redibuja con el valor viejo porque el estado no
      // cambió, deshaciendo visualmente el caracter inválido.
      return
    }
    if (limpio.length === 1) {
      const nuevos = [...digitos]
      nuevos[indice] = limpio
      aplicar(nuevos)
      if (indice < length - 1) refs.current[indice + 1]?.focus()
      return
    }
    // Autocompletado del sistema (SMS/app) entregando varios dígitos de una:
    // se reparte igual que un pegado, arrancando en este casillero.
    const nuevos = [...digitos]
    let i = indice
    for (const d of limpio) {
      if (i >= length) break
      nuevos[i] = d
      i += 1
    }
    aplicar(nuevos)
    refs.current[Math.min(i, length - 1)]?.focus()
  }

  function manejarTecla(indice: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digitos[indice] === '') {
        // Casillero ya vacío: retrocede y borra el anterior.
        if (indice > 0) {
          e.preventDefault()
          const nuevos = [...digitos]
          nuevos[indice - 1] = ''
          aplicar(nuevos)
          refs.current[indice - 1]?.focus()
        }
      }
      // Si el casillero tiene contenido, se deja que `onChange` lo borre
      // (dispara `manejarCambio` con texto vacío) -- no hace falta nada acá.
      return
    }
    if (e.key === 'ArrowLeft' && indice > 0) {
      e.preventDefault()
      refs.current[indice - 1]?.focus()
      return
    }
    if (e.key === 'ArrowRight' && indice < length - 1) {
      e.preventDefault()
      refs.current[indice + 1]?.focus()
    }
  }

  function manejarPegado(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const limpio = soloDigitos(e.clipboardData.getData('text')).slice(0, length)
    if (!limpio) return
    aplicar(arrayDeDigitos(limpio, length))
    refs.current[Math.min(limpio.length, length - 1)]?.focus()
  }

  return (
    <div className={cn('flex justify-center gap-2', className)} role="group" aria-label="Código de verificación">
      {digitos.map((digito, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Dígito ${i + 1} de ${length}`}
          value={digito}
          disabled={disabled}
          onChange={(e) => manejarCambio(i, e.target.value)}
          onKeyDown={(e) => manejarTecla(i, e)}
          onPaste={manejarPegado}
          onFocus={(e) => e.target.select()}
          // Sin `maxLength={1}` a propósito: el autocompletado del sistema
          // (`one-time-code`, el código que ofrece el teléfono desde el SMS o
          // la app) entrega los 6 dígitos de una en el primer casillero, y un
          // `maxLength` los cortaría a uno antes de llegar a `manejarCambio`,
          // que es el que los reparte. El foco selecciona el contenido, así
          // que tipear en un casillero lleno lo reemplaza.
          className={cn(
            'h-10 w-10 rounded-md border border-input bg-transparent text-center text-lg font-medium tabular-nums shadow-xs outline-none transition-[color,box-shadow]',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
            'dark:bg-input/30',
          )}
        />
      ))}
    </div>
  )
}

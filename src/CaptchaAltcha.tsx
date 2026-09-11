/// <reference types="vite/client" />
// El recuadro «No soy un robot» (v0.69.0): el widget de ALTCHA, contraparte de
// `libraauth.captcha` (ADR-014 de ese repo). El servidor emite el desafío, el
// navegador lo resuelve con una prueba de trabajo de alrededor de un segundo, y
// el login manda la solución en `captcha`. Sin proveedor externo y sin cookies.
//
// No se importa directo desde el login: lo carga `CampoCaptcha` (captcha.tsx) de
// forma perezosa, así el widget sólo baja en los productos que prendieron el
// captcha.
//
// 🔴 **Build `altcha/external` y NO `altcha` a secas.** El default trae los
// workers embebidos y los arranca desde un `blob:`, y la CSP de las SPA
// (`script-src 'self'`, sin `worker-src`) no lo deja. Con `external` el worker
// de PBKDF2 sale como un archivo más del bundle —mismo origen— y la CSP no se
// toca. Los estilos, igual: `altcha.css` como archivo.
import { useEffect, useRef } from 'react'
import 'altcha/external'
import 'altcha/altcha.css'
import 'altcha/i18n/es-419'
import type {} from 'altcha/types/react'
import Pbkdf2Worker from 'altcha/workers/pbkdf2?worker'

// El único algoritmo que emite libraauth. Registrar sólo éste es a propósito:
// un desafío con otro algoritmo no lo emitió nuestro servidor.
globalThis.$altcha.algorithms.set('PBKDF2/SHA-256', () => new Pbkdf2Worker())

export default function CaptchaAltcha({ challengeUrl, onCambio }: {
  // La ruta del desafío (ej. '/auth/captcha'). El widget la vuelve a pedir
  // solo cuando el desafío vence.
  challengeUrl: string
  // La solución cuando el widget queda verificado, y '' en cualquier otro
  // estado (verificando, vencido, error): el login no puede mandar una vieja.
  onCambio: (payload: string) => void
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const widget = ref.current
    if (!widget) return
    function alCambiar(evento: Event) {
      const detalle = (evento as CustomEvent<{ state?: string; payload?: string }>).detail
      onCambio(detalle?.state === 'verified' && detalle.payload ? detalle.payload : '')
    }
    widget.addEventListener('statechange', alCambiar)
    return () => widget.removeEventListener('statechange', alCambiar)
  }, [onCambio])

  return (
    <altcha-widget
      ref={ref}
      challenge={challengeUrl}
      language="es-419"
      type="checkbox"
      name="captcha"
    />
  )
}

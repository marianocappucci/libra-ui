// El recuadro «No soy un robot» del login y de «olvidé mi contraseña»
// (v0.69.0). No dibuja nada si la sonda de `useCaptcha` no confirmó un desafío.
import { lazy, Suspense } from 'react'
import type { EstadoCaptcha } from './captcha'

// Perezoso a propósito: el widget (~34 kB) sólo baja cuando la sonda dijo que
// hay captcha, y ningún test que importe el login arrastra el web component.
const CaptchaAltcha = lazy(() => import('./CaptchaAltcha'))

export function CampoCaptcha({ captcha }: { captcha: EstadoCaptcha }) {
  if (!captcha.activo || !captcha.path) return null
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando la verificación…</p>}>
      {/* `key`: remontar es la forma de pedir un desafío nuevo después de un
          intento fallido, que ya gastó el anterior en el servidor. */}
      <CaptchaAltcha key={captcha.intento} challengeUrl={captcha.path} onCambio={captcha.setPayload} />
    </Suspense>
  )
}

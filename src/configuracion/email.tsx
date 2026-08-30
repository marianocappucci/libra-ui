/** La sección "Email / SMTP": el tutorial de Gmail arriba del formulario.
 *
 *  El formulario ya era compartido (`ConfiguracionSmtp`, contraparte de los
 *  endpoints de libraauth). Lo que no lo era es el **tutorial**: Contalibra y
 *  Restolibra lo tenían escrito adentro de su `Config.tsx` y los otros seis
 *  productos no lo tenían.
 *
 *  Y no es un adorno: Gmail no acepta la contraseña normal de la cuenta para
 *  enviar desde una app externa. Sin el tutorial, quien configura el correo
 *  pone su contraseña, guarda, y el `forgot-password` sigue fallando sin decir
 *  por qué.
 */
import { ConfiguracionSmtp } from '../ConfiguracionSmtp'
import { TutorialGmail } from './tutoriales'

export function EmailCard({ producto, basePath }: { producto: string; basePath?: string }) {
  return (
    <div className="grid gap-4">
      <TutorialGmail producto={producto} />
      <ConfiguracionSmtp basePath={basePath} />
    </div>
  )
}

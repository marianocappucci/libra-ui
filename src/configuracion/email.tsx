/** La sección "Email / SMTP": el tutorial de Gmail, el formulario y el botón
 *  que dice si el servidor acepta esas credenciales.
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
 *
 *  ## 🟢 *Probar conexión*, que hasta hoy tenían dos de ocho
 *
 *  El botón vivía en el `Config.tsx` de Contalibra y de Restolibra, contra un
 *  `GET /api/email/probar` escrito en cada uno de esos dos productos. En los
 *  otros seis no existía, y el resultado es que se configuraba el correo **sin
 *  forma de saber si andaba**: el primer indicio era un comprobante que no
 *  llegaba, o un mail de recuperación de contraseña que nadie recibía.
 *
 *  Ahora el endpoint lo pone el motor —`libracore.smtp_router`— y resuelve por
 *  el **mismo camino que el envío** (`smtp_efectivo`). Eso es lo que hace que
 *  el botón signifique algo: antes de que esa función existiera, el endpoint de
 *  Contalibra leía `config.json` mientras la pantalla escribía en la base de
 *  libraauth, así que decía *Conectado* contra un servidor y los mails salían
 *  por otro.
 *
 *  🔴 **El producto tiene que montar el router**, o el botón da 404. Es la
 *  misma condición que los demás endpoints que esta pantalla consume, y está
 *  anotada en el README del kit.
 */
import { useState } from 'react'
import { Send } from 'lucide-react'

import { ConfiguracionSmtp, RUTA_SMTP_POR_DEFECTO } from '../ConfiguracionSmtp'
import { api, ApiError } from '../api-client'
import { TutorialGmail } from './tutoriales'
import { Button } from '@/components/ui/button'

/** Lo que contesta `POST {basePath}/probar`. Sin la contraseña, obviamente:
 *  lo que el cliente confirma es el servidor y la casilla. */
type PruebaSmtp = { ok: boolean; host: string; port: number; user: string }

function describirError(err: unknown): string {
  if (err instanceof ApiError) {
    const d = err.detail
    if (typeof d === 'string') return d
    if (d && typeof d === 'object' && 'detail' in d) return String((d as { detail: unknown }).detail)
  }
  return err instanceof Error ? err.message : String(err)
}

export function EmailCard({ producto, basePath = RUTA_SMTP_POR_DEFECTO }: {
  producto: string
  basePath?: string
}) {
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null)

  async function probar() {
    setProbando(true)
    // Se limpia ANTES de pedir: dejar el resultado anterior mientras corre el
    // nuevo hace que un "Conectado" viejo parezca la respuesta a este click.
    setPrueba(null)
    try {
      const r = await api.post<PruebaSmtp>(`${basePath}/probar`)
      setPrueba({ ok: true, texto: `Conectado a ${r.host}:${r.port} como ${r.user}.` })
    } catch (err) {
      setPrueba({ ok: false, texto: describirError(err) })
    } finally {
      setProbando(false)
    }
  }

  return (
    <div className="grid gap-4">
      <TutorialGmail producto={producto} />
      <ConfiguracionSmtp basePath={basePath} />

      {/* Debajo del formulario y no arriba: primero se carga y se guarda, y
          recién después tiene sentido preguntar. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={probando}
                onClick={() => void probar()}>
          <Send />{probando ? 'Probando…' : 'Probar conexión'}
        </Button>
        {prueba && (
          <span role="status"
                className={`text-sm ${prueba.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
            {prueba.texto}
          </span>
        )}
      </div>
    </div>
  )
}

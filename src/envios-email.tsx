// El rastro de los envíos por mail de un comprobante o un presupuesto (ADR-050 del motor).
//
// Antes el mail salía y no quedaba nada: «¿se mandó la factura?» no se podía contestar. El motor
// anota cada intento (enviado o con error) y lo devuelve en el detalle (`envios_email`) y, resumido,
// en el listado (`envio_email`). Esto es sólo su presentación.
import { CheckCircle2, Mail, MailX } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BadgeEstado } from './badge-estado'
import { fechaHora } from './fechas'

export type EnvioEmail = {
  id: number
  documento_label: string
  destinatario: string
  estado: 'enviado' | 'error'
  error: string
  usuario: string
  created_at: string
}

/** Lo que el listado trae de cada documento: `null` si nunca se intentó mandar. */
export type ResumenEnvioEmail = {
  cantidad: number
  enviados: number
  ultimo_estado: 'enviado' | 'error'
  ultimo_at: string
  ultimo_destino: string
} | null

/** La marca de una fila del listado: Enviada / Falló / Sin enviar. */
export function IndicadorEnvioEmail({ resumen }: { resumen?: ResumenEnvioEmail }) {
  if (!resumen) return <BadgeEstado tono="neutro">Sin enviar</BadgeEstado>
  const ayuda = `${resumen.ultimo_estado === 'enviado' ? 'Enviada' : 'Falló el envío'} a ${resumen.ultimo_destino} · ${fechaHora(resumen.ultimo_at)}`
  return resumen.ultimo_estado === 'enviado'
    ? <span title={ayuda}><BadgeEstado tono="ok"><CheckCircle2 />Enviada</BadgeEstado></span>
    : <span title={ayuda}><BadgeEstado tono="negativo"><MailX />Falló</BadgeEstado></span>
}

/** El detalle: cada intento con fecha, destinatario, quién lo mandó y, si falló, el motivo. */
export function EnviosEmailCard({ envios }: { envios?: EnvioEmail[] }) {
  const lista = envios ?? []
  return (
    <Card>
      <CardHeader className="py-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Mail className="size-4" />Envíos por mail</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 py-2 text-sm">
        {lista.length === 0 && <p className="text-muted-foreground">Todavía no se envió por mail.</p>}
        {lista.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1 last:border-0">
            <span>
              <span className="text-muted-foreground">{fechaHora(e.created_at)}</span>
              <span className="ml-2">{e.destinatario}</span>
              {e.usuario && <span className="ml-2 text-xs text-muted-foreground">por {e.usuario}</span>}
              {e.estado === 'error' && e.error && <span className="mt-0.5 block text-xs text-destructive">{e.error}</span>}
            </span>
            {e.estado === 'enviado'
              ? <BadgeEstado tono="ok"><CheckCircle2 />Enviado</BadgeEstado>
              : <BadgeEstado tono="negativo"><MailX />Falló</BadgeEstado>}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

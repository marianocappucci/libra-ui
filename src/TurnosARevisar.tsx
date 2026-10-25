// La lista «Turnos a revisar» (ADR-095): los turnos que se atendieron sin conexión y que en la web cambiaron mientras tanto. Un turno, una
// tarjeta, aunque tenga dos atenciones (en curso, y después atendido): la persona acomoda el turno, no dos filas de él.
//
// ## Es un panel, no una pantalla
//
// Mismo reparto que `PanelDeLaCola`: la lista con sus tarjetas y sin título de pantalla. El título de pantalla lleva el ícono que el menú le
// da a esa pantalla (ADR-035), y de dónde se llega acá —una pestaña de la agenda, un aviso en el inicio— lo decide cada producto. Tampoco
// pide los datos: la lista es la consulta `turnos_a_revisar` de libragenda, que el producto expone por su ruta, y le pasa las filas.
//
//     <TurnosARevisar
//       atenciones={filas}                                // lo que devuelve la ruta del producto
//       describirTurno={(t) => `${clienteDe(t.turnoId)} · ${servicioDe(t.turnoId)}`}
//       onMarcarRevisado={(t) => api.post(`/api/turnos-a-revisar/revisar`, { atenciones: t.atenciones.map((a) => a.atencion_id) })
//                                  .then(recargar)}
//     />
//
// «Ya lo revisé» saca el turno de la lista (`marcar_revisada` de libragenda, una llamada por atención) y **no cambia el turno ni la
// atención**: acomodar el turno —moverlo, cancelarlo, ver si se cobró dos veces— se hace en la agenda, a mano. Sin `onMarcarRevisado` la
// lista es de consulta, sin botón: la PC del local ve la lista pero la revisión es de la web.
import { useId, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'

import { ApiError } from './api-client'
import { EtiquetaTurnoARevisar } from './EtiquetasDeTurno'
import { fecha, fechaHora } from './fechas'
import { TarjetaDeFila } from './tabla-o-tarjetas'
import {
  TEXTO_SIN_TURNOS_A_REVISAR, TEXTO_TURNOS_A_REVISAR, TITULO_TURNOS_A_REVISAR, agruparPorTurno, etiquetaDelEstadoDeTurno, textoDelMotivo,
  type AtencionARevisar, type TurnoARevisar,
} from './turnos-del-nodo'
import { cn } from './utils'
import { Button } from '@/components/ui/button'

export type TurnosARevisarProps = {
  /** Las filas de `turnos_a_revisar` de libragenda. Las ya revisadas y las que no son `a_revisar` no se muestran. */
  atenciones: readonly AtencionARevisar[] | null | undefined
  cargando?: boolean
  /** Un error al pedir la lista, para decirlo en vez de mostrarla vacía. */
  error?: string | null
  /** El título de cada tarjeta. Por defecto «Turno del <fecha>»; el producto lo mejora con lo suyo («Ana Pérez · Consulta», leyendo su
   *  agenda con `turno.turnoId`). */
  describirTurno?: (turno: TurnoARevisar) => ReactNode
  /** Saca el turno de la lista. Recibe el turno entero: el producto marca como revisada cada una de sus `atenciones`. Si la promesa falla,
   *  la pantalla dice por qué (el `detail` de la API) y el turno sigue ahí. Sin esta prop no hay botón. */
  onMarcarRevisado?: (turno: TurnoARevisar) => unknown
  /** El título de la lista. `null` lo saca (la lista queda con el mismo nombre accesible). */
  titulo?: string | null
  /** El texto de arriba de la lista. `null` lo saca. */
  introduccion?: ReactNode
  className?: string
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'No se pudo marcar como revisado. Probá de nuevo.'
}

/** «Atendido · 25-10-2026 10:40 · Ana»: lo que se hizo en esta PC, en el orden en que pasó. */
function renglonDeAtencion(a: AtencionARevisar): string {
  return [etiquetaDelEstadoDeTurno(a.estado), fechaHora(a.at), a.actor].filter(Boolean).join(' · ')
}

export function TurnosARevisar({
  atenciones, cargando = false, error, describirTurno, onMarcarRevisado, titulo = TITULO_TURNOS_A_REVISAR,
  introduccion = TEXTO_TURNOS_A_REVISAR, className,
}: TurnosARevisarProps) {
  const idTitulo = useId()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [errorAlMarcar, setErrorAlMarcar] = useState<string | null>(null)
  const turnos = agruparPorTurno(atenciones)

  async function marcar(turno: TurnoARevisar) {
    if (!onMarcarRevisado) return
    setOcupado(turno.turnoId)
    setErrorAlMarcar(null)
    try {
      await onMarcarRevisado(turno)
    } catch (err) {
      setErrorAlMarcar(describeError(err))
    } finally {
      setOcupado(null)
    }
  }

  function tarjeta(turno: TurnoARevisar) {
    const web = etiquetaDelEstadoDeTurno(turno.ultima.estado_despues)
    const datos: { etiqueta: string; valor: ReactNode }[] = []
    if (turno.motivos.length > 0) {
      datos.push({
        etiqueta: 'Qué pasó',
        valor: (
          <div className="grid gap-1">
            {turno.motivos.map((m) => {
              const t = textoDelMotivo(m)
              return <p key={m}><strong className="font-medium">{t.titulo}.</strong> {t.explicacion}</p>
            })}
          </div>
        ),
      })
    }
    datos.push({
      etiqueta: 'Se hizo en esta PC',
      valor: turno.atenciones.length === 1
        ? renglonDeAtencion(turno.atenciones[0])
        : <ul className="grid gap-0.5">{turno.atenciones.map((a) => <li key={a.atencion_id}>{renglonDeAtencion(a)}</li>)}</ul>,
    })
    if (web) datos.push({ etiqueta: 'En la web figura', valor: web })
    return (
      <TarjetaDeFila
        key={turno.turnoId}
        titulo={describirTurno ? describirTurno(turno) : `Turno del ${fecha(turno.atenciones[0].at)}`}
        estado={<EtiquetaTurnoARevisar motivo={turno.motivos[0]} />}
        datos={datos}
        accionesConTexto={onMarcarRevisado && (
          <Button size="sm" variant="outline" disabled={ocupado !== null} onClick={() => void marcar(turno)}>Ya lo revisé</Button>
        )}
      />
    )
  }

  return (
    <section
      className={cn('grid gap-3', className)} data-slot="turnos-a-revisar"
      aria-labelledby={titulo !== null ? idTitulo : undefined} aria-label={titulo === null ? TITULO_TURNOS_A_REVISAR : undefined}
    >
      {titulo !== null && (
        <h3 id={idTitulo} className="text-base font-semibold">{titulo}{turnos.length > 0 ? ` (${turnos.length})` : ''}</h3>
      )}
      {introduccion !== null && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{introduccion}</span>
        </p>
      )}
      {(error ?? errorAlMarcar) && <p role="alert" className="text-sm text-destructive">{error ?? errorAlMarcar}</p>}
      {cargando && turnos.length === 0
        ? <p role="status" className="text-sm text-muted-foreground">Cargando…</p>
        : turnos.length === 0
          ? !error && <p className="py-6 text-center text-sm text-muted-foreground">{TEXTO_SIN_TURNOS_A_REVISAR}</p>
          : <ul className="grid gap-2" aria-label={TITULO_TURNOS_A_REVISAR}>{turnos.map(tarjeta)}</ul>}
    </section>
  )
}

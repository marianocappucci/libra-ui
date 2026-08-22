/** La semana: siete columnas de lunes a domingo, sobre la rejilla horaria.
 *
 *  Lo que la lista de chips no podía decir: una lista dice *qué* hay ese día,
 *  la rejilla dice **cuánto ocupa y dónde está el hueco**, que es la pregunta
 *  de quien agenda. El encabezado de cada día es el link que entra al detalle.
 *
 *  **Los eventos de todos los carriles van juntos en la columna del día**, con
 *  su color encima. La alternativa —un carril por recurso dentro de cada día—
 *  hace explícito el quién, pero con cuatro recursos la grilla mide cuatro
 *  pantallas de alto. El quién lo resuelven el color, la referencia y el
 *  filtro; y al entrar al día, cada recurso tiene su columna.
 */
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NOMBRES_DIAS, sumarDias } from './fechas'
import { RejillaHoraria, type ColumnaRejilla, type EventoRejilla } from './rejilla-horaria'

/** El encabezado de un día, con la forma de Google: el día de la semana chico
 *  arriba y el número grande abajo, y hoy con el número en un círculo lleno. */
function EncabezadoDia({ dia, esHoy, href }: {
  dia: string
  esHoy: boolean
  href: string
}) {
  const dow = (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7
  return (
    <Link to={href} className="block hover:underline">
      <span className={cn(
        'block text-[11px] uppercase',
        esHoy ? 'text-primary' : 'text-muted-foreground',
      )}>
        {NOMBRES_DIAS[dow]}
      </span>
      <span className={cn(
        'mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-medium tabular-nums',
        esHoy && 'bg-primary text-primary-foreground',
      )}>
        {Number(dia.slice(8, 10))}
      </span>
    </Link>
  )
}

export function VistaSemana({ desde, porDia, hoy, hrefDia }: {
  /** El lunes de la semana que se muestra. */
  desde: string
  /** Los eventos de cada día, `YYYY-MM-DD` → lista ya ordenada. */
  porDia: Record<string, EventoRejilla[]>
  hoy: string
  hrefDia: (dia: string) => string
}) {
  const columnas: ColumnaRejilla[] = Array.from({ length: 7 }, (_, i) => {
    const dia = sumarDias(desde, i)
    return {
      clave: dia,
      esHoy: dia === hoy,
      encabezado: (
        <EncabezadoDia dia={dia} esHoy={dia === hoy} href={hrefDia(dia)} />
      ),
      eventos: porDia[dia] ?? [],
    }
  })

  return <RejillaHoraria columnas={columnas} />
}

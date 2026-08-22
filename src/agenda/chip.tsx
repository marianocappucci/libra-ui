/** El evento como etiqueta compacta, para donde no hay rejilla horaria.
 *
 *  Lo usa la vista de **mes** —30 rejillas horarias no entran en una pantalla,
 *  así que ahí el día es una celda con hasta tres etiquetas— y cualquier
 *  franja resumida que el producto quiera armar (en LibraDesk, la del
 *  dashboard). La semana y el día usan bloques posicionados por horario
 *  (`rejilla-horaria.tsx`), que es otra cosa.
 */
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { hora } from './fechas'
import type { EventoRejilla } from './rejilla-horaria'

/** Un evento como chip.
 *
 *  `compacto` esconde el subtítulo: en la celda del mes no entra —mide cuatro
 *  renglones y el subtítulo se comería uno entero—, y ahí lo que identifica al
 *  evento es el color, con la referencia arriba de la grilla.
 */
export function ChipEvento({ evento, compacto = false }: {
  evento: EventoRejilla
  compacto?: boolean
}) {
  return (
    <Link
      to={evento.to}
      title={`${hora(evento.desde)}–${hora(evento.hasta)} · ${evento.titulo}${evento.subtitulo ? ` · ${evento.subtitulo}` : ''}`}
      className={cn(
        'block rounded border px-1.5 py-0.5 text-xs hover:brightness-95 dark:hover:brightness-125',
        evento.clase,
      )}
    >
      <span className="flex items-baseline gap-1">
        <span className="font-mono tabular-nums opacity-80">{hora(evento.desde)}</span>
        <span className="min-w-0 truncate font-medium">{evento.titulo}</span>
      </span>
      {!compacto && evento.subtitulo && (
        <span className="block truncate opacity-80">{evento.subtitulo}</span>
      )}
    </Link>
  )
}

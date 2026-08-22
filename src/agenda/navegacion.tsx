/** La barra de navegación del calendario y la referencia de colores.
 *
 *  🔴 **El orden de la barra importa y no es cosmético**: `Hoy`, las dos
 *  flechas y el título, **en ese orden y anclados a la izquierda**. Con el
 *  grupo pegado al borde derecho su ancho lo fija el largo del título, así que
 *  pasar de "Agosto 2026" a "10 al 16 de agosto de 2026" corre las flechas de
 *  lugar y apretar dos veces seguidas obliga a perseguirlas con el mouse. Lo
 *  reportó el humano en LibraDesk (2026-08-14). Anclado a la izquierda, el
 *  título crece hacia la derecha y los controles no se mueven nunca.
 *
 *  **El conmutador de vistas no está acá, va como `children`.** Cada producto
 *  ya tiene el suyo —LibraDesk usa enlaces con la forma de las pestañas de
 *  shadcn, para que cada vista se pueda abrir en otra solapa— y meterle uno
 *  propio a este componente crearía un tercer idioma de pestañas en la misma
 *  familia.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { correrVista, tituloDeVista, type Vista } from './vistas'

export function NavegadorCalendario({ vista, dia, hoy, href, children }: {
  vista: Vista
  /** El día que se está mirando, `YYYY-MM-DD`. */
  dia: string
  /** Hoy, `YYYY-MM-DD`, en hora local de quien mira. */
  hoy: string
  /** Cómo se arma el enlace a otro día: el producto decide qué otros
   *  parámetros de la URL conserva. */
  href: (cambios: Record<string, string>) => string
  /** El conmutador de vistas, a la derecha. */
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" className="rounded-full px-4" asChild>
          <Link to={href({ dia: hoy })}>Hoy</Link>
        </Button>
        <Button size="icon" variant="ghost" className="rounded-full" asChild aria-label="Anterior">
          <Link to={href({ dia: correrVista(vista, dia, -1) })}><ChevronLeft /></Link>
        </Button>
        <Button size="icon" variant="ghost" className="rounded-full" asChild aria-label="Siguiente">
          <Link to={href({ dia: correrVista(vista, dia, 1) })}><ChevronRight /></Link>
        </Button>
        <span className="ml-2 text-xl first-letter:uppercase">
          {tituloDeVista(vista, dia)}
        </span>
      </div>
      {children}
    </div>
  )
}

/** La referencia de colores: qué carril es cada tono.
 *
 *  Sin ella el color del bloque no significa nada hasta que se abre uno. No se
 *  muestra en la vista de día, que ya viene con una columna por carril y el
 *  nombre en su encabezado.
 */
export function ReferenciaDeColores({ carriles }: {
  /** En el mismo orden que fija los colores: la posición **es** el color. */
  carriles: readonly { clave: string; nombre: string; clasePunto: string }[]
}) {
  if (carriles.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {carriles.map((c) => (
        <span key={c.clave} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', c.clasePunto)} />
          {c.nombre}
        </span>
      ))}
    </div>
  )
}

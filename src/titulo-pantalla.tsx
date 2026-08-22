/** El título de una pantalla: **una sola definición** para los ocho productos.
 *
 *  Sale de un pedido del humano (2026-08-21): *"que todos los títulos que están
 *  en pantalla tengan su icono al lado, el icono del sidebar"*, y después
 *  *"normalizá todo, que todos estén como libradesk"*.
 *
 *  **Portado de [[libradesk]]**, `components/titulo-pantalla.tsx`, donde el
 *  mismo problema ya se había resuelto el 2026-08-14 y donde el humano ya había
 *  pedido el recuadro gris. Se normaliza hacia la convención que alguien ya
 *  cumple, no hacia una nueva.
 *
 *  Lo que había en la suite antes de esto, medido contra `origin/develop`:
 *
 *  | forma | dónde |
 *  |---|---|
 *  | `TituloPantalla` con recuadro | LibraDesk |
 *  | `<h2>` a mano, icono suelto en `text-primary` | Contalibra y RestoLibra |
 *  | `<h1>`/`<h2>` sin ningún icono | los otros cinco |
 *
 *  ⚠️ **El icono tiene que ser el que el sidebar le da a ESA pantalla.** No es
 *  un detalle estético: el icono del título es lo que confirma dónde estás
 *  parado. Antes de este cambio, 15 pantallas de Contalibra y 22 de RestoLibra
 *  usaban en el título un icono distinto al de su propia entrada del menú.
 *  Cada producto tiene un guard que lo sostiene leyendo sus fuentes; sin él,
 *  vuelve a divergir de a una pantalla por vez y nadie se entera.
 */
import type { ComponentType, ReactNode } from 'react'
import { cn } from './utils'

export function TituloPantalla({ icono: Icono, children, className }: {
  /** El icono de esta pantalla en el sidebar. **Obligatorio**: un `icono?`
   *  opcional deja que la próxima pantalla nazca sin él y nadie se entere, que
   *  es exactamente como se llegó a las tres formas de arriba. */
  icono: ComponentType<{ className?: string }>
  children: ReactNode
  className?: string
}) {
  return (
    <h2 className={cn('flex items-center gap-2 text-lg font-semibold', className)}>
      {/* 32 px con el glifo a 20: el recuadro del título pesa más que el de la
          fila de una tabla porque encabeza la pantalla. Misma receta, otro
          tamaño — igual que en lucide.dev, que usa 56 px en la grilla y 21,6 en
          la barra de arriba. */}
      <span
        data-slot="icono-tile"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-transparent bg-muted text-foreground [&>svg]:size-5"
      >
        <Icono />
      </span>
      {children}
    </h2>
  )
}

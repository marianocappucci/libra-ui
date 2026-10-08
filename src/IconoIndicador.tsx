/** El ícono de un concepto de reporte o de indicador (ADR-038): se pasa el CONCEPTO, no el componente de lucide.
 *
 *  Es lo que se usa para un ícono suelto al lado del título de un bloque (`CardTitle` de un reporte) o dentro de una lista. Las tarjetas
 *  (`TarjetaReporte`, `TarjetaIndicador`) lo usan por dentro. Que sea un componente con la prop `concepto` y no un `icono={Package}` es lo que
 *  impide que una pantalla vuelva a elegir su propio ícono: el tipo no admite otra cosa que una clave del catálogo.
 *
 *  Tamaño 16 px por defecto (`size-4`), como el ícono de un `CardTitle`; el color lo hereda (`currentColor`), así que el llamador lo tiñe con
 *  `text-…` si quiere. Decorativo: el texto que lo acompaña es el que se lee.
 */
import { createElement, type ComponentProps } from 'react'
import { iconoDelIndicador, type ConceptoIndicador } from './iconos-indicador'
import type { Producto } from './identidad'
import { cn } from './utils'

export function IconoIndicador({ concepto, producto, className, ...resto }: {
  concepto: ConceptoIndicador
  /** Sólo para los conceptos que tienen excepción en un producto (`proveedores` en LibraCargo). */
  producto?: Producto
} & Omit<ComponentProps<'svg'>, 'ref'>) {
  // `createElement` y no `<Icono />`: el ícono es un componente de lucide que el catálogo ya creó, no uno que se cree en cada render.
  return createElement(iconoDelIndicador(concepto, producto), {
    'aria-hidden': 'true', 'data-concepto': concepto, className: cn('size-4 shrink-0', className), ...resto,
  } as ComponentProps<'svg'>)
}

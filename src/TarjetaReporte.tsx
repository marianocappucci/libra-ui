/** La tarjeta de un reporte en el índice de reportes: el ícono de lo que contesta, su título y una línea que dice qué pregunta responde (ADR-038).
 *
 *  Reemplaza lo que cada producto armaba a mano para su índice: LibraCargo un `Link` con borde sin ícono, LibraDesk una fila con
 *  `FileSpreadsheet` en todos los reportes (el mismo ícono para «Equipamiento» y «Facturación»), Contalibra tarjetas con un ícono de lucide
 *  distinto por pantalla. Recibe el **concepto** del catálogo (`iconos-indicador`), no el ícono: el reporte de «Saldos» tiene el mismo en todos
 *  los productos, y es el mismo que su entrada del menú.
 *
 *  El recuadro del ícono es el de `TituloPantalla` (`data-slot="icono-tile"`, fondo `muted`, glifo de 20 px). Es una tarjeta sobria: borde,
 *  fondo de tarjeta, y el fondo `accent` al pasar el mouse sólo si lleva a algún lado.
 *
 *  Navegación: `a` (ruta de la app, con `Link`) o `onClick` (un botón). Sin ninguno es una tarjeta informativa, no un control.
 */
import { createElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { iconoDelIndicador, type ConceptoIndicador } from './iconos-indicador'
import type { Producto } from './identidad'
import { cn } from './utils'

export function TarjetaReporte({ concepto, titulo, descripcion, nota, a, onClick, producto, className }: {
  /** Qué contesta el reporte: una clave de `iconos-indicador`. Define el ícono; no hay otra forma de elegirlo. */
  concepto: ConceptoIndicador
  titulo: string
  /** Qué pregunta responde, en una línea. */
  descripcion?: ReactNode
  /** Una línea más chica al pie: «Se filtra por: fechas, cliente». */
  nota?: ReactNode
  /** Ruta a la que lleva la tarjeta. */
  a?: string
  /** Alternativa a `a` cuando abrir el reporte no es cambiar de ruta (un diálogo, una descarga). */
  onClick?: () => void
  /** Sólo para los conceptos que tienen excepción en un producto (`proveedores` en LibraCargo). */
  producto?: Producto
  className?: string
}) {
  const navega = a !== undefined || onClick !== undefined
  const base = cn(
    'flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm',
    navega && 'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    className,
  )
  const cuerpo = (
    <>
      <span
        data-slot="icono-tile"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-foreground [&>svg]:size-5"
      >
        {createElement(iconoDelIndicador(concepto, producto), { 'aria-hidden': 'true' })}
      </span>
      <span className="grid min-w-0 flex-1 gap-1">
        <span data-slot="titulo-reporte" className="font-semibold leading-tight">{titulo}</span>
        {descripcion != null && <span className="text-sm text-muted-foreground">{descripcion}</span>}
        {nota != null && <span className="text-xs text-muted-foreground">{nota}</span>}
      </span>
      {navega && <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
    </>
  )
  const marca = { 'data-slot': 'tarjeta-reporte', 'data-concepto': concepto } as const
  if (a !== undefined) return <Link to={a} className={base} {...marca}>{cuerpo}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={base} {...marca}>{cuerpo}</button>
  return <div className={base} {...marca}>{cuerpo}</div>
}

/** La grilla de las tarjetas de indicadores (KPI) de un tablero (ADR-042).
 *
 *  Un lugar para el `grid … cols` que cada tablero escribía a mano, y para que la variante **ancha** se pida con UNA palabra:
 *
 *      <GrillaDeIndicadores variante="ancha">
 *        <TarjetaIndicador concepto="ventas" etiqueta="Ventas del mes" valor="12" />
 *        …
 *      </GrillaDeIndicadores>
 *
 *  - `estandar` (defecto): la grilla de siempre, `sm:grid-cols-2 2xl:grid-cols-4`, con las tarjetas apiladas (cifra debajo de la etiqueta). Es lo
 *    que usan hoy el Dashboard, Reportes, Caja, Egresos y Margen del kit y los tableros de los demás productos: **no cambia**.
 *  - `ancha`: UNA columna en celular y DOS desde `lg` (1024 px), con las tarjetas en disposición `horizontal` (ícono a la izquierda, cifra a la derecha):
 *    cada tarjeta mide el doble de ancho y bastante menos de alto, y entran más filas en la pantalla. Es la del tablero de LibraCargo
 *    (pedido del dueño, 2026-10-08).
 *    Es `lg` y no `md` porque con el menú abierto (256 px) a 768 px quedan ~460 px de contenido: dos columnas de 217 px no alcanzan para un ícono
 *    de 40 px y una cifra de ocho dígitos (medido en Chromium: la cifra salía de la tarjeta y la página scrolleaba). Ver ADR-042.
 *
 *  La grilla le avisa a sus tarjetas qué disposición usar (`DisposicionContext`), así no hay que repetir `disposicion="horizontal"` en cada una; una
 *  tarjeta que pide la suya propia (`disposicion` en `TarjetaIndicador`) gana.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { cn } from './utils'

export type DisposicionDeIndicador = 'vertical' | 'horizontal'
export type VarianteDeGrilla = 'estandar' | 'ancha'

/** Qué disposición toman las tarjetas que están adentro de una grilla. Fuera de una grilla, `vertical`. */
export const DisposicionContext = createContext<DisposicionDeIndicador>('vertical')

/** Clases completas (no armadas con plantillas): Tailwind sólo genera las que lee escritas en el fuente. */
const GRILLAS: Record<VarianteDeGrilla, { clases: string; disposicion: DisposicionDeIndicador }> = {
  estandar: { clases: 'grid gap-4 sm:grid-cols-2 2xl:grid-cols-4', disposicion: 'vertical' },
  ancha: { clases: 'grid grid-cols-1 gap-4 lg:grid-cols-2', disposicion: 'horizontal' },
}

export function GrillaDeIndicadores({
  variante = 'estandar', className, children,
}: {
  variante?: VarianteDeGrilla
  className?: string
  children: ReactNode
}) {
  const { clases, disposicion } = GRILLAS[variante]
  return (
    <DisposicionContext.Provider value={disposicion}>
      <div data-slot="grilla-de-indicadores" data-variante={variante} className={cn(clases, className)}>{children}</div>
    </DisposicionContext.Provider>
  )
}

/** La disposición que corresponde a una tarjeta: la que pidió, o la de su grilla. */
export function useDisposicionDeIndicador(propia?: DisposicionDeIndicador): DisposicionDeIndicador {
  const deLaGrilla = useContext(DisposicionContext)
  return propia ?? deLaGrilla
}

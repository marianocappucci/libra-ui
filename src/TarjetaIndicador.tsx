/** La tarjeta de un indicador (KPI) de un tablero: una cifra con su etiqueta y el ícono de lo que mide (ADR-038).
 *
 *  Sale del bloque que Contalibra escribía a mano cuatro veces por pantalla (`Card` > `CardContent` > etiqueta, cifra, ayuda y un
 *  `<span className="rounded-lg bg-…/10 p-2">` con un ícono de lucide elegido en el momento). Se unifica en un componente que recibe el
 *  **concepto** del catálogo (`iconos-indicador`), no el ícono: el mismo concepto se ve igual en todos los tableros y reportes de la suite.
 *
 *  Sobria a propósito: el recuadro del ícono es el mismo de `TituloPantalla` (`data-slot="icono-tile"`, fondo `muted`) y el color sólo
 *  aparece cuando significa algo (`tono`): éxito, peligro, aviso o el color del producto. Sin color, la cifra es del color del texto.
 *
 *  Con `children` suma un desglose debajo de la cifra (los turnos por estado, los ingresos y egresos del período).
 *
 *  Dos disposiciones (ADR-042). `vertical` (la de siempre): el ícono arriba a la derecha y la cifra debajo de la etiqueta. `horizontal`: el
 *  ícono (recuadro de 40 px) a la izquierda, la etiqueta y la ayuda en el medio (pueden envolver) y **la cifra a la derecha**, sin cortar; es
 *  una tarjeta del doble de ancho y mucho más baja, para tableros en dos columnas (`GrillaDeIndicadores variante="ancha"`). Con `children` en
 *  horizontal el desglose va **debajo, a todo el ancho**, separado por una línea: una lista larga en el medio comería el lugar de la etiqueta.
 *  La disposición sale de la grilla que contiene a la tarjeta; `disposicion` la fija a mano.
 *
 *  Estados: `cargando` deja la etiqueta y el ícono y pone un esqueleto en lugar de la cifra (el layout no salta cuando llegan los datos);
 *  `a` la vuelve un enlace a lo que se mide (la tarjeta entera es clicable, con el foco visible).
 */
import { createElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDisposicionDeIndicador, type DisposicionDeIndicador } from './GrillaDeIndicadores'
import { iconoDelIndicador, type ConceptoIndicador } from './iconos-indicador'
import type { Producto } from './identidad'
import { cn } from './utils'

export type TonoIndicador = 'neutro' | 'primario' | 'exito' | 'peligro' | 'aviso'

/** Clases completas (no armadas con plantillas): Tailwind sólo genera las que lee escritas en el fuente. */
const TONOS: Record<TonoIndicador, { recuadro: string; cifra: string }> = {
  neutro: { recuadro: 'bg-muted text-foreground', cifra: '' },
  primario: { recuadro: 'bg-primary/10 text-primary', cifra: 'text-primary' },
  exito: { recuadro: 'bg-exito/10 text-exito', cifra: 'text-exito' },
  peligro: { recuadro: 'bg-destructive/10 text-destructive', cifra: 'text-destructive' },
  aviso: { recuadro: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', cifra: 'text-amber-600 dark:text-amber-400' },
}

export type VariacionIndicador = {
  /** Cambio respecto del período de comparación, en porcentaje (`12.5` es +12,5 %; `-3` es −3 %). */
  porcentaje: number
  /** Si subir es bueno (ventas, cobros) o malo (egresos, morosidad). Defecto: bueno. Decide el color, no la flecha. */
  subirEsBueno?: boolean
}

const PORCENTAJE = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const SIN_SIGNO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

function Variacion({ porcentaje, subirEsBueno = true }: VariacionIndicador) {
  const sube = porcentaje > 0
  const baja = porcentaje < 0
  const bueno = sube === subirEsBueno
  const Flecha = sube ? ArrowUp : baja ? ArrowDown : Minus
  const color = !sube && !baja ? 'text-muted-foreground' : bueno ? 'text-exito' : 'text-destructive'
  const texto = `${PORCENTAJE.format(porcentaje)} %`
  return (
    <span
      data-slot="variacion"
      className={cn('inline-flex items-center gap-1 text-xs font-medium', color)}
      aria-label={`${sube ? 'Sube' : baja ? 'Baja' : 'Sin cambios'} ${SIN_SIGNO.format(Math.abs(porcentaje))} por ciento`}
    >
      <Flecha className="size-3" aria-hidden="true" />{texto}
    </span>
  )
}

export function TarjetaIndicador({
  concepto, etiqueta, valor, ayuda, variacion, tono = 'neutro', cargando = false, a, producto, className, children, disposicion,
}: {
  /** Qué se mide: una clave de `iconos-indicador`. Define el ícono; no hay otra forma de elegirlo. */
  concepto: ConceptoIndicador
  etiqueta: string
  /** La cifra, ya formateada (moneda, entero…). */
  valor?: ReactNode
  /** La línea chica de abajo: de qué período es, cuántas operaciones, «Histórico acumulado». */
  ayuda?: ReactNode
  variacion?: VariacionIndicador
  /** Defecto `neutro`: sin color. Pintar una cifra es decir algo de ella (bien, mal, ojo), no decorar. */
  tono?: TonoIndicador
  cargando?: boolean
  /** Ruta a la que lleva la tarjeta. */
  a?: string
  /** Sólo para los conceptos que tienen excepción en un producto (`proveedores` en LibraCargo). */
  producto?: Producto
  className?: string
  /** Un desglose debajo de la cifra (por estado, por medio de pago): la lista de «Turnos» del tablero de GestioLibra y MedLibra. */
  children?: ReactNode
  /** `vertical` (defecto fuera de una grilla) o `horizontal` (ADR-042). Sin pasarla, la decide la `GrillaDeIndicadores` que la contiene. */
  disposicion?: DisposicionDeIndicador
}) {
  const t = TONOS[tono]
  const horizontal = useDisposicionDeIndicador(disposicion) === 'horizontal'
  const icono = createElement(iconoDelIndicador(concepto, producto), { 'aria-hidden': 'true' })
  const tarjeta = horizontal ? (
    <Card
      data-slot="tarjeta-indicador" data-concepto={concepto} data-disposicion="horizontal"
      className={cn('gap-0 py-0', a && 'transition-colors hover:bg-accent', className)}
    >
      <CardContent data-slot="fila-indicador" className="flex flex-1 flex-wrap items-center gap-x-3.5 gap-y-1 px-4.5 py-3.5">
        <span
          data-slot="icono-tile"
          className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-md [&>svg]:size-5', t.recuadro)}
        >
          {icono}
        </span>
        <div className="min-w-0 flex-1 basis-20">
          <CardDescription>{etiqueta}</CardDescription>
          {ayuda != null && !cargando && <CardDescription className="text-xs">{ayuda}</CardDescription>}
          {variacion && !cargando && <Variacion {...variacion} />}
        </div>
        {cargando
          ? <Skeleton data-slot="valor-cargando" className="ml-auto h-8 w-24 shrink-0" />
          : <p data-slot="valor-indicador" className={cn('ml-auto shrink-0 text-right text-2xl font-bold whitespace-nowrap', t.cifra)}>{valor}</p>}
      </CardContent>
      {children != null && !cargando && (
        <CardContent data-slot="detalle-indicador" className="border-t px-4.5 py-2.5 text-sm text-muted-foreground">{children}</CardContent>
      )}
    </Card>
  ) : (
    <Card data-slot="tarjeta-indicador" data-concepto={concepto} className={cn(a && 'transition-colors hover:bg-accent', className)}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0 [&_p]:truncate">
          <CardDescription>{etiqueta}</CardDescription>
          {cargando
            ? <Skeleton data-slot="valor-cargando" className="my-1 h-8 w-28" />
            : <p className={cn('text-2xl font-bold', t.cifra)}>{valor}</p>}
          {ayuda != null && !cargando && <CardDescription>{ayuda}</CardDescription>}
          {variacion && !cargando && <Variacion {...variacion} />}
        </div>
        <span
          data-slot="icono-tile"
          className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-md [&>svg]:size-5', t.recuadro)}
        >
          {icono}
        </span>
      </CardContent>
      {children != null && !cargando && (
        <CardContent data-slot="detalle-indicador" className="-mt-3 text-sm text-muted-foreground">{children}</CardContent>
      )}
    </Card>
  )
  return a
    ? <Link to={a} className="block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">{tarjeta}</Link>
    : tarjeta
}

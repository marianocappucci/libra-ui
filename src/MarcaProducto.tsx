// La marca de un producto: su ícono, blanco, sobre un cuadrado redondeado de su color (ADR-033, `v0.123.0`). Es la única variante: no hay una
// con el nombre adentro ni una en negativo. El nombre, si hace falta, va al lado y lo pone quien llama.
//
// El fondo va en `style` y no en una clase de Tailwind: son ocho hex distintos y Tailwind resuelve las clases leyendo el fuente, así que un
// `bg-[${color}]` armado en runtime nunca se generaría.
import { IDENTIDAD, type Producto } from './identidad'
import { cn } from './utils'

export function MarcaProducto({
  producto,
  className,
  iconoClassName,
}: {
  producto: Producto
  /** Tamaño del cuadrado. Por defecto `h-8 w-8` (el de la sidebar); el Login usa `h-10 w-10`. Se mergea con `cn`: lo que pase pisa al default. */
  className?: string
  /** Tamaño del ícono. Por defecto `size-4`, proporcional al cuadrado de 32 px; con `h-10 w-10` va `size-5`. */
  iconoClassName?: string
}) {
  const { nombre, color, icono: Icono } = IDENTIDAD[producto]
  return (
    <div
      role="img"
      aria-label={nombre}
      style={{ backgroundColor: color }}
      // `shrink-0` + 32 px fijos: con la sidebar colapsada a la barra de iconos el encabezado deja 32 px de ancho útil y el cuadrado no
      // puede achicarse ni estirarse (el mismo cuidado que el logo en `Layout.tsx`).
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white', className)}
    >
      <Icono aria-hidden="true" className={cn('size-4', iconoClassName)} />
    </div>
  )
}

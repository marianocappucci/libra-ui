// La marca de un producto: su dibujo propio sobre el cuadrado redondeado de su color (ADR-034, `v0.124.0`; antes, ADR-033, el ícono de lucide).
// Es la única variante de marca: no hay una con el nombre adentro ni una en negativo. El nombre, si hace falta, va al lado y lo pone quien llama.
//
// El SVG sale de `svgDeMarca` (`marcas.ts`), que es la fuente también de los archivos de `marcas/` que copian las landings: un solo dibujo para
// toda la familia. Se incrusta como markup y no como `<img>` para que pinte en el primer render, sin pedir nada a la red. Los strings son
// constantes del paquete (no hay dato del usuario adentro), así que `dangerouslySetInnerHTML` no abre nada.
import { IDENTIDAD, type Producto } from './identidad'
import { svgDeMarca, type VarianteDeMarca } from './marcas'
import { cn } from './utils'

export function MarcaProducto({
  producto,
  variante = 'icono',
  className,
}: {
  producto: Producto
  /** `icono` (por defecto) es la marca completa; `favicon` es la pieza sola y engrosada, para tamaños de 24 px o menos. */
  variante?: VarianteDeMarca
  /** Tamaño del cuadrado. Por defecto `h-8 w-8` (el de la sidebar); el Login usa `h-12 w-12`. Se mergea con `cn`: lo que pase pisa al default. */
  className?: string
  /** @deprecated Desde `v0.124.0` la marca es un solo dibujo que llena el cuadrado; se acepta y se ignora para no romper a quien la pase. */
  iconoClassName?: string
}) {
  const { nombre } = IDENTIDAD[producto]
  // Sin el `<title>` del SVG: el nombre accesible lo da el `aria-label` del contenedor, una sola vez, y el título no aparece como texto al lado
  // del nombre del producto (el encabezado ya lo escribe).
  const svg = svgDeMarca(producto, variante)
    .replace(/<title>.*?<\/title>/, '')
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" width="100%" height="100%" style="display:block" ')
  return (
    <div
      role="img"
      aria-label={nombre}
      // `shrink-0` + 32 px fijos: con la sidebar colapsada a la barra de iconos el encabezado deja 32 px de ancho útil y el cuadrado no
      // puede achicarse ni estirarse (el mismo cuidado que el logo en `Layout.tsx`). Las esquinas las redondea el SVG.
      className={cn('h-8 w-8 shrink-0', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

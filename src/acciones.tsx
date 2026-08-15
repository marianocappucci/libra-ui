/** Dónde van los controles de una pantalla. Una sola definición, para los seis.
 *
 *  Sale de un pedido del humano (2026-08-14): *"los botones de volver en las
 *  distintas pantallas siempre del lado derecho, como en la pantalla de
 *  presupuestos"* y *"los botones de acción siempre arriba y fijos, a menos que
 *  el diseño lo justifique; si van abajo van contra el borde derecho y fijos
 *  superpuestos"*.
 *
 *  **La forma no se inventó acá**: es la que ya usaba el detalle de comprobante
 *  de LibraDesk —título a la izquierda, grupo de acciones a la derecha, "Volver"
 *  último— y que el humano señaló como la correcta. Se normaliza hacia la
 *  convención que alguien ya cumple.
 *
 *  El problema que resuelve no es estético. El mismo `flex … justify-between`
 *  estaba escrito a mano en 13 archivos de LibraDesk y varios de este paquete,
 *  y ya había divergido: `ContratoDetalle` ponía el "Volver" con
 *  `justify-self-start`, o sea **a la izquierda**. Con la forma repetida, cada
 *  pantalla nueva vuelve a decidir, y una de cada tantas decide distinto.
 */
import type { ReactNode } from 'react'
import { cn } from './utils'

/** El encabezado de una pantalla: título a la izquierda, acciones a la derecha.
 *
 *  `flex-wrap` y no un grid de dos columnas: en un teléfono el grupo de acciones
 *  baja abajo del título en vez de aplastarlo. Con dos columnas fijas, un título
 *  largo y tres botones terminan cada uno en dos renglones.
 *
 *  El "Volver", cuando lo hay, va **último dentro de las acciones** — el extremo
 *  derecho—: es el control al que se llega sin mirar, y moverlo de pantalla en
 *  pantalla es lo que el pedido vino a arreglar.
 */
export function EncabezadoDePantalla({ titulo, children, className }: {
  /** El `<h2>` de la pantalla. Lo arma el producto: cada uno tiene su propio
   *  componente de título con su icono. */
  titulo: ReactNode
  /** Los controles. Van a la derecha, en el orden en que se pasan. */
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <div className="flex min-w-0 items-center gap-3">{titulo}</div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** La barra de acciones al pie, pegada abajo y siempre visible.
 *
 *  Para cuando los controles **no pueden ir arriba**: el caso que lo motivó es
 *  el envío a facturar de LibraDesk, donde se tildan varios remitos de una lista
 *  larga y el botón de enviar quedaba al final del scroll — *"asi podemos
 *  movernos por los remitos y buscar los que queremos sin perder de vista el
 *  botón"*.
 *
 *  **Contra el borde derecho** (`justify-end`), como el encabezado: el ojo
 *  busca las acciones siempre del mismo lado.
 *
 *  ⚠️ **`sticky` y no `fixed`.** Con `fixed` la barra se despega del contenido y
 *  queda flotando sobre toda la aplicación, incluido el sidebar; y al no ocupar
 *  lugar, tapa la última fila de la lista sin que nada lo compense. `sticky`
 *  vive en el flujo, así que empuja al contenido y se apoya en el borde de abajo
 *  del área que scrollea.
 *
 *  El `-mx` con `px` compensa el padding del `<main>` para que la barra llegue
 *  de borde a borde: una barra con aire a los costados se lee como una tarjeta
 *  más, no como el piso de la pantalla.
 */
export function BarraDeAcciones({ children, className }: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="barra-de-acciones"
      className={cn(
        'sticky bottom-0 z-30 -mx-4 flex flex-wrap items-center justify-end gap-2',
        'border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

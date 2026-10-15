import { useCallback, useRef, useState, useSyncExternalStore } from 'react'

/** El ancho (px) de un elemento, siguiéndolo con un `ResizeObserver`. 0 mientras no se mide (sin `ResizeObserver`, como en jsdom): quien lo usa lo trata como «no sé» y deja la tabla. */
export function useAncho(): [(el: HTMLElement | null) => void, number] {
  const [ancho, setAncho] = useState(0)
  const observador = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    observador.current?.disconnect()
    observador.current = null
    if (!el) return
    setAncho(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    observador.current = new ResizeObserver((entradas) => setAncho(Math.round(entradas[0].contentRect.width)))
    observador.current.observe(el)
  }, [])
  return [ref, ancho]
}

/** Los botones de las tarjetas (la vista de los anchos angostos, donde se usa el dedo) miden 44 px, el objetivo táctil de WCAG 2.5.5. ADR-021. */
export const TACTIL = '[&_a]:size-11 [&_button]:size-11'

/** Los botones **con texto** de una tarjeta (`accionesConTexto` de `TarjetaDeFila`, ADR-065): la misma altura de 44 px, pero el ancho es el del rótulo (con `TACTIL` serían un cuadrado de 44 px y el texto se saldría) y la fila se parte si no entran juntos. */
export const TACTIL_CON_TEXTO = 'flex flex-wrap gap-2 [&_a]:min-h-11 [&_button]:min-h-11'

/** Lo mismo para los botones de la **columna de acciones de una tabla**: 44 px bajo `lg` (1024 px, la frontera que ya usa el detalle de venta, ADR-022) y los 36 de siempre desde ahí. Va en el contenedor
 *  de los botones de la celda (`<div className="flex justify-end gap-1 …">`), no en cada uno. El ancho de la columna lo sigue el `DataTable` midiéndola, y `anchoColumnaAcciones(n, bajoLg)` da el
 *  mismo número para quien necesita el ancho antes de pintar (el umbral de las tarjetas). ADR-057. */
export const TACTIL_BAJO_LG = 'max-lg:[&_a]:size-11 max-lg:[&_button]:size-11'

/** La misma frontera que `max-lg` de Tailwind (`width < 64rem`), escrita como `max-width` por los navegadores que no entienden la sintaxis de rangos. */
const BAJO_LG = '(max-width: 63.99rem)'

function suscribirBajoLg(avisar: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(BAJO_LG)
  mql.addEventListener('change', avisar)
  return () => mql.removeEventListener('change', avisar)
}

const esBajoLg = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(BAJO_LG).matches

/** ¿La ventana mide menos de 1024 px? (`max-lg:` de Tailwind.) Sirve para calcular en JS lo que el CSS ya hace: los botones de las tablas son de 44 px ahí y de 36 desde `lg`. Sin `matchMedia` (jsdom
 *  sin stub), `false`: se cuenta con los 36 de escritorio. */
export function useBajoLg(): boolean {
  return useSyncExternalStore(suscribirBajoLg, esBajoLg, () => false)
}

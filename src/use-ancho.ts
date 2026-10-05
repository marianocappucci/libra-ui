import { useCallback, useRef, useState } from 'react'

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

/** Los botones de las tarjetas (la vista de los anchos angostos, donde se usa el dedo) miden 44 px, el objetivo táctil de WCAG 2.5.5; en la tabla siguen en 36 porque el ancho de la columna de acciones se calcula con ellos (`anchoColumnaAcciones`). ADR-021. */
export const TACTIL = '[&_a]:size-11 [&_button]:size-11'

// El código de barras como SVG (ver `codigo-de-barras.ts` por qué se dibuja acá y qué simbología sale). Un solo
// `<path>` con una barra por tramo, sin antialias, en negro sobre el fondo del que lo contiene: **el color es fijo a
// propósito**, un lector no lee barras claras sobre oscuro, y en un tema oscuro las etiquetas se imprimen igual.
import { useMemo } from 'react'

import { codificarBarras, tramosDeBarras } from './codigo-de-barras'

// Ancho de un módulo al imprimir, en mm: 0,33 es el nominal del EAN-13 y lo lee cualquier lector de mostrador.
// Si la etiqueta es más angosta que el código, el SVG se achica (`maxWidth: 100%`) antes que desbordar.
const MM_POR_MODULO = 0.33
// Zona de silencio a cada lado, en módulos: 11 para EAN (norma), 10 para Code 128.
const SILENCIO = { ean13: 11, ean8: 7, code128: 10 } as const

export function CodigoDeBarras({ codigo, altoMm = 12, className }: {
  codigo: string | null | undefined
  /** Alto de las barras en mm. */
  altoMm?: number
  className?: string
}) {
  const codificado = useMemo(() => codificarBarras(codigo), [codigo])
  if (!codificado) return null

  const silencio = SILENCIO[codificado.formato]
  const ancho = codificado.modulos.length + 2 * silencio
  const trazo = tramosDeBarras(codificado.modulos).map(([desde, largo]) => `M${desde + silencio} 0h${largo}v1h-${largo}z`).join('')
  return (
    <svg
      role="img"
      aria-label={`Código de barras ${codigo}`}
      data-formato={codificado.formato}
      viewBox={`0 0 ${ancho} 1`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
      style={{ width: `${(ancho * MM_POR_MODULO).toFixed(2)}mm`, maxWidth: '100%', height: `${altoMm}mm` }}
    >
      <path d={trazo} fill="#000" />
    </svg>
  )
}

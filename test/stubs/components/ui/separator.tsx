// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
import type { ComponentProps, ReactNode } from 'react'

type Props = ComponentProps<'hr'> & { orientation?: string; decorative?: boolean }
export function Separator({ orientation: _o, decorative: _d, ...props }: Props) {
  return <hr {...props} />
}

// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
import type { ComponentProps } from 'react'

type BadgeProps = ComponentProps<'span'> & { variant?: string }
export function Badge({ variant: _v, ...props }: BadgeProps) {
  return <span {...props} />
}

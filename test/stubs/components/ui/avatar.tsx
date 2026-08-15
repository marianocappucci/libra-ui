// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
import type { ComponentProps } from 'react'

export function Avatar(props: ComponentProps<'div'>) {
  return <div {...props} />
}
export function AvatarFallback(props: ComponentProps<'span'>) {
  return <span {...props} />
}

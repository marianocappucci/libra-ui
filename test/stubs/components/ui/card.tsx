// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
import type { ComponentProps, ReactNode } from 'react'

export function Card(props: ComponentProps<'div'>) {
  return <div {...props} />
}
export function CardHeader(props: ComponentProps<'div'>) {
  return <div {...props} />
}
// Titulo y descripcion con etiquetas reales: asi los tests pueden
// buscarlos por rol de accesibilidad en vez de por clase CSS.
export function CardTitle(props: ComponentProps<'h2'>) {
  return <h2 {...props} />
}
export function CardDescription(props: ComponentProps<'p'>) {
  return <p {...props} />
}
export function CardContent(props: ComponentProps<'div'>) {
  return <div {...props} />
}

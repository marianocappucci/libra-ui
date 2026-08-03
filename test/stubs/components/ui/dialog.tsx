// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
import type { ComponentProps, ReactNode } from 'react'

type DialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

// El contenido solo se rendea con `open`: asi un test que busca algo del
// dialogo sin haberlo abierto falla, que es el comportamiento real.
export function Dialog({ open, children }: DialogProps) {
  return <div data-open={open ? 'true' : 'false'}>{open ? children : null}</div>
}

// `role="dialog"` para que los tests lo encuentren por rol de accesibilidad.
export function DialogContent(props: ComponentProps<'div'>) {
  return <div role="dialog" {...props} />
}
export function DialogHeader(props: ComponentProps<'div'>) {
  return <div {...props} />
}
export function DialogTitle(props: ComponentProps<'h2'>) {
  return <h2 {...props} />
}
export function DialogFooter(props: ComponentProps<'div'>) {
  return <div {...props} />
}

// Trigger y Close usan `asChild` en el codigo real (envuelven un Button).
// El stub rendea al hijo tal cual para no duplicar botones en el arbol.
export function DialogTrigger({ children }: { asChild?: boolean; children?: ReactNode }) {
  return <>{children}</>
}
export function DialogClose({ children }: { asChild?: boolean; children?: ReactNode }) {
  return <>{children}</>
}

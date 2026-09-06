// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts. Misma
// forma que el stub de `dialog`: el `Sheet` rendea siempre a sus hijos y el
// `SheetContent` se oculta si no está abierto; el trigger y el close clonan al
// hijo con el `onClick` que abre o cierra.
import type { ComponentProps, ReactNode } from 'react'
import { Children, cloneElement, createContext, isValidElement, useContext } from 'react'

const SheetCtx = createContext<{ open?: boolean; onOpenChange?: (open: boolean) => void }>({})

export function Sheet({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }) {
  return (
    <SheetCtx.Provider value={{ open, onOpenChange }}>
      <div data-open={open ? 'true' : 'false'}>{children}</div>
    </SheetCtx.Provider>
  )
}

export function SheetContent(props: ComponentProps<'div'>) {
  const { open } = useContext(SheetCtx)
  if (!open) return null
  return <div role="dialog" {...props} />
}
export function SheetHeader(props: ComponentProps<'div'>) {
  return <div {...props} />
}
export function SheetTitle(props: ComponentProps<'h2'>) {
  return <h2 {...props} />
}
export function SheetDescription(props: ComponentProps<'p'>) {
  return <p {...props} />
}
export function SheetFooter(props: ComponentProps<'div'>) {
  return <div {...props} />
}

function conApertura(children: ReactNode, abrir: boolean) {
  const { onOpenChange } = useContext(SheetCtx)
  const hijo = Children.only(children)
  if (!isValidElement(hijo)) return <>{children}</>
  const props = hijo.props as { onClick?: (e: unknown) => void }
  return cloneElement(hijo as React.ReactElement<{ onClick?: (e: unknown) => void }>, {
    onClick: (e: unknown) => {
      props.onClick?.(e)
      onOpenChange?.(abrir)
    },
  })
}

export function SheetTrigger({ children }: { asChild?: boolean; children?: ReactNode }) {
  return conApertura(children, true)
}
export function SheetClose({ children }: { asChild?: boolean; children?: ReactNode }) {
  return conApertura(children, false)
}

// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
import type { ComponentProps, ReactNode } from 'react'
import { Children, cloneElement, createContext, isValidElement, useContext } from 'react'

type DialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

// El `onOpenChange` viaja por contexto para que `DialogTrigger` y
// `DialogClose` puedan dispararlo, igual que hace Radix. Sin esto, un dialogo
// cuyo boton de apertura es un `DialogTrigger` (y no un `onClick` propio) NO
// se puede abrir desde un test: el contenido nunca se rendea y la pantalla
// parece no tener esa funcion.
const DialogCtx = createContext<{ open?: boolean; onOpenChange?: (open: boolean) => void }>({})

// **El `Dialog` rendea SIEMPRE a sus hijos**, y es el `DialogContent` el que se
// oculta si no esta abierto. Asi funciona Radix: el trigger vive adentro del
// `Dialog` y tiene que estar en el arbol para poder tocarlo. Con la version
// anterior —que devolvia `null` para todo el subarbol— el boton que ABRE el
// dialogo tampoco existia, y un test que lo buscaba fallaba con "unable to
// find role=button" como si la pantalla no tuviera esa funcion.
export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogCtx.Provider value={{ open, onOpenChange }}>
      <div data-open={open ? 'true' : 'false'}>{children}</div>
    </DialogCtx.Provider>
  )
}

// `role="dialog"` para que los tests lo encuentren por rol de accesibilidad.
// Solo se rendea con `open`: asi un test que busca algo del dialogo sin
// haberlo abierto falla, que es el comportamiento real.
export function DialogContent(props: ComponentProps<'div'>) {
  const { open } = useContext(DialogCtx)
  if (!open) return null
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

/** Clona al hijo agregandole el `onClick` que abre o cierra, sin envolverlo en
 *  otro boton: el codigo real usa `asChild`, asi que un wrapper propio
 *  duplicaria botones en el arbol y romperia las busquedas por rol. */
function conApertura(children: ReactNode, abrir: boolean) {
  const { onOpenChange } = useContext(DialogCtx)
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

export function DialogTrigger({ children }: { asChild?: boolean; children?: ReactNode }) {
  return conApertura(children, true)
}
export function DialogClose({ children }: { asChild?: boolean; children?: ReactNode }) {
  return conApertura(children, false)
}

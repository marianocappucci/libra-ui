// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
//
// **El contenido solo se rendea con el menu ABIERTO**, igual que Radix. Es la
// parte que importa: con un stub que rendeara siempre, un test que busca
// "Cambiar contrasena" pasaria sin haber abierto nada, y el menu podria estar
// roto —o el trigger no existir— sin que nadie se entere.
import type { ComponentProps, ReactNode } from 'react'
import {
  Children, cloneElement, createContext, isValidElement, useContext, useState,
} from 'react'

const MenuCtx = createContext<{
  open: boolean
  setOpen: (v: boolean) => void
}>({ open: false, setOpen: () => {} })

export function DropdownMenu({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <MenuCtx.Provider value={{ open, setOpen }}>
      <div data-open={open ? 'true' : 'false'}>{children}</div>
    </MenuCtx.Provider>
  )
}

/** Clona al hijo agregandole el `onClick` que abre, sin envolverlo en otro
 *  boton: el codigo real usa `asChild`, y un wrapper propio duplicaria botones
 *  en el arbol y romperia las busquedas por rol. */
export function DropdownMenuTrigger({ children }: { asChild?: boolean; children?: ReactNode }) {
  const { open, setOpen } = useContext(MenuCtx)
  const hijo = Children.only(children)
  if (!isValidElement(hijo)) return <>{children}</>
  const props = hijo.props as { onClick?: (e: unknown) => void }
  return cloneElement(hijo as React.ReactElement<{ onClick?: (e: unknown) => void }>, {
    onClick: (e: unknown) => {
      props.onClick?.(e)
      setOpen(!open)
    },
  })
}

export function DropdownMenuContent({ side: _side, align: _align, ...props }: ComponentProps<'div'> & {
  side?: string
  align?: string
}) {
  const { open } = useContext(MenuCtx)
  if (!open) return null
  return <div role="menu" {...props} />
}

/** `onSelect` y no `onClick`: es la prop de Radix, y el codigo real la usa.
 *  Con `asChild` se clona al hijo (un `NavLink`, por ejemplo) en vez de
 *  envolverlo, por el mismo motivo que el trigger. */
export function DropdownMenuItem({ onSelect, asChild, children, ...props }: {
  onSelect?: (e: unknown) => void
  asChild?: boolean
  children?: ReactNode
} & Omit<ComponentProps<'div'>, 'onSelect'>) {
  const { setOpen } = useContext(MenuCtx)
  const elegir = (e: unknown) => {
    onSelect?.(e)
    // Radix cierra el menu al elegir un item. Sin esto, un test que abre el
    // dialogo desde el menu lo veria con el menu todavia encima.
    setOpen(false)
  }
  if (asChild && isValidElement(children)) {
    const hijo = children as React.ReactElement<{ onClick?: (e: unknown) => void }>
    return cloneElement(hijo, {
      onClick: (e: unknown) => { hijo.props.onClick?.(e); elegir(e) },
    })
  }
  return (
    <div role="menuitem" tabIndex={0} onClick={elegir} {...props}>
      {children}
    </div>
  )
}

export function DropdownMenuLabel(props: ComponentProps<'div'>) {
  return <div {...props} />
}

export function DropdownMenuSeparator(props: ComponentProps<'hr'>) {
  return <hr {...props} />
}

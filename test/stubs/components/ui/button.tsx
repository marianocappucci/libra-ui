import { Children, cloneElement, isValidElement } from 'react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

// `variant`/`size` son de shadcn: se aceptan y se ignoran, no se renderean
// como atributos del DOM (React avisaria por props desconocidas).
type Props = ComponentProps<'button'> & {
  variant?: string
  size?: string
  asChild?: boolean
  children?: ReactNode
}

export function Button({ variant: _v, size: _s, asChild, children, ...props }: Props) {
  // 🔴 `asChild` NO se puede ignorar. Es el `Slot` de Radix: el boton no
  // dibuja un `<button>` sino que le pasa sus props al unico hijo, que suele
  // ser un `<Link>`. Ignorandolo, el `aria-label` queda sobre un `<button>` y
  // el `href` sobre un `<a>` distinto, asi que un test que busque el enlace
  // por su etiqueta accesible encuentra el boton y lo ve sin `href`. Paso al
  // escribir los tests de la barra de navegacion de la agenda (2026-08-22).
  if (asChild && isValidElement(children)) {
    const hijo = Children.only(children) as ReactElement<Record<string, unknown>>
    return cloneElement(hijo, { ...props, ...hijo.props })
  }
  return <button {...props}>{children}</button>
}

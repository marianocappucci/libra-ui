import type { ComponentProps, ReactNode } from 'react'

// `variant`/`size` son de shadcn: se aceptan y se ignoran, no se renderean
// como atributos del DOM (React avisaria por props desconocidas).
type Props = ComponentProps<'button'> & {
  variant?: string
  size?: string
  asChild?: boolean
  children?: ReactNode
}

export function Button({ variant: _v, size: _s, asChild: _a, ...props }: Props) {
  return <button {...props} />
}

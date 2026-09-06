// Stub del `Form` de shadcn (react-hook-form) para los tests de este paquete
// -- ver vitest.config.ts. Rendea HTML semantico: `FormField` usa el
// `Controller` real de react-hook-form, que es lo que hace que el valor y el
// `onChange` lleguen al input; lo que no imita es el layout ni los estilos.
import type { ComponentProps, ReactNode } from 'react'
import { createContext, useContext } from 'react'
import {
  Controller, FormProvider, useFormContext,
  type ControllerProps, type FieldPath, type FieldValues,
} from 'react-hook-form'

export const Form = FormProvider

const FieldCtx = createContext<{ name: string }>({ name: '' })

export function FormField<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>(
  props: ControllerProps<TFieldValues, TName>,
) {
  return (
    <FieldCtx.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FieldCtx.Provider>
  )
}

export function FormItem(props: ComponentProps<'div'>) {
  return <div {...props} />
}

export function FormLabel({ children, ...props }: ComponentProps<'label'>) {
  const { name } = useContext(FieldCtx)
  return <label htmlFor={name} {...props}>{children}</label>
}

/** Clona al hijo con `id=name` para que `getByLabelText` lo encuentre, como
 *  hace el `FormControl` real vía `aria`/`id`. */
export function FormControl({ children }: { children?: ReactNode }) {
  const { name } = useContext(FieldCtx)
  if (!children || typeof children !== 'object' || !('props' in children)) return <>{children}</>
  const hijo = children as React.ReactElement<{ id?: string }>
  return <hijo.type {...hijo.props} id={hijo.props.id ?? name} />
}

export function FormMessage(props: ComponentProps<'p'>) {
  const { name } = useContext(FieldCtx)
  const { formState } = useFormContext()
  const error = (formState.errors as Record<string, { message?: string } | undefined>)[name]
  if (!error?.message) return null
  return <p role="alert" {...props}>{String(error.message)}</p>
}

export function FormDescription(props: ComponentProps<'p'>) {
  return <p {...props} />
}

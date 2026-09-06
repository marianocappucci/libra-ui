// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
//
// El `aria-label` y el `id` que las pantallas ponen en el `SelectTrigger` llegan
// al `<select>` nativo (P9-M2): sin eso, `getByRole('combobox', { name })` no
// encuentra el control, aunque en el DOM real Radix sí lo etiqueta.
import type { ReactNode } from 'react'

import { createContext, useContext, useLayoutEffect, useState } from 'react'

type Etiqueta = { ariaLabel?: string; id?: string }

const SelectCtx = createContext<{
  value?: string
  onValueChange?: (v: string) => void
  registrar?: (e: Etiqueta) => void
}>({})

type SelectProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  children?: ReactNode
  disabled?: boolean
}

export function Select({ value, onValueChange, children, disabled }: SelectProps) {
  const [etiqueta, setEtiqueta] = useState<Etiqueta>({})
  return (
    <SelectCtx.Provider value={{ value, onValueChange, registrar: setEtiqueta }}>
      <select
        value={value ?? ''}
        disabled={disabled}
        aria-label={etiqueta.ariaLabel}
        id={etiqueta.id}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        {children}
      </select>
    </SelectCtx.Provider>
  )
}

// Trigger y Value no rendean nada: en el stub el <select> nativo ya es el
// control. El trigger sólo le pasa su etiqueta al <select>.
export function SelectTrigger({ 'aria-label': ariaLabel, id }: { children?: ReactNode; id?: string; className?: string; 'aria-label'?: string }) {
  const { registrar } = useContext(SelectCtx)
  useLayoutEffect(() => {
    if (ariaLabel || id) registrar?.({ ariaLabel, id })
  }, [ariaLabel, id, registrar])
  return null
}
export function SelectValue(_props: { placeholder?: string }) {
  return null
}
export function SelectContent({ children }: { children?: ReactNode }) {
  return <>{children}</>
}
export function SelectItem({ value, children }: { value: string; children?: ReactNode }) {
  return <option value={value}>{children}</option>
}

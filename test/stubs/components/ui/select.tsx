// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
import type { ComponentProps, ReactNode } from 'react'

import { createContext, useContext } from 'react'

const SelectCtx = createContext<{
  value?: string
  onValueChange?: (v: string) => void
}>({})

type SelectProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  children?: ReactNode
  disabled?: boolean
}

export function Select({ value, onValueChange, children, disabled }: SelectProps) {
  return (
    <SelectCtx.Provider value={{ value, onValueChange }}>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        {children}
      </select>
    </SelectCtx.Provider>
  )
}

// Trigger y Value no rendean nada: en el stub el <select> nativo ya es el
// control. Se mantienen exportados porque los componentes los usan.
export function SelectTrigger({ children: _c }: { children?: ReactNode; id?: string; className?: string }) {
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

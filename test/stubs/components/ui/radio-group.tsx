// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts. Un
// `RadioGroup` es un `<div role="radiogroup">` y cada `RadioGroupItem` un
// `<input type="radio">` de verdad, para que `getByLabelText` y `user.click`
// funcionen como en el DOM real.
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'

const Ctx = createContext<{ value?: string; onValueChange?: (v: string) => void }>({})

export function RadioGroup({ value, onValueChange, children, className }: {
  value?: string; onValueChange?: (v: string) => void; children?: ReactNode; className?: string
}) {
  return (
    <Ctx.Provider value={{ value, onValueChange }}>
      <div role="radiogroup" className={className}>{children}</div>
    </Ctx.Provider>
  )
}

export function RadioGroupItem({ value, id }: { value: string; id?: string }) {
  const ctx = useContext(Ctx)
  return (
    <input
      type="radio"
      id={id}
      value={value}
      checked={ctx.value === value}
      onChange={() => ctx.onValueChange?.(value)}
    />
  )
}

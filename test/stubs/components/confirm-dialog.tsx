// Stub del `ConfirmDialog` propio de los productos (no es de shadcn: envuelve
// su AlertDialog) -- ver vitest.config.ts. La firma sigue a la real, que es
// byte-identica en Contalibra y Restolibra.
import type { ReactNode } from 'react'

export function ConfirmDialog({
  open, title, description, confirmLabel = 'Eliminar', onConfirm, onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div role="alertdialog">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {/* El real tiene los dos botones. Sin el de cancelar, un test no puede
          ejercer el camino de "me arrepentí" — que en una acción que va a ARCA
          y no se puede deshacer es justamente el que hay que poder probar. */}
      <button type="button" onClick={() => onOpenChange(false)}>Cancelar</button>
      <button type="button" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  )
}

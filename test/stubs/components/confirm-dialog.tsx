// Stub del `ConfirmDialog` propio de los productos (no es de shadcn: envuelve su AlertDialog) -- ver vitest.config.ts. La firma sigue a la real, que es
// byte-identica en Contalibra y Restolibra.
//
// Desde 0.152.0 (ADR-064) usa el `AlertDialog` REAL del kit, igual que el producto, y no un `<div role="alertdialog">` suelto: con el `Dialog` de Radix de
// verdad, un diálogo abierto marca como `aria-hidden` todo lo que queda afuera de él, y una confirmación que se abre desde adentro de un diálogo (el pago
// suelto de la cuenta corriente, borrar una lista de precios) tiene que ser un diálogo de Radix para seguir siendo accesible, como lo es en la app.
import type { ReactNode } from 'react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../../src/ui/alert-dialog'

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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Stub del `Switch` de shadcn -- ver vitest.config.ts.
//
// Se rinde como un checkbox real y no como un `<div>` con `role="switch"`: lo
// que los tests de este paquete tienen que poder hacer es `userEvent.click` y
// leer el estado, y un input nativo da las dos cosas sin reimplementar el
// teclado de Radix. El componente real es `SwitchPrimitive.Root` de `radix-ui`,
// que expone `role="switch"` y `aria-checked` -- por eso el stub lo declara
// igual: un test que busque por rol encuentra lo mismo acá y en el producto.
export function Switch({
  checked, onCheckedChange, id, disabled, className,
}: {
  checked?: boolean
  onCheckedChange?: (v: boolean) => void
  id?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      id={id}
      className={className}
      checked={!!checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  )
}

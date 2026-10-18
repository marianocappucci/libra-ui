// El primitivo de área de texto del kit (`libra-ui/ui/textarea`, 0.162.0, ADR-076).
//
// Lo importan cinco pantallas de `comercio/` (Sucursales, Depósitos, Vencimientos, Egresos…) vía `@/components/ui/textarea`; Contalibra y RestoLibra tenían cada uno su copia idéntica.
// Es un `<textarea>` común con los estilos de shadcn: lo que se fija es que no le saque nada (`ref`, `rows`, `disabled`, `aria-invalid`, el `name` de un formulario) y que sume el `className`.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Textarea } from '../src/ui/textarea'

beforeEach(cleanup)

describe('Textarea', () => {
  it('es un textbox multilínea con `data-slot="textarea"` y el texto que se escribe llega a `onChange`', async () => {
    const user = userEvent.setup()
    const alCambiar = vi.fn()
    render(<Textarea aria-label="Notas" onChange={(e) => alCambiar(e.target.value)} />)
    const caja = screen.getByRole('textbox', { name: 'Notas' })
    expect(caja.tagName).toBe('TEXTAREA')
    expect(caja).toHaveAttribute('data-slot', 'textarea')
    await user.type(caja, 'uno{Enter}dos')
    expect(caja).toHaveValue('uno\ndos')
    expect(alCambiar).toHaveBeenLastCalledWith('uno\ndos')
  })

  it('pasa tal cual las props nativas y el `ref` (React 19: `ref` es una prop más)', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea ref={ref} aria-label="Notas" name="notas" rows={5} placeholder="Escribí algo" maxLength={20} defaultValue="hola" />)
    const caja = screen.getByPlaceholderText('Escribí algo')
    expect(ref.current).toBe(caja)
    expect(caja).toHaveAttribute('name', 'notas')
    expect(caja).toHaveAttribute('rows', '5')
    expect(caja).toHaveAttribute('maxlength', '20')
    expect(caja).toHaveValue('hola')
  })

  it('🔴 `disabled` no deja escribir', async () => {
    const user = userEvent.setup()
    render(<Textarea aria-label="Notas" disabled />)
    const caja = screen.getByRole('textbox', { name: 'Notas' })
    expect(caja).toBeDisabled()
    await user.type(caja, 'x')
    expect(caja).toHaveValue('')
  })

  it('el `className` se suma al de base y el conflicto de tailwind lo gana el llamador; `aria-invalid` queda para el estilo de error', () => {
    render(<Textarea aria-label="Notas" aria-invalid className="min-h-32 font-mono" />)
    const caja = screen.getByRole('textbox', { name: 'Notas' })
    expect(caja).toHaveClass('w-full', 'rounded-md', 'font-mono', 'min-h-32')
    expect(caja).not.toHaveClass('min-h-16')
    expect(caja).toHaveAttribute('aria-invalid', 'true')
    expect(caja.className).toContain('aria-invalid:border-destructive')
  })
})

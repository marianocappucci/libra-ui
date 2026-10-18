// El primitivo de radio del kit (`libra-ui/ui/radio-group`, 0.162.0, ADR-076).
//
// Lo usaba `comercio/ListasPrecio` vía `@/components/ui/radio-group` (y por eso en los tests era un stub); Contalibra y RestoLibra tenían cada uno su copia idéntica.
// Acá corre contra Radix de verdad: el teclado (las flechas mueven la selección, como en un radio nativo), el `disabled` y los `data-slot` de shadcn.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Label } from '../src/ui/label'
import { RadioGroup, RadioGroupItem } from '../src/ui/radio-group'

beforeEach(cleanup)

function Opciones({ alCambiar, deshabilitada }: { alCambiar?: (v: string) => void; deshabilitada?: string }) {
  const [valor, setValor] = useState('mensual')
  return (
    <RadioGroup
      aria-label="Periodicidad"
      value={valor}
      onValueChange={(v) => {
        setValor(v)
        alCambiar?.(v)
      }}
    >
      {['mensual', 'trimestral', 'anual'].map((v) => (
        <div key={v} className="flex items-center gap-2">
          <RadioGroupItem value={v} id={`p-${v}`} disabled={v === deshabilitada} />
          <Label htmlFor={`p-${v}`}>{v}</Label>
        </div>
      ))}
    </RadioGroup>
  )
}

const marcado = () => screen.getByRole('radio', { checked: true }).id

describe('RadioGroup', () => {
  it('es un radiogroup con un radio por opción, y el del `value` viene marcado', () => {
    render(<Opciones />)
    expect(screen.getByRole('radiogroup', { name: 'Periodicidad' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(marcado()).toBe('p-mensual')
  })

  it('click en la etiqueta marca la opción y avisa con `onValueChange`', async () => {
    const user = userEvent.setup()
    const alCambiar = vi.fn()
    render(<Opciones alCambiar={alCambiar} />)
    await user.click(screen.getByText('anual'))
    expect(alCambiar).toHaveBeenCalledWith('anual')
    expect(marcado()).toBe('p-anual')
  })

  it('las flechas mueven la selección (a diferencia de las pestañas, un radio selecciona al enfocar)', async () => {
    const user = userEvent.setup()
    render(<Opciones />)
    await user.click(screen.getByRole('radio', { name: 'mensual' }))
    // Radix pasa el foco con un `setTimeout` (RovingFocusGroup) y marca la opción sólo si la flecha SIGUE apretada cuando el foco llega (`isArrowKeyPressed`).
    // Con `{ArrowDown}` suelto, user-event hace keydown y keyup juntos y el keyup gana la carrera: en jsdom no se marca nada. En un navegador la tecla dura
    // más que un tick; acá se la sostiene (`>`), se espera que llegue el foco y se la suelta (`/`).
    for (const esperada of ['p-trimestral', 'p-anual', 'p-mensual']) {
      await user.keyboard('{ArrowDown>}')
      await waitFor(() => expect(marcado()).toBe(esperada)) // la última da la vuelta
      await user.keyboard('{/ArrowDown}')
    }
  })

  it('🔴 una opción `disabled` no se marca con el click', async () => {
    const user = userEvent.setup()
    const alCambiar = vi.fn()
    render(<Opciones alCambiar={alCambiar} deshabilitada="anual" />)
    await user.click(screen.getByRole('radio', { name: 'anual' }))
    expect(alCambiar).not.toHaveBeenCalled()
    expect(marcado()).toBe('p-mensual')
  })

  it('lleva los data-slot de shadcn, el indicador sólo en la opción marcada, y el `className` se suma al de base', () => {
    const { container } = render(
      <RadioGroup defaultValue="a" className="flex-row">
        <RadioGroupItem value="a" aria-label="A" className="size-6" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>,
    )
    for (const slot of ['radio-group', 'radio-group-item', 'radio-group-indicator']) expect(container.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull()
    expect(container.querySelectorAll('[data-slot="radio-group-indicator"]')).toHaveLength(1)
    const grupo = container.querySelector('[data-slot="radio-group"]')!
    expect(grupo).toHaveClass('grid', 'gap-2', 'flex-row')
    // `cn` resuelve el conflicto de tailwind: gana el `size-6` del llamador sobre el `size-4` de base.
    expect(screen.getByRole('radio', { name: 'A' })).toHaveClass('size-6')
    expect(screen.getByRole('radio', { name: 'A' })).not.toHaveClass('size-4')
    expect(screen.getByRole('radio', { name: 'B' })).toHaveClass('size-4')
  })
})

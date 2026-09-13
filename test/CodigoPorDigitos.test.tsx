// El recuadro de 6 dígitos del segundo factor (v0.70.0). Lo que importa acá
// es la navegación de foco y el reparto de un código pegado/autocompletado --
// el `Login` que lo usa sólo confía en `onChange`/`onComplete`.
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CodigoPorDigitos } from '../src/CodigoPorDigitos'

const DIGITO = (n: number) => ({ name: `Dígito ${n} de 6` })

function montar({
  value = '',
  onChange = vi.fn(),
  onComplete = vi.fn(),
  ...props
}: {
  value?: string
  onChange?: (v: string) => void
  onComplete?: (codigo: string) => void
  disabled?: boolean
  autoFocus?: boolean
} = {}) {
  const utils = render(
    <CodigoPorDigitos value={value} onChange={onChange} onComplete={onComplete} {...props} />,
  )
  return { onChange, onComplete, ...utils }
}

describe('autocompletado del sistema', () => {
  it('ningún casillero tiene maxLength: el one-time-code entrega los 6 dígitos en el primero', () => {
    // En jsdom `fireEvent.change` ignora `maxLength`, así que el test del
    // reparto pasaría igual con el atributo puesto -- y en un teléfono real el
    // navegador cortaría el código a un dígito antes de que llegue al reparto.
    montar()
    for (let i = 1; i <= 6; i += 1) {
      expect(screen.getByRole('textbox', DIGITO(i))).not.toHaveAttribute('maxlength')
    }
    expect(screen.getByRole('textbox', DIGITO(1))).toHaveAttribute('autocomplete', 'one-time-code')
  })
})

describe('tipear', () => {
  it('avanza el foco al casillero siguiente', async () => {
    montar()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByRole('textbox', DIGITO(1)), '1')

    expect(screen.getByRole('textbox', DIGITO(2))).toHaveFocus()
  })

  it('el último casillero no intenta avanzar más allá', async () => {
    montar()
    const usuario = userEvent.setup()
    for (let i = 1; i <= 6; i += 1) {
      await usuario.type(screen.getByRole('textbox', DIGITO(i)), String(i))
    }
    // No explota ni mueve el foco a ningún lado raro: se queda en el sexto.
    expect(screen.getByRole('textbox', DIGITO(6))).toHaveFocus()
  })

  it('🔴 sólo acepta dígitos: una letra no se escribe y el casillero queda como estaba', async () => {
    const { onChange } = montar()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByRole('textbox', DIGITO(1)), 'a')

    expect(screen.getByRole('textbox', DIGITO(1))).toHaveValue('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('onChange se llama con el código acumulado en cada dígito válido', async () => {
    const { onChange } = montar()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByRole('textbox', DIGITO(1)), '1')
    await usuario.type(screen.getByRole('textbox', DIGITO(2)), '2')

    expect(onChange).toHaveBeenNthCalledWith(1, '1')
    expect(onChange).toHaveBeenNthCalledWith(2, '12')
  })
})

describe('onComplete', () => {
  it('🔴 se dispara una vez con el código entero al completar los 6 dígitos', async () => {
    const { onComplete } = montar()
    const usuario = userEvent.setup()
    for (let i = 1; i <= 6; i += 1) {
      await usuario.type(screen.getByRole('textbox', DIGITO(i)), String(i))
    }

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('NO se dispara con 5 de 6 dígitos', async () => {
    const { onComplete } = montar()
    const usuario = userEvent.setup()
    for (let i = 1; i <= 5; i += 1) {
      await usuario.type(screen.getByRole('textbox', DIGITO(i)), String(i))
    }

    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('Backspace', () => {
  it('en un casillero con contenido lo borra y se queda ahí', async () => {
    montar()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByRole('textbox', DIGITO(1)), '1')
    await usuario.type(screen.getByRole('textbox', DIGITO(2)), '2')
    await usuario.type(screen.getByRole('textbox', DIGITO(2)), '{Backspace}')

    expect(screen.getByRole('textbox', DIGITO(2))).toHaveValue('')
    expect(screen.getByRole('textbox', DIGITO(2))).toHaveFocus()
  })

  it('🔴 en uno vacío vuelve al anterior y lo borra', async () => {
    montar()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByRole('textbox', DIGITO(1)), '1')
    // El foco ya está en el casillero 2, que está vacío.
    await usuario.type(screen.getByRole('textbox', DIGITO(2)), '{Backspace}')

    expect(screen.getByRole('textbox', DIGITO(1))).toHaveValue('')
    expect(screen.getByRole('textbox', DIGITO(1))).toHaveFocus()
  })

  it('en el primer casillero vacío no hace nada (no hay anterior)', async () => {
    montar()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByRole('textbox', DIGITO(1)), '{Backspace}')

    expect(screen.getByRole('textbox', DIGITO(1))).toHaveFocus()
  })
})

describe('flechas', () => {
  it('ArrowLeft/ArrowRight navegan sin tocar el contenido', async () => {
    const { onChange } = montar()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByRole('textbox', DIGITO(1)), '1')
    await usuario.type(screen.getByRole('textbox', DIGITO(2)), '{ArrowLeft}')
    expect(screen.getByRole('textbox', DIGITO(1))).toHaveFocus()

    await usuario.type(screen.getByRole('textbox', DIGITO(1)), '{ArrowRight}')
    expect(screen.getByRole('textbox', DIGITO(2))).toHaveFocus()
    // Ninguna de las dos flechas modificó lo tipeado.
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('pegado', () => {
  it('🔴 reparte un código con espacios o guiones en los casilleros', () => {
    const { onChange, onComplete } = montar()
    const primero = screen.getByRole('textbox', DIGITO(1))
    fireEvent.paste(primero, { clipboardData: { getData: () => '123-456' } })

    for (let i = 1; i <= 6; i += 1) {
      expect(screen.getByRole('textbox', DIGITO(i))).toHaveValue(String(i))
    }
    expect(onChange).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
    expect(screen.getByRole('textbox', DIGITO(6))).toHaveFocus()
  })

  it('un pegado corto deja el resto vacío y no completa', () => {
    const { onComplete } = montar()
    const primero = screen.getByRole('textbox', DIGITO(1))
    fireEvent.paste(primero, { clipboardData: { getData: () => '12' } })

    expect(screen.getByRole('textbox', DIGITO(1))).toHaveValue('1')
    expect(screen.getByRole('textbox', DIGITO(3))).toHaveValue('')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('un pegado sin dígitos no hace nada', () => {
    const { onChange } = montar()
    fireEvent.paste(screen.getByRole('textbox', DIGITO(1)), { clipboardData: { getData: () => 'abc' } })

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('autocompletado del sistema (SMS/app entregando varios dígitos de una)', () => {
  it('reparte desde el casillero donde llegó, sin ser un pegado', () => {
    const { onChange } = montar()
    // Simula lo que hace un teclado con autocompletado: un solo evento
    // `change` entrega más de un carácter, sin pasar por `onPaste`.
    fireEvent.change(screen.getByRole('textbox', DIGITO(1)), { target: { value: '123' } })

    expect(screen.getByRole('textbox', DIGITO(1))).toHaveValue('1')
    expect(screen.getByRole('textbox', DIGITO(2))).toHaveValue('2')
    expect(screen.getByRole('textbox', DIGITO(3))).toHaveValue('3')
    expect(screen.getByRole('textbox', DIGITO(4))).toHaveFocus()
    expect(onChange).toHaveBeenCalledWith('123')
  })
})

describe('value controlado / reset', () => {
  it('un reset a \'\' desde afuera limpia los casilleros y vuelve el foco al primero', () => {
    const { rerender } = render(
      <CodigoPorDigitos value="1234" onChange={vi.fn()} onComplete={vi.fn()} />,
    )
    expect(screen.getByRole('textbox', DIGITO(1))).toHaveValue('1')

    rerender(<CodigoPorDigitos value="" onChange={vi.fn()} onComplete={vi.fn()} />)

    expect(screen.getByRole('textbox', DIGITO(1))).toHaveValue('')
    expect(screen.getByRole('textbox', DIGITO(1))).toHaveFocus()
  })

  it('el montaje inicial con value=\'\' NO roba el foco si no se pidió autoFocus', () => {
    montar({ value: '' })
    expect(document.body).toHaveFocus()
  })
})

describe('disabled y autoFocus', () => {
  it('disabled deshabilita los 6 casilleros', () => {
    montar({ disabled: true })
    for (let i = 1; i <= 6; i += 1) {
      expect(screen.getByRole('textbox', DIGITO(i))).toBeDisabled()
    }
  })

  it('autoFocus enfoca el primer casillero al montar', () => {
    montar({ autoFocus: true })
    expect(screen.getByRole('textbox', DIGITO(1))).toHaveFocus()
  })
})

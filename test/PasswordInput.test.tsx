// El "ojito" de los campos de contraseña, presente en los 6 productos.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PasswordInput } from '../src/PasswordInput'

describe('PasswordInput', () => {
  it('arranca oculto', () => {
    render(<PasswordInput id="p" defaultValue="secreta" />)
    expect(document.getElementById('p')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument()
  })

  it('el ojito alterna entre ver y ocultar', async () => {
    const user = userEvent.setup()
    render(<PasswordInput id="p" defaultValue="secreta" />)
    const campo = document.getElementById('p')!

    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(campo).toHaveAttribute('type', 'text')
    // El aria-label acompaña al estado: si no cambiara, un lector de
    // pantalla anunciaria lo contrario de lo que hace el boton.
    const ocultar = screen.getByRole('button', { name: 'Ocultar contraseña' })
    expect(ocultar).toHaveAttribute('aria-pressed', 'true')

    await user.click(ocultar)
    expect(campo).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('el boton queda fuera del orden de tabulacion', () => {
    // Deliberado: quien navega con teclado va del campo al submit, no a un
    // control decorativo.
    render(<PasswordInput id="p" />)
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute('tabindex', '-1')
  })

  it('no es un submit escondido dentro del form', () => {
    // Sin type="button" explicito, un <button> dentro de un <form> envia
    // el formulario: tocar el ojito intentaria loguear.
    render(<PasswordInput id="p" />)
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute('type', 'button')
  })

  it('deshabilitado tambien deshabilita el ojito', async () => {
    render(<PasswordInput id="p" disabled />)
    expect(document.getElementById('p')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeDisabled()
  })

  it('reenvia las props al input y deja que el consumidor pise el padding', () => {
    render(<PasswordInput id="p" placeholder="Tu clave" required className="pr-20" />)
    const campo = document.getElementById('p')!
    expect(campo).toHaveAttribute('placeholder', 'Tu clave')
    expect(campo).toBeRequired()
    // `pr-9` es del componente y `pr-20` del consumidor: tailwind-merge
    // resuelve el conflicto a favor del ultimo, que es el criterio con el
    // que se escribio (`cn('pr-9', className)`).
    expect(campo.className).toContain('pr-20')
    expect(campo.className).not.toContain('pr-9')
  })
})

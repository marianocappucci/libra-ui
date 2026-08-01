// El select con búsqueda. Nació del problema real: una empresa con cientos
// de clientes no puede elegirlos recorriendo una lista ordenada.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { SelectBuscable, type OpcionSelect } from '../src/SelectBuscable'

const CLIENTES: OpcionSelect[] = [
  { value: '1', label: 'Compulibra', hint: 'Suipacha' },
  { value: '2', label: 'Hospital Esteban Iribarne', hint: 'Suipacha' },
  { value: '3', label: 'Panadería La Espiga', hint: 'Mercedes' },
  { value: '4', label: 'Ferretería El Tornillo', hint: 'Luján' },
]

/** Envoltorio con estado, que es como lo usa una pantalla de verdad. */
function ConEstado({ inicial = '', onChange }: { inicial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(inicial)
  return (
    <SelectBuscable
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v) }}
      opciones={CLIENTES}
      placeholder="Cliente…"
      ariaLabel="Cliente"
    />
  )
}

const abrir = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('combobox', { name: 'Cliente' }))

const opciones = () => within(screen.getByRole('listbox')).queryAllByRole('option').map((o) => o.textContent)

describe('SelectBuscable', () => {
  it('cerrado muestra el placeholder cuando no hay nada elegido', () => {
    render(<ConEstado />)
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveTextContent('Cliente…')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('cerrado muestra la etiqueta de la opción elegida', () => {
    // Montaje nuevo y no un rerender: el valor inicial de un useState no se
    // reinicializa al re-renderizar, así que un rerender no probaría nada.
    render(<ConEstado inicial="3" />)
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveTextContent('Panadería La Espiga')
  })

  it('al abrir, el foco va al campo de búsqueda', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)
    expect(screen.getByRole('textbox', { name: 'Buscar entre las opciones' })).toHaveFocus()
  })

  it('filtra por lo que se escribe, ignorando acentos', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)
    expect(opciones()).toHaveLength(4)

    // Sin acento encuentra el que lo tiene: es la mitad de las búsquedas
    // que fallarían en datos cargados a mano.
    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'panaderia')
    expect(opciones()).toHaveLength(1)
    expect(opciones()[0]).toContain('Panadería La Espiga')
  })

  it('busca también por el hint, no sólo por la etiqueta', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)

    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'mercedes')
    expect(opciones()).toHaveLength(1)
    expect(opciones()[0]).toContain('Panadería')
  })

  it('exige todos los términos, en cualquier orden', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)
    const campo = screen.getByRole('textbox', { name: 'Buscar entre las opciones' })

    await user.type(campo, 'hospital suipacha')
    expect(opciones()).toHaveLength(1)

    await user.clear(campo)
    await user.type(campo, 'suipacha hospital')
    expect(opciones()).toHaveLength(1)
  })

  it('elegir con el mouse devuelve el value y cierra', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.click(screen.getByRole('option', { name: /Ferretería El Tornillo/ }))
    expect(alElegir).toHaveBeenCalledWith('4')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveTextContent('Ferretería El Tornillo')
  })

  it('se puede elegir sin tocar el mouse: escribir y Enter', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'tornillo{Enter}')
    expect(alElegir).toHaveBeenCalledWith('4')
  })

  it('las flechas mueven el resaltado y Enter elige el resaltado', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(alElegir).toHaveBeenCalledWith('3')
  })

  it('escribir mueve el resaltado al primer resultado', async () => {
    // Si no lo hiciera, Enter elegiría una opción que el filtro dejó afuera:
    // el usuario ve un resultado y se le guarda otro.
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'compu')
    await user.keyboard('{Enter}')
    expect(alElegir).toHaveBeenCalledWith('1')
  })

  it('abre resaltando la opción ya elegida, así Enter no la cambia', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado inicial="3" onChange={alElegir} />)
    await abrir(user)

    await user.keyboard('{Enter}')
    expect(alElegir).toHaveBeenCalledWith('3')
  })

  it('Escape cierra sin elegir', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(alElegir).not.toHaveBeenCalled()
  })

  it('un click afuera cierra el desplegable', async () => {
    const user = userEvent.setup()
    render(<><ConEstado /><button type="button">afuera</button></>)
    await abrir(user)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'afuera' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('sin resultados lo dice, en vez de mostrar una lista vacía', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)

    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'zzz')
    expect(screen.getByText('Sin resultados.')).toBeInTheDocument()
    expect(opciones()).toHaveLength(0)
  })

  it('la búsqueda se limpia al reabrir', async () => {
    // Reabrir y encontrarse el filtro anterior aplicado hace pensar que se
    // perdieron opciones.
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)
    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'compu')
    expect(opciones()).toHaveLength(1)

    await user.keyboard('{Escape}')
    await abrir(user)
    expect(screen.getByRole('textbox', { name: 'Buscar entre las opciones' })).toHaveValue('')
    expect(opciones()).toHaveLength(4)
  })

  it('marca cuál está elegida para un lector de pantalla', async () => {
    const user = userEvent.setup()
    render(<ConEstado inicial="2" />)
    await abrir(user)

    const elegida = screen.getByRole('option', { name: /Hospital Esteban Iribarne/ })
    expect(elegida).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Compulibra/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('deshabilitado no abre', async () => {
    const user = userEvent.setup()
    render(
      <SelectBuscable value="" onChange={vi.fn()} opciones={CLIENTES} ariaLabel="Cliente" disabled />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

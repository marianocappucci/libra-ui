/** El campo «Cliente» con alta en el lugar (ADR-071). Lo que fijan estos tests es lo que se pidió: que el cliente que no está se pueda crear sin
 *  salir de lo que se carga, que quede elegido, y que el panel no mande ni cierre el formulario de afuera. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { SelectCliente, type ClienteNuevo, type SelectClienteProps } from '../src/SelectCliente'

const OPCIONES = [{ value: '1', label: 'Estudio Sur' }]

function Campo(props: Partial<SelectClienteProps> & { alEnviar?: () => void }) {
  const [valor, setValor] = useState('')
  const { alEnviar, ...resto } = props
  return (
    <form onSubmit={(e) => { e.preventDefault(); alEnviar?.() }}>
      <SelectCliente
        value={valor} onChange={setValor} opciones={OPCIONES} ariaLabel="Cliente"
        crear={async (d) => ({ value: '9', label: d.nombre })} {...resto}
      />
      <span aria-label="elegido">{valor}</span>
      <button type="submit">Guardar todo</button>
    </form>
  )
}

const abrirPanel = () => fireEvent.click(screen.getByRole('button', { name: 'Agregar nuevo cliente' }))

describe('SelectCliente', () => {
  it('ofrece el alta al lado del buscador', () => {
    render(<Campo />)
    expect(screen.getByRole('button', { name: 'Agregar nuevo cliente' })).toBeInTheDocument()
  })

  it('crea con lo cargado, lo deja elegido y cierra el panel', async () => {
    const crear = vi.fn(async (d: ClienteNuevo) => ({ value: '9', label: d.nombre }))
    render(<Campo crear={crear} />)
    abrirPanel()
    await userEvent.type(screen.getByLabelText('Nombre *'), '  Taller Norte ')
    await userEvent.type(screen.getByLabelText('Teléfono'), '011 5555-0000')
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => expect(screen.getByLabelText('elegido')).toHaveTextContent('9'))
    expect(crear).toHaveBeenCalledWith({
      nombre: 'Taller Norte', documento: '', condicionIva: '', telefono: '011 5555-0000', email: '',
    })
    expect(screen.queryByRole('group', { name: 'Nuevo cliente' })).not.toBeInTheDocument()
    // El recién creado se ve aunque el consumidor no lo haya sumado a su lista.
    expect(screen.getByDisplayValue('Taller Norte')).toBeInTheDocument()
  })

  it('🔴 Enter en el panel crea el cliente y NO manda el formulario de afuera', async () => {
    const alEnviar = vi.fn()
    const crear = vi.fn(async (d: ClienteNuevo) => ({ value: '9', label: d.nombre }))
    render(<Campo crear={crear} alEnviar={alEnviar} />)
    abrirPanel()
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Taller Norte{Enter}')
    await waitFor(() => expect(crear).toHaveBeenCalled())
    expect(alEnviar).not.toHaveBeenCalled()
  })

  it('sin nombre no deja crear', () => {
    render(<Campo />)
    abrirPanel()
    expect(screen.getByRole('button', { name: 'Crear cliente' })).toBeDisabled()
  })

  it('si el alta falla muestra el error adentro y no pierde lo cargado', async () => {
    const crear = vi.fn(async () => { throw Object.assign(new Error('x'), { detail: 'Ya existe un cliente con ese CUIT' }) })
    render(<Campo crear={crear} />)
    abrirPanel()
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Taller Norte')
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un cliente con ese CUIT')
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Taller Norte')
    expect(screen.getByLabelText('elegido')).toHaveTextContent('')
  })

  it('pide sólo los campos que el producto indica, con su nombre de entidad', () => {
    render(<Campo campos={['documento']} entidad="paciente" etiquetaDocumento="DNI" />)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar nuevo paciente' }))
    expect(screen.getByLabelText('DNI')).toBeInTheDocument()
    expect(screen.queryByLabelText('Teléfono')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear paciente' })).toBeInTheDocument()
  })

  it('con conAlta={false} no ofrece el botón', () => {
    render(<Campo conAlta={false} />)
    expect(screen.queryByRole('button', { name: 'Agregar nuevo cliente' })).not.toBeInTheDocument()
  })
})

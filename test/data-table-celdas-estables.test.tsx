// Las celdas de `DataTable` no se remontan cuando el padre se vuelve a renderizar (ADR-025). Las columnas se declaran
// con `cell` inline, una función nueva en cada render: con `flexRender` eso era un componente distinto y React
// desmontaba cada celda, así que el foco de teclado se perdía y un clic a mitad del remonte no llegaba (libra-ui#262).
import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { DataTable, type ColumnDef } from '../src/data-table'

type Fila = { id: number; nombre: string }
const FILAS: Fila[] = [{ id: 1, nombre: 'Yerba' }, { id: 2, nombre: 'Sal' }]

let rerender: () => void = () => {}

/** Una pantalla típica: columnas redefinidas en cada render (sin `useMemo`) y una casilla por fila. */
function Pantalla() {
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [, setVuelta] = useState(0)
  rerender = () => setVuelta((n) => n + 1)
  const columnas: ColumnDef<Fila>[] = [
    {
      id: 'elegir',
      header: () => <span data-testid="encabezado">Elegir</span>,
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Elegir ${row.original.nombre}`}
          checked={elegidos.has(row.original.id)}
          onChange={() => setElegidos((a) => { const n = new Set(a); if (!n.delete(row.original.id)) n.add(row.original.id); return n })}
        />
      ),
    },
    { accessorKey: 'nombre', header: 'Producto' },
  ]
  return <DataTable columns={columnas} data={FILAS} />
}

afterEach(() => { cleanup() })

describe('DataTable: celdas con identidad estable', () => {
  it('un re-render del padre no remonta las celdas ni los encabezados', () => {
    render(<Pantalla />)
    const casilla = screen.getByLabelText('Elegir Yerba')
    const encabezado = screen.getByTestId('encabezado')
    act(() => rerender())
    expect(screen.getByLabelText('Elegir Yerba')).toBe(casilla)
    expect(casilla.isConnected).toBe(true)
    expect(screen.getByTestId('encabezado')).toBe(encabezado)
  })

  it('tildar con el teclado no pierde el foco aunque la pantalla se actualice', async () => {
    const user = userEvent.setup()
    render(<Pantalla />)
    const casilla = screen.getByLabelText('Elegir Yerba')
    casilla.focus()
    await user.keyboard(' ')
    expect(casilla).toBeChecked()
    act(() => rerender())
    expect(document.activeElement).toBe(casilla)
    await user.keyboard(' ')
    expect(screen.getByLabelText('Elegir Yerba')).not.toBeChecked()
  })

  it('un clic que empieza antes de un re-render y termina después igual tilda', async () => {
    const user = userEvent.setup()
    render(<Pantalla />)
    const casilla = screen.getByLabelText('Elegir Sal')
    await user.pointer({ keys: '[MouseLeft>]', target: casilla })
    act(() => rerender())
    await user.pointer({ keys: '[/MouseLeft]', target: casilla })
    expect(screen.getByLabelText('Elegir Sal')).toBeChecked()
  })
})

// La tabla compartida por los 6 productos. Se prueba sobre todo la busqueda
// (v0.8.0): es la parte con logica propia -- el sorting y el resize los pone
// TanStack, que tiene sus propios tests.
//
// El punto central de estos casos es el **gating**: sin la prop `search` el
// componente tiene que renderizar exactamente lo de antes, porque 4 de los 5
// consumidores no la usan y no se despliegan en la misma tanda.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, anchoColumnaAcciones, sortableHeader } from '../src/data-table'

type Equipo = { id: number; tipo: string; marca: string; sector: string; clienteId: number }

const EQUIPOS: Equipo[] = [
  { id: 1, tipo: 'Impresora', marca: 'HP', sector: 'Admisión', clienteId: 7 },
  { id: 2, tipo: 'Notebook', marca: 'Lenovo', sector: 'Contaduría', clienteId: 7 },
  { id: 3, tipo: 'Impresora', marca: 'Pantum', sector: 'Depósito', clienteId: 9 },
]

const COLUMNAS: ColumnDef<Equipo>[] = [
  { accessorKey: 'tipo', header: 'Tipo' },
  { accessorKey: 'marca', header: 'Marca' },
  // Renderiza algo que NO esta en el dato crudo: el nombre del cliente. Es
  // el caso que justifica que `campos` lo declare la pagina.
  {
    accessorKey: 'clienteId',
    header: 'Cliente',
    cell: ({ row }) => (row.original.clienteId === 7 ? 'Compulibra' : 'Neuroflow'),
  },
]

const NOMBRE_CLIENTE = (id: number) => (id === 7 ? 'Compulibra' : 'Neuroflow')

const BUSQUEDA = {
  campos: (e: Equipo) => [e.tipo, e.marca, e.sector, NOMBRE_CLIENTE(e.clienteId)],
  placeholder: 'Buscar equipos',
}

/** Filas del cuerpo, sin la cabecera. */
function filas(): HTMLElement[] {
  const cuerpo = document.querySelector('tbody')!
  return within(cuerpo).queryAllByRole('row')
}

function textos(): string[] {
  return filas().map((f) => f.textContent ?? '')
}

describe('DataTable sin `search` (los 4 consumidores que no la usan)', () => {
  it('no renderiza ningun buscador ni envoltorio nuevo', () => {
    const { container } = render(<DataTable columns={COLUMNAS} data={EQUIPOS} />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    // El primer elemento sigue siendo la <table>, sin div alrededor: si se
    // envolviera siempre, los `gap`/`grid` de las paginas que ya existen
    // cambiarian de espaciado sin que nadie lo pidiera.
    expect(container.firstElementChild?.tagName).toBe('TABLE')
  })

  it('muestra todas las filas y el emptyMessage propio cuando no hay datos', () => {
    const { rerender } = render(<DataTable columns={COLUMNAS} data={EQUIPOS} />)
    expect(filas()).toHaveLength(3)

    rerender(<DataTable columns={COLUMNAS} data={[]} emptyMessage="Sin equipos todavía." />)
    expect(screen.getByText('Sin equipos todavía.')).toBeInTheDocument()
  })
})

describe('DataTable con `search`', () => {
  it('filtra por cualquiera de los campos declarados', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={COLUMNAS} data={EQUIPOS} search={BUSQUEDA} />)
    expect(filas()).toHaveLength(3)

    await user.type(screen.getByRole('searchbox', { name: 'Buscar equipos' }), 'lenovo')
    expect(textos()).toHaveLength(1)
    expect(textos()[0]).toContain('Notebook')
  })

  it('encuentra por lo que la celda MUESTRA, no por el dato crudo', async () => {
    // `clienteId: 7` se ve como "Compulibra". Un filtro generico sobre los
    // valores de las celdas buscaria el 7 y esto no daria nada.
    const user = userEvent.setup()
    render(<DataTable columns={COLUMNAS} data={EQUIPOS} search={BUSQUEDA} />)

    await user.type(screen.getByRole('searchbox'), 'compulibra')
    expect(filas()).toHaveLength(2)
  })

  it('ignora acentos en los dos sentidos', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={COLUMNAS} data={EQUIPOS} search={BUSQUEDA} />)
    const campo = screen.getByRole('searchbox')

    // Escrito sin acento, el dato lo tiene.
    await user.type(campo, 'admision')
    expect(filas()).toHaveLength(1)
    expect(textos()[0]).toContain('HP')

    // Y al reves: escrito con acento encuentra igual.
    await user.clear(campo)
    await user.type(campo, 'Contaduría')
    expect(filas()).toHaveLength(1)
    expect(textos()[0]).toContain('Lenovo')
  })

  it('exige todos los terminos, en cualquier orden y en campos distintos', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={COLUMNAS} data={EQUIPOS} search={BUSQUEDA} />)
    const campo = screen.getByRole('searchbox')

    // "hp" esta en marca y "admision" en sector: con un solo includes de la
    // frase entera, esta busqueda -- la natural -- no daria nada.
    await user.type(campo, 'hp admision')
    expect(filas()).toHaveLength(1)

    await user.clear(campo)
    await user.type(campo, 'admision hp')
    expect(filas()).toHaveLength(1)

    // Los dos terminos tienen que estar: "hp" solo no alcanza si se pide
    // ademas un sector que ese equipo no tiene.
    await user.clear(campo)
    await user.type(campo, 'hp deposito')
    expect(filas()).toHaveLength(1)
    expect(textos()[0]).toContain('Sin resultados')
  })

  it('sin resultados dice que fue la busqueda, no que no haya datos', async () => {
    const user = userEvent.setup()
    render(
      <DataTable columns={COLUMNAS} data={EQUIPOS} search={BUSQUEDA} emptyMessage="Sin equipos todavía." />,
    )

    await user.type(screen.getByRole('searchbox'), 'zzz')
    // Con el emptyMessage de la pagina, una tabla con 3 equipos cargados
    // diria "Sin equipos todavia" y haria pensar que se perdieron.
    expect(screen.getByText(/Sin resultados para «zzz»/)).toBeInTheDocument()
    expect(screen.queryByText('Sin equipos todavía.')).not.toBeInTheDocument()
  })

  it('el boton de limpiar aparece solo con texto y devuelve todas las filas', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={COLUMNAS} data={EQUIPOS} search={BUSQUEDA} />)
    expect(screen.queryByRole('button', { name: 'Limpiar búsqueda' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'lenovo')
    expect(filas()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(filas()).toHaveLength(3)
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('espacios sueltos no filtran nada', async () => {
    const user = userEvent.setup()
    render(<DataTable columns={COLUMNAS} data={EQUIPOS} search={BUSQUEDA} />)

    await user.type(screen.getByRole('searchbox'), '   ')
    expect(filas()).toHaveLength(3)
  })

  it('descarta los campos vacios sin unirlos entre si', async () => {
    // Si los null/'' se concatenaran, "impresora" + null + "hp" podria
    // formar "impresorahp" y una busqueda de "ahp" daria un falso positivo.
    const user = userEvent.setup()
    const datos = [{ id: 1, tipo: 'Impresora', marca: 'HP', sector: '', clienteId: 7 }]
    render(
      <DataTable
        columns={COLUMNAS}
        data={datos}
        search={{ campos: (e: Equipo) => [e.tipo, null, e.marca, undefined, e.sector] }}
      />,
    )

    await user.type(screen.getByRole('searchbox'), 'ahp')
    expect(textos()[0]).toContain('Sin resultados')
  })

  it('el placeholder por defecto no rompe la etiqueta accesible', () => {
    render(<DataTable columns={COLUMNAS} data={EQUIPOS} search={{ campos: (e: Equipo) => [e.tipo] }} />)
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toBeInTheDocument()
  })

  it('la busqueda convive con el orden: se ordena lo filtrado', async () => {
    const user = userEvent.setup()
    const columnas: ColumnDef<Equipo>[] = [
      { accessorKey: 'marca', header: sortableHeader('Marca') },
      { accessorKey: 'sector', header: 'Sector' },
    ]
    render(<DataTable columns={columnas} data={EQUIPOS} search={BUSQUEDA} />)

    await user.type(screen.getByRole('searchbox'), 'impresora')
    expect(filas()).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /Marca/ }))
    // HP y Pantum, alfabetico: las dos impresoras, sin la notebook.
    expect(textos().map((t) => t.slice(0, 2))).toEqual(['HP', 'Pa'])
  })
})

// El resto del contrato del componente, que hasta esta version no tenia
// ningun test pese a que lo usan las tablas de los 6 productos.
describe('DataTable: el resto del contrato', () => {
  it('sortableHeader alterna asc -> desc', async () => {
    const user = userEvent.setup()
    const columnas: ColumnDef<Equipo>[] = [{ accessorKey: 'marca', header: sortableHeader('Marca') }]
    render(<DataTable columns={columnas} data={EQUIPOS} />)
    const boton = screen.getByRole('button', { name: /Marca/ })

    await user.click(boton)
    expect(textos()).toEqual(['HP', 'Lenovo', 'Pantum'])

    await user.click(boton)
    expect(textos()).toEqual(['Pantum', 'Lenovo', 'HP'])
  })

  it('onRowClick dispara en la fila pero no en un boton de la fila', async () => {
    const user = userEvent.setup()
    const alHacerClick = vi.fn()
    const columnas: ColumnDef<Equipo>[] = [
      { accessorKey: 'marca', header: 'Marca' },
      {
        id: 'actions',
        header: 'Acciones',
        cell: () => <button type="button">Borrar</button>,
      },
    ]
    render(<DataTable columns={columnas} data={EQUIPOS} onRowClick={alHacerClick} />)

    await user.click(screen.getByText('Lenovo'))
    expect(alHacerClick).toHaveBeenCalledWith(EQUIPOS[1])

    // Sin esta excepcion, tocar "Borrar" ademas navegaria al detalle.
    alHacerClick.mockClear()
    await user.click(screen.getAllByRole('button', { name: 'Borrar' })[0])
    expect(alHacerClick).not.toHaveBeenCalled()
  })

  it('getRowClassName y meta.className llegan al DOM', () => {
    const columnas: ColumnDef<Equipo>[] = [
      { accessorKey: 'marca', header: 'Marca', meta: { className: 'hidden md:table-cell' } },
    ]
    render(
      <DataTable
        columns={columnas}
        data={EQUIPOS}
        getRowClassName={(e) => (e.marca === 'HP' ? 'opacity-50' : undefined)}
      />,
    )

    expect(filas()[0].className).toContain('opacity-50')
    expect(filas()[1].className).not.toContain('opacity-50')
    expect(screen.getByRole('columnheader').className).toContain('hidden md:table-cell')
  })

  it('sin columnas con `size` no hay colgroup ni table-fixed', () => {
    const { container } = render(<DataTable columns={COLUMNAS} data={EQUIPOS} />)
    expect(container.querySelector('colgroup')).toBeNull()
    expect(container.querySelector('table')?.className ?? '').not.toContain('table-fixed')
  })

  it('con al menos una columna con `size` se activa el modo completo', () => {
    const columnas: ColumnDef<Equipo>[] = [
      { accessorKey: 'marca', header: 'Marca', size: 120 },
      { accessorKey: 'sector', header: 'Sector', size: 200, meta: { stretch: true, colClassName: 'hidden' } },
    ]
    const { container } = render(<DataTable columns={columnas} data={EQUIPOS} />)

    const cols = container.querySelectorAll('colgroup col')
    expect(cols).toHaveLength(2)
    expect(container.querySelector('table')?.className).toContain('table-fixed')
    // La primera respeta su `size`; la elastica va sin ancho para quedarse
    // con el sobrante.
    expect((cols[0] as HTMLElement).style.width).toBe('120px')
    expect((cols[1] as HTMLElement).style.width).toBe('')
    expect((cols[1] as HTMLElement).className).toBe('hidden')
  })

  it('anchoColumnaAcciones cuenta botones, gaps y el padding de la celda', () => {
    // 36px por boton, 4px de gap entre ellos, 16px de padding de celda.
    expect(anchoColumnaAcciones(0)).toBe(16)
    expect(anchoColumnaAcciones(1)).toBe(52)
    expect(anchoColumnaAcciones(3)).toBe(132)
  })
})

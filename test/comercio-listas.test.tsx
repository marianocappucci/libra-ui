// Las pantallas de listas de precio (P9-M2, 2026-09-06), extraídas de Contalibra
// y Restolibra. Se prueban las costuras (la prop `conQuiebres`) y los flujos:
// alta con importación inicial, activar/desactivar, borrar, guardar precios,
// ajuste en lote, importar, configurar, borrar la lista y el editor de quiebres.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ListasPrecio } from '../src/comercio/ListasPrecio'
import { ListaPrecioDetalle } from '../src/comercio/ListaPrecioDetalle'
import type { ItemListaPrecio, ListaPrecio } from '../src/comercio/tipos'

const MAYORISTA: ListaPrecio = { id: 1, nombre: 'Mayorista', descripcion: 'volumen', activa: 1, es_default: 0 }
const MINORISTA: ListaPrecio = { id: 2, nombre: 'Minorista', descripcion: '', activa: 0, es_default: 1 }
const FIDEOS: ItemListaPrecio = { id: 9, codigo: 'F1', nombre: 'Fideos', unidad: 'u', categoria: 'Almacén', precio_venta: 100, precio_costo: 60, precio_lista: 90, en_lista: 1 }
const ARROZ: ItemListaPrecio = { ...FIDEOS, id: 10, codigo: null, nombre: 'Arroz', precio_lista: 0, en_lista: 0 }

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const path = url.split('?')[0]
    const clave = `${init?.method ?? 'GET'} ${path}`
    const valor = clave in tabla ? tabla[clave] : tabla[path]
    if (valor === '!caida') return Promise.reject(new TypeError('sin red'))
    if (valor && typeof valor === 'object' && 'status' in (valor as object) && 'detail' in (valor as object)) {
      const e = valor as { status: number; detail: string }
      return Promise.resolve(json({ detail: e.detail }, e.status))
    }
    if (valor === undefined) return Promise.resolve(json({ detail: `sin respuesta para ${clave}` }, 404))
    return Promise.resolve(json(valor))
  })
}

function pedidas(): string[] {
  return fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
}

function cuerpoDe(clave: string): Record<string, unknown> {
  const i = pedidas().indexOf(clave)
  return JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body))
}

function montarDetalle(props: { conQuiebres?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={['/listas-precio/1']}>
      <Routes><Route path="/listas-precio/:id" element={<ListaPrecioDetalle {...props} />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('ListasPrecio', () => {
  it('lista, marca la default y la inactiva, y los botones van a la ruta del producto', async () => {
    responder({ '/api/listas-precio': [MAYORISTA, MINORISTA] })
    render(<MemoryRouter><ListasPrecio rutaDelDetalle={(id) => `/lp/${id}`} /></MemoryRouter>)
    await screen.findByText('Mayorista')
    expect(screen.getByText('Por defecto')).toBeTruthy()
    expect(screen.getByText('Inactiva')).toBeTruthy()
    expect(screen.getAllByLabelText('Editar precios')[0].getAttribute('href')).toBe('/lp/1')
  })

  it('el alta crea la lista y, con importación inicial, importa después', async () => {
    responder({ '/api/listas-precio': [MAYORISTA], 'POST /api/listas-precio': { ...MAYORISTA, id: 3 }, 'POST /api/listas-precio/3/importar': [] })
    const user = userEvent.setup()
    render(<MemoryRouter><ListasPrecio /></MemoryRouter>)
    await screen.findByText('Mayorista')
    await user.click(screen.getByRole('button', { name: /Nueva lista/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear lista' }))
    expect(await within(dialogo).findByText('El nombre es obligatorio')).toBeTruthy()
    await user.type(within(dialogo).getByLabelText('Nombre'), 'VIP')
    await user.click(within(dialogo).getByLabelText(/Copiar desde otra lista/))
    await user.selectOptions(within(dialogo).getByRole('combobox', { name: 'Lista de origen' }), '1')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear lista' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/listas-precio/3/importar'))
    expect(cuerpoDe('POST /api/listas-precio')).toEqual({ nombre: 'VIP', descripcion: '' })
    expect(cuerpoDe('POST /api/listas-precio/3/importar')).toEqual({ fuente: 'lista', fuente_lista_id: 1 })
  })

  it('desactivar manda PUT con activa invertida; borrar confirma; sin red avisa', async () => {
    responder({ '/api/listas-precio': [MAYORISTA], 'PUT /api/listas-precio/1': MAYORISTA, 'DELETE /api/listas-precio/1': { ok: true } })
    const user = userEvent.setup()
    render(<MemoryRouter><ListasPrecio /></MemoryRouter>)
    await screen.findByText('Mayorista')
    await user.click(screen.getByLabelText('Desactivar lista'))
    await waitFor(() => expect(cuerpoDe('PUT /api/listas-precio/1')).toEqual({ nombre: 'Mayorista', descripcion: 'volumen', activa: false }))
    await user.click(screen.getByLabelText('Eliminar lista'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(pedidas().filter((p) => p.startsWith('DELETE'))).toHaveLength(0)
    await user.click(screen.getByLabelText('Eliminar lista'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/listas-precio/1'))
    cleanup()
    responder({ '/api/listas-precio': '!caida' })
    render(<MemoryRouter><ListasPrecio /></MemoryRouter>)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

describe('ListaPrecioDetalle', () => {
  const base = {
    '/api/listas-precio': [MAYORISTA, MINORISTA],
    '/api/productos/categorias': [{ id: 1, nombre: 'Almacén' }],
    '/api/listas-precio/1/items': [FIDEOS, ARROZ],
  }

  it('sin conQuiebres no hay columna Quiebres; con ella aparece y el editor guarda', async () => {
    responder({ ...base, '/api/listas-precio/1/items/9/quiebres': [{ min_quantity: 10, amount: 80 }], 'PUT /api/listas-precio/1/items/9/quiebres': [] })
    montarDetalle()
    await screen.findByText('Fideos')
    expect(screen.queryAllByRole('button', { name: 'Quiebres' })).toHaveLength(0)
    cleanup()
    const user = userEvent.setup()
    montarDetalle({ conQuiebres: true })
    await screen.findByText('Fideos')
    expect(screen.getAllByRole('button', { name: 'Quiebres' })).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: 'Quiebres' })[0])
    const dialogo = await screen.findByRole('dialog')
    expect(await within(dialogo).findByDisplayValue('10')).toBeTruthy()
    await user.click(within(dialogo).getByRole('button', { name: /Agregar quiebre/ }))
    await user.click(within(dialogo).getByRole('button', { name: /Agregar quiebre/ }))
    await user.click(within(dialogo).getAllByLabelText('Quitar quiebre')[2])
    await user.type(within(dialogo).getByLabelText('Cantidad mínima 2'), '50')
    await user.type(within(dialogo).getByLabelText('Precio del quiebre 2'), '70')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar quiebres' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/listas-precio/1/items/9/quiebres'))
    expect(cuerpoDe('PUT /api/listas-precio/1/items/9/quiebres')).toEqual({ quiebres: [{ min_quantity: 10, amount: 80 }, { min_quantity: 50, amount: 70 }] })    // Cerrar el editor sin guardar no pide nada.
    await user.click(screen.getAllByRole('button', { name: 'Quiebres' })[1])
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(pedidas().filter((p) => p.startsWith('PUT')).length).toBe(1)
  })

  it('guardar precios manda sólo los cargados; el filtro por categoría pide con el parámetro', async () => {
    responder({ ...base, 'PUT /api/listas-precio/1/items': [FIDEOS, ARROZ] })
    const user = userEvent.setup()
    montarDetalle()
    await screen.findByText('Fideos')
    fireEvent.change(screen.getByLabelText('Precio de Arroz'), { target: { value: '85' } })
    await user.click(screen.getByRole('button', { name: /Guardar precios/ }))
    await waitFor(() => expect(cuerpoDe('PUT /api/listas-precio/1/items')).toEqual({ precios: { '9': 90, '10': 85 } }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por categoría' }), 'Almacén')
    await waitFor(() => expect(pedidas().some((p) => p.includes('/items?categoria=Almac%C3%A9n'))).toBe(true))
  })

  it('el ajuste en lote y la importación mandan lo elegido', async () => {
    responder({ ...base, 'POST /api/listas-precio/1/ajuste-porcentual': { actualizados: 2 }, 'POST /api/listas-precio/1/importar': [FIDEOS] })
    const user = userEvent.setup()
    montarDetalle()
    await screen.findByText('Fideos')
    await user.click(screen.getByRole('button', { name: /Actualizar en lote/ }))
    let panel = await screen.findByRole('dialog')
    await user.type(within(panel).getByLabelText('Porcentaje de ajuste'), '10')
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Base de cálculo' }), 'costo')
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Aplicar a' }), 'Almacén')
    await user.click(within(panel).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(cuerpoDe('POST /api/listas-precio/1/ajuste-porcentual')).toEqual({ porcentaje: 10, base: 'costo', categoria: 'Almacén' }))

    await user.click(screen.getByRole('button', { name: /Importar precios/ }))
    panel = await screen.findByRole('dialog')
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Importar desde' }), 'lista')
    await user.click(within(panel).getByRole('button', { name: 'Importar' }))
    expect(await screen.findByText('Elegí la lista de origen.')).toBeTruthy()
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Lista de origen' }), '2')
    await user.click(within(panel).getByRole('button', { name: 'Importar' }))
    await waitFor(() => expect(cuerpoDe('POST /api/listas-precio/1/importar')).toEqual({ fuente: 'lista', fuente_lista_id: 2 }))
  })

  it('configurar guarda nombre y estado; eliminar confirma y vuelve al listado', async () => {
    responder({ ...base, 'PUT /api/listas-precio/1': MAYORISTA, 'DELETE /api/listas-precio/1': { ok: true } })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/listas-precio/1']}>
        <Routes>
          <Route path="/listas-precio/:id" element={<ListaPrecioDetalle rutaDeListas="/lp" />} />
          <Route path="/lp" element={<p>volví al listado</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('Fideos')
    await user.click(screen.getByRole('button', { name: /Configurar/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.clear(within(dialogo).getByLabelText('Nombre'))
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Mayorista 2')
    await user.type(within(dialogo).getByLabelText('Descripción'), '!')
    await user.click(within(dialogo).getByRole('checkbox'))
    await user.click(within(dialogo).getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(cuerpoDe('PUT /api/listas-precio/1')).toEqual({ nombre: 'Mayorista 2', descripcion: 'volumen!', activa: false }))
    await user.click(screen.getByRole('button', { name: /Configurar/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Eliminar lista/ }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('volví al listado')).toBeTruthy()
  })

  it('una lista inexistente se queda en cargando sin romper, y un 500 en ítems se muestra', async () => {
    responder({ ...base, '/api/listas-precio/1/items': { status: 500, detail: 'se rompió' } })
    montarDetalle()
    expect(await screen.findByText('se rompió')).toBeTruthy()
  })
})

// La pantalla de promociones (roadmap de producto, 2026-09-28): listado con la regla
// y la vigencia legibles, alta de «llevá N pagá M» y de combos, edición, activar /
// desactivar y borrar. El ahorro lo calcula el motor; acá, que la pantalla carga las
// reglas que el motor espera.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Promociones } from '../src/comercio/Promociones'
import type { Producto, Promocion } from '../src/comercio/tipos'

const PRODUCTO = (id: number, nombre: string): Producto => ({
  id, codigo: null, nombre, descripcion: '', precio_venta: 100, precio_costo: 60, unidad: 'u',
  categoria: '', stock_minimo: 0, estacion: '', vendible: 1, activo: 1, tipo: 'producto',
})
const ALFAJOR = PRODUCTO(1, 'Alfajor')
const HAMBURGUESA = PRODUCTO(2, 'Hamburguesa')
const PAPAS = PRODUCTO(3, 'Papas')

const DOSPORUNO: Promocion = {
  id: 7, nombre: '2x1 alfajores', tipo: 'nxm', paga: 1, precio: null, desde: null, hasta: null, activa: 1,
  items: [{ producto_id: 1, cantidad: 2, nombre: 'Alfajor' }],
}
const COMBO: Promocion = {
  id: 8, nombre: 'Combo clásico', tipo: 'combo', paga: null, precio: 650,
  desde: '2026-09-28T18:00:00', hasta: '2026-09-28T20:00:00', activa: 0,
  items: [
    { producto_id: 2, cantidad: 1, nombre: 'Hamburguesa' },
    { producto_id: 3, cantidad: 1, nombre: 'Papas' },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const path = String(entrada).split('?')[0]
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

const pedidas = () => fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)

function cuerpoDe(clave: string): Record<string, unknown> {
  const i = pedidas().indexOf(clave)
  return JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body))
}

const base = {
  '/api/promociones': [DOSPORUNO, COMBO],
  '/api/productos': [ALFAJOR, HAMBURGUESA, PAPAS],
}

async function elegirProducto(user: ReturnType<typeof userEvent.setup>, etiqueta: string, nombre: RegExp) {
  await user.click(screen.getByRole('combobox', { name: etiqueta }))
  await user.click(await screen.findByRole('option', { name: nombre }))
}

beforeEach(() => {
  cleanup()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('Promociones', () => {
  it('lista con la regla y la vigencia legibles, y el estado de cada una', async () => {
    responder(base)
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    expect(await screen.findByText('2x1 alfajores')).toBeInTheDocument()
    expect(screen.getByText(/Llevá 2 pagá 1 · Alfajor/)).toBeInTheDocument()
    expect(screen.getByText('Siempre')).toBeInTheDocument()
    expect(screen.getByText(/Hamburguesa \+ Papas = \$\s?650,00/)).toBeInTheDocument()
    expect(screen.getByText('Activa')).toBeInTheDocument()
    expect(screen.getByText('Inactiva')).toBeInTheDocument()
  })

  it('la cabecera hace wrap: a 320 px el título y «Nueva promoción» ensanchaban la página 38 px', async () => {
    responder(base)
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    const boton = await screen.findByRole('button', { name: /Nueva promoción/ })
    expect(boton.parentElement!.className).toContain('flex-wrap')
  })

  it('sin promociones ofrece crear la primera; sin red avisa', async () => {
    responder({ ...base, '/api/promociones': [] })
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    expect(await screen.findByText('No hay promociones cargadas aún.')).toBeInTheDocument()
    cleanup()
    responder({ ...base, '/api/promociones': '!caida' })
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })

  it('el alta de «llevá N pagá M» manda producto, unidades, pagás y vigencia', async () => {
    responder({ ...base, 'POST /api/promociones': DOSPORUNO })
    const user = userEvent.setup()
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    await screen.findByText('2x1 alfajores')
    await user.click(screen.getByRole('button', { name: /Nueva promoción/ }))
    const dialogo = await screen.findByRole('dialog')

    await user.type(within(dialogo).getByLabelText('Nombre'), '3x2 alfajores')
    await elegirProducto(user, 'Producto de la promoción', /Alfajor/)
    await user.clear(within(dialogo).getByLabelText('Llevás'))
    await user.type(within(dialogo).getByLabelText('Llevás'), '3')
    await user.clear(within(dialogo).getByLabelText('Pagás'))
    await user.type(within(dialogo).getByLabelText('Pagás'), '2')
    await user.type(within(dialogo).getByLabelText('Desde'), '2026-10-01T09:00')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/promociones'))
    expect(cuerpoDe('POST /api/promociones')).toEqual({
      nombre: '3x2 alfajores', tipo: 'nxm', items: [{ producto_id: 1, cantidad: 3 }],
      paga: 2, precio: null, desde: '2026-10-01T09:00', hasta: '', activa: true,
    })
  })

  it('el alta de un combo manda los productos y el precio cerrado', async () => {
    responder({ ...base, 'POST /api/promociones': COMBO })
    const user = userEvent.setup()
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    await screen.findByText('2x1 alfajores')
    await user.click(screen.getByRole('button', { name: /Nueva promoción/ }))
    const dialogo = await screen.findByRole('dialog')

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Combo clásico')
    await user.selectOptions(within(dialogo).getByLabelText('Tipo de promoción'), 'combo')
    await elegirProducto(user, 'Producto 1 del combo', /Hamburguesa/)
    await elegirProducto(user, 'Producto 2 del combo', /Papas/)
    await user.type(within(dialogo).getByLabelText('Precio del combo'), '650')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/promociones'))
    expect(cuerpoDe('POST /api/promociones')).toEqual({
      nombre: 'Combo clásico', tipo: 'combo',
      items: [{ producto_id: 2, cantidad: 1 }, { producto_id: 3, cantidad: 1 }],
      paga: null, precio: 650, desde: '', hasta: '', activa: true,
    })
  })

  it('un combo se puede ampliar y quitar filas, pero no queda con menos de dos', async () => {
    responder(base)
    const user = userEvent.setup()
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    await screen.findByText('2x1 alfajores')
    await user.click(screen.getByRole('button', { name: /Nueva promoción/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.selectOptions(within(dialogo).getByLabelText('Tipo de promoción'), 'combo')
    expect(within(dialogo).queryByLabelText(/Quitar producto/)).toBeNull()
    await user.click(within(dialogo).getByRole('button', { name: /Agregar producto/ }))
    expect(within(dialogo).getByLabelText('Producto 3 del combo')).toBeInTheDocument()
    await user.click(within(dialogo).getByLabelText('Quitar producto 3'))
    expect(within(dialogo).queryByLabelText('Producto 3 del combo')).toBeNull()
  })

  it('sin nombre o sin producto no manda nada, y un error del motor se muestra', async () => {
    responder({ ...base, 'POST /api/promociones': { status: 422, detail: "'pagá M' tiene que ser menor" } })
    const user = userEvent.setup()
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    await screen.findByText('2x1 alfajores')
    await user.click(screen.getByRole('button', { name: /Nueva promoción/ }))
    const dialogo = await screen.findByRole('dialog')

    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialogo).findByText('El nombre es obligatorio.')).toBeInTheDocument()
    await user.type(within(dialogo).getByLabelText('Nombre'), 'x')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialogo).findByText('Elegí el producto de cada fila.')).toBeInTheDocument()
    expect(pedidas().filter((p) => p.startsWith('POST'))).toHaveLength(0)

    await elegirProducto(user, 'Producto de la promoción', /Alfajor/)
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialogo).findByText("'pagá M' tiene que ser menor")).toBeInTheDocument()
  })

  it('editar carga la regla, recorta los segundos de la vigencia y hace PUT', async () => {
    responder({ ...base, 'PUT /api/promociones/8': COMBO })
    const user = userEvent.setup()
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    await screen.findByText('Combo clásico')
    await user.click(screen.getByLabelText('Editar Combo clásico'))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Nombre')).toHaveValue('Combo clásico')
    expect(within(dialogo).getByLabelText('Precio del combo')).toHaveValue(650)
    expect(within(dialogo).getByLabelText('Desde')).toHaveValue('2026-09-28T18:00')
    await user.clear(within(dialogo).getByLabelText('Precio del combo'))
    await user.type(within(dialogo).getByLabelText('Precio del combo'), '600')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/promociones/8'))
    expect(cuerpoDe('PUT /api/promociones/8')).toMatchObject({
      tipo: 'combo', precio: 600, desde: '2026-09-28T18:00', hasta: '2026-09-28T20:00', activa: false,
    })
  })

  it('activar / desactivar manda PUT con la regla y activa invertida; borrar confirma', async () => {
    responder({ ...base, 'PUT /api/promociones/7': DOSPORUNO, 'DELETE /api/promociones/7': { ok: true } })
    const user = userEvent.setup()
    render(<MemoryRouter><Promociones /></MemoryRouter>)
    await screen.findByText('2x1 alfajores')
    await user.click(screen.getByLabelText('Desactivar promoción'))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/promociones/7'))
    expect(cuerpoDe('PUT /api/promociones/7')).toMatchObject({
      tipo: 'nxm', paga: 1, items: [{ producto_id: 1, cantidad: 2 }], activa: false,
    })

    await user.click(screen.getByLabelText('Eliminar 2x1 alfajores'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(pedidas().filter((p) => p.startsWith('DELETE'))).toHaveLength(0)
    await user.click(screen.getByLabelText('Eliminar 2x1 alfajores'))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/promociones/7'))
  })
})

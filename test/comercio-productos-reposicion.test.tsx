// Plazo de entrega y stock máximo propios del producto (0.96.0): dos campos del formulario, opt-in por prop
// (`conParametrosDeReposicion`), que se leen y se guardan aparte del producto (`/api/productos/{id}/reposicion`, ADR-020 del motor).
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import type { Producto } from '../src/comercio/tipos'
import { cuerpoDe, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const producto = (id: number, nombre: string, extra: Partial<Producto> = {}): Producto => ({
  id, codigo: `P${id}`, nombre, descripcion: '', precio_venta: 100, precio_costo: 60, unidad: 'u', categoria: '', stock_minimo: 0,
  estacion: '', vendible: 1, activo: 1, tipo: 'producto', ...extra,
})
const YERBA = producto(1, 'Yerba', { stock_minimo: 10 })
const RUTA = '/api/productos/1/reposicion'
const PROPIOS = { producto_id: 1, nombre: 'Yerba', plazo_entrega_dias: 7, stock_maximo: 40, stock_minimo: 10 }
const SIN_PROPIOS = { ...PROPIOS, plazo_entrega_dias: null, stock_maximo: null }
const base = { '/api/productos': [YERBA], '/api/productos/categorias': [] }

beforeEach(() => {
  cleanup()
  prepararFetch()
})

const dialogo = () => screen.getByRole('dialog')
const plazo = () => within(dialogo()).getByLabelText('Plazo de entrega (días)') as HTMLInputElement
const techo = () => within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement
async function editar(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Yerba')
  await user.click(screen.getAllByLabelText('Editar producto')[0])
  return dialogo()
}
const guardar = (user: ReturnType<typeof userEvent.setup>) => user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
const puts = () => pedidas().filter((p) => p === `PUT ${RUTA}`)

describe('Productos: plazo y stock máximo de reposición', () => {
  it('sin la prop no hay campos ni se pide nada de reposición (el formulario es el de siempre)', async () => {
    responder({ ...base, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await editar(user)
    expect(within(dialogo()).queryByLabelText('Plazo de entrega (días)')).toBeNull()
    await guardar(user)
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    expect(pedidas().some((p) => p.includes('/reposicion'))).toBe(false)
  })

  it('al editar lee los valores del producto y los muestra; sin tocarlos no manda nada de reposición', async () => {
    responder({ ...base, [`GET ${RUTA}`]: PROPIOS, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    expect(techo().value).toBe('40')
    await guardar(user)
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(puts()).toHaveLength(0)
  })

  it('un producto sin valores propios muestra los campos vacíos con su aclaración', async () => {
    responder({ ...base, [`GET ${RUTA}`]: SIN_PROPIOS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().disabled).toBe(false))
    expect(plazo().value).toBe('')
    expect(plazo().placeholder).toBe('general')
    expect(techo().placeholder).toBe('sin tope')
  })

  it('cambiar un valor guarda primero el producto y después los DOS valores completos; vaciar uno manda null', async () => {
    responder({ ...base, [`GET ${RUTA}`]: PROPIOS, 'PUT /api/productos/1': { id: 1 }, [`PUT ${RUTA}`]: SIN_PROPIOS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    fireEvent.change(plazo(), { target: { value: '12' } })
    fireEvent.change(techo(), { target: { value: '' } })
    await guardar(user)
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(pedidas().indexOf('PUT /api/productos/1')).toBeLessThan(pedidas().indexOf(`PUT ${RUTA}`))
    expect(cuerpoDe(`PUT ${RUTA}`)).toEqual({ plazo_entrega_dias: 12, stock_maximo: null })
  })

  it('el techo acepta coma decimal y se manda como número', async () => {
    responder({ ...base, [`GET ${RUTA}`]: SIN_PROPIOS, 'PUT /api/productos/1': { id: 1 }, [`PUT ${RUTA}`]: PROPIOS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(techo().disabled).toBe(false))
    fireEvent.change(techo(), { target: { value: '25,5' } })
    await guardar(user)
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(cuerpoDe(`PUT ${RUTA}`)).toEqual({ plazo_entrega_dias: null, stock_maximo: 25.5 })
  })

  it.each([
    ['plazo 0', '0', '', /entre 1 y 180/],
    ['plazo 181', '181', '', /entre 1 y 180/],
    ['plazo con decimales', '2.5', '', /entre 1 y 180/],
    ['plazo con texto', 'x', '', /entre 1 y 180/],
    ['techo 0', '', '0', /mayor que 0/],
    ['techo negativo', '', '-3', /mayor que 0/],
    ['techo con texto', '', 'mucho', /mayor que 0/],
    ['techo menor que el mínimo', '', '5', /no puede ser menor que el stock mínimo \(10\)/],
  ])('%s: se avisa y NO se escribe nada, ni siquiera el producto', async (_n, valorPlazo, valorTecho, mensaje) => {
    responder({ ...base, [`GET ${RUTA}`]: SIN_PROPIOS, 'PUT /api/productos/1': { id: 1 }, [`PUT ${RUTA}`]: PROPIOS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().disabled).toBe(false))
    fireEvent.change(plazo(), { target: { value: valorPlazo } })
    fireEvent.change(techo(), { target: { value: valorTecho } })
    await guardar(user)
    expect(await within(dialogo()).findByText(mensaje)).toBeTruthy()
    expect(pedidas().filter((p) => p.startsWith('PUT '))).toHaveLength(0)
  })

  it('si no se pudieron leer, se dice, no hay campos y no se manda nada de reposición', async () => {
    responder({ ...base, [`GET ${RUTA}`]: { status: 503, detail: 'Falta la revisión 0003' }, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    expect(await within(dialogo()).findByText(/No se pudieron leer el plazo ni el stock máximo/)).toBeTruthy()
    expect(within(dialogo()).queryByLabelText('Plazo de entrega (días)')).toBeNull()
    await guardar(user)
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    expect(puts()).toHaveLength(0)
  })

  it('si el producto se guarda pero falla el plazo/techo, lo dice, deja el diálogo abierto y no pierde lo escrito', async () => {
    responder({ ...base, [`GET ${RUTA}`]: SIN_PROPIOS, 'PUT /api/productos/1': { id: 1 }, [`PUT ${RUTA}`]: { status: 422, detail: 'techo inválido' } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().disabled).toBe(false))
    fireEvent.change(plazo(), { target: { value: '9' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(/El producto se guardó, pero no se pudieron guardar el plazo y el stock máximo/)).toBeTruthy()
    expect(plazo().value).toBe('9')
  })

  it('en el alta, si se cargan valores, se guardan con el id del producto creado', async () => {
    responder({ ...base, 'POST /api/productos': { id: 9 }, '/api/productos/9/reposicion': PROPIOS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Nuevo' } })
    fireEvent.change(plazo(), { target: { value: '4' } })
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/9/reposicion'))
    expect(cuerpoDe('PUT /api/productos/9/reposicion')).toEqual({ plazo_entrega_dias: 4, stock_maximo: null })
  })
})

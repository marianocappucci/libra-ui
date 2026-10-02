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
    ['techo tan grande que no es un número finito (iría como null y borraría el techo)', '', '9'.repeat(400), /mayor que 0/],
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
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yerba 2' } })   // también cambia el producto
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

  it('si el alta se guarda pero falla el plazo/techo, reintentar edita el producto creado y no crea otro', async () => {
    let intentos = 0
    responder({
      ...base, 'POST /api/productos': { id: 9, nombre: 'Nuevo' }, 'PUT /api/productos/9': { id: 9 },
      'PUT /api/productos/9/reposicion': () => (++intentos === 1 ? { status: 422, detail: 'techo inválido' } : PROPIOS),
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Nuevo' } })
    fireEvent.change(plazo(), { target: { value: '4' } })
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    expect(await within(dialogo()).findByText(/El producto se guardó, pero no se pudieron guardar/)).toBeTruthy()
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'PUT /api/productos/9/reposicion')).toHaveLength(2))
    expect(pedidas().filter((p) => p === 'POST /api/productos')).toHaveLength(1)
    expect(pedidas()).toContain('PUT /api/productos/9')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('la lectura lenta de un producto anterior no pisa los campos del que se abrió después', async () => {
    let soltarA: (v: unknown) => void = () => {}
    const lentaA = new Promise((r) => { soltarA = r })
    const OTRO = producto(2, 'Azúcar', { stock_minimo: 0 })
    const { fetchMock } = await import('./helpers-pantallas')
    responder({
      '/api/productos': [YERBA, OTRO], '/api/productos/categorias': [],
      'GET /api/productos/2/reposicion': { ...PROPIOS, producto_id: 2, plazo_entrega_dias: 21, stock_maximo: null },
    })
    const base_impl = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === RUTA && (init?.method ?? 'GET') === 'GET') {
        return lentaA.then((v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return base_impl(entrada, init)
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Azúcar')
    await user.click(screen.getAllByLabelText('Editar producto')[0])      // Yerba: su lectura queda colgada
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getAllByLabelText('Editar producto')[1])      // Azúcar
    await waitFor(() => expect(plazo().value).toBe('21'))
    soltarA({ ...PROPIOS, plazo_entrega_dias: 7, stock_maximo: 40 })      // llega tarde la de Yerba
    await new Promise((r) => setTimeout(r, 50))
    expect(plazo().value).toBe('21')
    expect(techo().value).toBe('')
  })

  it('no se puede guardar mientras se leen el plazo y el techo (sin verlos no se valida el mínimo contra el máximo)', async () => {
    let soltar: (v: unknown) => void = () => {}
    const lenta = new Promise((r) => { soltar = r })
    const { fetchMock } = await import('./helpers-pantallas')
    responder({ ...base, 'PUT /api/productos/1': { id: 1 } })
    const sin_lectura = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === RUTA && (init?.method ?? 'GET') === 'GET') {
        return lenta.then((v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return sin_lectura(entrada, init)
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    const boton = within(dialogo()).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    fireEvent.submit(boton.closest('form')!)
    await new Promise((r) => setTimeout(r, 30))
    expect(pedidas().filter((p) => p.startsWith('PUT '))).toHaveLength(0)
    soltar(PROPIOS)
    await waitFor(() => expect(boton.disabled).toBe(false))
    expect(plazo().value).toBe('7')
  })

  it('si sólo se cambió el plazo o el techo, el producto NO se vuelve a guardar (quien decide la reposición puede no poder editarlo)', async () => {
    responder({
      ...base, [`GET ${RUTA}`]: PROPIOS, [`PUT ${RUTA}`]: PROPIOS,
      'PUT /api/productos/1': { status: 403, detail: 'forbidden' },    // el rol no puede editar el producto
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    fireEvent.change(plazo(), { target: { value: '9' } })
    await guardar(user)
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(cuerpoDe(`PUT ${RUTA}`)).toEqual({ plazo_entrega_dias: 9, stock_maximo: 40 })
    expect(pedidas()).not.toContain('PUT /api/productos/1')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('si además se cambió algo del producto, se guarda el producto primero (y si eso falla no se manda el plazo/techo)', async () => {
    responder({
      ...base, [`GET ${RUTA}`]: PROPIOS, [`PUT ${RUTA}`]: PROPIOS,
      'PUT /api/productos/1': { status: 403, detail: 'forbidden' },
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yerba 2' } })
    fireEvent.change(plazo(), { target: { value: '9' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(/forbidden/)).toBeTruthy()
    expect(pedidas()).toContain('PUT /api/productos/1')
    expect(puts()).toHaveLength(0)
  })

  it('sin cambiar nada de reposición, un guardado sin cambios sigue guardando el producto como siempre', async () => {
    responder({ ...base, [`GET ${RUTA}`]: PROPIOS, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    await guardar(user)
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    expect(puts()).toHaveLength(0)
  })

  it('si sólo cambió el plazo/techo y eso falla, el error es el de la reposición (no dice que el producto se guardó)', async () => {
    responder({ ...base, [`GET ${RUTA}`]: PROPIOS, [`PUT ${RUTA}`]: { status: 422, detail: 'techo inválido' }, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    fireEvent.change(plazo(), { target: { value: '9' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(/techo inválido/)).toBeTruthy()
    expect(within(dialogo()).queryByText(/El producto se guardó/)).toBeNull()
    expect(pedidas()).not.toContain('PUT /api/productos/1')
  })
})

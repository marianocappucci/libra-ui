// Plazo de entrega y stock máximo propios del producto (0.96.0): dos campos del formulario, opt-in por prop
// (`conParametrosDeReposicion`), que se leen y se guardan aparte del producto (`/api/productos/{id}/reposicion`, ADR-020 del motor).
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import type { Producto } from '../src/comercio/tipos'
import { cuerpoDe, fetchMock, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

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

  it('si el producto se guardó y falla el plazo/techo, deshacer el cambio del producto y reintentar vuelve a guardarlo (no queda el primer cambio)', async () => {
    let intentos = 0
    responder({
      ...base, [`GET ${RUTA}`]: PROPIOS, 'PUT /api/productos/1': { id: 1 },
      [`PUT ${RUTA}`]: () => (++intentos === 1 ? { status: 422, detail: 'techo inválido' } : PROPIOS),
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yerba 2' } })
    fireEvent.change(plazo(), { target: { value: '9' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(/El producto se guardó, pero/)).toBeTruthy()
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yerba' } })   // vuelve al nombre original
    await guardar(user)
    await waitFor(() => expect(puts()).toHaveLength(2))
    const guardados = fetchMock.mock.calls.filter((c) => c[1] && (c[1] as RequestInit).method === 'PUT' && String(c[0]) === '/api/productos/1')
    expect(guardados).toHaveLength(2)
    expect(JSON.parse(String((guardados[1][1] as RequestInit).body)).nombre).toBe('Yerba')
  })

  it('un rol sin costos.ver (el producto llega SIN precio_costo) igual puede guardar el plazo y el techo', async () => {
    const { precio_costo: _costo, ...sinCosto } = YERBA
    responder({
      '/api/productos': [sinCosto], '/api/productos/categorias': [], [`GET ${RUTA}`]: PROPIOS, [`PUT ${RUTA}`]: PROPIOS,
      'PUT /api/productos/1': { status: 403, detail: 'forbidden' },
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    fireEvent.change(techo(), { target: { value: '45' } })
    await guardar(user)
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(cuerpoDe(`PUT ${RUTA}`)).toEqual({ plazo_entrega_dias: 7, stock_maximo: 45 })
    expect(pedidas()).not.toContain('PUT /api/productos/1')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('sin ver el costo, si además se cambia algo del producto NO se guarda nada (el 0 de relleno pisaría el costo real)', async () => {
    const { precio_costo: _costo, ...sinCosto } = YERBA
    responder({
      '/api/productos': [sinCosto], '/api/productos/categorias': [], [`GET ${RUTA}`]: PROPIOS, [`PUT ${RUTA}`]: PROPIOS,
      'PUT /api/productos/1': { id: 1 },
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yerba 2' } })
    fireEvent.change(techo(), { target: { value: '45' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(/no ve el costo de este producto/)).toBeTruthy()
    expect(pedidas().filter((p) => p.startsWith('PUT '))).toHaveLength(0)
  })

  it('sin precio_costo en los productos no hay columna «Precio costo» ni «NaN», y el formulario no ofrece el costo ni el margen', async () => {
    const { precio_costo: _costo, ...sinCosto } = YERBA
    responder({ '/api/productos': [sinCosto], '/api/productos/categorias': [], [`GET ${RUTA}`]: PROPIOS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    expect(screen.queryByText('Precio costo')).toBeNull()
    expect(document.body.textContent).not.toMatch(/NaN/)
    expect(screen.getByText('Precio venta')).toBeTruthy()
    await user.click(screen.getAllByLabelText('Editar producto')[0])
    expect(within(dialogo()).queryByLabelText('Precio de costo')).toBeNull()
    expect(within(dialogo()).getByLabelText('Precio de venta')).toBeTruthy()
    expect(within(dialogo()).queryByText(/Margen/)).toBeNull()
  })

  it('con costo, la columna y el campo siguen estando (el cambio es sólo para quien no lo recibe)', async () => {
    responder({ ...base, [`GET ${RUTA}`]: PROPIOS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    expect(screen.getByText('Precio costo')).toBeTruthy()
    await user.click(screen.getAllByLabelText('Editar producto')[0])
    expect(within(dialogo()).getByLabelText('Precio de costo')).toBeTruthy()
    expect(within(dialogo()).getByText(/Margen/)).toBeTruthy()
  })

  // ── Proveedor habitual (motor >= 0.33.0, ADR-021) ──
  const LISTA = [{ id: 7, nombre: 'Distribuidora Norte' }, { id: 8, nombre: 'Mayorista Sur' }]
  const CON_PROV = { ...PROPIOS, proveedor_id: 7, proveedor: 'Distribuidora Norte' }
  const selectorProveedor = () => within(dialogo()).getByLabelText('Proveedor habitual') as HTMLSelectElement

  it('con un motor que no devuelve proveedor_id no hay selector de proveedor', async () => {
    responder({ ...base, [`GET ${RUTA}`]: PROPIOS, '/api/proveedores': LISTA })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    expect(within(dialogo()).queryByLabelText('Proveedor habitual')).toBeNull()
  })

  it('con proveedor_id muestra el proveedor del producto; sin tocarlo NO viaja en el cuerpo (el motor lo deja como estaba)', async () => {
    responder({ ...base, [`GET ${RUTA}`]: CON_PROV, [`PUT ${RUTA}`]: CON_PROV, '/api/proveedores': LISTA, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(selectorProveedor().value).toBe('7'))
    fireEvent.change(plazo(), { target: { value: '9' } })
    await guardar(user)
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(cuerpoDe(`PUT ${RUTA}`)).toEqual({ plazo_entrega_dias: 9, stock_maximo: 40 })
    expect('proveedor_id' in cuerpoDe(`PUT ${RUTA}`)).toBe(false)
  })

  it('cambiar sólo el proveedor guarda la reposición (no el producto) con proveedor_id; «Sin proveedor» manda null', async () => {
    responder({ ...base, [`GET ${RUTA}`]: CON_PROV, [`PUT ${RUTA}`]: CON_PROV, '/api/proveedores': LISTA, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(selectorProveedor().value).toBe('7'))
    await user.selectOptions(selectorProveedor(), '8')
    await guardar(user)
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(cuerpoDe(`PUT ${RUTA}`)).toEqual({ plazo_entrega_dias: 7, stock_maximo: 40, proveedor_id: 8 })
    expect(pedidas()).not.toContain('PUT /api/productos/1')
  })

  it('«Sin proveedor» borra el habitual: viaja proveedor_id: null', async () => {
    responder({ ...base, [`GET ${RUTA}`]: CON_PROV, [`PUT ${RUTA}`]: PROPIOS, '/api/proveedores': LISTA })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(selectorProveedor().value).toBe('7'))
    await user.selectOptions(selectorProveedor(), '__sin__')
    await guardar(user)
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(cuerpoDe(`PUT ${RUTA}`)).toMatchObject({ proveedor_id: null })
  })

  it('un proveedor que no está en la lista (dado de baja, o sin permiso para listar) igual se ve con su nombre', async () => {
    responder({ ...base, [`GET ${RUTA}`]: CON_PROV, '/api/proveedores': { status: 403, detail: 'forbidden' } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect(selectorProveedor().value).toBe('7'))
    expect(within(selectorProveedor()).getByRole('option', { name: 'Distribuidora Norte' })).toBeTruthy()
  })

  it('en el alta el selector de proveedor está desde el primer momento (el motor se sondea con el primer producto) y el proveedor viaja con el id creado', async () => {
    responder({
      ...base, [`GET ${RUTA}`]: CON_PROV, 'POST /api/productos': { id: 9 }, 'PUT /api/productos/9/reposicion': CON_PROV, '/api/proveedores': LISTA,
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await waitFor(() => expect(pedidas()).toContain(`GET ${RUTA}`))          // el sondeo
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Nuevo' } })
    await user.selectOptions(selectorProveedor(), '8')
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/9/reposicion'))
    expect(cuerpoDe('PUT /api/productos/9/reposicion')).toEqual({ plazo_entrega_dias: null, stock_maximo: null, proveedor_id: 8 })
  })

  it('conProveedorHabitual fuerza el selector en el alta aunque el catálogo esté vacío, y false lo apaga aunque el motor lo maneje', async () => {
    responder({ '/api/productos': [], '/api/productos/categorias': [], '/api/proveedores': LISTA })
    const user = userEvent.setup()
    const { unmount } = montar('/productos', <Productos conParametrosDeReposicion conProveedorHabitual />)
    await user.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    expect(selectorProveedor()).toBeTruthy()
    unmount()
    cleanup()
    prepararFetch()
    responder({ ...base, [`GET ${RUTA}`]: CON_PROV, '/api/proveedores': LISTA })
    montar('/productos', <Productos conParametrosDeReposicion conProveedorHabitual={false} />)
    await editar(user)
    await waitFor(() => expect(plazo().value).toBe('7'))
    expect(within(dialogo()).queryByLabelText('Proveedor habitual')).toBeNull()
  })

  it('si el sondeo del motor termina con el diálogo del alta ya abierto, el selector de proveedor aparece en ese mismo diálogo', async () => {
    let soltar: (v: unknown) => void = () => {}
    const lenta = new Promise((r) => { soltar = r })
    responder({ ...base, '/api/proveedores': LISTA })
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === RUTA && (init?.method ?? 'GET') === 'GET') {
        return lenta.then((v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return original(entrada, init)
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    expect(within(dialogo()).queryByLabelText('Proveedor habitual')).toBeNull()      // el sondeo todavía no contestó
    soltar(CON_PROV)
    await waitFor(() => expect(selectorProveedor()).toBeTruthy())
  })

  it('con el sondeo tardío, un alta cuyo plazo/techo falla conserva el proveedor elegido al reintentar', async () => {
    let soltar: (v: unknown) => void = () => {}
    const lenta = new Promise((r) => { soltar = r })
    let intentos = 0
    responder({
      ...base, '/api/proveedores': LISTA, 'POST /api/productos': { id: 9, nombre: 'Nuevo' }, 'PUT /api/productos/9': { id: 9 },
      'PUT /api/productos/9/reposicion': () => (++intentos === 1 ? { status: 422, detail: 'techo inválido' } : CON_PROV),
    })
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === RUTA && (init?.method ?? 'GET') === 'GET') {
        return lenta.then((v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return original(entrada, init)
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    soltar(CON_PROV)                                                          // el sondeo termina con el diálogo abierto
    await waitFor(() => expect(selectorProveedor()).toBeTruthy())
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Nuevo' } })
    await user.selectOptions(selectorProveedor(), '8')
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    expect(await within(dialogo()).findByText(/El producto se guardó, pero/)).toBeTruthy()
    expect(selectorProveedor().value).toBe('8')                               // el selector sigue ahí, con lo elegido
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'PUT /api/productos/9/reposicion')).toHaveLength(2))
    const envios = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT' && String(c[0]) === '/api/productos/9/reposicion')
    expect(JSON.parse(String((envios[1][1] as RequestInit).body)).proveedor_id).toBe(8)
  })

  it('si la prop llega después del montaje (la sesión se carga de forma asíncrona), los proveedores se cargan igual y el selector aparece', async () => {
    responder({ ...base, [`GET ${RUTA}`]: CON_PROV, '/api/proveedores': LISTA })
    function Tardia() {
      const [activa, setActiva] = useState(false)
      useEffect(() => { const t = setTimeout(() => setActiva(true), 30); return () => clearTimeout(t) }, [])
      return <Productos conParametrosDeReposicion={activa} />
    }
    const user = userEvent.setup()
    montar('/productos', <Tardia />)
    await screen.findByText('Yerba')
    await waitFor(() => expect(pedidas()).toContain('GET /api/proveedores'))
    await waitFor(() => expect(pedidas()).toContain(`GET ${RUTA}`))          // el sondeo también corre
    await editar(user)
    await waitFor(() => expect(selectorProveedor().value).toBe('7'))
    expect(within(selectorProveedor()).getByRole('option', { name: 'Mayorista Sur' })).toBeTruthy()      // la lista completa, no sólo el actual
  })

  it('una búsqueda que vacía la lista mientras el sondeo está pendiente no lo cancela: el selector del alta aparece igual', async () => {
    let soltar: (v: unknown) => void = () => {}
    const lenta = new Promise((r) => { soltar = r })
    responder({ ...base, '/api/proveedores': LISTA })
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entrada)
      if (url === RUTA && (init?.method ?? 'GET') === 'GET') {
        return lenta.then((v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      if (url.startsWith('/api/productos?q=')) return Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
      return original(entrada, init)
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await user.type(screen.getByPlaceholderText(/Buscar/), 'nada{Enter}')       // la lista queda vacía con el sondeo pendiente
    await waitFor(() => expect(screen.queryByText('Yerba')).toBeNull())
    soltar(CON_PROV)
    await new Promise((r) => setTimeout(r, 30))
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    await waitFor(() => expect(selectorProveedor()).toBeTruthy())
  })

  it('un sondeo que falló se reintenta con la próxima lista y el selector del alta aparece', async () => {
    let intentos = 0
    responder({
      ...base, '/api/proveedores': LISTA,
      [`GET ${RUTA}`]: () => (++intentos === 1 ? { status: 500, detail: 'caído' } : CON_PROV),
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await waitFor(() => expect(intentos).toBe(1))
    await user.type(screen.getByPlaceholderText(/Buscar/), 'Yer{Enter}')            // recarga la lista
    await waitFor(() => expect(intentos).toBe(2))
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    await waitFor(() => expect(selectorProveedor()).toBeTruthy())
  })

  it('si la lista cambia mientras el sondeo está en vuelo y éste falla, se reintenta con la lista actual', async () => {
    let intentos = 0
    let soltarPrimero: () => void = () => {}
    const primero = new Promise<void>((r) => { soltarPrimero = r })
    responder({ ...base, '/api/proveedores': LISTA })
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === RUTA && (init?.method ?? 'GET') === 'GET') {
        intentos += 1
        if (intentos === 1) return primero.then(() => new Response(JSON.stringify({ detail: 'caído' }), { status: 500, headers: { 'content-type': 'application/json' } }))
        return Promise.resolve(new Response(JSON.stringify(CON_PROV), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return original(entrada, init)
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await waitFor(() => expect(intentos).toBe(1))
    await user.type(screen.getByPlaceholderText(/Buscar/), 'Yer{Enter}')            // llega otra lista con el primero todavía en vuelo
    await new Promise((r) => setTimeout(r, 30))
    soltarPrimero()                                                                    // y el primero falla
    await waitFor(() => expect(intentos).toBe(2))
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    await waitFor(() => expect(selectorProveedor()).toBeTruthy())
  })

  it('un sondeo que falla no se reintenta de inmediato ni en ráfaga: espera a la próxima lista', async () => {
    let intentos = 0
    responder({ ...base, '/api/proveedores': LISTA, [`GET ${RUTA}`]: () => { intentos += 1; return { status: 500, detail: 'caído' } } })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await waitFor(() => expect(intentos).toBe(1))
    await new Promise((r) => setTimeout(r, 200))
    expect(intentos).toBe(1)
  })
})

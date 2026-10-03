// Mínimo por sucursal (0.108.0, ADR-010; motor: ADR-024 de libracommerce): una sección «Mínimo por sucursal» en el formulario de reposición del producto, con la misma prop que el plazo y el
// techo (`conParametrosDeReposicion`). Se lee de `GET /api/productos/{id}/reposicion/minimos` y se guarda con un `PUT .../minimos/{sucursal_id}` por sucursal
// que cambió (`{ stock_minimo: número | null }`; `null` borra el propio y vuelve al global). Un campo vacío es `null`, nunca 0.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import type { Producto } from '../src/comercio/tipos'
import { cuerpoDe, fetchMock, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const producto = (id: number, nombre: string, extra: Partial<Producto> = {}): Producto => ({
  id, codigo: `P${id}`, nombre, descripcion: '', precio_venta: 100, precio_costo: 60, unidad: 'u', categoria: '', stock_minimo: 0,
  estacion: '', vendible: 1, activo: 1, tipo: 'producto', ...extra,
})
const YERBA = producto(1, 'Yerba', { stock_minimo: 10 })
const RUTA = '/api/productos/1/reposicion'
const MINIMOS = `${RUTA}/minimos`
const PARAMETROS = { producto_id: 1, nombre: 'Yerba', plazo_entrega_dias: 7, stock_maximo: 40, stock_minimo: 10 }
// La forma REAL del motor: `stock_minimo` es el EFECTIVO (el propio o, sin él, el global) y `stock_minimo_propio` dice cuál es. Centro tiene un mínimo propio (4);
// Norte usa el global (10): su `stock_minimo` vale 10 y NO es un valor propio.
const LEIDOS = {
  producto_id: 1,
  sucursales: [
    { sucursal_id: 1, sucursal: 'Centro', stock_minimo: 4, stock_minimo_propio: true, stock_minimo_global: 10 },
    { sucursal_id: 2, sucursal: 'Norte', stock_minimo: 10, stock_minimo_propio: false, stock_minimo_global: 10 },
  ],
}
const base = { '/api/productos': [YERBA], '/api/productos/categorias': [], [`GET ${RUTA}`]: PARAMETROS, [`GET ${MINIMOS}`]: LEIDOS }

beforeEach(() => {
  cleanup()
  prepararFetch()
})

const dialogo = () => screen.getByRole('dialog')
const centro = () => within(dialogo()).getByLabelText('Mínimo en Centro') as HTMLInputElement
const norte = () => within(dialogo()).getByLabelText('Mínimo en Norte') as HTMLInputElement
async function editar(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Yerba')
  await user.click(screen.getAllByLabelText('Editar producto')[0])
  return dialogo()
}
const guardar = (user: ReturnType<typeof userEvent.setup>) => user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
const putsDeMinimos = () => pedidas().filter((p) => p.startsWith(`PUT ${MINIMOS}/`))
const escrituras = () => pedidas().filter((p) => p.startsWith('PUT ') || p.startsWith('POST '))

describe('Productos: mínimo por sucursal', () => {
  it('sin la prop no se pide nada de mínimos ni hay sección', async () => {
    responder({ ...base, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await editar(user)
    expect(within(dialogo()).queryByText('Mínimo por sucursal')).toBeNull()
    expect(pedidas().some((p) => p.includes('/minimos'))).toBe(false)
  })

  it('al editar lee los mínimos: una fila por sucursal, el propio en su campo y el global como ayuda', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    expect(await within(dialogo()).findByText('Mínimo por sucursal')).toBeTruthy()
    expect(centro().value).toBe('4')
    expect(norte().value).toBe('')
    expect(norte().placeholder).toBe('global: 10')
    expect(within(dialogo()).getByText(/Vacío = usa el global: 10/)).toBeTruthy()
  })

  it('una sucursal con `stock_minimo_propio: false` (su `stock_minimo` efectivo es el global) NO se muestra como propia y no genera ningún PUT si no se toca', async () => {
    responder({ ...base, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    expect(norte().value).toBe('')   // no «10»: ese 10 es el global, no un valor de Norte
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(putsDeMinimos()).toHaveLength(0)
    // Borrar el campo de una sucursal que ya estaba vacía tampoco es un cambio (no manda null).
    cleanup()
    prepararFetch()
    responder({ ...base, 'PUT /api/productos/1': { id: 1 } })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(norte(), { target: { value: '5' } })
    fireEvent.change(norte(), { target: { value: '' } })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(putsDeMinimos()).toHaveLength(0)
  })

  it('el global de la ayuda sigue al «Stock mínimo» del formulario mientras se escribe', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(within(dialogo()).getByLabelText('Stock mínimo'), { target: { value: '12' } })
    expect(norte().placeholder).toBe('global: 12')
    // Sin un número en el campo, vale el que leyó el motor (no un 0 inventado).
    fireEvent.change(within(dialogo()).getByLabelText('Stock mínimo'), { target: { value: '' } })
    expect(norte().placeholder).toBe('global: 10')
  })

  it('sin tocar nada no se manda ningún mínimo', async () => {
    responder({ ...base, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(putsDeMinimos()).toHaveLength(0)
  })

  it('cambiar un mínimo manda un PUT sólo para esa sucursal, con el número, y NO vuelve a guardar el producto', async () => {
    responder({ ...base, [`PUT ${MINIMOS}/2`]: {}, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(norte(), { target: { value: '6,5' } })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(putsDeMinimos()).toEqual([`PUT ${MINIMOS}/2`])
    expect(cuerpoDe(`PUT ${MINIMOS}/2`)).toEqual({ stock_minimo: 6.5 })
    expect(pedidas()).not.toContain('PUT /api/productos/1')
    expect(pedidas()).not.toContain(`PUT ${RUTA}`)
  })

  it('vaciar un mínimo propio manda null (no 0) y vuelve al global', async () => {
    responder({ ...base, [`PUT ${MINIMOS}/1`]: {} })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(centro(), { target: { value: '  ' } })
    await guardar(user)
    await waitFor(() => expect(putsDeMinimos()).toHaveLength(1))
    expect(cuerpoDe(`PUT ${MINIMOS}/1`)).toEqual({ stock_minimo: null })
    expect(JSON.stringify(cuerpoDe(`PUT ${MINIMOS}/1`))).not.toContain('NaN')
  })

  it('un 0 escrito es un mínimo propio de 0 (distinto de vacío); cambiar dos sucursales manda dos PUT', async () => {
    responder({ ...base, [`PUT ${MINIMOS}/1`]: {}, [`PUT ${MINIMOS}/2`]: {} })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(centro(), { target: { value: '0' } })
    fireEvent.change(norte(), { target: { value: '3' } })
    await guardar(user)
    await waitFor(() => expect(putsDeMinimos()).toHaveLength(2))
    expect(cuerpoDe(`PUT ${MINIMOS}/1`)).toEqual({ stock_minimo: 0 })
    expect(cuerpoDe(`PUT ${MINIMOS}/2`)).toEqual({ stock_minimo: 3 })
  })

  it('escribir el mismo valor que ya tenía no cuenta como cambio', async () => {
    responder({ ...base, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(centro(), { target: { value: '4,0' } })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Sin cambios de reposición el guardado es el de siempre (el producto); de mínimos no se manda nada.
    expect(putsDeMinimos()).toHaveLength(0)
  })

  it.each([
    ['con texto', 'mucho'],
    ['negativo', '-1'],
    ['con dos puntos', '1.2.3'],
    ['tan grande que no es un número finito (iría como null y borraría el mínimo)', '9'.repeat(400)],
    ['en notación científica', '1e3'],
  ])('un mínimo %s se avisa con el nombre de la sucursal y NO se escribe nada, ni el producto', async (_n, valor) => {
    responder({ ...base, 'PUT /api/productos/1': { id: 1 }, [`PUT ${MINIMOS}/1`]: {}, [`PUT ${MINIMOS}/2`]: {} })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yerba 2' } })
    fireEvent.change(centro(), { target: { value: '5' } })
    fireEvent.change(norte(), { target: { value: valor } })
    await guardar(user)
    expect(await within(dialogo()).findByText(/El mínimo de «Norte» tiene que ser un número mayor o igual que 0/)).toBeTruthy()
    expect(escrituras()).toHaveLength(0)
  })

  it('si el PUT de una sucursal falla se dice cuál, y el reintento sólo manda las que faltan', async () => {
    responder({ ...base, [`PUT ${MINIMOS}/1`]: {}, [`PUT ${MINIMOS}/2`]: { status: 422, detail: 'mínimo inválido' } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(centro(), { target: { value: '5' } })
    fireEvent.change(norte(), { target: { value: '8' } })
    await guardar(user)
    expect(await within(dialogo()).findByText('No se pudo guardar el mínimo de «Norte»: mínimo inválido')).toBeTruthy()
    expect(putsDeMinimos()).toEqual([`PUT ${MINIMOS}/1`, `PUT ${MINIMOS}/2`])
    // No dice que el producto se guardó: no se tocó. Lo escrito sigue en los campos.
    expect(within(dialogo()).queryByText(/El producto se guardó/)).toBeNull()
    expect(centro().value).toBe('5')
    expect(norte().value).toBe('8')

    responder({ ...base, [`PUT ${MINIMOS}/2`]: {} })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(putsDeMinimos()).toEqual([`PUT ${MINIMOS}/1`, `PUT ${MINIMOS}/2`, `PUT ${MINIMOS}/2`])
  })

  it('si el motor rechaza un mínimo igual (el techo cambió desde otra sesión), el 422 se muestra tal cual, con el nombre de la sucursal', async () => {
    const detail = 'stock_minimo (30) no puede ser mayor que el stock máximo de reposición del producto (25)'
    responder({ ...base, [`PUT ${MINIMOS}/2`]: { status: 422, detail } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(norte(), { target: { value: '30' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(`No se pudo guardar el mínimo de «Norte»: ${detail}`)).toBeTruthy()
  })

  it('si bajar el techo choca con un mínimo por sucursal, el error del motor sobre el producto/reposición se muestra tal cual', async () => {
    const detail = 'stock_maximo (8) no puede ser menor que un stock mínimo por sucursal del producto (10)'
    responder({ ...base, [`PUT ${RUTA}`]: { status: 422, detail } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    fireEvent.change(within(dialogo()).getByLabelText('Stock máximo'), { target: { value: '12' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(detail)).toBeTruthy()
  })

  it('bajar el techo y los mínimos a la vez escribe primero los mínimos (el techo nuevo chocaría con los viejos); subirlo, primero el techo', async () => {
    const user = userEvent.setup()
    responder({ ...base, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/1`]: {} })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    fireEvent.change(within(dialogo()).getByLabelText('Stock máximo'), { target: { value: '30' } })
    fireEvent.change(centro(), { target: { value: '2' } })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(pedidas().indexOf(`PUT ${MINIMOS}/1`)).toBeGreaterThan(-1)
    expect(pedidas().indexOf(`PUT ${MINIMOS}/1`)).toBeLessThan(pedidas().indexOf(`PUT ${RUTA}`))

    cleanup()
    prepararFetch()
    responder({ ...base, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/1`]: {} })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    fireEvent.change(within(dialogo()).getByLabelText('Stock máximo'), { target: { value: '60' } })
    fireEvent.change(centro(), { target: { value: '50' } })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(pedidas().indexOf(`PUT ${RUTA}`)).toBeLessThan(pedidas().indexOf(`PUT ${MINIMOS}/1`))
  })

  it('un mínimo mayor que el techo FINAL se rechaza antes de escribir nada: ni siquiera se guarda la sucursal anterior que estaba bien', async () => {
    responder({ ...base, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/1`]: {}, [`PUT ${MINIMOS}/2`]: {} })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    fireEvent.change(centro(), { target: { value: '5' } })
    fireEvent.change(norte(), { target: { value: '50' } })   // el techo vigente es 40
    await guardar(user)
    expect(await within(dialogo()).findByText('El mínimo de «Norte» (50) no puede ser mayor que el stock máximo (40).')).toBeTruthy()
    expect(escrituras()).toHaveLength(0)
  })

  it('el techo que cuenta es el que quedaría tras el guardado: si en el mismo guardado se sube, el mínimo mayor que el viejo es válido; si se baja, el que lo pasa no', async () => {
    const user = userEvent.setup()
    responder({ ...base, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/2`]: {} })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    fireEvent.change(within(dialogo()).getByLabelText('Stock máximo'), { target: { value: '60' } })
    fireEvent.change(norte(), { target: { value: '50' } })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(cuerpoDe(`PUT ${MINIMOS}/2`)).toEqual({ stock_minimo: 50 })

    cleanup()
    prepararFetch()
    responder({ ...base, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/2`]: {} })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    fireEvent.change(within(dialogo()).getByLabelText('Stock máximo'), { target: { value: '20' } })
    fireEvent.change(norte(), { target: { value: '30' } })
    await guardar(user)
    expect(await within(dialogo()).findByText('El mínimo de «Norte» (30) no puede ser mayor que el stock máximo (20).')).toBeTruthy()
    expect(escrituras()).toHaveLength(0)
  })

  it('el tope del motor (1.000.000.000) se valida en el cliente, en cualquier fila, antes de escribir nada', async () => {
    responder({ ...base, [`PUT ${MINIMOS}/1`]: {}, [`PUT ${MINIMOS}/2`]: {}, [`GET ${RUTA}`]: { ...PARAMETROS, stock_maximo: null } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe(''))
    fireEvent.change(centro(), { target: { value: '5' } })
    fireEvent.change(norte(), { target: { value: '1000000001' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(/El mínimo de «Norte» no puede pasar de 1\.000\.000\.000/)).toBeTruthy()
    expect(escrituras()).toHaveLength(0)
    // Justo en el tope sí se guarda.
    fireEvent.change(norte(), { target: { value: '1000000000' } })
    await guardar(user)
    await waitFor(() => expect(putsDeMinimos()).toHaveLength(2))
    expect(cuerpoDe(`PUT ${MINIMOS}/2`)).toEqual({ stock_minimo: 1000000000 })
  })

  it('no se puede guardar mientras se leen los mínimos: bajar el techo por debajo de un mínimo propio que todavía no llegó no escribe nada', async () => {
    let soltar: (v: unknown) => void = () => {}
    const lenta = new Promise((r) => { soltar = r })
    responder({ ...base, 'PUT /api/productos/1': { id: 1 }, [`PUT ${RUTA}`]: PARAMETROS })
    const normal = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === MINIMOS && (init?.method ?? 'GET') === 'GET') {
        return lenta.then((v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return normal(entrada, init)
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    // La reposición ya llegó (techo 40); los mínimos no.
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    const boton = within(dialogo()).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    fireEvent.change(within(dialogo()).getByLabelText('Stock máximo'), { target: { value: '12' } })
    fireEvent.submit(boton.closest('form')!)
    await new Promise((r) => setTimeout(r, 30))
    expect(escrituras()).toHaveLength(0)
    soltar({ producto_id: 1, sucursales: [{ ...LEIDOS.sucursales[0], stock_minimo: 30 }, LEIDOS.sucursales[1]] })
    await waitFor(() => expect(boton.disabled).toBe(false))
    expect(centro().value).toBe('30')
    // Ya con los mínimos a la vista, la validación del cliente corta antes de escribir.
    await guardar(user)
    expect(await within(dialogo()).findByText('El mínimo de «Centro» (30) no puede ser mayor que el stock máximo (12).')).toBeTruthy()
    expect(escrituras()).toHaveLength(0)
  })

  it('un mínimo propio muy chico (1e-7) o enorme (1e21) se muestra como decimal, sin notación científica, y sin tocarlo no da error ni manda nada', async () => {
    const user = userEvent.setup()
    for (const [valor, texto] of [[1e-7, '0.0000001'], [1e21, '1000000000000000000000']] as const) {
      cleanup()
      prepararFetch()
      responder({
        ...base, [`GET ${RUTA}`]: { ...PARAMETROS, stock_maximo: null }, 'PUT /api/productos/1': { id: 1 },
        [`GET ${MINIMOS}`]: { ...LEIDOS, sucursales: [{ ...LEIDOS.sucursales[0], stock_minimo: valor }, LEIDOS.sucursales[1]] },
      })
      montar('/productos', <Productos conParametrosDeReposicion />)
      await editar(user)
      await within(dialogo()).findByText('Mínimo por sucursal')
      expect(centro().value).toBe(texto)
      await guardar(user)
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(putsDeMinimos()).toHaveLength(0)
    }
  })

  it('un mínimo propio que no cabe en un decimal (1e-21) se muestra tal cual, sin tocarlo NO se reescribe (ni como 0), y editado a 5 manda 5', async () => {
    const user = userEvent.setup()
    responder({
      ...base, [`GET ${RUTA}`]: { ...PARAMETROS, stock_maximo: null }, 'PUT /api/productos/1': { id: 1 }, [`PUT ${MINIMOS}/1`]: {},
      [`GET ${MINIMOS}`]: { ...LEIDOS, sucursales: [{ ...LEIDOS.sucursales[0], stock_minimo: 1e-21 }, LEIDOS.sucursales[1]] },
    })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    expect(Number(centro().value)).toBe(1e-21)   // no «0»
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(putsDeMinimos()).toHaveLength(0)

    await user.click(screen.getAllByLabelText('Editar producto')[0])
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(centro(), { target: { value: '5' } })
    await guardar(user)
    await waitFor(() => expect(putsDeMinimos()).toEqual([`PUT ${MINIMOS}/1`]))
    expect(cuerpoDe(`PUT ${MINIMOS}/1`)).toEqual({ stock_minimo: 5 })
  })

  it('el cambio es del TEXTO: aunque se edite y se vuelva al texto original no hay PUT;', async () => {
    const user = userEvent.setup()
    responder({ ...base, 'PUT /api/productos/1': { id: 1 }, [`PUT ${RUTA}`]: PARAMETROS })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(centro(), { target: { value: '9' } })
    fireEvent.change(centro(), { target: { value: '4' } })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(putsDeMinimos()).toHaveLength(0)
  })

  it('un mínimo propio de 1e-7 se puede cambiar y volver a escribir como decimal', async () => {
    responder({
      ...base, [`GET ${MINIMOS}`]: { ...LEIDOS, sucursales: [{ ...LEIDOS.sucursales[0], stock_minimo: 1e-7 }, LEIDOS.sucursales[1]] },
      [`PUT ${MINIMOS}/1`]: {},
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(centro(), { target: { value: '0.0000002' } })
    await guardar(user)
    await waitFor(() => expect(putsDeMinimos()).toHaveLength(1))
    expect(cuerpoDe(`PUT ${MINIMOS}/1`)).toEqual({ stock_minimo: 2e-7 })
  })

  describe('mientras se guarda', () => {
    const OTRO = producto(2, 'Azúcar', { stock_minimo: 3 })
    const MINIMOS_OTRO = {
      producto_id: 2, sucursales: [
        { sucursal_id: 1, sucursal: 'Centro', stock_minimo: 1, stock_minimo_propio: true, stock_minimo_global: 3 },
        { sucursal_id: 2, sucursal: 'Norte', stock_minimo: 3, stock_minimo_propio: false, stock_minimo_global: 3 },
      ],
    }
    /** Un `fetch` donde el PUT de `ruta` queda colgado hasta que se llama a `soltar`. */
    function colgar(ruta: string, tabla: Record<string, unknown>) {
      responder(tabla)
      const normal = fetchMock.getMockImplementation()!
      let soltar: () => void = () => {}
      const espera = new Promise<void>((r) => { soltar = r })
      fetchMock.mockImplementation(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        if (String(entrada) === ruta && init?.method === 'PUT') {
          await espera
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
        }
        return normal(entrada, init)
      })
      return soltar
    }

    it('los campos de reposición y de mínimos quedan deshabilitados (lo escrito después no se perdería ni se compararía contra otra base)', async () => {
      const soltar = colgar(`${MINIMOS}/2`, { ...base })
      const user = userEvent.setup()
      montar('/productos', <Productos conParametrosDeReposicion />)
      await editar(user)
      await within(dialogo()).findByText('Mínimo por sucursal')
      fireEvent.change(norte(), { target: { value: '8' } })
      await guardar(user)
      await waitFor(() => expect(norte().disabled).toBe(true))
      expect(centro().disabled).toBe(true)
      expect((within(dialogo()).getByLabelText('Plazo de entrega (días)') as HTMLInputElement).disabled).toBe(true)
      expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).disabled).toBe(true)
      soltar()
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('si se cierra el diálogo y se abre otro producto mientras se guarda, la respuesta tardía no cierra ni pisa al nuevo (ni sus originales: guardarlo sin tocar no manda nada)', async () => {
      const soltar = colgar(`${MINIMOS}/2`, {
        ...base, '/api/productos': [YERBA, OTRO],
        '/api/productos/2/reposicion': { ...PARAMETROS, producto_id: 2 }, '/api/productos/2/reposicion/minimos': MINIMOS_OTRO,
        'PUT /api/productos/2': { id: 2 }, '/api/productos/2/reposicion/minimos/2': {},
      })
      const user = userEvent.setup()
      montar('/productos', <Productos conParametrosDeReposicion />)
      await screen.findByText('Yerba')
      await user.click(screen.getAllByLabelText('Editar producto')[0])
      await within(dialogo()).findByText('Mínimo por sucursal')
      fireEvent.change(norte(), { target: { value: '8' } })
      await guardar(user)                                               // el PUT de Norte (producto 1) queda colgado
      await waitFor(() => expect(norte().disabled).toBe(true))
      await user.click(within(dialogo()).getByRole('button', { name: /Cancelar/ }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await user.click(screen.getAllByLabelText('Editar producto')[1])
      await within(dialogo()).findByText('Mínimo por sucursal')
      expect(norte().value).toBe('')
      soltar()                                                          // llega la respuesta del guardado de Yerba
      await waitFor(() => expect(pedidas().filter((p) => p === 'GET /api/productos').length).toBeGreaterThan(1))
      await new Promise((r) => setTimeout(r, 30))
      expect(screen.queryByRole('dialog')).not.toBeNull()               // no cerró el diálogo de Azúcar
      expect(norte().value).toBe('')
      await guardar(user)
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(putsDeMinimos()).toEqual([`PUT ${MINIMOS}/2`])             // sólo el de Yerba: Azúcar no cambió nada
    })
  })

  it.each([
    ['cambiada de 4 a 10', '10', { stock_minimo: 10 }],
    ['vaciada (borrado del propio)', '', { stock_minimo: null }],
  ])('si una sucursal %s se guardó y otra falla, devolver la primera a su valor viejo y reintentar la vuelve a mandar (el servidor conserva lo nuevo)', async (_n, nuevo, cuerpoNuevo) => {
    responder({ ...base, [`PUT ${MINIMOS}/1`]: {}, [`PUT ${MINIMOS}/2`]: { status: 422, detail: 'mínimo inválido' } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(centro(), { target: { value: nuevo } })   // Centro: 4 -> nuevo (se guarda)
    fireEvent.change(norte(), { target: { value: '8' } })      // Norte falla con un 422
    await guardar(user)
    expect(await within(dialogo()).findByText('No se pudo guardar el mínimo de «Norte»: mínimo inválido')).toBeTruthy()
    expect(cuerpoDe(`PUT ${MINIMOS}/1`)).toEqual(cuerpoNuevo)

    fireEvent.change(centro(), { target: { value: '4' } })     // el usuario la devuelve al valor con el que se abrió el diálogo
    fireEvent.change(norte(), { target: { value: '' } })       // y deja de intentar Norte
    responder({ ...base, [`PUT ${MINIMOS}/1`]: {} })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(putsDeMinimos()).toEqual([`PUT ${MINIMOS}/1`, `PUT ${MINIMOS}/2`, `PUT ${MINIMOS}/1`])
    expect(cuerpoDe(`PUT ${MINIMOS}/1`, pedidas().lastIndexOf(`PUT ${MINIMOS}/1`))).toEqual({ stock_minimo: 4 })
  })

  it('si el producto sí se guardó y falla un mínimo, lo dice, deja el diálogo abierto y el reintento no vuelve a guardar el producto', async () => {
    responder({ ...base, 'PUT /api/productos/1': { id: 1 }, [`PUT ${MINIMOS}/2`]: { status: 500, detail: 'se cayó' } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yerba 2' } })
    fireEvent.change(norte(), { target: { value: '8' } })
    await guardar(user)
    expect(await within(dialogo()).findByText('El producto se guardó, pero no se pudo guardar el mínimo de «Norte»: se cayó')).toBeTruthy()
    expect(pedidas().filter((p) => p === 'PUT /api/productos/1')).toHaveLength(1)

    responder({ ...base, 'PUT /api/productos/1': { id: 1 }, [`PUT ${MINIMOS}/2`]: {} })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(pedidas().filter((p) => p === 'PUT /api/productos/1')).toHaveLength(1)
    expect(putsDeMinimos()).toHaveLength(2)
  })

  it('plazo/techo y mínimos se guardan juntos, y si falla un mínimo el reintento no repite el plazo/techo que ya quedó', async () => {
    responder({ ...base, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/2`]: { status: 500, detail: 'se cayó' } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Plazo de entrega (días)') as HTMLInputElement).value).toBe('7'))
    fireEvent.change(within(dialogo()).getByLabelText('Plazo de entrega (días)'), { target: { value: '9' } })
    fireEvent.change(norte(), { target: { value: '8' } })
    await guardar(user)
    expect(await within(dialogo()).findByText(/se pudo guardar el mínimo de «Norte»/)).toBeTruthy()
    expect(cuerpoDe(`PUT ${RUTA}`)).toEqual({ plazo_entrega_dias: 9, stock_maximo: 40 })

    responder({ ...base, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/2`]: {} })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(pedidas().filter((p) => p === `PUT ${RUTA}`)).toHaveLength(1)
  })

  it('con una sola sucursal (o ninguna) la sección no se muestra', async () => {
    const user = userEvent.setup()
    for (const sucursales of [[LEIDOS.sucursales[0]], []]) {
      cleanup()
      prepararFetch()
      responder({ ...base, [`GET ${MINIMOS}`]: { ...LEIDOS, sucursales } })
      montar('/productos', <Productos conParametrosDeReposicion />)
      await editar(user)
      await waitFor(() => expect((within(dialogo()).getByLabelText('Plazo de entrega (días)') as HTMLInputElement).value).toBe('7'))
      await waitFor(() => expect(pedidas()).toContain(`GET ${MINIMOS}`))
      expect(within(dialogo()).queryByText('Mínimo por sucursal')).toBeNull()
      expect(within(dialogo()).queryByLabelText(/Mínimo en/)).toBeNull()
    }
  })

  it('un motor sin la función (404) deja el formulario como siempre, sin aviso', async () => {
    responder({ ...base, [`GET ${MINIMOS}`]: { status: 404, detail: 'Not Found' }, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect((within(dialogo()).getByLabelText('Plazo de entrega (días)') as HTMLInputElement).value).toBe('7'))
    await waitFor(() => expect(pedidas()).toContain(`GET ${MINIMOS}`))
    expect(within(dialogo()).queryByText('Mínimo por sucursal')).toBeNull()
    expect(within(dialogo()).queryByText(/No se pudieron leer los mínimos/)).toBeNull()
  })

  it('un motor sin la migración de los mínimos (503) se trata como sin la función: sin sección y sin aviso', async () => {
    responder({ ...base, [`GET ${MINIMOS}`]: { status: 503, detail: 'Falta la revisión 0005' }, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await waitFor(() => expect((within(dialogo()).getByLabelText('Plazo de entrega (días)') as HTMLInputElement).value).toBe('7'))
    await waitFor(() => expect(pedidas()).toContain(`GET ${MINIMOS}`))
    expect(within(dialogo()).queryByText('Mínimo por sucursal')).toBeNull()
    expect(within(dialogo()).queryByText(/No se pudieron leer los mínimos/)).toBeNull()
  })

  it('si no se pudieron leer (otro error) se dice, no hay campos y no se manda nada de mínimos', async () => {
    responder({ ...base, [`GET ${MINIMOS}`]: { status: 500, detail: 'se cayó' }, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    expect(await within(dialogo()).findByText(/No se pudieron leer los mínimos por sucursal de este producto; no se van a modificar/)).toBeTruthy()
    expect(within(dialogo()).queryByLabelText(/Mínimo en/)).toBeNull()
    await guardar(user)
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    expect(putsDeMinimos()).toHaveLength(0)
  })

  it('acepta también la lista de sucursales sola; el global sale de las filas, y una fila sin id se descarta', async () => {
    responder({
      ...base,
      [`GET ${MINIMOS}`]: [
        { sucursal_id: 1, sucursal: 'Centro', stock_minimo: 4, stock_minimo_propio: true, stock_minimo_global: 9 },
        { sucursal_id: 2, sucursal: 'Norte', stock_minimo: 9, stock_minimo_propio: false, stock_minimo_global: 9 },
        { sucursal: 'sin id', stock_minimo: 1, stock_minimo_propio: true, stock_minimo_global: 9 },
      ],
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    expect(centro().value).toBe('4')
    expect(norte().value).toBe('')
    // Con el «Stock mínimo» del formulario vacío, el global es el que leyó el motor de las filas (9), no el 10 del producto.
    fireEvent.change(within(dialogo()).getByLabelText('Stock mínimo'), { target: { value: '' } })
    expect(norte().placeholder).toBe('global: 9')
    expect(within(dialogo()).queryByLabelText('Mínimo en sin id')).toBeNull()
  })

  it('el alta no ofrece mínimos por sucursal (todavía no hay producto) y no los pide', async () => {
    responder({ ...base, 'POST /api/productos': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    await within(dialogo()).findByLabelText('Plazo de entrega (días)')
    expect(within(dialogo()).queryByText('Mínimo por sucursal')).toBeNull()
    expect(pedidas().some((p) => p.includes('/minimos'))).toBe(false)
  })

  it('la lectura lenta de un producto anterior no pisa los mínimos del que se abrió después', async () => {
    const OTRO = producto(2, 'Azúcar', { stock_minimo: 3 })
    let soltar: (v: Response) => void = () => {}
    const lenta = new Promise<Response>((r) => { soltar = r })
    responder({
      '/api/productos': [YERBA, OTRO], '/api/productos/categorias': [],
      [`GET ${RUTA}`]: PARAMETROS, '/api/productos/2/reposicion': { ...PARAMETROS, producto_id: 2 },
      '/api/productos/2/reposicion/minimos': { producto_id: 2, sucursales: [
        { sucursal_id: 1, sucursal: 'Centro', stock_minimo: 1, stock_minimo_propio: true, stock_minimo_global: 3 },
        { sucursal_id: 2, sucursal: 'Norte', stock_minimo: 3, stock_minimo_propio: false, stock_minimo_global: 3 },
      ] },
    })
    const normal = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) =>
      String(entrada) === MINIMOS ? lenta : normal(entrada, init))
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await screen.findByText('Yerba')
    await user.click(screen.getAllByLabelText('Editar producto')[0])
    await user.click(within(dialogo()).getByRole('button', { name: /Cancelar/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getAllByLabelText('Editar producto')[1])
    await within(dialogo()).findByText('Mínimo por sucursal')
    expect(centro().value).toBe('1')
    soltar(new Response(JSON.stringify(LEIDOS), { status: 200, headers: { 'content-type': 'application/json' } }))
    await new Promise((r) => setTimeout(r, 20))
    expect(centro().value).toBe('1')
  })

  describe('el depósito (sin costos.ver: el producto llega SIN precio_costo)', () => {
    const { precio_costo: _costo, ...sinCosto } = YERBA
    const deposito = { ...base, '/api/productos': [sinCosto], 'PUT /api/productos/1': { status: 403, detail: 'forbidden' } }

    it('guarda sólo el mínimo de una sucursal sin ver el costo: no toca el producto', async () => {
      responder({ ...deposito, [`PUT ${MINIMOS}/2`]: {} })
      const user = userEvent.setup()
      montar('/productos', <Productos conParametrosDeReposicion />)
      await editar(user)
      await within(dialogo()).findByText('Mínimo por sucursal')
      expect(within(dialogo()).queryByLabelText('Precio de costo')).toBeNull()
      fireEvent.change(norte(), { target: { value: '7' } })
      await guardar(user)
      await waitFor(() => expect(putsDeMinimos()).toEqual([`PUT ${MINIMOS}/2`]))
      expect(cuerpoDe(`PUT ${MINIMOS}/2`)).toEqual({ stock_minimo: 7 })
      expect(pedidas()).not.toContain('PUT /api/productos/1')
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('si además cambia algo del producto no se guarda nada (el 0 de relleno pisaría el costo), tampoco los mínimos', async () => {
      responder({ ...deposito, [`PUT ${MINIMOS}/2`]: {} })
      const user = userEvent.setup()
      montar('/productos', <Productos conParametrosDeReposicion />)
      await editar(user)
      await within(dialogo()).findByText('Mínimo por sucursal')
      fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yerba 2' } })
      fireEvent.change(norte(), { target: { value: '7' } })
      await guardar(user)
      expect(await within(dialogo()).findByText(/no ve el costo de este producto/)).toBeTruthy()
      expect(escrituras()).toHaveLength(0)
    })
  })
})

// El error del formulario se ve (ADR-012): el diálogo scrollea y el mensaje está arriba; en un celular quien mira el campo de abajo creía que «Guardar» no hizo
// nada (el mensaje quedaba 309 px fuera de la pantalla). Medido en Chromium real a 390 px.
describe('Productos: el error del formulario se lleva a la vista y marca el campo', () => {
  async function conErrorDeMinimo(user: ReturnType<typeof userEvent.setup>) {
    responder({ ...base, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/1`]: {}, [`PUT ${MINIMOS}/2`]: {} })
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    fireEvent.change(norte(), { target: { value: '50' } })   // el techo vigente es 40
  }

  it('el mensaje es un alert, recibe el foco y se lleva a la vista (scrollIntoView sobre ese mismo elemento)', async () => {
    const espia = vi.spyOn(Element.prototype, 'scrollIntoView').mockClear()
    const user = userEvent.setup()
    await conErrorDeMinimo(user)
    await guardar(user)
    const alerta = await within(dialogo()).findByRole('alert')
    expect(alerta.textContent).toBe('El mínimo de «Norte» (50) no puede ser mayor que el stock máximo (40).')
    expect(document.activeElement).toBe(alerta)
    expect(espia).toHaveBeenCalledTimes(1)
    expect(espia.mock.contexts[0]).toBe(alerta)
    espia.mockRestore()
  })

  it('repetir el mismo error vuelve a llevarlo a la vista (el texto no cambia, pero quien miraba el campo de abajo tiene que ver que Guardar respondió)', async () => {
    const espia = vi.spyOn(Element.prototype, 'scrollIntoView').mockClear()
    const user = userEvent.setup()
    await conErrorDeMinimo(user)
    await guardar(user)
    await within(dialogo()).findByRole('alert')
    // El usuario mira el campo de abajo: el foco sale del mensaje.
    norte().focus()
    expect(document.activeElement).toBe(norte())
    await guardar(user)
    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2))
    expect(document.activeElement).toBe(within(dialogo()).getByRole('alert'))
    espia.mockRestore()
  })

  it('el campo que causó el error queda aria-invalid y apunta al mensaje con aria-describedby; los otros no', async () => {
    const user = userEvent.setup()
    await conErrorDeMinimo(user)
    expect(norte()).not.toHaveAttribute('aria-invalid')
    await guardar(user)
    const alerta = await within(dialogo()).findByRole('alert')
    expect(alerta.id).not.toBe('')
    expect(norte()).toHaveAttribute('aria-invalid', 'true')
    expect(norte()).toHaveAccessibleDescription(alerta.textContent!)
    expect(centro()).not.toHaveAttribute('aria-invalid')
    expect(centro()).not.toHaveAttribute('aria-describedby')
    expect(within(dialogo()).getByLabelText('Stock máximo')).not.toHaveAttribute('aria-invalid')
  })

  it('un error del plazo o del techo marca ese campo, no los mínimos', async () => {
    const user = userEvent.setup()
    responder(base)
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect((within(dialogo()).getByLabelText('Stock máximo') as HTMLInputElement).value).toBe('40'))
    fireEvent.change(within(dialogo()).getByLabelText('Plazo de entrega (días)'), { target: { value: 'abc' } })
    await guardar(user)
    await within(dialogo()).findByRole('alert')
    expect(within(dialogo()).getByLabelText('Plazo de entrega (días)')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialogo()).getByLabelText('Stock máximo')).not.toHaveAttribute('aria-invalid')
    expect(norte()).not.toHaveAttribute('aria-invalid')
  })

  it('el 422 del motor sobre el mínimo de una sucursal marca el campo de esa sucursal', async () => {
    const detail = 'stock_minimo (30) no puede ser mayor que el stock máximo de reposición del producto (25)'
    responder({ ...base, [`PUT ${MINIMOS}/2`]: { status: 422, detail } })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(norte(), { target: { value: '30' } })
    await guardar(user)
    const alerta = await within(dialogo()).findByRole('alert')
    expect(alerta.textContent).toBe(`No se pudo guardar el mínimo de «Norte»: ${detail}`)
    expect(document.activeElement).toBe(alerta)
    expect(norte()).toHaveAttribute('aria-invalid', 'true')
    expect(centro()).not.toHaveAttribute('aria-invalid')
  })

  it('al volver a guardar la marca se mueve con el error: el campo corregido deja de estar aria-invalid y lo está el nuevo', async () => {
    const user = userEvent.setup()
    await conErrorDeMinimo(user)
    await guardar(user)
    await within(dialogo()).findByRole('alert')
    expect(norte()).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(norte(), { target: { value: '30' } })
    fireEvent.change(centro(), { target: { value: 'abc' } })
    await guardar(user)
    await waitFor(() => expect(centro()).toHaveAttribute('aria-invalid', 'true'))
    expect(norte()).not.toHaveAttribute('aria-invalid')
    expect(within(dialogo()).getByRole('alert').textContent).toMatch(/«Centro»/)
  })
})

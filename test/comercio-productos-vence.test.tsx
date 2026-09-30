// Carga de vencimientos (0.92.0, K-1): el interruptor «Vence» del formulario de producto. Es opt-in por datos: sólo aparece si
// el backend trae `vence` en los productos (`OpcionesCatalogo.con_vencimientos`); un producto que no lo manda no ve nada nuevo.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import type { Producto } from '../src/comercio/tipos'
import { cuerpoDe, fetchMock, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const producto = (id: number, nombre: string, extra: Partial<Producto> = {}): Producto => ({
  id, codigo: `P${id}`, nombre, descripcion: '', precio_venta: 100, precio_costo: 60, unidad: 'u', categoria: '', stock_minimo: 0,
  estacion: '', vendible: 1, activo: 1, tipo: 'producto', ...extra,
})
const LECHE = producto(1, 'Leche', { vence: true })
const SAL = producto(2, 'Sal', { vence: false })
const ASESORIA = producto(3, 'Asesoría', { tipo: 'servicio', vence: false })
const SIN_VENCE = [producto(1, 'Leche'), producto(2, 'Sal')]
const ETIQUETA = 'Vence (maneja lotes y fecha de vencimiento)'
const AYUDA =
  'Marcalo si el producto es perecedero: vas a poder cargar lote y fecha al recibir compras y verlo en “Vencimientos y lotes”.'
const base = (productos: Producto[]) => ({ '/api/productos': productos, '/api/productos/categorias': [] })

beforeEach(() => {
  cleanup()
  prepararFetch()
})

/** Los cuerpos de todos los pedidos de una ruta, en orden. */
const cuerpos = (clave: string) => pedidas().map((p, i) => ({ p, i })).filter(({ p }) => p === clave)
  .map(({ i }) => JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body)) as Record<string, unknown>)
const dialogo = () => screen.getByRole('dialog')
const interruptor = () => within(dialogo()).getByRole('switch', { name: ETIQUETA }) as HTMLInputElement
async function abrirAlta(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
  return dialogo()
}
async function abrirEdicion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByLabelText('Editar producto')[0])
  return dialogo()
}

describe('Productos: el interruptor «Vence»', () => {
  it('si el backend no manda `vence` (opción apagada) no hay interruptor, ni en el alta ni en la edición, y el cuerpo es el de siempre', async () => {
    responder({ ...base(SIN_VENCE), 'POST /api/productos': { id: 9 }, 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Leche')
    await abrirAlta(user)
    expect(within(dialogo()).queryByRole('switch', { name: ETIQUETA })).toBeNull()
    expect(within(dialogo()).queryByText(/Vence/)).toBeNull()
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Nuevo' } })
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/productos'))
    expect('vence' in cuerpoDe('POST /api/productos')).toBe(false)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await abrirEdicion(user)
    expect(within(dialogo()).queryByRole('switch', { name: ETIQUETA })).toBeNull()
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    expect('vence' in cuerpoDe('PUT /api/productos/1')).toBe(false)
  })

  it('con `vence` en la respuesta aparece en el alta (apagado) y en la edición (con el valor del producto), con su ayuda', async () => {
    responder(base([LECHE, SAL]))
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Leche')
    await abrirAlta(user)
    expect(interruptor().checked).toBe(false)
    expect(within(dialogo()).getByText(AYUDA)).toBeTruthy()
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))

    await abrirEdicion(user) // Leche: vence
    expect(interruptor().checked).toBe(true)
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getAllByLabelText('Editar producto')[1]) // Sal: no vence
    expect(interruptor().checked).toBe(false)
  })

  it('alta: si no se toca, `vence` no viaja; si se marca, viaja `vence: true`', async () => {
    responder({ ...base([LECHE]), 'POST /api/productos': { id: 9 } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Leche')
    await abrirAlta(user)
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Yogur' } })
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/productos'))
    expect('vence' in cuerpoDe('POST /api/productos')).toBe(false)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await abrirAlta(user)
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Queso' } })
    await user.click(interruptor())
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'POST /api/productos')).toHaveLength(2))
    expect(cuerpos('POST /api/productos')[1]).toMatchObject({ nombre: 'Queso', vence: true })
    expect('vence' in cuerpos('POST /api/productos')[0]).toBe(false)
  })

  it('edición: sólo viaja si el usuario lo cambió respecto de lo que había (marcar, desmarcar, o cambiar y volver atrás = no viaja)', async () => {
    responder({ ...base([LECHE, SAL]), 'PUT /api/productos/1': { id: 1 }, 'PUT /api/productos/2': { id: 2 } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Leche')

    // Leche (vence) editada sin tocar el interruptor: no viaja.
    await abrirEdicion(user)
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Leche entera' } })
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    expect(cuerpoDe('PUT /api/productos/1')).toMatchObject({ nombre: 'Leche entera' })
    expect('vence' in cuerpoDe('PUT /api/productos/1')).toBe(false)

    // Cambiar y volver atrás: tampoco.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await abrirEdicion(user)
    await user.click(interruptor())
    await user.click(interruptor())
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'PUT /api/productos/1')).toHaveLength(2))
    expect(cuerpos('PUT /api/productos/1').map((c) => 'vence' in c)).toEqual([false, false])

    // Desmarcar la que vence: vence: false.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await abrirEdicion(user)
    await user.click(interruptor())
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas().filter((p) => p === 'PUT /api/productos/1')).toHaveLength(3))
    expect(cuerpos('PUT /api/productos/1')[2].vence).toBe(false)

    // Marcar la que no vence: vence: true.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getAllByLabelText('Editar producto')[1])
    await user.click(interruptor())
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/2'))
    expect(cuerpoDe('PUT /api/productos/2').vence).toBe(true)
  })

  it.each([
    [403, 'No tenés permiso para marcar o desmarcar productos que vencen.'],
    [409, 'La base no tiene aplicada la revisión de vencimientos: corré libracommerce-migrar upgrade.'],
  ])('un %s al guardar muestra el mensaje del backend y conserva lo tipeado (el diálogo no se cierra)', async (status, detail) => {
    responder({ ...base([LECHE, SAL]), 'PUT /api/productos/2': { status, detail } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Sal')
    await user.click(screen.getAllByLabelText('Editar producto')[1])
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: 'Sal fina' } })
    fireEvent.change(within(dialogo()).getByLabelText('Descripción'), { target: { value: 'paquete de 1 kg' } })
    await user.click(interruptor())
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))

    expect(await within(dialogo()).findByText(detail)).toBeTruthy()
    expect((within(dialogo()).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Sal fina')
    expect((within(dialogo()).getByLabelText('Descripción') as HTMLInputElement).value).toBe('paquete de 1 kg')
    expect(interruptor().checked).toBe(true)
    // Y se puede volver a intentar sin reabrir.
    expect((within(dialogo()).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('un servicio no se marca: el interruptor está deshabilitado y lo explica; con `conTipo`, pasar el tipo a servicio lo deshabilita', async () => {
    responder({ ...base([LECHE, ASESORIA]), 'POST /api/productos': { id: 9 }, 'PUT /api/productos/3': { id: 3 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conTipo />)
    await screen.findByText('Asesoría')
    // Un servicio existente (vence: false): deshabilitado con su explicación.
    await user.click(screen.getAllByLabelText('Editar producto')[1])
    expect(interruptor().disabled).toBe(true)
    expect(within(dialogo()).getByText(/Un servicio no tiene inventario: no puede tener lotes ni vencimiento\./)).toBeTruthy()
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/3'))
    expect('vence' in cuerpoDe('PUT /api/productos/3')).toBe(false)

    // Alta: habilitado para un producto, deshabilitado al elegir «Servicio».
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await abrirAlta(user)
    expect(interruptor().disabled).toBe(false)
    expect(within(dialogo()).getByText(AYUDA)).toBeTruthy()
    await user.selectOptions(within(dialogo()).getByRole('combobox', { name: 'Tipo' }), 'servicio')
    expect(interruptor().disabled).toBe(true)
    expect(within(dialogo()).queryByText(AYUDA)).toBeNull()
  })

  it('si ya estaba marcado y se lo pasa a servicio, el interruptor queda habilitado para poder desmarcarlo (el motor rechaza un servicio marcado)', async () => {
    responder({ ...base([LECHE]), 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos conTipo />)
    await screen.findByText('Leche')
    await abrirEdicion(user)
    await user.selectOptions(within(dialogo()).getByRole('combobox', { name: 'Tipo' }), 'servicio')
    expect(interruptor().checked).toBe(true)
    expect(interruptor().disabled).toBe(false)
    expect(within(dialogo()).getByText(/Desmarcalo para poder guardarlo/)).toBeTruthy()
    await user.click(interruptor())
    expect(interruptor().disabled).toBe(true)
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/1'))
    expect(cuerpoDe('PUT /api/productos/1')).toMatchObject({ tipo: 'servicio', vence: false })
  })

  it('`conVencimientos` lo fuerza con un catálogo vacío (no hay de dónde leer `vence`) y `false` lo apaga aunque el backend lo mande', async () => {
    responder(base([]))
    const user = userEvent.setup()
    montar('/productos', <Productos conVencimientos />)
    await screen.findByText('No hay productos registrados aún.')
    await abrirAlta(user)
    expect(interruptor().checked).toBe(false)

    cleanup()
    prepararFetch()
    responder(base([LECHE]))
    montar('/productos', <Productos conVencimientos={false} />)
    await screen.findByText('Leche')
    await abrirEdicion(user)
    expect(within(dialogo()).queryByRole('switch', { name: ETIQUETA })).toBeNull()
  })

  it('el interruptor sigue aunque una búsqueda posterior devuelva una lista vacía (ya se sabe que el backend maneja `vence`)', async () => {
    responder({ ...base([LECHE]), '/api/productos?q=zzz': [] })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Leche')
    const buscador = screen.getByPlaceholderText('Buscar por nombre, código o categoría…')
    fireEvent.change(buscador, { target: { value: 'zzz' } })
    fireEvent.keyDown(buscador, { key: 'Enter' })
    await screen.findByText(/No se encontraron productos/)
    await abrirAlta(user)
    expect(interruptor()).toBeTruthy()
  })
})

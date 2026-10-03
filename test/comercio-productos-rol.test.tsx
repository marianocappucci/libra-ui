// Productos según lo que el rol puede hacer (0.111.0, ADR-013): `conAlta` (sin él no se ofrece «Nuevo producto»), `conEdicionDelProducto` (el depósito: el producto de sólo
// lectura y editable sólo la reposición), el 401/403 en castellano y el layout del rótulo «Vence». El encabezado de la Reposición sugerida va en el último bloque.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { _reiniciarAvisoDeSesion, configurarSesionVencida } from '../src/api-client'
import { Productos } from '../src/comercio/Productos'
import { Reposicion } from '../src/comercio/Reposicion'
import type { Producto, ReposicionData } from '../src/comercio/tipos'
import { cuerpoDe, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const producto = (id: number, nombre: string, extra: Partial<Producto> = {}): Producto => ({
  id, codigo: `P${id}`, nombre, descripcion: 'Mate', precio_venta: 100, precio_costo: 60, unidad: 'u', categoria: 'Almacén', stock_minimo: 10,
  estacion: '', vendible: 1, activo: 1, tipo: 'producto', ...extra,
})
const YERBA = producto(1, 'Yerba')
// El depósito no tiene `costos.ver`: el producto llega SIN `precio_costo`.
const { precio_costo: _costo, ...YERBA_SIN_COSTO } = YERBA
const RUTA = '/api/productos/1/reposicion'
const MINIMOS = `${RUTA}/minimos`
const PARAMETROS = { producto_id: 1, nombre: 'Yerba', plazo_entrega_dias: 7, stock_maximo: 40, stock_minimo: 10, proveedor_id: null, proveedor: null }
const LEIDOS = {
  producto_id: 1,
  sucursales: [
    { sucursal_id: 1, sucursal: 'Centro', stock_minimo: 4, stock_minimo_propio: true, stock_minimo_global: 10 },
    { sucursal_id: 2, sucursal: 'Norte', stock_minimo: 10, stock_minimo_propio: false, stock_minimo_global: 10 },
  ],
}
const base = { '/api/productos': [YERBA], '/api/productos/categorias': [] }
const deposito = {
  ...base, '/api/productos': [YERBA_SIN_COSTO], [`GET ${RUTA}`]: PARAMETROS, [`GET ${MINIMOS}`]: LEIDOS,
  'PUT /api/productos/1': { status: 403, detail: 'forbidden' }, 'POST /api/productos': { status: 403, detail: 'forbidden' },
}

beforeEach(() => {
  cleanup()
  prepararFetch()
  // Un 401 de datos es «sesión vencida»: por defecto recarga en /login (jsdom no navega).
  _reiniciarAvisoDeSesion()
  configurarSesionVencida(() => {})
})

const dialogo = () => screen.getByRole('dialog')
const en = (etiqueta: string) => within(dialogo()).getByLabelText(etiqueta) as HTMLInputElement
async function editar(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Yerba')
  await user.click(screen.getAllByLabelText('Editar producto')[0])
  return dialogo()
}
const guardar = (user: ReturnType<typeof userEvent.setup>) => user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
const escrituras = () => pedidas().filter((p) => p.startsWith('PUT ') || p.startsWith('POST ') || p.startsWith('DELETE '))

describe('Productos: conAlta', () => {
  it('sin la prop el botón «Nuevo producto» está (los demás productos no cambian)', async () => {
    responder(base)
    montar('/productos', <Productos />)
    await screen.findByText('Yerba')
    expect(screen.getByRole('button', { name: /Nuevo producto/ })).toBeTruthy()
  })

  it('con conAlta={false} no se ofrece ningún punto de alta, y editar sigue funcionando', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos conAlta={false} />)
    await screen.findByText('Yerba')
    expect(screen.queryByRole('button', { name: /Nuevo producto/ })).toBeNull()
    expect(screen.queryByText(/Nuevo producto/)).toBeNull()
    await editar(user)
    expect(within(dialogo()).getByText('Editar producto')).toBeTruthy()
  })
})

describe('Productos: conEdicionDelProducto', () => {
  it('sin la prop los campos del producto son editables y no hay nota', async () => {
    responder({ ...base, [`GET ${RUTA}`]: PARAMETROS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion conVencimientos />)
    await editar(user)
    for (const campo of ['Nombre', 'Código', 'Categoría', 'Precio de venta', 'Precio de costo', 'Stock mínimo', 'Descripción']) expect(en(campo).disabled).toBe(false)
    expect(within(dialogo()).queryByText('Tu rol sólo puede cargar la reposición de este producto.')).toBeNull()
  })

  it('con conEdicionDelProducto={false} el producto va de sólo lectura (con la nota visible) y la reposición sigue editable (estructural en los Select: el stub sólo reenvía `disabled`)', async () => {
    responder(deposito)
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion conVencimientos conTipo conEdicionDelProducto={false} />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    await waitFor(() => expect(en('Plazo de entrega (días)').disabled).toBe(false))
    expect(within(dialogo()).getByText('Tu rol sólo puede cargar la reposición de este producto.')).toBeTruthy()
    for (const campo of ['Nombre', 'Código', 'Categoría', 'Precio de venta', 'Stock mínimo', 'Descripción']) expect(en(campo).disabled).toBe(true)
    // Los selectores (unidad, tipo; estructural: el stub de Select reenvía `disabled`, no prueba el Select de Radix) y los interruptores (Vence, Producto activo).
    for (const rotulo of ['Unidad', 'Tipo']) expect((within(dialogo()).getByLabelText(rotulo) as HTMLButtonElement).disabled).toBe(true)
    for (const nombre of [/Vence/, 'Producto activo']) expect((within(dialogo()).getByRole('switch', { name: nombre }) as HTMLButtonElement).disabled).toBe(true)
    // La reposición: plazo, techo y mínimos por sucursal.
    expect(en('Stock máximo').disabled).toBe(false)
    expect(en('Mínimo en Centro').disabled).toBe(false)
    expect(en('Mínimo en Norte').disabled).toBe(false)
  })

  it('guardar manda sólo la reposición: ni PUT del producto ni el mensaje del costo oculto', async () => {
    responder({ ...deposito, [`PUT ${RUTA}`]: PARAMETROS, [`PUT ${MINIMOS}/2`]: {} })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion conEdicionDelProducto={false} />)
    await editar(user)
    await within(dialogo()).findByText('Mínimo por sucursal')
    fireEvent.change(en('Stock máximo'), { target: { value: '45' } })
    fireEvent.change(en('Mínimo en Norte'), { target: { value: '7' } })
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(escrituras().sort()).toEqual([`PUT ${RUTA}`, `PUT ${MINIMOS}/2`].sort())
    expect(pedidas()).not.toContain('PUT /api/productos/1')
    expect(cuerpoDe(`PUT ${RUTA}`)).toEqual({ plazo_entrega_dias: 7, stock_maximo: 45 })
    expect(cuerpoDe(`PUT ${MINIMOS}/2`)).toEqual({ stock_minimo: 7 })
  })

  it('con el producto con costo tampoco se guarda el producto (el rol ve el costo pero no puede editar)', async () => {
    responder({ ...deposito, '/api/productos': [YERBA], [`PUT ${RUTA}`]: PARAMETROS })
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion conEdicionDelProducto={false} />)
    await editar(user)
    await waitFor(() => expect(en('Stock máximo').disabled).toBe(false))
    fireEvent.change(en('Stock máximo'), { target: { value: '45' } })
    await guardar(user)
    await waitFor(() => expect(pedidas()).toContain(`PUT ${RUTA}`))
    expect(pedidas()).not.toContain('PUT /api/productos/1')
  })

  it('sin tocar nada, «Guardar cambios» cierra sin escribir (no hay nada que guardar)', async () => {
    responder(deposito)
    const user = userEvent.setup()
    montar('/productos', <Productos conParametrosDeReposicion conEdicionDelProducto={false} />)
    await editar(user)
    await waitFor(() => expect(en('Stock máximo').disabled).toBe(false))
    await guardar(user)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(escrituras()).toEqual([])
  })

  it('sin conParametrosDeReposicion no hay nada editable: el diálogo no ofrece «Guardar cambios»', async () => {
    responder(deposito)
    const user = userEvent.setup()
    montar('/productos', <Productos conEdicionDelProducto={false} />)
    await editar(user)
    expect(en('Nombre').disabled).toBe(true)
    expect(within(dialogo()).queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
  })

  it('el alta no cambia: con conEdicionDelProducto={false} el formulario de «Nuevo producto» es editable', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos conEdicionDelProducto={false} />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    expect(en('Nombre').disabled).toBe(false)
    expect(within(dialogo()).queryByText('Tu rol sólo puede cargar la reposición de este producto.')).toBeNull()
    expect(within(dialogo()).getByRole('button', { name: 'Crear producto' })).toBeTruthy()
  })
})

describe('Productos: los errores 401/403 se dicen en castellano', () => {
  it('un 403 al crear muestra «No tenés permiso para hacer esto.» y no «forbidden»', async () => {
    responder({ ...base, 'POST /api/productos': { status: 403, detail: 'forbidden' } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    fireEvent.change(en('Nombre'), { target: { value: 'Café' } })
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    const alerta = await within(dialogo()).findByRole('alert')
    expect(alerta.textContent).toBe('No tenés permiso para hacer esto.')
    expect(screen.queryByText(/forbidden/i)).toBeNull()
  })

  it('un 403 al editar el producto y al eliminarlo también', async () => {
    responder({ ...base, 'PUT /api/productos/1': { status: 403, detail: 'forbidden' }, 'DELETE /api/productos/1': { status: 403, detail: 'forbidden' } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await editar(user)
    await guardar(user)
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('No tenés permiso para hacer esto.')
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getAllByLabelText('Eliminar producto')[0])
    await user.click(await screen.findByRole('button', { name: /^(Eliminar|Confirmar|Aceptar)$/ }))
    expect(await screen.findByText('No tenés permiso para hacer esto.')).toBeTruthy()
    expect(screen.queryByText(/forbidden/i)).toBeNull()
  })

  it('un 401 se dice como sesión vencida', async () => {
    responder({ ...base, 'POST /api/productos': { status: 401, detail: 'not authenticated' } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    fireEvent.change(en('Nombre'), { target: { value: 'Café' } })
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('Tu sesión venció. Volvé a iniciar sesión.')
  })

  it('otro status conserva el `detail` del backend', async () => {
    responder({ ...base, 'PUT /api/productos/1': { status: 409, detail: 'Ya existe un producto con ese código.' } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await editar(user)
    await guardar(user)
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('Ya existe un producto con ese código.')
  })

  it.each([
    ['forbidden'], ['Forbidden'], ['Forbidden.'], ['  FORBIDDEN '], ['Not enough permissions'], ['Could not validate credentials'], ['Operation not permitted'],
    ['permission denied'], ['Access   denied!'], ['Unauthorized'], [''],
  ])('el `detail` genérico de un 403 «%s» (lista explícita, normalizado) se reemplaza', async (detail) => {
    responder({ ...base, 'PUT /api/productos/1': { status: 403, detail } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await editar(user)
    await guardar(user)
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('No tenés permiso para hacer esto.')
  })

  it.each([['not authenticated'], ['Not authenticated'], ['Unauthorized.'], ['']])('el `detail` genérico de un 401 «%s» se dice como sesión vencida', async (detail) => {
    responder({ ...base, 'PUT /api/productos/1': { status: 401, detail } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await editar(user)
    await guardar(user)
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('Tu sesión venció. Volvé a iniciar sesión.')
  })

  it.each([
    [403, 'Acceso denegado'], [401, 'Credenciales incorrectas'], [403, 'No tenés permiso para marcar o desmarcar productos que vencen.'],
    // Fuera de la lista a propósito: no es un genérico conocido de la familia, lo dijo el backend y se muestra tal cual (en castellano o no).
    [403, 'No permissions'], [403, 'Forbidden for this tenant'], [401, 'Token expired'],
  ])('un %s con un `detail` que NO es un genérico conocido («%s») se muestra tal cual', async (status, detail) => {
    responder({ ...base, 'PUT /api/productos/1': { status, detail } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await editar(user)
    await guardar(user)
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe(detail)
  })

  it('un 403 con `detail` estructurado (los Términos pendientes) conserva el mensaje del backend', async () => {
    responder({ ...base, 'PUT /api/productos/1': { status: 403, detail: { code: 'terminos_pendientes', version: '1', mensaje: 'Hay que aceptar los Términos y Condiciones.' } } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await editar(user)
    await guardar(user)
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('Hay que aceptar los Términos y Condiciones.')
  })
})

describe('Layout en pantallas angostas (390 px) (estructural: jsdom no mide; se mira a ojo en el navegador)', () => {
  it('(estructural) el rótulo «Vence (maneja lotes y fecha de vencimiento)» lleva la clase `leading-snug`', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos conVencimientos />)
    await editar(user)
    const rotulo = within(dialogo()).getByText('Vence (maneja lotes y fecha de vencimiento)')
    expect(rotulo.className).toContain('leading-snug')
  })

  it('(estructural) el encabezado de la lista de Reposición: «1 producto» es un solo bloque que no se parte, y el resumen es otro que envuelve', async () => {
    const DATA: ReposicionData = {
      dias_rotacion: 30, dias_cobertura: 15, plazo_entrega_dias: 3, sucursal_id: null, categoria: null, producto_id: null, solo_a_pedir: true,
      resumen: { productos: 1, a_pedir: 1, posible_quiebre: 0, sin_ventas: 0 },
      productos: [],
    }
    responder({ '/api/reportes/reposicion': DATA, '/api/sucursales': [], '/api/productos/categorias': [] })
    montar('/reposicion', <Reposicion />)
    const cuenta = await screen.findByText('1 producto')
    expect(cuenta.className).toContain('whitespace-nowrap')
    // El icono va dentro del mismo bloque (no es un hijo suelto del título).
    expect(cuenta.querySelector('svg')).not.toBeNull()
    const titulo = cuenta.parentElement!
    expect(titulo.className).toContain('flex-wrap')
    const resumen = within(titulo).getByText(/1 a pedir · 0 con posible quiebre · 0 sin ventas/)
    expect(resumen.parentElement).toBe(titulo)
    expect(cuenta.contains(resumen)).toBe(false)
  })
})

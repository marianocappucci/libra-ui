// El foco al cerrar el diálogo de edición de Productos (0.111.0, ADR-013). Con `conAlta={false}` ya no hay `DialogTrigger` y el diálogo se abre por el `onClick` del botón de
// la fila: Radix devolvía el foco a un trigger que no existe y quien navega con teclado quedaba en el principio de la página.
//
// Va aparte porque el foco es lo que un stub no puede probar. Desde 0.152.0 (ADR-064) el diálogo del kit es el real de Radix en toda la suite, así que ya no hace falta
// reemplazar nada; el archivo queda por lo que mide, no por cómo se arma.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import type { Producto } from '../src/comercio/tipos'
import { fetchMock, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const producto = (id: number, nombre: string): Producto => ({
  id, codigo: `P${id}`, nombre, descripcion: '', precio_venta: 100, precio_costo: 60, unidad: 'u', categoria: '', stock_minimo: 0,
  estacion: '', vendible: 1, activo: 1, tipo: 'producto',
})
const base = { '/api/productos': [producto(1, 'Yerba'), producto(2, 'Azúcar')], '/api/productos/categorias': [] }

beforeEach(() => {
  cleanup()
  prepararFetch()
})

const botonEditar = (i: number) => screen.getAllByLabelText('Editar producto')[i]
/** Abre la edición con el teclado: foco en el botón de la fila y Enter. */
async function abrirConTeclado(user: ReturnType<typeof userEvent.setup>, i: number) {
  await screen.findByText('Yerba')
  const boton = botonEditar(i)
  boton.focus()
  await user.keyboard('{Enter}')
  await screen.findByRole('dialog')
  return boton
}

describe('Productos: el foco al cerrar el diálogo de edición (Radix real)', () => {
  it('con conAlta={false} (sin DialogTrigger), Escape devuelve el foco al botón que abrió la edición', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos conAlta={false} />)
    const boton = await abrirConTeclado(user, 1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(boton))
  })

  it('«Cancelar» también', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos conAlta={false} />)
    const boton = await abrirConTeclado(user, 0)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(document.activeElement).toBe(boton))
  })

  it('con conAlta el foco vuelve igual a la fila (y no al botón «Nuevo producto», que no abrió nada)', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    const boton = await abrirConTeclado(user, 1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.activeElement).toBe(boton))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: /Nuevo producto/ }))
  })

  it('al guardar, la tabla se recarga y el botón de la fila es otro elemento: el foco vuelve al botón del mismo producto', async () => {
    responder({ ...base, 'PUT /api/productos/2': { id: 2 } })
    // La recarga tarda (como una red real): mientras, la tabla es «Cargando…» y el botón de la fila no existe. Sin demora la recarga cabe en un solo render y la tabla ni se desmonta.
    const respuesta = fetchMock.getMockImplementation()!
    let guardado = false
    fetchMock.mockImplementation(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') guardado = true
      else if (guardado) await new Promise((r) => setTimeout(r, 60))
      return respuesta(entrada, init)
    })
    const user = userEvent.setup()
    montar('/productos', <Productos conAlta={false} />)
    const viejo = await abrirConTeclado(user, 1)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/productos/2'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect((document.activeElement as HTMLElement | null)?.getAttribute('data-editar-producto')).toBe('2'))
    expect(viejo.isConnected).toBe(false)
    expect(document.activeElement).not.toBe(viejo)
    expect(document.activeElement?.isConnected).toBe(true)
  })

  it('si el producto ya no está en la lista, el foco queda en «Nuevo producto» (o en la tabla), no en la nada', async () => {
    let lista = [producto(1, 'Yerba'), producto(2, 'Azúcar')]
    responder({ ...base, '/api/productos': () => lista, 'PUT /api/productos/2': () => { lista = [producto(1, 'Yerba')]; return { id: 2 } } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await abrirConTeclado(user, 1)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.queryByText('Azúcar')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /Nuevo producto/ })))
  })

  it('el alta no cambia: abierta con «Nuevo producto», Escape devuelve el foco a ese botón (lo hace Radix)', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Yerba')
    const nuevo = screen.getByRole('button', { name: /Nuevo producto/ })
    nuevo.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(nuevo))
  })
})

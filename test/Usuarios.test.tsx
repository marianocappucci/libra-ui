// La pantalla de usuarios: el alta y la edición en modal, y las acciones de la
// grilla con icono.
//
// Los dos cambios los pidió el humano el 2026-08-15 mirando LibraDesk ya
// desplegado (puntos 7 y 8 de su lista). Llegan acá y no al producto porque
// `pages/Usuarios.tsx` de LibraDesk es un shim de nueve líneas sobre este
// módulo: la pantalla viene entera del paquete, y le llega a cualquier producto
// que suba su pin.
//
// Este archivo es además el primer test de `Usuarios.tsx` — el módulo estaba
// sin cubrir (lo decía el comentario del piso de cobertura en `vitest.config`),
// así que además de las dos formas nuevas se afirma que el ABM sigue mandando
// lo que mandaba: es un paquete compartido por cinco productos y no hay dónde
// enterarse si se rompe.
//
// ⚠️ El `Dialog` acá es el STUB de `test/stubs`, no Radix: rinde
// `role="dialog"` y respeta `open`, pero no hace foco ni marca inerte al resto
// del documento. Alcanza para afirmar "el formulario está adentro del diálogo";
// no dice nada sobre cómo se ve.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Usuarios } from '../src/Usuarios'

const USUARIOS = [
  { id: 'u1', username: 'admin', name: 'Mariano', role: 'admin', active: true },
  { id: 'u2', username: 'jperez', name: 'Juan Pérez', role: 'staff', active: false },
]

let pedidos: { url: string; metodo: string; cuerpo: unknown }[] = []

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  pedidos = []
  vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET'
    pedidos.push({
      url: String(url), metodo,
      cuerpo: opciones?.body ? JSON.parse(String(opciones.body)) : null,
    })
    if (metodo !== 'GET') return Promise.resolve(json({ ok: true }))
    return Promise.resolve(json(USUARIOS))
  }))
})

describe('🔴 el alta y la edición abren en modal', () => {
  it('editar rinde el formulario adentro de un diálogo, con los datos cargados', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)
    await screen.findByText('Mariano')

    // Control: sin esto, un diálogo que ya estuviera abierto haría pasar el
    // caso sin que el click hiciera nada.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Editar Mariano' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Nombre')).toHaveValue('Mariano')
    // La edición NO ofrece usuario ni contraseña: el backend sólo acepta
    // nombre, rol y estado en el PUT.
    expect(within(dialogo).queryByLabelText('Usuario')).not.toBeInTheDocument()
    expect(within(dialogo).queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })

  it('el alta pide usuario y contraseña, y las manda', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Usuario'), 'nuevo')
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Persona Nueva')
    await user.type(within(dialogo).getByLabelText('Contraseña'), 'secreta123')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear' }))

    await waitFor(() => {
      const alta = pedidos.find((p) => p.metodo === 'POST')
      expect(alta?.cuerpo).toEqual({
        username: 'nuevo', name: 'Persona Nueva',
        password: 'secreta123', role: 'staff',
      })
    })
    // Y se cierra: si quedara abierto taparía la grilla recién recargada.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('🔴 el formulario NO queda en el flujo de la página, entre el encabezado y la grilla', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)
    await screen.findByText('Mariano')
    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }))

    // Éste es el defecto en sí, y hay que abrirlo para verlo: con el
    // formulario cerrado la pantalla se ve igual antes y después del cambio,
    // así que un caso que sólo mirara el estado inicial no distinguiría nada
    // — pasaría en verde con la tarjeta vieja entera puesta. Se comprobó
    // corriéndolo contra el código anterior.
    //
    // Abierto, la diferencia es dónde vive el campo: adentro del diálogo, o
    // suelto en la página empujando la tabla hacia abajo.
    const nombre = await screen.findByLabelText('Nombre')
    expect(nombre.closest('[role="dialog"]')).not.toBeNull()

    // Y la grilla sigue estando: el diálogo no la reemplaza.
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
  })
})

describe('🔴 las acciones de la grilla van con icono, no con palabra', () => {
  it('editar y desactivar son botones de icono con nombre accesible', async () => {
    render(<Usuarios />)
    await screen.findByText('Mariano')

    const editar = screen.getByRole('button', { name: 'Editar Mariano' })
    const desactivar = screen.getByRole('button', { name: 'Desactivar Mariano' })

    // El nombre accesible vive, pero el texto visible se fue: es exactamente
    // lo que significa "con icono y no con palabra". Se mide sobre
    // `textContent` —lo que se ve— y no sobre el nombre accesible, que a
    // propósito sigue diciendo la acción.
    expect(editar.textContent).toBe('')
    expect(desactivar.textContent).toBe('')
    expect(editar.querySelector('svg')).not.toBeNull()
    expect(desactivar.querySelector('svg')).not.toBeNull()
  })

  it('un usuario inactivo ofrece Activar, y el dibujo es otro', async () => {
    render(<Usuarios />)
    await screen.findByText('Juan Pérez')

    // La columna cambia por fila: `Juan Pérez` está inactivo, así que su botón
    // dice Activar. Afirmarlo sólo sobre la primera fila describiría una fila,
    // no la columna.
    const activar = screen.getByRole('button', { name: 'Activar Juan Pérez' })
    expect(screen.queryByRole('button', { name: 'Desactivar Juan Pérez' })).not.toBeInTheDocument()

    // Y no es el mismo glifo que el de desactivar: si lo fuera, el icono no
    // estaría comunicando el estado y la palabra que se sacó haría falta.
    const desactivar = screen.getByRole('button', { name: 'Desactivar Mariano' })
    expect(activar.querySelector('svg')!.getAttribute('class'))
      .not.toBe(desactivar.querySelector('svg')!.getAttribute('class'))
  })

  it('el toggle manda el PUT con el estado invertido', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: 'Desactivar Mariano' }))

    await waitFor(() => {
      const put = pedidos.find((p) => p.metodo === 'PUT')
      expect(put?.url).toContain('/users/u1')
      expect(put?.cuerpo).toEqual({ name: 'Mariano', role: 'admin', active: false })
    })
  })
})

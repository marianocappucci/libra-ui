// El diálogo de cambiar la propia contraseña (v0.20.0), contra
// `POST /auth/change-password` de libraauth v0.25.0.
//
// Lo que puede fallar en silencio acá es **qué se manda**: un diálogo que
// muestra "listo" sin haber pegado, o que manda los campos cruzados, se ve
// exactamente igual que uno que funciona. Por eso los tests miran el cuerpo de
// la request y no el cartel.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CambiarPassword } from '../src/CambiarPassword'

let pedidos: { url: string; metodo: string; cuerpo: Record<string, unknown> | null }[] = []

function responder(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  pedidos = []
  vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
    pedidos.push({
      url: String(url),
      metodo: opciones?.method ?? 'GET',
      cuerpo: opciones?.body ? JSON.parse(String(opciones.body)) : null,
    })
    return Promise.resolve(responder(200, { id: '1', username: 'ana' }))
  }))
})

function montar() {
  return render(<CambiarPassword open onOpenChange={vi.fn()} />)
}

async function completar(user: ReturnType<typeof userEvent.setup>,
                         actual: string, nueva: string, repetida: string) {
  await user.type(screen.getByLabelText('Contraseña actual'), actual)
  await user.type(screen.getByLabelText('Contraseña nueva'), nueva)
  await user.type(screen.getByLabelText('Repetir la nueva'), repetida)
}

describe('cambiar la propia contraseña', () => {
  it('manda la actual y la nueva al endpoint', async () => {
    const user = userEvent.setup()
    montar()
    await completar(user, 'la-vieja', 'la-nueva', 'la-nueva')
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))

    await waitFor(() => expect(pedidos).toHaveLength(1))
    expect(pedidos[0].metodo).toBe('POST')
    expect(pedidos[0].url).toContain('/auth/change-password')
    // Los dos campos y **con estos nombres**: cruzarlos daría un 400 del
    // backend que en pantalla se lee como "la contraseña actual no es
    // correcta", o sea culpando al usuario de un error del formulario.
    expect(pedidos[0].cuerpo).toEqual({
      current_password: 'la-vieja', new_password: 'la-nueva',
    })
  })

  it('🔴 si las dos nuevas no coinciden NO le pega a la API', async () => {
    // La afirmación fuerte es la segunda: un diálogo que manda igual y deja que
    // el backend decida cambiaría la contraseña por la que el usuario tipeó mal.
    const user = userEvent.setup()
    montar()
    await completar(user, 'la-vieja', 'la-nueva', 'otra-cosa')
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument()
    expect(pedidos).toHaveLength(0)
  })

  it('muestra el mensaje del backend tal cual', async () => {
    // Distingue "la actual no es correcta" de "la nueva es muy corta". Con un
    // mensaje genérico habría que adivinar cuál de los dos campos corregir.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      responder(400, { detail: 'la contraseña actual no es correcta' }),
    )))
    const user = userEvent.setup()
    montar()
    await completar(user, 'equivocada', 'la-nueva', 'la-nueva')
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))

    expect(await screen.findByText('la contraseña actual no es correcta')).toBeInTheDocument()
  })

  it('al salir bien limpia los campos: la contraseña no queda en el DOM', async () => {
    const user = userEvent.setup()
    montar()
    await completar(user, 'la-vieja', 'la-nueva', 'la-nueva')
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))

    await screen.findByText(/Listo/)
    for (const campo of ['Contraseña actual', 'Contraseña nueva', 'Repetir la nueva']) {
      expect(screen.getByLabelText(campo)).toHaveValue('')
    }
  })

  it('el botón no se puede apretar con campos vacíos', async () => {
    // Mandar el formulario vacío sólo consigue un 400 que ya se podía evitar.
    montar()
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeDisabled()
  })
})

// Cerrar el diálogo. Es su propio caso porque **es donde se borra lo tipeado**:
// sin eso, la contraseña de alguien queda en el DOM hasta que se recargue la
// página, y vuelve a aparecer escrita si el diálogo se abre de nuevo.

describe('cerrar el diálogo', () => {
  function Contenedor() {
    // Controlado desde afuera, como lo monta el Layout: hace falta poder
    // cerrarlo y volver a abrirlo para ver qué quedó adentro.
    const [open, setOpen] = useState(true)
    return (
      <>
        <button onClick={() => setOpen(true)}>abrir de nuevo</button>
        <CambiarPassword open={open} onOpenChange={setOpen} />
      </>
    )
  }

  it('🔴 borra lo tipeado: la contraseña no sobrevive al cierre', async () => {
    const user = userEvent.setup()
    render(<Contenedor />)
    await user.type(screen.getByLabelText('Contraseña actual'), 'mi-secreto')
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('mi-secreto')

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await user.click(screen.getByRole('button', { name: 'abrir de nuevo' }))

    // Se mira al REABRIR y no después de cerrar: cerrado no hay nada que
    // mirar, así que la única forma de ver si quedó guardado es volver a entrar.
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
  })

  it('tampoco deja el error de la vez anterior', async () => {
    const user = userEvent.setup()
    render(<Contenedor />)
    await user.type(screen.getByLabelText('Contraseña actual'), 'x')
    await user.type(screen.getByLabelText('Contraseña nueva'), 'una')
    await user.type(screen.getByLabelText('Repetir la nueva'), 'otra')
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await user.click(screen.getByRole('button', { name: 'abrir de nuevo' }))
    expect(screen.queryByText(/no coinciden/i)).not.toBeInTheDocument()
  })
})

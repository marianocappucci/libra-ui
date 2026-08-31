// La sección "Email / SMTP" de Configuración: el tutorial, el formulario y el
// botón *Probar conexión*.
//
// El botón es lo nuevo. Vivía en el `Config.tsx` de Contalibra y de Restolibra
// —dos de ocho— contra un endpoint escrito en cada uno de esos productos; los
// otros seis configuraban el correo sin forma de saber si andaba. Lo que estos
// tests fijan es que el botón pegue **en el mismo `basePath` que el formulario
// usa para leer y guardar**: si pegara en otro, diría "Conectado" sobre un
// servidor y el correo saldría por el que configura la pantalla, que es
// exactamente la falla que Contalibra ya tuvo.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmailCard } from '../src/configuracion/email'
import { RUTA_SMTP_POR_DEFECTO } from '../src/ConfiguracionSmtp'

const ESTADO = {
  origen: 'base', host: 'smtp.empresa.test', port: 2525, user: 'cuenta',
  from_email: 'no-responder@empresa.test', from_name: 'Soporte',
  password_definida: true, password_indescifrable: false, configurado: true,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

/** Contesta el estado al `GET` y `respuestaProbar` al `POST .../probar`. */
function responder(respuestaProbar?: { cuerpo: unknown; status?: number }) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).endsWith('/probar')) {
      if (!respuestaProbar) return Promise.reject(new Error('nadie configuró la prueba'))
      return Promise.resolve(json(respuestaProbar.cuerpo, respuestaProbar.status ?? 200))
    }
    if (init?.method === 'PUT') return Promise.resolve(json(ESTADO))
    return Promise.resolve(json(ESTADO))
  })
}

async function montar(basePath?: string) {
  render(<EmailCard producto="MedLibra" {...(basePath ? { basePath } : {})} />)
  await waitFor(() => expect(screen.getByLabelText('Servidor')).toBeInTheDocument())
}

function urlDelProbar() {
  const llamada = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/probar'))
  return llamada ? String(llamada[0]) : null
}

describe('EmailCard', () => {
  it('sigue trayendo el tutorial de Gmail, con el nombre del producto', async () => {
    responder()
    await montar()

    expect(screen.getByText(
      '¿Cómo configurar Gmail con una contraseña de aplicación?')).toBeInTheDocument()
    // 🔑 El nombre del producto no se adivina: es el que hay que ponerle a la
    // contraseña de aplicación. Escribir "Contalibra" acá haría que MedLibra le
    // pida al cliente una contraseña llamada Contalibra.
    expect(screen.getByText('MedLibra')).toBeInTheDocument()
  })

  it('probar pega en el MISMO basePath que el formulario', async () => {
    responder({ cuerpo: { ok: true, host: 'smtp.empresa.test', port: 2525, user: 'cuenta' } })
    await montar('/api/config/smtp')

    await userEvent.click(screen.getByRole('button', { name: /Probar conexión/ }))

    await waitFor(() => expect(urlDelProbar()).toBe('/api/config/smtp/probar'))
  })

  it('sin basePath usa el mismo default que el formulario', async () => {
    responder({ cuerpo: { ok: true, host: 'smtp.empresa.test', port: 2525, user: 'cuenta' } })
    await montar()

    await userEvent.click(screen.getByRole('button', { name: /Probar conexión/ }))

    // Contra la constante, no contra la cadena escrita a mano: si el default
    // del formulario cambiara, este test tiene que seguir midiendo lo mismo.
    await waitFor(() => expect(urlDelProbar()).toBe(`${RUTA_SMTP_POR_DEFECTO}/probar`))
    // Control positivo de la constante: es la ruta que el formulario ya usó.
    expect(String(fetchMock.mock.calls[0][0])).toBe(RUTA_SMTP_POR_DEFECTO)
  })

  it('cuando conecta dice contra qué servidor y con qué casilla', async () => {
    responder({ cuerpo: { ok: true, host: 'smtp.empresa.test', port: 2525, user: 'cuenta' } })
    await montar()

    await userEvent.click(screen.getByRole('button', { name: /Probar conexión/ }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Conectado a smtp.empresa.test:2525 como cuenta.')
  })

  it('cuando falla, el motivo del servidor queda en pantalla', async () => {
    responder({
      cuerpo: {
        detail: 'Autenticación fallida. Si es Gmail, revisá que sea una '
          + 'contraseña de aplicación y no la de la cuenta.',
      },
      status: 401,
    })
    await montar()

    await userEvent.click(screen.getByRole('button', { name: /Probar conexión/ }))

    // Es el error que se ve siempre y el único que el cliente arregla solo: un
    // "no se pudo probar" genérico no le dice qué hacer.
    expect(await screen.findByRole('status')).toHaveTextContent('contraseña de aplicación')
  })

  it('el resultado anterior no sobrevive al siguiente click', async () => {
    // Si quedara en pantalla mientras corre la prueba nueva, un "Conectado"
    // viejo se leería como la respuesta a este click.
    responder({ cuerpo: { ok: true, host: 'smtp.empresa.test', port: 2525, user: 'cuenta' } })
    await montar()
    await userEvent.click(screen.getByRole('button', { name: /Probar conexión/ }))
    await screen.findByRole('status')

    let liberar: (() => void) | undefined
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith('/probar')) {
        return new Promise((resolve) => {
          liberar = () => resolve(json({ detail: 'No se pudo conectar: sin ruta' }, 502))
        })
      }
      return Promise.resolve(json(ESTADO))
    })

    await userEvent.click(screen.getByRole('button', { name: /Probando…|Probar conexión/ }))

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    liberar?.()
    expect(await screen.findByRole('status')).toHaveTextContent('sin ruta')
  })
})

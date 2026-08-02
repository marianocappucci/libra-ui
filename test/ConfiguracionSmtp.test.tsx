// Pantalla de configuración del correo saliente (v0.10.0).
//
// El grueso de estos tests está sobre UNA regla: que editar cualquier campo
// sin tocar la contraseña **no la borre**. El backend distingue "no me la
// mandes" de "borrala" por la presencia de la clave en el JSON, así que
// mandar `password: ''` porque el input está vacío —que es lo que sale
// natural— borraría la credencial guardada cada vez que alguien corrige el
// remitente. Es un bug silencioso: la pantalla responde 200 y el correo deja
// de salir recién la próxima vez que alguien pide un reset.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfiguracionSmtp, cuerpoAGuardar, type EstadoSmtp } from '../src/ConfiguracionSmtp'

const SIN_NADA: EstadoSmtp = {
  origen: 'entorno', host: '', port: 587, user: '', from_email: '', from_name: '',
  password_definida: false, password_indescifrable: false, configurado: false,
}

const GUARDADA: EstadoSmtp = {
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

function responde(estado: EstadoSmtp) {
  fetchMock.mockImplementation(() => Promise.resolve(json(estado)))
}

async function montar(estado: EstadoSmtp, basePath?: string) {
  responde(estado)
  render(<ConfiguracionSmtp {...(basePath ? { basePath } : {})} />)
  await waitFor(() => expect(screen.getByLabelText('Servidor')).toBeInTheDocument())
}

function cuerpoDelPut() {
  const llamada = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT')
  expect(llamada, 'no se hizo ningún PUT').toBeTruthy()
  return JSON.parse(llamada![1].body as string)
}

// ─────────────────── La regla: no borrar la contraseña sin querer ───────────

describe('cuerpoAGuardar', () => {
  const form = {
    host: 'smtp.test', port: '587', user: 'u',
    from_email: 'a@b.com', from_name: 'N',
  }

  it('OMITE la clave password si no se tipeó nada', () => {
    // Ausente != vacía. El backend deja la guardada como está.
    expect('password' in cuerpoAGuardar(form, '', false)).toBe(false)
  })

  it('la manda si se tipeó una', () => {
    expect(cuerpoAGuardar(form, 'nueva', false).password).toBe('nueva')
  })

  it('manda cadena vacía sólo si se pidió borrarla explícitamente', () => {
    expect(cuerpoAGuardar(form, '', true).password).toBe('')
  })

  it('borrar le gana a lo tipeado', () => {
    expect(cuerpoAGuardar(form, 'algo', true).password).toBe('')
  })

  it('recorta los espacios y convierte el puerto a número', () => {
    const c = cuerpoAGuardar({ ...form, host: '  smtp.test  ', port: '2525' }, '', false)
    expect(c.host).toBe('smtp.test')
    expect(c.port).toBe(2525)
  })

  it('un puerto vacío o inválido cae a 587 en vez de mandar NaN', () => {
    expect(cuerpoAGuardar({ ...form, port: '' }, '', false).port).toBe(587)
    expect(cuerpoAGuardar({ ...form, port: 'abc' }, '', false).port).toBe(587)
  })
})

describe('editar sin tocar la contraseña', () => {
  it('no la incluye en el PUT', async () => {
    await montar(GUARDADA)
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Servidor'))
    await user.type(screen.getByLabelText('Servidor'), 'smtp-nuevo.test')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(cuerpoDelPut().host).toBe('smtp-nuevo.test'))
    expect('password' in cuerpoDelPut()).toBe(false)
  })

  it('el campo avisa que hay una guardada en vez de aparentar estar vacío', async () => {
    await montar(GUARDADA)
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute(
      'placeholder', 'Guardada — dejalo vacío para no cambiarla',
    )
  })

  it('sin ninguna guardada no ofrece la opción de quitarla', async () => {
    await montar(SIN_NADA)
    expect(screen.queryByLabelText('Quitar la contraseña guardada')).not.toBeInTheDocument()
  })
})

// ─────────────────────────── Estado y carga ─────────────────────────────────

describe('estado', () => {
  it('dice que se están usando las variables de entorno cuando no hay nada guardado', async () => {
    await montar(SIN_NADA)
    expect(screen.getByText(/variables de entorno del servidor/)).toBeInTheDocument()
    expect(screen.getByText(/sin configurar/)).toBeInTheDocument()
  })

  it('precarga el formulario con lo guardado', async () => {
    await montar(GUARDADA)
    expect(screen.getByLabelText('Servidor')).toHaveValue('smtp.empresa.test')
    expect(screen.getByLabelText('Puerto')).toHaveValue(2525)
    expect(screen.getByLabelText('Usuario')).toHaveValue('cuenta')
    expect(screen.getByLabelText('Remitente')).toHaveValue('no-responder@empresa.test')
  })

  it('avisa en rojo si la contraseña guardada no se puede descifrar', async () => {
    await montar({ ...GUARDADA, password_indescifrable: true, configurado: false })
    expect(screen.getByText(/no se puede leer/)).toBeInTheDocument()
  })

  it('la contraseña nunca llega a la pantalla, así que el campo arranca vacío', async () => {
    await montar(GUARDADA)
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
  })
})

// ─────────────────────────── basePath ───────────────────────────────────────

describe('basePath', () => {
  it('usa /admin/smtp por defecto', async () => {
    await montar(SIN_NADA)
    expect(fetchMock.mock.calls[0][0]).toBe('/admin/smtp')
  })

  it('respeta el que le pasen (Contalibra/Restolibra montan otro)', async () => {
    await montar(SIN_NADA, '/api/config/smtp')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/config/smtp')
  })
})

// ─────────────────────────── Volver al entorno ──────────────────────────────

describe('borrar la configuración guardada', () => {
  it('sólo se ofrece si hay algo guardado', async () => {
    await montar(SIN_NADA)
    expect(screen.queryByRole('button', { name: /Borrar y usar la del servidor/ }))
      .not.toBeInTheDocument()
  })

  it('manda DELETE y vuelve a mostrar el origen entorno', async () => {
    await montar(GUARDADA)
    fetchMock.mockImplementation(() => Promise.resolve(json(SIN_NADA)))
    await userEvent.setup().click(
      screen.getByRole('button', { name: /Borrar y usar la del servidor/ }),
    )
    await waitFor(() =>
      expect(screen.getByText(/variables de entorno del servidor/)).toBeInTheDocument())
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true)
  })
})

// ─────────────────────────── Errores ────────────────────────────────────────

describe('errores', () => {
  it('no manda nada si falta el servidor', async () => {
    await montar(SIN_NADA)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('El servidor SMTP es obligatorio.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(false)
  })

  it('muestra el detalle que devuelve el backend', async () => {
    await montar(GUARDADA)
    fetchMock.mockImplementation(() =>
      Promise.resolve(json({ detail: 'Puerto SMTP invalido: 0.' }, 422)))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Puerto SMTP invalido: 0.')).toBeInTheDocument()
  })
})

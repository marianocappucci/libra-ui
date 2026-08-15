// Las dos pantallas de recuperación de contraseña. Su texto es delicado:
// no puede confirmar si una cuenta existe, porque eso convertiría el
// formulario en un buscador de usuarios dados de alta. Estos tests fijan
// justamente eso, además de los flujos.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createForgotPassword, createResetPassword } from '../src/PasswordReset'

const navegar = vi.fn()
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...real, useNavigate: () => navegar }
})

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
const responde = (body: unknown, status = 200) =>
  fetchMock.mockImplementation(() => Promise.resolve(json(body, status)))

// ───────────────────────── Olvidé mi contraseña ─────────────────────────

function montarOlvide(basePath?: string) {
  const ForgotPassword = createForgotPassword({
    productName: 'MedLibra', productInitial: 'M', ...(basePath ? { basePath } : {}),
  })
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>)
}

async function pedirEnlace(valor = 'ana') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Usuario o correo'), valor)
  await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
}

describe('ForgotPassword', () => {
  it('pide usuario o correo, no solo uno de los dos', () => {
    // Quien perdió la contraseña no tiene por qué recordar con cuál se dio
    // de alta -- el backend acepta cualquiera de los dos.
    montarOlvide()
    expect(screen.getByLabelText('Usuario o correo')).toBeInTheDocument()
  })

  it('manda el identificador al endpoint del motor', async () => {
    responde({ ok: true })
    montarOlvide()
    await pedirEnlace('ana@test.com')
    expect(fetchMock.mock.calls[0][0]).toBe('/auth/forgot-password')
    expect(fetchMock.mock.calls[0][1].body).toBe('{"identificador":"ana@test.com"}')
  })

  it('respeta el basePath propio del producto', async () => {
    // Contalibra/Restolibra montan sus endpoints bajo /api, no /auth.
    responde({ ok: true })
    montarOlvide('/api')
    await pedirEnlace()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/forgot-password')
  })

  it('el mensaje de éxito NO confirma que la cuenta exista', async () => {
    responde({ ok: true })
    montarOlvide()
    await pedirEnlace()
    const mensaje = await screen.findByText(/Si hay una cuenta con ese usuario o correo/)
    expect(mensaje).toBeInTheDocument()
    // Un "te enviamos un mail a ana@…" delataría que la cuenta existe,
    // justo lo que el backend evita respondiendo igual en los dos casos.
    expect(screen.queryByText(/^Te enviamos/)).not.toBeInTheDocument()
    expect(screen.getByText(/vence en una hora/)).toBeInTheDocument()
  })

  it('un 503 avisa que falta configurar el correo', async () => {
    // No depende de si la cuenta existe, así que decirlo no filtra nada, y
    // callarlo dejaría a la persona esperando un mail que nadie va a mandar.
    responde({ detail: 'El envío de correo no está configurado.' }, 503)
    montarOlvide()
    await pedirEnlace()
    expect(await screen.findByText(/El envío de correo no está configurado en este sistema/)).toBeInTheDocument()
  })

  it('otros errores muestran un mensaje genérico y dejan reintentar', async () => {
    responde({ detail: 'boom' }, 500)
    montarOlvide()
    await pedirEnlace()
    expect(await screen.findByText(/No pudimos procesar el pedido/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeEnabled()
  })

  it('ofrece volver al login', () => {
    montarOlvide()
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/login')
  })
})

// ────────────────────────── Elegir contraseña ───────────────────────────

function montarReset(query: string, minLength?: number) {
  const ResetPassword = createResetPassword({
    productName: 'MedLibra', productInitial: 'M',
    ...(minLength ? { minLength } : {}),
  })
  render(
    <MemoryRouter initialEntries={[`/reset-password${query}`]}>
      <ResetPassword />
    </MemoryRouter>,
  )
}

async function guardar(nueva: string, repetida: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Contraseña nueva'), nueva)
  await user.type(screen.getByLabelText('Repetir contraseña'), repetida)
  await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
}

describe('ResetPassword', () => {
  it('sin token en la URL explica el problema en vez de fallar', async () => {
    montarReset('')
    expect(screen.getByText(/no trae el código de recuperación/)).toBeInTheDocument()
    // Y no muestra el formulario, que sin token no serviría de nada.
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument()
  })

  it('con token muestra el formulario', () => {
    montarReset('?token=abc123')
    expect(screen.getByLabelText('Contraseña nueva')).toBeInTheDocument()
    expect(screen.getByLabelText('Repetir contraseña')).toBeInTheDocument()
  })

  it('los dos campos usan el ojito', () => {
    montarReset('?token=abc123')
    expect(screen.getAllByRole('button', { name: 'Mostrar contraseña' })).toHaveLength(2)
  })

  it('si las contraseñas no coinciden NO llama a la API', async () => {
    montarReset('?token=abc123')
    await guardar('secreta-1', 'secreta-2')
    expect(await screen.findByText('Las dos contraseñas no coinciden.')).toBeInTheDocument()
    // La repetición es una confirmación de tipeo, no una regla de dominio:
    // el backend ni la recibe, así que chequearla acá evita un viaje inútil.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('manda token y contraseña nueva al motor', async () => {
    responde({ id: '1', username: 'ana' })
    montarReset('?token=abc123')
    await guardar('secreta-nueva', 'secreta-nueva')
    expect(fetchMock.mock.calls[0][0]).toBe('/auth/reset-password')
    expect(fetchMock.mock.calls[0][1].body).toBe('{"token":"abc123","new_password":"secreta-nueva"}')
  })

  it('al terminar avisa que ya puede entrar con la nueva', async () => {
    responde({ id: '1', username: 'ana' })
    montarReset('?token=abc123')
    await guardar('secreta-nueva', 'secreta-nueva')
    // El backend NO crea sesión a propósito: entrar con la contraseña
    // nueva es lo que confirma que quedó bien.
    expect(await screen.findByText(/Ya podés entrar con tu contraseña nueva/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al inicio de sesión' })).toBeInTheDocument()
  })

  it('un token vencido o usado lo dice claro', async () => {
    responde({ detail: 'El enlace no es válido o ya venció.' }, 400)
    montarReset('?token=viejo')
    await guardar('secreta-nueva', 'secreta-nueva')
    expect(await screen.findByText(/El enlace no es válido o ya venció. Pedí uno nuevo./)).toBeInTheDocument()
  })

  it('otros errores de la API muestran su detalle', async () => {
    // Ej. el 422 por contraseña demasiado corta: el texto del backend es
    // más útil que uno genérico.
    responde({ detail: 'La contraseña debe tener al menos 6 caracteres.' }, 422)
    montarReset('?token=abc123')
    await guardar('corta', 'corta')
    expect(await screen.findByText('La contraseña debe tener al menos 6 caracteres.')).toBeInTheDocument()
  })

  it('un fallo de red se distingue de un rechazo de la API', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    montarReset('?token=abc123')
    await guardar('secreta-nueva', 'secreta-nueva')
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
  })

  it('el mínimo de caracteres es configurable y se muestra', () => {
    montarReset('?token=abc123', 10)
    expect(screen.getByText('Mínimo 10 caracteres.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('minlength', '10')
  })
})

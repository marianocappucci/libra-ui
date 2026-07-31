// La pantalla de login de los 6 productos. Lo que importa acá es lo que
// ve el usuario cuando algo falla, y el enlace de recuperación, que es
// **opt-in** a propósito.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createLogin } from '../src/Login'
import { ApiError } from '../src/api-client'

const navegar = vi.fn()
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...real, useNavigate: () => navegar }
})

type UsuarioDePrueba = { id: string; username: string; role: string }

function montar({
  login = vi.fn().mockResolvedValue({ id: '1', username: 'ana', role: 'admin' }),
  ...config
}: {
  login?: ReturnType<typeof vi.fn>
  forgotPasswordPath?: string
  onLoginSuccess?: (u: UsuarioDePrueba) => string
  formatError?: (e: ApiError) => string
} = {}) {
  const Login = createLogin<UsuarioDePrueba>({
    productName: 'Contalibra',
    productInitial: 'C',
    redirectTo: '/dashboard',
    useAuth: () => ({ login }),
    ...config,
  })
  render(<MemoryRouter><Login /></MemoryRouter>)
  return { login }
}

async function completarYEnviar() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Usuario'), 'ana')
  await user.type(screen.getByLabelText('Contraseña'), 'clave')
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('render', () => {
  it('muestra el branding del producto', () => {
    montar()
    expect(screen.getByRole('heading', { name: 'Contalibra' })).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('el campo de contraseña usa el ojito compartido', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument()
  })
})

describe('el enlace de recuperación es opt-in', () => {
  it('sin forgotPasswordPath NO se muestra', () => {
    // Deliberado: la recuperación también es opt-in en el backend, y
    // mostrar el link en un producto que no la tiene prendida seria un
    // enlace a un 404.
    montar()
    expect(screen.queryByText('¿Olvidaste tu contraseña?')).not.toBeInTheDocument()
  })

  it('con forgotPasswordPath se muestra y apunta ahí', () => {
    montar({ forgotPasswordPath: '/forgot-password' })
    const enlace = screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })
    expect(enlace).toHaveAttribute('href', '/forgot-password')
  })
})

describe('envío', () => {
  it('llama a login con lo tipeado y navega al destino', async () => {
    const { login } = montar()
    await completarYEnviar()
    expect(login).toHaveBeenCalledWith('ana', 'clave')
    expect(navegar).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('onLoginSuccess decide el destino según el usuario', async () => {
    // Lo usa Restolibra para mandar al rol `mozo` a su propia pantalla.
    montar({
      login: vi.fn().mockResolvedValue({ id: '9', username: 'pepe', role: 'mozo' }),
      onLoginSuccess: (u) => (u.role === 'mozo' ? '/salon' : '/dashboard'),
    })
    await completarYEnviar()
    expect(navegar).toHaveBeenCalledWith('/salon', { replace: true })
  })

  it('deshabilita el botón mientras envía', async () => {
    let resolver: (v: unknown) => void = () => {}
    montar({ login: vi.fn(() => new Promise((r) => { resolver = r })) })
    await completarYEnviar()
    // Sin esto, un doble click manda dos logins.
    expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled()
    // Se resuelve DENTRO de act y se espera el re-render: soltar la
    // promesa al final del test deja un setState fuera de act, que React
    // avisa por consola. Un warning tolerado hoy es un warning que tapa
    // uno real mañana.
    await act(async () => {
      resolver({ id: '1', username: 'ana', role: 'admin' })
    })
  })
})

describe('errores', () => {
  it('un ApiError muestra el mensaje genérico por defecto', async () => {
    montar({ login: vi.fn().mockRejectedValue(new ApiError(401, 'Usuario o contraseña incorrectos')) })
    await completarYEnviar()
    // Genérico a propósito: distinguir "no existe" de "clave mala" le
    // diría a un atacante qué usuarios están dados de alta.
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument()
    expect(navegar).not.toHaveBeenCalled()
  })

  it('formatError permite mostrar el detalle real del backend', async () => {
    // Contalibra/Restolibra lo usan para mensajes como "Cuenta suspendida".
    montar({
      login: vi.fn().mockRejectedValue(new ApiError(403, 'Cuenta suspendida')),
      formatError: (e) => e.detail,
    })
    await completarYEnviar()
    expect(await screen.findByText('Cuenta suspendida')).toBeInTheDocument()
  })

  it('un error que NO es de la API se reporta como problema de conexión', async () => {
    montar({ login: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    await completarYEnviar()
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
  })

  it('el botón vuelve a habilitarse tras un error', async () => {
    montar({ login: vi.fn().mockRejectedValue(new ApiError(401, 'mal')) })
    await completarYEnviar()
    await screen.findByText('Usuario o contraseña incorrectos.')
    // Si quedara deshabilitado, el usuario no podría reintentar.
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled()
  })

  it('el error anterior se limpia al reintentar', async () => {
    const login = vi.fn()
      .mockRejectedValueOnce(new ApiError(401, 'mal'))
      .mockResolvedValueOnce({ id: '1', username: 'ana', role: 'admin' })
    montar({ login })
    await completarYEnviar()
    await screen.findByText('Usuario o contraseña incorrectos.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(screen.queryByText('Usuario o contraseña incorrectos.')).not.toBeInTheDocument()
  })
})

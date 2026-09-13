// El contexto de sesion de los 6 productos: quien esta logueado, y que
// pasa cuando la cookie no sirve.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthContext, SegundoFactorRequerido } from '../src/AuthContext'

type UsuarioDePrueba = { id: string; username: string; role: string }

const { AuthProvider, useAuth } = createAuthContext<UsuarioDePrueba>({
  mePath: '/api/me',
  loginPath: '/api/login',
  logoutPath: '/api/logout',
})

function Pantalla() {
  const { user, loading, login, logout } = useAuth()
  if (loading) return <p>cargando</p>
  return (
    <div>
      <p data-testid="quien">{user ? user.username : 'nadie'}</p>
      <button onClick={() => login('ana', 'clave').catch(() => {})}>entrar</button>
      <button onClick={() => logout()}>salir</button>
    </div>
  )
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('sesion al montar', () => {
  it('con cookie valida deja al usuario logueado', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json({ id: '1', username: 'ana', role: 'admin' })),
    )
    render(<AuthProvider><Pantalla /></AuthProvider>)
    // Mientras consulta /api/me muestra "cargando": sin ese estado, la app
    // parpadearia hacia el login antes de saber si hay sesion.
    expect(screen.getByText('cargando')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('ana'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me')
  })

  it('sin sesion (401) termina de cargar con user en null', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'No autenticado' }, 401)))
    render(<AuthProvider><Pantalla /></AuthProvider>)
    // Lo importante es que SALGA de loading: si se quedara cargando, la
    // app no llegaria nunca a mostrar el login.
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('nadie'))
  })

  it('si la red falla tampoco queda colgado en loading', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    render(<AuthProvider><Pantalla /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('nadie'))
  })
})

describe('login y logout', () => {
  it('un login exitoso deja al usuario en el contexto', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(json({ detail: 'No autenticado' }, 401)))
      .mockImplementationOnce(() => Promise.resolve(json({ id: '1', username: 'ana', role: 'admin' })))
    render(<AuthProvider><Pantalla /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('nadie'))

    await user.click(screen.getByText('entrar'))
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('ana'))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/login')
    expect(fetchMock.mock.calls[1][1].body).toBe('{"username":"ana","password":"clave"}')
  })

  it('un login fallido NO deja usuario', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'Usuario o contraseña incorrectos' }, 401)))
    render(<AuthProvider><Pantalla /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('nadie'))

    await user.click(screen.getByText('entrar'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('quien')).toHaveTextContent('nadie')
  })

  it('logout limpia el usuario', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(() => Promise.resolve(json({ id: '1', username: 'ana', role: 'admin' })))
    render(<AuthProvider><Pantalla /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('ana'))

    await user.click(screen.getByText('salir'))
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('nadie'))
    expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/logout')
  })
})

describe('la factory respeta las rutas de cada producto', () => {
  it('usa los paths que se le configuran', async () => {
    // Contalibra/Restolibra usan /api/*, los otros tres /auth/* -- es la
    // razon de ser de `createAuthContext`.
    const propio = createAuthContext<UsuarioDePrueba>({
      mePath: '/auth/me', loginPath: '/auth/login', logoutPath: '/auth/logout',
    })
    function Sonda() {
      const { loading } = propio.useAuth()
      return <p>{loading ? 'cargando' : 'listo'}</p>
    }
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'x' }, 401)))
    render(<propio.AuthProvider><Sonda /></propio.AuthProvider>)
    await waitFor(() => expect(screen.getByText('listo')).toBeInTheDocument())
    expect(fetchMock.mock.calls[0][0]).toBe('/auth/me')
  })

  it('useAuth fuera del provider avisa con un error claro', () => {
    // Sin esta guarda el sintoma seria un "cannot read property of null"
    // en cualquier lado.
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Suelto() {
      useAuth()
      return null
    }
    expect(() => render(<Suelto />)).toThrow('useAuth debe usarse dentro de AuthProvider')
    silenciar.mockRestore()
  })
})

describe('login con `extra` (v0.60.0, el código del segundo factor)', () => {
  it('lo manda en el cuerpo junto a usuario y contraseña, y éstos ganan', async () => {
    function ConCodigo() {
      const { login } = useAuth()
      return (
        <button onClick={() => login('ana', 'clave', { codigo: '123456', username: 'pisado' }).catch(() => {})}>
          entrar-con-codigo
        </button>
      )
    }
    const user = userEvent.setup()
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(json({ detail: 'No autenticado' }, 401)))
      .mockImplementationOnce(() => Promise.resolve(json({ id: '1', username: 'ana', role: 'admin' })))
    render(<AuthProvider><ConCodigo /></AuthProvider>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.click(screen.getByText('entrar-con-codigo'))
    // Al menos dos: al quedar logueado, el GateTerminos pide `/terminos` y
    // suma una tercera llamada, que no es la que se mide acá.
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/login')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body))
      .toEqual({ codigo: '123456', username: 'ana', password: 'clave' })
  })
})

// ── El login en dos pasos (v0.70.0) ─────────────────────────────────────────
//
// El backend contesta `{ requiere_codigo: true, desafio }` en vez de un
// usuario cuando falta el segundo factor -- se distingue por la FORMA de la
// respuesta, no por el status (los dos casos son 200). `login` tiene que
// lanzar `SegundoFactorRequerido` SIN tocar `user`, y `confirmarCodigo` es
// quien deja la sesión puesta una vez que el código es correcto.
describe('el login en dos pasos (v0.70.0)', () => {
  it('login lanza SegundoFactorRequerido y NO setea usuario', async () => {
    const propio = createAuthContext<UsuarioDePrueba>({
      mePath: '/auth/me', loginPath: '/auth/login', logoutPath: '/auth/logout',
      segundoFactorPath: '/auth/verificar',
    })
    let capturado: unknown
    function Pantalla2() {
      const { user, login } = propio.useAuth()
      return (
        <div>
          <p data-testid="quien">{user ? user.username : 'nadie'}</p>
          <button onClick={() => login('ana', 'clave').catch((e) => { capturado = e })}>entrar</button>
        </div>
      )
    }
    const user = userEvent.setup()
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(json({ detail: 'No autenticado' }, 401))) // /auth/me
      .mockImplementationOnce(() => Promise.resolve(json({ requiere_codigo: true, desafio: 'desafio-abc' })))
    render(<propio.AuthProvider><Pantalla2 /></propio.AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('nadie'))

    await user.click(screen.getByText('entrar'))

    await waitFor(() => expect(capturado).toBeInstanceOf(SegundoFactorRequerido))
    expect((capturado as SegundoFactorRequerido).desafio).toBe('desafio-abc')
    // 🔴 Lo que rompería en silencio: si `login` igual hiciera `setUser` con
    // la respuesta `{ requiere_codigo, desafio }`, la pantalla mostraría una
    // sesión "logueada" con un usuario que no existe.
    expect(screen.getByTestId('quien')).toHaveTextContent('nadie')
  })

  it('confirmarCodigo postea {desafio, codigo} a segundoFactorPath y setea el usuario', async () => {
    const propio = createAuthContext<UsuarioDePrueba>({
      mePath: '/auth/me', loginPath: '/auth/login', logoutPath: '/auth/logout',
      segundoFactorPath: '/auth/verificar',
    })
    function Pantalla2() {
      const { user, confirmarCodigo } = propio.useAuth()
      return (
        <div>
          <p data-testid="quien">{user ? user.username : 'nadie'}</p>
          <button onClick={() => confirmarCodigo('desafio-abc', '123456').catch(() => {})}>verificar</button>
        </div>
      )
    }
    const user = userEvent.setup()
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(json({ detail: 'No autenticado' }, 401))) // /auth/me
      .mockImplementationOnce(() => Promise.resolve(json({ id: '1', username: 'ana', role: 'admin' })))
    render(<propio.AuthProvider><Pantalla2 /></propio.AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('nadie'))

    await user.click(screen.getByText('verificar'))

    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('ana'))
    expect(fetchMock.mock.calls[1][0]).toBe('/auth/verificar')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ desafio: 'desafio-abc', codigo: '123456' })
  })

  it('confirmarCodigo sin `segundoFactorPath` configurado tira un error claro', async () => {
    // La instancia por defecto (`AuthProvider`/`useAuth`) no lo configura --
    // es justo el caso de los seis productos sin 2FA.
    let capturado: unknown
    function Pantalla2() {
      const { confirmarCodigo } = useAuth()
      return <button onClick={() => confirmarCodigo('d', '123456').catch((e) => { capturado = e })}>verificar</button>
    }
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'x' }, 401)))
    render(<AuthProvider><Pantalla2 /></AuthProvider>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const user = userEvent.setup()
    await user.click(screen.getByText('verificar'))

    await waitFor(() => expect(capturado).toBeInstanceOf(Error))
    expect((capturado as Error).message).toMatch(/segundoFactorPath/)
  })
})

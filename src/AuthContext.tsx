// v0.3.0 (2026-07-27): generalizado a factory `createAuthContext<TUser>()`
// para soportar productos con rutas de auth y forma de `User` distintas
// (Contalibra/Restolibra usan /api/me,/api/login,/api/logout y un `User`
// propio con `nombre`/`modulos`/`role` extendido -- Gestiolibra/MedLibra/
// VentaLibra usan /auth/*). Se mantiene una instancia pre-configurada bajo
// los mismos nombres de siempre (`AuthProvider`/`useAuth`) para que esos
// tres consumidores no cambien una linea. Ver wiki/entities/libra-ui.md.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type User } from './api-client'

export type AuthContextValue<TUser> = {
  user: TUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<TUser>
  logout: () => Promise<void>
}

export function createAuthContext<TUser>(config: {
  mePath: string
  loginPath: string
  logoutPath: string
}) {
  const AuthContext = createContext<AuthContextValue<TUser> | null>(null)

  function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<TUser | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      api.get<TUser>(config.mePath)
        .then(setUser)
        .catch(() => setUser(null))
        .finally(() => setLoading(false))
    }, [])

    async function login(username: string, password: string) {
      const loggedIn = await api.post<TUser>(config.loginPath, { username, password })
      setUser(loggedIn)
      return loggedIn
    }

    async function logout() {
      await api.post(config.logoutPath)
      setUser(null)
    }

    return (
      <AuthContext.Provider value={{ user, loading, login, logout }}>
        {children}
      </AuthContext.Provider>
    )
  }

  function useAuth(): AuthContextValue<TUser> {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
    return ctx
  }

  return { AuthProvider, useAuth }
}

// Instancia por defecto (mismas rutas/tipo que la version pre-v0.3.0) --
// Gestiolibra/MedLibra/VentaLibra siguen importando estos dos nombres tal
// cual, sin usar la factory.
const _default = createAuthContext<User>({
  mePath: '/auth/me',
  loginPath: '/auth/login',
  logoutPath: '/auth/logout',
})

export const AuthProvider = _default.AuthProvider
export const useAuth = _default.useAuth

export { ApiError }

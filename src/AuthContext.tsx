// v0.3.0 (2026-07-27): generalizado a factory `createAuthContext<TUser>()`
// para soportar productos con rutas de auth y forma de `User` distintas
// (Contalibra/Restolibra usan /api/me,/api/login,/api/logout y un `User`
// propio con `nombre`/`modulos`/`role` extendido -- Gestiolibra/MedLibra/
// VentaLibra usan /auth/*). Se mantiene una instancia pre-configurada bajo
// los mismos nombres de siempre (`AuthProvider`/`useAuth`) para que esos
// tres consumidores no cambien una linea. Ver wiki/entities/libra-ui.md.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type User } from './api-client'
import { GateTerminos } from './Terminos'

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
  /** Prefijo del router de Términos del backend (`libraauth.terminos`).
   *  Default `/terminos`; Contalibra y Restolibra sirven su API bajo `/api`. */
  terminosPath?: string
  /** Apaga el gate de Términos para este contexto.
   *
   *  🔴 Existe para el backoffice de superadmin, que administra instancias
   *  ajenas y no tiene contrato propio que aceptar. **No usarlo en un producto
   *  de cliente**: la pantalla es lo único que le da forma de aceptar, y sin
   *  ella el 403 del backend deja la instancia sin salida. */
  sinGateDeTerminos?: boolean
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

    // 🔑 **El gate vive acá y no en cada producto** por lo mismo que la sesión
    // vencida vive en `api-client`: son ocho productos y más de cuarenta
    // pantallas, y el que se olvide de envolverse no falla — se queda sin gate,
    // que es la única de las dos mitades que se nota.
    //
    // Va ADENTRO del Provider: la pantalla necesita `useAuth()` para poder
    // ofrecer "cerrar sesión" a quien no tiene facultades para aceptar.
    return (
      <AuthContext.Provider value={{ user, loading, login, logout }}>
        {config.sinGateDeTerminos ? children : (
          <GateTerminos
            // Sólo con sesión: sin usuario, `GET /terminos` contesta 401 y no
            // hay a quién pedirle una aceptación. La pantalla de login no se
            // puede bloquear con esto.
            activo={!!user}
            basePath={config.terminosPath ?? '/terminos'}
            onSalir={() => { void logout() }}
          >
            {children}
          </GateTerminos>
        )}
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

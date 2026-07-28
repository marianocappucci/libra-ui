// Cliente HTTP delgado sobre la API JSON del producto. Cookie de sesion
// manejada por el browser via `credentials: "include"` -- en dev el proxy
// de Vite mantiene todo en el mismo origen para que la cookie funcione sin
// CORS; en produccion el build del frontend se sirve desde el mismo
// proceso FastAPI, tambien mismo origen.
//
// Extraido 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// bloque (ApiError + request<T> + el objeto api con get/post/put/del) era
// byte-idéntico -- ver wiki/analyses/auditoria-duplicacion-familia-libra.md.
// Cada producto sigue teniendo su propio `src/api.ts` con sus tipos y
// endpoints propios, re-exportando esto desde acá.

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : undefined

  if (!response.ok) {
    const detail = (data && typeof data === 'object' && 'detail' in data)
      ? String((data as { detail: unknown }).detail)
      : response.statusText
    throw new ApiError(response.status, detail)
  }

  return data as T
}

async function requestForm<T>(method: string, path: string, form: FormData): Promise<T> {
  const response = await fetch(path, { method, credentials: 'include', body: form })
  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : undefined
  if (!response.ok) {
    const detail = (data && typeof data === 'object' && 'detail' in data)
      ? String((data as { detail: unknown }).detail)
      : response.statusText
    throw new ApiError(response.status, detail)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  // Uploads (logo, certificados, restore de DB) -- multipart, sin
  // Content-Type explicito para que el browser agregue el boundary.
  postForm: <T>(path: string, form: FormData) => requestForm<T>('POST', path, form),
}

// Contrato id/username/name/role/active devuelto por
// libracore.auth.build_json_api_auth_router() (POST /auth/login, GET
// /auth/me) y libracore.db.usuarios.UserRepository -- idéntico en los
// tres productos que consumen este paquete.
export type User = {
  id: string
  username: string
  name: string
  role: 'admin' | 'staff'
  active: boolean
}

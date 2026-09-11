// Lo que comparten el login y «olvidé mi contraseña» para el captcha (v0.69.0):
// la sonda y el estado. El recuadro en sí está en `CampoCaptcha.tsx`, aparte
// para que cada archivo exporte una sola clase de cosa (fast refresh).
//
// **Opt-in y condicionado en runtime**, igual que `demoPath` y `totpPath`: la
// pantalla sólo dibuja el recuadro si la sonda contesta con la FORMA de un
// desafío ALTCHA (`parameters` + `signature`). Un 200 no alcanza —el catch-all
// de la SPA devuelve 200 con el index.html a cualquier ruta—, y la misma
// imagen corre con y sin captcha según cómo el producto monte el router.
import { useCallback, useEffect, useState } from 'react'
import { api } from './api-client'

export function esDesafio(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false
  const desafio = info as { parameters?: unknown; signature?: unknown }
  return typeof desafio.parameters === 'object' && desafio.parameters !== null
    && typeof desafio.signature === 'string'
}

export type EstadoCaptcha = {
  // `true` sólo si la sonda confirmó que el backend emite desafíos.
  activo: boolean
  path?: string
  // La solución vigente; '' mientras no se tildó o si venció.
  payload: string
  setPayload: (payload: string) => void
  // Cada intento gasta el desafío en el servidor, así que después de uno
  // fallido hay que resolver otro: esto remonta el widget.
  reiniciar: () => void
  intento: number
}

export function useCaptcha(path?: string): EstadoCaptcha {
  const [activo, setActivo] = useState(false)
  const [payload, setPayload] = useState('')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!path) return
    let vivo = true
    api.get<unknown>(path)
      .then((info) => { if (vivo && esDesafio(info)) setActivo(true) })
      // Un producto sin captcha contesta 404 o el index.html: no es un error.
      .catch(() => {})
    return () => { vivo = false }
  }, [path])

  const reiniciar = useCallback(() => {
    setPayload('')
    setIntento((n) => n + 1)
  }, [])

  return { activo, path, payload, setPayload, reiniciar, intento }
}

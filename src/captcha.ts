// Lo que comparten el login y «olvidé mi contraseña» para el captcha (v0.69.0):
// la sonda y el estado. El recuadro en sí está en `CampoCaptcha.tsx`, aparte
// para que cada archivo exporte una sola clase de cosa (fast refresh).
//
// **Opt-in y condicionado en runtime**, igual que `demoPath` y `totpPath`: la
// pantalla sólo dibuja el recuadro si la sonda contesta con la FORMA de un
// desafío ALTCHA (`parameters` + `signature`). Un 200 no alcanza —el catch-all
// de la SPA devuelve 200 con el index.html a cualquier ruta—, y la misma
// imagen corre con y sin captcha según cómo el producto monte el router.
//
// **En un nodo de LibraEdge no hay captcha** (v0.177.0, ADR-091; libraauth
// v0.55.0, ADR-028): el servidor contesta `{ "requerido": false }` en vez del
// desafío, y el widget no se dibuja ni se exige para habilitar «Ingresar». El
// widget necesita WebCrypto (`crypto.subtle`), que el navegador sólo da en https
// o `localhost`, y a un nodo se entra por `http://<IP-LAN>:8000`. La regla del
// cliente es una sola: *hay captcha si y sólo si la respuesta es un desafío y no
// dice `requerido: false`*. Una consulta que falla, o que no es un desafío, deja
// el captcha apagado (el comportamiento de siempre).
import { useCallback, useEffect, useState } from 'react'
import { api } from './api-client'

export function esDesafio(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false
  const desafio = info as { parameters?: unknown; signature?: unknown }
  return typeof desafio.parameters === 'object' && desafio.parameters !== null
    && typeof desafio.signature === 'string'
}

// La respuesta de la sonda dice que hace falta resolver un desafío. `requerido:
// false` manda aunque venga también la forma de un desafío: es la forma explícita
// con que un nodo de LibraEdge dice «acá no se pide».
export function captchaRequerido(info: unknown): boolean {
  if (!esDesafio(info)) return false
  return (info as { requerido?: unknown }).requerido !== false
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
      .then((info) => { if (vivo && captchaRequerido(info)) setActivo(true) })
      // Un producto sin captcha contesta 404 o el index.html, y un nodo de LibraEdge
      // `{ requerido: false }`: ninguno es un error.
      .catch(() => {})
    return () => { vivo = false }
  }, [path])

  const reiniciar = useCallback(() => {
    setPayload('')
    setIntento((n) => n + 1)
  }, [])

  return { activo, path, payload, setPayload, reiniciar, intento }
}

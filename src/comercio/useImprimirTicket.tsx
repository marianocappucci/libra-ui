// Hook único para el botón «Imprimir ticket», compartido por `Ventas.tsx`
// (listado) y `VentaDetalle.tsx`. Antes cada vista era un `<a target="_blank">`
// a la ruta del ticket: cuando la venta no es imprimible (p. ej. un borrador
// descartado) el backend responde 409 con `{"detail": "..."}` y la pestaña
// nueva mostraba ese JSON crudo en vez de un aviso legible.
//
// La regla de qué estados se pueden imprimir es del backend, no de este kit
// —acá sólo se traduce la respuesta a un diálogo o a la apertura del PDF.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const MENSAJE_GENERICO = 'No se pudo abrir el ticket.'
const MENSAJE_NO_ENCONTRADA = 'No se encontró la venta.'
const MENSAJE_POPUP_BLOQUEADO = 'El navegador bloqueó la ventana del ticket. Permití las ventanas emergentes para este sitio y volvé a intentar.'

/** Primera letra en mayúscula y punto final, si no lo tiene ya —así
 *  "solo se imprime…" del backend queda "Solo se imprime… confirmada." */
function capitalizarConPunto(texto: string): string {
  const t = texto.trim()
  if (!t) return MENSAJE_GENERICO
  const conMayuscula = t[0].toUpperCase() + t.slice(1)
  return /[.!?]$/.test(conMayuscula) ? conMayuscula : `${conMayuscula}.`
}

/** El `detail` de una respuesta no-ok, legible. Tolera un cuerpo que no sea
 *  JSON (o que no tenga `detail` de texto): ahí queda el mensaje genérico. */
async function detalleDelError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    const detail = (data as { detail?: unknown })?.detail
    if (typeof detail === 'string' && detail.trim()) return capitalizarConPunto(detail)
  } catch {
    // Cuerpo vacío o no-JSON: no hay nada que leer.
  }
  return MENSAJE_GENERICO
}

/** `imprimir(url)` pide el ticket con las mismas credenciales que
 *  `src/api-client` (cookie de sesión, mismo origen); `dialogo` es el JSX del
 *  aviso a montar una sola vez en cada pantalla que use `imprimir`. */
export function useImprimirTicket() {
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function imprimir(url: string) {
    let response: Response
    try {
      response = await fetch(url, { credentials: 'include' })
    } catch {
      setMensaje(MENSAJE_GENERICO)
      return
    }
    if (response.status === 404) {
      // El 404 de los backends viene en inglés ("Not Found", "sale not
      // found"): no es un texto para mostrarle al comercio.
      setMensaje(MENSAJE_NO_ENCONTRADA)
      return
    }
    if (!response.ok) {
      setMensaje(await detalleDelError(response))
      return
    }
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    // El `window.open` va después de un `await`: si el pedido tarda más que la
    // ventana de activación del click, el navegador lo trata como popup y lo
    // bloquea (devuelve null). Antes era un link y eso no pasaba, así que se
    // avisa en vez de no hacer nada.
    if (!window.open(blobUrl, '_blank')) {
      URL.revokeObjectURL(blobUrl)
      setMensaje(MENSAJE_POPUP_BLOQUEADO)
      return
    }
    // La pestaña ya cargó el PDF desde el blob; liberarlo después.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }

  const dialogo = (
    <Dialog open={mensaje !== null} onOpenChange={(open) => { if (!open) setMensaje(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>No se puede imprimir el ticket</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{mensaje}</p>
        <DialogFooter>
          <Button onClick={() => setMensaje(null)}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { imprimir, dialogo }
}

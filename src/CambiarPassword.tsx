/** El diálogo de "cambiar mi contraseña", para el menú de usuario.
 *
 *  Habla con `POST /auth/change-password` (libraauth v0.25.0). Hasta ahí, la
 *  única forma de cambiar la propia clave era **salir de la aplicación** y
 *  esperar el mail de `/auth/forgot-password`: un rodeo por el SMTP para algo
 *  que, estando logueado, no lo necesita.
 *
 *  Vive en libra-ui y no en un producto porque el endpoint es del motor de auth
 *  que usan los cuatro, y porque el menú que lo abre también es de acá — que uno
 *  de los seis se escriba su propio diálogo es exactamente cómo se llega a seis
 *  formularios distintos para la misma operación.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PasswordInput } from './PasswordInput'
import { api } from './api-client'

export function CambiarPassword({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  function limpiar() {
    setActual(''); setNueva(''); setRepetida('')
    setError(null); setListo(false)
  }

  async function guardar() {
    setError(null)
    // La repetición se valida acá y no en el backend: es un error de tipeo del
    // formulario, no una regla del dominio. El servidor no tiene forma de saber
    // cuál de las dos era la que la persona quiso poner.
    if (nueva !== repetida) {
      setError('Las dos contraseñas nuevas no coinciden.')
      return
    }
    setGuardando(true)
    try {
      await api.post('/auth/change-password', {
        current_password: actual, new_password: nueva,
      })
      // Se avisa y se limpia, pero **no se cierra solo**: cerrar el diálogo en
      // el mismo movimiento deja la duda de si llegó a guardarse. Y se limpian
      // los campos para que la contraseña no quede escrita en el DOM.
      setListo(true)
      setActual(''); setNueva(''); setRepetida('')
    } catch (e) {
      // El mensaje del backend tal cual: distingue "la actual no es correcta"
      // de "la nueva es muy corta", y reemplazarlo por uno genérico obligaría a
      // adivinar cuál de los dos campos corregir.
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) limpiar(); onOpenChange(v) }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Pedimos la actual para que una sesión abierta en una máquina ajena no
            alcance para quedarse con la cuenta.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {listo && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Listo. La próxima vez entrá con la contraseña nueva.
          </p>
        )}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pass-actual">Contraseña actual</Label>
            <PasswordInput id="pass-actual" value={actual}
                           onChange={(e) => setActual(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pass-nueva">Contraseña nueva</Label>
            <PasswordInput id="pass-nueva" value={nueva}
                           onChange={(e) => setNueva(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pass-repetida">Repetir la nueva</Label>
            <PasswordInput id="pass-repetida" value={repetida}
                           onChange={(e) => setRepetida(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { limpiar(); onOpenChange(false) }}>
            Cerrar
          </Button>
          {/* Deshabilitado hasta que los tres campos tengan algo: mandar el
              formulario vacío sólo consigue un 400 que ya se podía evitar. */}
          <Button disabled={guardando || !actual || !nueva || !repetida}
                  onClick={guardar}>
            {guardando ? 'Guardando…' : 'Cambiar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

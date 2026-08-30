/** Los dos ladrillos que repiten todas las secciones de Configuración.
 *
 *  Están acá y no copiados en cada tarjeta porque el `grid gap-2` del label
 *  sobre el input es lo que hace que las secciones se vean como una sola
 *  pantalla y no como cinco formularios distintos: el guard de espaciado
 *  (`test/espaciado-de-campos.test.ts`) mide exactamente eso.
 */
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '../PasswordInput'

/** Un campo de texto con su etiqueta.
 *
 *  Los campos secretos se declaran con `type="password"` en el call site: el
 *  ojito se resuelve acá una sola vez en vez de en cada uno.
 */
export function Campo({ label, value, onChange, type = 'text', placeholder, ayuda, id }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  ayuda?: ReactNode
  id?: string
}) {
  const campo = type === 'password'
    ? <PasswordInput id={id} value={value} placeholder={placeholder} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
    : <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {campo}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  )
}

/** El pie de una tarjeta: el botón de guardar, los secundarios que le pasen, y
 *  el resultado de la última acción. */
export function AccionesDeSeccion({ children }: { children: ReactNode }) {
  return <div className="col-span-full flex flex-wrap items-center gap-3">{children}</div>
}

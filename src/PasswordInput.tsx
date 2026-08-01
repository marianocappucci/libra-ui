// Campo de contraseña con "ojito" para mostrar/ocultar el texto.
// Vive acá y no en cada producto para que el comportamiento sea el mismo
// en toda la familia: es el mismo criterio por el que Login/Usuarios se
// extrajeron a este paquete -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md.
import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from './utils'

// Acepta todo lo que acepta el <Input> de shadcn salvo `type`, que lo
// maneja el propio componente: pasarle type="password" desde afuera no
// tendría efecto y sería confuso.
type Props = Omit<ComponentProps<typeof Input>, 'type'>

export function PasswordInput({ className, ...props }: Props) {
  const [visible, setVisible] = useState(false)
  const Icono = visible ? EyeOff : Eye

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        // `pr-9` deja lugar al botón. Va antes de `className` para que un
        // padding propio del consumidor le gane vía tailwind-merge.
        className={cn('pr-9', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Fuera del orden de tabulación: quien navega con teclado va del
        // campo al submit, no a un control decorativo. Sigue siendo
        // accesible por lector de pantalla y por click.
        tabIndex={-1}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md disabled:opacity-50"
        disabled={props.disabled}
      >
        <Icono className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

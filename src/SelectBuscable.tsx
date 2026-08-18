// Select con búsqueda por teclado. v0.9.0 (2026-08-01).
//
// El `Select` de shadcn/Radix no filtra: hay que encontrar la opción a ojo
// en una lista ordenada. Con 9 clientes se tolera; con los cientos que puede
// tener una empresa real, elegir deja de ser viable. Ese fue el pedido.
//
// **No usa `cmdk` ni el primitivo `popover` de shadcn a propósito**: ninguno
// de los 5 consumidores del paquete los tiene instalados, y sumar una
// dependencia obligaría a tocar los 5 antes de poder usar esto en uno. Se
// construye con `@/components/ui/input`, `@/components/ui/button` y `cn`,
// que sí están en todos.
//
// **v0.25.0 (2026-08-17)**: pasa a declarar `id`, `aria-describedby` y
// `aria-invalid`, que es lo que un `<FormControl>` de shadcn le inyecta. Antes
// las tiraba en silencio y el control quedaba **sin nombre accesible incluso
// dentro de un formulario con su `<FormLabel>` puesto**. Ver el bloque de
// props de abajo.
import {
  useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { coincideBusqueda } from './utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export type OpcionSelect = {
  value: string
  label: string
  /** Texto secundario: se muestra atenuado y **también entra en la búsqueda**. */
  hint?: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  opciones: OpcionSelect[]
  placeholder?: string
  /** Texto cuando la búsqueda no encuentra nada. */
  emptyMessage?: string
  disabled?: boolean
  /** Clase del botón que abre el desplegable (para fijarle el ancho). */
  className?: string
  ariaLabel?: string
  // --- Lo que inyecta un `FormControl` de shadcn ---------------------------
  //
  // `FormControl` es un `Slot.Root`: le pasa estas tres props **al hijo**, sin
  // saber qué componente es. Un `<input>` o el `SelectTrigger` de Radix las
  // reciben en el DOM y funcionan solas; un componente propio las recibe como
  // props de React y **si no las declara, se pierden en silencio**. Eso es lo
  // que pasaba acá: adentro de un formulario, con su `<FormLabel>` puesto,
  // este control igual quedaba sin nombre accesible.
  //
  // No hay que pasarlas a mano: van solas si el uso está dentro de un
  // `<FormControl>`. Declararlas es lo que hace que lleguen.
  /** El `id` del control. El `htmlFor` del `<FormLabel>` apunta acá: es lo que
   *  ata la etiqueta visible al botón y le da nombre accesible. */
  id?: string
  /** Ids del `<FormDescription>` y del `<FormMessage>`. Sin esto, el mensaje
   *  de validación se ve en pantalla pero no se anuncia. */
  'aria-describedby'?: string
  /** Marca el campo en error. Sin esto, un lector de pantalla no distingue un
   *  campo inválido de uno más. */
  'aria-invalid'?: boolean | 'true' | 'false'
}

export function SelectBuscable({
  value, onChange, opciones, placeholder = 'Elegí una opción…',
  emptyMessage = 'Sin resultados.', disabled, className, ariaLabel,
  id, 'aria-describedby': describedBy, 'aria-invalid': invalido,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [resaltada, setResaltada] = useState(0)
  const contenedor = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  // El id del desplegable, que es interno: lo usa el `aria-controls` del
  // botón y nadie de afuera lo nombra. Va aparte del `id` de la prop —que es
  // el del control— y por eso se llama distinto.
  const idInterno = useId()

  const seleccionada = opciones.find((o) => o.value === value)

  const filtradas = useMemo(
    () => opciones.filter((o) => coincideBusqueda(`${o.label} ${o.hint ?? ''}`, consulta)),
    [opciones, consulta],
  )

  // Al abrir, el foco va al campo de búsqueda: se abre y se escribe, sin un
  // click intermedio. Y la opción resaltada arranca en la ya elegida, para
  // que Enter sin escribir nada no cambie la selección.
  useEffect(() => {
    if (!abierto) return
    setConsulta('')
    const i = opciones.findIndex((o) => o.value === value)
    setResaltada(i >= 0 ? i : 0)
    campo.current?.focus()
  }, [abierto, opciones, value])

  // Escribir mueve el resaltado al primer resultado: si no, Enter elegiría
  // una opción que quedó fuera del filtro.
  useEffect(() => { setResaltada(0) }, [consulta])

  // Click afuera cierra. Sin esto el desplegable queda abierto tapando la
  // pantalla, que es el defecto clásico de un dropdown hecho a mano.
  useEffect(() => {
    if (!abierto) return
    const alClickear = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alClickear)
    return () => document.removeEventListener('mousedown', alClickear)
  }, [abierto])

  // La opción resaltada se mantiene a la vista al navegar con las flechas.
  useEffect(() => {
    if (!abierto) return
    lista.current?.querySelector('[data-resaltada="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [resaltada, abierto])

  function elegir(opcion: OpcionSelect) {
    onChange(opcion.value)
    setAbierto(false)
  }

  function alTeclear(e: ReactKeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltada((i) => Math.min(i + 1, filtradas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltada((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opcion = filtradas[resaltada]
      if (opcion) elegir(opcion)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setAbierto(false)
    } else if (e.key === 'Tab') {
      setAbierto(false)
    }
  }

  return (
    <div className="relative" ref={contenedor}>
      <Button
        id={id}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={abierto}
        aria-haspopup="listbox"
        aria-controls={abierto ? `${idInterno}-lista` : undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalido}
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
        className={cn('justify-between font-normal', !seleccionada && 'text-muted-foreground', className)}
      >
        <span className="truncate">{seleccionada?.label ?? placeholder}</span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </Button>

      {abierto && (
        <div className="absolute z-50 mt-1 w-full min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={campo}
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={alTeclear}
              placeholder="Buscar…"
              aria-label="Buscar entre las opciones"
              aria-autocomplete="list"
              className="h-8 pl-8"
            />
          </div>

          <div ref={lista} id={`${idInterno}-lista`} role="listbox" className="max-h-60 overflow-y-auto">
            {filtradas.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              filtradas.map((o, i) => (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  data-resaltada={i === resaltada}
                  onClick={() => elegir(o)}
                  onMouseEnter={() => setResaltada(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                    i === resaltada && 'bg-accent text-accent-foreground',
                  )}
                >
                  <Check className={cn('size-4 shrink-0', o.value !== value && 'opacity-0')} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

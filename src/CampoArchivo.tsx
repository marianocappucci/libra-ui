// Campo para subir un archivo: una caja de la altura de un input, con el texto a la
// izquierda y, pegado al borde derecho, un botón cuadrado con el ícono de subir
// (ADR-037). Es el único `<input type="file">` de la suite: un guard
// (`test/campo-archivo-unico.test.ts`) falla si aparece otro en `src/`.
//
// Por qué existe: el `<input type="file">` nativo de cada navegador dibuja su propio
// botón («Seleccionar archivo») y su propio texto («Ningún archivo seleccionado»), en el
// idioma del navegador y distinto en cada uno. El humano pidió el 2026-10-08 «el ícono
// que hace referencia a subir un archivo en el borde derecho del box y menos texto dentro
// del box»; se eligió el modelo B de cinco que se mostraron.
//
// API controlada: el que lo usa guarda el `File` (o `null`) y se entera por `onChange`.
// Después de cada elección el `<input>` nativo se vacía, así volver a elegir el MISMO
// archivo dispara el cambio otra vez; el valor de verdad es el `archivo` que se pasa.
// Para los usos «elegir y subir ya» (certificado de ARCA, logo) alcanza con pasar
// `archivo={null}` y subir en `onChange`.
import { useId, useRef, useState, type ComponentProps, type DragEvent, type MouseEvent } from 'react'
import { File as IconoArchivo, Upload, X } from 'lucide-react'
import { cn } from './utils'

const UNIDADES = ['B', 'KB', 'MB', 'GB'] as const

/** `1,2 KB`, `2,3 MB`: el tamaño en la unidad que se lee, con coma decimal (es-AR) y
 *  un decimal como mucho. Base 1024, como lo muestra el explorador de archivos. */
export function formatearTamanio(bytes: number): string {
  let valor = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  let unidad = 0
  // Se redondea antes de decidir la unidad: 1023,96 KB se vería «1.024 KB» en vez de «1 MB».
  while (Math.round(valor * 10) / 10 >= 1024 && unidad < UNIDADES.length - 1) {
    valor /= 1024
    unidad += 1
  }
  const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: unidad === 0 ? 0 : 1 }).format(valor)
  return `${numero} ${UNIDADES[unidad]}`
}

/** ¿Cumple el archivo con un `accept` (`.zip,application/zip`, `image/*`)? Es la misma
 *  regla que aplica el selector del navegador, para aplicarla también a lo que se suelta:
 *  el arrastre no pasa por el selector, así que sin esto aceptaría cualquier cosa. */
function cumpleAccept(archivo: File, accept?: string): boolean {
  const fichas = (accept ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (fichas.length === 0) return true
  const nombre = archivo.name.toLowerCase()
  const tipo = archivo.type.toLowerCase()
  return fichas.some((ficha) => {
    if (ficha.startsWith('.')) return nombre.endsWith(ficha)
    if (ficha.endsWith('/*')) return tipo.startsWith(ficha.slice(0, -1))
    return tipo === ficha
  })
}

type Props = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'multiple' | 'children' | 'placeholder'
> & {
  /** El archivo elegido, o `null` si no hay. */
  archivo: File | null
  /** Se llama con el archivo elegido o soltado, y con `null` al quitarlo. */
  onChange: (archivo: File | null) => void
  /** Lo que dice la caja cuando no hay archivo. */
  placeholder?: string
  /** Muestra la X para quitar el archivo elegido. Por defecto sí (salvo `required` o `disabled`). */
  quitable?: boolean
  /** El mensaje de error: va DEBAJO de la caja, que además se pinta con el color destructivo. */
  error?: string
  /** Texto chico, en gris, debajo de la caja: formatos y tamaño. */
  ayuda?: string
}

export function CampoArchivo({
  archivo, onChange, placeholder = 'Ningún archivo', quitable = true, error, ayuda,
  id, className, accept, disabled, required, 'aria-describedby': describedBy, ref, ...resto
}: Props) {
  // El `id` del input sólo se pone si el que lo usa lo pasó; el automático es la base de los ids
  // del error y la ayuda. Así un campo sin mensajes no lleva un `:r1:` que cambia de render en render.
  const idAuto = useId()
  const idCampo = id ?? idAuto
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  // Un archivo soltado que no cumple con `accept`: lo dice el propio campo.
  const [rechazo, setRechazo] = useState<string | null>(null)

  const mensaje = error ?? rechazo ?? undefined
  const idMensaje = `${idCampo}-error`
  const idAyuda = `${idCampo}-ayuda`
  const descripcion = [describedBy, mensaje ? idMensaje : null, ayuda ? idAyuda : null].filter(Boolean).join(' ') || undefined
  const puedeQuitar = quitable && !required && !disabled && archivo !== null
  const accion = archivo ? 'Cambiar archivo' : 'Subir archivo'

  function elegir(f: File | null) {
    setRechazo(null)
    onChange(f)
  }

  function asignarRef(nodo: HTMLInputElement | null) {
    inputRef.current = nodo
    if (typeof ref === 'function') ref(nodo)
    else if (ref) ref.current = nodo
  }

  // Un click en CUALQUIER parte de la caja abre el selector. El `<input>` nativo vive
  // afuera de la caja a propósito: adentro, su propio `click()` subiría de nuevo hasta
  // este manejador y se abriría en bucle.
  function abrir() {
    if (!disabled) inputRef.current?.click()
  }

  function quitar(e: MouseEvent) {
    e.stopPropagation()
    elegir(null)
  }

  function soltar(e: DragEvent) {
    e.preventDefault()
    setArrastrando(false)
    if (disabled) return
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    if (!cumpleAccept(f, accept)) {
      setRechazo(`Ese formato no se admite${accept ? ` (se espera ${accept.split(',').map((s) => s.trim()).join(', ')})` : ''}.`)
      return
    }
    elegir(f)
  }

  return (
    <div className={cn('grid w-full min-w-0 gap-1.5', className)}>
      <div
        data-slot="campo-archivo"
        data-arrastrando={arrastrando || undefined}
        aria-disabled={disabled || undefined}
        onClick={abrir}
        onDragOver={(e) => { if (disabled) return; e.preventDefault(); setArrastrando(true) }}
        onDragEnter={(e) => { if (disabled) return; e.preventDefault(); setArrastrando(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false) }}
        onDrop={soltar}
        className={cn(
          'flex h-9 w-full min-w-0 cursor-pointer items-stretch overflow-hidden rounded-md border border-input bg-transparent text-base shadow-xs transition-[color,box-shadow] md:text-sm dark:bg-input/30',
          'has-[button:focus-visible]:border-ring has-[button:focus-visible]:ring-[3px] has-[button:focus-visible]:ring-ring/50',
          arrastrando && 'border-primary bg-primary/5 ring-[3px] ring-primary/30',
          mensaje && 'border-destructive ring-destructive/20 dark:ring-destructive/40',
          disabled && 'pointer-events-none cursor-not-allowed opacity-50',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          {archivo ? (
            <>
              <IconoArchivo className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 truncate" title={archivo.name}>{archivo.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatearTamanio(archivo.size)}</span>
              {puedeQuitar && (
                <button
                  type="button" onClick={quitar} aria-label="Quitar archivo" title="Quitar archivo"
                  className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
        </div>
        {/* Sin `onClick` propio: el click sube a la caja, que abre el selector. */}
        <button
          type="button" disabled={disabled} aria-label={accion} title={accion}
          className={cn(
            'flex w-10 shrink-0 items-center justify-center border-l bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none disabled:pointer-events-none',
            mensaje && 'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive',
          )}
        >
          <Upload className="size-4" aria-hidden="true" />
        </button>
      </div>

      <input
        {...resto}
        ref={asignarRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        required={required}
        // Fuera del orden de tabulación: el que navega con teclado llega al botón de
        // subir, que es el que abre el selector. Sigue nombrado y asociado a su `<label>`.
        tabIndex={-1}
        aria-invalid={mensaje ? true : undefined}
        aria-describedby={descripcion}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          // Se vacía siempre: el valor de verdad es `archivo`, y así elegir el mismo
          // archivo dos veces seguidas vuelve a disparar el cambio.
          e.target.value = ''
          if (f) elegir(f)
        }}
      />

      {ayuda && <p id={idAyuda} className="text-xs text-muted-foreground">{ayuda}</p>}
      {mensaje && <p id={idMensaje} className="text-sm text-destructive">{mensaje}</p>}
    </div>
  )
}

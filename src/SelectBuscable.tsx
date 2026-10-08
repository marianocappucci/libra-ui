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
//
// **v0.121.0 (2026-10-07)**: modo `buscarEscribiendo`. El control cerrado es un
// **campo de texto con lupa** y no un botón: se escribe encima y la lista se
// abre filtrada. En el modo por defecto (el botón que abre un desplegable con
// el buscador adentro) la gente no descubre que puede escribir. Ver ADR-031.
//
// **v0.129.0 (2026-10-08)**: el modo de campo pasa a ser **el de siempre**: sin
// `buscarEscribiendo` (o con `true`) el control es el campo con lupa. El botón
// queda sólo para el que pasa `buscarEscribiendo={false}`. Todo desplegable de
// datos de la suite se busca escribiendo (ADR-039). Suma `disabled` por opción,
// `required` y `limpiable`, y arregla que un Escape con la lista abierta
// cerraba también el diálogo de afuera.
import {
  useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ChangeEvent,
  type RefObject,
} from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { coincideBusqueda } from './utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export type OpcionSelect = {
  value: string
  label: string
  /** Texto secundario: se muestra atenuado y **también entra en la búsqueda**. */
  hint?: string
  /** La opción se ve pero no se puede elegir (p. ej. una caja que ya tiene un turno abierto). Las flechas la saltean y Enter no la elige. */
  disabled?: boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  opciones: OpcionSelect[]
  placeholder?: string
  /** Texto cuando la búsqueda no encuentra nada. */
  emptyMessage?: string
  disabled?: boolean
  /** Clase del botón que abre el desplegable (para fijarle el ancho). Con
   *  `buscarEscribiendo` va al contenedor del campo, que es lo que tiene ancho. */
  className?: string
  ariaLabel?: string
  /** El tooltip nativo del control: sirve cuando la etiqueta elegida es más larga que el ancho y se corta. */
  title?: string
  /** Modo «escribir para buscar» (v0.121.0, ADR-031): el control cerrado es un
   *  campo de texto con lupa, no un botón. Escribir filtra y abre la lista al
   *  instante; con algo elegido el campo muestra su etiqueta y una × lo vacía.
   *  **Desde v0.129.0 (ADR-039) es el modo por defecto**: no hace falta pasarlo.
   *  Con `false` vuelve el botón que abre un desplegable con el buscador adentro,
   *  que es lo único que conserva (y no se recomienda: la gente no descubre que
   *  puede escribir). El `placeholder` es lo que se ve con el campo vacío:
   *  conviene que diga qué se busca («Buscar cliente…»). */
  buscarEscribiendo?: boolean
  /** Marca el campo como obligatorio: `required` en el `<input>` (el navegador
   *  no deja enviar el formulario vacío) y `aria-required`. Con él la × no se
   *  ofrece: vaciar un campo obligatorio no es una elección. */
  required?: boolean
  /** Si se ofrece la × que vacía la selección (sólo en el modo de campo): manda
   *  `''`. **Por defecto no** (0.129.1): muchos consumidores representan «todos»
   *  o «ninguno» con un centinela propio (`TODOS`, `'0'`, `__todas__`) y una ×
   *  que manda `''` los dejaba en un estado que no esperan (`Number('')` = 0
   *  filtra por un id inexistente). Se pide con `limpiable` en los campos donde
   *  `''` es un valor válido; la forma preferida de vaciar sigue siendo una
   *  opción de valor `''` («Todos», «Ninguno») en la lista. */
  limpiable?: boolean
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

export function SelectBuscable(props: Props) {
  return props.buscarEscribiendo === false ? <SelectDeBoton {...props} /> : <SelectDeCampo {...props} />
}

/** Las opciones que se pueden elegir se recorren con las flechas; las deshabilitadas se saltean. Devuelve el índice al que se llega desde `desde`
 *  moviéndose `paso` (1 o -1), o `desde` si no hay ninguna habilitada en esa dirección. */
function mover(lista: OpcionSelect[], desde: number, paso: 1 | -1): number {
  for (let i = desde + paso; i >= 0 && i < lista.length; i += paso) if (!lista[i].disabled) return i
  return desde
}

/** La primera opción habilitada (0 si no hay ninguna: no se resalta nada que se pueda elegir). */
function primeraHabilitada(lista: OpcionSelect[]): number {
  const i = lista.findIndex((o) => !o.disabled)
  return i >= 0 ? i : 0
}

/** Con la lista abierta, Escape la cierra y **no sigue**. Un diálogo de Radix escucha el Escape en `document`, en la fase de captura, antes de que
 *  llegue a cualquier manejador de React: sin esto, cerrar la lista cerraba también el diálogo y se perdía lo cargado (medido con un `Dialog` de
 *  `radix-ui`). Se escucha en `window`, que va antes, y sólo si el foco está en este control. */
function useEscapeQueCierra(abierto: boolean, contenedor: RefObject<HTMLElement | null>, cerrar: () => void) {
  const cerrarRef = useRef(cerrar)
  useEffect(() => { cerrarRef.current = cerrar })
  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !contenedor.current?.contains(e.target as Node)) return
      e.stopPropagation()
      e.preventDefault()
      cerrarRef.current()
    }
    window.addEventListener('keydown', alTeclear, true)
    return () => window.removeEventListener('keydown', alTeclear, true)
  }, [abierto, contenedor])
}

/** Las opciones del desplegable, que comparten los dos modos. `idOpcion` sólo lo
 *  pasa el modo de campo (lo necesita su `aria-activedescendant`): en el otro
 *  el DOM queda como siempre. */
function ListaDeOpciones({
  listaRef, id, filtradas, value, resaltada, setResaltada, elegir, emptyMessage, idOpcion,
}: {
  listaRef: RefObject<HTMLDivElement | null>
  id: string
  filtradas: OpcionSelect[]
  value: string
  resaltada: number
  setResaltada: (i: number) => void
  elegir: (o: OpcionSelect) => void
  emptyMessage: string
  idOpcion?: (i: number) => string
}) {
  return (
    <div ref={listaRef} id={id} role="listbox" className="max-h-60 overflow-y-auto">
      {filtradas.length === 0 ? (
        <p className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        filtradas.map((o, i) => (
          <div
            key={o.value}
            id={idOpcion?.(i)}
            role="option"
            aria-selected={o.value === value}
            aria-disabled={o.disabled || undefined}
            data-resaltada={i === resaltada}
            onClick={() => { if (!o.disabled) elegir(o) }}
            onMouseEnter={() => { if (!o.disabled) setResaltada(i) }}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
              i === resaltada && 'bg-accent text-accent-foreground',
              o.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Check className={cn('size-4 shrink-0', o.value !== value && 'opacity-0')} />
            <span className="truncate">{o.label}</span>
            {o.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span>}
          </div>
        ))
      )}
    </div>
  )
}

function SelectDeBoton({
  value, onChange, opciones, placeholder = 'Elegí una opción…',
  emptyMessage = 'Sin resultados.', disabled, required, className, ariaLabel, title,
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
    setResaltada(i >= 0 ? i : primeraHabilitada(opciones))
    campo.current?.focus()
  }, [abierto, opciones, value])

  // Escribir mueve el resaltado al primer resultado: si no, Enter elegiría
  // una opción que quedó fuera del filtro.
  useEffect(() => { setResaltada(primeraHabilitada(filtradas)) }, [consulta]) // eslint-disable-line react-hooks/exhaustive-deps

  useEscapeQueCierra(abierto, contenedor, () => setAbierto(false))

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
      setResaltada((i) => mover(filtradas, i, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltada((i) => mover(filtradas, i, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opcion = filtradas[resaltada]
      if (opcion && !opcion.disabled) elegir(opcion)
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
        title={title}
        aria-describedby={describedBy}
        aria-invalid={invalido}
        aria-required={required}
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

          <ListaDeOpciones
            listaRef={lista} id={`${idInterno}-lista`} filtradas={filtradas} value={value}
            resaltada={resaltada} setResaltada={setResaltada} elegir={elegir} emptyMessage={emptyMessage}
          />
        </div>
      )}
    </div>
  )
}

/** El modo `buscarEscribiendo` (v0.121.0, ADR-031): el control cerrado es un campo
 *  de texto con lupa. Es un componente aparte y no una rama del de botón para que
 *  éste, que usan once pantallas, no cambie ni un nodo del DOM.
 *
 *  `consulta` es `null` mientras no se está buscando: el campo muestra la etiqueta
 *  de lo elegido y la lista, si se abre, muestra todo. En cuanto se escribe pasa a
 *  ser el texto del campo y filtra. Cerrar la lista por cualquier camino la vuelve
 *  a `null`: la etiqueta elegida reaparece y lo escrito a medias se descarta. */
function SelectDeCampo({
  value, onChange, opciones, placeholder = 'Buscar…',
  emptyMessage = 'Sin resultados.', disabled, required, limpiable, className, ariaLabel, title,
  id, 'aria-describedby': describedBy, 'aria-invalid': invalido,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [consulta, setConsulta] = useState<string | null>(null)
  const [resaltada, setResaltada] = useState(0)
  const contenedor = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  // Para el primer `mouseup` tras enfocar con el mouse: los navegadores lo usan
  // para colocar el cursor y deshacen el «seleccionar todo» del foco.
  const recienEnfocado = useRef(false)
  const idInterno = useId()
  const idLista = `${idInterno}-lista`
  const idOpcion = (i: number) => `${idInterno}-opcion-${i}`

  const seleccionada = opciones.find((o) => o.value === value)

  const filtradas = useMemo(
    () => opciones.filter((o) => coincideBusqueda(`${o.label} ${o.hint ?? ''}`, consulta ?? '')),
    [opciones, consulta],
  )

  // Elegir deja el foco en el campo; con la etiqueta recién puesta todo
  // seleccionada, la próxima letra empieza una búsqueda nueva en vez de
  // pegarse al nombre elegido.
  const etiqueta = seleccionada?.label
  useEffect(() => {
    if (document.activeElement === campo.current) campo.current?.select()
  }, [etiqueta])

  useEffect(() => {
    if (!abierto) return
    lista.current?.querySelector('[data-resaltada="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [resaltada, abierto])

  function abrir() {
    setConsulta(null)
    const i = opciones.findIndex((o) => o.value === value)
    setResaltada(i >= 0 ? i : primeraHabilitada(opciones))
    setAbierto(true)
  }

  function cerrar() {
    setAbierto(false)
    setConsulta(null)
  }

  useEscapeQueCierra(abierto, contenedor, cerrar)

  // La × vacía la selección (manda `''`). Sólo si el consumidor la pide: un `''` inesperado rompe a quien usa un centinela propio para
  // «todos» (ver la prop). Nunca en un campo obligatorio ni si la lista ya trae su opción de «ninguno» (`value: ''`), salvo que se la pida explícitamente.
  const conCruz = value !== '' && !disabled && limpiable === true

  function elegir(opcion: OpcionSelect) {
    onChange(opcion.value)
    cerrar()
  }

  function vaciar() {
    onChange('')
    cerrar()
    campo.current?.focus()
  }

  function alEscribir(e: ChangeEvent<HTMLInputElement>) {
    setConsulta(e.target.value)
    setResaltada(primeraHabilitada(opciones.filter((o) => coincideBusqueda(`${o.label} ${o.hint ?? ''}`, e.target.value))))
    setAbierto(true)
  }

  function alTeclear(e: ReactKeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (abierto) setResaltada((i) => mover(filtradas, i, 1))
      else abrir()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (abierto) setResaltada((i) => mover(filtradas, i, -1))
    } else if (e.key === 'Enter') {
      // Cerrada, Enter no es nuestro: que siga su camino (enviar el formulario).
      if (!abierto) return
      e.preventDefault()
      const opcion = filtradas[resaltada]
      if (opcion && !opcion.disabled) elegir(opcion)
    } else if (e.key === 'Escape') {
      if (!abierto) return
      e.preventDefault()
      cerrar()
    } else if (e.key === 'Tab') {
      cerrar()
    }
  }

  const activa = abierto ? filtradas[resaltada] : undefined

  return (
    <div
      ref={contenedor}
      className={cn('relative', className)}
      // Cierra cuando el foco sale del control entero —campo, × y lista—, que
      // cubre el click afuera y el Tab. Elegir con el mouse no lo dispara
      // porque el `mousedown` de la lista no le saca el foco al campo.
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) cerrar() }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        ref={campo}
        type="text"
        role="combobox"
        autoComplete="off"
        value={consulta ?? etiqueta ?? ''}
        onChange={alEscribir}
        onKeyDown={alTeclear}
        onFocus={(e) => { recienEnfocado.current = true; e.currentTarget.select() }}
        onMouseUp={(e) => { if (recienEnfocado.current) e.preventDefault(); recienEnfocado.current = false }}
        onClick={() => { if (!abierto) abrir() }}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-required={required}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        aria-controls={abierto ? idLista : undefined}
        aria-activedescendant={activa ? idOpcion(resaltada) : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        title={title}
        aria-describedby={describedBy}
        aria-invalid={invalido}
        className={cn('w-full pl-9', conCruz && 'pr-9')}
      />
      {conCruz && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Quitar la selección"
          onMouseDown={(e) => e.preventDefault()}
          onClick={vaciar}
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      )}

      {abierto && (
        <div
          // Sin esto, tocar la lista (una opción, la barra de scroll) le saca el
          // foco al campo y el `onBlur` de arriba la cierra antes del click.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-50 mt-1 w-full min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ListaDeOpciones
            listaRef={lista} id={idLista} filtradas={filtradas} value={value}
            resaltada={resaltada} setResaltada={setResaltada} elegir={elegir} emptyMessage={emptyMessage}
            idOpcion={idOpcion}
          />
        </div>
      )}
    </div>
  )
}

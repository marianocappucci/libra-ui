/** El campo «Cliente» de la suite: el buscador de siempre y, al lado, el botón que da de alta uno nuevo sin salir de lo que se está cargando (ADR-071).
 *
 *  **Por qué existe.** En el mostrador de LibraDesk se recibía un equipo y, si el cliente no estaba cargado, no había forma de elegirlo: había que
 *  cancelar la recepción, ir a Clientes, darlo de alta y volver a empezar con la persona esperando. El humano pidió (2026-10-16) que **todo** campo
 *  donde se elige un cliente, en todos los productos, ofrezca el alta ahí mismo y que sea siempre el mismo control. Este es ese control; la guarda
 *  `auditoria-de-clientes` impide que vuelva a nacer uno sin alta.
 *
 *  **Qué pide el alta.** Lo mínimo para que el cliente exista: el nombre, y lo que el producto pida con `campos` (teléfono y email por defecto;
 *  documento y condición frente al IVA donde lo que se emite es fiscal). El resto se completa después en la ficha del cliente.
 *
 *  **Qué NO hace.** No sabe cómo se guarda un cliente: cada producto tiene su endpoint y su payload, así que lo pasa en `crear`, que devuelve la
 *  opción a elegir. Tampoco es un `<form>`: casi siempre vive dentro del formulario de otra cosa (una venta, una recepción, una CPE) y un form
 *  anidado no es HTML válido. Por eso Enter adentro del panel crea el cliente en vez de mandar el formulario de afuera a medio cargar.
 *
 *  **El recién creado se elige solo** y queda en la lista aunque el consumidor todavía no lo haya agregado a la suya: si `crear` no actualiza la
 *  lista del producto, el campo igual muestra el nombre en vez de quedar en blanco con un id elegido. */
import { useId, useState, type KeyboardEvent } from 'react'
import { UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectBuscable, type OpcionSelect, type SelectBuscableProps } from './SelectBuscable'
import { IVA_CONDITIONS } from './facturas'

/** Lo que se carga en el panel. Los campos que el producto no pidió viajan como `''`. */
export type ClienteNuevo = {
  nombre: string
  documento: string
  condicionIva: string
  telefono: string
  email: string
}

export type CampoDeAlta = 'documento' | 'condicionIva' | 'telefono' | 'email'

export const CAMPOS_POR_DEFECTO: CampoDeAlta[] = ['telefono', 'email']

/** El `<Select>` de shadcn no admite `value=""`: «sin especificar» viaja con un centinela y sale como `''`. */
const SIN_IVA = '__sin_especificar__'

const VACIO: ClienteNuevo = { nombre: '', documento: '', condicionIva: '', telefono: '', email: '' }

export type SelectClienteProps = Omit<SelectBuscableProps, 'buscarEscribiendo'> & {
  /** Da de alta el cliente con el endpoint del producto y devuelve la opción que se elige. Si tira, se muestra el error dentro del panel (un
   *  `Error` con `detail`, como el `ApiError` del kit, o con `message`) y lo cargado no se pierde. */
  crear: (datos: ClienteNuevo) => Promise<OpcionSelect>
  /** Qué se pide además del nombre, en este orden. Por defecto teléfono y email. */
  campos?: CampoDeAlta[]
  /** Con `false` no se ofrece el alta (un rol que no puede crear clientes). Es la única forma aceptada de no ofrecerla. */
  conAlta?: boolean
  /** Cómo se llama el cliente en este producto: «paciente», «socio». Va en el botón y en los mensajes. */
  entidad?: string
  /** La etiqueta del documento: «CUIT/DNI» por defecto. */
  etiquetaDocumento?: string
  /** La etiqueta visible («Cliente»). Con ella el componente es el campo entero —etiqueta, buscador, botón y panel— y, en una fila
   *  `flex-wrap`, al abrir el panel ocupa la fila completa (`basis-full`) en vez de apretarlo en la columna del buscador. */
  etiqueta?: string
  /** Clase del buscador (su ancho: `w-52`). Por defecto ocupa lo que haya al lado del botón. */
  classNameSelect?: string
  /** Se avisa al abrir y cerrar el panel (para un consumidor que necesita saberlo, p. ej. para no cerrar su modal con Escape). */
  onPanelChange?: (abierto: boolean) => void
}

/** El `detail` del error de la API (el `ApiError` del kit y los de cada producto lo traen); cualquier otra cosa es que no hubo respuesta, y se
 *  dice igual que en el resto de la suite. */
function mensajeDeError(err: unknown): string {
  const detalle = err && typeof err === 'object' ? (err as { detail?: unknown }).detail : undefined
  return typeof detalle === 'string' && detalle ? detalle : 'Error de conexión.'
}

export type AltaDeClienteProps = Pick<SelectClienteProps, 'crear' | 'campos' | 'entidad' | 'etiquetaDocumento'> & {
  /** El cliente quedó creado: la opción que devolvió `crear`. */
  onCreado: (opcion: OpcionSelect) => void
  onCancelar: () => void
  /** El nombre que ya escribió el usuario en el buscador, para no hacérselo escribir dos veces. */
  nombreInicial?: string
  className?: string
}

/** El panel de alta solo, sin el buscador. Lo usa `SelectCliente`, y lo usan directo las pantallas donde el cliente no se elige de un
 *  desplegable (el diálogo «Cliente de la venta» del POS de VentaLibra, que es una lista con teclado). */
export function AltaDeCliente({
  crear, campos = CAMPOS_POR_DEFECTO, entidad = 'cliente', etiquetaDocumento = 'CUIT/DNI', onCreado, onCancelar, nombreInicial = '', className,
}: AltaDeClienteProps) {
  const id = useId()
  const [nuevo, setNuevo] = useState<ClienteNuevo>({ ...VACIO, nombre: nombreInicial })
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    if (!nuevo.nombre.trim() || creando) return
    setCreando(true)
    setError(null)
    try {
      const opcion = await crear({
        nombre: nuevo.nombre.trim(), documento: nuevo.documento.trim(), condicionIva: nuevo.condicionIva,
        telefono: nuevo.telefono.trim(), email: nuevo.email.trim(),
      })
      onCreado(opcion)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setCreando(false)
    }
  }

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    // Enter en un campo de texto crea; no manda el formulario de afuera (no hay `<form>` propio: casi siempre estamos dentro de otro).
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); e.stopPropagation(); void guardar() }
    // Escape cierra el panel y nada más: sin esto, dentro de un modal lo cerraba entero con todo lo cargado.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancelar() }
  }

  const campo = (c: CampoDeAlta) => {
    const cid = `${id}-${c}`
    if (c === 'condicionIva') {
      return (
        <div key={c} className="grid gap-2">
          <Label htmlFor={cid}>Condición frente al IVA</Label>
          {/* select-cerrado: las condiciones frente al IVA son un catálogo cerrado de ARCA, fijo en el código (`IVA_CONDITIONS`) */}
          <Select value={nuevo.condicionIva || SIN_IVA} onValueChange={(v) => setNuevo({ ...nuevo, condicionIva: v === SIN_IVA ? '' : v })}>
            <SelectTrigger id={cid} aria-label="Condición frente al IVA"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_IVA}>— Sin especificar —</SelectItem>
              {IVA_CONDITIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )
    }
    const def = {
      documento: { etiqueta: etiquetaDocumento, tipo: 'text', modo: 'numeric' as const },
      telefono: { etiqueta: 'Teléfono', tipo: 'tel', modo: 'tel' as const },
      email: { etiqueta: 'Email', tipo: 'email', modo: 'email' as const },
    }[c]
    return (
      <div key={c} className="grid gap-2">
        <Label htmlFor={cid}>{def.etiqueta}</Label>
        <Input id={cid} type={def.tipo} inputMode={def.modo} value={nuevo[c]} onChange={(e) => setNuevo({ ...nuevo, [c]: e.target.value })} />
      </div>
    )
  }

  return (
    <div role="group" aria-label={`Nuevo ${entidad}`} className={cn('grid gap-3 rounded-md border bg-muted/30 p-3', className)} onKeyDown={teclas}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-nombre`}>Nombre *</Label>
          <Input id={`${id}-nombre`} autoFocus required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        </div>
        {campos.map(campo)}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button type="button" size="sm" disabled={creando || !nuevo.nombre.trim()} onClick={() => void guardar()}>
          <UserPlus />{creando ? 'Guardando…' : `Crear ${entidad}`}
        </Button>
      </div>
    </div>
  )
}

export function SelectCliente({
  crear, campos, conAlta = true, entidad = 'cliente', etiquetaDocumento, onPanelChange, etiqueta, classNameSelect,
  opciones, onChange, className, disabled, ...resto
}: SelectClienteProps) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  // Los creados acá, hasta que el consumidor los tenga en su lista.
  const [creados, setCreados] = useState<OpcionSelect[]>([])

  const conocidos = new Set(opciones.map((o) => o.value))
  const todas = [...opciones, ...creados.filter((o) => !conocidos.has(o.value))]

  function abrir(a: boolean) {
    setAbierto(a)
    onPanelChange?.(a)
  }

  const agregar = `Agregar nuevo ${entidad}`
  const idSelect = resto.id ?? `${id}-select`
  return (
    <div className={cn(etiqueta ? 'grid gap-2' : 'grid gap-3', abierto && 'basis-full', className)}>
      {etiqueta && <Label htmlFor={idSelect}>{etiqueta}</Label>}
      <div className="flex items-center gap-1">
        <SelectBuscable
          {...resto} id={idSelect} opciones={todas} onChange={onChange} disabled={disabled} className={cn('min-w-0 flex-1', classNameSelect)}
        />
        {conAlta && (
          <Button
            type="button" size="icon" variant="outline" title={agregar} aria-label={agregar}
            aria-expanded={abierto} aria-controls={`${id}-panel`} disabled={disabled}
            onClick={() => abrir(!abierto)}
          >
            <UserPlus />
          </Button>
        )}
      </div>
      {abierto && (
        <div id={`${id}-panel`}>
          <AltaDeCliente
            crear={crear} campos={campos} entidad={entidad} etiquetaDocumento={etiquetaDocumento}
            onCancelar={() => abrir(false)}
            onCreado={(opcion) => { setCreados((prev) => [...prev, opcion]); onChange(opcion.value); abrir(false) }}
          />
        </div>
      )}
    </div>
  )
}

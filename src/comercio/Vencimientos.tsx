// Vencimientos y lotes: qué lotes vencen pronto (o ya vencieron), qué stock no tiene lote ni fecha, y las tres cosas
// que se pueden hacer con eso: dar de baja un lote (merma), ponerle lote y vencimiento a stock que no lo tiene y
// marcar qué productos vencen.
//
// Pantalla nueva (0.91.0, roadmap de producto de VentaLibra, A-2); todo lo que se cuenta es del motor
// (`/api/vencimientos`, `libracommerce.erp.vencimientos`, ADR-018) y acá sólo se muestra y se pide. Props opcionales
// `puedeMover` (asignar y dar de baja) y `puedeMarcar` (marcar «vence»): ocultan los botones; el backend igual contesta
// 403 a quien no tiene el permiso.
//
// Decisiones que no son casualidad:
// - **El estado de la respuesta va ligado a la consulta a la que contestó** (como `Reposicion`, por el hallazgo de
//   Codex): mientras llega la de un cambio de parámetros, o la recarga tras una escritura, no se muestra la tabla anterior
//   bajo controles nuevos; se muestra «Cargando…».
// - **El orden es del navegador**; el de origen es el del motor (por vencimiento) y el CSV sale siempre en ése.
// - 🔴 **El aviso de que el saldo por lote puede ser MAYOR al real es permanente** (ADR-018): hasta que las ventas,
//   devoluciones y ajustes descuenten por lote (A-4) siguen restando del stock «sin lote», así que el saldo de cada lote
//   sobreestima lo que hay. Va arriba de todo, sin botón para cerrarlo, y se repite en los diálogos que mueven stock.
// - 🔑 **Idempotencia de las escrituras.** `asignar` y `merma` exigen `clave_operacion`. Cada diálogo genera UNA clave
//   por intento del usuario y la REUSA mientras los datos que se van a enviar no cambien (volver a apretar «Confirmar»
//   tras un rechazo del motor: no se escribió nada, la clave no se gasta). Se regenera cuando el usuario cambia algún dato.
//   🔴 **Principio: mientras haya un intento INCIERTO sobre un destino de stock, no se manda nada nuevo sobre ese destino
//   que no sea reenviar exactamente ese intento, con su clave, o descartarlo de forma explícita.** Incierto es no saber si
//   el motor escribió: error de red, timeout, 5xx y también un 503 que no sea el de la migración. Sólo son definitivos
//   («no se escribió») los 4xx (menos el 408) y el 503 que dice `libracommerce-migrar upgrade`. Un intento incierto guarda
//   el CUERPO COMPLETO y su clave (no sólo la clave) bajo una firma del destino (tipo, producto, depósito, variante, lote y
//   fecha; sin cantidad, nota ni motivo): con esa firma pendiente el diálogo bloquea cantidad, nota y motivo, y sólo ofrece
//   «Reenviar el intento anterior» (el cuerpo original, no el editado) o «Descartar el intento anterior…» (con confirmación).
//   El intento se guarda ANTES de enviar y se borra con un resultado definitivo (éxito, `repetida`, 4xx, el 503 de migración)
//   o al descartarlo.
//   **Persistencia:** un almacén de módulo respaldado por `sessionStorage` (`libra-ui:vencimientos:pendientes`, con
//   try/catch: si lanza —modo privado— sigue en memoria), así que sobrevive a desmontar la pantalla y a recargar la
//   pestaña. Límite: otra pestaña o navegador (otro `sessionStorage`) no lo ve; ahí lo que protege es el motor, que con la
//   misma clave y el mismo cuerpo contesta `repetida: true`. Un intento pendiente de un lote que ya no aparece en la lista
//   no se ve en pantalla (queda guardado, inofensivo, hasta que ese destino vuelva a aparecer o se cierre la pestaña).
// - **«Productos que vencen» es por producto**: el motor no tiene un listado de los productos marcados (sólo se ven en el
//   reporte los que tienen stock con lote o sin lote), así que se elige un producto, se ve si vence
//   (`GET /api/vencimientos/productos/{id}/lotes`) y se marca o desmarca (`PUT /api/vencimientos/productos/{id}`).
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../api-client'
import { SelectBuscable } from '../SelectBuscable'
import { ZONA_AR } from '../fechas'
import { TituloPantalla } from '../titulo-pantalla'
import type {
  CategoriaProducto, Producto, Sucursal, VencimientoAsignarPayload, VencimientoAsignarRespuesta, VencimientoLote,
  VencimientoMarca, VencimientoMermaPayload, VencimientoMermaRespuesta, VencimientoProductoLotes, VencimientoSinLote,
  VencimientosData, VencimientoSituacion,
} from './tipos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { fecha } from '@/lib/fechas'
import { CalendarClock, CalendarPlus, Check, Download, TriangleAlert, Trash2 } from 'lucide-react'

const RUTA = '/api/vencimientos'
/** El valor de «Toda la instancia» y de «Todas las categorías» en su `Select` (uno de Radix no admite `''`). */
const TODAS = '__todas__'
/** Los defaults y el tope del motor (`erp.vencimientos.DIAS_AVISO` y `MAX_DIAS_AVISO`). */
const DIAS_POR_DEFECTO = '15'
const MAX_DIAS = 365
/** El motor limita el lote a 64 caracteres (`add_movimiento_stock`). */
const MAX_LARGO_LOTE = 64

const AVISO_SALDO =
  'Hasta que las ventas descuenten por lote, el saldo de cada lote puede ser MAYOR al real: las ventas, devoluciones y ajustes ' +
  'siguen restando del stock “sin lote”. Contrastá con el conteo físico antes de decidir.'

const SIN_REVISION =
  'La base no tiene aplicada la revisión de vencimientos; pedí al administrador que ejecute libracommerce-migrar upgrade.'
/** El 503 del motor cuando falta la revisión `0002` (`SinRevision`): «Falta la revisión 0002_vencimientos_lotes del motor:
 *  corré `libracommerce-migrar upgrade` …». Coincidencia estricta: cualquier otro 503 (un proxy, el servidor caído) NO dice
 *  que no se escribió. */
const FALTA_REVISION = /Falta la revisión 0002_vencimientos_lotes.*libracommerce-migrar upgrade/s

/** Las cantidades se muestran como las manda el motor, sin un tope de decimales más bajo que el suyo. */
function numero(valor: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 10 }).format(valor)
}

/** El motivo del rechazo de un parámetro, o `null` si vale: un entero de 1 hasta su tope, como en el motor. */
function errorDeDias(valor: string): string | null {
  const n = Number(valor)
  return /^\d+$/.test(valor.trim()) && n >= 1 && n <= MAX_DIAS ? null : `Tiene que ser un entero entre 1 y ${MAX_DIAS}.`
}

/** El motivo del rechazo de una cantidad a mover, o `null` si vale: un número mayor a 0 que no pasa del saldo. */
function errorDeCantidad(valor: string, saldo: number): string | null {
  const n = Number(valor)
  if (valor.trim() === '' || !Number.isFinite(n) || n <= 0) return 'Tiene que ser un número mayor a 0.'
  return n > saldo ? `No puede pasar del saldo (${numero(saldo)}).` : null
}

/** Un identificador único por intento. `randomUUID` sólo existe en contextos seguros (https o localhost): en un
 *  producto servido por http en la red local cae al generador de `getRandomValues`, que sí está siempre. */
function nuevaClaveDeOperacion(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** El mensaje de un error del motor o de la red. 503 es la base sin la revisión `0002`; 409 (regla de negocio o clave
 *  reusada con otros datos), 422 y 404 traen su texto. Un 422 de validación del cuerpo llega como lista: se juntan los `msg`. */
function mensajeDeError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Error de conexión.'
  if (err.status === 503 && FALTA_REVISION.test(err.detail)) return SIN_REVISION
  if (Array.isArray(err.detailData)) {
    const msgs = err.detailData
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
      .filter(Boolean)
    if (msgs.length > 0) return msgs.join(' ')
  }
  return err.detail
}

const ubicacion = (f: { sucursal: string | null; deposito: string }) => (f.sucursal ? `${f.sucursal} · ${f.deposito}` : f.deposito)

function AvisoSaldoSobreestimado({ className = '' }: { className?: string }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300 ${className}`}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{AVISO_SALDO}</p>
    </div>
  )
}

function textoDeDias(dias: number): string {
  if (dias < 0) return `Vencido hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`
}

/** El estado en color **y en texto**: el color solo no llega a quien no lo distingue. */
function BadgeDeDias({ dias }: { dias: number }) {
  return dias < 0 ? (
    <Badge variant="destructive" data-estado="vencido" className="whitespace-normal">{textoDeDias(dias)}</Badge>
  ) : (
    <Badge variant="outline" data-estado="por_vencer" className="whitespace-normal border-amber-500/50 text-amber-600 dark:text-amber-400">
      {textoDeDias(dias)}
    </Badge>
  )
}

const SITUACION: Record<VencimientoSituacion, { etiqueta: string; explicacion: string }> = {
  sin_fecha: {
    etiqueta: 'Sin fecha',
    explicacion:
      'Hay stock que no tiene lote ni fecha de vencimiento: por eso no se puede avisar cuándo vence. Asignale un lote y un vencimiento.',
  },
  salidas_sin_lote: {
    etiqueta: 'Salidas sin lote',
    explicacion:
      'Hubo ventas, devoluciones o ajustes que restaron de “sin lote” (por eso el saldo es negativo) sin descontar ningún lote: ' +
      'los lotes de este producto en este depósito muestran más de lo que hay. Contrastá con el conteo físico.',
  },
}

// ── Escrituras: una clave por intento, y los intentos inciertos guardados ────────────────────────────────────────

type Payload = VencimientoMermaPayload | VencimientoAsignarPayload
type TipoDeEscritura = 'merma' | 'asignar'

/** Un intento de escritura cuyo resultado no se conoce: el cuerpo completo, con su `clave_operacion`. */
type Pendiente = { firma: string; tipo: TipoDeEscritura; cuerpo: Payload; creado: number }

const CLAVE_DE_ALMACEN = 'libra-ui:vencimientos:pendientes'
/** Sólo se usa si `sessionStorage` lanza (modo privado, sitio bloqueado): entonces el almacén vive en memoria. */
let enMemoria: Record<string, Pendiente> = {}

function esPendiente(v: unknown): v is Pendiente {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<Pendiente>
  const c = p.cuerpo as Partial<Payload> | undefined
  return typeof p.firma === 'string' && (p.tipo === 'merma' || p.tipo === 'asignar') && typeof p.creado === 'number'
    && !!c && typeof c.clave_operacion === 'string' && typeof c.producto_id === 'number'
}

/** Lo guardado. Lee el almacenamiento en cada llamada (es la fuente de verdad: lo que otra pantalla o una recarga
 *  dejó ahí); un contenido ilegible cuenta como vacío. */
function leerPendientes(): Record<string, Pendiente> {
  let crudo: string | null
  try {
    crudo = sessionStorage.getItem(CLAVE_DE_ALMACEN)
  } catch {
    return enMemoria
  }
  try {
    const parseado: unknown = crudo ? JSON.parse(crudo) : {}
    if (!parseado || typeof parseado !== 'object') return {}
    return Object.fromEntries(Object.entries(parseado).filter(([, v]) => esPendiente(v))) as Record<string, Pendiente>
  } catch {
    return {}
  }
}

function guardarPendientes(todos: Record<string, Pendiente>) {
  try {
    sessionStorage.setItem(CLAVE_DE_ALMACEN, JSON.stringify(todos))
    enMemoria = {}
  } catch {
    enMemoria = todos
  }
}

function guardarPendiente(p: Pendiente) {
  guardarPendientes({ ...leerPendientes(), [p.firma]: p })
}

function quitarPendiente(firma: string) {
  const { [firma]: _quitado, ...resto } = leerPendientes()
  guardarPendientes(resto)
}

/** La firma del DESTINO de la operación sobre el stock: tipo, producto, depósito, variante, lote y fecha; sin cantidad,
 *  nota ni motivo (cambiarlos no hace de esto otra operación). */
function firmaDeDestino(tipo: TipoDeEscritura, d: { producto_id: number; deposito_id: number; variante_id: number | null; lote: string | null; vence: string | null }): string {
  return JSON.stringify([tipo, d.producto_id, d.deposito_id, d.variante_id, d.lote, d.vence])
}

const FORMATO_DE_HORA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_AR, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** ¿No se sabe si el motor escribió? Es lo que hay que suponer salvo que la respuesta diga lo contrario: los 4xx (menos el
 *  408, que puede venir de un proxy que cortó a mitad de camino) y el 503 de la migración son la única forma de saber que
 *  no se escribió. Sin respuesta (red, timeout), un 5xx o cualquier otro 503, es incierto. */
function esResultadoDefinitivo(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.status === 503) return FALTA_REVISION.test(err.detail)
  return err.status >= 400 && err.status < 500 && err.status !== 408
}

const AVISO_INCIERTO = 'No se sabe si se llegó a registrar.'

/** El envío de un diálogo de escritura: sin doble envío (una guarda síncrona, porque dos clics pueden entrar antes de
 *  que el estado deshabilite el botón), el error a la vista y la `clave_operacion` del intento.
 *
 *  🔑 `claveDe(firma)`: la misma clave mientras los datos que se van a enviar sean los mismos, otra cuando cambian.
 *  `enviar` guarda el intento ANTES de mandarlo y lo borra sólo con un resultado definitivo. */
function useEscritura(alCambiarPendientes: () => void) {
  const [enVuelo, setEnVuelo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const guarda = useRef(false)
  const clave = useRef<{ firma: string; valor: string } | null>(null)

  function claveDe(firma: string): string {
    if (clave.current?.firma !== firma) clave.current = { firma, valor: nuevaClaveDeOperacion() }
    return clave.current.valor
  }

  /** Tras descartar un intento: el que venga es otra operación y no puede heredar su clave. */
  function olvidarClave() {
    clave.current = null
  }

  async function enviar<T>(dato: Omit<Pendiente, 'creado'> & { creado?: number }, pedir: (cuerpo: Payload) => Promise<T>, alExito: (respuesta: T) => void) {
    if (guarda.current) return
    guarda.current = true
    setEnVuelo(true)
    setError(null)
    // Un reenvío conserva la hora del intento original.
    const intento: Pendiente = { ...dato, creado: dato.creado ?? Date.now() }
    guardarPendiente(intento)
    alCambiarPendientes()
    try {
      const respuesta = await pedir(intento.cuerpo)
      quitarPendiente(intento.firma)
      alCambiarPendientes()
      alExito(respuesta)
    } catch (err) {
      if (esResultadoDefinitivo(err)) {
        // El motor dijo que no escribió (y no gasta la clave): no queda nada pendiente.
        quitarPendiente(intento.firma)
        alCambiarPendientes()
        setError(mensajeDeError(err))
      } else {
        // Se queda guardado, con su cuerpo y su clave: lo único que se puede hacer es reenviarlo o descartarlo.
        setError(`${err instanceof ApiError ? mensajeDeError(err) : 'Error de conexión.'} ${AVISO_INCIERTO}`)
      }
    } finally {
      guarda.current = false
      setEnVuelo(false)
    }
  }

  function descartar(firma: string) {
    quitarPendiente(firma)
    olvidarClave()
    setError(null)
    alCambiarPendientes()
  }

  return { enVuelo, error, claveDe, enviar, descartar }
}

/** Lo que hay que hacer con un intento anterior sin confirmar: reenviarlo tal cual (con «Reenviar el intento anterior»,
 *  que es el botón de confirmar del diálogo) o descartarlo, y descartar pide una confirmación con la advertencia. */
function PanelIntentoPendiente({ pendiente, resumen, deshabilitado, onDescartar }: {
  pendiente: Pendiente
  resumen: string
  deshabilitado: boolean
  onDescartar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  return (
    <div className="grid gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
      <p role="status">
        Hay un intento anterior sin confirmar para esta misma operación (intento del {FORMATO_DE_HORA.format(pendiente.creado)}): {resumen}.
        {' '}Al reenviarlo se manda lo mismo con la misma clave, así que no se duplica. Mientras esté pendiente no se puede
        mandar otra operación sobre esto.
      </p>
      {confirmando ? (
        <div className="grid gap-2">
          <p role="alert" className="font-medium">
            Sólo descartalo si verificaste en el stock que NO se registró; si se registró y lo descartás, podrías duplicar el movimiento.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={deshabilitado} onClick={onDescartar}>Sí, descartar el intento anterior</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmando(false)}>No, volver</Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" size="sm" variant="outline" disabled={deshabilitado} onClick={() => setConfirmando(true)}>
            Descartar el intento anterior…
          </Button>
        </div>
      )}
    </div>
  )
}

function Campo({ id, etiqueta, error, children }: { id: string; etiqueta: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function DialogoMerma({ fila, alCambiarPendientes, onCerrar, onListo }: {
  fila: VencimientoLote
  alCambiarPendientes: () => void
  onCerrar: () => void
  onListo: (respuesta: VencimientoMermaRespuesta) => void
}) {
  const [cantidad, setCantidad] = useState(String(fila.saldo))
  const [motivo, setMotivo] = useState('vencimiento')
  const [nota, setNota] = useState('')
  const [intentado, setIntentado] = useState(false)
  const { enVuelo, error, claveDe, enviar, descartar } = useEscritura(alCambiarPendientes)
  const errorDeLaCantidad = errorDeCantidad(cantidad, fila.saldo)

  // El destino es la fila entera: con un intento pendiente sobre ella, lo único que se puede hacer es reenviarlo o descartarlo.
  const firma = firmaDeDestino('merma', { ...fila, lote: fila.lote, vence: fila.vence })
  const pendiente = leerPendientes()[firma] ?? null
  const cuerpoPendiente = pendiente?.cuerpo as VencimientoMermaPayload | undefined

  function confirmar() {
    if (pendiente) {
      void enviar(pendiente, (cuerpo) => api.post<VencimientoMermaRespuesta>(`${RUTA}/merma`, cuerpo), onListo)
      return
    }
    setIntentado(true)
    if (errorDeLaCantidad) return
    const datos = {
      producto_id: fila.producto_id, deposito_id: fila.deposito_id, variante_id: fila.variante_id, lote: fila.lote,
      vence: fila.vence, cantidad: Number(cantidad), motivo: motivo.trim(), nota: nota.trim(),
    }
    const cuerpo: VencimientoMermaPayload = { ...datos, clave_operacion: claveDe(JSON.stringify(datos)) }
    void enviar({ firma, tipo: 'merma', cuerpo },
      (c) => api.post<VencimientoMermaRespuesta>(`${RUTA}/merma`, c), onListo)
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enVuelo) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trash2 className="size-4" />Dar de baja (merma)</DialogTitle>
          <DialogDescription>
            {fila.nombre}{fila.variante ? ` (${fila.variante})` : ''} · lote {fila.lote ?? '(sin código)'} · vence {fecha(fila.vence)} ·
            {' '}{ubicacion(fila)} · saldo {numero(fila.saldo)} {fila.unidad}
          </DialogDescription>
        </DialogHeader>
        <AvisoSaldoSobreestimado />
        {pendiente && cuerpoPendiente && !enVuelo && (
          <PanelIntentoPendiente
            pendiente={pendiente} deshabilitado={enVuelo} onDescartar={() => descartar(firma)}
            resumen={`dar de baja ${numero(cuerpoPendiente.cantidad)} ${fila.unidad}`}
          />
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-4">
          <Campo id="merma-cantidad" etiqueta="Cantidad a dar de baja" error={pendiente ? null : (intentado || cantidad !== '' ? errorDeLaCantidad : null)}>
            <Input
              id="merma-cantidad" type="number" inputMode="decimal" min={0} max={fila.saldo} step="any" disabled={!!pendiente}
              value={cuerpoPendiente ? String(cuerpoPendiente.cantidad) : cantidad}
              aria-invalid={!pendiente && errorDeLaCantidad !== null} onChange={(e) => setCantidad(e.target.value)}
            />
          </Campo>
          <Campo id="merma-motivo" etiqueta="Motivo">
            <Input id="merma-motivo" disabled={!!pendiente} value={cuerpoPendiente ? cuerpoPendiente.motivo : motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <Campo id="merma-nota" etiqueta="Nota">
            <Textarea id="merma-nota" rows={2} disabled={!!pendiente} value={cuerpoPendiente ? cuerpoPendiente.nota : nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={enVuelo} onClick={onCerrar}>Cancelar</Button>
          <Button type="button" disabled={enVuelo} onClick={confirmar}>
            <Check />{enVuelo ? 'Guardando…' : (pendiente ? 'Reenviar el intento anterior' : 'Confirmar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoAsignar({ fila, alCambiarPendientes, onCerrar, onListo }: {
  fila: VencimientoSinLote
  alCambiarPendientes: () => void
  onCerrar: () => void
  onListo: (respuesta: VencimientoAsignarRespuesta) => void
}) {
  // Con un intento anterior sin confirmar sobre esta fila (el lote y la fecha los puso el usuario, no la fila), se abre
  // con su lote y su fecha: es lo que lo identifica, y así se ve enseguida.
  const [previo] = useState(() => Object.values(leerPendientes())
    .filter((p): p is Pendiente & { cuerpo: VencimientoAsignarPayload } => p.tipo === 'asignar'
      && p.cuerpo.producto_id === fila.producto_id && p.cuerpo.deposito_id === fila.deposito_id && p.cuerpo.variante_id === fila.variante_id)
    .sort((a, b) => b.creado - a.creado)[0])
  const [lote, setLote] = useState(previo?.cuerpo.lote ?? '')
  const [vence, setVence] = useState(previo?.cuerpo.vence ?? '')
  const [cantidad, setCantidad] = useState(String(fila.saldo))
  const [nota, setNota] = useState('')
  const [intentado, setIntentado] = useState(false)
  const { enVuelo, error, claveDe, enviar, descartar } = useEscritura(alCambiarPendientes)

  const errorDelLote = lote.trim() === '' ? 'Escribí el código del lote.' : null
  // `<input type="date">` entrega `aaaa-mm-dd` o vacío: eso es lo que se manda, sin reformatear.
  const errorDeLaFecha = /^\d{4}-\d{2}-\d{2}$/.test(vence) ? null : 'Elegí la fecha de vencimiento.'
  const errorDeLaCantidad = errorDeCantidad(cantidad, fila.saldo)

  // El destino son el lote y la fecha elegidos (más la fila): con un intento pendiente sobre él sólo se puede reenviarlo
  // o descartarlo. Lote y fecha siguen editables: cambiarlos es apuntar a otro destino.
  const firma = errorDelLote || errorDeLaFecha ? null : firmaDeDestino('asignar', { ...fila, lote: lote.trim(), vence })
  const pendiente = firma ? leerPendientes()[firma] ?? null : null
  const cuerpoPendiente = pendiente?.cuerpo as VencimientoAsignarPayload | undefined

  function confirmar() {
    if (pendiente) {
      void enviar(pendiente, (cuerpo) => api.post<VencimientoAsignarRespuesta>(`${RUTA}/asignar`, cuerpo), onListo)
      return
    }
    setIntentado(true)
    if (!firma || errorDeLaCantidad) return
    const datos = {
      producto_id: fila.producto_id, deposito_id: fila.deposito_id, variante_id: fila.variante_id, lote: lote.trim(),
      vence, cantidad: Number(cantidad), nota: nota.trim(),
    }
    const cuerpo: VencimientoAsignarPayload = { ...datos, clave_operacion: claveDe(JSON.stringify(datos)) }
    void enviar({ firma, tipo: 'asignar', cuerpo },
      (c) => api.post<VencimientoAsignarRespuesta>(`${RUTA}/asignar`, c), onListo)
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enVuelo) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="size-4" />Asignar vencimiento</DialogTitle>
          <DialogDescription>
            {fila.nombre}{fila.variante ? ` (${fila.variante})` : ''} · {ubicacion(fila)} · saldo sin lote {numero(fila.saldo)} {fila.unidad}.
            {' '}El stock total no cambia: una parte pasa de “sin lote” al lote y la fecha que elijas.
          </DialogDescription>
        </DialogHeader>
        <AvisoSaldoSobreestimado />
        {pendiente && cuerpoPendiente && !enVuelo && (
          <PanelIntentoPendiente
            pendiente={pendiente} deshabilitado={enVuelo} onDescartar={() => descartar(pendiente.firma)}
            resumen={`asignar ${numero(cuerpoPendiente.cantidad)} ${fila.unidad} al lote ${cuerpoPendiente.lote} (vence ${fecha(cuerpoPendiente.vence)})`}
          />
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-4">
          <Campo id="asignar-lote" etiqueta="Lote" error={intentado ? errorDelLote : null}>
            <Input
              id="asignar-lote" value={lote} maxLength={MAX_LARGO_LOTE} aria-invalid={intentado && errorDelLote !== null}
              onChange={(e) => setLote(e.target.value)}
            />
          </Campo>
          <Campo id="asignar-vence" etiqueta="Fecha de vencimiento" error={intentado ? errorDeLaFecha : null}>
            <Input
              id="asignar-vence" type="date" value={vence} aria-invalid={intentado && errorDeLaFecha !== null}
              onChange={(e) => setVence(e.target.value)}
            />
          </Campo>
          <Campo id="asignar-cantidad" etiqueta="Cantidad" error={pendiente ? null : (intentado || cantidad !== '' ? errorDeLaCantidad : null)}>
            <Input
              id="asignar-cantidad" type="number" inputMode="decimal" min={0} max={fila.saldo} step="any" disabled={!!pendiente}
              value={cuerpoPendiente ? String(cuerpoPendiente.cantidad) : cantidad}
              aria-invalid={!pendiente && errorDeLaCantidad !== null} onChange={(e) => setCantidad(e.target.value)}
            />
          </Campo>
          <Campo id="asignar-nota" etiqueta="Nota">
            <Textarea id="asignar-nota" rows={2} disabled={!!pendiente} value={cuerpoPendiente ? cuerpoPendiente.nota : nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={enVuelo} onClick={onCerrar}>Cancelar</Button>
          <Button type="button" disabled={enVuelo} onClick={confirmar}>
            <Check />{enVuelo ? 'Guardando…' : (pendiente ? 'Reenviar el intento anterior' : 'Confirmar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Orden de la tabla de lotes (del navegador) ───────────────────────────────────────────────────────────────────

type ClaveOrden = 'nombre' | 'codigo' | 'ubicacion' | 'lote' | 'vence' | 'dias_para_vencer' | 'saldo'

const COLUMNAS: { orden: ClaveOrden; titulo: string; alinea: 'left' | 'right' }[] = [
  { orden: 'nombre', titulo: 'Producto', alinea: 'left' },
  { orden: 'codigo', titulo: 'Código', alinea: 'left' },
  { orden: 'ubicacion', titulo: 'Sucursal / depósito', alinea: 'left' },
  { orden: 'lote', titulo: 'Lote', alinea: 'left' },
  { orden: 'vence', titulo: 'Vence', alinea: 'left' },
  { orden: 'dias_para_vencer', titulo: 'Días para vencer', alinea: 'left' },
  { orden: 'saldo', titulo: 'Saldo', alinea: 'right' },
]

/** Lo que se ordena de cada fila; `null` (sin código, sin lote) va siempre al final. */
function valorDeOrden(l: VencimientoLote, clave: ClaveOrden): number | string | null {
  if (clave === 'ubicacion') return ubicacion(l)
  if (clave === 'codigo') return l.codigo || null
  if (clave === 'lote') return l.lote || null
  return l[clave]
}

function ordenar(lotes: VencimientoLote[], orden: { clave: ClaveOrden; sentido: 1 | -1 } | null): VencimientoLote[] {
  if (!orden) return lotes
  const { clave, sentido } = orden
  // `sort` es estable: lo que empata queda en el orden del motor.
  return [...lotes].sort((a, b) => {
    const x = valorDeOrden(a, clave)
    const y = valorDeOrden(b, clave)
    if (x === null || y === null) return x === y ? 0 : (x === null ? 1 : -1)
    const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'es', { sensitivity: 'base' }) : Number(x) - Number(y)
    return c * sentido
  })
}

/** ¿Hay un intento sin confirmar sobre esta fila? En un lote, la baja de ese lote; en un saldo sin lote, cualquier asignación
 *  sobre ese producto, depósito y variante. */
const pendienteDeLote = (todos: Pendiente[], l: VencimientoLote) => todos.some((p) => p.firma === firmaDeDestino('merma', l))
const pendienteDeSinLote = (todos: Pendiente[], s: VencimientoSinLote) => todos.some((p) => p.tipo === 'asignar'
  && p.cuerpo.producto_id === s.producto_id && p.cuerpo.deposito_id === s.deposito_id && p.cuerpo.variante_id === s.variante_id)

function MarcaSinConfirmar() {
  return (
    <Badge variant="outline" className="ml-2 whitespace-normal border-amber-500/50 text-amber-600 dark:text-amber-400">
      Intento sin confirmar
    </Badge>
  )
}

const claveDeFila = (f: VencimientoLote | VencimientoSinLote) =>
  `${f.producto_id}-${f.deposito_id}-${f.variante_id ?? ''}-${'lote' in f ? `${f.lote ?? ''}-${f.vence}` : 'sin-lote'}`

type Aviso = { texto: string }

export function Vencimientos({ puedeMover = true, puedeMarcar = true }: { puedeMover?: boolean; puedeMarcar?: boolean } = {}) {
  const [dias, setDias] = useState(DIAS_POR_DEFECTO)
  const [sucursal, setSucursal] = useState(TODAS)
  const [categoria, setCategoria] = useState(TODAS)
  const [incluirVencidos, setIncluirVencidos] = useState(true)
  const [orden, setOrden] = useState<{ clave: ClaveOrden; sentido: 1 | -1 } | null>(null)
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  // Cada escritura exitosa suma uno: la consulta actual se vuelve a pedir (el pedido es «consulta + versión»).
  const [recarga, setRecarga] = useState(0)
  // Lo último que contestó el motor, con el pedido al que contestó (ver el encabezado).
  const [respuesta, setRespuesta] = useState<{ pedido: string; data: VencimientosData | null; error: string | null } | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [aMermar, setAMermar] = useState<VencimientoLote | null>(null)
  const [aAsignar, setAAsignar] = useState<VencimientoSinLote | null>(null)
  // Los intentos inciertos viven en un almacén de módulo (ver el encabezado); este contador sólo vuelve a dibujar la
  // pantalla (las marcas por fila) cuando un diálogo los cambia.
  const [, setVersionDePendientes] = useState(0)
  const alCambiarPendientes = () => setVersionDePendientes((v) => v + 1)
  const pendientesDeAhora = Object.values(leerPendientes())

  const errorDeLosDias = errorDeDias(dias)
  const valido = errorDeLosDias === null

  // Una sola forma de armar la consulta para el JSON y para el CSV. `null` con un parámetro inválido: no se pide.
  const consulta = useMemo(() => {
    if (!valido) return null
    const q = new URLSearchParams({ dias: String(Number(dias)), incluir_vencidos: String(incluirVencidos) })
    if (sucursal !== TODAS) q.set('sucursal_id', sucursal)
    if (categoria !== TODAS) q.set('categoria', categoria)
    return q.toString()
  }, [valido, dias, incluirVencidos, sucursal, categoria])
  const pedido = consulta === null ? null : `${consulta}#${recarga}`

  // Sin sucursales o sin categorías (un producto sin sucursales, o un usuario sin permiso) la pantalla sigue: sólo
  // pierde ese filtro.
  useEffect(() => {
    let vigente = true
    api.get<Sucursal[]>('/api/sucursales').then((s) => { if (vigente) setSucursales(s) }).catch(() => {})
    api.get<CategoriaProducto[]>('/api/productos/categorias').then((c) => { if (vigente) setCategorias(c) }).catch(() => {})
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    if (consulta === null || pedido === null) return
    // Una respuesta que llega después de otro cambio de parámetros no pisa a la más nueva.
    let vigente = true
    api.get<VencimientosData>(`${RUTA}?${consulta}`)
      .then((data) => { if (vigente) setRespuesta({ pedido, data, error: null }) })
      .catch((err) => { if (vigente) setRespuesta({ pedido, data: null, error: mensajeDeError(err) }) })
    return () => { vigente = false }
  }, [consulta, pedido])

  // Sólo vale lo que contestó el motor al pedido de los controles de ahora.
  const actual = respuesta?.pedido === pedido
  const data = actual ? respuesta.data : null
  const loading = !actual
  const error = actual ? respuesta.error : null

  function ordenarPor(clave: ClaveOrden) {
    if (orden?.clave === clave) setOrden({ clave, sentido: orden.sentido === 1 ? -1 : 1 })
    else setOrden({ clave, sentido: clave === 'saldo' ? -1 : 1 })
  }

  const lotes = useMemo(() => ordenar(data?.lotes ?? [], orden), [data, orden])

  function listo(texto: string) {
    setAMermar(null)
    setAAsignar(null)
    setAviso({ texto })
    setRecarga((r) => r + 1)
  }

  function mermaHecha(f: VencimientoLote, r: VencimientoMermaRespuesta) {
    listo(r.repetida
      ? `Ya estaba registrado: esta baja se había guardado antes, no se volvió a descontar. Saldo del lote: ${numero(r.saldo_restante)} ${f.unidad}.`
      : `Se dieron de baja ${numero(r.cantidad)} ${f.unidad} de ${f.nombre}, lote ${r.lote ?? '(sin código)'}. Saldo del lote: ${numero(r.saldo_restante)} ${f.unidad}.`)
  }

  function asignacionHecha(f: VencimientoSinLote, r: VencimientoAsignarRespuesta) {
    listo(r.repetida
      ? `Ya estaba registrado: este vencimiento se había asignado antes, no se volvió a mover stock. Sin lote quedan ${numero(r.saldo_sin_lote)} ${f.unidad}.`
      : `Se asignó el lote ${r.lote} (vence ${fecha(r.vence)}) a ${numero(r.cantidad)} ${f.unidad} de ${f.nombre}. Sin lote quedan ${numero(r.saldo_sin_lote)} ${f.unidad}.`)
  }

  return (
    <div className="grid gap-4">
      <TituloPantalla icono={CalendarClock}>Vencimientos y lotes</TituloPantalla>

      {/* Permanente: sin botón para cerrarlo y visible aunque la lista esté cargando, con error o vacía. */}
      <AvisoSaldoSobreestimado />

      <div className="flex flex-wrap items-start gap-3">
        {sucursales.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="vencimientos-sucursal">Sucursal</Label>
            <Select value={sucursal} onValueChange={setSucursal}>
              <SelectTrigger id="vencimientos-sucursal" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Toda la instancia</SelectItem>
                {sucursales.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {categorias.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="vencimientos-categoria">Categoría</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger id="vencimientos-categoria" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas las categorías</SelectItem>
                {categorias.map((c) => <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="vencimientos-dias">Días de anticipación</Label>
          <Input
            id="vencimientos-dias" type="number" inputMode="numeric" min={1} max={MAX_DIAS} step={1} value={dias} className="w-40"
            aria-invalid={errorDeLosDias !== null} aria-describedby={errorDeLosDias ? 'vencimientos-dias-error' : undefined}
            onChange={(e) => setDias(e.target.value)}
          />
          {errorDeLosDias && <p id="vencimientos-dias-error" role="alert" className="max-w-40 text-xs text-destructive">{errorDeLosDias}</p>}
        </div>
        <label className="flex items-center gap-2 pt-8 text-sm">
          <input type="checkbox" checked={incluirVencidos} onChange={(e) => setIncluirVencidos(e.target.checked)} className="size-4" />
          Incluir vencidos
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        Sólo aparecen los productos marcados como perecederos (más abajo se marcan). Se listan los lotes con saldo que vencen dentro de
        los próximos {valido ? dias : '…'} días{incluirVencidos ? ' y los que ya vencieron' : ''}. El stock que no tiene lote ni fecha no se
        puede avisar: está en «Sin lote / sin fecha».
      </p>

      {aviso && <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">{aviso.texto}</p>}

      {valido && error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!valido ? (
        <p role="status" className="py-6 text-center text-sm text-muted-foreground">Corregí los días de anticipación para ver los lotes.</p>
      ) : !data ? (
        loading && <p role="status" className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <CalendarClock className="size-4 text-primary" />
                {data.lotes.length} lote{data.lotes.length !== 1 ? 's' : ''}
                <span className="text-sm font-normal text-muted-foreground">
                  {' · '}{data.resumen.lotes_por_vencer} por vencer ({numero(data.resumen.unidades_por_vencer)} unid.)
                  {' · '}{data.resumen.lotes_vencidos} vencidos ({numero(data.resumen.unidades_vencidas)} unid.)
                  {' · '}{data.resumen.productos} producto{data.resumen.productos !== 1 ? 's' : ''}
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                {orden && (
                  <Button size="sm" variant="outline" onClick={() => setOrden(null)}>Orden por vencimiento</Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <a href={`${RUTA}/export?${consulta}`}><Download />CSV</a>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                Hoy es {fecha(data.hoy)}; se listan los lotes que vencen hasta el {fecha(data.hasta)}. Las cantidades de la suma van cada una en la unidad de su producto.
              </p>
              {data.lotes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No hay lotes por vencer con estos parámetros
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        {COLUMNAS.map((c) => (
                          <th
                            key={c.orden}
                            scope="col"
                            aria-sort={c.orden === orden?.clave ? (orden.sentido === 1 ? 'ascending' : 'descending') : 'none'}
                            className={`p-3 font-medium ${c.alinea === 'right' ? 'text-right' : 'text-left'}`}
                          >
                            <button type="button" onClick={() => ordenarPor(c.orden)} className="font-medium hover:text-foreground">
                              {c.titulo}{c.orden === orden?.clave ? (orden.sentido === 1 ? ' ▲' : ' ▼') : ''}
                            </button>
                          </th>
                        ))}
                        {puedeMover && <th scope="col" className="p-3 text-right font-medium">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lotes.map((l) => (
                        <tr key={claveDeFila(l)} className="border-b last:border-0">
                          <td className="p-3">
                            <span className="font-medium">{l.nombre}</span>
                            {l.variante && <span className="ml-2 text-xs text-muted-foreground">{l.variante}</span>}
                            {l.categoria && <span className="ml-2 text-xs text-muted-foreground">{l.categoria}</span>}
                            {pendienteDeLote(pendientesDeAhora, l) && <MarcaSinConfirmar />}
                          </td>
                          <td className="p-3">{l.codigo || '—'}</td>
                          <td className="p-3">
                            {ubicacion(l)}
                            {!l.deposito_activo && <Badge variant="outline" className="ml-2">Depósito inactivo</Badge>}
                          </td>
                          <td className="p-3">{l.lote ?? '—'}</td>
                          <td className="p-3">{fecha(l.vence)}</td>
                          <td className="p-3"><BadgeDeDias dias={l.dias_para_vencer} /></td>
                          <td className="p-3 text-right">
                            {numero(l.saldo)}{l.unidad && <> <span className="text-xs text-muted-foreground">{l.unidad}</span></>}
                          </td>
                          {puedeMover && (
                            <td className="p-3 text-right">
                              <Button size="sm" variant="outline" aria-label={`Dar de baja (merma) ${l.nombre}, lote ${l.lote ?? 'sin código'}`} onClick={() => { setAviso(null); setAMermar(l) }}>
                                <Trash2 />Dar de baja (merma)
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Sin lote / sin fecha
                <span className="text-sm font-normal text-muted-foreground">
                  {' · '}{data.resumen.saldos_sin_fecha} sin fecha
                  {' · '}{data.resumen.saldos_con_salidas_sin_lote} con salidas sin lote
                </span>
              </CardTitle>
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {(Object.keys(SITUACION) as VencimientoSituacion[]).map((s) => (
                  <li key={s}><strong className="font-medium text-foreground">{SITUACION[s].etiqueta}:</strong> {SITUACION[s].explicacion}</li>
                ))}
              </ul>
            </CardHeader>
            <CardContent className="p-0">
              {data.sin_lote.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No hay stock sin lote en los productos marcados
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <th scope="col" className="p-3 text-left font-medium">Producto</th>
                        <th scope="col" className="p-3 text-left font-medium">Código</th>
                        <th scope="col" className="p-3 text-left font-medium">Sucursal / depósito</th>
                        <th scope="col" className="p-3 text-right font-medium">Saldo sin lote</th>
                        <th scope="col" className="p-3 text-left font-medium">Situación</th>
                        {puedeMover && <th scope="col" className="p-3 text-right font-medium">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.sin_lote.map((s) => (
                        <tr key={claveDeFila(s)} className="border-b last:border-0">
                          <td className="p-3">
                            <span className="font-medium">{s.nombre}</span>
                            {s.variante && <span className="ml-2 text-xs text-muted-foreground">{s.variante}</span>}
                            {s.categoria && <span className="ml-2 text-xs text-muted-foreground">{s.categoria}</span>}
                            {pendienteDeSinLote(pendientesDeAhora, s) && <MarcaSinConfirmar />}
                          </td>
                          <td className="p-3">{s.codigo || '—'}</td>
                          <td className="p-3">
                            {ubicacion(s)}
                            {!s.deposito_activo && <Badge variant="outline" className="ml-2">Depósito inactivo</Badge>}
                          </td>
                          <td className={`p-3 text-right ${s.saldo < 0 ? 'text-destructive' : ''}`}>
                            {numero(s.saldo)}{s.unidad && <> <span className="text-xs text-muted-foreground">{s.unidad}</span></>}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline" data-situacion={s.situacion}
                              className={`whitespace-normal ${s.situacion === 'salidas_sin_lote' ? 'border-amber-500/50 text-amber-600 dark:text-amber-400' : ''}`}
                            >
                              {SITUACION[s.situacion].etiqueta}
                            </Badge>
                          </td>
                          {puedeMover && (
                            <td className="p-3 text-right">
                              {/* Sólo hay qué asignar con saldo positivo: un negativo son salidas, no stock. */}
                              {s.situacion === 'sin_fecha' && (
                                <Button size="sm" variant="outline" aria-label={`Asignar vencimiento ${s.nombre}${s.variante ? ` (${s.variante})` : ''}, ${ubicacion(s)}`} onClick={() => { setAviso(null); setAAsignar(s) }}>
                                  <CalendarPlus />Asignar vencimiento
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ProductosQueVencen puedeMarcar={puedeMarcar} onMarcado={(texto) => { setAviso({ texto }); setRecarga((r) => r + 1) }} />

      {aMermar && (
        <DialogoMerma fila={aMermar} alCambiarPendientes={alCambiarPendientes} onCerrar={() => setAMermar(null)} onListo={(r) => mermaHecha(aMermar, r)} />
      )}
      {aAsignar && (
        <DialogoAsignar fila={aAsignar} alCambiarPendientes={alCambiarPendientes} onCerrar={() => setAAsignar(null)} onListo={(r) => asignacionHecha(aAsignar, r)} />
      )}
    </div>
  )
}

// ── Productos que vencen (marcar / desmarcar, de a un producto) ──────────────────────────────────────────────────

function ProductosQueVencen({ puedeMarcar, onMarcado }: { puedeMarcar: boolean; onMarcado: (texto: string) => void }) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [errorDeProductos, setErrorDeProductos] = useState<string | null>(null)
  const [productoId, setProductoId] = useState('')
  // La ficha con el producto al que pertenece: si se elige otro mientras llega la anterior, no vale.
  const [ficha, setFicha] = useState<{ productoId: string; vence: boolean | null; error: string | null } | null>(null)
  const [marcando, setMarcando] = useState(false)
  const [errorDeMarca, setErrorDeMarca] = useState<string | null>(null)
  const guarda = useRef(false)

  useEffect(() => {
    let vigente = true
    api.get<Producto[]>('/api/productos')
      .then((p) => { if (vigente) setProductos(p) })
      .catch((err) => { if (vigente) setErrorDeProductos(mensajeDeError(err)) })
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    if (!productoId) return
    let vigente = true
    api.get<VencimientoProductoLotes>(`${RUTA}/productos/${productoId}/lotes`)
      .then((r) => { if (vigente) setFicha({ productoId, vence: r.producto.vence, error: null }) })
      .catch((err) => { if (vigente) setFicha({ productoId, vence: null, error: mensajeDeError(err) }) })
    return () => { vigente = false }
  }, [productoId])

  // Un servicio no tiene inventario y uno inactivo no entra al reporte: no se ofrecen.
  const opciones = useMemo(
    () => productos.filter((p) => p.activo && p.tipo !== 'servicio')
      .map((p) => ({ value: String(p.id), label: p.nombre, hint: p.codigo ?? undefined })),
    [productos],
  )
  const elegido = productos.find((p) => String(p.id) === productoId)
  const actual = ficha?.productoId === productoId ? ficha : null

  function elegir(valor: string) {
    setProductoId(valor)
    setErrorDeMarca(null)
  }

  async function marcar(vence: boolean) {
    if (guarda.current) return
    guarda.current = true
    setMarcando(true)
    setErrorDeMarca(null)
    try {
      const r = await api.put<VencimientoMarca>(`${RUTA}/productos/${productoId}`, { vence })
      setFicha({ productoId, vence: r.vence, error: null })
      onMarcado(r.vence
        ? `${elegido?.nombre ?? 'El producto'} quedó marcado como perecedero: ahora aparece en los vencimientos.`
        : `${elegido?.nombre ?? 'El producto'} ya no se marca como perecedero. Los lotes que ya tiene no se tocan.`)
    } catch (err) {
      setErrorDeMarca(mensajeDeError(err))
    } finally {
      guarda.current = false
      setMarcando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Productos que vencen</CardTitle>
        <p className="text-sm text-muted-foreground">
          Sólo los productos marcados aparecen en el reporte de arriba. Elegí un producto para ver si vence{puedeMarcar ? ' y marcarlo o desmarcarlo' : ''}.
          {' '}No hay un listado de los productos marcados: se consulta de a uno.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {errorDeProductos ? (
          <p role="alert" className="text-sm text-destructive">{errorDeProductos}</p>
        ) : (
          <div className="grid max-w-md gap-2">
            <Label htmlFor="vencimientos-producto">Producto</Label>
            <SelectBuscable
              id="vencimientos-producto" value={productoId} onChange={elegir} opciones={opciones} disabled={marcando}
              placeholder="Buscá un producto…" emptyMessage="Ningún producto coincide." ariaLabel="Producto"
            />
          </div>
        )}
        {productoId && !actual && <p role="status" className="text-sm text-muted-foreground">Consultando…</p>}
        {actual?.error && <p role="alert" className="text-sm text-destructive">{actual.error}</p>}
        {actual && actual.vence !== null && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              <span className="font-medium">{elegido?.nombre}</span>{' '}
              {actual.vence ? 'está marcado como perecedero.' : 'no está marcado como perecedero.'}
            </p>
            {puedeMarcar && (
              <Button size="sm" variant="outline" disabled={marcando} onClick={() => void marcar(!actual.vence)}>
                {actual.vence ? 'Dejar de marcar como perecedero' : 'Marcar como perecedero'}
              </Button>
            )}
          </div>
        )}
        {errorDeMarca && <p role="alert" className="text-sm text-destructive">{errorDeMarca}</p>}
      </CardContent>
    </Card>
  )
}

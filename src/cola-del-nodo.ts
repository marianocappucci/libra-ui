// La cola de comprobantes del nodo de LibraEdge (ADR-094; el motor es ADR-079 de libracore, `libracore.cola_arca` y
// `cola_arca_router`): los tipos de lo que contesta `GET /api/nodo/cola`, los textos, el manejo del 202 `en_cola` y el hook que
// la lee. Los componentes están en `BandejaDeLaCola.tsx` y `AvisosDeLaCola.tsx`.
//
// ## Qué es la cola y qué no
//
// En un nodo sin conexión, una factura que no nace de una venta del punto de venta (la de LibraCargo desde una orden, la
// «conjunta» de LibraClub) y una carta de porte electrónica (CPE) **no se pueden emitir**. No se pierden ni se numeran local: el
// pedido queda en `cola_arca` y sale solo al volver la conexión. **Mientras tanto no hay CPE válida, y un camión no puede viajar
// sin ella** (un límite legal): la pantalla tiene que decirlo (`AvisoSinCpeValida`).
//
// Es otra tabla que la bandeja de comprobantes pendientes (`comprobantes-pendientes.ts`, las ventas del punto de venta): ésa es
// un buzón para que una persona arme un formulario; ésta es de máquina, con un estado por pedido. Por eso los tipos son otros;
// la pantalla es la misma (`BandejaDeComprobantes` suma una pestaña con `cola`).
//
// ## Estados
//
// `esperando` → `emitiendo` → `emitido`, o `a_revisar` (ARCA rechazó o el emisor falló: lo mira una persona) o `incierto` (no
// se sabe si ARCA lo emitió: **no se reintenta solo**, una persona consulta a ARCA); `descartado` lo cierra una persona.
// Los cuatro primeros son los **abiertos**: el comprobante todavía no existe.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, ApiError } from './api-client'
import type { TonoEstado } from './badge-estado'

export type EstadoDePedido = 'esperando' | 'emitiendo' | 'emitido' | 'a_revisar' | 'incierto' | 'descartado'
/** `documento` es una factura que no nace de una venta (la de una orden de carga, la conjunta de una reserva); `cpe`, una carta
 *  de porte electrónica. Lista cerrada en el motor. */
export type TipoDePedido = 'documento' | 'cpe'

export const ESTADOS_DE_PEDIDO: readonly EstadoDePedido[] = ['esperando', 'emitiendo', 'emitido', 'a_revisar', 'incierto', 'descartado']
/** Lo que todavía no terminó: el comprobante no existe. */
export const ESTADOS_ABIERTOS: readonly EstadoDePedido[] = ['esperando', 'emitiendo', 'a_revisar', 'incierto']
/** Lo que una persona tiene que mirar. */
export const ESTADOS_DE_REVISION: readonly EstadoDePedido[] = ['a_revisar', 'incierto']
/** Lo que ya no se mueve. */
export const ESTADOS_FINALES: readonly EstadoDePedido[] = ['emitido', 'descartado']
export const TIPOS_DE_PEDIDO: readonly TipoDePedido[] = ['documento', 'cpe']

/** Una fila de `cola_arca` (`libracore.db.cola_arca`). `datos` lo arma y lo lee el emisor del producto: acá es opaco. */
export type PedidoDeCola = {
  id: number
  origen_producto: string
  /** El id del nodo. */
  origen_instancia: string
  origen_tipo: TipoDePedido
  /** El id de la entidad del producto (la orden, la reserva), **en texto**: es un id de otro sistema. */
  origen_id: string
  estado: EstadoDePedido
  datos: Record<string, unknown>
  fecha_ref: string
  concepto: number
  intentos: number
  /** El mensaje de ARCA (o del emisor) que dejó el pedido a revisar; en un `esperando`, el motivo de la espera. */
  ultimo_error: string
  /** Lo que devolvió el emisor al emitir (`{ctg, …}` o `{factura_id, cae}`); `null` mientras no salió. */
  resultado: Record<string, unknown> | null
  revision: number
  created_at: string
  updated_at: string
  resuelto_at: string
}

/** Lo que contesta `GET /api/nodo/cola`. Fuera de un nodo: `es_nodo: false` y sin pedidos. */
export type ColaDelNodo = {
  es_nodo: boolean
  en_linea: boolean
  node_id: string | null
  /** Cuántos pedidos hay en cada estado (de todos los tipos, no sólo de los listados). */
  cuentas: Partial<Record<EstadoDePedido, number>>
  /** `a_revisar` + `incierto`: lo que pide a una persona. */
  a_revisar: number
  pedidos: PedidoDeCola[]
}

export const RUTA_COLA_DEL_NODO = '/api/nodo/cola'
/** Cada cuánto se vuelve a preguntar mientras la pantalla esté abierta. */
export const INTERVALO_COLA_MS = 30_000
/** Lo que pide el motor por defecto (`?limite=`, hasta 1000). */
export const LIMITE_DE_LA_COLA = 200

// Los `detail.codigo` que contesta el motor en la cola (`cola_arca_router`) y en `nodo_offline`.
export const CODIGO_CONFIRMACION_REQUERIDA = 'confirmacion_requerida'
export const CODIGO_SOLO_EN_EL_CENTRAL = 'solo_en_el_central'
/** Los `codigo` del 202 de LibraCargo (`en_cola` una factura, `cpe_en_cola` una carta de porte). */
export const CODIGO_EN_COLA = 'en_cola'
export const CODIGO_CPE_EN_COLA = 'cpe_en_cola'

export const ETIQUETA_DE_ESTADO: Record<EstadoDePedido, string> = {
  esperando: 'En cola',
  emitiendo: 'Emitiéndose',
  emitido: 'Emitido',
  a_revisar: 'A revisar',
  incierto: 'Incierto',
  descartado: 'Descartado',
}

/** El tono de cada estado (los cinco de `BadgeEstado`): lo que espera es ámbar, lo que pide a una persona es rojo. */
export const TONO_DE_ESTADO: Record<EstadoDePedido, TonoEstado> = {
  esperando: 'atencion',
  emitiendo: 'curso',
  emitido: 'ok',
  a_revisar: 'negativo',
  incierto: 'negativo',
  descartado: 'neutro',
}

export const ETIQUETA_DE_TIPO: Record<TipoDePedido, string> = { documento: 'Factura', cpe: 'Carta de porte' }

// ── Los textos ──────────────────────────────────────────────────────────

export const TITULO_COLA = 'Cola de comprobantes'
export const TEXTO_COLA_DEL_NODO = 'Lo que se pidió sin conexión (facturas y cartas de porte) y todavía no salió en ARCA. Sale solo, una sola vez, cuando vuelve la conexión.'
export const TEXTO_FUERA_DE_UN_NODO = 'Esta instalación no es un nodo: no tiene cola de comprobantes.'
/** El texto de arriba de todo: lo que el cajero lee cuando apenas se pidió algo sin conexión. */
export const TEXTO_SE_EMITE_AL_VOLVER = 'Se emite al volver la conexión.'
/** 🔴 El aviso legal: sin CPE un camión no viaja. Es la frase que el producto pone en la orden de carga o el viaje. */
export const TEXTO_SIN_CPE_VALIDA = 'Esta carga todavía no tiene CPE válida: no puede viajar hasta que se emita.'
export const TEXTO_CPE_EN_COLA = 'Hasta que se emita, esta carga no tiene CPE válida: no puede viajar.'
/** La pregunta que pide el `incierto` antes de reintentar. */
export const PREGUNTA_NO_SALIO = '¿Confirmás que este comprobante NO salió en ARCA?'
export const EXPLICACION_NO_SALIO = 'No se sabe si ARCA llegó a emitirlo. Consultalo en ARCA antes de seguir: si figura, no lo reintentes, marcalo como emitido. Si lo reintentás y ya había salido, puede quedar duplicado.'
export const TEXTO_SIN_CONEXION_PARA_EMITIR = 'Sin conexión: los comprobantes se emiten cuando vuelva la conexión.'

/** «1 comprobante en cola», «3 comprobantes en cola». */
export function comprobantesEnCola(n: number): string {
  return n === 1 ? '1 comprobante en cola' : `${n} comprobantes en cola`
}

// ── Lo que sale de un pedido ────────────────────────────────────────────

export const estaAbierto = (estado: string | null | undefined): estado is EstadoDePedido =>
  ESTADOS_ABIERTOS.includes(estado as EstadoDePedido)

export const pideRevision = (estado: string | null | undefined): estado is EstadoDePedido =>
  ESTADOS_DE_REVISION.includes(estado as EstadoDePedido)

/** Los pedidos de CPE que todavía no salieron, de la lista que dio la cola. */
export function cpeSinEmitir(pedidos: readonly PedidoDeCola[]): PedidoDeCola[] {
  return pedidos.filter((p) => p.origen_tipo === 'cpe' && estaAbierto(p.estado))
}

/** El pedido de CPE abierto de una entidad del producto, o `undefined`. Si hubiera más de uno abierto, el más nuevo.
 *
 *  `quien` es el `origen_id` tal cual (que viaja como texto) o, cuando el producto lo arma distinto, una función que reconoce el pedido.
 *  🔑 LibraCargo no usa el id de la orden como `origen_id`: usa `orden41:<uuid>` (único por pedido, para poder volver a pedir una CPE
 *  descartada) y deja el id en `datos.orden_id`. Ahí va `(p) => p.datos.orden_id === orden.id`. */
export function pedidoDeCpeAbierto(
  pedidos: readonly PedidoDeCola[], quien: string | number | ((pedido: PedidoDeCola) => boolean),
): PedidoDeCola | undefined {
  const coincide = typeof quien === 'function' ? quien : (p: PedidoDeCola) => p.origen_id === String(quien)
  return cpeSinEmitir(pedidos).filter(coincide).sort((a, b) => b.id - a.id)[0]
}

/** Lo que dejó un pedido emitido, en una línea: «CTG 10123456789», «Factura 41». `''` si no hay nada que mostrar. */
export function resultadoDelPedido(p: Pick<PedidoDeCola, 'origen_tipo' | 'resultado'>): string {
  const r = p.resultado
  if (!r) return ''
  if (r.ctg != null && r.ctg !== '') return `CTG ${String(r.ctg)}`
  if (r.factura_id != null) return r.cae ? `Factura ${String(r.factura_id)} · CAE ${String(r.cae)}` : `Factura ${String(r.factura_id)}`
  return ''
}

// ── El 202 `en_cola` ────────────────────────────────────────────────────
//
// 🔑 Un 202 **no es un error** y `api.post` lo devuelve como cualquier 2xx: el cuerpo dice que el pedido quedó en la cola. Lo que la
// pantalla tenía que hacer —y no hacía— es no mostrarlo como si se hubiera emitido. Los dos productos lo contestan con formas
// distintas, y se reconocen las dos:
//   - LibraClub (`POST /api/reservas/{id}/facturar`): `{en_cola: true, estado, pedido_id, mensaje}`.
//   - LibraCargo (facturas y `POST …/emision/emitir`): `{codigo: "en_cola" | "cpe_en_cola", mensaje, pedido_id, estado, motivo}`.

export type RespuestaEnCola = {
  en_cola?: boolean
  codigo?: string
  estado?: string
  pedido_id?: number
  mensaje?: string
  motivo?: string
}

/** ¿Lo que contestó el nodo es «quedó en la cola» y no el comprobante emitido? */
export function esRespuestaEnCola(valor: unknown): valor is RespuestaEnCola {
  if (!valor || typeof valor !== 'object') return false
  const r = valor as RespuestaEnCola
  return r.en_cola === true || r.codigo === CODIGO_EN_COLA || r.codigo === CODIGO_CPE_EN_COLA
}

/** ¿Es una carta de porte la que quedó en la cola? Entonces el camión no puede viajar todavía. */
export const esCpeEnCola = (r: RespuestaEnCola): boolean => r.codigo === CODIGO_CPE_EN_COLA

/** El hook de la pantalla que pide un comprobante a un nodo: guarda lo que contestó la cola para mostrarlo con `AvisoEnCola`.
 *
 *      const { aviso, registrar, cerrar } = useAvisoDeEnCola()
 *      const r = await api.post(`/api/reservas/${id}/facturar`)
 *      if (registrar(r)) return          // quedó en la cola: el aviso ya está en pantalla
 *      …mostrar la factura…
 *
 *  `registrar` devuelve `true` si la respuesta era un 202 `en_cola` (y entonces no hay comprobante todavía). */
export function useAvisoDeEnCola() {
  const [aviso, setAviso] = useState<RespuestaEnCola | null>(null)
  const registrar = useCallback((respuesta: unknown): boolean => {
    if (!esRespuestaEnCola(respuesta)) return false
    setAviso(respuesta)
    return true
  }, [])
  const cerrar = useCallback(() => setAviso(null), [])
  return { aviso, registrar, cerrar }
}

// ── La consulta ─────────────────────────────────────────────────────────

export type OpcionesDeLaCola = {
  /** Dónde el producto montó `build_cola_del_nodo_router`. Por defecto `/api/nodo/cola`. */
  ruta?: string
  /** Sólo los pedidos de ese tipo. */
  tipo?: TipoDePedido
  /** Sólo los de esos estados. Sin esto, todos (los más nuevos primero, hasta `limite`). */
  estados?: readonly EstadoDePedido[]
  limite?: number
  /** Cada cuánto vuelve a preguntar; `0` no repite. Por defecto 30 s. */
  intervaloMs?: number
  /** `false` no consulta nada. Para una pantalla que sólo a veces la necesita (una pestaña, una opción del producto). */
  habilitada?: boolean
}

export type UsoDeLaCola = {
  cola: ColaDelNodo | null
  pedidos: PedidoDeCola[]
  /** `true` si es un nodo con la ruta montada; `false` fuera de un nodo o si el producto no monta la ruta; `null` mientras no se sabe. */
  disponible: boolean | null
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
}

export function rutaDeLaCola(
  { ruta = RUTA_COLA_DEL_NODO, tipo, estados, limite }: Pick<OpcionesDeLaCola, 'ruta' | 'tipo' | 'estados' | 'limite'>,
): string {
  const q = new URLSearchParams()
  estados?.forEach((e) => q.append('estado', e))
  if (tipo) q.set('tipo', tipo)
  if (limite) q.set('limite', String(limite))
  const texto = q.toString()
  return texto ? `${ruta}?${texto}` : ruta
}

/** Lee `GET /api/nodo/cola`, la repite cada `intervaloMs` mientras el componente esté montado y la vuelve a pedir con `recargar()`
 *  (después de una acción). Un 404 o 405 (el producto no monta la ruta) es `disponible: false`, no un error: el producto sin cola
 *  queda como siempre. Un corte de red deja lo último que se supo y avisa en `error`. */
export function useColaDelNodo(opciones: OpcionesDeLaCola = {}): UsoDeLaCola {
  const { ruta, tipo, limite, intervaloMs = INTERVALO_COLA_MS, habilitada = true } = opciones
  // Un arreglo nuevo por render (`estados={['a_revisar']}` inline) no puede rehacer la consulta cada vez: se compara por contenido.
  const claveDeEstados = opciones.estados?.join(',') ?? ''
  const url = useMemo(
    () => rutaDeLaCola({ ruta, tipo, limite, estados: claveDeEstados ? (claveDeEstados.split(',') as EstadoDePedido[]) : undefined }),
    [ruta, tipo, limite, claveDeEstados],
  )

  const [cola, setCola] = useState<ColaDelNodo | null>(null)
  const [disponible, setDisponible] = useState<boolean | null>(null)
  // «Cargando» es «habilitada y todavía no contestó nada»: así una consulta que se enciende después (una pestaña) también arranca cargando.
  const [respondio, setRespondio] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // La respuesta de un pedido viejo (otro filtro, otra recarga) no pisa a la más nueva ni se aplica desmontado.
  const numero = useRef(0)

  const recargar = useCallback(async () => {
    if (!habilitada) return
    const mio = ++numero.current
    try {
      const c = await api.get<Partial<ColaDelNodo> | null>(url)
      if (mio !== numero.current) return
      setError(null)
      if (!c || c.es_nodo !== true) {
        setCola(null)
        setDisponible(false)
        return
      }
      setCola({
        es_nodo: true, en_linea: c.en_linea === true, node_id: c.node_id ?? null, cuentas: c.cuentas ?? {},
        a_revisar: Number(c.a_revisar) || 0, pedidos: Array.isArray(c.pedidos) ? c.pedidos : [],
      })
      setDisponible(true)
    } catch (err) {
      if (mio !== numero.current) return
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        setCola(null)
        setDisponible(false)
        setError(null)
      } else {
        setError(err instanceof ApiError ? err.detail : 'Error de conexión.')
      }
    } finally {
      if (mio === numero.current) setRespondio(true)
    }
  }, [url, habilitada])

  useEffect(() => {
    if (!habilitada) return undefined
    void recargar()
    const reloj = intervaloMs > 0 ? setInterval(() => { void recargar() }, intervaloMs) : null
    return () => {
      if (reloj !== null) clearInterval(reloj)
      numero.current += 1
    }
  }, [habilitada, recargar, intervaloMs])

  const pedidos = useMemo(() => cola?.pedidos ?? [], [cola])
  return { cola, pedidos, disponible, cargando: habilitada && !respondio, error, recargar }
}

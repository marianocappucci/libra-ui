// LibraEdge: la pantalla de un nodo offline (ADR-077; el motor es ADR-074 de libracore, `libracore.nodo_offline`).
//
// Un nodo es la PC del local que sigue vendiendo sin internet. Sin conexión cobra e imprime el ticket (no válido como
// factura), deja la venta en la bandeja de comprobantes pendientes y la factura solo al volver. Lo que la pantalla
// necesita saber es una sola cosa —¿este equipo es un nodo y está sin conexión?— y la pregunta `GET /api/nodo/conexion`
// (`{es_nodo, en_linea, node_id, a_facturar}`).
//
// ## Una sola consulta para toda la pantalla
//
// El estado vive en un almacén del módulo y no en cada componente: el cartel del layout, el QR del detalle de la venta,
// el «Cobrar con QR ahora» del punto de venta y la bandeja leen lo mismo, y hay **un** reloj consultando mientras
// alguien lo pida (`useConsultarConexionDelNodo`, que monta el `CartelSinConexion`). Los demás sólo leen
// (`useConexionDelNodo`): no consultan por su cuenta, así que en un producto que no monta el cartel no sale ni un pedido
// nuevo, y el 409 del motor sigue diciendo lo mismo con su `mensaje`.
//
// 🔑 **Fuera de un nodo no se sigue consultando.** `es_nodo: false` (el router montado en el central) o un 404 (el
// producto no lo monta) descartan la consulta para el resto de la vida de la página: un equipo no se vuelve nodo sin
// reinstalarse. Un 500 o un corte de red no descartan nada: se deja lo último que se supo y se vuelve a intentar.
//
// Este archivo es la lógica (el almacén, los hooks y los textos); los componentes están en `CartelSinConexion.tsx`.
import { useEffect, useSyncExternalStore } from 'react'

import { api, ApiError } from './api-client'

/** Lo que contesta `GET /api/nodo/conexion` (`libracore.ventas_cobro_router.build_facturacion_del_nodo_router`). */
export type ConexionDelNodo = {
  es_nodo: boolean
  en_linea: boolean
  node_id: string | null
  /** Cuántas ventas de este nodo esperan la factura en la bandeja. */
  a_facturar: number
}

/** Lo que contesta `POST /api/nodo/facturar-pendientes` (`venta_facturacion.facturar_pendientes_del_nodo`). */
export type ResultadoFacturarPendientes = {
  es_nodo: boolean
  en_linea: boolean
  facturadas: { venta_id: number; factura_id: number; cae: string }[]
  descartadas: { venta_id: number; motivo: string }[]
  errores: { venta_id: number; error: string }[]
  quedan: number
}

export const RUTA_CONEXION_DEL_NODO = '/api/nodo/conexion'
export const RUTA_FACTURAR_PENDIENTES_DEL_NODO = '/api/nodo/facturar-pendientes'
/** Cada cuánto se pregunta. El proceso del nodo sincroniza cada minuto y el motor da la conexión por perdida a los 5. */
export const INTERVALO_CONEXION_MS = 45_000

// Los `detail.codigo` del motor (`libracore.nodo_offline` y `comprobantes_router`).
export const CODIGO_SIN_CONEXION = 'sin_conexion'
export const CODIGO_FACTURA_PENDIENTE = 'factura_pendiente'
export const CODIGO_NODO_SIN_ARCA = 'nodo_sin_arca'
export const CODIGO_SE_FACTURA_DESDE_LA_VENTA = 'se_factura_desde_la_venta'

/** El `origen_tipo` de una fila de la bandeja que dejó la venta de un nodo (`db.comprobantes_pendientes.ORIGEN_VENTA`). */
export const ORIGEN_VENTA = 'venta'

/** Igual a `MENSAJE_QR_SIN_CONEXION` del motor: el aviso del QR apagado dice lo mismo que el 409 si igual se pide. */
export const MENSAJE_QR_SIN_CONEXION = 'Sin conexión: el cobro con QR de MercadoPago no está disponible. Cobrá con otro medio.'
export const TEXTO_CARTEL_SIN_CONEXION = 'Sin conexión: las ventas se cobran y se imprime el ticket; se facturan solas al volver.'
/** El cartel de un nodo que no vende en un mostrador sino que encola facturas y cartas de porte (LibraCargo, LibraClub; ADR-094). Lleva el
 *  límite legal: sin conexión no se puede emitir la CPE y el camión no puede viajar sin ella. */
export const TEXTO_CARTEL_SIN_CONEXION_CON_COLA = 'Sin conexión: las facturas y las cartas de porte quedan en cola y se emiten solas al volver. Hasta entonces no hay CPE válida para viajar.'
export const MENSAJE_QUEDO_PARA_FACTURAR = 'Quedó para facturar al volver la conexión.'
export const ETIQUETA_PENDIENTE_DE_FACTURAR = 'Pendiente de facturar (sin conexión)'
export const ETIQUETA_VENTA_SIN_CONEXION = 'Venta sin conexión'
export const MENSAJE_FACTURAR_AHORA_SIN_CONEXION = 'Sin conexión: las ventas se facturan solas cuando vuelva.'

/** «1 venta para facturar», «3 ventas para facturar». */
export function ventasParaFacturar(n: number): string {
  return n === 1 ? '1 venta para facturar' : `${n} ventas para facturar`
}

/** El `detail.codigo` de un error de la API (`{codigo, mensaje}`), o `null`. El texto ya está en `err.detail`. */
export function codigoDelError(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.detailData || typeof err.detailData !== 'object') return null
  const codigo = (err.detailData as { codigo?: unknown }).codigo
  return typeof codigo === 'string' ? codigo : null
}

/** ¿La fila de la bandeja es una venta cobrada sin conexión? Se factura desde la venta, no con el formulario. */
export function esVentaSinConexion(fila: { origen_tipo?: string | null }): boolean {
  return fila.origen_tipo === ORIGEN_VENTA
}

// ── El almacén ──────────────────────────────────────────────────────────

type Estado = { conexion: ConexionDelNodo | null; descartada: boolean }

const INICIAL: Estado = { conexion: null, descartada: false }
let estado: Estado = INICIAL
const oyentes = new Set<() => void>()
let consultantes = 0
let reloj: ReturnType<typeof setInterval> | null = null
let ruta = RUTA_CONEXION_DEL_NODO

function publicar(nuevo: Estado) {
  estado = nuevo
  oyentes.forEach((o) => o())
}

function frenar() {
  if (reloj !== null) {
    clearInterval(reloj)
    reloj = null
  }
}

function descartar() {
  frenar()
  publicar({ conexion: null, descartada: true })
}

async function consultar() {
  if (estado.descartada) return
  try {
    const c = await api.get<Partial<ConexionDelNodo> | null>(ruta)
    if (!c || c.es_nodo !== true) {
      descartar()
      return
    }
    publicar({
      descartada: false,
      conexion: {
        es_nodo: true,
        en_linea: c.en_linea === true,
        node_id: c.node_id ?? null,
        a_facturar: Number(c.a_facturar) || 0,
      },
    })
  } catch (err) {
    // La ruta no está: el producto no la monta. Cualquier otra cosa (un 500, la red) puede ser pasajera.
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) descartar()
  }
}

/** Empieza a consultar (si es el primero que lo pide) y devuelve con qué dejar de hacerlo. Lo usa
 *  `useConsultarConexionDelNodo`; un producto no necesita llamarlo. */
export function consultarConexionDelNodo(
  { ruta: rutaPedida = RUTA_CONEXION_DEL_NODO, intervaloMs = INTERVALO_CONEXION_MS }: { ruta?: string; intervaloMs?: number } = {},
): () => void {
  consultantes += 1
  if (consultantes === 1 && !estado.descartada) {
    ruta = rutaPedida
    void consultar()
    reloj = setInterval(() => { void consultar() }, intervaloMs)
  }
  return () => {
    consultantes = Math.max(0, consultantes - 1)
    if (consultantes === 0) frenar()
  }
}

/** Vuelve a preguntar ya (después de facturar, o de un 409 `sin_conexion`). Fuera de un nodo no hace nada. */
export function refrescarConexionDelNodo(): Promise<void> {
  return consultar()
}

/** Un 409 `sin_conexion` dice lo mismo que el cartel: la pantalla lo toma sin esperar la consulta siguiente. Fuera de
 *  un nodo ya descartado no hace nada (no hay consulta que lo corrija después). */
export function marcarSinConexion() {
  if (estado.descartada) return
  const previa = estado.conexion
  publicar({
    descartada: false,
    conexion: { es_nodo: true, en_linea: false, node_id: previa?.node_id ?? null, a_facturar: previa?.a_facturar ?? 0 },
  })
}

/** Sólo para tests: olvida lo que se supo y frena el reloj. */
export function _reiniciarConexionDelNodo() {
  frenar()
  consultantes = 0
  ruta = RUTA_CONEXION_DEL_NODO
  estado = INICIAL
  oyentes.forEach((o) => o())
}

function suscribirse(oyente: () => void) {
  oyentes.add(oyente)
  return () => { oyentes.delete(oyente) }
}

const leer = () => estado

export type UsoDeConexionDelNodo = {
  conexion: ConexionDelNodo | null
  /** Es un nodo (lo dijo el servidor). */
  esNodo: boolean
  /** Es un nodo y está sin conexión: el QR se apaga y lo que se factura queda en la bandeja. */
  sinConexion: boolean
  aFacturar: number
}

/** Lee la conexión del nodo **sin consultar**: la consulta la hace quien monta `CartelSinConexion` (o
 *  `useConsultarConexionDelNodo`). Sin nadie consultando, `sinConexion` es `false` y la pantalla queda como siempre. */
export function useConexionDelNodo(): UsoDeConexionDelNodo {
  const { conexion } = useSyncExternalStore(suscribirse, leer, leer)
  const esNodo = conexion?.es_nodo === true
  return { conexion, esNodo, sinConexion: esNodo && conexion?.en_linea === false, aFacturar: conexion?.a_facturar ?? 0 }
}

/** Consulta `GET /api/nodo/conexion` cada `intervaloMs` mientras el componente esté montado, y devuelve lo mismo que
 *  `useConexionDelNodo`. Varios a la vez comparten un solo reloj. */
export function useConsultarConexionDelNodo(opciones: { ruta?: string; intervaloMs?: number } = {}): UsoDeConexionDelNodo {
  const { ruta: rutaPedida, intervaloMs } = opciones
  useEffect(() => consultarConexionDelNodo({ ruta: rutaPedida, intervaloMs }), [rutaPedida, intervaloMs])
  return useConexionDelNodo()
}

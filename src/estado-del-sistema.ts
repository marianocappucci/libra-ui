// La barra de estado del pie (ADR-083; el motor es ADR-075 de libracore, `libracore.estado_del_sistema`).
//
// Una línea chica abajo del contenido, igual en los ocho productos y en el central y en un nodo de LibraEdge: el estado de
// LibraEdge (si la instancia es un nodo o el central tiene nodos), el usuario y la sucursal, la versión, el certificado de
// ARCA que vence y el último respaldo. Lo dice `GET /api/estado-del-sistema`, en una sola respuesta.
//
// ## Una consulta, no una por render
//
// El estado vive en un almacén del módulo (como `nodo-offline.ts`): la barra lo lee con
// `useSyncExternalStore`, así que ni un render ni un remonte del layout piden nada. Se pregunta **al montar** la barra,
// después **cada `refrescar_en_segundos`** que sugiere el servidor (60 en un nodo, 300 fuera) y **al volver a la pestaña**
// (`visibilitychange` o `focus`), nunca antes de `MINIMO_ENTRE_CONSULTAS_MS` desde la anterior. Con la pestaña oculta no
// se consulta: se pregunta al volver.
//
// 🔑 Un 404, 405 o 403 (el producto no monta la ruta, o la guarda no deja) **descarta** la consulta para el resto de la
// vida de la página y la barra no se dibuja: es el layout de siempre. Un 500 o un corte de red dejan lo último que se supo.
//
// Este archivo es la lógica (el almacén, el hook y los textos); el componente está en `BarraDeEstado.tsx`.
import { useEffect, useSyncExternalStore } from 'react'

import { api, ApiError } from './api-client'
import { fecha, fechaHora } from './fechas'

export type NivelDelSistema = 'ok' | 'atencion' | 'error'

export type LibraEdgeDelNodo = {
  rol: 'nodo'
  en_linea: boolean
  /** Operaciones que esperan subir al central; `null` si el proceso del nodo todavía no lo dijo. */
  pendientes_de_subir: number | null
  /** Ventas cobradas sin conexión que esperan la factura (la bandeja «facturar al volver»). */
  a_facturar: number
  ultima_sincronizacion: string | null
  nivel: NivelDelSistema
}

export type LibraEdgeDelCentral = { rol: 'central'; nodos: number; sin_noticias: number; nivel: NivelDelSistema }

export type EstadoArca = {
  nivel: NivelDelSistema
  vencido: boolean
  /** Sólo para el administrador; al resto le llega `{nivel, vencido}` y sólo si venció. */
  servicio?: string
  vence?: string | null
  dias_para_vencer?: number | null
  ilegible?: boolean
  certificados?: number
}

export type EstadoRespaldo = {
  nivel: NivelDelSistema
  ultimo: string | null
  horas_desde_el_ultimo: number | null
  /** Por qué no está en `ok` (libracore v1.200.0, addendum del ADR-075). Un motor anterior no lo manda. */
  motivo?: 'fallo' | 'sin_respaldos' | 'no_corrio' | 'viejo' | null
  /** El último intento del respaldo de la noche, `null` si nunca corrió en esta instancia. */
  nocturno?: { ultimo_intento: string | null; fallo: boolean } | null
  externo: { al_dia: boolean; fallo: boolean; ultimo: string | null } | null
}

/** Lo que contesta `GET /api/estado-del-sistema` (`libracore.estado_del_sistema.build_estado_del_sistema_router`). */
export type EstadoDelSistema = {
  usuario: { nombre: string | null; rol: string | null; sucursal: string | null }
  version: { producto: string | null; motor: string | null }
  libraedge: LibraEdgeDelNodo | LibraEdgeDelCentral | null
  arca: EstadoArca | null
  respaldo: EstadoRespaldo | null
  refrescar_en_segundos?: number
}

/** El color del texto por nivel. Los de `TONOS_ESTADO` (`badge-estado.tsx`) sin el borde ni el fondo: ámbar **800**, no
 *  700, porque 700 no llega a 4,5:1 (medido allá). */
export const TEXTO_POR_NIVEL: Record<NivelDelSistema, string> = {
  ok: 'text-muted-foreground',
  atencion: 'text-amber-800 dark:text-amber-400',
  error: 'text-red-700 dark:text-red-400',
}

export const RUTA_ESTADO_DEL_SISTEMA = '/api/estado-del-sistema'
/** Si el servidor no sugiere otro intervalo. */
export const INTERVALO_ESTADO_MS = 300_000
/** Ni el foco ni la vuelta a la pestaña consultan antes de esto desde la consulta anterior. */
export const MINIMO_ENTRE_CONSULTAS_MS = 30_000
const INTERVALO_MINIMO_MS = 30_000
const INTERVALO_MAXIMO_MS = 900_000

// ── El almacén ──────────────────────────────────────────────────────────

type Estado = { datos: EstadoDelSistema | null; descartada: boolean }

const INICIAL: Estado = { datos: null, descartada: false }
let estado: Estado = INICIAL
const oyentes = new Set<() => void>()
let consultantes = 0
let reloj: ReturnType<typeof setTimeout> | null = null
let ruta = RUTA_ESTADO_DEL_SISTEMA
let ultimaConsulta = 0
let enCurso: Promise<void> | null = null

function publicar(nuevo: Estado) {
  estado = nuevo
  oyentes.forEach((o) => o())
}

function frenar() {
  if (reloj !== null) {
    clearTimeout(reloj)
    reloj = null
  }
}

function intervalo(): number {
  const sugerido = Number(estado.datos?.refrescar_en_segundos) * 1000
  if (!Number.isFinite(sugerido) || sugerido <= 0) return INTERVALO_ESTADO_MS
  return Math.min(INTERVALO_MAXIMO_MS, Math.max(INTERVALO_MINIMO_MS, sugerido))
}

function programar() {
  frenar()
  if (consultantes > 0 && !estado.descartada) reloj = setTimeout(() => { void consultar() }, intervalo())
}

function pestanaOculta(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

async function pedir() {
  ultimaConsulta = Date.now()
  try {
    const d = await api.get<EstadoDelSistema | null>(ruta)
    if (!d || typeof d !== 'object' || !d.usuario) {
      publicar({ datos: null, descartada: true })
      return
    }
    publicar({ datos: d, descartada: false })
  } catch (err) {
    // La ruta no está o no es para este usuario: no se vuelve a pedir. Lo demás (un 500, la red) puede ser pasajero.
    if (err instanceof ApiError && [403, 404, 405].includes(err.status)) publicar({ datos: null, descartada: true })
  }
}

async function consultar() {
  if (estado.descartada) return
  if (pestanaOculta()) {
    // Oculta no se pregunta: lo hace `alVolver` cuando se vuelve a ver.
    frenar()
    return
  }
  if (!enCurso) enCurso = pedir().finally(() => { enCurso = null })
  await enCurso
  programar()
}

function alVolver() {
  if (pestanaOculta() || estado.descartada || consultantes === 0) return
  if (Date.now() - ultimaConsulta < MINIMO_ENTRE_CONSULTAS_MS) {
    if (reloj === null) programar()
    return
  }
  void consultar()
}

/** Empieza a consultar (si es el primero que lo pide) y devuelve con qué dejar de hacerlo. Lo usa `useEstadoDelSistema`. */
export function consultarEstadoDelSistema({ ruta: rutaPedida = RUTA_ESTADO_DEL_SISTEMA }: { ruta?: string } = {}): () => void {
  consultantes += 1
  if (consultantes === 1 && !estado.descartada) {
    ruta = rutaPedida
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', alVolver)
    if (typeof window !== 'undefined') window.addEventListener('focus', alVolver)
    // Un remonte del layout (otra pantalla) no vuelve a pedir si lo último es reciente.
    if (estado.datos && Date.now() - ultimaConsulta < MINIMO_ENTRE_CONSULTAS_MS) programar()
    else void consultar()
  }
  return () => {
    consultantes = Math.max(0, consultantes - 1)
    if (consultantes === 0) {
      frenar()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', alVolver)
      if (typeof window !== 'undefined') window.removeEventListener('focus', alVolver)
    }
  }
}

/** Vuelve a preguntar ya (después de hacer un respaldo o de subir un certificado). Descartada, no hace nada. */
export function refrescarEstadoDelSistema(): Promise<void> {
  return consultar()
}

/** Sólo para tests: olvida lo que se supo y frena el reloj. */
export function _reiniciarEstadoDelSistema() {
  frenar()
  if (consultantes > 0) {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', alVolver)
    if (typeof window !== 'undefined') window.removeEventListener('focus', alVolver)
  }
  consultantes = 0
  ruta = RUTA_ESTADO_DEL_SISTEMA
  ultimaConsulta = 0
  enCurso = null
  estado = INICIAL
  oyentes.forEach((o) => o())
}

function suscribirse(oyente: () => void) {
  oyentes.add(oyente)
  return () => { oyentes.delete(oyente) }
}

const leer = () => estado

/** Consulta mientras el componente esté montado (varios comparten un reloj) y devuelve lo último que se supo, o `null`. */
export function useEstadoDelSistema(opciones: { ruta?: string } = {}): EstadoDelSistema | null {
  const { ruta: rutaPedida } = opciones
  useEffect(() => consultarEstadoDelSistema({ ruta: rutaPedida }), [rutaPedida])
  return useSyncExternalStore(suscribirse, leer, leer).datos
}

// ── Los textos ──────────────────────────────────────────────────────────

/** «hace 5 min», «hace 3 h», «hace 2 días». Menos de un minuto: «recién». */
export function haceCuanto(horas: number | null | undefined): string {
  if (horas == null || !Number.isFinite(horas) || horas < 0) return ''
  const minutos = Math.round(horas * 60)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  if (horas < 48) return `hace ${Math.round(horas)} h`
  return `hace ${Math.floor(horas / 24)} días`
}

/** Las horas desde un instante ISO hasta ahora, o `null`. */
export function horasDesde(iso: string | null | undefined, ahora: number = Date.now()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.max(0, (ahora - t) / 3_600_000)
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** Lo corto de LibraEdge, para la barra: `['Sin conexión', '12 por subir', '3 por facturar']`. */
export function partesLibraEdge(le: LibraEdgeDelNodo | LibraEdgeDelCentral): string[] {
  if (le.rol === 'central') {
    const partes = [plural(le.nodos, 'nodo', 'nodos')]
    if (le.sin_noticias > 0) partes.push(`${le.sin_noticias} sin noticias`)
    return partes
  }
  const partes = [le.en_linea ? 'En línea' : 'Sin conexión']
  if (le.pendientes_de_subir) partes.push(`${le.pendientes_de_subir} por subir`)
  if (le.a_facturar > 0) partes.push(`${le.a_facturar} por facturar`)
  return partes
}

/** El detalle de LibraEdge, en frases. */
export function detalleLibraEdge(le: LibraEdgeDelNodo | LibraEdgeDelCentral): string[] {
  if (le.rol === 'central') {
    return [
      `${plural(le.nodos, 'sucursal sin internet activa', 'sucursales sin internet activas')}.`,
      le.sin_noticias > 0
        ? `${plural(le.sin_noticias, 'nodo', 'nodos')} sin noticias: revisá «Sucursal sin internet» en Configuración.`
        : 'Todos los nodos sincronizan.',
    ]
  }
  const lineas = [le.en_linea
    ? 'Este equipo está en línea con el central.'
    : 'Sin conexión con el central: las ventas se cobran e imprimen el ticket, y se suben y facturan solas al volver.']
  if (le.pendientes_de_subir != null) {
    lineas.push(le.pendientes_de_subir > 0
      ? `${plural(le.pendientes_de_subir, 'operación espera', 'operaciones esperan')} subir al central.`
      : 'No hay operaciones esperando subir.')
  }
  if (le.a_facturar > 0) lineas.push(`${plural(le.a_facturar, 'venta espera', 'ventas esperan')} la factura.`)
  if (le.ultima_sincronizacion) lineas.push(`Última sincronización: ${fechaHora(le.ultima_sincronizacion)}.`)
  return lineas
}

/** El certificado de ARCA, corto: `null` si está al día (la barra no lo muestra). */
export function textoArca(a: EstadoArca): string | null {
  if (a.ilegible) return 'Certificado de ARCA ilegible'
  if (a.vencido) return 'Certificado de ARCA vencido'
  if (a.nivel === 'ok') return null
  const dias = a.dias_para_vencer
  if (dias == null) return 'El certificado de ARCA vence pronto'
  if (dias <= 0) return 'El certificado de ARCA vence hoy'
  if (dias === 1) return 'El certificado de ARCA vence mañana'
  return `El certificado de ARCA vence en ${dias} días`
}

/** El certificado de ARCA, en una frase para el detalle. */
export function detalleArca(a: EstadoArca): string {
  const servicio = a.servicio && a.servicio !== 'facturacion' ? ` (${a.servicio})` : ''
  if (a.ilegible) return `El certificado de ARCA${servicio} no se puede leer: la facturación no va a andar. Volvé a subirlo en Configuración.`
  if (a.vencido) {
    return a.vence
      ? `El certificado de ARCA${servicio} venció el ${fecha(a.vence)}: no se puede facturar. Hay que pedir uno nuevo.`
      : 'El certificado de ARCA venció: no se puede facturar. Avisá al administrador.'
  }
  const cuando = a.vence ? ` el ${fecha(a.vence)}` : ''
  if (a.nivel === 'ok') return `Certificado de ARCA${servicio} vigente: vence${cuando}.`
  return `El certificado de ARCA${servicio} vence${cuando}: pedí uno nuevo antes, desde Configuración → ARCA.`
}

/** El respaldo, corto: «Respaldo hace 3 h», «Sin respaldos», «Falló el respaldo nocturno», «Falló la copia externa». */
export function textoRespaldo(r: EstadoRespaldo): string {
  if (r.motivo === 'fallo') return 'Falló el respaldo nocturno'
  if (r.externo?.fallo) return 'Falló la copia externa'
  if (!r.ultimo) return 'Sin respaldos'
  return `Respaldo ${haceCuanto(r.horas_desde_el_ultimo)}`.trim()
}

export function detalleRespaldo(r: EstadoRespaldo): string[] {
  const lineas = [r.ultimo
    ? `Último respaldo: ${fechaHora(r.ultimo)} (${haceCuanto(r.horas_desde_el_ultimo)}).`
    : 'Todavía no hay respaldos de esta instancia.']
  if (r.motivo === 'fallo') {
    const cuando = r.nocturno?.ultimo_intento ? ` (${fechaHora(r.nocturno.ultimo_intento)})` : ''
    lineas.push(`El respaldo de anoche falló${cuando}: avisá a soporte.`)
  } else if (r.motivo === 'viejo') {
    lineas.push('El respaldo de anoche corrió pero no dejó un archivo nuevo: avisá a soporte.')
  } else if (r.ultimo && r.nivel !== 'ok' && !r.externo?.fallo && r.motivo !== null) {
    // `no_corrio`, o un motor anterior que no manda `motivo` (`undefined`): lo único que se sabía era la fecha.
    lineas.push('El respaldo de todas las noches no corrió: revisalo.')
  }
  if (r.externo) {
    lineas.push(r.externo.fallo
      ? 'La última copia a tu nube falló: revisá el resguardo externo en Configuración.'
      : r.externo.al_dia ? 'La copia a tu nube está al día.' : 'La copia a tu nube está atrasada.')
  }
  return lineas
}

/** El peor nivel de la respuesta: el de la barra entera. */
export function nivelGeneral(d: EstadoDelSistema): NivelDelSistema {
  const niveles = [d.libraedge?.nivel, d.arca?.nivel, d.respaldo?.nivel]
  if (niveles.includes('error')) return 'error'
  if (niveles.includes('atencion')) return 'atencion'
  return 'ok'
}

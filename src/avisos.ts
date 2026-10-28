// Los avisos por WhatsApp y por mail (ADR-097 del kit; ADR-090 del motor): los tipos de lo que contesta `/api/avisos`, el cliente y los textos
// que comparten `ConfiguracionDeAvisos` y `RegistroDeAvisos`.
//
// Es la contraparte de `libracore.avisos_router.build_avisos_router` (libracore v1.202.0):
//
//   GET  /config   -> `EstadoDeAvisos`
//   PUT  /config   -> lo mismo; `apikey` sólo de escritura (vacía = no la toques; `quitar_apikey` la saca)
//   POST /probar   -> `ResultadoDePrueba`; 409 `no_disponible`, 422, 502 `fallo_del_proveedor`; 409 `solo_en_el_central` en un nodo
//   GET  /envios   -> `Envio[]`, el más nuevo primero (`?canal=&estado=&tipo=&limite=`)
//
// Sin lógica de negocio: qué se avisa y con qué texto es de cada producto; acá sólo se muestra y se configura el canal.
import { api } from './api-client'
import type { TonoEstado } from './badge-estado'

/** Donde el producto monta el router del motor (el prefijo por defecto de `build_avisos_router`). */
export const RUTA_AVISOS_POR_DEFECTO = '/api/avisos'

// ── Lo que contesta la API ────────────────────────────────────────────────

export type ModoDeWhatsApp = 'apagado' | 'registro' | 'evolution'

export type ConfigDeWhatsApp = {
  /** Uno de `modos`. Es `string` y no la unión a propósito: un motor más nuevo puede sumar un modo y la pantalla no se rompe. */
  modo: string
  modos: string[]
  url: string
  instancia: string
  /** 🔑 La apikey **nunca vuelve**: ni entera ni sus últimos caracteres. Esto sólo dice si hay una guardada. */
  apikey_cargada: boolean
  /** Si WhatsApp puede mandar (o anotar) ahora. */
  disponible: boolean
  /** Por qué no, en una frase para la pantalla (`''` si está disponible). */
  motivo: string
}

export type EstadoDeAvisos = {
  whatsapp: ConfigDeWhatsApp
  email: { disponible: boolean }
}

export type CanalDeAviso = 'whatsapp' | 'email'

export const ESTADOS_DE_ENVIO = ['enviando', 'enviado', 'registrado', 'fallido', 'rechazado', 'omitido'] as const
export type EstadoDeEnvio = (typeof ESTADOS_DE_ENVIO)[number]

/** Una fila del registro (`GET /envios`): un aviso, no un intento. */
export type Envio = {
  id: number
  canal: CanalDeAviso | string
  clave: string
  /** Lo pone quien avisa (`recordatorio`, `confirmacion`…): el vocabulario es de cada producto. */
  tipo: string
  /** El teléfono ya normalizado (`5491155551234`) o el mail, **completo**: el motor no lo enmascara. */
  destino: string
  asunto: string
  cuerpo: string
  plantilla: string
  variables: Record<string, unknown>
  proveedor: string
  estado: EstadoDeEnvio | string
  intentos: number
  /** El motivo de un fallo o de un rechazo, en una frase. */
  detalle: string
  id_externo: string
  enviado_at: string
  created_at: string
  updated_at: string
}

export type ResultadoDePrueba = {
  ok: boolean
  estado: string
  /** `true` si lo anotó un proveedor simulado (modo Registro o una demo): no salió nada. */
  simulado: boolean
  detalle: string
}

/** Lo que se guarda en `PUT /config`. Todo opcional: lo que no viene no se toca. */
export type CuerpoDeConfigDeAvisos = {
  modo?: string
  url?: string
  instancia?: string
  apikey?: string
  quitar_apikey?: true
}

export type FiltrosDeEnvios = { canal?: string; estado?: string; tipo?: string; limite?: number }

// ── El cliente ────────────────────────────────────────────────────────────

/** Los cuatro pedidos del router, sobre `basePath`. */
export function clienteDeAvisos(basePath: string = RUTA_AVISOS_POR_DEFECTO) {
  return {
    config: () => api.get<EstadoDeAvisos>(`${basePath}/config`),
    guardar: (cuerpo: CuerpoDeConfigDeAvisos) => api.put<EstadoDeAvisos>(`${basePath}/config`, cuerpo),
    probar: (destino: string, canal: CanalDeAviso = 'whatsapp') =>
      api.post<ResultadoDePrueba>(`${basePath}/probar`, { canal, destino }),
    envios: (filtros: FiltrosDeEnvios = {}) => {
      const query = new URLSearchParams()
      for (const [clave, valor] of Object.entries(filtros)) {
        if (valor !== undefined && valor !== '') query.set(clave, String(valor))
      }
      const texto = query.toString()
      return api.get<Envio[]>(`${basePath}/envios${texto ? `?${texto}` : ''}`)
    },
  }
}

/**
 * Arma el cuerpo del `PUT /config`. **Es la parte delicada de la pantalla**, igual que `cuerpoAGuardar` de `ConfiguracionSmtp`.
 *
 * El motor toma una `apikey` vacía como «no la toques», pero la pantalla no la muestra nunca: si la clave viajara siempre (vacía porque el
 * campo está vacío), cualquier cambio de URL o de modo dependería de que el motor lo interprete así. Por eso **la clave sólo se incluye si se
 * tipeó algo**; y `quitar_apikey` es el único camino para sacarla, y le gana a lo tipeado.
 */
export function cuerpoParaGuardar(
  datos: { modo: string; url: string; instancia: string }, apikeyTipeada: string, quitarApikey: boolean,
): CuerpoDeConfigDeAvisos {
  const base: CuerpoDeConfigDeAvisos = { modo: datos.modo, url: datos.url.trim(), instancia: datos.instancia.trim() }
  if (quitarApikey) return { ...base, quitar_apikey: true }
  const apikey = apikeyTipeada.trim()
  return apikey !== '' ? { ...base, apikey } : base
}

// ── Los textos ────────────────────────────────────────────────────────────

/** Cada modo de WhatsApp, con su explicación en criollo. */
export const MODOS_DE_WHATSAPP: Record<ModoDeWhatsApp, { titulo: string; explicacion: string }> = {
  apagado: {
    titulo: 'Apagado',
    explicacion: 'No se arma ni se manda ningún aviso por WhatsApp.',
  },
  registro: {
    titulo: 'Registro',
    explicacion: 'Arma los mensajes pero no manda nada: quedan anotados en el registro para que veas qué saldría. Sirve para probar antes de conectar.',
  },
  evolution: {
    titulo: 'Evolution',
    explicacion: 'Manda de verdad, desde el número vinculado a tu instancia de Evolution API.',
  },
}

/** El título del modo; si el motor trae uno que el kit no conoce, el nombre tal cual. */
export function tituloDelModo(modo: string): string {
  return MODOS_DE_WHATSAPP[modo as ModoDeWhatsApp]?.titulo ?? modo
}

export const TEXTO_SOLO_EN_EL_CENTRAL =
  'Este equipo es un nodo del local (sin conexión): los avisos se configuran y se mandan desde el central, en la nube. Entrá desde allá para cambiar esto o probar el envío.'

export const TEXTO_DE_DEMO =
  'Esto es una demo: los avisos por WhatsApp sólo se anotan en el registro, nunca se mandan, y no se puede conectar Evolution.'

export const TEXTO_CORREO_LISTO = 'Sale por el servidor de correo de la instancia, el mismo de los comprobantes. No hay nada que configurar acá.'
export const TEXTO_CORREO_SIN_SERVIDOR =
  'Todavía no hay un servidor de correo configurado, así que los avisos por mail no salen. Se carga en Configuración, en «Email / SMTP».'

/** Cómo está WhatsApp ahora, en una frase y con el tono que le toca. */
export function estadoDeWhatsApp(wa: ConfigDeWhatsApp): { tono: TonoEstado; titulo: string; detalle: string } {
  if (wa.modo === 'apagado') {
    return { tono: 'neutro', titulo: 'Apagado', detalle: wa.motivo || 'No se manda ningún aviso por WhatsApp.' }
  }
  if (!wa.disponible) {
    return { tono: 'atencion', titulo: 'No manda', detalle: wa.motivo || 'WhatsApp no está disponible.' }
  }
  if (wa.modo === 'registro') {
    return { tono: 'curso', titulo: 'En registro', detalle: 'Los avisos se arman y se anotan, pero no sale ningún mensaje.' }
  }
  if (wa.modo === 'evolution') {
    return { tono: 'ok', titulo: 'Conectado', detalle: 'Los avisos salen de verdad por Evolution.' }
  }
  return { tono: 'neutro', titulo: tituloDelModo(wa.modo), detalle: wa.motivo }
}

/** El estado de un aviso, con su rótulo, su tono y qué quiere decir (para el `title`). */
export const ESTADO_DE_ENVIO: Record<EstadoDeEnvio, { etiqueta: string; tono: TonoEstado; ayuda: string }> = {
  enviando: { etiqueta: 'Enviándose', tono: 'curso', ayuda: 'Alguien lo está mandando ahora.' },
  enviado: { etiqueta: 'Enviado', tono: 'ok', ayuda: 'El proveedor lo aceptó.' },
  registrado: { etiqueta: 'Registrado', tono: 'neutro', ayuda: 'Se anotó sin mandar nada (modo Registro o demo).' },
  fallido: { etiqueta: 'Falló', tono: 'negativo', ayuda: 'No salió; se vuelve a intentar hasta 3 veces.' },
  rechazado: { etiqueta: 'Rechazado', tono: 'atencion', ayuda: 'El destino no sirve (por ejemplo, un número sin WhatsApp). No se reintenta.' },
  omitido: { etiqueta: 'Omitido', tono: 'neutro', ayuda: 'No correspondía mandarlo (sin teléfono, o pidió no recibir).' },
}

export function etiquetaDeCanal(canal: string): string {
  if (canal === 'whatsapp') return 'WhatsApp'
  if (canal === 'email') return 'Correo'
  return canal
}

/** `recordatorio_24h` -> «Recordatorio 24h»: el tipo lo pone quien avisa, así que sin un diccionario propio se lo deja legible. */
export function etiquetaDeTipoPorDefecto(tipo: string): string {
  const t = tipo.replace(/[_-]+/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

/**
 * El destino sin mostrar todo: de un teléfono quedan los últimos cuatro dígitos (`••••••••1234`) y de un mail la primera letra y el
 * dominio (`a•••@dominio.com`). `GET /envios` trae el destino **completo**, así que esto lo hace el kit.
 */
export function enmascararDestino(destino: string): string {
  const d = (destino ?? '').trim()
  if (d === '') return '—'
  const arroba = d.indexOf('@')
  if (arroba > 0) return `${d.charAt(0)}•••${d.slice(arroba)}`
  const digitos = d.replace(/\D/g, '')
  if (digitos.length < 5) return '•'.repeat(Math.max(d.length, 4))
  return `${'•'.repeat(Math.min(digitos.length - 4, 8))}${digitos.slice(-4)}`
}

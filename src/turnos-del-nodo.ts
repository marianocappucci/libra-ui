// El turno que se atendió en un nodo sin conexión (ADR-095; el modelo es ADR-019 de libragenda ≥ v0.15.0): la lógica y los textos de
// `EtiquetasDeTurno.tsx` y de `TurnosARevisar.tsx`.
//
// ## Dos cosas distintas, una detrás de la otra
//
// - **Atendido sin conexión**: la atención (en curso, atendido, «no vino») está en la PC del local y todavía no subió a la web. Sube sola
//   cuando vuelva la conexión. Azul, como «Sin subir al central» de una reserva: está en camino.
// - **A revisar**: subió, pero en la web el turno cambió mientras tanto. Libragenda no la descarta ni la rechaza (decisión del humano,
//   2026-10-25): **la atención y lo cobrado valen**, y el turno queda en la lista `turnos_a_revisar` hasta que alguien lo acomode. Ámbar,
//   como «En conflicto»: no frena nada, pide que alguien lo mire.
//
// Una atención que ya subió y quedó a revisar no es «atendida sin conexión» (ya no está pendiente de subir): `EtiquetasDeTurnoDelNodo`
// muestra sólo «A revisar» si le llegan las dos.
//
// ## Cómo se dice, y qué no se dice
//
// Las pantallas hablan de «esta PC», «la web» y «cuando vuelva la conexión». Ni «nodo», ni «central», ni «outbox»: son del equipo
// técnico. Los motivos de libragenda (`movido`, `cancelado`…) se traducen acá; el `detalle` que guarda libragenda para el soporte
// («el nodo lo marcó completed pero en el central…») **no se muestra**.
//
// ## Qué datos recibe el kit
//
// El kit no pide nada: la lista «a revisar» es una consulta de dominio de libragenda (`turnos_a_revisar`, ADR-019) que cada producto
// expone por su ruta. Lo que espera de cada fila es lo de `AtencionAplicada` de libragenda, con los mismos nombres.

/** Cómo llama libragenda a los estados de un turno (`AppointmentStatus`). */
export type EstadoDeTurno = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

/** Los motivos por los que libragenda manda una atención a revisar (`MOTIVOS` de `libragenda.atencion_en_nodo`, v0.15.0). */
export type MotivoDeRevision = 'movido' | 'cancelado' | 'ya_atendido' | 'transicion_invalida' | 'turno_inexistente'

export const MOTIVOS_DE_REVISION: readonly MotivoDeRevision[] = ['movido', 'cancelado', 'ya_atendido', 'transicion_invalida', 'turno_inexistente']

/** Una atención que libragenda anotó y mandó a revisar: una fila de `turnos_a_revisar`. Los nombres son los de `AtencionAplicada`. Un turno
 *  con dos atenciones (en curso, y después atendido) trae dos filas; `agruparPorTurno` las junta. */
export type AtencionARevisar = {
  atencion_id: string
  /** El turno. Es el mismo en las atenciones de un mismo turno. */
  appointment_id: string
  /** A qué estado lo llevó quien lo atendió en esta PC. */
  estado: EstadoDeTurno | (string & {})
  /** Cuándo ocurrió, ISO 8601 con zona. */
  at: string
  actor?: string | null
  /** Por qué quedó a revisar. Un motivo que el kit no conoce se muestra con un texto general. */
  motivo?: MotivoDeRevision | (string & {}) | null
  /** Cómo figura el turno en la web ahora (después de aplicar esta atención). */
  estado_despues?: EstadoDeTurno | (string & {}) | null
  /** `a_revisar` o `aplicada`. Si viene y no es `a_revisar`, la fila no se muestra. */
  resultado?: string | null
  /** Si ya la revisó alguien: sale de la lista. */
  revisada_at?: string | null
}

/** Las atenciones de un mismo turno, juntas. */
export type TurnoARevisar = {
  turnoId: string
  /** De la más vieja a la más nueva. */
  atenciones: AtencionARevisar[]
  /** Los motivos distintos, en el orden en que aparecen. Puede estar vacío (una fila sin motivo). */
  motivos: string[]
  /** La última atención: dice cómo quedó el turno. */
  ultima: AtencionARevisar
}

// ── Textos ───────────────────────────────────────────────────────────────────

export const ETIQUETA_ATENDIDO_SIN_CONEXION = 'Atendido sin conexión'
export const AYUDA_ATENDIDO_SIN_CONEXION = 'Se atendió en esta PC y todavía no subió a la web. Sube sola cuando vuelva la conexión.'

export const ETIQUETA_A_REVISAR = 'A revisar'
export const AYUDA_A_REVISAR = 'Se atendió sin conexión, pero en la web el turno cambió mientras tanto. La atención y lo cobrado quedaron registrados; falta acomodar el turno.'

export const TITULO_TURNOS_A_REVISAR = 'Turnos a revisar'
export const TEXTO_TURNOS_A_REVISAR = 'Estos turnos se atendieron sin conexión y en la web cambiaron mientras tanto. La atención y lo cobrado ya quedaron registrados: falta que alguien acomode el turno.'
export const TEXTO_SIN_TURNOS_A_REVISAR = 'No hay turnos para revisar.'

/** Qué pasó con el turno en la web, y qué hay que hacer. */
export const MOTIVOS: Record<MotivoDeRevision, { titulo: string; explicacion: string }> = {
  movido: {
    titulo: 'Se movió en la web',
    explicacion: 'Mientras se atendía sin conexión, en la web se cambió el día, la hora o el lugar del turno. La atención quedó anotada sobre el turno movido.',
  },
  cancelado: {
    titulo: 'Se canceló en la web',
    explicacion: 'La atención se hizo igual y quedó registrada, pero en la web el turno figura cancelado. Hay que acomodarlo.',
  },
  ya_atendido: {
    titulo: 'Ya figuraba como atendido',
    explicacion: 'En la web el turno ya estaba atendido, así que puede haberse atendido o cobrado dos veces. Revisá que no esté duplicado.',
  },
  transicion_invalida: {
    titulo: 'No coincide con la web',
    explicacion: 'En la web el turno estaba en un estado desde el que no se puede marcar como atendido, así que ahí quedó sin tocar.',
  },
  turno_inexistente: {
    titulo: 'El turno ya no existe en la web',
    explicacion: 'El turno se borró en la web mientras se atendía sin conexión. La atención y lo cobrado quedaron registrados.',
  },
}

const MOTIVO_DESCONOCIDO = {
  titulo: 'Cambió en la web',
  explicacion: 'El turno cambió en la web mientras se atendía sin conexión. La atención quedó registrada; falta revisar el turno.',
}

/** El motivo en lenguaje simple. Un motivo que el kit no conoce (una versión nueva de libragenda) no se inventa ni se muestra crudo: sale el texto general. */
export function textoDelMotivo(motivo: string | null | undefined): { titulo: string; explicacion: string } {
  return motivo && (MOTIVOS_DE_REVISION as readonly string[]).includes(motivo) ? MOTIVOS[motivo as MotivoDeRevision] : MOTIVO_DESCONOCIDO
}

/** El estado de un turno como se lee en pantalla. Lo que no se conoce vuelve igual: mejor mostrar lo que vino que inventar. */
export const ETIQUETA_DE_ESTADO_DE_TURNO: Record<EstadoDeTurno, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  in_progress: 'En curso',
  completed: 'Atendido',
  cancelled: 'Cancelado',
  no_show: 'No vino',
}

export function etiquetaDelEstadoDeTurno(estado: string | null | undefined): string {
  if (!estado) return ''
  return (ETIQUETA_DE_ESTADO_DE_TURNO as Record<string, string>)[estado] ?? estado
}

// ── Agrupar ──────────────────────────────────────────────────────────────────

const instante = (iso: string): number => Date.parse(iso)

/** De la más vieja a la más nueva; una fecha ilegible empata y queda donde estaba (el orden de la lista, que ya viene por hora). */
function porHora(a: AtencionARevisar, b: AtencionARevisar): number {
  const x = instante(a.at)
  const y = instante(b.at)
  return Number.isNaN(x) || Number.isNaN(y) ? 0 : x - y
}

/** ¿Esta fila espera a que alguien la mire? Sí si es `a_revisar` (o no dice) y todavía no la revisó nadie. */
export const esperaRevision = (a: AtencionARevisar): boolean => !a.revisada_at && (a.resultado == null || a.resultado === 'a_revisar')

/** Junta las atenciones por turno (una persona revisa un turno, no dos filas de él) y saca las que ya se revisaron. Los turnos salen en el
 *  orden de su primera atención, y cada uno con sus atenciones de la más vieja a la más nueva. */
export function agruparPorTurno(atenciones: readonly AtencionARevisar[] | null | undefined): TurnoARevisar[] {
  const porTurno = new Map<string, AtencionARevisar[]>()
  for (const a of atenciones ?? []) {
    if (!esperaRevision(a)) continue
    const lista = porTurno.get(a.appointment_id)
    if (lista) lista.push(a)
    else porTurno.set(a.appointment_id, [a])
  }
  const turnos = [...porTurno].map(([turnoId, lista]): TurnoARevisar => {
    const ordenadas = [...lista].sort(porHora)
    const motivos: string[] = []
    for (const a of ordenadas) if (a.motivo && !motivos.includes(a.motivo)) motivos.push(a.motivo)
    return { turnoId, atenciones: ordenadas, motivos, ultima: ordenadas[ordenadas.length - 1] }
  })
  return turnos.sort((a, b) => porHora(a.atenciones[0], b.atenciones[0]))
}

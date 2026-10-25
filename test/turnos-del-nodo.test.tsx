// Los textos y el agrupado de los turnos atendidos en un nodo sin conexión (ADR-095; los motivos son los de libragenda v0.15.0).
import { describe, expect, it } from 'vitest'

import {
  MOTIVOS, MOTIVOS_DE_REVISION, agruparPorTurno, esperaRevision, etiquetaDelEstadoDeTurno, textoDelMotivo,
  type AtencionARevisar,
} from '../src/turnos-del-nodo'

const atencion = (extra: Partial<AtencionARevisar> = {}): AtencionARevisar => ({
  atencion_id: 'a-1', appointment_id: 't-1', estado: 'completed', at: '2026-10-25T10:40:00-03:00', actor: 'Lucía Demo',
  motivo: 'cancelado', estado_despues: 'cancelled', resultado: 'a_revisar', revisada_at: null, ...extra,
})

describe('los motivos', () => {
  it('hay un texto para cada motivo de libragenda, y ninguno usa jerga técnica', () => {
    expect(MOTIVOS_DE_REVISION).toEqual(['movido', 'cancelado', 'ya_atendido', 'transicion_invalida', 'turno_inexistente'])
    for (const m of MOTIVOS_DE_REVISION) {
      const { titulo, explicacion } = textoDelMotivo(m)
      expect(titulo.length).toBeGreaterThan(5)
      expect(explicacion.length).toBeGreaterThan(30)
      expect(`${titulo} ${explicacion}`).not.toMatch(/nodo|outbox|central|transici[oó]n|cancelled|completed|in_progress/i)
      expect(titulo).toBe(MOTIVOS[m].titulo)
    }
  })

  it('un motivo que el kit no conoce sale con el texto general, no crudo', () => {
    const t = textoDelMotivo('motivo_nuevo_de_una_version_futura')
    expect(t.titulo).toBe('Cambió en la web')
    expect(JSON.stringify(t)).not.toContain('motivo_nuevo')
    expect(textoDelMotivo(null).titulo).toBe('Cambió en la web')
    expect(textoDelMotivo(undefined).titulo).toBe('Cambió en la web')
  })

  it('dice que la atención y lo cobrado valen (decisión del humano)', () => {
    expect(textoDelMotivo('cancelado').explicacion).toMatch(/se hizo igual y quedó registrada/)
    expect(textoDelMotivo('turno_inexistente').explicacion).toMatch(/quedaron registrados/)
  })
})

describe('etiquetaDelEstadoDeTurno', () => {
  it('traduce los estados de libragenda', () => {
    expect(etiquetaDelEstadoDeTurno('in_progress')).toBe('En curso')
    expect(etiquetaDelEstadoDeTurno('completed')).toBe('Atendido')
    expect(etiquetaDelEstadoDeTurno('no_show')).toBe('No vino')
    expect(etiquetaDelEstadoDeTurno('cancelled')).toBe('Cancelado')
    expect(etiquetaDelEstadoDeTurno('confirmed')).toBe('Confirmado')
    expect(etiquetaDelEstadoDeTurno('pending')).toBe('Pendiente')
  })

  it('un estado desconocido vuelve igual y uno vacío no dice nada', () => {
    expect(etiquetaDelEstadoDeTurno('algo_nuevo')).toBe('algo_nuevo')
    expect(etiquetaDelEstadoDeTurno(null)).toBe('')
    expect(etiquetaDelEstadoDeTurno(undefined)).toBe('')
  })
})

describe('esperaRevision', () => {
  it('espera la `a_revisar` que nadie revisó', () => {
    expect(esperaRevision(atencion())).toBe(true)
    expect(esperaRevision(atencion({ resultado: undefined }))).toBe(true)
  })

  it('no espera la aplicada ni la ya revisada', () => {
    expect(esperaRevision(atencion({ resultado: 'aplicada' }))).toBe(false)
    expect(esperaRevision(atencion({ revisada_at: '2026-10-26T09:00:00-03:00' }))).toBe(false)
  })
})

describe('agruparPorTurno', () => {
  it('un turno con dos atenciones (en curso y después atendido) es un solo turno, de la más vieja a la más nueva', () => {
    const completado = atencion({ atencion_id: 'a-2', estado: 'completed', at: '2026-10-25T10:40:00-03:00' })
    const enCurso = atencion({ atencion_id: 'a-1', estado: 'in_progress', at: '2026-10-25T10:05:00-03:00' })
    const turnos = agruparPorTurno([completado, enCurso])
    expect(turnos).toHaveLength(1)
    expect(turnos[0].turnoId).toBe('t-1')
    expect(turnos[0].atenciones.map((a) => a.atencion_id)).toEqual(['a-1', 'a-2'])
    expect(turnos[0].ultima.atencion_id).toBe('a-2')
  })

  it('los motivos se juntan sin repetir y en el orden en que aparecen', () => {
    const turnos = agruparPorTurno([
      atencion({ atencion_id: 'a-1', at: '2026-10-25T10:05:00-03:00', motivo: 'movido' }),
      atencion({ atencion_id: 'a-2', at: '2026-10-25T10:40:00-03:00', motivo: 'ya_atendido' }),
      atencion({ atencion_id: 'a-3', at: '2026-10-25T10:45:00-03:00', motivo: 'movido' }),
    ])
    expect(turnos[0].motivos).toEqual(['movido', 'ya_atendido'])
  })

  it('los turnos salen por la hora de su primera atención', () => {
    const turnos = agruparPorTurno([
      atencion({ atencion_id: 'b-1', appointment_id: 't-2', at: '2026-10-25T12:00:00-03:00' }),
      atencion({ atencion_id: 'a-1', appointment_id: 't-1', at: '2026-10-25T09:00:00-03:00' }),
    ])
    expect(turnos.map((t) => t.turnoId)).toEqual(['t-1', 't-2'])
  })

  it('ordena por instante y no por texto: 11:00Z es una hora antes que 09:00-03:00', () => {
    // 09:00-03:00 = 12:00Z, así que 11:00Z va primero aunque el texto "11:00" sea mayor que "09:00".
    const turnos = agruparPorTurno([
      atencion({ atencion_id: 'a', appointment_id: 't-ba', at: '2026-10-25T09:00:00-03:00' }),
      atencion({ atencion_id: 'b', appointment_id: 't-utc', at: '2026-10-25T11:00:00Z' }),
    ])
    expect(turnos.map((t) => t.turnoId)).toEqual(['t-utc', 't-ba'])
  })

  it('saca las ya revisadas y las aplicadas, y un turno sin nada pendiente desaparece', () => {
    const turnos = agruparPorTurno([
      atencion({ atencion_id: 'a-1', revisada_at: '2026-10-26T09:00:00-03:00' }),
      atencion({ atencion_id: 'b-1', appointment_id: 't-2', resultado: 'aplicada' }),
      atencion({ atencion_id: 'c-1', appointment_id: 't-3' }),
    ])
    expect(turnos.map((t) => t.turnoId)).toEqual(['t-3'])
  })

  it('una fecha ilegible no rompe el orden', () => {
    const turnos = agruparPorTurno([atencion({ atencion_id: 'a', at: 'ayer' }), atencion({ atencion_id: 'b', at: 'hoy' })])
    expect(turnos[0].atenciones).toHaveLength(2)
  })

  it('sin lista, nada', () => {
    expect(agruparPorTurno(null)).toEqual([])
    expect(agruparPorTurno(undefined)).toEqual([])
    expect(agruparPorTurno([])).toEqual([])
  })
})

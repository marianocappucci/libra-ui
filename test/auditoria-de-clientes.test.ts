// El guard de que todo campo donde se elige un cliente ofrece el alta ahí mismo (ADR-071), corrido sobre el propio kit y sobre fuentes de
// ejemplo con los casos que el relevamiento de la suite encontró (2026-10-16).
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  MARCA_SIN_ALTA, auditarCamposDeCliente, camposDeClienteEn, describirCamposSinAlta, infraccionDeCampo,
} from '../src/auditoria-de-clientes'

const SRC = resolve(__dirname, '..', 'src')

const campos = (fuente: string, palabras?: string[], componentes?: string[]) => camposDeClienteEn(fuente, 'x.tsx', palabras, componentes)

describe('el guard de campos de cliente sobre el propio kit', () => {
  const r = auditarCamposDeCliente(SRC)

  it('midió algo: Ventas, Presupuesto y Remito eligen cliente', () => {
    expect(r.campos).toBeGreaterThanOrEqual(3)
    expect(r.conAlta).toBeGreaterThanOrEqual(3)
  })

  it('🔴 ningún campo de cliente del kit queda sin alta', () => {
    expect(describirCamposSinAlta(r.infracciones)).toEqual([])
  })
})

describe('qué cuenta como campo de cliente', () => {
  it('por el value, la etiqueta o las opciones', () => {
    expect(campos('<SelectBuscable value={alta.cliente_id} onChange={f} opciones={o} />')).toHaveLength(1)
    expect(campos('<SelectBuscable value={v} onChange={f} opciones={opcionesCliente(cs)} />')).toHaveLength(1)
    expect(campos('<SelectBuscable value={v} onChange={f} opciones={clientes.map(g)} />')).toHaveLength(1)
    expect(campos('<Label>Cliente</Label>\n<SelectBuscable value={v} onChange={f} opciones={o} />')).toHaveLength(1)
    expect(campos('<Select value={draft.client_id} onValueChange={f}><SelectContent /></Select>')).toHaveLength(1)
  })

  it('🔴 un equipo que nombra al cliente NO es un campo de cliente', () => {
    // Los falsos positivos del primer borrador, tal cual estaban en LibraDesk.
    expect(campos('<Label>Equipo</Label>\n<SelectBuscable value={alta.equipo_id} opciones={opcionesEquipo(equiposDelCliente)} onChange={f} />')).toEqual([])
    expect(campos('<Label>Ubicación</Label>\n<SelectBuscable value={field.value || DEL_CLIENTE} onChange={f} opciones={o} />')).toEqual([])
  })

  it('las palabras y los envoltorios propios los pone el producto', () => {
    expect(campos('<Label>Paciente</Label>\n<SelectBuscable value={v} onChange={f} opciones={o} />')).toEqual([])
    expect(campos('<Label>Paciente</Label>\n<SelectBuscable value={v} onChange={f} opciones={o} />', ['client', 'paciente'])).toHaveLength(1)
    expect(campos('<Elegir value={form.cliente_id} onChange={f} />')).toEqual([])
    expect(campos('<Elegir value={form.cliente_id} onChange={f} />', undefined, ['Elegir'])).toHaveLength(1)
  })
})

describe('qué es una infracción', () => {
  it('SelectCliente está bien', () => {
    expect(campos('<SelectCliente value={clienteId} onChange={f} opciones={o} crear={c} />').map(infraccionDeCampo)).toEqual([null])
  })

  it('un filtro marcado con motivo está bien; sin motivo, no', () => {
    const conMotivo = `{/* ${MARCA_SIN_ALTA}: filtro del listado, no crea nada */}\n<SelectBuscable value={clienteId} onChange={f} opciones={o} />`
    const sinMotivo = `{/* ${MARCA_SIN_ALTA} */}\n<SelectBuscable value={clienteId} onChange={f} opciones={o} />`
    expect(campos(conMotivo).map(infraccionDeCampo)).toEqual([null])
    expect(campos(sinMotivo).map(infraccionDeCampo)[0]?.razon).toBe('marca-sin-motivo')
  })

  it('el informe dice qué usar', () => {
    const [i] = campos('<SelectBuscable value={clienteId} onChange={f} opciones={o} />').map(infraccionDeCampo)
    expect(describirCamposSinAlta([i!])[0]).toMatch(/x\.tsx:1: <SelectBuscable> elige un cliente .* usá SelectCliente/)
  })
})

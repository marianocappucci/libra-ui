// Las etiquetas de una reserva dada en un nodo sin conexión (ADR-094; el modelo es ADR-022 de LibraClub).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  EtiquetaReservaEnConflicto, EtiquetaReservaSinSubir, EtiquetasDeReservaDelNodo,
} from '../src/EtiquetasDeReserva'
import {
  ESTADO_EN_CONFLICTO, ETIQUETA_SIN_SUBIR, esReservaProvisoria, estaEnConflicto,
} from '../src/reservas-del-nodo'

afterEach(cleanup)

describe('esReservaProvisoria', () => {
  it('es el id negativo: el del nodo, antes de que el central le ponga el definitivo', () => {
    expect(esReservaProvisoria(-3)).toBe(true)
    expect(esReservaProvisoria('-3')).toBe(true)
    expect(esReservaProvisoria(12)).toBe(false)
    expect(esReservaProvisoria('12')).toBe(false)
  })

  it('lo que no es un id no es provisorio', () => {
    expect(esReservaProvisoria(0)).toBe(false)
    expect(esReservaProvisoria(null)).toBe(false)
    expect(esReservaProvisoria(undefined)).toBe(false)
    expect(esReservaProvisoria('')).toBe(false)
    expect(esReservaProvisoria('abc')).toBe(false)
    expect(esReservaProvisoria(-1.5)).toBe(false)
  })

  it('en conflicto es el estado `en_conflicto` de LibraClub', () => {
    expect(ESTADO_EN_CONFLICTO).toBe('en_conflicto')
    expect(estaEnConflicto('en_conflicto')).toBe(true)
    expect(estaEnConflicto('confirmada')).toBe(false)
    expect(estaEnConflicto(undefined)).toBe(false)
  })
})

describe('las etiquetas', () => {
  it('«Sin subir al central» explica qué pasa, y no se llama «Provisoria»', () => {
    render(<EtiquetaReservaSinSubir />)
    const etiqueta = screen.getByText('Sin subir al central')
    expect(etiqueta.closest('[data-slot="etiqueta-reserva-sin-subir"]')).toHaveAttribute('title', expect.stringContaining('todavía no subió al central'))
    // 🔴 `provisoria` ya es otra cosa en LibraClub (el turno retenido esperando el pago del portal).
    expect(ETIQUETA_SIN_SUBIR).not.toMatch(/provisori/i)
  })

  it('«En conflicto» explica que no ocupa la cancha', () => {
    render(<EtiquetaReservaEnConflicto />)
    const etiqueta = screen.getByText('En conflicto').closest('[data-slot="etiqueta-reserva-en-conflicto"]')
    expect(etiqueta).toHaveAttribute('title', expect.stringContaining('no ocupa la cancha'))
  })

  it('cada una tiene su tono: sin subir azul (en camino), en conflicto ámbar (pide a alguien)', () => {
    render(<><EtiquetaReservaSinSubir /><EtiquetaReservaEnConflicto /></>)
    expect(screen.getByText('Sin subir al central').closest('[data-tono]')).toHaveAttribute('data-tono', 'curso')
    expect(screen.getByText('En conflicto').closest('[data-tono]')).toHaveAttribute('data-tono', 'atencion')
  })
})

describe('EtiquetasDeReservaDelNodo', () => {
  it('una reserva del central confirmada no lleva ninguna', () => {
    const { container } = render(<EtiquetasDeReservaDelNodo id={12} estado="confirmada" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('una reserva con id negativo lleva «Sin subir al central»', () => {
    render(<EtiquetasDeReservaDelNodo id={-4} estado="confirmada" />)
    expect(screen.getByText('Sin subir al central')).toBeInTheDocument()
    expect(screen.queryByText('En conflicto')).toBeNull()
  })

  it('una reserva en conflicto lleva «En conflicto»', () => {
    render(<EtiquetasDeReservaDelNodo id={12} estado="en_conflicto" />)
    expect(screen.getByText('En conflicto')).toBeInTheDocument()
    expect(screen.queryByText('Sin subir al central')).toBeNull()
  })

  it('una reserva del nodo que ya quedó en conflicto en el central lleva las dos', () => {
    render(<EtiquetasDeReservaDelNodo id={-4} estado="en_conflicto" />)
    expect(screen.getByText('Sin subir al central')).toBeInTheDocument()
    expect(screen.getByText('En conflicto')).toBeInTheDocument()
  })
})

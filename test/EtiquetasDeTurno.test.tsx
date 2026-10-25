// Las etiquetas de un turno atendido sin conexión y la de paciente o cliente «Provisorio» (ADR-095).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { EtiquetaDePersonaDelNodo, EtiquetaProvisorio } from '../src/EtiquetaProvisorio'
import { EtiquetaAtendidoSinConexion, EtiquetaTurnoARevisar, EtiquetasDeTurnoDelNodo } from '../src/EtiquetasDeTurno'
import { EtiquetasDeReservaDelNodo } from '../src/EtiquetasDeReserva'
import { MOTIVOS } from '../src/turnos-del-nodo'

afterEach(cleanup)

describe('las etiquetas del turno', () => {
  it('«Atendido sin conexión» explica que sube sola, azul (en camino)', () => {
    render(<EtiquetaAtendidoSinConexion />)
    const etiqueta = screen.getByText('Atendido sin conexión').closest('[data-slot="etiqueta-turno-atendido-sin-conexion"]')
    expect(etiqueta).toHaveAttribute('data-tono', 'curso')
    expect(etiqueta).toHaveAttribute('title', expect.stringContaining('Sube sola cuando vuelva la conexión'))
  })

  it('«A revisar» es ámbar y, sin motivo, explica en general que el turno cambió en la web', () => {
    render(<EtiquetaTurnoARevisar />)
    const etiqueta = screen.getByText('A revisar').closest('[data-slot="etiqueta-turno-a-revisar"]')
    expect(etiqueta).toHaveAttribute('data-tono', 'atencion')
    expect(etiqueta).toHaveAttribute('title', expect.stringContaining('en la web el turno cambió mientras tanto'))
  })

  it('«A revisar» con motivo dice en el `title` qué pasó, en lenguaje simple', () => {
    render(<EtiquetaTurnoARevisar motivo="cancelado" />)
    expect(screen.getByText('A revisar').closest('[data-slot]')).toHaveAttribute('title', MOTIVOS.cancelado.explicacion)
  })

  it('los íconos son decorativos: lo que se lee es el texto', () => {
    const { container } = render(<><EtiquetaAtendidoSinConexion /><EtiquetaTurnoARevisar /></>)
    const iconos = container.querySelectorAll('svg')
    expect(iconos).toHaveLength(2)
    iconos.forEach((i) => expect(i).toHaveAttribute('aria-hidden', 'true'))
  })

  it('las etiquetas no usan jerga técnica', () => {
    render(<><EtiquetaAtendidoSinConexion /><EtiquetaTurnoARevisar /></>)
    for (const e of document.querySelectorAll('[data-slot]')) {
      expect(`${e.textContent} ${e.getAttribute('title')}`).not.toMatch(/nodo|outbox|central/i)
    }
  })
})

describe('EtiquetasDeTurnoDelNodo', () => {
  it('un turno de siempre no lleva ninguna', () => {
    const { container } = render(<EtiquetasDeTurnoDelNodo />)
    expect(container).toBeEmptyDOMElement()
    cleanup()
    const otro = render(<EtiquetasDeTurnoDelNodo atendidoSinConexion={false} aRevisar={false} />)
    expect(otro.container).toBeEmptyDOMElement()
  })

  it('atendido en la PC y sin subir: «Atendido sin conexión»', () => {
    render(<EtiquetasDeTurnoDelNodo atendidoSinConexion />)
    expect(screen.getByText('Atendido sin conexión')).toBeInTheDocument()
    expect(screen.queryByText('A revisar')).toBeNull()
  })

  it('subió y la web lo cambió: «A revisar»', () => {
    render(<EtiquetasDeTurnoDelNodo aRevisar motivo="movido" />)
    expect(screen.getByText('A revisar')).toBeInTheDocument()
    expect(screen.queryByText('Atendido sin conexión')).toBeNull()
    expect(screen.getByText('A revisar').closest('[data-slot]')).toHaveAttribute('title', MOTIVOS.movido.explicacion)
  })

  it('si le llegan las dos, queda sólo «A revisar»: lo que ya subió no está pendiente de subir', () => {
    render(<EtiquetasDeTurnoDelNodo atendidoSinConexion aRevisar />)
    expect(screen.getByText('A revisar')).toBeInTheDocument()
    expect(screen.queryByText('Atendido sin conexión')).toBeNull()
  })
})

describe('«Provisorio» de un paciente o un cliente', () => {
  it('la etiqueta explica que recibe su número definitivo al volver la conexión', () => {
    render(<EtiquetaProvisorio persona="paciente" />)
    const etiqueta = screen.getByText('Provisorio').closest('[data-slot="etiqueta-provisorio"]')
    expect(etiqueta).toHaveAttribute('data-tono', 'curso')
    expect(etiqueta).toHaveAttribute('title', expect.stringContaining('Este paciente'))
    expect(etiqueta).toHaveAttribute('title', expect.stringContaining('cuando vuelva la conexión'))
  })

  it('según el id: negativo (número o texto) lleva «Provisorio»', () => {
    render(<><EtiquetaDePersonaDelNodo id={-2} persona="cliente" /><EtiquetaDePersonaDelNodo id="-7" persona="paciente" /></>)
    expect(screen.getAllByText('Provisorio')).toHaveLength(2)
  })

  it('con el id definitivo, o sin id, no dibuja nada', () => {
    const { container } = render(
      <>
        <EtiquetaDePersonaDelNodo id="p-042" persona="paciente" />
        <EtiquetaDePersonaDelNodo id={15} persona="cliente" />
        <EtiquetaDePersonaDelNodo id={undefined} />
        <EtiquetaDePersonaDelNodo id={null} />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('lo que se sacó de las etiquetas de reserva', () => {
  it('siguen siendo las de siempre (mismo `data-slot`, tono y texto) y la reserva no se llama «Provisoria»', () => {
    render(<EtiquetasDeReservaDelNodo id={-4} estado="en_conflicto" />)
    expect(screen.getByText('Sin subir al central').closest('[data-slot="etiqueta-reserva-sin-subir"]')).toHaveAttribute('data-tono', 'curso')
    expect(screen.getByText('En conflicto').closest('[data-slot="etiqueta-reserva-en-conflicto"]')).toHaveAttribute('data-tono', 'atencion')
    expect(screen.queryByText(/Provisori/)).toBeNull()
  })
})

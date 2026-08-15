// Dónde van los controles de una pantalla.
//
// Lo que estos tests sostienen es **el orden y el lado**, que es lo único que el
// pedido pide y lo único que puede volver a divergir. No se mide la posición en
// píxeles: jsdom no tiene layout, así que un `getBoundingClientRect()` daría
// cero para todo y el test pasaría con la barra puesta en cualquier lado.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BarraDeAcciones, EncabezadoDePantalla } from '../src/acciones'

describe('EncabezadoDePantalla', () => {
  it('el título va primero y las acciones después, en un grupo aparte', () => {
    // El orden en el DOM es lo que, con `justify-between`, pone el título a la
    // izquierda y las acciones a la derecha. Si alguien los da vuelta, el
    // "Volver" se va al margen izquierdo — que es exactamente el defecto que
    // tenía `ContratoDetalle`.
    const { container } = render(
      <EncabezadoDePantalla titulo={<h2>Contrato #12</h2>}>
        <button>Renovar</button>
        <button>Volver</button>
      </EncabezadoDePantalla>,
    )
    const fila = container.firstElementChild as HTMLElement
    expect(fila.className).toContain('justify-between')

    const [izquierda, derecha] = [...fila.children] as HTMLElement[]
    expect(within(izquierda).getByRole('heading', { name: 'Contrato #12' })).toBeInTheDocument()
    expect(within(derecha).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Renovar', 'Volver'])
  })

  it('«Volver» queda último, o sea en el extremo derecho', () => {
    // Es el control al que se llega sin mirar. Que cambie de lugar entre
    // pantallas es lo que el pedido vino a arreglar.
    render(
      <EncabezadoDePantalla titulo={<h2>Cliente</h2>}>
        <button>Editar</button>
        <button>Ver PDF</button>
        <button>Volver</button>
      </EncabezadoDePantalla>,
    )
    const botones = screen.getAllByRole('button').map((b) => b.textContent)
    expect(botones.at(-1)).toBe('Volver')
  })

  it('sin acciones no dibuja el grupo vacío', () => {
    // Un `<div>` vacío a la derecha no se ve, pero con `gap` y `flex-wrap`
    // corre el título en algunos anchos.
    const { container } = render(<EncabezadoDePantalla titulo={<h2>Sola</h2>} />)
    expect((container.firstElementChild as HTMLElement).children).toHaveLength(1)
  })
})

describe('BarraDeAcciones', () => {
  it('🔴 es sticky, no fixed, y va contra el borde derecho', () => {
    // `fixed` la despegaría del contenido: quedaría flotando sobre toda la
    // aplicación —sidebar incluido— y, al no ocupar lugar, taparía la última
    // fila de la lista sin que nada lo compense.
    const { container } = render(<BarraDeAcciones><button>Enviar</button></BarraDeAcciones>)
    const barra = container.firstElementChild as HTMLElement
    expect(barra.className).toContain('sticky')
    expect(barra.className).not.toMatch(/\bfixed\b/)
    expect(barra.className).toContain('justify-end')
    expect(barra.className).toContain('bottom-0')
  })

  it('deja pasar sus controles', () => {
    render(
      <BarraDeAcciones>
        <span>3 elegidos</span>
        <button>Enviar a SOS Contador</button>
      </BarraDeAcciones>,
    )
    expect(screen.getByText('3 elegidos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar a SOS Contador' })).toBeInTheDocument()
  })
})

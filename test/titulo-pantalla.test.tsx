// El título de pantalla: que el icono llegue, que esté adentro del recuadro y
// que las clases del producto no se pierdan.
//
// Lo que este archivo NO puede probar: cómo se ve el recuadro. En jsdom no hay
// hoja de Tailwind. Eso se mide en un navegador sobre un producto.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EncabezadoDePantalla } from '../src/acciones'
import { TituloPantalla } from '../src/titulo-pantalla'

function IconoFalso({ className }: { className?: string }) {
  return <svg data-testid="icono" className={className} />
}

describe('TituloPantalla', () => {
  it('rendea el texto del título y su icono', () => {
    render(<TituloPantalla icono={IconoFalso}>Clientes</TituloPantalla>)
    expect(screen.getByRole('heading', { name: /Clientes/ })).toBeInTheDocument()
    expect(screen.getByTestId('icono')).toBeInTheDocument()
  })

  it('🔴 el icono va ADENTRO del recuadro', () => {
    // Es lo único que distingue esta forma de la que tenían Contalibra y
    // RestoLibra, que ponían el icono suelto al lado del texto. Si el icono
    // quedara afuera del `span`, el test de arriba pasaría igual.
    const { container } = render(<TituloPantalla icono={IconoFalso}>Stock</TituloPantalla>)
    const recuadro = container.querySelector('[data-slot="icono-tile"]')
    expect(recuadro).not.toBeNull()
    expect(recuadro!.contains(screen.getByTestId('icono'))).toBe(true)
  })

  it('el título es un encabezado, no un div', () => {
    // Un `<div>` con texto grande se ve igual y no existe para un lector de
    // pantalla ni para la navegación por encabezados.
    const { container } = render(<TituloPantalla icono={IconoFalso}>Ventas</TituloPantalla>)
    expect(container.querySelector('h2')).not.toBeNull()
  })

  it('conserva las clases que le agrega el producto', () => {
    const { container } = render(
      <TituloPantalla icono={IconoFalso} className="min-w-0 truncate">Depósito central</TituloPantalla>,
    )
    const h2 = container.querySelector('h2')!
    expect(h2.className).toContain('truncate')
    // Y no pierde las suyas.
    expect(h2.className).toContain('text-lg')
  })
})

describe('TituloPantalla con `acciones` (ADR-038)', () => {
  /** La fila que arma `EncabezadoDePantalla`: su primer hijo lleva el título y el segundo, las acciones. */
  function fila(container: HTMLElement) {
    const raiz = container.firstElementChild!
    return { raiz, titulo: raiz.children[0], acciones: raiz.children[1] }
  }

  it('🔴 sin `acciones` rinde exactamente el <h2> de siempre, sin envoltorio', () => {
    // Compatibilidad hacia atrás: ningún producto cambia hasta que pasa la prop.
    const { container } = render(<TituloPantalla icono={IconoFalso}>Clientes</TituloPantalla>)
    expect(container.firstElementChild!.tagName).toBe('H2')
    expect(container.children).toHaveLength(1)
  })

  it('🔴 las acciones van en la misma línea que el título, a la derecha, y el <h2> sigue siendo el título', () => {
    const { container } = render(
      <TituloPantalla icono={IconoFalso} acciones={<button type="button">Nuevo cliente</button>}>Clientes</TituloPantalla>,
    )
    const { raiz, titulo, acciones } = fila(container)
    expect(raiz.className).toContain('flex')
    expect(raiz.className).toContain('justify-between')
    // El título es el primero y las acciones el segundo hijo de la misma fila.
    expect(titulo.querySelector('h2')).not.toBeNull()
    expect(acciones.contains(screen.getByRole('button', { name: 'Nuevo cliente' }))).toBe(true)
    // Y las acciones NO quedan adentro del encabezado: un lector de pantalla leería «Clientes Nuevo cliente» como el título.
    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument()
    expect(container.querySelector('h2')!.contains(screen.getByRole('button'))).toBe(false)
  })

  it('en un celular la fila parte en dos renglones (`flex-wrap`): las acciones bajan abajo del título', () => {
    const { container } = render(
      <TituloPantalla icono={IconoFalso} acciones={<button type="button">Imprimir</button>}>Reportes</TituloPantalla>,
    )
    const { raiz, acciones } = fila(container)
    expect(raiz.className).toContain('flex-wrap')
    expect(acciones.className).toContain('flex-wrap')
  })

  it('🔴 es la misma fila que `EncabezadoDePantalla`: no hay una segunda definición de dónde van los controles', () => {
    const conAcciones = render(
      <TituloPantalla icono={IconoFalso} acciones={<button type="button">A</button>}>Caja</TituloPantalla>,
    ).container
    const aMano = render(
      <EncabezadoDePantalla titulo={<TituloPantalla icono={IconoFalso}>Caja</TituloPantalla>}><button type="button">A</button></EncabezadoDePantalla>,
    ).container
    expect(conAcciones.innerHTML).toBe(aMano.innerHTML)
  })

  it('el icono sigue adentro del recuadro y `className` sigue yendo al <h2>', () => {
    const { container } = render(
      <TituloPantalla icono={IconoFalso} className="min-w-0 truncate" acciones={<button type="button">Nuevo</button>}>Depósito</TituloPantalla>,
    )
    expect(container.querySelector('[data-slot="icono-tile"]')!.contains(screen.getByTestId('icono'))).toBe(true)
    expect(container.querySelector('h2')!.className).toContain('truncate')
    expect(container.firstElementChild!.className).not.toContain('truncate')
  })

  it('varias acciones conviven en el mismo contenedor', () => {
    render(
      <TituloPantalla icono={IconoFalso} acciones={<><button type="button">Uno</button><button type="button">Dos</button></>}>Caja</TituloPantalla>,
    )
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Uno', 'Dos'])
  })

  it.each([null, undefined, false, 0, ''])('una acción vacía (%j) no dibuja la fila: la pantalla que las muestra a veces no deja un hueco', (vacia) => {
    const { container } = render(<TituloPantalla icono={IconoFalso} acciones={vacia as never}>Stock</TituloPantalla>)
    expect(container.firstElementChild!.tagName).toBe('H2')
    expect(container.children).toHaveLength(1)
  })
})

// El título de pantalla: que el icono llegue, que esté adentro del recuadro y
// que las clases del producto no se pierdan.
//
// Lo que este archivo NO puede probar: cómo se ve el recuadro. En jsdom no hay
// hoja de Tailwind. Eso se mide en un navegador sobre un producto.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

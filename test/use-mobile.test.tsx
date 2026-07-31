// `useIsMobile` decide si el Layout colapsa la barra lateral. El corte
// esta en 768px.
import { render, screen, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsMobile } from '../src/use-mobile'

function Sonda() {
  return <p data-testid="modo">{useIsMobile() ? 'mobile' : 'escritorio'}</p>
}

let alCambiar: (() => void) | null = null

function anchoDeVentana(px: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px })
}

beforeEach(() => {
  alCambiar = null
  // matchMedia no existe en jsdom: se reemplaza por uno que guarda el
  // listener para poder disparar un cambio de tamaño a mano.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: window.innerWidth < 768,
    media: query,
    addEventListener: (_e: string, cb: () => void) => { alCambiar = cb },
    removeEventListener: () => { alCambiar = null },
    dispatchEvent: () => false,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
  }))
})

describe('useIsMobile', () => {
  it('a 1280px reporta escritorio', () => {
    anchoDeVentana(1280)
    render(<Sonda />)
    expect(screen.getByTestId('modo')).toHaveTextContent('escritorio')
  })

  it('a 375px reporta mobile', () => {
    anchoDeVentana(375)
    render(<Sonda />)
    expect(screen.getByTestId('modo')).toHaveTextContent('mobile')
  })

  it('767px es mobile y 768px ya no', () => {
    // El limite exacto importa: la media query es `max-width: 767px`, asi
    // que 768 tiene que caer del lado de escritorio.
    anchoDeVentana(767)
    const { unmount } = render(<Sonda />)
    expect(screen.getByTestId('modo')).toHaveTextContent('mobile')
    unmount()

    anchoDeVentana(768)
    render(<Sonda />)
    expect(screen.getByTestId('modo')).toHaveTextContent('escritorio')
  })

  it('reacciona al cambiar el tamaño de la ventana', () => {
    anchoDeVentana(1280)
    render(<Sonda />)
    expect(screen.getByTestId('modo')).toHaveTextContent('escritorio')

    // Rotar el telefono o achicar la ventana tiene que recalcularlo: si
    // solo mirara el ancho inicial, la barra lateral quedaria mal hasta
    // recargar.
    anchoDeVentana(400)
    act(() => { alCambiar?.() })
    expect(screen.getByTestId('modo')).toHaveTextContent('mobile')
  })

  it('se desuscribe al desmontar', () => {
    anchoDeVentana(1280)
    const { unmount } = render(<Sonda />)
    expect(alCambiar).not.toBeNull()
    unmount()
    // Sin el cleanup, cada montaje dejaria un listener vivo sobre un
    // componente muerto.
    expect(alCambiar).toBeNull()
  })
})

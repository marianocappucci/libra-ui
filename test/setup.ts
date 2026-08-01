import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// `use-mobile` usa window.matchMedia, que jsdom no implementa. Se le da
// una implementacion controlable: por defecto reporta escritorio, y cada
// test puede cambiarla.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  })
}

// jsdom no implementa scrollIntoView. Lo usa SelectBuscable para mantener a
// la vista la opcion resaltada al navegar con las flechas -- comportamiento
// real de navegador, no logica del paquete, asi que se stubea igual que
// matchMedia en vez de ensuciar el componente con un guard defensivo.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

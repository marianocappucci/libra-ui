import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Los `findBy*` y `waitFor` esperan 1 s por defecto. Con la suite completa en paralelo o un CI cargado, una pantalla
// que monta y pide sus datos pasa de 1 s con el elemento YA en camino: reproducido con `PasswordReset` fijando la CPU
// (el botón del captcha tardaba más de 1 s en aparecer). `findBy` devuelve apenas aparece, así que un test que anda no
// se vuelve más lento; sólo un elemento que de verdad no está tarda 5 s en fallar. Lo mismo que VentaLibra (#474).
configure({ asyncUtilTimeout: 5000 })

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

// jsdom trae `document.createRange()` pero su `Range` NO implementa
// `getBoundingClientRect`. `DataTable` lo usa para medir el ancho del titulo
// "Acciones" --el texto va alineado a la derecha y `scrollWidth` no mide ese
// lado--, asi que cualquier tabla CON columna de acciones revienta con
// `rango.getBoundingClientRect is not a function`.
//
// No aparecio antes porque `data-table.test.tsx` no declara columna `actions`:
// con `indiceAcciones = -1` esa rama nunca corre. Se descubrio al escribir el
// primer test de `Usuarios`, que si la tiene. Ojo con el guard del componente:
// pregunta por `document.createRange`, que en jsdom SI existe -- o sea que no
// protege de esto.
//
// Va aca y no como guard nuevo en el componente, por lo mismo que
// `scrollIntoView`: en un navegador de verdad el metodo existe. Devuelve ceros
// (no hay layout que medir en jsdom) y el componente ya trata el 0 como "no
// medi nada".
if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
  const vacio = {
    x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0,
    toJSON: () => ({}),
  } as DOMRect
  Range.prototype.getBoundingClientRect = () => vacio
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  }) as unknown as DOMRectList
}

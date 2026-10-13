// `ErrorBoundary` (ADR-053): un error al renderizar no deja la pantalla en blanco; dice qué hacer y, si el backend le
// puso un código a un 500, lo muestra para que soporte lo encuentre en el registro de la instancia.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api-client'
import { ErrorBoundary } from '../src/ErrorBoundary'
import { _reiniciarReporteDeErrores, instalarReporteDeErrores } from '../src/errores-del-navegador'

function Roto({ error }: { error: unknown }): never {
  throw error
}

let beacon: ReturnType<typeof vi.fn>

beforeEach(() => {
  cleanup()
  beacon = vi.fn(() => true)
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true })
  // React escribe el error atrapado en console.error: ruido esperado en estos tests.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => _reiniciarReporteDeErrores())

describe('ErrorBoundary', () => {
  it('sin error muestra a los hijos tal cual', () => {
    render(<ErrorBoundary><p>todo bien</p></ErrorBoundary>)
    expect(screen.getByText('todo bien')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('🔴 un error de render muestra «Algo falló. Recargá la página.» y un botón para recargar', async () => {
    const alRecargar = vi.fn()
    render(<ErrorBoundary alRecargar={alRecargar}><Roto error={new Error('se rompió')} /></ErrorBoundary>)

    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló.')
    expect(screen.getByText('Recargá la página.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    expect(alRecargar).toHaveBeenCalledTimes(1)
  })

  it('no muestra el mensaje del error (puede traer datos) ni un código que no hay', () => {
    render(<ErrorBoundary><Roto error={new Error('CUIT 20-12345678-9 no existe')} /></ErrorBoundary>)
    expect(screen.queryByText(/12345678/)).toBeNull()
    expect(screen.queryByText(/código/i)).toBeNull()
  })

  it('🔴 si el error es un 500 del backend con ref, lo muestra', () => {
    render(<ErrorBoundary><Roto error={new ApiError(500, 'Error interno', undefined, 'a1b2c3d4')} /></ErrorBoundary>)
    expect(screen.getByText('a1b2c3d4')).toBeInTheDocument()
    expect(screen.getByText(/avisá este código/i)).toBeInTheDocument()
  })

  it('un ApiError sin ref no inventa uno', () => {
    render(<ErrorBoundary><Roto error={new ApiError(500, 'Error interno')} /></ErrorBoundary>)
    expect(screen.queryByText(/código/i)).toBeNull()
  })

  it('reporta el error de render al backend si el producto instaló el reporte', async () => {
    instalarReporteDeErrores({ release: 'r1' })
    render(<ErrorBoundary><Roto error={new Error('falló el render')} /></ErrorBoundary>)

    expect(beacon).toHaveBeenCalledTimes(1)
    const cuerpo = JSON.parse(await (beacon.mock.calls[0][1] as Blob).text())
    expect(cuerpo).toMatchObject({ tipo: 'render', mensaje: 'falló el render', release: 'r1' })
    expect(cuerpo.stack).toContain('--- componentes ---')
  })

  it('un ApiError que reventó el render NO se reporta (el backend ya lo registró)', () => {
    instalarReporteDeErrores()
    render(<ErrorBoundary><Roto error={new ApiError(500, 'Error interno', undefined, 'a1b2c3d4')} /></ErrorBoundary>)
    expect(beacon).not.toHaveBeenCalled()
  })

  it('sin instalar el reporte, no manda nada pero igual muestra la pantalla', () => {
    render(<ErrorBoundary><Roto error={new Error('x')} /></ErrorBoundary>)
    expect(beacon).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

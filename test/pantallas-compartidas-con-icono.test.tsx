// Las tres pantallas que este paquete rinde enteras —Usuarios, Logs y
// Configuración— muestran el icono que les pasa el producto.
//
// 🔴 **El tipo obliga a PASARLO; nada obliga a USARLO.** Un `icono` requerido
// que la pantalla recibe y descarta compila igual y sale en verde en todos los
// productos: la pantalla queda sin icono y el guard del consumidor no la ve,
// porque vive acá y no en su carpeta `pages/`.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Logs } from '../src/Logs'
import { Usuarios } from '../src/Usuarios'
import { createConfiguracion, SECCIONES_BASE } from '../src/Configuracion'

function IconoFalso({ className }: { className?: string }) {
  return <svg data-testid="el-icono" className={className} />
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
    JSON.stringify({ actividad: [], accesos: [], total: 0, total_pages: 1, page: 1, entidades: [], usuarios: [], acciones: {} }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ))))
})

describe('las pantallas compartidas rinden el icono que reciben', () => {
  it('Usuarios', () => {
    render(<Usuarios icono={IconoFalso} />)
    expect(screen.getByTestId('el-icono')).toBeInTheDocument()
  })

  it('Logs', async () => {
    // `Logs` corta antes del titulo mientras carga (`if (loading && !data)`),
    // asi que hay que esperar a que llegue la respuesta: con la asercion
    // sincrona el test falla sobre la pantalla de "Cargando…" y parece que el
    // icono no esta.
    render(<Logs icono={IconoFalso} />)
    expect(await screen.findByTestId('el-icono')).toBeInTheDocument()
  })

  it('Configuración', () => {
    const Configuracion = createConfiguracion({ secciones: SECCIONES_BASE, icono: IconoFalso })
    render(<MemoryRouter><Configuracion /></MemoryRouter>)
    expect(screen.getByTestId('el-icono')).toBeInTheDocument()
  })

  it('🔴 el control — el icono está en el recuadro del título, no suelto', () => {
    // Si la pantalla rindiera el icono en cualquier otro lado —una fila, un
    // botón— los tres casos de arriba pasarían igual y el título seguiría sin
    // icono, que es justo lo que el pedido vino a arreglar.
    const { container } = render(<Usuarios icono={IconoFalso} />)
    const recuadro = container.querySelector('[data-slot="icono-tile"]')
    expect(recuadro).not.toBeNull()
    expect(recuadro!.contains(screen.getByTestId('el-icono'))).toBe(true)
  })
})

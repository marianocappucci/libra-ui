// `AvisoFce` (ADR-026): el formulario pregunta al motor si a la factura le corresponde ser FCE, antes de emitir.
// Las respuestas son las que devuelve `GET /api/facturas/fce/corresponde` (libracore ADR-019), con los números
// medidos contra ARCA de homologación el 2026-10-05 (`montoDesde` 3958316).
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AvisoFce } from '../src/AvisoFce'

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const OBLIGADO = { disponible: true, corresponde: true, obligado: true, monto_desde: '3958316', fce_habilitada: true }

function contesta(body: unknown, status = 200) {
  fetchMock.mockImplementation(() => Promise.resolve(json(body, status)))
}

const pedidos = () => fetchMock.mock.calls.map((c) => String(c[0]))

beforeEach(() => {
  cleanup()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('AvisoFce', () => {
  it('🔴 avisa cuando corresponde FCE y se eligió una factura común', async () => {
    contesta(OBLIGADO)
    render(<AvisoFce cuit="30-54668997-9" total={4000000.5} tipo={1} fecha="2026-10-05" esperaMs={0} />)
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('le corresponde ser Factura de Crédito Electrónica')
    expect(aviso).toHaveTextContent('3.958.316')
    expect(aviso).not.toHaveTextContent('cargá el CBU')
    // Pregunta con el CUIT en dígitos, el total con dos decimales y la fecha.
    expect(pedidos()).toEqual(['/api/facturas/fce/corresponde?cuit=30546689979&total=4000000.50&fecha=2026-10-05'])
  })

  it('si el emisor todavía no puede emitir FCE, dice qué cargar', async () => {
    contesta({ ...OBLIGADO, fce_habilitada: false })
    render(<AvisoFce cuit="30546689979" total={5000000} tipo={1} esperaMs={0} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('cargá el CBU y la modalidad')
  })

  it('con FCE elegida y corresponde, no dice nada', async () => {
    contesta(OBLIGADO)
    render(<AvisoFce cuit="30546689979" total={5000000} tipo={201} esperaMs={0} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('con FCE elegida y un receptor no obligado, lo informa sin frenar', async () => {
    contesta({ disponible: true, corresponde: false, obligado: false, monto_desde: null, fce_habilitada: true })
    render(<AvisoFce cuit="30709332852" total={1210} tipo={201} esperaMs={0} />)
    expect(await screen.findByRole('note')).toHaveTextContent('no registra a este receptor como obligado')
  })

  it('con FCE elegida por debajo del monto, dice desde cuánto', async () => {
    contesta({ ...OBLIGADO, corresponde: false })
    render(<AvisoFce cuit="30546689979" total={100000} tipo={206} esperaMs={0} />)
    expect(await screen.findByRole('note')).toHaveTextContent('obligado a recibirla desde $')
  })

  it('una factura común que no corresponde no muestra nada', async () => {
    contesta({ ...OBLIGADO, corresponde: false })
    render(<AvisoFce cuit="30546689979" total={100000} tipo={1} esperaMs={0} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('🔑 si el registro no contesta, no muestra nada: avisa, no frena', async () => {
    contesta({ disponible: false, motivo: 'ARCA caído', fce_habilitada: true })
    render(<AvisoFce cuit="30546689979" total={5000000} tipo={1} esperaMs={0} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('un error del pedido tampoco se muestra', async () => {
    contesta({ detail: 'boom' }, 500)
    render(<AvisoFce cuit="30546689979" total={5000000} tipo={1} esperaMs={0} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['sin CUIT (consumidor final)', '', 5000000],
    ['un CUIT incompleto', '3054668997', 5000000],
    ['total cero', '30546689979', 0],
  ])('no pregunta con %s', async (_caso, cuit, total) => {
    contesta(OBLIGADO)
    render(<AvisoFce cuit={cuit} total={total} tipo={1} esperaMs={0} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('espera a que se deje de escribir: varios cambios seguidos, una sola pregunta', async () => {
    contesta(OBLIGADO)
    const { rerender } = render(<AvisoFce cuit="30546689979" total={4000000} tipo={1} esperaMs={50} />)
    rerender(<AvisoFce cuit="30546689979" total={4100000} tipo={1} esperaMs={50} />)
    rerender(<AvisoFce cuit="30546689979" total={4200000} tipo={1} esperaMs={50} />)
    await screen.findByRole('alert')
    expect(pedidos()).toEqual(['/api/facturas/fce/corresponde?cuit=30546689979&total=4200000.00'])
  })

  it('una respuesta vieja no pisa a la nueva', async () => {
    // La primera pregunta (que dice que corresponde) tarda; la segunda (que no) llega antes.
    let soltarPrimera: (r: Response) => void = () => {}
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((r) => { soltarPrimera = r }))
      .mockImplementationOnce(() => Promise.resolve(json({ ...OBLIGADO, corresponde: false })))
    const { rerender } = render(<AvisoFce cuit="30546689979" total={5000000} tipo={1} esperaMs={0} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender(<AvisoFce cuit="30546689979" total={100000} tipo={1} esperaMs={0} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    soltarPrimera(json(OBLIGADO))
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

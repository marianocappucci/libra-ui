// El listado de comprobantes (2026-08-27), extraído de Contalibra y Restolibra
// y adoptado además por LibraClub.
//
// El grueso de la pantalla ya lo cubren las suites de los productos, que la
// ejercen por su propio router. Lo que se prueba acá son **las costuras que
// creó la extracción**: las tres props con las que cada producto la ajusta. Si
// alguna se cablea mal la pantalla no explota — muestra de más o de menos, que
// es la clase de regresión que nadie ve hasta que un operador aprieta un botón
// que no lleva a ninguna parte, o lee «Sin cobrar» sobre algo que ya cobró.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Facturas } from '../src/Facturas'
import type { Factura } from '../src/facturas'

const AUTORIZADA: Factura = {
  id: 42, tipo: 11, punto_venta: 3, numero: 7, fecha: '2026-08-27',
  cliente_cuit: '', cliente_razon: 'Ana Perez',
  items: [{ description: 'Servicio', qty: 1, unit_price: 14000, subtotal: 14000 }],
  subtotal: 14000, iva_amount: 0, total: 14000, concepto: 1,
  cae: '75123456789012', cae_vto: '20260906', observaciones: '',
  condicion_venta: 'Contado', total_cobrado: 0,
}

const SIN_CAE: Factura = { ...AUTORIZADA, id: 43, numero: 8, cae: '' }

let fetchMock: ReturnType<typeof vi.fn>

/** Una respuesta de verdad, no un objeto con `json()`.
 *
 * 🔑 `api-client` decide si parsear mirando `response.headers.get(...)`, así que
 * un doble sin `headers` devuelve `undefined` y la pantalla muestra "Error de
 * conexión" — el test falla por el mock, no por el código. Mismo helper que
 * `FacturaDetalle.test.tsx`.
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function responder(items: Factura[]) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(json({ items, total: items.length, total_pages: 1, page: 1 })),
  )
}

/** Las URL que la pantalla pidió, en orden. */
function urlesPedidas(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]))
}

/** Sólo las del listado. El contador del badge de «Sin cobrar» es otro pedido
 *  que sale solo al montar, y contarlo tapa lo que estos tests miden. */
function urlesDelListado(): string[] {
  return urlesPedidas().filter((u) => !u.includes('vista=sin_cobrar'))
}

beforeEach(() => {
  cleanup()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  responder([AUTORIZADA])
})

function montar(props: Partial<Parameters<typeof Facturas>[0]> = {}) {
  return render(
    <MemoryRouter>
      <Facturas urlDelPdf={(id) => `/api/facturas/${id}/pdf`} {...props} />
    </MemoryRouter>,
  )
}

describe('el link al PDF', () => {
  it('sale de la prop, no de una ruta fija', async () => {
    // 🔑 Los productos no lo sirven igual: Contalibra y Restolibra desde su
    // router Jinja2 (`/facturas/{id}/pdf`) y LibraClub desde su API. Con una
    // ruta fija acá, dos de los tres bajarían un 404.
    montar({ urlDelPdf: (id) => `/lo/que/el/producto/diga/${id}` })

    const link = await screen.findByLabelText(/Descargar PDF del comprobante 0003-00000007/)
    expect(link).toHaveAttribute('href', '/lo/que/el/producto/diga/42')
    expect(link).toHaveAttribute('target', '_blank')
  })
})

describe('la ruta del detalle', () => {
  it('sin ella NO se dibuja el botón de ver', async () => {
    // 🔴 El caso de LibraClub mientras no tenga pantalla de detalle. Un botón
    // hacia una ruta inexistente no da 404 en estas SPA: cae en el catch-all y
    // redirige a otra pantalla, o sea que saca al usuario de donde estaba.
    montar()
    await screen.findByText('Ana Perez')
    expect(screen.queryByLabelText('Ver comprobante')).toBeNull()
    // Y el PDF sí, que es la acción que sí existe.
    expect(screen.getByLabelText(/Descargar PDF/)).toBeInTheDocument()
  })

  it('con ella el botón apunta adonde el producto dijo', async () => {
    montar({ rutaDelDetalle: (id) => `/comprobantes/${id}` })
    const ver = await screen.findByLabelText('Ver comprobante')
    expect(ver).toHaveAttribute('href', '/comprobantes/42')
  })
})

describe('los cobros', () => {
  it('sin cruce de cobros no se ofrece «Sin cobrar» ni se inventa el estado', async () => {
    // 🔴 El caso de LibraClub: el cruce `caja_movimientos.factura_id` sólo lo
    // llena el cobro por QR. Con los estados prendidos, todo lo cobrado en
    // efectivo diría «Sin cobrar» — una pantalla que miente sobre plata.
    montar({ muestraCobros: false, rutaDelDetalle: (id) => `/facturas/${id}` })

    await screen.findByText('Ana Perez')
    expect(screen.queryByRole('tab', { name: /Sin cobrar/ })).toBeNull()
    expect(screen.getByText('Autorizada')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobrar')).toBeNull()
    expect(screen.queryByLabelText('Registrar cobro')).toBeNull()
  })

  it('con cruce de cobros aparecen la pestaña, el estado y el botón', async () => {
    // El control del de arriba: sin esto, una pantalla que nunca mostrara nada
    // de cobros pasaría igual.
    montar({ muestraCobros: true, rutaDelDetalle: (id) => `/facturas/${id}` })

    await screen.findByText('Ana Perez')
    expect(screen.getByRole('tab', { name: /Sin cobrar/ })).toBeInTheDocument()
    expect(screen.getByText('Sin cobrar', { selector: '[data-tono]' })).toBeInTheDocument()
    expect(screen.getByLabelText('Registrar cobro')).toBeInTheDocument()
  })
})

describe('el estado del comprobante', () => {
  it('sin CAE no es un error: es que ARCA todavía no lo autorizó', async () => {
    responder([SIN_CAE])
    montar()
    const badge = await screen.findByText('Sin CAE')
    expect(badge.dataset.tono).toBe('neutro')
  })
})

describe('la búsqueda', () => {
  it('no consulta en cada tecla: sale al apretar Buscar', async () => {
    montar()
    await waitFor(() => expect(urlesDelListado()).toHaveLength(1))

    await userEvent.type(screen.getByLabelText('Buscar comprobantes'), 'Perez')
    // Cinco teclas y ninguna consulta nueva: con `q` disparando el efecto,
    // serían cinco requests y la lista saltando abajo del dedo.
    expect(urlesDelListado()).toHaveLength(1)

    await userEvent.click(screen.getByLabelText('Buscar'))
    await waitFor(() => expect(urlesDelListado()).toHaveLength(2))
    expect(urlesDelListado().at(-1)).toContain('q=Perez')
  })
})

describe('las pestañas', () => {
  it('cambian la vista que se le pide al backend', async () => {
    // Es lo que hace que las notas de crédito y débito se puedan ver: son la
    // misma tabla con otro filtro.
    montar()
    await waitFor(() => expect(urlesDelListado()).not.toHaveLength(0))
    expect(urlesDelListado()[0]).toContain('vista=facturas')

    await userEvent.click(screen.getByRole('tab', { name: /Notas de Crédito/ }))
    await waitFor(() => expect(urlesDelListado().at(-1)).toContain('vista=nc'))

    await userEvent.click(screen.getByRole('tab', { name: /Notas de Débito/ }))
    await waitFor(() => expect(urlesDelListado().at(-1)).toContain('vista=nd'))
  })
})

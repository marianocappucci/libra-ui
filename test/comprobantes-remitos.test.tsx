// Remitos: el listado, la ficha y el alta (F6.2, 2026-09-07), extraídas de
// Contalibra y Restolibra, donde las tres eran byte-idénticas.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Remitos } from '../src/Remitos'
import { RemitoDetalle } from '../src/RemitoDetalle'
import { RemitoNuevo } from '../src/RemitoNuevo'
import type { Remito } from '../src/facturas'
import type { Cliente } from '../src/mp'
import type { ProductoBusqueda } from '../src/comercio/tipos'
import { campoJunto, cuerpoDe, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const R1: Remito = {
  id: 4, number: 'R-0004', date: '2026-08-29', client_id: 1, client_name: 'Ana',
  client_address: 'Calle 1', client_cuit: '20-12345678-9', client_email: 'ana@x.com',
  client_phone: '111', items: [{ description: 'Café molido', qty: 3 }], observations: 'Entrega tarde', total: 300,
}
const R2: Remito = { ...R1, id: 5, number: 'R-0005', client_name: 'Beto', client_cuit: '', client_address: '', client_email: '', client_phone: '', observations: '', items: [] }

const ANA: Cliente = { id: 1, name: 'Ana', address: '', cuit_dni: '', email: '', phone: '', iva_condition: '', auto_facturar: 0, activo: 1 }
const BAJA: Cliente = { ...ANA, id: 2, name: 'Cliente dado de baja', activo: 0 }
const CAFE: ProductoBusqueda = { id: 7, codigo: 'C-1', nombre: 'Café molido', precio_venta: 100, precio_base: 100, unidad: 'kg' }

beforeEach(() => {
  cleanup()
  prepararFetch()
})

describe('Remitos — el listado', () => {
  it('lista lo que trae la API', async () => {
    responder({ 'GET /api/remitos': [R1, R2] })
    montar('/remitos', <Remitos />)
    expect(await screen.findByText('R-0004')).toBeInTheDocument()
    expect(screen.getByText('Beto')).toBeInTheDocument()
  })

  it('busca por el botón y por Enter, con el término en la URL', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/remitos': [R1] })
    montar('/remitos', <Remitos />)
    await screen.findByText('R-0004')

    await user.type(screen.getByPlaceholderText(/Buscar por número/), 'ana')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(pedidas()).toContain('GET /api/remitos?q=ana'))

    await user.keyboard('{Enter}')
    await waitFor(() => expect(pedidas().filter((p) => p === 'GET /api/remitos?q=ana')).toHaveLength(2))
  })

  it('🔴 «Limpiar» recarga SIN el término, no con el de antes', async () => {
    // El defecto que traían las dos copias: `setTimeout(load, 0)` corría el
    // `load` de la pintura anterior, cuyo closure todavía tenía la `q` vieja, y
    // la lista volvía filtrada con la búsqueda recién borrada. Tercera aparición
    // del mismo defecto en el kit (Ventas en P9-M3, TesoreriaDetalle en P9-M5).
    const user = userEvent.setup()
    responder({ 'GET /api/remitos': [R1] })
    montar('/remitos', <Remitos />)
    await screen.findByText('R-0004')

    await user.type(screen.getByPlaceholderText(/Buscar por número/), 'ana')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(pedidas()).toContain('GET /api/remitos?q=ana'))

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/remitos'))
    expect(pedidas().at(-1)).not.toContain('q=ana')
  })

  it('el vacío distingue «no hay» de «no encontré»', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/remitos': [] })
    montar('/remitos', <Remitos />)
    expect(await screen.findByText('No hay remitos registrados aún.')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/Buscar por número/), 'zzz')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('No se encontraron remitos para "zzz".')).toBeInTheDocument()
  })

  it('el PDF sale del `urlDelPdf` que pasa el producto, no de la API', async () => {
    responder({ 'GET /api/remitos': [R1] })
    montar('/remitos', <Remitos urlDelPdf={(id) => `/otro/lugar/${id}.pdf`} />)
    const pdf = await screen.findByLabelText('Descargar PDF')
    expect(pdf).toHaveAttribute('href', '/otro/lugar/4.pdf')
  })

  it('el control — sin la prop, el PDF va a la ruta por defecto', async () => {
    // Sin esto, un `urlDelPdf` que la pantalla recibiera y descartara pasaría el
    // caso de arriba… no: lo haría fallar. Lo que sí pasaría desapercibido es un
    // default equivocado, que es lo que usan los dos productos hoy.
    responder({ 'GET /api/remitos': [R1] })
    montar('/remitos', <Remitos />)
    expect(await screen.findByLabelText('Descargar PDF')).toHaveAttribute('href', '/remitos/4/pdf')
  })

  it('un remito sin cliente no rompe la columna', async () => {
    // `client_name` llega nulo cuando el remito quedó sin cliente: la celda usa
    // `?? undefined` para no escribir "null" en el `title`.
    responder({ 'GET /api/remitos': [{ ...R1, client_name: null as unknown as string }] })
    montar('/remitos', <Remitos />)
    expect(await screen.findByText('R-0004')).toBeInTheDocument()
  })

  it('el error de la API queda en pantalla', async () => {
    responder({ 'GET /api/remitos': { status: 403, detail: 'Sin permiso' } })
    montar('/remitos', <Remitos />)
    expect(await screen.findByText('Sin permiso')).toBeInTheDocument()
  })

  it('sin red, el aviso es de conexión y no el detalle de la API', async () => {
    responder({ 'GET /api/remitos': '!caida' })
    montar('/remitos', <Remitos />)
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
  })
})

describe('RemitoDetalle', () => {
  it('muestra el cliente, los datos y los ítems', async () => {
    responder({ 'GET /api/remitos/4': R1 })
    montar('/remitos/4', <RemitoDetalle />)
    expect(await screen.findByText('Remito R-0004')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('20-12345678-9')).toBeInTheDocument()
    expect(screen.getByText('Café molido')).toBeInTheDocument()
    expect(screen.getByText('29-08-2026')).toBeInTheDocument()
  })

  it('los datos vacíos del cliente no dejan una etiqueta huérfana', async () => {
    responder({ 'GET /api/remitos/5': R2 })
    montar('/remitos/5', <RemitoDetalle />)
    await screen.findByText('Remito R-0005')
    expect(screen.queryByText('CUIT / DNI:')).not.toBeInTheDocument()
    expect(screen.queryByText('Observaciones:')).not.toBeInTheDocument()
  })

  it('eliminar pide confirmación y recién ahí borra y vuelve al listado', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/remitos/4': R1, 'DELETE /api/remitos/4': {} })
    montar('/remitos/4', <RemitoDetalle />)
    await screen.findByText('Remito R-0004')

    await user.click(screen.getByRole('button', { name: /Eliminar remito/ }))
    expect(pedidas()).not.toContain('DELETE /api/remitos/4')

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/remitos'))
    expect(pedidas()).toContain('DELETE /api/remitos/4')
  })

  it('si la baja falla, el motivo queda en pantalla y no se navega', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/remitos/4': R1, 'DELETE /api/remitos/4': { status: 409, detail: 'Tiene factura asociada' } })
    montar('/remitos/4', <RemitoDetalle />)
    await screen.findByText('Remito R-0004')
    await user.click(screen.getByRole('button', { name: /Eliminar remito/ }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Tiene factura asociada')).toBeInTheDocument()
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/remitos/4')
  })

  it('sin red, el aviso es de conexión', async () => {
    responder({ 'GET /api/remitos/4': '!caida' })
    montar('/remitos/4', <RemitoDetalle />)
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
  })

  it('arrepentirse del borrado no borra nada', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/remitos/4': R1, 'DELETE /api/remitos/4': {} })
    montar('/remitos/4', <RemitoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Eliminar remito/ }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(pedidas()).not.toContain('DELETE /api/remitos/4')
  })

  it('el PDF respeta el `urlDelPdf` del producto', async () => {
    responder({ 'GET /api/remitos/4': R1 })
    montar('/remitos/4', <RemitoDetalle urlDelPdf={(id) => `/x/${id}`} />)
    expect(await screen.findByRole('link', { name: /Ver PDF/ })).toHaveAttribute('href', '/x/4')
  })

  it('lo que no cargó no ofrece PDF ni ítems', async () => {
    responder({ 'GET /api/remitos/9': { status: 404, detail: 'No existe' } })
    montar('/remitos/9', <RemitoDetalle />)
    expect(await screen.findByText('No existe')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ver PDF/ })).not.toBeInTheDocument()
  })
})

describe('RemitoNuevo', () => {
  it('el selector ofrece sólo los clientes activos', async () => {
    responder({ 'GET /api/clientes': [ANA, BAJA] })
    montar('/remitos/nuevo', <RemitoNuevo />)
    await waitFor(() => expect(pedidas()).toContain('GET /api/clientes'))
    const combo = screen.getByRole('combobox', { name: 'Cliente' })
    await userEvent.setup().click(combo)
    expect(await screen.findByRole('option', { name: /Ana/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /dado de baja/ })).not.toBeInTheDocument()
  })

  it('autocompleta productos desde dos caracteres, no antes', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'GET /productos/buscar': [CAFE] })
    montar('/remitos/nuevo', <RemitoNuevo />)

    const descripcion = screen.getByPlaceholderText('Descripción o producto…')
    await user.type(descripcion, 'c')
    expect(pedidas().filter((p) => p.includes('/productos/buscar'))).toHaveLength(0)

    await user.type(descripcion, 'a')
    expect(await screen.findByRole('button', { name: 'Café molido' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Café molido' }))
    expect(descripcion).toHaveValue('Café molido')
    expect(screen.queryByRole('button', { name: 'Café molido' })).not.toBeInTheDocument()
  })

  it('el alta manda cliente, ítems y observaciones, y va al detalle', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [ANA], 'POST /api/remitos': { ...R1, id: 12 } })
    montar('/remitos/nuevo', <RemitoNuevo />)
    await waitFor(() => expect(pedidas()).toContain('GET /api/clientes'))

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.click(await screen.findByRole('option', { name: /Ana/ }))
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Bolsas')
    const cantidad = screen.getByRole('spinbutton')
    await user.clear(cantidad)
    await user.type(cantidad, '5')
    await user.click(screen.getByRole('button', { name: /Guardar y generar PDF/ }))

    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/remitos/12'))
    expect(cuerpoDe('POST /api/remitos')).toMatchObject({
      client_id: 1, client_name: '', items: [{ description: 'Bolsas', qty: 5 }],
    })
  })

  it('la fecha y las observaciones viajan en el alta', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/remitos': R1 })
    const { container } = montar('/remitos/nuevo', <RemitoNuevo />)

    const fecha = container.querySelector('input[type="date"]') as HTMLInputElement
    await user.clear(fecha)
    await user.type(fecha, '2026-08-29')
    await user.type(campoJunto('Observaciones'), 'Entrega tarde')
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Agua')
    await user.click(screen.getByRole('button', { name: /Guardar y generar PDF/ }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/remitos'))
    expect(cuerpoDe('POST /api/remitos')).toMatchObject({ date: '2026-08-29', observations: 'Entrega tarde' })
  })

  it('sin cliente elegido, viaja el nombre libre', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/remitos': R1 })
    montar('/remitos/nuevo', <RemitoNuevo />)
    await user.type(campoJunto('o nombre libre'), 'Kiosco de la esquina')
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Agua')
    await user.click(screen.getByRole('button', { name: /Guardar y generar PDF/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/remitos'))
    expect(cuerpoDe('POST /api/remitos')).toMatchObject({ client_id: null, client_name: 'Kiosco de la esquina' })
  })

  it('el renglón vacío no viaja en el alta', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/remitos': R1 })
    montar('/remitos/nuevo', <RemitoNuevo />)

    await user.click(screen.getByRole('button', { name: /Agregar ítem/ }))
    await user.type(screen.getAllByPlaceholderText('Descripción o producto…')[0], 'Agua')
    expect(screen.getAllByPlaceholderText('Descripción o producto…')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /Guardar y generar PDF/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/remitos'))
    expect(cuerpoDe('POST /api/remitos').items as unknown[]).toHaveLength(1)
  })

  it('🔴 el último renglón no se puede borrar: sin él no hay dónde escribir', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [] })
    const { container } = montar('/remitos/nuevo', <RemitoNuevo />)
    const filas = () => container.querySelectorAll('tbody tr').length
    const basurero = () => Array.from(container.querySelectorAll('tbody tr button')).at(-1)!

    await user.click(screen.getByRole('button', { name: /Agregar ítem/ }))
    expect(filas()).toBe(2)

    // El control: con dos filas el basurero SÍ saca una. Sin esta mitad, un
    // basurero que no hiciera nada nunca pasaría el `toBe(1)` de abajo.
    await user.click(basurero())
    expect(filas()).toBe(1)

    await user.click(basurero())
    expect(filas()).toBe(1)
  })

  it('el error del alta queda en pantalla y no navega', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/remitos': { status: 400, detail: 'Falta el cliente' } })
    montar('/remitos/nuevo', <RemitoNuevo />)
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Agua')
    await user.click(screen.getByRole('button', { name: /Guardar y generar PDF/ }))
    expect(await screen.findByText('Falta el cliente')).toBeInTheDocument()
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/remitos/nuevo')
  })

  it('sin red, el alta avisa de conexión y no navega', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/remitos': '!caida' })
    montar('/remitos/nuevo', <RemitoNuevo />)
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Agua')
    await user.click(screen.getByRole('button', { name: /Guardar y generar PDF/ }))
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/remitos/nuevo')
  })

  it('si la búsqueda de productos falla, no quedan sugerencias colgadas', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'GET /productos/buscar': '!caida' })
    montar('/remitos/nuevo', <RemitoNuevo />)
    const descripcion = screen.getByPlaceholderText('Descripción o producto…')
    await user.type(descripcion, 'caf')
    await waitFor(() => expect(pedidas().some((p) => p.includes('/productos/buscar'))).toBe(true))
    expect(screen.queryByRole('button', { name: 'Café molido' })).not.toBeInTheDocument()
    // Y el texto tipeado se conserva: el fallo de la sugerencia no lo pisa.
    expect(descripcion).toHaveValue('caf')
  })

  it('borrar lo escrito cierra las sugerencias abiertas', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'GET /productos/buscar': [CAFE] })
    montar('/remitos/nuevo', <RemitoNuevo />)
    const descripcion = screen.getByPlaceholderText('Descripción o producto…')
    await user.type(descripcion, 'caf')
    expect(await screen.findByRole('button', { name: 'Café molido' })).toBeInTheDocument()
    await user.clear(descripcion)
    expect(screen.queryByRole('button', { name: 'Café molido' })).not.toBeInTheDocument()
  })

  it('cancelar vuelve al listado sin pedir nada', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [] })
    montar('/remitos/nuevo', <RemitoNuevo />)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/remitos')
    expect(pedidas().filter((p) => p.startsWith('POST'))).toHaveLength(0)
  })
})

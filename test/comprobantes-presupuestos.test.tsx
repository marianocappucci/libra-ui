// Presupuestos: el listado con pestañas, la ficha con su ciclo de estados y el
// alta/edición (el pase de comprobantes al kit, 2026-09-07), extraídas de Contalibra y Restolibra.
//
// 🔑 Las dos copias diferían en dos cosas de dominio, y acá entran por props:
// el remito valorizado (`conRemitoValorizado`) y la cotización por lista de
// precios, que a su vez son DOS gates distintos —`conSelectorDeLista` para el
// módulo `listas_precio` y `conQuiebres` para el add-on mayorista—. Los cuatro
// cruces se prueban abajo: cada prop tiene su caso y su control con la contraria.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Presupuestos } from '../src/Presupuestos'
import { PresupuestoDetalle } from '../src/PresupuestoDetalle'
import { PresupuestoForm } from '../src/PresupuestoForm'
import type { Presupuesto } from '../src/facturas'
import type { Cliente } from '../src/mp'
import type { ListaPrecio, ProductoBusqueda } from '../src/comercio/tipos'
import {
  campoJunto, cuerpoDe, montar, pedidas, prepararFetch, responder, selectConOpcion,
} from './helpers-pantallas'

const BASE: Presupuesto = {
  id: 8, number: 'P-0008', date: '2026-08-30', valid_until: '2026-09-30', status: 'borrador',
  client_id: 1, client_name: 'Ana', client_address: 'Calle 1', client_cuit: '20-12345678-9',
  client_email: 'ana@x.com', client_phone: '111',
  items: [{ description: 'Café molido', qty: 2, unit_price: 100, subtotal: 200 }],
  subtotal: 200, tax_rate: 0.21, tax_amount: 42, total: 242, observations: 'Retira el jueves', remito_id: null,
}
const con = (status: string, extra: Partial<Presupuesto> = {}) => ({ ...BASE, status, ...extra })

const LISTADO = {
  items: [BASE, con('aceptado', { id: 9, number: 'P-0009', client_name: 'Beto' })],
  counts: { borrador: 3, enviado: 2, pendiente: 1, aceptado: 4 },
}

const ANA: Cliente = { id: 1, name: 'Ana', address: '', cuit_dni: '', email: '', phone: '', iva_condition: '', auto_facturar: 0, activo: 1 }
const MAYORISTA: ListaPrecio = { id: 3, nombre: 'Mayorista', descripcion: '', activa: 1, es_default: 0 }
const CAFE: ProductoBusqueda = { id: 7, codigo: 'C-1', nombre: 'Café molido', precio_venta: 100, precio_base: 100, unidad: 'kg' }

beforeEach(() => {
  cleanup()
  prepararFetch()
})

describe('Presupuestos — el listado', () => {
  it('lista, y el estado sale con su etiqueta legible', async () => {
    responder({ 'GET /api/presupuestos': LISTADO })
    montar('/presupuestos', <Presupuestos />)
    expect(await screen.findByText('P-0008')).toBeInTheDocument()
    // Las etiquetas están también en las pestañas: se mira la tabla.
    const tabla = within(screen.getByRole('table'))
    expect(tabla.getByText('Borrador')).toBeInTheDocument()
    expect(tabla.getByText('Aceptado')).toBeInTheDocument()
  })

  it('🔴 la pestaña «Enviado» cuenta también los `pendiente`', async () => {
    // Son el mismo estado con dos nombres: el motor viejo escribía `pendiente`.
    // Si el conteo no los sumara, la pestaña diría 2 y al entrar aparecerían 3.
    responder({ 'GET /api/presupuestos': LISTADO })
    montar('/presupuestos', <Presupuestos />)
    await screen.findByText('P-0008')
    const enviado = screen.getByRole('tab', { name: /Enviado/ })
    expect(enviado).toHaveTextContent('3')
    expect(screen.getByRole('tab', { name: /Todos/ })).toHaveTextContent('10')
  })

  it('cambiar de pestaña filtra por estado en la API', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos': LISTADO })
    montar('/presupuestos', <Presupuestos />)
    await screen.findByText('P-0008')
    await user.click(screen.getByRole('tab', { name: /Rechazado/ }))
    await waitFor(() => expect(pedidas()).toContain('GET /api/presupuestos?estado=rechazado'))
  })

  it('🔴 «Limpiar» recarga SIN el término, no con el de antes', async () => {
    // El mismo `setTimeout(load, 0)` que traía Remitos: el closure viejo dejaba
    // la lista filtrada por la búsqueda recién borrada.
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos': LISTADO })
    montar('/presupuestos', <Presupuestos />)
    await screen.findByText('P-0008')

    await user.type(screen.getByPlaceholderText(/Buscar por número/), 'ana')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(pedidas()).toContain('GET /api/presupuestos?estado=&q=ana'))

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /api/presupuestos?estado='))
  })

  it('editar se ofrece sólo sobre un borrador', async () => {
    responder({ 'GET /api/presupuestos': LISTADO })
    montar('/presupuestos', <Presupuestos />)
    await screen.findByText('P-0008')
    // Dos filas en pantalla, un solo lápiz: el del borrador.
    expect(screen.getAllByLabelText('Ver presupuesto')).toHaveLength(2)
    expect(screen.getAllByLabelText('Editar')).toHaveLength(1)
  })

  it('el PDF sale del `urlDelPdf` del producto, y sin la prop del default', async () => {
    responder({ 'GET /api/presupuestos': { items: [BASE], counts: {} } })
    const { unmount } = montar('/presupuestos', <Presupuestos urlDelPdf={(id) => `/x/${id}`} />)
    expect(await screen.findByLabelText('Descargar PDF')).toHaveAttribute('href', '/x/8')
    unmount()

    montar('/presupuestos', <Presupuestos />)
    expect(await screen.findByLabelText('Descargar PDF')).toHaveAttribute('href', '/presupuestos/8/pdf')
  })

  it('el vacío distingue las tres razones de no ver nada', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos': { items: [], counts: {} } })
    montar('/presupuestos', <Presupuestos />)
    expect(await screen.findByText('No hay presupuestos registrados aún.')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Vencido/ }))
    expect(await screen.findByText('No hay presupuestos con estado "vencido".')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/Buscar por número/), 'zzz')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('No se encontraron presupuestos para "zzz".')).toBeInTheDocument()
  })

  it('el error de la API queda en pantalla, y sin red el de conexión', async () => {
    responder({ 'GET /api/presupuestos': { status: 403, detail: 'Sin permiso' } })
    const { unmount } = montar('/presupuestos', <Presupuestos />)
    expect(await screen.findByText('Sin permiso')).toBeInTheDocument()
    unmount()

    responder({ 'GET /api/presupuestos': '!caida' })
    montar('/presupuestos', <Presupuestos />)
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
  })
})

describe('PresupuestoDetalle — el ciclo de estados', () => {
  it('muestra cliente, ítems y los totales con IVA', async () => {
    responder({ 'GET /api/presupuestos/8': BASE })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    // Dos veces: en el título y en «Número:».
    expect(await screen.findAllByText('P-0008')).toHaveLength(2)
    expect(screen.getByText('Café molido')).toBeInTheDocument()
    expect(screen.getByText('IVA 21%')).toBeInTheDocument()
    expect(screen.getByText('30-08-2026')).toBeInTheDocument()
  })

  it('un borrador ofrece enviar, rechazar y eliminar; no aceptar', async () => {
    responder({ 'GET /api/presupuestos/8': BASE })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    expect(await screen.findByRole('button', { name: /Marcar como enviado/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Eliminar presupuesto/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Aceptar$/ })).not.toBeInTheDocument()
  })

  it('un aceptado ofrece facturar, y el facturado no ofrece nada', async () => {
    responder({ 'GET /api/presupuestos/8': con('aceptado') })
    const { unmount } = montar('/presupuestos/8', <PresupuestoDetalle />)
    expect(await screen.findByRole('button', { name: /Generar factura/ })).toBeInTheDocument()
    unmount()

    responder({ 'GET /api/presupuestos/8': con('facturado') })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    expect(await screen.findByText(/cerrado comercialmente/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rechazar/ })).not.toBeInTheDocument()
  })

  it('un rechazado se puede reactivar como borrador', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': con('rechazado'), 'POST /api/presupuestos/8/estado': {} })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Reactivar como borrador/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos/8/estado'))
    expect(cuerpoDe('POST /api/presupuestos/8/estado')).toMatchObject({ estado: 'borrador', convertir_remito: false })
  })

  it('🔴 `conRemitoValorizado` agrega el botón, y sin la prop no está', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': con('enviado'), 'POST /api/presupuestos/8/estado': {} })
    const { unmount } = montar('/presupuestos/8', <PresupuestoDetalle conRemitoValorizado />)
    await user.click(await screen.findByRole('button', { name: /Convertir a remito valorizado/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos/8/estado'))
    expect(cuerpoDe('POST /api/presupuestos/8/estado')).toMatchObject({ estado: 'aceptado', convertir_remito: true, valorizado: true })
    unmount()

    // El control: sin la prop se va SÓLO ese botón. Si se fueran los otros dos
    // —o si nunca hubiera habido ninguno— la ausencia de abajo pasaría igual.
    prepararFetch()
    responder({ 'GET /api/presupuestos/8': con('enviado') })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    expect(await screen.findByRole('button', { name: /Aceptar y convertir a remito/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Aceptar$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remito valorizado/ })).not.toBeInTheDocument()
  })

  it('el remito NO valorizado manda `valorizado: false`', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': con('enviado'), 'POST /api/presupuestos/8/estado': {} })
    montar('/presupuestos/8', <PresupuestoDetalle conRemitoValorizado />)
    await user.click(await screen.findByRole('button', { name: /Aceptar y convertir a remito/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos/8/estado'))
    expect(cuerpoDe('POST /api/presupuestos/8/estado')).toMatchObject({ convertir_remito: true, valorizado: false })
  })

  it('🔴 «Rechazar» se ofrece desde los tres estados vivos', async () => {
    // Es el mismo botón escrito tres veces en el fuente, una por rama de estado.
    // Probar sólo una dejaría las otras dos sin ejercitar y una podría llamar a
    // `cambiarEstado` con el estado equivocado sin que nadie se entere.
    const user = userEvent.setup()
    for (const estado of ['borrador', 'enviado', 'aceptado']) {
      prepararFetch()
      responder({ 'GET /api/presupuestos/8': con(estado), 'POST /api/presupuestos/8/estado': {} })
      const { unmount } = montar('/presupuestos/8', <PresupuestoDetalle />)
      await user.click(await screen.findByRole('button', { name: /Rechazar/ }))
      await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos/8/estado'))
      expect(cuerpoDe('POST /api/presupuestos/8/estado')).toMatchObject({ estado: 'rechazado' })
      unmount()
    }
  })

  it('aceptar sin convertir, y marcar como facturado', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': con('enviado'), 'POST /api/presupuestos/8/estado': {} })
    const { unmount } = montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /^Aceptar$/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos/8/estado'))
    expect(cuerpoDe('POST /api/presupuestos/8/estado')).toMatchObject({ estado: 'aceptado', convertir_remito: false })
    unmount()

    prepararFetch()
    responder({ 'GET /api/presupuestos/8': con('aceptado'), 'POST /api/presupuestos/8/estado': {} })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Marcar como facturado/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos/8/estado'))
    expect(cuerpoDe('POST /api/presupuestos/8/estado')).toMatchObject({ estado: 'facturado' })
  })

  it('arrepentirse del borrado no borra nada', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': BASE, 'DELETE /api/presupuestos/8': {} })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Eliminar presupuesto/ }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(pedidas()).not.toContain('DELETE /api/presupuestos/8')
  })

  it('generar factura lleva los ítems y el cliente a la pantalla de facturas', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': con('aceptado') })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Generar factura/ }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/facturas/nueva')
    // No pega a la API: es una navegación con estado, la factura se crea allá.
    expect(pedidas().filter((p) => p.startsWith('POST'))).toHaveLength(0)
  })

  it('🔴 tras mandarlo, la ficha se recarga y muestra el estado nuevo', async () => {
    // El motor pasa el presupuesto a `enviado` al mandarlo (libracore v1.90.0).
    // Si la pantalla no recargara, seguiria diciendo «Borrador» con la base
    // diciendo otra cosa — y ofreciendo «Marcar como enviado», que ya no va.
    const user = userEvent.setup()
    let mandado = false
    responder({
      'GET /api/presupuestos/8': () => (mandado ? con('enviado') : BASE),
      'POST /api/presupuestos/8/enviar-email': () => { mandado = true; return con('enviado') },
    })
    montar('/presupuestos/8', <PresupuestoDetalle />)

    await user.click(await screen.findByRole('button', { name: /Enviar por email/ }))
    await user.click(screen.getByRole('button', { name: /^Enviar$/ }))

    // La insignia se dibuja dos veces (encabezado y bloque de datos), de ahi
    // el getAll. Lo que importa es que ninguna siga diciendo «Borrador».
    await waitFor(() => expect(screen.getAllByText('Enviado').length).toBeGreaterThan(0))
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
    // La ficha se volvio a pedir: es lo que trae el estado nuevo.
    expect(pedidas().filter((p) => p === 'GET /api/presupuestos/8')).toHaveLength(2)
  })

  it('el email se manda al destinatario que se edita, precargado con el del cliente', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': BASE, 'POST /api/presupuestos/8/enviar-email': {} })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Enviar por email/ }))

    const destinatario = screen.getByPlaceholderText('email@ejemplo.com')
    expect(destinatario).toHaveValue('ana@x.com')
    await user.clear(destinatario)
    await user.type(destinatario, 'otro@x.com')
    await user.click(screen.getByRole('button', { name: /^Enviar$/ }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos/8/enviar-email'))
    expect(cuerpoDe('POST /api/presupuestos/8/enviar-email')).toEqual({ email: 'otro@x.com' })
  })

  it('sin destinatario no se manda nada', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': con('borrador', { client_email: '' }) })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Enviar por email/ }))
    expect(screen.getByRole('button', { name: /^Enviar$/ })).toBeDisabled()
  })

  it('eliminar pide confirmación y vuelve al listado', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': BASE, 'DELETE /api/presupuestos/8': {} })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Eliminar presupuesto/ }))
    expect(pedidas()).not.toContain('DELETE /api/presupuestos/8')

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/presupuestos'))
  })

  it('los errores de cargar, mandar el email y borrar llegan a la pantalla', async () => {
    // Los tres `catch` de la ficha, que son tres caminos distintos: ninguno
    // navega, y el del email deja el diálogo abierto para reintentar.
    const user = userEvent.setup()
    responder({ 'GET /api/presupuestos/8': '!caida' })
    const { unmount } = montar('/presupuestos/8', <PresupuestoDetalle />)
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
    unmount()

    prepararFetch()
    responder({
      'GET /api/presupuestos/8': BASE,
      'POST /api/presupuestos/8/enviar-email': { status: 502, detail: 'El SMTP no responde' },
      'DELETE /api/presupuestos/8': { status: 409, detail: 'Ya tiene remito' },
    })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Enviar por email/ }))
    await user.click(screen.getByRole('button', { name: /^Enviar$/ }))
    expect(await screen.findByText('El SMTP no responde')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('email@ejemplo.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: /Eliminar presupuesto/ }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Ya tiene remito')).toBeInTheDocument()
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/presupuestos/8')
  })

  it('el error del cambio de estado queda en pantalla', async () => {
    const user = userEvent.setup()
    responder({
      'GET /api/presupuestos/8': BASE,
      'POST /api/presupuestos/8/estado': { status: 409, detail: 'Ya está facturado' },
    })
    montar('/presupuestos/8', <PresupuestoDetalle />)
    await user.click(await screen.findByRole('button', { name: /Marcar como enviado/ }))
    expect(await screen.findByText('Ya está facturado')).toBeInTheDocument()
  })
})

describe('PresupuestoForm — la cotización por lista', () => {
  const sinListas = { 'GET /api/clientes': [ANA], 'GET /productos/buscar': [CAFE] }
  const conListas = { ...sinListas, 'GET /api/listas-precio': [MAYORISTA], 'GET /api/clientes/1/lista-precio': { lista_id: 3 } }

  it('🔴 sin `conSelectorDeLista` no pide las listas ni dibuja el selector', async () => {
    // Restolibra no tiene nada de esto en esta pantalla. Si el gate faltara,
    // adoptar el kit le estrenaría un selector que hoy no ve.
    responder(conListas)
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    await waitFor(() => expect(pedidas()).toContain('GET /api/clientes'))
    expect(pedidas()).not.toContain('GET /api/listas-precio')
    expect(screen.queryByText('Lista de precios')).not.toBeInTheDocument()
  })

  it('🔴 con la prop, pide las listas y las ofrece', async () => {
    // El control de arriba: la misma tabla de respuestas, sólo cambia la prop.
    responder(conListas)
    montar('/presupuestos/nuevo', <PresupuestoForm conSelectorDeLista />)
    await waitFor(() => expect(pedidas()).toContain('GET /api/listas-precio'))
    expect(await screen.findByText('Lista de precios')).toBeInTheDocument()
    expect(selectConOpcion('Mayorista')).toBeInTheDocument()
  })

  it('elegir un cliente preselecciona su lista asignada', async () => {
    const user = userEvent.setup()
    responder(conListas)
    montar('/presupuestos/nuevo', <PresupuestoForm conSelectorDeLista />)
    await screen.findByText('Lista de precios')

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.click(await screen.findByRole('option', { name: /Ana/ }))
    await waitFor(() => expect(pedidas()).toContain('GET /api/clientes/1/lista-precio'))
    await waitFor(() => expect(selectConOpcion('Mayorista')).toHaveValue('3'))
  })

  it('🔴 `conQuiebres` re-cotiza el renglón al cambiar la cantidad', async () => {
    const user = userEvent.setup()
    // El precio depende de la cantidad pedida, que es justo lo que el quiebre
    // hace: con un `{ precio: 80 }` fijo, el test pasaría igual con una pantalla
    // que mandara siempre `cantidad=1`.
    responder({
      ...conListas,
      'GET /api/listas-precio/3/precio': () => ({ precio: pedidas().at(-1)!.includes('cantidad=50') ? 80 : 100 }),
    })
    montar('/presupuestos/nuevo', <PresupuestoForm conSelectorDeLista conQuiebres />)
    await screen.findByText('Lista de precios')

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.click(await screen.findByRole('option', { name: /Ana/ }))
    await waitFor(() => expect(selectConOpcion('Mayorista')).toHaveValue('3'))

    // Al elegir el producto ya re-cotiza, con la cantidad del renglón (1).
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'ca')
    await user.click(await screen.findByRole('button', { name: /Café molido/ }))
    const [cantidad, precio] = screen.getAllByRole('spinbutton')
    await waitFor(() => expect(pedidas().some((p) => p.includes('cantidad=1'))).toBe(true))
    expect(precio).toHaveValue(100)

    await user.clear(cantidad)
    await user.type(cantidad, '50')
    await waitFor(() => expect(pedidas().some((p) => p.includes('/api/listas-precio/3/precio?producto_id=7&cantidad=50'))).toBe(true))
    await waitFor(() => expect(precio).toHaveValue(80))
  })

  it('🔴 sin `conQuiebres` el selector sigue estando, pero no re-cotiza', async () => {
    // El cruce que obliga a que sean dos props: en Contalibra una instancia con
    // el módulo y sin el add-on ve el selector y no re-cotiza. Con una sola prop
    // este caso no existiría.
    const user = userEvent.setup()
    responder({ ...conListas, 'GET /api/listas-precio/3/precio': { precio: 80 } })
    montar('/presupuestos/nuevo', <PresupuestoForm conSelectorDeLista />)
    await screen.findByText('Lista de precios')

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.click(await screen.findByRole('option', { name: /Ana/ }))
    await waitFor(() => expect(selectConOpcion('Mayorista')).toHaveValue('3'))

    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'ca')
    await user.click(await screen.findByRole('button', { name: /Café molido/ }))
    const [cantidad, precio] = screen.getAllByRole('spinbutton')
    await user.clear(cantidad)
    await user.type(cantidad, '50')

    expect(pedidas().some((p) => p.includes('/precio?producto_id='))).toBe(false)
    expect(precio).toHaveValue(100)
  })

  it('volver al precio base saca la lista de la búsqueda', async () => {
    const user = userEvent.setup()
    responder(conListas)
    montar('/presupuestos/nuevo', <PresupuestoForm conSelectorDeLista />)
    await screen.findByText('Lista de precios')

    await user.selectOptions(selectConOpcion('Mayorista'), '3')
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'ca')
    await waitFor(() => expect(pedidas().some((p) => p.includes('lista_id=3'))).toBe(true))

    await user.selectOptions(selectConOpcion('Mayorista'), '__base__')
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'fe')
    await waitFor(() => expect(pedidas().at(-1)).toBe('GET /productos/buscar?q=cafe'))
  })

  it('la lista elegida viaja en la búsqueda de productos', async () => {
    const user = userEvent.setup()
    responder(conListas)
    montar('/presupuestos/nuevo', <PresupuestoForm conSelectorDeLista />)
    await screen.findByText('Lista de precios')

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.click(await screen.findByRole('option', { name: /Ana/ }))
    await waitFor(() => expect(selectConOpcion('Mayorista')).toHaveValue('3'))

    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'ca')
    await waitFor(() => expect(pedidas().some((p) => p.includes('/productos/buscar?q=ca&lista_id=3'))).toBe(true))
  })
})

describe('PresupuestoForm — el alta y la edición', () => {
  it('el alta manda el payload completo y va al detalle', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [ANA], 'POST /api/presupuestos': { ...BASE, id: 21 } })
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    await waitFor(() => expect(pedidas()).toContain('GET /api/clientes'))

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.click(await screen.findByRole('option', { name: /Ana/ }))
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Bolsas')
    const [cantidad, precio] = screen.getAllByRole('spinbutton')
    await user.clear(cantidad); await user.type(cantidad, '3')
    await user.clear(precio); await user.type(precio, '150')
    await user.click(screen.getByRole('button', { name: /Crear presupuesto/ }))

    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/presupuestos/21'))
    expect(cuerpoDe('POST /api/presupuestos')).toMatchObject({
      client_id: 1, client_name: '', tax_rate: 0.21,
      items: [{ description: 'Bolsas', qty: 3, unit_price: 150 }],
    })
  })

  it('la fecha, la validez y las observaciones viajan en el payload', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/presupuestos': BASE })
    const { container } = montar('/presupuestos/nuevo', <PresupuestoForm />)

    const [fecha, validez] = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[]
    await user.clear(fecha); await user.type(fecha, '2026-08-30')
    await user.clear(validez); await user.type(validez, '2026-09-30')
    await user.type(campoJunto('Observaciones'), 'Retira el jueves')
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Agua')
    await user.click(screen.getByRole('button', { name: /Crear presupuesto/ }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos'))
    expect(cuerpoDe('POST /api/presupuestos')).toMatchObject({
      date: '2026-08-30', valid_until: '2026-09-30', observations: 'Retira el jueves',
    })
  })

  it('cancelar vuelve al listado sin guardar', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [] })
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/presupuestos')
    expect(pedidas().filter((p) => p.startsWith('POST'))).toHaveLength(0)
  })

  it('los totales se calculan en pantalla antes de guardar', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [] })
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Bolsas')
    const [cantidad, precio] = screen.getAllByRole('spinbutton')
    await user.clear(cantidad); await user.type(cantidad, '2')
    await user.clear(precio); await user.type(precio, '100')
    // 200 + 21 % = 242, con el IVA que trae el formulario por defecto.
    expect(await screen.findByText(/242/)).toBeInTheDocument()
  })

  it('editar precarga el presupuesto y guarda con PUT sobre el mismo id', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [ANA], 'GET /api/presupuestos/8': BASE, 'PUT /api/presupuestos/8': BASE })
    montar('/presupuestos/8/editar', <PresupuestoForm />)

    expect(await screen.findByText('Editar presupuesto')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByPlaceholderText('Descripción o producto…')).toHaveValue('Café molido'))

    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/presupuestos/8'))
    expect(pedidas()).not.toContain('POST /api/presupuestos')
    expect(cuerpoDe('PUT /api/presupuestos/8')).toMatchObject({ client_id: 1, observations: 'Retira el jueves' })
  })

  it('sin cliente elegido, viaja el nombre libre', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/presupuestos': BASE })
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    await user.type(campoJunto('o nombre libre'), 'Kiosco de la esquina')
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Agua')
    await user.click(screen.getByRole('button', { name: /Crear presupuesto/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos'))
    expect(cuerpoDe('POST /api/presupuestos')).toMatchObject({ client_id: null, client_name: 'Kiosco de la esquina' })
  })

  it('el error del guardado queda en pantalla y no navega', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/presupuestos': { status: 400, detail: 'Sin ítems' } })
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Agua')
    await user.click(screen.getByRole('button', { name: /Crear presupuesto/ }))
    expect(await screen.findByText('Sin ítems')).toBeInTheDocument()
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/presupuestos/nuevo')
  })

  it('si la precarga falla, el motivo queda en pantalla; sin red, el de conexión', async () => {
    responder({ 'GET /api/clientes': [], 'GET /api/presupuestos/9': { status: 404, detail: 'No existe' } })
    const { unmount } = montar('/presupuestos/9/editar', <PresupuestoForm />)
    expect(await screen.findByText('No existe')).toBeInTheDocument()
    unmount()

    responder({ 'GET /api/clientes': [], 'GET /api/presupuestos/9': '!caida' })
    montar('/presupuestos/9/editar', <PresupuestoForm />)
    expect(await screen.findByText('Error de conexión.')).toBeInTheDocument()
  })

  it('🔴 se agregan renglones, se sacan, y el último no se puede sacar', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [] })
    const { container } = montar('/presupuestos/nuevo', <PresupuestoForm />)
    const filas = () => container.querySelectorAll('tbody tr').length
    const basurero = () => Array.from(container.querySelectorAll('tbody tr button')).at(-1)!

    await user.click(screen.getByRole('button', { name: /Agregar ítem/ }))
    expect(filas()).toBe(2)

    // El control: con dos filas el basurero SÍ saca una. Sin esta mitad, un
    // basurero inerte pasaría igual el `toBe(1)` de abajo.
    await user.click(basurero())
    expect(filas()).toBe(1)

    await user.click(basurero())
    expect(filas()).toBe(1)
  })

  it('si la búsqueda de productos falla, no quedan sugerencias colgadas', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'GET /productos/buscar': '!caida' })
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'caf')
    await waitFor(() => expect(pedidas().some((p) => p.includes('/productos/buscar'))).toBe(true))
    expect(screen.queryByRole('button', { name: /Café molido/ })).not.toBeInTheDocument()
  })

  it('el IVA se elige y viaja en el payload', async () => {
    const user = userEvent.setup()
    responder({ 'GET /api/clientes': [], 'POST /api/presupuestos': BASE })
    montar('/presupuestos/nuevo', <PresupuestoForm />)
    await user.selectOptions(selectConOpcion('10.5%'), '0.105')
    await user.type(screen.getByPlaceholderText('Descripción o producto…'), 'Agua')
    await user.click(screen.getByRole('button', { name: /Crear presupuesto/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/presupuestos'))
    expect(cuerpoDe('POST /api/presupuestos')).toMatchObject({ tax_rate: 0.105 })
  })
})

// Las pantallas del modelo jerárquico sucursal → depósitos (0.84.0): `Sucursales` (tarjetas, alta con su primer
// depósito, edición, predeterminar; sin borrar) y `SucursalDetalle` (los depósitos de UNA sucursal: alta, edición,
// «Depósito de venta» y borrado). Las reglas de negocio las impone el backend; acá se prueba lo que la UI manda y muestra.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Sucursales } from '../src/comercio/Sucursales'
import { SucursalDetalle } from '../src/comercio/SucursalDetalle'
import type { Deposito, Sucursal } from '../src/comercio/tipos'
import { cuerpoDe, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const CENTRO: Sucursal = {
  id: 1, nombre: 'Centro', codigo: 'CEN', direccion: 'San Martín 100', activa: true, es_default: true,
  deposito_predeterminado_id: 10, depositos: 2,
}
const NORTE: Sucursal = {
  id: 2, nombre: 'Norte', codigo: 'NOR', direccion: 'Ruta 9 km 4', activa: true, es_default: false,
  deposito_predeterminado_id: 20, depositos: 1,
}
const SUR: Sucursal = {
  id: 3, nombre: 'Sur', codigo: null, direccion: null, activa: false, es_default: false,
  deposito_predeterminado_id: null, depositos: 0,
}

const dep = (o: Partial<Deposito> & { id: number; nombre: string }): Deposito => ({
  descripcion: '', es_default: 0, activo: 1, total_productos: 0, tipo: null, branch_id: 1, ...o,
})
const SALON = dep({ id: 10, nombre: 'Salón', descripcion: 'Planta baja', es_default: 1, total_productos: 3 })
const TRASTIENDA = dep({ id: 11, nombre: 'Trastienda', total_productos: 1 })
const VIEJO = dep({ id: 12, nombre: 'Viejo', activo: 0 })
const NORTE_DEP = dep({ id: 20, nombre: 'Depósito Norte', branch_id: 2, total_productos: 7 })

beforeEach(() => {
  cleanup()
  prepararFetch()
})

describe('Sucursales', () => {
  const base = {
    '/api/sucursales': [CENTRO, NORTE, SUR],
    'POST /api/sucursales': NORTE,
    'PUT /api/sucursales/2': NORTE,
    'POST /api/sucursales/2/set-default': { ok: true },
  }

  it('lista las tarjetas con sus badges y el conteo de depósitos, y pide también las inactivas', async () => {
    responder(base)
    montar('/sucursales', <Sucursales />)
    expect(await screen.findByText('Centro')).toBeTruthy()
    expect(pedidas()).toContain('GET /api/sucursales?solo_activas=false')
    expect(screen.getByText('Por defecto')).toBeTruthy()
    expect(screen.getByText('Inactiva')).toBeTruthy()
    expect(screen.getByText('2 depósitos')).toBeTruthy()
    expect(screen.getByText('1 depósito')).toBeTruthy()
    expect(screen.getByText('San Martín 100')).toBeTruthy()
    expect(screen.getByText('Código: NOR')).toBeTruthy()
    expect(screen.getByText('Sucursales')).toBeTruthy()
  })

  it('«Ver depósitos» y «Transferir stock» usan las rutas de las props (con sus defaults)', async () => {
    responder(base)
    const { unmount } = montar('/sucursales', <Sucursales />)
    await screen.findByText('Centro')
    expect(screen.getAllByRole('link', { name: /Ver depósitos/ })[1]).toHaveAttribute('href', '/sucursales/2')
    expect(screen.getByRole('link', { name: /Transferir stock/ })).toHaveAttribute('href', '/depositos/transferencia')
    unmount()
    montar('/sucursales', <Sucursales rutaDelDetalle={(id) => `/s/${id}/deps`} rutaDeTransferencia="/mover" titulo="Locales" etiquetaNuevo="Nuevo local" />)
    await screen.findByText('Centro')
    expect(screen.getAllByRole('link', { name: /Ver depósitos/ })[0]).toHaveAttribute('href', '/s/1/deps')
    expect(screen.getByRole('link', { name: /Transferir stock/ })).toHaveAttribute('href', '/mover')
    expect(screen.getByText('Locales')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Nuevo local/ })).toBeTruthy()
  })

  it('el alta manda nombre, código, dirección y el nombre del primer depósito', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/sucursales', <Sucursales />)
    await screen.findByText('Centro')
    await user.click(screen.getByRole('button', { name: /Nueva sucursal/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByPlaceholderText(/Si queda vacío se llama «Depósito <nombre>»/)).toBeTruthy()
    expect(within(dialogo).queryByRole('switch')).toBeNull() // «Activa» es sólo de la edición
    const guardar = within(dialogo).getByRole('button', { name: /Guardar/ })
    expect(guardar).toBeDisabled() // el nombre es obligatorio
    await user.type(within(dialogo).getByLabelText('Nombre *'), 'Oeste')
    await user.type(within(dialogo).getByLabelText('Código'), 'OES')
    await user.type(within(dialogo).getByLabelText('Dirección'), 'Belgrano 5')
    await user.type(within(dialogo).getByLabelText('Nombre del primer depósito'), 'Mostrador')
    await user.click(guardar)
    await waitFor(() => expect(pedidas()).toContain('POST /api/sucursales'))
    expect(cuerpoDe('POST /api/sucursales')).toEqual({
      nombre: 'Oeste', codigo: 'OES', direccion: 'Belgrano 5', deposito: 'Mostrador',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('un alta sólo con nombre manda el resto vacío (el backend nombra el depósito)', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/sucursales', <Sucursales />)
    await screen.findByText('Centro')
    await user.click(screen.getByRole('button', { name: /Nueva sucursal/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nombre *'), 'Oeste')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/sucursales'))
    expect(cuerpoDe('POST /api/sucursales')).toEqual({ nombre: 'Oeste', codigo: '', direccion: '', deposito: '' })
  })

  it('🔴 editar manda el código y la dirección actuales (el backend los sobreescribe) y «activa»', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/sucursales', <Sucursales />)
    await screen.findByText('Norte')
    await user.click(screen.getAllByRole('button', { name: /Editar/ })[1])
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Código')).toHaveValue('NOR')
    expect(within(dialogo).getByLabelText('Dirección')).toHaveValue('Ruta 9 km 4')
    expect(within(dialogo).queryByLabelText('Nombre del primer depósito')).toBeNull()
    const nombre = within(dialogo).getByLabelText('Nombre *')
    await user.clear(nombre)
    await user.type(nombre, 'Norte 2')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/sucursales/2'))
    expect(cuerpoDe('PUT /api/sucursales/2')).toEqual({ nombre: 'Norte 2', codigo: 'NOR', direccion: 'Ruta 9 km 4', activa: true })
  })

  it('editar una inactiva la deja reactivar con el switch, y un código nulo se manda vacío', async () => {
    responder({ ...base, 'PUT /api/sucursales/3': SUR })
    const user = userEvent.setup()
    montar('/sucursales', <Sucursales />)
    await screen.findByText('Sur')
    await user.click(screen.getAllByRole('button', { name: /Editar/ })[2])
    const dialogo = await screen.findByRole('dialog')
    const activa = within(dialogo).getByRole('switch')
    expect(activa).not.toBeChecked()
    await user.click(activa)
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/sucursales/3'))
    expect(cuerpoDe('PUT /api/sucursales/3')).toEqual({ nombre: 'Sur', codigo: '', direccion: '', activa: true })
  })

  it('«Predeterminar» llama set-default, y sólo se ofrece a las activas que no son la predeterminada', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/sucursales', <Sucursales />)
    await screen.findByText('Norte')
    const botones = screen.getAllByRole('button', { name: /Predeterminar/ })
    expect(botones).toHaveLength(1) // ni Centro (ya lo es) ni Sur (inactiva)
    await user.click(botones[0])
    await waitFor(() => expect(pedidas()).toContain('POST /api/sucursales/2/set-default'))
    // y recarga la lista
    await waitFor(() => expect(pedidas().filter((p) => p.startsWith('GET /api/sucursales')).length).toBe(2))
  })

  it('las sucursales no se eliminan: no hay botón de borrar', async () => {
    responder(base)
    montar('/sucursales', <Sucursales />)
    await screen.findByText('Norte')
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull()
    expect(screen.queryByLabelText(/Eliminar/)).toBeNull()
  })

  it('soloLectura oculta alta, edición y predeterminar, y deja los links', async () => {
    responder(base)
    montar('/sucursales', <Sucursales soloLectura />)
    await screen.findByText('Norte')
    expect(screen.queryByRole('button', { name: /Nueva/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Predeterminar/ })).toBeNull()
    expect(screen.getAllByRole('link', { name: /Ver depósitos/ })).toHaveLength(3)
    expect(screen.getByRole('link', { name: /Transferir stock/ })).toBeTruthy()
  })

  it('muestra el mensaje del backend cuando falla una acción y cuando falla el alta', async () => {
    responder({
      ...base,
      'POST /api/sucursales/2/set-default': { status: 409, detail: 'La sucursal está inactiva.' },
      'POST /api/sucursales': { status: 422, detail: 'Ya existe una sucursal con ese código.' },
    })
    const user = userEvent.setup()
    montar('/sucursales', <Sucursales />)
    await screen.findByText('Norte')
    await user.click(screen.getByRole('button', { name: /Predeterminar/ }))
    expect(await screen.findByText('La sucursal está inactiva.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Nueva sucursal/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nombre *'), 'Oeste')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    expect(await within(dialogo).findByText('Ya existe una sucursal con ese código.')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy() // el diálogo sigue abierto con el error
  })

  it('un error de carga se muestra, y sin sucursales dice que no hay', async () => {
    responder({ '/api/sucursales': { status: 500, detail: 'Falla interna.' } })
    montar('/sucursales', <Sucursales />)
    expect(await screen.findByText('Falla interna.')).toBeTruthy()
    cleanup()
    responder({ '/api/sucursales': [] })
    montar('/sucursales', <Sucursales />)
    expect(await screen.findByText('No hay sucursales creadas.')).toBeTruthy()
    cleanup()
    responder({ '/api/sucursales': '!caida' })
    montar('/sucursales', <Sucursales />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

describe('SucursalDetalle', () => {
  const base = {
    '/api/sucursales/1': CENTRO,
    '/api/depositos': [SALON, TRASTIENDA, VIEJO, NORTE_DEP],
    'POST /api/sucursales/1/deposito-predeterminado': { ok: true },
    'POST /api/depositos': TRASTIENDA,
    'PUT /api/depositos/11': TRASTIENDA,
    'DELETE /api/depositos/11': { ok: true },
    'DELETE /api/depositos/12': { ok: true },
  }

  it('muestra el encabezado y sólo los depósitos de esa sucursal, con inactivos atenuados', async () => {
    responder(base)
    montar('/sucursales/1', <SucursalDetalle />)
    expect(await screen.findByText('Salón')).toBeTruthy()
    expect(screen.getByText('Centro')).toBeTruthy()
    expect(screen.getByText('Trastienda')).toBeTruthy()
    expect(screen.getByText('Viejo')).toBeTruthy()
    expect(screen.queryByText('Depósito Norte')).toBeNull() // es de otra sucursal
    expect(screen.getByText('Inactivo')).toBeTruthy()
    expect(screen.getByText('Viejo').closest('.opacity-50')).not.toBeNull()
    expect(screen.getByText('Salón').closest('.opacity-50')).toBeNull()
    expect(screen.getByText('Planta baja')).toBeTruthy()
    expect(screen.getByText('3 productos con stock')).toBeTruthy()
    expect(screen.getByText('1 producto con stock')).toBeTruthy()
    expect(screen.getByText('2 depósitos')).toBeTruthy()
    expect(pedidas()).toContain('GET /api/sucursales/1')
  })

  it('el badge «Depósito de venta» está sólo en el depósito de venta, y «Por defecto» en el de la instancia', async () => {
    responder({ ...base, '/api/sucursales/1': { ...CENTRO, deposito_predeterminado_id: 11 } })
    montar('/sucursales/1', <SucursalDetalle />)
    await screen.findByText('Salón')
    const tarjeta = (nombre: string) => screen.getByText(nombre).closest('[class*="grid"]')!.parentElement as HTMLElement
    expect(within(tarjeta('Trastienda')).getAllByText('Depósito de venta')).toHaveLength(1)
    expect(within(tarjeta('Salón')).getByText('Por defecto')).toBeTruthy()
    expect(within(tarjeta('Salón')).getByRole('button', { name: /Depósito de venta/ })).toBeTruthy() // Salón ya no es de venta
    expect(within(tarjeta('Trastienda')).queryByRole('button', { name: /Depósito de venta/ })).toBeNull()
  })

  it('«Depósito de venta» llama deposito-predeterminado con deposito_id, y sólo se ofrece a los activos que no lo son', async () => {
    responder(base) // el de venta es el 10 (Salón)
    const user = userEvent.setup()
    montar('/sucursales/1', <SucursalDetalle />)
    await screen.findByText('Salón')
    const botones = screen.getAllByRole('button', { name: /Depósito de venta/ })
    expect(botones).toHaveLength(1) // ni Salón (ya lo es) ni Viejo (inactivo)
    await user.click(botones[0])
    await waitFor(() => expect(pedidas()).toContain('POST /api/sucursales/1/deposito-predeterminado'))
    expect(cuerpoDe('POST /api/sucursales/1/deposito-predeterminado')).toEqual({ deposito_id: 11 })
  })

  it('el alta de un depósito manda branch_id', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/sucursales/1', <SucursalDetalle />)
    await screen.findByText('Salón')
    await user.click(screen.getByRole('button', { name: /Nuevo depósito/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).queryByRole('switch')).toBeNull()
    await user.type(within(dialogo).getByLabelText('Nombre *'), 'Cámara')
    await user.type(within(dialogo).getByLabelText('Descripción'), 'Frío')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(pedidas()).toContain('POST /api/depositos'))
    expect(cuerpoDe('POST /api/depositos')).toEqual({ nombre: 'Cámara', descripcion: 'Frío', branch_id: 1 })
  })

  it('editar un depósito manda nombre, descripción y activo', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/sucursales/1', <SucursalDetalle />)
    await screen.findByText('Trastienda')
    await user.click(screen.getAllByRole('button', { name: /Editar/ })[1])
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Nombre *')).toHaveValue('Trastienda')
    await user.click(within(dialogo).getByRole('switch')) // lo desactiva
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(pedidas()).toContain('PUT /api/depositos/11'))
    expect(cuerpoDe('PUT /api/depositos/11')).toEqual({ nombre: 'Trastienda', descripcion: '', activo: false })
  })

  it('no se ofrece eliminar el depósito de venta ni el default de la instancia; los demás se eliminan con confirmación', async () => {
    // Salón (10) es el default de la instancia, Trastienda (11) el de venta y Cámara (13) no es ninguno de los dos.
    const camara = dep({ id: 13, nombre: 'Cámara' })
    responder({
      ...base, '/api/sucursales/1': { ...CENTRO, deposito_predeterminado_id: 11 }, '/api/depositos': [SALON, TRASTIENDA, camara],
      'DELETE /api/depositos/13': { ok: true },
    })
    const user = userEvent.setup()
    montar('/sucursales/1', <SucursalDetalle />)
    await screen.findByText('Cámara')
    const eliminar = screen.getAllByLabelText('Eliminar depósito')
    expect(eliminar).toHaveLength(1)
    await user.click(eliminar[0])
    expect(await screen.findByText('¿Eliminar el depósito «Cámara»?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/depositos/13'))
  })

  it('puede eliminar un depósito inactivo que no es el de venta, y «Cancelar» no borra', async () => {
    responder(base)
    const user = userEvent.setup()
    montar('/sucursales/1', <SucursalDetalle />)
    await screen.findByText('Viejo')
    // Salón (de venta y default) sin botón; Trastienda y Viejo con botón.
    const eliminar = screen.getAllByLabelText('Eliminar depósito')
    expect(eliminar).toHaveLength(2)
    await user.click(eliminar[1])
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(pedidas()).not.toContain('DELETE /api/depositos/12')
    await user.click(screen.getAllByLabelText('Eliminar depósito')[1])
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(pedidas()).toContain('DELETE /api/depositos/12'))
  })

  it('muestra el mensaje del backend si no se puede eliminar o cambiar el depósito de venta', async () => {
    responder({
      ...base,
      'DELETE /api/depositos/11': { status: 409, detail: 'El depósito tiene movimientos.' },
      'POST /api/sucursales/1/deposito-predeterminado': { status: 422, detail: 'El depósito está inactivo.' },
    })
    const user = userEvent.setup()
    montar('/sucursales/1', <SucursalDetalle />)
    await screen.findByText('Trastienda')
    await user.click(screen.getByRole('button', { name: /Depósito de venta/ }))
    expect(await screen.findByText('El depósito está inactivo.')).toBeTruthy()
    await user.click(screen.getAllByLabelText('Eliminar depósito')[0])
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('El depósito tiene movimientos.')).toBeTruthy()
  })

  it('soloLectura oculta alta, edición, «Depósito de venta» y eliminar; quedan «Ver stock», transferir y volver', async () => {
    responder(base)
    montar('/sucursales/1', <SucursalDetalle soloLectura />)
    await screen.findByText('Salón')
    expect(screen.queryByRole('button', { name: /Nuevo depósito/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Depósito de venta/ })).toBeNull()
    expect(screen.queryByLabelText('Eliminar depósito')).toBeNull()
    expect(screen.getAllByRole('link', { name: /Ver stock/ })).toHaveLength(3)
    expect(screen.getByRole('link', { name: /Transferir stock/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Volver/ })).toHaveAttribute('href', '/sucursales')
  })

  it('las rutas de las props (con sus defaults) llegan a los links', async () => {
    responder(base)
    const { unmount } = montar('/sucursales/1', <SucursalDetalle />)
    await screen.findByText('Salón')
    expect(screen.getAllByRole('link', { name: /Ver stock/ })[0]).toHaveAttribute('href', '/depositos/10')
    expect(screen.getByRole('link', { name: /Transferir stock/ })).toHaveAttribute('href', '/depositos/transferencia')
    unmount()
    montar('/sucursales/1', <SucursalDetalle rutaDelDeposito={(id) => `/stock/${id}`} rutaDeSucursales="/locales" rutaDeTransferencia="/mover" />)
    await screen.findByText('Salón')
    expect(screen.getAllByRole('link', { name: /Ver stock/ })[0]).toHaveAttribute('href', '/stock/10')
    expect(screen.getByRole('link', { name: /Volver/ })).toHaveAttribute('href', '/locales')
    expect(screen.getByRole('link', { name: /Transferir stock/ })).toHaveAttribute('href', '/mover')
  })

  it('una sucursal inexistente (404) dice que no se encontró, con el link para volver', async () => {
    responder({ '/api/sucursales/99': { status: 404, detail: 'Sucursal no encontrada' }, '/api/depositos': [SALON] })
    montar('/sucursales/99', <SucursalDetalle />)
    expect(await screen.findByText('Sucursal no encontrada.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Volver/ })).toHaveAttribute('href', '/sucursales')
    expect(screen.queryByRole('button', { name: /Nuevo depósito/ })).toBeNull()
    expect(screen.queryByText('Cargando…')).toBeNull()
  })

  it('un id que no es un número tampoco pide nada al backend', async () => {
    responder(base)
    montar('/sucursales/abc', <SucursalDetalle />)
    expect(await screen.findByText('Sucursal no encontrada.')).toBeTruthy()
    expect(pedidas()).toEqual([])
  })

  it('un error que no es 404 se muestra como error, no como «no encontrada»', async () => {
    responder({ '/api/sucursales/1': { status: 500, detail: 'Falla interna.' }, '/api/depositos': [] })
    montar('/sucursales/1', <SucursalDetalle />)
    expect(await screen.findByText('Falla interna.')).toBeTruthy()
    expect(screen.queryByText('Sucursal no encontrada.')).toBeNull()
  })

  it('una sucursal sin depósitos lo dice', async () => {
    responder({ '/api/sucursales/3': SUR, '/api/depositos': [SALON] })
    montar('/sucursales/3', <SucursalDetalle />)
    expect(await screen.findByText('Esta sucursal no tiene depósitos.')).toBeTruthy()
    expect(screen.getByText('Inactiva')).toBeTruthy()
  })
})


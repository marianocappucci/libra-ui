// El error de la consulta de CUIT que se arregla en Configuración (503 «Configurá los certificados…», 403 «el
// certificado no tiene acceso al servicio de Padrón…») trae un enlace al tutorial de Padrón A13; los demás errores,
// no. Y el tutorial se abre solo cuando se llega con su ancla.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Clientes } from '../src/comercio/Clientes'
import { ClienteDetalle } from '../src/comercio/ClienteDetalle'
import { ArcaCard } from '../src/Configuracion'
import { URL_TUTORIAL_PADRON } from '../src/configuracion/arca-tutorial'
import { IVA_CONDITIONS } from '../src/facturas'
import type { Cliente } from '../src/mp'
import { fetchMock, json, montar, prepararFetch, responder } from './helpers-pantallas'

const ANA: Cliente = { id: 1, name: 'Ana', address: 'Calle 1', cuit_dni: '20-12345678-9', email: 'ana@x.com', phone: '111', iva_condition: IVA_CONDITIONS[0], auto_facturar: 0, activo: 1 }

/** El `fetch` del padrón con un estado y un cuerpo a elección; el resto de las rutas, las de `responder`. */
function padron(estado: number, cuerpo: unknown) {
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) =>
    String(entrada).startsWith('/api/consultar-cuit/')
      ? Promise.resolve(json(cuerpo, estado))
      : base(entrada, init))
}

beforeEach(() => {
  cleanup()
  prepararFetch()
  window.location.hash = ''
})

async function consultarEnElAlta(props: Parameters<typeof Clientes>[0] = {}) {
  responder({ '/api/clientes': [ANA] })
  const user = userEvent.setup()
  montar('/clientes', <Clientes {...props} />)
  await screen.findByText('Ana')
  await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
  const dialogo = screen.getByRole('dialog')
  fireEvent.change(within(dialogo).getByLabelText('CUIT/DNI'), { target: { value: '20-12345678-9' } })
  return { user, dialogo }
}

describe('Clientes · enlace al tutorial de Padrón A13', () => {
  it('503 (sin certificados): el mensaje enlaza a la pestaña de ARCA de Configuración, con el ancla del tutorial', async () => {
    const { user, dialogo } = await consultarEnElAlta()
    padron(503, { error: 'Configurá los certificados ARCA en Configuración para habilitar la consulta de CUIT.' })
    await user.click(within(dialogo).getByRole('button', { name: 'Consultar en ARCA' }))
    const enlace = await within(dialogo).findByRole('link', { name: 'Cómo habilitar el servicio de Padrón en ARCA' })
    expect(enlace).toHaveAttribute('href', URL_TUTORIAL_PADRON)
    expect(URL_TUTORIAL_PADRON).toBe('/configuracion?seccion=integraciones&integracion=arca#tutorial-padron-a13')
  })

  it('403 del motor (el certificado no tiene acceso a Padrón): también enlaza', async () => {
    const { user, dialogo } = await consultarEnElAlta()
    padron(403, { error: 'El certificado no tiene acceso al servicio de Padrón (ws_sr_padron_a13).' })
    await user.click(within(dialogo).getByRole('button', { name: 'Consultar en ARCA' }))
    expect(await within(dialogo).findByRole('link', { name: 'Cómo habilitar el servicio de Padrón en ARCA' })).toBeTruthy()
  })

  it('un 403 de permisos (`{detail}`), un 404 del padrón o la caída de la red no enlazan: el tutorial no los arregla', async () => {
    const { user, dialogo } = await consultarEnElAlta()
    padron(403, { detail: 'Módulo no habilitado' })
    await user.click(within(dialogo).getByRole('button', { name: 'Consultar en ARCA' }))
    await within(dialogo).findByText('Módulo no habilitado')
    expect(within(dialogo).queryByRole('link')).toBeNull()

    padron(404, { error: 'CUIT no encontrado en el padrón de ARCA.' })
    await user.click(within(dialogo).getByRole('button', { name: 'Consultar en ARCA' }))
    await within(dialogo).findByText('CUIT no encontrado en el padrón de ARCA.')
    expect(within(dialogo).queryByRole('link')).toBeNull()
  })

  it('`urlTutorialPadron={null}` saca el enlace, y una URL propia lo redirige', async () => {
    const sin = await consultarEnElAlta({ urlTutorialPadron: null })
    padron(503, { error: 'Configurá los certificados ARCA…' })
    await sin.user.click(within(sin.dialogo).getByRole('button', { name: 'Consultar en ARCA' }))
    await within(sin.dialogo).findByText(/Configurá los certificados ARCA/)
    expect(within(sin.dialogo).queryByRole('link')).toBeNull()

    cleanup()
    const propia = await consultarEnElAlta({ urlTutorialPadron: '/config#arca' })
    padron(503, { error: 'Configurá los certificados ARCA…' })
    await propia.user.click(within(propia.dialogo).getByRole('button', { name: 'Consultar en ARCA' }))
    expect(await within(propia.dialogo).findByRole('link', { name: 'Cómo habilitar el servicio de Padrón en ARCA' })).toHaveAttribute('href', '/config#arca')
  })
})

describe('ClienteDetalle · enlace al tutorial de Padrón A13', () => {
  it('503: el diálogo de edición de la ficha enlaza igual', async () => {
    responder({ '/api/clientes/1': { ...ANA, alias_facturacion: [], facturas: [], presupuestos: [], remitos: [] } })
    const user = userEvent.setup()
    montar('/clientes/1', <ClienteDetalle />)
    await screen.findByText('Datos del cliente')
    await user.click(screen.getByRole('button', { name: /Editar/ }))
    await screen.findByRole('dialog')
    padron(503, { error: 'Configurá los certificados ARCA en Configuración para habilitar la consulta de CUIT.' })
    await user.click(screen.getByRole('button', { name: 'Consultar en ARCA' }))
    expect(await screen.findByRole('link', { name: 'Cómo habilitar el servicio de Padrón en ARCA' })).toHaveAttribute('href', URL_TUTORIAL_PADRON)
  })
})

describe('El tutorial de Padrón A13 en Configuración', () => {
  it('lleva el ancla y está cerrado salvo que se llegue con ella', async () => {
    responder({})
    render(<ArcaCard producto="MedLibra" />)
    const tutorial = (await screen.findByText(/consultar datos de clientes por CUIT/)).closest('details')!
    expect(tutorial.id).toBe('tutorial-padron-a13')
    expect(tutorial.open).toBe(false)
  })

  it('con `#tutorial-padron-a13` en la URL se abre solo', async () => {
    window.location.hash = '#tutorial-padron-a13'
    responder({})
    render(<ArcaCard producto="MedLibra" />)
    const tutorial = (await screen.findByText(/consultar datos de clientes por CUIT/)).closest('details')!
    expect(tutorial.open).toBe(true)
  })
})

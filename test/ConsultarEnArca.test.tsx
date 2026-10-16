/** El botón «Consultar en ARCA» del kit (ADR-070): llama al endpoint del motor, precarga sin pisar lo escrito y, si falta
 *  habilitar el servicio de Padrón, manda al tutorial de Configuración. Portado de los tests de LibraCargo, LibraClub
 *  y GestioLibra, que tenían cada uno su copia del componente. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConsultarEnArca } from '../src/configuracion/ConsultarEnArca'
import { URL_TUTORIAL_PADRON } from '../src/configuracion/arca-tutorial'
import { condicionDeIvaDeArca } from '../src/facturas'

const PERSONA = {
  nombre: 'ACME SA', domicilio: 'Ruta 8 km 5, Pilar, Buenos Aires',
  iva_condition: 'Responsable Inscripto', estado: 'ACTIVO',
}
const DESTINO = {
  nombre: { campo: 'razon_social', etiqueta: 'Razón social' },
  domicilio: { campo: 'direccion', etiqueta: 'Dirección' },
  iva: { campo: 'condicion_iva', etiqueta: 'Condición de IVA' },
}

const respuesta = (estado: number, cuerpo: unknown) =>
  Promise.resolve({ ok: estado >= 200 && estado < 300, status: estado, json: () => Promise.resolve(cuerpo) } as Response)

/** Un formulario mínimo: el estado vive acá, como en `AbmMaestro`, y se ve lo que quedó cargado. */
function Formulario({ inicial = {}, porDefecto }: { inicial?: Record<string, unknown>; porDefecto?: Record<string, unknown> }) {
  const [v, setV] = useState<Record<string, unknown>>({ cuit: '30-71111111-4', ...inicial })
  return (
    <div>
      <ConsultarEnArca cuit={v.cuit} valores={v} destino={DESTINO} ivaDe={condicionDeIvaDeArca} porDefecto={porDefecto}
                       alAplicar={(c) => setV((a) => ({ ...a, ...c }))} />
      <span aria-label="razon">{String(v.razon_social ?? '')}</span>
      <span aria-label="direccion">{String(v.direccion ?? '')}</span>
      <span aria-label="iva">{String(v.condicion_iva ?? '')}</span>
    </div>
  )
}

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

const consultar = () => fireEvent.click(screen.getByRole('button', { name: /Consultar en ARCA/ }))

describe('Consultar en ARCA', () => {
  it('pide el CUIT en dígitos al endpoint del motor y precarga razón social, dirección y condición de IVA', async () => {
    fetchMock.mockReturnValue(respuesta(200, PERSONA))
    render(<Formulario />)
    consultar()
    await waitFor(() => expect(screen.getByLabelText('razon')).toHaveTextContent('ACME SA'))
    expect(fetchMock).toHaveBeenCalledWith('/api/consultar-cuit/30711111114', { credentials: 'include' })
    expect(screen.getByLabelText('direccion')).toHaveTextContent('Ruta 8 km 5, Pilar, Buenos Aires')
        expect(screen.getByLabelText('iva')).toHaveTextContent('Responsable Inscripto')
    expect(screen.getByRole('status')).toHaveTextContent('Datos importados desde ARCA — Estado: ACTIVO.')
  })

  it('no pisa lo que el usuario ya escribió: lo muestra y deja elegir', async () => {
    fetchMock.mockReturnValue(respuesta(200, PERSONA))
    render(<Formulario inicial={{ razon_social: 'Acme S.A. (mi nombre)' }} />)
    consultar()
    // Lo vacío se completa; lo escrito queda como estaba.
    await waitFor(() => expect(screen.getByLabelText('direccion')).toHaveTextContent('Ruta 8'))
    expect(screen.getByLabelText('razon')).toHaveTextContent('Acme S.A. (mi nombre)')
    const grupo = screen.getByRole('group', { name: /distintos de los cargados/ })
    expect(grupo).toHaveTextContent('Razón social: ACME SA')

    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar con los de ARCA' }))
    expect(screen.getByLabelText('razon')).toHaveTextContent('ACME SA')
    expect(screen.queryByRole('group', { name: /distintos/ })).toBeNull()
  })

  it('en un alta, un valor que todavía es el inicial (la condición de IVA arranca en un valor propio) no cuenta como escrito', async () => {
    fetchMock.mockReturnValue(respuesta(200, PERSONA))
    render(<Formulario inicial={{ condicion_iva: 'Consumidor Final' }} porDefecto={{ condicion_iva: 'Consumidor Final' }} />)
    consultar()
    await waitFor(() => expect(screen.getByLabelText('iva')).toHaveTextContent('Responsable Inscripto'))
    expect(screen.queryByRole('group', { name: /distintos/ })).toBeNull()
  })

  it('al editar (sin valores iniciales) una condición ya cargada sí se pregunta antes de cambiarla', async () => {
    fetchMock.mockReturnValue(respuesta(200, PERSONA))
    render(<Formulario inicial={{ condicion_iva: 'Consumidor Final' }} />)
    consultar()
    expect(await screen.findByRole('group', { name: /distintos/ })).toHaveTextContent('Condición de IVA')
    expect(screen.getByLabelText('iva')).toHaveTextContent('Consumidor Final')
  })

  it('«Dejar los míos» cierra el aviso sin tocar nada', async () => {
    fetchMock.mockReturnValue(respuesta(200, PERSONA))
    render(<Formulario inicial={{ razon_social: 'Mi nombre' }} />)
    consultar()
    fireEvent.click(await screen.findByRole('button', { name: 'Dejar los míos' }))
    expect(screen.getByLabelText('razon')).toHaveTextContent('Mi nombre')
    expect(screen.queryByRole('group', { name: /distintos/ })).toBeNull()
  })

  it('si lo escrito es lo mismo que informa ARCA (aunque cambien mayúsculas) no pregunta nada', async () => {
    fetchMock.mockReturnValue(respuesta(200, PERSONA))
    render(<Formulario inicial={{ razon_social: 'acme sa', direccion: 'Ruta 8 km 5, Pilar, Buenos Aires' }} />)
    consultar()
    await waitFor(() => expect(screen.getByLabelText('iva')).toHaveTextContent('Responsable Inscripto'))
    expect(screen.queryByRole('group', { name: /distintos/ })).toBeNull()
  })

  it('una condición de IVA sin equivalente en el formulario no se toca', async () => {
    fetchMock.mockReturnValue(respuesta(200, { ...PERSONA, iva_condition: 'Régimen Inexistente' }))
    render(<Formulario />)
    consultar()
    await waitFor(() => expect(screen.getByLabelText('razon')).toHaveTextContent('ACME SA'))
    expect(screen.getByLabelText('iva')).toHaveTextContent('')
  })

  it('con el CUIT incompleto no llama al servidor', async () => {
    render(<Formulario inicial={{ cuit: '30-7111' }} />)
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresá un CUIT de 11 dígitos antes de consultar.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('503: dice que faltan los certificados y enlaza al tutorial de Configuración', async () => {
    fetchMock.mockReturnValue(respuesta(503, {
      error: 'Configurá los certificados ARCA en Configuración para habilitar la consulta de CUIT.' }))
    render(<Formulario />)
    consultar()
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Configurá los certificados ARCA en Configuración')
    expect(screen.getByRole('link', { name: /Cómo habilitar el servicio de Padrón/ }))
      .toHaveAttribute('href', URL_TUTORIAL_PADRON)
  })

  it('403: el certificado no tiene acceso a Padrón, y también enlaza al tutorial', async () => {
    fetchMock.mockReturnValue(respuesta(403, {
      error: 'El certificado no tiene acceso al servicio de Padrón (ws_sr_padron_a13). Ingresá a ARCA…' }))
    render(<Formulario />)
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent('no tiene acceso al servicio de Padrón')
    expect(screen.getByRole('link', { name: /Cómo habilitar el servicio de Padrón/ })).toBeInTheDocument()
  })

  it('un 403 que no es del motor (falta de permiso) no manda al tutorial del padrón', async () => {
    fetchMock.mockReturnValue(respuesta(403, { detail: 'No tenés permiso' }))
    render(<Formulario />)
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('404: el CUIT no está en el padrón; es un dato, no un problema de configuración, así que sin enlace', async () => {
    fetchMock.mockReturnValue(respuesta(404, { error: 'CUIT no encontrado en el padrón de ARCA.' }))
    render(<Formulario />)
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent('CUIT no encontrado en el padrón de ARCA.')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('si no hay red lo dice, y el botón vuelve a quedar disponible', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<Formulario />)
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con ARCA.')
    expect(screen.getByRole('button', { name: /Consultar en ARCA/ })).toBeEnabled()
  })

  it('mientras consulta el botón queda deshabilitado y dice «Consultando…»', async () => {
    let contestar: (r: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolver) => { contestar = resolver }))
    render(<Formulario />)
    consultar()
    expect(await screen.findByRole('button', { name: 'Consultando…' })).toBeDisabled()
    contestar({ ok: true, status: 200, json: () => Promise.resolve(PERSONA) } as Response)
    expect(await screen.findByRole('button', { name: 'Consultar en ARCA' })).toBeEnabled()
  })

  it('un cuerpo que no es JSON no rompe: cae en el mensaje genérico', async () => {
    fetchMock.mockReturnValue(Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('x')) } as Response))
    render(<Formulario />)
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Error al consultar ARCA.')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('Consultar en ARCA · variantes del producto', () => {
  const sinTutorial = { error: 'Configurá los certificados ARCA en Configuración para habilitar la consulta de CUIT.' }

  it('`consulta` reemplaza al fetch del kit: recibe el CUIT tal cual está en el formulario', async () => {
    const consulta = vi.fn().mockResolvedValue({ ok: true, datos: { nombre: 'ACME SA', estado: 'ACTIVO' } })
    render(<ConsultarEnArca cuit="30-71111111-4" valores={{}} destino={{ nombre: { campo: 'razon_social', etiqueta: 'Razón social' } }}
                            alAplicar={() => {}} consulta={consulta} />)
    consultar()
    expect(await screen.findByRole('status')).toHaveTextContent('Datos importados desde ARCA — Estado: ACTIVO.')
    expect(consulta).toHaveBeenCalledWith('30-71111111-4')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('`consulta` puede pedir el tutorial y el enlace sale', async () => {
    const consulta = vi.fn().mockResolvedValue({ ok: false, mensaje: 'Falta habilitar Padrón.', estado: 403, pideElTutorial: true })
    render(<ConsultarEnArca cuit="30-71111111-4" valores={{}} destino={{}} alAplicar={() => {}} consulta={consulta} />)
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta habilitar Padrón.')
    expect(screen.getByRole('link', { name: /Cómo habilitar el servicio de Padrón/ })).toHaveAttribute('href', URL_TUTORIAL_PADRON)
  })

  it('`urlTutorial` redirige el enlace, y `null` lo saca', async () => {
    fetchMock.mockReturnValue(respuesta(503, sinTutorial))
    const { unmount } = render(<ConsultarEnArca cuit="30-71111111-4" valores={{}} destino={{}} alAplicar={() => {}} urlTutorial="/config#arca" />)
    consultar()
    expect(await screen.findByRole('link', { name: /Cómo habilitar/ })).toHaveAttribute('href', '/config#arca')
    unmount()

    render(<ConsultarEnArca cuit="30-71111111-4" valores={{}} destino={{}} alAplicar={() => {}} urlTutorial={null} />)
    consultar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Configurá los certificados ARCA')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

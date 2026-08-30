// Que **todos** los campos de cada sección lleguen al `PUT`.
//
// 🔴 El defecto que esto impide es el más aburrido y el más fácil de cometer:
// un campo que se pinta, se deja tipear, y **no está en el cuerpo del PUT**.
// No hay error, no hay aviso — el valor simplemente no se guarda, y se
// descubre al volver a entrar a la pantalla y ver el campo como estaba.
//
// Es un riesgo concreto de esta pantalla y no una hipótesis: el cuerpo de cada
// `guardar()` se arma a mano, campo por campo, porque los secretos y el estado
// del formulario no se pueden mandar en bloque. Agregar un campo al formulario
// y olvidarlo en el objeto compila, pasa el typecheck y sale verde en todos los
// otros tests.
//
// Por eso se tipea en **cada** campo un valor distinto y reconocible, y se
// compara el cuerpo entero de una: un `toEqual` sobre el objeto completo falla
// también cuando sobra una clave, que es la otra mitad del problema.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ArcaCard, EmpresaCard, MercadoPagoCard } from '../src/Configuracion'

const EMPRESA = {
  empresa_nombre: '', empresa_direccion: '', empresa_cuit: '', empresa_telefono: '',
  empresa_email: '', empresa_iibb: '', empresa_iva_condition: 'Monotributista',
  empresa_inicio_actividades: '',
}

const ARCA = {
  empresa: 'default', cuit: '', punto_venta: 1, ambiente: 'homologacion', alias: '',
  certificado_path: '', clave_path: '', tiene_certificado: false, tiene_clave: false,
}

const MP = {
  mp_access_token: '', mp_access_token_cargado: false,
  mp_webhook_secret: '', mp_webhook_secret_cargado: false,
  mp_concepto_descripcion: '', mp_iva_rate: '0',
  mp_user_id: '', mp_pos_id: '', mp_auto_facturar_ventas: false,
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

let escrituras: { url: string; metodo: string; body: unknown }[] = []

function responder(porUrl: (u: string) => unknown) {
  vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
    const u = String(url)
    const metodo = opciones?.method ?? 'GET'
    if (metodo !== 'GET') escrituras.push({ url: u, metodo, body: opciones?.body ?? null })
    if (u.includes('/logo')) return Promise.resolve(new Response('', { status: 404 }))
    return Promise.resolve(json(porUrl(u)))
  }))
}

/** El cuerpo del último PUT, ya parseado. */
function cuerpoDelPut(): Record<string, unknown> {
  const put = escrituras.find((e) => e.metodo === 'PUT')
  expect(put, 'no llegó ningún PUT').toBeTruthy()
  return JSON.parse(String(put!.body))
}

const montar = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  escrituras = []
})


describe('Empresa — los ocho campos llegan al PUT', () => {
  it('cada uno con su valor, y ninguno de más', async () => {
    responder(() => EMPRESA)
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    await usuario.type(await screen.findByLabelText(/^Nombre$/), 'Ferretería Suipacha')
    await usuario.type(screen.getByLabelText(/^CUIT$/), '20123456789')
    await usuario.type(screen.getByLabelText(/^Dirección$/), 'Suipacha 123')
    await usuario.type(screen.getByLabelText(/^Teléfono$/), '3514567890')
    await usuario.type(screen.getByLabelText(/^Email$/), 'info@ferre.com.ar')
    await usuario.type(screen.getByLabelText(/Ingresos Brutos/), '901-123456-7')
    await usuario.type(screen.getByLabelText(/Inicio de actividades/), '2020-01-15')
    await usuario.selectOptions(screen.getByRole('combobox'), 'IVA Exento')

    await usuario.click(screen.getByRole('button', { name: /Guardar datos de empresa/ }))

    expect(cuerpoDelPut()).toEqual({
      empresa_nombre: 'Ferretería Suipacha',
      empresa_cuit: '20123456789',
      empresa_direccion: 'Suipacha 123',
      empresa_telefono: '3514567890',
      empresa_email: 'info@ferre.com.ar',
      empresa_iibb: '901-123456-7',
      empresa_iva_condition: 'IVA Exento',
      empresa_inicio_actividades: '2020-01-15',
    })
  })

  it('el inicio de actividades es un selector de fecha, no texto libre', async () => {
    // Va al backend en ISO y lo consume ARCA. Escrito a mano, "15/01/2020"
    // pasa la pantalla y lo rechaza el organismo.
    responder(() => EMPRESA)
    montar(<EmpresaCard />)

    expect(await screen.findByLabelText(/Inicio de actividades/))
      .toHaveAttribute('type', 'date')
  })
})


describe('ARCA — los cinco campos llegan al PUT', () => {
  it('cada uno con su valor, y el punto de venta como número', async () => {
    responder((u) => (u.includes('/estado')
      ? { configurado: false, ambiente: '', cuit: '', tiene_certificado: false, tiene_clave: false }
      : ARCA))
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.type(await screen.findByLabelText(/^CUIT$/), '30777777779')
    const pv = screen.getByLabelText(/Punto de venta/)
    await usuario.clear(pv)
    await usuario.type(pv, '7')
    await usuario.type(screen.getByLabelText(/^Alias$/), 'sucursal-centro')
    await usuario.selectOptions(screen.getByRole('combobox'), 'produccion')

    await usuario.click(screen.getByRole('button', { name: /Guardar ARCA/ }))

    expect(cuerpoDelPut()).toEqual({
      empresa: 'default',
      cuit: '30777777779',
      punto_venta: 7,
      ambiente: 'produccion',
      alias: 'sucursal-centro',
    })
  })

  it('un punto de venta vacío cae en 1 y no manda NaN', async () => {
    // `Number('')` es 0 y `Number('x')` es NaN; los dos rompen del otro lado —
    // el backend declara `ge=1`, y un NaN ni siquiera sobrevive al JSON.
    responder((u) => (u.includes('/estado') ? { configurado: false } : ARCA))
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.clear(await screen.findByLabelText(/Punto de venta/))
    await usuario.click(screen.getByRole('button', { name: /Guardar ARCA/ }))

    expect(cuerpoDelPut().punto_venta).toBe(1)
  })
})


describe('MercadoPago — los siete campos llegan al PUT', () => {
  it('cada uno con su valor, incluidos los dos secretos recién tipeados', async () => {
    responder(() => MP)
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await usuario.type(await screen.findByLabelText(/Access Token/), 'APP_USR-1234')
    await usuario.type(screen.getByLabelText(/Webhook Secret/), 'firma-secreta')
    await usuario.type(screen.getByLabelText(/Descripción del cobro/), 'Cobro mostrador')
    await usuario.type(screen.getByLabelText(/User ID \(QR\)/), '75023836')
    await usuario.type(screen.getByLabelText(/POS ID \(QR\)/), 'CAJA01')
    await usuario.selectOptions(screen.getByRole('combobox'), '0.21')
    await usuario.click(screen.getByRole('switch'))

    await usuario.click(screen.getByRole('button', { name: /Guardar MercadoPago/ }))

    expect(cuerpoDelPut()).toEqual({
      mp_access_token: 'APP_USR-1234',
      mp_webhook_secret: 'firma-secreta',
      mp_concepto_descripcion: 'Cobro mostrador',
      mp_iva_rate: '0.21',
      mp_user_id: '75023836',
      mp_pos_id: 'CAJA01',
      mp_auto_facturar_ventas: true,
    })
  })

  it('después de guardar, los campos secretos vuelven a quedar vacíos', async () => {
    // Si el token tipeado quedara en el campo, el siguiente guardado lo
    // mandaría de nuevo — inofensivo— pero sobre todo quedaría un secreto en
    // claro en la pantalla de quien se levanta del escritorio.
    responder(() => MP)
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    const token = await screen.findByLabelText(/Access Token/)
    await usuario.type(token, 'APP_USR-1234')
    await usuario.click(screen.getByRole('button', { name: /Guardar MercadoPago/ }))

    expect(await screen.findByText(/^Guardado\.$/)).toBeInTheDocument()
    expect(token).toHaveValue('')
  })
})

/** «Generar pedido de certificado» en la tarjeta de ARCA (libracore ADR-036, kit ADR-041).
 *
 *  🔴 **Lo que esta pantalla tiene que hacer imposible**, en este orden:
 *
 *  1. Que un backend **sin** el pedido (LibraCore anterior) vea un botón que daría 404, o cambie de
 *     aspecto. La marca es `admite_pedido` en `GET /servicios`; sin ella la tarjeta es la de siempre.
 *  2. Que la clave privada pase por el navegador: ninguna pieza del DOM la contiene, y el `.csr` se baja
 *     con un enlace al motor, no desde un texto armado acá.
 *  3. Que con un pedido esperando el `.crt` se ofrezca subir una clave: no hay campo de clave.
 *  4. Descartar un pedido (se pierde su clave) sin que el diálogo lo diga y sin confirmar.
 *  5. Que el diálogo se desmonte justo al generar, con los pasos todavía sin leer.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ArcaCard } from '../src/configuracion/arca'
import {
  aliasSugerido, pasosParaArca, puedePedirCertificado, type ParDeArca,
} from '../src/configuracion/arca-pares'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

const PAR_LLENO = {
  tiene_certificado: true, tiene_clave: true, completo: true,
  vence: '01-08-2028', dias_para_vencer: 700, vencido: false,
}
const PAR_VACIO = { tiene_certificado: false, tiene_clave: false, completo: false }

const PEDIDO = {
  pendiente: true, servicio: 'wsfe', ambiente: 'produccion', alias: 'contalibrawsfeprod',
  cuit: '20000000001', razon_social: 'Empresa Ficticia S.A.', sujeto: 'serialNumber=CUIT 20000000001',
  creado: '08-10-2026',
}

type Pares = Record<string, Record<string, unknown>>

/** El backend de juguete, con estado: lo que el motor devolvería después de cada operación. */
function servidor(opciones: {
  admitePedido?: boolean
  pares?: Pares
  paresCpe?: Pares
  conCpe?: boolean
  falla?: Record<string, () => Response>
} = {}) {
  const admite = opciones.admitePedido ?? true
  const estado = {
    pares: opciones.pares ?? {
      homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
      produccion: { ambiente: 'produccion', ...PAR_VACIO },
    } as Pares,
    paresCpe: opciones.paresCpe ?? {
      homologacion: { ambiente: 'homologacion', ...PAR_VACIO },
      produccion: { ambiente: 'produccion', ...PAR_VACIO },
    } as Pares,
  }
  const pedidos: { url: string; metodo: string; cuerpo?: Record<string, unknown> }[] = []

  const config = () => ({
    empresa: 'default', cuit: '20000000001', punto_venta: 1, ambiente: 'homologacion', alias: '',
    certificado_path: '', clave_path: '', tiene_certificado: false, tiene_clave: false,
    pares: estado.pares,
  })
  const servicios = () => {
    const lista: unknown[] = [{
      servicio: 'wsfe', etiqueta: 'Facturación electrónica', ayuda: '', empresa: 'default',
      configurado: false, ...(admite ? { admite_pedido: true } : {}), pares: estado.pares,
    }]
    if (opciones.conCpe) {
      lista.push({
        servicio: 'wscpe', etiqueta: 'CTG y Carta de Porte', ayuda: '', empresa: 'default',
        configurado: false, ...(admite ? { admite_pedido: true } : {}), pares: estado.paresCpe,
      })
    }
    return lista
  }

  // 🔴 Con latencia (un macrotask por respuesta): contestando en el mismo instante React junta los
  // `setState` de «Cargando…» y de «ya cargó» en un solo render, y un refresco que desmonta la
  // tarjeta pasaría desapercibido. Con red de verdad no.
  const conLatencia = <T,>(r: Promise<T>) => r.then((v) => new Promise<T>((ok) => setTimeout(() => ok(v), 5)))
  vi.stubGlobal('fetch', vi.fn((url: unknown, opciones_?: RequestInit) => conLatencia(respuesta(url, opciones_))))
  const respuesta = (url: unknown, opciones_?: RequestInit): Promise<Response> => {
    const u = String(url)
    const metodo = opciones_?.method ?? 'GET'
    const cuerpo = typeof opciones_?.body === 'string' ? JSON.parse(opciones_.body) : undefined
    pedidos.push({ url: u, metodo, cuerpo })

    for (const [fragmento, responder] of Object.entries(opciones.falla ?? {})) {
      if (u.includes(fragmento)) return Promise.resolve(responder())
    }
    const destino = u.includes('/servicios/wscpe/') ? estado.paresCpe : estado.pares
    const ambiente = /ambiente=(\w+)/.exec(u)?.[1] ?? ''
    if (/\/pedido(\?|$)/.test(u) && metodo === 'POST') {
      const pendiente = {
        ...PEDIDO, ...cuerpo, servicio: u.includes('/wscpe/') ? 'wscpe' : 'wsfe', ambiente,
        razon_social: cuerpo?.razon_social, creado: '08-10-2026',
      }
      destino[ambiente] = { ...destino[ambiente], pedido: pendiente }
      return Promise.resolve(json({ ...pendiente, csr: '-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----\n' }))
    }
    if (/\/pedido(\?|$)/.test(u) && metodo === 'DELETE') {
      const { pedido: _quitado, ...resto } = destino[ambiente]
      destino[ambiente] = resto
      return Promise.resolve(json({ pendiente: false, ambiente }))
    }
    if (u.includes('/servicios') && metodo === 'GET') return Promise.resolve(json(servicios()))
    if (u.includes('/estado')) {
      return Promise.resolve(json({
        configurado: false, ambiente: 'homologacion', cuit: '20000000001',
        tiene_certificado: false, tiene_clave: false, pares: estado.pares,
      }))
    }
    return Promise.resolve(json(config()))
  }
  return { pedidos, estado }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

const BOTON = /^Generar pedido de certificado/

describe('ARCA — el pedido sólo se ofrece si el motor lo admite', () => {
  it('🔴 sin `admite_pedido` no hay botón, y la clave sigue siendo un campo más', async () => {
    servidor({ admitePedido: false })
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    await waitFor(() => expect(screen.getByLabelText('Clave privada (.key) — Producción')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: BOTON })).toBeNull()
    expect(screen.queryByText(/Ya tengo una clave privada hecha afuera/)).toBeNull()
    // El campo de clave NO está dentro de un desplegable.
    expect(screen.getByLabelText('Clave privada (.key) — Producción').closest('details')).toBeNull()
  })

  it('un backend sin `/servicios` (LibraCore viejo) tampoco muestra el botón', async () => {
    vi.stubGlobal('fetch', vi.fn((url: unknown) => Promise.resolve(
      String(url).includes('/servicios') ? json({ detail: 'Not Found' }, 404)
        : String(url).includes('/estado') ? json({ configurado: false, ambiente: '', cuit: '', tiene_certificado: false, tiene_clave: false })
          : json(null),
    )))
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    expect(screen.queryByRole('button', { name: BOTON })).toBeNull()
  })

  it('con `admite_pedido`: un botón por ambiente sin par, y la clave pasa a «avanzado»', async () => {
    servidor()
    render(<ArcaCard producto="Contalibra" />)

    // Homologación tiene el par completo y vigente: no se ofrece. Producción está vacía: sí.
    expect(await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' }))
      .toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Generar pedido de certificado — Homologación/ })).toBeNull()

    const clave = screen.getByLabelText('Clave privada (.key) — Producción')
    const avanzado = clave.closest('details')
    expect(avanzado).not.toBeNull()
    expect(avanzado).not.toHaveAttribute('open')
    expect(within(avanzado as HTMLElement).getByText(/Ya tengo una clave privada hecha afuera \(avanzado\)/))
      .toBeInTheDocument()
  })

  it('un par por vencer o vencido también ofrece el pedido (renovar es el mismo trámite)', async () => {
    servidor({ pares: {
      homologacion: { ambiente: 'homologacion', ...PAR_LLENO, dias_para_vencer: 12 },
      produccion: { ambiente: 'produccion', ...PAR_LLENO, vencido: true, dias_para_vencer: -3, vence: '01-10-2026' },
    } })
    render(<ArcaCard producto="Contalibra" />)
    expect(await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generar pedido de certificado — Homologación (pruebas)' })).toBeInTheDocument()
  })

  it('un par completo y lejos de vencer no lo ofrece', async () => {
    servidor({ pares: {
      homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
      produccion: { ambiente: 'produccion', ...PAR_LLENO },
    } })
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    await screen.findByLabelText('Clave privada (.key) — Producción')
    expect(screen.queryByRole('button', { name: BOTON })).toBeNull()
  })
})

describe('ARCA — generar el pedido', () => {
  it('abre el diálogo prellenado con los datos de la empresa y un alias sugerido', async () => {
    servidor()
    render(<ArcaCard producto="Contalibra" razonSocial="Empresa Ficticia S.A." />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('CUIT')).toHaveValue('20000000001')
    expect(within(dialogo).getByLabelText('Razón social')).toHaveValue('Empresa Ficticia S.A.')
    expect(within(dialogo).getByLabelText('Alias')).toHaveValue('contalibrawsfeprod')
    expect(dialogo).toHaveTextContent(/sólo sale el archivo \.csr/)
    expect(dialogo).toHaveTextContent('Producción')
  })

  it('🔴 genera con lo editado, muestra el .csr y los pasos de ARCA con el CUIT y el alias, y no se desmonta', async () => {
    const { pedidos } = servidor()
    render(<ArcaCard producto="Contalibra" razonSocial="Empresa Ficticia S.A." />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' }))
    const dialogo = await screen.findByRole('dialog')
    const alias = within(dialogo).getByLabelText('Alias')
    await usuario.clear(alias)
    await usuario.type(alias, 'miempresaprod')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Generar pedido' }))

    const post = await waitFor(() => {
      const p = pedidos.find((x) => x.metodo === 'POST' && x.url.includes('/pedido'))
      expect(p).toBeTruthy()
      return p!
    })
    expect(post.url).toBe('/config/arca/pedido?empresa=default&ambiente=produccion')
    expect(post.cuerpo).toEqual({
      cuit: '20000000001', razon_social: 'Empresa Ficticia S.A.', alias: 'miempresaprod',
    })

    // 🔴 Se espera a que la tarjeta SE REFRESQUE detrás (ya cuenta el pedido pendiente) y recién ahí se
    // mira el diálogo: si el refresco desmontara la tarjeta, los pasos desaparecerían justo cuando se leen.
    expect(await screen.findAllByText(/Esperando el certificado de ARCA \(pedido del 08-10-2026\)/))
      .not.toHaveLength(0)
    expect(screen.getByText('Pedido generado')).toBeInTheDocument()
    const abierto = screen.getByRole('dialog')
    const enlace = within(abierto).getByRole('link', { name: /Descargar el \.csr/ })
    expect(enlace).toHaveAttribute('href', '/config/arca/pedido.csr?empresa=default&ambiente=produccion')
    expect(enlace).toHaveAttribute('download', 'miempresaprod.csr')
    expect(abierto).toHaveTextContent('Administración de Certificados Digitales')
    expect(abierto).toHaveTextContent('miempresaprod')
    expect(abierto).toHaveTextContent('20000000001')
    expect(abierto).toHaveTextContent('wsfe')
    expect(abierto).toHaveTextContent(/No hace falta cargar ninguna clave privada/)
  })

  it('🔴 ni el diálogo ni la tarjeta contienen una clave privada', async () => {
    servidor()
    const { container } = render(<ArcaCard producto="Contalibra" razonSocial="Empresa Ficticia S.A." />)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Generar pedido' }))
    await screen.findByText('Pedido generado')

    expect(document.body.innerHTML).not.toMatch(/PRIVATE KEY/)
    expect(container.innerHTML).not.toMatch(/PRIVATE KEY/)
  })

  it('un error del motor se muestra tal cual en el diálogo y no lo cierra', async () => {
    servidor({ falla: {
      '/pedido?': () => json({ detail: 'El CUIT no es válido: el dígito verificador no cierra. Revisá que esté bien escrito.' }, 422),
    } })
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Generar pedido' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('el dígito verificador no cierra')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('Pedido generado')).toBeNull()
  })

  it('Cancelar cierra sin llamar al motor', async () => {
    const { pedidos } = servidor()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pedidos.filter((p) => p.metodo === 'POST')).toEqual([])
  })

  it('en homologación los pasos son los de WSASS y no los de producción', async () => {
    servidor({ pares: {
      homologacion: { ambiente: 'homologacion', ...PAR_VACIO },
      produccion: { ambiente: 'produccion', ...PAR_LLENO },
    } })
    render(<ArcaCard producto="Contalibra" razonSocial="Empresa Ficticia S.A." />)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Generar pedido de certificado — Homologación (pruebas)' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Generar pedido' }))

    const dialogo = await screen.findByRole('dialog')
    await within(dialogo).findByText('Pedido generado')
    expect(dialogo).toHaveTextContent('WSASS')
    expect(dialogo).toHaveTextContent('Crear autorización a servicio')
    expect(dialogo).not.toHaveTextContent('Administración de Certificados Digitales')
  })
})

describe('ARCA — con un pedido esperando el certificado', () => {
  const conPedido = () => servidor({ pares: {
    homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
    produccion: { ambiente: 'produccion', ...PAR_VACIO, pedido: PEDIDO },
  } })

  it('dice desde cuándo espera y no ofrece generar otro', async () => {
    conPedido()
    render(<ArcaCard producto="Contalibra" />)
    const grupo = await screen.findByRole('group', { name: 'Pedido de certificado — Producción' })

    expect(grupo).toHaveTextContent('Esperando el certificado de ARCA (pedido del 08-10-2026)')
    expect(grupo).toHaveTextContent('contalibrawsfeprod')
    expect(grupo).toHaveTextContent('CUIT 20000000001')
    expect(screen.queryByRole('button', { name: 'Generar pedido de certificado — Producción' })).toBeNull()
  })

  it('permite bajar de nuevo el .csr', async () => {
    conPedido()
    render(<ArcaCard producto="Contalibra" />)
    const grupo = await screen.findByRole('group', { name: 'Pedido de certificado — Producción' })
    const enlace = within(grupo).getByRole('link', { name: /Descargar el \.csr/ })
    expect(enlace).toHaveAttribute('href', '/config/arca/pedido.csr?empresa=default&ambiente=produccion')
    expect(enlace).toHaveAttribute('download', 'contalibrawsfeprod.csr')
  })

  it('🔴 no hay campo de clave: sólo se sube el .crt', async () => {
    const { pedidos } = conPedido()
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByRole('group', { name: 'Pedido de certificado — Producción' })

    expect(screen.queryByLabelText('Clave privada (.key) — Producción')).toBeNull()
    const usuario = userEvent.setup()
    await usuario.upload(screen.getByLabelText('Certificado (.crt) — Producción'), new File(['x'], 'real.crt'))
    await waitFor(() => expect(pedidos.some((p) => p.metodo === 'POST' && p.url.includes('/config/arca/certificado'))).toBe(true))
    expect(pedidos.some((p) => p.url.includes('/config/arca/clave'))).toBe(false)
  })

  it('los pasos se pueden volver a ver', async () => {
    conPedido()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Ver los pasos para ARCA — Producción' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('Pasos para ARCA')
    expect(dialogo).toHaveTextContent('contalibrawsfeprod')
    expect(dialogo).toHaveTextContent('Administrador de Relaciones de Clave Fiscal')
  })

  it('🔴 descartar pide confirmación, avisa que se pierde la clave, y recién ahí llama al motor', async () => {
    const { pedidos } = conPedido()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: 'Descartar el pedido — Producción' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('su clave privada')
    expect(dialogo).toHaveTextContent(/el certificado que devuelva no va a servir/)
    expect(pedidos.filter((p) => p.metodo === 'DELETE')).toEqual([])

    await usuario.click(within(dialogo).getByRole('button', { name: 'Descartar el pedido' }))
    await waitFor(() => {
      const borrado = pedidos.find((p) => p.metodo === 'DELETE')
      expect(borrado?.url).toBe('/config/arca/pedido?empresa=default&ambiente=produccion')
    })
    // Sin pedido, vuelve el botón de generar.
    expect(await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Pedido de certificado — Producción' })).toBeNull()
  })

  it('cancelar el descarte no toca nada', async () => {
    const { pedidos } = conPedido()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Descartar el pedido — Producción' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(pedidos.filter((p) => p.metodo === 'DELETE')).toEqual([])
    expect(screen.getByRole('group', { name: 'Pedido de certificado — Producción' })).toBeInTheDocument()
  })

  it('un error al descartar se muestra y el pedido sigue', async () => {
    servidor({
      pares: {
        homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
        produccion: { ambiente: 'produccion', ...PAR_VACIO, pedido: PEDIDO },
      },
      falla: { '/pedido?': () => json({ detail: 'No hay un pedido de certificado pendiente para produccion.' }, 404) },
    })
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Descartar el pedido — Producción' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Descartar el pedido' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No hay un pedido de certificado pendiente')
  })
})

describe('ARCA — el pedido de un servicio que no es la facturación', () => {
  it('🔴 va a las rutas del servicio y dice a cuál: alias y ruta de wscpe', async () => {
    const { pedidos } = servidor({ conCpe: true })
    render(<ArcaCard producto="LibraCargo" razonSocial="Empresa Ficticia S.A." />)
    const usuario = userEvent.setup()

    const boton = await screen.findByRole('button', {
      name: 'Generar pedido de certificado — CTG y Carta de Porte — Producción',
    })
    await usuario.click(boton)
    const dialogo = await screen.findByRole('dialog', { name: /CTG y Carta de Porte/ })
    expect(within(dialogo).getByLabelText('Alias')).toHaveValue('libracargowscpeprod')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Generar pedido' }))

    await screen.findByText('Pedido generado')
    const post = pedidos.find((p) => p.metodo === 'POST' && p.url.includes('/pedido'))!
    expect(post.url).toBe('/config/arca/servicios/wscpe/pedido?empresa=default&ambiente=produccion')
    expect(post.cuerpo).toMatchObject({ alias: 'libracargowscpeprod' })
    expect(screen.getByRole('dialog')).toHaveTextContent('wscpe (Carta de Porte Electrónica)')
    const enlace = within(screen.getByRole('dialog')).getByRole('link', { name: /Descargar el \.csr/ })
    expect(enlace).toHaveAttribute('href', '/config/arca/servicios/wscpe/pedido.csr?empresa=default&ambiente=produccion')
  })

  it('el pedido pendiente del servicio muestra su estado en SU bloque y la facturación no se entera', async () => {
    servidor({
      conCpe: true,
      pares: {
        homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
        produccion: { ambiente: 'produccion', ...PAR_LLENO },
      },
      paresCpe: {
        homologacion: { ambiente: 'homologacion', ...PAR_VACIO },
        produccion: { ambiente: 'produccion', ...PAR_VACIO, pedido: { ...PEDIDO, servicio: 'wscpe', alias: 'libracargowscpeprod' } },
      },
    })
    render(<ArcaCard producto="LibraCargo" />)
    const grupo = await screen.findByRole('group', { name: 'Pedido de certificado — CTG y Carta de Porte — Producción' })
    expect(grupo).toHaveTextContent('libracargowscpeprod')
    expect(screen.queryByRole('group', { name: /Facturación electrónica/ })).toBeNull()
    expect(screen.queryByLabelText(/Clave privada.*CTG y Carta de Porte.*Producción/)).toBeNull()
    // El campo de clave de la otra tarjeta no se vio afectado.
    expect(screen.getByLabelText(/Clave privada.*Facturación electrónica.*Producción/)).toBeInTheDocument()
  })
})

describe('ARCA — el tutorial acompaña al botón', () => {
  it('con el pedido disponible, lo primero que cuenta es el botón; sin él, es el de siempre', async () => {
    servidor()
    const con = render(<ArcaCard producto="Contalibra" />)
    await screen.findByRole('button', { name: 'Generar pedido de certificado — Producción' })
    expect(con.container.textContent).toContain('Generar el pedido desde esta pantalla')
    expect(con.container.textContent).toContain('Alternativa — Generar la clave privada y el CSR a mano')
    con.unmount()

    servidor({ admitePedido: false })
    const sin = render(<ArcaCard producto="Contalibra" />)
    await sin.findByLabelText(/^CUIT$/)
    await waitFor(() => expect(sin.container.textContent).toContain('1 — Generar la clave privada y el CSR (en tu PC)'))
    expect(sin.container.textContent).not.toContain('Generar el pedido desde esta pantalla')
  })
})

describe('arca-pares — el pedido de certificado', () => {
  const par = (over: Partial<ParDeArca>): ParDeArca => ({
    ambiente: 'produccion', tiene_certificado: true, tiene_clave: true, completo: true, ...over,
  })

  it('aliasSugerido: producto + servicio + ambiente, sólo letras y números', () => {
    expect(aliasSugerido('LibraCargo', 'wscpe', 'produccion')).toBe('libracargowscpeprod')
    expect(aliasSugerido('LibraCargo', 'wscpe', 'homologacion')).toBe('libracargowscpehomo')
    expect(aliasSugerido('Gestión & Cía. S.A.', 'wsfe', 'produccion')).toBe('gestionciasawsfeprod')
    expect(aliasSugerido('Libra Desk', 'wsfe', 'homologacion')).toBe('libradeskwsfehomo')
  })

  it('aliasSugerido: nunca pasa de 40 y deja intacto el servicio y el ambiente', () => {
    const largo = aliasSugerido('Una Empresa Con Un Nombre Larguísimo Para Probar El Tope', 'wscpe', 'produccion')
    expect(largo.length).toBeLessThanOrEqual(40)
    expect(largo.endsWith('wscpeprod')).toBe(true)
    expect(largo).toMatch(/^[a-z0-9]+$/)
  })

  it('puedePedirCertificado: sin par, a medias, vencido o por vencer sí; vigente o con pedido no', () => {
    expect(puedePedirCertificado(par({ tiene_certificado: false, tiene_clave: false, completo: false }))).toBe(true)
    expect(puedePedirCertificado(par({ tiene_clave: false, completo: false }))).toBe(true)
    expect(puedePedirCertificado(par({ vencido: true, dias_para_vencer: -1 }))).toBe(true)
    expect(puedePedirCertificado(par({ vencido: false, dias_para_vencer: 30 }))).toBe(true)
    expect(puedePedirCertificado(par({ vencido: false, dias_para_vencer: 31 }))).toBe(false)
    expect(puedePedirCertificado(par({}))).toBe(false)
    expect(puedePedirCertificado(par({ completo: false, pedido: PEDIDO as ParDeArca['pedido'] }))).toBe(false)
  })

  it('pasosParaArca: cada ambiente su trámite, con el CUIT y el alias de ese pedido', () => {
    const prod = pasosParaArca({ ambiente: 'produccion', servicio: 'wsfe', alias: 'miaprod', cuit: '20000000001' })
    expect(prod).toHaveLength(5)
    expect(prod.join('\n')).toContain('Administración de Certificados Digitales')
    expect(prod.join('\n')).toContain('Administrador de Relaciones de Clave Fiscal')
    expect(prod.join('\n')).toContain('computador fiscal, el alias miaprod')
    expect(prod.join('\n')).toContain('wsfe (Facturación electrónica)')
    expect(prod.join('\n')).not.toContain('WSASS')

    const homo = pasosParaArca({ ambiente: 'homologacion', servicio: 'wscpe', alias: 'miahomo', cuit: '20000000001' })
    expect(homo).toHaveLength(5)
    expect(homo.join('\n')).toContain('WSASS')
    expect(homo.join('\n')).toContain('Crear autorización a servicio')
    expect(homo.join('\n')).toContain('wscpe (Carta de Porte Electrónica)')
    expect(homo.join('\n')).not.toContain('Administración de Certificados Digitales')
    for (const paso of [...prod, ...homo]) expect(paso).not.toMatch(/PRIVATE KEY/)
  })

  it('pasosParaArca: un servicio que no conoce lo nombra tal cual', () => {
    expect(pasosParaArca({ ambiente: 'produccion', servicio: 'wsnuevo', alias: 'a1b', cuit: '1' }).join(' '))
      .toContain('servicio wsnuevo')
  })
})

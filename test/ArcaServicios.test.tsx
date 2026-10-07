/** La tarjeta de ARCA con más de un servicio (libracore ADR-032).
 *
 *  🔴 **Lo que esta pantalla tiene que hacer imposible**, en este orden:
 *
 *  1. Que los productos que facturan y nada más vean **otra cosa**. Con la facturación sola
 *     —el backend no tiene `/servicios`, o lista un único servicio— la tarjeta es la de
 *     siempre: el snapshot de abajo se generó contra el código *anterior* a este cambio.
 *  2. Que un certificado de un servicio caiga en **otro servicio o en otro ambiente**. Hay dos
 *     «Certificado (.crt) — Producción» en pantalla; cada subida tiene que decir a cuál va.
 *  3. Que «Probar» diga «OK» de un par que ya no está, o que oculte por qué ARCA lo rechazó.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ArcaCard } from '../src/configuracion/arca'
import { serviciosValidos } from '../src/configuracion/arca-pares'

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

const CONFIG = {
  empresa: 'default', cuit: '20111111119', punto_venta: 3, ambiente: 'homologacion', alias: '',
  certificado_path: '', clave_path: '', tiene_certificado: false, tiene_clave: false,
  pares: {
    homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
    produccion: { ambiente: 'produccion', ...PAR_VACIO },
  },
}

const FACTURACION = {
  servicio: 'wsfe', etiqueta: 'Facturación electrónica', ayuda: '', empresa: 'default',
  configurado: true,
  pares: {
    homologacion: { ambiente: 'homologacion', ...PAR_LLENO, cuit_certificado: '20111111119' },
    produccion: { ambiente: 'produccion', ...PAR_VACIO },
  },
}

function wscpe(over: Record<string, unknown> = {}) {
  return {
    servicio: 'wscpe', etiqueta: 'CTG y Carta de Porte',
    ayuda: 'El certificado puede estar a nombre de la persona que representa a la empresa.',
    empresa: 'default', configurado: true,
    pares: {
      homologacion: {
        ambiente: 'homologacion', ...PAR_LLENO, cuit_certificado: '20000000001',
        sujeto: 'serialNumber=CUIT 20000000001,CN=alias',
      },
      produccion: { ambiente: 'produccion', ...PAR_VACIO },
    },
    ...over,
  }
}

type Pedido = { url: string; metodo: string }
let pedidos: Pedido[] = []

/** El backend de juguete. `servicios` es lo que contesta `GET /servicios`; `null` simula un
 *  LibraCore sin esa ruta (404). `respuestas` pisa la respuesta de una ruta por fragmento. */
function servir(servicios: unknown, respuestas: Record<string, () => Response> = {}) {
  pedidos = []
  vi.stubGlobal('fetch', vi.fn((url: unknown, opciones?: RequestInit) => {
    const u = String(url)
    const metodo = opciones?.method ?? 'GET'
    pedidos.push({ url: u, metodo })
    for (const [fragmento, responder] of Object.entries(respuestas)) {
      if (u.includes(fragmento)) return Promise.resolve(responder())
    }
    if (u.includes('/servicios') && metodo === 'GET') {
      return Promise.resolve(servicios === null ? json({ detail: 'Not Found' }, 404) : json(servicios))
    }
    if (u.includes('/estado')) {
      return Promise.resolve(json({
        configurado: true, ambiente: 'homologacion', cuit: CONFIG.cuit,
        tiene_certificado: false, tiene_clave: false, pares: CONFIG.pares,
      }))
    }
    return Promise.resolve(json(CONFIG))
  }))
}

function esperar(fragmento: string, metodo: string) {
  return waitFor(() => {
    const hallado = pedidos.find((p) => p.url.includes(fragmento) && p.metodo === metodo)
    expect(hallado, `no se pidió ${metodo} ${fragmento}`).toBeTruthy()
    return hallado!
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('ARCA — con la facturación sola, la tarjeta es la de siempre', () => {
  it('🔴 el HTML es el mismo que antes de existir los servicios (snapshot del código anterior)', async () => {
    // El snapshot se generó con `arca.tsx` de c4b288b —sin `/servicios`—. Si esto se pone
    // rojo, un producto que sólo factura está viendo otra pantalla.
    servir(null)
    const { container } = render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('un backend que lista SÓLO la facturación se ve idéntico al que no tiene la ruta', async () => {
    servir(null)
    const sin = render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    const htmlSin = sin.container.innerHTML
    sin.unmount()

    servir([FACTURACION])
    const con = render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    await waitFor(() => expect(pedidos.some((p) => p.url.endsWith('/servicios'))).toBe(true))
    expect(con.container.innerHTML).toBe(htmlSin)
  })

  it('el título y los campos conservan sus nombres de siempre', async () => {
    servir([FACTURACION])
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    expect(screen.getByText('ARCA (facturación electrónica)')).toBeInTheDocument()
    // Sin el servicio en el nombre: con uno solo no hace falta.
    expect(screen.getByLabelText('Certificado (.crt) — Producción')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('una respuesta que no es una lista (un backend raro) tampoco cambia nada', async () => {
    servir({ detalle: 'otra cosa' })
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    expect(screen.getByText('ARCA (facturación electrónica)')).toBeInTheDocument()
  })

  it('serviciosValidos descarta lo que no tiene forma de servicio', () => {
    expect(serviciosValidos(null)).toEqual([])
    expect(serviciosValidos({})).toEqual([])
    expect(serviciosValidos([{ servicio: 'x' }, null, 3, FACTURACION])).toEqual([FACTURACION])
  })
})

describe('ARCA — con más de un servicio, un bloque por servicio', () => {
  it('pinta la facturación y el CTG, cada uno en su región', async () => {
    servir([FACTURACION, wscpe()])
    render(<ArcaCard producto="LibraCargo" />)

    const cpe = await screen.findByRole('region', { name: 'CTG y Carta de Porte' })
    expect(screen.getByRole('region', { name: 'Facturación electrónica' })).toBeInTheDocument()
    expect(screen.getByText('ARCA')).toBeInTheDocument()
    expect(screen.queryByText('ARCA (facturación electrónica)')).toBeNull()
    // El formulario de facturación sigue estando, una sola vez.
    expect(screen.getAllByLabelText(/^CUIT$/)).toHaveLength(1)
    expect(within(cpe).queryByLabelText(/^CUIT$/)).toBeNull()
  })

  it('el bloque del CTG dice de quién es el certificado y hasta cuándo', async () => {
    servir([FACTURACION, wscpe()])
    render(<ArcaCard producto="LibraCargo" />)

    const homo = await screen.findByRole('region', { name: /Credenciales de Homologación.*CTG y Carta de Porte/ })
    expect(homo).toHaveTextContent('CUIT del certificado: 20000000001')
    expect(homo).toHaveTextContent('Válido hasta el 01-08-2028')
    const prod = screen.getByRole('region', { name: /Credenciales de Producción.*CTG y Carta de Porte/ })
    expect(prod).toHaveTextContent('Sin cargar')
  })

  it('muestra la ayuda sobre la persona que representa a la empresa', async () => {
    servir([FACTURACION, wscpe()])
    render(<ArcaCard producto="LibraCargo" />)
    expect(await screen.findByText(/a nombre de la persona que representa a la empresa/)).toBeInTheDocument()
  })

  it('y si el motor no manda la ayuda, la pone el kit', async () => {
    servir([FACTURACION, wscpe({ ayuda: '' })])
    render(<ArcaCard producto="LibraCargo" />)
    expect(await screen.findByText(/a nombre de la persona que representa a la empresa/)).toBeInTheDocument()
  })

  it('🔴 un certificado vencido se dice, y con la fecha', async () => {
    servir([FACTURACION, wscpe({
      pares: {
        homologacion: {
          ambiente: 'homologacion', ...PAR_LLENO, vencido: true, vence: '01-01-2026',
          dias_para_vencer: -280, cuit_certificado: '20000000001',
        },
        produccion: { ambiente: 'produccion', ...PAR_VACIO },
      },
    })])
    render(<ArcaCard producto="LibraCargo" />)
    const homo = await screen.findByRole('region', { name: /Credenciales de Homologación.*CTG/ })
    expect(homo).toHaveTextContent('Vencido el 01-01-2026')
  })

  it('un par a medias dice cuál mitad falta', async () => {
    servir([FACTURACION, wscpe({
      pares: {
        homologacion: { ambiente: 'homologacion', tiene_certificado: true, tiene_clave: false, completo: false },
        produccion: { ambiente: 'produccion', ...PAR_VACIO },
      },
    })])
    render(<ArcaCard producto="LibraCargo" />)
    const homo = await screen.findByRole('region', { name: /Credenciales de Homologación.*CTG/ })
    expect(homo).toHaveTextContent('Falta la clave privada')
    // y «Probar» no se ofrece sobre un par incompleto
    expect(within(homo).queryByRole('button', { name: /Probar/ })).toBeNull()
  })

  it('🔴 cada subida dice a qué servicio y a qué ambiente va', async () => {
    servir([FACTURACION, wscpe()])
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Certificado.*CTG y Carta de Porte.*Producción/),
      new File(['x'], 'real.crt'),
    )
    const cert = await esperar('/config/arca/servicios/wscpe/certificado', 'POST')
    expect(cert.url).toContain('ambiente=produccion')
    expect(cert.url).toContain('empresa=default')

    await usuario.upload(
      screen.getByLabelText(/Clave privada.*CTG y Carta de Porte.*Homologación/),
      new File(['x'], 'prueba.key'),
    )
    const clave = await esperar('/config/arca/servicios/wscpe/clave', 'POST')
    expect(clave.url).toContain('ambiente=homologacion')
  })

  it('y subir a la facturación sigue yendo a las rutas de siempre, no a /servicios', async () => {
    servir([FACTURACION, wscpe()])
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Certificado.*Facturación electrónica.*Producción/),
      new File(['x'], 'real.crt'),
    )
    const p = await esperar('/config/arca/certificado', 'POST')
    expect(p.url).not.toContain('/servicios')
    expect(p.url).toContain('ambiente=produccion')
  })

  it('quitar el par del CTG nombra el ambiente y no toca la facturación', async () => {
    servir([FACTURACION, wscpe()])
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    const homo = await screen.findByRole('region', { name: /Credenciales de Homologación.*CTG/ })
    await usuario.click(within(homo).getByRole('button', { name: /Quitar el par de homologaci/i }))

    const p = await esperar('/config/arca/servicios/wscpe/credenciales', 'DELETE')
    expect(p.url).toContain('ambiente=homologacion')
    expect(pedidos.some((x) => x.metodo === 'DELETE' && x.url.includes('/config/arca/credenciales'))).toBe(false)
  })

  it('después de subir se vuelve a pedir la lista de servicios', async () => {
    servir([FACTURACION, wscpe()])
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()
    await usuario.upload(
      await screen.findByLabelText(/Certificado.*CTG y Carta de Porte.*Producción/),
      new File(['x'], 'real.crt'),
    )
    await esperar('/servicios/wscpe/certificado', 'POST')
    await waitFor(() => {
      const listas = pedidos.filter((p) => p.metodo === 'GET' && /\/servicios$/.test(p.url))
      expect(listas.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('un error al subir se muestra y no tumba la tarjeta', async () => {
    servir([FACTURACION, wscpe()], {
      '/servicios/wscpe/certificado': () => json({ detail: 'El certificado no parece un certificado PEM.' }, 422),
    })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()
    await usuario.upload(
      await screen.findByLabelText(/Certificado.*CTG y Carta de Porte.*Producción/),
      new File(['x'], 'mal.crt'),
    )
    expect(await screen.findByText(/no parece un certificado PEM/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'CTG y Carta de Porte' })).toBeInTheDocument()
  })
})

describe('ARCA — «Probar» de un servicio', () => {
  it('autentica en el ambiente de ESE bloque y muestra el mensaje del motor', async () => {
    servir([FACTURACION, wscpe()], {
      '/servicios/wscpe/probar': () => json({
        ok: true, servicio: 'wscpe', ambiente: 'homologacion',
        mensaje: 'Autenticado con ARCA para CTG y Carta de Porte (homologacion).',
      }),
    })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', {
      name: /Probar conexión — CTG y Carta de Porte — Homologación/,
    }))
    const p = await esperar('/config/arca/servicios/wscpe/probar', 'POST')
    expect(p.url).toContain('ambiente=homologacion')
    const homo = screen.getByRole('region', { name: /Credenciales de Homologación.*CTG/ })
    expect(await within(homo).findByRole('status')).toHaveTextContent('Autenticado con ARCA para CTG y Carta de Porte')
  })

  it('🔴 cuando ARCA lo rechaza, muestra la explicación en castellano y el texto de ARCA', async () => {
    const detail = 'ARCA rechazó la autenticación: El certificado no está autorizado para este servicio: '
      + 'asociá el servicio en el Administrador de Relaciones de ARCA al alias del certificado. '
      + '(ARCA dijo: WSAA error [ns1:coe.notAuthorized]: Computador no autorizado a acceder al servicio)'
    servir([FACTURACION, wscpe()], {
      '/servicios/wscpe/probar': () => json({ detail }, 502),
    })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Probar conexión — CTG.*Homologación/ }))
    const homo = screen.getByRole('region', { name: /Credenciales de Homologación.*CTG/ })
    const alerta = await within(homo).findByRole('alert')
    expect(alerta).toHaveTextContent('Administrador de Relaciones')
    expect(alerta).toHaveTextContent('Computador no autorizado a acceder al servicio')
    // Es un BLOQUE: el texto de ARCA es de largo arbitrario.
    expect(alerta.className.split(/\s+/)).toContain('w-full')
  })

  it('🔑 subir otro certificado en ese ambiente borra el «OK» anterior', async () => {
    // Un «Autenticado» de un par que ya no es el que está cargado sería la mentira que
    // esta pantalla existe para evitar.
    servir([FACTURACION, wscpe()], {
      '/servicios/wscpe/probar': () => json({ ok: true, mensaje: 'Autenticado con ARCA.' }),
    })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Probar conexión — CTG.*Homologación/ }))
    expect(await screen.findByText('Autenticado con ARCA.')).toBeInTheDocument()

    await usuario.upload(
      screen.getByLabelText(/Clave privada.*CTG y Carta de Porte.*Homologación/),
      new File(['x'], 'nueva.key'),
    )
    await esperar('/servicios/wscpe/clave', 'POST')
    await waitFor(() => expect(screen.queryByText('Autenticado con ARCA.')).toBeNull())
  })

  it('y subir en OTRO ambiente no borra el resultado de éste', async () => {
    servir([FACTURACION, wscpe()], {
      '/servicios/wscpe/probar': () => json({ ok: true, mensaje: 'Autenticado con ARCA.' }),
    })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Probar conexión — CTG.*Homologación/ }))
    expect(await screen.findByText('Autenticado con ARCA.')).toBeInTheDocument()
    await usuario.upload(
      screen.getByLabelText(/Certificado.*CTG y Carta de Porte.*Producción/),
      new File(['x'], 'real.crt'),
    )
    await esperar('/servicios/wscpe/certificado', 'POST')
    expect(screen.getByText('Autenticado con ARCA.')).toBeInTheDocument()
  })
})

/** Ver y descargar el QR de la caja.
 *
 * 🔴 Lo que estos tests cuidan no es "que aparezca un botón". Es que el cartel
 * que alguien va a **imprimir y pegar en el mostrador** sea el de la caja de
 * esta instancia y no el de otra, y que si es de una cuenta de prueba lo diga
 * antes de imprimirlo — porque un QR de prueba se ve idéntico a uno real y no
 * cobra nada.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MercadoPagoCard } from '../src/configuracion/mercadopago'

const MP = {
  mp_access_token: 'APP_…9f2a', mp_access_token_cargado: true,
  mp_webhook_secret: 'abcd…7788', mp_webhook_secret_cargado: true,
  mp_concepto_descripcion: 'Cobro', mp_iva_rate: '0',
  mp_user_id: '75023836', mp_pos_id: 'contadev',
  mp_auto_facturar_ventas: true,
  mp_ambiente: 'produccion', mp_ambiente_verificado: '2026-08-30 14:05:00',
}

const QR = {
  pos_id: 'CONTADEV',
  pos_nombre: 'Caja dev de contalibra',
  pos_numero: 137400058,
  ambiente: 'produccion',
  formatos: ['qr', 'cartel', 'pdf'],
}

let pedidos: string[] = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

/** 🔑 El orden de las ramas importa: `/mercadopago` matchea también
 *  `/mercadopago/qr`. Si la rama del QR no va PRIMERO, la pantalla recibe la
 *  configuración donde espera los datos de la caja y los tests pasarían
 *  midiendo otra cosa. */
function backend(qr: unknown = QR, estado = 200) {
  pedidos = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const u = String(url)
    pedidos.push(u)
    if (u.includes('/mercadopago/qr')) return Promise.resolve(json(qr, estado))
    if (u.includes('/mercadopago')) return Promise.resolve(json(MP))
    return Promise.resolve(json({}))
  }))
}

async function abrirElDialogo(cfg: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const u = String(url)
    pedidos.push(u)
    if (u.includes('/mercadopago/qr')) return Promise.resolve(json(QR))
    if (u.includes('/mercadopago')) return Promise.resolve(json({ ...MP, ...cfg }))
    return Promise.resolve(json({}))
  }))
  const usuario = userEvent.setup()
  render(<MercadoPagoCard />)
  await usuario.click(await screen.findByRole('button', { name: /ver qr de la caja/i }))
  return usuario
}

beforeEach(() => { pedidos = [] })

describe('el QR de la caja', () => {
  it('no se consulta hasta que alguien abre el diálogo', async () => {
    // 🔴 Cada apertura le cuesta al motor DOS llamadas a la API de
    // MercadoPago. Hacerlas al montar Configuración —en los ocho productos—
    // es pagarlas siempre para una pantalla que casi nunca se mira.
    backend()
    render(<MercadoPagoCard />)
    await screen.findByRole('button', { name: /ver qr de la caja/i })

    expect(pedidos.some((u) => u.includes('/mercadopago/qr'))).toBe(false)
  })

  it('cerrarlo tampoco lo consulta de nuevo', async () => {
    // 🔑 Este test nació de una mutación que SOBREVIVIÓ. `onOpenChange` dispara
    // en las dos direcciones, así que sin la salida temprana cerrar el diálogo
    // se lleva otras dos llamadas a la API de MercadoPago para no mostrar nada.
    // El test de arriba —"no se consulta hasta que alguien abre"— no lo cubría:
    // al montar nadie llama a `alCambiar`, así que pasa igual con el guard roto.
    const usuario = await abrirElDialogo()
    await screen.findByText('CONTADEV')
    const hastaAca = pedidos.filter((u) => u.includes('/mercadopago/qr')).length

    await usuario.click(screen.getByRole('button', { name: /^cerrar$/i }))

    expect(pedidos.filter((u) => u.includes('/mercadopago/qr')).length).toBe(hastaAca)
  })

  it('al abrirlo muestra la caja que ESTA instancia tiene configurada', async () => {
    await abrirElDialogo()

    expect(await screen.findByText(/Caja dev de contalibra/)).toBeInTheDocument()
    expect(pedidos.some((u) => u.endsWith('/api/config/mercadopago/qr'))).toBe(true)
  })

  it('🔑 muestra el nombre de caja de MercadoPago, no el que está tipeado', async () => {
    // El filtro de MercadoPago no distingue mayúsculas: la configuración dice
    // `contadev` y la caja se llama `CONTADEV`. Mostrar el texto tipeado haría
    // que una configuración mal escrita se viera idéntica a una bien escrita.
    await abrirElDialogo()

    expect(await screen.findByText('CONTADEV')).toBeInTheDocument()
    expect(screen.queryByText('contadev')).toBeNull()
  })

  it('la imagen y las descargas salen del motor, no de mercadopago.com', async () => {
    // 🔴 Las URLs de MercadoPago se sirven SIN autenticación: la URL *es* el
    // cartel. Que la imagen venga del motor es lo que impide que viaje al
    // navegador.
    await abrirElDialogo()

    const imagen = await screen.findByRole('img', { name: /código qr de la caja CONTADEV/i })
    expect(imagen).toHaveAttribute('src', '/api/config/mercadopago/qr/qr')

    const pdf = screen.getByRole('link', { name: /cartel para imprimir/i })
    expect(pdf).toHaveAttribute('href', '/api/config/mercadopago/qr/pdf')
    expect(pdf).toHaveAttribute('download')

    // ⚠️ Acotado AL DIÁLOGO a propósito. La primera versión miraba
    // `document.body` y fallaba: el tutorial de la misma tarjeta enlaza a
    // `mercadopago.com.ar/developers`, que es legítimo y no tiene nada que ver.
    // Medía otra cosa que la que decía medir.
    expect(screen.getByRole('dialog').innerHTML).not.toContain('mercadopago.com')
    expect(screen.getByRole('dialog').innerHTML).not.toContain('instore/merchant')
  })

  it('ofrece sólo los formatos que la caja tiene publicados', async () => {
    // El control positivo es el test de arriba, que encuentra los tres.
    // Ofrecer un formato ausente es un link que falla al hacerle clic.
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url)
      if (u.includes('/mercadopago/qr')) {
        return Promise.resolve(json({ ...QR, formatos: ['qr'] }))
      }
      if (u.includes('/mercadopago')) return Promise.resolve(json(MP))
      return Promise.resolve(json({}))
    }))
    const usuario = userEvent.setup()
    render(<MercadoPagoCard />)
    await usuario.click(await screen.findByRole('button', { name: /ver qr de la caja/i }))

    expect(await screen.findByRole('link', { name: /QR solo/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /cartel para imprimir/i })).toBeNull()
  })

  it('🔴 avisa antes de imprimir cuando el QR es de una cuenta de prueba', async () => {
    // El aviso va TAMBIÉN acá y no sólo en la tarjeta: sin decirlo en el
    // momento de imprimirlo, el error se descubre con el cartel ya pegado.
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url)
      if (u.includes('/mercadopago/qr')) {
        return Promise.resolve(json({ ...QR, ambiente: 'prueba' }))
      }
      if (u.includes('/mercadopago')) return Promise.resolve(json(MP))
      return Promise.resolve(json({}))
    }))
    const usuario = userEvent.setup()
    render(<MercadoPagoCard />)
    await usuario.click(await screen.findByRole('button', { name: /ver qr de la caja/i }))

    expect(await screen.findByText(/no lo imprimas para el mostrador/i)).toBeInTheDocument()
  })

  it('con una cuenta real NO aparece ese aviso', async () => {
    // El negativo del anterior. Sin este, un aviso que se muestre SIEMPRE
    // pasaría el test de arriba.
    await abrirElDialogo()

    await screen.findByText('CONTADEV')
    expect(screen.queryByText(/no lo imprimas para el mostrador/i)).toBeNull()
  })

  it('🔑 el error del motor se muestra tal cual, porque dice dónde arreglarlo', async () => {
    // "esa caja no está en esta cuenta" y "falta el POS ID" se arreglan en
    // lugares distintos. Un "no se pudo" pelado manda a buscar el error donde
    // no está.
    const detalle = 'La cuenta de este Access Token no tiene ninguna caja «CONTADEV».'
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url)
      if (u.includes('/mercadopago/qr')) return Promise.resolve(json({ detail: detalle }, 404))
      if (u.includes('/mercadopago')) return Promise.resolve(json(MP))
      return Promise.resolve(json({}))
    }))
    const usuario = userEvent.setup()
    render(<MercadoPagoCard />)
    await usuario.click(await screen.findByRole('button', { name: /ver qr de la caja/i }))

    expect(await screen.findByText(detalle)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /código qr/i })).toBeNull()
  })

  it('sin POS ID cargado no se ofrece el botón', async () => {
    // No hay caja de la que mostrar el cartel: un botón que sólo puede
    // devolver un error no es una función.
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url)
      if (u.includes('/mercadopago')) return Promise.resolve(json({ ...MP, mp_pos_id: '' }))
      return Promise.resolve(json({}))
    }))
    render(<MercadoPagoCard />)

    await screen.findByLabelText(/POS ID \(QR\)/)
    expect(screen.queryByRole('button', { name: /ver qr de la caja/i })).toBeNull()
  })

  it('🔑 sin User ID el botón SIGUE estando', async () => {
    // El `user_id` hace falta para *cobrar* —va en la URL de la orden—, pero
    // no para mostrar el cartel. Exigir los tres escondería el QR justo cuando
    // alguien está terminando de configurar la caja, que es cuando lo quiere
    // imprimir.
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url)
      if (u.includes('/mercadopago/qr')) return Promise.resolve(json(QR))
      if (u.includes('/mercadopago')) return Promise.resolve(json({ ...MP, mp_user_id: '' }))
      return Promise.resolve(json({}))
    }))
    render(<MercadoPagoCard />)

    expect(await screen.findByRole('button', { name: /ver qr de la caja/i })).toBeInTheDocument()
  })

  it('la ruta del QR sale del basePath del producto', async () => {
    // LibraClub monta este router en otro prefijo. Una ruta hardcodeada
    // funcionaría en cinco productos y fallaría en el sexto.
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url)
      pedidos.push(u)
      if (u.includes('/qr')) return Promise.resolve(json(QR))
      return Promise.resolve(json(MP))
    }))
    const usuario = userEvent.setup()
    render(<MercadoPagoCard basePath="/config/mercadopago" />)
    await usuario.click(await screen.findByRole('button', { name: /ver qr de la caja/i }))

    await waitFor(() => expect(pedidos).toContain('/config/mercadopago/qr'))
    const imagen = await screen.findByRole('img', { name: /código qr/i })
    expect(imagen).toHaveAttribute('src', '/config/mercadopago/qr/qr')
  })
})

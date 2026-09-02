/** La tarjeta de ARCA con los dos pares de credenciales.
 *
 *  🔴 **Lo que esta pantalla tiene que hacer imposible.** Hasta el 2026-09-01
 *  una instancia guardaba UN par, así que probar con el cliente obligaba a
 *  pisar el certificado real. Ahora conviven los dos — y el riesgo se mudó a la
 *  pantalla: si sube al ambiente equivocado, o si no deja ver qué hay cargado
 *  del otro lado, el daño es el mismo con más pasos.
 *
 *  Por eso lo que se prueba acá no es que "se vean dos bloques": es que **cada
 *  subida diga a qué ambiente va**, que el par que no está en uso se vea igual,
 *  y que la pantalla avise cuando el ambiente elegido no tiene con qué
 *  facturar.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ArcaCard } from '../src/configuracion/arca'
import { parDe } from '../src/configuracion/arca-pares'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  })
}

const PAR_LLENO = {
  tiene_certificado: true, tiene_clave: true, completo: true,
  vence: '01-08-2028', dias_para_vencer: 700, vencido: false,
}
const PAR_VACIO = { tiene_certificado: false, tiene_clave: false, completo: false }

function config(over: Record<string, unknown> = {}) {
  return {
    empresa: 'default', cuit: '20111111119', punto_venta: 3,
    ambiente: 'homologacion', alias: '',
    certificado_path: '', clave_path: '',
    tiene_certificado: false, tiene_clave: false,
    pares: {
      homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
      produccion: { ambiente: 'produccion', ...PAR_VACIO },
    },
    ...over,
  }
}

/** Registra cada pedido para poder afirmar CON QUÉ se llamó, no sólo que se llamó. */
let pedidos: { url: string; metodo: string }[] = []

function servir(cfg: Record<string, unknown>) {
  pedidos = []
  vi.stubGlobal('fetch', vi.fn((url: unknown, opciones?: RequestInit) => {
    const u = String(url)
    pedidos.push({ url: u, metodo: opciones?.method ?? 'GET' })
    if (u.includes('/estado')) {
      return Promise.resolve(json({
        configurado: Boolean((cfg.pares as Record<string, { completo: boolean }>)
          ?.[String(cfg.ambiente)]?.completo),
        ambiente: cfg.ambiente, cuit: cfg.cuit,
        tiene_certificado: false, tiene_clave: false,
        pares: cfg.pares,
      }))
    }
    return Promise.resolve(json(cfg))
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

describe('ARCA — los dos pares', () => {
  it('🔴 subir al par de producción manda ambiente=produccion, no el del selector', async () => {
    // El defecto de verdad: la instancia está parada en homologación, el
    // operador sube el certificado REAL, y sin el parámetro el backend lo
    // escribe en el par de homologación. Funciona en toda prueba donde los dos
    // coinciden, y falla exactamente el día del corte a facturación real.
    servir(config())
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Certificado.*Producci/),
      new File(['x'], 'real.crt', { type: 'application/x-x509-ca-cert' }),
    )

    const p = await esperar('/config/arca/certificado', 'POST')
    expect(p.url).toContain('ambiente=produccion')
  })

  it('y subir al de homologación manda ambiente=homologacion', async () => {
    // El control del anterior: sin esto, un componente que mandara siempre
    // "produccion" pasaría el test de arriba.
    servir(config())
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Clave privada.*Homologaci/),
      new File(['x'], 'prueba.key', { type: 'text/plain' }),
    )

    const p = await esperar('/config/arca/clave', 'POST')
    expect(p.url).toContain('ambiente=homologacion')
  })

  it('🔑 el par que NO está en uso se ve igual, con su vencimiento', async () => {
    // Es el dato que convierte el corte a producción en una decisión y no en un
    // salto: el operador está en homologación y tiene que poder ver que el par
    // real está cargado y hasta cuándo dura, sin mover el selector.
    servir(config({
      ambiente: 'homologacion',
      pares: {
        homologacion: { ambiente: 'homologacion', ...PAR_VACIO },
        produccion: { ambiente: 'produccion', ...PAR_LLENO },
      },
    }))
    render(<ArcaCard producto="Contalibra" />)

    const bloque = await screen.findByRole('region', { name: /Producción/ })
    expect(bloque).toHaveTextContent(/Válido hasta el 01-08-2028/)
  })

  it('🔴 avisa cuando el ambiente elegido no tiene el par completo', async () => {
    // El hueco que abre tener dos pares: con uno solo, "hay certificado" y
    // "puedo facturar" eran lo mismo. Ahora la pantalla puede mostrar
    // credenciales cargadas por todos lados y la facturación no anda.
    servir(config({
      ambiente: 'produccion',
      pares: {
        homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
        produccion: { ambiente: 'produccion', ...PAR_VACIO },
      },
    }))
    render(<ArcaCard producto="Contalibra" />)

    const aviso = await screen.findByText(/la facturación no va a funcionar/)
    expect(aviso).toBeInTheDocument()
    // 🔴 **Y como BLOQUE, no como pastilla.** Este aviso vivió dentro de un
    // `BadgeEstado`, que trae `whitespace-nowrap w-fit shrink-0`: una frase de
    // este largo no cortaba, no achicaba y se salía de la tarjeta. Medido en un
    // navegador: la pastilla ocupa 655px pase lo que pase, así que desborda
    // cualquier contenedor más angosto que eso. Lo reportó el humano el
    // 2026-09-02.
    //
    // `w-full` es lo que distingue a `AvisoEstado` acá: es la clase que el
    // aviso tiene y la pastilla no.
    expect(aviso.className.split(/\s+/)).toContain('w-full')
  })

  it('🔴 el aviso del certificado ilegible también es un bloque', async () => {
    // Es el peor de los cuatro avisos para meter en una pastilla: interpola el
    // mensaje de ARCA, o sea texto de largo **arbitrario**. Con la frase fija
    // uno puede convencerse de que "entra"; con esta, no hay ancho que alcance.
    //
    // Va aparte del aviso del selector a propósito: son dos componentes
    // distintos, y arreglar uno no arregla el otro. Se probó — mutar sólo uno
    // dejaba al otro en verde.
    servir(config({
      pares: {
        homologacion: {
          ambiente: 'homologacion', ...PAR_VACIO, tiene_certificado: true,
          error_certificado:
            'no parece un certificado PEM. Tiene que ser el .crt que devuelve '
            + 'ARCA, no el .csr que se le manda al organismo para pedirlo.',
        },
        produccion: { ambiente: 'produccion', ...PAR_VACIO },
      },
    }))
    render(<ArcaCard producto="Contalibra" />)

    const aviso = await screen.findByText(/no parece un certificado PEM/)
    expect(aviso.className.split(/\s+/)).toContain('w-full')
  })

  it('y NO avisa cuando el par del ambiente elegido está completo', async () => {
    // El control positivo: un aviso que se muestra siempre no informa nada.
    servir(config())
    render(<ArcaCard producto="Contalibra" />)

    await screen.findByLabelText(/^CUIT$/)
    expect(screen.queryByText(/la facturación no va a funcionar/)).toBeNull()
  })

  it('dice CUÁL mitad falta, no "incompleto"', async () => {
    servir(config({
      pares: {
        homologacion: {
          ambiente: 'homologacion',
          tiene_certificado: true, tiene_clave: false, completo: false,
        },
        produccion: { ambiente: 'produccion', ...PAR_VACIO },
      },
    }))
    render(<ArcaCard producto="Contalibra" />)

    const bloque = await screen.findByRole('region', { name: /Homologación/ })
    expect(bloque).toHaveTextContent(/Falta la clave privada/)
  })

  it('quitar un par nombra el ambiente y sólo pide ese', async () => {
    servir(config({
      pares: {
        homologacion: { ambiente: 'homologacion', ...PAR_LLENO },
        produccion: { ambiente: 'produccion', ...PAR_LLENO },
      },
    }))
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.click(
      await screen.findByRole('button', { name: /Quitar el par de homologaci/i }),
    )

    const p = await esperar('/config/arca/credenciales', 'DELETE')
    expect(p.url).toContain('ambiente=homologacion')
  })
})

describe('parDe — el respaldo para un backend viejo', () => {
  it('🔴 sin `pares`, el par del selector sale de los campos planos', () => {
    // Sin esto, una instancia con un LibraCore anterior a este cambio mostraría
    // los DOS ambientes vacíos — y el operador volvería a subir un certificado
    // que ya está, pisando el que funciona.
    const viejo = {
      empresa: 'default', cuit: '', punto_venta: 1, ambiente: 'produccion',
      alias: '', certificado_path: '/c.crt', clave_path: '/c.key',
      tiene_certificado: true, tiene_clave: true,
    }
    expect(parDe(viejo, 'produccion').completo).toBe(true)
  })

  it('y el OTRO ambiente queda vacío, no repetido', () => {
    // El control: si el respaldo devolviera lo mismo para los dos, la pantalla
    // diría que hay un par de homologación que no existe — y "Probar conexión"
    // fallaría sin que nada en pantalla lo anticipe.
    const viejo = {
      empresa: 'default', cuit: '', punto_venta: 1, ambiente: 'produccion',
      alias: '', certificado_path: '/c.crt', clave_path: '/c.key',
      tiene_certificado: true, tiene_clave: true,
    }
    expect(parDe(viejo, 'homologacion').completo).toBe(false)
  })

  it('lo que informa el backend gana sobre el respaldo', () => {
    const nuevo = {
      empresa: 'default', cuit: '', punto_venta: 1, ambiente: 'produccion',
      alias: '', certificado_path: '/c.crt', clave_path: '/c.key',
      tiene_certificado: true, tiene_clave: true,
      pares: {
        produccion: {
          ambiente: 'produccion',
          tiene_certificado: false, tiene_clave: false, completo: false,
        },
      },
    }
    expect(parDe(nuevo, 'produccion').completo).toBe(false)
  })
})

/** La tarjeta de ARCA en pestañas (ADR-047, 0.135.0).
 *
 *  Pedido del dueño: Configuración → Integraciones → ARCA / AFIP tenía todo apilado —la facturación, los dos pares de
 *  certificados, y debajo el bloque de cada otro servicio—. Se reordenó en pestañas: General (los datos), una por
 *  ambiente de la facturación y una por cada otro servicio (el CTG y la Carta de Porte son UN servicio, `wscpe`).
 *
 *  🔴 **Lo que esta pantalla tiene que hacer imposible**, en este orden:
 *
 *  1. Que al mover cosas de lugar se pierda un aviso: el del ambiente elegido sin par completo, el del ambiente en uso,
 *     el del vencimiento. Cada uno tiene su test acá o en `ArcaDosPares`.
 *  2. Que la pantalla afirme algo que todavía no pasó: «Facturando en Producción» y «En uso» hablan del ambiente
 *     GUARDADO; mover el selector sin guardar no los cambia.
 *  3. Que una etiqueta de estado diga «Cargado» de un par vencido, o que dependa sólo del color.
 *  4. Que cambiar de pestaña borre algo: lo tipeado sin guardar, o el resultado de «Probar».
 *  5. Que «atrás» no vuelva a la pestaña anterior, o que la tarjeta se rompa montada sin router.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ArcaCard } from '../src/configuracion/arca'
import { resumenDeLaFce } from '../src/configuracion/arca-fce'
import type { ParDeArca } from '../src/configuracion/arca-pares'
import { estadoDelAmbiente, estadoDelServicio, pestanaActual, pestanasDe } from '../src/configuracion/arca-pestanas'
import { abrirPestana } from './helpers-arca'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const LLENO = { tiene_certificado: true, tiene_clave: true, completo: true, vence: '01-08-2028', dias_para_vencer: 700, vencido: false }
const VACIO = { tiene_certificado: false, tiene_clave: false, completo: false }

type Pares = Record<string, Record<string, unknown>>

function pares(homologacion: Record<string, unknown>, produccion: Record<string, unknown>): Pares {
  return {
    homologacion: { ambiente: 'homologacion', ...homologacion },
    produccion: { ambiente: 'produccion', ...produccion },
  }
}

const CBU_1 = '2850590940090418135201'
const CBU_2 = '0110599520000001234567'

let escrituras: { url: string; metodo: string; body: BodyInit | null }[] = []

/** El backend de juguete. `config` pisa campos de la configuración; `servicios` es el listado (`null`: sin la ruta). */
function servir({ config = {}, servicios = null, probar }: {
  config?: Record<string, unknown>
  servicios?: unknown[] | null
  probar?: () => Response
} = {}) {
  escrituras = []
  const cfg = {
    empresa: 'default', cuit: '20111111119', punto_venta: 3, ambiente: 'homologacion', alias: '',
    certificado_path: '', clave_path: '', tiene_certificado: false, tiene_clave: false,
    pares: pares(LLENO, VACIO),
    ...config,
  }
  vi.stubGlobal('fetch', vi.fn((url: unknown, opciones?: RequestInit) => {
    const u = String(url)
    const metodo = opciones?.method ?? 'GET'
    if (metodo !== 'GET') escrituras.push({ url: u, metodo, body: opciones?.body ?? null })
    if (u.includes('/servicios/wscpe/probar')) {
      return Promise.resolve(probar ? probar() : json({ ok: true, mensaje: 'Autenticado con ARCA.' }))
    }
    if (u.includes('/servicios') && metodo === 'GET') {
      return Promise.resolve(servicios === null ? json({ detail: 'Not Found' }, 404) : json(servicios))
    }
    if (u.includes('/estado')) {
      return Promise.resolve(json({
        configurado: true, ambiente: cfg.ambiente, cuit: cfg.cuit, tiene_certificado: false, tiene_clave: false,
        pares: cfg.pares,
      }))
    }
    return Promise.resolve(json(metodo === 'GET' ? cfg : { ok: true }))
  }))
}

function wscpe(paresDelServicio: Pares) {
  return {
    servicio: 'wscpe', etiqueta: 'CTG y Carta de Porte', ayuda: '', empresa: 'default', configurado: true,
    pares: paresDelServicio,
  }
}
const FACTURACION = { servicio: 'wsfe', etiqueta: 'Facturación electrónica', ayuda: '', empresa: 'default', configurado: true, pares: {} }

/** Muestra la URL, para afirmar sobre ella. */
function Ubicacion() {
  const l = useLocation()
  const ir = useNavigate()
  return (
    <>
      <output data-testid="url">{l.pathname}{l.search}</output>
      <button type="button" onClick={() => void ir(-1)}>volver</button>
    </>
  )
}

const montarEn = (ruta: string, ui: ReactElement) =>
  render(<MemoryRouter initialEntries={[ruta]}>{ui}<Ubicacion /></MemoryRouter>)

const nombresDeLasPestanas = () => screen.getAllByRole('tab').map((t) => t.textContent ?? '')
const pestanaSeleccionada = () => screen.getByRole('tab', { selected: true })

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('ARCA en pestañas — cuáles hay', () => {
  it('con un solo servicio: General, Homologación y Producción, y abre en General', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)

    expect(nombresDeLasPestanas()).toHaveLength(3)
    expect(nombresDeLasPestanas()[0]).toBe('General')
    expect(nombresDeLasPestanas()[1]).toMatch(/^Homologación/)
    expect(nombresDeLasPestanas()[2]).toMatch(/^Producción/)
    expect(pestanaSeleccionada()).toHaveTextContent('General')
    // Mientras se mira General, los certificados no están en pantalla.
    expect(screen.queryByRole('region', { name: /Credenciales de/ })).toBeNull()
    // El título de siempre: con un solo servicio la tarjeta sigue diciendo de qué es.
    expect(screen.getByText('ARCA (facturación electrónica)')).toBeInTheDocument()
  })

  it('con dos servicios suma una pestaña con la etiqueta del servicio, y el título pasa a «ARCA»', async () => {
    servir({ servicios: [FACTURACION, wscpe(pares(LLENO, LLENO))] })
    render(<ArcaCard producto="LibraCargo" />)

    await screen.findByRole('tab', { name: /^CTG y Carta de Porte/ })
    const nombres = nombresDeLasPestanas()
    expect(nombres).toHaveLength(4)
    expect(nombres.map((n) => n.split(/Cargado|En uso|Sin cargar|Completo/)[0]))
      .toEqual(['General', 'Homologación', 'Producción', 'CTG y Carta de Porte'])
    expect(screen.getByText('ARCA')).toBeInTheDocument()
    expect(screen.queryByText('ARCA (facturación electrónica)')).toBeNull()
  })

  it('una pestaña por servicio, no una por ambiente de cada servicio (el CTG y la Carta de Porte son uno)', async () => {
    servir({ servicios: [FACTURACION, wscpe(pares(LLENO, LLENO))] })
    render(<ArcaCard producto="LibraCargo" />)
    await screen.findByRole('tab', { name: /^CTG y Carta de Porte/ })
    expect(screen.getAllByRole('tab', { name: /CTG/ })).toHaveLength(1)
    expect(screen.queryByRole('tab', { name: /Carta de Porte$/ })).toBeNull()
  })

  it('pestanasDe y pestanaActual: una URL con una pestaña que no existe cae en General', () => {
    const otros = [wscpe(pares(LLENO, LLENO))] as never[]
    expect(pestanasDe([])).toEqual(['general', 'homologacion', 'produccion'])
    expect(pestanasDe(otros)).toEqual(['general', 'homologacion', 'produccion', 'wscpe'])
    expect(pestanaActual('wscpe', otros)).toBe('wscpe')
    expect(pestanaActual('wscpe', [])).toBe('general')
    expect(pestanaActual('cualquier-cosa', otros)).toBe('general')
    expect(pestanaActual(null, otros)).toBe('general')
  })
})

describe('ARCA en pestañas — la etiqueta de estado de cada una', () => {
  const par = (over: Partial<ParDeArca>): ParDeArca => ({ ambiente: 'produccion', ...LLENO, ...over })

  it.each([
    ['en uso y completo', par({}), true, 'En uso', 'ok'],
    ['completo pero no es el que factura', par({}), false, 'Cargado', 'ok'],
    ['por vencer (12 días)', par({ dias_para_vencer: 12 }), true, 'Vence pronto', 'atencion'],
    ['justo en el umbral (30 días)', par({ dias_para_vencer: 30 }), false, 'Vence pronto', 'atencion'],
    ['a 31 días no avisa', par({ dias_para_vencer: 31 }), false, 'Cargado', 'ok'],
    ['vencido', par({ vencido: true, dias_para_vencer: -3 }), true, 'Vencido', 'negativo'],
    ['sin nada y no es el que factura', par({ ...VACIO }), false, 'Sin cargar', 'neutro'],
    ['sin nada y ES el que factura: lo mismo, pero en rojo', par({ ...VACIO }), true, 'Sin cargar', 'negativo'],
    ['a medias', par({ tiene_clave: false, completo: false }), false, 'Incompleto', 'atencion'],
    ['ilegible', par({ error_certificado: 'no parece un PEM' }), false, 'Con error', 'negativo'],
  ])('ambiente %s', (_caso, p, enUso, texto, tono) => {
    expect(estadoDelAmbiente(p, enUso)).toEqual({ texto, tono })
  })

  it('un par vencido nunca dice «Cargado» ni «En uso»', () => {
    for (const enUso of [true, false]) {
      expect(estadoDelAmbiente(par({ vencido: true }), enUso).texto).toBe('Vencido')
    }
  })

  it.each([
    ['los dos completos', pares(LLENO, LLENO), 'Completo', 'ok'],
    ['sólo homologación', pares(LLENO, VACIO), 'Falta producción', 'atencion'],
    ['sólo producción', pares(VACIO, LLENO), 'Falta homologación', 'atencion'],
    ['ninguno', pares(VACIO, VACIO), 'Sin cargar', 'neutro'],
    ['a medias, ninguno completo', pares({ ...VACIO, tiene_certificado: true }, VACIO), 'Incompleto', 'atencion'],
    ['uno vencido gana sobre «Falta»', pares({ ...LLENO, vencido: true }, VACIO), 'Vencido', 'negativo'],
    ['los dos completos y uno por vencer', pares(LLENO, { ...LLENO, dias_para_vencer: 5 }), 'Vence pronto', 'atencion'],
  ])('servicio con %s', (_caso, p, texto, tono) => {
    expect(estadoDelServicio(p as never)).toEqual({ texto, tono })
  })

  it('en pantalla: cada pestaña lo dice con TEXTO (el color sólo lo refuerza)', async () => {
    servir({
      servicios: [FACTURACION, wscpe(pares(LLENO, VACIO))],
      config: { pares: pares(LLENO, { ...LLENO, dias_para_vencer: 9, vence: '19-10-2026' }) },
    })
    render(<ArcaCard producto="LibraCargo" />)

    expect(await screen.findByRole('tab', { name: /^Homologación/ })).toHaveTextContent('En uso')
    expect(screen.getByRole('tab', { name: /^Producción/ })).toHaveTextContent('Vence pronto')
    expect(await screen.findByRole('tab', { name: /^CTG y Carta de Porte/ })).toHaveTextContent('Falta producción')
    // La etiqueta es una pastilla del kit, con su tono, y trae el texto adentro.
    const etiqueta = within(screen.getByRole('tab', { name: /^Producción/ })).getByText('Vence pronto')
    expect(etiqueta).toHaveAttribute('data-tono', 'atencion')
  })
})

describe('ARCA en pestañas — qué ambiente factura', () => {
  it('🔑 la pastilla del encabezado nombra el ambiente con que se factura, si tiene el par completo', async () => {
    servir({ config: { ambiente: 'produccion', pares: pares(VACIO, LLENO) } })
    render(<ArcaCard producto="Contalibra" />)
    expect(await screen.findByText('Facturando en Producción')).toBeInTheDocument()
  })

  it('y en homologación dice Homologación', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    expect(await screen.findByText('Facturando en Homologación')).toBeInTheDocument()
  })

  it('🔴 sin el par completo del ambiente elegido NO dice «Facturando» (sería la mentira de siempre)', async () => {
    servir({ config: { ambiente: 'produccion', pares: pares(LLENO, VACIO) } })
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    expect(screen.queryByText(/Facturando en/)).toBeNull()
    // y el aviso del selector, que no se perdió con las pestañas, sigue ahí
    expect(screen.getByText(/la facturación no va a funcionar/)).toBeInTheDocument()
  })

  it('🔴 mover el selector sin guardar no cambia lo que se factura HOY', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.selectOptions(await screen.findByLabelText('Ambiente para facturar'), 'produccion')

    // La pastilla y las pestañas siguen hablando del ambiente guardado...
    expect(screen.getByText('Facturando en Homologación')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Homologación/ })).toHaveTextContent('En uso')
    // ...y el aviso del selector habla del que se está ELIGIENDO (producción no tiene par).
    expect(screen.getByText(/El ambiente elegido es/)).toHaveTextContent('Producción')
  })

  it('la pestaña del ambiente en uso lo dice: «Con este certificado se factura hoy»', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await abrirPestana(usuario, /^Homologación/)
    expect(await screen.findByText('Con este certificado se factura hoy.')).toBeInTheDocument()
    expect(screen.queryByText(/No es el ambiente con que se factura/)).toBeNull()
  })

  it('y la del otro dice que no es el ambiente en uso, y cuál sí', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await abrirPestana(usuario, /^Producción/)
    const aviso = await screen.findByText(/No es el ambiente con que se factura/)
    expect(aviso).toHaveTextContent('hoy se factura en Homologación')
    expect(screen.queryByText('Con este certificado se factura hoy.')).toBeNull()
  })

  it('🔴 el ambiente en uso SIN par completo lo dice en su pestaña (no pierde el aviso del selector)', async () => {
    servir({ config: { ambiente: 'produccion', pares: pares(LLENO, VACIO) } })
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await abrirPestana(usuario, /^Producción/)
    const aviso = await screen.findByText(/todavía no tiene el par completo/)
    expect(aviso).toHaveTextContent('la facturación no va a funcionar')
    expect(aviso.className.split(/\s+/)).toContain('w-full')
    expect(screen.queryByText('Con este certificado se factura hoy.')).toBeNull()
    expect(screen.getByRole('tab', { name: /^Producción/ })).toHaveTextContent('Sin cargar')
  })

  it('el aviso del vencimiento sigue en General', async () => {
    servir()
    vi.stubGlobal('fetch', vi.fn((url: unknown) => {
      const u = String(url)
      if (u.includes('/estado')) {
        return Promise.resolve(json({
          configurado: true, ambiente: 'homologacion', cuit: '1', tiene_certificado: true, tiene_clave: true,
          vence: '10-10-2026', dias_para_vencer: 4, vencido: false,
        }))
      }
      if (u.includes('/servicios')) return Promise.resolve(json({ detail: 'Not Found' }, 404))
      return Promise.resolve(json({
        empresa: 'default', cuit: '1', punto_venta: 1, ambiente: 'homologacion', alias: '', certificado_path: '',
        clave_path: '', tiene_certificado: true, tiene_clave: true,
      }))
    }))
    render(<ArcaCard producto="Contalibra" />)
    expect(await screen.findByText(/El certificado vence el 10-10-2026 — quedan 4 días/)).toBeInTheDocument()
  })
})

describe('ARCA en pestañas — la factura de crédito MiPyME: resumen y «Editar cuentas»', () => {
  const FCE = {
    fce_cbus: [{ cbu: CBU_1, alias: 'suitrans.nacion', etiqueta: 'Banco Nación' }, { cbu: CBU_2, alias: '', etiqueta: '' }],
    fce_cbu: CBU_1, fce_transmision: 'SCA',
  }

  it('resume en una línea: cuántas cuentas, la predeterminada (por su nombre) y la modalidad', async () => {
    servir({ config: FCE })
    render(<ArcaCard producto="LibraCargo" />)
    expect(await screen.findByText('2 cuentas · predeterminada: Banco Nación · SCA')).toBeInTheDocument()
    // Cerrado: no hay campos de cuentas en pantalla.
    expect(screen.queryByLabelText('CBU 1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Editar cuentas' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('«Editar cuentas» despliega el editor de siempre, y «Cerrar cuentas» lo pliega sin perder lo tipeado', async () => {
    servir({ config: FCE })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: 'Editar cuentas' }))
    expect(screen.getByLabelText('CBU 1')).toHaveValue(CBU_1)
    expect(screen.getByLabelText('CBU 1 predeterminado')).toBeChecked()
    await usuario.clear(screen.getByLabelText('Nombre de la cuenta 1'))
    await usuario.type(screen.getByLabelText('Nombre de la cuenta 1'), 'Galicia')

    await usuario.click(screen.getByRole('button', { name: 'Cerrar cuentas' }))
    expect(screen.queryByLabelText('CBU 1')).toBeNull()
    // El resumen ya refleja lo editado (es lo que Guardar mandaría).
    expect(screen.getByText('2 cuentas · predeterminada: Galicia · SCA')).toBeInTheDocument()
  })

  it('cambiar de pestaña y volver no pierde lo tipeado ni lo guardado de las cuentas', async () => {
    servir({ config: FCE })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: 'Editar cuentas' }))
    await usuario.clear(screen.getByLabelText('Alias 1'))
    await usuario.type(screen.getByLabelText('Alias 1'), 'otro.alias')
    await abrirPestana(usuario, /^Producción/)
    await abrirPestana(usuario, /^General/)

    // Las pestañas se desmontan; el estado está arriba. El editor sigue abierto, con el dato intacto.
    expect(await screen.findByLabelText('Alias 1')).toHaveValue('otro.alias')
    expect(screen.getByRole('button', { name: 'Cerrar cuentas' })).toBeInTheDocument()
  })

  it('«Sin cargar» cuando no hay cuentas ni modalidad, y las demás combinaciones', () => {
    expect(resumenDeLaFce([], 0, '')).toBe('Sin cargar')
    expect(resumenDeLaFce([], 0, 'ADC')).toBe('Sin cuentas · ADC')
    expect(resumenDeLaFce([{ cbu: CBU_1, alias: '', etiqueta: '' }], 0, '')).toBe('1 cuenta · predeterminada: CBU …5201 · sin modalidad')
    expect(resumenDeLaFce([{ cbu: CBU_1, alias: 'Mi.Alias', etiqueta: ' ' }], 0, 'SCA'))
      .toBe('1 cuenta · predeterminada: mi.alias · SCA')
    expect(resumenDeLaFce([{ cbu: '', alias: '', etiqueta: '' }], 0, 'SCA')).toBe('1 cuenta · predeterminada: sin datos · SCA')
  })

  it('sin cuentas se muestra «Sin cargar» y el botón sigue ahí', async () => {
    servir({ config: { fce_cbus: [], fce_cbu: '', fce_transmision: '' } })
    render(<ArcaCard producto="LibraCargo" />)
    const fce = await screen.findByRole('group', { name: 'Factura de crédito electrónica MiPyME' })
    expect(within(fce).getByText('Sin cargar')).toBeInTheDocument()
    expect(within(fce).getByRole('button', { name: 'Editar cuentas' })).toBeInTheDocument()
  })

  it('🔴 un CBU mal escrito con el editor cerrado abre el editor para poder verlo, y no manda nada', async () => {
    servir({ config: { fce_cbus: [{ cbu: CBU_1.slice(0, 20), alias: '', etiqueta: '' }], fce_cbu: CBU_1.slice(0, 20), fce_transmision: 'SCA' } })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Guardar ARCA/ }))

    expect(await screen.findByText('CBU 1: El CBU tiene 22 dígitos (hay 20).')).toBeInTheDocument()
    expect(screen.getByLabelText('CBU 1')).toBeInTheDocument()
    expect(escrituras.filter((e) => e.metodo === 'PUT')).toEqual([])
  })

  it('con un motor que no conoce la lista, ni resumen ni botón', async () => {
    servir({ config: { fce_cbus: undefined } })
    // `fce_cbus` ausente (y no `undefined` serializado): el motor viejo no manda la clave.
    vi.stubGlobal('fetch', vi.fn((url: unknown) => {
      const u = String(url)
      if (u.includes('/estado')) return Promise.resolve(json({ configurado: false }))
      if (u.includes('/servicios')) return Promise.resolve(json({ detail: 'Not Found' }, 404))
      return Promise.resolve(json({
        empresa: 'default', cuit: '1', punto_venta: 1, ambiente: 'homologacion', alias: '', certificado_path: '',
        clave_path: '', tiene_certificado: false, tiene_clave: false,
      }))
    }))
    render(<ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    expect(screen.queryByRole('button', { name: 'Editar cuentas' })).toBeNull()
    expect(screen.queryByText(/Factura de crédito/)).toBeNull()
  })
})

describe('ARCA en pestañas — un servicio muestra sus dos ambientes', () => {
  it('🔴 los dos a la vez, cada uno con su par, y lado a lado en pantalla ancha / apilados en el celular', async () => {
    servir({ servicios: [FACTURACION, wscpe(pares({ ...LLENO, cuit_certificado: '20000000001' }, VACIO))] })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await abrirPestana(usuario, /^CTG y Carta de Porte/)
    const homo = await screen.findByRole('region', { name: /Credenciales de Homologación.*CTG y Carta de Porte/ })
    const prod = screen.getByRole('region', { name: /Credenciales de Producción.*CTG y Carta de Porte/ })
    expect(homo).toHaveTextContent('Válido hasta el 01-08-2028')
    expect(prod).toHaveTextContent('Sin cargar')
    // Cada uno con SU «Probar» (sólo el que tiene par completo) y sus campos.
    expect(within(homo).getByRole('button', { name: /Probar conexión — CTG y Carta de Porte — Homologación/ })).toBeInTheDocument()
    expect(within(prod).queryByRole('button', { name: /Probar/ })).toBeNull()
    expect(within(prod).getByLabelText(/Certificado.*Producción/)).toBeInTheDocument()

    // El mismo contenedor, en una grilla de una columna que pasa a dos en pantalla ancha.
    expect(homo.parentElement).toBe(prod.parentElement)
    const clases = homo.parentElement!.className.split(/\s+/)
    expect(clases).toContain('grid')
    expect(clases).toContain('xl:grid-cols-2')
    expect(clases.filter((c) => /^grid-cols-/.test(c))).toEqual([])
    // Y dentro de cada media columna el certificado y la clave se apilan (el `sm:` mide la pantalla, no la columna).
    expect(within(homo).getByLabelText(/Certificado.*Homologación/).closest('.sm\\:grid-cols-2')).toBeNull()
  })

  it('la pestaña de la facturación NO se apila de esa manera: certificado y clave van lado a lado desde `sm`', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await abrirPestana(usuario, /^Homologación/)
    const region = await screen.findByRole('region', { name: /Credenciales de Homologación/ })
    expect(region.querySelector('.sm\\:grid-cols-2')).not.toBeNull()
  })

  it('con dos servicios, las pestañas de ambiente de la facturación dicen de qué servicio son', async () => {
    servir({ servicios: [FACTURACION, wscpe(pares(LLENO, LLENO))] })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()
    await abrirPestana(usuario, /^Producción/)
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Facturación electrónica — Producción')
  })

  it('el resultado de «Probar» sobrevive a cambiar de pestaña', async () => {
    servir({ servicios: [FACTURACION, wscpe(pares(LLENO, VACIO))] })
    render(<ArcaCard producto="LibraCargo" />)
    const usuario = userEvent.setup()

    await abrirPestana(usuario, /^CTG y Carta de Porte/)
    await usuario.click(await screen.findByRole('button', { name: /Probar conexión — CTG.*Homologación/ }))
    expect(await screen.findByText('Autenticado con ARCA.')).toBeInTheDocument()

    await abrirPestana(usuario, /^General/)
    expect(screen.queryByText('Autenticado con ARCA.')).toBeNull()
    await abrirPestana(usuario, /^CTG y Carta de Porte/)
    expect(await screen.findByText('Autenticado con ARCA.')).toBeInTheDocument()
  })
})

describe('ARCA en pestañas — los mensajes aparecen donde se hizo la acción', () => {
  it('quitar un par avisa en la pestaña de ese ambiente y no en General', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await abrirPestana(usuario, /^Homologación/)
    await usuario.click(await screen.findByRole('button', { name: /Quitar el par de homologaci/i }))
    expect(await screen.findByText('Se quitó el par de homologación (pruebas).')).toBeInTheDocument()

    await abrirPestana(usuario, /^General/)
    expect(screen.queryByText(/Se quitó el par/)).toBeNull()
  })

  it('guardar avisa en General', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: /Guardar ARCA/ }))
    expect(await screen.findByText('Guardado.')).toBeInTheDocument()
  })

  it('un error de la carga inicial se ve en cualquier pestaña', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    montarEn('/configuracion?arca=produccion', <ArcaCard producto="Contalibra" />)
    expect(await screen.findByText(/Error de conexión/)).toBeInTheDocument()
  })
})

describe('ARCA en pestañas — la pestaña va en la URL (?arca=)', () => {
  it('elegir una pestaña la escribe en la URL y conserva el resto del query', async () => {
    servir()
    montarEn('/configuracion?seccion=integraciones&integracion=arca', <ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await abrirPestana(usuario, /^Producción/)
    const url = screen.getByTestId('url').textContent ?? ''
    expect(url).toContain('seccion=integraciones')
    expect(url).toContain('integracion=arca')
    expect(url).toContain('arca=produccion')
  })

  it('volver a General limpia el parámetro', async () => {
    servir()
    montarEn('/configuracion?arca=homologacion', <ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await abrirPestana(usuario, /^General/)
    expect(screen.getByTestId('url').textContent).not.toContain('arca=')
  })

  it('un enlace con ?arca=produccion abre esa pestaña', async () => {
    servir()
    montarEn('/configuracion?arca=produccion', <ArcaCard producto="Contalibra" />)
    expect(await screen.findByRole('region', { name: /Credenciales de Producción/ })).toBeInTheDocument()
    expect(pestanaSeleccionada()).toHaveTextContent('Producción')
  })

  it('un enlace al servicio abre su pestaña cuando llega el listado', async () => {
    servir({ servicios: [FACTURACION, wscpe(pares(LLENO, VACIO))] })
    montarEn('/configuracion?arca=wscpe', <ArcaCard producto="LibraCargo" />)
    expect(await screen.findByRole('region', { name: 'CTG y Carta de Porte' })).toBeInTheDocument()
    expect(pestanaSeleccionada()).toHaveTextContent('CTG y Carta de Porte')
  })

  it('un valor que no existe (o un servicio que ese producto no tiene) cae en General', async () => {
    servir()
    montarEn('/configuracion?arca=wscpe', <ArcaCard producto="Contalibra" />)
    await screen.findByLabelText(/^CUIT$/)
    expect(pestanaSeleccionada()).toHaveTextContent('General')
  })

  it('🔑 «atrás» vuelve a la pestaña anterior', async () => {
    servir()
    montarEn('/configuracion', <ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await abrirPestana(usuario, /^Producción/)
    await abrirPestana(usuario, /^Homologación/)
    expect(pestanaSeleccionada()).toHaveTextContent('Homologación')
    await usuario.click(screen.getByRole('button', { name: 'volver' }))
    await waitFor(() => expect(pestanaSeleccionada()).toHaveTextContent('Producción'))
    await usuario.click(screen.getByRole('button', { name: 'volver' }))
    await waitFor(() => expect(pestanaSeleccionada()).toHaveTextContent('General'))
  })

  it('montada SIN router (una pantalla propia de un producto) no se rompe: la pestaña es estado local', async () => {
    servir()
    render(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()
    await abrirPestana(usuario, /^Producción/)
    expect(pestanaSeleccionada()).toHaveTextContent('Producción')
  })
})

describe('🔴 el producto agrega contenido al pie de la pestaña de un servicio (alPieDeServicio)', () => {
  it('se ve sólo dentro de su pestaña: no en General ni en los ambientes de la facturación', async () => {
    // LibraCargo pone «Emitir Cartas de Porte reales» junto a los certificados del CTG y la Carta de Porte (pedido del dueño).
    servir({ servicios: [FACTURACION, wscpe(pares(LLENO, VACIO))] })
    const usuario = userEvent.setup()
    render(<ArcaCard producto="LibraCargo" alPieDeServicio={{ wscpe: <p>Emitir Cartas de Porte reales</p>, otro: <p>Nunca</p> }} />)

    await screen.findByRole('tab', { name: /^CTG y Carta de Porte/ })
    expect(screen.queryByText('Emitir Cartas de Porte reales')).toBeNull()
    await abrirPestana(usuario, /^Producción/)
    expect(screen.queryByText('Emitir Cartas de Porte reales')).toBeNull()
    await abrirPestana(usuario, /^CTG y Carta de Porte/)
    expect(await screen.findByText('Emitir Cartas de Porte reales')).toBeInTheDocument()
    // Un servicio que el producto no tiene no aparece por estar en el pie.
    expect(screen.queryByText('Nunca')).toBeNull()
  })

  it('sin la prop, la pestaña del servicio no tiene pie', async () => {
    servir({ servicios: [FACTURACION, wscpe(pares(LLENO, LLENO))] })
    const usuario = userEvent.setup()
    const { container } = render(<ArcaCard producto="LibraCargo" />)
    await abrirPestana(usuario, /^CTG y Carta de Porte/)
    await screen.findByRole('button', { name: /Probar conexión — CTG y Carta de Porte — Homologación/ })
    expect(container.querySelector('[data-al-pie-de]')).toBeNull()
  })
})

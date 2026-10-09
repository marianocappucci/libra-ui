/** ARCA — la factura de crédito electrónica MiPyME: las cuentas donde se cobra y la modalidad de transmisión.
 *
 *  El motor guardaba un CBU y `AvisoFce` le decía al usuario que lo cargara «en la configuración de ARCA», donde no había
 *  campos. Pedido del humano (2026-10-09): una pantalla para cargarlo, **varios CBU** («el dueño puede querer que le
 *  depositen en una u otra cuenta»), **un alias por CBU** para elegir por cualquiera de los dos, y una leyenda para
 *  elegir SCA o ADC. Lo que se prueba: que la lista llegue al PUT como la espera el motor (CBU sólo dígitos, alias en
 *  minúsculas, el predeterminado en `fce_cbu`, `""` borra), que un dato mal escrito no se mande, y que con un motor que
 *  no conoce la lista la pantalla siga igual que antes.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ArcaCard } from '../src/Configuracion'
import {
  AYUDA_MODALIDAD_FCE, aliasLimpio, cbuLimpio, problemaDeLosCbus, problemaDelAlias, problemaDelCbu,
} from '../src/configuracion/arca-fce'

const BASE = {
  empresa: 'default', cuit: '30777777779', punto_venta: 4, ambiente: 'produccion', alias: '',
  certificado_path: '', clave_path: '', tiene_certificado: false, tiene_clave: false,
}
const CON_FCE = { ...BASE, fce_cbus: [], fce_cbu: '', fce_transmision: '' }
const CBU_1 = '2850590940090418135201'
const CBU_2 = '0110599520000001234567'

let escrituras: { url: string; metodo: string; body: BodyInit | null }[] = []

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function responder(cfg: unknown) {
  vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
    const u = String(url)
    const metodo = opciones?.method ?? 'GET'
    if (metodo !== 'GET') escrituras.push({ url: u, metodo, body: opciones?.body ?? null })
    if (u.includes('/estado')) {
      return Promise.resolve(json({ configurado: false, ambiente: '', cuit: '', tiene_certificado: false, tiene_clave: false }))
    }
    if (u.includes('/servicios')) return Promise.resolve(new Response('', { status: 404 }))
    return Promise.resolve(json(cfg))
  }))
}

function puts() {
  return escrituras.filter((e) => e.metodo === 'PUT')
}

function cuerpoDelPut(): Record<string, unknown> {
  expect(puts().length, 'no llegó ningún PUT').toBeGreaterThan(0)
  return JSON.parse(String(puts()[0].body))
}

const montar = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
const modalidad = () => screen.getByLabelText('Modalidad de transmisión')
const guardar = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole('button', { name: /Guardar ARCA/ }))

beforeEach(() => {
  escrituras = []
  vi.unstubAllGlobals()
})

describe('ARCA — factura de crédito: varias cuentas, con alias', () => {
  it('dos cuentas (una copiada con espacios y guiones), la segunda predeterminada, y la modalidad', async () => {
    responder(CON_FCE)
    montar(<ArcaCard producto="LibraCargo" />)
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: /Agregar CBU/ }))
    await u.type(screen.getByLabelText('CBU 1'), '2850590-9 40090418135201')
    await u.type(screen.getByLabelText('Alias 1'), 'Suitrans.Nacion')
    await u.type(screen.getByLabelText('Nombre de la cuenta 1'), 'Banco Nación')
    await u.click(screen.getByRole('button', { name: /Agregar CBU/ }))
    await u.type(screen.getByLabelText('CBU 2'), CBU_2)
    await u.click(screen.getByLabelText('CBU 2 predeterminado'))
    await u.selectOptions(modalidad(), 'SCA')
    await guardar(u)

    expect(cuerpoDelPut()).toMatchObject({
      fce_cbus: [
        { cbu: CBU_1, alias: 'suitrans.nacion', etiqueta: 'Banco Nación' },
        { cbu: CBU_2, alias: '', etiqueta: '' },
      ],
      fce_cbu: CBU_2,
      fce_transmision: 'SCA',
      punto_venta: 4,
    })
  })

  it('muestra lo guardado con su predeterminado; quitar la predeterminada pasa la marca a la primera', async () => {
    responder({
      ...CON_FCE,
      fce_cbus: [{ cbu: CBU_1, alias: 'suitrans.nacion', etiqueta: 'Nación' }, { cbu: CBU_2, alias: '', etiqueta: '' }],
      fce_cbu: CBU_2, fce_transmision: 'adc',
    })
    montar(<ArcaCard producto="LibraCargo" />)
    const u = userEvent.setup()

    expect(await screen.findByLabelText('CBU 1')).toHaveValue(CBU_1)
    expect(screen.getByLabelText('Alias 1')).toHaveValue('suitrans.nacion')
    expect(screen.getByLabelText('CBU 2 predeterminado')).toBeChecked()
    expect(modalidad()).toHaveValue('ADC')

    await u.click(screen.getByRole('button', { name: 'Quitar CBU 2' }))
    await guardar(u)
    expect(cuerpoDelPut()).toMatchObject({
      fce_cbus: [{ cbu: CBU_1, alias: 'suitrans.nacion', etiqueta: 'Nación' }], fce_cbu: CBU_1,
    })
  })

  it('sin cuentas y «Sin cargar» borra todo (el motor borra con "" y la lista vacía)', async () => {
    responder({ ...CON_FCE, fce_cbus: [{ cbu: CBU_1, alias: '', etiqueta: '' }], fce_cbu: CBU_1, fce_transmision: 'SCA' })
    montar(<ArcaCard producto="LibraCargo" />)
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Quitar CBU 1' }))
    await u.selectOptions(modalidad(), 'Sin cargar')
    await guardar(u)

    expect(cuerpoDelPut()).toMatchObject({ fce_cbus: [], fce_cbu: '', fce_transmision: '' })
  })

  it.each([
    ['un CBU corto', CBU_1.slice(0, 21), '', 'CBU 1: El CBU tiene 22 dígitos (hay 21).'],
    ['un alias con espacios', CBU_1, 'mi alias', 'CBU 1: El alias lleva sólo letras, números, puntos y guiones.'],
  ])('%s se dice y no se manda', async (_caso, cbu, alias, mensaje) => {
    responder(CON_FCE)
    montar(<ArcaCard producto="LibraCargo" />)
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: /Agregar CBU/ }))
    await u.type(screen.getByLabelText('CBU 1'), cbu)
    if (alias) await u.type(screen.getByLabelText('Alias 1'), alias)
    await guardar(u)

    expect(screen.getByText(mensaje)).toBeInTheDocument()
    expect(puts()).toEqual([])
  })

  it('la leyenda de cuándo elegir SCA o ADC está junto a la modalidad', async () => {
    responder(CON_FCE)
    montar(<ArcaCard producto="LibraCargo" />)
    const ayuda = await screen.findByRole('list', { name: 'Cuál elegir' })
    expect(within(ayuda).getByText(AYUDA_MODALIDAD_FCE.SCA)).toBeInTheDocument()
    expect(within(ayuda).getByText(AYUDA_MODALIDAD_FCE.ADC)).toBeInTheDocument()
    expect(AYUDA_MODALIDAD_FCE.SCA).toMatch(/directamente a través de bancos/)
    expect(AYUDA_MODALIDAD_FCE.ADC).toMatch(/Mercado de Valores \(Bolsa\)/)
  })

  it('con un motor que no conoce la lista, la pantalla es la de antes y el PUT no la lleva', async () => {
    responder({ ...BASE, fce_cbu: CBU_1, fce_transmision: 'SCA' })
    montar(<ArcaCard producto="LibraCargo" />)
    const u = userEvent.setup()

    await screen.findByLabelText(/^CUIT$/)
    expect(screen.queryByRole('group', { name: 'Factura de crédito electrónica MiPyME' })).toBeNull()
    await guardar(u)
    for (const clave of ['fce_cbus', 'fce_cbu', 'fce_transmision']) expect(cuerpoDelPut()).not.toHaveProperty(clave)
  })
})

describe('validación de la lista', () => {
  it.each([
    [CBU_1, null],
    ['2850590-9 40090418135201', null],
    ['', 'Falta el CBU.'],
    ['28505909400904181352', 'El CBU tiene 22 dígitos (hay 20).'],
    ['28505909400904181352AB', 'El CBU lleva sólo números.'],
  ])('CBU %j → %j', (texto, problema) => {
    expect(problemaDelCbu(texto)).toBe(problema)
  })

  it.each([
    ['', null],
    ['Suitrans.Cobros', null],
    ['mi-alias.2026', null],
    ['corto', 'El alias tiene de 6 a 20 caracteres (hay 5).'],
    ['un.alias.demasiado.largo', 'El alias tiene de 6 a 20 caracteres (hay 24).'],
    ['alias_con_guion_bajo', 'El alias lleva sólo letras, números, puntos y guiones.'],
  ])('alias %j → %j', (texto, problema) => {
    expect(problemaDelAlias(texto)).toBe(problema)
  })

  it('CBU y alias repetidos se dicen con el número de fila', () => {
    expect(problemaDeLosCbus([{ cbu: CBU_1, alias: '', etiqueta: '' }, { cbu: CBU_1, alias: '', etiqueta: '' }]))
      .toBe('CBU 2: está repetido.')
    expect(problemaDeLosCbus([
      { cbu: CBU_1, alias: 'suitrans.cobros', etiqueta: '' }, { cbu: CBU_2, alias: 'Suitrans.Cobros', etiqueta: '' },
    ])).toBe('CBU 2: el alias está repetido.')
    expect(problemaDeLosCbus([])).toBeNull()
  })

  it('se guardan normalizados', () => {
    expect(cbuLimpio(' 2850590-9 40090418135201 ')).toBe(CBU_1)
    expect(aliasLimpio('  Suitrans.Cobros ')).toBe('suitrans.cobros')
  })
})

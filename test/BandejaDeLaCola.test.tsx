// La bandeja de la cola de comprobantes del nodo (ADR-094; el motor es ADR-079 de libracore, `cola_arca_router`).
//
// Lo que se fija es lo que la pantalla decide: qué muestra de cada estado (el mensaje de ARCA de un `a_revisar`), qué acciones ofrece
// en cada uno, que **un `incierto` no se reintenta sin la confirmación explícita** («¿Confirmás que este comprobante NO salió en
// ARCA?»), que lo que contesta el motor (409, 422) se ve con su `mensaje`, y que la pestaña de `BandejaDeComprobantes` aparece sólo
// en un nodo que monta la cola.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BandejaDeComprobantes } from '../src/BandejaDeComprobantes'
import { BandejaDeLaCola } from '../src/BandejaDeLaCola'
import { PREGUNTA_NO_SALIO, type PedidoDeCola } from '../src/cola-del-nodo'
import { _reiniciarConexionDelNodo } from '../src/nodo-offline'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  _reiniciarConexionDelNodo()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  _reiniciarConexionDelNodo()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Datos ficticios.
function pedido(over: Partial<PedidoDeCola> = {}): PedidoDeCola {
  return {
    id: 1, origen_producto: 'libracargo', origen_instancia: 'nodo-demo-1', origen_tipo: 'cpe', origen_id: '41',
    estado: 'esperando', datos: {}, fecha_ref: '2026-10-22', concepto: 1, intentos: 0, ultimo_error: '', resultado: null,
    revision: 1, created_at: '2026-10-22 09:15:00', updated_at: '2026-10-22 09:15:00', resuelto_at: '', ...over,
  }
}
const A_REVISAR = pedido({ id: 2, origen_id: '42', estado: 'a_revisar', intentos: 1, ultimo_error: 'ARCA rechazó: la patente del chasis no figura en el RUTA.' })
const INCIERTO = pedido({ id: 3, origen_id: '43', estado: 'incierto', intentos: 1, ultimo_error: 'ARCA no contestó al autorizar.' })
const FACTURA = pedido({ id: 4, origen_tipo: 'documento', origen_id: '7' })

function cuentasDe(pedidos: PedidoDeCola[]) {
  const c: Record<string, number> = {}
  pedidos.forEach((p) => { c[p.estado] = (c[p.estado] ?? 0) + 1 })
  return c
}

type Contenido = { abiertos?: PedidoDeCola[]; resueltos?: PedidoDeCola[]; enLinea?: boolean; esNodo?: boolean }

/** Contesta la cola (los abiertos o los resueltos según los `estado=` que pida) y lo demás por «MÉTODO ruta». */
function conCola(c: Contenido = {}, extra: Record<string, () => Response> = {}) {
  const abiertos = c.abiertos ?? []
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const [ruta, query = ''] = url.split('?')
    const clave = `${init?.method ?? 'GET'} ${ruta}`
    if (clave in extra) return Promise.resolve(extra[clave]())
    if (clave === 'GET /api/nodo/cola') {
      const pidioResueltos = query.includes('estado=emitido')
      return Promise.resolve(json({
        es_nodo: c.esNodo ?? true, en_linea: c.enLinea ?? true, node_id: 'nodo-demo-1', cuentas: cuentasDe(abiertos),
        a_revisar: abiertos.filter((p) => p.estado === 'a_revisar' || p.estado === 'incierto').length,
        pedidos: pidioResueltos ? (c.resueltos ?? []) : abiertos,
      }))
    }
    return Promise.resolve(json({ detail: 'Not Found' }, 404))
  })
}

const pedidas = () => fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
const cuerpoDe = (clave: string) => {
  const llamada = fetchMock.mock.calls.find((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}` === clave)
  return JSON.parse(String((llamada?.[1] as RequestInit).body))
}

function montar(props: Partial<React.ComponentProps<typeof BandejaDeLaCola>> = {}) {
  return render(<MemoryRouter><BandejaDeLaCola intervaloMs={0} {...props} /></MemoryRouter>)
}
const tarjetaDe = (texto: string | RegExp) => screen.getByText(texto).closest('li') as HTMLElement

describe('lo que muestra la bandeja de la cola', () => {
  it('lista cada pedido con su tipo, su estado y cuándo se pidió', async () => {
    conCola({ abiertos: [pedido(), FACTURA] })
    montar()

    await screen.findByText('Carta de porte · #41')
    const cpe = tarjetaDe('Carta de porte · #41')
    expect(within(cpe).getByText('En cola')).toBeInTheDocument()
    expect(within(cpe).getByText('Pedido 22-10-2026 09:15')).toBeInTheDocument()
    const factura = tarjetaDe('Factura · #7')
    expect(within(factura).getByText('En cola')).toBeInTheDocument()
    expect(screen.getByText('2 comprobantes en cola')).toBeInTheDocument()
  })

  it('🔑 un `a_revisar` muestra el mensaje de ARCA y cuenta como «para revisar»', async () => {
    conCola({ abiertos: [pedido(), A_REVISAR] })
    montar()

    const tarjeta = await screen.findByText('Carta de porte · #42')
    const li = tarjeta.closest('li') as HTMLElement
    expect(within(li).getByText('A revisar')).toBeInTheDocument()
    expect(within(li).getByText('Mensaje de ARCA')).toBeInTheDocument()
    expect(within(li).getByText('ARCA rechazó: la patente del chasis no figura en el RUTA.')).toBeInTheDocument()
    expect(screen.getByText('2 comprobantes en cola · 1 para revisar')).toBeInTheDocument()
  })

  it('lo que pide a una persona va primero, aunque sea más nuevo', async () => {
    conCola({ abiertos: [pedido(), A_REVISAR, INCIERTO] })
    montar()

    await screen.findByText('Carta de porte · #42')
    const titulos = screen.getAllByRole('listitem').map((li) => li.querySelector('.font-medium')?.textContent)
    expect(titulos).toEqual(['Carta de porte · #42', 'Carta de porte · #43', 'Carta de porte · #41'])
  })

  it('cada estado tiene su etiqueta', async () => {
    conCola({
      abiertos: [
        pedido({ id: 1, estado: 'esperando' }), pedido({ id: 2, origen_id: '2', estado: 'emitiendo' }),
        pedido({ id: 3, origen_id: '3', estado: 'a_revisar' }), pedido({ id: 4, origen_id: '4', estado: 'incierto' }),
      ],
    })
    montar()

    await screen.findByText('Carta de porte · #3')
    const estados = screen.getAllByRole('listitem').map((li) => li.querySelector('[data-estado]')?.getAttribute('data-estado'))
    expect(new Set(estados)).toEqual(new Set(['esperando', 'emitiendo', 'a_revisar', 'incierto']))
    expect(screen.getByText('Emitiéndose')).toBeInTheDocument()
    expect(screen.getByText('Incierto')).toBeInTheDocument()
  })

  it('sin pedidos, lo dice', async () => {
    conCola({ abiertos: [] })
    montar()
    expect(await screen.findByText('No hay comprobantes esperando salir.')).toBeInTheDocument()
  })

  it('los resueltos se piden aparte (sólo emitidos y descartados) y muestran el CTG', async () => {
    conCola({ resueltos: [pedido({ id: 9, origen_id: '50', estado: 'emitido', resultado: { ctg: '10123456789' }, resuelto_at: '2026-10-22 10:00:00' })] })
    montar()
    await screen.findByText('No hay comprobantes esperando salir.')

    await userEvent.click(screen.getByRole('tab', { name: 'Resueltos' }))

    const li = (await screen.findByText('Carta de porte · #50')).closest('li') as HTMLElement
    expect(within(li).getByText('Emitido')).toBeInTheDocument()
    expect(within(li).getByText('CTG 10123456789')).toBeInTheDocument()
    expect(pedidas().some((p) => p.startsWith('GET /api/nodo/cola?') && p.includes('estado=emitido') && p.includes('estado=descartado'))).toBe(true)
    // Un resuelto no se mueve más: sin acciones.
    expect(within(li).queryByRole('button')).toBeNull()
  })

  it('con facturas y cartas de porte ofrece filtrar por tipo; con un solo tipo no', async () => {
    conCola({ abiertos: [pedido(), FACTURA] })
    montar()
    await screen.findByText('Carta de porte · #41')

    await userEvent.click(screen.getByRole('button', { name: 'Cartas de porte' }))
    expect(screen.getByText('Carta de porte · #41')).toBeInTheDocument()
    expect(screen.queryByText('Factura · #7')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(screen.getByText('Factura · #7')).toBeInTheDocument()

    cleanup()
    conCola({ abiertos: [FACTURA] })
    montar()
    await screen.findByText('Factura · #7')
    expect(screen.queryByRole('group', { name: 'Tipo de comprobante' })).toBeNull()
  })

  it('el `origen_id` de LibraCargo («orden41:<uuid>») se muestra sin el uuid', async () => {
    conCola({ abiertos: [pedido({ origen_id: 'orden41:0f3a9c2e71b84d5aa6c01d2e3f4a5b6c' })] })
    montar()
    expect(await screen.findByText('Carta de porte · orden41')).toBeInTheDocument()
  })

  it('el producto pone el título de cada tarjeta', async () => {
    conCola({ abiertos: [pedido()] })
    montar({ describir: (p) => `Orden ${p.origen_id} · Cereales SA` })
    expect(await screen.findByText('Orden 41 · Cereales SA')).toBeInTheDocument()
  })

  it('fuera de un nodo, o si el producto no monta la ruta, lo dice y no ofrece nada', async () => {
    conCola({ esNodo: false })
    montar()
    expect(await screen.findByText('Esta instalación no es un nodo: no tiene cola de comprobantes.')).toBeInTheDocument()

    cleanup()
    fetchMock.mockImplementation(() => Promise.resolve(json({ detail: 'Not Found' }, 404)))
    montar()
    expect(await screen.findByText('Esta instalación no es un nodo: no tiene cola de comprobantes.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('un corte de red se avisa y no borra lo último que se vio', async () => {
    conCola({ abiertos: [pedido()] })
    const { unmount } = montar({ intervaloMs: 50 })
    await screen.findByText('Carta de porte · #41')

    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error de conexión.')
    expect(screen.getByText('Carta de porte · #41')).toBeInTheDocument()
    unmount()
  })

  it('sin conexión avisa y no deja «Emitir ahora»', async () => {
    conCola({ abiertos: [pedido()], enLinea: false })
    montar()

    expect(await screen.findByText('Sin conexión: los comprobantes se emiten cuando vuelva la conexión.', { selector: '[role="status"]' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir ahora' })).toBeDisabled()
  })
})

describe('las acciones de cada estado', () => {
  it('un `esperando` sólo se puede descartar', async () => {
    conCola({ abiertos: [pedido()] })
    montar()
    const li = (await screen.findByText('Carta de porte · #41')).closest('li') as HTMLElement
    expect(within(li).getAllByRole('button').map((b) => b.textContent)).toEqual(['Descartar'])
  })

  it('un `a_revisar` se puede reintentar, marcar emitido o descartar', async () => {
    conCola({ abiertos: [A_REVISAR] })
    montar()
    const li = (await screen.findByText('Carta de porte · #42')).closest('li') as HTMLElement
    expect(within(li).getAllByRole('button').map((b) => b.textContent)).toEqual(['Reintentar', 'Marcar emitido', 'Descartar'])
  })

  it('un `emitiendo` no tiene acciones: lo está emitiendo alguien', async () => {
    conCola({ abiertos: [pedido({ estado: 'emitiendo' })] })
    montar()
    const li = (await screen.findByText('Carta de porte · #41')).closest('li') as HTMLElement
    expect(within(li).queryByRole('button')).toBeNull()
  })

  it('sin permiso (`puedeResolver={false}`) no hay reintentar, descartar ni marcar emitido', async () => {
    conCola({ abiertos: [A_REVISAR, INCIERTO] })
    montar({ puedeResolver: false })
    await screen.findByText('Carta de porte · #42')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Marcar emitido' })).toBeNull()
  })

  it('reintentar un `a_revisar` va directo, sin confirmación, y recarga la cola', async () => {
    let cola = [A_REVISAR]
    conCola({}, {})
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      const clave = `${init?.method ?? 'GET'} ${String(entrada).split('?')[0]}`
      if (clave === 'POST /api/nodo/cola/2/reintentar') { cola = [{ ...A_REVISAR, estado: 'esperando', ultimo_error: '' }]; return Promise.resolve(json({})) }
      return Promise.resolve(json({ es_nodo: true, en_linea: true, node_id: 'n', cuentas: {}, a_revisar: 0, pedidos: cola }))
    })
    montar()
    const li = (await screen.findByText('Carta de porte · #42')).closest('li') as HTMLElement

    await userEvent.click(within(li).getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(within(screen.getByText('Carta de porte · #42').closest('li') as HTMLElement).getByText('En cola')).toBeInTheDocument())
    expect(cuerpoDe('POST /api/nodo/cola/2/reintentar')).toEqual({})
    expect(screen.queryByText(PREGUNTA_NO_SALIO)).toBeNull()
  })

  it('🔴 un `incierto` NO se reintenta de un click: pregunta si NO salió en ARCA y sin el sí no manda nada', async () => {
    conCola({ abiertos: [INCIERTO] })
    montar()
    const li = (await screen.findByText('Carta de porte · #43')).closest('li') as HTMLElement

    await userEvent.click(within(li).getByRole('button', { name: 'Reintentar' }))

    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('¿Confirmás que este comprobante NO salió en ARCA?')).toBeInTheDocument()
    expect(within(dialogo).getByText(/Si lo reintentás y ya había salido, puede quedar duplicado/)).toBeInTheDocument()
    expect(pedidas().filter((p) => p.startsWith('POST'))).toEqual([])

    // Cancelar: no se manda nada.
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(pedidas().filter((p) => p.startsWith('POST'))).toEqual([])
  })

  it('confirmar el `incierto` manda `confirmo_que_no_salio: true`', async () => {
    conCola({ abiertos: [INCIERTO] }, { 'POST /api/nodo/cola/3/reintentar': () => json({ ...INCIERTO, estado: 'esperando' }) })
    montar()
    const li = (await screen.findByText('Carta de porte · #43')).closest('li') as HTMLElement
    await userEvent.click(within(li).getByRole('button', { name: 'Reintentar' }))

    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmo que no salió' }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/nodo/cola/3/reintentar'))
    expect(cuerpoDe('POST /api/nodo/cola/3/reintentar')).toEqual({ confirmo_que_no_salio: true })
  })

  it('si el motor igual lo rechaza (422 `confirmacion_requerida`), se ve su mensaje', async () => {
    conCola({ abiertos: [INCIERTO] }, {
      'POST /api/nodo/cola/3/reintentar': () => json({ detail: { codigo: 'confirmacion_requerida', mensaje: 'No se sabe si ARCA lo emitió: consultalo en ARCA.' } }, 422),
    })
    montar()
    const li = (await screen.findByText('Carta de porte · #43')).closest('li') as HTMLElement
    await userEvent.click(within(li).getByRole('button', { name: 'Reintentar' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmo que no salió' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se sabe si ARCA lo emitió: consultalo en ARCA.')
  })

  it('descartar pide el motivo opcional y lo manda', async () => {
    conCola({ abiertos: [pedido()] }, { 'POST /api/nodo/cola/1/descartar': () => json({}) })
    montar()
    const li = (await screen.findByText('Carta de porte · #41')).closest('li') as HTMLElement

    await userEvent.click(within(li).getByRole('button', { name: 'Descartar' }))
    await userEvent.type(screen.getByLabelText('Motivo'), 'se hizo a mano')
    const formulario = screen.getByLabelText('Motivo').closest('div')!.parentElement as HTMLElement
    await userEvent.click(within(formulario).getByRole('button', { name: 'Descartar' }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/nodo/cola/1/descartar'))
    expect(cuerpoDe('POST /api/nodo/cola/1/descartar')).toEqual({ motivo: 'se hizo a mano' })
    // Se cierra el formulario y se vuelve a pedir la cola.
    await waitFor(() => expect(screen.queryByLabelText('Motivo')).toBeNull())
    expect(pedidas().filter((p) => p === 'GET /api/nodo/cola?estado=esperando&estado=emitiendo&estado=a_revisar&estado=incierto').length).toBe(2)
  })

  it('marcar emitido una CPE pide el CTG y manda `{resultado: {ctg}}`', async () => {
    conCola({ abiertos: [INCIERTO] }, { 'POST /api/nodo/cola/3/emitido': () => json({}) })
    montar()
    const li = (await screen.findByText('Carta de porte · #43')).closest('li') as HTMLElement

    await userEvent.click(within(li).getByRole('button', { name: 'Marcar emitido' }))
    const formulario = screen.getByLabelText('N.º de CTG').closest('div')!.parentElement as HTMLElement
    // Sin el CTG no se puede marcar.
    expect(within(formulario).getByRole('button', { name: 'Marcar emitido' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('N.º de CTG'), '10123456789')
    await userEvent.click(within(formulario).getByRole('button', { name: 'Marcar emitido' }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/nodo/cola/3/emitido'))
    expect(cuerpoDe('POST /api/nodo/cola/3/emitido')).toEqual({ resultado: { ctg: '10123456789' } })
  })

  it('marcar emitido una factura pide el número de la factura, entero, y manda `{resultado: {factura_id}}`', async () => {
    conCola({ abiertos: [pedido({ id: 5, origen_tipo: 'documento', origen_id: '8', estado: 'a_revisar', ultimo_error: 'Sin CAE' })] },
      { 'POST /api/nodo/cola/5/emitido': () => json({}) })
    montar()
    const li = (await screen.findByText('Factura · #8')).closest('li') as HTMLElement

    await userEvent.click(within(li).getByRole('button', { name: 'Marcar emitido' }))
    const campo = screen.getByLabelText('N.º de la factura')
    const formulario = campo.closest('div')!.parentElement as HTMLElement
    await userEvent.type(campo, 'abc')
    expect(within(formulario).getByRole('button', { name: 'Marcar emitido' })).toBeDisabled()
    await userEvent.clear(campo)
    await userEvent.type(campo, '41')
    await userEvent.click(within(formulario).getByRole('button', { name: 'Marcar emitido' }))

    await waitFor(() => expect(pedidas()).toContain('POST /api/nodo/cola/5/emitido'))
    expect(cuerpoDe('POST /api/nodo/cola/5/emitido')).toEqual({ resultado: { factura_id: 41 } })
  })

  it('«Emitir ahora» pide la tanda y cuenta lo que salió', async () => {
    conCola({ abiertos: [pedido(), FACTURA] }, {
      'POST /api/nodo/cola/emitir': () => json({ es_nodo: true, en_linea: true, emitidos: [{ pedido_id: 4 }], a_revisar: [{ pedido_id: 1 }], inciertos: [], errores: [], quedan: 0 }),
    })
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Emitir ahora' }))

    expect(await screen.findByText('1 emitido; 1 a revisar.')).toBeInTheDocument()
  })

  it('si el motor contesta 409 `sin_conexion`, se ve su mensaje', async () => {
    conCola({ abiertos: [pedido()] }, {
      'POST /api/nodo/cola/emitir': () => json({ detail: { codigo: 'sin_conexion', mensaje: 'Sin conexión: los comprobantes se emiten cuando vuelva la conexión.' } }, 409),
    })
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Emitir ahora' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión: los comprobantes se emiten cuando vuelva la conexión.')
  })

  it('una acción que no llega (corte de red) lo dice y deja el pedido como estaba', async () => {
    conCola({ abiertos: [A_REVISAR] })
    montar()
    const li = (await screen.findByText('Carta de porte · #42')).closest('li') as HTMLElement
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))

    await userEvent.click(within(li).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Error de conexión.')
    expect(screen.getByText('Carta de porte · #42')).toBeInTheDocument()
  })

  it('una cola cambiada por otro (409 «ya está emitido») se muestra tal cual vino', async () => {
    conCola({ abiertos: [A_REVISAR] }, { 'POST /api/nodo/cola/2/reintentar': () => json({ detail: 'El pedido 2 está emitido: sólo se reabre uno a revisar o incierto.' }, 409) })
    montar()
    const li = (await screen.findByText('Carta de porte · #42')).closest('li') as HTMLElement
    await userEvent.click(within(li).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El pedido 2 está emitido')
  })
})

describe('la cola como pestaña de la bandeja de comprobantes', () => {
  function conBandejaYCola(abiertos: PedidoDeCola[], { cola = true } = {}) {
    fetchMock.mockImplementation((entrada: RequestInfo | URL) => {
      const [ruta] = String(entrada).split('?')
      if (ruta === '/api/comprobantes-pendientes') return Promise.resolve(json({ pendientes: [], facturados: [], descartados: [], total_pendientes: 0 }))
      if (ruta === '/api/nodo/cola' && cola) {
        return Promise.resolve(json({ es_nodo: true, en_linea: true, node_id: 'n', cuentas: cuentasDe(abiertos), a_revisar: 0, pedidos: abiertos }))
      }
      return Promise.resolve(json({ detail: 'Not Found' }, 404))
    })
  }
  const montarBandeja = (props: Partial<React.ComponentProps<typeof BandejaDeComprobantes>> = {}) =>
    render(<MemoryRouter><BandejaDeComprobantes {...props} /></MemoryRouter>)

  it('con `cola` suma la pestaña «Cola de ARCA» con el conteo, y adentro está la lista', async () => {
    conBandejaYCola([pedido(), A_REVISAR])
    montarBandeja({ cola: true })

    const pestana = await screen.findByRole('tab', { name: 'Cola de ARCA (2)' })
    await userEvent.click(pestana)

    expect(await screen.findByText('Carta de porte · #42')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cola de ARCA' })).toBeInTheDocument()
  })

  it('sin `cola` no hay pestaña ni se pregunta nada de la cola', async () => {
    conBandejaYCola([pedido()])
    montarBandeja()
    await screen.findByText('No hay nada esperando para facturar.')
    expect(screen.queryByRole('tab', { name: /Cola de ARCA/ })).toBeNull()
    expect(pedidas().some((p) => p.includes('/api/nodo/cola'))).toBe(false)
  })

  it('con `cola` pero fuera de un nodo (el producto no monta la ruta) tampoco hay pestaña', async () => {
    conBandejaYCola([], { cola: false })
    montarBandeja({ cola: true })
    await screen.findByText('No hay nada esperando para facturar.')
    await waitFor(() => expect(pedidas().some((p) => p.includes('/api/nodo/cola'))).toBe(true))
    expect(screen.queryByRole('tab', { name: /Cola de ARCA/ })).toBeNull()
  })

  it('`cola={{ ruta }}` la pide donde el producto la montó', async () => {
    fetchMock.mockImplementation((entrada: RequestInfo | URL) => {
      const [ruta] = String(entrada).split('?')
      if (ruta === '/api/comprobantes-pendientes') return Promise.resolve(json({ pendientes: [], facturados: [], descartados: [], total_pendientes: 0 }))
      if (ruta === '/api/otra/cola') return Promise.resolve(json({ es_nodo: true, en_linea: true, node_id: 'n', cuentas: {}, a_revisar: 0, pedidos: [pedido()] }))
      return Promise.resolve(json({ detail: 'Not Found' }, 404))
    })
    montarBandeja({ cola: { ruta: '/api/otra/cola' } })
    expect(await screen.findByRole('tab', { name: 'Cola de ARCA (1)' })).toBeInTheDocument()
  })
})

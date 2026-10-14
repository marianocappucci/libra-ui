// Vencimientos, 0.151.0 (ADR-063): la baja de un lote dice cuánto valía y las filas «Salidas sin lote» se pueden conciliar.
// Lo que se prueba es lo que la pantalla decide: qué muestra cuando el motor manda (o no) el costo, qué pide y qué manda al conciliar, qué valida antes de mandar, y la regla de la
// clave (una por intento, la misma al reintentar) y del intento incierto, que es la de las otras escrituras. Todo opt-in: sin `puedeConciliar` ni claves de costo, nada nuevo.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Vencimientos } from '../src/comercio/Vencimientos'
import { _reiniciarPendientesEnMemoria } from '../src/comercio/vencimientos-pendientes'
import type { VencimientoConciliacion, VencimientoLote, VencimientoSinLote, VencimientosData } from '../src/comercio/tipos'
import { fetchMock, json, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const lote = (o: Partial<VencimientoLote>): VencimientoLote => ({
  producto_id: 1, codigo: null, nombre: '', unidad: 'u', categoria: '', deposito_id: 1, deposito: 'Depósito Centro',
  deposito_activo: true, sucursal_id: 1, sucursal: 'Centro', variante_id: null, variante: null, lote: null, vence: '2026-10-01',
  dias_para_vencer: 1, saldo: 0, estado: 'por_vencer', ...o,
})
const sinLote = (o: Partial<VencimientoSinLote>): VencimientoSinLote => ({
  producto_id: 6, codigo: null, nombre: '', unidad: 'u', categoria: '', deposito_id: 1, deposito: 'Depósito Centro',
  deposito_activo: true, sucursal_id: 1, sucursal: 'Centro', variante_id: null, variante: null, saldo: 0, situacion: 'sin_fecha', ...o,
})

const YERBA = lote({ producto_id: 1, codigo: 'Y-1', nombre: 'Yerba', lote: 'L1', vence: '2026-09-25', dias_para_vencer: -5, saldo: 4, estado: 'vencido' })
const ARROZ = sinLote({ producto_id: 6, codigo: 'A-1', nombre: 'Arroz', saldo: 20 })
const FIDEOS = sinLote({ producto_id: 8, nombre: 'Fideos', saldo: -3, situacion: 'salidas_sin_lote' })
// Lo mismo, con variante, en otro depósito: otro destino.
const SEMOLA = sinLote({
  producto_id: 8, nombre: 'Fideos', saldo: -1, situacion: 'salidas_sin_lote', deposito_id: 2, deposito: 'Depósito Norte', sucursal_id: 2, sucursal: 'Norte',
  variante_id: 4, variante: 'x500',
})

const DATA: VencimientosData = {
  sucursal_id: null, deposito_id: null, categoria: null, producto_id: null, incluir_vencidos: true, hoy: '2026-09-30', dias: 15, hasta: '2026-10-15',
  resumen: {
    lotes_por_vencer: 0, lotes_vencidos: 1, unidades_por_vencer: 0, unidades_vencidas: 4, productos: 1, productos_sin_lote: 1,
    productos_con_salidas_sin_lote: 1, saldos_sin_fecha: 1, saldos_con_salidas_sin_lote: 2,
  },
  lotes: [YERBA],
  sin_lote: [FIDEOS, SEMOLA, ARROZ],
}

const RUTA = '/api/vencimientos'
const MERMA = '/api/vencimientos/merma'
const CONCILIAR = '/api/vencimientos/conciliar'
const CONCILIACION = '/api/vencimientos/conciliacion'
const MERMA_OK = { producto_id: 1, deposito_id: 1, variante_id: null, lote: 'L1', vence: '2026-09-25', cantidad: 4, saldo_restante: 0, repetida: false }

/** Lo que contesta `GET /conciliacion` para Fideos: 3 en negativo, dos lotes que alcanzan (FEFO: primero el que vence antes). */
const CONCILIACION_FIDEOS: VencimientoConciliacion = {
  producto_id: 8, codigo: 'F-8', nombre: 'Fideos', unidad: 'u', vence: true, deposito_id: 1, variante_id: null, hoy: '2026-09-30',
  saldo_sin_lote: -3, a_conciliar: 3,
  lotes: [
    { lote: 'F1', vence: '2026-10-05', saldo: 2, dias_para_vencer: 5, estado: 'vigente' },
    { lote: 'F2', vence: '2026-11-01', saldo: 5, dias_para_vencer: 32, estado: 'vigente' },
  ],
  propuesta: [{ lote: 'F1', vence: '2026-10-05', cantidad: 2 }, { lote: 'F2', vence: '2026-11-01', cantidad: 1 }],
  cubierto: 3, sin_cubrir: 0,
}
const CONCILIAR_OK = {
  producto_id: 8, deposito_id: 1, variante_id: null, referencia: 'Conciliación sin lote [conciliación 1a2b3c4d]',
  tramos: CONCILIACION_FIDEOS.propuesta, cantidad: 3, saldo_sin_lote: 0, sin_cubrir: 0, repetida: false,
}
const TODO = {
  [RUTA]: DATA, '/api/sucursales': [], '/api/productos/categorias': [], '/api/productos': [],
  [`POST ${MERMA}`]: MERMA_OK, [`GET ${CONCILIACION}`]: CONCILIACION_FIDEOS, [`POST ${CONCILIAR}`]: CONCILIAR_OK,
}

/** Sin espacios raros ni saltos (el formato de moneda de es-AR usa un espacio duro). */
const texto = (el: HTMLElement | null) => (el?.textContent ?? '').replace(/\s+/g, ' ')
const dialogo = () => screen.getByRole('dialog')
const confirmar = () => within(dialogo()).getByRole('button', { name: /Confirmar|Guardando|Reenviar el intento anterior/ })
const filaSinLote = (nombre: string, n = 0) => within(screen.getAllByRole('table')[1]).getAllByText(nombre)[n].closest('tr')!
const enviosA = (ruta: string) => fetchMock.mock.calls
  .filter((c) => String(c[0]) === ruta && (c[1] as RequestInit | undefined)?.method === 'POST')
  .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>)
const clavesDe = (ruta: string) => enviosA(ruta).map((e) => e.clave_operacion)
const pedidasAConciliacion = () => pedidas().filter((p) => p.startsWith(`GET ${CONCILIACION}`))
const pedidasAlReporte = () => pedidas().filter((p) => p.startsWith(`GET ${RUTA}?`))
const campo = (nombre: string) => within(dialogo()).getByLabelText(nombre) as HTMLInputElement

/** Las respuestas de un POST, una por intento (la última se repite): una función que devuelve la `Response`, o `'caida'`. */
function secuencia(ruta: string, respuestas: (() => Response | 'caida')[]) {
  const base = fetchMock.getMockImplementation()!
  let i = 0
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    if (String(entrada) === ruta && init?.method === 'POST') {
      const r = respuestas[Math.min(i++, respuestas.length - 1)]()
      return r === 'caida' ? Promise.reject(new TypeError('sin red')) : Promise.resolve(r)
    }
    return base(entrada, init)
  })
}

async function abrir(tabla: Record<string, unknown> = TODO, props: { puedeMover?: boolean; puedeMermar?: boolean; puedeConciliar?: boolean } = {}) {
  responder(tabla)
  montar('/vencimientos', <Vencimientos {...props} />)
  await screen.findByText('1 lote')
}
async function abrirMerma(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Dar de baja \(merma\) Yerba/ }))
  return dialogo()
}
async function abrirConciliar(user: ReturnType<typeof userEvent.setup>, nombre = 'Fideos', n = 0) {
  await user.click(within(filaSinLote(nombre, n)).getByRole('button', { name: /Conciliar/ }))
  // La propuesta llegó cuando aparecen los lotes.
  await within(dialogo()).findByLabelText('Lote F1')
  return dialogo()
}

beforeEach(() => {
  cleanup()
  sessionStorage.clear()
  _reiniciarPendientesEnMemoria()
  prepararFetch()
})

describe('Vencimientos: lo que valía la baja de un lote', () => {
  it('si el motor manda costo_total, el aviso de éxito dice el importe', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [`POST ${MERMA}`]: { ...MERMA_OK, costo_unitario: 60, costo_total: 240, sin_costo: false } })
    await abrirMerma(user)
    await user.click(confirmar())
    const aviso = await screen.findByText(/Se dieron de baja/)
    expect(texto(aviso)).toContain('Se dieron de baja 4 u de Yerba, lote L1.')
    expect(texto(aviso)).toContain('Importe: $ 240,00.')
  })

  it('con sin_costo el aviso dice «sin costo cargado» y no inventa un importe', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [`POST ${MERMA}`]: { ...MERMA_OK, costo_unitario: null, costo_total: null, sin_costo: true } })
    await abrirMerma(user)
    await user.click(confirmar())
    const aviso = await screen.findByText(/Se dieron de baja/)
    expect(texto(aviso)).toContain('Importe: sin costo cargado.')
    expect(texto(aviso)).not.toContain('$')
  })

  it('🔴 sin las claves de costo (un rol que no ve costos, un motor anterior) no aparece nada de importe', async () => {
    const user = userEvent.setup()
    await abrir()
    await abrirMerma(user)
    await user.click(confirmar())
    const aviso = await screen.findByText(/Se dieron de baja/)
    expect(texto(aviso)).toBe('Se dieron de baja 4 u de Yerba, lote L1. Saldo del lote: 0 u.')
    expect(texto(aviso)).not.toMatch(/Importe|costo|\$/)
  })

  it('un reintento (repetida) muestra el costo que se guardó la primera vez', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [`POST ${MERMA}`]: { ...MERMA_OK, repetida: true, costo_unitario: 55, costo_total: 220, sin_costo: false } })
    await abrirMerma(user)
    await user.click(confirmar())
    const aviso = await screen.findByText(/Ya estaba registrado/)
    expect(texto(aviso)).toContain('Importe: $ 220,00.')
  })
})

describe('Vencimientos: conciliar es opt-in', () => {
  it('🔴 sin puedeConciliar (el default) no hay botón «Conciliar», ni siquiera en las salidas sin lote, y no se pide nada', async () => {
    await abrir()
    expect(screen.queryByRole('button', { name: /Conciliar/ })).toBeNull()
    expect(within(filaSinLote('Fideos')).queryByRole('button')).toBeNull()
    expect(pedidasAConciliacion()).toEqual([])
  })

  it('con puedeConciliar el botón está sólo en las filas de salidas sin lote, no en las de sin fecha', async () => {
    await abrir(TODO, { puedeConciliar: true })
    expect(within(filaSinLote('Fideos', 0)).getByRole('button', { name: /Conciliar Fideos, Centro · Depósito Centro/ })).toBeTruthy()
    expect(within(filaSinLote('Fideos', 1)).getByRole('button', { name: /Conciliar Fideos \(x500\), Norte · Depósito Norte/ })).toBeTruthy()
    expect(within(filaSinLote('Arroz')).queryByRole('button', { name: /Conciliar/ })).toBeNull()
    // «Asignar» sigue donde estaba.
    expect(within(filaSinLote('Arroz')).getByRole('button', { name: /Asignar vencimiento/ })).toBeTruthy()
    // Abrir el diálogo es lo que pide la vista previa, no el solo hecho de mostrar el botón.
    expect(pedidasAConciliacion()).toEqual([])
  })

  it('puedeConciliar con puedeMover=false: queda «Conciliar» y desaparece «Asignar vencimiento»', async () => {
    await abrir(TODO, { puedeMover: false, puedeConciliar: true })
    expect(within(filaSinLote('Fideos')).getByRole('button', { name: /Conciliar/ })).toBeTruthy()
    expect(within(filaSinLote('Arroz')).queryByRole('button')).toBeNull()
    expect(within(screen.getAllByRole('table')[1]).getByRole('columnheader', { name: 'Acciones' })).toBeTruthy()
  })

  it('puedeMover=false y puedeConciliar=false: sin columna de acciones en las salidas sin lote, como antes', async () => {
    await abrir(TODO, { puedeMover: false, puedeMermar: false })
    expect(within(screen.getAllByRole('table')[0]).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(within(screen.getAllByRole('table')[1]).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
  })

  it('el botón «Conciliar» mide 44 px bajo 1024 px', async () => {
    await abrir(TODO, { puedeConciliar: true })
    expect(within(filaSinLote('Fideos')).getByRole('button', { name: /Conciliar/ }).className).toContain('max-lg:h-11')
  })
})

describe('Vencimientos: el diálogo de conciliar', () => {
  it('pide la vista previa de ESA fila (con la variante sólo si la tiene) y muestra el negativo, los lotes con su saldo y vencimiento, y la propuesta FEFO', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    await abrirConciliar(user)
    expect(pedidasAConciliacion()).toEqual([`GET ${CONCILIACION}?producto_id=8&deposito_id=1`])

    const d = texto(dialogo())
    expect(d).toContain('Conciliar salidas sin lote')
    expect(d).toContain('Están en negativo 3 u')
    // El aviso permanente de la pantalla, también adentro (el diálogo mueve stock entre buckets).
    expect(texto(within(dialogo()).getAllByRole('note')[0])).toContain('el saldo de cada lote puede ser MAYOR al real')
    const lotes = within(dialogo()).getAllByRole('listitem')
    expect(lotes).toHaveLength(2)
    expect(texto(lotes[0])).toContain('Lote F1')
    expect(texto(lotes[0])).toContain('vence 05-10-2026')
    expect(texto(lotes[0])).toContain('saldo 2 u')
    expect(texto(lotes[1])).toContain('Lote F2')
    expect(texto(lotes[1])).toContain('saldo 5 u')
    // La propuesta, editable.
    expect(campo('Lote F1').value).toBe('2')
    expect(campo('Lote F2').value).toBe('1')
    expect(campo('Lote F1').disabled).toBe(false)
    expect(screen.getByTestId('conciliar-total').textContent).toBe('Se concilian 3 de 3 u.')
  })

  it('la variante viaja en el pedido de la vista previa', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [`GET ${CONCILIACION}`]: { ...CONCILIACION_FIDEOS, deposito_id: 2, variante_id: 4 } }, { puedeConciliar: true })
    await user.click(within(filaSinLote('Fideos', 1)).getByRole('button', { name: /Conciliar/ }))
    await within(dialogo()).findByLabelText('Lote F1')
    expect(pedidasAConciliacion()).toEqual([`GET ${CONCILIACION}?producto_id=8&deposito_id=2&variante_id=4`])
  })

  it('confirmar manda el cuerpo exacto con una clave_operacion; el éxito cierra, lo cuenta y vuelve a pedir la lista', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    await abrirConciliar(user)
    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: ' inventario de octubre ' } })
    await user.click(confirmar())

    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(1))
    expect(enviosA(CONCILIAR)[0]).toEqual({
      producto_id: 8, deposito_id: 1, variante_id: null,
      reparto: [{ lote: 'F1', vence: '2026-10-05', cantidad: 2 }, { lote: 'F2', vence: '2026-11-01', cantidad: 1 }],
      nota: 'inventario de octubre', clave_operacion: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const aviso = screen.getByRole('status')
    expect(texto(aviso)).toContain('Se conciliaron 3 u de Fideos: pasaron del “sin lote” a sus 2 lotes. Sin lote quedan 0 u.')
    // Refrescó la lista.
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(2))
  })

  it('la propuesta se puede editar: lo que queda en 0 o vacío no viaja, y se dice cuánto queda sin conciliar', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    await abrirConciliar(user)
    fireEvent.change(campo('Lote F1'), { target: { value: '1.5' } })
    fireEvent.change(campo('Lote F2'), { target: { value: '' } })
    expect(screen.getByTestId('conciliar-total').textContent).toBe('Se concilian 1,5 de 3 u.')
    expect(texto(dialogo())).toContain('Quedan 1,5 u en negativo sin conciliar')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(1))
    expect(enviosA(CONCILIAR)[0].reparto).toEqual([{ lote: 'F1', vence: '2026-10-05', cantidad: 1.5 }])
  })

  it('un lote sólo con fecha (sin código) viaja con lote null, tal como lo devolvió el motor', async () => {
    const user = userEvent.setup()
    const vista = {
      ...CONCILIACION_FIDEOS, a_conciliar: 1, saldo_sin_lote: -1,
      lotes: [{ lote: null, vence: '2026-10-05', saldo: 4, dias_para_vencer: 5, estado: 'vigente' as const }],
      propuesta: [{ lote: null, vence: '2026-10-05', cantidad: 1 }], cubierto: 1,
    }
    await abrir({ ...TODO, [`GET ${CONCILIACION}`]: vista }, { puedeConciliar: true })
    await user.click(within(filaSinLote('Fideos')).getByRole('button', { name: /Conciliar/ }))
    await within(dialogo()).findByLabelText('Lote (sin código)')
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(1))
    expect(enviosA(CONCILIAR)[0].reparto).toEqual([{ lote: null, vence: '2026-10-05', cantidad: 1 }])
  })

  it('🔴 un tramo mayor al saldo de su lote, un total mayor a lo negativo o un reparto en 0 no se mandan y dicen por qué', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    await abrirConciliar(user)

    // F1 tiene saldo 2: 2,5 no entra.
    fireEvent.change(campo('Lote F1'), { target: { value: '2.5' } })
    expect(texto(within(dialogo()).getAllByRole('alert')[0])).toBe('No puede pasar del saldo del lote (2).')
    expect(campo('Lote F1').getAttribute('aria-invalid')).toBe('true')
    await user.click(confirmar())
    expect(enviosA(CONCILIAR)).toHaveLength(0)

    // Cada tramo entra, pero 2 + 5 = 7 pasa de los 3 que están en negativo.
    fireEvent.change(campo('Lote F1'), { target: { value: '2' } })
    fireEvent.change(campo('Lote F2'), { target: { value: '5' } })
    await user.click(confirmar())
    expect(texto(within(dialogo()).getByRole('alert'))).toBe('El total no puede pasar de lo que está en negativo (3).')
    expect(enviosA(CONCILIAR)).toHaveLength(0)

    // Todo en 0 (o negativo) tampoco.
    fireEvent.change(campo('Lote F1'), { target: { value: '0' } })
    fireEvent.change(campo('Lote F2'), { target: { value: '-1' } })
    await user.click(confirmar())
    expect(texto(dialogo())).toContain('Tiene que ser un número mayor o igual a 0.')
    expect(enviosA(CONCILIAR)).toHaveLength(0)
    fireEvent.change(campo('Lote F2'), { target: { value: '' } })
    await user.click(confirmar())
    expect(texto(within(dialogo()).getByRole('alert'))).toBe('Cargá una cantidad en al menos un lote.')
    expect(enviosA(CONCILIAR)).toHaveLength(0)
  })

  it('el total tolera el ruido del punto flotante (0,1 + 0,2 no es más que 0,3)', async () => {
    const user = userEvent.setup()
    const vista = {
      ...CONCILIACION_FIDEOS, a_conciliar: 0.3, saldo_sin_lote: -0.3, propuesta: [{ lote: 'F1', vence: '2026-10-05', cantidad: 0.1 }, { lote: 'F2', vence: '2026-11-01', cantidad: 0.2 }],
      cubierto: 0.3,
    }
    await abrir({ ...TODO, [`GET ${CONCILIACION}`]: vista }, { puedeConciliar: true })
    await abrirConciliar(user)
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(1))
  })

  it('si los lotes no alcanzan (sin_cubrir > 0) avisa que ese resto es un faltante real, y el éxito lo repite', async () => {
    const user = userEvent.setup()
    const vista = { ...CONCILIACION_FIDEOS, propuesta: [{ lote: 'F1', vence: '2026-10-05', cantidad: 2 }], cubierto: 2, sin_cubrir: 1 }
    await abrir({
      ...TODO, [`GET ${CONCILIACION}`]: vista,
      [`POST ${CONCILIAR}`]: { ...CONCILIAR_OK, tramos: vista.propuesta, cantidad: 2, saldo_sin_lote: -1, sin_cubrir: 1 },
    }, { puedeConciliar: true })
    await abrirConciliar(user)
    expect(texto(within(dialogo()).getByText(/Los lotes no alcanzan a cubrir/))).toBe(
      'Los lotes no alcanzan a cubrir 1 u; ese resto es un faltante real: corregilo con un conteo físico.')
    await user.click(confirmar())
    const aviso = await screen.findByText(/Se conciliaron/)
    expect(texto(aviso)).toContain('Sin lote quedan -1 u.')
    expect(texto(aviso)).toContain('ese resto es un faltante real: corregilo con un conteo físico.')
  })

  it('cuando alcanza no hay aviso de faltante', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    await abrirConciliar(user)
    expect(within(dialogo()).queryByText(/faltante real/)).toBeNull()
  })

  it('sin lotes con saldo no hay entre qué repartir: lo dice y el faltante es todo', async () => {
    const user = userEvent.setup()
    const vista = { ...CONCILIACION_FIDEOS, lotes: [], propuesta: [], cubierto: 0, sin_cubrir: 3 }
    await abrir({ ...TODO, [`GET ${CONCILIACION}`]: vista }, { puedeConciliar: true })
    await user.click(within(filaSinLote('Fideos')).getByRole('button', { name: /Conciliar/ }))
    await within(dialogo()).findByText(/no tiene lotes con saldo/)
    expect(texto(dialogo())).toContain('faltante real')
    await user.click(confirmar())
    expect(texto(within(dialogo()).getByRole('alert'))).toBe('Cargá una cantidad en al menos un lote.')
    expect(enviosA(CONCILIAR)).toHaveLength(0)
  })

  it('si ya no hay nada en negativo (otro lo conciliò) lo dice y no deja confirmar', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [`GET ${CONCILIACION}`]: { ...CONCILIACION_FIDEOS, saldo_sin_lote: 0, a_conciliar: 0, propuesta: [], cubierto: 0 } }, { puedeConciliar: true })
    await user.click(within(filaSinLote('Fideos')).getByRole('button', { name: /Conciliar/ }))
    await within(dialogo()).findByText(/no hay nada que conciliar/)
    expect((within(dialogo()).getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('mientras llega la vista previa dice «Consultando…» y no deja confirmar; si falla muestra el detail y ofrece reintentar', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [`GET ${CONCILIACION}`]: { status: 404, detail: 'el producto 8 no existe' } }, { puedeConciliar: true })
    await user.click(within(filaSinLote('Fideos')).getByRole('button', { name: /Conciliar/ }))
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('el producto 8 no existe')
    expect((within(dialogo()).getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true)

    responder(TODO)
    await user.click(within(dialogo()).getByRole('button', { name: 'Reintentar' }))
    await within(dialogo()).findByLabelText('Lote F1')
    expect(pedidasAConciliacion()).toHaveLength(2)
  })

  it('los controles del diálogo miden 44 px bajo 1024 px', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    await abrirConciliar(user)
    expect(campo('Lote F1').className).toContain('max-lg:h-11')
    expect(within(dialogo()).getByRole('button', { name: 'Confirmar' }).className).toContain('max-lg:h-11')
    expect(within(dialogo()).getByRole('button', { name: 'Cancelar' }).className).toContain('max-lg:h-11')
  })
})

describe('Vencimientos: conciliar, errores y la clave de la operación', () => {
  it('un 409 o un 422 del motor se muestran con su detail, el diálogo queda abierto y no queda nada pendiente', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    secuencia(CONCILIAR, [() => json({ detail: 'el lote F1 tiene 1 en el depósito 1 y se quieren conciliar 2' }, 409)])
    await abrirConciliar(user)
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('el lote F1 tiene 1 en el depósito 1 y se quieren conciliar 2')
    expect(screen.queryByText(/Se conciliaron/)).toBeNull()
    expect(sessionStorage.getItem('libra-ui:vencimientos:pendientes')).toBe('{}')

    secuencia(CONCILIAR, [() => json({ detail: [{ msg: 'reparto: lista vacía' }] }, 422)])
    await user.click(confirmar())
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('reparto: lista vacía')
  })

  it('🔑 tras un 409 sin cambiar nada se reintenta con la MISMA clave; al cambiar el reparto o la nota, con otra; al reabrir el diálogo, con otra', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    secuencia(CONCILIAR, [() => json({ detail: 'no' }, 409), () => json({ detail: 'no' }, 409), () => json({ detail: 'no' }, 409), () => json({ detail: 'no' }, 409)])
    await abrirConciliar(user)
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(1))
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(2))
    expect(clavesDe(CONCILIAR)[1]).toBe(clavesDe(CONCILIAR)[0])

    fireEvent.change(campo('Lote F2'), { target: { value: '0.5' } })
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(3))
    expect(clavesDe(CONCILIAR)[2]).not.toBe(clavesDe(CONCILIAR)[0])

    fireEvent.change(within(dialogo()).getByLabelText('Nota'), { target: { value: 'otra' } })
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(4))
    expect(clavesDe(CONCILIAR)[3]).not.toBe(clavesDe(CONCILIAR)[2])

    // Cerrar y abrir de nuevo es otro intento, aun con los mismos datos que el primero.
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    await abrirConciliar(user)
    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(5))
    expect(enviosA(CONCILIAR)[4].reparto).toEqual(enviosA(CONCILIAR)[0].reparto)
    expect(new Set(clavesDe(CONCILIAR)).size).toBe(4)
  })

  it('repetida: true es un éxito («ya estaba registrado»), no un error', async () => {
    const user = userEvent.setup()
    await abrir({ ...TODO, [`POST ${CONCILIAR}`]: { ...CONCILIAR_OK, repetida: true } }, { puedeConciliar: true })
    await abrirConciliar(user)
    await user.click(confirmar())
    const aviso = await screen.findByText(/Ya estaba registrado/)
    expect(aviso.getAttribute('role')).toBe('status')
    expect(texto(aviso)).toContain('no se movió stock de nuevo')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('doble clic en «Confirmar»: un solo envío', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    let soltar: (r: Response) => void = () => {}
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) =>
      String(entrada) === CONCILIAR && init?.method === 'POST' ? new Promise<Response>((r) => { soltar = r }) : base(entrada, init))
    await abrirConciliar(user)
    await user.dblClick(confirmar())
    expect(enviosA(CONCILIAR)).toHaveLength(1)
    expect((within(dialogo()).getByRole('button', { name: 'Guardando…' }) as HTMLButtonElement).disabled).toBe(true)
    soltar(json(CONCILIAR_OK))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(CONCILIAR)).toHaveLength(1)
  })
})

describe('Vencimientos: una conciliación incierta bloquea su destino hasta reenviarla o descartarla', () => {
  const FIRMA_FIDEOS = JSON.stringify(['conciliar', 8, 1, null])
  const guardado = () => JSON.parse(sessionStorage.getItem('libra-ui:vencimientos:pendientes') ?? '{}') as Record<string, { cuerpo: Record<string, unknown>; tipo: string }>
  const panel = () => within(dialogo()).queryByText(/Hay un intento anterior sin confirmar para esta misma operación/)

  it('🔑 tras un timeout queda guardada con su cuerpo y su clave, bloquea el reparto y la nota, marca la fila y se reenvía IGUAL (repetida:true cierra como éxito y limpia)', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    secuencia(CONCILIAR, [() => 'caida', () => json({ ...CONCILIAR_OK, repetida: true })])
    await abrirConciliar(user)
    await user.click(confirmar())
    expect((await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)).getAttribute('role')).toBe('alert')

    const entradas = Object.entries(guardado())
    expect(entradas).toHaveLength(1)
    expect(entradas[0][0]).toBe(FIRMA_FIDEOS)
    expect(entradas[0][1].tipo).toBe('conciliar')
    expect(entradas[0][1].cuerpo).toEqual(enviosA(CONCILIAR)[0])
    expect(panel()).toBeTruthy()
    expect(campo('Lote F1').disabled).toBe(true)
    expect(campo('Lote F2').disabled).toBe(true)
    expect((within(dialogo()).getByLabelText('Nota') as HTMLTextAreaElement).disabled).toBe(true)
    // Los valores que se ven son los del intento original, no los de la propuesta ni los editados.
    expect(campo('Lote F1').value).toBe('2')
    expect(within(dialogo()).queryByRole('button', { name: 'Confirmar' })).toBeNull()

    // La fila lo marca; cerrar y volver a abrir lo sigue mostrando.
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    expect(within(filaSinLote('Fideos', 0)).getByText('Intento sin confirmar')).toBeTruthy()
    expect(within(filaSinLote('Fideos', 1)).queryByText('Intento sin confirmar')).toBeNull()
    await user.click(within(filaSinLote('Fideos')).getByRole('button', { name: /Conciliar/ }))
    expect(panel()).toBeTruthy()
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(CONCILIAR)).toHaveLength(2)
    expect(enviosA(CONCILIAR)[1]).toEqual(enviosA(CONCILIAR)[0])
    expect((await screen.findByText(/Ya estaba registrado/)).getAttribute('role')).toBe('status')
    expect(guardado()).toEqual({})
  })

  it('🔑 reenviar no depende de la vista previa: con el GET caído igual se puede reenviar el intento guardado', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    secuencia(CONCILIAR, [() => 'caida', () => json({ ...CONCILIAR_OK, repetida: true })])
    await abrirConciliar(user)
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))

    responder({ ...TODO, [`GET ${CONCILIACION}`]: { status: 500, detail: 'caído' } })
    secuencia(CONCILIAR, [() => json({ ...CONCILIAR_OK, repetida: true })])
    await user.click(within(filaSinLote('Fideos')).getByRole('button', { name: /Conciliar/ }))
    await within(dialogo()).findByText('caído')
    await user.click(confirmar())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enviosA(CONCILIAR).at(-1)).toEqual(enviosA(CONCILIAR)[0])
  })

  it('🔑 descartar exige confirmación; recién entonces se puede conciliar de nuevo, con clave NUEVA', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    secuencia(CONCILIAR, [() => 'caida', () => json(CONCILIAR_OK)])
    await abrirConciliar(user)
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)

    await user.click(within(dialogo()).getByRole('button', { name: 'Descartar el intento anterior…' }))
    expect(Object.keys(guardado())).toHaveLength(1)
    await user.click(within(dialogo()).getByRole('button', { name: 'Sí, descartar el intento anterior' }))
    expect(guardado()).toEqual({})
    expect(panel()).toBeNull()
    expect(campo('Lote F1').disabled).toBe(false)

    await user.click(confirmar())
    await waitFor(() => expect(enviosA(CONCILIAR)).toHaveLength(2))
    expect(clavesDe(CONCILIAR)[1]).not.toBe(clavesDe(CONCILIAR)[0])
  })

  it('un intento incierto de conciliar no bloquea otro depósito/variante, ni una baja de lote', async () => {
    const user = userEvent.setup()
    await abrir(TODO, { puedeConciliar: true })
    secuencia(CONCILIAR, [() => 'caida'])
    await abrirConciliar(user)
    await user.click(confirmar())
    await within(dialogo()).findByText(/No se sabe si se llegó a registrar/)
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))

    // La otra fila (otro depósito y variante) sigue libre.
    responder({ ...TODO, [`GET ${CONCILIACION}`]: { ...CONCILIACION_FIDEOS, deposito_id: 2, variante_id: 4 } })
    await user.click(within(filaSinLote('Fideos', 1)).getByRole('button', { name: /Conciliar/ }))
    await within(dialogo()).findByLabelText('Lote F1')
    expect(panel()).toBeNull()
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    // Y la baja de un lote también.
    await abrirMerma(user)
    expect(panel()).toBeNull()
  })
})

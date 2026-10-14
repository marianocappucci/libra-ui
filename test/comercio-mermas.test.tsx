// Mermas valoradas (0.151.0, ADR-063): el reporte de mermas por período (`GET /api/reportes/mermas`) y la columna «Importe» de los historiales de movimientos de stock.
// La cuenta es del motor (ADR-059); lo que se prueba acá es lo que la pantalla decide: qué pide, qué avisa del costo que falta (el importe es un piso), a dónde apunta el CSV, cómo se ve
// en tarjetas, y que el historial muestra el importe SÓLO si el backend lo manda (si no, ni la columna).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Mermas } from '../src/comercio/Mermas'
import { Stock } from '../src/comercio/Stock'
import { StockMovimientos } from '../src/comercio/StockMovimientos'
import type { MermasData, MovimientoStock } from '../src/comercio/tipos'
import { hoyISO, primerDiaDelMesISO } from '../src/fechas'
import { montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

/** El ancho que informa el `ResizeObserver` falso: 0 = sin medida (se queda la tabla), como en jsdom. */
let anchoSimulado = 0
class ObservadorFalso {
  constructor(private readonly cb: (e: { contentRect: { width: number } }[]) => void) {}
  observe() { this.cb([{ contentRect: { width: anchoSimulado } }]) }
  disconnect() {}
  unobserve() {}
}

const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ')

beforeEach(() => {
  cleanup()
  prepararFetch()
  anchoSimulado = 0
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
})
afterEach(() => { vi.unstubAllGlobals() })

// ── Mermas ───────────────────────────────────────────────────────────────────────────────────────────────────────

const DATA: MermasData = {
  desde: '2026-10-01', hasta: '2026-10-14', deposito_id: null, producto_id: null,
  resumen: { cantidad: 12, costo_total: 540, movimientos: 5, movimientos_sin_costo: 0, cantidad_sin_costo: 0, sin_costo: false, productos: 2, productos_sin_costo: 0 },
  productos: [
    { producto_id: 1, codigo: 'Y-1', nombre: 'Yerba', unidad: 'u', cantidad: 9, costo_total: 540, movimientos: 3, movimientos_sin_costo: 0, cantidad_sin_costo: 0, sin_costo: false },
    { producto_id: 2, codigo: null, nombre: 'Queso', unidad: 'kg', cantidad: 1.5, costo_total: 0, movimientos: 2, movimientos_sin_costo: 0, cantidad_sin_costo: 0, sin_costo: false },
  ],
}
const SIN_COSTO: MermasData = {
  ...DATA,
  resumen: { ...DATA.resumen, costo_total: 240, movimientos_sin_costo: 3, cantidad_sin_costo: 5, sin_costo: true, productos_sin_costo: 2 },
  productos: [
    { ...DATA.productos[0], costo_total: 240, movimientos: 3, movimientos_sin_costo: 1, cantidad_sin_costo: 2, sin_costo: true },
    { ...DATA.productos[1], costo_total: 0, movimientos: 2, movimientos_sin_costo: 2, cantidad_sin_costo: 3, sin_costo: true },
  ],
}

const RUTA = '/api/reportes/mermas'
const hoy = hoyISO()
const desdeDefault = primerDiaDelMesISO()
const pide = (extra = '') => `GET ${RUTA}?desde=${desdeDefault}&hasta=${hoy}${extra}`
const DEPOSITOS = [
  { id: 1, nombre: 'Central', descripcion: '', es_default: 1, activo: 1, branch_id: 1 },
  { id: 2, nombre: 'Salón', descripcion: '', es_default: 0, activo: 1, branch_id: 2 },
  { id: 3, nombre: 'Viejo', descripcion: '', es_default: 0, activo: 0, branch_id: 1 },
]
const SUCURSALES = [{ id: 1, nombre: 'Centro' }, { id: 2, nombre: 'Norte' }]
const TODO = { [RUTA]: DATA, '/api/depositos': DEPOSITOS, '/api/sucursales': SUCURSALES }
const reportes = () => pedidas().filter((p) => p.startsWith(`GET ${RUTA}?`))

describe('Mermas: lo que muestra', () => {
  it('pide el mes en curso y muestra el importe, la cantidad de mermas y los productos con su cantidad, mermas e importe', async () => {
    responder(TODO)
    montar('/mermas', <Mermas />)
    expect(await screen.findByText('Mermas por producto')).toBeTruthy()
    expect(reportes()).toEqual([pide()])
    expect(screen.getByRole('heading', { name: 'Mermas' })).toBeTruthy()

    expect(screen.getByText('Importe perdido')).toBeTruthy()
    expect(screen.getAllByText('$ 540,00').length).toBeGreaterThan(0)
    expect(screen.getByText('Mermas registradas')).toBeTruthy()
    expect(screen.getByText('2 productos')).toBeTruthy()

    const yerba = screen.getByRole('button', { name: 'Yerba' }).closest('tr')!
    expect(texto(yerba)).toContain('Y-1')
    expect(texto(yerba)).toContain('9 u')
    expect(texto(yerba)).toContain('$ 540,00')
    const queso = screen.getByRole('button', { name: 'Queso' }).closest('tr')!
    expect(texto(queso)).toContain('1,5 kg')
    expect(texto(queso)).toContain('—')   // sin código
    // Con todo valorizado no hay aviso del costo.
    expect(screen.queryByText(/sin costo cargado/)).toBeNull()
  })

  it('🔴 el importe es un piso: con mermas sin costo avisa cuántas faltan y cada producto dice qué le falta', async () => {
    responder({ ...TODO, [RUTA]: SIN_COSTO })
    montar('/mermas', <Mermas />)
    const aviso = await screen.findByText(/El importe no incluye/)
    expect(texto(aviso)).toContain('El importe no incluye 3 mermas sin costo cargado (2 productos)')
    expect(aviso.closest('p')!.getAttribute('role')).toBe('status')
    expect(screen.getByText('sin contar las mermas sin costo')).toBeTruthy()

    // Parcial: el importe de las que tienen costo y cuántas faltan. Todo sin costo: un guion, no un cero.
    expect(texto(screen.getByRole('button', { name: 'Yerba' }).closest('tr'))).toContain('$ 240,00 (sin costo en 1 merma)')
    const queso = texto(screen.getByRole('button', { name: 'Queso' }).closest('tr'))
    expect(queso).toContain('— (sin costo cargado)')
    expect(queso).not.toContain('$ 0,00')
  })

  it('con una sola merma sin costo habla en singular', async () => {
    responder({ ...TODO, [RUTA]: { ...SIN_COSTO, resumen: { ...SIN_COSTO.resumen, movimientos_sin_costo: 1, productos_sin_costo: 1 } } })
    montar('/mermas', <Mermas />)
    expect(texto(await screen.findByText(/El importe no incluye/))).toContain('El importe no incluye 1 merma sin costo cargado (1 producto)')
  })

  it('sin mermas en el período lo dice, y el error del motor (403, 422) se ve', async () => {
    responder({ ...TODO, [RUTA]: { ...DATA, resumen: { ...DATA.resumen, movimientos: 0, costo_total: 0, productos: 0 }, productos: [] } })
    montar('/mermas', <Mermas />)
    expect(await screen.findByText('No hay mermas en el período.')).toBeTruthy()

    cleanup()
    responder({ ...TODO, [RUTA]: { status: 403, detail: 'No tenés permiso para ver costos' } })
    montar('/mermas', <Mermas />)
    expect((await screen.findByRole('alert')).textContent).toBe('No tenés permiso para ver costos')
    expect(screen.queryByText('Mermas por producto')).toBeNull()
  })
})

describe('Mermas: lo que pide', () => {
  it('las fechas se editan y viajan en el pedido; el reporte anterior no se ve bajo filtros nuevos', async () => {
    responder(TODO)
    montar('/mermas', <Mermas />)
    await screen.findByText('Mermas por producto')
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } })
    await waitFor(() => expect(reportes().at(-1)).toBe(`GET ${RUTA}?desde=2026-09-01&hasta=2026-09-30`))
  })

  it('con varios depósitos hay filtro (sólo los activos, con su sucursal) y viaja deposito_id; con uno solo no hay filtro', async () => {
    const user = userEvent.setup()
    responder(TODO)
    montar('/mermas', <Mermas />)
    await screen.findByText('Mermas por producto')
    await user.click(screen.getByRole('combobox', { name: 'Depósito' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos los depósitos', 'Centro · Central', 'Norte · Salón'])
    await user.click(screen.getByRole('option', { name: 'Norte · Salón' }))
    await waitFor(() => expect(reportes().at(-1)).toBe(pide('&deposito_id=2')))
    await user.click(screen.getByRole('combobox', { name: 'Depósito' }))
    await user.click(screen.getByRole('option', { name: 'Todos los depósitos' }))
    await waitFor(() => expect(reportes().at(-1)).toBe(pide()))

    cleanup()
    prepararFetch()
    responder({ ...TODO, '/api/depositos': [DEPOSITOS[0]] })
    montar('/mermas', <Mermas />)
    await screen.findByText('Mermas por producto')
    expect(screen.queryByLabelText('Depósito')).toBeNull()
  })

  it('sin depósitos (la consulta falla) la pantalla sigue, sin ese filtro', async () => {
    responder({ ...TODO, '/api/depositos': { status: 403, detail: 'no' } })
    montar('/mermas', <Mermas />)
    expect(await screen.findByText('Mermas por producto')).toBeTruthy()
    expect(screen.queryByLabelText('Depósito')).toBeNull()
  })

  it('tocar un producto filtra por él (producto_id) y «Quitar filtro» vuelve a todos', async () => {
    const user = userEvent.setup()
    responder(TODO)
    montar('/mermas', <Mermas />)
    await screen.findByText('Mermas por producto')
    await user.click(screen.getByRole('button', { name: 'Yerba' }))
    await waitFor(() => expect(reportes().at(-1)).toBe(pide('&producto_id=1')))
    await user.click(await screen.findByRole('button', { name: /Quitar filtro/ }))
    await waitFor(() => expect(reportes().at(-1)).toBe(pide()))
  })

  it('el CSV apunta al export del motor con la misma consulta que la lista', async () => {
    const user = userEvent.setup()
    responder(TODO)
    montar('/mermas', <Mermas />)
    await screen.findByText('Mermas por producto')
    expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(`${RUTA}/export?desde=${desdeDefault}&hasta=${hoy}`)
    await user.click(screen.getByRole('combobox', { name: 'Depósito' }))
    await user.click(screen.getByRole('option', { name: 'Centro · Central' }))
    await waitFor(() => expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(`${RUTA}/export?desde=${desdeDefault}&hasta=${hoy}&deposito_id=1`))
  })

  it('un rango al revés (422 del motor) se muestra y saca la tabla', async () => {
    responder({ ...TODO, [RUTA]: { status: 422, detail: 'desde (2026-10-02) no puede ser posterior a hasta (2026-10-01)' } })
    montar('/mermas', <Mermas />)
    expect((await screen.findByRole('alert')).textContent).toContain('no puede ser posterior a hasta')
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('Mermas: tabla o tarjetas, y el modo táctil', () => {
  it('con ancho de sobra es la tabla; ordenar por importe es de la pantalla (no vuelve a pedir)', async () => {
    anchoSimulado = 1600
    const user = userEvent.setup()
    responder(TODO)
    montar('/mermas', <Mermas />)
    await screen.findByText('Mermas por producto')
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Mermas por producto' })).toBeNull()
    const nombres = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => r.querySelector('button')?.textContent)
    expect(nombres()).toEqual(['Yerba', 'Queso'])
    await user.click(screen.getByRole('button', { name: 'Importe' }))
    expect(nombres()).toEqual(['Queso', 'Yerba'])   // ascendente
    await user.click(screen.getByRole('button', { name: 'Importe' }))
    expect(nombres()).toEqual(['Yerba', 'Queso'])
    expect(reportes()).toHaveLength(1)
  })

  it('angosto: tarjetas, sin tabla ni scroll de costado, con el producto como botón de 44 px y los mismos datos', async () => {
    anchoSimulado = 360
    const user = userEvent.setup()
    responder({ ...TODO, [RUTA]: SIN_COSTO })
    montar('/mermas', <Mermas />)
    await screen.findByText('Mermas por producto')
    expect(screen.queryByRole('table')).toBeNull()
    const tarjetas = within(screen.getByRole('list', { name: 'Mermas por producto' })).getAllByRole('listitem')
    expect(tarjetas).toHaveLength(2)
    expect(texto(tarjetas[0])).toContain('Yerba')
    expect(texto(tarjetas[0])).toContain('Y-1')
    expect(texto(tarjetas[0])).toContain('9 u')
    expect(texto(tarjetas[0])).toContain('$ 240,00 (sin costo en 1 merma)')
    expect(texto(tarjetas[1])).toContain('— (sin costo cargado)')
    const boton = within(tarjetas[0]).getByRole('button', { name: 'Yerba' })
    expect(boton.className).toContain('min-h-11')
    await user.click(boton)
    await waitFor(() => expect(reportes().at(-1)).toBe(pide('&producto_id=1')))
  })

  it('las fechas y los botones miden 44 px bajo 1024 px', async () => {
    responder(TODO)
    montar('/mermas', <Mermas />)
    await screen.findByText('Mermas por producto')
    expect(screen.getByLabelText('Desde').className).toContain('max-lg:h-11')
    expect(screen.getByLabelText('Hasta').className).toContain('max-lg:h-11')
    expect(screen.getByRole('link', { name: /CSV/ }).className).toContain('max-lg:h-11')
  })
})

// ── El historial de movimientos de stock ──────────────────────────────────────────────────────────────────────────

const mov = (o: Partial<MovimientoStock>): MovimientoStock => ({
  id: 1, producto_id: 1, producto_nombre: 'Yerba', unidad: 'u', tipo: 'venta', cantidad: -1, referencia: '', fecha: '2026-10-06', ...o,
})
/** Como los manda el motor con `con_costo_de_merma`: las tres claves en TODAS las filas, llenas sólo en las mermas. */
const CON_COSTO: MovimientoStock[] = [
  mov({ id: 3, tipo: 'merma', cantidad: -4, referencia: 'Merma: Vencimiento', costo_unitario: 60, costo_total: 240, sin_costo: false }),
  mov({ id: 2, tipo: 'merma', cantidad: -1, referencia: 'Merma: Rotura', costo_unitario: null, costo_total: null, sin_costo: true }),
  mov({ id: 1, tipo: 'venta', cantidad: -2, referencia: 'Venta 10', costo_unitario: null, costo_total: null, sin_costo: null }),
]
/** Lo que llega a quien no puede ver costos: el producto SACA las claves. */
const SIN_CLAVES: MovimientoStock[] = CON_COSTO.map(({ costo_unitario: _a, costo_total: _b, sin_costo: _c, ...resto }) => resto)

function montarHistorial() {
  return render(
    <MemoryRouter initialEntries={['/stock/movimientos']}>
      <Routes><Route path="/stock/movimientos" element={<StockMovimientos />} /></Routes>
    </MemoryRouter>,
  )
}
const encabezados = () => screen.getAllByRole('columnheader').map((h) => texto(h))

describe('StockMovimientos: el importe de las mermas', () => {
  it('si las filas traen el costo hay una columna «Importe»: el importe de la merma, «—» y «sin costo» si no tiene, y vacía en los demás tipos', async () => {
    responder({ '/api/productos': [], '/api/stock/movimientos': CON_COSTO })
    montarHistorial()
    await screen.findByText('Merma: Vencimiento')
    expect(encabezados()).toContain('Importe')
    // Entre «Cantidad» y «Referencia».
    const h = encabezados()
    expect(h.indexOf('Importe')).toBe(h.indexOf('Cantidad') + 1)
    expect(h.indexOf('Importe')).toBe(h.indexOf('Referencia') - 1)

    const celda = (referencia: string) => {
      const fila = screen.getByText(referencia).closest('tr')!
      return fila.querySelectorAll('td')[h.indexOf('Importe')]
    }
    expect(texto(celda('Merma: Vencimiento'))).toBe('$ 240,00')
    expect(texto(celda('Merma: Rotura'))).toBe('— sin costo')
    expect(celda('Merma: Rotura').querySelector('[title]')!.getAttribute('title')).toContain('no tiene costo cargado')
    expect(texto(celda('Venta 10'))).toBe('')
  })

  it('🔴 sin las claves de costo (un rol sin costos.ver, un motor anterior) no hay columna «Importe» ni nada de importe', async () => {
    responder({ '/api/productos': [], '/api/stock/movimientos': SIN_CLAVES })
    montarHistorial()
    await screen.findByText('Merma: Vencimiento')
    expect(encabezados()).not.toContain('Importe')
    expect(screen.queryByText(/sin costo/)).toBeNull()
    expect(screen.queryByText(/\$/)).toBeNull()
    // Las columnas de siempre.
    expect(encabezados()).toEqual(expect.arrayContaining(['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Referencia']))
  })

  it('la columna se detecta por los datos, fila a fila: con las claves en null en todas (sin ninguna merma) igual aparece, vacía', async () => {
    responder({ '/api/productos': [], '/api/stock/movimientos': [CON_COSTO[2]] })
    montarHistorial()
    await screen.findByText('Venta 10')
    expect(encabezados()).toContain('Importe')
  })
})

describe('Stock: el importe de las mermas en el historial embebido', () => {
  const STOCK = {
    '/api/stock': { productos: [{ id: 1, codigo: 'Y001', nombre: 'Yerba', unidad: 'u', categoria: '', stock_minimo: 0, activo: 1, stock_actual: 3 }], alertas: [] },
    '/api/stock/motivos-merma': [],
  }

  async function abrirHistorial(movimientos: MovimientoStock[], ancho: number) {
    anchoSimulado = ancho
    const user = userEvent.setup()
    responder({ ...STOCK, '/api/stock/movimientos': movimientos })
    render(<MemoryRouter><Stock /></MemoryRouter>)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Historial de movimientos/ }))
    await screen.findByText(/Merma: Vencimiento/)
  }

  it('ancho: la tabla del historial suma la columna «Importe» sólo si el backend manda el costo', async () => {
    await abrirHistorial(CON_COSTO, 1600)
    const tablas = screen.getAllByRole('table')
    const historial = tablas[tablas.length - 1]
    const h = within(historial).getAllByRole('columnheader').map((c) => texto(c))
    expect(h).toContain('Importe')
    const fila = within(historial).getByText('Merma: Vencimiento').closest('tr')!
    expect(texto(fila.querySelectorAll('td')[h.indexOf('Importe')])).toBe('$ 240,00')
    expect(texto(within(historial).getByText('Merma: Rotura').closest('tr')!.querySelectorAll('td')[h.indexOf('Importe')])).toBe('— sin costo')
  })

  it('🔴 ancho y sin las claves: ninguna columna nueva', async () => {
    await abrirHistorial(SIN_CLAVES, 1600)
    const tablas = screen.getAllByRole('table')
    const h = within(tablas[tablas.length - 1]).getAllByRole('columnheader').map((c) => texto(c))
    expect(h).not.toContain('Importe')
  })

  it('en lista el importe va en la línea de la merma, y las ventas no dicen nada; sin claves no hay línea de importe', async () => {
    await abrirHistorial(CON_COSTO, 400)
    const filas = screen.getAllByRole('listitem')
    const deLaMerma = filas.find((li) => li.textContent?.includes('Merma: Vencimiento'))!
    expect(texto(deLaMerma)).toContain('Importe: $ 240,00')
    expect(texto(filas.find((li) => li.textContent?.includes('Merma: Rotura'))!)).toContain('Importe: — sin costo')
    expect(texto(filas.find((li) => li.textContent?.includes('Venta 10'))!)).not.toContain('Importe')

    cleanup()
    prepararFetch()
    await abrirHistorial(SIN_CLAVES, 400)
    expect(screen.queryByText(/Importe/)).toBeNull()
  })

  it('con el importe, la tabla necesita más ancho antes de pasar a lista (la columna suma 110 px)', async () => {
    // 760 px alcanza para la tabla de siempre (umbral 720) pero no para la tabla con la columna nueva (830).
    await abrirHistorial(SIN_CLAVES, 760)
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0)
    cleanup()
    prepararFetch()
    await abrirHistorial(CON_COSTO, 760)
    const tablas = screen.queryAllByRole('table')
    expect(tablas.some((t) => within(t).queryByText('Merma: Vencimiento'))).toBe(false)
    expect(screen.getAllByRole('listitem').some((li) => li.textContent?.includes('Merma: Vencimiento'))).toBe(true)
  })
})


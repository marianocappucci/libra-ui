// Margen y rotación (0.87.0, tanda 1 del roadmap de VentaLibra): la pantalla sobre
// `GET /api/reportes/margen`. La cuenta es del motor; lo que se prueba acá es lo que
// la pantalla decide: qué pide, cómo ordena, qué avisa del costo y a dónde apuntan los CSV.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Margen } from '../src/comercio/Margen'
import type { MargenData } from '../src/comercio/tipos'
import { hoyISO, primerDiaDelMesISO } from '../src/fechas'
import { fetchMock, json, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const DATA: MargenData = {
  desde: '2026-09-01', hasta: '2026-09-30', agrupacion: 'dia', producto_id: null, orden: 'margen', sentido: 'desc',
  resumen: {
    unidades: 7, ingreso: 1000, costo: 600, margen: 400, margen_pct: 40, costo_estimado: false, sin_costo: false,
    productos: 2, productos_costo_estimado: 0, productos_sin_costo: 0, dias: 30,
  },
  productos: [
    { producto_id: 1, nombre: 'Yerba', unidades: 4, unidades_por_dia: 0.13, ingreso: 800, costo: 480, margen: 320, margen_pct: 40,
      costo_estimado: false, sin_costo: false },
    { producto_id: 2, nombre: 'Azúcar', unidades: 3, unidades_por_dia: null, ingreso: 200, costo: 120, margen: 80, margen_pct: 40,
      costo_estimado: false, sin_costo: false },
  ],
  periodos: [
    { periodo: '2026-09-01', unidades: 5, ingreso: 700, costo: 420, margen: 280, margen_pct: 40, costo_estimado: false, sin_costo: false },
    { periodo: '2026-09-02', unidades: 2, ingreso: 300, costo: 180, margen: 120, margen_pct: 40, costo_estimado: false, sin_costo: false },
  ],
}

const hoy = hoyISO()
const desdeDefault = primerDiaDelMesISO()
const RUTA = '/api/reportes/margen'
/** Lo que pide la pantalla, en el orden en que arma la consulta. */
const pide = (extra = '', base = `desde=${desdeDefault}&hasta=${hoy}`) => `GET ${RUTA}?${base}&orden=margen&sentido=desc${extra}&agrupacion=dia`

/** Sin espacios raros: el formateador de moneda de es-AR usa un espacio duro entre el signo y el número. */
const texto = (el: HTMLElement | null) => (el?.textContent ?? '').replace(/\s/g, ' ')

beforeEach(() => {
  cleanup()
  prepararFetch()
})

describe('Margen: lo que muestra', () => {
  it('pide el mes en curso y muestra los KPIs, los productos con su rotación y los períodos', async () => {
    responder({ [RUTA]: DATA })
    montar('/margen', <Margen />)
    expect(await screen.findByText('Margen y rotación por producto')).toBeTruthy()
    expect(pedidas()[0]).toBe(pide())

    // KPIs: ingreso, costo, margen (con su %) y unidades.
    expect(texto(screen.getByText('$ 1.000,00'))).toBe('$ 1.000,00')
    expect(screen.getByText('$ 600,00')).toBeTruthy()
    expect(screen.getByText('$ 400,00')).toBeTruthy()
    expect(screen.getByText('40 % sobre el ingreso')).toBeTruthy()
    expect(screen.getByText('2 productos')).toBeTruthy()

    const yerba = screen.getByRole('button', { name: 'Yerba' }).closest('tr')!
    expect(texto(yerba)).toContain('Yerba')
    expect(texto(yerba)).toContain('$ 800,00')
    expect(texto(yerba)).toContain('$ 480,00')
    expect(texto(yerba)).toContain('$ 320,00')
    expect(texto(yerba)).toContain('0,13') // por día
    // Sin rango cerrado el motor manda `null`: un guion, no un cero.
    expect(texto(screen.getByRole('button', { name: 'Azúcar' }).closest('tr'))).toContain('—')

    // Períodos, con la fecha en dd-mm-aaaa.
    expect(screen.getByText('01-09-2026')).toBeTruthy()
    expect(screen.getByText('02-09-2026')).toBeTruthy()
  })

  it('sin costo o con costo estimado se avisa, y una fila lo dice; con costos reales no se avisa nada', async () => {
    responder({ [RUTA]: {
      ...DATA,
      resumen: { ...DATA.resumen, productos_costo_estimado: 1, productos_sin_costo: 2 },
      productos: [
        { ...DATA.productos[0], costo_estimado: true },
        { ...DATA.productos[1], sin_costo: true, margen_pct: 100 },
      ],
    } })
    montar('/margen', <Margen />)
    await screen.findByText('Margen y rotación por producto')
    const avisos = screen.getAllByRole('status').map((a) => texto(a))
    expect(avisos).toHaveLength(2)
    expect(avisos[0]).toContain('2 productos no tienen costo cargado')
    expect(avisos[0]).toContain('no lo es')
    expect(avisos[1]).toContain('1 producto usa el costo de hoy')
    expect(avisos[1]).toContain('estimación')
    expect(texto(screen.getByRole('button', { name: 'Yerba' }).closest('tr'))).toContain('(costo estimado)')
    expect(texto(screen.getByRole('button', { name: 'Azúcar' }).closest('tr'))).toContain('(sin costo cargado)')

    cleanup()
    responder({ [RUTA]: DATA })
    montar('/margen', <Margen />)
    await screen.findByText('Margen y rotación por producto')
    expect(screen.queryAllByRole('status')).toHaveLength(0)
    expect(screen.queryByText(/costo estimado|sin costo cargado/)).toBeNull()
  })

  it('un margen negativo va en rojo y sin ingreso el porcentaje es un guion', async () => {
    responder({ [RUTA]: {
      ...DATA,
      productos: [{ ...DATA.productos[0], margen: -50, margen_pct: null }],
    } })
    montar('/margen', <Margen />)
    await screen.findByText('Margen y rotación por producto')
    const fila = screen.getByRole('button', { name: 'Yerba' }).closest('tr')!
    expect(fila.querySelector('.text-destructive')?.textContent).toMatch(/50,00/)
    expect(fila.querySelectorAll('td')[6].textContent).toBe('—')
  })

  it('sin ventas dice que no hay, y el error de la API o de la red se muestra', async () => {
    responder({ [RUTA]: { ...DATA, productos: [], periodos: [] } })
    montar('/margen', <Margen />)
    expect(await screen.findAllByText('Sin ventas en el período.')).toHaveLength(2)

    cleanup()
    responder({ [RUTA]: { status: 403, detail: 'Solo admin' } })
    montar('/margen', <Margen />)
    expect(await screen.findByText('Solo admin')).toBeTruthy()

    cleanup()
    responder({ [RUTA]: '!caida' })
    montar('/margen', <Margen />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })
})

describe('Margen: filtros, orden y CSV', () => {
  it('ordenar es pedirle el orden al servidor, y un segundo click invierte el sentido', async () => {
    responder({ [RUTA]: DATA })
    const user = userEvent.setup()
    montar('/margen', <Margen />)
    await screen.findByText('Margen y rotación por producto')
    // Los encabezados ordenables son los de la tabla de productos (la de períodos no se reordena).
    const productos = () => within(screen.getAllByRole('table')[0])
    expect(productos().getByRole('columnheader', { name: /Margen ▼/ }).getAttribute('aria-sort')).toBe('descending')
    expect(productos().getByRole('columnheader', { name: 'Ingreso' }).getAttribute('aria-sort')).toBe('none')

    await user.click(screen.getByRole('button', { name: 'Ingreso' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe(
      `GET ${RUTA}?desde=${desdeDefault}&hasta=${hoy}&orden=ingreso&sentido=desc&agrupacion=dia`))
    await user.click(screen.getByRole('button', { name: /Ingreso/ }))
    await waitFor(() => expect(pedidas().at(-1)).toBe(
      `GET ${RUTA}?desde=${desdeDefault}&hasta=${hoy}&orden=ingreso&sentido=asc&agrupacion=dia`))
    expect(productos().getByRole('columnheader', { name: /Ingreso ▲/ }).getAttribute('aria-sort')).toBe('ascending')

    // Por nombre arranca ascendente, no descendente como las cifras.
    await user.click(screen.getByRole('button', { name: 'Producto' }))
    await waitFor(() => expect(pedidas().at(-1)).toBe(
      `GET ${RUTA}?desde=${desdeDefault}&hasta=${hoy}&orden=nombre&sentido=asc&agrupacion=dia`))
    await user.click(screen.getByRole('button', { name: 'Por día' }))
    await waitFor(() => expect(pedidas().at(-1)).toContain('orden=unidades_por_dia&sentido=desc'))
    await user.click(screen.getByRole('button', { name: 'Margen %' }))
    await waitFor(() => expect(pedidas().at(-1)).toContain('orden=margen_pct&sentido=desc'))
  })

  it('los CSV apuntan al motor con el mismo rango y orden que la tabla que se ve', async () => {
    responder({ [RUTA]: DATA })
    const user = userEvent.setup()
    montar('/margen', <Margen />)
    await screen.findByText('Margen y rotación por producto')
    const [csvProductos, csvPeriodos] = screen.getAllByRole('link', { name: /CSV/ })
    expect(csvProductos.getAttribute('href')).toBe(
      `${RUTA}/export/productos?desde=${desdeDefault}&hasta=${hoy}&orden=margen&sentido=desc`)
    expect(csvPeriodos.getAttribute('href')).toBe(
      `${RUTA}/export/periodos?desde=${desdeDefault}&hasta=${hoy}&orden=margen&sentido=desc&agrupacion=dia`)

    await user.click(screen.getByRole('button', { name: 'Unidades' }))
    await waitFor(() => expect(screen.getAllByRole('link', { name: /CSV/ })[0].getAttribute('href')).toContain('orden=unidades&sentido=desc'))
  })

  it('cambiar las fechas y la agrupación vuelve a pedir, y el período se rotula según la agrupación', async () => {
    responder({ [RUTA]: DATA })
    const user = userEvent.setup()
    montar('/margen', <Margen />)
    await screen.findByText('Margen y rotación por producto')

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-01' } })
    await waitFor(() => expect(pedidas().at(-1)).toContain('desde=2026-08-01&hasta='))
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-08-31' } })
    await waitFor(() => expect(pedidas().at(-1)).toContain('desde=2026-08-01&hasta=2026-08-31'))

    responder({ [RUTA]: { ...DATA, agrupacion: 'mes', periodos: [{ ...DATA.periodos[0], periodo: '2026-09' }] } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agrupar por' }), 'mes')
    await waitFor(() => expect(pedidas().at(-1)).toContain('&agrupacion=mes'))
    expect(await screen.findByText('09/2026')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /CSV/ })[1].getAttribute('href')).toContain('/export/periodos?')
    expect(screen.getAllByRole('link', { name: /CSV/ })[1].getAttribute('href')).toContain('agrupacion=mes')

    // Las claves de semana y las que el motor no reconoce (una venta sin fecha) también se rotulan.
    responder({ [RUTA]: { ...DATA, agrupacion: 'semana', periodos: [
      { ...DATA.periodos[0], periodo: '2026-W36' }, { ...DATA.periodos[1], periodo: 'sin fecha' }] } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agrupar por' }), 'semana')
    expect(await screen.findByText('Semana 36/2026')).toBeTruthy()
    expect(screen.getByText('sin fecha')).toBeTruthy()
  })

  it('tocar un producto deja sólo ese producto (y sus períodos), y se puede quitar el filtro', async () => {
    responder({ [RUTA]: DATA })
    const user = userEvent.setup()
    montar('/margen', <Margen />)
    await screen.findByText('Margen y rotación por producto')

    responder({ [RUTA]: { ...DATA, producto_id: 1, productos: [DATA.productos[0]] } })
    await user.click(screen.getByRole('button', { name: 'Yerba' }))
    await waitFor(() => expect(pedidas().at(-1)).toContain('&agrupacion=dia&producto_id=1'))
    const quitar = await screen.findByRole('button', { name: 'Quitar filtro: Yerba' })
    expect(screen.getByText('Por período: Yerba')).toBeTruthy()
    // El CSV lleva el filtro: lo que se baja es lo que se ve.
    expect(screen.getAllByRole('link', { name: /CSV/ })[0].getAttribute('href')).toContain('&producto_id=1')

    responder({ [RUTA]: DATA })
    await user.click(quitar)
    await waitFor(() => expect(pedidas().at(-1)).not.toContain('producto_id'))
    expect(screen.queryByRole('button', { name: /Quitar filtro/ })).toBeNull()
  })

  it('una respuesta lenta de un filtro viejo no pisa a la del filtro nuevo', async () => {
    let soltarLaVieja!: () => void
    const vieja = new Promise<Response>((resolve) => {
      soltarLaVieja = () => resolve(json({ ...DATA, productos: [{ ...DATA.productos[0], nombre: 'Vieja' }] }))
    })
    fetchMock.mockImplementationOnce(() => vieja)
    fetchMock.mockImplementation(() => Promise.resolve(json({ ...DATA, productos: [{ ...DATA.productos[0], nombre: 'Nueva' }] })))
    montar('/margen', <Margen />)
    // El pedido inicial quedó colgado; cambiar el rango dispara el segundo, que responde enseguida.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-08-01' } })
    expect(await screen.findByRole('button', { name: 'Nueva' })).toBeTruthy()
    soltarLaVieja()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('button', { name: 'Vieja' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Nueva' })).toBeTruthy()
  })
})

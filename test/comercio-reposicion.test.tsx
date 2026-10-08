// Reposición sugerida (0.90.0, B-2 del roadmap de VentaLibra): la pantalla sobre
// `GET /api/reportes/reposicion`. La cuenta es del motor; lo que se prueba acá es lo que la pantalla decide:
// qué pide (parámetros, sucursal, categoría, «sólo a pedir»), qué valida antes de pedir, cómo ordena, qué avisa
// de cada fila y a dónde apunta el CSV.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Reposicion } from '../src/comercio/Reposicion'
import type { ReposicionData, ReposicionProducto } from '../src/comercio/tipos'
import { elegirEnBuscable, fetchMock, json, montar, opcionesDe, pedidas, prepararFetch, responder } from './helpers-pantallas'

const base: ReposicionProducto = {
  producto_id: 0, codigo: null, nombre: '', unidad: 'u', categoria: '', stock: 0, en_camino: 0, en_camino_sin_sucursal: 0,
  stock_minimo: 0, unidades_vendidas: 0, dias_con_stock: 30, rotacion_diaria: 0, cobertura_dias: null, sugerido: 0,
  motivo: null, sin_ventas: false, posible_quiebre: false, variantes: 0,
}

// En el orden de urgencia del motor: menor cobertura primero, sin rotación al final.
const YERBA: ReposicionProducto = {
  ...base, producto_id: 1, codigo: 'Y-1', nombre: 'Yerba', categoria: 'Almacén', stock: 2, en_camino: 10, en_camino_sin_sucursal: 4,
  stock_minimo: 5, unidades_vendidas: 60, rotacion_diaria: 2, cobertura_dias: 1, sugerido: 38, motivo: 'ambos', posible_quiebre: true,
}
const HARINA: ReposicionProducto = {
  ...base, producto_id: 2, codigo: 'H-9', nombre: 'Harina', unidad: 'kg', categoria: 'Almacén', stock: 1.5, stock_minimo: 0.25,
  unidades_vendidas: 1234.5, rotacion_diaria: 41.15, cobertura_dias: 3.5, sugerido: 12.5, motivo: 'por_rotacion',
}
const SAL: ReposicionProducto = {
  ...base, producto_id: 3, codigo: null, nombre: 'Sal', categoria: '', stock: 3, stock_minimo: 10, sugerido: 7, motivo: 'bajo_minimo',
  sin_ventas: true,
}

const DATA: ReposicionData = {
  dias_rotacion: 30, dias_cobertura: 15, plazo_entrega_dias: 3, sucursal_id: null, categoria: null, producto_id: null, solo_a_pedir: true,
  resumen: { productos: 3, a_pedir: 3, posible_quiebre: 1, sin_ventas: 1 },
  productos: [YERBA, HARINA, SAL],
}

const RUTA = '/api/reportes/reposicion'
const SUCURSALES = [
  { id: 1, nombre: 'Centro', codigo: null, direccion: null, activa: 1, es_default: 1, deposito_predeterminado_id: 1, depositos: 1 },
  { id: 2, nombre: 'Norte', codigo: null, direccion: null, activa: 1, es_default: 0, deposito_predeterminado_id: 2, depositos: 1 },
]
const CATEGORIAS = [{ id: 1, nombre: 'Almacén' }, { id: 2, nombre: 'Bebidas' }]
const TODO = { [RUTA]: DATA, '/api/sucursales': SUCURSALES, '/api/productos/categorias': CATEGORIAS }

/** La consulta con los defaults del motor; `extra` va al final (`&sucursal_id=2`). */
const consulta = (extra = '', p = 'dias_rotacion=30&dias_cobertura=15&plazo_entrega_dias=3&solo_a_pedir=true') => `${p}${extra}`
const pide = (extra = '', p?: string) => `GET ${RUTA}?${consulta(extra, p)}`
/** Sólo los pedidos al reporte (la pantalla también pide sucursales y categorías). */
const pedidasAlReporte = () => pedidas().filter((p) => p.startsWith(`GET ${RUTA}?`))
const ultimaConsulta = () => pedidasAlReporte().at(-1)

/** Sin espacios raros ni saltos: el texto de una fila con sus avisos. */
const texto = (el: HTMLElement | null) => (el?.textContent ?? '').replace(/\s+/g, ' ')
const fila = (nombre: string) => screen.getByText(nombre).closest('tr')!
/** Los nombres de producto en el orden en que están en la tabla. */
const nombresEnTabla = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
  .map((tr) => tr.querySelector('td span.font-medium')?.textContent)

async function abrir(tabla: Record<string, unknown> = TODO) {
  responder(tabla)
  montar('/reposicion', <Reposicion />)
  await screen.findByText('3 productos')
}

beforeEach(() => {
  cleanup()
  prepararFetch()
})

describe('Reposición: lo que muestra', () => {
  it('pide con los defaults del motor y muestra las filas con sus números en es-AR, tal como los manda el motor', async () => {
    await abrir()
    expect(pedidasAlReporte()).toEqual([pide()])

    expect(screen.getByRole('heading', { name: /Reposición sugerida/ })).toBeTruthy()
    expect(texto(screen.getByText('3 productos').closest('div'))).toContain('3 a pedir · 1 con posible quiebre · 1 sin ventas')

    const yerba = texto(fila('Yerba'))
    expect(yerba).toContain('Y-1')
    expect(yerba).toContain('Almacén')
    // Stock, en camino, mínimo, vendido, rotación diaria y cobertura, en ese orden.
    expect(within(fila('Yerba')).getAllByRole('cell').slice(2, 8).map((c) => c.textContent)).toEqual(['2', '10', '5', '60', '2', '1'])
    expect(texto(fila('Yerba'))).toContain('38 u')
    expect(texto(fila('Yerba'))).toContain('Bajo el mínimo y por rotación')

    // Fraccionables: los decimales del motor, con coma y separador de miles.
    const harina = texto(fila('Harina'))
    expect(harina).toContain('1,5')
    expect(harina).toContain('0,25')
    expect(harina).toContain('1.234,5')
    expect(harina).toContain('41,15')
    expect(harina).toContain('3,5')
    expect(harina).toContain('12,5 kg')
    expect(harina).toContain('Por rotación')

    // Sin código ni rotación el motor manda `null`: un guion, no un cero.
    const sal = within(fila('Sal')).getAllByRole('cell')
    expect(sal[1].textContent).toBe('—')
    expect(sal[7].textContent).toBe('—')
    expect(sal[9].textContent).toBe('Bajo el mínimo')
  })

  it('explica la fórmula en lenguaje llano, con el horizonte de lo que se pidió', async () => {
    await abrir()
    const ayuda = texto(screen.getByText(/proyecta a los días de cobertura/))
    expect(ayuda).toContain('últimos 30 días')
    expect(ayuda).toContain('(18 días)')
    expect(ayuda).toContain('menos lo que hay y lo que ya viene en camino')
    expect(ayuda).toContain('stock mínimo')
    expect(ayuda).toContain('no genera ninguna orden de compra')
  })

  it('cada aviso sale de su bandera: sin ventas, posible quiebre, y nada en la fila que no los tiene', async () => {
    await abrir()
    expect(texto(fila('Yerba'))).toContain('Posible quiebre: la rotación puede estar subestimada')
    expect(texto(fila('Yerba'))).not.toContain('Sin ventas en la ventana')
    expect(texto(fila('Sal'))).toContain('Sin ventas en la ventana')
    expect(texto(fila('Sal'))).not.toContain('Posible quiebre')
    expect(texto(fila('Harina'))).not.toMatch(/Posible quiebre|Sin ventas/)
    // El icono del aviso es decorativo: el texto lo dice todo.
    expect(fila('Yerba').querySelector('svg[aria-hidden="true"]')).toBeTruthy()
  })

  it('el select de sucursal lleva de título el nombre completo de la elegida (el valor se corta con line-clamp), y «Toda la instancia» no lleva', async () => {
    const user = userEvent.setup()
    const LARGO = 'Sucursal Centro Comercial Paseo del Bosque Local 214'
    const sucursales = [...SUCURSALES, { ...SUCURSALES[0], id: 3, nombre: LARGO, es_default: 0 }]
    await abrir({ ...TODO, '/api/sucursales': sucursales })
    const select = await screen.findByLabelText('Sucursal')
    expect(select.getAttribute('title')).toBeNull()
    responder({ ...TODO, '/api/sucursales': sucursales, [RUTA]: { ...DATA, sucursal_id: 3 } })
    await elegirEnBuscable(user, select, LARGO)
    await waitFor(() => expect(screen.getByLabelText('Sucursal').getAttribute('title')).toBe(LARGO))
  })

  it('lo en camino sin sucursal se avisa sólo con una sucursal elegida, donde se está contando', async () => {
    const user = userEvent.setup()
    await abrir()
    // Toda la instancia: no hay nada que aclarar, es todo lo pedido.
    expect(texto(fila('Yerba'))).not.toContain('sin sucursal')

    responder({ ...TODO, [RUTA]: { ...DATA, sucursal_id: 2, productos: [YERBA, HARINA] } })
    await elegirEnBuscable(user, await screen.findByLabelText('Sucursal'), 'Norte')
    await waitFor(() => expect(texto(fila('Yerba'))).toContain('incluye 4 de órdenes sin sucursal, contadas en esta sucursal'))
    // Harina no tiene nada en camino sin sucursal: no hay aviso.
    expect(texto(fila('Harina'))).not.toContain('sin sucursal')
  })

  it('con una sucursal elegida, el mínimo propio de esa sucursal se dice con texto; el global y «toda la instancia» no llevan marca', async () => {
    const user = userEvent.setup()
    // Aunque el motor marque `propio` (no debería sin sucursal), sin sucursal elegida no hay nada que aclarar.
    await abrir({ ...TODO, [RUTA]: { ...DATA, productos: [{ ...YERBA, stock_minimo_propio: true }, HARINA, SAL] } })
    expect(texto(fila('Yerba'))).not.toContain('propio')

    responder({
      ...TODO,
      [RUTA]: { ...DATA, sucursal_id: 2, productos: [{ ...YERBA, stock_minimo_propio: true }, { ...HARINA, stock_minimo_propio: false }, SAL] },
    })
    await elegirEnBuscable(user, await screen.findByLabelText('Sucursal'), 'Norte')
    // A la vista dice «propio» (la celda es angosta); el texto completo está en el `title` y para el lector de pantalla (ADR-012).
    await waitFor(() => expect(within(fila('Yerba')).getByTitle('propio de la sucursal')).toBeTruthy())
    expect(within(fila('Yerba')).getByTitle('propio de la sucursal').closest('td')?.textContent).toBe('5propio de la sucursal')
    // El global (`false`) y un motor anterior (sin la clave) no llevan marca: la celda es sólo el número.
    expect(texto(fila('Harina'))).not.toContain('propio')
    expect(texto(fila('Sal'))).not.toContain('propio')
    expect(fila('Harina').textContent).toContain('0,25')
  })
})

describe('Reposición: lo vencido', () => {
  it('avisa en el stock cuánto está vencido y no cuenta; sin vencido, o con un motor que no lo manda, no dice nada', async () => {
    await abrir({ ...TODO, [RUTA]: { ...DATA, productos: [{ ...YERBA, stock: 16, vencido: 6 }, HARINA, { ...SAL, vencido: 0 }] } })
    expect(texto(fila('Yerba'))).toContain('incluye 6 vencido, que no se cuenta para pedir')
    expect(texto(fila('Harina'))).not.toContain('vencido')
    expect(texto(fila('Sal'))).not.toContain('vencido')
  })

  it('la explicación dice que lo vencido no cuenta como stock', async () => {
    await abrir()
    expect(screen.getByText(/Lo que está en lotes vencidos no cuenta como stock/)).toBeTruthy()
  })
})

describe('Reposición: lo que pide', () => {
  it('«Toda la instancia» no manda sucursal, y elegir una manda su id (y volver a la instancia la saca)', async () => {
    const user = userEvent.setup()
    await abrir()
    const selector = await screen.findByLabelText('Sucursal')
    expect(await opcionesDe(user, selector)).toEqual(['Toda la instancia', 'Centro', 'Norte'])
    expect(pedidasAlReporte()).toEqual([pide()])

    await elegirEnBuscable(user, selector, 'Norte')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&sucursal_id=2')))
    await elegirEnBuscable(user, selector, 'Centro')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&sucursal_id=1')))
    await elegirEnBuscable(user, selector, 'Toda la instancia')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide()))
  })

  it('sin sucursales o sin categorías (producto sin ellas, o sin permiso) la pantalla sigue y sólo pierde ese filtro', async () => {
    responder({ [RUTA]: DATA, '/api/sucursales': { status: 403, detail: 'Sin permiso' } })
    montar('/reposicion', <Reposicion />)
    expect(await screen.findByText('3 productos')).toBeTruthy()
    expect(screen.queryByLabelText('Sucursal')).toBeNull()
    expect(screen.queryByLabelText('Categoría')).toBeNull()
    expect(screen.queryByText('Sin permiso')).toBeNull()
  })

  it('la categoría elegida viaja por nombre, y «Todas las categorías» la saca', async () => {
    const user = userEvent.setup()
    await abrir()
    const selector = await screen.findByLabelText('Categoría')
    expect(await opcionesDe(user, selector)).toEqual(['Todas las categorías', 'Almacén', 'Bebidas'])
    await elegirEnBuscable(user, selector, 'Bebidas')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&categoria=Bebidas')))
    await elegirEnBuscable(user, selector, 'Todas las categorías')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide()))
  })

  it('los tres parámetros son editables y cada uno viaja con su nombre (los topes del motor son válidos)', async () => {
    await abrir()
    fireEvent.change(screen.getByLabelText('Días de rotación'), { target: { value: '365' } })
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias_rotacion=365&dias_cobertura=15&plazo_entrega_dias=3&solo_a_pedir=true')))
    fireEvent.change(screen.getByLabelText('Días de cobertura'), { target: { value: '365' } })
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias_rotacion=365&dias_cobertura=365&plazo_entrega_dias=3&solo_a_pedir=true')))
    fireEvent.change(screen.getByLabelText('Plazo de entrega (días)'), { target: { value: '180' } })
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias_rotacion=365&dias_cobertura=365&plazo_entrega_dias=180&solo_a_pedir=true')))
    fireEvent.change(screen.getByLabelText('Días de rotación'), { target: { value: '1' } })
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias_rotacion=1&dias_cobertura=365&plazo_entrega_dias=180&solo_a_pedir=true')))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('al tipear un parámetro se pide una sola vez, con el valor final, y mientras tanto no se muestra la tabla de antes', async () => {
    const user = userEvent.setup()
    await abrir()
    const antes = pedidasAlReporte().length
    const campo = screen.getByLabelText('Días de rotación')
    await user.clear(campo)
    await user.type(campo, '365')
    // Recién tipeado: nada nuevo pedido y la lista de otros parámetros no está a la vista.
    expect(pedidasAlReporte().length).toBe(antes)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Cargando')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias_rotacion=365&dias_cobertura=15&plazo_entrega_dias=3&solo_a_pedir=true')))
    // Un solo pedido por toda la tanda de teclas (no uno por dígito, ni con el campo vacío).
    expect(pedidasAlReporte().length).toBe(antes + 1)
    await screen.findByRole('table')
  })

  it('«Sólo lo que hay que pedir» viene marcado, y al desmarcarlo se pide todo (y el vacío lo dice distinto)', async () => {
    const user = userEvent.setup()
    await abrir()
    const check = screen.getByLabelText('Sólo lo que hay que pedir') as HTMLInputElement
    expect(check.checked).toBe(true)

    responder({ ...TODO, [RUTA]: { ...DATA, solo_a_pedir: false, resumen: { productos: 4, a_pedir: 3, posible_quiebre: 1, sin_ventas: 1 },
      productos: [...DATA.productos, { ...base, producto_id: 4, nombre: 'Aceite', stock: 20, cobertura_dias: 60, rotacion_diaria: 0.3 }] } })
    await user.click(check)
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('', 'dias_rotacion=30&dias_cobertura=15&plazo_entrega_dias=3&solo_a_pedir=false')))
    expect(await screen.findByText('Aceite')).toBeTruthy()
    // Sin nada que pedir para ese producto: no tiene motivo.
    expect(within(fila('Aceite')).getAllByRole('cell')[9].textContent).toBe('—')

    responder({ ...TODO, [RUTA]: { ...DATA, solo_a_pedir: false, resumen: { productos: 0, a_pedir: 0, posible_quiebre: 0, sin_ventas: 0 }, productos: [] } })
    fireEvent.change(screen.getByLabelText('Días de cobertura'), { target: { value: '16' } })
    expect(await screen.findByText('No hay productos con estos parámetros')).toBeTruthy()
    await user.click(check)
    await waitFor(() => expect(ultimaConsulta()).toContain('solo_a_pedir=true'))
  })
})

describe('Reposición: validación de los parámetros', () => {
  it.each([
    ['Días de rotación', '0'], ['Días de rotación', '366'], ['Días de cobertura', '0'], ['Días de cobertura', '366'],
    ['Plazo de entrega (días)', '0'], ['Plazo de entrega (días)', '181'], ['Días de rotación', ''], ['Días de rotación', '1.5'],
    ['Plazo de entrega (días)', '-3'],
  ])('%s = "%s" no se manda: se avisa el rango, no se muestra una lista que no corresponde y no hay CSV', async (campo, valor) => {
    await abrir()
    const pedidosAntes = pedidasAlReporte().length
    fireEvent.change(screen.getByLabelText(campo), { target: { value: valor } })

    const tope = campo === 'Plazo de entrega (días)' ? 180 : 365
    expect((await screen.findByRole('alert')).textContent).toBe(`Tiene que ser un entero entre 1 y ${tope}.`)
    expect(screen.getByLabelText(campo).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText(campo).getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
    expect(screen.getByText('Corregí los parámetros para ver la sugerencia.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('link', { name: /CSV/ })).toBeNull()
    expect(pedidasAlReporte()).toHaveLength(pedidosAntes)
  })

  it('al corregir el valor vuelve a pedir y la lista reaparece', async () => {
    await abrir()
    fireEvent.change(screen.getByLabelText('Días de rotación'), { target: { value: '0' } })
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('Días de rotación'), { target: { value: '7' } })
    expect(await screen.findByText('Yerba')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(ultimaConsulta()).toBe(pide('', 'dias_rotacion=7&dias_cobertura=15&plazo_entrega_dias=3&solo_a_pedir=true'))
  })
})

describe('Reposición: orden', () => {
  it('por defecto es el de urgencia del motor, y ordenar por una columna es de la pantalla (no pide de nuevo)', async () => {
    const user = userEvent.setup()
    await abrir()
    expect(nombresEnTabla()).toEqual(['Yerba', 'Harina', 'Sal'])
    for (const th of screen.getAllByRole('columnheader')) expect(th.getAttribute('aria-sort')).toBe('none')
    expect(screen.queryByRole('button', { name: 'Orden por urgencia' })).toBeNull()
    const pedidos = pedidasAlReporte().length

    // Las cifras arrancan de mayor a menor; un segundo click invierte.
    await user.click(screen.getByRole('button', { name: /^Sugerido/ }))
    expect(nombresEnTabla()).toEqual(['Yerba', 'Harina', 'Sal'])
    expect(screen.getByRole('columnheader', { name: /Sugerido ▼/ }).getAttribute('aria-sort')).toBe('descending')
    await user.click(screen.getByRole('button', { name: /Sugerido/ }))
    expect(nombresEnTabla()).toEqual(['Sal', 'Harina', 'Yerba'])
    expect(screen.getByRole('columnheader', { name: /Sugerido ▲/ }).getAttribute('aria-sort')).toBe('ascending')

    // Por nombre arranca ascendente.
    await user.click(screen.getByRole('button', { name: /^Producto/ }))
    expect(nombresEnTabla()).toEqual(['Harina', 'Sal', 'Yerba'])
    await user.click(screen.getByRole('button', { name: /Producto/ }))
    expect(nombresEnTabla()).toEqual(['Yerba', 'Sal', 'Harina'])

    expect(pedidasAlReporte()).toHaveLength(pedidos)

    await user.click(screen.getByRole('button', { name: 'Orden por urgencia' }))
    expect(nombresEnTabla()).toEqual(['Yerba', 'Harina', 'Sal'])
    expect(screen.queryByRole('button', { name: 'Orden por urgencia' })).toBeNull()
  })

  it('cada columna ordena por su valor: numéricas como números y texto por su etiqueta', async () => {
    const user = userEvent.setup()
    await abrir()
    // [columna, orden que da al primer click]. Las numéricas van de mayor a menor.
    const casos: [string, string[]][] = [
      ['Stock', ['Sal', 'Yerba', 'Harina']],
      ['En camino', ['Yerba', 'Harina', 'Sal']],
      ['Mínimo', ['Sal', 'Yerba', 'Harina']],
      ['Vendido en la ventana', ['Harina', 'Yerba', 'Sal']],
      ['Rotación diaria', ['Harina', 'Yerba', 'Sal']],
      ['Cobertura (días)', ['Harina', 'Yerba', 'Sal']],
      // Código y motivo, en texto y ascendente; sin código o sin motivo, al final.
      ['Código', ['Harina', 'Yerba', 'Sal']],
      ['Motivo', ['Sal', 'Yerba', 'Harina']],
    ]
    for (const [columna, esperado] of casos) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${columna.replace(/[()]/g, '\\$&')}`) }))
      expect(nombresEnTabla(), columna).toEqual(esperado)
    }
  })

  it('lo que no tiene valor (cobertura sin rotación) va al final en los dos sentidos', async () => {
    const user = userEvent.setup()
    await abrir()
    await user.click(screen.getByRole('button', { name: 'Cobertura (días)' }))
    expect(nombresEnTabla()).toEqual(['Harina', 'Yerba', 'Sal'])
    await user.click(screen.getByRole('button', { name: /Cobertura/ }))
    expect(nombresEnTabla()).toEqual(['Yerba', 'Harina', 'Sal'])
  })

  it('un parámetro nuevo no pierde el orden elegido', async () => {
    const user = userEvent.setup()
    await abrir()
    await user.click(screen.getByRole('button', { name: /^Producto/ }))
    fireEvent.change(screen.getByLabelText('Días de cobertura'), { target: { value: '20' } })
    await waitFor(() => expect(ultimaConsulta()).toContain('dias_cobertura=20'))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Producto ▲/ })).toBeTruthy())
    expect(nombresEnTabla()).toEqual(['Harina', 'Sal', 'Yerba'])
  })
})

describe('Reposición: CSV', () => {
  it('apunta al export del motor con los mismos parámetros que la lista que se ve', async () => {
    const user = userEvent.setup()
    await abrir()
    expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(`${RUTA}/export?${consulta()}`)

    await elegirEnBuscable(user, await screen.findByLabelText('Sucursal'), 'Norte')
    await elegirEnBuscable(user, screen.getByLabelText('Categoría'), 'Bebidas')
    fireEvent.change(screen.getByLabelText('Días de rotación'), { target: { value: '60' } })
    await user.click(screen.getByLabelText('Sólo lo que hay que pedir'))
    await waitFor(() => expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(
      `${RUTA}/export?dias_rotacion=60&dias_cobertura=15&plazo_entrega_dias=3&solo_a_pedir=false&sucursal_id=2&categoria=Bebidas`))
    // El JSON pidió exactamente lo mismo: una sola forma de armar la consulta.
    expect(ultimaConsulta()).toBe(
      'GET /api/reportes/reposicion?dias_rotacion=60&dias_cobertura=15&plazo_entrega_dias=3&solo_a_pedir=false&sucursal_id=2&categoria=Bebidas')
  })

  it('el CSV pide el orden activo de la tabla (columna y sentido), sin volver a pedir la lista', async () => {
    const user = userEvent.setup()
    await abrir()
    const csv = () => screen.getByRole('link', { name: /CSV/ }).getAttribute('href')
    // Sin ordenar, el de urgencia: nada que mandar.
    expect(csv()).toBe(`${RUTA}/export?${consulta()}`)
    const pedidosAntes = pedidasAlReporte().length
    await user.click(screen.getByRole('button', { name: /^Producto/ }))
    expect(csv()).toBe(`${RUTA}/export?${consulta()}&orden=nombre&sentido=asc`)
    await user.click(screen.getByRole('button', { name: /^Producto/ }))
    expect(csv()).toBe(`${RUTA}/export?${consulta()}&orden=nombre&sentido=desc`)
    // Una numérica empieza de mayor a menor.
    await user.click(screen.getByRole('button', { name: /^Sugerido/ }))
    expect(csv()).toBe(`${RUTA}/export?${consulta()}&orden=sugerido&sentido=desc`)
    // «Orden por urgencia» lo quita.
    await user.click(screen.getByRole('button', { name: 'Orden por urgencia' }))
    expect(csv()).toBe(`${RUTA}/export?${consulta()}`)
    // Ordenar es local: no hubo ningún pedido nuevo.
    expect(pedidasAlReporte().length).toBe(pedidosAntes)
  })
})

describe('Reposición: cargando, vacío y errores', () => {
  it('mientras carga dice que carga', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    montar('/reposicion', <Reposicion />)
    expect(await screen.findByText('Cargando…')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('sin nada que pedir lo dice claro y no hay tabla', async () => {
    responder({ ...TODO, [RUTA]: { ...DATA, resumen: { productos: 0, a_pedir: 0, posible_quiebre: 0, sin_ventas: 0 }, productos: [] } })
    montar('/reposicion', <Reposicion />)
    expect(await screen.findByText('Nada que pedir con estos parámetros')).toBeTruthy()
    expect(screen.getByText('0 productos')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('el error de la API (422 incluido) o de la red se muestra, y sin datos no queda la lista vieja', async () => {
    responder({ ...TODO, [RUTA]: { status: 422, detail: 'la sucursal 9 no existe' } })
    montar('/reposicion', <Reposicion />)
    expect((await screen.findByText('la sucursal 9 no existe')).getAttribute('role')).toBe('alert')
    expect(screen.queryByRole('table')).toBeNull()

    cleanup()
    responder({ ...TODO, [RUTA]: '!caida' })
    montar('/reposicion', <Reposicion />)
    expect(await screen.findByText('Error de conexión.')).toBeTruthy()
  })

  it('una respuesta que no es lo que promete el motor se avisa y no rompe la pantalla', async () => {
    for (const rara of [{}, { productos: [] }, { productos: 'x', resumen: {} }, [], 'hola']) {
      responder({ ...TODO, [RUTA]: rara })
      montar('/reposicion', <Reposicion />)
      expect((await screen.findByText('La respuesta del servidor no tiene el formato esperado.')).getAttribute('role')).toBe('alert')
      expect(screen.queryByRole('table')).toBeNull()
      cleanup()
    }
  })

  it('un error tras una lista buena saca la lista, y el siguiente pedido bueno la trae de nuevo', async () => {
    await abrir()
    responder({ ...TODO, [RUTA]: { status: 403, detail: 'Solo admin' } })
    fireEvent.change(screen.getByLabelText('Días de cobertura'), { target: { value: '20' } })
    expect(await screen.findByText('Solo admin')).toBeTruthy()
    expect(screen.queryByText('Yerba')).toBeNull()
    responder(TODO)
    fireEvent.change(screen.getByLabelText('Días de cobertura'), { target: { value: '21' } })
    expect(await screen.findByText('Yerba')).toBeTruthy()
    expect(screen.queryByText('Solo admin')).toBeNull()
  })

  it('mientras contesta una consulta nueva no se muestran las cantidades de la anterior bajo los controles nuevos', async () => {
    await abrir()
    let soltar!: () => void
    const lenta = new Promise<Response>((resolve) => {
      soltar = () => resolve(json({ ...DATA, dias_cobertura: 20, productos: [{ ...YERBA, nombre: 'Nueva', sugerido: 99 }] }))
    })
    fetchMock.mockImplementation((entrada: RequestInfo | URL) => (String(entrada).startsWith(RUTA) ? lenta : Promise.resolve(json([]))))
    fireEvent.change(screen.getByLabelText('Días de cobertura'), { target: { value: '20' } })

    // Los controles ya dicen 20: la tabla vieja (cobertura 15) no puede seguir ahí, ni su resumen, ni su CSV.
    expect(await screen.findByText('Cargando…')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('Yerba')).toBeNull()
    expect(screen.queryByText('3 productos')).toBeNull()
    expect(screen.queryByRole('link', { name: /CSV/ })).toBeNull()
    // La ayuda habla de lo que dicen los controles: 20 + 3 días, no el horizonte de la respuesta vieja (18).
    expect(texto(screen.getByText(/proyecta a los días de cobertura/))).toContain('(23 días)')

    soltar()
    expect(await screen.findByText('Nueva')).toBeTruthy()
    expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toContain('dias_cobertura=20')
    expect(texto(screen.getByText(/proyecta a los días de cobertura/))).toContain('(23 días)')
  })

  it('una respuesta lenta de parámetros viejos no pisa a la de los nuevos', async () => {
    let soltarLaVieja!: () => void
    const vieja = new Promise<Response>((resolve) => {
      soltarLaVieja = () => resolve(json({ ...DATA, productos: [{ ...YERBA, nombre: 'Vieja' }] }))
    })
    fetchMock.mockImplementation((entrada: RequestInfo | URL) => {
      const url = String(entrada)
      if (url.startsWith(`${RUTA}?dias_rotacion=30`)) return vieja
      if (url.startsWith(RUTA)) return Promise.resolve(json({ ...DATA, productos: [{ ...YERBA, nombre: 'Nueva' }] }))
      return Promise.resolve(json([]))
    })
    montar('/reposicion', <Reposicion />)
    await waitFor(() => expect(pedidasAlReporte()).toHaveLength(1))
    fireEvent.change(screen.getByLabelText('Días de rotación'), { target: { value: '60' } })
    expect(await screen.findByText('Nueva')).toBeTruthy()
    soltarLaVieja()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Vieja')).toBeNull()
    expect(screen.getByText('Nueva')).toBeTruthy()
  })
})

describe('Reposición: proveedor habitual (motor >= 0.33.0, ADR-021)', () => {
  const PROVEEDORES = [{ id: 7, nombre: 'Distribuidora Norte' }, { id: 8, nombre: 'Mayorista Sur' }]
  const CON_PROVEEDOR: ReposicionData = {
    ...DATA, proveedor_id: null,
    productos: [{ ...YERBA, proveedor_id: 7, proveedor: 'Distribuidora Norte' }, { ...HARINA, proveedor_id: null, proveedor: null }, SAL],
  }
  const TODO_CON = { ...TODO, [RUTA]: CON_PROVEEDOR, '/api/proveedores': PROVEEDORES }

  it('con un motor que no lo maneja la pantalla es la de siempre: ni columna ni filtro', async () => {
    await abrir({ ...TODO, '/api/proveedores': PROVEEDORES })
    expect(screen.queryByLabelText('Proveedor')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Proveedor/ })).toBeNull()
  })

  it('los tres selects de filtro llevan `min-w-0`: sin él, en móvil un nombre largo ensancha la página (0.112.4)', async () => {
    // jsdom no mide el layout. Medido en Chromium (390, 360 y 320 px): un `SelectTrigger` con `w-full` es un ítem de grid con `nowrap`; sin `min-w-0` el track crece al
    // `min-content` del texto elegido y la página gana scroll horizontal (451 a 461 px). Desde ADR-039 los filtros son `SelectBuscable`: el ítem de grid es el contenedor
    // del campo (ahí va el `className`) y el `<input>` de adentro es `w-full min-w-0`, así que el texto elegido ya no empuja el track. Se conserva el `min-w-0` del contenedor.
    await abrir(TODO_CON)
    for (const nombre of ['Sucursal', 'Categoría', 'Proveedor']) {
      expect((await screen.findByLabelText(nombre)).parentElement!.className).toContain('min-w-0')
    }
  })

  it('si el motor lo maneja aparecen la columna «Proveedor» (con un guion donde no hay) y el filtro', async () => {
    await abrir(TODO_CON)
    expect(await screen.findByLabelText('Proveedor')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Proveedor/ })).toBeTruthy()
    expect(texto(fila('Yerba'))).toContain('Distribuidora Norte')
    expect(texto(fila('Harina'))).toContain('—')
  })

  it('elegir un proveedor lo manda como proveedor_id, y «Todos los proveedores» lo saca', async () => {
    const user = userEvent.setup()
    await abrir(TODO_CON)
    await elegirEnBuscable(user, await screen.findByLabelText('Proveedor'), 'Distribuidora Norte')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&proveedor_id=7')))
    await elegirEnBuscable(user, screen.getByLabelText('Proveedor'), 'Todos los proveedores')
    await waitFor(() => expect(ultimaConsulta()).toBe(pide()))
  })

  it('la columna ordena A–Z en el primer clic (texto), Z–A en el segundo, y lo que no tiene proveedor va siempre al final', async () => {
    const user = userEvent.setup()
    const dos: ReposicionData = {
      ...CON_PROVEEDOR,
      productos: [
        { ...YERBA, proveedor_id: 7, proveedor: 'Mayorista Sur' },
        { ...HARINA, proveedor_id: 8, proveedor: 'Distribuidora Norte' },
        { ...SAL, proveedor_id: null, proveedor: null },
      ],
    }
    await abrir({ ...TODO_CON, [RUTA]: dos })
    await user.click(await screen.findByRole('button', { name: /^Proveedor/ }))
    expect(nombresEnTabla()).toEqual(['Harina', 'Yerba', 'Sal'])             // Distribuidora Norte, Mayorista Sur, y sin proveedor al final
    await user.click(screen.getByRole('button', { name: /^Proveedor/ }))
    expect(nombresEnTabla()).toEqual(['Yerba', 'Harina', 'Sal'])             // Z–A; el que no tiene sigue al final
  })

  it('el filtro no se ofrece sin proveedores cargados, y la lista que falla no rompe la pantalla', async () => {
    await abrir({ ...TODO_CON, '/api/proveedores': [] })
    expect(screen.queryByLabelText('Proveedor')).toBeNull()
    expect(screen.getByRole('button', { name: /^Proveedor/ })).toBeTruthy()      // la columna sí: viene en los datos
  })
})

describe('Reposición: estacionalidad (motor >= 0.35.0, ADR-023)', () => {
  const CON_EST: ReposicionData = { ...DATA, estacionalidad: false }
  const AJUSTADA: ReposicionData = {
    ...DATA, estacionalidad: true,
    productos: [{ ...YERBA, factor_estacional: 3 }, { ...HARINA, factor_estacional: 0.5 }, { ...SAL, factor_estacional: null }],
  }
  const tabla = (data: ReposicionData) => ({ ...TODO, [RUTA]: data })

  it('con un motor que no la maneja no hay interruptor ni columna', async () => {
    await abrir()
    expect(screen.queryByLabelText('Ajustar por estacionalidad')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Estacional/ })).toBeNull()
  })

  it('con un motor que la maneja aparece el interruptor (apagado) y todavía no la columna', async () => {
    await abrir(tabla(CON_EST))
    const interruptor = await screen.findByLabelText('Ajustar por estacionalidad')
    expect(interruptor).not.toBeChecked()
    expect(screen.queryByRole('button', { name: /^Estacional/ })).toBeNull()
  })

  it('encenderlo manda estacionalidad=true y, cuando el motor ajusta, aparece la columna con ×factor y un guion donde no hay historia', async () => {
    const user = userEvent.setup()
    await abrir(tabla(CON_EST))
    responder(tabla(AJUSTADA))
    await user.click(await screen.findByLabelText('Ajustar por estacionalidad'))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&estacionalidad=true')))
    expect(await screen.findByRole('button', { name: /^Estacional/ })).toBeTruthy()
    expect(texto(fila('Yerba'))).toContain('×3')
    expect(texto(fila('Harina'))).toContain('×0,5')
    expect(fila('Sal').querySelector('td[title]')?.getAttribute('title')).toBe('Sin historia de hace un año: no se ajustó')
    // Apagarlo vuelve a la consulta de siempre.
    responder(tabla(CON_EST))
    await user.click(screen.getByLabelText('Ajustar por estacionalidad'))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide()))
  })

  it('la columna ordena por el factor y lo que no tiene va siempre al final', async () => {
    const user = userEvent.setup()
    await abrir(tabla(AJUSTADA))
    await user.click(await screen.findByRole('button', { name: /^Estacional/ }))
    expect(nombresEnTabla()[0]).toBe('Yerba')                  // numérica: la primera vez, de mayor a menor (×3, ×0,5) y sin factor al final
    expect(nombresEnTabla().at(-1)).toBe('Sal')
    await user.click(screen.getByRole('button', { name: /^Estacional/ }))
    expect(nombresEnTabla()[0]).toBe('Harina')
    expect(nombresEnTabla().at(-1)).toBe('Sal')
  })

  it('apagar el ajuste con la tabla ordenada por «Estacional» limpia ese orden: al volver a encenderlo la columna no vuelve ordenada', async () => {
    const user = userEvent.setup()
    const DEL_MOTOR = [SAL, YERBA, HARINA]                                                  // el orden por urgencia del motor
    await abrir(tabla(CON_EST))
    responder(tabla({ ...AJUSTADA, productos: [{ ...SAL, factor_estacional: null }, { ...YERBA, factor_estacional: 3 }, { ...HARINA, factor_estacional: 0.5 }] }))
    await user.click(await screen.findByLabelText('Ajustar por estacionalidad'))            // el interruptor queda realmente prendido
    expect(screen.getByLabelText('Ajustar por estacionalidad')).toBeChecked()
    await user.click(await screen.findByRole('button', { name: /^Estacional/ }))
    expect(screen.getByRole('button', { name: /^Estacional/ }).closest('th')).toHaveAttribute('aria-sort', 'descending')
    expect(nombresEnTabla()).toEqual(['Yerba', 'Harina', 'Sal'])                            // ordenada por factor: distinta del orden del motor
    responder(tabla({ ...CON_EST, productos: DEL_MOTOR }))
    await user.click(screen.getByLabelText('Ajustar por estacionalidad'))                   // este clic lo APAGA
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Estacional/ })).toBeNull())
    expect(screen.getByLabelText('Ajustar por estacionalidad')).not.toBeChecked()
    expect(nombresEnTabla()).toEqual(['Sal', 'Yerba', 'Harina'])                            // el orden por urgencia del motor
    expect(screen.queryByRole('button', { name: 'Orden por urgencia' })).toBeNull()         // y no queda un orden activo escondido
    responder(tabla(AJUSTADA))
    await user.click(screen.getByLabelText('Ajustar por estacionalidad'))
    expect((await screen.findByRole('button', { name: /^Estacional/ })).closest('th')).toHaveAttribute('aria-sort', 'none')
  })
})

describe('Reposición: descontar lo que vence en el horizonte (motor >= 0.37.0, ADR-025; ADR-011 de libra-ui)', () => {
  const ROTULO = 'Descontar lo que vence en el horizonte'
  const APAGADA: ReposicionData = { ...DATA, descontar_por_vencer: false, productos: [YERBA, HARINA, SAL].map((p) => ({ ...p, por_vencer: 0 })) }
  const DESCONTADA: ReposicionData = {
    ...DATA, descontar_por_vencer: true,
    productos: [{ ...YERBA, por_vencer: 4 }, { ...HARINA, por_vencer: 0.5 }, { ...SAL, por_vencer: 0 }],
  }
  const tabla = (data: ReposicionData) => ({ ...TODO, [RUTA]: data })
  const columna = () => screen.queryByRole('button', { name: /^Por vencer/ })

  it('con un motor que no la maneja no hay interruptor ni columna', async () => {
    await abrir()
    expect(screen.queryByLabelText(ROTULO)).toBeNull()
    expect(columna()).toBeNull()
  })

  it('con un motor que la maneja aparece el interruptor, apagado, accesible por su etiqueta y con su ayuda; la columna todavía no', async () => {
    await abrir(tabla(APAGADA))
    const interruptor = await screen.findByLabelText(ROTULO)
    expect(interruptor).toHaveAttribute('type', 'checkbox')
    expect(interruptor).not.toBeChecked()
    expect(interruptor).toHaveAccessibleDescription('Lo que no se alcanza a vender antes de vencer no cuenta como stock.')
    expect(columna()).toBeNull()
    expect(ultimaConsulta()).toBe(pide())                                       // apagado: el parámetro no viaja
    expect(ultimaConsulta()).not.toContain('descontar_por_vencer')
  })

  it('encenderlo manda descontar_por_vencer=true y aparece la columna con la cantidad (y un guion donde no hay nada por vencer); apagarlo vuelve a la consulta de siempre', async () => {
    const user = userEvent.setup()
    await abrir(tabla(APAGADA))
    responder(tabla(DESCONTADA))
    await user.click(await screen.findByLabelText(ROTULO))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&descontar_por_vencer=true')))
    expect(await screen.findByRole('button', { name: /^Por vencer/ })).toBeTruthy()
    expect(texto(fila('Yerba'))).toContain('4no cuenta como stock')                 // con texto, no sólo color (spans separados: sin espacio en el textContent)
    expect(texto(fila('Harina'))).toContain('0,5no cuenta como stock')
    expect(texto(fila('Sal'))).not.toContain('no cuenta como stock')
    // La columna va pegada al stock: Producto, Código, Stock, Por vencer, En camino…
    const yerba = within(fila('Yerba')).getAllByRole('cell')
    expect(yerba.slice(2, 5).map((c) => c.textContent)).toEqual(['2', '4no cuenta como stock', '10'])
    expect(within(fila('Sal')).getAllByRole('cell')[3].textContent).toBe('—')
    // El encabezado y su celda coinciden (no se corre una columna): cada título está sobre su dato.
    const titulos = within(screen.getByRole('table')).getAllByRole('columnheader').map((th) => th.textContent)
    expect(titulos.slice(2, 5)).toEqual(['Stock', 'Por vencer', 'En camino'])
    expect(titulos).toHaveLength(yerba.length)
    // El stock sigue siendo el real: lo por vencer no se resta en pantalla.
    expect(within(fila('Yerba')).getAllByRole('cell')[2].textContent).toBe('2')
    // La explicación suma lo que se descuenta, con el horizonte.
    expect(texto(screen.getByText(/proyecta a los días de cobertura/))).toContain('ni lo que vence dentro del horizonte (18 días) y no se alcanza a vender antes de vencer')
    responder(tabla(APAGADA))
    await user.click(screen.getByLabelText(ROTULO))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide()))
    await waitFor(() => expect(columna()).toBeNull())
    expect(texto(screen.getByText(/proyecta a los días de cobertura/))).not.toContain('ni lo que vence')
  })

  it('la columna ordena por lo que vence (de mayor a menor la primera vez) y lo que no la trae va siempre al final', async () => {
    const user = userEvent.setup()
    await abrir(tabla({ ...DESCONTADA, productos: [{ ...SAL, por_vencer: 0 }, { ...YERBA, por_vencer: 4 }, { ...HARINA, por_vencer: 9 }] }))
    await user.click(await screen.findByRole('button', { name: /^Por vencer/ }))
    expect(nombresEnTabla()).toEqual(['Harina', 'Yerba', 'Sal'])
    expect(screen.getByRole('button', { name: /^Por vencer/ }).closest('th')).toHaveAttribute('aria-sort', 'descending')
    await user.click(screen.getByRole('button', { name: /^Por vencer/ }))
    expect(nombresEnTabla()).toEqual(['Sal', 'Yerba', 'Harina'])
  })

  it('una fila sin `por_vencer` (clave ausente) va al final al ordenar, sin romper', async () => {
    const user = userEvent.setup()
    const { por_vencer: _quitada, ...sinClave } = { ...SAL, por_vencer: 0 }
    await abrir(tabla({ ...DESCONTADA, productos: [sinClave, { ...YERBA, por_vencer: 4 }, { ...HARINA, por_vencer: 9 }] }))
    await user.click(await screen.findByRole('button', { name: /^Por vencer/ }))
    expect(nombresEnTabla()).toEqual(['Harina', 'Yerba', 'Sal'])
    await user.click(screen.getByRole('button', { name: /^Por vencer/ }))
    expect(nombresEnTabla()).toEqual(['Yerba', 'Harina', 'Sal'])
    expect(within(fila('Sal')).getAllByRole('cell')[3].textContent).toBe('—')
  })

  it('apagar la opción con la tabla ordenada por «Por vencer» limpia ese orden: al volver a encenderla la columna no vuelve ordenada', async () => {
    const user = userEvent.setup()
    await abrir(tabla(APAGADA))
    responder(tabla(DESCONTADA))
    await user.click(await screen.findByLabelText(ROTULO))                                   // el interruptor queda realmente prendido
    await user.click(await screen.findByRole('button', { name: /^Por vencer/ }))
    expect(screen.getByRole('button', { name: /^Por vencer/ }).closest('th')).toHaveAttribute('aria-sort', 'descending')
    responder(tabla({ ...APAGADA, productos: [SAL, YERBA, HARINA].map((p) => ({ ...p, por_vencer: 0 })) }))
    await user.click(screen.getByLabelText(ROTULO))
    await waitFor(() => expect(columna()).toBeNull())
    expect(nombresEnTabla()).toEqual(['Sal', 'Yerba', 'Harina'])                            // el orden por urgencia del motor
    expect(screen.queryByRole('button', { name: 'Orden por urgencia' })).toBeNull()         // y no queda un orden activo escondido
    responder(tabla(DESCONTADA))
    await user.click(screen.getByLabelText(ROTULO))
    expect((await screen.findByRole('button', { name: /^Por vencer/ })).closest('th')).toHaveAttribute('aria-sort', 'none')
    expect(screen.queryByRole('button', { name: 'Orden por urgencia' })).toBeNull()
  })

  it('apagar la opción NO limpia un orden por otra columna', async () => {
    const user = userEvent.setup()
    await abrir(tabla(APAGADA))
    responder(tabla(DESCONTADA))
    await user.click(await screen.findByLabelText(ROTULO))
    await user.click(await screen.findByRole('button', { name: /^Mínimo/ }))
    responder(tabla(APAGADA))
    await user.click(screen.getByLabelText(ROTULO))
    await waitFor(() => expect(columna()).toBeNull())
    expect(screen.getByRole('button', { name: /^Mínimo/ }).closest('th')).toHaveAttribute('aria-sort', 'descending')
  })

  it('el CSV lleva el mismo valor que la lista: sin la opción no hay parámetro, con ella viaja', async () => {
    const user = userEvent.setup()
    await abrir(tabla(APAGADA))
    expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(`${RUTA}/export?${consulta()}`)
    responder(tabla(DESCONTADA))
    await user.click(await screen.findByLabelText(ROTULO))
    await waitFor(() => expect(screen.getByRole('link', { name: /CSV/ }).getAttribute('href')).toBe(`${RUTA}/export?${consulta('&descontar_por_vencer=true')}`))
  })

  it('un motor que contesta el eco pero no manda `por_vencer` en las filas: no aparece la columna y la pantalla no se rompe', async () => {
    await abrir(tabla({ ...DATA, descontar_por_vencer: true }))
    expect(await screen.findByLabelText(ROTULO)).toBeTruthy()
    expect(columna()).toBeNull()
    expect(nombresEnTabla()).toEqual(['Yerba', 'Harina', 'Sal'])
  })

  it('convive con la estacionalidad: los dos viajan juntos, las dos columnas aparecen y apagar una no toca a la otra', async () => {
    const user = userEvent.setup()
    const AMBAS: ReposicionData = {
      ...DATA, estacionalidad: true, descontar_por_vencer: true,
      productos: [{ ...YERBA, factor_estacional: 3, por_vencer: 4 }, { ...HARINA, factor_estacional: 0.5, por_vencer: 0 }, { ...SAL, factor_estacional: null, por_vencer: 0 }],
    }
    await abrir(tabla({ ...DATA, estacionalidad: false, descontar_por_vencer: false }))
    responder(tabla({ ...AMBAS, descontar_por_vencer: false, estacionalidad: true }))
    await user.click(await screen.findByLabelText('Ajustar por estacionalidad'))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&estacionalidad=true')))
    responder(tabla(AMBAS))
    await user.click(screen.getByLabelText(ROTULO))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&estacionalidad=true&descontar_por_vencer=true')))
    expect(await screen.findByRole('button', { name: /^Por vencer/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Estacional/ })).toBeTruthy()
    expect(screen.getByLabelText('Ajustar por estacionalidad')).toBeChecked()
    expect(screen.getByLabelText(ROTULO)).toBeChecked()
    // Apagar «por vencer» deja la estacionalidad prendida y su orden en pie.
    await user.click(screen.getByRole('button', { name: /^Estacional/ }))
    responder(tabla({ ...AMBAS, descontar_por_vencer: false }))
    await user.click(screen.getByLabelText(ROTULO))
    await waitFor(() => expect(ultimaConsulta()).toBe(pide('&estacionalidad=true')))
    await waitFor(() => expect(columna()).toBeNull())
    expect(screen.getByRole('button', { name: /^Estacional/ }).closest('th')).toHaveAttribute('aria-sort', 'descending')
  })
})

// Defectos de UI hallados con Chromium real (ADR-012): la barra de interruptores desalineada, la tabla más ancha que su contenedor y las notas largas apiladas en celdas angostas.
// jsdom no mide, así que acá se prueba la estructura (lo que hace posible el layout); las medidas están en el ADR.
describe('Reposición: layout de la barra y de la tabla (ADR-012)', () => {
  const ROTULO = 'Descontar lo que vence en el horizonte'
  const AMBAS: ReposicionData = {
    ...DATA, estacionalidad: true, descontar_por_vencer: true, sucursal_id: 2,
    productos: [{ ...YERBA, factor_estacional: 3, por_vencer: 4, vencido: 6, stock_minimo_propio: true }, { ...HARINA, factor_estacional: 0.5, por_vencer: 0 }, { ...SAL, factor_estacional: null, por_vencer: 0 }],
  }
  const tabla = { ...TODO, [RUTA]: AMBAS }

  it('los tres interruptores son un solo bloque flex-wrap, sin los campos de adentro, con la misma altura y sin rellenos sueltos (pt-7 / pt-8 los desalineaban)', async () => {
    await abrir(tabla)
    const rotulos = ['Sólo lo que hay que pedir', 'Ajustar por estacionalidad', ROTULO]
    const cajas = rotulos.map((r) => screen.getByLabelText(r))
    const bloque = cajas[0].closest('.flex-wrap')!
    for (const c of cajas) expect(c.closest('.flex-wrap')).toBe(bloque)
    expect(bloque.querySelectorAll('input[type=checkbox]')).toHaveLength(3)
    expect(bloque.querySelector('input:not([type=checkbox])')).toBeNull()                 // ningún campo ni select adentro
    expect(screen.getByLabelText('Días de rotación').closest('.flex-wrap')).not.toBe(bloque)
    for (const c of cajas) {
      const rotulo = c.closest('label')!
      expect(rotulo.className).not.toMatch(/(^|\s)pt-\d/)                                  // sin rellenos arriba que desalineen
      expect(rotulo.className).toMatch(/(^|\s)min-h-9(\s|$)/)                               // al menos la altura de un campo (así quedan en la misma línea) y más si se parte en pantallas estrechas
      expect(rotulo.className).toContain('sm:whitespace-nowrap')                             // no se parte en 2 líneas por un ancho máximo desde `sm`; en pantallas estrechas puede partirse en vez de desbordar
      expect(rotulo.className).not.toMatch(/(^|\s)whitespace-nowrap/)                        // y NO es nowrap a secas (desbordaría a 390 px)
    }
    // La ayuda no limita el ancho del rótulo (`max-w-56`) y sigue enlazada con aria-describedby.
    expect(bloque.querySelector('.max-w-56')).toBeNull()
    expect(screen.getByLabelText(ROTULO)).toHaveAccessibleDescription('Lo que no se alcanza a vender antes de vencer no cuenta como stock.')
    // El bloque cuelga de la barra de filtros, como cada campo (un solo hijo de la barra, no tres sueltos).
    expect(bloque.parentElement?.parentElement).toBe(screen.getByLabelText('Días de rotación').parentElement?.parentElement)
  })

  it('sin los interruptores opcionales (motor anterior) queda «Sólo lo que hay que pedir» en el mismo bloque', async () => {
    await abrir()
    const bloque = screen.getByLabelText('Sólo lo que hay que pedir').closest('.flex-wrap')!
    expect(bloque.querySelectorAll('input[type=checkbox]')).toHaveLength(1)
  })

  it('«Sugerido» queda pegado al borde derecho (sticky, con fondo) en su encabezado y en cada celda, sin cambiar el orden de las columnas', async () => {
    await abrir(tabla)
    await screen.findByRole('button', { name: /^Por vencer/ })
    const th = within(screen.getByRole('table')).getAllByRole('columnheader')
    expect(th.map((x) => x.textContent)).toEqual([
      'Producto', 'Código', 'Stock', 'Por vencer', 'En camino', 'Mínimo', 'Vendido en la ventana', 'Rotación diaria', 'Cobertura (días)', 'Estacional', 'Sugerido', 'Motivo',
    ])
    const i = th.findIndex((x) => x.textContent === 'Sugerido')
    for (const celda of [th[i], ...['Yerba', 'Harina', 'Sal'].map((n) => within(fila(n)).getAllByRole('cell')[i])]) {
      expect(celda.className).toMatch(/(^|\s)sticky(\s|$)/)
      expect(celda.className).toMatch(/(^|\s)right-0(\s|$)/)
      expect(celda.className).toMatch(/(^|\s)bg-card(\s|$)/)
    }
    // Ninguna otra columna lo es.
    expect(th.filter((x) => /sticky/.test(x.className))).toHaveLength(1)
    expect(within(fila('Yerba')).getAllByRole('cell').filter((x) => /sticky/.test(x.className))).toHaveLength(1)
  })

  it('las celdas de la tabla usan un relleno lateral chico (px-1.5) para que entren las 12 columnas', async () => {
    await abrir(tabla)
    await screen.findByRole('button', { name: /^Por vencer/ })
    for (const celda of [...screen.getAllByRole('columnheader'), ...within(fila('Yerba')).getAllByRole('cell')]) {
      expect(celda.className).toContain('px-1.5')
      expect(celda.className).not.toMatch(/(^|\s)p-3(\s|$)/)
    }
  })

  it('las notas largas de las celdas angostas se ven cortas, en una línea, y el texto completo está en el title y en el DOM para el lector de pantalla', async () => {
    await abrir(tabla)
    await screen.findByRole('button', { name: /^Por vencer/ })
    const yerba = fila('Yerba')
    const casos: { corto: string; completo: string }[] = [
      { corto: 'Posible quiebre', completo: 'Posible quiebre: la rotación puede estar subestimada' },
      { corto: 'no cuenta', completo: 'no cuenta como stock' },
      { corto: 'incl. 4 sin sucursal', completo: 'incluye 4 de órdenes sin sucursal, contadas en esta sucursal' },
      { corto: 'propio', completo: 'propio de la sucursal' },
      { corto: 'incl. 6 vencido', completo: 'incluye 6 vencido, que no se cuenta para pedir' },
    ]
    for (const { corto, completo } of casos) {
      const nota = within(yerba).getByTitle(completo)
      expect(nota.className).toContain('whitespace-nowrap')
      expect(nota.className).toContain('relative')                                         // el sr-only (absolute) no se escapa del scroll de la tabla
      // Lo que se ve es la forma corta; el texto completo está entero en el DOM (lo lee el lector de pantalla y lo cuentan los tests por textContent).
      const visible = Array.from(nota.children).filter((c) => !c.classList.contains('sr-only')).map((c) => c.textContent).join('') || nota.firstChild?.textContent
      expect(visible).toBe(corto)
      expect(texto(nota)).toContain(completo)
      expect(nota.querySelector('.sr-only')).toBeTruthy()
    }
    // «Sin ventas» también: la píldora ya no parte su texto en varias líneas.
    const sinVentas = within(fila('Sal')).getByTitle('Sin ventas en la ventana')
    expect(sinVentas.className).toContain('whitespace-nowrap')
    expect(texto(sinVentas)).toBe('Sin ventas en la ventana')
    // Y las píldoras ya no fuerzan `whitespace-normal` (era lo que apilaba el texto hasta pisar el borde).
    expect(yerba.querySelector('.whitespace-normal')).toBeNull()
  })
})

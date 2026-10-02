// Órdenes de compra en borrador desde la reposición (0.105.0, motor >= 0.34.0, ADR-022 del motor): el botón, el resumen de lo que se va a crear,
// la clave de operación por apertura, y el resultado.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Reposicion } from '../src/comercio/Reposicion'
import type { GenerarOrdenesResultado, ReposicionData, ReposicionProducto } from '../src/comercio/tipos'
import { cuerpoDe, fetchMock, json, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const base: ReposicionProducto = {
  producto_id: 0, codigo: null, nombre: '', unidad: 'u', categoria: '', stock: 0, en_camino: 0, en_camino_sin_sucursal: 0,
  stock_minimo: 0, unidades_vendidas: 0, dias_con_stock: 30, rotacion_diaria: 0, cobertura_dias: null, sugerido: 0,
  motivo: null, sin_ventas: false, posible_quiebre: false, variantes: 0,
}
const YERBA: ReposicionProducto = { ...base, producto_id: 1, nombre: 'Yerba', sugerido: 8, motivo: 'por_rotacion', cobertura_dias: 5, proveedor_id: 7, proveedor: 'Distribuidora Norte' }
const FIDEOS: ReposicionProducto = { ...base, producto_id: 2, nombre: 'Fideos', sugerido: 4, motivo: 'bajo_minimo', cobertura_dias: 9, proveedor_id: 7, proveedor: 'Distribuidora Norte' }
const SAL: ReposicionProducto = { ...base, producto_id: 3, nombre: 'Sal', sugerido: 8, motivo: 'bajo_minimo', cobertura_dias: 2, proveedor_id: 8, proveedor: 'Mayorista Sur' }
const AZUCAR: ReposicionProducto = { ...base, producto_id: 4, nombre: 'Azúcar', sugerido: 6, motivo: 'bajo_minimo', cobertura_dias: 3, proveedor_id: null, proveedor: null }
const SIN_PEDIDO: ReposicionProducto = { ...base, producto_id: 5, nombre: 'Aceite', sugerido: 0, proveedor_id: 8, proveedor: 'Mayorista Sur' }

const DATA: ReposicionData = {
  dias_rotacion: 30, dias_cobertura: 15, plazo_entrega_dias: 3, sucursal_id: null, categoria: null, producto_id: null, solo_a_pedir: true,
  proveedor_id: null,
  resumen: { productos: 4, a_pedir: 4, posible_quiebre: 0, sin_ventas: 0 },
  productos: [SAL, AZUCAR, YERBA, FIDEOS],
}
const RUTA = '/api/reportes/reposicion'
const ORDENES = `${RUTA}/ordenes`
const PROVEEDORES = [{ id: 7, nombre: 'Distribuidora Norte' }, { id: 8, nombre: 'Mayorista Sur' }]

const linea = (producto_id: number, nombre: string, cantidad: string, costo = '10', costo_cero = false) =>
  ({ producto_id, nombre, cantidad, costo_unitario: costo, subtotal: String(Number(cantidad) * Number(costo)), costo_cero })
const RESULTADO: GenerarOrdenesResultado = {
  ordenes: [
    { id: 41, number: 'OC-000041', proveedor_id: 7, proveedor: 'Distribuidora Norte', branch_id: null, status: 'draft', total: '120', lineas: [linea(1, 'Yerba', '8', '10'), linea(2, 'Fideos', '4', '10', true)] },
    { id: 42, number: 'OC-000042', proveedor_id: 8, proveedor: 'Mayorista Sur', branch_id: null, status: 'draft', total: '80', lineas: [linea(3, 'Sal', '8', '10')] },
  ],
  sin_proveedor: [{ producto_id: 4, nombre: 'Azúcar', sugerido: 6 }], omitidos: [], repetida: false,
}
const TODO = { [RUTA]: DATA, '/api/sucursales': [], '/api/productos/categorias': [], '/api/proveedores': PROVEEDORES, [`POST ${ORDENES}`]: RESULTADO }

beforeEach(() => {
  cleanup()
  prepararFetch()
})

async function abrir(props: Parameters<typeof Reposicion>[0] = { conGenerarOrdenes: true, rutaDeOrden: (id) => `/compras/${id}` }, tabla: Record<string, unknown> = TODO) {
  responder(tabla)
  montar('/reposicion', <Reposicion {...props} />)
  await screen.findByText('4 productos')
}
const boton = () => screen.queryByRole('button', { name: /Generar órdenes en borrador/ })
const dialogo = () => screen.getByRole('dialog')
const escrituras = () => pedidas().filter((p) => p.startsWith('POST '))

describe('Reposición: generar órdenes en borrador', () => {
  it('sin la prop no hay botón (lo enciende el producto, que sabe si su motor tiene el endpoint)', async () => {
    await abrir({})
    expect(boton()).toBeNull()
  })

  it('el resumen agrupa por proveedor con los productos y sus cantidades, y avisa lo que no tiene proveedor', async () => {
    const user = userEvent.setup()
    await abrir()
    await user.click(boton()!)
    const d = within(dialogo())
    expect(d.getByText('Generar órdenes en borrador', { selector: '[data-slot="dialog-title"], h2' })).toBeTruthy()
    expect(d.getByText(/Distribuidora Norte/).closest('li')!.textContent).toContain('Yerba (8), Fideos (4)')
    expect(d.getByText(/Mayorista Sur/).closest('li')!.textContent).toContain('Sal (8)')
    expect(d.getByText(/sin proveedor habitual no entra en/)).toBeTruthy()
    expect(d.getByRole('button', { name: 'Crear 2 órdenes' })).toBeTruthy()
    expect(escrituras()).toHaveLength(0)                                      // abrir el diálogo no escribe nada
  })

  it('crear manda los parámetros de la pantalla, los ids de los productos con proveedor y una clave; muestra las órdenes con su enlace y los avisos', async () => {
    const user = userEvent.setup()
    await abrir()
    await user.click(boton()!)
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    await waitFor(() => expect(escrituras()).toEqual([`POST ${ORDENES}`]))
    const c = cuerpoDe(`POST ${ORDENES}`)
    expect(c).toMatchObject({ dias_rotacion: 30, dias_cobertura: 15, plazo_entrega_dias: 3 })
    expect((c.producto_ids as number[]).sort()).toEqual([1, 2, 3])            // Azúcar (sin proveedor) no viaja
    expect(typeof c.clave_operacion).toBe('string')
    expect('sucursal_id' in c || 'categoria' in c || 'proveedor_id' in c).toBe(false)
    const d = within(await screen.findByRole('dialog'))
    expect(await d.findByRole('link', { name: 'OC-000041' })).toHaveAttribute('href', '/compras/41')
    expect(d.getByRole('link', { name: 'OC-000042' })).toHaveAttribute('href', '/compras/42')
    expect(d.getByText(/Sin costo cargado, completalo antes de enviar: Fideos/)).toBeTruthy()
    expect(d.getByText(/Sin proveedor habitual, no entraron: Azúcar/)).toBeTruthy()
    // La lista se recarga (lo creado ya cuenta como pedido).
    await waitFor(() => expect(pedidas().filter((p) => p.startsWith(`GET ${RUTA}?`)).length).toBeGreaterThanOrEqual(2))
  })

  it('los filtros de la pantalla viajan: sucursal, categoría y proveedor', async () => {
    const user = userEvent.setup()
    await abrir({ conGenerarOrdenes: true }, {
      ...TODO, '/api/sucursales': [{ id: 2, nombre: 'Norte', codigo: null, direccion: null, activa: 1, es_default: 0, deposito_predeterminado_id: 2, depositos: 1 }],
      '/api/productos/categorias': [{ id: 1, nombre: 'Almacén' }],
    })
    await user.selectOptions(await screen.findByLabelText('Sucursal'), '2')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Almacén')
    await user.selectOptions(screen.getByLabelText('Proveedor'), '7')
    await waitFor(() => expect(pedidas().filter((p) => p.includes('proveedor_id=7')).length).toBeGreaterThan(0))
    await user.click(await screen.findByRole('button', { name: /Generar órdenes en borrador/ }))
    await user.click(within(dialogo()).getByRole('button', { name: /^Crear/ }))
    await waitFor(() => expect(escrituras()).toHaveLength(1))
    expect(cuerpoDe(`POST ${ORDENES}`)).toMatchObject({ sucursal_id: 2, categoria: 'Almacén', proveedor_id: 7 })
  })

  it('si no hay ningún producto con proveedor y algo que pedir, lo dice y no deja crear', async () => {
    const user = userEvent.setup()
    await abrir({ conGenerarOrdenes: true }, { ...TODO, [RUTA]: { ...DATA, productos: [AZUCAR, SIN_PEDIDO] } })
    await user.click(boton()!)
    expect(within(dialogo()).getByText(/Ningún producto de la lista tiene proveedor habitual/)).toBeTruthy()
    expect(within(dialogo()).getByRole('button', { name: /^Crear/ })).toBeDisabled()
  })

  it('un error se muestra y el reintento manda LA MISMA clave (si el primero llegó, el motor devuelve lo mismo)', async () => {
    const user = userEvent.setup()
    await abrir()
    let intento = 0
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === ORDENES && init?.method === 'POST') {
        intento += 1
        return Promise.reject(new TypeError('sin red')).catch((e) => { if (intento === 1) throw e; return json({ ...RESULTADO, repetida: true }) })
      }
      return original(entrada, init)
    })
    await user.click(boton()!)
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(/Error de conexión/)
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    expect(await within(dialogo()).findByText(/ya se habían creado con este mismo pedido/)).toBeTruthy()
    const claves = fetchMock.mock.calls.filter((c) => String(c[0]) === ORDENES).map((c) => JSON.parse(String((c[1] as RequestInit).body)).clave_operacion)
    expect(claves).toHaveLength(2)
    expect(claves[0]).toBe(claves[1])
  })

  it('tras una respuesta buena, abrir de nuevo es otra operación con otra clave', async () => {
    const user = userEvent.setup()
    await abrir()
    for (let i = 0; i < 2; i += 1) {
      await user.click(boton()!)
      await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
      await within(await screen.findByRole('dialog')).findByRole('link', { name: 'OC-000041' })
      await user.click(within(dialogo()).getByRole('button', { name: 'Cerrar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
    const claves = fetchMock.mock.calls.filter((c) => String(c[0]) === ORDENES).map((c) => JSON.parse(String((c[1] as RequestInit).body)).clave_operacion)
    expect(claves).toHaveLength(2)
    expect(claves[0]).not.toBe(claves[1])
  })

  it('tras un corte sin saber si el motor lo creó, cerrar y reabrir reintenta con la MISMA clave', async () => {
    const user = userEvent.setup()
    await abrir()
    let intento = 0
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === ORDENES && init?.method === 'POST') {
        intento += 1
        return intento === 1 ? Promise.reject(new TypeError('sin red')) : Promise.resolve(json({ ...RESULTADO, repetida: true }))
      }
      return original(entrada, init)
    })
    await user.click(boton()!)
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    expect(await within(dialogo()).findByRole('alert')).toBeTruthy()
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))              // cierra sin saber qué pasó
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(boton()!)
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    expect(await within(dialogo()).findByText(/ya se habían creado con este mismo pedido/)).toBeTruthy()
    const claves = fetchMock.mock.calls.filter((c) => String(c[0]) === ORDENES).map((c) => JSON.parse(String((c[1] as RequestInit).body)).clave_operacion)
    expect(claves).toHaveLength(2)
    expect(claves[0]).toBe(claves[1])
  })

  it('los topes mandan la cantidad que se vio de cada producto', async () => {
    const user = userEvent.setup()
    await abrir()
    await user.click(boton()!)
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    await waitFor(() => expect(escrituras()).toHaveLength(1))
    expect(cuerpoDe(`POST ${ORDENES}`).topes).toEqual({ 1: 8, 2: 4, 3: 8 })
  })

  it('el servidor sin la migración (503) lo explica; un 422 muestra su detalle; y cancelar no escribe', async () => {
    const user = userEvent.setup()
    await abrir({ conGenerarOrdenes: true }, { ...TODO, [`POST ${ORDENES}`]: { status: 503, detail: 'Falta la revisión' } })
    await user.click(boton()!)
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(/falta la migración del motor/)
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('si la recarga de la lista falla después de crear, el diálogo con el resultado y los enlaces sigue ahí', async () => {
    const user = userEvent.setup()
    await abrir()
    const original = fetchMock.getMockImplementation()!
    await user.click(boton()!)
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada).startsWith(`${RUTA}?`)) return Promise.resolve(json({ detail: 'caído' }, 500))      // la recarga falla
      return original(entrada, init)
    })
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    expect(await within(dialogo()).findByRole('link', { name: 'OC-000041' })).toBeTruthy()
    await new Promise((r) => setTimeout(r, 50))
    expect(within(dialogo()).getByRole('link', { name: 'OC-000042' })).toBeTruthy()      // sigue ahí aunque la lista de fondo se haya vaciado
  })

  it('una respuesta con cero órdenes (lo sugerido cambió) también recarga la lista', async () => {
    const user = userEvent.setup()
    await abrir({ conGenerarOrdenes: true }, { ...TODO, [`POST ${ORDENES}`]: { ordenes: [], sin_proveedor: [], omitidos: [1, 2, 3], repetida: false } })
    await user.click(boton()!)
    const antes = pedidas().filter((p) => p.startsWith(`GET ${RUTA}?`)).length
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear 2 órdenes' }))
    expect(await within(dialogo()).findByText(/No había nada para crear/)).toBeTruthy()
    await waitFor(() => expect(pedidas().filter((p) => p.startsWith(`GET ${RUTA}?`)).length).toBeGreaterThan(antes))
  })
})

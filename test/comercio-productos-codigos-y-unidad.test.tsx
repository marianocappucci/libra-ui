// Dos defectos que apareció una verificación con Chromium real sobre VentaLibra (0.112.0, ADR-014):
//  1. el diálogo «Gestionar códigos y variantes» mostraba el 403 crudo («forbidden») y dejaba agregar a quien no puede (`conEdicionDelProducto`);
//  2. el alta arrancaba con la unidad `'u'` aunque el catálogo de la instalación no la tenga: el `POST` daba 422 «unidad desconocida».
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { Productos } from '../src/comercio/Productos'
import { ProductoCodigosVariantes } from '../src/comercio/ProductoCodigosVariantes'
import type { Producto } from '../src/comercio/tipos'
import { cuerpoDe, fetchMock, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const producto = (extra: Partial<Producto> = {}): Producto => ({
  id: 1, codigo: 'Y1', nombre: 'Yerba', descripcion: '', precio_venta: 100, precio_costo: 60, unidad: 'UN', categoria: '', stock_minimo: 0,
  estacion: '', vendible: 1, activo: 1, tipo: 'producto', ...extra,
})
const YERBA = producto()
const base = { '/api/productos': [YERBA], '/api/productos/categorias': [] }
const CODIGOS = '/api/productos/1/codigos'
const VARIANTES = '/api/productos/1/variantes'
const conLecturas = { [`GET ${CODIGOS}`]: [{ id: 1, tipo: 'barcode', codigo: '7790001', es_principal: true }], [`GET ${VARIANTES}`]: [{ id: 5, sku: 'Y-M', nombre: 'M / Azul' }] }

beforeEach(() => {
  cleanup()
  prepararFetch()
})

const dialogo = () => screen.getByRole('dialog')
const selectDeUnidad = () => within(dialogo()).getAllByRole('combobox').find((el) => el.tagName === 'SELECT') as HTMLSelectElement
const opcionesDe = (s: HTMLSelectElement) => Array.from(s.querySelectorAll('option')).map((o) => o.textContent)
const escrituras = () => pedidas().filter((p) => p.startsWith('PUT ') || p.startsWith('POST ') || p.startsWith('DELETE '))

describe('Gestionar códigos y variantes: errores en castellano', () => {
  async function abrirYAgregar(errorDelPost: { status: number; detail: string }) {
    responder({ ...conLecturas, [`POST ${CODIGOS}`]: errorDelPost })
    const user = userEvent.setup()
    montar('/x', <ProductoCodigosVariantes producto={YERBA} onClose={() => {}} />)
    await screen.findByText(/7790001/)
    await user.type(within(dialogo()).getByLabelText('Código'), '123')
    await user.click(within(dialogo()).getAllByRole('button', { name: 'Agregar' })[0])  // el de códigos
  }

  it('un 403 «forbidden» se dice en castellano, no en inglés', async () => {
    await abrirYAgregar({ status: 403, detail: 'forbidden' })
    expect(await within(dialogo()).findByText('No tenés permiso para hacer esto.')).toBeTruthy()
    expect(within(dialogo()).queryByText('forbidden')).toBeNull()
  })

  it('un 401 «not authenticated» dice que la sesión venció', async () => {
    await abrirYAgregar({ status: 401, detail: 'Not authenticated' })
    expect(await within(dialogo()).findByText('Tu sesión venció. Volvé a iniciar sesión.')).toBeTruthy()
  })

  it('un detail propio del backend se conserva tal cual', async () => {
    await abrirYAgregar({ status: 403, detail: 'No tenés permiso para cargar códigos de balanza.' })
    expect(await within(dialogo()).findByText('No tenés permiso para cargar códigos de balanza.')).toBeTruthy()
  })

  it('el error se anuncia como alerta para el lector de pantalla', async () => {
    await abrirYAgregar({ status: 409, detail: 'el código ya existe' })
    expect((await within(dialogo()).findByRole('alert')).textContent).toBe('el código ya existe')
  })

  it('un 409 con su detail propio no se toca', async () => {
    await abrirYAgregar({ status: 409, detail: 'el código ya existe' })
    expect(await within(dialogo()).findByText('el código ya existe')).toBeTruthy()
  })

  it('un 403 al LEER la lista también sale en castellano (desde Productos con conDetalle)', async () => {
    responder({ ...base, [`GET ${CODIGOS}`]: { status: 403, detail: 'forbidden' }, [`GET ${VARIANTES}`]: [] })
    const user = userEvent.setup()
    montar('/productos', <Productos conDetalle />)
    await screen.findByText('Yerba')
    await user.click(screen.getByLabelText('Gestionar códigos y variantes'))
    expect(await within(dialogo()).findByText('No tenés permiso para hacer esto.')).toBeTruthy()
    expect(within(dialogo()).queryByText('forbidden')).toBeNull()
  })
})

describe('Gestionar códigos y variantes: conEdicionDelProducto', () => {
  it('por defecto se puede agregar códigos y variantes y no hay nota', async () => {
    responder(conLecturas)
    montar('/x', <ProductoCodigosVariantes producto={YERBA} onClose={() => {}} />)
    await screen.findByText(/7790001/)
    expect(within(dialogo()).getAllByRole('button', { name: 'Agregar' })).toHaveLength(2)
    expect(within(dialogo()).getByLabelText('Código')).toBeTruthy()
    expect(within(dialogo()).getByLabelText('SKU')).toBeTruthy()
    expect(screen.queryByText('Tu rol sólo puede ver los códigos y variantes de este producto.')).toBeNull()
  })

  it('con false no deja escribir, dice por qué y la lista sigue a la vista', async () => {
    responder(conLecturas)
    montar('/x', <ProductoCodigosVariantes producto={YERBA} conEdicionDelProducto={false} onClose={() => {}} />)
    await screen.findByText(/7790001/)
    expect(within(dialogo()).getByText('Tu rol sólo puede ver los códigos y variantes de este producto.')).toBeTruthy()
    expect(within(dialogo()).getByText(/Y-M — M \/ Azul/)).toBeTruthy()
    expect(within(dialogo()).queryByRole('button', { name: 'Agregar' })).toBeNull()
    expect(within(dialogo()).queryByLabelText('Código')).toBeNull()
    expect(within(dialogo()).queryByLabelText('SKU')).toBeNull()
    expect(escrituras()).toEqual([])
  })

  it('Productos le pasa conEdicionDelProducto al diálogo (false: sólo lectura; sin la prop: se puede agregar)', async () => {
    responder({ ...base, ...conLecturas })
    const user = userEvent.setup()
    const { unmount } = montar('/productos', <Productos conDetalle conEdicionDelProducto={false} conAlta={false} />)
    await screen.findByText('Yerba')
    await user.click(screen.getByLabelText('Gestionar códigos y variantes'))
    await within(await screen.findByRole('dialog')).findByText(/7790001/)
    expect(within(dialogo()).getByText('Tu rol sólo puede ver los códigos y variantes de este producto.')).toBeTruthy()
    expect(within(dialogo()).queryByRole('button', { name: 'Agregar' })).toBeNull()
    unmount()
    cleanup()
    montar('/productos', <Productos conDetalle />)
    await screen.findByText('Yerba')
    await user.click(screen.getByLabelText('Gestionar códigos y variantes'))
    await within(await screen.findByRole('dialog')).findByText(/7790001/)
    expect(within(dialogo()).getAllByRole('button', { name: 'Agregar' })).toHaveLength(2)
  })
})

describe('Productos: la unidad del alta sale del catálogo', () => {
  async function abrirAlta(unidades: unknown, extra: Record<string, unknown> = {}) {
    responder({ ...base, '/api/productos/unidades': unidades, 'POST /api/productos': { ...YERBA, id: 9 }, ...extra })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Yerba')
    await waitFor(() => expect(pedidas()).toContain('GET /api/productos/unidades'))
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    await screen.findByRole('dialog')
    return user
  }
  const crear = async (user: ReturnType<typeof userEvent.setup>, nombre = 'Mate') => {
    await user.type(within(dialogo()).getByLabelText('Nombre'), nombre)
    await user.click(within(dialogo()).getByRole('button', { name: 'Crear producto' }))
  }

  it('sin «u» en el catálogo arranca con la primera unidad real y manda ESA', async () => {
    const user = await abrirAlta(['UN', 'KG'])
    await waitFor(() => expect(selectDeUnidad().value).toBe('UN'))
    expect(opcionesDe(selectDeUnidad())).toEqual(['UN', 'KG'])
    await crear(user)
    await waitFor(() => expect(escrituras()).toContain('POST /api/productos'))
    expect(cuerpoDe('POST /api/productos').unidad).toBe('UN')
  })

  it('con «u» en el catálogo arranca con «u», como siempre (aunque no sea la primera)', async () => {
    const user = await abrirAlta(['kg', 'u', 'caja'])
    await waitFor(() => expect(selectDeUnidad().value).toBe('u'))
    await crear(user)
    await waitFor(() => expect(escrituras()).toContain('POST /api/productos'))
    expect(cuerpoDe('POST /api/productos').unidad).toBe('u')
  })

  it('si el backend no tiene el endpoint de unidades queda la lista de siempre y arranca con «u»', async () => {
    const user = await abrirAlta({ status: 404, detail: 'not found' })
    await waitFor(() => expect(selectDeUnidad().value).toBe('u'))
    await crear(user)
    await waitFor(() => expect(escrituras()).toContain('POST /api/productos'))
    expect(cuerpoDe('POST /api/productos').unidad).toBe('u')
  })

  it('con el catálogo vacío no inventa «u»: pide elegir y no manda nada', async () => {
    const user = await abrirAlta([])
    expect(opcionesDe(selectDeUnidad())).toEqual([])
    expect(selectDeUnidad().value).toBe('')
    await crear(user)
    expect(await within(dialogo()).findByText('Elegí una unidad.')).toBeTruthy()
    expect(escrituras()).toEqual([])
  })

  it('si el catálogo llega con el alta ya abierta, la unidad se completa sola', async () => {
    let soltar: (v: Response) => void = () => {}
    responder({ ...base, 'POST /api/productos': { ...YERBA, id: 9 } })
    const respuestaBase = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) =>
      String(entrada) === '/api/productos/unidades'
        ? new Promise<Response>((resolver) => { soltar = resolver })
        : respuestaBase(entrada, init))
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Yerba')
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    await screen.findByRole('dialog')
    expect(opcionesDe(selectDeUnidad())).toEqual([])
    expect(selectDeUnidad().value).toBe('')
    soltar(new Response(JSON.stringify(['UN']), { status: 200, headers: { 'content-type': 'application/json' } }))
    await waitFor(() => expect(selectDeUnidad().value).toBe('UN'))
    // (el `<select>` nativo muestra la primera opción aunque el formulario no tenga valor: lo que cuenta es lo que se manda.)
    await crear(user)
    await waitFor(() => expect(escrituras()).toContain('POST /api/productos'))
    expect(cuerpoDe('POST /api/productos').unidad).toBe('UN')
  })

  it('al editar, la unidad del producto se conserva aunque el catálogo no la tenga, y es la única que se agrega a las opciones', async () => {
    responder({ ...base, '/api/productos': [producto({ unidad: 'bulto' })], '/api/productos/unidades': ['UN', 'KG'], 'PUT /api/productos/1': { id: 1 } })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Yerba')
    await waitFor(() => expect(pedidas()).toContain('GET /api/productos/unidades'))
    await user.click(screen.getByLabelText('Editar producto'))
    await screen.findByRole('dialog')
    expect(selectDeUnidad().value).toBe('bulto')
    expect(opcionesDe(selectDeUnidad())).toEqual(['UN', 'KG', 'bulto'])
    await user.click(within(dialogo()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(escrituras()).toContain('PUT /api/productos/1'))
    expect(cuerpoDe('PUT /api/productos/1').unidad).toBe('bulto')
  })

  it('después de editar un producto con otra unidad, el alta no la arrastra: vuelve a la del catálogo', async () => {
    responder({ ...base, '/api/productos': [producto({ unidad: 'bulto' })], '/api/productos/unidades': ['UN', 'KG'] })
    const user = userEvent.setup()
    montar('/productos', <Productos />)
    await screen.findByText('Yerba')
    await waitFor(() => expect(pedidas()).toContain('GET /api/productos/unidades'))
    await user.click(screen.getByLabelText('Editar producto'))
    await screen.findByRole('dialog')
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    await screen.findByRole('dialog')
    expect(selectDeUnidad().value).toBe('UN')
    expect(opcionesDe(selectDeUnidad())).toEqual(['UN', 'KG'])
  })
})

// ESTRUCTURAL: jsdom no calcula colores ni contraste; esto sólo prueba qué clases llevan los campos. El contraste (≥ 4,5:1) se estimó con los colores computados por defecto de shadcn
// (ADR-014) y hay que mirarlo con Chromium. El `Select` del stub no reenvía el `className` del disparador: la unidad y el tipo no se pueden comprobar acá.
describe('Productos: campos de sólo lectura por rol legibles (estructural)', () => {
  const CAMPOS = ['Nombre', 'Código', 'Categoría', 'Precio de venta', 'Precio de costo', 'Stock mínimo', 'Descripción']
  const campo = (etiqueta: string) => within(dialogo()).getByLabelText(etiqueta) as HTMLInputElement
  const CLASES = ['disabled:opacity-100', 'disabled:bg-muted', 'disabled:text-foreground/75', 'dark:disabled:bg-muted']

  async function editar(props: Record<string, boolean>) {
    responder({ ...base, '/api/productos/unidades': ['UN'] })
    const user = userEvent.setup()
    montar('/productos', <Productos {...props} />)
    await screen.findByText('Yerba')
    await user.click(screen.getByLabelText('Editar producto'))
    await screen.findByRole('dialog')
  }

  it('con conEdicionDelProducto={false} los campos del producto llevan opacidad completa, fondo muted y texto atenuado pero legible (no el opacity-50 del kit)', async () => {
    await editar({ conEdicionDelProducto: false })
    for (const e of CAMPOS) {
      expect(campo(e).disabled, e).toBe(true)
      for (const c of CLASES) expect(campo(e).className, `${e}: ${c}`).toContain(c)
    }
  })

  it('sin la prop los campos son editables y no llevan esas clases (el estilo del kit no cambia)', async () => {
    await editar({})
    for (const e of CAMPOS) {
      expect(campo(e).disabled, e).toBe(false)
      for (const c of CLASES) expect(campo(e).className, `${e}: ${c}`).not.toContain(c)
    }
  })
})

// Etiquetas de góndola (roadmap de producto de VentaLibra, 2026-09-29): se eligen productos, se ve la hoja y se
// imprime. Es de sólo lectura: lee productos, categorías y listas de precio que el motor ya expone.
//
// 🔴 Lo que estos tests cuidan es lo que sale **en el papel**: que el precio de la etiqueta sea el que cobra el POS
// (el de la lista predeterminada, con el del producto de respaldo), que se impriman los elegidos y sólo ellos, y que
// la hoja cuelgue directo de `document.body` — el `@media print` esconde "todo lo demás del body", y una hoja anidada
// en el layout se escondería con él.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EtiquetasGondola } from '../src/comercio/EtiquetasGondola'
import type { ItemListaPrecio, ListaPrecio, Producto } from '../src/comercio/tipos'
import { fetchMock, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

function producto(id: number, resto: Partial<Producto>): Producto {
  return {
    id, codigo: null, nombre: `Producto ${id}`, descripcion: '', precio_venta: 1000, precio_costo: 500, unidad: 'u',
    categoria: 'Almacén', stock_minimo: 0, estacion: '', vendible: 1, activo: 1, tipo: 'producto', ...resto,
  }
}

const PRODUCTOS: Producto[] = [
  producto(1, { nombre: 'Yerba Mate 500g', codigo: '5901234123457', precio_venta: 3000, categoria: 'Almacén' }),
  producto(2, { nombre: 'Gaseosa Cola 2,25 lt', codigo: 'BEB-0001', precio_venta: 2500, categoria: 'Bebidas' }),
  producto(3, { nombre: 'Pan al peso', codigo: null, precio_venta: 1800, unidad: 'kg', categoria: 'Panadería' }),
  producto(4, { nombre: 'Producto dado de baja', codigo: '111', activo: 0 }),
  producto(5, { nombre: 'Flete a domicilio', codigo: 'SRV-0001', tipo: 'servicio' }),
]

const CATEGORIAS = [{ id: 1, nombre: 'Almacén' }, { id: 2, nombre: 'Bebidas' }, { id: 3, nombre: 'Panadería' }]

const LISTAS: ListaPrecio[] = [
  { id: 10, nombre: 'Mayorista', descripcion: '', activa: 1, es_default: 0 },
  { id: 11, nombre: 'Lista 2026', descripcion: '', activa: 1, es_default: 1 },
]

function item(id: number, resto: Partial<ItemListaPrecio>): ItemListaPrecio {
  return {
    id, codigo: null, nombre: `Producto ${id}`, unidad: 'u', categoria: 'Almacén', precio_venta: 1000, precio_costo: 500,
    precio_lista: 0, en_lista: 0, ...resto,
  }
}

// La lista 11 (la predeterminada) sólo tiene precio para la yerba y la gaseosa; el pan no está.
const ITEMS_11 = [
  item(1, { precio_venta: 3000, precio_lista: 3300, en_lista: 1 }),
  item(2, { precio_venta: 2500, precio_lista: 2750, en_lista: 1 }),
  item(3, { precio_venta: 1800, precio_lista: 0, en_lista: 0 }),
]
const ITEMS_10 = [item(1, { precio_lista: 2900, en_lista: 1 })]

function backend(extra: Record<string, unknown> = {}) {
  responder({
    'GET /api/productos': PRODUCTOS,
    'GET /api/productos/categorias': CATEGORIAS,
    'GET /api/listas-precio': LISTAS,
    'GET /api/listas-precio/11/items': ITEMS_11,
    'GET /api/listas-precio/10/items': ITEMS_10,
    ...extra,
  })
}

async function montarPantalla() {
  const user = userEvent.setup()
  montar('/etiquetas', <EtiquetasGondola />)
  await screen.findByText('Yerba Mate 500g')
  return user
}

const tildar = (user: ReturnType<typeof userEvent.setup>, nombre: string) =>
  user.click(screen.getByRole('checkbox', { name: `Etiqueta de ${nombre}` }))

const hoja = () => screen.getByRole('dialog', { name: 'Vista de impresión de etiquetas' })

beforeEach(() => {
  cleanup()
  prepararFetch()
  vi.stubGlobal('print', vi.fn())
})

describe('el listado', () => {
  it('ofrece los productos activos que no son servicios', async () => {
    backend()
    await montarPantalla()
    expect(screen.getByText('Gaseosa Cola 2,25 lt')).toBeInTheDocument()
    expect(screen.getByText('Pan al peso')).toBeInTheDocument()
    expect(screen.queryByText('Producto dado de baja')).not.toBeInTheDocument()
    expect(screen.queryByText('Flete a domicilio')).not.toBeInTheDocument()
  })

  it('un producto sin código lo dice en la fila', async () => {
    backend()
    await montarPantalla()
    expect(screen.getByText('Sin código')).toBeInTheDocument()
  })

  it('la búsqueda y la categoría filtran lo que se ve', async () => {
    backend()
    const user = await montarPantalla()

    await user.type(screen.getByLabelText('Buscar producto'), 'gaseosa')
    expect(screen.queryByText('Yerba Mate 500g')).not.toBeInTheDocument()
    expect(screen.getByText('Gaseosa Cola 2,25 lt')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Buscar producto'))
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Panadería')
    expect(screen.queryByText('Yerba Mate 500g')).not.toBeInTheDocument()
    expect(screen.getByText('Pan al peso')).toBeInTheDocument()
  })

  it('un error al cargar los productos se muestra sin romper la pantalla', async () => {
    backend({ 'GET /api/productos': { status: 500, detail: 'La base no contesta.' } })
    montar('/etiquetas', <EtiquetasGondola />)
    await screen.findByText('La base no contesta.')
  })

  it('sin categorías ni permiso de listas la pantalla sigue, sin esos filtros', async () => {
    backend({
      'GET /api/productos/categorias': { status: 500, detail: 'x' },
      'GET /api/listas-precio': { status: 403, detail: 'Sólo un administrador.' },
    })
    await montarPantalla()
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Precio')).not.toBeInTheDocument()
    expect(screen.getByText(/3\.000,00/)).toBeInTheDocument()
  })
})

describe('el precio de la etiqueta', () => {
  it('🔴 arranca en la lista predeterminada, como el POS, y cae al precio del producto si la lista no lo tiene', async () => {
    backend()
    await montarPantalla()
    await waitFor(() => expect(screen.getByText(/3\.300,00/)).toBeInTheDocument())
    expect(screen.getByText(/2\.750,00/)).toBeInTheDocument()
    // El pan no está en la lista 11: se queda con el suyo.
    expect(screen.getByText(/1\.800,00/)).toBeInTheDocument()
    expect(pedidas()).toContain('GET /api/listas-precio/11/items')
  })

  it('sin lista predeterminada usa el precio de venta y no pide precios de ninguna lista', async () => {
    backend({ 'GET /api/listas-precio': [{ ...LISTAS[0] }, { ...LISTAS[1], es_default: 0 }] })
    await montarPantalla()
    expect(screen.getByText(/3\.000,00/)).toBeInTheDocument()
    expect(pedidas().some((p) => p.includes('/items'))).toBe(false)
  })

  it('una lista inactiva no rige aunque esté marcada como predeterminada', async () => {
    backend({ 'GET /api/listas-precio': [{ ...LISTAS[1], activa: 0 }] })
    await montarPantalla()
    expect(screen.getByText(/3\.000,00/)).toBeInTheDocument()
    expect(pedidas().some((p) => p.includes('/items'))).toBe(false)
  })

  it('elegir otra lista, o el precio del producto, cambia los precios', async () => {
    backend()
    const user = await montarPantalla()
    await waitFor(() => expect(screen.getByText(/3\.300,00/)).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('Precio'), '10')
    await waitFor(() => expect(screen.getByText(/2\.900,00/)).toBeInTheDocument())
    expect(screen.queryByText(/3\.300,00/)).not.toBeInTheDocument()
    // La gaseosa no está en la Mayorista: vuelve al precio del producto.
    expect(screen.getByText(/2\.500,00/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Precio'), '__catalogo__')
    expect(screen.getByText(/3\.000,00/)).toBeInTheDocument()
  })

  it('si fallan los precios de la lista avisa y usa el precio del producto', async () => {
    backend({ 'GET /api/listas-precio/11/items': { status: 500, detail: 'x' } })
    await montarPantalla()
    await screen.findByText(/No se pudieron leer los precios de la lista/)
    expect(screen.getByText(/3\.000,00/)).toBeInTheDocument()
    expect((screen.getByLabelText('Precio') as HTMLSelectElement).value).toBe('__catalogo__')
  })
})

describe('elegir productos', () => {
  it('«Ver e imprimir» está apagado hasta que se elige alguno', async () => {
    backend()
    const user = await montarPantalla()
    expect(screen.getByRole('button', { name: /Ver e imprimir/ })).toBeDisabled()
    expect(screen.getByText('0 elegidos')).toBeInTheDocument()

    await tildar(user, 'Pan al peso')
    // `waitFor`: bajo carga (la suite completa en un runner lento) el re-render de la selección llega después del clic y la aserción inmediata fallaba de forma intermitente.
    // Con el segundo de espera por defecto volvió a fallar en el CI (libra-ui#259, 2026-10-05): 5 s.
    await waitFor(() => expect(screen.getByRole('button', { name: /Ver e imprimir/ })).toBeEnabled(), { timeout: 5000 })
    expect(screen.getByText('1 elegido')).toBeInTheDocument()
  })

  it('«Elegir los N que se ven» toma sólo lo filtrado, y la selección sobrevive al cambiar de filtro', async () => {
    backend()
    const user = await montarPantalla()

    await user.selectOptions(screen.getByLabelText('Categoría'), 'Bebidas')
    await user.click(screen.getByRole('button', { name: 'Elegir los 1 que se ven' }))
    expect(screen.getByText('1 elegido')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Categoría'), '__todas__')
    expect(screen.getByRole('checkbox', { name: 'Etiqueta de Gaseosa Cola 2,25 lt' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Etiqueta de Yerba Mate 500g' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Elegir los 3 que se ven' }))
    expect(screen.getByText('3 elegidos')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Quitar la selección' }))
    expect(screen.getByText('0 elegidos')).toBeInTheDocument()
  })
})

describe('la hoja de impresión', () => {
  async function abrirHoja(nombres: string[]) {
    backend()
    const user = await montarPantalla()
    await waitFor(() => expect(screen.getByText(/3\.300,00/)).toBeInTheDocument())
    for (const n of nombres) await tildar(user, n)
    await user.click(screen.getByRole('button', { name: /Ver e imprimir/ }))
    return user
  }

  it('lleva nombre, precio y código de barras de cada elegido, y sólo de los elegidos', async () => {
    await abrirHoja(['Yerba Mate 500g', 'Pan al peso'])
    const etiquetas = within(hoja()).getAllByText(/./, { selector: '[data-etiqueta] p:first-child' })
    expect(etiquetas.map((e) => e.textContent)).toEqual(['Yerba Mate 500g', 'Pan al peso'])
    expect(within(hoja()).queryByText('Gaseosa Cola 2,25 lt')).not.toBeInTheDocument()

    const yerba = hoja().querySelectorAll('[data-etiqueta]')[0] as HTMLElement
    expect(within(yerba).getByText(/3\.300,00/)).toBeInTheDocument()
    expect(within(yerba).getByText('5901234123457')).toBeInTheDocument()
    expect(yerba.querySelector('svg')).toHaveAttribute('data-formato', 'ean13')
  })

  it('🔴 un producto sin código sale sin barras, y uno por peso lleva su unidad', async () => {
    await abrirHoja(['Pan al peso'])
    const pan = hoja().querySelector('[data-etiqueta]') as HTMLElement
    expect(pan.querySelector('svg')).toBeNull()
    expect(within(pan).getByText('/ kg')).toBeInTheDocument()
  })

  it('un código interno (BEB-0001) sale en Code 128', async () => {
    await abrirHoja(['Gaseosa Cola 2,25 lt'])
    // El primer `svg` de la hoja es el icono de imprimir de la barra: las barras se buscan por su atributo.
    expect(hoja().querySelector('[data-etiqueta] svg')).toHaveAttribute('data-formato', 'code128')
  })

  it('se imprime en el orden del listado, no en el que se tildó', async () => {
    await abrirHoja(['Pan al peso', 'Yerba Mate 500g'])
    const nombres = Array.from(hoja().querySelectorAll('[data-etiqueta] p:first-child')).map((p) => p.textContent)
    expect(nombres).toEqual(['Yerba Mate 500g', 'Pan al peso'])
  })

  it('🔴 la hoja cuelga directo de document.body y trae el CSS que esconde todo lo demás al imprimir', async () => {
    await abrirHoja(['Yerba Mate 500g'])
    // Si estuviera anidada en el layout, `body > *:not([data-etiquetas-impresion])` la escondería con él.
    expect(hoja().parentElement).toBe(document.body)
    const css = hoja().querySelector('style')!.textContent!
    expect(css).toContain('@media print')
    expect(css).toContain('body > *:not([data-etiquetas-impresion]) { display: none !important; }')
    expect(css).toContain('@page { size: A4 portrait; margin: 10mm; }')
  })

  it('«Imprimir» manda la hoja al navegador', async () => {
    const user = await abrirHoja(['Yerba Mate 500g'])
    await user.click(screen.getByRole('button', { name: /Imprimir/ }))
    expect(window.print).toHaveBeenCalledTimes(1)
  })

  it('las columnas se eligen: 3 por defecto', async () => {
    const user = await abrirHoja(['Yerba Mate 500g'])
    const grilla = hoja().querySelector('[data-etiqueta]')!.parentElement as HTMLElement
    expect(grilla.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
    await user.selectOptions(screen.getByLabelText('Columnas'), '4')
    expect(grilla.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))')
  })

  it('«Volver» y Escape cierran la hoja, y con ella se va el @page: no queda en otras impresiones', async () => {
    const user = await abrirHoja(['Yerba Mate 500g'])
    await user.click(screen.getByRole('button', { name: /Volver/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain('@page')
    // La selección sigue: se puede volver a abrir.
    expect(screen.getByText('1 elegido')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Ver e imprimir/ }))
    expect(hoja()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('no escribe nada: sólo pide datos con GET', async () => {
    await abrirHoja(['Yerba Mate 500g'])
    expect(pedidas().every((p) => p.startsWith('GET '))).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })
})

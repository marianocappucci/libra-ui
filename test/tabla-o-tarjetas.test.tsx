// `TablaOTarjetas`, `TarjetaDeFila`, el umbral `anchoMinimoDeColumnas` y `useBajoLg` (0.145.0, ADR-057): el mecanismo compartido por las listas de uso diario.
// Las pantallas tienen sus tests propios (`comercio-tablas-en-tarjetas`); acá, la pieza sola.
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ColumnDef } from '../src/data-table'
import { anchoMinimoDeColumnas } from '../src/tabla'
import { TablaOTarjetas, TarjetaDeFila } from '../src/tabla-o-tarjetas'
import { TACTIL, TACTIL_BAJO_LG, useBajoLg } from '../src/use-ancho'

type Fila = { id: number; nombre: string; detalle: string }
const FILAS: Fila[] = [{ id: 1, nombre: 'Ana', detalle: 'primera' }, { id: 2, nombre: 'Beto', detalle: 'segunda' }]

let anchoSimulado = 0
class ObservadorFalso {
  constructor(private readonly cb: (e: { contentRect: { width: number } }[]) => void) {}
  observe() { this.cb([{ contentRect: { width: anchoSimulado } }]) }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => { cleanup(); vi.stubGlobal('ResizeObserver', ObservadorFalso) })
afterEach(() => { vi.unstubAllGlobals() })

const col = (extra: Partial<ColumnDef<Fila>>): ColumnDef<Fila> => ({ accessorKey: 'nombre', header: 'Nombre', ...extra } as ColumnDef<Fila>)

describe('anchoMinimoDeColumnas: lo que la tabla necesita para no scrollear', () => {
  it('suma los `size` de las columnas visibles', () => {
    expect(anchoMinimoDeColumnas([col({ size: 100 }), col({ id: 'b', size: 80 })])).toBe(180)
  })

  it('una columna sin `size` vale 150 (el ancho por defecto de la tabla), como en el `DataTable`', () => {
    expect(anchoMinimoDeColumnas([col({ size: 100 }), col({ id: 'b' })])).toBe(250)
  })

  it('el `minSize` es un piso y el `maxSize` un techo: lo mismo que la tabla usa para el `min-width`', () => {
    expect(anchoMinimoDeColumnas([col({ size: 100, minSize: 140 })])).toBe(140)
    expect(anchoMinimoDeColumnas([col({ size: 300, maxSize: 200 })])).toBe(200)
  })

  it('las columnas `opcional` (ocultas por CSS en pantallas angostas) no cuentan', () => {
    expect(anchoMinimoDeColumnas([col({ size: 100 }), col({ id: 'b', size: 114, meta: { opcional: true } })])).toBe(100)
  })

  it('si ninguna columna declara `size` es 0: la tabla es de layout automático y no hay con qué medirla (nunca pasa a tarjetas)', () => {
    expect(anchoMinimoDeColumnas([col({}), col({ id: 'b' })])).toBe(0)
  })
})

describe('TablaOTarjetas', () => {
  const columnas = [col({ size: 200 }), col({ id: 'detalle', accessorKey: 'detalle', header: 'Detalle', size: 200 })]
  const tarjeta = (f: Fila) => <TarjetaDeFila titulo={f.nombre} subtitulo={f.detalle} acciones={<button type="button">Abrir {f.nombre}</button>} />
  const montar = (props: Partial<React.ComponentProps<typeof TablaOTarjetas<Fila>>> = {}) => render(
    <TablaOTarjetas columns={columnas} data={FILAS} tarjeta={tarjeta} clave={(f) => f.id} etiqueta="Filas" {...props} />,
  )

  it('con el contenedor tan ancho como la suma de las columnas es la tabla; un pixel menos, tarjetas', () => {
    anchoSimulado = 400
    montar()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Filas' })).toBeNull()
    cleanup()
    anchoSimulado = 399
    montar()
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Filas' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('sin medida (0) se queda la tabla', () => {
    anchoSimulado = 0
    montar()
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('«Cargando…» ocupa el lugar de la lista y el contenedor medido sigue montado', () => {
    anchoSimulado = 100
    const { container } = montar({ cargando: true })
    expect(screen.getByText('Cargando…')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.firstElementChild!.className).toContain('min-w-0')
  })

  it('sin filas, el mensaje de vacío, en tarjetas y en tabla', () => {
    anchoSimulado = 100
    montar({ data: [], emptyMessage: 'No hay nada.' })
    expect(screen.getByText('No hay nada.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
    cleanup()
    anchoSimulado = 1000
    montar({ data: [], emptyMessage: 'No hay nada.' })
    expect(screen.getByText('No hay nada.')).toBeTruthy()
  })

  it('el buscador viaja a las tarjetas, con el mismo criterio de la tabla (sin acentos, todos los términos)', async () => {
    const user = userEvent.setup()
    anchoSimulado = 100
    montar({ search: { campos: (f) => [f.nombre, f.detalle], ariaLabel: 'Buscar fila' } })
    expect(within(screen.getByRole('list', { name: 'Filas' })).getAllByRole('listitem')).toHaveLength(2)
    await user.type(screen.getByRole('searchbox', { name: 'Buscar fila' }), 'SEGUNDA beto')
    expect(within(screen.getByRole('list', { name: 'Filas' })).getAllByRole('listitem')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(within(screen.getByRole('list', { name: 'Filas' })).getAllByRole('listitem')).toHaveLength(2)
    await user.type(screen.getByRole('searchbox', { name: 'Buscar fila' }), 'nadie')
    expect(screen.getByText('Sin resultados para «nadie».')).toBeTruthy()
  })

  it('en la tabla pasa `getRowClassName` y `onRowClick` al `DataTable`', async () => {
    const user = userEvent.setup()
    const alClick = vi.fn()
    anchoSimulado = 1000
    montar({ getRowClassName: (f) => (f.id === 2 ? 'opacity-50' : undefined), onRowClick: alClick })
    expect(screen.getByText('Beto').closest('tr')!.className).toContain('opacity-50')
    await user.click(screen.getByText('Ana'))
    expect(alClick).toHaveBeenCalledWith(FILAS[0])
  })
})

describe('TarjetaDeFila', () => {
  it('el dato principal arriba con su estado, los secundarios rotulados (dt/dd) y las acciones en un contenedor de 44 px', () => {
    render(<ul><TarjetaDeFila titulo="Ana" subtitulo="sub" estado={<span>Activo</span>} datos={[{ etiqueta: 'CUIT', valor: '30-1' }, { etiqueta: 'Tel', valor: '—' }]} acciones={<button type="button">Ver</button>} /></ul>)
    const li = screen.getByRole('listitem')
    expect(li.className).toContain('grid-cols-[minmax(0,1fr)]')   // la columna puede achicarse: no ensancha la página
    expect(within(li).getByText('Ana').className).toContain('[overflow-wrap:anywhere]')
    expect(within(li).getByText('Activo')).toBeTruthy()
    expect(within(li).getByText('CUIT').tagName).toBe('DT')
    expect(within(li).getByText('CUIT').nextElementSibling!.tagName).toBe('DD')
    expect(within(li).getByText('Tel').nextElementSibling!.textContent).toBe('—')
    expect(within(li).getByRole('button', { name: 'Ver' }).parentElement!.className).toBe(TACTIL)
  })

  it('sin datos ni acciones no deja contenedores vacíos', () => {
    render(<ul><TarjetaDeFila titulo="Sola" /></ul>)
    const li = screen.getByRole('listitem')
    expect(li.querySelector('dl')).toBeNull()
    expect(li.children).toHaveLength(1)
  })

  it('`accionesConTexto` (ADR-065): botones con rótulo en una fila que se parte, de 44 px de alto y ancho libre; sin ellos no hay contenedor', () => {
    render(<ul><TarjetaDeFila titulo="Ana" accionesConTexto={<><button type="button">Conciliar</button><button type="button">Asignar vencimiento</button></>} /></ul>)
    const contenedor = screen.getByRole('button', { name: 'Conciliar' }).parentElement!
    expect(contenedor).toBe(screen.getByRole('button', { name: 'Asignar vencimiento' }).parentElement)
    expect(contenedor.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-2', '[&_button]:min-h-11', '[&_a]:min-h-11']))
    // No es el cuadrado de `TACTIL`: con `size-11` el rótulo se saldría de un botón de 44 px de ancho.
    expect(contenedor.className).not.toContain('size-11')
    cleanup()
    render(<ul><TarjetaDeFila titulo="Sola" /></ul>)
    expect(screen.getByRole('listitem').children).toHaveLength(1)
  })
})

describe('useBajoLg: la frontera de `max-lg` de Tailwind', () => {
  function ventana(matches: boolean) {
    const oyentes: (() => void)[] = []
    const mql = {
      get matches() { return matches }, media: '', addEventListener: (_: string, f: () => void) => oyentes.push(f), removeEventListener: (_: string, f: () => void) => { oyentes.splice(oyentes.indexOf(f), 1) },
    }
    vi.stubGlobal('matchMedia', vi.fn(() => mql))
    return { cambiar(nuevo: boolean) { matches = nuevo; oyentes.forEach((f) => f()) }, oyentes }
  }

  it('pregunta por menos de 1024 px (63,99 rem) y sigue los cambios de la ventana', () => {
    const v = ventana(true)
    const { result, unmount } = renderHook(() => useBajoLg())
    expect(result.current).toBe(true)
    expect(vi.mocked(window.matchMedia).mock.calls[0][0]).toBe('(max-width: 63.99rem)')
    act(() => v.cambiar(false))
    expect(result.current).toBe(false)
    unmount()
    expect(v.oyentes).toHaveLength(0)   // se da de baja
  })

  it('sin `matchMedia` es false: se cuenta con los botones de 36 px de escritorio', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useBajoLg())
    expect(result.current).toBe(false)
  })

  it('`TACTIL_BAJO_LG` pone los 44 px sólo bajo `lg`, para `<button>` y `<a>`', () => {
    expect(TACTIL_BAJO_LG.split(' ').sort()).toEqual(['max-lg:[&_a]:size-11', 'max-lg:[&_button]:size-11'])
  })
})

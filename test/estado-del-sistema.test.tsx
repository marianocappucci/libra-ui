// La barra de estado del pie (ADR-083; el motor es ADR-075 de libracore): la consulta compartida, el refresco, los
// textos y el componente en el layout. Datos ficticios.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BarraDeEstado } from '../src/BarraDeEstado'
import {
  INTERVALO_ESTADO_MS, MINIMO_ENTRE_CONSULTAS_MS, RUTA_ESTADO_DEL_SISTEMA, _reiniciarEstadoDelSistema, detalleArca,
  detalleLibraEdge, detalleRespaldo, haceCuanto, horasDesde, nivelGeneral, partesLibraEdge, textoArca, textoRespaldo,
  type EstadoDelSistema,
} from '../src/estado-del-sistema'
import { createLayout } from '../src/Layout'
import { RUTA_CONEXION_DEL_NODO, _reiniciarConexionDelNodo, consultarConexionDelNodo } from '../src/nodo-offline'

const ADMIN: EstadoDelSistema = {
  usuario: { nombre: 'Ana Prueba', rol: 'admin', sucursal: null },
  version: { producto: 'v2026.10.20-101500', motor: '1.187.0' },
  libraedge: null,
  arca: { nivel: 'atencion', vencido: false, servicio: 'facturacion', vence: '2026-11-09', dias_para_vencer: 20, ilegible: false, certificados: 1 },
  respaldo: { nivel: 'ok', ultimo: '2026-10-20T06:00:00+00:00', horas_desde_el_ultimo: 3, externo: null },
  refrescar_en_segundos: 300,
}
const CAJERO_EN_UN_NODO: EstadoDelSistema = {
  usuario: { nombre: 'Carlos Ficticio', rol: 'cajero', sucursal: 'Centro' },
  version: { producto: 'v2026.10.20-101500', motor: null },
  libraedge: { rol: 'nodo', en_linea: false, pendientes_de_subir: 12, a_facturar: 3, ultima_sincronizacion: '2026-10-20T12:00:00+00:00', nivel: 'atencion' },
  arca: null,
  respaldo: null,
  refrescar_en_segundos: 60,
}

let fetchMock: ReturnType<typeof vi.fn>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL) => {
    const path = String(entrada).split('?')[0]
    let valor = tabla[path]
    if (typeof valor === 'function') valor = (valor as () => unknown)()
    if (valor === undefined) return Promise.resolve(json({ detail: 'Not Found' }, 404))
    if (valor && typeof valor === 'object' && 'status' in valor && 'detail' in valor) {
      const e = valor as { status: number; detail: unknown }
      return Promise.resolve(json({ detail: e.detail }, e.status))
    }
    return Promise.resolve(json(valor))
  })
}

function pedidosA(ruta: string): number {
  return fetchMock.mock.calls.filter(([e]) => String(e).split('?')[0] === ruta).length
}

const Icono = () => null

function montarLayout(barraDeEstado?: Parameters<typeof createLayout>[0]['barraDeEstado'], nombre = 'Ana Prueba') {
  const Layout = createLayout({
    productName: 'VentaLibra', productInitial: 'V', navItems: [{ to: '/ventas', label: 'Ventas', icon: Icono }],
    useAuth: () => ({ user: { role: 'admin', name: nombre }, logout: vi.fn() }), barraDeEstado,
  })
  return render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

function ponerVisibilidad(valor: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => valor })
}

beforeEach(() => {
  _reiniciarEstadoDelSistema()
  _reiniciarConexionDelNodo()
  ponerVisibilidad('visible')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  _reiniciarEstadoDelSistema()
  _reiniciarConexionDelNodo()
})

describe('los textos', () => {
  it('cuánto hace', () => {
    expect(haceCuanto(null)).toBe('')
    expect(haceCuanto(0.001)).toBe('recién')
    expect(haceCuanto(0.5)).toBe('hace 30 min')
    expect(haceCuanto(3.2)).toBe('hace 3 h')
    expect(haceCuanto(50)).toBe('hace 2 días')
    expect(horasDesde('2026-10-20T10:00:00Z', Date.parse('2026-10-20T13:00:00Z'))).toBe(3)
    expect(horasDesde('cualquier cosa')).toBeNull()
  })

  it('LibraEdge en el nodo y en el central', () => {
    expect(partesLibraEdge(CAJERO_EN_UN_NODO.libraedge!)).toEqual(['Sin conexión', '12 por subir', '3 por facturar'])
    expect(partesLibraEdge({ rol: 'nodo', en_linea: true, pendientes_de_subir: 0, a_facturar: 0, ultima_sincronizacion: null, nivel: 'ok' }))
      .toEqual(['En línea'])
    expect(partesLibraEdge({ rol: 'central', nodos: 2, sin_noticias: 1, nivel: 'atencion' })).toEqual(['2 nodos', '1 sin noticias'])
    expect(detalleLibraEdge(CAJERO_EN_UN_NODO.libraedge!).join(' ')).toContain('12 operaciones esperan subir')
    expect(detalleLibraEdge(CAJERO_EN_UN_NODO.libraedge!).join(' ')).toContain('3 ventas esperan la factura')
    expect(detalleLibraEdge({ rol: 'nodo', en_linea: true, pendientes_de_subir: null, a_facturar: 1, ultima_sincronizacion: null, nivel: 'ok' }))
      .toEqual(['Este equipo está en línea con el central.', '1 venta espera la factura.'])
  })

  it('ARCA: al día no se muestra en la línea; por vencer, vencido e ilegible sí', () => {
    expect(textoArca({ nivel: 'ok', vencido: false, dias_para_vencer: 300, vence: '2027-08-16' })).toBeNull()
    expect(textoArca(ADMIN.arca!)).toBe('El certificado de ARCA vence en 20 días')
    expect(textoArca({ nivel: 'atencion', vencido: false, dias_para_vencer: 1 })).toBe('El certificado de ARCA vence mañana')
    expect(textoArca({ nivel: 'error', vencido: true })).toBe('Certificado de ARCA vencido')
    expect(textoArca({ nivel: 'error', vencido: false, ilegible: true })).toBe('Certificado de ARCA ilegible')
    expect(detalleArca(ADMIN.arca!)).toContain('09-11-2026')
    expect(detalleArca({ nivel: 'error', vencido: true })).toContain('Avisá al administrador')
    expect(detalleArca({ nivel: 'atencion', vencido: false, servicio: 'wscpe', vence: '2026-11-01', dias_para_vencer: 12 })).toContain('(wscpe)')
  })

  it('el respaldo', () => {
    expect(textoRespaldo(ADMIN.respaldo!)).toBe('Respaldo hace 3 h')
    expect(textoRespaldo({ nivel: 'atencion', ultimo: null, horas_desde_el_ultimo: null, externo: null })).toBe('Sin respaldos')
    expect(textoRespaldo({ ...ADMIN.respaldo!, nivel: 'error', externo: { al_dia: false, fallo: true, ultimo: null } }))
      .toBe('Falló la copia externa')
    expect(detalleRespaldo({ nivel: 'atencion', ultimo: '2026-10-17T06:00:00+00:00', horas_desde_el_ultimo: 75, externo: null }).join(' '))
      .toContain('no corrió')
  })

  it('el nivel de la barra es el peor', () => {
    expect(nivelGeneral(ADMIN)).toBe('atencion')
    expect(nivelGeneral({ ...ADMIN, arca: null })).toBe('ok')
    expect(nivelGeneral({ ...ADMIN, arca: { nivel: 'error', vencido: true } })).toBe('error')
  })
})

describe('la barra en el layout', () => {
  it('sin la prop no pide nada ni dibuja nada', async () => {
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: ADMIN })
    const { container } = montarLayout()
    await screen.findByText('contenido')
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(0)
    expect(container.querySelector('[data-slot="barra-de-estado"]')).toBeNull()
  })

  it('el administrador: usuario, ARCA por vencer, respaldo y versión, abajo del contenido', async () => {
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: ADMIN })
    const { container } = montarLayout(true)
    const barra = await waitFor(() => {
      const b = container.querySelector('[data-slot="barra-de-estado"]')
      expect(b).not.toBeNull()
      return b as HTMLElement
    })
    expect(within(barra).getByText('Ana Prueba')).toBeTruthy()
    expect(within(barra).getByText('El certificado de ARCA vence en 20 días')).toBeTruthy()
    expect(within(barra).getByText('Respaldo hace 3 h')).toBeTruthy()
    expect(within(barra).getByText('v2026.10.20-101500')).toBeTruthy()
    expect(barra.querySelector('[data-slot="estado-arca"]')?.getAttribute('data-nivel')).toBe('atencion')
    expect(barra.querySelector('[data-slot="estado-libraedge"]')).toBeNull()
    const contenido = screen.getByText('contenido')
    expect(contenido.compareDocumentPosition(barra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(1)
  })

  it('fija al pie de la columna del contenido, con su lugar reservado: no tapa el último botón', async () => {
    const user = userEvent.setup()
    // jsdom no mide: la línea de la barra mide 29 px (28 + el borde), como en escritorio.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const alto = this.parentElement?.getAttribute('data-slot') === 'barra-de-estado' ? 29 : 0
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: alto, width: 0, height: alto, toJSON: () => ({}) } as DOMRect
    })
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: ADMIN })
    const { container, unmount } = montarLayout(true)
    const barra = await waitFor(() => {
      const b = container.querySelector('[data-slot="barra-de-estado"]')
      expect(b).not.toBeNull()
      return b as HTMLElement
    })
    expect(barra.className).toMatch(/\bfixed\b/)
    expect(barra.className).toContain('md:left-[var(--izquierda-barra-de-estado,0px)]')
    // El layout le dice dónde empieza la columna (después de la barra lateral, abierta o en íconos).
    expect(container.querySelector('main')?.className).toContain('[--izquierda-barra-de-estado:var(--sidebar-width)]')
    // El espacio en el flujo mide lo mismo que la barra cerrada, y lo publica para los pies `sticky` y `scrollIntoView`.
    const espacio = container.querySelector('[data-slot="espacio-de-la-barra-de-estado"]') as HTMLElement
    await waitFor(() => expect(espacio.style.height).toBe('29px'))
    expect(screen.getByText('contenido').compareDocumentPosition(espacio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.documentElement.style.getPropertyValue('--alto-barra-de-estado')).toBe('29px')
    expect(document.documentElement.style.scrollPaddingBottom).toBe('29px')
    // Abrir el detalle no cambia la reserva: se despliega hacia arriba, encima del contenido.
    await user.click(screen.getByRole('button', { name: /Estado del sistema/ }))
    const detalle = screen.getByRole('region', { name: 'Detalle del estado del sistema' })
    expect(detalle.className).toContain('bottom-full')
    expect(espacio.style.height).toBe('29px')
    // Un clic afuera lo cierra.
    await user.click(screen.getByText('contenido'))
    expect(screen.queryByRole('region', { name: 'Detalle del estado del sistema' })).toBeNull()
    unmount()
    expect(document.documentElement.style.getPropertyValue('--alto-barra-de-estado')).toBe('')
    expect(document.documentElement.style.scrollPaddingBottom).toBe('')
  })

  it('en el celular, cada parte queda en su ícono y el texto sigue para el lector de pantalla', async () => {
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: CAJERO_EN_UN_NODO })
    montarLayout(true, 'Carlos Ficticio')
    const texto = await screen.findByText('LibraEdge: Sin conexión · 12 por subir · 3 por facturar')
    expect(texto.className).toContain('sr-only')
    expect(texto.className).toContain('sm:not-sr-only')
    expect(screen.getByText('Carlos Ficticio · Centro')).toBeTruthy()
    // Sin el texto a la vista, lo que pide atención lleva un punto de su color (sólo en el celular).
    const parte = texto.closest('[data-slot="estado-libraedge"]') as HTMLElement
    expect(parte.getAttribute('data-nivel')).toBe('atencion')
    expect(parte.querySelector('[data-slot="punto-de-estado"]')?.className).toContain('sm:hidden')
  })

  it('tocar la barra abre el detalle; Escape lo cierra y devuelve el foco', async () => {
    const user = userEvent.setup()
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: ADMIN })
    montarLayout(true)
    const boton = await screen.findByRole('button', { name: /Estado del sistema/ })
    expect(boton.getAttribute('aria-expanded')).toBe('false')
    await user.click(boton)
    expect(boton.getAttribute('aria-expanded')).toBe('true')
    const detalle = screen.getByRole('region', { name: 'Detalle del estado del sistema' })
    expect(boton.getAttribute('aria-controls')).toBe(detalle.id)
    expect(within(detalle).getByText('Motor: 1.187.0.')).toBeTruthy()
    expect(within(detalle).getByText(/vence el 09-11-2026/)).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Detalle del estado del sistema' })).toBeNull()
    expect(document.activeElement).toBe(boton)
  })

  it('un producto que no monta la ruta: nada, y no se vuelve a pedir', async () => {
    responder({})
    const { container, unmount } = montarLayout(true)
    await waitFor(() => expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(1))
    expect(container.querySelector('[data-slot="barra-de-estado"]')).toBeNull()
    unmount()
    montarLayout(true)
    await screen.findByText('contenido')
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(1)
  })

  it('la sucursal del producto gana a la del servidor', async () => {
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: CAJERO_EN_UN_NODO })
    montarLayout({ useSucursal: () => 'Sucursal Norte' }, 'Carlos Ficticio')
    expect(await screen.findByText('Carlos Ficticio · Sucursal Norte')).toBeTruthy()
  })

  it('con otra ruta', async () => {
    responder({ '/api/v2/estado': ADMIN })
    montarLayout({ ruta: '/api/v2/estado' })
    expect(await screen.findByText('Respaldo hace 3 h')).toBeTruthy()
  })

  it('en un nodo usa la conexión del cartel si alguien la consulta (más fresca)', async () => {
    responder({
      [RUTA_ESTADO_DEL_SISTEMA]: CAJERO_EN_UN_NODO,
      [RUTA_CONEXION_DEL_NODO]: { es_nodo: true, en_linea: true, node_id: 'nodo-demo-1', a_facturar: 0 },
    })
    const dejar = consultarConexionDelNodo()
    render(<BarraDeEstado nombre="Carlos Ficticio" />)
    expect(await screen.findByText('LibraEdge: En línea · 12 por subir')).toBeTruthy()
    dejar()
  })
})

describe('el refresco', () => {
  it('una consulta al montar, varias barras comparten un reloj, y vuelve a preguntar con el intervalo del servidor', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: CAJERO_EN_UN_NODO })
    render(<><BarraDeEstado /><BarraDeEstado /></>)
    await waitFor(() => expect(screen.getAllByText('Carlos Ficticio · Centro')).toHaveLength(2))
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(2)
  })

  it('sin sugerencia del servidor, cada cinco minutos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: { ...ADMIN, refrescar_en_segundos: undefined } })
    render(<BarraDeEstado />)
    await screen.findByText('Respaldo hace 3 h')
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_ESTADO_MS - 1_000) })
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(2)
  })

  it('al volver a la pestaña pregunta, pero no antes de 30 s desde la anterior', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: ADMIN })
    render(<BarraDeEstado />)
    await screen.findByText('Respaldo hace 3 h')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(MINIMO_ENTRE_CONSULTAS_MS + 1_000) })
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(2))
  })

  it('con la pestaña oculta no pregunta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: CAJERO_EN_UN_NODO })
    render(<BarraDeEstado />)
    await screen.findByText('Carlos Ficticio · Centro')
    ponerVisibilidad('hidden')
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(1)
    ponerVisibilidad('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(2))
  })

  it('un 500 deja lo último que se supo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let n = 0
    responder({ [RUTA_ESTADO_DEL_SISTEMA]: () => (++n === 1 ? ADMIN : { status: 500, detail: 'caído' }) })
    render(<BarraDeEstado />)
    await screen.findByText('Respaldo hace 3 h')
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_ESTADO_MS + 1_000) })
    expect(pedidosA(RUTA_ESTADO_DEL_SISTEMA)).toBe(2)
    expect(screen.getByText('Respaldo hace 3 h')).toBeTruthy()
  })
})

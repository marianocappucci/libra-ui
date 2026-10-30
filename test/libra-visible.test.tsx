// «Libra» a la vista (ADR-099, marca blanca): con marca propia, lo que dibujan las piezas de LibraEdge y el menú no dice «LibraEdge» ni
// lleva su ícono, y la franja del ítem activo es el color de la marca. Sigue a `marca.test.tsx` (que mide Login, Layout y PasswordReset): acá,
// lo que no sale de `productName`. Sin marca propia, todo es lo de siempre.
//
// 🔴 Lo que este archivo NO cubre, a propósito: los textos de «Sucursal sin internet» que nombran al producto cuando describen lo que instala
// el instalador (el acceso directo «VentaLibra», `libraedge-nodo-ventalibra.exe`): eso es del instalador, no de la pantalla (pendiente anotado
// en el ADR-099).
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BarraDeEstado } from '../src/BarraDeEstado'
import { CartelSinConexion } from '../src/CartelSinConexion'
import { SucursalSinInternet, type EstadoNodosOffline } from '../src/SucursalSinInternet'
import { RUTA_ESTADO_DEL_SISTEMA, _reiniciarEstadoDelSistema } from '../src/estado-del-sistema'
import { aplicarIdentidad } from '../src/identidad'
import {
  CLAVE_DE_CACHE_DE_LA_MARCA, NOMBRE_NEUTRO_DE_LIBRAEDGE, cargarMarca, nombreDeLibraEdge, reiniciarMarca,
} from '../src/marca'
import { RUTA_CONEXION_DEL_NODO, _reiniciarConexionDelNodo } from '../src/nodo-offline'
import { aplicarTema } from '../src/tema'

const MARCA = { propia: true, nombre: 'Gestión Sur', nombre_corto: 'Gestión Sur', color: '#2563eb', logo: '' }
const NODO_SIN_CONEXION = { es_nodo: true, en_linea: false, node_id: 'nodo-demo-1', a_facturar: 3 }
const ESTADO_CON_LIBRAEDGE = {
  usuario: { nombre: 'Ana Prueba', rol: 'admin', sucursal: null },
  version: { producto: 'v2026.10.20-101500', motor: null },
  libraedge: { rol: 'central', nodos: 2, sin_noticias: 1, nivel: 'atencion' },
  arca: null,
  respaldo: null,
  refrescar_en_segundos: 300,
}
const ESTADO_DE_NODOS: EstadoNodosOffline = {
  producto: 'ventalibra', contratado: true, instalador_url: '', central_url: 'https://demo.example', central_url_error: null,
  direccion: 'demo.example', vinculacion_minutos: 15, emisor_faltan: [], emisor_error: null, umbral_minutos: 15,
  sucursales: [], nodos: [],
}

function json(cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } })
}

/** Lo que ve una persona y lo que lee un lector de pantalla: el texto, `alt`, `title` y `aria-label`. */
function loVisible(contenedor: Element): string {
  const atributos = [...contenedor.querySelectorAll('[alt],[title],[aria-label]')]
    .flatMap((el) => [el.getAttribute('alt'), el.getAttribute('title'), el.getAttribute('aria-label')])
  return [contenedor.textContent, ...atributos].filter(Boolean).join(' | ')
}

async function conMarca(marca: object) {
  window.localStorage.setItem(CLAVE_DE_CACHE_DE_LA_MARCA, JSON.stringify(marca))
  const antes = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
  await cargarMarca()
  vi.stubGlobal('fetch', antes)
}

function responder() {
  vi.stubGlobal('fetch', vi.fn((entrada: RequestInfo | URL) => {
    const ruta = String(entrada).split('?')[0]
    if (ruta === RUTA_ESTADO_DEL_SISTEMA) return Promise.resolve(json(ESTADO_CON_LIBRAEDGE))
    if (ruta === RUTA_CONEXION_DEL_NODO) return Promise.resolve(json(NODO_SIN_CONEXION))
    return Promise.resolve(json(ESTADO_DE_NODOS))
  }))
}

beforeEach(() => {
  window.localStorage.clear()
  reiniciarMarca()
  _reiniciarEstadoDelSistema()
  _reiniciarConexionDelNodo()
  document.head.innerHTML = ''
  responder()
})

afterEach(() => {
  cleanup()
  reiniciarMarca()
  aplicarTema({})
  _reiniciarEstadoDelSistema()
  _reiniciarConexionDelNodo()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
})

describe('el nombre de LibraEdge', () => {
  it('sin marca propia es LibraEdge; con ella, lo que hace', () => {
    expect(nombreDeLibraEdge(false)).toBe('LibraEdge')
    expect(nombreDeLibraEdge(true)).toBe(NOMBRE_NEUTRO_DE_LIBRAEDGE)
    expect(NOMBRE_NEUTRO_DE_LIBRAEDGE).not.toMatch(/libra/i)
  })
})

describe('la barra de estado', () => {
  it('sin marca propia dice LibraEdge y lleva su ícono', async () => {
    const { container } = render(<BarraDeEstado />)
    await waitFor(() => expect(container.querySelector('[data-slot="estado-libraedge"]')).not.toBeNull())
    expect(loVisible(container)).toContain('LibraEdge')
    expect(container.querySelector('[data-slot="estado-libraedge"] [role="img"]')).not.toBeNull()
  })

  it('🔴 con marca propia no queda «Libra» a la vista, ni en la línea ni en el detalle', async () => {
    await conMarca(MARCA)
    const { container } = render(<BarraDeEstado />)
    await waitFor(() => expect(container.querySelector('[data-slot="estado-libraedge"]')).not.toBeNull())
    expect(container.querySelector('[data-slot="estado-libraedge"]')?.textContent).toContain(NOMBRE_NEUTRO_DE_LIBRAEDGE)
    expect(container.querySelector('[data-slot="estado-libraedge"] [role="img"]')).toBeNull()
    expect(loVisible(container)).not.toMatch(/libra/i)
    act(() => container.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click())
    await waitFor(() => expect(container.querySelector('[aria-label="Detalle del estado del sistema"]')).not.toBeNull())
    expect(loVisible(container)).not.toMatch(/libra/i)
  })
})

describe('el cartel «sin conexión»', () => {
  it('sin marca propia lleva el ícono de LibraEdge; con ella, sólo el texto', async () => {
    const sin = render(<CartelSinConexion />)
    await screen.findByRole('status')
    expect(sin.container.querySelector('[role="img"]')).not.toBeNull()
    cleanup()
    _reiniciarConexionDelNodo()
    await conMarca(MARCA)
    const con = render(<CartelSinConexion />)
    await screen.findByRole('status')
    expect(con.container.querySelector('[role="img"]')).toBeNull()
    expect(loVisible(con.container)).not.toMatch(/libra/i)
  })
})

describe('«Sucursal sin internet»', () => {
  const introduccion = (c: Element) => c.querySelector('p')?.parentElement as Element

  it('sin marca propia presenta a LibraEdge, con su ícono', async () => {
    const { container } = render(<SucursalSinInternet />)
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())
    expect(introduccion(container).textContent).toContain('LibraEdge')
    expect(introduccion(container).querySelector('[role="img"]')).not.toBeNull()
  })

  it('🔴 con marca propia la presentación nombra lo que hace y no lleva el ícono', async () => {
    await conMarca(MARCA)
    const { container } = render(<SucursalSinInternet />)
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())
    const intro = introduccion(container)
    expect(intro.textContent).toContain(`Con ${NOMBRE_NEUTRO_DE_LIBRAEDGE} la PC del local`)
    expect(intro.querySelector('[role="img"]')).toBeNull()
    expect(loVisible(intro)).not.toMatch(/libra/i)
  })
})

describe('la franja del ítem activo del menú', () => {
  const borde = () => document.documentElement.style.getPropertyValue('--libra-menu-activo-borde')

  it('con marca propia y color, es el de la marca (aclarado hasta leerse sobre el grafito), no el del producto', async () => {
    aplicarIdentidad('ventalibra')
    await conMarca({ ...MARCA, color: '#2563eb' })
    expect(borde()).toMatch(/^#[0-9a-f]{6}$/)
    expect(borde()).not.toBe('#2563eb') // el azul oscuro no se lee sobre el grafito: se aclara
    // El azul de la marca, no el naranja de VentaLibra (#fb923c): el canal azul domina.
    const n = parseInt(borde().slice(1), 16)
    expect(n & 0xff).toBeGreaterThan((n >> 16) & 0xff)
  })

  it('un menuActivoBorde explícito del tema le gana a la marca', async () => {
    await conMarca(MARCA)
    aplicarTema({ menuActivoBorde: '#b91c1c' })
    expect(borde()).toBe('#b91c1c')
    aplicarTema({})
    expect(borde()).not.toBe('#b91c1c')
    expect(borde()).not.toBe('')
  })

  it('sin marca (o sin color) no se toca: queda lo que puso la identidad del producto', async () => {
    expect(borde()).toBe('')
    await conMarca({ ...MARCA, color: '' })
    expect(borde()).toBe('')
  })

  it('al sacar la marca vuelve a como estaba', async () => {
    await conMarca(MARCA)
    expect(borde()).not.toBe('')
    reiniciarMarca()
    expect(borde()).toBe('')
  })
})

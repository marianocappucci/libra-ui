// El harness que comparten los tests de pantalla del kit (nació con P9-M4, y desde
// F6.2 lo usan también los de comprobantes): el `fetch`
// falso por tabla de rutas, el router de prueba y las lecturas de lo pedido.
import { render, screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'

export let fetchMock: ReturnType<typeof vi.fn>

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** `responder({ 'GET /api/x': valor })`: el valor puede ser un objeto (200), una
 *  función (se evalúa en cada pedido), `{ status, detail }` (error de la API) o
 *  `'!caida'` (sin red). Una clave sin método matchea cualquier método. */
export function responder(tabla: Record<string, unknown>) {
  fetchMock.mockImplementation((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const path = url.split('?')[0]
    const clave = `${init?.method ?? 'GET'} ${path}`
    let valor = clave in tabla ? tabla[clave] : (url in tabla ? tabla[url] : tabla[path])
    if (typeof valor === 'function') valor = (valor as () => unknown)()
    if (valor === '!caida') return Promise.reject(new TypeError('sin red'))
    if (valor && typeof valor === 'object' && 'status' in (valor as object) && 'detail' in (valor as object)) {
      const e = valor as { status: number; detail: string }
      return Promise.resolve(json({ detail: e.detail }, e.status))
    }
    if (valor === undefined) return Promise.resolve(json({ detail: `sin respuesta para ${clave}` }, 404))
    return Promise.resolve(json(valor))
  })
}

export function pedidas(): string[] {
  return fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${String(c[0])}`)
}

export function cuerpoDe(clave: string, desde = 0): Record<string, unknown> {
  const i = pedidas().findIndex((p, idx) => idx >= desde && p.startsWith(clave))
  if (i < 0) throw new Error(`no se pidió ${clave}: ${pedidas().join(' | ')}`)
  return JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body))
}

export function Ubicacion() {
  const l = useLocation()
  return <p data-testid="ubicacion">{l.pathname}{l.search}</p>
}

export function montar(ruta: string, elemento: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path={ruta.split('?')[0].replace(/\/\d+(?=\/|$)/, '/:id')} element={<>{elemento}<Ubicacion /></>} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
}

export function prepararFetch() {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
}

/** El `<select>` del stub que contiene una opción dada: las pantallas viejas
 *  ponen `<Label>` y `<Select>` uno al lado del otro, sin `htmlFor`. */
export function selectConOpcion(texto: string): HTMLSelectElement {
  const opcion = Array.from(document.querySelectorAll('option')).find((o) => o.textContent === texto)
  if (!opcion) throw new Error(`no hay una opción "${texto}"`)
  return opcion.closest('select')!
}

/** Elige una opción de un `SelectBuscable` (el real, no un stub): se abre con
 *  un click y la lista recién entonces existe en el DOM. */
export async function elegirEnBuscable(user: ReturnType<typeof userEvent.setup>, combobox: HTMLElement, texto: string | RegExp) {
  await user.click(combobox)
  await user.click(await screen.findByRole('option', { name: texto }))
}

/** Una ventana falsa para `window.open`: la usan las pantallas que abren un PDF. */
export function ventanaFalsa() {
  const ventana = { location: { href: '' }, close: vi.fn() }
  vi.stubGlobal('open', vi.fn(() => ventana))
  return ventana
}

/** El `<input>` que va junto a un `<Label>` sin `htmlFor` — mismo caso que
 *  `selectConOpcion`, pero para los campos de texto. */
export function campoJunto(texto: string): HTMLInputElement {
  const etiqueta = Array.from(document.querySelectorAll('label')).find((l) => l.textContent === texto)
  if (!etiqueta) throw new Error(`no hay una etiqueta "${texto}"`)
  const campo = etiqueta.parentElement?.querySelector('input')
  if (!campo) throw new Error(`la etiqueta "${texto}" no tiene un campo al lado`)
  return campo
}

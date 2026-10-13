import type { BrowserContext, Page, Response, Route } from '@playwright/test'

const ESCRIBEN = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Espera la respuesta de la API de una ruta. Se arma ANTES de la acción que la dispara y se espera después:
 *
 *     const venta = esperarApi(page, '/api/ventas', { metodo: 'POST' })
 *     await page.getByRole('button', { name: 'Cobrar' }).click()
 *     expect((await venta).status()).toBe(200)
 *
 * `ruta` es el pathname exacto (`/api/ventas`) o una RegExp sobre él. Es la forma de esperar «que terminó de guardar»
 * sin `waitForTimeout` ni `networkidle`: se espera el hecho, no un rato.
 */
export function esperarApi(
  page: Page,
  ruta: string | RegExp,
  opciones: { metodo?: string; estado?: number } = {},
): Promise<Response> {
  const metodo = opciones.metodo?.toUpperCase()
  return page.waitForResponse((r) => {
    const { pathname } = new URL(r.url())
    const coincide = typeof ruta === 'string' ? pathname === ruta : ruta.test(pathname)
    return coincide
      && (!metodo || r.request().method() === metodo)
      && (opciones.estado === undefined || r.status() === opciones.estado)
  })
}

/**
 * Red de seguridad para correr los specs contra dev o demo (que tienen datos que no son del test): aborta todo
 * POST/PUT/PATCH/DELETE que salga del navegador, salvo el login (y lo que se permita a propósito). Lo que se hace
 * por la fixture `api` no pasa por acá: es un pedido de Node, no del navegador.
 *
 * Devuelve la lista de lo bloqueado, para que un spec de sólo lectura pueda afirmar que no intentó escribir nada.
 */
export async function redDeSeguridad(
  donde: Page | BrowserContext,
  opciones: { permitir?: Array<string | RegExp> } = {},
): Promise<{ bloqueados: string[] }> {
  const permitir = [/\/auth\/login$/, ...(opciones.permitir ?? [])]
  const bloqueados: string[] = []
  await donde.route('**/*', (route: Route) => {
    const pedido = route.request()
    if (!ESCRIBEN.has(pedido.method())) return route.fallback()
    const { pathname } = new URL(pedido.url())
    const permitido = permitir.some((p) => (typeof p === 'string' ? pathname === p : p.test(pathname)))
    if (permitido) return route.fallback()
    bloqueados.push(`${pedido.method()} ${pathname}`)
    return route.abort('blockedbyclient')
  })
  return { bloqueados }
}

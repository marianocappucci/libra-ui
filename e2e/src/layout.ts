import { expect, type Page } from '@playwright/test'

/** Los anchos que importan: un celular chico (el que rompe las tablas y los diálogos) y un monitor de escritorio. */
export const ANCHOS_POR_DEFECTO = [390, 1280]

type Desbordado = { elemento: string; derecha: number }

/**
 * Afirma que la página no se desborda a lo ancho en cada uno de esos anchos: ni scroll horizontal del documento ni un
 * elemento visible que se pase del borde, aunque un ancestro lo recorte con `overflow: hidden` (un scroll interno
 * de una tabla `overflow-x-auto` está bien). Lo que
 * detecta es lo que sólo se ve en un navegador real: la grilla que no se encoge, el botón que queda afuera a 390 px.
 *
 * Deja el viewport en el último ancho; el test que siga debería fijar el suyo.
 */
export async function sinDesborde(page: Page, anchos: number[] = ANCHOS_POR_DEFECTO): Promise<void> {
  const alto = page.viewportSize()?.height ?? 800
  for (const ancho of anchos) {
    await page.setViewportSize({ width: ancho, height: alto })
    const medida = await page.evaluate(async () => {
      // Dos cuadros para que el layout (y los `ResizeObserver` de la app) asienten tras el cambio de ancho.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      const raiz = document.documentElement
      const ancho = raiz.clientWidth
      const salen: Array<{ elemento: string; derecha: number }> = []
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const caja = el.getBoundingClientRect()
        if (caja.width === 0 || caja.height === 0 || caja.right <= ancho + 1) continue
        // Si algún ancestro hace scroll horizontal propio, lo que se pasa queda dentro de ese scroll y no desborda la página.
        let ancestro = el.parentElement
        let contenido = false
        while (ancestro && ancestro !== document.body) {
          const { overflowX } = getComputedStyle(ancestro)
          // Sólo `auto` y `scroll` son un scroll propio. `hidden` y `clip` esconden lo que se pasa: es el desborde
          // tapado, que también es un bug (el botón queda cortado a 390 px sin que nadie lo pueda alcanzar).
          if (overflowX === 'auto' || overflowX === 'scroll') { contenido = true; break }
          ancestro = ancestro.parentElement
        }
        if (contenido) continue
        const estilo = getComputedStyle(el)
        if (estilo.visibility === 'hidden' || estilo.display === 'none' || estilo.position === 'fixed') continue
        const nombre = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '')
          + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')
        salen.push({ elemento: nombre, derecha: Math.round(caja.right) })
        if (salen.length >= 5) break
      }
      return { scroll: raiz.scrollWidth, ventana: ancho, salen }
    })
    const salen: Desbordado[] = medida.salen
    expect(
      medida.scroll,
      `a ${ancho} px el documento mide ${medida.scroll} px de ancho (ventana ${medida.ventana}); se pasan: ${
        salen.map((s) => `${s.elemento} (hasta ${s.derecha})`).join(', ') || 'ninguno puntual'}`,
    ).toBeLessThanOrEqual(medida.ventana)
    expect(salen, `a ${ancho} px estos elementos se pasan del borde`).toEqual([])
  }
}

import { expect, type Page } from '@playwright/test'

/** Dónde guarda el kit el modo claro / oscuro de cada navegador (`CLAVE_DE_MODO` de `libra-ui/modo`). Se repite acá porque `e2e/` se compila aparte, sin el resto de `src/`. */
export const CLAVE_DE_MODO = 'libra.modo'

export type ModoDePrueba = 'claro' | 'oscuro'

/**
 * Pone el modo de la suite en `localStorage` **antes** de que cargue cualquier página, así la app arranca ya en ese modo (es lo que hace quien lo eligió con el botón
 * sol/luna: `libra-ui/modo` lo lee al arrancar y pone la clase `dark` en `<html>`). Va antes del primer `page.goto`; vale para toda la vida de la `page`.
 */
export async function ponerModo(page: Page, modo: ModoDePrueba): Promise<void> {
  await page.addInitScript(([clave, valor]) => {
    try { window.localStorage.setItem(clave, valor) } catch { /* sin almacenamiento: el modo queda en el del sistema */ }
  }, [CLAVE_DE_MODO, modo] as const)
}

export type OpcionesDeContraste = {
  /** El modo que la página tiene que estar mostrando (defecto `oscuro`). Si no lo está, falla **antes** de medir: sin esta guarda un modo que no se aplicó dejaría pasar todo en verde. */
  modo?: ModoDePrueba
  /** Mínimo de contraste (WCAG AA) para texto normal. Defecto 4,5. */
  minimo?: number
  /** Mínimo para texto grande (24 px, o 18,66 px en negrita). Defecto 3. */
  minimoGrande?: number
  /** Selector CSS de lo que no se mide: un logo, un QR, la vista previa de un ticket sobre papel blanco… Lo que se exime tiene que estar escrito en el spec, con su razón. */
  ignorar?: string
}

const coma = (n: number) => String(n).replace('.', ',')

type Ilegible = { elemento: string; texto: string; contraste: number; minimo: number; color: string; fondo: string }

/**
 * Afirma que **todo texto visible de la pantalla se lee** (contraste WCAG contra su fondo efectivo) en el modo pedido. Es la pasada que se hizo a mano el 2026-10-02 en
 * el modo oscuro (el nombre del producto casi invisible, el verde de éxito a 4,28:1), hecha automática: lo que un `text-[#2d2d2d]` fijo o un token sin variante oscura
 * rompen sólo se ve en un navegador, con la pantalla real.
 *
 * Cómo mide: por cada elemento con texto propio y visible, el color del texto contra el fondo que resulta de apilar los `background-color` de sus ancestros (los
 * colores con alfa se componen; los `oklch()` y demás se convierten con un canvas). Un fondo con imagen o degradé no se puede medir con esto: ese texto se saltea.
 * Quedan afuera los controles deshabilitados (WCAG los exime), el texto sólo para lectores de pantalla y `ignorar`.
 *
 * Límites: no mide bordes, íconos ni gráficos, ni el texto de un `<input>` (su valor no es un nodo de texto), y no tiene en cuenta `opacity` (un texto atenuado
 * por opacidad se mide como si no lo estuviera).
 */
export async function sinTextoIlegible(page: Page, opciones: OpcionesDeContraste = {}): Promise<void> {
  const { modo = 'oscuro', minimo = 4.5, minimoGrande = 3, ignorar = '' } = opciones
  const aplicado = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(
    aplicado,
    `se pidió medir en modo ${modo} pero <html> ${aplicado ? 'tiene' : 'no tiene'} la clase "dark": llamar a ponerModo(page, '${modo}') antes del primer goto`,
  ).toBe(modo === 'oscuro')

  const ilegibles: Ilegible[] = await page.evaluate(async ({ minimo, minimoGrande, ignorar }) => {
    // Dos cuadros para que el layout y los efectos de la app asienten.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    const lienzo = document.createElement('canvas')
    lienzo.width = lienzo.height = 1
    const ctx = lienzo.getContext('2d', { willReadFrequently: true })!
    type Color = { r: number; g: number; b: number; a: number }
    const cache = new Map<string, Color>()
    // `getComputedStyle` devuelve `oklch(...)` tal cual para los colores que se escribieron así: el canvas los pasa a sRGB.
    const aRgba = (css: string): Color => {
      const guardado = cache.get(css)
      if (guardado) return guardado
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      const c = { r, g, b, a: a / 255 }
      cache.set(css, c)
      return c
    }
    const componer = (arriba: Color, abajo: Color): Color => {
      const a = arriba.a + abajo.a * (1 - arriba.a)
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
      const mezcla = (x: number, y: number) => (x * arriba.a + y * abajo.a * (1 - arriba.a)) / a
      return { r: mezcla(arriba.r, abajo.r), g: mezcla(arriba.g, abajo.g), b: mezcla(arriba.b, abajo.b), a }
    }
    const luz = (c: Color) => {
      const canal = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b)
    }
    const contraste = (a: Color, b: Color) => {
      const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m)
      return (x + 0.05) / (y + 0.05)
    }
    const texto = (c: Color) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`

    // El fondo de un elemento: los `background-color` de él y sus ancestros apilados de adentro hacia afuera hasta uno opaco. `null` si algún tramo tiene imagen o
    // degradé (no se puede medir), y el blanco o el negro del lienzo si ninguno es opaco.
    const fondoDe = (el: Element): Color | null => {
      const capas: Color[] = []
      for (let nodo: Element | null = el; nodo; nodo = nodo.parentElement) {
        const estilo = getComputedStyle(nodo)
        if (estilo.backgroundImage !== 'none') return null
        const c = aRgba(estilo.backgroundColor)
        if (c.a > 0) capas.push(c)
        if (c.a === 1) break
      }
      let fondo: Color = getComputedStyle(document.documentElement).colorScheme.includes('dark') ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 }
      for (let i = capas.length - 1; i >= 0; i--) fondo = componer(capas[i], fondo)
      return fondo
    }

    const descripcion = (el: Element) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '')
      + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')

    const salida: Array<{ elemento: string; texto: string; contraste: number; minimo: number; color: string; fondo: string }> = []
    const vistos = new Set<string>()
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName)) continue
      const propio = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
      if (!propio) continue
      if (ignorar && el.closest(ignorar)) continue
      if (el.closest('[disabled], [aria-disabled="true"], fieldset:disabled')) continue
      const caja = el.getBoundingClientRect()
      if (caja.width < 2 || caja.height < 2) continue // el texto sólo para lectores de pantalla (`sr-only`) mide 1×1
      const estilo = getComputedStyle(el)
      if (estilo.visibility !== 'visible' || estilo.display === 'none' || Number(estilo.opacity) === 0) continue
      const fondo = fondoDe(el)
      if (!fondo) continue
      const color = componer(aRgba(estilo.color), fondo)
      const grande = parseFloat(estilo.fontSize) >= 24 || (parseFloat(estilo.fontSize) >= 18.66 && Number(estilo.fontWeight) >= 700)
      const exigido = grande ? minimoGrande : minimo
      const valor = contraste(color, fondo)
      if (valor + 1e-9 >= exigido) continue
      // El mismo (elemento, color, fondo) se cuenta una sola vez: una tabla con cien filas iguales no llena el mensaje.
      const llave = `${descripcion(el)}|${texto(color)}|${texto(fondo)}`
      if (vistos.has(llave)) continue
      vistos.add(llave)
      salida.push({ elemento: descripcion(el), texto: propio.slice(0, 40), contraste: Math.round(valor * 100) / 100, minimo: exigido, color: texto(color), fondo: texto(fondo) })
    }
    return salida
  }, { minimo, minimoGrande, ignorar })

  expect(
    ilegibles.slice(0, 8),
    `en modo ${modo}, ${ilegibles.length} texto(s) por debajo del contraste mínimo: ${ilegibles.slice(0, 8)
      .map((i) => `${i.elemento} «${i.texto}» ${coma(i.contraste)}:1 < ${coma(i.minimo)}:1 (${i.color} sobre ${i.fondo})`).join('; ')}`,
  ).toEqual([])
}

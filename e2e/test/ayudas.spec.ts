import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
// Se prueba lo COMPILADO (`dist/`), que es lo que importa el consumidor, no el fuente.
import {
  aceptarTerminos, definirConfig, entrarComo, esperarApi, ponerModo, prepararSesiones, redDeSeguridad, rutaAuth, sinDesborde, sinTextoIlegible,
  test as testDeLaLibreria,
} from '../dist/index.js'
import { levantarServidor, type Servidor } from './servidor.js'

// Se parte del `test` de la propia librería (así se ejercita también su fixture `rol`) y se le suma el servidor de juguete,
// uno por worker. Por defecto sin sesión: los tests que la necesitan piden un rol.
const test = testDeLaLibreria.extend<{ repuesto: void }, { srv: Servidor }>({
  srv: [async ({}, use) => {
    const s = await levantarServidor()
    await use(s)
    await s.cerrar()
  }, { scope: 'worker' }],
  baseURL: async ({ srv }, use) => { await use(srv.url) },
  repuesto: [async ({ srv }, use) => { srv.estado.terminosPendientes = false; await use() }, { auto: true }],
  rol: [null, { option: true }],
})

test.describe('definirConfig', () => {
  const guardado = { nocturno: process.env.NOCTURNO, ci: process.env.CI }
  test.afterEach(() => {
    for (const [k, v] of [['NOCTURNO', guardado.nocturno], ['CI', guardado.ci]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  test('en el PR no reintenta, de noche reintenta una vez', () => {
    delete process.env.NOCTURNO
    expect(definirConfig().retries).toBe(0)
    process.env.NOCTURNO = '1'
    expect(definirConfig().retries).toBe(1)
  })

  test('base: un worker, Chromium, trace y screenshot al fallar, sin paralelismo', () => {
    const c = definirConfig()
    expect(c.workers).toBe(1)
    expect(c.fullyParallel).toBe(false)
    expect(c.use).toMatchObject({ browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' })
    expect(c.projects?.map((p) => p.name)).toEqual(['smoke', 'setup', 'e2e'])
    expect(c.projects?.find((p) => p.name === 'e2e')?.dependencies).toEqual(['setup'])
  })

  test('los overrides pisan lo suyo y `use` se mezcla en vez de reemplazarse', () => {
    const c = definirConfig({ timeout: 5_000, use: { baseURL: 'http://localhost:9999' } })
    expect(c.timeout).toBe(5_000)
    expect(c.use?.baseURL).toBe('http://localhost:9999')
    expect(c.use?.trace).toBe('retain-on-failure')
  })

  test('el reporte JSON queda siempre, para detectar flakes', () => {
    const reporteros = definirConfig().reporter as Array<[string, unknown?]>
    expect(reporteros.map((r) => r[0])).toContain('json')
  })
})

test.describe('login', () => {
  test('entrarComo atraviesa el captcha y llega al sidebar', async ({ page }) => {
    await entrarComo(page, { usuario: 'ana', clave: 'x' })
    await expect(page).toHaveURL(/\/pos$/)
  })

  test('entrarComo acepta los Términos pendientes como un cliente nuevo', async ({ page, srv }) => {
    srv.estado.terminosPendientes = true
    await entrarComo(page, { usuario: 'ana', clave: 'x' })
    expect(srv.estado.terminosPendientes).toBe(false)
    await expect(page.getByRole('heading', { name: /Términos y Condiciones/ })).toBeHidden()
  })

  test('aceptarTerminos no hace nada si ya estaban aceptados', async ({ page, srv }) => {
    await entrarComo(page, { usuario: 'ana', clave: 'x' })
    await aceptarTerminos(page)
    expect(srv.estado.terminosPendientes).toBe(false)
  })
})

test.describe('sinDesborde', () => {
  test('pasa con una página que cabe y con un scroll interno', async ({ page }) => {
    await page.goto('/flexible')
    await sinDesborde(page)
    await page.goto('/scroll-propio')
    await sinDesborde(page, [390, 1280])
  })

  test('falla, diciendo el ancho y el elemento, con una página que se pasa a 390 px', async ({ page }) => {
    await page.goto('/ancha')
    const falla = await sinDesborde(page, [1280, 390]).then(() => null, (e: Error) => e.message)
    expect(falla).toContain('390 px')
    expect(falla).toContain('ancha')
    // A 1280 cabe: el primer ancho no es el que falló.
    expect(falla).not.toContain('a 1280 px')
  })
})

test.describe('sinTextoIlegible (el modo oscuro)', () => {
  test('ponerModo arranca la app en oscuro desde el primer cuadro, y en claro si se pide', async ({ page }) => {
    await ponerModo(page, 'oscuro')
    await page.goto('/oscuro-bien')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await ponerModo(page, 'claro')
    await page.goto('/oscuro-bien')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('pasa con una pantalla legible: colores en oklch, una tarjeta translúcida y texto sólo para lectores de pantalla', async ({ page }) => {
    await ponerModo(page, 'oscuro')
    await page.goto('/oscuro-bien')
    await sinTextoIlegible(page)
  })

  test('falla diciendo qué elemento, qué texto y cuánto contraste: el gris fijo y el blanco casi transparente', async ({ page }) => {
    await ponerModo(page, 'oscuro')
    await page.goto('/oscuro-mal')
    const falla = await sinTextoIlegible(page).then(() => null, (e: Error) => e.message)
    expect(falla).toContain('p#wordmark «VentaLibra»')
    expect(falla).toContain('p#translucido «Casi transparente»')
    // El gris #2d2d2d sobre el fondo oscuro: 1,44:1 (la misma cifra que midió la pasada a mano del 2026-10-02).
    expect(falla).toContain('p#wordmark «VentaLibra» 1,44:1 < 4,5:1 (rgb(45, 45, 45) sobre rgb(10, 10, 10))')
    // Lo que no se mide: el texto grande a 3,4:1 (pasa con el umbral de 3), el deshabilitado y el que está sobre un degradé.
    expect(falla).not.toContain('Texto grande')
    expect(falla).not.toContain('Deshabilitado')
    expect(falla).not.toContain('degradé')
  })

  test('el texto grande exige 3:1 y se puede subir; `ignorar` saca un bloque con su razón', async ({ page }) => {
    await ponerModo(page, 'oscuro')
    await page.goto('/oscuro-mal')
    const sinGrande = await sinTextoIlegible(page, { minimoGrande: 4.5, ignorar: '#wordmark, #translucido, #logo' }).then(() => null, (e: Error) => e.message)
    expect(sinGrande).toContain('«Texto grande a 3,4:1»')
    expect(sinGrande).not.toContain('VentaLibra')
    await sinTextoIlegible(page, { ignorar: '#wordmark, #translucido, #logo' })
  })

  test('🔴 no pasa en vacío: si el modo pedido no está aplicado, falla antes de medir', async ({ page }) => {
    await page.goto('/oscuro-mal')   // sin ponerModo: la página está en claro
    const falla = await sinTextoIlegible(page).then(() => null, (e: Error) => e.message)
    expect(falla).toContain('no tiene la clase "dark"')
    expect(falla).toContain("ponerModo(page, 'oscuro')")
  })

  test('en modo claro la misma pantalla de juguete se mide contra su fondo claro', async ({ page }) => {
    await ponerModo(page, 'claro')
    await page.goto('/oscuro-bien')
    await sinTextoIlegible(page, { modo: 'claro' })
  })
})

test.describe('red', () => {
  test('esperarApi espera la respuesta por ruta y método', async ({ page }) => {
    await page.goto('/escribe')
    const lectura = esperarApi(page, '/api/cosas', { metodo: 'get', estado: 200 })
    await page.locator('#leer').click()
    expect((await lectura).status()).toBe(200)
    await expect(page.locator('#r')).toHaveText('200')
  })

  test('redDeSeguridad aborta las escrituras, deja pasar lecturas y el login, y avisa qué bloqueó', async ({ page }) => {
    const red = await redDeSeguridad(page)
    await page.goto('/escribe')
    await page.locator('#guardar').click()
    await expect(page.locator('#r')).toHaveText('bloqueado')
    await page.locator('#leer').click()
    await expect(page.locator('#r')).toHaveText('200')
    expect(red.bloqueados).toEqual(['POST /api/cosas'])

    // El login sí pasa: sin eso no se podría ni entrar a dev o demo.
    await entrarComo(page, { usuario: 'ana', clave: 'x' })
    expect(red.bloqueados).toEqual(['POST /api/cosas'])
  })

  test('redDeSeguridad deja pasar lo que se permite a propósito', async ({ page }) => {
    const red = await redDeSeguridad(page, { permitir: ['/api/cosas'] })
    await page.goto('/escribe')
    await page.locator('#guardar').click()
    await expect(page.locator('#r')).toHaveText('200')
    expect(red.bloqueados).toEqual([])
  })
})

test.describe('sesiones por rol', () => {
  const falso = (rol: string) => path.join(process.cwd(), '.auth', `${rol}.json`)

  // Lo mismo que hace el proyecto `setup` de `prepararSesiones`: entrar por la pantalla y guardar el storageState.
  test.beforeAll(async ({ srv, playwright }) => {
    expect(typeof prepararSesiones).toBe('function')
    const navegador = await playwright.chromium.launch()
    const contexto = await navegador.newContext({ baseURL: srv.url })
    await entrarComo(await contexto.newPage(), { usuario: 'ana', clave: 'x' })
    fs.mkdirSync(path.dirname(falso('prueba')), { recursive: true })
    await contexto.storageState({ path: falso('prueba') })
    await navegador.close()
  })

  test('rutaAuth cuelga de .auth/ en la carpeta donde corre Playwright', () => {
    expect(rutaAuth('cajero')).toBe(falso('cajero'))
  })

  test.describe('con el rol puesto', () => {
    test.use({ rol: 'prueba' })

    test('`api` y `page` arrancan con la sesión, sin pasar por el login (cookie Secure sobre http://localhost)', async ({ api, page }) => {
      const yo = (await (await api.get('/api/yo')).json()) as { cookie: string | null }
      expect(yo.cookie).toContain('sesion=de-prueba')
      await page.goto('/pos')
      await expect(page.locator('[data-sidebar="sidebar"]')).toBeVisible()
    })

    test('`apiDe` abre la sesión de otro rol', async ({ apiDe }) => {
      const otra = await apiDe('prueba')
      const yo = (await (await otra.get('/api/yo')).json()) as { cookie: string | null }
      expect(yo.cookie).toContain('sesion=de-prueba')
    })
  })

  test('sin rol, la fixture `api` va sin cookie', async ({ api }) => {
    const yo = (await (await api.get('/api/yo')).json()) as { cookie: string | null }
    expect(yo.cookie).toBeNull()
  })
})

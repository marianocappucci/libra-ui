import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { rutaAuth } from './roles.js'

type Opciones = {
  /** El rol con el que arranca el test (`.auth/<rol>.json`). `null` = sin sesión (el login, un visitante). */
  rol: string | null
}

type Fixtures = {
  /** `request` con la sesión del rol del test: para sembrar y verificar por la API sin pasar por la pantalla. */
  api: APIRequestContext
  /** La misma idea para OTRO rol: el cajero en la pantalla y el admin cambiando un precio por la API. */
  apiDe: (rol: string) => Promise<APIRequestContext>
}

/**
 * El `test` de los specs de dominio: igual al de Playwright, pero con la sesión del rol ya puesta.
 *
 *     test.use({ rol: 'cajero' })
 *     test('...', async ({ page, api, apiDe }) => { ... })
 *
 * Por defecto el rol es `admin`. Si el rol no tiene sesión (`.auth/<rol>.json` no existe) el test falla con un mensaje
 * que lo dice; no cae a una pantalla de login vacía.
 */
export const test = base.extend<Opciones & Fixtures>({
  rol: ['admin', { option: true }],

  storageState: async ({ rol }, use) => {
    await use(rol ? rutaAuth(rol) : undefined)
  },

  api: async ({ playwright, baseURL, rol }, use) => {
    const contexto = await playwright.request.newContext({
      baseURL,
      storageState: rol ? rutaAuth(rol) : undefined,
    })
    await use(contexto)
    await contexto.dispose()
  },

  apiDe: async ({ playwright, baseURL }, use) => {
    const abiertos: APIRequestContext[] = []
    await use(async (rol) => {
      const contexto = await playwright.request.newContext({ baseURL, storageState: rutaAuth(rol) })
      abiertos.push(contexto)
      return contexto
    })
    await Promise.all(abiertos.map((c) => c.dispose()))
  },
})

export { expect }

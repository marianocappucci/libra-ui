import { test as base, expect } from '@playwright/test';
import { rutaAuth } from './roles.js';
/**
 * El `test` de los specs de dominio: igual al de Playwright, pero con la sesión del rol ya puesta.
 *
 *     test.use({ rol: 'cajero' })
 *     test('...', async ({ page, api, apiDe }) => { ... })
 *
 * Por defecto el rol es `admin`. Si el rol no tiene sesión (`.auth/<rol>.json` no existe) el test falla con un mensaje
 * que lo dice; no cae a una pantalla de login vacía.
 */
export const test = base.extend({
    rol: ['admin', { option: true }],
    storageState: async ({ rol }, use) => {
        await use(rol ? rutaAuth(rol) : undefined);
    },
    api: async ({ playwright, baseURL, rol }, use) => {
        const contexto = await playwright.request.newContext({
            baseURL,
            storageState: rol ? rutaAuth(rol) : undefined,
        });
        await use(contexto);
        await contexto.dispose();
    },
    apiDe: async ({ playwright, baseURL }, use) => {
        const abiertos = [];
        await use(async (rol) => {
            const contexto = await playwright.request.newContext({ baseURL, storageState: rutaAuth(rol) });
            abiertos.push(contexto);
            return contexto;
        });
        await Promise.all(abiertos.map((c) => c.dispose()));
    },
});
export { expect };

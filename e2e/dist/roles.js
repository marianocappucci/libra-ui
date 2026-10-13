import path from 'node:path';
import { test as base } from '@playwright/test';
import { entrarComo } from './sesion.js';
/** Dónde queda la sesión de un rol (`storageState`). Relativo a donde corre `playwright test` (la carpeta del frontend). */
export function rutaAuth(rol) {
    return path.join(process.cwd(), '.auth', `${rol}.json`);
}
/**
 * El proyecto `setup`: un test por rol que entra por la pantalla de login y deja `.auth/<rol>.json`. Va en un archivo
 * `*.setup.ts` del consumidor (`e2e/auth.setup.ts`); los specs `*.e2e.ts` dependen de él y arrancan ya con sesión,
 * sin pasar por el login (que lleva el captcha, de ~1 s, y el límite de intentos por IP).
 *
 * Los usuarios de cada rol los crea el producto antes de correr (`usuarios-por-rol` de la Action `e2e-ci`); acá sólo
 * se entra con ellos. Usa el `test` pelado de Playwright y no el de `libra-ui/e2e`: este último ya espera la sesión.
 */
export function prepararSesiones(roles) {
    for (const [rol, credenciales] of Object.entries(roles)) {
        base(`sesión de ${rol}`, async ({ page }) => {
            await entrarComo(page, credenciales);
            await page.context().storageState({ path: rutaAuth(rol) });
        });
    }
}

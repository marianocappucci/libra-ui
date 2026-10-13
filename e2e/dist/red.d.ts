import type { BrowserContext, Page, Response } from '@playwright/test';
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
export declare function esperarApi(page: Page, ruta: string | RegExp, opciones?: {
    metodo?: string;
    estado?: number;
}): Promise<Response>;
/**
 * Red de seguridad para correr los specs contra dev o demo (que tienen datos que no son del test): aborta todo
 * POST/PUT/PATCH/DELETE que salga del navegador, salvo el login (y lo que se permita a propósito). Lo que se hace
 * por la fixture `api` no pasa por acá: es un pedido de Node, no del navegador.
 *
 * Devuelve la lista de lo bloqueado, para que un spec de sólo lectura pueda afirmar que no intentó escribir nada.
 */
export declare function redDeSeguridad(donde: Page | BrowserContext, opciones?: {
    permitir?: Array<string | RegExp>;
}): Promise<{
    bloqueados: string[];
}>;

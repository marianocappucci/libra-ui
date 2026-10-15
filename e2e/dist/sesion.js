import { expect } from '@playwright/test';
import { tildarCaptcha } from './captcha.js';
/** El sidebar de libra-ui: es lo que reconoce «ya estoy adentro», en cualquier producto. */
export const SIDEBAR = '[data-sidebar="sidebar"]';
/**
 * Si la instancia tiene los Términos y Condiciones pendientes, los acepta como un cliente nuevo (tilda y «Aceptar y
 * continuar»). Si ya están aceptados, no hace nada. Además descarta con «Más tarde» el aviso de la próxima versión (libra-ui
 * 0.153.0): es una tarjeta fija que, abierta, puede quedar encima de un botón de la pantalla y hacer fallar un clic.
 *
 * Se le pregunta a la API (`GET /terminos`, el estado que lee el propio gate) y no a la pantalla: el gate de libra-ui
 * renderiza la app MIENTRAS consulta, así que «el sidebar ya está» no prueba que no haya gate, y esperar «uno u otro»
 * sería una carrera. Hay que estar con sesión iniciada.
 */
export async function aceptarTerminos(page, opciones = {}) {
    const respuesta = await page.request.get(opciones.ruta ?? '/terminos');
    expect(respuesta.ok(), `GET ${opciones.ruta ?? '/terminos'} -> ${respuesta.status()}`).toBe(true);
    const estado = (await respuesta.json());
    if (estado.pendiente) {
        await expect(page.getByRole('heading', { name: /Términos y Condiciones/ })).toBeVisible();
        await page.getByRole('checkbox', { name: /Leí y acepto/ }).check();
        await page.getByRole('button', { name: 'Aceptar y continuar' }).click();
        // Al aceptar el gate recarga la página entera: el heading desaparece cuando la app vuelve a montar.
        await expect(page.getByRole('heading', { name: /Términos y Condiciones/ })).toBeHidden();
    }
    if (estado.puede_aceptar && estado.proxima && !estado.proxima.aceptada)
        await descartarAvisoDeProximaVersion(page);
}
/**
 * «Más tarde» en el aviso de la próxima versión de los Términos. No acepta nada: la instancia sigue sin la aceptación
 * adelantada. Si el aviso no está (ya se lo había descartado en esta pestaña, o el producto aún no tiene libra-ui 0.153.0), no
 * hace nada.
 */
export async function descartarAvisoDeProximaVersion(page) {
    const aviso = page.getByRole('region', { name: /Nueva versión de los Términos/ });
    try {
        await aviso.getByRole('button', { name: 'Más tarde' }).click({ timeout: 3000 });
    }
    catch {
        return; // no estaba
    }
    await expect(aviso).toBeHidden();
}
/**
 * Entra por `/login` como una persona: usuario, contraseña, captcha y «Ingresar». Atraviesa el gate de Términos si lo
 * hay y espera la primera pantalla (el sidebar). Los campos se ubican por los `id` que pone `createLogin`
 * (`#username`, `#password`): `getByLabel('Contraseña')` matchea también al botón «Mostrar contraseña».
 */
export async function entrarComo(page, { usuario, clave }) {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await page.locator('#username').fill(usuario);
    await page.locator('#password').fill(clave);
    await tildarCaptcha(page);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await aceptarTerminos(page);
    await expect(page.locator(SIDEBAR).first()).toBeVisible();
}

import { expect } from '@playwright/test';
/**
 * Tilda el captcha «No soy un robot» (ALTCHA, libraauth `captcha=True`) del login.
 *
 * «Ingresar» queda deshabilitado hasta que el widget resuelve el desafío, que es una prueba de trabajo de alrededor de
 * un segundo en el navegador. El tope de 30 s es para un runner de CI lento, no lo esperado.
 *
 * 🔴 Se clickea el LABEL y no el checkbox. Sobre el `<input>` de ALTCHA va el `<svg>` del tilde (absoluto, centrado, sin
 * `pointer-events: none`), y un click al centro del input lo recibe el svg: Playwright reintenta con
 * «<svg> intercepts pointer events» hasta el timeout. El label (`for=` el input) es lo que clickea una persona y tilda
 * sin `force`.
 */
export async function tildarCaptcha(page) {
    await page.locator('altcha-widget label', { hasText: 'No soy un robot' }).click();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeEnabled({ timeout: 30_000 });
}

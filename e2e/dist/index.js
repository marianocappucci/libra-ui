// `libra-ui/e2e`: ayudas para los tests de navegador (Playwright) de los productos de la familia Libra.
// Se publica compilado (`e2e/dist/`): ver `e2e/README.md`.
export { tildarCaptcha } from './captcha.js';
export { aceptarTerminos, entrarComo, SIDEBAR } from './sesion.js';
export { prepararSesiones, rutaAuth } from './roles.js';
export { test, expect } from './fixtures.js';
export { esperarApi, redDeSeguridad } from './red.js';
export { sinDesborde, ANCHOS_POR_DEFECTO } from './layout.js';
export { definirConfig } from './config.js';

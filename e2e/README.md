# libra-ui/e2e

Ayudas para los **tests de navegador de dominio** (Playwright) de los productos de la familia Libra. Lo que hace cada
producto en su `frontend/e2e/` lo resuelve acá una sola vez: entrar por el login (captcha ALTCHA incluido), aceptar los
Términos, tener una sesión por rol, sembrar por la API, esperar sin `waitForTimeout` y medir desbordes.

## Se publica compilado

El resto de `libra-ui` son fuentes `.tsx` que compila el Vite de cada consumidor. Esto no puede serlo: **Playwright carga
su config y sus specs con su propio transpilador, que no transforma lo que vive en `node_modules`**, y un `.ts` crudo
ahí rompe con `Unknown file extension ".ts"`. Por eso `e2e/src/` se compila a `e2e/dist/` (JS ESM + `.d.ts`) y **la
salida se versiona**: el consumidor instala el tag desde git y no corre ningún build.

- Después de tocar `e2e/src/`: `npm run build:e2e` y commitear `e2e/dist/`. El workflow `e2e-ayudas.yml` falla si no coinciden.
- Tests de las propias ayudas (contra un servidor de juguete, sin producto): `npm run test:e2e`.
- `@playwright/test` es **peer dependency opcional** (`^1.63.0`): lo instala el producto, que es quien corre los tests.
  Debe haber una sola copia, la del consumidor.

## API (`import … from 'libra-ui/e2e'`)

| Nombre | Qué hace |
|---|---|
| `definirConfig(overrides?)` | La config base: Chromium, 1 worker, retries 0 (1 si `NOCTURNO`), trace y screenshot al fallar, reporte JSON (`test-results/resultado.json`), `baseURL` de `E2E_BASE_URL`/`SMOKE_BASE_URL`/`http://localhost:8000`. Proyectos `smoke`, `setup`, `e2e`. `use` se mezcla; lo demás se pisa. |
| `tildarCaptcha(page)` | Tilda «No soy un robot» (por el label, no por el checkbox) y espera «Ingresar» habilitado. |
| `aceptarTerminos(page)` | Si `GET /terminos` dice `pendiente`, atraviesa el gate como un cliente nuevo; si no, nada. Además descarta con «Más tarde» el aviso de la próxima versión (0.153.0) si está. |
| `descartarAvisoDeProximaVersion(page)` | «Más tarde» en ese aviso, sin aceptar nada; si no está, no hace nada. |
| `entrarComo(page, {usuario, clave})` | `/login` completo + Términos + espera el sidebar. |
| `prepararSesiones({rol: {usuario, clave}})` | Para un `e2e/auth.setup.ts`: un test por rol que entra y deja `.auth/<rol>.json`. |
| `test`, `expect` | El `test` de Playwright con la opción `rol` (`test.use({ rol: 'cajero' })`, defecto `admin`, `null` = sin sesión) que pone el `storageState`, y las fixtures `api` (request con la sesión del rol) y `apiDe(rol)` (la de otro rol). |
| `esperarApi(page, ruta, {metodo?, estado?})` | Promesa de la respuesta de esa ruta; se arma antes de la acción y se espera después. |
| `redDeSeguridad(page, {permitir?})` | Aborta POST/PUT/PATCH/DELETE del navegador salvo el login. Para correr contra dev/demo. Devuelve `{bloqueados}`. |
| `sinDesborde(page, anchos = [390, 1280])` | Falla, diciendo ancho y elemento, si el documento tiene scroll horizontal o algún elemento visible se pasa del borde. |
| `rutaAuth(rol)`, `SIDEBAR`, `ANCHOS_POR_DEFECTO` | Auxiliares. |

## Uso en un producto

```ts
// frontend/playwright.config.ts
import { definirConfig } from 'libra-ui/e2e'
export default definirConfig()

// frontend/e2e/auth.setup.ts
import { prepararSesiones } from 'libra-ui/e2e'
prepararSesiones({ admin: { usuario: 'admin', clave: process.env.E2E_ADMIN_CLAVE! } })

// frontend/e2e/algo.e2e.ts
import { test, expect } from 'libra-ui/e2e'
test.use({ rol: 'cajero' })
test('...', async ({ page, api }) => { /* … */ })
```

Los archivos son `*.smoke.ts`, `*.setup.ts` y `*.e2e.ts` para que vitest, que colecta `src/**`, no los levante.
Agregar `.auth/`, `test-results/` y `playwright-report/` al `.gitignore` del frontend. La Action que los corre en el CI
es `libra-web-kit/.github/actions/e2e-ci`.

## Reglas

- **Sin `waitForTimeout` ni `networkidle`**: se espera el hecho (`esperarApi`, un `expect` sobre la pantalla).
- **`localhost` y no `127.0.0.1`**: la cookie de sesión de libraauth es `Secure`.
- Cada spec siembra lo suyo con nombres únicos (no depende del orden ni de lo que dejó otro).

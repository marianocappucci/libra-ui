import { type PlaywrightTestConfig } from '@playwright/test';
/**
 * La config base de los tests de navegador de la familia. Cada producto la pide con `definirConfig({...})` y pisa sólo
 * lo suyo.
 *
 * - **Sólo Chromium**, un worker y sin paralelismo: los specs comparten una instancia con estado (la caja, los turnos).
 * - **Sin reintentos en el PR; uno de noche** (`NOCTURNO=1`). Un test que recién pasa al reintento es un flake:
 *   el reporte JSON (`test-results/resultado.json`) lo marca y la Action lo avisa, para que no quede tapado. La
 *   decisión de volverlos requeridos exige dos semanas SIN ellos.
 * - **Trace y screenshot al fallar.**
 * - `localhost` y no `127.0.0.1`: la cookie de sesión de libraauth es `Secure`, y Chromium sólo trata a `localhost`
 *   como contexto seguro sobre http.
 *
 * Tres proyectos, que se eligen con `--project`:
 * - `smoke`: `e2e/*.smoke.ts`, sin sesión previa (el login y la primera pantalla).
 * - `setup`: `e2e/*.setup.ts`, deja `.auth/<rol>.json` (`prepararSesiones`).
 * - `e2e`: `e2e/*.e2e.ts`, depende de `setup`, así que `--project=e2e` corre los dos.
 */
export declare function definirConfig(overrides?: PlaywrightTestConfig): PlaywrightTestConfig;

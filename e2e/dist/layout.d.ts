import { type Page } from '@playwright/test';
/** Los anchos que importan: un celular chico (el que rompe las tablas y los diálogos) y un monitor de escritorio. */
export declare const ANCHOS_POR_DEFECTO: number[];
/**
 * Afirma que la página no se desborda a lo ancho en cada uno de esos anchos: ni scroll horizontal del documento ni un
 * elemento visible que se pase del borde, aunque un ancestro lo recorte con `overflow: hidden` (un scroll interno
 * de una tabla `overflow-x-auto` está bien). Lo que
 * detecta es lo que sólo se ve en un navegador real: la grilla que no se encoge, el botón que queda afuera a 390 px.
 *
 * Deja el viewport en el último ancho; el test que siga debería fijar el suyo.
 */
export declare function sinDesborde(page: Page, anchos?: number[]): Promise<void>;

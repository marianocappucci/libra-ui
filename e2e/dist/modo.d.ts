import { type Page } from '@playwright/test';
/** Dónde guarda el kit el modo claro / oscuro de cada navegador (`CLAVE_DE_MODO` de `libra-ui/modo`). Se repite acá porque `e2e/` se compila aparte, sin el resto de `src/`. */
export declare const CLAVE_DE_MODO = "libra.modo";
export type ModoDePrueba = 'claro' | 'oscuro';
/**
 * Pone el modo de la suite en `localStorage` **antes** de que cargue cualquier página, así la app arranca ya en ese modo (es lo que hace quien lo eligió con el botón
 * sol/luna: `libra-ui/modo` lo lee al arrancar y pone la clase `dark` en `<html>`). Va antes del primer `page.goto`; vale para toda la vida de la `page`.
 */
export declare function ponerModo(page: Page, modo: ModoDePrueba): Promise<void>;
export type OpcionesDeContraste = {
    /** El modo que la página tiene que estar mostrando (defecto `oscuro`). Si no lo está, falla **antes** de medir: sin esta guarda un modo que no se aplicó dejaría pasar todo en verde. */
    modo?: ModoDePrueba;
    /** Mínimo de contraste (WCAG AA) para texto normal. Defecto 4,5. */
    minimo?: number;
    /** Mínimo para texto grande (24 px, o 18,66 px en negrita). Defecto 3. */
    minimoGrande?: number;
    /** Selector CSS de lo que no se mide: un logo, un QR, la vista previa de un ticket sobre papel blanco… Lo que se exime tiene que estar escrito en el spec, con su razón. */
    ignorar?: string;
};
/**
 * Afirma que **todo texto visible de la pantalla se lee** (contraste WCAG contra su fondo efectivo) en el modo pedido. Es la pasada que se hizo a mano el 2026-10-02 en
 * el modo oscuro (el nombre del producto casi invisible, el verde de éxito a 4,28:1), hecha automática: lo que un `text-[#2d2d2d]` fijo o un token sin variante oscura
 * rompen sólo se ve en un navegador, con la pantalla real.
 *
 * Cómo mide: por cada elemento con texto propio y visible, el color del texto contra el fondo que resulta de apilar los `background-color` de sus ancestros (los
 * colores con alfa se componen; los `oklch()` y demás se convierten con un canvas). Un fondo con imagen o degradé no se puede medir con esto: ese texto se saltea.
 * Quedan afuera los controles deshabilitados (WCAG los exime), el texto sólo para lectores de pantalla y `ignorar`.
 *
 * Límites: no mide bordes, íconos ni gráficos, ni el texto de un `<input>` (su valor no es un nodo de texto), y no tiene en cuenta `opacity` (un texto atenuado
 * por opacidad se mide como si no lo estuviera).
 */
export declare function sinTextoIlegible(page: Page, opciones?: OpcionesDeContraste): Promise<void>;

import { type Page } from '@playwright/test';
export type Credenciales = {
    usuario: string;
    clave: string;
};
/** El sidebar de libra-ui: es lo que reconoce «ya estoy adentro», en cualquier producto. */
export declare const SIDEBAR = "[data-sidebar=\"sidebar\"]";
/**
 * Si la instancia tiene los Términos y Condiciones pendientes, los acepta como un cliente nuevo (tilda y «Aceptar y
 * continuar»). Si ya están aceptados, no hace nada.
 *
 * Se le pregunta a la API (`GET /terminos`, el estado que lee el propio gate) y no a la pantalla: el gate de libra-ui
 * renderiza la app MIENTRAS consulta, así que «el sidebar ya está» no prueba que no haya gate, y esperar «uno u otro»
 * sería una carrera. Hay que estar con sesión iniciada.
 */
export declare function aceptarTerminos(page: Page, opciones?: {
    ruta?: string;
}): Promise<void>;
/**
 * Entra por `/login` como una persona: usuario, contraseña, captcha y «Ingresar». Atraviesa el gate de Términos si lo
 * hay y espera la primera pantalla (el sidebar). Los campos se ubican por los `id` que pone `createLogin`
 * (`#username`, `#password`): `getByLabel('Contraseña')` matchea también al botón «Mostrar contraseña».
 */
export declare function entrarComo(page: Page, { usuario, clave }: Credenciales): Promise<void>;

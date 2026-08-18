// El branding visible de un producto: el logo del encabezado y cómo se
// escribe su nombre. Vive en su propio módulo, y no en Layout.tsx junto a los
// tipos de navegación, porque **Login.tsx también lo necesita** y no puede
// importar de Layout.tsx sin arrastrar todo el árbol de la sidebar al bundle
// de la pantalla de login, que es justo la que carga sin sesión.
//
// Los dos son opcionales en las dos factories: sin `logo` se dibuja el box con
// la inicial de siempre, y sin `wordmarkClassName` el nombre queda con las
// clases de siempre. Es la misma regla que rige desde v0.3.0 — todo campo
// nuevo con default = render anterior — porque este paquete lo consumen seis
// productos y sólo uno pide el cambio.

/**
 * Imagen que reemplaza al box de la inicial en el encabezado.
 *
 * El tamaño va por `className` y no por un número: Tailwind resuelve las
 * clases leyendo el fuente, así que una clase armada en runtime a partir de
 * un `size: 72` nunca se generaría. Además, sólo el producto sabe qué tiene
 * que pasar cuando la sidebar se colapsa a la barra de iconos — ahí el ancho
 * útil son 32 px y un logo más grande se desborda.
 */
export type ProductLogo = {
  src: string
  /** Default: el `productName`. */
  alt?: string
  /** Default: el mismo tamaño que tenía el box de la inicial (40 px en el login, 32 px en la sidebar). */
  className?: string
}

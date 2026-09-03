# Arquitectura — libra-ui

## Propósito y límites

libra-ui es la **librería de componentes de frontend** compartida por las SPAs
de la familia Libra (React 19 + TypeScript + Vite + Tailwind + shadcn/ui). Reúne
tres cosas que los productos duplicaban: las **primitivas** de UI (shadcn), las
**pantallas y helpers transversales** (login, layout, usuarios, logs,
configuración, facturación, MercadoPago, tablas de datos, formato de fechas) y el
**branding**. No contiene lógica de negocio de ningún producto: una pantalla
transversal (p. ej. `Usuarios`) sirve porque la gestión de usuarios es igual en
todos; el catálogo o la agenda propios de cada vertical no viven acá.

Es el único motor de la familia en TypeScript, no en Python.

## Distribución: código fuente, sin build

libra-ui **no se compila ni se publica como bundle.** No tiene `main`/`module`,
no tiene paso de `build` (sus scripts son `lint`, `test`, `typecheck`), y se
distribuye como **fuente**, pineada al tag por cada producto (`github:…#v0.59.0`).
Es el consumidor —su Vite y su Tailwind— quien compila los `.tsx` del motor junto
con los suyos. Dos consecuencias de diseño:

- **Exports por subpath, sin barrel.** El `package.json` expone cada pieza como
  su propio punto de entrada (`libra-ui/ui/button`, `libra-ui/Usuarios`,
  `libra-ui/data-table`, `libra-ui/utils`…). No hay un `index` que reexporte
  todo: el consumidor importa exactamente la pieza que usa, y la reexporta local
  cuando quiere ofrecerla bajo su propio alias (`export * from
  "libra-ui/ui/button"`).
- **Tailwind escanea la fuente del motor.** El consumidor declara
  `@source "../node_modules/libra-ui"` para que Tailwind v4 genere las clases que
  usan los componentes del motor, ya que no vienen pre-compiladas.
- **El alias `@` resuelve al `src` del consumidor.** Una primitiva de libra-ui que
  importa `@/lib/utils` resuelve contra el `src` del producto que la usa, no
  contra el del motor — así un producto puede **sobrescribir** una pieza sin
  forkear el motor.

Por eso las dependencias del stack son `peerDependencies`, no `dependencies`
(las trae el consumidor, una sola copia): `react`, `react-dom`,
`react-router-dom`, `@tanstack/react-table`, `radix-ui`,
`class-variance-authority`, `react-hook-form`, `lucide-react`, `tailwind-merge`,
`clsx`.

## Estructura (`src/`)

Tres capas, de más genérico a más específico:

- **`src/ui/` — las 17 primitivas shadcn** (`button`, `input`, `label`, `select`,
  `card`, `table`, `form`, `sheet`, `sidebar`, `tooltip`, `dropdown-menu`,
  `alert-dialog`, `avatar`, `badge`, `separator`, `skeleton`, `switch`). Se
  centralizaron acá en `v0.59.0` (E4 de la auditoría): antes cada producto tenía
  su propia copia generada por el CLI de shadcn. Son la base sobre la que se
  construyen las pantallas. `vitest` las excluye de su corrida
  (`exclude: ['src/ui/**']`): son componentes de terceros, se prueban aguas
  abajo.
- **`src/` (raíz) — pantallas y helpers transversales** (29 archivos):
  - Pantallas completas: `Login`, `Layout`, `Usuarios`, `Logs`, `Configuracion`,
    `ConfiguracionSmtp`, `CambiarPassword`, `PasswordReset`, `Terminos`,
    `Facturas`/`FacturaDetalle`, `MpBandeja`.
  - Helpers y piezas compartidas: `AuthContext`, `api-client`, `data-table`
    (sobre TanStack Table), `SelectBuscable`, `PasswordInput`, `acciones` /
    `iconos-accion`, `badge-estado`, `titulo-pantalla` /
    `auditoria-de-titulos`, `medios-pago`, `mp`, `facturas`, `fechas` (formato
    `dd-mm-aaaa` de familia), `branding`, `use-mobile`, `utils` (el `cn` de
    tailwind-merge).
- **`src/agenda/` (10)** y **`src/configuracion/` (9) — bundles de feature**:
  agrupan las pantallas y piezas de agenda y de configuración que más de un
  producto comparte.

## Diseño: componer, no imponer

libra-ui es un **menú de piezas**, no un framework de aplicación. Un producto
monta el `Layout` y el `Login` del motor, reusa `Usuarios` y `Logs` tal cual, y
arma sus pantallas propias con las primitivas de `src/ui/`. Como se consume por
subpath y el alias `@` resuelve al consumidor, adoptar una pieza no arrastra el
resto ni cierra la puerta a sobrescribirla. Es el mismo principio de mínima
huella de los motores de backend, trasladado al frontend.

## Referencias

- `README.md` — uso y convenciones de consumo.
- Wiki: entidad `libra-ui`, `concepts/estandares-desarrollo` (stack de frontend),
  y la auditoría `auditoria-estructural-familia-libra-2026-09` (E4/E5).

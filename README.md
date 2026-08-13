# libra-ui

Paquete de frontend compartido para los verticales de la familia Libra sin
backoffice server-rendered propio: [Gestiolibra](https://github.com/marianocappucci/gestiolibra),
[MedLibra](https://github.com/marianocappucci/medlibra) y
[VentaLibra](https://github.com/marianocappucci/ventalibra).

Extraído el 2026-07-26 tras confirmar en una auditoría de duplicación que
`Usuarios.tsx`, `AuthContext.tsx`, `data-table.tsx`, el cliente HTTP base
(`api.ts`), `use-mobile.ts` y `lib/utils.ts` eran byte-idénticos entre los
tres repos, y que `Layout.tsx`/`Login.tsx` diferían solo en branding/nav
items. Ver `wiki/analyses/auditoria-duplicacion-familia-libra.md` en el
repo de la wiki para el detalle completo del audit y el plan.

## Cómo se distribuye

Igual que libracore/libragenda/libracommerce/libraedge: repo privado,
instalado por cada consumidor como dependencia git pineada a un tag exacto
(nunca un rango), nunca publicado a un registro npm.

En `package.json` de cada consumidor:

```json
"libra-ui": "git+https://github.com/marianocappucci/libra-ui.git#v0.1.0"
```

`git+https://` (no `git+ssh://`) para que funcione también en desarrollo
local sin identidad SSH propia contra GitHub (usa `gh auth git-credential`,
mismo patrón que los paquetes Python de la familia). El build en el VPS
reescribe la URL a `git+ssh://` vía un alias de `Host` dedicado + deploy
key de solo lectura, igual que ya hacen los `Dockerfile` de cada producto
para `libracore`/`libragenda` — ver el `Dockerfile` de cualquiera de los
tres consumidores para el patrón exacto.

## Por qué se ship el código fuente, no un build

Este paquete no tiene paso de build propio: `package.json` expone cada
módulo vía `exports` apuntando directo a su `.ts`/`.tsx`. Cada consumidor
lo compila junto con el resto de su propio código (Vite ya transforma TSX
de `node_modules` sin problema).

Esto es necesario porque varios de estos componentes importan primitivos
de shadcn/ui vía el alias `@/components/ui/...` (`Card`, `Button`,
`Sidebar`, etc.) — shadcn se distribuye por diseño como código copiado
dentro de cada app, no como paquete instalable (ver
`wiki/analyses/auditoria-duplicacion-familia-libra.md`, sección de "falsos
candidatos"). Si este paquete embebiera su propia copia de esos
primitivos, se perdería la customización por producto que shadcn existe
para dar. En cambio, el alias `@` ya configurado en el `vite.config.ts` de
cada consumidor (`"@": path.resolve(__dirname, "./src")`) resuelve esos
imports contra los componentes shadcn **del propio consumidor** — Vite
aplica `resolve.alias` a todo lo que procesa, incluido código que vive en
`node_modules`.

Cada consumidor necesita, como prerrequisito, tener instalados los mismos
primitivos de shadcn que usan estos componentes: `card`, `button`,
`input`, `label`, `badge`, `select`, `table`, `sidebar`, `separator`,
`avatar`. Los tres ya los tienen (mismo stack normalizado, ver
`wiki/concepts/estandares-desarrollo.md`).

También hace falta un `@source` en el CSS de Tailwind de cada consumidor
para que el motor de Tailwind v4 escanee las clases usadas dentro de
`node_modules/libra-ui` (por defecto no lo hace):

```css
@source "../node_modules/libra-ui";
```

## Módulos

| Import | Contenido | Uso |
|---|---|---|
| `libra-ui/api-client` | `ApiError`, `api` (get/post/put/del), `type User` | Cliente HTTP base + tipo de usuario. Cada consumidor re-exporta esto desde su propio `src/api.ts` junto a sus tipos/endpoints propios. |
| `libra-ui/AuthContext` | `AuthProvider`, `useAuth` | Contexto de sesión, 100% genérico. |
| `libra-ui/data-table` | `DataTable`, `sortableHeader`, `anchoColumnaAcciones`, `type DataTableSearch` | Wrapper de TanStack Table + shadcn. Buscador opcional desde `v0.8.0`: pasando `search={{ campos }}` aparece un input que filtra la tabla; sin esa prop el render queda idéntico. `campos` lo declara la página porque el dato crudo no siempre es lo que se ve (`cliente_id: 3` se muestra como "Compulibra", y quien busca escribe lo segundo). |
| `libra-ui/Usuarios` | `Usuarios({ basePath? })` | Página de gestión de usuarios, 100% genérica. `basePath` (default `/users`) es la ruta del router de usuarios en el backend del consumidor -- LibraDesk pasa `/api/usuarios`. |
| `libra-ui/Layout` | `createLayout({ productName, productInitial, navItems })` | Factory: recibe la parte propia de cada producto (branding + items de navegación) y devuelve el componente `Layout`. |
| `libra-ui/Login` | `createLogin({ productName, productInitial, redirectTo })` | Factory: recibe branding + ruta de redirect post-login. |
| `libra-ui/SelectBuscable` | `SelectBuscable`, `type OpcionSelect` | Select con **búsqueda por teclado** (`v0.9.0`). El `Select` de shadcn/Radix obliga a encontrar la opción a ojo en una lista ordenada; con los cientos de clientes que puede tener una empresa real, eso deja de ser viable. Filtra sin acentos y exige todos los términos, igual que el buscador de `data-table` — comparten `coincideBusqueda`. **No necesita `cmdk` ni el primitivo `popover`**: se construye con `input`, `button` y `cn`, que ya están en los 5 consumidores. |
| `libra-ui/use-mobile` | `useIsMobile` | Hook de breakpoint, 100% genérico. |
| `libra-ui/utils` | `cn`, `normalizar`, `coincideBusqueda` | Helper `clsx` + `tailwind-merge` de shadcn, más los dos helpers de búsqueda que comparten `data-table` y `SelectBuscable` (sin acentos, todos los términos en cualquier orden). |
| `libra-ui/iconos-accion` | ~60 componentes de icono (`Eye`, `Pencil`, `Trash2`, `FilePlus`…) | El **vocabulario de iconos de acción y estado** de la familia (`v0.18.0`). Vive acá y no copiado por producto porque la misma acción tiene que dibujarse igual en todos. **Requiere configuración en el consumidor — ver abajo.** |

## Peer dependencies

`react`, `react-dom`, `react-router-dom`, `@tanstack/react-table`,
`lucide-react`, `clsx`, `tailwind-merge` — cada consumidor ya los tiene
(mismo stack normalizado).

## Lo que `iconos-accion` exige del consumidor

Este módulo importa `~icons/…`, que es un módulo **virtual**: lo resuelve
`unplugin-icons` en compilación, dentro del pipeline del consumidor. Un
producto que lo use necesita, en su `frontend`:

1. Dependencias **de desarrollo**: `unplugin-icons`, `@iconify-json/fluent`,
   `@iconify-json/fluent-color`, `@svgr/core`, `@svgr/plugin-jsx`.
2. En `vite.config.ts`: `Icons({ compiler: 'jsx', jsx: 'react' })` entre los
   plugins.
3. En `tsconfig.app.json`: `"unplugin-icons/types/react"` dentro de `types`.

**No se puede declarar como `peerDependency`**: npm no sabe mirar un
`vite.config.ts`. Pero lo que falta no se degrada en silencio — el build corta
con `failed to resolve import "~icons/…"`, que nombra el problema.

Y no es un requisito que agregue este módulo: el producto ya necesita las tres
cosas para sus iconos de **identidad**, los del menú, que se le pasan a
`createLayout` desde el producto y no salen de acá.

> Verificado el 2026-08-13 antes de mover el módulo: un `~icons/` dentro de
> `node_modules/libra-ui/src/` resuelve bien —el SVG termina en el bundle del
> consumidor— porque este paquete viaja como TSX crudo y pasa por el pipeline
> del consumidor, no por el pre-bundle de dependencias. Con el plugin sacado
> del `vite.config.ts`, el build falla.

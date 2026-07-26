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
| `libra-ui/data-table` | `DataTable`, `sortableHeader` | Wrapper de TanStack Table + shadcn. |
| `libra-ui/Usuarios` | `Usuarios` | Página de gestión de usuarios, 100% genérica. |
| `libra-ui/Layout` | `createLayout({ productName, productInitial, navItems })` | Factory: recibe la parte propia de cada producto (branding + items de navegación) y devuelve el componente `Layout`. |
| `libra-ui/Login` | `createLogin({ productName, productInitial, redirectTo })` | Factory: recibe branding + ruta de redirect post-login. |
| `libra-ui/use-mobile` | `useIsMobile` | Hook de breakpoint, 100% genérico. |
| `libra-ui/utils` | `cn` | Helper `clsx` + `tailwind-merge` de shadcn. |

## Peer dependencies

`react`, `react-dom`, `react-router-dom`, `@tanstack/react-table`,
`lucide-react`, `clsx`, `tailwind-merge` — cada consumidor ya los tiene
(mismo stack normalizado).

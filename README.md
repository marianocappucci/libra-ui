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
primitivos de shadcn que usan estos componentes. La lista sale de un
`grep -rho "@/components/ui/[a-z-]*" src | sort -u`, que es la unica
fuente que no se desactualiza: `avatar`, `badge`, `button`, `card`,
`dialog`, `dropdown-menu`, `input`, `label`, `select`, `sidebar`,
`table` y `tabs` (mismo stack normalizado, ver
`wiki/concepts/estandares-desarrollo.md`).

> Un primitivo nuevo en este paquete es un cambio que **rompe el build de
> los consumidores que no lo tengan**, y no lo avisa nadie hasta el
> `npm run build` de cada uno. `tabs` entro en la v0.30.0 (las pestanas de
> `Logs`) y hubo que agregarlo a Gestiolibra y a VentaLibra en el mismo
> movimiento; LibraDesk y MedLibra ya lo tenian. Al sumar uno, revisar los
> consumidores ANTES de publicar el tag.

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
| `libra-ui/Layout` | `createLayout({ productName, productInitial, navItems })` | Factory: recibe la parte propia de cada producto (branding + items de navegación) y devuelve el componente `Layout`. Acepta `logo` y `wordmarkClassName` — ver abajo. |
| `libra-ui/Login` | `createLogin({ productName, productInitial, redirectTo })` | Factory: recibe branding + ruta de redirect post-login. Acepta `logo` y `wordmarkClassName` — ver abajo. |
| `libra-ui/branding` | `type ProductLogo` | El tipo del logo de producto. Módulo aparte para que `Login` no tenga que importar de `Layout` y arrastrarse la sidebar entera al bundle de la pantalla que carga sin sesión. |
| `libra-ui/SelectBuscable` | `SelectBuscable`, `type OpcionSelect` | Select con **búsqueda por teclado** (`v0.9.0`). El `Select` de shadcn/Radix obliga a encontrar la opción a ojo en una lista ordenada; con los cientos de clientes que puede tener una empresa real, eso deja de ser viable. Filtra sin acentos y exige todos los términos, igual que el buscador de `data-table` — comparten `coincideBusqueda`. **No necesita `cmdk` ni el primitivo `popover`**: se construye con `input`, `button` y `cn`, que ya están en los 5 consumidores. Desde `v0.25.0` **anda solo adentro de un `<FormControl>`**: declara el `id`, el `aria-describedby` y el `aria-invalid` que el Slot le inyecta, así el `htmlFor` del `<FormLabel>` lo nombra — ver abajo. |
| `libra-ui/Configuracion` | `createConfiguracion({ icono, producto, integraciones, propias })`, `EmpresaCard`, `MercadoPagoCard`, `ArcaCard`, `EmailCard`, `DatosBackupCard`, los `Tutorial*` | **La pantalla de Configuración de la familia, entera** (`v0.47.0`). Tutoriales incluidos. Exige tres primitivos más del consumidor — ver abajo. |
| `libra-ui/use-mobile` | `useIsMobile` | Hook de breakpoint, 100% genérico. |
| `libra-ui/utils` | `cn`, `normalizar`, `coincideBusqueda` | Helper `clsx` + `tailwind-merge` de shadcn, más los dos helpers de búsqueda que comparten `data-table` y `SelectBuscable` (sin acentos, todos los términos en cualquier orden). |
| `libra-ui/iconos-accion` | ~60 componentes de icono (`Eye`, `Pencil`, `Trash2`, `FilePlus`…) | El **vocabulario de iconos de acción y estado** de la familia (`v0.18.0`). Vive acá y no copiado por producto porque la misma acción tiene que dibujarse igual en todos. **Requiere configuración en el consumidor — ver abajo.** |

## El logo del producto y el wordmark (`v0.23.0`)

Por defecto las dos factories dibujan un box con `productInitial` adentro —
40 px en el login, 32 px en la sidebar. Pasando `logo` ese box se reemplaza por
una imagen, y `wordmarkClassName` estila el nombre del producto:

```tsx
import logo from '@/assets/logo-libradesk.png'

createLogin({
  productName: 'LibraDesk',
  productInitial: 'L',          // sigue siendo obligatorio: es el fallback
  logo: { src: logo, className: 'h-[72px] w-[72px]' },
  wordmarkClassName: 'font-montserrat font-bold text-[22px] text-[#2d2d2d]',
})
```

Tres cosas que no son obvias:

- **El tamaño va por clase, no por número.** Tailwind resuelve las clases
  leyendo el fuente, así que una armada en runtime desde un `size: 72` no se
  generaría nunca. Las clases se mergean con `cn`, así que la del producto pisa
  el default en vez de sumarse.
- **En la sidebar, el logo le gana a `icon`.** Son dos formas de llenar el mismo
  hueco y el logo es la más específica.
- **Un logo más alto que 32 px se desborda de la sidebar colapsada**, donde el
  ancho útil son 32 px. Lo resuelve el producto con
  `group-data-[collapsible=icon]:h-8`, porque es el único que sabe qué quiere
  que pase ahí.

Los cinco productos que no pasan nada de esto renderizan exactamente igual que
antes — misma regla que rige desde `v0.3.0`.

## `SelectBuscable` adentro de un `<FormControl>` (`v0.25.0`)

`FormControl` de shadcn es un `Slot.Root`: le pasa `id`, `aria-describedby` y
`aria-invalid` **al hijo**, sin saber qué componente es. Un `<input>` o el
`SelectTrigger` de Radix las reciben como atributos del DOM y funcionan solos.
Un componente propio las recibe como props de React y, **si no las declara, se
pierden sin ningún error**.

Eso es lo que pasaba acá hasta la `v0.24.0`. El resultado no era sutil: adentro
de un formulario, con su `<FormLabel>` puesto y visible en pantalla, el control
quedaba **sin nombre accesible**. Un lector de pantalla anunciaba «botón, Todos
los clientes» — el valor, nunca de qué campo.

Desde la `v0.25.0` las tres van declaradas, así que esto anda sin agregar nada:

```tsx
<FormField control={form.control} name="cliente_id" render={({ field }) => (
  <FormItem>
    <FormLabel>Cliente (locatario)</FormLabel>
    <FormControl>
      {/* el id, el aria-describedby y el aria-invalid llegan solos */}
      <SelectBuscable value={field.value} onChange={field.onChange} opciones={…} />
    </FormControl>
    <FormMessage />
  </FormItem>
)} />
```

Tres cosas que no son obvias:

- **`ariaLabel` sigue siendo necesario fuera de un formulario.** Con un
  `<Label>` suelto al lado no hay `htmlFor` que ate nada, y el rol `combobox`
  **no se nombra por su contenido**. Ése es el uso mayoritario en los
  consumidores y no cambia.
- **Si están los dos, gana `ariaLabel`.** Lo dice el algoritmo de nombre
  accesible. Los productos que ya lo pasan a mano no tienen que sacarlo para
  actualizar.
- **El `id` del desplegable es otro**, interno y con `useId()`. Si se lo pisara
  con el del control, el `aria-controls` del botón apuntaría al botón mismo.

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

## La pantalla de Configuración, y lo que exige del consumidor (`v0.47.0`)

`libra-ui/Configuracion` dejó de ser "el armado de las pestañas" para pasar a
ser **la pantalla de Configuración de la familia, entera**: Empresa (datos +
logo), Integraciones (MercadoPago / ARCA / Email-SMTP en una sub-navegación
lateral), las secciones propias del producto, y Datos / Backup — más el botón de
*Backup rápido* fijo al final de la barra, y los **tutoriales** de MercadoPago,
ARCA y Gmail.

El pedido que la originó (2026-08-29) es explícito sobre el porqué:

> *"Quiero que todas las pantallas de configuración de todas las aplicaciones de
> la familia Libra sean iguales a la de Contalibra […] la idea es que después si
> hago una modificación en la configuración o una actualización se actualice en
> todas."*

Mientras la versión buena vivía adentro de Contalibra, arreglarla no arreglaba a
los otros siete. Por eso está acá.

```tsx
export const Configuracion = createConfiguracion({
  icono: Settings,
  producto: 'MedLibra',                 // sale en los tutoriales; ver abajo
  integraciones: { arca: true, email: true },
  propias: [
    { clave: 'sedes', label: 'Sedes', icono: MapPin, contenido: <SedesCard /> },
  ],
})
```

### `producto` no es decorativo

Dos tutoriales nombran al sistema: el de Gmail le pide al cliente que cree una
contraseña de aplicación **con ese nombre**, y el de Padrón A13 le dice que elija
como representante el certificado que configuró en ese sistema. Un valor
equivocado no rompe nada — hace que el tutorial explique mal, que es peor,
porque parece correcto.

### Lo que el producto tiene que tener vendorizado

Además de los primitivos que este paquete ya usaba (`card`, `button`, `input`,
`label`, `select`, `tabs`, `badge`), esta pantalla necesita **tres piezas más**.
Las tres son copias de archivo: `radix-ui` ya es dependencia de los ocho
productos, así que **no hay que instalar nada**.

| Archivo | Para qué |
|---|---|
| `components/ui/switch.tsx` | El interruptor de "facturar automáticamente" de MercadoPago. |
| `components/ui/alert-dialog.tsx` | Base del confirmador. |
| `components/confirm-dialog.tsx` | La confirmación de la restauración de datos. Ya lo exigía `libra-ui/FacturaDetalle`. |

Y una función: **`@/lib/fechas` tiene que exportar `fechaHora`**, que es con lo
que se muestra la fecha de cada copia de backup en `dd-mm-aaaa HH:MM`. Los
productos que tienen su formateador en otro módulo (LibraCargo, LibraDesk)
resuelven esto con un **adaptador que re-exporta el suyo**, no con una segunda
implementación: el formateo va en un helper único por producto.

> ⚠️ Lo que falta acá **no se degrada en silencio: no compila**. Es la misma
> trampa que se comió a Gestiolibra y VentaLibra con la v0.29.0 y a LibraCargo
> con `tabs` en la v0.35.0 — el import es del módulo entero, así que le llega
> igual al producto que sólo usa `DatosBackupCard`.

### Ruptura respecto de `v0.46.0`

`SECCIONES_BASE`, `SECCION_ARCA` y la prop `secciones` **ya no existen**. Un
producto que suba el pin sin migrar su `Configuracion.tsx` falla en el
`tsc -b` con *"has no exported member"*, que es lo buscado: la alternativa
—dejarlos como alias— lo habría dejado compilando y mostrando las pestañas
planas viejas, divergiendo en silencio, que es justo lo que esta versión vino a
terminar.

La migración es declarar `producto`, mover las secciones propias a `propias` y
declarar las integraciones:

```diff
-  secciones: [...SECCIONES_BASE, SECCION_ARCA, { clave: 'balanza', … }],
+  producto: 'VentaLibra',
+  integraciones: { mercadopago: true, arca: true, email: true },
+  propias: [{ clave: 'balanza', … }],
```

### `empresa` en ARCA: el que no lo declara escribe en el lugar equivocado (`v0.48.0`)

Cuatro productos leen su configuración de facturación con un slug **fijo** de la
tabla `arca_config`:

| Producto | Slug |
|---|---|
| Gestiolibra | `negocio` |
| MedLibra | `consultorio` |
| VentaLibra | `venta` |
| LibraClub | `complejo` |

🔴 En una instancia **que todavía no tiene fila**, el `GET` devuelve `null` y el
primer guardado crea una. Sin declarar `empresa`, la crea como `default` — que
el servicio de facturación de esos cuatro **no lee nunca**. El admin sube el
certificado, la pantalla dice *"Guardado"*, y al emitir la primera factura el
producto contesta que ARCA no está configurado.

```tsx
integraciones: { arca: { empresa: 'consultorio' } }
```

En una instancia que **ya** tiene fila no cambia nada: el `GET` devuelve el slug
real y es ése el que viaja de vuelta. Contalibra y Restolibra son multi-empresa
y no declaran nada: su fila se dio de alta con la razón social.

### Con una sola integración no hay sub-navegación (`v0.49.0`)

Una barra lateral de 192 px con un solo botón, ocupando el ancho de la pestaña
entera, se lee como algo roto y no como una navegación. Con una integración
declarada el contenido va directo; con dos o más aparece la sub-navegación.

El caso vivo es **MedLibra**: desde el ADR-036 no factura por ARCA —la
facturación es de Contalibra— ni cobra por MercadoPago, así que de las tres
integraciones le queda una, el correo.

### El aviso de credenciales incompletas de MercadoPago (`v0.50.0`)

Para cobrar con el QR del mostrador hacen falta **los tres** datos, no sólo el
token: el `user_id` es el collector de la cuenta y el `pos_id` el `external_id`
de la caja, y los dos van en la URL de la orden. Con el token solo, el POS no
puede armar el cobro y el síntoma es un `404` que no dice eso.

La sección muestra un aviso mientras falte alguno. Venía de las pantallas
propias de VentaLibra y LibraClub, que lo calculaban en el backend
(`esta_configurado()`); acá se calcula en la pantalla, porque el router del
motor no lo devuelve. **Perderlo al unificar habría sido un retroceso**: sin él,
una caja a medio configurar se descubre recién cuando un cliente escanea el
cartel impreso y no pasa nada.

### Los endpoints que consume

| Sección | Router del motor | Prefijo por defecto |
|---|---|---|
| Empresa + logo | `libracore.config_router.build_empresa_router` / `build_empresa_admin_router` | `/api/config/empresa` |
| MercadoPago | `libracore.mp_config_router.build_mp_config_router` | `/api/config/mercadopago` |
| ARCA | `libracore.arca_router.build_arca_router` | `/config/arca` |
| Email / SMTP | el router de SMTP de libraauth | `/admin/smtp` |
| Datos / Backup | `libracore.config_router.build_backup_router` | `/api/config` |

Cada uno acepta un `basePath` porque los productos ya publicaron rutas
distintas y cambiar un prefijo rompe el frontend desplegado. La ruta se
normaliza producto por producto, no de prepo desde el kit.

🔴 **La sección de MercadoPago asume que los secretos vuelven enmascarados**
(`APP_USR-…9f2a`), que es lo que hace `build_mp_config_router`. Los dos campos
secretos arrancan vacíos con la máscara de `placeholder`, y vacío significa "no
lo toqués". Un backend propio que devolviera el token en claro haría que
guardar cualquier otro campo lo reemplace por su propia máscara — el cobro con
QR deja de andar sin ningún error en pantalla.

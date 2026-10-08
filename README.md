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
| `libra-ui/AuthContext` | `AuthProvider`, `useAuth`, `createAuthContext`, `SegundoFactorRequerido` | Contexto de sesión, 100% genérico. Desde `v0.70.0` soporta el login en dos pasos — ver abajo. |
| `libra-ui/data-table` | `DataTable`, `sortableHeader`, `anchoColumnaAcciones`, `type DataTableSearch` | Wrapper de TanStack Table + shadcn. Buscador opcional desde `v0.8.0`: pasando `search={{ campos }}` aparece un input que filtra la tabla; sin esa prop el render queda idéntico. `campos` lo declara la página porque el dato crudo no siempre es lo que se ve (`cliente_id: 3` se muestra como "Compulibra", y quien busca escribe lo segundo). |
| `libra-ui/Usuarios` | `Usuarios({ basePath? })` | Página de gestión de usuarios, 100% genérica. `basePath` (default `/users`) es la ruta del router de usuarios en el backend del consumidor -- LibraDesk pasa `/api/usuarios`. |
| `libra-ui/Layout` | `createLayout({ productName, productInitial, navItems })` | Factory: recibe la parte propia de cada producto (branding + items de navegación) y devuelve el componente `Layout`. Acepta `logo` y `wordmarkClassName` — ver abajo. |
| `libra-ui/Login` | `createLogin({ productName, productInitial, redirectTo })` | Factory: recibe branding + ruta de redirect post-login. Acepta `logo` y `wordmarkClassName` — ver abajo. Desde `v0.70.0` abre el modal del segundo factor en dos pasos si el `useAuth` que recibe trae `confirmarCodigo` — ver abajo. |
| `libra-ui/CodigoPorDigitos` | `CodigoPorDigitos({ value, onChange, onComplete?, length?, disabled?, autoFocus? })` | El recuadro de 6 dígitos del segundo factor (`v0.70.0`), uno por casillero. Controlado: el que llama tiene el código en `value` y lo resetea poniéndolo en `''`. No es exclusivo del modal de `Login` — cualquier pantalla con un código de un solo uso lo puede usar. |
| `libra-ui/branding` | `type ProductLogo` | El tipo del logo de producto. Módulo aparte para que `Login` no tenga que importar de `Layout` y arrastrarse la sidebar entera al bundle de la pantalla que carga sin sesión. |
| `libra-ui/SelectBuscable` | `SelectBuscable`, `type OpcionSelect` | Select con **búsqueda por teclado** (`v0.9.0`). El `Select` de shadcn/Radix obliga a encontrar la opción a ojo en una lista ordenada; con los cientos de clientes que puede tener una empresa real, eso deja de ser viable. Filtra sin acentos y exige todos los términos, igual que el buscador de `data-table` — comparten `coincideBusqueda`. **No necesita `cmdk` ni el primitivo `popover`**: se construye con `input`, `button` y `cn`, que ya están en los 5 consumidores. Desde `v0.25.0` **anda solo adentro de un `<FormControl>`**: declara el `id`, el `aria-describedby` y el `aria-invalid` que el Slot le inyecta, así el `htmlFor` del `<FormLabel>` lo nombra — ver abajo. Desde `v0.121.0` existe el modo de **campo de texto con lupa** donde se escribe para buscar, y desde **`v0.129.0` es el modo por defecto** (ADR-039): `buscarEscribiendo={false}` devuelve el botón. Suma `OpcionSelect.disabled`, `required`, `limpiable` y `title`, y un `Escape` con la lista abierta ya no cierra el diálogo de afuera — ver «Todo desplegable de datos se busca escribiendo». |
| `libra-ui/CampoArchivo` | `CampoArchivo`, `formatearTamanio(bytes)` | El **campo de archivo de toda la suite** (`v0.127.0`, ADR-037): caja de la altura de un input, texto a la izquierda y un botón con el ícono de subir pegado al borde derecho. Props: `archivo: File \| null`, `onChange(archivo: File \| null)`, `accept?`, `placeholder?` (defecto «Ningún archivo»), `quitable?` (la X; defecto sí, salvo `required`/`disabled`), `error?` (debajo de la caja), `ayuda?` (texto chico debajo), más `id`, `name`, `disabled`, `required`, `aria-label`, `aria-describedby`, `className` (del contenedor) y `ref` (al `<input>`). Un click en cualquier parte abre el selector; se puede arrastrar y soltar (se valida `accept`). Elegido, muestra nombre y tamaño legible (`1,2 KB`). **Ningún `type="file"` fuera de este componente**: un guard lo verifica. |
| `libra-ui/Configuracion` | `createConfiguracion({ icono, producto, integraciones, propias })`, `EmpresaCard`, `MercadoPagoCard`, `ArcaCard`, `EmailCard`, `DatosBackupCard`, los `Tutorial*` | **La pantalla de Configuración de la familia, entera** (`v0.47.0`). Tutoriales incluidos. Exige tres primitivos más del consumidor — ver abajo. |
| `libra-ui/use-mobile` | `useIsMobile` | Hook de breakpoint, 100% genérico. |
| `libra-ui/utils` | `cn`, `normalizar`, `coincideBusqueda` | Helper `clsx` + `tailwind-merge` de shadcn, más los dos helpers de búsqueda que comparten `data-table` y `SelectBuscable` (sin acentos, todos los términos en cualquier orden). |
| `libra-ui/iconos-accion` | ~60 componentes de icono (`Eye`, `Pencil`, `Trash2`, `FilePlus`…) | El **vocabulario de iconos de acción y estado** de la familia (`v0.18.0`). Vive acá y no copiado por producto porque la misma acción tiene que dibujarse igual en todos. **Requiere configuración en el consumidor — ver abajo.** |
| `libra-ui/iconos-identidad` | `ICONOS`, `iconosDe(producto?)`, `iconoDelConcepto(concepto, producto?)`, `ICONOS_POR_PRODUCTO`, `type Concepto` | El **catálogo de íconos de identidad** de la familia (`v0.125.0`, ADR-035): un concepto, un ícono, en el menú y en el título de la pantalla. Ver «El catálogo de íconos de identidad». |
| `libra-ui/iconos-indicador` | `INDICADORES`, `iconoDelIndicador(concepto, producto?)`, `conceptoCanonico`, `esDeIdentidad`, `type ConceptoIndicador` | El **catálogo de íconos de reportes e indicadores** (`v0.128.0`, ADR-038): un concepto, un ícono, para lo que se mide (cobros, stock bajo, órdenes de carga…). Incluye los 33 de identidad. Ver «Reportes e indicadores». |
| `libra-ui/TarjetaReporte` | `TarjetaReporte({ concepto, titulo, descripcion?, nota?, a? \| onClick?, producto?, className? })` | La tarjeta de un reporte en el índice de reportes (`v0.128.0`): ícono del catálogo en el recuadro del título, título, qué pregunta responde. Enlace (`a`), botón (`onClick`) o informativa. |
| `libra-ui/TarjetaIndicador` | `TarjetaIndicador({ concepto, etiqueta, valor?, ayuda?, variacion?, tono?, cargando?, a?, producto?, className?, children? })` | El KPI de un tablero (`v0.128.0`): etiqueta, cifra, ayuda, variación, estado de carga y el ícono del catálogo. |
| `libra-ui/IconoIndicador` | `IconoIndicador({ concepto, producto?, className? })` | El ícono de un concepto (16 px) para el título de un bloque de un reporte. |
| `libra-ui/titulo-pantalla` | `TituloPantalla({ icono, children, className?, acciones? })` | El título de pantalla con su ícono en el recuadro (`v0.34.0`). Desde `v0.128.0` acepta `acciones`: los botones a la altura del título, a la derecha. |
| `libra-ui/auditoria-de-titulos` | `auditarTitulos`, `auditarMenuContraCatalogo`, `iconoDelTitulo`… | **De test.** El guard de que el ícono del título es el del menú (ADR-035). |
| `libra-ui/auditoria-de-relleno` | `auditarRelleno(raizSrc, opciones?)`, `describirInfracciones`, `describirSobrantes`, `analizarFuente`, `rellenoDeClases`, `esPantallaDeProducto` | **De test.** El guard de que una pantalla no agrega relleno propio arriba del que ya pone el `Layout` (ADR-040). |
| `libra-ui/auditoria-de-selects` | `auditarSelects(raizSrc, opciones?)`, `describirInfracciones`, `desplegablesEn`, `MAX_CERRADO`, `MARCA_CERRADO` | **De test.** El guard de que todo desplegable de datos se busca escribiendo (ADR-039): falla si un `<Select>` o un `<select>` tiene opciones que arma el código (datos) o más de 8 fijas, y no es `SelectBuscable`. |
| `libra-ui/auditoria-de-indicadores` | `auditarIndicadores(raizSrc, opciones?)`, `describirInfracciones`, `LUCIDE_PERMITIDOS`, `esPantallaDeIndicadores`, `iconosDeConceptoEn` | **De test.** El guard de que los reportes y tableros no importan íconos de lucide por su cuenta (ADR-038). |

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

## El tema de la suite: colores editables (`v0.93.0`, ADR-007)

`libra-ui/tema.css` declara las variables de color que el backoffice de cada suite puede cambiar, con los valores de siempre como
defecto, y la regla del ítem activo del menú lateral que las usa. Desde `v0.126.0` (ADR-036) el color del ítem activo es **el del producto**
(`aplicarIdentidad` lo fija: fondo `colorClaro`, borde de marca al 45%, texto `colorOscuro` a 4,5:1); lo de `tema.css` es un neutro de último
recurso. `defectosDelProducto(producto)` (`libra-ui/identidad`) devuelve el valor «de siempre» de cada color editable para ese producto, para
quien tenga que mostrarlo (la vista previa de «Apariencia»). El producto lo importa una vez,
después de Tailwind:

```css
@import "tailwindcss";
@import "libra-ui/tema.css";
```

`libra-ui/tema` es la **única lista** de colores editables (`COLORES_DE_TEMA`) y trae lo que hace falta para usarla:

```ts
import { aplicarTema, validarTema } from 'libra-ui/tema'

const { tema, errores } = validarTema(crudo)  // sólo claves conocidas, #rrggbb, con contraste AA
aplicarTema(tema)                              // fija las variables en <html>; aplicarTema({}) restaura los defectos
```

- **El texto sobre un fondo elegido se calcula**, no se elige: `textoSobre` devuelve el oscuro o el claro que mejor se lee, y un
  fondo sobre el que ninguno llega a 4,5:1 se rechaza.
- **El modo oscuro no tiene valores propios.** Se editan los del claro y el texto se recalcula, así el contraste vale en los dos.
- Un color nuevo se agrega **sólo** en `COLORES_DE_TEMA` (y en `tema.css` si es una variable propia): lo leen el backoffice, la
  instancia y la SPA.
- **Carga al arrancar (`v0.94.0`, ADR-008):** en `main.tsx`, antes de montar React, `void cargarTema()`. Aplica síncrono lo último guardado en
  `localStorage` y después pide `GET /api/tema` a la propia instancia (no al backoffice), valida, aplica y guarda. Nunca lanza ni se cuelga
  (tope de 3 s): un color no puede impedir entrar al sistema.
- Hoy están las fases 1 y 2. Las siguientes (pantalla del backoffice y el resto de los productos) no cambian esta API.

## El segundo factor en dos pasos: modal con un dígito por casillero (`v0.70.0`)

Reemplaza al segundo factor de una sola pantalla de `v0.60.0` (F2): antes el
campo «Código de verificación» aparecía **arriba**, desde el principio, si una
sonda a `totpPath` confirmaba `{ totp: true }`, y el código viajaba en el mismo
POST que usuario y contraseña. Ahora se pide **después**, en un modal aparte,
una vez que el backend ya validó usuario y contraseña.

**El contrato son dos POST, no uno:**

1. `POST {loginPath}` con `{ captcha?, username, password }` — como siempre.
   El backend contesta 200 con el usuario (sin 2FA, igual que hoy) **o** 200
   con `{ requiere_codigo: true, desafio }` cuando hace falta el segundo paso.
   Se distingue por la FORMA de la respuesta, no por el status — mismo criterio
   que `esDesafio` del captcha y las sondas de `demoPath`/`totpPath` viejo.
2. `POST {segundoFactorPath}` con `{ desafio, codigo }` → 200 con el usuario
   (y ahí sí la cookie de sesión).

Del lado de `createAuthContext`, el paso 1 lo sigue resolviendo `login()`:
si la respuesta tiene la forma de arriba, lanza `SegundoFactorRequerido`
(`.desafio`) **sin** hacer `setUser` — no hay sesión todavía. El paso 2 es el
método nuevo del contexto, `confirmarCodigo(desafio, codigo)`, que postea a
`segundoFactorPath` (opt-in en la config de `createAuthContext`) y recién ahí
deja al usuario en el contexto.

`Login.tsx` atrapa `SegundoFactorRequerido` en el `catch` del submit, ANTES de
mirar `instanceof ApiError` — no es un error, el paso 1 salió bien — y abre un
`Dialog` con `CodigoPorDigitos` (6 casilleros, uno por dígito, ver la tabla de
arriba). El envío del paso 2 es automático al completar el sexto dígito
(`onComplete`); el botón «Verificar» hace lo mismo a mano.

Lo que decide cada rama del modal es el `detail` del 401, no una ruta ni un
código propios:

- **Código incorrecto**: se queda en el modal, limpia los 6 casilleros y
  vuelve el foco al primero — el desafío sigue vivo, no hace falta un login
  nuevo.
- **Desafío vencido** (`detail` menciona "venció"): cierra el modal, muestra
  el error en el formulario de siempre y **reinicia el captcha** — hay que
  volver a arrancar desde usuario y contraseña.
- **429** (bloqueo): igual que el código incorrecto pero sin limpiar — no fue
  culpa de lo tipeado.
- **Cancelar/Escape/click afuera**: los tres pasan por el mismo
  `onOpenChange` del `Dialog`, así que cierran, reinician el captcha y
  conservan usuario y contraseña ya tipeados — nadie tiene que volver a
  escribirlos.

🔴 **El captcha NO se reinicia al abrir el modal.** Ya cumplió su función en el
paso 1, que salió con 200 — reiniciarlo ahí sería pedirle a la persona que
vuelva a tildarlo sin necesidad. Sólo hace falta uno nuevo si el paso 2 no se
completa (vencido o cancelado), porque ahí sí hace falta un login nuevo.

**`totpPath` queda deprecado pero tipado.** El backoffice de superadmin
todavía no migró a este contrato; mientras tanto sigue pudiendo pasarlo a
`createLogin` sin dejar de compilar, pero la pantalla lo ignora por completo
— ni pega la sonda vieja ni dibuja el campo de arriba.

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

## Todo desplegable de datos se busca escribiendo (`v0.129.0`, ADR-039)

El control cerrado de `SelectBuscable` **es un campo de texto con lupa** (ADR-031, `v0.121.0`; por defecto desde la `v0.129.0`). Quien lo ve sabe que puede escribir:

```tsx
<Label htmlFor="cc-tercero">Cliente</Label>
<SelectBuscable
  id="cc-tercero"
  value={terceroId}
  onChange={setTerceroId}
  opciones={clientes.map((c) => ({ value: String(c.id), label: c.nombre, hint: c.cuit }))}
  placeholder="Buscar cliente por nombre o CUIT…"
  emptyMessage="No hay ninguno con ese nombre."
/>
```

- **Escribir filtra y abre la lista al instante** (etiqueta + `hint`, sin acentos, todos los términos). Un click o `ArrowDown` abren la lista completa; las flechas mueven el resaltado (saltean las opciones `disabled`), `Enter` elige, `Escape` cierra, `Tab` cierra y sigue.
- **Con algo elegido el campo muestra su etiqueta**; al enfocar queda seleccionada, así escribir empieza una búsqueda nueva. Una **×** vacía la selección (`onChange('')`).
- **Salir sin elegir** (click afuera, `Tab`, `Escape`) cierra la lista y devuelve la etiqueta elegida: lo escrito a medias se descarta.
- **`Escape` con la lista abierta cierra la lista y nada más**, también adentro de un diálogo de Radix (que escucha el `Escape` en `document`, antes que React). Con la lista cerrada, la tecla sigue su camino.
- **ARIA**: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `listbox`/`option`; `id`, `aria-describedby`, `aria-invalid` y `ariaLabel` van al `<input>`. Anda adentro de un `<FormControl>`.
- **`className` va al contenedor** (el ancho), no a un botón. Sin `className` el campo ocupa el ancho de su contenedor. El `placeholder` es lo que se ve con el campo vacío: que diga qué se busca.

**Para reemplazar a un `Select`:**

| Prop | Qué hace |
|---|---|
| `opciones[].disabled` | La opción se ve pero no se elige (`aria-disabled`; las flechas la saltean; ni el click ni `Enter` la eligen). |
| una opción `{ value: '', label: 'Todas' }` | El «ninguno» / «todas» de un filtro. Con el valor vacío el campo muestra esa etiqueta. Reemplaza a los centinelas `__todas__` que el `Select` de Radix obligaba a usar (no admite `value=""`). La × no se ofrece si está. |
| `required` | `required` en el `<input>` (el navegador no deja enviar vacío) y `aria-required`. Un campo obligatorio no ofrece la ×. |
| `limpiable` | Si se ofrece la ×. Por defecto sí, salvo `required` o una opción de valor `''`. `limpiable={false}` donde vaciar no es una elección (una caja, un depósito). |
| `title` | El tooltip nativo, para cuando la etiqueta elegida se corta. |
| `buscarEscribiendo={false}` | Vuelve al botón con el buscador adentro. Se conserva por compatibilidad; no se recomienda: la gente no descubre que puede escribir. |

**El criterio** (ADR-039): un desplegable es **de datos** si las opciones las arma el código (un `.map` sobre una lista, una variable, una llamada, un componente): clientes, fleteros, choferes, vehículos, localidades, productos, profesionales, pacientes, depósitos, cajas, cuentas, categorías… **y entonces es `SelectBuscable`**. Es **cerrado** si son `<SelectItem>` o `<option>` escritos a mano, hasta 8 (estado, tipo, sí/no, alícuota, orden, cantidad por página): puede seguir siendo un `Select`, porque en un celular un campo de texto abre el teclado y para tres valores no hay nada que buscar. Más de 8 opciones fijas (provincias, meses) se buscan igual.

**Una lista corta que sale de una constante** (`ESTADOS.map(…)`, `IVA_CONDITIONS.map(…)`) el guard no la puede distinguir de una de datos: se marca, con el motivo, en el mismo renglón del `<Select>` o en los tres de arriba:

```tsx
{/* select-cerrado: las condiciones frente al IVA son un catálogo cerrado de ARCA, fijo en el código */}
<Select value={field.value} onValueChange={field.onChange}>
```

**El guard.** `auditarSelects` (`libra-ui/auditoria-de-selects`, de test) lee los fuentes de un producto y falla si un `<Select>` de shadcn o un `<select>` nativo tiene opciones de datos, o más de 8 fijas, sin la marca:

```ts
import { resolve } from 'node:path'
import { auditarSelects, describirInfracciones } from 'libra-ui/auditoria-de-selects'

const r = auditarSelects(resolve(__dirname, '..'))   // el `src` del producto
expect(r.desplegables).toBeGreaterThan(0)             // que midió algo
expect(describirInfracciones(r.infracciones)).toEqual([])
```

Cada infracción dice archivo, renglón, de dónde salen las opciones y qué cambiar. `{ prohibirNativos: true }` rechaza además cualquier `<select>` nativo, aun cerrado. No ve un desplegable armado con un envoltorio propio que reciba las opciones como `children`: se audita el envoltorio.

**Migración de un test:** la lista de un `SelectBuscable` existe en el DOM sólo mientras está abierta. `await user.selectOptions(combo, '2')` pasa a `await user.click(combo); await user.click(await screen.findByRole('option', { name: 'Caja 2' }))` (en el kit, `elegirEnBuscable` y `opcionesDe` de `test/helpers-pantallas.tsx`); `expect(select.value).toBe('2')` pasa a `expect(combo).toHaveValue('Caja 2')`.

## El catálogo de íconos de identidad (`v0.125.0`, ADR-035)

`libra-ui/iconos-identidad` es **el ícono de cada entrada del menú y del título de su pantalla**, el mismo en todos los productos: Caja es `Wallet` en los ocho, no `SquareStack` en uno, `Landmark` en otro y `Wallet` en un tercero. Es un mapa `concepto → componente de lucide`, congelado, con la tabla aprobada por el humano el 2026-10-07 (wiki: `catalogo-iconos-identidad-diseno`).

```tsx
import { ICONOS, iconosDe, iconoDelConcepto } from 'libra-ui/iconos-identidad'

// Menú y título: el mismo concepto, el mismo ícono.
{ to: '/caja', label: 'Caja', icon: ICONOS.caja }
<TituloPantalla icono={ICONOS.caja}>Caja</TituloPantalla>

// Un producto con excepciones (hoy sólo LibraCargo) toma la vista que le corresponde.
const ICONOS_LC = iconosDe('libracargo')
{ to: '/proveedores', label: 'Proveedores', icon: ICONOS_LC.proveedores }   // Store; fleteros es Truck
```

| Concepto | Ícono | Concepto | Ícono | Concepto | Ícono |
|---|---|---|---|---|---|
| `dashboard` | `LayoutDashboard` | `ventas` | `ShoppingCart` | `cajas` | `SquareStack` |
| `agenda` | `CalendarDays` | `ordenesDeCompra` | `ShoppingBasket` | `cajaPorMedio` | `Coins` |
| `clientes` | `Users` | `proveedores` | `Truck` (LibraCargo: `Store`) | `turnosDeCaja` | `Clock` |
| `cuentaCorriente` | `BookOpen` | `fleteros` | `Truck` | `cierreDiario` | `CalendarCheck` |
| `comprobantes` | `Receipt` | `egresos` | `ShoppingBag` | `tesoreria` | `Landmark` |
| `recibos` | `ReceiptText` | `senas` | `HandCoins` | `pagosMercadoPago` | `CreditCard` |
| `preFacturas` | `FileClock` | `productos` | `Package` | `reportes` | `ChartColumn` (= `BarChart3`) |
| `comprobantesAFacturar` | `Inbox` | `listasDePrecio` | `Tags` | `librosDeIva` | `BookText` |
| `presupuestos` | `Calculator` | `stock` | `Boxes` | `configuracion` | `Settings` |
| `remitos` | `FileText` | `depositos` | `Warehouse` | `usuarios` | `UserCog` |
| | | `sucursales` | `MapPin` | `logDeActividad` | `ScrollText` |
| | | `caja` | `Wallet` | | |

**Las reglas.** Un concepto lleva un solo ícono; dos conceptos no comparten ícono (la única repetición del mapa base es `proveedores` / `fleteros`, que LibraCargo separa); y **las excepciones por producto viven en `ICONOS_POR_PRODUCTO`, nunca en el menú del producto**. Hoy hay una sola: en LibraCargo `proveedores` es `Store`.

**Para un producto.**
1. Su menú y sus títulos toman el ícono de `ICONOS` (o de `iconosDe('<producto>')` si tiene excepciones).
2. Su test lo comprueba. Si tiene el ícono a mano: `expect(iconoDeLaEntrada).toBe(iconoDelConcepto('caja', 'ventalibra'))`. Si el menú está en un `Layout.tsx` que no se exporta: `auditarMenuContraCatalogo` (`libra-ui/auditoria-de-titulos`) lo lee del fuente.

```ts
const r = auditarMenuContraCatalogo(fuenteDelLayout, { '/caja': 'caja', '/cuenta-corriente': 'cuentaCorriente' }, 'ventalibra')
expect(r.medidas).toBe(2)   // que midió algo: un parser que no encuentra nada también deja `mal` vacío
expect(r.faltan).toEqual([])
expect(r.mal).toEqual([])
```

3. `Usuarios`, `Logs` y `createConfiguracion` ya no necesitan que se les pase `icono`: usan el del catálogo.

**Para agregar un concepto**, ver ADR-035: la fila en el wiki, la clave acá con un ícono que nadie más use, la fila en `test/iconos-identidad.test.tsx`, y subir la versión.

## Reportes e indicadores: el catálogo de íconos y las tarjetas (`v0.128.0`, ADR-038)

Pedido del humano (2026-10-08): íconos en los reportes «como tiene Contalibra», normalizados para toda la suite, y también en los dashboards. `libra-ui/iconos-indicador` es **el ícono de cada cosa que se mide**: la tarjeta de un reporte, el KPI de un tablero, el título de un bloque. Es el hermano de `iconos-identidad` (que responde «qué pantalla es»): incluye sus 33 conceptos con la misma clave y el mismo componente, y suma sinónimos y conceptos propios. **No se importa un ícono de lucide para esto: se pasa el concepto.**

```tsx
import { TarjetaIndicador } from 'libra-ui/TarjetaIndicador'
import { TarjetaReporte } from 'libra-ui/TarjetaReporte'
import { IconoIndicador } from 'libra-ui/IconoIndicador'
import { iconoDelIndicador } from 'libra-ui/iconos-indicador'

// El KPI de un tablero.
<TarjetaIndicador concepto="cobros" etiqueta="Cobrado este mes" tono="exito"
  valor={formatearImporte(mes.cobrado)} ayuda="Ingresos en caja" a="/caja"
  variacion={{ porcentaje: 12.5 }} />          // subirEsBueno: false para egresos, morosidad…

// La tarjeta del índice de reportes. El concepto puede venir de un mapa tipado slug → concepto.
const CONCEPTO_DE: Record<string, ConceptoIndicador> = { saldos: 'saldos', 'por-fletero': 'fleteros', caja: 'caja' }
<TarjetaReporte concepto={CONCEPTO_DE[r.slug]} titulo={r.titulo} descripcion={r.descripcion} a={`/reportes/${r.slug}`} />

// El título de un bloque de un reporte.
<CardTitle className="flex items-center gap-2"><IconoIndicador concepto="productos" />Productos más vendidos</CardTitle>

// Un test compara con ===.
expect(iconoDeLaTarjeta).toBe(iconoDelIndicador('cobros'))
```

Las dos tarjetas usan el recuadro del título de pantalla (`data-slot="icono-tile"`), son sobrias (sin color, la cifra es del color del texto; `tono` pinta cuando significa algo) y traen el modo oscuro. `TarjetaIndicador` con `cargando` deja la etiqueta y el ícono y pone un esqueleto en lugar de la cifra; con `children` suma un desglose debajo.

**Los conceptos propios** (los de identidad, ver la tabla de arriba, valen con su misma clave):

| Concepto | Ícono | Qué mide |
|---|---|---|
| `cobros` | `CircleArrowDown` (= `ArrowDownCircle`) | Plata que entró: cobrado, ingresos |
| `pagos` | `CircleArrowUp` (= `ArrowUpCircle`) | Plata que salió: pagado. El rubro Egresos es `egresos` |
| `montoVendido` | `DollarSign` | El monto de lo vendido; la cantidad es `ventas` |
| `porCobrar` | `Hourglass` | Lo que todavía no se cobró |
| `margen` | `TrendingUp` | Margen y rentabilidad |
| `stockBajo` | `PackageMinus` | Productos por debajo de su mínimo |
| `tiempo` | `Timer` | Horas invertidas, tiempos de comanda |
| `recordatorios` | `Bell` | Recordatorios enviados |
| `ordenesDeCarga` | `ClipboardList` | LibraCargo: las órdenes (el flete) |
| `rutas` | `Route` | LibraCargo: origen → destino |
| `toneladas` | `Weight` | LibraCargo: peso transportado |
| `kilometros` | `Gauge` | LibraCargo: distancia |
| `comisiones` | `BadgePercent` | LibraCargo: comisión de las órdenes |
| `liquidaciones` | `Banknote` | LibraCargo: lo que se liquida a un transportista |
| `cartasDePorte` | `FileBadge` | LibraCargo: las CPE |
| `incidencias` | `Ticket` | LibraDesk: los tickets |
| `equipos` | `Monitor` | LibraDesk: el parque instalado |
| `garantias` | `ShieldCheck` | LibraDesk |
| `contratos` | `FilePenLine` (= `FileSignature`) | LibraDesk: contratos de alquiler |
| `reparaciones` | `Wrench` | LibraDesk: equipos en el taller |
| `tecnicos` | `Headset` | LibraDesk: carga por técnico |
| `insumos` | `Droplets` | LibraDesk: consumibles de los equipos |

**Los sinónimos** (misma clave que su destino, mismo ícono): `facturado` → `comprobantes`, `gastos` → `egresos`, `saldos` → `cuentaCorriente`, `pacientes` → `clientes`, `turnos` → `agenda`, `iva` → `librosDeIva`, `mediosDePago` → `cajaPorMedio`, `auditoria` → `logDeActividad`, `fletes` → `ordenesDeCarga`, `horas` → `tiempo`, `foodCost` → `margen`.

**El guard.** `auditarIndicadores` (`libra-ui/auditoria-de-indicadores`, de test) lee los fuentes de un producto y falla si una pantalla de reporte o de tablero (`Reporte*`, `Dashboard*`, `Tablero*`, `Inicio*`, `Indicador*`, `Kpi*`) importa de `lucide-react` un ícono que no sea de acción, de navegación o de estado:

```ts
import { resolve } from 'node:path'
import { auditarIndicadores, describirInfracciones } from 'libra-ui/auditoria-de-indicadores'

const r = auditarIndicadores(resolve(__dirname, '..'))   // el `src` del producto
expect(r.pantallas).toBeGreaterThan(0)                    // que midió algo
expect(describirInfracciones(r.infracciones)).toEqual([])
```

**El relleno de arriba es del `Layout`, no de la pantalla (ADR-040).** El contenido de `createLayout` lleva `p-4 md:p-6` y arriba, en escritorio, `md:pt-3.5` (14 px): lo que mide el sidebar hasta el borde de arriba de la marca (`SidebarHeader` `p-2` + fila `py-1.5`). Con eso la fila del título (el recuadro `size-8` de `TituloPantalla`, 32 px, igual que la marca) arranca a la altura del logo y del nombre del producto. En celular queda `pt-14`, el hueco del botón del menú. **Una pantalla NO se envuelve en su propio `<div className="p-6">`**: lo duplica y baja el título 24 px más (32 px debajo de la marca en total, 10 de más sólo por el `pt-6` anterior). Para separar bloques, `space-y-N` o `gap-N`. El guard:

```ts
import { resolve } from 'node:path'
import { auditarRelleno, describirInfracciones, describirSobrantes } from 'libra-ui/auditoria-de-relleno'

const r = auditarRelleno(resolve(__dirname, '..'), {
  // Las pantallas que se dibujan FUERA del Layout sí llevan su relleno: ruta relativa al `src` → motivo.
  excepciones: { 'pages/KdsMonitor.tsx': 'pantalla completa, fuera del Layout' },
})
expect(r.pantallas).toBeGreaterThan(0)                    // que midió algo (r.raices: cuántos `return` leyó)
expect(describirInfracciones(r.infracciones)).toEqual([])
expect(describirSobrantes(r.sobrantes)).toEqual([])      // una excepción que ya no hace falta se saca
```

Mide `pages/**/*.tsx` (o lo que diga `opciones.esPantalla`): el elemento raíz de cada pantalla —los `return` del componente, también los de `if (cargando) return …`— no lleva `p-N`, `py-N`, `pt-N`, `mt-N` ni `my-N`.

**`TituloPantalla` con `acciones`.** `<TituloPantalla icono={ICONOS.clientes} acciones={<Button>Nuevo cliente</Button>}>Clientes</TituloPantalla>` dibuja el título a la izquierda y los botones a la derecha, en la misma línea (en un celular bajan debajo del título). Es azúcar sobre `EncabezadoDePantalla` (`libra-ui/acciones`): la misma fila, no otra. Sin `acciones` rinde el mismo `<h2>` de siempre. Escribí `icono` primero.

**Para agregar un concepto**, ver ADR-038: la clave en `src/iconos-indicador.ts` con un ícono que nadie más use, la fila en `test/iconos-indicador.test.tsx` y acá, y subir la versión.

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
`createLayout` desde el producto y no salen de acá (la lista de cuál lleva cada
concepto sí: `iconos-identidad`, abajo).

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

### Más de un servicio de ARCA (`v0.120.0`)

La tarjeta de ARCA pide `GET {basePath}/servicios` y, **si el motor lista más que la
facturación**, pinta un bloque por servicio (hoy, además de la facturación, el CTG y la
Carta de Porte — `wscpe`): certificado y clave por ambiente, estado, CUIT del certificado,
vencimiento y «Probar conexión». El producto no declara nada en el kit: lo decide el motor
(`build_arca_router(servicios=("wsfe", "wscpe"))`, libracore ADR-032). Con la facturación
sola —o con un motor que no tiene la ruta— la tarjeta es la de siempre. Ver ADR-030.

### «Generar pedido de certificado» (propuesta: `v0.130.0`)

Para una empresa nueva —o una renovación— cada ambiente de la tarjeta de ARCA ofrece **Generar pedido de certificado**: un diálogo (CUIT, razón social y alias sugerido) que le pide al motor la clave **dentro del servidor** y entrega sólo el `.csr`, con los pasos de ARCA armados con el CUIT y el alias de esa empresa. Con el pedido pendiente la tarjeta dice *«Esperando el certificado de ARCA (pedido del dd-mm-aaaa)»*, deja bajar de nuevo el `.csr`, descartar el pedido (con confirmación: se pierde su clave) y subir el `.crt` **sin campo de clave**. El campo «Clave privada (.key)» queda como alternativa avanzada, en un desplegable.

**El botón aparece sólo si el motor lo declara** (`admite_pedido` en `GET {basePath}/servicios`, libracore ADR-036): con un LibraCore anterior la tarjeta es la de siempre. Se ofrece cuando el par no está completo o está vencido o por vencer. `integraciones: { arca: { razonSocial } }` (o la prop de `ArcaCard`) prellena el diálogo; es opcional. Ver ADR-041.

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

### El webhook de MercadoPago es opcional (`v0.51.0`)

`mercadopago: { webhook: false }` esconde el campo del **Webhook Secret** y el
bloque de la URL.

🔴 El caso vivo es **VentaLibra**, y su ausencia de webhook es deliberada y
está medida: en la instancia real del cliente no llegó ni un `POST` a
`/webhooks/mercadopago`, y el cobro se resuelve con un poll. Pedirle al comercio
una firma secreta para un webhook que no existe es mandarlo a configurar algo
que no hace nada, y después a buscar por qué "no anda".

Esconder el campo **no borra** lo guardado: el valor viaja vacío y vacío
significa "no lo toqués" del lado del motor. Hay un test que lo sostiene.

`rutaWebhook` es la otra mitad del mismo problema: **LibraClub** sí tiene
webhook, pero en `/api/portal/webhook`, no en la ruta de la familia.

### El producto puede poner su propia tarjeta de Empresa (`v0.52.0`)

`empresa: { contenido: <MiTarjeta /> }` reemplaza el formulario del kit **sin
mover la pestaña de lugar**. Hace falta en dos productos, por motivos distintos:

- **LibraCargo** guarda los datos de la empresa en una tabla propia y con más
  campos —razón social, localidad, provincia, sitio web, pie de impresión—, no
  en el `config.json` del motor.
- **LibraDesk** esconde el botón de guardar a quien no es admin. El backend ya
  rechaza el `PUT`, así que sin eso un usuario de staff vería un botón que
  siempre le contesta 403.

Sin esta opción los dos tendrían que declararla como sección propia, y
"Empresa" caería **después** de Integraciones — distinta de los otros seis, que
es justamente lo que esta pantalla vino a terminar.

### El pie de la pantalla (`v0.53.0`)

`pie: <ReactNode>` se rinde debajo de todas las secciones, **una sola vez**, y
sobrevive al cambio de pestaña.

🔴 Existe por un requisito legal, no por estética: **LibraDesk** lleva ahí la
atribución del set de iconos, cuya licencia ISC pide conservar el aviso de
copyright en las distribuciones — y un producto que se sirve compilado es una
distribución. Sin este slot, migrar esa pantalla al kit **borraría la
atribución**, o la repetiría en cada sección.

### *Probar conexión* del correo, y las condiciones de IVA exportadas (`v0.55.0`)

**El botón de probar el SMTP pasa a estar en los ocho productos.** Vivía en el
`Config.tsx` de Contalibra y de Restolibra —dos de ocho— contra un
`GET /api/email/probar` escrito en cada uno de esos dos; en los otros seis no
existía, así que el correo se configuraba **sin forma de saber si andaba**: el
primer indicio era un comprobante que no llegaba, o un mail de recuperación de
contraseña que nadie recibía.

Ahora `EmailCard` trae el botón y pega en `POST {basePath}/probar`, **el mismo
`basePath` con el que el formulario lee y guarda**. Ese "el mismo" es la razón
de que el botón signifique algo: la falla que Contalibra ya tuvo fue
exactamente la contraria —el endpoint leía `config.json` mientras la pantalla
escribía en la base de libraauth, así que decía *Conectado* contra un servidor
y los mails salían por otro—.

🔴 **El endpoint lo pone el producto**, montando `build_smtp_probe_router` de
`libracore >= v1.69.0` con su propio resolver de SMTP y detrás de su gate de
admin. Sin eso el botón da 404. El router del motor resuelve por `smtp_efectivo`,
que es la misma función que usan el envío de comprobantes, el de presupuestos y
la recuperación de contraseña.

`RUTA_SMTP_POR_DEFECTO` (`/admin/smtp`) se exporta desde `ConfiguracionSmtp`:
es donde seis de los ocho montan el router de libraauth, y el botón y el
formulario tienen que salir del mismo valor.

**Y `CONDICIONES_IVA` se exporta desde `Configuracion`.** Son las tres
condiciones de un **emisor** con el comprobante que emite cada una. Las necesitan
los dos productos que tienen tarjeta de Empresa propia —LibraDesk por el gate
de rol, LibraCargo porque sus datos viven en tabla propia—: sin esto las
escriben a mano, que es exactamente como esos dos terminaron con la condición de
IVA en un campo de texto libre mientras los otros seis la eligen de una lista.

### El ambiente de la credencial de MercadoPago (`v0.54.0`)

La tarjeta de MercadoPago muestra una pastilla que dice **de qué ambiente es el
token cargado**: `Ambiente de prueba`, `Ambiente de producción` o `Ambiente sin
verificar`.

🔴 MercadoPago **no tiene un ambiente de homologación** como ARCA: no hay host
de sandbox, es el mismo `api.mercadopago.com` para los dos y lo que define el
ambiente es el token. Sin el cartel, las dos fallas son mudas y se ven
idénticas — un token de producción en una instancia `dev` **cobra plata de
verdad**, y uno de prueba en la instancia de un cliente **no cobra nada**; en
los dos casos el QR se genera y la orden se crea igual.

La clasificación la hace el motor (`libracore >= v1.65.0`), que devuelve
`mp_ambiente` y `mp_ambiente_verificado` en el `GET`. **Los dos campos son
opcionales**: contra un backend anterior el cartel no aparece, en vez de
afirmar lo que no se sabe. Sin credencial cargada tampoco aparece.

`Probar conexión` es lo que **averigua** el ambiente, así que recarga la
sección al terminar.

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

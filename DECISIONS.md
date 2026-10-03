# Decisiones arquitectónicas — libra-ui

Registro ADR. Las decisiones no se borran; si dejan de aplicar, se marcan como
reemplazadas. Fechas y motivos salen del código y de la historia registrada en el
wiki (entidad `libra-ui` y `concepts/estandares-desarrollo`).

## ADR-001 — Una librería de frontend compartida para las SPAs de la familia

- Estado: aceptada
- Fecha: 2026-07-26
- Contexto: las SPAs de los productos (React + Vite + Tailwind + shadcn)
  duplicaban primitivas, pantallas transversales (login, layout, usuarios, logs,
  configuración) y branding.
- Decisión: extraer una librería compartida (`libra-ui`) con esas piezas; la
  lógica de negocio de cada vertical queda en el producto.
- Consecuencias: las pantallas transversales se mantienen una vez; es el único
  motor de la familia en TypeScript, no en Python.

## ADR-002 — Distribuir como fuente, sin paso de build

- Estado: aceptada
- Fecha: 2026-07-26
- Contexto: publicar un bundle obliga a un pipeline de build y a versiones
  compiladas que se desincronizan del consumidor.
- Decisión: libra-ui no se compila ni publica bundle (sus scripts son `lint`,
  `test`, `typecheck` — no `build`); se distribuye como fuente pineada al tag, y
  el Vite/Tailwind del **consumidor** compila los `.tsx` del motor junto con los
  suyos.
- Consecuencias: no hay artefacto compilado que mantener; a cambio, el consumidor
  debe declarar que Tailwind escanee la fuente del motor (ver ADR-005).

## ADR-003 — Exports por subpath, sin barrel

- Estado: aceptada
- Fecha: 2026-07-26
- Contexto: un `index` que reexporta todo arrastra al consumidor piezas que no usa
  y complica el tree-shaking sobre fuente.
- Decisión: el `package.json` expone cada pieza como su propio punto de entrada
  (`libra-ui/ui/button`, `libra-ui/Usuarios`, `libra-ui/utils`…); el consumidor
  importa exactamente lo que usa y lo reexporta local bajo su alias
  (`export * from "libra-ui/ui/button"`).
- Consecuencias: importaciones explícitas; no hay un barrel que mantener ni que
  infle el bundle del consumidor.

## ADR-004 — El alias `@` resuelve al `src` del consumidor

- Estado: aceptada
- Fecha: 2026-07-26
- Contexto: una primitiva del motor que importa `@/lib/utils` no debe quedar atada
  al `src` del motor si un producto quiere sustituir esa utilidad.
- Decisión: el alias `@` resuelve contra el `src` del **producto** que consume la
  pieza, no contra el del motor.
- Consecuencias: un producto puede sobrescribir una pieza sin forkear el motor;
  a cambio, el motor asume que el consumidor provee esos módulos base.

## ADR-005 — El stack va en `peerDependencies`, y Tailwind escanea la fuente del motor

- Estado: aceptada
- Fecha: 2026-07-26
- Contexto: al consumirse como fuente, las clases Tailwind de los componentes del
  motor no vienen pre-compiladas, y el stack (React, radix, TanStack Table…) no
  debe duplicarse.
- Decisión: declarar el stack como `peerDependencies` (una sola copia, la del
  consumidor) y pedir que el consumidor agregue
  `@source "../node_modules/libra-ui"` para que Tailwind v4 genere las clases del
  motor.
- Consecuencias: sin duplicar dependencias ni CSS; el consumidor tiene que
  declarar el `@source` (si se olvida, faltan clases).

## ADR-006 — Centralizar las 17 primitivas shadcn en `src/ui/`

- Estado: aceptada
- Fecha: 2026-09-03 (`v0.59.0`, E4 de la auditoría)
- Contexto: cada producto tenía su propia copia de las primitivas generadas por el
  CLI de shadcn, que divergían.
- Decisión: mover las 17 primitivas (`button`, `input`, `card`, `table`, `form`,
  `sidebar`, …) a `src/ui/` del motor; los consumidores las reexportan por
  subpath (`libra-ui/ui/<primitiva>`).
- Consecuencias: una sola copia de las primitivas; `vitest` las excluye
  (`exclude: ['src/ui/**']`) por ser componentes de terceros, que se prueban aguas
  abajo.

## ADR-007 — El tema de la suite: variables CSS semánticas y una lista cerrada de colores editables

- Estado: aceptada (decisión del humano, 2026-10-01); fase 1 de 4
- Fecha: 2026-10-01 (`v0.93.0`)
- Contexto: el humano pidió que el color del ítem activo del menú (`#ECFDF5` y borde `#5EE9B5`, que sólo tenía VentaLibra) viva en
  el kit, y que desde el backoffice de cada suite se pueda cambiar «ciertos colores» para todas sus instancias, de modo que cada
  suite tenga su personalidad.
- Decisión: **`libra-ui/tema.css`** declara variables propias (`--libra-menu-activo-fondo`, `--libra-menu-activo-borde`,
  `--libra-menu-activo-texto`) con los valores de siempre como defecto y la regla que las usa; el producto lo importa una vez.
  **`libra-ui/tema`** es la ÚNICA lista de colores editables (`COLORES_DE_TEMA`) y trae `validarTema`, `aplicarTema` y el
  contraste WCAG. Los colores son una lista **cerrada**, no «cualquier variable»; el texto que va sobre un fondo elegido no se
  elige, se calcula (`textoSobre`), y un fondo sobre el que ningún texto llega a 4,5:1 se rechaza. El modo oscuro no tiene
  valores propios: se editan los colores del claro y el texto se recalcula, así el contraste vale en los dos.
- Fases: (1) este kit: variables, catálogo y el ítem activo; (2) endpoint público de tema en `libracore` y carga en el arranque de la
  SPA; (3) pantalla «Apariencia» en `libra-backoffice`, que empuja el tema a todas las instancias de la suite por HTTP (como el
  correo); (4) subir el pin y desplegar los seis productos de a uno.
- Consecuencias: un color nuevo se agrega en `COLORES_DE_TEMA` (y en `tema.css` si es una variable propia) y en ningún otro lugar;
  la instancia, el backoffice y la SPA leen la misma lista. Un producto que no importa `tema.css` no cambia nada.

## ADR-008 — El tema se carga de la propia instancia al arrancar, con caché local y sin poder trabar la app

- Estado: aceptada (decisión del humano, 2026-10-01); fase 2 de 4 del tema por suite (ADR-007)
- Fecha: 2026-10-01 (`v0.94.0`)
- Decisión: `cargarTema()` de `libra-ui/tema` se llama una vez en `main.tsx`, antes de montar React. Aplica **síncrono** lo último guardado en
  `localStorage` (la página se pinta con los colores de la suite desde el primer cuadro) y después pide `GET /api/tema` a la propia
  instancia (ADR-012 de `libracore`), valida, aplica y guarda. Un tema vacío limpia la caché. Va sin credenciales (el login también lleva los
  colores) y con un tope de 3 s.
- **Nunca lanza ni se cuelga:** sin red, con un 500, con un cuerpo roto, sin `localStorage` o pasado el tiempo, queda lo que había y la app
  arranca igual. Un color es un adorno y no puede impedir entrar al sistema.
- Consecuencias: sólo la primerísima visita de un navegador arranca con los colores de siempre, y un cambio hecho en el backoffice se ve en
  el siguiente arranque (no en vivo). El tema se valida de nuevo en el cliente (`validarTema`): lo que llegue mal no se pinta.


## ADR-009 — El catálogo de colores se amplía (acento, barra lateral, éxito, encabezado del POS) y el modo oscuro se enciende

- Estado: aceptada (pedido del humano, 2026-10-02)
- Fecha: 2026-10-02 (`v0.97.0`)
- Contexto: el tema de la suite (ADR-007) sólo permitía cambiar el ítem activo del menú, y los tokens `.dark` que cada producto trae de shadcn
  nunca se usaban porque nada ponía la clase `dark`.
- Decisión: **cinco colores nuevos** en `COLORES_DE_TEMA`: `acento` (`--primary`, más `--ring` y `--sidebar-primary`), `barraLateralFondo`
  (`--sidebar`; el texto, el hover y el borde se derivan), `exito` (`--libra-exito`, expuesto a Tailwind como `bg-exito` / `text-exito`; el kit
  ya no usa `emerald-*` para el éxito) y `posEncabezadoInicio` / `posEncabezadoFin` (la franja del POS, clase `.libra-pos-encabezado`).
  **El acento y la barra lateral no tienen defecto en el kit** (`defectoPorProducto`): cada producto declara el suyo en su `index.css` y
  `aplicarTema` sólo lo pisa si se elige uno. Un color de superficie calcula su texto; uno que se usa como texto o ícono sobre la página
  (`legibleSobrePagina`) tiene que distinguirse del fondo claro **y** del oscuro (3:1), así el mismo valor sirve en los dos modos. El texto
  de un botón o franja de color es blanco mientras llegue al mínimo (`prefiereBlanco`): el defecto de siempre no cambia.
- **Modo oscuro** (`libra-ui/modo`): `claro` | `oscuro` | `sistema`, por navegador (`localStorage`), con el defecto **claro** (nadie ve un
  cambio hasta que lo elige). `cargarTema` lo aplica antes de montar React y el `Layout` ofrece el selector en el menú del usuario. Los
  colores del tema valen igual en los dos modos; sólo cambian los tokens neutros de cada producto.
- Consecuencias: un acento casi negro o casi blanco se rechaza (se perdería en uno de los modos). Los colores sin consumidor en un producto
  (el POS sólo existe en VentaLibra) se guardan y no tienen efecto ahí. Los verdes que son una *categoría* (agenda, tarjeta de crédito,
  «login» en los logs) no son éxito y quedan como estaban.
- **`0.99.1` (hallazgos de Codex sobre ADR-009):** el par inicio/fin de la franja del POS se valida aunque falte uno (se compara con el valor de siempre), y un fondo de barra lateral se rechaza si el texto pierde el contraste sobre el color de hover derivado.
- **`0.101.0` (el humano avisó que no veía el selector; la `0.100.0` es de otra sesión):** el modo vivía dos clics adentro del menú del usuario. Ahora hay además un **botón suelto sol/luna** junto al nombre de usuario, en el pie de la barra lateral, que alterna claro / oscuro con un clic (con test). El menú sigue ofreciendo las tres opciones, incluida «igual que el sistema».
- **`0.104.0` (pasada visual en modo oscuro, 2026-10-02):** medido en un Chromium real (contraste de cada texto contra su fondo efectivo, en las pantallas que renderizan sin datos) apareció que `text-exito` en oscuro bajaba a 4,28:1 sobre un tinte de éxito, por usar un solo color para los dos modos (antes, con `emerald-400` en oscuro, estaba muy por encima). Ahora el éxito usado como **texto** tiene una variante por modo (`--libra-exito-como-texto-claro` / `-oscuro`, ajustadas por `ajustarContraste` a 4,5:1 contra el fondo de cada modo y reglas `.text-exito` / `.dark .text-exito` en `tema.css`); el color pleno sigue siendo el de `bg-exito` y los bordes. Los defectos por defecto son `emerald-700` y `emerald-400`.
- **`0.104.1` (error propio, corregido):** los commits de `0.97.0`, `0.100.0`/`0.101.0` y `0.104.0` incluyeron por accidente un symlink `node_modules` (a una ruta absoluta del equipo de desarrollo) porque el `.gitignore` sólo ignoraba `node_modules/` con barra. Se saca del índice y se ignora sin barra. Los consumidores instalaban igual (npm ignora ese archivo al empaquetar la dependencia git), pero no debía estar.

## ADR-010 — Mínimo por sucursal: se edita en el formulario del producto, sólo al editar, y se guarda por sucursal

- Estado: aceptada (pedido del humano, 2026-10-03)
- Fecha: 2026-10-03 (`v0.108.0`)
- Contexto: la reposición sugerida usa un único `stock_minimo` por producto, pero cada sucursal necesita el suyo. El motor (libracommerce, ADR-024) lo
  resuelve: `GET /api/productos/{id}/reposicion/minimos` devuelve `{ producto_id, sucursales: [{ sucursal_id, sucursal, stock_minimo, stock_minimo_propio,
  stock_minimo_global }] }` (una fila por sucursal activa). **`stock_minimo` es el EFECTIVO** (el propio si la sucursal lo tiene, si no el global) y
  `stock_minimo_propio` dice cuál de los dos es; el global sale de cada fila (`stock_minimo_global`, igual en todas), no de la raíz. `PUT .../minimos/{sucursal_id}`
  con `{ stock_minimo: número | null }` (`null` borra el propio y vuelve al global; `0` es válido) responde lo mismo que el `GET`. Errores: 404 producto, 422 valor
  o sucursal inválidos o mínimo mayor que el techo del producto, 503 sin la migración 0005. `fijar_parametros` rechaza además un techo menor que algún mínimo por
  sucursal. En cada fila de `/api/reportes/reposicion`, `stock_minimo` ya viene resuelto y `stock_minimo_propio` dice si es el de la sucursal elegida.
- Decisión: en el formulario del producto, dentro de lo que enciende `conParametrosDeReposicion` (la misma capacidad `reposicion.parametros` que el plazo
  y el techo; no hay prop nueva), una sección **«Mínimo por sucursal»** con una fila por sucursal y el global como ayuda («Vacío = usa el global: N»,
  que sigue al «Stock mínimo» del formulario; si ese campo no es un número, el `stock_minimo_global` que leyó el motor). Detalles que son decisión y no accidente:
  - **Sólo es valor propio lo que dice `stock_minimo_propio: true`.** Con `false`, el `stock_minimo` de la fila es el global ya resuelto: el campo va vacío (el
    global es el placeholder), nunca se muestra como si fuera de la sucursal y, si no se toca, no genera ningún `PUT` (si no, guardar sin cambios convertiría el
    global en un «propio» de cada sucursal). El parseo tolera también la lista de sucursales sola, sin el objeto.
  - **Sólo al editar.** El alta no tiene id todavía; los mínimos se cargan en una edición posterior. Un motor sin la función (el `GET` da 404, 405 o 503 por
    falta de la migración) no muestra nada; cualquier otro error de lectura se dice y no se manda nada (no se pisa lo que no se vio).
  - **Con menos de dos sucursales la sección no se ofrece:** con una sola, el mínimo de la sucursal y el global serían lo mismo.
  - **Vacío es `null`, nunca 0** (lección de `0.100.0`). Un `0` escrito es un mínimo propio de 0. Se acepta un número decimal no negativo y finito
    (coma o punto); texto, negativos, notación científica o algo que desborda a `Infinity` se rechazan antes de escribir nada.
  - **Un `PUT` por sucursal y sólo las que cambiaron**, junto con el producto y la reposición. Los mínimos se guardan **sin depender del producto
    completo**: como el plazo y el techo, si sólo cambiaron ellos el producto no se vuelve a guardar, así que el rol depósito (sin `costos.ver`, el producto
    llega sin `precio_costo`) puede guardarlos. Si además toca algo del producto, no se guarda nada (el 0 de relleno pisaría el costo real).
  - **Orden de escritura:** el motor valida cada pedido contra lo ya guardado (mínimo <= techo y techo >= todos los mínimos). Si el techo baja (o aparece), los
    mínimos se escriben antes que la reposición; si no, la reposición va primero. Los errores 422 del motor (el del `PUT` de un mínimo o el de un techo que
    choca con un mínimo) se muestran tal cual, el primero con el nombre de la sucursal.
  - **Se valida todo antes de escribir nada.** Cada mínimo (de TODAS las filas, no sólo las que cambiaron) tiene que ser <= 1.000.000.000 (el tope del motor) y
    no pasar del stock máximo **final** del guardado (el del formulario, lo haya tocado o no; si no se pudo leer la reposición, esa comparación la hace el motor):
    con techo 40, Centro 5 y Norte 50 no se guarda Centro para fallar en Norte. El mensaje nombra la sucursal.
  - **No se guarda mientras se leen los mínimos** (igual que la reposición): el botón «Guardar» espera a que el `GET` termine (o falle, o no aplique). Si no, bajar
    el techo por debajo de un mínimo propio que todavía no llegó guardaría el producto y recién después recibiría el 422.
  - **Los números se cargan como decimal, sin notación científica** (`1e-7` se ve «0.0000001»; el motor lo acepta y la validación del campo no admite la `e`).
    Si el decimal no representa el mismo número (1e-21 a 20 decimales sería «0»), el campo muestra el texto de siempre («1e-21»): nunca un valor distinto del guardado.
  - **«Cambió» es que cambió el TEXTO del campo** respecto del texto con el que se cargó: una fila sin tocar no se vuelve a parsear ni a redondear y nunca se reescribe,
    aunque su valor no sea representable en el campo; sólo lo que el usuario editó se parsea (y se valida contra el tope de 1.000.000.000). Una fila sin tocar igual
    cuenta contra el techo final con su valor guardado.
  - **Un guardado pertenece a su diálogo.** Las respuestas que vuelven de la red sólo tocan el estado (originales, errores, cierre del diálogo) si el diálogo
    sigue siendo el mismo (la numeración que ya protege las lecturas): si se cierra y se abre otro producto mientras se guarda, la respuesta tardía no lo pisa ni lo cierra.
    Y mientras se guarda, los campos de reposición (plazo, techo, proveedor) y de mínimos quedan deshabilitados: lo escrito durante el guardado no se pierde
    ni se compara contra una base que ya cambió.
  - **Fallo parcial:** lo que ya quedó guardado (plazo/techo, sucursales anteriores) pasa a ser la base de comparación, así que el reintento sigue por las
    que faltan, y el mensaje dice cuál sucursal falló y si el producto se guardó.
  - **`Reposicion.tsx`:** con una sucursal elegida, si la fila trae `stock_minimo_propio: true` la celda del mínimo agrega el texto «propio de la sucursal»
    (con texto, no sólo color). Sin sucursal o sin la clave (motor anterior) no hay marca.
- Consecuencias: el motor sigue siendo la autoridad de la validación mínimo/techo (el kit la repite para no dejar un guardado a medias, y muestra el 422 tal cual si igual falla). Los mínimos no viajan en la lista de productos: se leen al abrir la edición.

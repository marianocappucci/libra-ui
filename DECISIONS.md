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
  - **Fallo parcial:** lo que ya quedó guardado (plazo/techo, sucursales anteriores) pasa a ser la base de comparación (el número y el texto de cada fila: si el
    usuario devuelve una sucursal ya guardada a su valor viejo, eso es un cambio y se vuelve a mandar), así que el reintento sigue por las
    que faltan, y el mensaje dice cuál sucursal falló y si el producto se guardó.
  - **`Reposicion.tsx`:** con una sucursal elegida, si la fila trae `stock_minimo_propio: true` la celda del mínimo agrega el texto «propio de la sucursal»
    (con texto, no sólo color). Sin sucursal o sin la clave (motor anterior) no hay marca.
- Consecuencias: el motor sigue siendo la autoridad de la validación mínimo/techo (el kit la repite para no dejar un guardado a medias, y muestra el 422 tal cual si igual falla). Los mínimos no viajan en la lista de productos: se leen al abrir la edición.

## ADR-011 — Reposición: «Descontar lo que vence en el horizonte» es un interruptor del motor, con su columna «Por vencer», y viaja en la consulta, el CSV y las órdenes

- Estado: aceptada (pedido del humano, 2026-10-03)
- Fecha: 2026-10-03 (`v0.109.0`)
- Contexto: la reposición ya no cuenta como stock lo que está en lotes vencidos (`vencido`, motor 0.31.0), pero un lote que vence dentro del horizonte (días de cobertura más
  plazo de entrega) y no alcanza a venderse antes de vencer también es mercadería que no va a estar para vender, y hoy se la toma como si sobrara. El motor (libracommerce >= 0.37.0,
  ADR-025) lo resuelve: `GET /api/reportes/reposicion` (y su export CSV) acepta `descontar_por_vencer=true|false` (apagado por defecto), responde con el eco `descontar_por_vencer: boolean`
  y cada fila trae `por_vencer: number` (0 con la opción apagada). El motor ya resta `por_vencer` del stock utilizable: `stock` sigue siendo el real y `vencido` lo ya vencido;
  `por_vencer` es aparte. El CSV agrega la columna `por_vencer` al final. `POST /api/reportes/reposicion/ordenes` acepta el mismo `descontar_por_vencer`.
- Decisión: el mismo patrón que la estacionalidad (0.107.0), sin prop nueva.
  - **Interruptor «Descontar lo que vence en el horizonte»**, apagado por defecto, con la ayuda visible «Lo que no se alcanza a vender antes de vencer no cuenta como stock.» (enlazada con
    `aria-describedby`; el nombre accesible del interruptor es sólo su rótulo). **Se ofrece sólo si el motor lo maneja:** la respuesta trae la clave `descontar_por_vencer` y, una vez vista,
    se recuerda aunque una consulta posterior falle o venga vacía. No depende de ninguna prop de versión del motor (`conGenerarOrdenes` es de otra cosa: de un endpoint de escritura y de
    un permiso, que la pantalla no puede saber desde los datos): la señal es la clave misma, como en la estacionalidad y el proveedor.
  - **El valor viaja en tres lugares y siempre el que está en pantalla:** la consulta (`descontar_por_vencer=true` sólo si está prendido; apagado no se manda y el motor cae en su defecto),
    el enlace del CSV (es la misma consulta) y los parámetros de las órdenes en borrador (`ParametrosDeOrdenes.descontar_por_vencer`, que se guarda con el intento pendiente y se reenvía
    tal cual). Conviven con `estacionalidad`: se mandan los dos si están prendidos.
  - **Columna «Por vencer»**, sólo cuando la respuesta es de una consulta con la opción prendida (`descontar_por_vencer === true`) **y** las filas traen `por_vencer`. Va pegada al
    «Stock» (es lo que se le descuenta). Con texto: la cantidad y, debajo, «no cuenta como stock»; sin nada por vencer (0, o la fila sin la clave) un guion, no un 0. A diferencia de
    «Vencido» (un aviso dentro de la celda del stock que se omite cuando es 0), esto es una columna entera con su orden, así que una celda vacía no sería legible: guion. El «Stock» no se
    toca (sigue siendo el real). La explicación de la pantalla suma, sólo con la opción prendida, que tampoco cuenta lo que vence dentro del horizonte (con los días).
  - **Ordenable** como las demás numéricas (la primera vez de mayor a menor); una fila sin `por_vencer` va siempre al final. **Apagar el interruptor limpia un orden por esa columna**
    (hallazgo de Codex sobre la estacionalidad): la columna desaparece y un orden por ella quedaría activo, sin flecha y sin que se vea. Un orden por otra columna no se toca.
  - **Tolerante con un motor anterior:** sin la clave `descontar_por_vencer` no hay interruptor ni columna, y la pantalla es la de siempre. Un motor que contesta el eco pero no manda
    `por_vencer` en las filas no muestra columna y no se rompe.
- Consecuencias: el cálculo (qué lotes cuentan, qué se alcanza a vender) es del motor; la pantalla no lo repite ni resta nada. Al encender o apagar la opción la lista se pide de nuevo
  (cambia la consulta). **Un hallazgo que no se corrige acá:** el test de la estacionalidad «apagar el ajuste … limpia ese orden» arranca con el interruptor ya «prendido» sólo en
  la respuesta simulada pero apagado en el estado de la pantalla, así que su primer clic en realidad lo enciende y el orden se limpia recién en el segundo; el de «Por vencer» prende de
  verdad antes de ordenar. No se tocó la estacionalidad por no ampliar el alcance.

## ADR-012 — Reposición y producto: el error del formulario se ve, la tabla entra con las dos columnas opcionales y las notas largas se acortan

- Estado: aceptada (hallazgos de una verificación de VentaLibra con Chromium real, 2026-10-03)
- Fecha: 2026-10-03 (`v0.110.0`)
- Contexto: los tests de jsdom no miden layout; una pasada con Chromium real sobre las pantallas de reposición (ADR-010, ADR-011) y del formulario del producto encontró cuatro defectos:
  1. **El error del formulario del producto quedaba fuera de pantalla.** El diálogo scrollea y el mensaje es el primer hijo del formulario: con el foco abajo, en un celular el
     mensaje quedaba con `top = -309 px` (a 390 px) y quien miraba el campo de «Mínimo por sucursal» creía que «Guardar» no había hecho nada.
  2. **Con «Ajustar por estacionalidad» y «Descontar lo que vence en el horizonte» prendidos la tabla medía 1211 px contra 1134 del contenedor a 1440 px:** scroll horizontal, y
     «Sugerido» (una de las columnas que importa) se cortaba («4 U»).
  3. **La barra de interruptores:** `pt-8` en uno y `pt-7` en los otros dos desalineaban los checkboxes (4 y 10 px), el rótulo del tercero se partía en dos líneas por `max-w-56`, a >= 1920 px el
     primero quedaba solo al final de la fila de arriba y los otros saltaban, y a 390 px el relleno metía ~50 px de aire entre cada uno.
  4. **Notas largas en celdas angostas** que se apilaban en 3 a 7 líneas: la píldora «Posible quiebre: la rotación puede estar subestimada» (5 líneas, con el texto pisando el borde),
     «no cuenta como stock» (4 líneas), «incluye N de órdenes sin sucursal, contadas en esta sucursal» (6-7) y «propio de la sucursal» (3).
- Decisión:
  - **El error del formulario es un `role="alert"` con `tabIndex={-1}`; al aparecer recibe el foco y se lo lleva a la vista** (`scrollIntoView({ block: 'center' })`, con `?.`: lo que no lo
    implementa no se rompe). El estado del error es un objeto nuevo en cada fallo (`formFallo`), no un texto: repetir el mismo error (el texto no cambia) vuelve a llevarlo a la vista.
    El foco en el mensaje (y no en el campo) es a propósito: el motivo puede venir del motor y no de un campo, y un `alert` con foco lo lee el lector de pantalla entero.
  - **El campo que causó el error se marca** con `aria-invalid` y `aria-describedby` hacia el mensaje: los mínimos por sucursal (la sucursal del error de validación y la del 422 del `PUT`),
    el plazo y el stock máximo. Un error sin campo (el del costo oculto, uno del producto) no marca ninguno. La marca se limpia al volver a guardar (junto con el mensaje).
  - **Los tres interruptores son un solo bloque** (`flex flex-wrap items-start gap-x-6 gap-y-2`) hijo de la barra de filtros: salta de línea entero, y adentro cada rótulo mide `h-9` (la altura de
    un campo) y no se parte (`whitespace-nowrap`). Un rótulo invisible arriba (`aria-hidden`, sólo desde `sm`) hace de la fila de rótulos de los campos, así quedan en la línea de los campos
    cuando comparten fila, sin paddings fijos. La ayuda del tercero (`aria-describedby`, sin cambios) cuelga debajo con un ancho máximo `max-w-xs`, que ya no limita al rótulo.
  - **La tabla gana ancho con un relleno lateral de 6 px (`px-1.5`) en lugar de 12** (constante `PAD`; son ~150 px con 13 columnas), y «Código» no se parte (`ACEITE-` / `9`). **«Sugerido» es
    `sticky right-0 bg-card`** (encabezado y celdas): si igual hay que desplazar la tabla (pantalla angosta, o sucursal con avisos), queda a la vista. El orden y los nombres de las columnas y el
    comportamiento de orden no cambian. Se eligió esto antes que reducir texto: no pierde información y no depende del ancho de los datos.
  - **Las notas largas se ven cortas y completas a la vez** con un componente local, `Nota`: la forma corta a la vista, sin partirse; el texto completo en el `title` (al pasar el mouse) y en el
    DOM como `sr-only` (lo lee el lector de pantalla; el `textContent` sigue teniendo el texto completo). Si el completo empieza con el corto («no cuenta» / «no cuenta como stock») sólo se oculta lo que sobra;
    si no («+4 sin sucursal»), se oculta a los lectores el corto y se lee el completo. Formas: «Posible quiebre», «Sin ventas», «no cuenta», «+N sin sucursal», «propio» y, por ser el mismo
    patrón, «incl. N vencido» en el stock (ese aviso también se apilaba en 4-5 líneas). `Nota` es `relative`: un `sr-only` es `absolute` y, sin un ancestro posicionado, se escapa del
    `overflow-x-auto` de la tabla y agranda el scroll horizontal de toda la página (medido: 390 -> 551 px mientras no tuvo `relative`).
- Consecuencias:
  - Un test existente cambia con criterio: el de «propio de la sucursal» buscaba el texto por `getByText` (que mira el texto propio del elemento y ahora es «propio»); ahora lo busca por `getByTitle`.
    Su comprobación del `textContent` de la celda (`5propio de la sucursal`) no cambió.
  - **Medido** (Chromium real, pantalla real de libra-ui con `fetch` simulado y el marco del `Layout`, no VentaLibra completa): a 1440 px con las dos columnas opcionales la tabla pasó de 1237 px
    (1211 en la verificación original) a 1134 = el contenedor, sin scroll horizontal; los tres checkboxes quedan a la misma `y` a 1280, 1440 y 1920 px y apilados a 390 px; con una sucursal elegida y
    una fila con «+N sin sucursal» la tabla sigue 7 px más ancha que el contenedor (sólo se corta el final de «Motivo»; «Sugerido» está a la vista por ser `sticky`). A 1280 px la tabla (1100 px) no
    entra en el contenedor (974 px) y se desplaza; «Sugerido» queda pegado.
  - En 390 px «Sugerido» pegado ocupa ~75 de los ~356 px de la tabla y tapa lo que pasa por debajo mientras se desplaza: es el costo de tenerlo siempre a la vista.
  - **Sin resolver** (no se tocó): «Por vencer» muestra la cantidad con los decimales que manda el motor (`23,572` sobre una unidad entera). La fila no trae la escala de la unidad; deducirla de los
    decimales de «Stock» o «Sugerido» (que pueden ser enteros en una unidad que admite fracciones) redondearía un dato real. Si el motor ya redondea a la escala de la unidad, el defecto es suyo.

## ADR-013 — Productos según el rol: `conAlta`, `conEdicionDelProducto`, 401/403 en castellano y dos cosméticos de móvil

- Estado: aceptada (hallazgos de la verificación de VentaLibra con Chromium real y el rol depósito, 2026-10-03)
- Fecha: 2026-10-03 (`v0.111.0`)
- Contexto: el rol depósito de VentaLibra no tiene `productos.escribir` ni `costos.ver` pero sí decide la reposición. La pantalla de Productos le mostraba lo que no podía usar:
  1. **«Nuevo producto» se ofrecía a quien no puede crear:** el `POST` daba 403 y el diálogo mostraba el `detail` crudo, «forbidden».
  2. **El formulario completo se ofrecía a quien sólo puede reponer:** nombre, precios, etc. editables; recién al guardar el kit lo frenaba con «Tu rol no ve el costo de este producto…».
  3. **Un 401/403 se mostraba tal como lo manda el backend** (`forbidden`, `not authenticated`: inglés pelado, sin decir qué hacer).
  4. **Dos cosméticos a 390 px:** el encabezado de la lista de la **Reposición sugerida** (no de Productos) partía «1 producto» en dos líneas, con el icono descentrado y el resumen en otra columna; y el rótulo
     «Vence (maneja lotes y fecha de vencimiento)» del diálogo de producto tenía las dos líneas pegadas.
- Decisión:
  - **`conAlta` (por defecto `true`)**: con `false` no se dibuja el botón «Nuevo producto», que es el único punto de alta de la pantalla (el `Dialog` sigue montado: lo usa la edición). Las
    `acciones` del producto son suyas y no se tocan; «Gestionar códigos y variantes» (`conDetalle`) tampoco: agrega códigos y variantes a un producto que ya existe y lo apaga quien lo monta.
  - **`conEdicionDelProducto` (por defecto `true`)**: con `false`, **al editar**, los campos del producto (nombre, código, categoría, unidad, tipo, estación, precios, stock mínimo, descripción y los
    interruptores «Vendible», «Vence» y «Producto activo») van `disabled` (el estilo de deshabilitado del kit: `disabled:opacity-50`, sin `readOnly` propio) y una nota visible, «Tu rol sólo puede cargar
    la reposición de este producto.», dice por qué. Siguen editables las secciones de reposición (plazo, stock máximo, proveedor habitual y mínimos por sucursal), que dependen de `conParametrosDeReposicion`.
    **El guardado reusa la rama que ya existía** (`productoSinCambios`: no se hace `PUT /api/productos/{id}`, sólo la reposición); con la prop apagada esa rama vale siempre, porque los campos no se pueden
    cambiar. La regla vigente no cambia: sin ver el costo el producto no se re-guarda. Si no hay nada que escribir, «Guardar cambios» cierra sin pedir nada. Sin `conParametrosDeReposicion` no queda
    nada editable y el diálogo no ofrece «Guardar cambios» (sólo «Cancelar»). **El alta no cambia** (`conAlta` es lo que la apaga): el formulario de «Nuevo producto» es siempre editable, y si el alta
    falla en la reposición y el diálogo pasa a editar el producto recién creado, ese segundo paso ya es de sólo lectura y reintenta sólo la reposición.
  - **401/403 en castellano, en el único `describeError` de la pantalla** (el que usan el guardado del diálogo, el listado y «Eliminar»): 403 = «No tenés permiso para hacer esto.»; 401 = «Tu sesión venció.
    Volvé a iniciar sesión.». Se reemplaza sólo el `detail` **genérico**, por una **lista explícita y cerrada** (`DETALLES_GENERICOS`)
    comparada normalizada (minúsculas, espacios de más y punto final fuera): `forbidden` (403) y `not authenticated` (401) son los de `libraauth` (`session_auth.py`) y los de FastAPI por
    defecto; se suman `unauthorized`, `not enough permissions`, `could not validate credentials`, `operation not permitted`, `permission denied` y `access denied`. Un `detail` vacío
    (un 401/403 sin cuerpo) también cuenta como genérico. **Todo lo demás se muestra tal cual**, en castellano o no, porque lo dijo el backend a propósito: un permiso puntual («No tenés permiso
    para marcar o desmarcar productos que vencen.», que un test existente exige), «Acceso denegado», «Credenciales incorrectas», el objeto con `mensaje` (los Términos pendientes, que distingue «faltan
    permisos» de «falta aceptar el contrato») y cualquier otro status. **«No permissions» no está en la lista a propósito:** no es un genérico conocido de la familia, y agregar frases a ojo es lo
    que hacía fallar a la primera versión (una heurística «¿está en castellano?» que reemplazaba «Acceso denegado» y dejaba pasar inglés). Si aparece un genérico nuevo, se agrega a la lista con su test.
  - **Encabezado de la Reposición:** el título tenía como hijos directos del `flex` el icono, el número, la palabra «producto» y el resumen: cada pedazo de texto era una columna. Ahora son dos hijos:
    «icono + N producto(s)» (`whitespace-nowrap`) y el resumen (`leading-snug`), con `flex-wrap`: el resumen baja entero a la línea de abajo en vez de apretarse al lado.
  - **Rótulo «Vence»:** `leading-snug` sobre el `leading-none` del `Label` del kit (que es para rótulos de una línea).
  - **El foco vuelve a la fila al cerrar la edición** (hallazgo de la revisión de Codex). El diálogo de edición se abre por el `onClick` del botón de la fila y Radix devuelve el foco al `DialogTrigger`:
    con `conAlta={false}` no hay ninguno y el foco se perdía (y con `conAlta` volvía a «Nuevo producto», que no abrió nada). `DialogContent` ahora tiene `onCloseAutoFocus`: si el diálogo lo abrió una fila,
    se hace `preventDefault()` y el foco va al botón que lo abrió; si ese botón ya no está (el guardado recarga la tabla: «Cargando…» y botones nuevos), al botón del **mismo producto** (`data-editar-producto`);
    si la tabla todavía se está recargando, a «Nuevo producto» (si existe) o al contenedor de la tabla (`tabIndex={-1}`) y, cuando la tabla vuelve, al botón de ese producto (sólo si el foco sigue en esa reserva
    o en ningún lado: no se lo roba a quien ya fue a otra parte). Si el producto ya no está, queda en la reserva. El alta no cambia: la maneja Radix con su trigger.
- Consecuencias:
  - Los productos que no pasan las props nuevas no cambian (los tests existentes del depósito sin `conEdicionDelProducto` pasan sin tocarse).
  - **No verificado en navegador** (jsdom no mide layout ni pinta): los dos cosméticos se probaron por la estructura de clases; hay que mirarlos con Chromium a 390 px. Un `disabled` en el `Select` de Radix
    se probó por el atributo del disparador, no abriéndolo.
  - **`conEdicionDelProducto={false}` solo NO impide crear:** para que el usuario no pueda crear NI editar el producto hay que pasar **las dos**, `conAlta={false}` y `conEdicionDelProducto={false}`.
  - **Cómo se verificó el layout:** a 390 px sólo **por clases** (`whitespace-nowrap`, `flex-wrap`, `leading-snug`; los tests están rotulados «estructural»): jsdom no mide ni pinta, y el stub de `Select` sólo
    reenvía `disabled`. Hay que mirarlo a ojo con Chromium en la verificación del navegador. El foco se probó con el Dialog **real** de Radix (`comercio-productos-foco.test.tsx`), no con el stub.
  - Quien monta la pantalla decide las dos props desde la sesión (`productos.escribir`); el servidor sigue siendo quien autoriza (un 403 igual se dice bien).

## ADR-014 — Códigos y variantes en castellano y de sólo lectura según el rol; el alta arranca con una unidad que existe

- Estado: aceptada (hallazgos de la verificación de VentaLibra con Chromium real y el rol depósito, 2026-10-04; ajusta ADR-013)
- Fecha: 2026-10-04 (`v0.112.0`)
- Contexto: la misma pasada que dio ADR-013 encontró tres defectos más (las capturas A11 y B05) y dos observaciones menores (C11/C12, el contraste de los campos de sólo lectura):
  1. **El diálogo «Gestionar códigos y variantes» mostraba el 403 crudo («forbidden»):** tenía su propio `describeError` que devolvía `err.detail`; el traductor de ADR-013 vivía sólo dentro de `Productos`.
  2. **Ese diálogo dejaba agregar códigos y variantes a quien no puede** (el depósito): el `POST` daba 403. ADR-013 lo había dejado a cargo de quien monta la pantalla (`conDetalle`), pero sin `productos.escribir`
     todo lo que hace el diálogo falla.
  3. **El alta fallaba con el formulario sin tocar:** arrancaba con `unidad: 'u'`. VentaLibra no tiene `'u'` (sólo las unidades que se crean, p. ej. `UN`): el select mostraba «u» como si fuera válida y el `POST`
     daba 422 «unidad desconocida: 'u'».
- Decisión:
  - **Un solo traductor de errores, `describeErrorHttp` en `src/comercio/errores-http.ts`** (con `esDetalleGenerico` y la lista explícita `DETALLES_GENERICOS` que antes estaban dentro de `Productos`). Mismo
    comportamiento que ADR-013, sin cambios: 403 genérico = «No tenés permiso para hacer esto.», 401 genérico = «Tu sesión venció. Volvé a iniciar sesión.», todo lo demás (un `detail` propio, el objeto con
    `mensaje`, otros status) tal cual, y lo que no es un `ApiError` = «Error de conexión.». Lo usan `Productos` y `ProductoCodigosVariantes`. **No se tocó `src/api-client.ts`** (~75 pantallas); el resto de
    `src/comercio/` que muestra `err.detail` (Stock, Compras, Ventas, Depositos, Clientes, Vencimientos…) **no** guarda productos y queda como estaba: si alguno quiere el castellano, importa el helper.
  - **`ProductoCodigosVariantes` acepta `conEdicionDelProducto` (por defecto `true`)**, que `Productos` le pasa. Con `false` la lista de códigos y variantes se sigue viendo, **no se dibuja ningún formulario de
    alta** (ni los campos ni los dos «Agregar») y una nota dice «Tu rol sólo puede ver los códigos y variantes de este producto.». El diálogo hoy sólo agrega (no hay «Eliminar» ni «Marcar principal»): si se
    suman, también quedan detrás de esta prop. Esto **reemplaza** la frase de ADR-013 de que `conDetalle` no se toca: quien no pasa `conEdicionDelProducto` no cambia.
  - **La unidad del alta sale del catálogo de la instalación** (`GET /api/productos/unidades`, sin cambiar el contrato): arranca con `'u'` si el catálogo la tiene (Contalibra y Restolibra no cambian) y, si no, con
    la **primera unidad real** (`unidadPorDefecto`). `EMPTY_VALUES.unidad` es `''`; la unidad se completa al abrir el alta y, si el catálogo llega con el alta ya abierta y nadie eligió, se completa sola
    (un efecto). **Catálogo vacío o todavía sin leer: no se inventa nada**: el campo queda vacío y «Crear producto» dice «Elegí una unidad.» (el esquema exige una) en lugar de mandar `'u'`.
    El select ofrece sólo las unidades del catálogo, **salvo al editar un producto que tiene otra**: esa se conserva y se agrega a las opciones (guardarlo no se la cambia). Si el producto no tiene unidad,
    arranca con la del catálogo.
  - **Qué cambió del respaldo:** antes, mientras el catálogo no se leía, el select ya ofrecía la lista de siempre (`UNIDADES`); ahora no ofrece ninguna hasta leerlo, y una lista **vacía** del backend ya no cae
    a `UNIDADES` (es un catálogo vacío de verdad). Si el backend **no contesta** (no tiene el endpoint: 404, red caída), sí queda `UNIDADES` como respaldo, como antes.
  - **El campo con error se ve junto con su mensaje** (observación a 390 px, capturas C11 y C12: el alert de arriba tomaba el foco y el scroll y el campo culpable —el mínimo de una sucursal, el plazo o
    el techo— quedaba en el borde inferior de la pantalla, top 835 / bottom 871 con 844 de alto). Se eligió **repetir el mensaje en línea debajo del campo culpable** y llevar a la vista **el campo**, no el
    alert: es lo más simple (sin medir alturas ni scrollear dos veces: centrar dos elementos lejanos entre sí no entra en una pantalla de celular) y lo más accesible. El `alert` de arriba **conserva el rol,
    el foco y el texto** (`focus({ preventScroll: true })`); el texto en línea (`data-error-del-campo`) no tiene `role`, va `aria-hidden` y es lo que el campo señala con `aria-describedby` (una descripción
    referenciada se lee igual aunque esté oculta): el lector de pantalla anuncia el error una vez, al enfocarse el alert, y lo repite como descripción sólo al llegar al campo. Un error **sin campo
    culpable** (el producto no se guardó) sigue llevando el alert a la vista, sin texto en línea. **Cambio visible para los tests:** el texto del error ahora está dos veces en el DOM (alert y
    en línea): los tests que lo buscan por texto lo hacen dentro del `role="alert"`.
  - **Campos de sólo lectura por rol legibles** (`conEdicionDelProducto={false}`, sólo ese caso; el estilo global de `disabled` del kit no se toca): el `disabled:opacity-50` dejaba el texto en ~3,7:1.
    Los campos del producto (`Input` y disparadores de `Select`) llevan `disabled:opacity-100 disabled:bg-muted disabled:text-foreground/75` (y `dark:disabled:bg-muted`): texto atenuado pero legible
    sobre un fondo lleno que dice «no se edita» (más el `cursor-not-allowed` del kit). **El contraste se estimó por colores computados, no medido en pantalla:** con los colores por defecto de shadcn
    (neutral) el `opacity-50` da 3,74:1 en claro (coincide con lo medido) y el nuevo texto sobre `muted` da ~8,8:1 en claro y ~8,8:1 en oscuro. Si el producto cambia los tokens `--foreground` o `--muted`
    hay que recalcularlo. Los interruptores («Vendible», «Vence», «Producto activo») **no se tocaron** (no llevan texto: su rótulo no se atenúa).
- Consecuencias:
  - Los productos que no pasan `conEdicionDelProducto` no cambian; las instalaciones con `'u'` en el catálogo (o sin el endpoint) arrancan igual que antes.
  - Un producto sin unidad en una instalación con catálogo vacío no puede guardarse hasta que se cree una unidad (el esquema pide una): es un dato incompleto que antes habría fallado con el 422 del motor.
  - **Para el depósito de VentaLibra** el diálogo de códigos queda de sólo lectura sin tocar nada más que pasar `conEdicionDelProducto={false}` (ya lo pasa para el formulario).
  - **Tests estructurales (jsdom no pinta ni mide):** el scroll al campo y el texto en línea se prueban por el DOM y `scrollIntoView` espiado; las clases de sólo lectura, por `className` (el stub del `Select`
    no reenvía el `className` del disparador: unidad, tipo y estación no se comprueban). El contraste y que el campo entre en pantalla a 390 px hay que mirarlos con Chromium.
  - **No verificado en navegador:** los tests usan el stub del `Select` (un `<select>` nativo, que muestra la primera opción aunque el formulario no tenga valor: por eso se comprueba lo que se **manda**) y el
    `Dialog` stub; el placeholder «Elegir…» del `SelectValue` con la unidad vacía y la nota de sólo lectura hay que mirarlos con Chromium (capturas A11 y B05 como referencia).

## ADR-015 — `VentaDetalle` avisa cuando la factura tiene CAE y ofrece la nota de crédito (0.113.0)

**Contexto:** desde `libracommerce` v0.41.0 (ADR-032) anular una venta cuya factura tiene CAE de ARCA contesta `409` hasta que se emite la nota de crédito del motor (`libracore` v1.129.0). Sin pantalla, la persona se encontraba con un error y ningún camino.

- Decisión 1 — `Venta` suma `factura_cae` (lo trae `obtener_venta`). Con CAE y la venta cobrada, el detalle muestra un **aviso** (`role="note"`): la factura la emitió ARCA y hace falta la nota antes de anular.
- Decisión 2 — nuevo botón **«Emitir nota de crédito»**, con confirmación, que pide `POST /api/facturas/{id}/nota-credito` (la ruta es la misma en todos los productos; `rutaDeNotaDeCredito` la cambia). Sólo se ofrece con la prop **`puedeEmitirNota`** (los productos pasan el rol admin); sin ella el aviso manda a pedírsela a un administrador. Sin cuerpo: el motor decide todo (total, fecha de hoy, asociada a la factura).
- Decisión 3 — **no anula sola**: después de la nota el aviso dice «ya podés anular la venta» y el botón «Anular venta» de siempre funciona. El `409` del servidor sigue siendo la guarda real.
- Sin `factura_cae` (sin factura, o factura sin CAE) no cambia nada. **No verificado en navegador**: los tests usan jsdom.


## ADR-016 — Stock sin scroll horizontal: la tabla cuando entra, tarjetas cuando no; el aviso y el historial tampoco ensanchan (0.114.0)

**Pedido del humano (2026-10-04):** «Pantalla Stock hay scroll horizontal, sacarlo, no tiene que haber scroll horizontal»; y, en Ventas, que el tag de `borrador_descartado` es muy largo.

**Qué se midió** (Chromium real contra VentaLibra `84d2165`, 110 productos, 1 a 6 depósitos, 390 a 1920 px, menú abierto y colapsado, claro y oscuro; los roles no cambian nada):
1. **La tabla** (`DataTable` con `table-fixed` y un `min-width` igual a la suma de los `size`) mide **837 + 110 × depósitos** px y su contenedor `ancho de pantalla − 354` px con el menú abierto (`− 146` colapsado). Con un depósito necesita 1301 px de pantalla; con tres, 1521; con seis, 1851. Un portátil de 1366 px ya scrolleaba con dos depósitos, y con seis hasta 1440 px desbordaba 411 px.
2. **El aviso «N productos con stock bajo mínimo»** ponía una pastilla `shrink-0` por producto, sin tope: un nombre de unos 38 caracteres empujaba el ancho de **toda la página** a 390 px (201 px de desborde) y a 768 px con el menú abierto (87 px).
3. **El historial de movimientos** (celdas `nowrap`, sin `size`) medía 1453 px fijos.

**Decisión.** Un `ResizeObserver` mide el contenedor de la tabla (`useAncho`). Si el contenedor es **más angosto que la suma de los `size` de las columnas**, la pantalla no scrollea de costado: pasa a una lista de **tarjetas** (`TarjetaDeStock`: nombre y código, estado, total y mínimo, un chip por depósito con su cantidad, y los mismos dos botones que la tabla) con un selector «Ordenar por» (producto, stock total de menor a mayor o de mayor a menor). Si entra, es la tabla de siempre, sin ningún cambio. El umbral no es un número fijo sino la suma real de las columnas, así que **sigue valiendo con cualquier cantidad de depósitos**. El aviso hace que las pastillas topen en el ancho del aviso (`max-w-full` + `truncate`, nombre completo en el `title`, `min-w-0` en el contenedor). El historial hace `wrap` en las columnas de texto largo (producto, depósito, referencia) y, bajo 720 px, pasa a una lista (fecha, tipo y cantidad; producto; depósito y referencia).

**Por qué no las otras:** ocultar Categoría, Unidad y Mínimo libera 305 px pero con seis depósitos sigue sin entrar a 1280 px; juntar los depósitos en una celda baja el mínimo a 722 px pero a 390 y 768 px sigue scrolleando (probado inyectado). Sólo las tarjetas dan 0 px en todas las combinaciones medidas.

**Límites.** (1) **Sin medida (sin `ResizeObserver`) se queda la tabla**: es lo que ven los tests de jsdom, que simulan el ancho con un observador falso; el comportamiento real en Chromium se midió a mano. (2) **En tarjetas no se ordena por un depósito concreto** (la tabla sí, por columna); sí por producto y por total. (3) **Los encabezados de depósito de la tabla siguen recortándose** (`Depósito Sucur…`: el botón de orden no tiene `truncate`); es cosmético y aparte. (4) Al scrollear la tabla a la derecha ya no hay scroll, así que desaparece que se pierda la columna Producto.

**Corrección en 0.114.1 (medida en Chromium sobre 0.114.0):** el aviso de stock bajo seguía ensanchando la página a 390 px (216 px de desborde) y a 768 px con el menú abierto (102 px) aunque las pastillas toparan en `max-w-full`: el aviso es un ítem de la grilla de la pantalla y, sin `min-w-0` propio, su mínimo es el de la pastilla más larga. Se agregó `min-w-0` al aviso mismo. La tabla y las tarjetas sí cumplían: 0 px de scroll interno en 468 combinaciones (3 roles, 1 a 6 depósitos, 390 a 1920 px, menú abierto y colapsado, claro y oscuro) y modo coherente con el umbral `837 + 110 × depósitos`.

**Ventas, en el mismo release.** `estado` es el `status_detail` del motor: además de `cobrada`, `parcial`, `pendiente` y `anulada` llegan `devuelta`, `devuelta_parcial` y `borrador_descartado` (las ventas migradas que eran borradores, ADR de VentaLibra 0003), que el kit mostraba con su nombre técnico. Ahora «Devuelta», «Dev. parcial» y «Descartada» (tono neutro; `devuelta*` en atención), un estado desconocido sin guiones bajos, y en la tabla la pastilla topa en el ancho de la columna con el nombre técnico en el `title`.


## ADR-017 — `VentaDetalle`: la nota de crédito se lee del servidor, el error se anuncia y la tabla de artículos no scrollea (0.114.1)

**Hallazgos** (verificación en Chromium de VentaLibra con libra-ui 0.113.1, 2026-10-04), tres defectos del detalle de la venta, ninguno del botón en sí:
1. **La nota emitida era sólo estado local.** Tras emitir, el detalle no se recargaba y `notaEmitida` era un `useState`: al recargar la página o abrir la venta en otra pestaña con la nota ya emitida en el servidor, el aviso volvía a decir «hay que emitir antes la nota de crédito» y el botón reaparecía (el 409 llegaba recién al tocarlo).
2. **El error no se anunciaba y quedaba fuera de pantalla.** Era un `<p>` plano arriba de todo: sin `role="alert"`, y en un móvil con la página scrolleada hasta los botones (277 a 368 px) el mensaje quedaba en y=136, invisible. Pasaba igual con el 409 de anular antes de la nota.
3. **La tabla «Artículos vendidos» desbordaba la tarjeta en un móvil.** Sin contenedor con scroll y con un mínimo de 386 px contra los ~340 de la tarjeta: `scrollWidth` 404 con 390, 360 y 320 px, en toda la pantalla de detalle (también sin factura y para el encargado). No era nuevo de 0.113.

**Decisión.**
1. **El arreglo de fondo es del motor** ([[libracommerce]] v0.42.0, ADR-034): el detalle de la venta trae `nota_credito_display` (la nota con CAE de la factura, o `null`). La pantalla lo lee (`Venta.nota_credito_display`): con él sabe que la nota ya está emitida **aunque se recargue**, no ofrece el botón y dice cuál es («La nota de crédito NOTA CREDITO C 0001-00000007 está emitida: ya podés anular la venta»). Tras emitir, **recarga el detalle** (`cargar()`), así que queda como la vería quien la abre de nuevo. El estado local (`notaEmitidaLocal`) queda de **respaldo** para un motor anterior a v0.42.0 que no manda el campo: ahí se comporta como antes.
2. **El error es `role="alert"`, `tabIndex={-1}` y recibe el foco** al aparecer: se anuncia y el navegador lo trae a la vista (con `focus()` el scroll es el del foco). Sin cambiar el lugar donde se muestra.
3. **La tabla de artículos, sin scroll en ningún ancho:** desde `sm` es la tabla de siempre; bajo `sm` cada artículo es un bloque (nombre, y una línea «etiqueta … valor» por cantidad, precio y subtotal, con la etiqueta en `data-label` que sale por CSS) y los totales van uno por línea (`max-sm:` de Tailwind, sin duplicar el contenido ni cambiar el DOM). Las clases se fijan por test (jsdom no mide el layout); lo medido en Chromium está en la bitácora del wiki.

**Límites.** (1) Con un motor sin el campo, reabrir la venta sigue mostrando el aviso viejo (el 409 al tocar el botón es el mensaje correcto del motor). (2) El foco al error sirve a los lectores de pantalla y a la vista, pero no cambia dónde se pinta: sigue arriba de la pantalla. (3) Los botones del detalle miden 32 px de alto (WCAG 2.5.8 AA cumple, los 44 px no): aparte.


## ADR-018 — Cuatro defectos de la verificación completa de 0.114.1: chip de depósito largo, referencias largas, contraste del total ámbar y el detalle de venta a 768 px (0.114.2)

Medidos en Chromium (VentaLibra con libra-ui 0.114.1, 110 productos, 1 a 6 depósitos, uno de 64 caracteres, 390 a 1920 px, barras clásicas de 15 px y emulación móvil), con la causa probada inyectando el cambio en el navegador antes de tocar el código:
1. **Un depósito de nombre largo ensanchaba la página en las tarjetas de Stock** (509 px a 390, con 3 o más depósitos; 20 px a 768 con el menú abierto): la `li` de la tarjeta es una grilla de columna `auto`, el chip aportaba su texto completo al mínimo de esa columna (`max-w-full` en porcentaje no limita el tamaño intrínseco) y la página heredaba el ancho. **Arreglo:** columna `grid-cols-[minmax(0,1fr)]` y el chip pasa a `flex` con el nombre en un `span.truncate` y la cantidad en un `span.shrink-0`: el nombre se trunca (con el `title` completo) y **la cantidad siempre se ve** (con sólo el `min-width:0` la cantidad quedaba oculta con el nombre).
2. **Una referencia larga sin espacios ensanchaba el historial** (≥ 40 caracteres a 390 px: 388 a 521 px; un token de 113 caracteres, 794 px; en la tabla, scroll interno de 110 a 526 px). `break-words` no baja el contenido mínimo de la columna. **Arreglo:** `[overflow-wrap:anywhere]` en las celdas de producto, depósito y referencia de la tabla y en el texto de la lista, y la misma columna `minmax(0,1fr)` en la lista.
3. **El total ámbar de «Bajo mínimo» daba 3,2:1 de contraste** (`text-amber-600` sobre blanco, 36 de 2029 elementos medidos; el oscuro pasaba). **Arreglo:** `text-amber-800`, el mismo tono que `BadgeEstado` `atencion` (4,66:1 como peor caso, ver su comentario), en la tarjeta, la columna de la tabla, el icono del aviso y el diálogo de ajuste.
4. **La tabla del detalle de venta desbordaba a 768 px con el menú abierto y importes de 7 dígitos** (481 px contra 449 a 464 de contenedor: 33 px fuera de la tarjeta y 9 px de desborde de página). **Arreglo:** los bloques de ADR-017 pasan de `max-sm:` a `max-lg:` (bajo 1024 px): a 1024 el contenedor ya mide 670 px con el menú abierto y la tabla entra.

**Sin tocar (medido y anotado).** (a) Los encabezados de depósito de la tabla se recortan sin puntos suspensivos ni `title` (`th` de 110 px; cosmético). (b) La tabla de la **lista de Ventas** (962 px) scrollea dentro de su contenedor a 390 y 768 px: es previa y no es de Stock; la página no desborda. (c) Los botones de acción miden 32 a 36 px (cumplen el mínimo de 24 px de WCAG 2.5.8, no los 44). (d) El diálogo de ajuste muestra «Stock resultante: 11.000 UN» con tres decimales. (e) Hay dos `<main>` anidados (`Layout.tsx` de VentaLibra).


**Actualización (0.114.3, cosméticos de Stock anotados arriba):** (a) `sortableHeader` (`data-table.tsx`, lo usan todas las tablas del kit) pone el título en un `span.truncate` dentro de un botón `max-w-full`, con el título entero en el `title` y el icono de orden `shrink-0`: el nombre largo de un depósito se corta con «…» en vez de quedar recortado a secas. (b) El diálogo de ajuste muestra «Stock resultante: 11 kg» o «11,5 kg» (hasta 3 decimales, sin ceros de relleno y con coma) en lugar de «11.000 UN». **No se tocó** la tabla de la lista de Ventas (962 px, scrollea dentro de su contenedor en móvil y tableta: pide un diseño propio, como el de Stock) ni el tamaño de los botones de acción (32 a 36 px).
(c) **Un solo `<main>`**: el `Layout` envolvía el contenido en un `<main>` dentro de `SidebarInset`, que ya es el `<main>`; ahora el contenedor interior es un `<div>` (mismas clases), así que los lectores de pantalla ven un único landmark «main».

## ADR-019 — `VentaDetalle` emite la nota de crédito parcial y sigue ofreciéndola mientras quede saldo (0.115.0)

**Contexto:** con las notas parciales del motor (`libracore` v1.130.0, ADR-018) una factura se acredita en varias notas y la suma no puede superar su total. La pantalla de la fase anterior (ADR-015) ofrecía sólo la nota total y dejaba de ofrecerla apenas existía *una* nota: con parciales eso escondía el botón con la factura casi entera sin acreditar y decía «ya podés anular» cuando el servidor iba a contestar 409.

- Decisión 1 — `Venta` suma `factura_total` y `factura_saldo_acreditable` (`libracommerce` v0.44.0, ADR-036). **Con ellos** la pantalla decide por el saldo, no por la existencia de una nota: ofrece la nota mientras `saldo > 0`, dice cuánto falta cuando hay notas pero no alcanzan, y sólo dice «ya podés anular la venta» con el saldo en cero.
- Decisión 2 — el botón abre un diálogo (`Dialog`, no `ConfirmDialog`, que sólo admite texto) con el total, lo ya acreditado y el saldo. **Por el total** (la de siempre, sin `importe`) sólo si la factura no tiene notas; **por un importe** (`{importe}` como número, hasta dos decimales, > 0 y ≤ saldo; acepta la coma) en cualquier caso. Con notas previas arranca en «por un importe» con el saldo escrito.
- Decisión 3 — el servidor sigue siendo la guarda real (409/422 del motor); la validación de la pantalla evita el viaje y dice el motivo.
- **Sin el saldo** (un motor anterior) todo sigue como en la fase anterior: nota total, sin elección de importe.
- No verificado en navegador (jsdom).


## ADR-020 — La lista de Ventas sin scroll horizontal: tabla cuando entra, tarjetas cuando no (0.116.0)

**Contexto:** la verificación de 0.114.1 dejó anotado (ADR-018, «sin tocar» (b)) que la tabla de la lista de Ventas (962 px con los tres botones de VentaLibra) scrollea dentro de su contenedor en móvil y tableta. El pedido del humano para Stock vale para toda pantalla: «no tiene que haber scroll horizontal».

**Decisión.** El mismo híbrido que Stock (ADR-016): `useAncho` (que pasa a `src/use-ancho.ts`, compartido) mide el contenedor de la tabla y, si es más angosto que la suma de los `size` de las columnas, la lista pasa a **tarjetas** (`TarjetaDeVenta`: el número como link al detalle, fecha y cliente, estado, total, medios de pago, factura y los mismos botones que la tabla). Sin medida (jsdom), la tabla. Además:
1. **La columna de acciones reserva sólo los botones que el producto puede mostrar** (`2 + recibo + anular`): reservaba 4 y VentaLibra muestra 3 (`rutaDeRecibo={null}`), así que el umbral quedaba en 1002 px con una tabla de 962 (medido) y pasaba a tarjetas 40 px antes de tiempo.
2. **Las pestañas Todas / Sin facturar / Facturadas hacen `wrap`** (`h-auto max-w-full flex-wrap`): a 320 px sumaban 324 px y ensanchaban la página 20 px (medido; con la franja oculta el desborde era 0).
3. Las celdas de medios de pago y factura se comparten entre tabla y tarjeta (`mediosDe`, `facturaDe`, `acciones`); el badge de cada medio topa en el ancho (`max-w-full` + `truncate`). Sin cliente, la tarjeta muestra sólo la fecha (la tabla, «—»).

**Medido en Chromium** (VentaLibra `71b93d3` con el kit local, 23 ventas con cliente de 113 caracteres, 1 a 4 medios, facturas, anuladas, `devuelta*` y `borrador_descartado`; 320 a 1920 px, menú abierto y colapsado, claro y oscuro): modo coherente con el umbral en 36 de 36 combinaciones (cambio exacto en el umbral, sin parpadeo), 0 desbordes dentro de 23 de 23 tarjetas y todos sus datos visibles, 0 px de desborde de página salvo el de las pestañas a 320. **Re-medido con los tres arreglos:** 0 px de desborde en los 10 anchos (las pestañas a 320 van en dos líneas de 66 px), umbral en 962 exacto (contenedor 961 tarjetas, 962 tabla sin scroll interno), modo coherente en 18 de 18. Stock con `useAncho` movido: sin cambios (tarjetas a 390, tabla a 1440).

**Límites.** (1) En la tabla el total de 7 dígitos se recorta sin elipsis («$ 3.703.701,0», 23 px; previo, la columna mide 100). (2) Los botones de acción siguen en 36×36 (`size-9`, cumple 2.5.8 AA, no los 44 px). (3) Una factura de nombre muy largo (FCE MiPyME A) se trunca con elipsis en la tarjeta a ≤ 412 px, con el `title` completo. (4) En tarjetas no hay orden por columna (la lista llega ordenada del servidor).

## ADR-021 — Botones táctiles de 44 px en las tarjetas y el total de Ventas entero (0.116.1)

**Contexto:** dos observaciones que quedaron de las mediciones de ADR-018 y ADR-020: los botones de acción miden 36×36 (cumplen el mínimo de 24 px de WCAG 2.5.8 AA, no el objetivo de 44 px de 2.5.5), y en la tabla de Ventas un total de 7 dígitos se cortaba en seco («$ 3.703.701,0», 23 px fuera de una columna de 100).

**Decisión.**
1. **En las tarjetas de Stock y de Ventas los botones miden 44×44** (`TACTIL` en `src/use-ancho.ts`: `[&_a]:size-11 [&_button]:size-11` sobre el contenedor de acciones de la tarjeta). Las tarjetas son la vista de los anchos angostos, donde se usa el dedo. **En la tabla siguen en 36**: el ancho de la columna de acciones (`anchoColumnaAcciones`) se calcula con ellos y la tabla es la vista de escritorio. El link del número de la venta queda fuera del contenedor (no es un botón).
2. **La columna Total de Ventas pasa de 100 a 120 px** y la celda lleva `truncate` + `title` con el importe: hasta «$ 99.999.999,00» se lee entero; más, con «…» y el importe completo al pasar el mouse. El umbral de las tarjetas sube 20 px (con los 3 botones de VentaLibra, de 962 a 982).

**Límites.** No medido en Chromium (el cambio es de tamaño fijo y lo fijan los tests: clases del contenedor, `title` del total, umbral). Los botones del detalle de venta (32 px, ADR-017) no se tocan.

## ADR-022 — Los botones del detalle de venta, de 44 px bajo `lg` (0.116.2)

**Contexto:** el último límite de ADR-017 («los botones del detalle miden 32 px de alto; WCAG 2.5.8 AA cumple, los 44 px no») y la línea de ADR-021 (botones táctiles en las tarjetas).

**Decisión.** Bajo `lg` (1024 px, la misma frontera que ya usa el detalle para pasar la tabla de artículos a bloques, `FILA_MOVIL`) los botones del detalle de venta miden **44 px de alto** (`BOTON_TACTIL = 'max-lg:h-11'`): Ticket, Recibo, Volver, cobrar con QR, Facturar, Facturar con el formulario, Generar remito, Emitir nota de crédito, Anular venta y los dos del diálogo de la nota. En escritorio siguen en los 32 de `sm`. Sólo cambia el alto; el ancho lo da el texto (todos llevan texto, ninguno es un icono solo).

**Límites.** No medido en Chromium (lo fija el test por clase). Los diálogos de confirmación de otros componentes del kit (`ConfirmDialog`) no se tocan.

## ADR-023 — Ocho pantallas sin scroll horizontal de página, medidas contra VentaLibra dev (0.116.3)

**Contexto:** la primera medición en Chromium contra un producto desplegado (VentaLibra dev, usuario de prueba, sólo lectura) encontró que, a 390 px, siete pantallas del kit ensanchaban la página: Libros IVA (522 px), Configuración (491), Transferencias (161), Reportes (99), Cajas (79), Tesorería (17) y Logs (4; los 590 medidos al principio eran el JSON del endpoint `/logs` de VentaLibra, que choca con la ruta de la pantalla: se arregla en el producto con la prop `basePath`). A 320, Promociones (38). El principio es el mismo de ADR-016: ninguna pantalla scrollea de costado.

**Causa raíz, probada inyectando el cambio en el navegador antes de tocar el código** (una sola causa no alcanzaba en Libros IVA y Configuración):
1. **Barras de pestañas sin wrap** (`TabsList` es `inline-flex w-fit h-9` con triggers `nowrap`): Configuración con siete pestañas medía 865 px y arrastraba toda la columna; Logs 394; Libros IVA 321 a 320 px. → `h-auto flex-wrap`, como Ventas (ADR-020).
2. **Cabeceras y filas de filtros sin wrap:** Cajas (filtro de sucursal de 224 px + «Nueva caja»), Tesorería, Promociones, Reportes (filtros de 472 px), la sub-navegación de Integraciones y la cabecera de exportación de Libros IVA. → `flex-wrap` y `gap`.
3. **Contenido que no parte:** el texto de ayuda de Libros IVA era `flex` con `strong` y `code` como ítems sueltos (912 px); va dentro de un `span` con `[overflow-wrap:anywhere]`. Los botones `REGINFO_*` (254 px) pueden partir (`BOTON_REGINFO`). El link de un tutorial con URL larga, el nombre de una caja y el selector «Alícuota IVA» de MercadoPago (`w-fit`, 277 px de valor) también.
4. **Una tabla sin contenedor:** el historial de Transferencias (seis columnas, 551 px) va dentro de un `overflow-x-auto` (scroll de la tabla, no de la página) y la tarjeta del formulario lleva `min-w-0`.

**Medido** con un build local de VentaLibra con el kit, contra la API de dev, «antes» (reproduce los números de dev) y «después»: **0 px de desborde de página** en las siete pantallas a 320, 360, 390, 768, 1024 y 1280 (Libros IVA y Configuración desbordaban también a 768 y 1024: 408/377 y 167/136 px). A 1280, capturas idénticas byte a byte salvo Cajas (los badges pueden ir en dos líneas y el icono ya no se achica) y Libros IVA (el texto de ayuda fluye como párrafo). Tests: 17 nuevos, rojos sin el arreglo.

**Límites.** Siguen con scroll **interno** (no de página): las tablas de Libros IVA, el historial de Transferencias y la actividad de Logs. Fuera del kit quedan en VentaLibra: la vista previa del ticket (23 px a 320), la cabecera de Sucursales (17 px a 320) y la colisión de `/logs`.

**Actualización (0.116.4):** la cabecera de **Sucursales** ya hacía `wrap`, pero su grupo de acciones no: a 320 px «Transferir stock» y el alta juntos ensanchaban la página 17 px (medido contra VentaLibra dev). El grupo lleva `flex-wrap`. Con esto, de las 26 pantallas del menú de VentaLibra medidas en dev, ninguna del kit desborda a 320, 390 ni 1280.

## ADR-024 — El N° de la tabla de Ventas, de 110 px (0.116.5)

Medido en Chromium contra VentaLibra dev: «POS-000010» en monoespaciada mide 84,3 px y la columna de 100 dejaba una caja de 84, así que se cortaba con «…» por 0,3 px en todas las filas. La columna pasa a **110 px** (mínimo 100). El umbral de las tarjetas (ADR-020) sube 10 px: con los 3 botones de VentaLibra, de 982 a **992**; con 2, a 952. **Corrección de ADR-021:** el umbral con 3 botones era 982 (las columnas sin acciones sumaban 850, no 820 como decía un comentario de test, ya corregido). La celda de factura no cambia: ya lleva el `title` en el elemento exterior, que el navegador muestra también sobre el texto interior.

**El botón del menú en el teléfono, de 44 px.** Es el único acceso al menú bajo `md` y medía 28×28 (`SidebarTrigger` es `size-7`). El `Layout` lo pide `size-11` y el contenido baja de `pt-12` a `pt-14` para no quedar debajo (44 + 8 del borde). `SidebarTrigger` mismo no cambia (en escritorio, quien lo use sigue en 28).

**Flaky de `comercio-etiquetas-gondola`, cerrado:** el test tildaba antes de que llegaran los precios de la lista predeterminada. Esa respuesta re-renderiza la tabla y, como `columnas` se redefine en cada render, `DataTable` (que pasa cada `cell` a `flexRender`, que la trata como componente) **remonta los `<input>`**: un `user.click` que cae a mitad del remonte (pointerdown sobre el nodo viejo, click sobre uno ya desmontado) se pierde sin error y la selección queda en 0. Reproducido de forma determinista reteniendo la respuesta entre pointerdown y pointerup; bajo carga, 17 fallos en 90 antes y 0 en 90 después de esperar los precios (`montarAsentada`). El componente no pierde estado (`elegidos` sobrevive al cambio de lista). **Queda abierto, de fondo:** el remonte de las celdas de `DataTable` con `cell` inline (un usuario de teclado pierde el foco en cada re-render).

## ADR-025 — `DataTable` no remonta sus celdas en cada render (0.116.6)

**Contexto:** el flaky de las etiquetas de góndola (libra-ui#262) destapó un defecto real de la tabla de toda la familia. `DataTable` dibujaba cada celda y encabezado con `flexRender(columnDef.cell, ctx)`, que **monta la función como un componente**. Las pantallas declaran las columnas con `cell` inline, y muchas sin `useMemo`, así que cada render del padre traía una función nueva: para React, otro componente, y **desmontaba y remontaba cada celda**. Consecuencias: un usuario de teclado que tilda con espacio pierde el foco apenas la pantalla se actualiza, y un clic que empieza antes de un re-render y termina después no llega (el nodo del pointerdown ya no existe).

**Decisión.** `CeldaEstable`: un componente con identidad fija que **llama a la función directo** con el contexto. Los hooks que use una celda quedan en esa instancia, igual que antes quedaban en su componente. Los componentes de verdad (clase, `memo`, `forwardRef`) siguen por `flexRender`, que ya les da identidad propia. Vale para celdas y encabezados.

**Probado** con tres tests que dan rojo sin el cambio: un re-render del padre no cambia el nodo de la casilla ni del encabezado; tildar con espacio, re-renderizar y volver a tildar conserva el foco; un clic partido por un re-render tilda igual. 1529 tests; lint con los mismos 41 warnings que antes. **No medido en Chromium** (lo fija el DOM de los tests).

## ADR-026 — `AvisoFce`: ¿a esta factura le corresponde ser FCE? (0.117.0)

**Estado:** aceptada (2026-10-05). **Contexto:** ARCA no frena una factura común a un receptor obligado a recibir FCE (ni
una FCE a uno que no lo está; medido el 2026-10-05), y una factura emitida no se cambia. El motor ya sabe preguntarlo al
registro de FCE (`GET /api/facturas/fce/corresponde`, libracore ADR-019, decisión 2); faltaba que el formulario lo
pregunte **antes de emitir**.

- Decisión 1 — **un componente, no un formulario**: el formulario de emisión vive en cada producto (Contalibra y
  Restolibra tienen el suyo, LibraClub otro), así que el kit da `<AvisoFce cuit total tipo fecha />` y cada producto lo
  pone con una línea. La regla es del motor; acá sólo se muestra.
- Decisión 2 — **pregunta con un respiro** (500 ms después del último cambio de CUIT o total) y sólo con un CUIT de 11
  dígitos y un total > 0. Una respuesta vieja no pisa a una nueva.
- Decisión 3 — **avisa, no frena**: corresponde y el tipo elegido no es FCE → `alert` con el monto desde el que es
  obligatoria (y «cargá el CBU y la modalidad» si el emisor todavía no puede emitirla); eligió FCE y no corresponde →
  una `note`, porque ARCA la autoriza igual. Si el registro no contesta (o la consulta falla), **no se muestra nada**.


## ADR-027 — El lugar de la barra de scroll, reservado siempre; y Empresa con logo a 320 (0.117.1)

**Barra de scroll.** Con barras clásicas (escritorio Windows/Linux) la barra vertical aparecía recién cuando la página scrolleaba y le quitaba 15 px al contenido. Las pantallas que eligen tabla o tarjetas por el ancho de su contenedor (`useAncho`: Ventas, Stock) quedaban en un modo u otro según el sentido del redimensionado: medido en Chromium con un build de VentaLibra, en `/ventas` con el menú abierto, **15 anchos de ventana (1346 a 1360) daban tabla bajando y tarjetas subiendo** (al pasar a tarjetas la página se alarga, aparece la barra y el contenedor queda por debajo del umbral). **Decisión:** `html { scrollbar-gutter: stable; }` en `tema.css`, que importan todos los productos. Medido después: 0 diferencias entre sentidos, 0 desborde horizontal en Ventas, Stock, Dashboard, Configuración y Libros IVA a 1280, 1920 y 390. **Costo, visible:** en una página corta (sin scroll vertical) a escritorio con barras clásicas el contenido queda 15 px más angosto y el margen derecho, ~39 px contra 24 del izquierdo; el hueco es del color de la página. Con barras superpuestas (móvil, macOS) no cambia nada. `stable both-edges` lo simetrizaría a costa de 30 px: no se tomó.

**Configuración › Empresa con logo.** Medido en demo (que tiene logo; dev no): a 320 px el formulario ensanchaba la página 25 px. La miniatura y «Logo cargado» van en una fila sin wrap, y ese ancho fijaba la única columna de la grilla. Probado inyectando el cambio: `flex-wrap` en esa fila lo lleva a 0; `minmax(0,1fr)` solo, no. Van los dos (la columna con `minmax(0,1fr)` bajo `sm` como resguardo).

## ADR-028 — El CSV de Reposición sale en el orden de la tabla (0.118.0)

La tabla se ordena en el navegador, pero el CSV lo arma el motor y salía siempre por urgencia: quien ordenaba y exportaba recibía otro orden. Desde libracommerce 0.45.0 (ADR-037 del motor) el export acepta `orden` y `sentido`; el enlace «CSV» los manda cuando hay una columna activa (los mismos nombres de columna que el motor). La lista sigue ordenándose en local y no vuelve a pedirse. Con un motor anterior, que ignora los parámetros, el CSV sale por urgencia como antes. El CSV no se arma en el kit: ahí no viven `csv_seguro` ni los booleanos legibles.

## ADR-029 — Una entrada del menú se marca también en las rutas que agrupa (0.119.0)

El menú marcaba una entrada sólo si la ruta coincidía exacta con su `to`. Una sección que agrupa pantallas con rutas propias quedaba sin ninguna entrada marcada al entrar a una de ellas: en LibraCargo, «Comprobantes» abre las pre facturas (`/pre-facturas/7`), que salieron del menú cuando se juntaron en una sección con pestañas (pedido del humano, 2026-10-06). El producto lo había resuelto con un parche sobre una API interna de react-router (`UNSAFE_LocationContext`).

**Decisión.** `NavItem` y `NavChild` aceptan `activoEn?: string[]`: rutas, además de `to`, en las que la entrada se marca, cada una con todo lo que cuelga de ella (`/pre-facturas` cubre `/pre-facturas/7/editar`, no `/pre-facturas-viejas`). La regla vive en `estaActivo`, exportada y testeada. Sin `activoEn`, todo igual que antes.

## ADR-030 — La tarjeta de ARCA pinta un bloque por servicio (0.120.0)

La tarjeta de Configuración / ARCA sólo conocía la facturación (`wsfe`). LibraCargo suma el CTG y la Carta de Porte Electrónica (`wscpe`), con certificados propios emitidos a nombre de la persona que representa a la empresa, y el humano (2026-10-07) no tenía dónde ver ni cargar esos certificados ni su estado. El motor (libracore ADR-032) guarda y lista las credenciales por servicio: `GET {basePath}/servicios`, y por servicio que no es la facturación `…/servicios/{servicio}/estado|certificado|clave|credenciales|probar`.

**Decisión.**
1. **Un bloque por servicio, decidido por lo que lista el motor.** `ArcaCard` pide `GET {basePath}/servicios` aparte y sin spinner. Si lista más que la facturación, el título pasa a «ARCA» y la facturación y cada servicio quedan en su `section` rotulada; si no (el motor no tiene la ruta, contesta 404 o algo que no es una lista, o lista sólo `wsfe`), **la tarjeta es la de siempre, byte a byte**: lo fija un snapshot generado contra el código anterior (`test/ArcaServicios.test.tsx`). Los productos que sólo facturan no ven nada nuevo.
2. **La facturación no se mueve.** Mantiene su formulario y sus rutas (`{basePath}`, `/estado`, `/certificado`, `/clave`, `/credenciales`, `/probar`); sólo gana, **con más de un servicio**, el nombre del servicio en el `aria-label` de sus campos, porque aparecen dos «Certificado (.crt) — Producción».
3. **El bloque de un servicio es sólo credenciales**: por ambiente, el estado (cargado, vencimiento y días, vencido, qué mitad falta), el CUIT del certificado, subir certificado y clave, quitar el par y «Probar conexión». **Sin selector de ambiente**: cada acción nombra su ambiente (`ambiente=` siempre viaja; el motor lo exige). «Probar» muestra el mensaje del motor tal cual —ya viene en castellano y con el texto de ARCA al final— en un bloque (`AvisoEstado`), y subir o quitar en un ambiente borra el resultado de ése: un «Autenticado» de un par que ya no está cargado sería la mentira que la pantalla evita.
4. **La ayuda** («El certificado puede estar a nombre de la persona que representa a la empresa») la manda el motor en `ayuda`; si no la manda, la pone el kit (`AYUDA_DEL_SERVICIO`).
5. `empresa` viaja igual que en la facturación (`cfg.empresa`, o el slug del producto en una instancia nueva).

**Consecuencias.** LibraCargo sube a `libra-ui` 0.120.0 y a la versión del motor con `build_arca_router(servicios=("wsfe", "wscpe"))`; con el motor nuevo y el kit viejo (o al revés) la pantalla sigue siendo la de siempre. Los demás productos suben el pin sin cambios. Queda fuera: elegir con qué CUIT se opera (`cuitRepresentada`), que es de cada llamada y no de esta pantalla.

## ADR-031 — `SelectBuscable` con modo «escribir para buscar» (0.121.0)

`SelectBuscable` es un **botón** que abre un desplegable con el buscador adentro. Quien lo ve cerrado no sabe que se puede buscar: LibraCargo lo usa para elegir cliente, fletero o proveedor en la cuenta corriente y el humano (2026-10-07) pidió «un cuadro de buscar donde se ponga el nombre […] que no sólo deje seleccionarlo sino también buscarlo por letras».

**Decisión.** Prop opt-in `buscarEscribiendo` (booleano, por defecto `false`; el nombre dice lo que hace y sigue la convención en castellano de las demás props). Con ella el control cerrado **es un `<input>` con lupa** —`role="combobox"`, con el `placeholder` que pase el consumidor («Buscar cliente…»)—, sin botón ni buscador interno.

1. **Escribir filtra y abre al instante**, con el mismo `coincideBusqueda` sobre etiqueta + `hint` (sin acentos ni mayúsculas, todos los términos). Un click o `ArrowDown` abren la lista completa. ArrowUp/Down mueven el resaltado, Enter elige el resaltado (cerrada, Enter sigue su camino: puede ser el de enviar un formulario), Escape cierra (cerrada, no se la traga: puede ser la de un diálogo), Tab cierra.
2. **Con algo elegido el campo muestra su etiqueta.** Enfocar selecciona todo y tras elegir también, así la próxima letra empieza una búsqueda nueva en vez de pegarse al nombre. Una **×** (`aria-label` «Quitar la selección») llama `onChange('')` y deja el foco en el campo.
3. **Salir sin elegir descarta lo escrito**: cuando el foco sale del control entero (click afuera, Tab) o con Escape, la lista se cierra y el campo vuelve a la etiqueta elegida. Se decide con `onBlur` del contenedor y `relatedTarget`; el `mousedown` de la lista se cancela para que tocar una opción o la barra de scroll no le saque el foco al campo.
4. **ARIA**: `role="combobox"`, `aria-expanded`, `aria-controls` (abierto) al `listbox`, `aria-activedescendant` a la opción resaltada (las opciones llevan `id` sólo en este modo), `aria-autocomplete="list"`. `id`, `aria-describedby`, `aria-invalid` y `ariaLabel` van al `<input>`, así el `htmlFor` de un `<FormLabel>` lo nombra como antes al botón.
5. **El modo por defecto no cambia**: es el mismo componente, con las opciones del desplegable extraídas a un helper que comparten los dos (mismo DOM, sin `id` de opción), y la suite y los snapshots de antes pasan sin tocarse. El modo nuevo es un componente interno aparte, no una rama dentro del otro.

**Consecuencias.** `className` va al contenedor del campo (es lo que tiene ancho), no a un botón. Sin buscador interno, el `placeholder` pasa a ser el de la búsqueda (el «Buscar…» del modo botón vivía adentro del desplegable). Una opción con `value: ''` (p. ej. «Todos») sigue eligiéndose desde la lista, pero la × se ofrece sólo si `value !== ''`: para «ninguno» en este modo conviene dejar el campo vacío y no ofrecer esa opción. LibraCargo lo usa en las tres pestañas de Cuenta corriente.

## ADR-032 — El buscador ignora los separadores entre números (0.122.0)

Un CUIT se guarda «20-12345678-9» en LibraCargo y «20123456789» en Contalibra, y quien busca lo teclea de las dos formas. `coincideBusqueda` comparaba el texto tal cual, así que en LibraCargo teclear el CUIT sin guiones no encontraba nada. Contalibra lo resolvía guardando el CUIT sólo con dígitos; el humano (2026-10-07) pidió que esté en un lugar común y lo tomen todos.

**Decisión.** Cada término coincide si aparece tal cual **o** si aparece después de sacar, de los dos lados, los guiones, puntos y barras que quedan **entre dos dígitos** (`sinSeparadoresNumericos`, exportada). Vale para todo lo que usa `coincideBusqueda`: el buscador de `DataTable`, `SelectBuscable` (los dos modos) y las etiquetas de góndola.

**Consecuencias.** «2012345678» encuentra «20-12345678-9» y «20-1234» encuentra «20123456789»; de paso «1580000» encuentra «$ 1.580.000». No se unen números separados por espacios ni por letras («2012» no encuentra «Lote 20 y 12»). Nada que antes coincidía deja de coincidir: el camino tal cual sigue primero.

## ADR-033 — La identidad de cada producto: un registro, un acento y una marca (0.123.0)

Cada producto de la familia tiene un color y un ícono (la tabla vive en el wiki, `identidad-de-producto-diseno`; el humano la pidió el 2026-10-07 para que la app, la landing y LibraSuite hablen el mismo idioma). Las apps usaban el logo ilustrado de `kit-libra-v1` o la inicial, y los ocho `index.css` los tokens neutros de shadcn: ningún lugar asociaba un producto con su color.

**Decisión.**
1. **Un registro, `IDENTIDAD[producto]`** (`libra-ui/identidad`): nombre, rubro, `color` (la marca), `colorOscuro`, `colorClaro`, `colorSobreOscuro`, `colorAccion` y el ícono de lucide. Es la copia de las apps de una tabla que existe tres veces (aquí, `libra_web_kit/identidad.py` y el wiki); `test/identidad.test.ts` hardcodea la tabla del wiki y falla si esta copia diverge. Cambiar un color es cambiarlo en las tres, en la misma tanda.
2. **`colorAccion` sale del contraste, no del gusto.** Es el fondo del botón principal y del ítem activo, con texto blanco encima, así que tiene que llegar a 4,5:1 (WCAG AA). El color de marca no llega en RestoLibra (3,6:1), MedLibra (3,7:1) y VentaLibra (3,2:1): ahí `colorAccion` es `colorOscuro`; en los otros cinco es el `color`. El test calcula el contraste de los ocho con la fórmula de WCAG, de modo que un color nuevo que no llegue pone rojo el CI. La marca (`MarcaProducto`) y el anillo de foco siguen usando `color`: ahí no hay texto que leer.
3. **`MarcaProducto`**: el ícono blanco sobre un cuadrado redondeado del color de marca, `h-8 w-8 shrink-0` por defecto (cabe en los 32 px de la sidebar colapsada) y `className` / `iconoClassName` para el 40/20 px del Login. `role="img"` con el nombre del producto, ícono `aria-hidden`. El fondo va en `style`: son ocho hex y Tailwind no genera clases armadas en runtime.
4. **Precedencia en el encabezado.** `createLayout` y `createLogin` aceptan `producto?: Producto`. Si está, se dibuja `MarcaProducto`: **`producto` > `logo` > `icon` > inicial** (en el Login, `producto` > `logo` > inicial). Un producto que no la pasa ve el render de siempre, byte a byte; el que migra retira su `logo-<producto>.png`. `productName` sigue siendo el texto del nombre.
5. **`aplicarIdentidad(producto)` inyecta un `<style id="libra-identidad">`** con `--primary`, `--ring`, `--sidebar-primary` y `--sidebar-ring` (y sus `-foreground`) para `:root` y `.dark`, y fija el `theme-color`. Por qué un `<style>` y no variables en línea: en línea no hay modo oscuro (un `documentElement.style` vale para los dos), y ese lugar ya es de `aplicarTema` (ADR-007), con el acento que el backoffice elige por instancia. Con un `<style>` conviven: la identidad es el defecto del producto y lo que elija la instancia, por ir en línea, la pisa. Para ganarle a los `:root` y `.dark` de cada `index.css` (a igual especificidad decide el orden de las hojas, que no controlamos: `<link>` en el build, `<style>` reordenados por el HMR en dev) los selectores son `:root:root` y `.dark.dark`. Es idempotente: el segundo llamado reemplaza el contenido, no agrega otro `<style>`.

**Consecuencias.** Es aditivo: ningún producto cambia hasta que suba el pin y llame a `aplicarIdentidad('<producto>')` y pase `producto` a `Layout` y `Login`. El modo oscuro usa `#0b1324` como texto sobre el acento; los ocho `colorSobreOscuro` llegan a 4,5:1 contra él (también lo mide un test). Queda fuera: los íconos de concepto del menú (otro catálogo), las landings (`libra-web-kit`) y el favicon de cada app, que lo cambia cada producto.

## ADR-034 — La marca de cada producto es un dibujo propio, con favicon reducido (0.124.0)

El ícono de lucide sobre el cuadrado de color (ADR-033) era el mismo dibujo que trae cualquier pack, y el logo ilustrado de `kit-libra-v1` tenía degradés y brillos que no van con una interfaz plana. El humano pidió el 2026-10-07 una fusión: plana, pero que no sea un ícono genérico. La lámina con la serie, las escalas y el contexto está en el wiki (`diseños/iconos-familia-libra-v2.html`), y la decisión en `identidad-de-producto-diseno`.

**Decisión.**
1. **`marcas.ts` dibuja las ocho marcas**: `svgDeMarca(producto, variante)` devuelve el SVG completo (el cuadrado del color de marca y el dibujo encima, lienzo 120 × 120). Las reglas del dibujo: dos piezas que se superponen; un filo del color de fondo que las separa (el «corte», `paint-order="stroke"`); formas llenas con detalles calados y no trazo fino; blanco, blanco translúcido, la `tinta` y el `claro` del producto y un solo acento. `tinta` y `claro` viven en `marcas.ts` y no en `IDENTIDAD`: son del dibujo, no de la interfaz.
2. **Dos variantes.** `icono` es la marca completa. `favicon` es una sola pieza del ícono, engrosada (el recibo, la campana, la agenda con un tilde…), porque a 16 px las dos piezas se empastan.
3. **`MarcaProducto` incrusta el SVG** (no un `<img>`: pinta en el primer render, sin red) y acepta `variante`. El `<title>` se saca: el nombre accesible lo da el `aria-label`, y si no, el título aparece como texto junto al nombre del encabezado. `iconoClassName` queda aceptado y sin efecto. El Login pasa de 40 a 48 px: el dibujo tiene más detalle que un glifo.
4. **`aplicarIdentidad` pone el favicon** (`faviconDeMarca`, un `data:` URL) en el `<link rel="icon">` del `index.html`, o lo crea. Cada app estrena la marca con sólo subir el pin; el archivo del `index.html` es lo que se ve hasta que corre el JS.
5. **`marcas/*.svg` son los mismos dibujos en archivo**, para quien no corre JS: las landings (`libra-web-kit`) y LibraSuite los copian. `test/marcas.test.ts` falla si un archivo no es exactamente lo que devuelve `svgDeMarca`; `npm run marcas` los regenera.

**Consecuencias.** `IDENTIDAD[p].icono` (lucide) sigue, para quien necesite el glifo de una línea, pero ya no es la marca. Los productos que ya pasan `producto` cambian de marca y de favicon al subir el pin, sin tocar código. Las landings tienen que copiar `marcas/` a mano: el dibujo no se redibuja en Python.


## ADR-035 — El catálogo de íconos de identidad: un concepto, un ícono (0.125.0)

El humano lo pidió el 2026-10-06: «los íconos ¿están normalizados como en VentaLibra? Creo que no siguen un patrón». El relevamiento de los menús de los ocho productos y de los títulos del kit encontró trece conceptos con íconos distintos según el producto (la Caja era `SquareStack`, `Landmark` o `Wallet`; Usuarios, `UserCog` o `Building2`) y seis íconos que significaban dos cosas (`Wallet` era la caja, la cuenta corriente, los egresos o la caja por medio). Lo único que ya obligaba el kit (`TituloPantalla`, v0.34.0) es que el título de una pantalla use el ícono de SU entrada del menú; nada obligaba a que dos productos usaran el mismo para un mismo concepto. La tabla la aprobó el humano el 2026-10-07 y vive en el wiki, `catalogo-iconos-identidad-diseno`.

**Decisión.**
1. **`ICONOS` (`libra-ui/iconos-identidad`) es un mapa congelado concepto → componente de lucide**, con 33 conceptos en camelCase español (`caja`, `cuentaCorriente`, `egresos`, `usuarios`, `logDeActividad`…). Es el ícono del menú y del título de la pantalla; no es el de la marca (`IDENTIDAD`, ADR-033, que puede coincidir con uno del catálogo sin problema: son registros distintos) ni los de acción y estado (`iconos-accion`).
2. **Un concepto, un ícono; y dos conceptos no comparten ícono.** El test lo mide sobre cada vista del catálogo. La única repetición del mapa base es `proveedores` y `fleteros` (`Truck`), y está a propósito: sólo LibraCargo usa los dos y ahí se separan.
3. **Las excepciones viven en el catálogo, nunca en el producto.** `ICONOS_POR_PRODUCTO` es la única que hay (decisión del humano, 2026-10-07): en **LibraCargo `proveedores` = `Store`**, porque allí el camión es de los fleteros. `iconosDe('libracargo')` devuelve `ICONOS` con eso encima; `iconoDelConcepto(concepto, producto?)` es la versión pura, para que un test compare con `===`. Un producto que necesite otro ícono para un concepto lo pide acá, con su fecha y su porqué; si lo cambia en su menú, el test del producto (ver 5) falla.
4. **Las pantallas del kit toman el ícono de `ICONOS`.** Cambian de ícono: Caja (`SquareStack` → `Wallet`), Caja por medio de cobro (`Wallet` → `Coins`), Listas de precio (`Tag` → `Tags`), Sucursales (`Store` → `MapPin`), Compras (`ShoppingBag` → `ShoppingBasket`: son las órdenes de compra; `ShoppingBag` queda para los egresos) y el Log de actividad de comercio (`History` → `ScrollText`). Las tarjetas por caja pasan de `Wallet` a `SquareStack` (`cajas`), los depósitos de `Building2` a `Warehouse`, y en la ficha del cliente los remitos de `Truck` a `FileText` y los presupuestos de `FileText` a `Calculator`. `Usuarios`, `Logs` y `createConfiguracion` reciben `icono` **opcional**, con el del catálogo por defecto: era obligatorio porque VentaLibra usaba `Building2` en Usuarios y un default le habría puesto a un producto el ícono de otro; con el catálogo esa razón se cae. Se puede seguir pasando (no rompe a nadie), pero un producto ya no tiene por qué.
5. **Cómo lo controla un producto.** Con `iconoDelConcepto` si tiene el ícono a mano, o con `auditarMenuContraCatalogo(fuenteDelLayout, { '/caja': 'caja', … }, producto?)` (`libra-ui/auditoria-de-titulos`, de test: lee el fuente, igual que `auditarTitulos`). Acepta `icon: ICONOS.caja` y el nombre suelto de lucide, así un producto migra de a una entrada, y devuelve cuánto midió (`medidas`) y qué rutas no encontró (`faltan`): una lista `mal` vacía no prueba nada si el parser no leyó ninguna entrada. `auditarTitulos` entiende ahora las dos formas (`icon: Users` y `icon: ICONOS.clientes`) y las compara por el componente al que apuntan, así que un menú migrado a medias no marca desajustes falsos; para un producto con excepciones se le pasa el `producto`.
6. **Nada del kit esquiva el catálogo.** `test/iconos-identidad.test.tsx` lee los fuentes del kit: todo `<TituloPantalla icono={…}>` tiene que ser `ICONOS.<concepto>`, la prop `icono` de las tres pantallas compartidas, o estar en la lista explícita de las seis pantallas cuyo concepto no está en la tabla (Promociones, Vencimientos, Margen, Reposición, Etiquetas de góndola, Actualización masiva), y esas seis no pueden usar un ícono del catálogo.

**Cómo se agrega un concepto.** (1) La fila en la tabla del wiki; (2) la clave en `src/iconos-identidad.ts`, con un ícono de lucide que ningún otro concepto use; (3) la fila en `TABLA_DEL_WIKI` de `test/iconos-identidad.test.tsx`; (4) subir la versión del kit y, en la misma tanda, el pin de los productos que lo muestran. Los conceptos de un solo producto (KDS, buffet, torneos, vencimientos) no entran hasta que un segundo producto los necesite o choquen con uno del catálogo.

**Consecuencias.** Es aditivo para el que no migra: ningún producto cambia hasta que suba el pin y tome sus íconos de `ICONOS`; las pantallas del kit que cambian de ícono (punto 4) lo hacen en todos los consumidores a la vez, y por eso cada producto tiene que mover su menú en la misma tanda, o el título de la pantalla del kit deja de coincidir con el de su entrada. `BarChart3` es en lucide el mismo componente que `ChartColumn`; el catálogo usa el nombre vigente. Queda para cuando haya segundo uso: que las pantallas del kit reciban `producto` para tomar la excepción (hoy `Proveedores` del kit rinde `Truck` en todos y LibraCargo no usa esa pantalla).

## ADR-036 — El ítem activo del menú es del color del producto, no verde (0.126.0)

El ítem activo del menú lateral era un chip verde (`#ecfdf5` con borde `#5ee9b5`) en los ocho productos: ADR-007 lo sacó de VentaLibra y lo dejó como defecto de la suite. Con la identidad por producto (ADR-033) quedó un verde suelto en la interfaz de siete productos que no son verdes. El humano pidió el 2026-10-07: «el ítem activo del menú en la sidebar tiene que ser del mismo color del acento de la suite, tiene que dejar de ser verde; cada uno por default tiene que ser con su color de acento principal también en el ítem activo», y que la vista previa de «Apariencia» del backoffice muestre los defectos del producto y no `#ecfdf5` / `#5ee9b5` y un botón negro.

**Decisión.**
1. **El defecto del ítem activo se deriva de `IDENTIDAD` y lo fija `aplicarIdentidad`** (`cssDeIdentidad` suma `--libra-menu-activo-fondo|borde|texto` en `:root:root`). Sin campos nuevos en la tabla (no hay una tabla más que mantener ni que divergir del wiki). `menuActivoDeProducto(p)`: **fondo** = `colorClaro` (el fondo suave del producto, el mismo del chip de la landing); **borde** = el `color` de marca mezclado al 45% con el `colorClaro` (`mezclar`); **texto** (y el ícono) = `colorOscuro` oscurecido con `ajustarContraste` hasta llegar a 4,5:1 sobre el fondo. Con el 100% de la marca el borde pesaba más que el texto; al 45% se distingue de la barra (`#fafafa`) con 1,6:1 a 2,7:1 según el producto (el verde de antes: 1,46:1), así que ninguno queda más tenue que el de antes.
2. **Modo oscuro: sin variante.** El chip era claro en los dos modos (un chip claro sobre la barra oscura) y sigue siéndolo; el texto del producto sobre `colorClaro` llega a 4,8:1 o más, y el borde contra la barra oscura (`#171717`) a 6:1 o más. Por eso las tres variables van sólo en `:root:root` y no en `.dark.dark`.
3. **`defectosDelProducto(p)` (`libra-ui/identidad`)** devuelve un valor por cada clave de `COLORES_DE_TEMA` para ese producto: `acento` = `colorAccion`, `menuActivoFondo` / `menuActivoBorde` = los de arriba, y el resto el `porDefecto` del catálogo. `barraLateralFondo` no sale de la identidad: los ocho heredan el `--sidebar` de shadcn (`oklch(0.985 0 0)` = `#fafafa`) y ninguno lo cambia, así que vale `#fafafa`. Vive en `identidad.ts` y no en `tema.ts` para no cerrar un ciclo (`identidad` ya importa los helpers de color de `tema`). Es la función que el backoffice usa para «De siempre» y la vista previa.
4. **`tema.css` conserva un último recurso, pero neutro** (`#f5f5f5` / `#d4d4d4` / texto `#171717`, 16:1) y no verde: es lo que ve un producto que no llama a `aplicarIdentidad` (hoy ninguno: los ocho la llaman). Un verde de último recurso hubiera sido el mismo defecto en otro lugar. `menuActivoFondo` y `menuActivoBorde` pasan a `defectoPorProducto` y su `porDefecto` pasa a ser ese neutro (sólo referencia).
5. **Un tema de instancia sigue ganando.** `aplicarTema` fija fondo, borde y texto en línea; la identidad está en un `<style>`; lo en línea gana. Restaurar (`aplicarTema({})`) limpia lo en línea y vuelve la identidad.

**Consecuencias.** Al subir el pin cada producto pasa de verde a su color sin tocar código. LibraClub no cambia el fondo (su `colorClaro` ya era `#ecfdf5`, es su marca) pero sí el borde y el texto. Una instancia que tenga **guardados** `menuActivoFondo` / `menuActivoBorde` (por ejemplo, el verde que «De siempre» o un guardado del formulario dejó como si fuera elegido) no cambia: ese valor es una elección explícita y gana. El acento de LibraCargo (`#012c83`) es un defecto válido pero no una elección válida por instancia (`legibleSobrePagina`: 1,6:1 contra la página oscura), así que «De siempre» tiene que ser **vaciar** el tema, nunca guardar los defectos mostrados.

## ADR-037 — Todo campo de archivo de la suite es `CampoArchivo` (0.127.0)

Cada pantalla que sube un archivo (certificado y clave de ARCA, logo de la empresa, copia de seguridad a restaurar, planilla de precios) usaba el `<input type="file">` nativo envuelto en el `Input` de shadcn. El navegador dibuja ahí su propio botón («Seleccionar archivo») y su propio texto («Ningún archivo seleccionado»), en su idioma y distinto en cada uno: cuatro pantallas, ninguna igual a un campo del kit. El humano pidió el 2026-10-08: «en todos los lugares donde haya que subir archivos debería aparecer el ícono que hace referencia a subir un archivo en el borde derecho del box donde se sube el archivo y menos texto dentro del box. Mostrame modelos y elegimos uno así lo normalizamos para toda la suite». Se mostraron cinco modelos y eligió el **B**.

**Los cinco modelos.** A: zona punteada grande para arrastrar (mucho texto, altura de tarjeta: rompe formularios de una fila). **B: campo de la altura de un input con el botón de ícono pegado al borde derecho.** C: sólo un botón con ícono y texto (no se ve qué archivo hay). D: el input nativo con el ícono dentro (sigue el texto del navegador). E: una fila de «chip» debajo del campo (dos controles para una acción). Ganó B porque ocupa lo que un input, se lee como un campo más del formulario, y mueve el texto a un lugar que el kit controla.

**Decisión.**
1. **`CampoArchivo` (`libra-ui/CampoArchivo`)**: una caja `h-9` con el mismo borde, radio, sombra y fondo que el `Input` del kit; el texto a la izquierda y, pegado al borde derecho, un botón cuadrado de 40 px con el ícono `Upload` de lucide, separado por una línea vertical y con fondo `muted`. Vacío: «Ningún archivo» en gris (`placeholder`). Elegido: ícono de archivo, nombre (con `truncate` y el nombre entero en el `title`) y tamaño legible en gris (`formatearTamanio`: `1,2 KB`, `2,3 MB`, coma decimal es-AR). Error: la caja y el botón en el color destructivo y el mensaje **debajo** (`error`), nunca adentro. Deshabilitado: opacidad reducida y sin interacción. `ayuda` es el texto chico de abajo (formatos, tamaño). Mismos tokens en modo oscuro (`dark:bg-input/30`, `muted`, `destructive`).
2. **API controlada: `archivo: File | null` + `onChange(archivo: File | null)`.** Se eligió sobre exponer un `ref` para limpiar el input a mano porque los cuatro usos hacían `inputRef.current.value = ''` después de subir o al cancelar: con la API controlada eso desaparece. El input nativo se vacía solo después de cada elección, así volver a elegir **el mismo** archivo dispara el cambio otra vez. Los usos de «elegir y subir ya» (ARCA, logo) pasan `archivo={null}` y suben en `onChange`. El `ref` igual llega al `<input>` nativo.
3. **Click en cualquier parte de la caja abre el selector**; el botón es un `<button type="button">` con `aria-label` «Subir archivo» o «Cambiar archivo» (según haya archivo) y es la única parada de teclado (Enter y Espacio). El `<input type="file">` es `sr-only`, fuera del orden de tabulación, y sigue asociado: `id` (un `<Label htmlFor>` lo nombra), `name`, `accept`, `required`, `aria-label` y `aria-describedby` hacia el error y la ayuda. Vive **afuera** de la caja: adentro su `click()` programático subiría de nuevo al manejador de la caja y se abriría en bucle.
4. **Quitar**: con archivo elegido aparece una X dentro de la caja (`onChange(null)`), salvo si el campo es `required` o `disabled` o se pasa `quitable={false}`.
5. **Arrastrar y soltar** sobre la caja, con el borde y el fondo del color primario mientras se arrastra. Lo soltado se valida contra `accept` (extensión, `tipo/subtipo` o `tipo/*`, igual que el selector del navegador, que no interviene en un arrastre); si no cumple, la caja lo dice abajo («Ese formato no se admite (se espera .xlsx)») y no llama a `onChange`.
6. **Un solo archivo por vez.** Ningún uso sube varios, así que no hay `multiple`: el que lo necesite lo pide acá, con su caso.
7. **La regla: todo campo de archivo de la suite usa `CampoArchivo`.** `test/campo-archivo-unico.test.ts` lee los fuentes y falla si aparece un `type="file"` en `src/` fuera de `src/CampoArchivo.tsx`. Un producto con un campo de archivo propio lo cambia por éste al subir el pin.

**Consecuencias.** Es aditivo para el que no lo usa; las cuatro pantallas del kit cambian de aspecto en todos los consumidores al subir el pin. En `ActualizacionMasivaPrecios` el botón «Elegir otra» sale: la X de la caja quita la planilla y el ícono de la derecha elige otra. En «Restaurar base de datos» el nombre del archivo aparece también en la caja, además de en la confirmación. El snapshot de `ArcaServicios` se regeneró una vez; sólo cambiaron los cuatro campos de archivo. El botón de subir se llama igual en todos los campos («Subir archivo»): lo que distingue a uno de otro es el `aria-label` del `<input>` (ARCA le pone el servicio y el ambiente), y quien use varios campos en una pantalla tiene que seguir dándoselo. Queda fuera: previsualizar el logo dentro de la caja (la pantalla de empresa ya muestra el logo cargado arriba) y el progreso de subida.

## ADR-038 — Los reportes y los tableros toman sus íconos de un catálogo: un concepto, un ícono (0.128.0)

El humano pidió el 2026-10-08: «agregar iconos en los reportes como tiene Contalibra, armar algún tipo de normalización de iconos para usarlos en toda la suite en los reportes y también usarlos en los dashboards». Antes había pedido que los botones de acción vayan «a la altura del título» en todas las secciones. ADR-035 normalizó el ícono de cada pantalla (menú y título); lo que se mide DENTRO de una pantalla —la tarjeta de un reporte, el KPI de un tablero, el título de un bloque— seguía escrito a mano en cada archivo con un `import { … } from 'lucide-react'`.

**Qué ya existe** (se miró antes de diseñar, `reglas/producto.md`):
- `iconos-identidad` (ADR-035): el ícono de cada pantalla, con sus excepciones por producto (`ICONOS_POR_PRODUCTO`). **Se reutiliza, no se copia**: los 33 conceptos entran al catálogo nuevo con la misma clave y el mismo componente.
- `iconos-accion`: el vocabulario de acción y estado (Fluent, monocromo). No se toca: borrar, ver, pagado no son conceptos que se midan.
- `EncabezadoDePantalla` (`libra-ui/acciones`, 2026-08-14): **la fila «título a la izquierda, controles a la derecha», con `flex-wrap`**, que usan 33 pantallas de LibraDesk, 17 de LibraClub y 1 de GestioLibra. Ya resolvía el pedido de las acciones a la altura del título; lo que faltaba es que `TituloPantalla` (que ya lleva el ícono) no la conocía y los demás productos repetían el `div flex justify-between` a mano.
- `TituloPantalla` + `auditoria-de-titulos` (ADR-035): el recuadro `data-slot="icono-tile"`, que las tarjetas nuevas repiten, y el parser de `<TituloPantalla icono={…}>` que los productos usan.
- `comercio/Reportes.tsx` y `comercio/Dashboard.tsx`: el «como tiene Contalibra». Cuatro KPI de `Card` > `CardContent` con un `<span className="rounded-lg bg-…/10 p-2">` y un ícono de lucide, más íconos sueltos en cada `CardTitle`. Es el bloque que se unifica.
- `medios-pago.ts`: el ícono de CADA medio de pago (efectivo, tarjeta…) para las filas de una lista. Es otro vocabulario (una dimensión, no un indicador) y no se toca.
- `test/campo-archivo-unico.test.ts` (ADR-037) y `auditoria-de-titulos`: el patrón del guard que lee fuentes, con control positivo.
- Lo que cada producto había inventado, relevado el 2026-10-08 sobre el árbol de cada uno: LibraCargo `ReportesIndice` (tarjetas con borde y sin ícono) e `Inicio` (`Tarjeta` propia con ícono por prop), LibraDesk `Reportes` + `reportes-definicion` (una fila por reporte con `FileSpreadsheet` en los diez) y `Dashboard` (bloques con `CardDescription` + ícono), RestoLibra `ReportesSalon` / `ReporteCostos`, GestioLibra y MedLibra `Dashboard` (tarjetas sin ícono), LibraClub `CajaPorMedio` (idem). LibraCargo acaba de inventar `PantallaConTitulo` / `AccionesDelTitulo` (un portal) porque el kit no tenía dónde poner las acciones de un título.

**Lo que se midió** (divergencias, no gustos): *productos* es `Package` en el menú y `Boxes` —el stock— en «Productos más vendidos»; la *comisión* de LibraCargo es `ClipboardList`, que son las órdenes; el *cobrado* es `ArrowDownCircle` en Contalibra y `Wallet` —la caja— en LibraCargo; los *egresos* son `ArrowUpCircle` en el tablero y `ShoppingBag` en el menú; *Por técnico* es `UserCog`, que es Usuarios; el reporte de *Facturación* y el de *Garantías* llevan el mismo `FileSpreadsheet` en LibraDesk; el saldo de la caja es `Wallet` en Reportes y Dashboard y `PiggyBank` en la pantalla de Caja del kit. Ningún render lo muestra: está en los `import`.

**Decisión.**
1. **`libra-ui/iconos-indicador`: un concepto, un ícono, para lo que se mide.** `INDICADORES` es un mapa congelado `ConceptoIndicador → componente de lucide` con tres partes: (a) los 33 conceptos de **identidad**, con su misma clave y su mismo componente (leídos de `ICONOS`, no copiados: un cambio en ADR-035 llega solo); (b) 11 **sinónimos** (`facturado` → `comprobantes`, `gastos` → `egresos`, `saldos` → `cuentaCorriente`, `pacientes` → `clientes`, `turnos` → `agenda`, `iva` → `librosDeIva`, `mediosDePago` → `cajaPorMedio`, `auditoria` → `logDeActividad`, `fletes` → `ordenesDeCarga`, `horas` → `tiempo`, `foodCost` → `margen`), que comparten ícono por construcción —el que arma un tablero piensa en «gastos», no en el nombre del menú—; (c) 22 conceptos **propios** que se miden y no son una pantalla o son de un solo producto: `cobros`, `pagos`, `montoVendido`, `porCobrar`, `margen`, `stockBajo`, `tiempo`, `recordatorios` (varios productos) y `ordenesDeCarga`, `rutas`, `toneladas`, `kilometros`, `comisiones`, `liquidaciones`, `cartasDePorte` (LibraCargo), `incidencias`, `equipos`, `garantias`, `contratos`, `reparaciones`, `tecnicos`, `insumos` (LibraDesk). A diferencia del catálogo de identidad, **los conceptos de un solo producto sí entran**: el reporte de un producto tiene que decir lo mismo que su menú, y para eso el catálogo es el único lugar. La tabla completa vive en el README.
2. **Reglas, medidas por test.** Un propio no usa un ícono que ya esté en el catálogo de identidad ni en otro propio; dos conceptos no comparten ícono salvo los sinónimos y el par `proveedores` / `fleteros` de ADR-035; un sinónimo apunta a un concepto que existe y no pisa a ninguna clave. `test/iconos-indicador.test.tsx` repite las tres tablas a mano y falla si la copia diverge. Las **excepciones por producto siguen siendo de ADR-035**: `iconoDelIndicador('proveedores', 'libracargo')` es `Store`; un propio no tiene excepciones.
3. **Se pasa el concepto, no el ícono.** `TarjetaReporte`, `TarjetaIndicador` e `IconoIndicador` reciben `concepto: ConceptoIndicador`; el tipo no admite un componente suelto, así que no se puede elegir un ícono por afuera del catálogo. `TarjetaReporte({ concepto, titulo, descripcion?, nota?, a? | onClick?, producto?, className? })`: el recuadro de `TituloPantalla` (`icono-tile`, 32 px, `muted`), el título, una línea de qué pregunta responde y un chevron si lleva a algún lado (un `Link`, un `button` o, sin ninguno, una tarjeta informativa). `TarjetaIndicador({ concepto, etiqueta, valor?, ayuda?, variacion?, tono?, cargando?, a?, producto?, className?, children? })`: la tarjeta de siempre (etiqueta, cifra, ayuda y el recuadro a la derecha), con `variacion` (`{ porcentaje, subirEsBueno? }`: la flecha dice hacia dónde fue, el color dice si es bueno —los egresos que suben son rojos—), `cargando` (un esqueleto en lugar de la cifra, el resto no salta), `a` (toda la tarjeta es un enlace) y `children` (el desglose de los turnos por estado). `IconoIndicador` es el ícono de 16 px para el título de un bloque. Sobrias: sin color la cifra es del color del texto; `tono` (`primario`, `exito`, `peligro`, `aviso`) pinta cifra y recuadro cuando eso dice algo, con su variante oscura.
4. **`TituloPantalla` acepta `acciones?: ReactNode`**, y es azúcar sobre `EncabezadoDePantalla`: con ella rinde `<EncabezadoDePantalla titulo={<h2>…</h2>}>{acciones}</EncabezadoDePantalla>`, **la misma fila, no una segunda definición** (un test compara el HTML de las dos formas); sin ella rinde exactamente el `<h2>` de antes. Las acciones no quedan adentro del `<h2>` (un lector de pantalla leería el nombre del botón como parte del título); en un celular bajan debajo del título. `auditoria-de-titulos` ya no exige que `icono` sea la primera prop (`<TituloPantalla acciones={…} icono={…}>` se lee bien), aunque el kit y los guards de los productos lo escriben primero. **No cubre** el caso de LibraCargo, donde el botón es de la pestaña activa y no de la pantalla: ahí `PantallaConTitulo` / `AccionesDelTitulo` (un portal) sigue siendo la respuesta, y es de ese producto.
5. **El guard: `libra-ui/auditoria-de-indicadores`** (de test, importa `node:fs`; lo copian los productos como `auditarTitulos`). En una pantalla de reporte o de tablero (por nombre: `Reporte*`, `Dashboard*`, `Tablero*`, `Inicio*`, `Indicador*`, `Kpi*`) no se importa de `lucide-react` ningún ícono que no sea de acción, de navegación o de estado (`LUCIDE_PERMITIDOS`: flechas, descargar, imprimir, el tilde, el glifo de «no hay nada»). Se compara por componente (`CheckCircle2` es `CircleCheck`), cubre el alias, el `import * as` y la ruta profunda, y devuelve cuánto midió (`archivos`, `pantallas`) para que una lista vacía no se lea como «está todo bien». `test/indicadores-por-catalogo.test.ts` lo corre sobre el kit y comprueba que fallaba antes (`Reportes` importaba 8 íconos y `Dashboard` 7). Los tres KPI que el kit todavía arma a mano (`Caja`, `Egresos`, `Margen`) están en una lista de deuda cuyo test exige que sigan violando: migrar una es sacarla de la lista.
6. **Reportes y Dashboard del kit migran**, con los mismos textos y el mismo comportamiento. Cambian de ícono: «Productos más vendidos» (`Boxes` → `Package`), «Egresos este mes» (`ArrowUpCircle` → `ShoppingBag`, el rubro Egresos), «Presupuestos sin respuesta» (`ClipboardList` → `Calculator`), «Últimos movimientos de caja» (`History` → `Wallet`), «Medios de pago» (`PieChart` → `Coins`), «Ventas en el período» (`TrendingUp` → `ShoppingCart`) y el aviso de stock (`AlertTriangle` → `PackageMinus`). Y cambia el color: los recuadros tintados de violeta, ámbar y celeste pasan al neutro del título, y los íconos de los bloques al gris; el color queda para las cifras que significan algo (éxito, peligro).

**Consecuencias.** Es aditivo para el que no migra: ningún producto cambia hasta que sube el pin y empieza a pasar conceptos. Las pantallas del kit que cambian de ícono (punto 6) lo hacen en todos los consumidores a la vez. Queda a cargo de cada producto: pasar sus índices y tableros a las tarjetas (con un `Record<slug, ConceptoIndicador>` tipado cuando el catálogo de reportes lo manda el servidor, como en LibraCargo), llamar a `auditarIndicadores` desde su test y, donde el menú diverge del catálogo (LibraDesk: `AlertCircle` para incidencias y reclamos, `UserCog` para técnicos; LibraCargo: `ReceiptText` para los comprobantes de proveedores), moverlo en la misma tanda. Queda fuera: `Caja`, `Egresos` y `Margen` del kit (la lista de deuda), el ícono de cada medio de pago, los gráficos, y que las pantallas del kit reciban `producto` para tomar la excepción de LibraCargo (hoy `Proveedores` del kit rinde `Truck` en todos; igual que en ADR-035).

**Cómo se agrega un concepto.** (1) Mirar si ya existe con otro nombre (`ICONOS`, sinónimos, propios); (2) la clave en `PROPIOS` de `src/iconos-indicador.ts` con un ícono de lucide que nadie use y una línea que diga qué mide y dónde se vio; (3) la fila en la tabla de `test/iconos-indicador.test.tsx` y en el README; (4) subir la versión del kit y, en la misma tanda, el pin de los productos que lo muestran. Un sinónimo es una línea en `SINONIMOS` y otra en el test.

## ADR-039 — Todo desplegable de datos de la suite se busca escribiendo: `SelectBuscable` por defecto y un guard (0.129.0)

El humano pidió el 2026-10-08: «todos los cuadros desplegables donde se puede elegir información, ya sea clientes, fleteros, choferes, localidades, etc, tienen que tener la opción de poder buscar por letras también. Esto debería estar en el motor y no en la app para que llegue a todas las aplicaciones de LibraSuite». ADR-031 ya había dado el modo «escribir para buscar», pero como **opt-in**: nueve de cada diez desplegables de datos de la suite siguen siendo el `Select` de Radix (sin búsqueda) o un `<select>` nativo.

**Qué ya existe** (se miró antes de diseñar, `reglas/producto.md`):
- `SelectBuscable` (0.9.0; ADR-031 el modo de campo con lupa; ADR-032 el buscador ignora los separadores entre números). Tenía el modo de campo detrás de `buscarEscribiendo`, sin opción deshabilitada, sin `required` y con un defecto que se midió acá (más abajo).
- El `Select` de shadcn/Radix (`src/ui/select.tsx`, ADR-006) y los `<select>` nativos de los productos.
- **LibraCargo ya tenía una respuesta propia: `Elegir`** (`frontend/src/components/Elegir.tsx`), que decide **por la cantidad de opciones** —`DESDE_CUANTAS = 12`—: menos, un `<select>` nativo; 12 o más, un `SelectBuscable`. La mide contra las listas reales de Suitrans (roles 3, medios 4; terceros 276, choferes 195, vehículos 180). Se descarta como criterio de la suite (más abajo) pero se reutiliza su punto de entrada: es **una** línea la que lo cambia.
- Los guards de lectura de fuentes: `campo-archivo-unico` (ADR-037), `auditoria-de-titulos` (ADR-035) y `auditoria-de-indicadores` (ADR-038), que los productos copian o llaman desde sus tests.
- LibraDesk ya usa `SelectBuscable` en 18 archivos (45 usos) y LibraCargo en 6 (7 usos), todos en el modo botón salvo dos.

**Lo que se midió** (2026-10-08, `origin/develop` de cada producto y este kit, con el propio guard, no a ojo):

| | desplegables | `<select>` nativos | de datos | cerrados por constante | cerrados a mano (≤ 8) |
|---|---|---|---|---|---|
| libra-ui (antes) | 74 | 0 | 45 | 14 | 15 |
| libracargo | 16 (+ `Elegir`, ~30 usos) | 13 | 4 | 9 | 3 |
| libraclub | 30 | 29 | 17 | 12 | 1 |
| libradesk | 68 | 1 | 26 | 33 | 9 |
| ventalibra | 10 | 0 | 7 | 0 | 3 |
| medlibra | 14 | 0 | 7 | 5 | 2 |
| gestiolibra | 9 | 0 | 5 | 3 | 1 |
| restolibra | 10 | 0 | 2 | 3 | 5 |
| contalibra | 6 | 0 | 0 | 3 | 3 |
| libra-backoffice | 3 | 0 | 2 | 1 | 0 |

Dos medidas más. (1) **Un `Escape` con la lista abierta, adentro de un diálogo de Radix, cerraba también el diálogo** y se perdía lo cargado: Radix escucha el `Escape` en `document`, en captura, antes que cualquier manejador de React. Estaba en `SelectBuscable` desde siempre; se volvía crítico en cuanto este componente pasa a ser el campo de casi todos los formularios (casi todos viven en un diálogo). (2) En los tests del kit, el `Select` de shadcn se stubea como un `<select>` nativo; ningún test de ningún producto busca el buscador interno del modo botón (`Buscar entre las opciones`: 0 en los nueve).

**Decisión.**
1. **El criterio es el origen de las opciones, no su cantidad.** Un desplegable es de *datos* si las opciones las arma el código a partir de algo que llegó de afuera (un `.map(…)` sobre una lista, una variable, una llamada, un componente): clientes, proveedores, fleteros, choferes, vehículos, localidades, productos, profesionales, pacientes, depósitos, cajas, cuentas, categorías, medios de pago de la instancia… **Todo desplegable de datos es `SelectBuscable`.** Con dos opciones se comporta como un select común: se abre con un click y se elige con otro; escribir es opcional. Es *cerrado* si son `<SelectItem>` / `<option>` escritos a mano y alcanzan hasta **8** (`MAX_CERRADO`): estado, tipo, sí/no, alícuota, orden, cantidad por página. Esos pueden seguir siendo `Select`. Más de 8 opciones fijas (provincias, meses) se buscan igual.
2. **Por qué no «todo es `SelectBuscable`».** Habría sido el criterio más simple, y se evaluó. Se descartó por una razón concreta: **en un celular, tocar un campo de texto abre el teclado**, y un «Sí / No» o una cantidad por página de tres valores no debería hacerlo. Los cerrados cortos no pierden nada por seguir siendo un `Select`: no hay nada que buscar.
3. **Por qué no por cantidad en tiempo de ejecución (`Elegir`, 12).** Un mismo campo se comportaría distinto según los datos de cada cliente: la lista de choferes de una empresa nueva tiene 5 (sin búsqueda) y la de Suitrans 195 (con búsqueda); el campo que «tenía buscador» deja de tenerlo si se borran siete choferes. Se pierde la propiedad que el humano pidió, que es **que sea una regla de la suite y no un accidente de los datos**. La excepción para las listas de una constante que son cortas de verdad es explícita y está en el código (punto 6).
4. **`buscarEscribiendo` pasa a ser el modo por defecto.** ADR-031: en el modo botón la gente no descubre que puede escribir, y el humano lo pidió explícitamente. Sin la prop (o con `true`) el control es el campo con lupa; el botón con el buscador adentro es **`buscarEscribiendo={false}`**, que se conserva sólo para el que lo necesite (y no se recomienda). Es una versión **menor** (0.x), con esta nota de migración:
   - Los consumidores existentes de `SelectBuscable` (LibraDesk 45 usos, LibraCargo 5 en modo botón, MedLibra 4, GestioLibra 2, RestoLibra 1, Contalibra 1) **cambian de aspecto** al subir el pin: de un botón a un campo con lupa. Ninguno pasa un `className` propio del botón (son todos anchos: `w-48`, `w-full`, …), y `className` ahora va al contenedor, que es lo que tiene ancho. **Los 23 usos de LibraDesk sin `className` pasan de medir lo que mide su texto a ocupar el ancho de su contenedor** (el botón era `inline-flex`; el campo es un bloque): conviene mirarlos.
   - Los tests de los productos que abren el control con un click y eligen una opción (`getByRole('combobox')` + click + `getByRole('option')`) **siguen andando sin tocarse**: el campo también es `role="combobox"` y abre con el click. Los que leen el texto del botón (`toHaveTextContent`) pasan a `toHaveValue`, y los que escriben en `Buscar entre las opciones` pasan a escribir en el propio combobox (en los nueve productos no hay ninguno). En el kit se tocaron 22 archivos de test (20 de pantallas, el de `SelectBuscable` y los helpers): por el paso de `Select` a `SelectBuscable`, que ya no deja las opciones en el DOM mientras la lista está cerrada, y no por el cambio de modo. Los helpers `elegirEnBuscable` y `opcionesDe` (`test/helpers-pantallas.tsx`) son el atajo.
   - `buscarEscribiendo={false}` devuelve el botón sin otro cambio: un producto que prefiera migrar por etapas lo pone en sus usos viejos.
5. **Lo que le faltaba a `SelectBuscable` para reemplazar a un `Select`**, todo opcional: `OpcionSelect.disabled` (se ve, `aria-disabled`, las flechas la saltean, ni el click ni `Enter` la eligen; la usa la lista de cajas de VentaLibra, que marca las que ya tienen un turno abierto), `required` (`required` en el `<input>`, así el navegador no deja enviar vacío; `aria-required` en los dos modos), `limpiable` (la × se ofrece por defecto salvo en un campo `required` o si la lista ya trae una opción de valor `''`; `limpiable={false}` la saca donde vaciar no es una elección) y `title` (el nombre completo cuando la etiqueta se corta, que Reposición ya ponía). **Una opción de valor `''`** («Todas las cajas») se muestra como etiqueta del campo cuando no hay filtro y reemplaza a los centinelas `__todas__` / `__base__` / `__none__` que el `Select` de Radix obligaba a inventar (no admite `value=""`); la × no se ofrece si está. **Con `FormControl`** anda como antes (`id`, `aria-describedby`, `aria-invalid`). **Teclado:** flechas, `Enter`, `Escape` y `Tab` como en ADR-031; **`Escape` con la lista abierta ya no cierra el diálogo de afuera** (se escucha en `window`, en captura, y sólo si el foco está en el control). **Quedó afuera**, porque ningún uso del inventario lo pide: `name` para formularios nativos (los selects de la suite son controlados; los `FormData` del inventario son de archivos), grupos (`SelectGroup`: 0 usos), un `render` propio del ítem (los cuatro casos con contenido propio son un depósito con su sucursal, que ya entra por `hint`, y un punto de color en un estado, que es un cerrado) y `size`.
6. **El guard: `libra-ui/auditoria-de-selects`** (de test, importa `node:fs`; lo copian los productos como `auditarIndicadores`). `auditarSelects(src)` lee los fuentes (sin tests ni la carpeta `ui/`), encuentra cada `<Select>` y cada `<select>`, y falla si las opciones son de datos o son más de 8 fijas. Devuelve cuánto midió (`archivos`, `desplegables`, `nativos`, `shadcn`, `cerrados`, `marcados`) para que una lista vacía no se lea como «está todo bien». **La excepción es explícita y vive en el código:** una lista que sale de una constante y es corta de verdad (`ESTADOS.map(…)`) lleva en el mismo renglón o en los tres de arriba un comentario `select-cerrado: <motivo>`; sin motivo no vale. Las marcas se cuentan (`marcados`) y el test del kit acota su número. `prohibirNativos: true` además rechaza cualquier `<select>` nativo, aun cerrado. No ve un desplegable armado con un envoltorio propio que reciba las opciones como `children` (se audita el envoltorio, que es lo que se migra), ni una lista que llegue por `{children}` desde afuera. `test/auditoria-de-selects.test.ts` lo corre sobre el kit (0 infracciones, 29 desplegables, 14 marcados), prueba cada forma de armar una lista (`.map` en una o varias líneas, variable suelta, llamada, componente, con un condicional alrededor) y comprueba que falla con una violación: sobre el kit original, antes de migrar, marcaba 59 de 74.
7. **Los desplegables de datos del kit migran** (45 de los 74): `Caja`, `CajaMedios`, `Cajas`, `ClienteDetalle` (lista del add-on), `CompraDetalle`, `CuentaCorrienteDetalle`, `DepositoTransferencia`, `EgresoDetalle`, `EtiquetasGondola`, `FacturaDetalle`, `LineasDePago`, `ListaPrecioDetalle`, `ListasPrecio`, `Logs` (el de la raíz y el de `comercio/`), `PresupuestoForm`, `Productos` (unidad, estación y proveedor habitual), `Reposicion`, `Stock`, `Tesoreria`, `TesoreriaDetalle`, `Turnos`, `Vencimientos`, `Ventas`. Los **14** que salen de una constante (`IVA_CONDITIONS`, `TIPOS_COMPROBANTE`, `COLUMNAS`, `TIPOS_DE_CODIGO`, `TIPOS_CUENTA_TESORERIA`, `CONDICIONES_IVA`) o del producto en código (`roles`, `tipos` de depósito) llevan la marca con su motivo; los **15** de opciones escritas a mano no cambian. Los centinelas `__todas__`, `__base__`, `__none__`, `ninguna` y `__sin__` del `Select` de Radix desaparecen donde el estado ya admitía `''`; donde el estado usa un valor propio (`TODAS`, `SIN_LISTA`, `SIN_VARIANTE`, `'0'` en `CajaMedios`) se queda y la opción lleva `limpiable={false}`.

**Consecuencias.**
- Subir el pin cambia el aspecto de los 45 desplegables de datos del kit en todos los consumidores a la vez (de un botón con chevron a un campo con lupa), y de los `SelectBuscable` que ya había (punto 4). La lista de abajo es lo que cada producto tiene que hacer después.
- **Hay un límite que no se tocó:** la lista es `absolute` dentro de su contenedor (no un portal). Adentro de un diálogo con scroll, un campo pegado al borde de abajo agranda el scroll del diálogo en vez de abrirse hacia arriba, y dentro de un contenedor con `overflow: hidden` se recorta. El modo botón tenía lo mismo y once pantallas conviven con eso; llevarlo a un `Popover` de Radix es un cambio de otro orden (agrega una capa que dispute el foco con el diálogo, lo que los productos evitaron a propósito) y queda para cuando se mida un caso real.
- **No se verificó en un navegador real** el aspecto del campo en las pantallas que cambian (ancho, modo oscuro, el alto táctil de 44 px bajo `lg`: el campo es `h-9`, como el `Input`). Los tests miden la lógica y el DOM, no el layout.
- **Lo que cada producto tiene que hacer** (otra tanda): (a) subir el pin; (b) migrar sus desplegables de datos a `SelectBuscable` —el relevamiento de arriba da la lista, y el guard la repite—; (c) a los cerrados que salen de una constante, ponerles `select-cerrado: <motivo>` o dejarlos; (d) llamar a `auditarSelects` desde su test; (e) en LibraCargo, que `Elegir` deje de decidir por cantidad y use siempre `SelectBuscable` para los datos.
- Un desplegable cerrado nuevo con más de 8 opciones, o uno de datos, se detecta en el test del producto y no en la revisión.

**0.129.1 (2026-10-08) — la × pasa a pedirse.** Medido al migrar LibraDesk y LibraClub: los `SelectBuscable` que ya existían representan «todos» o «ninguno» con un centinela propio (`TODOS`, `'0'`, `__todas__`, `SIN_DEPOSITO`) y la × de 0.129.0 les mandaba `''`; `Number('')` da 0 y el filtro quedaba sin resultados (en `IncidenciaDetalle` llegaba `cliente_id: 0` al backend), sin que ningún test lo viera al subir el pin. Ahora la × sólo aparece con `limpiable`; la forma preferida de vaciar sigue siendo una opción de valor `''`. Además, el contenedor del `userMenu` del `Layout` corta la propagación del teclado: el typeahead del `DropdownMenuContent` de Radix le robaba el foco al selector de sucursal con la primera letra.

## ADR-040 — El título de la pantalla arranca a la altura de la marca del sidebar: el relleno de arriba es del `Layout`, no de la pantalla

El humano pidió el 2026-10-08, con la captura del Dashboard de LibraCargo: «en la mayoría de las pantallas de los sistemas en el lado derecho queda un espacio vacío arriba, el título de la sección no está alineado a la misma altura que el nombre de la aplicación, y es un montón de lugar que se pierde y que queda feo, es algo que tenemos que cambiarlo a nivel libra-ui para que lo tomen todos». (ADR-039 lo toma otra rama del kit; esta numeración deja ese hueco.)

**Qué ya existe** (se miró antes de diseñar, `reglas/producto.md`):
- `Layout.tsx`: el contenedor del contenido ya era del kit, con `p-4 pt-14 md:p-6 md:pt-6`. `pt-14` en celular es el hueco del botón flotante del menú (44 px + 8, ADR-024), y no se toca. El `md:pt-6` es el que estaba mal.
- `TituloPantalla` (ADR-035/038): la fila del título mide 32 px (el recuadro `size-8`; el `<h2>` `text-lg` sólo 28). Con `acciones` pasa por `EncabezadoDePantalla` (`flex-wrap items-center`).
- El encabezado del sidebar: `SidebarHeader` (`p-2`, primitiva canónica `libra-ui/ui/sidebar`, que los productos re-exportan) y la fila de la marca `px-2 py-1.5` de `Layout.tsx`. La marca (`MarcaProducto`, `h-8 w-8`) son 32 px.
- Los guards que leen fuentes con control positivo (`auditoria-de-titulos`, `auditoria-de-indicadores`, `campo-archivo-unico`): el patrón del guard nuevo.
- Nada que mida o corrija el relleno de las pantallas: se buscó `p-6`/`py-N`/`container` en los `pages/` de los nueve productos y en el propio kit.

**Lo que se midió** (Chromium 1243 contra el `Layout` y el `TituloPantalla` REALES del kit, con Tailwind 4.3.3 y el `tema.css`; una página de prueba fuera del repo, a 1280 px de ancho):

| caso | borde de arriba de la marca | borde de arriba del título (recuadro) | centro marca / título |
|---|---|---|---|
| antes, pantalla sin relleno propio (`md:pt-6`) | 14 | 24 | 30 / 40 |
| antes, pantalla con `<div className="p-6">` (LibraCargo) | 14 | 48 | 30 / 64 |
| **después** (`md:pt-3.5`), pantalla sin relleno | 14 | **14** | **30 / 30** |
| después, título con un botón `h-9` en la fila | 14 | 16 | 30 / 32 |
| después, pantalla que todavía lleva `p-6` | 14 | 38 | 30 / 54 |
| celular (390 px) | botón del menú 8–52 | 56 | sin cambios |

La cuenta: hasta el borde de arriba de la marca hay `SidebarHeader` `p-2` (8) + fila `py-1.5` (6) = **14 px**; la marca mide 32 (`h-8`) y el recuadro del título también (`size-8`), de modo que con 14 px arriba **los dos bordes de arriba, los dos centros (30) y los dos de abajo (46) coinciden**. El `pt-6` anterior dejaba el título 10 px más abajo; el `p-6` que las pantallas de LibraCargo le sumaban encima, 34 px (el espacio de la captura). En el resto de los productos el hueco era sólo el de los 10 px del Layout: sus pantallas no duplican (inventario abajo), pero el título igual quedaba más abajo que el nombre de la app.

**Decisión.**
1. **`md:pt-6` pasa a `md:pt-3.5`** en el contenedor del contenido (`p-4 pt-14 md:p-6 md:pt-3.5`). Los costados y el pie siguen en 24 px, el celular no cambia (`pt-14`). Se elige alinear el borde de arriba del recuadro del título con el de la marca y no sólo los centros: con la marca de 32 px y el recuadro de 32 las dos cosas son la misma cuenta, y el borde no depende de que el nombre del producto tenga una o dos líneas. `test/Layout.test.tsx` repite la cuenta con las clases de verdad (el `SidebarHeader` real, la fila del Layout y el contenedor): si alguien cambia el relleno del encabezado o el del contenido, el test dice cuál cuenta dejó de cerrar.
2. **Una pantalla no agrega relleno propio arriba.** El `Layout` la separa del borde y la alinea con la marca; un `<div className="p-6">` en la raíz lo duplica. Los bloques se separan con `space-y-N` o `gap-N`.
3. **`libra-ui/auditoria-de-relleno` (de test, importa `node:fs`; lo copian los productos como `auditarIndicadores`).** `auditarRelleno(src, { esPantalla?, excepciones? })` lee `pages/**/*.tsx` y falla si el elemento raíz de una pantalla —el `return` del componente (el `export default`, o el que se llama como el archivo, o los exportados), también los de `if (cargando) return …`, una flecha de cuerpo-expresión o los hijos directos de un fragmento— lleva `p-N`, `py-N`, `pt-N`, `mt-N` o `my-N` (con o sin `sm:`…`2xl:`; `p-0` no; `container … py-N` sí, por el `py`). Un `py-N` sobre un mensaje `text-center` («Cargando…», «No hay nada») no cuenta: es el aire del mensaje, no el de la pantalla. Devuelve `archivos`, `pantallas` y `raices` (el control positivo: un parser ciego devuelve cero y una lista vacía se leería como «está todo bien»), las `infracciones` con archivo, línea y clases, y los mensajes dicen qué hacer. **Excepciones explícitas y con motivo** (`{ 'pages/KdsMonitor.tsx': 'pantalla completa, fuera del Layout' }`) para lo que se dibuja fuera del `Layout` (login, reseteo, páginas públicas, monitores, impresión); una excepción que ya no viola o no existe sale en `sobrantes` y el test del producto tiene que fallar, para que la lista no sólo crezca. `test/relleno-de-pantallas.test.ts` lo corre sobre las 55 pantallas del kit (`comercio/*` y las sueltas), prueba cada forma de escribirlo con fuentes de juguete y comprueba que se pone rojo con una violación (verificado con un `p-6` temporal en `comercio/Ventas.tsx`: `comercio/Ventas.tsx:383: la pantalla arranca con <div className="grid gap-4 p-6">…`).
4. **Las pantallas del kit ya estaban limpias** (ninguna raíz de `comercio/*` ni de las sueltas lleva relleno): no hubo nada que corregir en `src/`, sólo el `Layout`. Lo que sí tiene `py-N` en el kit son piezas que no son pantalla (`agenda/chip`, `configuracion/tutoriales`), y el guard del kit no las mira.

**Inventario por producto** (`origin/develop` de cada uno al 2026-10-08, guard sobre `frontend/src/pages/**` más `components/AbmMaestro.tsx` en LibraCargo; «pantallas» son los archivos medidos, «raíces» los `return` leídos):

| producto | pantallas / raíces | con relleno propio |
|---|---|---|
| LibraCargo | 28 / 29 | **16 raíces en 15 archivos**: `p-6` en `Caja.tsx:219`, `CartasDePorte.tsx:221`, `CuentaCorriente.tsx:225`, `Entidades.tsx:56`, `Inicio.tsx:70`, `Logs.tsx:221`, `Ordenes.tsx:305`, `PreFactura.tsx:144` y `:156`, `PreFacturas.tsx:69`, `PreLiquidacionTransportistas.tsx:247`, `Reporte.tsx:333`, `ReportesIndice.tsx:58`, `Usuarios.tsx:20`; `p-4` en `FacturarPendientes.tsx:270`; `p-6` condicional (`encabezado ? 'p-6' : undefined`) en `components/AbmMaestro.tsx:362`, que usan las pantallas de `maestros/` |
| LibraClub | 29 / 37 | `Torneo.tsx:60` (`p-6`, «Cargando…») y `:63` (`space-y-3 p-6`). El portal público (`portal/*`, `p-4`) está fuera de `pages/` y fuera del Layout: legítimo |
| RestoLibra | 59 / 60 | `KdsMonitor.tsx:43` y `PedidosMonitor.tsx:67` (`min-h-svh … p-5`): pantallas completas fuera del Layout, excepciones |
| ContaLibra | 47 / 47 | ninguna |
| VentaLibra | 35 / 37 | ninguna |
| LibraDesk | 47 / 75 | ninguna |
| GestioLibra | 14 / 13 | ninguna |
| MedLibra | 17 / 16 | ninguna |
| libra-backoffice | 6 / 13 | ninguna |

O sea que lo del relleno doble es casi todo de LibraCargo (14 de las 28 pantallas); en los demás productos el único cambio es el del `Layout`. El barrido amplio (`p-4`…`p-9`, `py-4`…, `container` en cualquier etiqueta de `pages/`) no encontró nada más a nivel de raíz: lo que queda son botones y rejillas adentro de diálogos.

**Consecuencias.** Al subir el pin, los nueve productos suben el título 10 px (de 24 a 14) y quedan a la altura del nombre de la app; las pantallas de LibraCargo que siguen con `p-6` quedan 24 px más abajo hasta que lo saquen (es la tanda siguiente: quitar esas clases, cambiar `AbmMaestro` para que el `p-6` no exista, y declarar en cada producto el test con sus excepciones). Un título con un botón `h-9` en la fila (`acciones`) queda 2 px más abajo que la marca (la fila mide 36 y el recuadro se centra): se acepta, el borde del botón no es lo que se compara con el logo; un `size="sm"` (32) alinea exacto. Una marca más alta que 32 px (un `logo` propio con `h-9`) alinea el borde de arriba pero no el centro. Un producto que ponga un encabezado más alto en el sidebar tiene que tocar la cuenta, y el test se lo dice. Queda fuera: las pantallas que arman su raíz con un componente envoltorio propio (el guard mira la etiqueta que se escribe, no lo que el envoltorio hace por adentro), el `className` armado por una función, y las raíces que no son el componente de la pantalla.

**Cómo se adopta en un producto.** (1) Subir el pin; (2) sacar el relleno propio de las raíces que el guard marca; (3) copiar el test: `auditarRelleno(resolve(__dirname, '..'), { excepciones })` con `expect(r.pantallas).toBeGreaterThan(0)`, `describirInfracciones(r.infracciones)` vacío y `describirSobrantes(r.sobrantes)` vacío, y escribir el motivo de cada excepción.

## ADR-041 — «Generar pedido de certificado» en la tarjeta de ARCA (propuesta: 0.130.0)

El humano pidió el 2026-10-08, mirando la sección de certificados de Configuración / ARCA: «¿esta parte cuándo la usamos? ¿cuando es un cliente nuevo que contrata nuestro sistema? ¿cómo genero el certificado?». Aprobó un botón **«Generar pedido de certificado»** en esa misma pantalla. El motor lo resuelve en libracore (ADR-036); este ADR es la pantalla.

**Qué ya existe** (se miró antes de diseñar, `reglas/producto.md`):
- `configuracion/arca.tsx`: `ArcaCard`, `ParDeCredenciales` (un par por ambiente, el mismo componente para la facturación y para cada servicio), `SubirMitad` con `CampoArchivo` (ADR-037) y `BloqueDeServicio` (ADR-030) con las rutas `{basePath}/servicios/{servicio}/…`. El pedido se cuelga de `ParDeCredenciales`, así que sirve a los dos sin una segunda pantalla.
- `configuracion/arca-pares.ts`: los tipos del par (`ParDeArca`), `parDe`, `serviciosValidos`, `AMBIENTES_ARCA`. El estado del pedido viaja **dentro del par** que el motor ya manda: no hay una llamada más para saber si hay uno.
- `configuracion/tutoriales.tsx`: `TutorialArcaCertificado`, con el `openssl` a mano (también en la guía del motor y en el sitio de RestoLibra). Se conserva como alternativa.
- El patrón de diálogo con descarga de `qr-de-la-caja.tsx` (`Dialog`, enlace `download` al motor), el de `SubirMitad` para los `aria-label` por servicio y ambiente, y los guards que ya miden este código (`campo-archivo-unico`, `auditoria-de-selects`, `auditoria-de-relleno`).
- No hay nada que genere claves ni `.csr` en el kit ni en los ocho productos (`git grep` de `genrsa`, `openssl req` y `CertificateSigningRequest` en `origin/main`, 2026-10-08): sólo texto con las instrucciones a mano.

**Decisión.**
1. **El botón vive en la tarjeta de cada ambiente** y habla con las rutas del motor: `POST {basePath}/pedido` (o `…/servicios/{servicio}/pedido`) con `?empresa=&ambiente=`, `DELETE` para descartar y un enlace `download` a `…/pedido.csr`. **La clave nunca está en el navegador**: la respuesta trae el `.csr` (público) y el estado del pedido, y la descarga la sirve el motor. Un test recorre el DOM buscando `PRIVATE KEY`.
2. **Sólo si el motor lo declara.** El listado `GET {basePath}/servicios` suma `admite_pedido: true` en las versiones de libracore con el pedido; el kit muestra el botón, el desplegable y el tutorial nuevo únicamente con esa marca. Con un motor anterior la tarjeta es **byte a byte la de siempre** (el snapshot de `ArcaServicios.test.tsx` no cambió).
3. **Cuándo se ofrece:** par incompleto, vencido o a 30 días o menos de vencer (`puedePedirCertificado`). Un par vigente y lejos de vencer no lo ofrece. Renovar es el mismo trámite: el par que está facturando sigue en su lugar hasta que llega el `.crt`.
4. **El diálogo** pide CUIT, razón social y alias. El CUIT sale de la configuración de la instancia y la razón social de la nueva prop opcional `razonSocial` de `ArcaCard` (sin ella, vacío); en un servicio con delegación (`wscpe`) son sólo una sugerencia editable, porque el certificado puede ir a nombre de otra persona. El **alias sugerido** es producto + servicio + ambiente, en minúsculas y sin signos (`libracargowscpeprod`; ARCA no admite guiones), y el motor valida el resto (CUIT con verificador, razón social sin tildes, alias de 3 a 40 letras y números). El error del motor se muestra tal cual en el diálogo y no lo cierra.
5. **Los pasos para ARCA** salen de `pasosParaArca({ambiente, servicio, alias, cuit})`, texto plano y puro: producción es «Administración de Certificados Digitales» → alias + `.csr` → `.crt` → «Administrador de Relaciones de Clave Fiscal» (servicio, representante con el CUIT del certificado, computador fiscal = alias); homologación es WSASS → nuevo certificado → «Crear autorización a servicio». Cada ambiente muestra sólo los suyos.
6. **Con un pedido pendiente:** estado «Esperando el certificado de ARCA (pedido del dd-mm-aaaa)», alias y CUIT, descargar de nuevo el `.csr`, ver los pasos y **descartar**; el campo de clave **no existe** y se sube sólo el `.crt` por la ruta de siempre (el motor lo empareja y promueve la clave). **Descartar es un diálogo aparte** que dice que se pierde la clave y que el certificado que devuelva ARCA no va a servir; no hay «generar otro» con uno pendiente: se descarta primero, a propósito.
7. **«Clave privada (.key)» pasa a «Ya tengo una clave privada hecha afuera (avanzado)»**, en un `<details>`: sigue disponible para quien ya tiene un par, pero secundario.
8. **Refrescar sin desmontar.** El diálogo vive dentro de la tarjeta, así que refrescar con «Cargando…» después de generar le borraría los pasos justo cuando se leen. `ArcaCard.cargar(silencioso)` pide de nuevo la configuración, el estado y los servicios sin cambiar a «Cargando…». El test usa respuestas con latencia: contestando en el mismo instante React junta los dos `setState` y la desmontada pasa inadvertida (se verificó que el test se pone rojo con el refresco anterior).
9. `DIAS_DE_AVISO` pasa de `arca.tsx` a `arca-pares.ts` (sin cambiar el valor) para que lo compartan el aviso de vencimiento y `puedePedirCertificado`: dos copias de «30» eran dos umbrales posibles.

**Consecuencias.**
- Un producto sube los dos pines (libracore con ADR-036 y libra-ui) y la pantalla trae el botón; no hay que tocar nada más. `razonSocial` es opcional: `integraciones: { arca: { razonSocial } }` en `createConfiguracion` (o la prop de `<ArcaCard>`) prellena el diálogo; sin ella el campo arranca vacío.
- Las llamadas son las del motor: ningún producto escribe rutas ni acepta la clave.
- `TutorialArcaCertificado` gana la prop `conPedido`: con ella, lo primero es el botón y el `openssl` queda como «Alternativa».
- Fuera de alcance: presentar el `.csr` ante ARCA (se hace a mano), y copiar el contenido del `.csr` al portapapeles (se baja y se abre con un editor).
- No verificado en un navegador real ni contra ARCA: los tests usan los stubs de shadcn del paquete (`test/stubs`), no el `Dialog` de Radix.

## ADR-042 — La barra lateral un poco más oscura es un defecto del kit, y el tablero de LibraCargo, tarjetas anchas en dos columnas

El humano pidió el 2026-10-08, aprobado sobre una maqueta: (1) **el menú lateral un poco más oscuro en toda la suite** (el menú era `#fafafa` y el contenido `#fff`: no contrastaban; eligió el tono «C») y (2) **las tarjetas del tablero el doble de anchas y más bajas, en dos columnas**. Después acotó el segundo punto: «lo del dashboard que sea solo para LibraCargo, los otros dashboard de las otras suites están bien». El primero sigue siendo de toda la suite. (La numeración deja ADR-039 y ADR-040 como están; si otra rama toma el 041, se renumera.)

**Qué ya existe** (se miró antes de diseñar, `reglas/producto.md`):
- `tema.css` + `COLORES_DE_TEMA` + `aplicarTema` (ADR-007/009): `barraLateralFondo` ya era editable por el superadmin. **El defecto lo declaraba cada `index.css`** (`--sidebar`, `--sidebar-accent`, `--sidebar-border`, en `:root` y `.dark`; los nueve con los valores de shadcn) y `aplicarTema` sólo lo pisa cuando se elige uno (`removeProperty` si no: vuelve al CSS). Es el comentario de `tema.css` que decía «su defecto es el de cada producto».
- El ítem activo (ADR-036): `--libra-menu-activo-*`, que no depende de la barra, y `[data-active=true]` en `tema.css`. No se toca.
- `TarjetaIndicador` (ADR-038), con `children`, `variacion`, `tono`, `cargando`, `a`. Los guards de fuentes (`auditoria-de-selects`, `auditoria-de-relleno`) como molde del guard nuevo.
- Nada que agrupe las tarjetas: cada tablero escribía su `grid … cols` a mano (Dashboard, Reportes, Caja, Egresos, Margen del kit; LibraCargo `Inicio`; GestioLibra/MedLibra `Dashboard`; LibraClub `CajaPorMedio`; RestoLibra `ReportesSalon`).

**Lo que se midió** (Chromium 1243 contra `ui/sidebar`, `TarjetaIndicador` y `GrillaDeIndicadores` REALES del kit, Tailwind 4.3.3, `tema.css`, identidad de LibraCargo; página de prueba fuera del repo):

| | antes | después |
|---|---|---|
| barra / contenido, claro | `#fafafa` / `#fff`: 1,04:1 | `#ebebeb` / `#fff`: **1,19:1** |
| barra / contenido, oscuro | `#171717` / `#0a0a0a`: 1,10:1 | igual: 1,10:1 |
| texto del menú sobre la barra, claro | 18,97:1 | **16,61:1** (hover `#e1e1e1`: 15,1:1) |
| rótulo de grupo (texto al 70%) | 7,49:1 | **7,09:1** |
| ítem activo (LibraCargo): texto sobre su chip | 14,18:1 | 14,18:1 (no depende de la barra) |
| ítem activo: borde sobre la barra / chip sobre la barra | 2,74 / 1,07 | 2,40 / 1,07 |
| tarjeta de KPI, 1920 px (4 columnas) | 388 × 146 px | **793 × 70 px** (2,04× de ancho, 52% menos de alto) |
| tarjeta de KPI, 1280 px (2 columnas) | 473 × 122 px | 473 × 70 px |

**Decisión (a): el defecto lo da el kit.** `tema.css` declara `--sidebar: oklch(0.94 0 0)`, `--sidebar-accent: oklch(0.91 0 0)` y `--sidebar-border: oklch(0.89 0 0)` en `:root`, y los tres de siempre en `.dark`. Razones: «el arreglo de fondo vive en el kit» (con (b) el próximo ajuste de tono son nueve `index.css` y ya hubo dos divergencias de ese tipo en la historia de la suite), y no rompe nada de lo que hay: el `index.css` del producto va después y a igual especificidad ganaría (un producto que todavía no sacó su línea sigue como estaba, sin romperse); `aplicarTema` sigue ganando por estar en línea sobre `<html>`; el ítem activo tiene sus propias variables.
1. **Oscuro sin cambios.** La barra oscura ya estaba 0,06 de luminosidad (OKLCH) por encima del fondo (`0.205` contra `0.145`), la misma diferencia que el claro nuevo tiene con el blanco (`0.94` contra `1`). Se declara en el kit igual (para que el producto no tenga que), pero con los mismos valores.
2. **Sólo las tres variables.** `--sidebar-foreground`, `-primary`, `-primary-foreground`, `-accent-foreground` y `-ring` siguen en el producto (no cambian con el tono; `-primary` y `-ring` los pisa `aplicarIdentidad`).
3. **`COLORES_DE_TEMA.barraLateralFondo`**: `porDefecto` pasa a `#ebebeb` y deja de ser `defectoPorProducto` (ya no es de cada producto; «Apariencia» muestra y valida el que pinta el kit).
4. **Guard `libra-ui/auditoria-de-barra-lateral` (de test, importa `node:fs`).** `auditarBarraLateral(srcDelProducto)` lee las hojas `.css` y falla si alguna declara `--sidebar`, `--sidebar-accent` o `--sidebar-border` (con número de línea; el nombre es exacto, `--sidebar-accent-foreground` no cuenta; los comentarios no), y devuelve `hojas` (el control positivo) e `importaElTema` (sin `@import "libra-ui/tema.css"` el producto quedaría sin fondo de barra). `libra-backoffice` **no importa `tema.css`**: tiene que sumarlo (o declarar sus tres líneas con `excepciones`).
5. **Dudoso, a mirar con ojos:** el borde del ítem activo (marca al 45% sobre `colorClaro`) baja ~10% contra la barra más oscura; el más bajo es VentaLibra (1,41:1, antes 1,61:1). El chip, en cambio, se despega igual o más (1,07–1,15:1). No se tocó `MEZCLA_DEL_BORDE_ACTIVO`: es un cambio de ADR-036 que afecta a los ocho.

**Decisión: tarjetas horizontales, sólo para quien las pida.** El aspecto de siempre **no cambia**: no se migró ninguna pantalla del kit ni de otro producto, y no hay guard que obligue a usar la grilla.
1. **`TarjetaIndicador` acepta `disposicion="vertical" | "horizontal"`** (defecto: la de siempre, salvo que la grilla que la contiene diga otra cosa). Horizontal: recuadro de ícono de 40 px a la izquierda, etiqueta y ayuda (`text-xs`) en el medio (`min-w-0 flex-1`, envuelven), cifra a la derecha (`text-2xl font-bold`, `whitespace-nowrap`, alineada a la derecha), `px-4.5 py-3.5`. Conserva `tono`, `variacion` (debajo de la ayuda), `cargando` (esqueleto en el lugar de la cifra), `a` (la tarjeta entera es el enlace) y el ícono del catálogo con la excepción del producto.
2. **Con desglose (`children`) en horizontal: debajo, a todo ancho**, separado por una línea (`border-t`). Una lista en el medio le comería el lugar a la etiqueta. GestioLibra y MedLibra (`Dashboard`) la tienen: si pasan a la grilla ancha se ve así; si no, no cambia nada.
3. **La fila es `flex-wrap`.** Si la cifra no entra al lado de un ícono y 80 px de etiqueta (celular con una cifra de ocho dígitos), baja a su propia línea, alineada a la derecha, en vez de salirse de la tarjeta. Y la fila es `flex-1`: cuando la grilla estira una tarjeta a la altura de la vecina, el contenido queda centrado y no pegado arriba.
4. **`GrillaDeIndicadores` (`libra-ui/GrillaDeIndicadores`)**, `variante`: `estandar` (defecto: `grid gap-4 sm:grid-cols-2 2xl:grid-cols-4`, tarjetas verticales: lo de hoy) o `ancha` (`grid grid-cols-1 gap-4 lg:grid-cols-2`, tarjetas horizontales por contexto, sin repetir `disposicion` en cada una). `className` suma clases.
5. **Dos columnas desde `lg` (1024 px) y no desde `md` (768 px)**, que era lo pedido: con el menú abierto (256 px) a 768 px quedan ~460 px de contenido; dos tarjetas de 217 px no alcanzan para un ícono de 40 px y una cifra de ocho dígitos (medido: la cifra salía 47–90 px de la tarjeta y la página scrolleaba en horizontal). Con `lg`, entre 768 y 1023 px hay una columna de 449 px; a 1024 px, dos de 345 px (la cifra de 177 px entra al lado de una etiqueta corta).

**Cómo se adopta en un producto.** *Menú:* (1) subir el pin; (2) borrar de `frontend/src/index.css` las líneas `--sidebar`, `--sidebar-accent` y `--sidebar-border` del `:root` y del `.dark` (seis líneas); (3) copiar el test: `auditarBarraLateral(resolve(__dirname, '..'))` con `expect(r.hojas).toBeGreaterThan(0)`, `expect(r.importaElTema).toBe(true)` y `describirInfracciones(r.infracciones)` vacío. *Tablero ancho (LibraCargo):* cambiar el `<div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">` de `pages/Inicio.tsx` por `<GrillaDeIndicadores variante="ancha" className="mt-6">`.

**Lo que no cubre.** Una barra con un color elegido por el superadmin en «Apariencia» (`aplicarTema`) sigue siendo la que él eligió, en claro y en oscuro; sólo cambia el «de siempre». Un `bg-[#fafafa]` escrito en un menú de producto no lo ve el guard. En jsdom no hay hoja de Tailwind: los tests de `TarjetaIndicador` miden clases y estructura; el aspecto está medido en Chromium (tabla de arriba).

## ADR-043 — La barra lateral pasa a grafito en los dos modos, y el ítem activo se marca con una franja del color del producto

El dueño eligió el 2026-10-09, sobre una maqueta con tres propuestas (`diseños/barra-lateral-colores-propuestas.html` del wiki: velo de marca, tinta de marca y grafito común), la **«C», grafito común**: una sola barra casi negra con un dejo frío, igual en los nueve productos y en claro y oscuro. El color de cada producto queda en la marca y en el ítem activo, que es lo único con color en la barra. Reemplaza el gris claro de ADR-042 (aprobado el día anterior).

**Qué ya existe** (se miró antes de cambiar): el defecto de la barra ya es del kit (ADR-042, `tema.css`, con el guard `auditoria-de-barra-lateral`); el ítem activo tiene sus variables `--libra-menu-activo-*`, que fija `aplicarIdentidad` por producto (ADR-036) y el superadmin puede pisar desde «Apariencia» (`aplicarTema`, en línea); `IDENTIDAD[p].colorSobreOscuro` ya es el color de cada producto para fondos oscuros (ADR-033).

**Decisión.**
1. **`tema.css`:** `--sidebar` `oklch(0.235 0.008 265)` (#1c1e22), `--sidebar-accent` `oklch(0.285 0.01 265)`, `--sidebar-border` `oklch(0.295 0.01 265)` en claro; `oklch(0.18 0.008 265)` (#101215), `0.23` y `0.24` en oscuro.
2. **El kit fija ahora también el texto de la barra** (`--sidebar-foreground` y `--sidebar-accent-foreground`: `#f4f4f5`). Los `index.css` de los productos declaran un texto oscuro para la barra clara de shadcn; con la barra oscura en modo claro no se leía. Va con `:root:root` / `.dark.dark` (0,2,0): `tema.css` se importa antes que el `:root` del producto y a igual especificidad ganaría el producto. No hace falta tocar los productos.
3. **Ítem activo:** fondo grafito un punto más claro que la barra (`FONDO_DEL_ITEM_ACTIVO`, #2c2f35), igual en los ocho; texto blanco; y una **franja de 3 px a la izquierda** del `colorSobreOscuro` del producto, en lugar del marco de 1 px alrededor de un chip claro (`box-shadow: inset 3px 0 0`). `menuActivoDeProducto` devuelve `{ fondo, borde: colorSobreOscuro, texto }`; las variables y la clave `menuActivoBorde` de «Apariencia» no cambian de nombre (la etiqueta pasa a «franja»).
4. **`Layout`:** el nombre del producto en la barra usa `text-sidebar-foreground` después de `wordmarkClassName` (los productos pasan `text-[#2d2d2d]`, pensado para el login sobre blanco; `cn` lo descarta), y la empresa, el rol y el avatar del pie usan los colores de la barra en lugar de `muted`.
5. **`COLORES_DE_TEMA`:** `barraLateralFondo.porDefecto` `#1c1e22`, `menuActivoFondo` `#2c2f35`, `menuActivoBorde` `#a1a1aa` (el último recurso para un producto sin identidad).

**Medido** (WCAG 2.x): texto del menú 15,2:1 sobre la barra clara y 17,1:1 sobre la oscura; atenuado al 70%, más de 7:1; texto del ítem activo 12,2:1; la franja contra el ítem, de 4,50:1 (LibraDesk) a 8,04:1 (VentaLibra), y contra la barra, más de 5:1. Visto en Chromium 1243 sobre el `dist` de LibraCargo con la API simulada, en claro y oscuro.

**Lo que no cubre.** Una barra o un ítem activo que el superadmin eligió en «Apariencia» siguen siendo los elegidos (su texto se recalcula como siempre). Algo que un producto dibuje dentro de la barra con colores propios (`text-muted-foreground`, `bg-[#…]`) no lo cambia el kit: se mira con ojos al desplegar.

## ADR-044 — La factura de crédito MiPyME en la tarjeta de ARCA (varias cuentas con alias, la predeterminada y la modalidad) e Integraciones a todo el ancho (propuesta: 0.132.0)

El humano, el 2026-10-09: *«quiero que haya una pantalla en configuración donde cargar el CBU y que pueda seleccionar la modalidad de transmisión»*, *«el dueño de la empresa puede querer que le depositen en una u otra cuenta, así que se debe poder cargar más de un CBU»* y *«agregale un alias a cada CBU, así se puede elegir por alias o por CBU»*; más el texto de cuándo conviene SCA y cuándo ADC.

**Qué ya existe** (se miró antes de cambiar): el motor guarda `arca_config.fce_cbu` y `fce_transmision` y los acepta en el PUT de `build_arca_router` desde la FCE (libracore ADR de la FCE MiPyME); `AvisoFce` del kit ya le decía al usuario que los cargara «en la configuración de ARCA», **donde no había campos**. La lista de cuentas con alias la agrega el motor en este mismo cambio (`fce_cbus`, con `fce_cbu` como predeterminada).

**Decisión.**
1. **`ArcaCard`** suma un recuadro «Factura de crédito electrónica MiPyME»: una lista de cuentas (CBU de 22 dígitos, alias bancario opcional y un nombre), «Agregar CBU», «Quitar», un radio «Predeterminado» y el selector de modalidad (SCA / ADC / sin cargar) con la leyenda de cuál elegir (`AYUDA_MODALIDAD_FCE`).
2. **Se manda como lo guarda el motor:** `fce_cbus` (CBU sólo dígitos, alias en minúsculas, nombre sin espacios de más), `fce_cbu` = el CBU de la predeterminada (`""` con la lista vacía) y `fce_transmision` (`""` borra). Un CBU o un alias mal escritos, o repetidos, se dicen con el número de fila y **no se manda nada**.
3. **Sólo con un motor que conoce la lista** (`fce_cbus` en el GET, o sin fila todavía): con uno anterior la tarjeta es la de siempre y el PUT no lleva ninguno de los tres campos, para no pisar con vacío lo que ese motor tenga.
4. Los ayudantes (`cbuLimpio`, `aliasLimpio`, `problemaDelCbu`, `problemaDelAlias`, `problemaDeLosCbus`, `MODALIDADES_FCE`, `AYUDA_MODALIDAD_FCE`, el tipo `CbuFce`) viven en `configuracion/arca-fce.ts`, para que `arca.tsx` exporte sólo componentes. El selector de modalidad lleva `select-cerrado`: son las dos que acepta ARCA.

5. **Integraciones usa todo el ancho.** El humano, el mismo día: *«configuración, integraciones, ARCA y las otras que están dentro de integraciones no ocupan el total del ancho de la pantalla»*. El contenido al lado de la sub-navegación tenía `max-w-2xl` (672 px): se saca, y queda `min-w-0 flex-1` (lo que lo deja achicarse a 320 px). Las demás pestañas y el `Layout` no tenían tope. Un test fija que no vuelva a tener `max-w-*`.

**Lo que no cubre.** Elegir la cuenta **al facturar** es de cada pantalla de facturación (en LibraCargo, la pre factura); el formulario de facturas del kit sigue emitiendo con la predeterminada. Que cada CBU esté informado en ARCA («Registro de Facturas de Crédito Electrónica MiPyMEs» → Cuentas) no se puede verificar desde acá: lo dice la leyenda.

## ADR-045 — El generador de la clave de operación se exporta del kit (`libra-ui/comercio/clave-de-operacion`, 0.133.0)

**Qué ya existe** (se miró antes de cambiar): `src/comercio/clave-de-operacion.ts` ya tenía `nuevaClaveDeOperacion()` y lo usa `Reposicion`; `Vencimientos` llevaba una copia idéntica en el código (sólo cambiaba el comentario) y VentaLibra copiaba una tercera en `frontend/src/lib/clave-de-operacion.ts` para la devolución (ADR-041 de libracommerce), porque el kit no la exportaba.

**Decisión.**
1. **`package.json`** suma el subpath `./comercio/clave-de-operacion` (como `./comercio/medios-pago` y `./comercio/pagos`). Un producto importa `nuevaClaveDeOperacion` del kit en vez de copiarla.
2. **`Vencimientos`** borra su copia local e importa la del módulo.
3. **Contrato:** devuelve un UUID v4; usa `crypto.randomUUID` si existe y, si no (contexto no seguro: http en la red local), arma el UUID con `crypto.getRandomValues`, que sí está siempre. Un test (`test/clave-de-operacion.test.ts`) fija las dos ramas.

**Cómo se adopta en un producto.** Subir el pin a 0.133.0 y reemplazar la función copiada por `import { nuevaClaveDeOperacion } from 'libra-ui/comercio/clave-de-operacion'`.

**Lo que no cubre.** No cambia cómo cada pantalla decide cuándo renovar la clave (por intento, atada a la firma de los datos): eso sigue siendo de la pantalla.

## ADR-046 — El 401/403 genérico del backend llega en castellano en el `ApiError` (0.134.0)

**Problema.** El backend (`libraauth.session_auth` y FastAPI por defecto) contesta un 403 con `detail: "forbidden"` y un 401 con
`"not authenticated"`: en inglés y sin decir qué hacer. `comercio/errores-http.ts` (ADR-013) ya lo traducía, pero sólo lo usaban tres
pantallas; otras 62 del kit, y las de los productos, muestran `err.detail` tal cual. Medido en la demo de VentaLibra el 2026-10-10: el
visitante (Encargado, con lectura de todo) intenta crear un usuario en Usuarios y el diálogo muestra «forbidden».

**Qué ya existe.** La lista cerrada de `detail` genéricos y la traducción de `errores-http.ts`, que se mudan a `api-client.ts` sin cambios.

**Decisión.**
1. `ApiError` traduce el 401/403 genérico al construirse: «No tenés permiso para hacer esto.» y «Tu sesión venció. Volvé a iniciar
   sesión.». Esos textos quedan en `detail` y en `message`, y el original, en `detailOriginal`. Con eso se arreglan todas las pantallas
   de una vez, incluidas las de los productos que usan el cliente del kit.
2. Sólo se traduce un texto de la lista cerrada, y sólo con status 401 o 403. Un texto propio del backend («No tenés permiso para marcar
   productos que vencen.»), un `detail` objeto (los Términos pendientes) y cualquier otro status quedan como vinieron.
3. `describeErrorHttp` queda como envoltorio (agrega «Error de conexión.» para lo que no es un `ApiError`), y `esDetalleGenerico` se
   reexporta desde `comercio/errores-http` para no romper importaciones.

**Tests.** `test/api-client.test.ts`: 403 y 401 genéricos, un 403 sin cuerpo, el upload, un texto propio, un 404 «forbidden» y los
Términos. `test/Usuarios.test.tsx`: el alta rechazada se lee en castellano. Los de la traducción fallan sin el cambio.

**Lo que no cubre.** El backend sigue mandando «forbidden»: un cliente que no sea el kit (curl, otra integración) lo ve igual. En la
demo, el visitante sigue viendo los botones de Usuarios porque tiene lectura de todo; ahora el rechazo se explica.

## ADR-047 — La tarjeta de ARCA en pestañas: General, un ambiente por pestaña y un servicio por pestaña (0.135.0)

El dueño, el 2026-10-10, mirando Configuración → Integraciones → ARCA / AFIP: todo estaba apilado —la facturación (CUIT, punto de venta, ambiente, alias, factura de crédito MiPyME, los pares de homologación y producción uno abajo del otro) y, debajo, el bloque de cada otro servicio con sus dos pares—. Pidió reordenarlo en pestañas (la «opción A» de la maqueta que aprobó) y aclaró que el CTG y la Carta de Porte son **un solo servicio de ARCA** (`wscpe`, un certificado por ambiente): van en **una** pestaña.

**Qué ya existe** (se miró antes de cambiar, `reglas/producto.md`):
- `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` de shadcn, ya usados en `Configuracion` (secciones), `Logs` y `Facturas`. El kit no fija `activationMode` en ninguno: queda el de Radix.
- La sub-navegación por URL de Configuración (`?seccion=` y `?integracion=`, `useSearchParams`; ADR de `SubNavegacion`), que reescribe el query entero.
- `ResumenDelPar`, `AvisoDelSelector`, `AvisoDeVencimiento`, `puedePedirCertificado`, `DIAS_DE_AVISO` y `parDe` (arca-pares.ts): la lógica de qué dice un par ya está; el motor decide `completo`/`vencido`/`dias_para_vencer`.
- `BadgeEstado` / `AvisoEstado` (cinco tonos, borde y texto del mismo token, contraste AA medido; el aviso largo va en bloque, no en pastilla).
- `BloqueDeServicio` (ADR-030), `ParDeCredenciales` y el pedido de certificado (ADR-041), el editor de la FCE (ADR-044).

**Decisión.**
1. **Pestañas**, en este orden: **General** | **Homologación** | **Producción** | una por cada otro servicio (con su `etiqueta`, p. ej. «CTG y Carta de Porte»). Con un solo servicio (siete de los ocho productos) quedan las tres primeras. Abre en General.
   - *General*: CUIT, punto de venta, **«Ambiente para facturar»** (el selector de siempre, ahora con `htmlFor`), alias; `AvisoDeVencimiento` arriba; `AvisoDelSelector` junto al selector; la FCE como **resumen de una línea** («N cuentas · predeterminada: <nombre, alias o CBU …últimos 4> · <SCA/ADC>», «Sin cargar» si no hay nada) con **«Editar cuentas» / «Cerrar cuentas»** (mismo editor, mismas validaciones, sólo con `admiteFce`; si Guardar encuentra un CBU mal escrito con el editor cerrado, lo abre para que el mensaje se vea); Guardar ARCA / Probar conexión con sus mensajes; el tutorial del padrón al final.
   - *Homologación* y *Producción*: el `ParDeCredenciales` de ESE ambiente (subir, quitar, pedido de certificado, vencimiento) y el tutorial del certificado. Con más de un servicio, un `h3` dice «Facturación electrónica — Producción».
   - *Un servicio*: su ayuda y **sus dos ambientes lado a lado** (`xl:grid-cols-2`; apilados por debajo de 1280 px: junto a la barra de Configuración a 1024 px quedan unos 500 px y dos pares de media columna no entran), cada uno con su par, su «Probar» y su resultado. Dentro de la media columna el certificado y la clave se apilan siempre (`compacto`), porque `sm:` mide la pantalla y no la columna.
2. **Etiqueta de estado en cada pestaña**, siempre con texto (el tono sólo la refuerza; los tonos del kit ya cumplen AA). Ambiente, en este orden de prioridad: «Con error» (certificado ilegible) › «Sin cargar» (en rojo si es el que factura) › «Incompleto» (falta una mitad) › «Vencido» › «Vence pronto» (≤ 30 días) › «En uso» (el que factura, par completo) › «Cargado». Servicio: «Con error» › «Vencido» › «Completo» (dos pares; «Vence pronto» si alguno está a ≤ 30 días) › «Falta producción» › «Falta homologación» › «Incompleto» › «Sin cargar». Lo que pide acción gana sobre «En uso»/«Completo»: un par vencido nunca se rotula «Cargado». «Con error» e «Incompleto» no estaban en el pedido; se suman porque el par ya los distingue (`ResumenDelPar`) y rotularlos «Cargado» o «Sin cargar» sería mentir. La lógica es pura y está en `arca-pestanas.ts` (`estadoDelAmbiente`, `estadoDelServicio`).
3. **Encabezado.** Con más de un servicio el título es «ARCA»; con uno se conserva «ARCA (facturación electrónica)», porque sigue siendo lo que dice de qué es la tarjeta (y los siete productos que sólo facturan no ven un título nuevo). A la derecha, una pastilla **«Facturando en Producción» / «Facturando en Homologación»**, sólo si el par de ese ambiente está completo: decir «Facturando» de una instancia que no puede facturar es la mentira que esta pantalla evita (`AvisoDelSelector`).
4. **«Ambiente en uso» es el GUARDADO.** La pastilla, los «En uso» y el «Con este certificado se factura hoy» leen el ambiente de la última carga, no el que se está eligiendo en el selector sin guardar. Antes el «En uso» se movía en vivo con el selector. `AvisoDelSelector` sigue hablando del ambiente que se **elige** (es una advertencia sobre lo que se va a guardar).
5. **Dónde quedó cada aviso.** *El ambiente elegido sin par completo* (`AvisoDelSelector`): en General, junto al selector, igual que antes (y con el hint de «el par de X sí está cargado»). *Vencimiento* (`AvisoDeVencimiento`): en General; el vencimiento de cada par sigue en `ResumenDelPar` dentro de su pestaña y en su etiqueta. *Ambiente en uso*: arriba de su pestaña, «Con este certificado se factura hoy.» (verde) o, si no tiene el par completo, un bloque en rojo «Es el ambiente con que se factura y todavía no tiene el par completo: la facturación no va a funcionar…». *El otro ambiente*: «No es el ambiente con que se factura (hoy se factura en X). Lo que se cargue acá queda guardado, pero no se usa hasta elegir este ambiente en General.» *Resultado de una acción* (`error`/`aviso`): en la pestaña donde se hizo (Guardar y Probar en General, subir y quitar en el ambiente); un error de la carga inicial, en todas.
6. **La pestaña va en la URL**, siguiendo el patrón de Configuración: `?arca=homologacion|produccion|<servicio>` (General no lleva parámetro). Se parte del query existente (`seccion`, `integracion`) porque `setParams` lo reemplaza entero; cada clic empuja una entrada y «atrás» vuelve a la pestaña anterior. Un valor que no existe (o un servicio que el producto no tiene, o que todavía no llegó el listado) cae en General. **`ArcaCard` montada sin router** (una pantalla propia de un producto, un test) usa estado local: `useInRouterContext()` elige entre `ArcaConUrl` y `ArcaConEstado`, así que montarla fuera de un `<Router>` no tira.
7. **Las pestañas inactivas se desmontan** (Radix, y el stub de los tests lo imita), así que todo lo que no puede perderse al cambiar de pestaña vive en `ArcaTarjeta`: los campos, la lista de cuentas y si el editor de la FCE está abierto, y —nuevo— **el resultado de «Probar» de cada servicio**, que antes vivía en `BloqueDeServicio` (que se desmonta al salir de su pestaña).
8. **Contrato intacto.** `ArcaCard` recibe las mismas props (`producto`, `basePath`, `empresa`, `razonSocial`), llama a las mismas rutas con los mismos parámetros y manda el mismo PUT. Los `aria-label` («Certificado (.crt) — Producción» y compañía) son los de siempre.

**Lo que cambia respecto de ADR-030 y ADR-041.** Ambos fijaban que con la facturación sola, o con un motor sin `admite_pedido`, la tarjeta era «byte a byte la de siempre» (snapshot de `ArcaServicios.test.tsx`). Eso ya no vale por decisión del dueño: el snapshot se regeneró (ahora fija la pestaña General de un producto que sólo factura). Lo que se conserva y se testea es que la tarjeta con un backend sin `/servicios`, con uno que lista sólo `wsfe` y con una respuesta que no es una lista sean **idénticas entre sí**.

**Tests.** Nuevo `test/ArcaPestanas.test.tsx`: las pestañas con uno y con dos servicios, la URL (abrir, conservar el query, limpiar, valor inválido, «atrás», sin router), las etiquetas (tabla de ambientes y de servicios, y en pantalla), la pastilla y el ambiente guardado vs. el elegido, los avisos de cada pestaña, el resumen de la FCE y «Editar cuentas», los dos ambientes de un servicio y su grilla, y que «Probar» sobrevive al cambio de pestaña. Los existentes (`ArcaDosPares`, `ArcaFce`, `ArcaPedido`, `ArcaServicios`, `Configuracion`, `Configuracion-errores`) abren la pestaña antes de buscar un campo (`abrirPestana`, `test/helpers-arca.ts`) sin cambiar lo que verifican; «sin certificado no ofrece quitar» ahora mira las dos pestañas, porque en General no existe el botón y pasaría de rebote. El stub de `Tabs` reenvía `aria-label` de `TabsList`.

**Contenido del producto al pie de un servicio.** `ArcaCard` acepta `alPieDeServicio` (`{ [servicio]: ReactNode }`, opcional): lo que el
producto pone al pie de la pestaña de ese servicio (sin marco propio: el producto trae el suyo). Pedido del dueño: en LibraCargo, «Emitir Cartas de Porte
reales» va dentro de la pestaña «CTG y Carta de Porte», junto a los certificados que habilita, y no debajo de la tarjeta en todas las
pestañas. Sin la prop no cambia nada; un servicio que el producto no tiene no muestra su pie.

**Ambiente «en uso».** «En uso», la pastilla y «se factura hoy» leen el ambiente **guardado**, no el que se elige en el selector sin
guardar (confirmado por el dueño: lo más seguro). Así la pantalla nunca anuncia que ya se factura en producción antes de guardarlo.

**Lo que no cubre.**
- No se probó en un navegador real ni con el `tabs.tsx` de shadcn de un producto: los tests usan los stubs del paquete. Quedan por mirar con el producto: el ajuste de la barra de pestañas con la etiqueta adentro en 320–390 px (se usó `h-auto flex-wrap` como en Configuración) y la grilla de dos columnas del servicio.
- Un test de un producto (o un e2e) que busque un campo de ARCA tiene que abrir primero su pestaña.
- `activationMode`: el kit no lo fija en ningún `Tabs`; ARCA tampoco. Con el teclado de Radix (flechas) cada pestaña enfocada se activa y suma una entrada al historial.
- El pedido de certificado, «Probar» y la subida no cambian de lugar lógico, sólo de pestaña.

**Cómo se adopta.** Subir el pin a 0.135.0; no hay nada que tocar en los productos.

## ADR-048 — `Sucursales` muestra las sucursales contratadas y frena el alta al llegar al tope (`rutaDelLimite`, 0.136.0)

El motor (`libracore.limites`, ADR-041) guarda cuántas sucursales contrató la instancia y el abono se cobra por ellas: al pasar el tope el alta
(y la reactivación) dan 409 con «Tu plan incluye N sucursales. Para sumar otra, comunicate con nosotros.». Hasta acá el cliente se enteraba recién
al intentar el alta. VentaLibra monta `GET /api/limites/sucursales` → `{contratadas: int | null, activas: int}` (lectura de admin o del token
de servicio; ADR-073 del producto).

**Qué ya existe** (se miró antes, `reglas/producto.md`): ninguna pantalla del kit lee ese endpoint (`git grep` de «limite», «contratad», «sinAlta»
sólo da el estado de la subida del resguardo, que no tiene que ver). `Sucursales` ya muestra el `detail` de un 409 del alta en el formulario
(`formError`), y `soloLectura` ya esconde el alta.

**Decisión.**
1. `Sucursales` recibe `rutaDelLimite?: string`. **Es opt-in**: sin ella no se pide nada (otros productos que usan la pantalla y no montan el router
   no hacen un pedido que daría 404). El kit hace la lectura y no el producto porque tiene que releerla tras un alta o un 409.
2. Con tope, una línea sobria bajo el título: «N de M sucursales contratadas» (en singular con M = 1: «1 de 1 sucursal contratada», como el
   mensaje del motor). Es texto `muted`, sin tono de alerta: es información, no un error.
3. Con `activas >= contratadas` y el alta disponible: «Nueva sucursal» queda deshabilitada y debajo va el motivo con el mismo texto que
   `mensaje_de_limite` (`mensajeDeLimite`, exportada, copia del motor; si cambia allá, cambia acá). El botón apunta al texto con `aria-describedby`.
   Editar, predeterminar y «Ver depósitos» siguen andando: el tope sólo frena sumar otra.
4. **Un error de lectura nunca bloquea.** 403 (quien no administra), 500, red caída, `contratadas: null` o una forma inesperada: la pantalla queda
   exactamente como antes, sin aviso ni error. El backend sigue siendo la guarda real.
5. Se relee el límite después de un alta o edición exitosa y después de un 409 (alguien pudo usar el cupo). Si el alta igual da 409, se muestra el
   `detail` del backend en el formulario, como antes.
6. En `soloLectura` no hay botón que deshabilitar: se ve el cupo (si la lectura anduvo) pero no el motivo.

**Tests.** `test/comercio-sucursales.test.tsx` (`Sucursales contratadas`, 9): sin la prop no pide nada; sin tope igual a hoy; con cupo; en el tope
(botón deshabilitado, texto, `aria-describedby`, el diálogo no abre); pasado del tope y singular; lectura caída (403, 500, red, forma rara) igual a hoy;
409 con `detail` y relectura; relectura tras un alta; sólo lectura; paridad del texto. Los de comportamiento fallan sin el cambio.

**Lo que no cubre.** El texto de `mensajeDeLimite` está duplicado a mano con el del motor (el endpoint no lo devuelve). No se probó en un navegador
real. `SucursalDetalle` (alta de depósitos) no tiene tope y no cambia.

**Cómo se adopta.** Subir el pin a 0.136.0 y pasar `rutaDelLimite="/api/limites/sucursales"` en la página de Sucursales de VentaLibra. Los demás
productos no tocan nada.

## ADR-049 — «Recibir mercadería» es idempotente: una clave por intento y una sola llamada al motor (0.137.0)

**Problema** (anotado el 2026-10-01 en los pendientes de VentaLibra). El diálogo hacía tres llamadas (`POST /api/purchase-receipts`, una por línea a `…/items`, y `…/confirm`): tres commits sin ninguna identidad de operación. Si el motor guardaba la recepción pero la respuesta se perdía y la persona reintentaba, el diálogo volvía a empezar desde la primera y el stock entraba dos veces (con lote o sin lote). Además un corte entre llamadas dejaba una recepción en borrador a mitad de camino.

**Qué ya existe** (se miró antes de cambiar): `nuevaClaveDeOperacion()` (ADR-045), el patrón de `Vencimientos` (clave por intento, reusada mientras los datos no cambian, intento incierto guardado en `sessionStorage` con el cuerpo completo, guardar falla cerrado, «Reenviar / Descartar») y el de `reposicion-ordenes` (el pedido entero como intento). No se inventó otro mecanismo: se aplicó el mismo a esta pantalla.

**Decisión.**
1. `RecibirMercaderiaDialog` manda la recepción **entera** (proveedor, orden, remito, depósito, líneas con su lote y vencimiento) más `clave_operacion` a `POST /api/purchase-receipts/recibir` (ADR-045 de libracommerce, revisión `0006`): el motor la crea, la carga y la confirma en una transacción, y un reintento con la misma clave contesta la recepción original con `repetida: true` sin mover stock.
2. **Una clave por intento, reusada mientras los datos no cambien.** Volver a apretar «Recibir» tras un rechazo del motor (no se escribió nada) reusa la clave; si la persona cambia algo (cantidad, costo, lote, depósito, remito) es otra recepción y la clave se regenera. Dos recepciones legítimas iguales seguidas llevan claves distintas.
3. **Un intento incierto no se pierde ni se pisa** (`src/comercio/recepcion-pendiente.ts`, a lo sumo uno por orden). Incierto = sin respuesta (red, timeout), un 5xx, un 408 o un 503 que no sea el de la migración; definitivo = un 4xx (menos el 408) o el 503 que dice `libracommerce-migrar upgrade`. El intento se guarda **antes** de enviar con su cuerpo y su clave; mientras haya uno sobre la orden, el formulario se reemplaza por lo que se había mandado y sólo se ofrece «Reenviar el intento anterior» (mismo cuerpo, misma clave) o «Descartar el intento anterior…» (con la advertencia de que si se registró, descartarlo puede duplicar el ingreso). Se borra con un resultado definitivo, con `repetida` o al descartarlo. Sobrevive a cerrar el diálogo y a recargar la pestaña (`sessionStorage`; la memoria de la pestaña manda).
4. **Guardar falla cerrado**, igual que en Vencimientos: si el intento no queda en el storage (cuota, modo privado), no se envía y se avisa. Sin el cuerpo y la clave guardados, un reintento tras una respuesta perdida sería otra recepción.
5. Si el motor contesta `repetida: true`, la pantalla lo dice («Esa recepción ya estaba registrada (era un reintento): no se cargó dos veces.») y recarga la orden y las recepciones.
6. `RecepcionRecibida` (`PurchaseReceipt & { repetida }`) en `tipos.ts`. Ya no existe la recepción a medias que dejaba este diálogo, así que `onRecargarRecepciones` desaparece de sus props; la sección «Recepciones de esta orden» (con «Confirmar») se queda para los borradores que ya existan o los armados por la API.

**Tests.** `test/comercio-ordenes-compra.test.tsx`: el cuerpo (una sola llamada, con un UUID v4), el corte sin respuesta y el reenvío con la misma clave y el mismo cuerpo, el 5xx incierto, el 4xx definitivo (misma clave con los mismos datos, otra al cambiarlos), la persistencia tras cerrar y recargar, el descarte con confirmación, el storage que falla (no se envía) y un motor que no manda `repetida`. `test/recepcion-pendiente.test.ts`: el almacén y la clasificación definitivo/incierto. Fallan si el reenvío genera otra clave o si la clave se regenera en cada clic. Los tests de lote y vencimiento pasaron al cuerpo nuevo sin cambiar lo que afirman.

**Lo que no cubre.**
- **Otra pestaña u otro navegador** no ve el intento guardado; ahí lo único que protege es el motor (misma clave y mismo cuerpo, `repetida`).
- **Kit nuevo con motor viejo**: `POST /api/purchase-receipts/recibir` no existe antes de libracommerce con la revisión `0006` (405/404, o 503 sin la revisión aplicada). Se suben juntos en el producto; no hay vuelta atrás al flujo de tres llamadas.
- Un intento pendiente de una orden que ya no admite recibir (el botón desaparece) queda guardado e inofensivo hasta cerrar la pestaña.
- No se probó en un navegador real ni contra el motor: los tests usan el `fetch` falso del kit. La prueba de punta a punta (el motor contestando `repetida` al reintento) está en libracommerce.

**Cómo se adopta.** Subir el pin del kit a 0.137.0 **y** el del motor al tag con la revisión `0006` en el mismo cambio, y correr `libracommerce-migrar upgrade` antes de arrancar. El producto no tiene que tocar código: si filtra respuestas por prefijo de ruta (VentaLibra: costos y permisos de `/api/purchase-receipts`), `/recibir` queda cubierta.

## ADR-050 — Plata y cantidades tienen un solo formateador, en el nivel general del kit: `libra-ui/formatos` (0.138.0)

**Problema.** Cada pantalla traía su copia: 25 `formatCurrency` (más `moneda` en Margen y en las órdenes de reposición) y cuatro `numero` para cantidades (`Reposicion`, `Vencimientos`, `reposicion-ordenes`, `Margen`). Idénticas hasta que una no lo es: las cantidades de Compras salían con el «.0» del motor («6.0») porque esa pantalla no tenía copia (0.137.1 la resolvió con `formatoCantidad` en `comercio/tipos`). Un formateador de números no es de comercio —lo necesita cualquier producto—, y en `comercio/tipos` no lo podían importar los que no usan ese subárbol.

**Qué ya existe** (se miró antes de cambiar): `formatoMoneda` y `formatoCantidad` en `comercio/tipos.ts` (0.137.1) y `fechas` como módulo general de fechas, exportado como subpath. No había un módulo de números en el kit.

**Decisión.**
1. `src/formatos.ts`, exportado como `libra-ui/formatos` (junto a `libra-ui/fechas`), con `formatoMoneda(valor: number)` (`$ 1.234,56`) y `formatoCantidad(valor: string | number)` (`6`, `1,5`, `1.250`; `maximumFractionDigits: 10`; un valor no finito se devuelve como vino). Los `Intl.NumberFormat` se construyen una vez.
2. `comercio/tipos` **sigue re-exportando** las dos: los productos las importan de ahí y no tienen que tocar nada para subir el pin.
3. Se migraron las copias del kit: los 24 `formatCurrency` de pesos con dos decimales y las `numero`/`moneda` de `Reposicion`, `Vencimientos`, `reposicion-ordenes` y `Margen`. **`Dashboard` quedó con el suyo** (pesos enteros, `maximumFractionDigits: 0`); lo resuelve la nota de abajo.
4. **`Margen.numero` pasa de 3 a 10 decimales sin cambiar lo que se ve.** Es una cantidad (unidades vendidas) y el motor ya las redondea a 3 (`unidades`) y a 2 (`unidades_por_dia`) en `erp/margen.py`; `Intl` no agrega ceros, así que un tope mayor que el del motor no imprime nada más. Los porcentajes (`Margen.porcentaje`, `TarjetaIndicador`) y los tamaños de `CampoArchivo` tienen su tope a propósito y no se tocaron.
5. Un guard (`test/formatos.test.ts`) falla si una pantalla vuelve a armar su `Intl.NumberFormat` de pesos (`style: 'currency'`) o de cantidades (`maximumFractionDigits: 10`) fuera de `formatos.ts`.

**Tests.** `test/formatos.test.ts`: entero, fracción, miles, texto decimal del motor («6.0», «1.50»), 6 decimales sin recortar, negativo, valor no numérico, la plata, que `comercio/tipos` exporta las mismas funciones, y el guard contra copias nuevas. Las pantallas migradas conservan sus tests de siempre sin cambios: no cambia ningún texto visible.

**Lo que no cubre.** `formatoCantidad('')` da «0» (`Number('')` es 0) y `formatoMoneda` sigue sin aceptar texto: quien reciba un importe como texto del motor hace `formatoMoneda(Number(x))`. `Compras`/`CompraDetalle` tienen helpers de monto sin símbolo (`toLocaleString` con 2 decimales fijos) que tampoco se movieron: no son copias de estos dos.

**Cómo se adopta.** Subir el pin a 0.138.0. Cada producto puede cambiar sus copias locales de `Intl.NumberFormat('es-AR', …)` por `import { formatoMoneda, formatoCantidad } from 'libra-ui/formatos'`; no es obligatorio para subir el pin.

**Nota (pesos enteros): `formatoMonedaEntera`.** «Otro formato» no era razón para dejarlo afuera: los pesos sin centavos también se repiten en los productos (contalibra, libradesk, libra-panel), cada uno con su `Intl`. `formatos.ts` suma `formatoMonedaEntera(valor: number)` (`$ 1.235`; ARS con `minimumFractionDigits: 0` y `maximumFractionDigits: 0`, redondea sin truncar), el `Dashboard` del kit la usa en lugar de su `formatCurrency` local —mismo texto, medido contra la función anterior— y el guard ya no exceptúa ningún archivo: también falla ante `maximumFractionDigits: 0` fuera de `formatos.ts`. El mínimo en 0 se escribe aunque Node 22 lo deduzca solo: con el mínimo por defecto de la moneda (2) y un máximo de 0, los motores más viejos tiran `RangeError`. Quien necesite los centavos usa `formatoMoneda`; un importe que se factura o se cobra no va en pesos enteros. *(0.143.0, ADR-055: el guard pasó a detectar cualquier `Intl.NumberFormat` o `toLocaleString` suelto, con una lista de excepciones justificadas.)*

## ADR-051 — `Vencimientos` separa `puedeMermar` de `puedeMover` (0.140.0)

**Problema.** `Vencimientos` tenía una sola prop, `puedeMover`, para tres cosas: asignar un vencimiento, cargar stock con lote y dar de baja un lote (merma). Un producto cuya matriz de roles distingue la baja de un lote del resto (la merma descuenta stock y no se deshace) no podía ocultar «Dar de baja (merma)» sin ocultar también «Asignar vencimiento» y «Cargar stock con lote». El pedido está en el wiki desde el 2026-09-30 (pendientes de VentaLibra).

**Qué ya existe** (se miró antes de cambiar): `puedeMover` y `puedeMarcar` (ADR de la pantalla, 0.91.0 y 0.92.0); el 409 del motor al dar de baja ya se mostraba con su `detail` (`mensajeDeError` → `role="alert"` del diálogo) y ya estaba cubierto por tests de `clave_operacion` y de saldo insuficiente.

**Decisión.**
1. Prop nueva `puedeMermar?: boolean`. **Si no se pasa, vale lo que `puedeMover`** (`puedeMermar = puedeMover` como default del parámetro): quien no la pasa se comporta exactamente como antes, con `puedeMover` verdadero o falso.
2. El botón «Dar de baja (merma)» y la columna «Acciones» de la tabla de lotes dependen sólo de `puedeMermar`. «Asignar vencimiento» (tabla «sin lote»), «Cargar stock con lote» y la revisión de cargas sin confirmar siguen dependiendo de `puedeMover`.
3. Las props sólo ocultan botones: el backend sigue siendo quien autoriza (403) y quien aplica las reglas de negocio. Un 409 del motor al dar de baja (saldo insuficiente, saldo «sin lote» negativo sin conciliar, clave reusada con otros datos) se muestra con su `detail`, sin traducir, y deja el diálogo abierto.

**Tests** (`test/comercio-vencimientos.test.tsx`): `puedeMermar=false` con `puedeMover` por default oculta la baja y su columna pero deja asignar y cargar; `puedeMermar=true` con `puedeMover=false` muestra la baja y esconde asignar y cargar; sin `puedeMermar` la baja sigue a `puedeMover`; un 409 «salidas sin lote sin conciliar» se muestra con su texto. Los dos primeros se ponen rojos sin el cambio.

**Cómo se adopta.** Subir el pin. Nadie está obligado a pasar la prop. Un producto con una capacidad propia para la baja pasa `puedeMermar={puede(user, '…')}`.

## ADR-052 — `Sucursales` deshabilita el alta con un motivo del producto (`motivoSinAlta`)

**Problema** (pendiente de VentaLibra §3.4). Cuando la instancia no puede dar de alta otra sucursal por un motivo que no es el tope de contratadas
(en VentaLibra, el módulo `multisucursal` apagado: el backend contesta 403), el botón «Nueva sucursal» seguía habilitado; el producto lo
rotulaba «(sin activar)», avisaba aparte en una caja y el cliente se enteraba del rechazo recién al guardar el formulario. `soloLectura` no sirve:
esconde también la edición, y renombrar o dar de baja la sucursal que ya existe tiene que seguir andando. El ADR-048 resolvió lo mismo para el tope
de contratadas, pero sólo con ese motivo.

**Qué ya existe** (se miró antes de cambiar): `soloLectura` (esconde el alta y la edición), `rutaDelLimite` y el lugar donde el kit escribe el motivo
del tope (`#sucursales-limite`, apuntado por `aria-describedby`; ADR-048). No hay otra prop que apague sólo el alta (`git grep` de «sinAlta»,
«motivoSinAlta», «altaDeshabilitada» no da nada).

**Decisión.**
1. `Sucursales` recibe `motivoSinAlta?: string`. **Es opt-in**: sin ella, o vacía, no cambia nada. Con texto, «Nueva sucursal» queda deshabilitada
   (el diálogo no abre) y el texto se muestra en el mismo lugar y con el mismo estilo que el motivo del tope (`muted`, sobrio, sin tono de alerta),
   apuntado por `aria-describedby`.
2. **El motivo lo pone el producto**, que es el que sabe qué falta (un módulo, un contrato, una suspensión); el kit no lo interpreta.
3. **Un solo aviso.** Si además se llegó al tope de contratadas, se muestra el motivo del producto y no el «Tu plan incluye N…» (dos razones para
   lo mismo serían dos avisos). La línea «N de M sucursales contratadas» se conserva: es información, no una razón.
4. Editar, predeterminar y «Ver depósitos» siguen andando: sólo se frena sumar otra. En `soloLectura` no hay botón y no se muestra el motivo.
5. Es una ayuda y no una guarda: el backend sigue cortando (403 o 409). Si el producto no pasa la prop o el estado cambia del lado del servidor, el
   formulario muestra el `detail` del rechazo, como antes.

**Tests.** `test/comercio-sucursales.test.tsx` (`Sucursales sin alta (motivoSinAlta)`, 5): deshabilita, muestra el motivo, apunta el botón a él y el
diálogo no abre, con editar y «Ver depósitos» andando; sin la prop o vacía queda igual que hoy; con el tope alcanzado el motivo va una sola vez y se
conserva el «N de M»; con cupo y sin módulo sigue deshabilitada; sólo lectura no muestra nada. Los tres de comportamiento fallan sin el cambio.

**Lo que no cubre.** No se probó en un navegador real. La prop no mira el estado del módulo: si el administrador lo prende con la pantalla abierta, el
botón sigue deshabilitado hasta recargar.

**Cómo se adopta.** Subir el pin del kit a la versión que incluya este ADR. Nadie está obligado a pasar la prop. VentaLibra la pasa cuando el módulo
`multisucursal` está apagado y retira la caja de aviso de esa pantalla.

## ADR-053 — Los errores del navegador llegan al registro de la instancia: `ErrorBoundary` e `instalarReporteDeErrores`

**Problema.** Una pantalla que se rompe en el navegador de un cliente no deja rastro en ningún servidor: un error de render desmonta toda la SPA y el
usuario queda frente a una pantalla en blanco; una promesa rechazada sin atrapar no se ve en ningún lado. El motor tiene desde `libracore` ADR-045 un
registro de errores propio (`DATA_DIR/errores/errores.jsonl`) y un `POST /api/errores-cliente` que espera estos reportes; faltaba el lado del navegador.

**Qué ya existe** (se miró antes de cambiar): ningún `ErrorBoundary`, `window.onerror` ni `unhandledrejection` en el kit (`git grep` de «ErrorBoundary»,
«componentDidCatch», «unhandledrejection», «onerror» no da nada en `src/`); `ApiError` (que ya traduce y conserva el `detail`) y la convención de
`api-client` de resolver las cosas transversales en un solo lugar y no pantalla por pantalla (sesión vencida, Términos). El endpoint, la limpieza de datos
y los topes viven en el motor (`docs/errores.md` de libracore); acá no se duplica nada de eso.

**Decisión.**
1. **`<ErrorBoundary>`** (`libra-ui/ErrorBoundary`): una clase (React no tiene otra forma) que, ante un error de render, muestra «Algo falló. Recargá la
   página.» con un botón «Recargar», hecha con `Card` y `Button` del consumidor (como `Login`). Si el error es un `ApiError` con `ref` —un 500 que reventó
   una pantalla— muestra el código para que soporte lo encuentre en el registro. **Nunca muestra el mensaje del error**: puede traer datos.
2. **`ApiError.ref`**: el `ref` del `{"detail": "Error interno", "ref": "…"}` que contesta el motor en un 500, tanto en `request` como en `postForm`. Es el
   cuarto parámetro opcional del constructor, así que nadie que construya un `ApiError` a mano se entera.
3. **`instalarReporteDeErrores({ release })`** (`libra-ui/errores-del-navegador`): escucha `error` y `unhandledrejection` y manda cada uno con
   `navigator.sendBeacon` a `/api/errores-cliente` (mismo origen: la CSP de las SPA es `connect-src 'self'`); sin `sendBeacon`, o si lo rechaza, `fetch` con
   `keepalive`. Se manda `{tipo, mensaje, stack, pagina, release}`; `pagina` es `location.pathname` —nunca la query ni el fragmento—. Idempotente.
4. **Qué no se reporta**: **ningún `ApiError`** (un 4xx es del usuario; un ≥ 500 ya quedó en el registro del backend con su `ref`, y reportarlo duplicaría
   cada 500), el ruido conocido (`ResizeObserver loop…`, `Script error.`) y los eventos sin error ni mensaje.
5. **Sin desborde**: dedup por mensaje + stack, **10 por pestaña**, y el payload se recorta hasta entrar en los 4 KB que acepta el backend.
6. **Mandar nunca es un error**: todo está envuelto; un `sendBeacon` que lanza, un `fetch` que falla o un reason ilegible se tragan en silencio, para no
   entrar en un bucle de reportar el reporte.
7. `ErrorBoundary` además reporta (`tipo: "render"`, con el stack de componentes) los errores de render que no son de la API, **sólo si el producto llamó a
   `instalarReporteDeErrores`**: sin eso, el boundary es sólo la pantalla.

**Tests** (`test/errores-del-navegador.test.ts`, `test/ErrorBoundary.test.tsx`, `test/api-client.test.ts`): qué se manda y a dónde; ningún `ApiError` (400, 401,
403, 404, 422, 500, 503) ni el ruido se reporta; dedup, tope de 10 y payload ≤ 4 KB; los caminos de `fetch` y los fallos de envío; la pantalla, el botón, el
`ref`, la ausencia del mensaje y el reporte de render; el `ref` en `request` y `postForm`.

**Cómo se adopta.** Subir el pin y, en `main.tsx`: `instalarReporteDeErrores()` antes de montar y `<ErrorBoundary>` alrededor de `<App />`. El backend tiene
que haber instalado `instalar_registro_de_errores` (libracore ≥ la que traiga ADR-045), si no el `POST` da 404 y los reportes se pierden sin ruido.

**Lo que no cubre.** No se probó en un navegador real (jsdom no dispara `onerror` como un navegador). Los errores de render sólo se atrapan debajo del
`<ErrorBoundary>`: lo que falle fuera, en `main.tsx`, queda en `window.onerror`. El `release` es opcional y lo decide el producto; el backend registra
siempre el de la imagen.

## ADR-055 — Deuda del kit (0.143.0): el guard de formateo mira cualquier número suelto, `@vitejs/plugin-react` 6.1.2 entra con un `overrides` y «Cambios» tiene ícono

Tres pendientes chicos que venían anotados en la bitácora, resueltos juntos. (El 054 se dejó libre: lo tiene otra rama.)

### 1. El guard de ADR-050 detecta también las formas sueltas de formatear un número

**Problema.** El guard de ADR-050 buscaba tres literales (`style: 'currency'`, `maximumFractionDigits: 0` y `maximumFractionDigits: 10`). Una copia nueva con otras opciones —`toLocaleString('es-AR', { maximumFractionDigits: 3 })`, un `Intl.NumberFormat` con cualquier tope— pasaba sin que ningún test lo notara.

**Qué ya existe** (se miró antes de cambiar): `test/formatos.test.ts` (el guard, con control positivo) y `formatos.ts`. Las copias de Reposición, Vencimientos y reposicion-ordenes que la bitácora anotaba el 2026-10-11 **ya estaban migradas en 0.138.0** (ADR-050): las tres importan `formatoCantidad` de `../formatos` y ya no queda ahí ningún `Intl` ni `toLocaleString`. Los tests de esas pantallas ya fijaban decimales y miles (`1.234,5`, `0,25`, `1.248 unid.`); `reposicion-ordenes` no tenía ninguno con decimales y ahora sí.

**Decisión.**
1. El guard falla ante cualquier `Intl.NumberFormat` o `.toLocaleString(` fuera de `formatos.ts`, salvo las líneas de fecha (`dateStyle`/`timeStyle`) y los comentarios. Las excepciones son una lista explícita **con la cantidad de veces y la razón**: si aparece una más, o una excepción desaparece, el test falla (no se acumulan excepciones muertas).
2. Excepciones legítimas hoy: `CampoArchivo` (tamaño de archivo: 0 decimales en bytes, 1 en KB/MB/GB), `TarjetaIndicador` (2, porcentajes con un decimal) y `Margen` (el porcentaje), `Productos.textoDecimal` (serializa un decimal en-US sin separadores para el campo: no es texto de pantalla), y `Compras`/`CompraDetalle.money` (monto sin símbolo con 2 decimales fijos).
3. Una copia que sí había: `Productos` escribía el tope de los mínimos con `MAX_MINIMO_SUCURSAL.toLocaleString('es-AR')`. Pasó a `formatoCantidad` (mismo texto: «1.000.000.000», lo fija su test).

**Lo que no cubre.** `Compras.money` y `CompraDetalle.money` son dos copias entre sí (monto sin símbolo, 2 decimales fijos) y quedan como excepción: no son `formatoCantidad` (que no fija decimales) ni `formatoMoneda` (que lleva el «$»). Si se quiere una sola, es un `formatoMonto` nuevo en `formatos.ts`. `Stock` arma «Stock resultante» a mano (`toFixed(3)` + `replace('.', ',')`, sin punto de miles): tampoco es `formatoCantidad` sin cambiar lo que se ve, y el guard no lo detecta (no usa `Intl`).

### 2. `@vitejs/plugin-react` 6.1.2: el `ERESOLVE` no era de Babel 8 sino de una dependencia opcional, y se resuelve con un `overrides`

**Causa (medida).** `npm install @vitejs/plugin-react@6.1.2` sobre el `package-lock.json` del kit da `ERESOLVE` (reproducido el 2026-10-13, npm 10.9.8). La cadena que muestra npm: `plugin-react@6.1.2` → *peerOptional* `@rolldown/plugin-babel` (`^0.1.7 || ^0.2.0`) → *peerOptional* `@babel/plugin-transform-runtime` (`^7.29.0 || ^8.0.0-rc.1`) → npm elige el más nuevo, el 8.0.6, que pide *peer* `@babel/core ^8`. Pero el kit tiene `@babel/core` 7.29.7 en la raíz, y **tiene que estar en la 7**: lo piden como peer `^7.0.0-0` los plugins de `@svgr/babel-preset` 8.1.0 (`@svgr/core` es lo que usa `unplugin-icons` para los íconos), y `@svgr/core` 8.1.0 es su última versión (no existe una que acepte Babel 8). Nada de eso se usa: el kit no usa `@rolldown/plugin-babel` ni el compilador de React (`vitest.config.ts` sólo llama a `react()`), y los tres peers de `plugin-react` son opcionales. El único cambio de `peerDependencies` entre 6.1.1 y 6.1.2 es `oxc-transform-react` (`^0.145.0` → `^0.152.0`, también opcional y no instalado): tampoco es la causa.

**Por qué recién ahora.** Sin lockfile (`npm install` en un directorio vacío con el mismo `package.json`) resuelve a 6.1.2 sin error; el `ERESOLVE` aparece sólo cuando npm tiene que **cambiar** el nodo de `plugin-react` dentro de un lock existente. Por eso dependabot (#291) lo trajo roto y quedó afuera del bump de #303.

**Decisión.** Se sube a `^6.1.2` y se agrega `"overrides": { "@babel/plugin-transform-runtime": "^7.29.0" }` al `package.json`: la cadena opcional queda en Babel 7, que es el que el kit tiene. No instala nada (el paquete sigue sin estar en el árbol) y el lock cambia **sólo** la entrada de `plugin-react` (más la versión del kit). Entra sin `--legacy-peer-deps` ni `--force`, y `npm ci` queda limpio. Sin el `overrides` el mismo `npm install` vuelve a dar `ERESOLVE` (medido). Se descartaron: ignorar 6.1.2 en dependabot (no es una versión mala: habría que ignorar cada versión nueva), agregar `@babel/core@8` (rompe los peers de `@svgr`) y `legacy-peer-deps` en `.npmrc` (esconde conflictos reales de todo el árbol).

**Condición para sacar el `overrides`.** Cuando `@svgr/*` acepte Babel 8 (o el kit deje `@svgr`). Mientras tanto no estorba: un override sobre un paquete que no se instala no tiene efecto.

**Los productos (relevado, no tocado).** En `origin/develop` y `origin/main`: contalibra, restolibra, gestiolibra, medlibra, libraclub, libradesk, libracargo, libra-backoffice y libra-panel ya tienen `^6.1.2` con 6.1.2 en el lock; **ventalibra sigue en `^6.1.1`/6.1.1**. Ninguno tiene `overrides`. `libraclub` es el único con `@svgr/core` (y `@babel/core` 7.29.7 en el lock): es el que va a chocar con la misma cadena en la próxima versión de `plugin-react` que tenga que actualizar; si pasa, lleva el mismo `overrides`.

### 3. El tipo `actividad` («Cambios») de los Logs tiene su ícono

**Problema.** `libracore` 1.157.0 suma el tipo `actividad` a `logs_router.TIPO_META` (altas y ediciones de la auditoría del motor, clientes hoy) y la pantalla de Logs de los productos comerciales le ponía el carrito de «Venta», que es el respaldo para un tipo desconocido.

**Qué ya existe.** El mapeo tipo → ícono vive **en el kit**, no en el motor: `TIPO_ICONS` en `comercio/Logs.tsx`. `TIPO_META` sólo manda `label` y `color`. La pantalla de la raíz (`Logs.tsx`, accesos de `libraauth.auditoria`) es otra y no se toca. El kit usa `lucide-react` (ADR-038).

**Decisión.** `actividad: PencilLine` (el lápiz con línea: un cambio hecho a un registro). Ningún otro tipo de Logs ni concepto del catálogo de identidad lo usa (`ScrollText` es la pantalla de Logs; `Pencil` y `History` ya significan otra cosa en Stock y MpBandeja). `actividad` **no** entra en `ALL_TIPOS`: ese listado es el respaldo mientras el motor no contestó, y un motor anterior a 1.157.0 no tiene el tipo; con el motor nuevo las píldoras salen de `tipo_meta` y aparece sola.

**Tests** (`test/comercio-informes.test.tsx`, `test/formatos.test.ts`, `test/comercio-reposicion-ordenes.test.tsx`): los ocho tipos del motor llevan en la píldora del filtro **y** en la fila el ícono esperado y no se repite ninguno (se pone rojo sin el cambio: el lápiz sale como carrito); las cantidades del resumen de reposición salen con miles y coma (`1.250`, `1,5`); el guard falla con una copia nueva (se probó agregando una a `Reposicion.tsx`) y reconoce las formas de copia.

**Cómo se adopta.** Subir el pin a 0.143.0. Un tipo nuevo del motor suma su fila en `TIPO_ICONS` en el mismo cambio que el kit.

## ADR-056 — Reposición en el celular: los filtros se pliegan y el valor de los selects ocupa hasta 2 líneas (`lineasEnMovil`, 0.144.0)

**Problema.** En un celular (390 px) la barra de filtros de «Reposición sugerida» —tres selects, dos números, tres casillas— ocupaba casi toda la primera pantalla y empujaba la tabla, que es lo que se vino a ver, bien abajo. Y el valor elegido de los selects (el nombre de una sucursal, categoría o proveedor) se cortaba a la primera línea con «…»: un nombre largo no se leía sin abrir la lista.

**Qué ya existe** (se miró antes de cambiar): ningún bloque plegable en el kit para filtros (`git grep` de `aria-expanded` en `src/` da sólo `Login`, `configuracion/arca` y el propio `SelectBuscable`: cada uno resuelve lo suyo, ninguno es un componente reutilizable); el layout de la barra ya viene de ADR-012 (un `flex-wrap`, los tres interruptores como un solo bloque) y se conserva tal cual desde `sm`. `SelectBuscable` no tenía cómo estilizar el texto del valor: en el modo por defecto (campo con lupa, ADR-039) el valor es el `value` de un `<input>`, que no parte en líneas; en el modo botón es un `<span class="truncate">`. El `title` con el nombre completo (ya puesto en Reposición) se conserva.

**Decisión.**
1. **Bloque «Filtros y parámetros» plegable, sólo bajo `sm` (640 px).** Un botón (`aria-expanded`, `aria-controls`, `sm:hidden`, 44 px de alto, foco visible) antecede al bloque de siempre. **Plegado por defecto.** El bloque cerrado lleva `hidden sm:flex` y abierto `flex`: sin JS de medición ni `matchMedia` (nada que sincronizar con el tamaño de la ventana, sin parpadeo en el primer render ni diferencia con jsdom). `hidden` saca los controles del orden de foco y del árbol de accesibilidad mientras está cerrado; desde `sm` el botón desaparece y el bloque se ve exactamente como antes.
2. **El encabezado resume lo activo**, en una o dos líneas: lo que acota la lista (sucursal, categoría, proveedor; «Toda la instancia» si ninguno), los días de cobertura + plazo (`30 + 7 días`) y las casillas prendidas, separado por « · ». Ejemplo: «Toda la instancia · 30 + 7 días · Sólo lo que hay que pedir». Los días de rotación no entran (el horizonte es cobertura + plazo). Con un parámetro inválido se omite el horizonte. Una casilla del motor (estacionalidad, por vencer) sólo se nombra si el motor la maneja.
3. **Se abre solo ante un error de validación**, al pasar de «todo válido» a «hay un parámetro inválido» se pone el estado en abierto (ajuste de estado durante el render, sin efecto) y no se deriva del error: no queda escondido, y aun así se puede cerrar a mano (no se reabre hasta que haya un error nuevo).
4. **Objetivos táctiles de 44 px bajo `sm`** en el bloque: los numéricos (`max-sm:h-11`), las casillas (`max-sm:min-h-11`) y los selects. Desde `sm` las alturas son las de siempre (`h-9`, `min-h-9`, que fija el test de ADR-012).
5. **`SelectBuscable` suma `lineasEnMovil?: 1 | 2` (defecto 1).** Con `2`, bajo `sm` el valor elegido ocupa hasta 2 líneas antes del «…» (`line-clamp-2`, `whitespace-normal`, `break-words`) y el control mide 44 px como mínimo; desde `sm` es una línea. **Con el defecto el DOM y las clases son idénticos a los de antes** (lo fija un test que compara el HTML). Sólo Reposición lo pide, en sus tres selects; el resto del kit no cambia.
   - *Modo botón*: el `<span>` pasa a `line-clamp-2 … sm:truncate` y el botón crece (`max-sm:h-auto max-sm:min-h-11`).
   - *Modo campo (el de Reposición)*: un `<input>` no parte el texto, así que bajo `sm` el campo se estira sobre el contenedor (`max-sm:absolute max-sm:inset-0`) con el texto transparente, y debajo va el valor en un `<div aria-hidden>` sin eventos que sí se parte y le da el alto al contenedor. Al enfocar vuelve el texto del campo (seleccionado, para escribir encima) y el valor decorativo se pone `invisible` —no `hidden`— para que el contenedor no cambie de alto al escribir. El lector de pantalla, el `title`, el foco, el teclado y el `value` siguen siendo los del `<input>`.

**Se descartó** medir con `matchMedia`/`ResizeObserver` para decidir si plegar (estado que seguir, diferencias entre jsdom y navegador, un parpadeo al hidratar); un componente plegable genérico en el kit (hay un solo uso, se extrae cuando haya un segundo); cambiar el valor por defecto de `SelectBuscable` a 2 líneas (afectaría a todas las pantallas que lo usan, y no se pidió); y un `<textarea>` como campo (cambia Enter, la selección y la semántica de combobox).

**Medido en Chromium** (Playwright, Reposición con nombres largos de sucursal, categoría y proveedor; Tailwind 4 compilado sobre las fuentes del kit, con el `fetch` simulado): a 390 px el bloque arranca plegado (`display: none`), el encabezado mide 44 px o más y resume en 2 líneas; abierto, cada select mide 52 px con el valor en 2 líneas (con 1 línea, 44), los numéricos y las casillas 44 px, sin scroll horizontal (`scrollWidth` = 390); el orden de Tab sigue siendo sucursal, categoría, proveedor, días de rotación; al enfocar un select el alto no cambia (52 px). A 640, 768, 1280 y 1440 px la página entera sale **idéntica píxel por píxel** a la de `origin/main` (captura completa y rectángulos de todos los campos). Con un error de validación el bloque abierto muestra el mensaje sin esconderlo.

**Tests** (`test/comercio-reposicion.test.tsx`, `test/SelectBuscable.test.tsx`): plegado por defecto con las clases `hidden sm:flex`, botón con su estado y su `aria-controls`; orden del documento (botón antes que el bloque); resumen por defecto, el que sigue a los cambios (días, sucursal, categoría, casillas, proveedor) y el que omite un horizonte inválido; Enter y Espacio abren y cierran con `aria-expanded`; se abre solo con un error, se puede cerrar y no se reabre con el mismo error; las medidas táctiles; `lineasEnMovil` en los dos modos (clases, `aria-hidden` del valor decorativo, el campo sigue eligiendo) y el defecto que no cambia nada.

**Cómo se adopta.** Subir el pin del kit a 0.144.0: Reposición lo trae solo. Un consumidor de `SelectBuscable` no tiene que hacer nada; si quiere el mismo comportamiento en otra pantalla, pasa `lineasEnMovil={2}` (conviene que acompañe al `title`).

**Lo que no cubre.** Es el único bloque plegable (los otros filtros del kit siguen a la vista en el celular). El resumen no incluye los días de rotación. Con `lineasEnMovil={2}` el texto que no entra en 2 líneas se corta con «…» y se lee en el `title`. jsdom no aplica Tailwind: los tests prueban las clases y la estructura; lo visual está medido arriba con un arnés descartable (el kit no tiene un harness de pantallas) y no se versiona. No se probó en un celular real ni en Safari (el valor decorativo bajo el campo depende de `peer-focus` y de `text-transparent` sobre un `<input>`).

## ADR-057 — Las listas de uso diario sin scroll de costado (tabla o tarjetas), los botones de las tablas de 44 px bajo `lg` y tres arreglos de móvil (0.145.0)

**Pedido del humano (2026-10-13), tras una revisión en Chromium contra VentaLibra con el kit 0.143.0.** (El 056 lo tiene la rama de Reposición en móvil.) Cinco cosas: un desborde en «Caja por medio de cobro», los encabezados de depósito de Stock, una cantidad redondeada en el diálogo de ajuste, los botones de las tablas («44 px bajo 1024 px, en escritorio quedan en 36») y pasar a tarjetas las listas de uso diario («Clientes, Productos, Turnos, Compras y Proveedores como Ventas; las de administración —Usuarios, Libros IVA, Logs, Egresos— quedan con scroll interno»).

**Qué ya existe** (se miró antes de escribir): el híbrido de Stock (ADR-016) y de Ventas (ADR-020, ADR-024, ADR-027) con `useAncho` en `use-ancho.ts`, `TACTIL` para los botones de las tarjetas (ADR-021), `BOTON_TACTIL` bajo `lg` del detalle de venta (ADR-022) y `anchoColumnaAcciones`. Lo nuevo es sacar el mecanismo a un lugar y aplicarlo; no hay otro diseño.

### 1. «Caja por medio de cobro» no ensancha la página a 768 px

**Medido** (Chromium, VentaLibra con datos ficticios, 768 px con el menú abierto: 447 px de contenido): la página medía 792 px contra 768. Los elementos que llegaban a `right=792` eran la descripción y el título de la **tercera tarjeta del resumen** (Saldo Neto, `CardTitle text-2xl`). **Causa:** el resumen iba en tres columnas desde `sm` (640 px de *ventana*), y la pantalla es una grilla de una columna `auto`: el mínimo de esa columna es el mínimo del resumen, que a su vez es la suma del mínimo de las tres tarjetas (cada una, el ancho de su importe sin partir). Tres importes de `text-2xl` no entran en 447 px: la columna crecía a 700 y arrastraba a la página. (Reproducido con el mismo arnés del resto de este ADR: contra 0.143.0, 65 px de desborde con importes de siete cifras y 98 px con nueve; la firma de los elementos es la misma.)

**Decisión.** El resumen va en un `@container` y pasa a tres columnas con `@4xl` (896 px *del contenedor*: cada importe de ocho cifras mide ~215 px); por debajo, una tarjeta debajo de otra. El `@container` (contención de tamaño en línea) además le saca a la columna de la pantalla el mínimo del resumen, y los títulos llevan `[overflow-wrap:anywhere]`: un importe que ni solo entra se parte en vez de empujar. Con el menú abierto (256 px) el resumen queda en tres columnas desde ~1220 px de ventana (959 px de contenedor medidos a 1280); a 768 y 1024 va en una.

### 2. Encabezados de depósito de Stock: hasta dos líneas

`sortableHeader(label, { dosLineas: true })` (opción nueva; sin ella, la de siempre) parte el título en hasta dos líneas (`line-clamp-2 break-words whitespace-normal`, el botón crece: `h-auto min-h-8`) y conserva el `title` y el ícono de orden (`shrink-0`). Las columnas de depósito de Stock la usan. **Medido:** con las clases tal como se pidieron, la celda de 110 px deja 94 px al botón y, con el relleno (`px-2.5`), el margen del ícono (`ml-2`) y el `gap`, **44 px al texto**: «Sucursal» (60) se partía en «Sucur / sal…». Por eso la variante de dos líneas aprieta el botón (`px-1`, `gap-0.5`, sin margen en el ícono y sin el `-ml-3` de alineación): 68 px de texto y «Casa central», «Sucursal Centr…», «Depósito Zon…» entran por palabras. El tamaño de la columna (110) no cambia, así que el umbral de las tarjetas de ADR-016 tampoco.

### 3. «Stock actual» y «Stock resultante» con el mismo formateador

`formatEntero` es el de cada producto (`@/lib/utils`) y, en VentaLibra, `String(Math.round(value))`: un producto en kg con 14,15 mostraba «14» arriba y «14,15» abajo. El diálogo de ajuste muestra ahora «Stock actual», el mínimo y «Stock resultante» con `formatoCantidad` (ADR-050): `14,15`, `2,5`, `14,25`. **Cambia lo que se ve** en «Stock resultante»: antes escribía a mano (`toFixed(3)` y el punto por la coma) sin separador de miles, ahora `1.008` (ADR-055 lo había dejado así justamente por eso); los decimales ya no se recortan a tres (una unidad de seis decimales se ve entera) y el ruido de coma flotante (14,15 + 0,1 = 14,250000000000002) sale limpio porque `formatoCantidad` recorta en diez.

**Lo que NO se tocó, y es el mismo defecto.** El resto de Stock (celdas de la tabla, total y depósitos de las tarjetas, aviso de stock bajo, columna «Cantidad» del historial) y `Productos` («Stock total»), `StockMovimientos` y `DepositoDetalle` siguen con `formatEntero` del producto: un producto en kg con 14,15 sigue diciendo «14» en la tabla. El pedido era el diálogo; el resto es una decisión de diseño de los productos («Redondeo a entero para mostrar cantidades de stock», su `utils.ts`) que conviene tomar de una vez (pasar todas a `formatoCantidad` o dejar el redondeo a propósito donde la lista es un vistazo).

### 4. Los botones de las tablas, de 44 px bajo 1024 px

**Decisión.** `TACTIL_BAJO_LG = 'max-lg:[&_a]:size-11 max-lg:[&_button]:size-11'` (`use-ancho.ts`, al lado de `TACTIL`) va en el contenedor de los botones de la celda de **toda** columna `id: 'actions'` del kit (19 columnas en 18 archivos: Productos, Clientes, Proveedores, Turnos, Usuarios, Listas de precio, Promociones, Stock, Ventas, Facturas, Presupuestos, Remitos, Bandeja de MercadoPago, Egresos, Caja, Tesorería, Cuenta corriente). Es el mismo mecanismo de ADR-021 (clase en el contenedor, no en cada botón) y la misma frontera de ADR-022 (`lg`). En escritorio los botones no cambian (36; los de Usuarios, 32, que ya llevaban `size-8`).
**El ancho de la columna.** `DataTable` ya mide la columna de acciones (suma el ancho real de los botones), así que la columna nunca cortó nada: medido, 156 px con tres botones de 44 y 132 con los de 36, y ningún botón recortado. Lo que cambia es el `size` **declarado**, que es el umbral de las tarjetas (la suma de los `size`): `anchoColumnaAcciones(n, tactil = false)` cuenta 44 px por botón con `tactil` y las pantallas con tarjetas le pasan `useBajoLg()` (nuevo: la misma frontera que `max-lg`, `(max-width: 63.99rem)`, con `matchMedia`; sin él, `false`). Sin esto el umbral quedaba 8 px por botón corto justo en la franja de 1000 a 1024 px. Las demás tablas no lo pasan (sólo es el ancho del primer cuadro: la medición lo corrige).
**Guard.** `test/botones-de-tabla-tactiles.test.ts` falla si una columna `id: 'actions'` no tiene su `${TACTIL_BAJO_LG}`.

### 5. Clientes, Productos, Turnos, Compras y Proveedores: tabla cuando entra, tarjetas cuando no

**Medido** (Chromium, datos ficticios con nombres largos; contenedor de 293 px a 390): las cinco tablas scrolleaban por dentro a 390, 768 y 1024 px (Clientes 1139, 1033 y 777 px de scroll; Proveedores 1052, 946 y 690; Productos 619, 513 y 257; Turnos 685, 579 y 323; Compras 347, 241 y 0), y **Clientes y Proveedores todavía a 1440** (361 y 274 px): sin ningún `size` son tablas de layout automático y un nombre de 70 caracteres las ensanchaba.

**Decisión.** Un componente nuevo, `libra-ui/tabla-o-tarjetas`: **`TablaOTarjetas`** es el híbrido de Stock y Ventas (un `ResizeObserver` mide el contenedor; si es más angosto que lo que pide la tabla, tarjetas; sin medida, la tabla) y **`TarjetaDeFila`** es la tarjeta (el dato principal arriba con su estado, los secundarios rotulados en una `dl`, las acciones a 44 px; columna `minmax(0,1fr)` y `overflow-wrap:anywhere`). Lo que la tabla pide es **`anchoMinimoDeColumnas`** (en `tabla.ts`): la misma cuenta del `DataTable` (la suma de lo que mide cada columna: `size`, con `minSize` de piso y `maxSize` de techo, 150 si no declara `size`, sin las `meta.opcional`). Stock y Ventas usan esa función en vez de su `reduce` (mismo resultado: todas sus columnas declaran `size`). Tampoco se copió cinco veces el buscador: `BuscadorDeTabla` sale de `DataTable` y las tarjetas lo muestran igual.

| Pantalla | Tarjeta: arriba | Secundarios | Acciones (las de la fila) | Umbral (botones de 36 / de 44) |
|---|---|---|---|---|
| Clientes | nombre (link a la ficha), «Inactivo» | CUIT / DNI, Condición IVA, Teléfono | ver, editar, eliminar o reactivar | 782 / 806 |
| Proveedores | nombre (link) | CUIT/DNI, Email, Teléfono | ver, editar | 752 / 768 |
| Productos | nombre (+ «Insumo»), código · categoría, Activo/Inactivo | Tipo, Estación (si hay), Precio venta / unidad, Precio costo (si se ve), Stock total | receta, editar, códigos y variantes, eliminar (los que haya) | 912 / 936 (con los tres botones) |
| Turnos | «Turno N° 12» (link), cajero · caja, Abierto/Cerrado | Apertura, Cierre, Esperado, Declarado, Diferencia | ver detalle | 952 / 960 (con cajero y caja) |
| Compras | número (link de 44 px de alto), proveedor, estado | Líneas, Total | la fila entera lleva al detalle: lo hace el número | 640 |

Para que tengan umbral, **Clientes y Proveedores declaran `size`** en sus columnas: pasan a layout fijo (el nombre, elástico, se queda con el sobrante y se corta con «…» y el `title`, como las demás tablas de la familia). Es el único cambio visible de la tabla en escritorio, y es el que saca el scroll de 1440 px. **Mismos datos y acciones:** `Clientes` y `Productos` comparten con la tabla la función de los botones (`acciones` / `botonesDeFila`), así que un botón nuevo aparece en las dos vistas (y el `data-editar-producto` por el que Productos devuelve el foco, también); la fila inactiva se atenúa en las dos.

**Medido en Chromium después** (arnés descartable: Tailwind compilado sobre las fuentes del kit y las primitivas de VentaLibra, `fetch` simulado, 12 filas con nombres de 70 caracteres y sin espacios; 47 anchos de ventana de 320 a 1920 px —de a 40, más 767, 768, 769, 1023, 1024 y 1025— con el menú abierto desde 768 px, 8 pantallas): **0 px de desborde de página y 0 px de scroll interno de la tabla** en las 376 combinaciones; los botones miden **36 px en la tabla desde 1024 px** (44 en las tarjetas, a cualquier ancho) y la tabla nunca aparece con botones de 44 (en las cinco pantallas, bajo 1024 px el contenedor siempre es menor a la tabla salvo Compras, que no tiene botones). Contenedor y modo, con el menú abierto: 390 px → 293, tarjetas las cinco; 768 → 399, tarjetas; 1024 → 655, tarjetas (Compras ya es tabla); 1440 → 1071, tabla las cinco. Las tablas de Promociones, Listas de precio y Usuarios, que no tienen tarjetas, muestran 44 px a 1023 px y 36 (Usuarios, 32) a 1024 px, con la celda midiendo 156, 211 y 216 px y ningún botón recortado.

**Límites.**
1. **Las tarjetas no ordenan.** La tabla ordena por columna (el nombre, el precio, el total de stock…); la tarjeta muestra la lista en el orden en que llega (como Ventas, ADR-020). Stock es la excepción, con su «Ordenar por» propio.
2. **El buscador de las tarjetas empieza vacío** si se cruza el umbral con un texto escrito (la tabla y la lista de tarjetas tienen cada una su estado). Las búsquedas que hacen Productos y Proveedores contra el servidor no se pierden.
3. **Turnos:** la tarjeta no lleva el «Fondo inicial» (la tabla lo oculta por debajo de 1400 px, `meta.opcional`, y está en el detalle). Cinco datos secundarios en vez de los 2-4 previstos: son los que tiene la fila.
4. **Productos:** «Precio venta» lleva la unidad (`$ 1.500,00 / kg`) en lugar de una fila «Unidad» aparte.
5. **La tarjeta de Compras no tiene botones** (la tabla tampoco): el número es el link, con 44 px de alto.
6. **Siguen con scroll interno** (decisión del humano): Usuarios, Libros IVA, Logs, Egresos; y también, sin que se haya pedido, Listas de precio, Promociones, la bandeja de MercadoPago, Facturas, Presupuestos, Remitos, Caja, Tesorería y las cuentas corrientes. Con 44 px estas tablas tienen 8 px más por botón.
7. **No se midió contra VentaLibra desplegado** (sólo el arnés), ni con el menú colapsado ni en modo oscuro.

**Tests** (`comercio-tablas-en-tarjetas`, `tabla-o-tarjetas`, `botones-de-tabla-tactiles`, `comercio-stock-cantidades`, y los de `comercio-stock-sin-scroll`, `data-table`, `siete-pantallas-sin-desborde` y `comercio-flujos`): por pantalla, tabla con ancho de sobra, tarjetas con el ancho chico (mismos datos, mismas acciones, los botones andan), el umbral exacto con los botones de 36 y de 44, sin medida se queda la tabla, y la clase de 44 px en la tabla; en las tarjetas, el buscador. Contra 0.143.0 (los mismos archivos de test copiados a un árbol de `origin/main`) fallan 29 de los 98 tests que corren, y `tabla-o-tarjetas.test.tsx` (16 tests) ni carga; con el cambio pasan los 114.

**Cómo se adopta.** Subir el pin a 0.145.0. Los productos no cambian nada, salvo que un producto que arma su propia tabla con `DataTable` y quiera las tarjetas use `TablaOTarjetas` y pase `anchoColumnaAcciones(n, useBajoLg())`.

## ADR-058 — Deuda del kit (0.146.0): roles parciales, `formatoMonto`, KPI por catálogo, fechas y pestañas del kit, y el guard de títulos entiende `INDICADORES`

Siete pendientes relevados en la sesión del 2026-10-13, resueltos juntos. Cada uno con su sección; las props nuevas son todas opcionales y, sin pasarlas, la pantalla es la de siempre.

### 1. Roles parciales: `puedeAjustar`, `puedeEscribir`, `puedeRecibir` y los costos que no llegan

**Problema (VentaLibra, `app/permisos.py`).** El **depósito** tiene `compras.ver` pero no `compras.escribir`, `compras.recibir` ni `costos.ver`: el backend le saca `subtotal`, `unit_cost` y `precio_costo` de la respuesta (`app/costos.py`, un filtro por prefijo de ruta; las claves no vienen, no vienen en cero). El **vendedor** ve Stock (`stock.ver`) pero no tiene `stock.ajustar`. El kit le ofrecía botones que contestaban 403 y formateaba lo que no llegó: `$NaN` en el total de cada orden, en cada línea y en la lista de precios.

**Qué ya existe.** `Productos.sinCosto` (ningún producto trae `precio_costo` → se oculta la columna) y `conAlta`/`puedeMover`/`puedeMermar` (ADR-051): el patrón es «una prop de rol, con `true` por defecto» y «detectar la ausencia en la respuesta, no pedirle el rol al producto».

**Decisión.**
1. **`Stock` suma `puedeAjustar` (`true`).** Con `false` no hay «Ajustar stock», ni en la tabla ni en las tarjetas; queda «Ver movimientos» y la columna de acciones declara un botón (`anchoColumnaAcciones(1, …)`).
2. **`Compras` suma `puedeEscribir` (`true`):** sin él no hay «Nueva compra». **`CompraDetalle` suma `puedeEscribir`** (sin él no hay «Agregar línea») **y `puedeRecibir`** (sin él no hay «Recibir mercadería» ni «Confirmar recepción»). Se renombró la variable local `puedeRecibir` (que significaba «hay algo pendiente») a `hayQueRecibir`.
3. **Costos ausentes: se ocultan, nunca se formatean.** `llegoElCosto(valor)` (en `comercio/tipos`) pregunta por `undefined`/`null`. `Compras`: si ninguna línea de ninguna orden trae `subtotal`, la columna «Total» y su dato de la tarjeta no están; una orden a la que sólo le falta algún subtotal dice «—» (nunca `$NaN`). `CompraDetalle`: sin `unit_cost` / sin `subtotal` en ninguna línea, no están «Costo unitario» ni «Subtotal» (el `colSpan` de «Sin líneas todavía.» sigue el número de columnas); en el diálogo de recibir, sin `unit_cost` no hay columna ni campo de costo y el cuerpo no manda `unit_cost` (`LineaDeRecepcion.unit_cost` pasa a opcional). `ListaPrecioDetalle`: sin `precio_costo`, no están «P. Costo» ni «Margen» (que sale del costo). La detección es la de `Productos.sinCosto`: **con una lista vacía no hay con qué decidir** y la columna queda (una orden vacía vale `$0,00`).
4. **Una divergencia con el pedido, a propósito:** «Confirmar recepción» (el botón de una recepción en borrador) depende de **`puedeRecibir`**, no de `puedeEscribir`. Es lo que hace el backend (`app/main.py`: todo `POST /api/purchase-receipts/**`, que incluye `/recibir` y `/{id}/confirm`, es `compras.recibir`; `purchase-orders` es `compras.escribir`). Con el depósito (ninguna de las dos) da igual; con un rol que tenga una sola, la otra forma dejaba un botón que contesta 403.

**Cómo lo adopta cada producto (VentaLibra, `puede(user, …)` de `lib/permisos.ts`):**

| Pantalla | Prop | Capacidad |
|---|---|---|
| `Stock` | `puedeAjustar` | `stock.ajustar` (encargado y depósito; no el vendedor) |
| `Compras` | `puedeEscribir` | `compras.escribir` (encargado) |
| `CompraDetalle` | `puedeEscribir` | `compras.escribir` |
| `CompraDetalle` | `puedeRecibir` | `compras.recibir` (encargado; **no** el depósito) |

`Compras`, `CompraDetalle` y `ListaPrecioDetalle` **ocultan solos** los costos que no llegan: no hay prop ni capacidad que pasar. `Compras` no recibe `puedeRecibir`: no tiene ninguna acción de recepción. Los demás productos con Stock o Compras (hoy sólo VentaLibra monta Compras) no cambian nada.

**Lo que no cubre.** Los selects «Precio de costo de cada producto» del lote y de importar precios en `ListaPrecioDetalle` siguen (son de `precios.escribir`, que sólo tiene el encargado, que ve costos). El formulario «Agregar línea» sigue pidiendo «Costo unitario» (con `puedeEscribir` pero sin costos: no es un rol que exista hoy, y una orden vacía no deja decidirlo). Que el motor acepte una recepción sin `unit_cost` **no se verificó**: el diálogo sin costos sólo se alcanza con un rol que tenga `compras.recibir` y no `costos.ver`, que en VentaLibra no existe.

### 2. `formatoMonto`: la última copia de formateo de plata

`Compras.money` y `CompraDetalle.money` eran dos copias (`toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`) y la excepción que ADR-055 dejó anotada. `formatos.ts` suma **`formatoMonto(valor: string | number)`**: `1.234,50`, dos decimales fijos y **sin** el «$» (acepta el texto decimal del motor, `"900.00"`); un valor no finito se devuelve como vino, como `formatoCantidad`. Las dos pantallas lo usan y las dos excepciones salen de la lista del guard de ADR-055 (el guard falla si vuelven). Mismo texto que antes: lo fija un test que compara con el `toLocaleString` de las copias. «Stock resultante» ya estaba resuelto en 0.145.0.

### 3. Caja, Egresos y Margen arman sus KPI con `TarjetaIndicador`

Las tres eran la deuda de `PENDIENTES_DE_MIGRAR` (el test que «obliga»). Migradas y sacadas de la lista; el guard las cubre ahora con `MIGRADAS`.

| Pantalla | Tarjeta | Concepto | Antes |
|---|---|---|---|
| Caja | Saldo actual | `caja` | `PiggyBank` |
| Caja | Ingresos del período | `cobros` | `ArrowDownCircle` (el mismo componente) |
| Caja | Egresos del período | `egresos` (como «Egresos este mes» del Dashboard) | `ArrowUpCircle` |
| Caja | Resultado del período | `margen` (ingresos menos egresos) | `Wallet` |
| Egresos | Total del período | `egresos` | `ArrowUpCircle` |
| Egresos | Pagado | `pagos` | `CheckCircle2` |
| Egresos | Pendiente / Parcial | `porCobrar` (el catálogo ya lo nombraba para Egresos) | `Hourglass` |
| Margen | Ingreso | `montoVendido` | `DollarSign` |
| Margen | **Costo** | **`costo` (nuevo)** | `Package` |
| Margen | Margen | `margen` | `TrendingUp` |
| Margen | Unidades vendidas | `stock` | `Boxes` |

**Un concepto nuevo: `costo` = `PackageOpen`** (`iconos-indicador`, con su fila en el test y en el README): lo que costó lo que se vendió. No existía ninguno (`egresos` es un gasto cargado y `pagos` es plata que salió); `Package` es `productos` y repetirlo habría dicho que «Costo» es un producto. `PackageOpen` es distinto de `Package` y de `PackageMinus` (`stockBajo`). `margen` suma, en su comentario, el «Resultado del período» de Caja.

Para que las tres quedaran **limpias** (el guard prohíbe cualquier ícono de lucide que nombre un concepto, no sólo los de las tarjetas) pasaron también al catálogo los íconos sueltos: las insignias y las opciones de Ingreso/Egreso de Caja (`cobros`/`pagos`: los mismos componentes que ya usaba), `Receipt` → `comprobantes`, el título del diálogo de Caja (`PiggyBank` → `caja`) y el de Egresos (`ArrowUpCircle` → `egresos`), los dos bloques de Margen (`Boxes` → `productos`, `CalendarRange` → `margen`) y el título de la pantalla de Margen: `icono={INDICADORES.margen}` en vez de `TrendingUp`, que sale de `FUERA_DEL_CATALOGO` en `test/iconos-identidad.test.tsx` (que ahora acepta `INDICADORES.<concepto>`). Los glifos de acción que no nombran nada que se mida (`Filter`, `Ban`, `Eye`, `AlertTriangle`) se permiten **sólo para estas tres** con `opciones.permitidos` del guard, y el test falla si uno deja de usarse.

**Lo que se ve:** el recuadro del ícono es el de `TarjetaIndicador` (gris sobrio, 36 px) y no el tinte de color de cada tarjeta (amarillo, violeta, verde); la cifra conserva su color (`tono`). Las cuatro tarjetas de Caja y de Margen y las tres de Egresos ocupan el mismo lugar que antes. **Cambian los íconos** de Caja (saldo y resultado), Egresos (total, pagado, pendiente) y Margen (costo y los dos títulos): ya dicen lo mismo que el menú y que el Dashboard.

### 4. Fechas para mostrar, del kit: `fecha`, `fechaHora`, `hora`, `horaConSegundos`

**Problema.** El kit le pedía al consumidor `@/lib/fechas` (29 archivos) y cada producto traía el suyo. Relevado en `origin/develop` el 2026-10-13:

| Variante | Productos | Cuerpo |
|---|---|---|
| A | Contalibra, RestoLibra | idénticos byte a byte (122 líneas) |
| A′ | VentaLibra, GestioLibra | el mismo código; cambia sólo el comentario del encabezado |
| A″ | MedLibra | el mismo código, **más** `diaMesYHora(local)` (`dd-mm HH:MM` de la hora de pared de la sede, para una celda de la agenda) |
| B | LibraClub | otra implementación (157 líneas): todo pasa por `Date` salvo un `aaaa-mm-dd` pelado; sin `horaConSegundos`; más `diaISO`, `diasDeDiferencia`, `lunesDeLaSemana`, `nombreDelDia`, `pesos`, `diaYMes` |
| C | LibraCargo | adaptador de 19 líneas: `fecha`/`fechaHora` son `formatearFecha`/`formatearFechaHoraDeTexto` de `components/esquema-orden.ts`, que **reordenan el texto** (`^aaaa-mm-dd`) **sin mirar la zona** |
| D | LibraDesk | adaptador de 12 líneas a `lib/format.ts` (`fecha`/`fechaHora` sin `hora`) |

**Decisión: se toma A** (cinco de ocho, y la que resuelve bien los tres casos: un día del calendario, un timestamp sin zona, un instante con zona) y se la lleva a `src/fechas.ts`, junto a `hoyISO` (exportado ya como `libra-ui/fechas`). Diferencias respecto de A, todas del lado de la corrección:
- `Intl.DateTimeFormat` se construye una vez (A lo armaba en cada llamada) y la hora es `hourCycle: 'h23'` (A usaba `hour12: false`, que en algunos motores escribe «24:05»).
- `horaConSegundos` convierte un `Date` o un ISO con zona a hora de Argentina; A reordenaba el texto de `…T01:30:15Z` y mostraba la hora **UTC** (y daba vacío con un `Date`).
- No exporta `TZ` (el kit ya tiene `ZONA_AR`; no se encontró ningún import de `TZ` desde el `lib/fechas` de un producto).
- Frente a **B (LibraClub):** un timestamp sin zona se reordena en vez de pasar por `Date` (igual en un navegador en Argentina, correcto en cualquiera); un texto que no es una fecha se devuelve como vino en vez de `''`; suma `horaConSegundos`. `diaISO`, `diasDeDiferencia`, `lunesDeLaSemana`, `nombreDelDia`, `pesos` y `diaYMes` son del dominio del club y **no entran** al kit (`lunesDeLaSemana` ya usa `sumarDiasISO` del kit; `pesos` ya usa `formatoMoneda`).
- Frente a **C (LibraCargo):** la variante «sólo texto» **es otra función**, no un modo de `fecha`: **`fechaDeTexto`** y **`fechaHoraDeTexto`** reordenan siempre y no convierten nunca, ni siquiera con un sufijo de zona (`2026-08-22 01:30:00Z` → `22-08-2026 01:30`, mientras `fechaHora` da `21-08-2026 22:30`). Es el reloj de pared del servidor (el `mtime` de un backup): convertirlo lo correría de día.

**El kit pasa a usar las suyas.** Los 29 archivos que importaban `@/lib/fechas` ahora importan `./fechas` / `../fechas` y el stub `test/stubs/lib/fechas.ts` se borra. No rompe a ningún consumidor: el kit **deja de pedir** algo, no pide nada nuevo, y los `lib/fechas.ts` de los productos siguen sirviendo a su propio código. Lo que cambia, sólo en las pantallas del kit: LibraClub, LibraCargo y LibraDesk escriben ahora las fechas del kit con las reglas de A (iguales para un ISO normal; distintas con un texto sin fecha o con zona, que es justo lo que A arregla). El producto que quiera conservar un formato propio en el kit ya no puede (no hay dónde engancharlo): era una divergencia, no una costura.

**Cómo migra cada producto** (después de subir el pin a 0.146.0; ninguno es urgente, el kit ya funciona sin tocar nada):
- **Contalibra, RestoLibra:** `lib/fechas.ts` → `export { fecha, fechaHora, hora, horaConSegundos } from 'libra-ui/fechas'` (y `TZ` como `export { ZONA_AR as TZ }` si algo lo usa). Se pierde el 100 % del cuerpo.
- **VentaLibra, GestioLibra:** igual.
- **MedLibra:** igual, y `diaMesYHora` queda en su archivo (la hora de pared de la sede es suya).
- **LibraClub:** `fecha`, `fechaHora` y `hora` pasan a reexportar las del kit; `diaISO`, `diasDeDiferencia`, `lunesDeLaSemana`, `nombreDelDia`, `pesos` y `diaYMes` se quedan. Revisar sus tests de `fecha` con un texto que no es una fecha (hoy `''`, con el kit el texto) y con un timestamp sin zona.
- **LibraCargo:** `formatearFecha`/`formatearFechaHoraDeTexto` de `esquema-orden.ts` pasan a ser `fechaDeTexto`/`fechaHoraDeTexto` del kit (`export { fechaDeTexto as formatearFecha, … }`), y `lib/fechas.ts` (el adaptador) se borra si nada más lo importa. `formatearFechaHora(Date)` es `fechaHora(Date)`.
- **LibraDesk:** su `lib/format.ts` usa `Date` local (sin zona fija); migrar `fecha`/`fechaHora` al kit cambia a la hora de Argentina. Es lo que dice la regla del ecosistema, pero hay que revisar sus tests de fechas antes. El adaptador `lib/fechas.ts` se borra.

**Lo que no cubre.** No se migró ningún producto. `README.md` ya no dice que `@/lib/fechas` tiene que exportar `fechaHora`: los adaptadores de LibraCargo y LibraDesk sobran para el kit.

### 5. «Stock bajo mínimo» de Reportes: la tabla con su propio scroll

**Hallazgo del e2e de VentaLibra:** la tabla «Código | Producto | Stock actual | Mínimo | Faltante» de `/reportes` no tenía contenedor y un nombre largo ensanchaba la página a 390 px. Está **en el kit** (`comercio/Reportes.tsx`), no en VentaLibra. Las otras tres tablas de la pantalla ya iban en un `overflow-x-auto` (ADR-023): ésta quedó afuera. Va en el mismo.

**Medido** (Chromium, `Reportes` con tres productos bajo mínimo, dos de nombre largo —uno de 102 caracteres con espacios y otro de 76 sin ellos—, un arnés con Tailwind 4 sobre las fuentes del kit; el desborde es `scrollWidth − clientWidth` de la página, la barra de 15 px ya descontada): `origin/main` **655 px a 320, 585 a 390 y 207 a 768**; con el cambio **0 en las cuatro (320, 390, 768, 1280)**. La tabla scrollea por dentro (a 390 px se ven Código y Producto; las tres cifras quedan a la derecha del scroll). Se eligió el contenedor y no el «…» con `title`: es lo que hacen las otras tres tablas, y un nombre cortado en un reporte de «qué falta» es peor que uno que se desliza. Si se prefiere ver las cifras sin deslizar, el siguiente paso es la lista de tarjetas (`TablaOTarjetas`); no se pidió.

### 6. Pestañas del kit: `libra-ui/ui/tabs`

Las pestañas eran el único primitivo cuyo arreglo (`activationMode="manual"`, 2026-10-09: con el modo automático de Radix la pestaña con foco se reactiva sola y el «atrás» del navegador no volvía en las pestañas atadas a la URL) hubo que aplicar **en ocho productos** (un PR por producto, bitácora del 2026-10-09). **Relevado en `origin/develop`:** los ocho `components/ui/tabs.tsx` son **idénticos byte a byte desde `import * as React`** (72 líneas de cuerpo); cambian sólo el encabezado, el `"use client"` (LibraCargo, LibraClub, LibraDesk y MedLibra no lo tienen) y el `cn` (`@/lib/utils`). No hay varias variantes de cuerpo: hay un cuerpo y cinco encabezados distintos (`libra-backoffice` no tiene frontend ni `tabs`).

**Decisión.** `src/ui/tabs.tsx` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`), con `activationMode="manual"` por defecto y `cn` de `../utils`, exportado como `libra-ui/ui/tabs` como el resto de `src/ui/` (ADR-006). Los **9** archivos del kit que importaban `@/components/ui/tabs` (`Facturas`, `Presupuestos`, `MpBandeja`, `Logs`, `Configuracion`, `configuracion/arca`, `comercio/Logs`, `comercio/LibrosIva`, `comercio/Ventas`) importan el propio, y el stub de `test/stubs/components/ui/tabs.tsx` se borra: **los tests ahora corren contra Radix de verdad**. Dos consecuencias en los tests, ambas del DOM real y no de un cambio de comportamiento: el snapshot de ARCA (`ArcaServicios`) pasó a llevar los atributos de Radix (`data-state`, `aria-controls`, los dos paneles inactivos vacíos y ocultos), con los ids que genera Radix (`radix-…`, un contador que avanza con cada render) normalizados en el test; y el chequeo «idéntico al que no tiene la ruta» compara sin esos ids. (El diff del snapshot es sólo la barra de pestañas y los paneles.)

**Cómo reemplaza cada producto su copia:** `frontend/src/components/ui/tabs.tsx` → `export * from 'libra-ui/ui/tabs'`. Es seguro hacerlo en el mismo cambio que sube el pin (el cuerpo es el mismo). Un producto que no lo reemplaza **sigue funcionando** (el kit ya no usa la suya, así que un cambio futuro del primitivo ya no llega a las pantallas del kit por su copia, sólo por la del kit).

**Lo que no cubre.** `dialog` queda para otro lote (el kit sigue importando el del consumidor). El defecto del «atrás» no se pudo reproducir en jsdom (el intento de test pasaba también con el modo automático); lo que el test fija es lo que distingue los dos modos: las flechas mueven el foco sin activar y Enter/Espacio activan.

### 7. El guard de títulos entiende `INDICADORES.x`

`comparable()` de `auditoria-de-titulos` resolvía `X.concepto` sólo contra `ICONOS`: un título con `icono={INDICADORES.stockBajo}` (un concepto que sólo existe como indicador) quedaba sin resolver y se comparaba por su texto contra el `PackageMinus` del menú, así que **una pantalla correcta salía como desajuste**. Ahora `INDICADORES.<concepto>` se resuelve contra el catálogo de indicadores (`INDICADORES[x]`, el base: sin excepciones por producto, igual que lo que dibuja el fuente); un concepto que no existe se compara por su nombre y se marca. Lo usa Margen (§3). Tests con control positivo (`montoVendido` contra un `Wallet`: se sigue detectando) y negativo (`stockBajo`, `margen` y el sinónimo `gastos` contra el ícono que les corresponde: no dan desajuste).

### Tests y verificación

**72 tests nuevos** (2633 → 2705; 106 → 109 archivos, 2 omitidos igual que antes): `comercio-roles-parciales` (21), `fechas-para-mostrar` (32), `ui-tabs` (6), y los de `auditoria-de-titulos` (2), `formatos` (5), `indicadores-por-catalogo`, `iconos-indicador` (la fila de `costo`) y `siete-pantallas-sin-desborde` (1). **Contra `origin/main`, 69 de los tests nuevos o modificados fallan** (roles 12 de 21; los 9 que pasan son los de «sin la prop es lo de siempre», que tienen que pasar; fechas 31 de 32; `ui-tabs` 6 de 6, el archivo no carga; titulos 2; formatos 6 —los cinco de `formatoMonto` y el guard sin las dos excepciones—; indicadores-por-catalogo 5; iconos-indicador 5; iconos-identidad 1; reportes 1). Suite completa, `typecheck` y `lint` (46 avisos, los mismos que `main`) en verde. Medido en Chromium con un arnés descartable (no versionado): Reportes, Caja, Egresos y Margen a 320, 390, 768 y 1280 px, antes y después; ninguna de las cuatro desborda la página después, y las tarjetas de Caja, Egresos y Margen ocupan el mismo lugar que antes (capturas a 390 px, antes y después).

**Cómo se adopta.** Subir el pin a 0.146.0. VentaLibra pasa las cuatro props de §1; todos pueden reemplazar su `tabs.tsx` por el reexport de §6 y migrar sus fechas según §4, cuando quieran.

## ADR-059 — El kit se adapta a libracommerce 0.59.0 (0.147.0): enviar y cancelar órdenes, borradores en Reposición, promociones por sucursal y los dos puntos que no hacían falta

Cinco pendientes que dejó el motor 0.59.0 (ADR-054 a 058 de `libracommerce`), resueltos juntos. Cada uno con su sección; las props nuevas son opcionales y, **detectado por el eco o la respuesta** lo que depende del motor nuevo, un producto con un motor anterior ve la pantalla de siempre.

**Qué ya existía** (se miró antes de escribir): el patrón «el motor lo maneja si la respuesta trae la clave» de Reposición (`estacionalidad`, `descontar_por_vencer`, ADR-011), el bloque plegable de filtros y su resumen (ADR-056), el `ConfirmDialog` del producto que ya usan `Cajas` y `Clientes`, las guardas de rol de 0.146.0 (`puedeEscribir`, ADR-058) y la `BOTON_TACTIL` de `VentaDetalle` (ADR-022). No hay helper del kit para el 409 `precios_distintos` ni pantalla de devolución (ver §5 y §6).

### 1. `CompraDetalle`: «Enviar al proveedor» y «Cancelar orden» (ADR-055 del motor)

- `POST /api/purchase-orders/{id}/enviar` (`draft` → `sent`) y `/cancelar` (`draft` o `sent` → `cancelled`). Prefijo verificado contra `compras_router.py` de v0.59.0 (`/api/` + `purchase-orders/{orden_id}/enviar|cancelar`, sin cuerpo).
- **Quién los ve:** `puedeEscribir` (la misma guarda de «Agregar línea»; el motor usa `OpcionesCompras.autorizar_escritura` para las dos rutas). Enviar sólo desde `draft`; cancelar desde `draft` o `sent` (desde `partial`/`received` el motor contesta 409, así que no se ofrece).
- **Cancelar pide confirmación** (`ConfirmDialog`: «¿Cancelar la orden OC-…?», «Sí, cancelar la orden»): no hay «reabrir». Enviar no pide, es reversible con cancelar.
- **Después de un éxito** se pinta la orden que contesta el motor (su estado ya es el nuevo), con un aviso `role="status"`; el estado visible es el `BadgeEstado` de siempre («Borrador», «Enviada», «Cancelada» ya existían). Una guarda síncrona frena el doble clic.
- **409:** se muestra el `detail` del servidor y se **vuelve a leer la orden** (alguien la recibió o la canceló: los botones tienen que decir la verdad). El error pasó a `role="alert"` (antes un `<p>` mudo).
- **Una cancelada no recibe:** no ofrece «Recibir mercadería» (ya era así por `hayQueRecibir`) ni «Confirmar recepción» para una recepción que había quedado en borrador (el motor contesta 409 desde ADR-055).
- 🔑 **Cómo se detecta el motor nuevo: no se puede por la orden.** `_orden_dict` no cambió en 0.59.0 y no hay otro campo ni eco. Se probó la alternativa de una prop de versión y se descartó (un producto que sube el motor y olvida la prop se queda sin botones; el que sube el kit sin el motor ve un error claro de todos modos). Queda el manejo de la respuesta: un **405**, o un **404 con el `detail` exacto «Not Found»** de FastAPI (la ruta no existe; el de una orden inexistente dice «purchase order not found» y se muestra tal cual), dicen «Este servidor todavía no permite enviar ni cancelar órdenes de compra: hace falta actualizar el motor (libracommerce 0.59.0 o posterior).». La orden no cambia y se puede reintentar. 403 y red usan el texto de siempre.
- 44 px bajo `lg` en los botones de la cabecera (también «Recibir mercadería» y «Volver», para que la fila quede pareja).

### 2. `Reposicion`: columna «En borrador» e interruptor «Contar borradores como pedidos» (ADR-056 del motor)

- **Detección:** la respuesta trae `contar_borradores` (el eco, como `estacionalidad`). Una vez visto se recuerda aunque una consulta posterior falle. Sin el eco, ni interruptor ni columna ni parámetro.
- **El interruptor arranca prendido** (= el comportamiento de siempre: el borrador resta). **Sólo viaja apagado:** `contar_borradores=false` en la consulta, en el CSV y en el cuerpo de «Generar órdenes en borrador» (`ParametrosDeOrdenes.contar_borradores`). Prendido no viaja nada, así que la consulta es byte a byte la de antes (lo fija un test). El motor sigue contando los borradores al generar para no duplicar (ADR-056 del motor): la pantalla sólo manda lo que ve.
- **La columna «En borrador»** va pegada a «En camino» y es ordenable (de mayor a menor la primera vez; sin valor, al final). Se muestra con el eco **y** filas con `en_borrador` numérico (un motor con el eco pero sin el campo no rompe). Se queda en las dos posiciones del interruptor, con una nota con texto (no sólo color): prendido, «ya contado» (está dentro de «En camino»); apagado, «no resta».
- **Dentro del bloque plegable de ADR-056**, con la misma altura táctil que las otras casillas, y en el resumen del encabezado cuando está apagado: «Sin contar borradores». La explicación de la fórmula suma «Las órdenes en borrador no se cuentan como pedidas: se ven aparte, en «En borrador».» sólo con el interruptor apagado y el eco en `false`.
- **Medido en Chromium** (arnés descartable, Tailwind 4 sobre las fuentes del kit, `fetch` simulado): con las tres opciones del motor prendidas (14 columnas: proveedor, por vencer, en borrador y estacional) la tabla entra sin desplazarse a 1280 y 1440 px; a 390 el interruptor mide 44 px y la tabla se desplaza dentro de su contenedor como siempre, sin scroll horizontal de página.

### 3. `ListaPrecioDetalle`: «Nueva promoción» con sucursal (ADR-058 del motor)

- **Prop `conSucursal` (default `false`)**, con `conVigencias`. Agrega el select «Sucursal (opcional)» (`SelectBuscable`, «Todas las sucursales» = vacío) y manda `sucursal_id` sólo si se eligió una; sin elegir, el cuerpo es el de siempre. El formulario se limpia al agregar y al reabrir el diálogo.
- **De dónde salen las sucursales:** `GET /api/sucursales`, como `Reposicion` y `Productos` (el producto no tiene que pasar una lista). **Sólo se ofrece con dos o más activas** (con una, un precio «de la sucursal» es el general) y, si la lectura falla o no hay permiso, la pantalla sigue sin select.
- **La lista de promociones dice el nombre** («sucursal Norte») en vez de «sucursal #2», también el de una sucursal dada de baja (la lectura la trae); si no se conoce, el número de siempre. Sin `conSucursal`, la lista dice «#id» como antes y no hay pedido de sucursales.
- **Por qué es una prop y no se detecta:** el endpoint ya aceptaba `sucursal_id` (ADR-048); lo que cambió en 0.59.0 es que la **validación de la venta** lo respeta. Con un motor anterior el precio por sucursal se cargaría y no se cobraría: el producto la enciende cuando su motor es 0.59.0.

### 4. Ajuste absoluto con varios depósitos (ADR-057 §1 del motor): ya estaba bien, ahora está fijado

`Stock` manda `deposito_id` en el ajuste siempre que la respuesta trae `depositos` (`conDepositos`), en los cuatro modos, y el select de depósito no es limpiable (`limpiable={false}`), así que no hay camino que lo omita. Sin `depositos` (Contalibra, Restolibra: sin `por_deposito`) no se manda, como el motor espera. Sólo había un test del modo `salida`: se suma uno que fija «Fijar en…» con el depósito predeterminado sin tocar nada, con otro elegido, y entrada y merma. **No hay cambio de código.**

### 5. Devolver un servicio con la base sin migrar (ADR-054 del motor): no hay flujo en el kit

La devolución parcial es de VentaLibra (entra por `VentaDetalle.accionesExtra`); `grep devolver src/` no da ninguna llamada a `/devolver`. El 503 de `ventas.SinRevision` trae `detail` como **texto** («Falta la revisión 0007_devoluciones_de_servicio del motor: corré `libracommerce-migrar upgrade` (--prefijo del producto) antes de devolver un servicio.») y `ApiError` ya lo entrega intacto en `detail`. Se suma un test que **fija ese contrato con el texto real del motor** (no traduce ni reemplaza un 503). Lo que falta, **del lado de VentaLibra**: que su diálogo de devolución muestre `err.detail` en un 503 y no un genérico; si quiere distinguirlo, el patrón del kit es `/Falta la revisión 0007.*libracommerce-migrar upgrade/s` (como `Vencimientos`, que además lo trata como «no se escribió»).

### 6. 409 `precios_distintos` con `sucursal_id` (ADR-058 del motor): nada en el kit

No hay helper `precios-distintos` ni código que lea ese 409 (`grep precios.distintos src/ test/` vacío): el POS es del producto. El campo nuevo `sucursal_id` dentro del `detail` no puede romper nada del kit.

### Tests y verificación

**32 tests nuevos** (2703 → 2735; 109 archivos, 2 omitidos igual que antes): `comercio-ordenes-compra` (12), `comercio-reposicion` (8), `comercio-reposicion-ordenes` (1), `comercio-listas` (9), `comercio-depositos-variantes` (1), `api-client` (1). Contra el `src/` de `origin/main` **23 de los 32 fallan** (los otros 9 son guardas de que sin la prop o sin el eco nada cambia, el ajuste con depósitos y el contrato del 503: pasan antes y después a propósito). `typecheck` limpio y `lint` con los mismos 46 warnings que `main`. Medido en Chromium a 390 y 1280 px (y 1440 para Reposición): sin scroll horizontal de página, botones de la cabecera de 44 px bajo `lg`, el mensaje del motor viejo y la orden cancelada sin botones de recibir ni confirmar. Los botones del `ConfirmDialog` de VentaLibra miden 36 px: es un componente del producto.

**Cómo se adopta.** Subir el pin a 0.147.0 junto con libracommerce 0.59.0. VentaLibra: `<ListaPrecioDetalle conVigencias conSucursal />`; `CompraDetalle` y `Reposicion` no necesitan props (los botones salen con `puedeEscribir`, que ya pasa, y el interruptor con el eco del motor); su diálogo de devolución muestra el `detail` del 503; y el POS manda `sucursal_id` en la cotización y en `POST /api/ventas` (ADR-058 del motor).

**Lo que no cubre.** Los campos del diálogo de promociones miden 36 px en el celular (como los que ya tenía, incluido el select nuevo). No hay «reabrir» una orden cancelada (tampoco en el motor). Un producto con el kit nuevo y el motor anterior verá «Enviar al proveedor» y «Cancelar orden» y un mensaje claro al usarlos (no hay cómo detectarlo antes). No se probó en un celular real ni en Safari.

## ADR-060 — Una venta devuelta en parte sigue ofreciendo «Devolver» (0.148.0)

**Estado:** aceptada (2026-10-14). Pedido del humano, a partir de un hallazgo de la documentación de uso de VentaLibra.

**El defecto.** `VentaDetalle` sólo dibujaba el bloque de acciones (y con él `accionesExtra`, por donde el producto monta «Devolver») cuando `detalle.estado` era `cobrada` o `parcial`. Una devolución parcial deja la venta en `devuelta_parcial` (en el motor la nuance vive en `sales.status_detail`), así que **el botón desaparecía justo después de la primera devolución**. Y esa venta no tiene otra salida: el motor admite devoluciones sucesivas a propósito (ADR-040 de libracommerce: cada una escribe su egreso de caja, y el tope de cada línea descuenta lo ya devuelto), pero **se niega a anularla** («La venta tiene devoluciones: no se puede anular; devolvé el resto de las líneas»). Resultado: una venta sin forma de seguir desde la pantalla, con un mensaje del servidor que manda a hacer algo que la pantalla no permite.

**Qué se hizo.** Con `estado === 'devuelta_parcial'` se renderiza un bloque aparte que contiene **sólo `accionesExtra`**. No se agregó `devuelta_parcial` a la condición del bloque existente, a propósito: ese bloque trae «Generar factura», «Generar remito», «Emitir nota de crédito» y «Anular venta», que son de una venta todavía sin devolver. Anular daría 409 y, de las otras, ninguna corresponde a una venta ya devuelta en parte. Sin `accionesExtra` no se dibuja nada (no queda un bloque vacío con su borde).

**Qué no cambia.** `devuelta` (todo devuelto) no ofrece nada porque no queda qué devolver. El kit no calcula lo que queda por devolver: eso lo decide el diálogo del producto y lo valida el servidor por línea. El de VentaLibra ya consulta `/ventas/{id}/devuelto` y descuenta lo devuelto, así que con este cambio ofrece sólo lo que falta.

**Tests.** 3 en `test/comercio-ventas.test.tsx`: el botón aparece y no aparecen anular, factura ni nota (falla contra `main`); `devuelta` no ofrece devolver; sin `accionesExtra` no hay bloque vacío.

**Cómo se adopta.** Subir el pin a 0.148.0; el producto que monte `accionesExtra` no cambia nada. VentaLibra deja de tener que decirles a sus usuarios que carguen todo en una sola devolución.

## ADR-061 — Los envíos por mail se ven: en el detalle y en el listado (0.149.0)

**Estado:** aceptada (2026-10-14). Pedido del humano: en ContaLibra un cliente reclamaba facturas y no había forma de saber si se habían mandado.

**El hueco.** El motor mandaba el PDF por SMTP y no guardaba nada; la pantalla mostraba el error de un envío fallido una sola vez. Desde libracore v1.164.0 (ADR-050 del motor) cada intento queda en `envios_email` y el motor lo devuelve: `envios_email` en el detalle de comprobantes y presupuestos, `envio_email` (resumen o `null`) en cada fila del listado, y `GET …/{id}/envios`.

**Qué se hizo.** `src/envios-email.tsx` (exportado como `./envios-email`): `EnviosEmailCard` (cada intento con fecha, destinatario, usuario y el motivo si falló) e `IndicadorEnvioEmail` (Enviada / Falló / Sin enviar, con destinatario y fecha en la ayuda). `FacturaDetalle` y `PresupuestoDetalle` muestran la tarjeta y la refrescan después de enviar; tras un envío fallido releen **sólo** `…/envios`, porque `cargar()` borraría el error y el destinatario que el usuario tiene que corregir. `Facturas` (sólo comprobantes con CAE) y `Presupuestos` suman la columna «Mail».

**Compatibilidad.** Contra un motor anterior los campos no llegan: el detalle dice «Todavía no se envió por mail» y el listado «Sin enviar». Por eso el pin del kit sube junto con el del motor.

**Tests.** 2 en `test/FacturaDetalle.test.tsx`; el de errores de `comprobantes-presupuestos.test.tsx` cuidó que un envío fallido no borre el mensaje.

## ADR-062 — El listado de comprobantes filtra por «enviada» y «sin enviar» (0.150.0)

**Estado:** aceptada (2026-10-14). Pedido del humano, a continuación del ADR-061.

**Qué se hizo.** `Facturas` suma un selector «Mail: todas / Enviadas / Sin enviar» en la barra de filtros. Manda `envio=enviada|sin_enviar` al motor (libracore v1.166.0, ADR-051), que filtra en el `WHERE`, así que el total y la paginación lo respetan. Se aplica al elegirlo (como las pestañas), vuelve a la página 1 y lo saca «Limpiar filtros». Con «todas» no viaja el parámetro.

**Qué decide el motor, no el kit.** «Sin enviar» incluye los envíos que fallaron (el cliente no lo recibió) y sólo comprobantes con CAE. Un comprobante mandado antes del 2026-10-14 figura como «sin enviar»: el rastro empezó ese día. Contra un motor anterior el parámetro se ignora y el listado sale sin filtrar.

**Tests.** 2 en `test/Facturas.test.tsx`: el pedido lleva `envio=sin_enviar` y `page=1`, y limpiar lo saca; con «todas» no viaja.

## ADR-063 — Las mermas se valoran y el «sin lote» negativo se concilia: lo que el kit adopta de libracommerce 0.60.0 (0.151.0)

**Estado:** aceptada (2026-10-15; el ancho `lg` y el alcance del modo oscuro, decisiones del humano) (2026-10-14). Pedido del humano a través de libracommerce (PR #225, ADR-059 y ADR-060 del motor); el kit sólo muestra y pide, la cuenta es del motor.

**Qué trae el motor.** (1) Cada merma guarda el costo vigente (`stock_movements.unit_cost`), y lo devuelve: `POST /api/vencimientos/merma` suma `costo_unitario`, `costo_total` y `sin_costo`; `GET /api/stock/movimientos` (si el producto lo prende) suma las mismas tres claves a cada fila, llenas sólo en las mermas; `GET /api/reportes/mermas` (y `/export`, CSV) agrupa por producto. El importe es un **piso**: lo que no tiene costo no suma y se cuenta aparte. (2) `GET /api/vencimientos/conciliacion` y `POST /api/vencimientos/conciliar` reparten el saldo «sin lote» negativo (el que dejaron las salidas anteriores a A-4) entre los lotes que lo respaldan; el stock total no cambia.

**Qué hizo el kit (todo opt-in: sin las claves ni la prop, la pantalla es la de 0.150.2).**
- **Baja de un lote (`Vencimientos`).** El aviso de éxito suma «Importe: $ 240,00.» si llega `costo_total`, «Importe: sin costo cargado.» si `sin_costo`, y nada si las claves no vienen (un rol sin `costos.ver`: el producto las SACA de la respuesta). También en el reintento (`repetida`): el motor devuelve el costo de la primera vez.
- **Conciliar (`Vencimientos`, prop `puedeConciliar`, default `false`).** Las filas «Salidas sin lote» ofrecen «Conciliar» (no las de «Sin fecha», que se asignan). El diálogo pide `GET /conciliacion` de esa fila (la variante sólo si la tiene), muestra lo que está en negativo, los lotes con su saldo y vencimiento, y la propuesta FEFO del motor en una cantidad editable por lote. Valida antes de mandar: cada tramo entre 0 y el saldo de su lote, el total mayor a 0 y sin pasar de lo que está en negativo (con tolerancia de 1e-9: 0,1 + 0,2 no es más que 0,3); lo que queda en 0 o vacío no viaja. Si `sin_cubrir > 0` avisa «ese resto es un faltante real: corregilo con un conteo físico» y lo repite en el aviso de éxito. Un 409/422 se muestra con su `detail`. Al terminar cierra, cuenta lo hecho y vuelve a pedir la lista.
- **`puedeConciliar` no hereda de `puedeMover`.** Es una escritura nueva y el motor la protege con el mismo gate que los movimientos (ADR-060); el producto la prende para quien tiene ese permiso. Por eso el default es `false`, al revés que `puedeMover`/`puedeMermar`. La columna «Acciones» de «Sin lote» aparece con `puedeMover || puedeConciliar`; «Asignar vencimiento» sigue pidiendo `puedeMover`.
- **La conciliación usa la misma regla de escritura que las otras tres (ADR de 0.92.0).** Una `clave_operacion` por intento, la misma al reintentar con los mismos datos y otra cuando el usuario cambia el reparto o la nota; y un intento INCIERTO (red, timeout, 5xx, un 503 que no es el de la migración) se guarda con su cuerpo y su clave bajo la firma `['conciliar', producto, depósito, variante]` —el saldo «sin lote» que consume, el mismo recurso que la asignación—: el diálogo bloquea el reparto y la nota y sólo ofrece reenviarlo igual o descartarlo con confirmación, la fila lo marca («Intento sin confirmar») y sobrevive a cerrar, desmontar y recargar. Reenviar no depende de que la vista previa cargue.
- **Historial de movimientos (`StockMovimientos` y el historial embebido de `Stock`).** Una columna «Importe» entre «Cantidad» y «Referencia», **detectada por los datos** y no por una prop: aparece si alguna fila trae `costo_total`, `costo_unitario` o `sin_costo` (el motor las manda en todas las filas, `null` fuera de las mermas). En una merma, el importe; con `sin_costo`, «—» y «sin costo»; en los demás tipos, vacía. Es el criterio de `Compras`: el kit oculta sólo los importes que el backend no manda. En `Stock`, además: la línea «Importe: …» en la lista angosta, y el umbral de tabla a lista sube 110 px cuando la columna está (de 720 a 830), para que la tabla con la columna nueva no scrollee de costado.
- **Pantalla `Mermas` (`libra-ui/comercio/Mermas`).** Par de `Margen`: desde/hasta (el mes en curso por defecto), filtro de depósito (sólo si hay más de uno; sucursal · depósito, sólo activos), tocar un producto filtra por él (`producto_id`), CSV a `/export` con la misma consulta, dos indicadores («Importe perdido», «Mermas registradas») y la tabla por producto —tabla cuando entra, tarjetas cuando no (`TablaOTarjetas`, ADR-057)—. **El importe es un piso y la pantalla lo dice:** con `resumen.sin_costo`, «El importe no incluye N mermas sin costo cargado»; cada producto aclara «sin costo en N mermas» (parcial) o «— (sin costo cargado)» (todo), nunca un `$ 0,00` que parezca un dato. Sin props.
- **Concepto `mermas` en el catálogo de indicadores** (`PackageX`, `INDICADORES.mermas`): el título de la pantalla y su indicador toman el ícono del catálogo (ADR-038), no de lucide. El producto usa el mismo en la entrada del menú.
- **Móvil.** Los botones y campos nuevos miden 44 px bajo `lg` (`max-lg:h-11`), las tarjetas de `Mermas` llevan el producto como botón de 44 px, y el diálogo de conciliar apila cada lote (etiqueta arriba, campo abajo) bajo `sm`. Todo con las clases de modo oscuro de las pantallas vecinas.

**Qué decide el motor, no el kit.** Quién ve los importes (VentaLibra: `costos.ver`; `/api/reportes/mermas` cuelga de un prefijo que el filtro de costos cubre entero, y un 403 se muestra con su `detail`); qué lotes propone la conciliación y en qué orden (FEFO); que las mermas anteriores a ADR-059 no se reconstruyen (quedan «sin costo» para siempre).

**Alternativas descartadas.** *`conciliar` con una clave por apertura del diálogo y nada más*: no sostiene el caso de un timeout (la respuesta se perdió y el usuario edita el reparto): se duplicaría el movimiento; por eso entra en el almacén de intentos pendientes como las otras tres escrituras. *Una prop `conImportes` en el historial*: el motor ya decide con las claves, y una prop podría contradecir a la respuesta (mostrar una columna de «NaN» o esconder importes que sí llegaron). *Sumar las unidades de `Mermas` en una tarjeta*: cada producto tiene su unidad (kg y u no se suman); se muestra la cantidad de mermas y la cantidad por producto.

**Tests.** `test/comercio-vencimientos-conciliar.test.tsx` (30): la baja con importe, «sin costo cargado», sin claves (nada) y repetida; conciliar opt-in (sin la prop no hay botón ni pedido; con ella sólo en «Salidas sin lote»; sin `puedeMover`; 44 px); el diálogo (pedido con y sin variante, propuesta editable, cuerpo exacto, lote sólo con fecha, validaciones, coma flotante, `sin_cubrir`, sin lotes, nada que conciliar, error de la vista previa); la clave (misma tras un 409, otra al cambiar datos o reabrir, `repetida`, doble clic); y el intento incierto (guardado, bloqueado, marca en la fila, reenvío igual, descartar con confirmación, destinos independientes). `test/comercio-mermas.test.tsx` (20): `Mermas` (pedido, aviso de piso en plural y singular, errores, fechas, depósito, producto, CSV, tabla/tarjetas, orden, 44 px) y la columna «Importe» de `StockMovimientos` y de `Stock` con y sin las claves. `test/iconos-indicador.test.tsx` (el concepto `mermas`) e `indicadores-por-catalogo` (Mermas cubierta por el guard).

**Cómo se adopta.** Subir el pin a 0.151.0 junto con libracommerce 0.60.0 (contra un motor anterior las claves no llegan y no cambia nada). VentaLibra: en la página de Vencimientos pasar `puedeConciliar` a quien tiene el permiso de movimientos; sumar la página de Mermas (`libra-ui/comercio/Mermas`) detrás de `costos.ver`, con `INDICADORES.mermas` como ícono del menú; el historial de movimientos no necesita nada (la columna se decide sola por lo que mande el filtro de costos).

## ADR-064 — Lo que quedaba del kit tras la tanda móvil y roles (0.152.0): `dialog` propio, las cantidades de Stock sin redondear, el texto del tope desde el motor y el modo oscuro en los e2e

Los cuatro pendientes que el humano dejó «a lo último» al cerrar la tanda 0.145.0 a 0.147.0 (VentaLibra, 2026-10-13). Cada uno con su origen y su sección. **Qué ya existe** (se miró antes de tocar, `reglas/producto.md`): `formatoCantidad` (ADR-050), el patrón de `libra-ui/ui/tabs` (ADR-058 §6), `mensaje_de_limite` de libracore (ADR-041) y `sinDesborde` de `libra-ui/e2e`.

### 1. Las cantidades del resto de Stock salen con sus decimales

**Origen.** ADR-057 («Lo que NO se tocó, y es el mismo defecto»): el diálogo de ajuste pasó a `formatoCantidad` y el resto siguió con `formatEntero` de `@/lib/utils`, que los productos escriben `String(Math.round(value))` (VentaLibra, Contalibra y Restolibra; los otros cinco no consumen estas pantallas). Un producto por peso con 1,5 kg decía «2» en la tabla y «1,5» en el diálogo. El ADR-057 dejó la decisión abierta («pasar todas a `formatoCantidad` o dejar el redondeo a propósito donde la lista es un vistazo»); el humano lo anotó como pendiente a arreglar, y no hay una lista de Stock donde un redondeo sea lo que se quiere: el motor ya redondea a la escala de la unidad (0 decimales para unidades, 3 para kilos), así que para una unidad entera `formatoCantidad` da lo mismo que `formatEntero`.

**Decisión.** Las 16 llamadas a `formatEntero` de `Stock` (celdas de mínimo, depósitos y total, tarjetas, aviso de stock bajo y su `title`, historial en tabla y en lista), `Productos` («Stock total», tabla y tarjeta), `DepositoDetalle` y `StockMovimientos` pasan a `formatoCantidad`. **Ninguna pantalla del kit importa ya `formatEntero`**: se saca del stub de los tests (si vuelve a aparecer, el `typecheck` lo marca) y deja de ser algo que el producto tenga que proveer.

**Qué cambia lo que se ve.** Sólo con decimales: 1,5 en vez de 2; un descuento de 0,25 en el historial dice «-0,25» y no «-0»; 1.250 lleva el separador de miles (el `String(Math.round(1250))` no lo llevaba). Las cantidades enteras se ven igual.

**Por qué los tests lo ven ahora y antes no.** El stub de `formatEntero` del paquete no redondeaba, así que ningún test de pantalla podía reproducirlo; `comercio-stock-cantidades-resto` lo reemplaza con el redondeo del producto (`vi.mock('@/lib/utils')`) y es el que habría fallado. Contra `origin/main` fallan sus **8 tests** (tabla, tarjetas, aviso, historial en tabla y en lista, `StockMovimientos`, `DepositoDetalle`, `Productos`); con el cambio pasan.

**Cómo se adopta.** Subir el pin; nada más. Los productos pueden borrar `formatEntero` de su `lib/utils.ts` (VentaLibra, Contalibra, Restolibra) cuando quieran: nadie más lo usa.

### 2. El texto del tope de sucursales sale del motor

**Origen.** ADR-048 («Lo que no cubre»: «el texto de `mensajeDeLimite` está duplicado a mano con el del motor (el endpoint no lo devuelve)»). `Sucursales` armaba a mano la frase que el 409 del alta ya trae del motor.

**Decisión.** libracore v1.167.0 (ADR-052 del motor) suma `mensaje_de_limite` a la lectura de `/api/limites/sucursales`. `Sucursales` la muestra tal cual cuando el alta se frena. `LimiteDeSucursales` suma `mensaje_de_limite?: string`; una clave que no es un texto, o viene vacía, se ignora (como el resto de la lectura: nunca esconde el tope).

**El respaldo (a borrar).** `mensajeDeLimite(n)` sigue exportada, como respaldo para un motor anterior a v1.167.0: sin ella un producto con el pin viejo del motor y el kit nuevo dejaría el botón deshabilitado **sin decir por qué**. Es la misma política que ADR-059 («un producto con un motor anterior ve la pantalla de siempre»). Se borra, junto con sus tests de respaldo, cuando VentaLibra (el único que pasa `rutaDelLimite`) suba el pin de libracore.

**Tests.** `comercio-sucursales` (3 nuevos, de 41 a 44): el texto del motor se muestra y la frase propia no aparece (se usa a propósito una frase distinta de la del kit), con cupo no se muestra aunque el motor lo mande, y las formas raras (`undefined`, `''`, `'   '`, `null`, `42`) caen al respaldo. El primero falla contra `origin/main`.

**Cómo se adopta.** Subir libracore a v1.167.0 y el kit a 0.152.0 en VentaLibra, en cualquier orden (el respaldo cubre el hueco).

### 3. `dialog` al kit: `libra-ui/ui/dialog`

**Origen.** ADR-058 §6 («`dialog` queda para otro lote»). Las pestañas eran idénticas en los ocho productos; **el diálogo no**. Relevado en `origin/develop`: cinco variantes (contenido sin comentarios):

| Variante | Productos | Diferencias con la de Contalibra |
|---|---|---|
| Contalibra | Contalibra | (la base) `sm:max-w-lg`, margen de 1 rem en el celular, `max-h-[85vh] overflow-y-auto`, X de 16 px llamada «Cerrar», `data-slot="dialog-close"` y reglas de `svg` en la X |
| Restolibra | Restolibra | `max-h-[calc(100svh-2rem)]` en lugar de `85vh` |
| LibraDesk | LibraDesk, LibraCargo, LibraClub | `sm:max-w-md` y sin margen en el celular, X «Close» sin `data-slot` ni reglas de `svg` |
| GestioLibra | GestioLibra, MedLibra | igual que la anterior |
| VentaLibra | VentaLibra | la anterior más la X de 44 px bajo `lg` (ADR-057) |

Las ocho ya traían el tope de alto con scroll; lo que cambia de verdad es el ancho (`lg` en dos, `md` en seis), el margen del celular, la X y su nombre.

**Decisión.** `src/ui/dialog.tsx`, exportado como `libra-ui/ui/dialog`, con **la unión de lo que arregla un defecto** y la base de Contalibra y Restolibra (que es la de shadcn/ui actual) para lo que es de gusto:

- tope de alto con scroll: `max-h-[calc(100svh-2rem)] overflow-y-auto` (el de Restolibra, que no se corta bajo la barra del navegador del celular; los demás tenían `85vh`);
- X de 44 px bajo `lg` (la de VentaLibra);
- nombre accesible de la X en castellano: **«Cerrar ventana»**, y no «Cerrar» ni «Close». «Cerrar» chocaba con los botones «Cerrar» que muchos diálogos tienen en el pie: tres tests del kit (`CambiarPassword` 2, `qr-de-la-caja`) fallaron con «Found multiple elements with the role button and name Cerrar» apenas corrieron contra Radix de verdad;
- ancho: `sm:max-w-lg` con 1 rem de margen en el celular (Contalibra, Restolibra y shadcn).

Las 37 pantallas del kit que importaban `@/components/ui/dialog` (50 `DialogContent`) importan el propio, y el stub `test/stubs/components/ui/dialog.tsx` se borra: **toda la suite corre ahora contra el Dialog real de Radix**.

**Qué cambia en cada producto al adoptarlo** (el kit ya no usa el de su `components/ui/dialog.tsx`, así que esto vale para **las pantallas del kit** apenas suben el pin, aunque el producto no toque su archivo):

| | LibraDesk, LibraCargo, LibraClub, GestioLibra, MedLibra | VentaLibra | Contalibra, Restolibra |
|---|---|---|---|
| Ancho por defecto | 🔴 **+4 rem** (`md` → `lg`) y 1 rem de margen en el celular | ídem | igual |
| Alto máximo | `85vh` → `100svh − 2rem` (un poco más alto en el celular) | ídem | Restolibra igual; Contalibra ídem |
| X de cerrar | 16 px → 44 px bajo `lg`; «Close» → «Cerrar ventana» | «Close» → «Cerrar ventana» | «Cerrar» → «Cerrar ventana»; 44 px bajo `lg` |

🔴 **Lo único que se ve distinto en una pantalla de ancho por defecto es el ancho (`md` → `lg`) en seis productos.** Las pantallas del kit se extrajeron de Contalibra y Restolibra, que ya usaban `lg`; 33 de los 50 `DialogContent` del kit usan el ancho por defecto; los otros 17 piden el suyo con `className` y no cambian. **No se midió en un navegador** (los tests corren en jsdom, que no hace layout): conviene mirar en Chromium un diálogo de cada producto antes de desplegar, sobre todo los que tienen dos columnas. Si el humano prefiere conservar `md` para esos seis, es una línea (`sm:max-w-md` en `DialogContent`) y los dos productos que hoy usan `lg` pasarían a `md`: se pide una decisión, no se adivina.

**Cómo reemplaza cada producto su copia:** `frontend/src/components/ui/dialog.tsx` → `export * from 'libra-ui/ui/dialog'`, en el mismo cambio que sube el pin. Sus propias pantallas siguen importando `@/components/ui/dialog` y reciben el del kit. Los tests o e2e de un producto que busquen la X por `name: 'Close'` (VentaLibra: `ventas-devolucion.test.tsx`) pasan a `'Cerrar ventana'`.

**Tests de la suite al pasar a Radix de verdad** (14 fallaban en 7 archivos; 6 por el nombre de la X, ya resueltos arriba; los 8 restantes eran del DOM real y no de un cambio de comportamiento): un diálogo abierto marca `aria-hidden` todo lo de afuera, así que `vencimientos` (5) busca las tablas y los avisos de la página con `hidden: true`; `ArcaPedido` (1) busca el diálogo por su título (con Radix, `aria-labelledby` gana al `aria-label`); y el stub de `ConfirmDialog` (2 tests: el pago suelto de la cuenta corriente y borrar una lista de precios) deja de ser un `<div role="alertdialog">` suelto y usa el `AlertDialog` real, como el producto, porque una confirmación abierta desde adentro de un diálogo tiene que ser de Radix para ser accesible. `comercio-productos-foco` ya no reemplaza el diálogo (lo hacía para tener el real). `ui-dialog` (9 tests nuevos): data-slots, tope de alto, ancho, `className` que le gana, la X de 44 px y su nombre, `showCloseButton`, Escape con el foco de vuelta, y el guard de que ningún fuente importa `@/components/ui/dialog`.

### 4. El modo oscuro, en los e2e

**Origen.** La pasada visual del 2026-10-02 («hacé la pasada visual en modo oscuro») se hizo a mano con un Chromium y un script descartable (0 textos bajo 4,5:1 en ~80 pantallas; el nombre del producto a 1,44:1 y el éxito a 4,28:1 antes de arreglarlos) y el wiki la dejó como pendiente de automatizar. **El texto exacto de la decisión no está escrito** en el ADR de ningún repo ni en la bitácora (sólo «decidido, sin hacer» en la lista de pendientes): lo que sigue es la lectura más chica de «automatizado en los e2e», y es lo que hay que confirmar con el humano.

**Decisión.** `libra-ui/e2e` suma dos ayudas, hermanas de `sinDesborde`:

- `ponerModo(page, 'oscuro' | 'claro')`: fija `libra.modo` en `localStorage` con `addInitScript`, antes del primer cuadro, igual que quien lo elige con el botón sol/luna (`libra-ui/modo` lo lee al arrancar).
- `sinTextoIlegible(page, { modo?, minimo?, minimoGrande?, ignorar? })`: por cada elemento con texto propio y visible, mide el contraste WCAG del texto contra el fondo que resulta de apilar los `background-color` de sus ancestros (los colores con alfa se componen y los `oklch()` de `tema.css` se convierten con un canvas, porque `getComputedStyle` los devuelve sin pasarlos a RGB). 4,5:1 (3:1 el texto grande: 24 px, o 18,66 px en negrita). **Falla antes de medir** si `<html>` no tiene (o tiene) la clase `dark` según el modo pedido: sin esa guarda un modo que no se aplicó dejaría pasar todo en verde. El mensaje dice el elemento, el texto, la cifra y los dos colores.

**Qué no mide, dicho en la docstring:** bordes, íconos ni gráficos; el valor de un `<input>`; un fondo con imagen o degradé (se saltea ese texto, no se inventa un fondo); ni `opacity` (un texto atenuado por opacidad se mide como si no lo estuviera). Se eximen los controles deshabilitados (WCAG), el texto `sr-only` y lo que el spec pase en `ignorar`, con su razón escrita ahí.

**Tests** (`e2e/test/ayudas.spec.ts`, de 16 a 22, contra el servidor de juguete en un Chromium): `ponerModo` en los dos sentidos; una pantalla legible con colores `oklch()`, una tarjeta translúcida y texto `sr-only` pasa; la pantalla mala falla nombrando `p#wordmark «VentaLibra» 1,44:1 < 4,5:1 (rgb(45, 45, 45) sobre rgb(10, 10, 10))` (la misma cifra que midió la pasada a mano) y el blanco al 20% de opacidad, sin nombrar el texto grande a 3,4:1, el deshabilitado ni el del degradé; `minimoGrande` e `ignorar`; **sin `ponerModo` falla con un mensaje que lo dice** (el control de que no pasa en vacío); y el modo claro de la misma pantalla.

**El spec de VentaLibra** (`frontend/e2e/modo-oscuro.e2e.ts`, en su worktree) recorre las 29 rutas del menú del admin y el POS con una línea, como `navegacion-y-ancho`. **Necesita el pin de libra-ui 0.152.0** (las ayudas no existen antes) y **no se corrió contra la app**: lo que mide hoy es una pregunta abierta, y un primer rojo puede ser un defecto real o un falso positivo de la medición (un fondo que el método no ve). Por eso conviene correrlo primero con `workflow_dispatch` y `repetir`, y decidir con lo que salga si queda requerido o con `ignorar`.

**Cómo se adopta.** Subir el pin a 0.152.0, sumar el spec, y correrlo en el CI. Los demás productos con `frontend/e2e` (hoy sólo VentaLibra) lo copian con su propia lista de rutas.

### Tests y verificación

**2.809 → 2.829 tests** (111 → 113 archivos, 2 omitidos igual que antes): `comercio-stock-cantidades-resto` (8), `ui-dialog` (9), `comercio-sucursales` (+3). **Contra `origin/main` (los mismos archivos copiados a un árbol de `origin/main`) fallan 9 de los 11 que cargan** —los 8 de cantidades y el del texto del motor; los otros 2 de Sucursales son del respaldo y tienen que pasar— y `ui-dialog` (9) no carga: el archivo no existe. Suite completa con cobertura (líneas 99,2 %, ramas 92,93 %, funciones 96,85 %: sobre los pisos de 96/90/95), `typecheck` limpio y `lint` con los mismos 46 avisos y 0 errores. Aparte, los tests de las ayudas de e2e (`npm run test:e2e`, Chromium): 22 de 22 (eran 16).

## ADR-065 — Vencimientos y lotes sin scroll de costado (tabla o tarjetas) y sin el respaldo del texto del tope (0.152.1)

**Pedido del humano (2026-10-15), tras una revisión en Chromium a 390 px contra VentaLibra con el kit 0.152.0.** Dos cosas: (1) «en el celular hay que deslizar la tabla para encontrar el botón Conciliar»; principio del humano, el mismo de ADR-016 y ADR-057: **no tiene que haber scroll horizontal**. (2) Sacar el respaldo `mensajeDeLimite` que ADR-064 dejó «a borrar» cuando toda la suite estuviera en libracore v1.167.0.

**Qué ya existe** (se miró antes de escribir): el híbrido de Stock y de Ventas (`useAncho` + umbral + `enTarjetas`, ADR-016 y ADR-020), `TablaOTarjetas`/`TarjetaDeFila` (ADR-057) y `TACTIL`. Lo nuevo es aplicar el mismo mecanismo a una pantalla que no lo tenía; no hay otro diseño.

### 1. Las dos tablas de Vencimientos pasan a tarjetas cuando no entran

**Medido** (Chromium, VentaLibra local con libra-ui 0.152.0, 390 px): las dos tablas del reporte (lotes; «Sin lote / sin fecha») iban en un `overflow-x-auto` dentro de su `Card`. A 390 px el contenedor mide 341 px y la tabla pide más: las columnas de la derecha, con **«Dar de baja (merma)», «Asignar vencimiento» y «Conciliar», quedaban fuera de la pantalla** y sólo aparecían deslizando la tabla. La página no se ensanchaba (el scroll era interno), por eso `sinDesborde` no lo veía.

**Decisión.** Cada tabla mide su contenedor con `useAncho` y, si es más angosto que lo que la tabla necesita, pinta una `TarjetaDeFila` por fila en lugar de la tabla (sin medida —jsdom, sin `ResizeObserver`— se queda la tabla, como en el resto del kit). La tabla de escritorio no cambia: mismo marcado, mismo orden por columna, y conserva su `overflow-x-auto` como último recurso. Los botones son los mismos objetos en la tabla y en la tarjeta (`botonDeBaja`, `botonesDeSinLote`, `badgeDeSituacion`): mismas `aria-label`, mismos diálogos, mismas reglas de cuándo aparece cada uno («Asignar vencimiento» sólo en «Sin fecha», «Conciliar» sólo en «Salidas sin lote» y con `puedeConciliar`). Una tarjeta de lote lleva el producto (con la marca «Intento sin confirmar» si la hay) y su variante y categoría, el estado en días a la derecha, Código, Sucursal / depósito (con «Depósito inactivo»), Lote, Vence y Saldo, y el botón. Una de «sin lote», lo mismo con Código, Sucursal / depósito y Saldo sin lote (en rojo si es negativo), la situación a la derecha y su botón. Lo que las tarjetas **no tienen** es el orden por columna (como en ADR-057): la lista se ve en el orden en que está; si ya se había ordenado en la tabla, se conserva, y «Orden por vencimiento» sigue en la cabecera.

**El umbral es un número por tabla, no una suma de `size`.** Estas tablas están escritas a mano, de layout automático, sin `size` por columna (no son `DataTable`), así que no hay suma que hacer. Se midió el ancho mínimo que cada una pide (`table.style.width = 1px` y leer `offsetWidth`, Chromium, datos controlados): con códigos, lotes y saldos cortos, **878 px la de lotes y 725 la de «sin lote»**; con datos anchos (códigos EAN-13, lotes de diez caracteres, saldos de millones) **1.039 y 841**. `ANCHO_TABLA_LOTES = 1040` y `ANCHO_TABLA_SIN_LOTE = 845` cubren el caso ancho: **equivocarse cuesta una tarjeta de más, no un scroll**. Contenedores medidos (menú abierto): 341 px a 390, 447 a 768, 703 a 1024, 959 a 1280; desde 1366 de ventana entran las dos tablas. Resultado del barrido (390, 768, 1024, 1280, 1366, 1440 y 1920 px, con datos típicos y con datos anchos): 0 px de desborde de página, 0 px de scroll interno en toda tabla que se ve, 0 botones fuera de la pantalla, 0 tarjetas con desborde. A 1280 la de lotes ya es tarjetas (959 < 1040) y la de «sin lote» sigue siendo tabla (959 > 845): **cada una cambia con su ancho**.

**Cuando el umbral se queda corto.** Un dato más ancho que el medido (un código de 25 caracteres sin cortes) hace que la tabla pida más que el umbral; ahí el `overflow-x-auto` de la tabla vuelve a ser el scroll de antes, sólo en ese rango de ancho. Es el costo de un umbral fijo en una tabla de layout automático; medirlo en cada render (`scrollWidth`) se descartó porque no se puede probar en jsdom y puede oscilar entre tabla y tarjetas.

**`TarjetaDeFila` suma `accionesConTexto`** (aditiva; `acciones` queda igual). `acciones` envuelve sus botones en `TACTIL` (`[&_button]:size-11`), que sirve para botones de ícono: con un botón de rótulo lo vuelve un cuadrado de 44 px de ancho y el texto se sale. `accionesConTexto` los pone en una fila que se parte (`flex flex-wrap gap-2`) con `[&_button]:min-h-11` y `[&_a]:min-h-11` (`TACTIL_CON_TEXTO`, en `use-ancho.ts`): 44 px de alto y el ancho del rótulo. Sin botones (un rol sin permisos, o una fila sin acción posible) no se pinta el contenedor. **44 px siempre, no sólo bajo `lg`:** el pedido decía «bajo `lg`», pero las tarjetas aparecen también con la ventana más ancha que 1024 px y el menú abierto (703 px de contenedor a 1024), y ADR-021 fija 44 px en toda tarjeta (es la vista del dedo). Los botones de la **tabla** no cambian (el «Conciliar» ya llevaba `max-lg:h-11`).

**Modo oscuro.** Las tarjetas usan `TarjetaDeFila` (`border`, `text-muted-foreground`, `text-destructive`) y los colores de estado que ya tenía la tabla (`dark:text-amber-400`): sin colores nuevos. Revisado en una captura a 390 px en oscuro.

### 2. Sin el respaldo `mensajeDeLimite`

**Origen.** ADR-064 §2 dejó `mensajeDeLimite(n)` exportada «como respaldo para un motor anterior a v1.167.0» y dijo que se borraba cuando los productos subieran el pin. Toda la suite ya está en libracore v1.167.0: `GET /api/limites/sucursales` trae `mensaje_de_limite`.

**Decisión.** Se borra `mensajeDeLimite` (era una exportación pública: ningún producto la importa; el `lint` bajó un aviso, `only-export-components`). `Sucursales` muestra **sólo el texto del motor**: si la lectura no lo trae (ausente, vacío, no-texto), **no hay aviso** y no se inventa una frase. Con el tope alcanzado el alta sigue deshabilitada y queda a la vista el «N de M sucursales contratadas»; el botón sigue apuntando con `aria-describedby` a ese bloque. **Un producto con un motor anterior a v1.167.0 vería el alta deshabilitada sin la frase de por qué:** ya no hay ninguno en la suite, y si apareciera hay que subirle el pin del motor, no restituir el texto acá.

### Tests y verificación

**2.829 → 2.839 tests** (113 → 114 archivos, 2 omitidos igual que antes): `comercio-vencimientos-tarjetas` (10, nuevo), `tabla-o-tarjetas` (+1, `accionesConTexto`), `comercio-sucursales` (3 reescritos: dos pasan a mandar el texto desde el motor, uno pasa a fijar que sin `mensaje_de_limite` no se inventa texto —ausente, `''`, `'   '`, `null`, `42`—; se borró el de la paridad del texto de respaldo). **Contra `origin/main` (los tres archivos copiados a un árbol de `origin/main`) fallan 9 de 70**: 7 de Vencimientos (tarjetas a 341 px en las dos listas, botones de 44 px, diálogos desde la tarjeta, umbral propio de cada tabla, sin permisos y sólo `puedeMover`), el de `accionesConTexto` y el de «sin `mensaje_de_limite`»; los 61 restantes pasan en los dos árboles (la tabla a ancho grande, sin `ResizeObserver` y el orden por columna de Vencimientos, que son las guardas de que la tabla no cambió). Suite completa con cobertura (líneas 99,2 %, ramas 92,92 %, funciones 96,86 %: sobre los pisos de 96/90/95), `typecheck` limpio y `lint` con 45 avisos (eran 46 en `main`: el de `Sucursales` por la exportación borrada) y 0 errores.

**Cómo se adopta.** Subir el pin a 0.152.1; no hay props nuevas ni cambia ninguna. VentaLibra y los demás que usan `Vencimientos` ven las tarjetas por debajo de 1040 px (lotes) y 845 px (sin lote) de contenedor.

## ADR-066 — Aviso no bloqueante de la próxima versión de los Términos, con «Aceptar» por adelantado (0.153.0)

**Pedido del humano (2026-10-15).** Los Términos 1.1 (el abono pasa a precio final con IVA incluido) entran solos el 09-11-2026 (libraauth ADR-021) y el humano decidió que la conformidad de las cláusulas 29.2 y 29.4 se dé **dentro del sistema**: que el responsable de cada cliente pueda aceptar la 1.1 al entrar, antes de que rija. El backend lo hace posible desde libraauth v0.51.0 (ADR-024: `proxima` en `GET /terminos` y `POST /aceptar` con la versión próxima). Esto es la mitad que se ve.

**Qué ya existe** (se miró antes de diseñar). `GateTerminos` ya consulta `GET {terminosPath}` al entrar con sesión y ya conoce el prefijo (`/terminos`, o `/api/terminos` en Contalibra y Restolibra, por `createAuthContext({ terminosPath })`); `PantallaTerminos` ya sabe pedir `?texto=1` y pintar el contrato con sus estilos (`ESTILOS_DEL_CONTRATO`); `ui/dialog` es el diálogo del kit. No hay endpoint, estilo ni dependencia nuevos: el aviso cuelga del mismo gate y de la misma consulta.

**Decisión.**
- **`AvisoProximaVersion`, una tarjeta fija y no un banner ni un modal.** Abajo a la derecha en escritorio (`sm:w-[26rem]`), de borde a borde en el celular (`inset-x-3`, respetando el área segura). Un banner en el flujo choca con los layouts de pantalla completa y con la barra lateral fija (`fixed inset-y-0`), que lo taparía; un modal tapa la pantalla de quien entra a trabajar y es justo lo que el 09-11 hace de verdad. La tarjeta se ve, se ignora y no mueve nada. Colores de tokens (`bg-card`, `text-muted-foreground`, `border`): hereda el modo oscuro y el tema de cada producto, sin colores nuevos. Botones de 44 px bajo `lg` (`max-lg:h-11`).
- **Texto:** «Desde el {vigente_desde} rige la versión {version} de los Términos y Condiciones. {resumen_del_cambio}»; el resumen es opcional (sin él no queda un espacio ni un «null»).
- **«Leer la versión 1.1» abre un diálogo** con el `texto_html` de la **próxima** (el que ya genera libraauth con el mismo convertidor que las páginas públicas), con los estilos del contrato y su huella SHA-256. Lo pide recién al abrirlo (`GET …?texto=1`, ~30 KB): el estado liviano de cada carga no lo trae. Si no llega (el backend no lo manda o la llamada falla) ofrece un enlace a la página pública, `URL_TERMINOS_PROXIMA = '/legal/terminos-proxima.html'` (`urlTextoProxima` de `GateTerminos` lo cambia: la landing suele estar en otro dominio que la aplicación).
- **«Aceptar» exige tildar «Leí la versión 1.1 y la acepto en nombre de la empresa»**, como la pantalla bloqueante. El pedido decía sólo el botón; se agregó la casilla porque lo que se guarda es la prueba de la cláusula 30.3 y el acuerdo de la 29.4 tiene que ser expreso: una aceptación de un clic suelto, en una tarjeta que se descarta sin querer, es más débil que la del gate. Si el humano prefiere un clic, se saca la casilla (una línea). El `POST` lleva **la versión del aviso** (`proxima.version`), no una constante, y va al prefijo del `GateTerminos`. Al aceptar, la tarjeta pasa a «Aceptado. Gracias.» (`role="status"`) con «Cerrar»; la app no se recarga (no era un gate). Un error se muestra en la tarjeta y deja reintentar.
- **«Más tarde» lo oculta hasta el próximo ingreso:** marca en `sessionStorage` (por versión) y al cerrar sesión o vencer la sesión (`activo` pasa a falso) se olvida. Sobrevive a recargar la pestaña, no a un ingreso nuevo. Sin `sessionStorage` (ventana privada, datos bloqueados) sigue andando: se oculta mientras la tarjeta está montada.
- **Quién lo ve.** Sólo quien `puede_aceptar` y mientras la `proxima` no esté `aceptada`. **Quien no puede aceptar no ve nada** (decisión): un operador no puede hacer nada con el aviso y verlo todos los días es ruido; la noticia es del responsable. Tampoco aparece si `proxima` es `null` (sin próxima, o una **demo**: libraauth no manda el bloque), si falta el campo (backend anterior a v0.51.0) o si la consulta falla. **Con la vigente pendiente manda el gate bloqueante** y el aviso no se pinta.
- **El gate bloqueante del 09-11 no cambia** y no depende de esto: si el responsable no acepta, ese día `PantallaTerminos` pide la aceptación como siempre. El aviso es una comodidad, no un corte.
- **Ayudas e2e (`libra-ui/e2e`).** La tarjeta es `fixed` y puede quedar encima de un botón y hacer fallar un clic de un spec de producto que entra como admin. `aceptarTerminos` (y por lo tanto `entrarComo`) ahora la descarta con «Más tarde» si `GET /terminos` dice que corresponde mostrarla, y `descartarAvisoDeProximaVersion(page)` se exporta suelta. No acepta nada. `e2e/dist/` regenerado.

**Prefijo `/api/terminos`.** Contemplado: el aviso usa el `basePath` del `GateTerminos`, que `createAuthContext` arma con `terminosPath`. Contalibra y Restolibra ya lo pasan (`/api/terminos`); un test lo fija para la consulta, la lectura y la aceptación. Las ayudas e2e (`aceptarTerminos`) consultan `GET /terminos` por defecto y aceptan `{ ruta }`: un producto con prefijo `/api` ya tenía que pasarla y sigue igual.

**Lo que no resuelve.**
- **No se vio en un navegador real**: no hay una aplicación del kit para levantar. Lo medido es jsdom (comportamiento, roles, textos) y el spec de Chromium de las ayudas contra el servidor de juguete. El móvil y el modo oscuro se apoyan en los tokens y en el mismo patrón de los diálogos del kit; conviene una mirada a 390 px y en oscuro en el primer producto que lo adopte (VentaLibra, que ya tiene e2e de modo oscuro).
- La tarjeta se superpone con lo que haya abajo a la derecha (un botón flotante de ayuda, por ejemplo). Se descarta con «Más tarde»; si algún producto tiene un elemento fijo ahí, se ajusta con `z-40`/posición en el kit.
- Quien acepta desde la tarjeta no ve el texto de la 1.1 si no abre «Leer»: la casilla afirma que lo leyó, igual que en el gate.

### Tests y verificación

**2.839 → 2.860 tests** (114 → 115 archivos, 2 omitidos igual que antes): `TerminosProxima` (21, nuevo). **Contra `origin/main` (los tests copiados al `Terminos.tsx` anterior) fallan 13 de 21**: el aviso con su texto, sin resumen, «Aceptar» con la versión próxima y en `/api/terminos`, el error al registrar, el callback, los tres de «Más tarde», los tres de «Leer» y el cableado por `AuthProvider`; los 8 que pasan en los dos árboles son los controles negativos (no aparece con la próxima aceptada, sin `proxima`, con backend anterior, sin poder aceptar, con la vigente pendiente, con error, sin sesión, con `sinGateDeTerminos`). Además, 4 mutaciones del código nuevo ponen rojos los tests esperados (mandar `1.0` en vez de la próxima; ignorar `puede_aceptar`/`aceptada`; no olvidar al cerrar sesión; no respetar `pendiente`). Suite completa con cobertura (líneas 99,21 %, ramas 92,93 %, funciones 96,87 %: sobre los pisos de 96/90/95), `typecheck` limpio y `lint` con los mismos 45 avisos y 0 errores. Ayudas e2e en Chromium: **24 de 24** (eran 22; +2: el aviso se descarta aun tras aceptar el gate, y no falla si no está).

**Cómo se adopta.** Subir el pin a 0.153.0 junto con libraauth v0.51.0; no hay props nuevas obligatorias ni cambia ninguna. Con el pin del kit sin el del backend (o al revés) no pasa nada: sin `proxima` no se ve el aviso, y con `proxima` y un kit anterior el backend la ofrece y nadie la muestra.

## ADR-067 — Los desbordes a 390 px y los contrastes de insignias que midió el e2e de Contalibra (0.154.0)

**Origen (2026-10-16).** El primer corrido de los e2e de dominio de Contalibra (`navegacion-y-ancho.e2e.ts` y `modo-oscuro.e2e.ts`, `develop` @ 23f04dc, kit 0.152.1) dejó dos tablas de defectos conocidos del kit, en `fixme`: `DESBORDE_A_390` (ocho pantallas cuyo documento mide más que la ventana de un celular y no a 1280 px) y `CONTRASTE_CONOCIDO` (texto blanco sobre un fondo que no llega a 4,5:1, WCAG AA; los colores no cambian entre claro y oscuro, así que el defecto está en los dos). El pedido: arreglarlos **de fondo en el kit** y que cualquier pantalla lo herede.

**Qué ya existe** (se miró antes de tocar, `reglas/producto.md`): `TabsList` con `className="h-auto flex-wrap"` ya lo pasaban a mano seis pantallas (Configuración, Logs de `src/`, Presupuestos, Libros IVA, Ventas, la tarjeta de ARCA) y tres no (Comprobantes, la bandeja de MercadoPago, Logs de `comercio/`); el primitivo `libra-ui/ui/table` ya trae `overflow-x-auto` y las pantallas de lista lo envuelven a mano (`<div className="overflow-x-auto">`, 14 lugares; ADR-057 §6, ADR-058); `libra-ui/tema` ya trae `luminancia`, `contraste`, `mezclar` y `ajustarContraste` (ADR-009, 0.104.0); `badge-estado` ya usa los tonos `-700` con texto del mismo tono (ADR de 2026-08-21: «no emparejar sin volver a medir»). Lo nuevo es llevar esas tres cosas al componente base, y un guard.

### Medido antes (Chromium, ContaLibra local con el kit 0.153.0, las dos tablas vaciadas)

`navegacion-y-ancho` + `modo-oscuro`: **11 fallan de 72** (3 de contraste y 8 de desborde), con las mismas cifras que el e2e: `/facturas` 579 px, `/mp-bandeja` 670, `/logs` 394, `/libros-iva` 415, `/facturas/nueva` 405, `/presupuestos/nuevo` 405, `/facturas/:id` 429, `/turnos/:id` 487; «FC» 2,71:1, «Factura» 1,96, «Turno» 2,57, «Presupuesto» 2,13, «Registrar pago» 3,77.

### Desbordes: cuatro causas, y la fila `flex-1` NO era una

| Pantalla | Causa (medida) | Arreglo | Dónde |
|---|---|---|---|
| `/facturas`, `/mp-bandeja`, `/logs` | `TabsList` era `h-9 w-fit` sin wrap y cada pestaña es `whitespace-nowrap`: las pestañas suman 579, 670 y 394 px y la grilla de la pantalla crece al mínimo de su contenido | `TabsList` = `inline-flex min-h-9 w-fit max-w-full flex-wrap items-center … gap-y-0.5`: se parte en renglones | **componente base** (`src/ui/tabs.tsx`); lo heredan todas; las seis que lo pasaban a mano siguen igual |
| `/libros-iva`, `/facturas/:id`, `/turnos/:id` | `<table className="w-full text-sm">` suelta, sin contenedor con scroll | `<Table>` de `libra-ui/ui/table`, que ya trae `overflow-x-auto` (mismas clases de tabla) | el primitivo ya lo traía; se usa en las **nueve** tablas sueltas de siete pantallas (las tres de arriba y `PresupuestoDetalle`, `RemitoDetalle`, las tres de `ClienteDetalle` y `DepositoDetalle`), no sólo en las tres medidas; los dos formularios de ítems, aparte (siguiente fila) |
| `/presupuestos/nuevo` | la tabla de ítems mide **362 px** (columnas fijas de cantidad, precio y subtotal) y la tarjeta tiene ~340 a 390 px; la grilla de la tarjeta (`grid`, columna `auto`) crece al mínimo de la tabla y arrastra a todas las filas, que son las que el e2e vio pasarse | el marco de la tabla lleva `min-w-0` (sin él un scroll adentro no tiene de qué ser: la columna igual crece) y la tabla un `max-sm:overflow-x-auto`; bajo `sm` el desplegable de sugerencias deja de ser `absolute` (el scroll lo recortaría) y va en el flujo de la celda, con tope de alto | `PresupuestoForm` y, por el mismo patrón, `RemitoNuevo` |
| `/facturas/nueva` | **es de Contalibra, no del kit** (`frontend/src/pages/FacturaNueva.tsx`): una copia del mismo formulario, con la misma tabla de 362 px | el mismo parche; queda como diff para Contalibra (no se toca desde acá) | Contalibra |

**Corrección al diagnóstico del e2e.** Las filas `flex flex-wrap items-end` con un campo `flex-1` que se listaban como culpables **no lo eran**: con la tabla contenida (el arreglo de arriba) esas filas miden lo que la tarjeta y la página no se pasa a 390 px. Se pasaban porque la columna de la tarjeta ya medía 405, arrastrada por la tabla.

**Guard.** `test/desborde-390-tabs-y-tablas.test.tsx`: `TabsList` hace wrap por defecto y conserva el wrap si la pantalla pasa su `className`; ninguna pantalla pasa `flex-nowrap`, `h-9` ni `overflow-hidden`; **toda `<table` de `src/` va dentro de `<Table>` o justo debajo de un `overflow-x-auto`** (salvo dos a propósito: el detalle de venta, que bajo `lg` son tarjetas, y «Cambios» de Logs, que vive dentro de una tabla que ya scrollea); `Libros IVA` y el formulario con sus clases.

### Contraste: el color manda el texto, no al revés

- **Tipo de comprobante (`Facturas`).** `bg-sky-500 text-white` (2,71:1) → `bg-sky-700 text-white` (5,9:1), mismo matiz. Es el mismo tono `-700` que `badge-estado` ya usa para «en curso». Las notas de crédito, `bg-destructive text-white`, **en oscuro daban 2,89:1** (el `destructive` oscuro de shadcn es un rojo claro, medido: blanco sobre rgb(255, 100, 103)) y no estaban en la lista porque la semilla no tiene notas: pasan a `dark:bg-destructive/60` (el patrón del `Badge` destructivo de shadcn: 6,0:1 sobre la tarjeta oscura).
- **Tipo de evento (`Logs`, de `comercio/` y de `src/`).** El color lo manda el motor (`TIPO_META`, la paleta de Bootstrap: `#0dcaf0`, `#fd7e14`, `#20c997`…), y el motor no sabe de contraste. **`libra-ui/color-de-insignia`** (`fondoDeInsignia`, `estiloDeInsignia`): el texto sigue blanco y el fondo se oscurece lo justo —`ajustarContraste`, que mezcla con negro de a poco y no cambia el matiz— hasta 4,5:1. Un color que ya llega (azul `#0d6efd`, verde `#198754`, violeta, gris, rosa, rojo) queda **exactamente** como lo mandó el motor; los tres que no: Factura `#0dcaf0` → `#087990` (1,96 → 5,1:1), Turno `#fd7e14` → `#b1580e` (2,57 → 4,9:1), Presupuesto `#20c997` → `#158362` (2,13 → 4,7:1). Un valor que no es un color (o ninguno) da un gris pizarra `#475569` en vez de un fondo que el navegador ignora con texto blanco encima (en oscuro, `bg-primary` es casi blanco).
- **«Registrar pago» (`CuentaCorrienteDetalle`).** `bg-exito text-exito-foreground` con el éxito en `#059669` = 3,77:1. El arreglo es del **token**: `--libra-exito` pasa a `#047857` (emerald-700, 5,5:1), que ya era el éxito como texto en claro (`--libra-exito-como-texto-claro`), así que `text-exito` y `bg-exito` coinciden. Y el piso del texto sobre el éxito en `COLORES_DE_TEMA` sube de 3 a 4,5: un verde más claro, elegido en el backoffice, ya no se queda con texto blanco chico a 3,8:1: se le calcula uno oscuro (nunca se rechaza: el mejor de blanco u oscuro siempre llega a 4,58). **Cambia lo que se ve** en todo `bg-exito` (barras de «Reportes» y «Caja por medio de cobro», el punto de «Turno abierto», el botón de Tesorería): un verde un paso más oscuro en los dos modos.

### Otras insignias con el mismo defecto (relevadas con `git grep`, no medidas por el e2e: no están en los datos de su semilla)

| Dónde | Antes | Ahora |
|---|---|---|
| `MpBandeja` (`OrigenBadge`) «Cuenta MP» | `bg-sky-500` 2,71:1 | `bg-sky-700` |
| `MpBandeja` «Tarjeta de crédito» | `bg-emerald-600` (Tailwind 4: 3,65) | `bg-emerald-700` |
| `MpBandeja` «Tarjeta de débito» | `bg-cyan-600` 3,6 | `bg-cyan-700` |
| `MpBandeja` «Efectivo» | `bg-amber-500` 2,1 | `bg-amber-700` |
| `Logs` y `comercio/Logs` «Ingreso»/«Login» | `bg-emerald-600` | `bg-emerald-700` |
| ídem «Salida»/«Logout» | `bg-muted-foreground`: 4,7 en claro, **2,6 en oscuro** | `bg-slate-600` (7,6; el tono «neutro» de `badge-estado`) |
| ídem «Intento fallido» | `bg-destructive`: 4,8 en claro, **2,9 en oscuro** | `+ dark:bg-destructive/60` |
| Notas de crédito de `Facturas` (NCA/NCB/NCC) | ídem destructive | `+ dark:bg-destructive/60` |
| Tutorial «MercadoPago» (`configuracion/tutoriales`) | `bg-[#009ee3]` con `text-xs`: 3,0:1 | `bg-[#007eb6]` (4,5:1) |
| Tutorial «Gmail» | `bg-destructive`, en oscuro 2,9 | `+ dark:bg-destructive/60` |

**Guard** (`test/contraste-de-insignias.test.ts`): `fondoDeInsignia` llega a 4,5:1 para cada color de `TIPO_META` (v1.170.0), no cambia el matiz (±4°) y deja intacto el que ya llega; el éxito por defecto lleva blanco a 4,5:1 y `tema.css` declara el mismo valor que el catálogo; y un escaneo del código: **ninguna clase `bg-<color>-<tono> … text-white`, `bg-[#hex] … text-white` ni `bg-destructive`/`bg-muted-foreground … text-white` sin variante `dark:` del kit queda bajo 4,5:1** (la paleta de Tailwind 4 va escrita en el test; un tono que no está se pide, no se da por bueno).

### Lo que cambia visualmente

- Pestañas que se parten en dos o tres renglones bajo ~600 px (`/facturas`, `/mp-bandeja`, `/logs`); con una insignia de contador adentro de una pestaña la barra pasa de 36 a 38 px, como ya eran las seis que la partían.
- Insignias un paso más oscuras (mismo matiz) en Comprobantes, Logs y la bandeja de MercadoPago, y verde de éxito más oscuro.
- Bajo `sm` los formularios de ítems scrollean la tabla de costado dentro de su marco y el desplegable de sugerencias sale en el flujo de la celda.

### No resuelve (y queda a la vista)

- **El resto de los formularios de Contalibra no hereda el kit:** `FacturaNueva` es de Contalibra; y un producto que sigue con su propio `components/ui/tabs.tsx` no hereda el `TabsList`.
- **`RemitoNuevo` a 320 px** todavía se pasa ~33 px (a 390 y a 360 px pasa). No es la tabla (ya scrollea adentro) y, medido ocultando de a uno los campos de la fila de cliente, fecha y observaciones, tampoco el `flex-1` solo; no estaba en las tablas de defectos y no se siguió.
- **El desplegable de sugerencias de escritorio** no tiene tope de alto (20 resultados miden ~1.040 px). Pre-existente; sólo se acotó bajo `sm`, que es donde el scroll lo habría recortado.
- **Contraste con `opacity`:** las píldoras de tipo de evento no elegidas bajan a 0,4 de opacidad a propósito y el medidor del e2e no mira la opacidad.
- El encabezado del POS (`--libra-pos-encabezado-texto`) conserva su piso de 3:1 (franja con degradé, texto grande): no se tocó.

### Tests y verificación

**2.862 → 2.889 tests** (115 → 117 archivos): `contraste-de-insignias` (19) y `desborde-390-tabs-y-tablas` (8); cambian el test del éxito de `tema` (el piso es 4,5) y el snapshot de `ArcaServicios` (sólo la clase de la barra de pestañas). **Contra `origin/main` (los tests copiados a un árbol sin el cambio) fallan 7 de 43** (pestañas, tablas sueltas, formulario, éxito, snapshot) y, con sólo `color-de-insignia.ts` copiado, **3 de 19** del contraste: el guard encuentra 19 líneas del kit con texto blanco sobre un fondo que no se lee. Suite completa con cobertura (líneas 99,21 %, ramas 92,93 %, funciones 96,88 %: sobre los pisos de 96/90/95), `typecheck` limpio y `lint` con los mismos 45 avisos y 0 errores.

**Medido en Chromium, contra Contalibra `develop` @ 7ade644 corriendo local con este kit** (PostgreSQL propio, `seed_demo`, las dos tablas de defectos vaciadas): **11 de 72 fallaban con el kit 0.153.0 y pasan los 72 con éste**; el e2e completo de Contalibra: 84 pasan y 3 se omiten (otros `fixme` suyos, ajenos). A 390 y 1280 px, en claro y en oscuro: el documento mide 375 px (390 menos los 15 de `scrollbar-gutter`) en las tres pantallas de pestañas. Con el medidor real de `libra-ui/e2e` (`sinTextoIlegible`) en claro y en oscuro: las insignias y botones tocados, los dos tabs de Logs (Actividad y Accesos) y un muestrario con cada combinación de clases nueva, sin textos ilegibles; el mismo medidor sobre las clases de antes (`bg-destructive text-white`, `#059669`, `#00a6f4`) en oscuro marca 2,89, 3,77 y 2,71.

**Cómo se adopta.** Subir el pin a 0.154.0. Contalibra: vaciar `DESBORDE_A_390` y `CONTRASTE_CONOCIDO` en sus specs (con el kit 0.154.0 pasan las 72) y aplicar el parche de `FacturaNueva` (el marco `min-w-0`, el `max-sm:overflow-x-auto` y el desplegable `max-sm:static`) para sacar `/facturas/nueva`. Los demás productos: nada que cambiar; si tienen su propio `components/ui/tabs.tsx`, reemplazarlo por `export * from 'libra-ui/ui/tabs'`.

## ADR-068 — «Pendiente» sale del motor: las facturas acreditadas se rotulan «Acreditada» y no se ofrecen para cobrar (0.155.0)

- Estado: aceptada
- Fecha: 2026-10-16
- Contexto: el ADR-059 del motor (libracore v1.172.0, PR #402) redefine lo pendiente: `total − cobrado − acreditado`, donde acreditado es lo que restan las notas de crédito **con CAE**, nunca negativo. La API suma campos aditivos: `total_acreditado` y `pendiente` en el detalle (`GET /api/facturas/{id}`) y por fila del listado, y `pendiente` por fila del tablero. Cobrar una factura acreditada por completo da 409 «ya está acreditada por completo por notas de crédito». Con el kit de antes (`cobrado < total`), una factura acreditada por completo figuraba «Sin cobrar», con el botón de cobrar (que daba 409), y el detalle decía «Pendiente de cobro — $ 1.000,00» o, si se había cobrado, «Cobrado completo — $ 0,00»; el tablero mostraba el total de una factura cobrada a medias.
- Qué ya existe (se miró antes, `git grep -n "cobrado\b\|total - \|\.total -" src`): tres lugares restaban a mano (`Facturas.tsx` dos veces —el rótulo y el botón—, `FacturaDetalle.tsx` con `pendiente <= 0`, `comercio/Dashboard.tsx` que mostraba `total`). `CuentaCorrienteDetalle` ya lee `f.pendiente` de las facturas pendientes de la cuenta corriente (el motor las cambia por su lado: una nota parcial deja la factura con lo que se debe) y no resta nada. `EgresoDetalle` calcula `egreso.total − totalPagado` pero es un egreso a proveedores, sin notas de crédito: no entra. `badge-estado` ya tiene los cinco tonos con contraste AA medido (ADR de 2026-08-21, ADR-067).
- Decisión: **un módulo, `libra-ui/estado-de-cobro`, con la cuenta; las pantallas no restan.**
  - `pendienteDe(cuenta)`: el `pendiente` del motor si llega (no se vuelve a calcular: el motor excluye las notas sin CAE, las anuladas y las de otro emisor o ambiente, y la pantalla no lo sabe); si no, `total − cobrado − acreditado`. Nunca negativo. `tienePendiente` usa la tolerancia del motor (`MEDIO_CENTAVO`, `sql_con_pendiente`).
  - `estadoDeCobro(cuenta)`: `acreditada` si `total_acreditado >= total` (aunque se haya cobrado antes); `cobrada` si no falta nada; `parcial` si se cobró algo y falta algo; `sin_cobrar` si no. Una nota parcial **sola** no hace «Parcial»: no se cobró nada, queda «Sin cobrar» con lo que falta de ayuda (`title`).
  - `puedeCobrar(cuenta)` = `tienePendiente`: el botón del listado y el del detalle.
  - **Listado (`Facturas`).** Nuevo rótulo «Acreditada» (`BadgeEstado tono="neutro"`, icono `FileMinus`, `title` con lo acreditado). Neutro y no verde a propósito: no se cobró, las notas la dejaron en cero; verde diría que entró plata. El tono neutro ya cumple AA (slate-600 sobre su 10 %, el guard de `badge-estado`). Sin `muestraCobros` no se dice nada de cobros, tampoco «Acreditada».
  - **Detalle (`FacturaDetalle`, componente `PanelDeCobro`).** Acreditada por completo: «Acreditada por nota de crédito — $ X» (más «Cobrado: $ Y» si hubo cobros), panel neutro y **sin botón**, también cuando nunca hubo un cobro. Con una nota parcial el panel muestra lo acreditado junto a lo cobrado y a lo que falta (`Pago parcial`, `Cobrado completo`, `Pendiente de cobro — $ pendiente`; antes este último decía el total de la factura). El diálogo de cobro ya precargaba `data.pendiente` y no cambia.
  - **Tablero (`comercio/Dashboard`).** El monto es lo que **falta** (`pendienteDe`) y, si difiere del total, «de $ total» debajo en gris.
  - **Tipos.** `Factura.total_acreditado?`/`pendiente?`, `FacturaDetalle.total_acreditado?`, `FacturaSinCobrar.pendiente?`: opcionales, porque un motor viejo no los manda.
- **Compatibilidad con un motor anterior a v1.172.0.** Faltan `pendiente` por fila y `total_acreditado`: se calcula `total − cobrado`, los rótulos son los de antes (`Cobrada`/`Parcial`/`Sin cobrar`), el detalle dice lo de siempre y el tablero muestra el total. Nunca aparece «Acreditada» (sin el dato de las notas no se puede saber). Hay un test por cada caso. El kit y el motor se pueden subir en cualquier orden.
- Alternativas descartadas:
  - **Restar `total_acreditado` en la pantalla aunque llegue `pendiente`:** dos cuentas que pueden discrepar (una nota sin CAE, anulada o de otro ambiente se descuenta en la pantalla y no en el motor).
  - **«Parcial» cuando hay una nota parcial:** miente; «Parcial» es de cobros.
  - **«Acreditada» en verde (`ok`):** se lee como cobrada.
  - **Esconder las acreditadas del listado:** siguen siendo comprobantes; sólo salen de la vista «Sin cobrar», que ya filtra el motor.
- Consecuencias: MINOR, sin cambio de contrato para el producto (las props no cambian). Cambia lo que se ve: «Acreditada» (nuevo), el monto del tablero (lo que falta), y el texto del panel de cobro. **Pantallas propias de un producto que resten `cobrado < total` a mano** quedan con la semántica vieja: reemplazarlas por `puedeCobrar`/`estadoDeCobro`/`pendienteDe` (Contalibra: `frontend/src/pages/Dashboard.tsx`; ver el diff propuesto en el reporte). Para la factura al contado cobrada y después acreditada el motor no asienta nada (devolver la plata es una decisión de producto abierta, ADR-059 §«Cuando la nota supera lo pendiente»): la pantalla sólo la rotula «Acreditada» y no promete un saldo a favor.
- Tests: `test/estado-de-cobro.test.ts` (21: nueve casos de la tabla del motor, el respaldo sin los campos nuevos, la tolerancia), y los casos de `Facturas`, `FacturaDetalle` y `comercio-dashboard`. Contra `origin/main` (los cuatro archivos de test copiados a un árbol sin el cambio) fallan los 10 casos de rótulo, detalle y tablero y el archivo del módulo no carga; pasan los de respaldo (motor viejo), que son el control.

## ADR-069 — El error de la consulta de CUIT que se arregla en Configuración lleva al tutorial de Padrón A13 (0.156.0)

**Estado:** aceptada (2026-10-16; pedido del humano: «hay que sumar la pantalla que explica que hay que habilitar el padrón A13»).

**Contexto.** El botón «Consultar en ARCA» de `comercio/Clientes` y `comercio/ClienteDetalle` muestra el error del motor (`libracore.consultar_cuit_router`): 503 «Configurá los certificados ARCA…» o 403 «El certificado no tiene acceso al servicio de Padrón (ws_sr_padron_a13)…». El tutorial que explica cómo habilitarlo ya existía (`TutorialArcaPadron`, en la tarjeta de ARCA de Configuración), pero desde el error no había forma de llegar.

**Decisión.** `src/configuracion/arca-tutorial.ts` exporta `ID_TUTORIAL_PADRON`, `URL_TUTORIAL_PADRON` (`/configuracion?seccion=integraciones&integracion=arca#tutorial-padron-a13`) y `errorQueSeArreglaEnConfiguracion(status, cuerpo)` (403 o 503 con cuerpo `{error}`; un 403 de permisos con `{detail}` no califica). `Clientes` y `ClienteDetalle` reciben `urlTutorialPadron` (por defecto `URL_TUTORIAL_PADRON`; `null` lo apaga) y agregan «Cómo habilitarlo» junto al error. `Tutorial` acepta `id` y se abre solo, con `scrollIntoView`, si la URL trae su ancla.

**Consecuencias.** Sin cambios en los productos que usan el kit. LibraCargo, LibraClub y GestioLibra (botón propio) apuntan a la misma URL. 7 tests nuevos.


## ADR-070 — «Consultar en ARCA» sube al kit: un solo botón que no pisa lo escrito (0.157.0)

**Estado:** aceptada (2026-10-16; pedido del humano: subir al kit el botón que hoy copian tres productos y exportar la URL del tutorial de Padrón A13).

**Contexto.** LibraCargo (`components/ConsultarEnArca.tsx` + `api/consultar-cuit.ts`), LibraClub y GestioLibra (`components/ConsultarEnArca.tsx` + `lib/consultar-cuit.ts`) tenían cada uno su copia del botón «Consultar en ARCA», y las tres copias de la lógica de consulta eran **idénticas** al byte (de los tres `consultar-cuit.ts`, sólo cambiaba la carpeta). Los componentes sólo diferían en una palabra del comentario y en el `import`; los tests, en los datos (el valor de la condición de IVA de cada producto). Además copiaban a mano la URL del tutorial de Padrón A13 que el kit ya tenía en `configuracion/arca-tutorial.ts` (ADR-069) pero no exportaba. Y el botón del kit (el ícono de `comercio/Clientes` y `ClienteDetalle`) **pisaba** nombre, dirección y condición de IVA aunque el usuario ya los hubiera escrito; el de los productos pregunta.

**Decisión.**
- `package.json` exporta `./configuracion/arca-tutorial` (`URL_TUTORIAL_PADRON`, `ID_TUTORIAL_PADRON`, `errorQueSeArreglaEnConfiguracion`), `./configuracion/consultar-cuit` (`consultarCuit`, `soloDigitos`, `DatosDeArca`, `ResultadoDeConsulta`, `ConsultaDeCuit`) y `./configuracion/ConsultarEnArca`.
- `ConsultarEnArca` es el componente de los productos tal cual (`cuit`, `valores`, `destino`, `ivaDe`, `porDefecto`, `alAplicar`), más dos props opcionales: `consulta` (otra función de consulta si el producto llega al padrón por otro camino; por defecto `consultarCuit`: `GET /api/consultar-cuit/:cuit` con `credentials: 'include'`) y `urlTutorial` (por defecto `URL_TUTORIAL_PADRON`; `null` saca el enlace). Usa `@/components/ui/button` del consumidor, como el resto de `configuracion/`.
- `consultarCuit` decide `pideElTutorial` con `errorQueSeArreglaEnConfiguracion`, la misma regla de ADR-069 en un solo lugar.
- `comercio/Clientes` y `comercio/ClienteDetalle` **adoptan el componente**: dejan de pisar lo escrito (lo vacío se completa, lo distinto se pregunta). Mantienen `conConsultaCuit` y `urlTutorialPadron` (que pasa a `urlTutorial`). La condición de IVA se traduce con `condicionDeIvaDeArca` (nuevo en `facturas.ts`: el texto de ARCA si está en `IVA_CONDITIONS`, si no el campo no se toca).
- Los productos borran su copia y su test e importan del kit.

**Consecuencias.** Cambia lo que ve el usuario de `Clientes`/`ClienteDetalle` en los productos que los montan: el ícono con lupa junto al CUIT pasa a un botón «Consultar en ARCA» en su propia línea al pie del formulario, el enlace del error dice «Cómo habilitar el servicio de Padrón en ARCA» (antes «Cómo habilitarlo») y un 403 con `{detail}` (falta de permiso, módulo apagado) muestra ese detalle en vez de «Error al consultar ARCA.». Un test que busque el botón por `title="Consultar datos en ARCA"` hay que pasarlo a `getByRole('button', { name: 'Consultar en ARCA' })`. El formulario que usa el componente con react-hook-form pasa `valores={form.watch()}` (re-renderiza en cada tecla, como ya hacía GestioLibra). Tres componentes, tres tests y tres `consultar-cuit.ts` menos en los productos; el pin sube a `v0.157.0` en LibraCargo, LibraClub y GestioLibra (que dejan de copiar la URL) y en todos los consumidores (regla del tag).

## ADR-071 — Todo campo donde se elige un cliente ofrece darlo de alta ahí mismo: `SelectCliente` y su guard (0.158.0)

**Estado:** aceptada (2026-10-16; pedido del humano: «este mismo procedimiento también debe estar en todos los campos de clientes de todos los aplicativos de la suite… y dejar constancia que siempre debe ser así y que tiene que estar normalizado»).

**Contexto.** En la recepción de equipos de LibraDesk, un cliente que no estaba cargado no se podía elegir: había que cancelar, ir a Clientes, darlo de alta y volver a empezar, con la persona esperando en el mostrador. El relevamiento de la suite (2026-10-16) encontró 26 campos de formulario donde se elige un cliente (o paciente, en MedLibra); sólo dos ofrecían el alta en el lugar, cada uno a su manera: el panel escrito a mano dentro de `comercio/Ventas` y el botón «Cliente nuevo» del diálogo de reserva de LibraClub. Hay tres formas de payload de alta en la suite (el motor `{name, cuit_dni, iva_condition}`, LibraDesk/LibraClub `{nombre, cuit|documento, condicion_iva}`, LibraCargo `{razon_social, cuit, condicion_iva, es_cliente}`, más GestioLibra/MedLibra en rutas sin `/api`).

**Decisión.**
- `SelectCliente` (`./SelectCliente`) es **el** campo de cliente: el `SelectBuscable` de siempre y, al lado, el botón «Agregar nuevo cliente» (ícono `UserPlus`) que abre un panel debajo con el nombre y los `campos` que pida el producto (`telefono` y `email` por defecto; `documento` y `condicionIva` donde se factura). Al crear, el cliente queda elegido y se ve aunque el consumidor no lo haya sumado a su lista.
- **No sabe guardar**: el producto pasa `crear(datos) => Promise<OpcionSelect>` con su endpoint y su payload. Para los clientes del motor el kit trae `crearClienteDelMotor`, `crearYSumar` y `CAMPOS_CLIENTE_DEL_MOTOR` (`comercio/alta-de-cliente`).
- El panel **no es un `<form>`** (casi siempre vive dentro del formulario de otra cosa): Enter en el panel crea el cliente y no manda el formulario de afuera; Escape cierra el panel y no el modal. El error del alta se muestra **dentro** del panel.
- `AltaDeCliente` exporta el panel solo, para las pantallas donde el cliente no se elige de un desplegable (el diálogo «Cliente de la venta» del POS de VentaLibra).
- `etiqueta` hace del componente el campo entero (etiqueta incluida); en una fila `flex-wrap`, al abrir el panel ocupa la fila completa. `entidad` cambia la palabra («paciente»). `conAlta={false}` es la **única** forma aceptada de no ofrecer el alta (un rol que no puede crear clientes).
- `auditoria-de-clientes` (`auditarCamposDeCliente`, `describirCamposSinAlta`) es el guard que cada producto corre en un test, igual que `auditarSelects`: un desplegable que elige un cliente —por su `value`/`onChange`/`opciones` (un identificador que *empieza* con la palabra) o por su texto (`aria-label`, la etiqueta de al lado)— tiene que ser `SelectCliente`. Los filtros de listados y reportes, que no crean nada, se marcan con `cliente-sin-alta: <motivo>`. `palabras` suma las del producto (`paciente`) y `componentes` sus envoltorios propios (el `Elegir` de LibraCargo).
- `comercio/Ventas`, `PresupuestoForm` y `RemitoNuevo` adoptan el componente; el panel a mano de Ventas se borra.

**Consecuencias.** En Ventas el panel pasa a un grupo «Nuevo cliente» con la etiqueta «Condición frente al IVA» (antes «Condición IVA») y el error del alta se ve dentro del panel; un error sin respuesta dice «Error de conexión.», como el resto. Presupuesto y Remito del kit (Contalibra, Restolibra) ganan el alta. Los productos reemplazan cada campo por `SelectCliente`, agregan el test del guard y suben el pin a `v0.158.0` (regla del tag). `SelectBuscable` exporta su tipo de props (`SelectBuscableProps`) y `auditoria-de-selects` exporta `finDeEtiqueta`, `etiquetaDeAlLado` y `fuentes` para que el guard nuevo no los copie.

**Corrección 0.158.1 (2026-10-16).** Escape dentro del panel cerraba igual el `Dialog` de Radix que lo contiene: Radix escucha Escape en el `document` en fase de captura, antes de que el `onKeyDown` del panel pudiera cortarlo. El panel ahora escucha Escape en `window` en captura (corre antes que el `document`) y sólo cuando el foco está adentro. Un consumidor ya no necesita su propio `onEscapeKeyDown` para eso. Y el guard deja de contar el texto de las opciones (`label: 'No, es del cliente'`) como si el campo eligiera un cliente: en LibraDesk marcaba selects de proveedor y de depósito.

## ADR-072 — «IVA No Responsable» deja de ofrecerse (0.158.2)

**Estado:** aceptada (2026-10-16; decisión del humano: «IVA No Responsable sacalo»).

**Contexto.** `IVA_CONDITIONS` ofrecía seis condiciones; el backend de LibraDesk conoce cinco (sin «IVA No Responsable», una categoría que ARCA ya no asigna), y por eso el alta en el lugar de LibraDesk (ADR-071) no podía pedir la condición. El motor (`libracore.clientes_router`) la sigue aceptando y la factura como «No Alcanzado», y puede haber fichas cargadas con ella.

**Decisión.** Sale de `IVA_CONDITIONS`: no se ofrece en ninguna alta (`SelectCliente`, bandeja de MP, Clientes, Proveedores). `condicionesIvaPara(actual)` es la lista de los formularios que **editan**: si la ficha guarda una condición que ya no se ofrece, la suma al final para que el campo no se vea vacío ni se pise al guardar. El motor no cambia (sigue leyendo las fichas viejas); si ARCA la informa, `condicionDeIvaDeArca` no toca el campo.

**Consecuencias.** Los productos suben el pin; LibraDesk puede pedir CUIT y condición en el alta de sus pantallas fiscales. El mapeo de LibraCargo deja de listarla.

## ADR-073 — La nota de crédito de una factura al contado cobrada pregunta qué hacer con la plata (0.159.0)

**Estado:** propuesta (2026-10-16; decisión del humano: «Preguntar al emitir»; el motor es el ADR-065 de libracore v1.176.0).

**Contexto.** La nota de una factura al contado cobrada no movía plata. El motor ahora acepta `destino` (`devolver` | `a_favor`) y `medio_pago` en `POST /api/facturas/{id}/nota-credito`, y contesta `GET …/nota-credito/destino?importe=` con lo que hay que preguntar: si hay plata cobrada de más para ese importe (`aplica`, `monto`, `excedente`), con qué medios, si la factura tiene cliente identificado y si falta abrir el turno. Los dos diálogos del kit que emiten la nota (`FacturaDetalle`, total; `comercio/VentaDetalle`, total o por un importe) no sabían nada de eso.

**Decisión.**
- `destino-de-nota` (tipos, cuentas chicas y `useOfertaDeDestino(url, importe)`, que pide la oferta; con un importe que cambia espera 250 ms entre teclas y una respuesta vieja nunca pisa a una nueva) y `DestinoDeNotaDeCredito` (la elección, con componentes del kit: radios nativos como el resto del diálogo y `SelectBuscable` para el medio). **No hay opción preseleccionada**: «preguntar» es preguntar, y el botón de emitir queda deshabilitado hasta elegir (y, devolviendo, hasta tener el medio). «Dejar a favor del cliente» sale deshabilitada, con la explicación, si no hay cliente identificado; «Devolver» también, con el aviso del motor, si el producto exige turno y no hay uno abierto.
- **La cuenta es del motor, no del kit**: la pantalla no repite `reintegrable`. Así vale en todo producto con sólo subir el pin, sin que le mande más datos a la pantalla.
- **El botón de emitir espera la respuesta del motor** (`cargando`): una nota que sale antes de saber si hay que preguntar saldría sin destino y la plata no se movería, en silencio.
- Compatible hacia los dos lados: si la oferta no llega (motor anterior, ruta ausente, `aplica: false`, cuerpo que no tiene la forma) no se pregunta nada y el POST es el de siempre; `cuerpoDeDestino` es vacío sin oferta, así que nunca se manda un destino que el motor no pidió.
- `FacturaDetalle` sólo pregunta en una factura A/B/C que no es a cuenta corriente y tiene cobros; en las demás sigue el `ConfirmDialog` y no hace ningún pedido nuevo. Con plata que mover la confirmación es un `Dialog` común (el `AlertDialog` cierra solo al aceptar).
- Si el motor contesta `reintegro.movido: false` con `motivo` (la nota salió sin CAE y la plata no se movió), la pantalla lo muestra y, en `FacturaDetalle`, se queda en la factura en vez de ir a la nota.

**Consecuencias.** MINOR, sin cambios obligatorios en los productos. Dos tests existentes de `VentaDetalle` cambian: buscar la llamada a la nota con `POST` (ahora también hay un `GET …/destino`) y esperar a que el botón se habilite tras tipear un importe. 🔴 Un producto con `anular_venta` de libracommerce no debe subir libra-ui v0.159.0 junto con libracore v1.176.0 hasta que libracommerce reste lo que la nota ya devolvió de lo que revierte de la caja (ADR-065 del motor): la pantalla ofrece devolver apenas el motor lo ofrece.

**Tests.** `test/destino-de-nota.test.tsx` (cuentas), `test/FacturaDetalle.test.tsx` (+7) y `test/comercio-ventas.test.tsx` (+7).

## ADR-074 — La pantalla trata como cobrable a toda nota de débito y a las FCE: `tipos-de-comprobante` (0.160.0)

**Estado:** propuesta (2026-10-17; acompaña al ADR-066 de libracore v1.178.0: «la pantalla (`libra-ui`) tiene que acompañar»).

**Contexto.** El motor ya cuenta lo que falta cobrar de una nota de débito (`tipos.COBRABLES = FACTURAS + ND`, 12 tipos) y la lista en «Sin cobrar», en el resumen y en el tablero. La pantalla seguía decidiendo «se cobra» con `[1, 6, 11].includes(tipo)` y con `vista === 'nc' || vista === 'nd'`: el detalle de una nota de débito no ofrecía «Registrar cobro» ni decía el estado, el listado de notas de débito mostraba «Autorizada» sin botón de cobrar, y el tablero rotulaba cada fila con la letra, como si todo fuera factura. Las FCE (201, 206, 211) tampoco estaban en `[1, 6, 11]`: sin «Registrar cobro» y, peor, sin emitir notas sobre ellas aunque el motor las admite (`TIPO_NC`).

**Qué ya existe** (se miró antes). El kit no tenía un módulo de tipos de comprobante: cada pantalla traía su copia (`FacturaDetalle` tres veces, `Facturas` por vista). El motor sí lo tiene (`libracore/tipos_comprobante.py`) y su ADR-066 pide lo mismo del lado de la pantalla.

**Decisión.**
- `tipos-de-comprobante` (`./tipos-de-comprobante`) es la copia TypeScript de la tabla del motor: `FACTURAS` (1, 6, 11, 201, 206, 211), `NC`, `ND`, `COBRABLES = FACTURAS + ND` y los predicados `esFactura(tipo)` y `esCobrable(tipo)`. Ninguna pantalla vuelve a escribir una lista de números.
- **«Se cobra» es `esCobrable`.** `FacturaDetalle` muestra el panel de cobro (estado, «Registrar cobro») en facturas, FCE y notas de débito; `Facturas` decide el estado de cobro y el botón «Cobrar» **por fila**, con el tipo de la fila, así que la vista `nd` cobra y la `nc` no, sin mirar la pestaña. La columna «Cbte. asoc.» y el signo del total siguen siendo de las vistas de notas.
- **«Se acredita o se recarga» sigue siendo `esFactura`**, no `esCobrable`: la pregunta de qué hacer con la plata de la nota de crédito (`preguntaDestino`, ADR-073) y los botones «Nota de Crédito» / «Nota de Débito» son sólo de las facturas, ahora **también las FCE** (el motor mapea 201/206/211 en `TIPO_NC` y `TIPO_ND`). Una nota de débito se cobra, pero no se acredita: el motor no emite una nota sobre otra nota.
- El tablero se llama **«Pendientes de cobro»** (antes «Facturas sin cobrar»; vacío: «No hay nada pendiente de cobro.») y cada fila se rotula con `tipo_label` («Nota de Débito C», «FCE MiPyME A»). Sin él (motor anterior) se rotula con la letra y el número, como siempre. `FacturaSinCobrar.tipo_label` es opcional.

**Consecuencias.** MINOR, sin cambios obligatorios en los productos; un test que busque el título «Facturas sin cobrar» del tablero o su vacío hay que pasarlo a los textos nuevos. 🔴 **Subir esta versión sólo junto con libracore ≥ v1.178.0**: con un motor anterior, el listado de notas de débito manda `pendiente: 0` y la pantalla las rotularía «Cobrada» (antes decía «Autorizada»), y su detalle diría «Cobrado completo» sin que nadie haya cobrado. Con el motor nuevo la cuenta es la de las facturas (`estado-de-cobro`, ADR-068). Las FCE ganan los botones de emitir nota en el detalle.

**Tests.** `test/tipos-de-comprobante.test.ts` (la tabla), `test/FacturaDetalle.test.tsx` (+6: nota de débito pendiente y cobrada, FCE, nota de crédito sin panel, emitir nota sólo sobre facturas y FCE, la pregunta de destino), `test/Facturas.test.tsx` (+5: nota de débito cobrable, cobrada, sin cruce de cobros, nota de crédito, FCE) y `test/comercio-dashboard.test.tsx` (+3: título, `tipo_label` y el respaldo con la letra).

## ADR-075 — Los rótulos y la letra de un comprobante salen de `tipos-de-comprobante`, con las FCE (0.161.0)

**Estado:** propuesta (2026-10-18; sigue al ADR-074).

**Contexto.** El ADR-074 puso en un solo lugar *qué se cobra*, pero los rótulos seguían en tablas sueltas que no conocían las Factura de Crédito Electrónica MiPyME (201/206/211 y sus notas 202/207/212 y 203/208/213): `labelComprobante` de `FacturaDetalle` (el número de la nota y de la factura que anula), `TIPO_BADGE` de `Facturas`, `TIPO_LABELS` de `ClienteDetalle` y de `LibrosIva`. Una FCE salía «?» en el detalle y en el listado, «Cbte.» en la ficha del cliente y el número pelado («211») en el libro IVA. Peor: 🔴 `FacturaDetalle` decidía si discriminar el IVA con `tipo !== 11`, y una FCE C (211) y sus notas (212, 213) —clase C, sin alícuotas (`tipos.C` del motor)— mostraban «Subtotal» e «IVA 21 %» si el comprobante traía `iva_amount > 0`, mientras el PDF del motor no los tiene.

**Qué ya existe** (se miró antes). El motor tiene `LETRA` y `NOMBRE` en `libracore/tipos_comprobante.py` (los usa `tipo_label` del tablero) y `C` para la clase; el kit tenía cuatro copias de la mitad de eso.

**Decisión.** `tipos-de-comprobante` suma la copia TypeScript de `LETRA` y `NOMBRE` del motor (los nombres, palabra por palabra: «FCE MiPyME A», «Nota de Débito FCE B») y las funciones que las pantallas necesitan; ninguna vuelve a escribir una tabla de tipos:
- `letraDe(tipo)` (`'A' | 'B' | 'C'`, `undefined` si no se conoce) y `esFce(tipo)`.
- `discriminaIva(tipo)`: `letraDe(tipo) !== 'C'`. Un tipo desconocido discrimina, como con `tipo !== 11`. `FacturaDetalle` pregunta acá.
- `nombreDe(tipo)` (el del motor; desconocido, «Comprobante»), `siglaDe(tipo)` (la del badge del listado: `FA`, `NCB`, `NDC`; la FCE lleva una `E`: `FEA`, `NDEB`, `NCEC`), `rotuloDe(tipo)` (el de las tablas anchas: `FAC A`, `ND B`, `NC C`; FCE: `FCE A`, `ND FCE B`, `NC FCE C`) y `prefijoDe(tipo)` (el del número en el detalle: `A`, `NC-B`, `ND-C`; FCE: `FCE-A`, `ND-FCE-B`, `NC-FCE-C`).
- Los rótulos de los nueve tipos de siempre **no cambian** (un test los fija); `Facturas` conserva su color por letra y el rojo de la nota de crédito, que no es información del tipo.
- `ClienteDetalle` muestra la factura con su nombre y las notas en corto, como hasta ahora; el tipo desconocido sigue siendo «Cbte.» allí, «?» en el listado y el detalle, y el número en el libro IVA.

**Consecuencias.** PATCH de comportamiento, MINOR por la API nueva; sin cambios en los productos. Un producto que tenga su propia tabla de rótulos o su `tipo !== 11` **la reemplaza por estas funciones**. Una FCE C con `iva_amount > 0` deja de mostrar «Subtotal» e «IVA» en el detalle (el total es el mismo). Las siglas de las FCE (`FEA`…) son de este kit: el motor sólo fija `NOMBRE`, que va en el `title` del badge.

**Tests.** `test/tipos-de-comprobante.test.ts` (+6: letras, IVA, nombres del motor, ninguno «?», sin repetidos, los de siempre no cambian), `test/FacturaDetalle.test.tsx` (+10: IVA por clase en nueve tipos y el número de una nota sobre FCE), `test/Facturas.test.tsx` (+11: el badge de las nueve FCE, el desconocido, los de siempre), `test/comercio-informes.test.tsx` (+1) y `test/comercio-clientes.test.tsx` (+1).


## ADR-076 — `radio-group` y `textarea` suben al kit; `lib/fechas.ts` de los productos ya estaba (0.162.0)

**Estado:** propuesta (2026-10-18; sigue al ADR-075).

**Contexto.** La auditoría de independencia de RestoLibra respecto de Contalibra (`wiki/analyses/restolibra-independencia-de-contalibra.md`, §3.1 y §4) listó como duplicación real entre los dos productos: `lib/fechas.ts` (122 líneas), `ui/tabs.tsx`, `ui/radio-group.tsx` y `ui/textarea.tsx`. **Relevado en `origin/develop` de los dos (2026-10-18)**, la mitad de eso ya estaba resuelta en el kit y el wiki lo daba por pendiente:

| Archivo de los productos | ¿Está en el kit? |
|---|---|
| `lib/fechas.ts` | **Sí, desde 0.146.0** (ADR-058 §4): `libra-ui/fechas` exporta `fecha`, `fechaHora`, `hora`, `horaConSegundos`, `fechaDeTexto`, `fechaHoraDeTexto` y `hoyISO`. La copia de los productos es la variante «A» de ese ADR, y el kit tiene **tres correcciones** que ella no (`hourCycle: 'h23'` y no `hour12: false`, que escribe «24:05» en algunos motores; `Intl.DateTimeFormat` construido una vez; `horaConSegundos` que convierte un `Date` o un ISO con zona en vez de mostrar la hora UTC). El wiki decía «el kit exporta aritmética y el producto formateo»: eso era cierto hasta 0.145.0. |
| `ui/tabs.tsx` | **Sí, desde 0.146.0** (ADR-058 §6), con el `flex-wrap` de 0.154.0 (ADR-067). |
| `ui/radio-group.tsx` | No. |
| `ui/textarea.tsx` | No. |

**Qué ya existe** (se miró antes de escribir): `src/ui/` con sus 19 primitivas (ADR-006), el mapa `exports` y su guard (`test/exports-del-paquete.test.ts`), y el precedente de `tabs` y `dialog` (ADR-058 §6, ADR-064). **No se crea un módulo `fechas-de-pantalla`**: sería la tercera copia de lo que `libra-ui/fechas` ya exporta.

**Decisión.**
1. **`src/ui/radio-group.tsx`** (`RadioGroup`, `RadioGroupItem`) y **`src/ui/textarea.tsx`** (`Textarea`), exportados como `libra-ui/ui/radio-group` y `libra-ui/ui/textarea`. El cuerpo es el de las copias de Contalibra y RestoLibra, **idénticas entre sí** desde `import * as React` (verificado con `diff`); cambia el `cn`, que sale de `../utils`, como en el resto de `src/ui/`.
2. **El kit NO cambia sus propios imports todavía.** `Depositos`, `DepositoDetalle`, `SucursalDetalle`, `Vencimientos` y `Egresos` siguen importando `@/components/ui/textarea`, y `ListasPrecio` `@/components/ui/radio-group`. Con `tabs` se pasó a lo propio porque se habían relevado los ocho productos (idénticos); acá sólo se compararon dos. Si alguno de los otros seis tiene un `textarea` o un `radio-group` distinto, pasar a lo propio le cambia el aspecto a esa pantalla. Queda anotado en «Lo que no cubre».
3. **El guard de exports mira `src/ui/`.** Hasta ahora `test/exports-del-paquete.test.ts` sólo miraba los módulos de la raíz de `src/`: una primitiva sin su línea en `exports` salía en verde de este repo. Ahora falla si algún `src/ui/<x>` no está exportado como `./ui/<x>`.
4. **No se tocan los productos** (se adopta con el pin).

**Cómo lo adopta cada producto** (Contalibra y RestoLibra, en el mismo cambio que sube el pin a 0.162.0):
- `components/ui/radio-group.tsx` → `export * from 'libra-ui/ui/radio-group'`; `components/ui/textarea.tsx` → `export * from 'libra-ui/ui/textarea'`. Es seguro: el cuerpo es el mismo.
- `components/ui/tabs.tsx` → `export * from 'libra-ui/ui/tabs'` (ya se podía desde 0.146.0). 🔴 **Las copias de Contalibra y RestoLibra no tienen el `flex-wrap` de `TabsList` (ADR-067)**: al reemplazarlas, la fila de pestañas se parte en renglones cuando no entra en el celular, en vez de ensanchar la página.
- `lib/fechas.ts` → `export * from 'libra-ui/fechas'` (o borrarlo). Fuera de sus tests, **Contalibra la importa en un solo lugar** (`ComprobantesPendientes`, `fecha`) y **RestoLibra en ninguno**; `TZ` no lo importa nadie fuera del archivo (en el kit se llama `ZONA_AR`). Los 13 tests de `test/fechas.test.ts` del producto **pasan contra `libra-ui/fechas`** (medido el 2026-10-18 apuntando su import al `src/fechas.ts` del kit), así que el reexport los deja valiendo. Cambia, para bien, la hora de la medianoche en los motores que escribían «24:xx» y la columna Hora de un `Date`.

**Consecuencias.** MINOR (dos exports nuevos), sin cambios obligatorios en los productos. Ninguna pantalla del kit cambia.

**Tests.** `test/ui-radio-group.test.tsx` (5: el grupo y el marcado inicial, click en la etiqueta, flechas, `disabled`, `data-slot` e indicador) y `test/ui-textarea.test.tsx` (4: escribir, props nativas y `ref`, `disabled`, `className` y `aria-invalid`), contra Radix de verdad y no contra los stubs; más 1 en `test/exports-del-paquete.test.ts` (que se pone rojo sin las dos líneas de `package.json`). Una nota del teclado: Radix marca un radio al recibir el foco sólo si la flecha **sigue apretada** (`isArrowKeyPressed`) y mueve el foco con un `setTimeout`; con `{ArrowDown}` suelto de `user-event` el `keyup` llega antes y no se marca nada, por eso el test sostiene la tecla (`{ArrowDown>}` … `{/ArrowDown}`).

**Lo que no cubre.** (a) Los seis imports propios del kit (punto 2). (b) El e2e en un navegador: no se midieron las dos primitivas a 390 px; son las mismas clases que ya tienen los productos. (c) `confirm-dialog.tsx`, `vite.config.ts` y `main.tsx`, que la auditoría también nombra, no son primitivas del kit y no entran acá.


## ADR-077 — LibraEdge en la pantalla: cartel «sin conexión», QR apagado, factura pendiente y piezas de la bandeja (0.163.0)

**Estado:** propuesta (2026-10-19). Es la pantalla del ADR-074 de libracore (`libracore.nodo_offline`, v1.186.0), ítem E4 de `wiki/analyses/libraedge-toda-la-suite-2026-10-18.md`.

**Contexto.** El motor ya deja vender sin internet desde un nodo (la PC del local): sin conexión, `POST /api/ventas/{id}/facturar` contesta 409 `factura_pendiente` (la venta queda en la bandeja y se factura sola al volver), el QR contesta 409 `sin_conexion`, un nodo sin ARCA 422 `nodo_sin_arca`, y `GET /api/nodo/conexion` dice `{es_nodo, en_linea, node_id, a_facturar}`. Sin la pantalla, el cajero ve un 409 en rojo al facturar —que no es un error— y un botón de QR que no puede andar.

**Qué ya existe** (se miró antes). `api-client` ya resuelve un `detail` objeto por su `mensaje` (`detalleDe`) y conserva el objeto en `ApiError.detailData`; `AvisoEstado`/`BadgeEstado` (tono `atencion`) son el aviso y la etiqueta sobrios de la suite; `createLayout` es el único lugar global que montan los productos con layout del kit; el detalle de la venta, el QR y el botón «Generar factura» viven en `comercio/VentaDetalle`, el «Cobrar con QR ahora» del punto de venta en `comercio/LineasDePago`. **La bandeja de comprobantes pendientes NO está en el kit**: es una pantalla propia de Contalibra (`pages/ComprobantesPendientes.tsx`), así que el kit da las piezas y no la pantalla.

**Decisión.**
1. **`libra-ui/nodo-offline`** (lógica, sin componentes): el tipo `ConexionDelNodo`, los códigos del motor (`CODIGO_SIN_CONEXION`, `CODIGO_FACTURA_PENDIENTE`, `CODIGO_NODO_SIN_ARCA`, `CODIGO_SE_FACTURA_DESDE_LA_VENTA`, `ORIGEN_VENTA`), los textos (`MENSAJE_QR_SIN_CONEXION`, igual al del motor; `TEXTO_CARTEL_SIN_CONEXION`, `MENSAJE_QUEDO_PARA_FACTURAR`, `ETIQUETA_PENDIENTE_DE_FACTURAR`, `ETIQUETA_VENTA_SIN_CONEXION`), `codigoDelError(err)`, `esVentaSinConexion(fila)` y `ventasParaFacturar(n)`.
2. **Una sola consulta para toda la pantalla.** El estado vive en un almacén del módulo (`useSyncExternalStore`). `useConsultarConexionDelNodo({ruta?, intervaloMs?})` consulta cada 45 s (`INTERVALO_CONEXION_MS`; el motor da la conexión por perdida a los 5 min) y varios a la vez comparten un reloj, que se frena sin nadie montado. `useConexionDelNodo()` **sólo lee** (`{conexion, esNodo, sinConexion, aFacturar}`): `VentaDetalle` y `LineasDePago` lo usan, así que un producto que no monta el cartel no hace ni un pedido nuevo y la pantalla queda como siempre (el 409 del motor sigue diciendo lo suyo).
3. **Fuera de un nodo no se sigue consultando.** `es_nodo: false` (o un cuerpo vacío) y un 404/405 (el producto no monta `/api/nodo`) descartan la consulta para la vida de la página, aunque se remonte. Un 500 o un corte de red no: queda lo último que se supo y se reintenta. `marcarSinConexion()` (un 409 `sin_conexion` o `factura_pendiente` recibido) apaga el QR sin esperar la consulta siguiente, salvo fuera de un nodo ya descartado; `refrescarConexionDelNodo()` pregunta ya.
4. **`libra-ui/CartelSinConexion`**: `CartelSinConexion` (un `AvisoEstado` `atencion`, `role="status"`, `sticky top-0`; «Sin conexión: las ventas se cobran y se imprime el ticket; se facturan solas al volver» y «N ventas para facturar» si hay alguna); nada fuera de un nodo o con conexión. **`createLayout({ conexionDelNodo: true })`** lo monta arriba del contenido (o `{ruta, intervaloMs}`); sin la opción, el layout de siempre y ningún pedido.
5. **`VentaDetalle`**: sin conexión «Cobrar con QR» se deshabilita, con `MENSAJE_QR_SIN_CONEXION` en el `title` y escrito abajo (`aria-describedby`): un `title` solo no se ve en una pantalla táctil. Un 409 `sin_conexion` del QR o del poll muestra el `mensaje` del motor y apaga el botón. «Generar factura» con 409 `factura_pendiente` **no es un error**: aviso `atencion` «Quedó para facturar al volver la conexión.» con «Reimprimir ticket», y la venta muestra «Pendiente de facturar (sin conexión)». Lo mismo al abrir una venta que el producto marca `factura_pendiente` (campo nuevo y opcional de `Venta`: la fila abierta de `venta_facturacion.pendiente_de_facturar`). 422 `nodo_sin_arca`: «Error de configuración: » + el mensaje.
6. **`LineasDePago`**: sin conexión la casilla «Cobrar con QR ahora» se deshabilita, se destilda si estaba tildada (el alta no pide un QR que no puede salir) y dice «(sin conexión)». **`Ventas`**: una venta `factura_pendiente` dice «Pendiente (sin conexión)» en vez de «Sin facturar».
7. **Piezas de la bandeja** (para `ComprobantesPendientes` de Contalibra): `esVentaSinConexion(fila)`, `EtiquetaVentaSinConexion` y `BotonFacturarPendientesDelNodo({onFacturado})`, que llama a `POST /api/nodo/facturar-pendientes`, informa «N ventas facturadas; M con error; quedan K», se deshabilita sin conexión y, con un 409 `sin_conexion`, muestra el mensaje y se apaga.

**Cómo lo adopta cada producto.** Con el pin a 0.163.0: (a) los que venden desde un nodo (RestoLibra, VentaLibra, ContaLibra) pasan `conexionDelNodo: true` a su `createLayout` (una línea; fuera de un nodo hace **una** consulta por carga y se calla) y montan `build_facturacion_del_nodo_router` (libracore ≥ v1.186.0); (b) el `GET /api/ventas/{id}` lleva `factura_pendiente` (la fila de `pendiente_de_facturar`, o `null`), y el listado si quieren la etiqueta; (c) Contalibra, en su bandeja: no deja tildar una fila `esVentaSinConexion` (la saca de `elegidos`), la rotula con `<EtiquetaVentaSinConexion />` en la columna Origen y le pone `<BotonFacturarPendientesDelNodo onFacturado={load} />` en vez de la casilla. Los demás productos no hacen nada.

**Consecuencias.** MINOR (dos módulos y una opción nuevos; un campo opcional en `Venta`). Fuera de un nodo, y sin la opción del layout, ninguna pantalla cambia ni pide nada.

**Tests.** `test/nodo-offline.test.tsx` (25): los ayudantes; la consulta (fuera de un nodo una sola consulta aunque se remonte, el 404 igual, un 500 y un corte dejan lo último, el reloj compartido y frenado, la ruta y el intervalo propios, un cuerpo vacío); el cartel (texto, «N ventas», nada con conexión) y el layout (lo monta arriba del contenido, con la ruta del producto, y sin la opción no pide nada); el detalle (QR apagado con su motivo, 409 `sin_conexion` al pedir el QR y en el poll, 409 `factura_pendiente` como aviso con reimprimir y la etiqueta, la venta ya marcada, el 422 `nodo_sin_arca`); el punto de venta (la casilla del QR y el listado); la bandeja (la etiqueta, el resultado, singular y sin errores, deshabilitado sin conexión, el 409 y el corte de red).

**Lo que no cubre.** (a) La bandeja como pantalla del kit: sigue siendo de Contalibra. (b) El aviso de «volvió la conexión, quedan N por facturar»: el cartel sólo se muestra sin conexión, y la tanda automática del nodo las factura sola. (c) El e2e en un navegador (el `sticky` del cartel a 390 px no se midió).

## ADR-078 — La marca de LibraEdge, el complemento de la suite (0.164.0)

**Estado:** aceptada (2026-10-19). Pedido del humano: «hagamos un ícono para libraedge así como tenemos los de las aplicaciones, alusivo a su uso, siguiendo la misma idea de los otros». Eligió la propuesta C de la lámina `diseños/iconos-libraedge.html` del wiki, en cian, y pidió que sirva también para el instalador de Windows y para «Agregar o quitar programas».

**Qué ya existe.** `marcas.ts` (ADR-034) dibuja las ocho apps con las cuatro reglas de la serie v2; `IDENTIDAD` (ADR-033) es la tabla de las apps, con acento y `theme-color`, que comparan las landings y el wiki; `MarcaProducto` incrusta la marca; los `marcas/*.svg` son la copia en archivo, sellada por `test/marcas.test.ts`.

**Decisión.**
1. **El dibujo** sigue las cuatro reglas: la nube de la central atrás, blanca translúcida (está, pero el local no depende de ella); la PC del local adelante, con el corte del fondo; y el círculo de sincronía amarillo, que es el único acento: lo que se vendió sin internet sube solo al volver. El favicon es la PC sola con la luz prendida, porque a 16 px la nube y el círculo se empastan.
2. **El color es cian `#0e7490`** (tinta `#083344`, claro `#a5f3fc`): el único tono que no estaba tomado por los ocho.
3. **LibraEdge no entra en `IDENTIDAD`.** No es una app: no tiene pantalla propia, ni acento, ni `theme-color`, y meterlo cambiaría la tabla que comparan las landings y el wiki. `marcas.ts` suma el tipo `Complemento` (`'libraedge'`), `Marca = Producto | Complemento`, `datosDeMarca(marca)` (nombre y color, de `IDENTIDAD` o de los complementos) y `MARCAS` (las nueve). `svgDeMarca`, `faviconDeMarca` y `MarcaProducto` aceptan una `Marca`: con un `Producto`, todo sigue igual.
4. **`MARCAS` sale de las claves de `TONOS`**, no de `IDENTIDAD`: `identidad.ts` importa `marcas.ts` (el favicon), y leer `IDENTIDAD` al cargar el módulo da `undefined` por el import circular. El test la compara contra `IDENTIDAD`.
5. **El instalador** (`libraedge/instalador/`) copia `marcas/libraedge.svg` y `marcas/libraedge-favicon.svg` y de ellos arma el `.ico` (la PC sola de 16 a 32 px, la marca completa de 48 a 256), que va en `SetupIconFile` y en `UninstallDisplayIcon`.

**Consecuencias.** MINOR: tipos y funciones nuevas; los parámetros de `svgDeMarca` y `MarcaProducto` se ensanchan. Ningún producto cambia hasta usarla.

**Tests.** `test/marcas.test.ts`: las mismas reglas de las ocho valen para LibraEdge (SVG de 120 × 120, fondo del color de marca, `<title>`, compacto, favicon distinto, los nueve dibujos distintos, los dieciocho archivos sellados), y además que no esté en `IDENTIDAD`, que su color no sea el de ninguna app y que las ocho sigan con el nombre y el color de `IDENTIDAD`. `test/marca-producto.test.tsx`: `MarcaProducto` la dibuja con su nombre y su color.

**Lo que no cubre.** Llevarla a LibraSuite y a las landings (copian el archivo, como las otras ocho) y a la pantalla del nodo.

## ADR-079 — La marca de LibraEdge en el cartel del nodo (0.165.0)

**Estado:** aceptada (2026-10-19). Pedido del humano: «ponelo también en la pantalla del nodo», después de la marca (ADR-078).

**Decisión.** `CartelSinConexion` (ADR-077) lleva `<MarcaProducto producto="libraedge" variante="favicon" className="h-5 w-5" />` en lugar del `WifiOff` de lucide. Es la variante chica (la PC sola, la luz prendida): la completa se empasta a 20 px. El cartel sigue diciendo «Sin conexión: …»; la marca dice quién sigue atendiendo, y es la misma que el cajero ve en el instalador y en «Agregar o quitar programas». El nombre accesible lo da el `aria-label` de `MarcaProducto` y el texto del cartel no cambia. La marca va a la izquierda y el texto en su propia columna (`flex items-start` y adentro el `flex-wrap`): con el `flex-wrap` en la raíz, a 390 px el ícono quedaba solo en el primer renglón (pasaba igual con el `WifiOff`). `EtiquetaVentaSinConexion` conserva el `WifiOff`: en una fila de la bandeja lo que importa es que la venta se hizo sin conexión, y a 14 px una marca no se lee.

**Consecuencias.** MINOR, sólo visual: los productos que montan el cartel (`createLayout({ conexionDelNodo: true })`) lo ven con el pin; nada más cambia.

**Tests.** `test/nodo-offline.test.tsx`: el cartel lleva la marca `LibraEdge`, a 20 px, en la variante favicon y del cian de la marca, y su texto empieza igual que antes.

## ADR-080 — «Sucursal sin internet»: el alta del nodo de LibraEdge desde el central (0.166.0)

**Estado:** propuesta (2026-10-19). Es la pantalla del ADR-011 de libraedge (`libraedge.pantalla_del_central.create_nodos_router`). Decisión del humano (2026-10-19): el administrador da de alta el nodo de una sucursal desde el central y se lleva el instalador y la carga.

**Qué ya existe** (se miró antes). En libraedge: el aprovisionamiento (`registrar`, `dar_de_baja`, ADR-008), la carga (`armar_carga`, `registrar --carga`, ADR-010) y los instaladores publicados en los Releases (`libraedge-nodo-<producto>.exe`). En el kit: la marca de LibraEdge (`MarcaProducto producto="libraedge"`, ADR-078), `AvisoEstado`/`BadgeEstado`, `TituloPantalla`, el `Dialog` de confirmación que usa el pedido de certificado de ARCA (ADR-041, que ya resolvió «un archivo sensible que no pasa por el navegador»: ahí la clave ni sale del servidor). **No había** forma de bajar un adjunto de un `POST` sin leerlo: `api` parsea JSON y `useImprimirTicket` arma un Blob propio para imprimir.

**Decisión.**
1. **`libra-ui/SucursalSinInternet`**: `GET /api/nodos-offline` (ruta configurable con `ruta`) y tres tarjetas: el instalador (link del backend, con el nombre del producto), el nodo de cada sucursal activa («Dar de alta el nodo» en las que no tienen) y los nodos con su estado (`Al día`, `Sin noticias`, `Sin instalar`, `Dado de baja`), prefijo y última sincronización («hace 3 min», la hora exacta en el `title`), con «Carga nueva» y «Dar de baja». Cada acción pide confirmación en un diálogo que dice qué pasa (la carga se baja una sola vez; la nueva invalida la anterior y es sólo para la misma PC; la baja no se deshace) y el error del motor se muestra ahí.
2. **🔴 La carga no pasa por la pantalla.** `api.postArchivo(path, body)` (nuevo en `api-client`) devuelve `{blob, nombre, headers}` **sin leer el cuerpo**; `guardarArchivo(blob, nombre)` lo baja con un `<a download>` efímero. Lo que se muestra (`node_id`, prefijo) viene en cabeceras aparte. Los errores se tratan como en `request` (sesión vencida, Términos, `ApiError` con el `mensaje` del motor).
3. **Sin el adicional `offline`** la pantalla lo explica y deshabilita el alta y la carga nueva; la baja sigue (un nodo instalado se tiene que poder revocar). Sin URL https del central o con el CUIT mal cargado tampoco deja emitir; si faltan CUIT o condición de IVA, avisa que el nodo no va a poder facturar.
4. **Concepto nuevo del catálogo de íconos: `sucursalSinInternet` → `CloudOff`** (lo usan tres productos). Falta la fila en la tabla del wiki (`catalogo-iconos-identidad-diseno`).
5. **La entrada del menú se ve con el adicional o con nodos activos** (decisión del humano, 2026-10-19). `NavItem.nodosOffline` (en lugar de `module: 'offline'`, que la escondía con nodos adentro): el layout pide `GET /api/nodos-offline/menu` (`{contratado, nodos_activos, visible}`, libraedge ADR-011) **una vez por carga de página** y sólo para un admin, con un almacén del módulo (`libra-ui/menu-de-nodos-offline`, `useSyncExternalStore`): ni cada render ni cada remonte vuelven a pedir. Mientras no llegó, o si falla, la entrada no se ve. La pantalla llama a `refrescarMenuDeNodosOffline()` después de un alta o una baja. Sin el adicional y con nodos activos la pantalla dice «El adicional LibraEdge … está apagado: no se pueden dar de alta nodos nuevos ni emitir cargas. Los nodos que siguen activos sólo se pueden dar de baja.» (`TEXTO_ADICIONAL_APAGADO_CON_NODOS`); el alta y la carga nueva siguen deshabilitadas (y el backend da 403).

**Cómo lo adopta cada producto** (RestoLibra, VentaLibra, ContaLibra). El backend monta `create_nodos_router(aprovisionamiento, get_connection)` con su guarda de administrador; el frontend agrega la ruta `/sucursal-sin-internet` con `<SucursalSinInternet />` y la entrada «Sucursal sin internet» (`ICONOS.sucursalSinInternet`, `nodosOffline: true`, sólo admin).

**Consecuencias.** MINOR: una pantalla, dos funciones y un método de `api` nuevos, un concepto del catálogo. Ninguna pantalla existente cambia.

**Tests.** `test/SucursalSinInternet.test.tsx` (12): el instalador y las listas, sin adicional, sin URL del central, emisor incompleto, error al cargar; el alta baja el archivo con su nombre y **el secreto no aparece en el documento**; el rechazo del motor en el diálogo sin descargar nada; la carga nueva a la ruta del nodo; la baja con confirmación; `nombreDeArchivo`, `ultimaSincronizacion`, `nombreDelProducto`. `test/iconos-identidad.test.tsx`: el concepto nuevo y el ícono del título de la pantalla. `test/menu-de-nodos-offline.test.tsx` (6): visible / no visible / error, una sola consulta aunque el layout se remonte, un no admin o un menú sin la entrada no piden nada, y el refresco tras la baja la esconde.

**Lo que no cubre.** (a) El e2e en un navegador (la descarga real y los 390 px). (b) La revisión manual de operaciones (`libraedge-central revision`), que sigue siendo CLI. (c) El aviso de nodo callado por mail o Telegram (decisión 11 del plan).

## ADR-081 — La barra de scroll de la barra lateral, sin canal propio (0.167.0)

**Estado:** aceptada (2026-10-19). Pedido del humano: que el fondo de la barra de scroll de la barra lateral sea el de la barra, en claro y en oscuro, «tal cual como es hoy día una scrollbar de Claude Code desktop».

**Contexto.** La barra lateral es grafito en los dos modos (ADR-043), pero su `SidebarContent` (`overflow-auto`) dibujaba la barra de scroll clásica del esquema de la página: canal blanco en claro y gris en oscuro, una franja ajena pegada al borde de la barra.

**Decisión.** `tema.css` le da a `[data-sidebar="content"]` `scrollbar-width: thin` y `scrollbar-color: <pulgar> transparent`: el canal es transparente, así que se ve el `--sidebar` de abajo en los dos modos, y el pulgar es el `--sidebar-foreground` al 22% (al 38% con el puntero encima de la barra), con `color-mix` para que siga al texto si «Apariencia» cambia la barra. Son las propiedades estándar (Chromium ≥ 121, Firefox), no `::-webkit-scrollbar`: en Chromium, con `scrollbar-color` declarado, los pseudoelementos se ignoran.

**Consecuencias.** MINOR, sólo visual: todos los productos lo ven con el pin, sin tocar nada. El contenido de la página no cambia; con barras superpuestas (móvil, macOS) tampoco.

**Tests.** `test/barra-lateral.test.ts`: el bloque de `[data-sidebar="content"]` declara el ancho fino y el canal transparente, en reposo y con hover. Medido en Chromium (barras clásicas, claro y oscuro): antes el canal blanco; ahora el canal es el grafito de la barra.

## ADR-082 — «Sucursal sin internet» pasa a Configuración y las descargas, sólo con el adicional (0.168.0)

**Estado:** aceptada (2026-10-20). Decisión del humano: «el instalador de libraedge no quiero que esté disponible ni en la página de librasuite ni en las landings de las apps, las descargas deben estar disponibles en configuración de las apps una vez que uno está dentro de una app, de esa manera nadie lo descarga porque sí». LibraEdge sigue siendo un adicional por sucursal (no entra en un plan) y los Releases de libraedge siguen públicos: lo que cambia es dónde se ofrece.

**Qué ya existe** (se miró antes). La pantalla `SucursalSinInternet` y la entrada de menú `nodosOffline` (ADR-080); `createConfiguracion({ propias })` (secciones propias del producto, con `?seccion=` en la URL); los Releases de libraedge con `libraedge-nodo-<producto>.exe`, el alias `libraedge-nodo-<producto>_amd64.deb` e `instalar-nodo.sh` (libraedge ADR-010 y ADR-012). La pantalla sólo ofrecía el `.exe`: el `.deb` y la línea de Ubuntu estaban sólo en las webs, que los sacaron (librasuite_web#9, ventalibra_web#26, restolibra_web#18, contalibra_web#15).

**Decisión.**
1. **`seccionSucursalSinInternet({ ruta? })`** devuelve la `SeccionConfig` (`clave: 'sucursal-sin-internet'`, `CLAVE_DE_LA_SECCION`) para `propias`. El producto la suma **sólo para el administrador** (el backend corta igual) y saca la entrada del menú; la ruta vieja `/sucursal-sin-internet` redirige a `/configuracion?seccion=sucursal-sin-internet`. `SucursalSinInternet({ enConfiguracion })` no repite el título de pantalla.
2. **🔴 Sin el adicional no hay descargas ni alta.** La tarjeta del instalador y la del nodo de cada sucursal se ven sólo con `contratado`; sin él queda el texto para contratarlo (`TEXTO_SIN_ADICIONAL`, que ahora dice que el instalador y la carga aparecen ahí una vez contratado) y, si hay nodos, su lista con «Dar de baja».
3. **Las tres descargas:** Windows (`instalador_url`), Ubuntu (`.deb`) y la línea de `instalar-nodo.sh` (`comandoDeUbuntu`). `descargasDelNodo` usa `instalador_deb_url` e `instalar_script_url` si el backend los manda y, si no, los arma al lado del `.exe` de los Releases; con otra URL no inventa nada. Se resolvió en el kit para no tocar libraedge mientras otra sesión trabajaba ahí; cuando `create_nodos_router` mande los dos campos, el kit los toma sin cambios.

**Consecuencias.** MINOR. `SucursalSinInternet` cambia sin el adicional (ya no muestra el instalador ni el alta deshabilitada). La entrada de menú `nodosOffline` (ADR-080, punto 5) queda en el kit pero los tres productos dejan de usarla.

**Tests.** `test/SucursalSinInternet.test.tsx` (17): las tres descargas con el adicional; sin él, ningún link ni alta (con y sin nodos); la sección sin título y con su clave; la ruta propia; `descargasDelNodo` (armadas, ajenas, del backend) y `comandoDeUbuntu`.

## ADR-083 — La barra de estado del pie: `BarraDeEstado` y `createLayout({ barraDeEstado })` (0.169.0)

**Estado:** propuesta (2026-10-20). Pedido del humano (2026-10-19/20): una barra de estado chica en el pie del layout de los ocho productos, igual en el central y en un nodo de LibraEdge (Windows y Linux: vive en el navegador), con LibraEdge, usuario y sucursal, versión, ARCA y último respaldo. El motor es `GET /api/estado-del-sistema` (ADR-075 de libracore, ≥ v1.187.0).

**Qué ya existe** (se miró antes). `CartelSinConexion` y `nodo-offline.ts` (ADR-077/079): el almacén de la conexión del nodo con **una** consulta compartida a `GET /api/nodo/conexion` cada 45 s, que se descarta fuera de un nodo o con 404; `menu-de-nodos-offline.ts` (ADR-080): una consulta por página con `useSyncExternalStore`. `createLayout` (`conexionDelNodo`, `getUserName`, `getUserSubtitle`, `userMenu`, el pie de la barra lateral con el nombre y el rol). Los tonos de estado de `badge-estado.tsx` (ámbar 800 y rojo 700 por contraste AA). `MarcaProducto` con la marca de LibraEdge en variante `favicon`. `ICONOS.sucursales` (`MapPin`) del catálogo de identidad. `fechas.ts` (`fecha`, `fechaHora`: `dd-mm-aaaa`, hora de Argentina). No había ninguna barra al pie ni un lugar donde ver la versión, el certificado o el respaldo fuera de Configuración.

**Decisión.**
1. **`BarraDeEstado` (`libra-ui/BarraDeEstado`) y su lógica (`libra-ui/estado-del-sistema`).** El layout la monta con `createLayout({ barraDeEstado: true })` o `{ ruta?, useSucursal? }`, **fija al pie de la columna del contenido** (decisión del humano, 2026-10-20: siempre a la vista), sin tapar la barra lateral: `fixed bottom-0` con `left` = `--izquierda-barra-de-estado`, que pone el `SidebarInset` con el ancho de la barra lateral (abierta, en íconos o fuera en el celular). **No tapa nada:** (a) un espaciador en el flujo, al final del contenido, mide lo mismo que la barra cerrada (`ResizeObserver`), así el último botón de una pantalla larga termina arriba de ella; (b) ese alto se publica en `--alto-barra-de-estado` y en `scroll-padding-bottom` del documento, para que `scrollIntoView` (el teclado, un `focus`, Playwright) no deje nada debajo, y los pies `sticky` de las pantallas se corren con `bottom-[var(--alto-barra-de-estado,0px)]` (LibraCargo: Nueva factura y Facturar pendientes; LibraDesk: Incidencias y Cuotas; el aviso de Términos del kit); (c) z-30: arriba del contenido, debajo del aviso de Términos (z-40) y de diálogos y hojas (z-50). La primera versión fue `sticky` sin reserva y tapaba «Emitir nota de crédito» (lo destapó el e2e de ContaLibra). Sin la prop, nada (ni un pedido).
2. **Qué muestra, en una línea** (`text-xs`, gris; sólo lo que pide atención toma color de estado): LibraEdge con su marca («Sin conexión · 12 por subir · 3 por facturar», o en el central «2 nodos · 1 sin noticias»); el usuario y la sucursal; el certificado de ARCA **sólo si vence en menos de 30 días, venció o no se lee**; el último respaldo («Respaldo hace 3 h», «Sin respaldos», «Falló la copia externa»); la versión a la derecha (desde `md`). Lo que no aplica (sin LibraEdge, sin ARCA, un cajero sin respaldo) no aparece.
3. **El detalle**: tocar la barra abre, **hacia arriba y encima del contenido sin moverlo** (`absolute bottom-full`; la reserva sigue siendo la de la barra cerrada), una región con las frases completas (fechas en `dd-mm-aaaa`, la versión del motor para el administrador, qué hacer). Es un botón con `aria-expanded`/`aria-controls`; Escape cierra y devuelve el foco; un clic afuera también cierra.
4. **En el celular** (menos de 640 px) cada parte queda en su ícono y el texto pasa a `sr-only` (`sr-only sm:not-sr-only`): el lector de pantalla lo sigue leyendo. Lo que pide atención suma un punto de su color (y LibraEdge sin conexión, `WifiOff`), que es la señal cuando no hay texto a la vista; la barra mide 36 px de alto para el dedo y respeta el área segura de abajo. A 390 px entra sin desbordar.
5. **Una consulta, no una por render**: almacén del módulo con `useSyncExternalStore`, un reloj para todas las barras; pregunta al montar, cada `refrescar_en_segundos` del servidor (60 en un nodo, 300 fuera; acotado a 30–900 s; 300 si no viene) y al volver a la pestaña (`visibilitychange` / `focus`) si pasaron más de 30 s. Con la pestaña oculta no pregunta. 403, 404 o 405 la descartan para el resto de la página (el producto no monta la ruta); un 500 o la red dejan lo último.
6. **En un nodo, el dato más fresco gana**: si el cartel ya consulta `/api/nodo/conexion` (cada 45 s), la barra toma de ahí «en línea» y «por facturar» en vez de esperar su propio refresco.
7. **La sucursal**: la que manda el servidor (el usuario de LibraClub, la costura `sucursal` del motor) o, si el producto la elige en el navegador (el selector de LibraDesk), `useSucursal`, un hook que el producto pasa. El nombre es el mismo que muestra el pie de la barra lateral (`getUserName`).
8. **Íconos**: los de estado son de lucide (`ShieldAlert`, `DatabaseBackup`, `UserRound`, `ChevronUp`, `Info`) y no entran al catálogo de identidad (que es de menús y títulos, ADR-035); la sucursal usa `ICONOS.sucursales`. No hace falta un concepto nuevo en `ICONOS`.

**Alternativas descartadas.** Ponerlo en el pie de la barra lateral (se esconde al colapsarla y en el celular está cerrada); varias consultas a las rutas que ya existen (ver ADR-075 del motor); un `Popover` de Radix para el detalle (no todos los productos tienen `@/components/ui/popover`; una región propia alcanza y no suma dependencia).

**Consecuencias.** MINOR (**0.169.0**). Cada producto suma `barraDeEstado: true` a su `createLayout` y monta la ruta del motor; LibraDesk pasa `useSucursal` con su selector. Un pie `sticky` o `fixed` propio de una pantalla tiene que correrse con `--alto-barra-de-estado` (los cuatro que hay ya lo hacen).

**Tests.** `test/estado-del-sistema.test.tsx` (18): los textos (cuánto hace, LibraEdge en nodo y central, ARCA al día / por vencer / vencido / ilegible / servicio, respaldo, el peor nivel); en el layout (sin la prop no pide; administrador con todo y abajo del contenido; en el celular el texto en `sr-only`; el detalle con teclado; sin la ruta no dibuja ni vuelve a pedir; la sucursal del producto; otra ruta; la conexión del cartel gana); el refresco (un reloj para dos barras y el intervalo del servidor, cinco minutos por defecto, al volver a la pestaña con el mínimo de 30 s, pestaña oculta, un 500 deja lo último). `exports-del-paquete` con los dos módulos nuevos. La reserva de espacio (espaciador del alto de la barra, la variable y `scroll-padding-bottom`, el detalle que no la cambia, la izquierda del layout) tiene su test.
## ADR-084 — «Sucursal sin internet»: en el local se entra siempre por la copia local (0.170.0)

**Estado:** aceptada (2026-10-20). El humano, probando un nodo de ContaLibra en una VM, entró desde la PC del local a la versión en la nube (`demo.contalibra.com.ar`); al cortar internet esa pestaña dejó de andar y tuvo que abrir `localhost:8000` y volver a loguearse. Nadie sabe que en la PC con LibraEdge se entra **siempre** por la copia local, aunque haya internet (el nodo sincroniza por detrás). Decisión: que sea obvio, sin una app aparte.

**Qué ya existe** (se miró antes). `SucursalSinInternet` (ADR-080 y ADR-082): la tarjeta del instalador, el alta del nodo con su diálogo y `AvisoEstado`. Nada decía cómo se entra después de instalar; el único texto era «en la PC del local, ejecutá el instalador y elegí la carga». En libraedge, el puerto del producto en el nodo es el `puerto` de `instalador/productos/<producto>.json` (8000 en los tres) y el central no lo manda en `GET /api/nodos-offline`.

**Decisión.**
1. **`textoEntrarPorLaCopiaLocal(producto, puerto?)`**: «En ese local, entrá siempre por la copia local, aunque haya internet: en la PC del nodo, con el acceso directo «<Producto>» que deja el instalador (o http://localhost:8000); desde las otras cajas, con http://<IP de esa PC>:8000. La dirección de la nube es para entrar desde afuera del local.» Va como `AvisoEstado` de atención (`role="note"`) **en la tarjeta del instalador** y **en el diálogo del alta del nodo**, antes de descargar la carga. La carga nueva y la baja no lo repiten.
2. **El puerto:** `PUERTO_DEL_NODO = 8000`, o `puerto_local` si el backend lo manda (campo opcional de `EstadoNodosOffline`; hoy no lo manda).
3. **La IP real la completa el nodo, no el central:** el central no sabe la IP de la red del local. El instalador de LibraEdge (página final y log) y su bandeja la muestran ya completa (libraedge ADR-013), junto con el acceso directo «<Producto>» que abre la copia local en modo aplicación.

**Consecuencias.** MINOR: una función, una constante y un campo opcional nuevos; la pantalla suma el aviso. Sin cambios para el producto.

**Tests.** `test/SucursalSinInternet.test.tsx` (+5): el aviso en la tarjeta del instalador con el acceso directo y las dos direcciones; en el alta; no en la carga nueva; sin el adicional no está; el puerto del backend.


## ADR-085 — «Sucursal sin internet»: LibraEdge incluido en todos los planes y el código de vinculación (0.171.0)

**Estado:** aceptada (2026-10-20). Decisiones del humano: (1) LibraEdge es parte del sistema e incluido en todos los planes: el alta, la carga nueva y la baja quedan disponibles para el administrador de cualquier instancia de los productos con LibraEdge, y la entrada se ve siempre para el administrador; (2) el nodo se activa con «dirección + código» en lugar de llevar el archivo de carga, que queda como alternativa para soporte. El motor es libraedge ADR-014.

**Qué ya existe** (se miró antes). La pantalla `SucursalSinInternet` (ADR-080), como sección de Configuración y con las descargas sólo con el adicional (ADR-082), con el aviso de la copia local (ADR-084); la entrada `nodosOffline` del layout y `libra-ui/menu-de-nodos-offline`, que preguntaba `GET /api/nodos-offline/menu` una vez por página (ADR-080, punto 5); el archivo como `Blob` sin leerse (`api.postArchivo`, `guardarArchivo`); el patrón de copiar al portapapeles con confirmación de `configuracion/mercadopago.tsx` (webhook); `hora()` y `fechaHora()` de `fechas` (UTC-3). En libraedge ≥ v0.14.0: `POST /api/nodos-offline/vinculacion`, `POST`/`DELETE /api/nodos-offline/{id}/vinculacion`, `direccion` y `vinculacion` por nodo en el `GET`, y `contratado` siempre `true`.

**Decisión.**
1. **Sin adicional.** La pantalla deja de mirar `contratado` (queda en el tipo, `@deprecated`): el instalador, el alta, el código nuevo y el archivo se ofrecen siempre (con la URL del central y el CUIT bien). Se van `TEXTO_SIN_ADICIONAL` y `TEXTO_ADICIONAL_APAGADO_CON_NODOS`. El texto de la pantalla dice «Está incluido en tu plan».
2. **El menú.** La entrada `nodosOffline` se ve siempre para quien ve los menús de administración (admin o visitante de demo), sin consultar nada. `menu-de-nodos-offline` queda exportado por compatibilidad, sin pedidos (`useMenuDeNodosOffline(h)` devuelve `h`). Un layout de antes contra un libraedge nuevo también la muestra siempre (`visible: true`).
3. **El código.** «Dar de alta el nodo» y «Código nuevo» (en cada nodo, reemplaza a «Carga nueva») piden el código (`api.post`) y muestran la tarjeta «Vincular el nodo de <sucursal>»: **Dirección** y **Código** (en grande, monoespaciado) con botones para copiar, «Vence a las HH:MM (15 minutos) y sirve una sola vez», la línea de Ubuntu ya completa (`comandoDeUbuntu(script, producto, codigo, direccion)`), y «Pedir otro código», «Anular el código» y «Listo». El código vive sólo en el estado de la pantalla mientras se copia (el central guarda el hash); un nodo con código pendiente muestra «Código pendiente hasta las HH:MM» y «Anular código». 🔴 **El secreto no pasa por la pantalla**: sale en el canje del instalador.
4. **El archivo, para soporte.** «Archivo de carga» (botón secundario de cada nodo) es el flujo de siempre: `POST .../{id}/carga` como `Blob` sin leerse. El diálogo avisa que la clave anterior y el código pendiente dejan de servir.
5. **La línea de Ubuntu** pasa a `... | sudo bash -s <producto> --codigo <código> --direccion <dirección>`.

**Consecuencias.** MINOR, con un cambio visible: un producto que importe `TEXTO_SIN_ADICIONAL` o `TEXTO_ADICIONAL_APAGADO_CON_NODOS` deja de compilar (VentaLibra los usa en un test, que se actualiza con el bump). Contra un libraedge anterior a v0.14.0 el alta con código da 404/405 (no existe la ruta): el kit y libraedge se suben juntos en los productos.

**Tests.** `test/SucursalSinInternet.test.tsx` (23): todo habilitado aunque un backend viejo diga `contratado: false`; el código pendiente y su anulación; el alta con código (dirección, código, vencimiento, línea de Ubuntu completa, sin descargas ni secreto); copiar al portapapeles; pedir otro y anular por las rutas del nodo; un rechazo del motor en el diálogo; el archivo de soporte como `Blob` sin el secreto en el documento. `test/menu-de-nodos-offline.test.tsx` (4): la entrada siempre para el admin y para la demo, nunca para otro rol, sin pedidos.

## ADR-086 — «Sucursal sin internet»: la app de puesto para las otras PC del local (0.172.0)

**Estado:** aceptada (2026-10-20). Decisión del humano: una app por producto también para las otras PC del local (los puestos que no tienen el nodo). El motor es libraedge ADR-017: el nodo contesta un descubrimiento en la red y la app de puesto busca sola la PC principal.

**Qué ya existe** (se miró antes). La tarjeta «1. El instalador» de `SucursalSinInternet` con las descargas armadas al lado del `.exe` del nodo cuando el backend no las manda (`descargasDelNodo`, ADR-082/085) y el aviso de la copia local (`textoEntrarPorLaCopiaLocal`, ADR-084), que decía «desde los otros puestos, con `http://<IP de esa PC>:<puerto>`». Los Releases de LibraEdge publican con nombre fijo `libraedge-puesto-<producto>.exe` y `libraedge-puesto-<producto>_amd64.deb` (libraedge ADR-017).

**Decisión.**
1. **`descargasDePuesto(estado)`** arma las dos descargas de puesto al lado de `libraedge-nodo-<producto>.exe` (como las otras: el backend no manda nada nuevo; si algún día manda `puesto_url`/`puesto_deb_url`, mandan esas). Con un instalador servido de otro lado devuelve `null` y no se muestra nada.
2. La tarjeta del instalador suma **«Para las otras PC del local»** con una línea (`TEXTO_PUESTO`: la app de puesto no tiene nodo ni base de datos, busca sola la PC principal y abre el sistema desde ella) y los botones «<Producto> para otro puesto (Windows)» y «(Ubuntu)».
3. `textoEntrarPorLaCopiaLocal` dice ahora «desde los otros puestos, con la app de puesto, que encuentra sola esa PC en la red (o con `http://<IP de esa PC>:<puerto>`)».

**Consecuencias.** MINOR, sin cambios para el producto (no hay ruta ni campo nuevo). Contra un libraedge anterior a la versión que publica los instaladores de puesto, los dos botones darían 404 en el Release: el kit se sube junto con el tag de libraedge que las trae.

**Tests.** `test/SucursalSinInternet.test.tsx`: la sección de puesto con su línea y los dos links al Release; sin puesto con otra URL de instalador; `descargasDePuesto` con y sin las URLs del backend; el aviso de la copia local menciona la app de puesto.


## ADR-087 — La bandeja de comprobantes pendientes sube al kit: `BandejaDeComprobantes` (0.173.0)

**Estado:** propuesta (2026-10-21). Cierra el ítem (a) de «Lo que no cubre» del ADR-077. Es la fase 2 de LibraEdge: RestoLibra y VentaLibra venden desde un nodo y su bandeja de ventas cobradas sin conexión es esta pantalla.

**Contexto.** La bandeja de comprobantes a facturar (`pages/ComprobantesPendientes.tsx`) era sólo de Contalibra: lo que otros sistemas (LibraDesk: cuotas, tickets, remitos, presupuestos) dejan para facturar y, desde el ADR-077, las ventas que el nodo cobró sin conexión. El ADR-077 dio las piezas (`esVentaSinConexion`, `EtiquetaVentaSinConexion`, `BotonFacturarPendientesDelNodo`) y dejó la pantalla en el producto «hasta que un segundo producto la necesite». Ese segundo producto llegó: un nodo de RestoLibra o de VentaLibra necesita ver qué quedó para facturar y apretar «Facturar ahora», y copiar 400 líneas de Contalibra es lo que el kit existe para evitar (MpBandeja se extrajo por lo mismo).

**Qué ya existe** (se miró antes). El backend ya es uno solo: `libracore.comprobantes_router.build_comprobantes_bandeja_router` (libracore ≥ v1.186.1) bajo `/api/comprobantes-pendientes`: `GET` (`{pendientes, facturados, descartados, total_pendientes}`, los resueltos acotados a 50), `POST /facturar-prefill` (`{ids}` → el formulario armado, **no escribe nada**; 404 si falta alguno, 409 si ya estaba resuelto o `se_factura_desde_la_venta` si alguno es una venta del nodo, 422 si los clientes se mezclan), `POST /marcar-facturado` (lo llama el formulario del producto al emitir, no la bandeja) y `POST /{id}/descartar` (409 si ya estaba resuelto y, desde v1.186.1, 409 si es una venta del nodo). El kit ya tenía `DataTable`, `Tabs`, `TituloPantalla`, `BadgeEstado`, `fecha`, `formatoMoneda` e `ICONOS.comprobantesAFacturar` (el ícono del menú, que el guard de títulos exige).

**Decisión.**
1. **`libra-ui/BandejaDeComprobantes`**: la pantalla de Contalibra tal cual (pestañas Pendientes/Facturados/Descartados, el agrupado por cliente, la barra «N comprobantes elegidos · $», el formulario de descarte con motivo), con las rutas, el total y el período como los tenía. **`libra-ui/comprobantes-pendientes`** (sin componentes): los tipos de lo que contesta el motor (`ComprobantePendiente`, `BandejaDeComprobantesDatos`, `PrefillComprobantes`), `RUTA_COMPROBANTES_PENDIENTES`, los orígenes de la familia (`ORIGENES_DE_COMPROBANTE`), `periodoDelComprobante` y los textos.
2. **Lo propio de cada producto entra por props** (todas opcionales): `alFacturar(prefill)`, `puedeDescartar`, `rutaFactura(id)`, `ruta`, `rutaFacturarPendientes`, `titulo`, `introduccion` (`null` la saca) y `origenes` (suman a los de la familia o los pisan). El ícono del título no es prop: es el del concepto del catálogo, el mismo del menú (`test/iconos-identidad`).
3. **La bandeja no factura ni navega por su cuenta.** `alFacturar` recibe el `PrefillComprobantes` que armó el motor y el producto lo lleva a su formulario de factura (Contalibra, a `/facturas/nuevo` con el `state` de siempre); la emisión, el CAE y el `marcar-facturado` pasan ahí. **Sin `alFacturar` no hay casillas ni «Facturar»**: la bandeja es de consulta y de las ventas del nodo, que es lo que necesita un producto que no recibe comprobantes de otros sistemas.
4. **Las ventas del nodo (`origen_tipo = "venta"`) no se tildan ni se descartan** (decisión del motor, v1.186.1): sin casilla —lleva `BotonFacturarPendientesDelNodo`—, con `EtiquetaVentaSinConexion` en Origen y **sin «Descartar»**, tenga o no el usuario `puedeDescartar`. Con el formulario saldría una factura sin vínculo con la venta y la tanda del nodo emitiría otra; descartada, la venta quedaría cobrada y sin factura para siempre. Una venta que apareciera igual en el formulario de descarte no se confirma (la pantalla lo vuelve a chequear).
5. **Dos arreglos chicos al pasar.** (a) Recargar (después de «Facturar ahora» o de descartar) ya no reemplaza la tabla por «Cargando…» —el mensaje «N ventas facturadas» del botón se perdía porque su fila se desmontaba—; sólo la primera carga muestra «Cargando…». (b) Al recargar, lo que ya no está pendiente (lo resolvió la tanda del nodo u otra persona) sale de la elección: mandarlo al `facturar-prefill` daba un 409. Además el error de la pantalla es `role="alert"` y el `id` del motivo es `motivo-descarte`.

**Cómo lo adopta cada producto.** Con el pin a 0.173.0:
- **Contalibra** borra `pages/ComprobantesPendientes.tsx` y su `api.ts` deja de definir los tipos (los importa del kit); la ruta queda `<BandejaDeComprobantes alFacturar={irAlFormulario} puedeDescartar={…} />`, donde `irAlFormulario(p)` es el `navigate('/facturas/nuevo', { state: {…} })` que ya tenía (el mapa de `PrefillComprobantes` a `FacturaNueva`, que es del producto). Su test pasa a apuntar al componente del kit.
- **RestoLibra / VentaLibra** (con `conexionDelNodo: true` en el layout, ADR-077, y `build_comprobantes_bandeja_router` + `build_facturacion_del_nodo_router` montados detrás del gate de admin): una ruta `/comprobantes-pendientes` con `<BandejaDeComprobantes />` (sin `alFacturar`, sólo consulta y «Facturar ahora») y la entrada de menú con `ICONOS.comprobantesAFacturar`. Si el producto monta el router en otro prefijo, `ruta`.

**Consecuencias.** MINOR: dos módulos nuevos, ningún cambio en lo existente. Contalibra queda con la misma pantalla (su test de la bandeja es la prueba de que no cambió nada) y un archivo menos.

**Tests.** `test/BandejaDeComprobantes.test.tsx` (29): lo que muestra (origen rotulado, período, vacío, error del motor y corte de red, «+N» y origen desconocido); el agrupado (mismo cliente, bloqueo del otro, total, «Limpiar» y cambio de pestaña); «Facturar» (los ids van al prefill, el resultado a `alFacturar` y no se escribe nada más, 422, 409 `se_factura_desde_la_venta`, sin `alFacturar` no hay casillas); descartar (motivo y recarga, cancelar, error del motor, sin permiso); las ventas del nodo (etiqueta y sin casilla, **sin «Descartar»**, sin `alFacturar` igual se facturan, la elección se poda al recargar, la ruta de la tanda del producto, sin ventas no se pregunta nada del nodo); el historial (`rutaFactura`, motivo, pestañas vacías); y las props del producto (`ruta`, `titulo`, `introduccion`, `origenes`). Los cinco tests de las ventas del nodo se ponen rojos si se quita el guard de `esVentaSinConexion` de la casilla y de «Descartar».

**Lo que no cubre.** (a) El formulario de factura que recibe el `prefill` y llama a `marcar-facturado` sigue siendo de cada producto (en Contalibra, `FacturaNueva`): sube cuando un segundo producto con bandeja de otros sistemas lo necesite. (b) El e2e en un navegador y el ancho en celular (la tabla usa `DataTable` como siempre, sin vista en tarjetas). (c) Los orígenes por defecto son los que manda hoy LibraDesk; un origen nuevo sin etiqueta se muestra como llega.

## ADR-088 — La marca de LibraBot, segundo complemento con marca (0.174.0)

**Estado:** aceptada (2026-10-21).

**Contexto.** LibraBot es el chatbot con IA de la suite: responde con el sitio web de cada empresa y lo que ella le carga, tiene preguntas fijas y pasa la conversación a una persona en Chatwoot (diseño en el wiki: `chatbot-ia-para-prospectos`). Necesita marca para su landing (`librabot.com.ar`) y para LibraSuite, que copian los SVG de este paquete (ADR-034). Todavía no tiene pantallas propias en el kit.

**Qué ya existe** (se miró antes). LibraEdge entró por el mismo camino (ADR-078): marca dibujada sin ser una de las ocho apps de `IDENTIDAD`, con su nombre y su color en `COMPLEMENTOS`.

**Decisión.**
1. `librabot` es un `Complemento` más: nombre «LibraBot», fondo **rojo frambuesa `#e11d48`** (elegido por el humano; no lo usa ninguna app ni LibraEdge), tinta `#4c0519`, claro `#fecdd3`. `IDENTIDAD` sigue en ocho.
2. **El dibujo es idea del humano**: una burbuja de chat con cara, dos ojos y una sonrisa. Se llevó a las cuatro reglas de la familia (ADR-034): la burbuja con cara es la pieza principal; detrás, otra burbuja en blanco translúcido (la respuesta); el corte las separa; la cara va en la tinta; el único acento es una chispa amarilla (la IA). El humano eligió esta versión frente a la burbuja sola.
3. El favicon es la burbuja con cara, sola y engrosada, para que se lea a 16 px.

**Consecuencias.** MINOR: dos archivos en `marcas/` y una marca más en `MARCAS`. Ningún producto cambia. `libra-web-kit` las copia con `scripts/sincronizar_marcas.py --tag v0.174.0`.

**Tests.** `test/marcas.test.ts`: los diez dibujos son distintos entre sí, LibraBot no está en `IDENTIDAD` y su color no es el de ninguna otra marca, y los archivos de `marcas/` son exactamente lo que devuelve `svgDeMarca`.

## ADR-089 — La marca de LibraBot pasa a 3D (0.175.0)

**Estado:** aceptada (2026-10-21). Reemplaza el dibujo del ADR-088; el color, los tonos y el lugar de complemento no cambian.

**Contexto.** La landing de LibraBot estrenó de fondo un dibujo propio de burbujas blandas, con volumen y sombra. El humano pidió que la marca tome esa burbuja «más descontracturada», con su carita, y «más en 3D como la de la imagen». Eligió, entre dos propuestas, la que lleva la respuesta translúcida detrás, como en el fondo.

**Qué ya existe** (se miró antes). Las nueve marcas eran planas por regla (ADR-034, regla 3: formas llenas con detalles calados, nunca el trazo fino de los packs). `svgDeMarca` armaba siempre el cuadrado de color y el dibujo encima, sin `defs`.

**Decisión.**
1. **LibraBot es la única marca en 3D.** Es una excepción pedida por el humano a la regla de ADR-034, no un cambio de la familia: las otras nueve siguen planas.
2. `VOLUMEN` en `marcas.ts`, opcional por marca: `defs` (degradés de la burbuja, de la respuesta y de los ojos, y un filtro de sombra) y `luz`, un segundo cuadrado con un degradé radial encima del fondo de color. **El primer `rect` sigue siendo el del color de MARCA**, que es lo que exige el test. Los ids llevan el prefijo `lb` para no chocar con otros SVG en línea.
3. El ícono usa las coordenadas del lienzo de 120 entero (un `<g>` deshace el `translate(9 9) scale(.85)`). El favicon es la burbuja sola, inclinada y con volumen, para que se lea a 16 px.

**Consecuencias.** MINOR. Cambian sólo `marcas/librabot.svg` y `marcas/librabot-favicon.svg`; las otras nueve marcas quedan byte a byte iguales. La landing y LibraSuite vuelven a copiar los dos archivos del tag `v0.175.0`.

**Tests.** Los de `test/marcas.test.ts`, sin cambios: SVG bien formado de 120, primer `rect` del color de MARCA, `<title>`, compacto, favicon distinto del ícono, diez dibujos distintos y archivos idénticos a `svgDeMarca`.

## ADR-090 — Las diez marcas en 3D (0.176.0)

**Estado:** aceptada (2026-10-21). Extiende el ADR-089 a toda la familia y deja sin efecto su punto 1 («LibraBot es la única marca en 3D»). Los dibujos, los colores y los tonos de ADR-034, ADR-078 y ADR-088 no cambian.

**Contexto.** Con LibraBot en 3D, el humano pidió ver las ocho apps con el mismo efecto, aprobó la muestra y pidió sumar LibraEdge y pasarlas al kit con favicon.

**Qué ya existe** (se miró antes). `VOLUMEN` en `marcas.ts` (ADR-089): `defs` y `luz` dibujados a mano, sólo para LibraBot. Las otras nueve se dibujan planas con cuatro piezas de paleta: blanco, `tinta`, `claro` y el amarillo de acento, y el corte (`corte()`) del color de fondo donde una pieza pisa a otra.

**Decisión.**
1. **Las diez marcas van en 3D.** Las nueve dibujadas planas no se redibujan: `volumenComun` les da volumen al armarlas, con el tratamiento de LibraBot sacado de la paleta de cada una (`mezclar`): la luz radial sobre el fondo, los rellenos blancos llenos con un degradé del blanco al `claro`, la `tinta` y el amarillo con luz arriba a la izquierda, y una sombra suave bajo todo el dibujo. LibraBot conserva su volumen dibujado a mano.
2. **Sólo los rellenos.** Un trazo con degradé por caja desaparece cuando la línea es recta (su caja no tiene alto), así que los trazos quedan lisos. Los blancos translúcidos (`opacity`) tampoco se iluminan: son lo que está atrás.
3. **El corte pasa a sombra.** Sobre un fondo degradado, el filo de color liso se ve como un contorno. En 3D `corte()` devuelve un filtro de sombra corta (`Paleta.sombra`), que separa la pieza igual.
4. **Sin inclinar.** LibraBot está girada porque su dibujo es descontracturado; las otras nueve quedan derechas, formales.
5. Los ids llevan el nombre de la marca como prefijo (`contalibraF`, `libraedgeS`…), para que dos marcas en línea en la misma página no se pisen los degradés.

**Consecuencias.** MINOR. Cambian los dieciocho archivos de `marcas/` de las nueve marcas; los dos de LibraBot quedan byte a byte iguales. `MarcaProducto` no cambia: la sidebar, el login y la pantalla del nodo toman el 3D con el bump del pin. LibraSuite, las landings (`libra-web-kit`, `scripts/sincronizar_marcas.py --tag v0.176.0`) y el instalador del nodo vuelven a copiar los archivos.

**Tests.** `test/marcas.test.ts` suma: las diez marcas llevan la luz encima del fondo y una sombra; ninguna deja un corte de color liso ni un trazo con degradé; y los ids de dos marcas distintas no se repiten.

## ADR-091 — El login no pide captcha cuando el backend dice que no hace falta: el nodo de LibraEdge (0.177.0)

**Estado:** aceptada (2026-10-21). Es la mitad de libra-ui de libraauth ADR-028.

**Contexto.** En una prueba real, desde un puesto se entra a la PC principal por `http://<IP-LAN>:8000` y el widget «No soy un
robot» muestra «Secure context (HTTPS) required.»: ALTCHA usa WebCrypto (`crypto.subtle`), que Chromium/WebView2 y WebKitGTK sólo dan
en https o `localhost`. Sin solución no se habilita «Ingresar» y nadie entra, ni en la app de escritorio ni en un navegador. El
humano decidió que **en un nodo de LibraEdge no se pide captcha** (a un nodo sólo se llega por la red del local); en la nube, todo igual.

**Qué ya existe** (se miró antes). `useCaptcha` (`src/captcha.ts`, v0.69.0) consulta `captchaPath` al montar y sólo enciende el
captcha si la respuesta tiene la **forma** de un desafío (`esDesafio`: `parameters` objeto + `signature` texto); un 404, el
`index.html` del catch-all o un JSON sin esa forma lo dejan apagado, y entonces `CampoCaptcha` no dibuja nada, «Ingresar» no
espera y `login` se llama con dos argumentos (`Login.tsx`, `PasswordReset.tsx`). Por eso **la respuesta `{ "requerido": false }`
de libraauth ya hacía lo correcto con libra-ui 0.176.0** (medido: el caso se agregó a los tests de 0.177.0 y pasa sin tocar el
código). Lo que faltaba era fijar el contrato y que no dependa de un efecto lateral.

**Decisión.**
1. **Contrato.** El backend contesta `GET {captchaPath}` con el desafío (hay captcha) o con `{ "requerido": false }` (no hace falta).
   El cliente aplica una sola regla, `captchaRequerido(info)`: hay captcha si y sólo si `esDesafio(info)` **y** `info.requerido` no
   es el booleano `false`. `requerido: false` manda aunque venga también la forma de un desafío. Sólo `false` apaga: `"false"`, `0`
   o `true` no.
2. **Nada más cambia.** Si la consulta falla, comportamiento de siempre (captcha apagado). Ni `Login`, ni `PasswordReset`, ni
   `CampoCaptcha` se tocan: leen `captcha.activo`, que ahora sale de `captchaRequerido`. Sin `captchaPath`, no se consulta.
3. **Orden de los bumps libre.** libra-ui viejo contra un libraauth nuevo en un nodo: la respuesta no es un desafío, no hay widget
   y entra. libra-ui nuevo contra un libraauth viejo: recibe el desafío (que un nodo viejo seguiría emitiendo) y se comporta como hoy.

**Consecuencias.** MINOR, aditivo: se exporta `captchaRequerido` desde `src/captcha.ts` (módulo interno, no está en `exports` del
paquete). El e2e helper `tildarCaptcha` (`e2e/src/captcha.ts`) espera el widget: contra un nodo no hay widget y fallaría; los
productos que corran e2e contra un nodo tienen que saltearlo (abierto, ver abajo).

**Tests.** `test/captcha.test.ts` (nuevo, 8): la regla sola. `test/Login.test.tsx`: `{ requerido: false }`, `requerido: false` con
forma de desafío y un 500 no encienden el captcha y el login sigue siendo `login('ana', 'clave')` con «Ingresar» habilitado.
`test/PasswordReset.test.tsx`: con `{ requerido: false }` no hay widget y el pedido es `{"identificador":"ana"}`. Sin el cambio de
`captcha.ts` se pone rojo el caso de `requerido: false` con forma de desafío; el resto es la contraprueba que pasa en los dos lados.

## ADR-092 — El login lleva de fondo la foto del hero de la landing, con su mismo velo (0.178.0)

**Estado:** aceptada (2026-10-21). Pedido del humano, aprobado sobre una muestra: «usar las imágenes de los heros de las landings
de background en la pantalla de login de las apps, así tenues igual que en los heros».

**Qué ya existe** (se miró antes). Cada landing (`<producto>_web/public/css/style.css`) arma su `.hero` con un velo oscuro
(`linear-gradient` vertical, o tres capas en RestoLibra), la foto en `public/img/*-hero.jpg` con su encuadre y un color base, más
un brillo radial del color de la marca en `.hero::before`. LibraBot usa un dibujo (`burbujas-hero.svg`) en lugar de foto. El login
del kit (`createLogin`) pintaba un `bg-muted/40` y ya sabía la marca por `producto` (ADR-033); el panel de LibraBot no pasa
`producto` sino `logo`.

**Decisión.**
1. Las nueve imágenes viven en el kit (`src/fondos-de-login/`) y sus capas en `src/fondo-de-login.ts`, copiadas tal cual de cada
   landing. Si una landing cambia su hero, se copian acá.
2. **Con `producto` el fondo sale solo**: los ocho productos lo reciben con subir el pin, sin tocar su `Login.tsx`.
3. Prop nueva `fondo?: MarcaConFondo | false`: quien no pasa `producto` lo pide con su marca (`fondo: 'librabot'`), y `false` lo
   apaga. Sin ninguno de los dos (backoffice, panel), la pantalla queda como siempre.
4. Con fondo, la tarjeta suma `shadow-2xl` y un borde `white/10` para despegarse de la foto.

**Consecuencias.** MINOR, aditivo. Vite emite las ocho fotos como archivos aparte (150–300 KB cada una) en el `dist/` de cada
producto; el navegador baja sólo la de la marca. El SVG de LibraBot pesa menos de 4 KB y va incrustado como `data:` URI.
`src/imagenes.d.ts` declara `*.jpg` y `*.svg` para el typecheck del kit; los productos ya los tienen por `vite/client`.

**Tests.** `test/Login.test.tsx`, bloque «fondo»: sin `producto` ni `fondo` queda `bg-muted/40` y sin `style`; con `producto`
sale la foto y el velo; `fondo: 'librabot'` sin producto; `fondo={false}` lo apaga. El `data:` URI no lo parsea el CSS de jsdom,
así que el caso de LibraBot mira lo que arma `estiloDeFondo`. Verificado además en un build real de LibraCargo a 1280 y 390 px.

## ADR-093 — Stock en tabla compacta con detalle desplegable, y la fila desplegable de `DataTable` (0.179.0)

**Estado:** aceptada (2026-10-23). Pedido del humano, sobre VentaLibra: «cuando voy a stock veo los productos en tarjetas
[…] un negocio con muchos productos ver los productos así no es práctico a la vista, necesitamos hacer una tabla con los
productos y que muestre los datos importantes, los demás que se desplieguen cuando hago click en el producto».

**Qué ya existe** (se miró antes). La pantalla de Stock ya era una tabla con fallback a tarjetas (ADR-016): una columna por
depósito (ADR-057) más producto, categoría, unidad, mínimo, total, estado y acciones. Con dos depósitos la tabla pedía
1057 px; con tres o más sucursales y el menú abierto no entraba en casi ninguna pantalla y la vista pasaba a tarjetas,
una debajo de la otra. `DataTable` no tenía filas desplegables; el único despliegue por fila del kit era el de `Logs.tsx`,
escrito a mano en su propia tabla. `meta.opcional` (columna oculta por CSS que no cuenta para el mínimo) ya existía y la
usan Turnos y Libros IVA.

**Decisión.**
1. `DataTable` suma la prop `detalle?: { render, etiqueta? }`: una primera columna de 40 px (`ANCHO_COLUMNA_DETALLE`, en
   `libra-ui/tabla`) con un chevron que es el control accesible (`aria-expanded`, `aria-controls`), y el click en cualquier
   parte de la fila que no sea un botón, link o campo despliega `render(fila)` en una fila de abajo a todo el ancho. Varias
   filas pueden quedar abiertas. Sin la prop no cambia nada. Si una tabla trae `onRowClick` y `detalle`, el click en la fila
   es de `onRowClick` y el detalle se abre con el chevron.
2. El `colSpan` de la fila desplegada cuenta **las columnas que se ven** (celdas del encabezado que no están en
   `display: none`), no `headers.length`: medido en Chromium a 900 px, con la categoría oculta y un colSpan que la incluía,
   la columna elástica dejaba de recibir el sobrante y quedaba un hueco de 200 px a la derecha de Acciones.
3. Stock: la tabla lleva **producto (con su código), stock con la unidad al lado, estado y acciones**, más la categoría
   como columna opcional desde 1280 px. Código, categoría, unidad, mínimo y **el stock de cada depósito** van al detalle.
   Las columnas por depósito se van de la tabla. Mínimo de la tabla: 587 px (603 con los botones de 44 bajo 1024 px),
   con depósitos o sin ellos: las tarjetas quedan sólo para el celular.
4. El encabezado es «Stock» con depósitos o sin ellos («Stock total» no entraba en 130 px con el ícono de orden).
5. El buscador de `conFiltros` encuentra también por código.

**Consecuencias.** MINOR. Contalibra, Restolibra y VentaLibra ven la tabla nueva al subir el pin, sin cambios en su código.
Se pierde ordenar por un depósito en particular (se ordena por producto o por stock total); si hace falta, se agrega al
detalle o como filtro. ADR-057 (encabezados de depósito en dos líneas) deja de aplicar a Stock; `sortableHeader` con
`dosLineas` sigue en el kit.

**Tests.** `test/comercio-stock-detalle.test.tsx` (encabezados, categoría opcional, unidad junto al número, despliegue y
cierre, depósito que falta = 0, los botones no despliegan, sin depósitos, búsqueda por código); `test/data-table.test.tsx`,
bloque «`detalle`» (sin la prop no hay chevron, colSpan, colgroup y min-width, botones, tabla vacía y el colSpan con una
columna oculta por CSS). Actualizados los de Stock que describían las columnas por depósito y el umbral de 1057/1073 px.
Verificado además en Chromium con el CSS de VentaLibra, 20 productos y tres depósitos, a 1280, 900 y 390 px: sin scroll
horizontal en ninguno.

## ADR-094 — La cola de comprobantes del nodo en pantalla: bandeja, aviso «sin CPE válida», el 202 `en_cola` y las etiquetas de reserva (0.180.0)

**Estado:** propuesta (2026-10-24). Es el PR 13 del plan «LibraCargo y LibraClub en la versión de escritorio» (`wiki/analyses/libraedge-libracargo-libraclub-2026-10-22.md`). **Sólo el kit**: el cableado en cada producto (PRs 9 y 11 y lo que sigue) es de ellos.

**Contexto.** Decisiones del humano (2026-10-22): en LibraCargo, sin internet, las CPE y las facturas **quedan en cola y se emiten solas al volver**; mientras tanto **no hay CPE válida para viajar**, un límite legal que la pantalla tiene que decir en claro. En LibraClub, si una reserva dada en el club sin conexión choca con una de la web, **gana la primera que llega al central** y la otra queda `en_conflicto`. El motor ya tiene la cola (libracore v1.192.0, ADR-079: `cola_arca`, `GET /api/nodo/cola` y sus acciones); los productos ya contestan 202 `en_cola` (libraclub ADR-023, libracargo ADR-056) y 409 `solo_en_el_central` / `sin_conexion`. Faltaba todo lo que se ve: el kit no sabía nada de la cola.

**Qué ya existe** (se miró antes). La bandeja de los nodos es `BandejaDeComprobantes` (ADR-087) con `CartelSinConexion` y `nodo-offline` (ADR-077): las ventas cobradas sin conexión que esperan la factura (`comprobantes_pendientes`). La cola es **otra tabla** a propósito (ADR-079, punto 1: de máquina, con estado por pedido), así que no se pudo reusar su lista, pero sí su pantalla, su estilo (pestañas, tarjetas, descarte con motivo inline) y sus piezas (`BadgeEstado`, `AvisoEstado`, `TarjetaDeFila`, `ConfirmDialog` del producto). `api-client` **ya mostraba** el `detail.mensaje` de un 409 (`detalleDe`, ADR de `detailData`) y `codigoDelError` ya leía el `codigo`: no hizo falta tocarlo, sólo fijarlo con tests (los dos 409 del nodo y el 422 `confirmacion_requerida`). No había etiquetas de reserva en el kit. LibraClub tiene `AvisoDeConflictos` (ADR-022) y los estados en su `Agenda`/`DetalleDeReserva`.

**Decisión.**
1. **`libra-ui/cola-del-nodo`** (sin componentes): los tipos de lo que contesta el motor (`PedidoDeCola`, `ColaDelNodo`, `EstadoDePedido`, `TipoDePedido`), las listas de estados (`ESTADOS_ABIERTOS`, `ESTADOS_DE_REVISION`, `ESTADOS_FINALES`), el tono y la etiqueta de cada uno, los textos, los helpers (`pedidoDeCpeAbierto`, `resultadoDelPedido`…) y dos hooks: **`useColaDelNodo`** (lee `GET /api/nodo/cola` con `estado`, `tipo` y `limite`, la repite cada 30 s, ignora la respuesta de una consulta vieja; un 404/405 o `es_nodo: false` es `disponible: false`, no un error) y **`useAvisoDeEnCola`**.
2. **La bandeja se extiende, no se duplica.** `BandejaDeComprobantes` suma la prop **`cola`** (`true` o `{ruta, puedeResolver, describir, introduccion}`) que agrega la pestaña «Cola de ARCA (n)» —sólo en un nodo con la ruta montada—; sin la prop, ni un pedido más. Un producto sin esa bandeja (LibraCargo, LibraClub no reciben comprobantes de otros sistemas) monta **`BandejaDeLaCola`**, que es el mismo `PanelDeLaCola` con su título (el ícono es el de `ICONOS.comprobantesAFacturar`: no se agrega un concepto al catálogo, que pide una fila en el wiki). Lista por estado (**En cola** / **Resueltos**) y por tipo (Facturas / Cartas de porte, sólo si hay de los dos), lo que pide a una persona primero y después en el orden en que va a salir. Tarjetas (`TarjetaDeFila`) y no tabla: el mensaje de ARCA es largo y las acciones llevan texto.
3. **Las acciones del motor, con sus reglas.** `esperando`: Descartar. `a_revisar`: **muestra el mensaje de ARCA**; Reintentar (directo), Marcar emitido, Descartar. `incierto`: 🔴 **Reintentar pide «¿Confirmás que este comprobante NO salió en ARCA?»** (con la explicación: si salió y se reintenta, queda duplicado) y recién con el sí manda `confirmo_que_no_salio: true`; el motor lo exige igual (422). Marcar emitido pide el dato mínimo del `resultado` (el CTG de una CPE; el número de la factura de un documento, entero). «Emitir ahora» (`POST …/emitir`) en el encabezado, deshabilitado sin conexión. `emitiendo` no tiene acciones. Reintentar, descartar y marcar emitido van detrás de **`puedeResolver`** (el motor los guarda con `resolver_con`). El mensaje de cualquier 409/422 es el `detail.mensaje`.
4. **`AvisoSinCpeValida`** (`libra-ui/AvisosDeLaCola`): 🔴 «Esta carga todavía no tiene CPE válida: no puede viajar hasta que se emita.» Rojo, **`role="alert"`**, con ícono; aparece con la CPE `esperando`, `emitiendo`, `a_revisar` o `incierto` (en los dos últimos suma qué dijo ARCA) y con la emitida, la descartada o sin pedido **no dibuja nada**. El producto le da el `pedido`, el `estado`, o deja que lo busque en la cola del nodo con `origenId` o con **`coincide`** (medido en libracargo: su `origen_id` es `orden41:<uuid>` —único por pedido— y el id de la orden está en `datos.orden_id`, así que el `origenId` pelado no la encuentra). Mientras no sabe (cargando, sin cola, fuera de un nodo) tampoco avisa: no se inventa una alerta.
5. **El 202 `en_cola`.** `api.post` lo devuelve como cualquier 2xx; lo que faltaba era no mostrarlo como un comprobante emitido. `esRespuestaEnCola` reconoce las **dos formas** que hoy contestan los productos (LibraClub: `{en_cola: true, estado, pedido_id, mensaje}`; LibraCargo: `{codigo: "en_cola" | "cpe_en_cola", mensaje, pedido_id, estado, motivo}`), `useAvisoDeEnCola().registrar(respuesta)` devuelve `true` si lo era y guarda el aviso, y **`AvisoEnCola`** dice «Se emite al volver la conexión.»; para una CPE es rojo, `role="alert"` y suma «Hasta que se emita, esta carga no tiene CPE válida: no puede viajar.». El kit no tiene toasts: es un bloque que el producto pone donde estaba el comprobante, con un botón de cierre si pasa `onCerrar`.
6. **Etiquetas de reserva** (`libra-ui/EtiquetasDeReserva`, `libra-ui/reservas-del-nodo`): `EtiquetaReservaSinSubir` (azul, `curso`) para la que se dio en el nodo y todavía no subió (**id negativo**, `esReservaProvisoria`), `EtiquetaReservaEnConflicto` (ámbar, `atencion`, como el aviso de LibraClub) para `estado = "en_conflicto"`, y `EtiquetasDeReservaDelNodo({id, estado})` que pone las que correspondan (ninguna, una o las dos) al lado del chip de estado del producto. 🔴 **La del id negativo no se llama «Provisoria»**: `provisoria` ya es otra cosa en LibraClub (el turno retenido esperando el pago del portal) y el cajero vería dos «Provisoria» con significados opuestos; dice «Sin subir al central».
7. **Qué sube de LibraClub y qué queda.** Sube el **vocabulario y las etiquetas** (arriba). **`AvisoDeConflictos` queda en el producto**: lista las reservas con la que ganó y mueve o cancela, y todo eso es de la API de LibraClub (`/api/reservas-en-conflicto`, canchas, clientes, la política de cancelación); subirlo sería inventar un contrato de props más grande que el componente. Lo único que le conviene del kit es envolver su sección en `AvisoEstado tono="atencion"` y usar `EtiquetaReservaEnConflicto` en cada fila. El mapa de colores de su `Agenda` también es del producto (paleta de dominio, su propio comentario lo explica).
8. **El cartel de un nodo que no vende.** `CartelSinConexion` y `createLayout({ conexionDelNodo: { texto } })` aceptan **`texto`**; `TEXTO_CARTEL_SIN_CONEXION_CON_COLA` es la frase de LibraCargo y LibraClub («…las facturas y las cartas de porte quedan en cola y se emiten solas al volver. Hasta entonces no hay CPE válida para viajar.»). La de siempre habla de cobrar con ticket, que ahí no pasa. Sin la prop, el cartel de siempre.

**Cómo lo usa cada producto** (con el pin a 0.180.0; es el cableado de los PR siguientes, no de éste).
- **LibraCargo.** Layout: `conexionDelNodo: { texto: TEXTO_CARTEL_SIN_CONEXION_CON_COLA }`. En la orden de carga y en el viaje: `<AvisoSinCpeValida coincide={(p) => p.datos.orden_id === orden.id} />`. Al pedir una factura o una CPE: `const { aviso, registrar, cerrar } = useAvisoDeEnCola()`, `const r = await api.post(…)`, `if (registrar(r)) return` y `<AvisoEnCola aviso={aviso} onCerrar={cerrar} />` donde iba el resultado. Una ruta `/cola` con `<BandejaDeLaCola puedeResolver={esAdmin} describir={(p) => …} />` y su entrada de menú con `ICONOS.comprobantesAFacturar`.
- **LibraClub.** Igual con `POST /api/reservas/{id}/facturar` (`registrar` + `AvisoEnCola`; el 409 ya muestra su `mensaje`), la ruta `/cola`, y `<EtiquetasDeReservaDelNodo id={r.id} estado={r.estado} />` junto al chip de estado de la agenda y del detalle.
- **Los demás productos** no cambian: la pestaña es opt-in (`cola`), el cartel y todo lo demás son los de siempre.

**Consecuencias.** MINOR: cinco módulos nuevos (`cola-del-nodo`, `BandejaDeLaCola`, `AvisosDeLaCola`, `EtiquetasDeReserva`, `reservas-del-nodo`), una prop opcional en `BandejaDeComprobantes` (`cola`), otra en `CartelSinConexion` y en `conexionDelNodo` (`texto`) y una constante en `nodo-offline`. Ningún cambio en `api-client`. Sin la prop `cola` la bandeja no pide nada de la cola (hay un test). Los componentes importan `@/components/confirm-dialog` del producto, como `Usuarios` y las demás pantallas (LibraCargo y LibraClub lo tienen).

**Tests.** `test/BandejaDeLaCola.test.tsx` (31): lo que muestra (tipo, estado, fecha, el mensaje de ARCA de un `a_revisar`, el orden, resueltos con el CTG, el filtro por tipo, fuera de un nodo, corte de red, sin conexión), las acciones de cada estado, **el `incierto` no se reintenta sin confirmar** (cancelar no manda nada, confirmar manda `confirmo_que_no_salio: true`), marcar emitido por tipo, «Emitir ahora», los 409/422 con su `mensaje` y la pestaña de `BandejaDeComprobantes`. `test/AvisosDeLaCola.test.tsx` (23): el aviso «sin CPE válida» en cada estado y con `role="alert"`, ausente con la CPE emitida, la búsqueda por `origenId` y por `coincide`, `AvisoEnCola` en las dos formas del 202. `test/cola-del-nodo.test.tsx` (20): el 202 sin lanzar y reconocido en las dos formas, el comprobante emitido que no lo es, los 409 `solo_en_el_central` y `sin_conexion` con `api.post` real, el hook (filtros, 404, corte de red, intervalo, respuesta vieja). `test/EtiquetasDeReserva.test.tsx` (10) y uno en `test/nodo-offline.test.tsx` (el `texto` del cartel). **Se pusieron en rojo sin el arreglo**: reintentar el `incierto` sin confirmar (3 tests), el aviso con `role="status"` (9), el 202 no reconocido (3), `detalleDe` sin `mensaje` (5), el id negativo no provisorio (5), sin la pestaña de cola (2) y el cartel sin `texto` (1).

**Lo que no cubre / abierto.**
- (a) **Las dos formas del 202 son una discrepancia entre productos**: LibraClub manda `en_cola: true` y LibraCargo `codigo`. El kit reconoce las dos; unificarlas (que LibraCargo sume `en_cola: true`) es del producto.
- (b) **Marcar emitido** pide sólo el CTG (CPE) o el número de factura (documento), que es lo que el motor valida. Un producto cuyo `resultado` necesite más (LibraCargo lee `carta_porte_id` al emitir con conexión) tendrá que completar el registro por su lado o pedir una prop.
- (c) **Corregir los `datos` de un `a_revisar` antes de reintentar** (`reintentar` acepta `datos`) no está en la pantalla: el formulario de cada pedido es del producto.
- (d) **La web (el central)** ve la copia de los pedidos (`aplicar_pedido_del_nodo`) por otra ruta: el panel acepta `ruta`, pero la copia del central no tiene las acciones; no se probó contra ella.
- (e) La barra de estado del pie (ADR-083) no cuenta los pedidos de la cola; hoy muestra `a_facturar`. Si se quiere un «N en cola» ahí, es un campo más de `GET /api/estado-del-sistema`.
- (f) Verificado en jsdom con los stubs del kit; **no se miró en un navegador** (el ancho en celular de las tarjetas, el contraste del rojo de `AvisoEstado` sobre el fondo de la orden). `BadgeEstado`/`AvisoEstado` ya tienen medido su contraste.
- (g) El kit no tiene `CHANGELOG`: la convención es esta (ADR + fila del README + versión en `package.json` y lock). El `CHANGELOG` de cada producto lo escribe su PR de pin.
- (h) `useColaDelNodo` suma un aviso más de `react/set-state-in-effect` al lint (57 contra 56), de la misma familia que los de `Logs`, `SucursalSinInternet` y `arca`: lanza `recargar()` desde el efecto, como `BandejaDeComprobantes` con `load()`.

## ADR-095 — El turno atendido sin conexión y el alta «provisoria» en pantalla: etiquetas, lista «Turnos a revisar» y una regla común de id provisorio (0.181.0)

**Estado:** propuesta (2026-10-25). Es el PR 11 del plan «LibraEdge en GestioLibra, MedLibra y LibraDesk» (`wiki/analyses/libraedge-gestiolibra-medlibra-libradesk-2026-10-24.md`). **Sólo el kit**: el cableado en GestioLibra y MedLibra (PRs 9 y 10) es de ellos.

**Contexto.** Decisiones del humano (2026-10-25, «ok a todo»): un local sin internet **también atiende**; un turno atendido sin conexión que en la web se cancelaron o movieron mientras tanto **cuenta igual** (la atención y el cobro valen) y **queda «a revisar»**; el paciente o cliente que se da de alta sin conexión tiene un **número provisorio con cartel**, y recibe el definitivo al volver la conexión. Libragenda v0.15.0 (ADR-019) ya hace su parte: `turno.atendido`, la atención anotada con un motivo (`movido`, `cancelado`, `ya_atendido`, `transicion_invalida`, `turno_inexistente`), `turnos_a_revisar` y `marcar_revisada`; y dice que la pantalla es de otro PR. Faltaba todo lo que se ve.

**Qué ya existe** (se miró antes). ADR-094 dejó el molde: `EtiquetasDeReserva` (`BadgeEstado` con ícono chico y la ayuda en el `title`; azul `curso` para lo que está en camino, ámbar `atencion` para lo que pide a alguien), `reservas-del-nodo.ts` (la regla del id negativo y los textos) y `PanelDeLaCola` (lista de `TarjetaDeFila`, introducción, error con `role="alert"`). Se reusa todo eso; no se agrega ningún concepto al catálogo de íconos de pantalla. `esReservaProvisoria` ya era la regla «id entero negativo, número o texto»: no era de las reservas, era de cualquier alta del nodo. Libragenda sólo devuelve las filas (`AtencionAplicada`); la ruta que las expone es del producto, así que el kit no pide nada.

**Decisión.**
1. **Una regla de id provisorio.** `libra-ui/ids-provisorios` define `esIdProvisorio(id)` (entero negativo, `-3` o `"-3"`; `0`, vacío, `p-042`, un uuid y `-1.5` no lo son) y `esReservaProvisoria` pasa a ser **la misma función** (un test fija que no son dos copias). La pastilla común de las etiquetas del nodo (`EtiquetaDelNodo`: tono, ícono, texto, ayuda y `data-slot`) también se extrajo, y las dos etiquetas de reserva la usan sin cambiar su `data-slot`, su tono ni su texto. `EtiquetaDelNodo` es interna: lo que un producto importa son las etiquetas (el guard de `exports` la declara interna).
2. **Etiquetas del turno** (`libra-ui/EtiquetasDeTurno`). `EtiquetaAtendidoSinConexion` (azul, «Atendido sin conexión»: la atención está en la PC y todavía no subió) y `EtiquetaTurnoARevisar` (ámbar, «A revisar»: subió, pero en la web el turno cambió; con `motivo`, el `title` dice qué pasó). `EtiquetasDeTurnoDelNodo({atendidoSinConexion, aRevisar, motivo})` pone la que corresponda: ninguna, una, y **nunca las dos** (lo que ya subió y quedó a revisar no está pendiente de subir; si el producto manda las dos banderas, sale «A revisar»). Va al lado de la etiqueta de estado de la agenda. A diferencia de las reservas, que pueden estar sin subir y en conflicto a la vez porque el id y el estado son dos datos distintos, acá las dos etiquetas son dos momentos de la misma atención.
3. **«Provisorio»** (`libra-ui/EtiquetaProvisorio`). `EtiquetaProvisorio({persona})` (azul, ícono de persona con «+») y `EtiquetaDePersonaDelNodo({id, persona})`, que la dibuja sólo si `esIdProvisorio(id)` (un `id` que falta no es provisorio). La ayuda dice a quién le toca («Este paciente / Este cliente…»), que recibe el número definitivo cuando vuelva la conexión y que **si ya estaba cargado en la web se une a su ficha**. 🔴 **A la persona sí se la llama «Provisorio»; a la reserva no** (ADR-094: ahí «provisoria» ya es el turno retenido esperando el pago, y el cajero vería dos con significados opuestos). Un paciente o un cliente no tiene ese otro sentido.
4. **`TurnosARevisar`** (`libra-ui/TurnosARevisar`), un panel como `PanelDeLaCola` y no una pantalla: el título de pantalla lleva el ícono de su entrada del menú (ADR-035) y de dónde se llega —una pestaña de la agenda, un aviso en el inicio— lo decide el producto. Recibe `atenciones` (las filas de `turnos_a_revisar`, con los nombres de `AtencionAplicada`), `describirTurno`, `onMarcarRevisado`, `cargando`, `error`, `titulo` e `introduccion`. **Agrupa por turno** (`agruparPorTurno`): un turno que el nodo marcó en curso y después atendido trae dos filas y es **una** tarjeta, con sus atenciones de la más vieja a la más nueva y los motivos sin repetir; ordena por instante y no por texto (hay horas con `-03:00` y con `Z`). Cada tarjeta dice **qué pasó** (el motivo en lenguaje simple y qué hacer), **qué se hizo en esta PC** (estado, fecha y hora, quién) y **cómo figura en la web**. No muestra las ya revisadas ni las que no son `a_revisar`. «Ya lo revisé» (sólo si el producto pasa `onMarcarRevisado`) le entrega el turno entero para que marque cada atención con `marcar_revisada`; apaga los botones mientras corre, y si falla dice por qué con el `detail` de la API y el turno sigue ahí. **No cambia el turno ni la atención**: acomodarlo se hace en la agenda, a mano, como dice libragenda.
5. **Los textos.** «Esta PC», «la web», «cuando vuelva la conexión»; ni «nodo», ni «central», ni «outbox» (hay un test que lo mide sobre todo lo que se ve). Los motivos de libragenda se traducen en `turnos-del-nodo.ts` (`MOTIVOS`): *se movió en la web*, *se canceló en la web*, *ya figuraba como atendido* (con el aviso de que puede haberse cobrado dos veces), *no coincide con la web*, *el turno ya no existe en la web*. Un motivo que el kit no conoce (una versión nueva de libragenda) sale con un texto general, no crudo. El `detalle` técnico que libragenda guarda para el soporte **no se muestra**. Los estados del turno se leen «En curso», «Atendido», «No vino», «Cancelado».
6. **Accesibilidad y modo oscuro.** La sección es una región con nombre (`aria-labelledby` o, sin título, `aria-label`), la lista tiene nombre, el error es `role="alert"` y «Cargando…» es `role="status"`; los íconos son `aria-hidden` y lo que se lee es el texto. Los tonos son los de `BadgeEstado` (la pastilla ya tiene medido su contraste en claro y en oscuro); no se agregó ningún color.

**Cómo lo usa cada producto** (con el pin a 0.181.0; es el cableado de los PRs 9 y 10, no de éste).
- **GestioLibra y MedLibra, en la agenda:** `<EtiquetasDeTurnoDelNodo atendidoSinConexion={turno.atendido_en_la_pc} aRevisar={turno.a_revisar} motivo={turno.motivo} />` al lado del chip de estado. «Atendido en la PC» es que el turno tiene una atención propia del nodo que todavía no subió (`atenciones_del_nodo`); «a revisar», que está en `turnos_a_revisar` (la tabla baja al nodo como cualquier otra del espejo).
- **Una ruta o pestaña «Turnos a revisar»:** el producto expone `turnos_a_revisar` (y `marcar_revisada` para el rol que corresponda) y monta `<TurnosARevisar atenciones={filas} describirTurno={(t) => …nombre del paciente o cliente y servicio, leyendo su agenda con t.turnoId…} onMarcarRevisado={(t) => api.post(…, {atenciones: t.atenciones.map((a) => a.atencion_id)}).then(recargar)} />`. En la PC del local se puede montar sin `onMarcarRevisado`: la lista se ve en las dos puntas, la revisión es de la web.
- **Pacientes y clientes:** `<EtiquetaDePersonaDelNodo id={paciente.id} persona="paciente" />` junto al nombre, en la lista y en la ficha. Una ficha nueva sin conexión tiene `id` `-N` (LibraEdge ≥ v0.23.0, ids provisorios de texto).
- **Los demás productos** no cambian: son componentes nuevos y ninguno se monta solo.

**Consecuencias.** MINOR: seis módulos públicos nuevos (`EtiquetasDeTurno`, `EtiquetaProvisorio`, `TurnosARevisar`, `turnos-del-nodo`, `ids-provisorios`) y uno interno (`EtiquetaDelNodo`). `esReservaProvisoria` y las dos etiquetas de reserva se comportan igual (sus tests no se tocaron). Ningún cambio en `api-client` ni en las props de nada existente.

**Tests.** `test/turnos-del-nodo.test.tsx` (14): un texto simple para cada motivo de libragenda y sin jerga, el motivo desconocido, los estados, qué espera revisión y el agrupado (dos atenciones = un turno, motivos sin repetir, orden por instante, ya revisadas y aplicadas afuera, fecha ilegible). `test/ids-provisorios.test.ts` (6): la regla y que la reserva usa la misma función. `test/EtiquetasDeTurno.test.tsx` (13): las tres etiquetas, «nunca las dos», íconos decorativos, sin jerga, y que las de reserva siguen iguales. `test/TurnosARevisar.test.tsx` (17): lo que muestra, los estados de la lista, «Ya lo revisé» (entrega el turno entero, error con `detail`, botones apagados mientras corre). Se comprobó que **se ponen rojos sin el arreglo**: agrupar por atención en vez de por turno rompe 10 tests. El guard de `exports` obligó a declarar `EtiquetaDelNodo` como interna.

**Lo que no cubre / abierto.**
- (a) **El contrato de la fila.** El kit espera los nombres de `AtencionAplicada` de libragenda (`appointment_id`, `atencion_id`, `estado`, `at`, `actor`, `motivo`, `estado_despues`, `resultado`, `revisada_at`). Libragenda no define todavía una ruta ni un JSON: si GestioLibra o MedLibra serializan con otros nombres, lo adaptan en el producto antes de pasarlo.
- (b) **«Atendido sin conexión» lo decide el producto** (si el turno tiene una atención propia del nodo que no subió). El kit no puede saberlo desde el turno que baja del espejo.
- (c) **Sin nota de revisión.** `marcar_revisada` acepta una nota y un autor; la pantalla sólo ofrece «Ya lo revisé». Si se quiere una nota, es una prop más.
- (d) **La lista no filtra ni pagina.** Alcanza para los pocos turnos que quedan a revisar; si hubiera cientos, hay que filtrar por fecha desde la ruta del producto.
- (e) Verificado en jsdom con los stubs del kit; **no se miró en un navegador** (el ancho en celular de las tarjetas, el aspecto de las etiquetas en modo oscuro).
- (f) El kit no tiene `CHANGELOG` (ADR-094, g): la convención es ADR + fila del README + versión en `package.json` y lock. El `CHANGELOG` de cada producto lo escribe su PR de pin.

## ADR-096 — LibraInmo entra a la familia: identidad lima, marca de casa y llave, y fondo de login (0.182.0)

**Estado:** propuesta (2026-10-27).

**Contexto.** LibraInmo es el producto nuevo para inmobiliarias que administran alquileres (repo `librainmo`, piloto NA Propiedades). Ya tiene dev y demo; le faltaban el color, la marca y el fondo del login que tienen los ocho. El humano eligió el color y aprobó el dibujo sobre una muestra (casa y llave en fucsia, lima y celeste, al lado de las marcas de la familia y con el login de fondo), y pasó la foto del hero (libre o con licencia, según el humano).

**Qué ya existe** (se miró antes). La identidad es una tabla en tres lugares (`src/identidad.ts`, `libra_web_kit/identidad.py` y la página `identidad-de-producto-diseno` del wiki, ADR-033) que un test compara. La marca se dibuja plana en `marcas.ts` y toma volumen con `volumenComun` (ADR-034 y ADR-090). El fondo del login sale de `FONDOS_DE_LOGIN` (ADR-092). No hace falta nada nuevo: es una fila más en cada registro.

**Decisión.**
1. **Identidad:** `librainmo`, «Inmobiliarias que administran alquileres», lima `#65a30d` (oscuro `#4d7c0f`, claro `#f7fee7`, sobre oscuro `#a3e635`) e ícono de lucide `House`. El lima es el único tono libre que no se confunde con los ocho ni con los complementos. No llega a 4,5:1 contra blanco (3,0:1), así que `colorAccion` es el oscuro, como en RestoLibra, MedLibra y VentaLibra.
2. **Marca:** las dos piezas de la familia. La casa blanca (puerta en `tinta`, ventanas y ojo de buey en `claro`) y la llave amarilla, que la pisa abajo a la derecha con su sombra corta. El favicon es la casa sola con la puerta y un círculo amarillo, porque a 16 px la llave se empasta. Tonos: tinta `#1a2e05`, claro `#d9f99d`.
3. **Fondo del login:** la foto, de 1600 × 900 y 180 KB, encuadrada al `60% center`, con el velo de la familia teñido del lima (`brillo` al 25 % y el vertical en `rgba(16,26,4,…)`). La landing, cuando se haga, copia estas capas: es el sentido inverso del de los ocho, porque acá el login existió primero.

**Para los productos.** LibraInmo sube el pin, llama a `aplicarIdentidad('librainmo')` y pasa `producto="librainmo"` a `Layout` y `Login`. Los ocho no cambian. `libra-web-kit` suma la fila cuando se haga la landing.

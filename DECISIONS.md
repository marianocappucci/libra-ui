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

**Ventas, en el mismo release.** `estado` es el `status_detail` del motor: además de `cobrada`, `parcial`, `pendiente` y `anulada` llegan `devuelta`, `devuelta_parcial` y `borrador_descartado` (las ventas migradas que eran borradores, ADR de VentaLibra 0003), que el kit mostraba con su nombre técnico. Ahora «Devuelta», «Dev. parcial» y «Descartada» (tono neutro; `devuelta*` en atención), un estado desconocido sin guiones bajos, y en la tabla la pastilla topa en el ancho de la columna con el nombre técnico en el `title`.

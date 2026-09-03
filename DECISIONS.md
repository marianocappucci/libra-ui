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

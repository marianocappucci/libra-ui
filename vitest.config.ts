/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { fileURLToPath } from 'node:url'

// Los componentes de este paquete importan `@/components/ui/*` (shadcn) y
// `@/lib/utils`, que NO viven aca: los provee cada producto consumidor.
// Es a proposito -- asi cada uno mantiene su propio tema de shadcn.
//
// Para poder testear el paquete solo, el alias `@` apunta a stubs
// minimos en test/stubs/. No se pierde nada: lo que se prueba es la
// logica de ESTE paquete (que el ojito cambie el type, que el login
// muestre el error de la API, que la tabla ordene), no el render interno
// de shadcn, que es dependencia de terceros y ya tiene sus propios tests.
// `Icons` resuelve los `~icons/…` de `iconos-accion.tsx`. Es el mismo plugin y
// la misma configuracion que tiene que poner cada producto consumidor en su
// `vite.config.ts`: si aca faltara, la suite de este paquete no podria ni
// importar el modulo.
export default defineConfig({
  plugins: [react(), Icons({ compiler: 'jsx', jsx: 'react' })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./test/stubs', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/**'],
      reporter: ['text-summary', 'json-summary'],
      // Aca la suite SI es a fondo, no de humo. `lines` queda bajo porque
      // `include` abarca todo src/ y hay modulos sin tests todavia (Layout y
      // Usuarios); functions y branches, en cambio, miden lo que si esta
      // cubierto -- que bajen es una senal real, no ruido.
      //
      // Subio de 43 a 63 el 2026-07-31 al sumarse los tests de data-table
      // (65.35% medido). **Ojo con leer ese salto como "subio la
      // cobertura"**: cubrir un archivo que ningun test importaba tambien
      // mete sus funciones y ramas en el DENOMINADOR por primera vez -- v8
      // no las conoce hasta que el modulo se carga. En el primer intento,
      // con solo los tests de la busqueda nueva, `lines` subio a 59.97% y al
      // mismo tiempo functions CAYO de 100% a 89.79% y branches de 97.34% a
      // 81.31%, rompiendo estos mismos pisos. No habia ninguna regresion:
      // era el resto de data-table apareciendo. Se cubrio tambien ese resto
      // (sorting, onRowClick, colgroup, meta) y quedo en 98% y 92.27%.
      //
      // Subio de 63 a 67 el 2026-08-01 con SelectBuscable (68.52% medido).
      thresholds: { lines: 67, functions: 95, branches: 90 },
    },
  },
})

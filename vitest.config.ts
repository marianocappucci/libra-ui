/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
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
export default defineConfig({
  plugins: [react()],
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
      // `include` abarca todo src/ y hay modulos sin tests todavia
      // (data-table, Layout, Usuarios); functions y branches, en cambio,
      // miden lo que si esta cubierto y hoy dan 100% y 97.34% -- que bajen
      // es una senal real, no ruido. Medido el 2026-07-31.
      thresholds: { lines: 43, functions: 95, branches: 90 },
    },
  },
})

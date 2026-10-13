// Guard (0.145.0, ADR-057): los botones de la columna de acciones de TODA tabla del kit miden 44 px bajo 1024 px. La clase (`TACTIL_BAJO_LG`) va en el contenedor
// de los botones de la celda; una tabla nueva que declare su `id: 'actions'` sin ella pasaba sin que nada lo notara.
// Cuenta, por archivo, las columnas de acciones y los usos de la constante: tiene que haber al menos uno por columna.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '..', 'src')

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const ruta = join(dir, f)
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.tsx$/.test(f) ? [ruta] : []
  })
}

/** Los archivos con columnas de acciones y qué les falta: `[archivo, columnas, usos]` donde los usos son menos que las columnas. */
function tablasSinBotonesTactiles(fuentes: Record<string, string>): [string, number, number][] {
  return Object.entries(fuentes).flatMap(([nombre, texto]) => {
    const columnas = (texto.match(/^\s*id: 'actions',/gm) ?? []).length   // la definición de la columna, no una mención en un comentario
    const usos = (texto.match(/\$\{TACTIL_BAJO_LG\}/g) ?? []).length
    return columnas > 0 && usos < columnas ? [[nombre, columnas, usos] as [string, number, number]] : []
  })
}

describe('los botones de acción de las tablas son táctiles bajo `lg`', () => {
  const fuentes = Object.fromEntries(archivos(SRC).map((a) => [relative(SRC, a), readFileSync(a, 'utf8')]))

  it('cada columna `id: \'actions\'` tiene su contenedor con TACTIL_BAJO_LG', () => {
    expect(tablasSinBotonesTactiles(fuentes)).toEqual([])
  })

  it('el control: el guard ve que falta, y no confunde la constante sola (sin usarla en un className) con un uso', () => {
    const sin = "  {\n    id: 'actions',\n    cell: () => <div className=\"flex justify-end gap-1\" />,\n  },\n"
    const con = "  {\n    id: 'actions',\n    cell: () => <div className={`flex justify-end gap-1 ${TACTIL_BAJO_LG}`} />,\n  },\n"
    expect(tablasSinBotonesTactiles({ 'a.tsx': sin })).toEqual([['a.tsx', 1, 0]])
    expect(tablasSinBotonesTactiles({ 'a.tsx': con })).toEqual([])
    expect(tablasSinBotonesTactiles({ 'a.tsx': "import { TACTIL_BAJO_LG } from './use-ancho'\n" + sin })).toEqual([['a.tsx', 1, 0]])
    // Dos columnas, un solo uso: falta una.
    expect(tablasSinBotonesTactiles({ 'a.tsx': con + sin })).toEqual([['a.tsx', 1 + 1, 1]])
  })

  it('hay columnas de acciones que mirar (si el patrón dejara de encontrar alguna, el guard de arriba pasaría en vacío)', () => {
    const total = Object.values(fuentes).reduce((n, t) => n + (t.match(/^\s*id: 'actions',/gm) ?? []).length, 0)
    expect(total).toBeGreaterThanOrEqual(19)
  })
})

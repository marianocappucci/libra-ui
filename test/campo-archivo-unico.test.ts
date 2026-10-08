// Guard: todo campo de archivo de la suite es `CampoArchivo` (ADR-037).
//
// 🔴 La regla que busca es la propiedad final —«no hay un `<input type="file">` en `src/`
// fuera del componente»—, no el nombre de la pantalla que lo tenía: la próxima que suba un
// archivo va a ser otra. Un campo nativo vuelve a dibujar el botón y el texto del
// navegador, en su idioma, distinto en cada uno, y la suite deja de tener un solo aspecto
// para subir un archivo.
//
// Lee el FUENTE en vez de renderizar, por lo mismo que `sin-hoy-en-utc`: son decenas de
// pantallas, muchas detrás de una sesión. Cubre las formas en que se escribe: el atributo
// `type="file"` / `type='file'` / `type={'file'}` y la propiedad `type: 'file'` de un
// `createElement`/props.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { cwd } from 'node:process'

import { describe, expect, it } from 'vitest'

const RAIZ = cwd()
/** El paquete tiene ~100 módulos; si el barrido ve menos de 40, algo no anduvo. */
const MINIMO_DE_ARCHIVOS = 40
/** La única excepción, por ruta exacta: el componente que envuelve al `<input>` nativo. */
const EXENTAS = ['src/CampoArchivo.tsx']

const CAMPO_NATIVO = /\btype\s*(?:=\s*\{?\s*|:\s*)(['"`])file\1/

export function camposNativosEn(texto: string): number[] {
  const lineas: number[] = []
  texto.split('\n').forEach((linea, i) => {
    // Un comentario que EXPLICA el patrón no es un uso.
    if (/^\s*(?:\/\/|\/\*|\*)/.test(linea)) return
    if (CAMPO_NATIVO.test(linea)) lineas.push(i + 1)
  })
  return lineas
}

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return fuentes(ruta)
    return /\.tsx?$/.test(nombre) ? [ruta] : []
  })
}

describe('un solo campo de archivo en la suite', () => {
  const archivos = fuentes(join(RAIZ, 'src'))

  it('el barrido vio los fuentes', () => {
    expect(archivos.length).toBeGreaterThanOrEqual(MINIMO_DE_ARCHIVOS)
  })

  it('🔴 ningún `type="file"` en src/ fuera de CampoArchivo.tsx', () => {
    const fugas = archivos
      .map((a) => relative(RAIZ, a))
      .filter((r) => !EXENTAS.includes(r))
      .flatMap((r) => camposNativosEn(readFileSync(join(RAIZ, r), 'utf8')).map((n) => `${r}:${n}`))
    expect(fugas).toEqual([])
  })

  it('el control — el componente sí lo usa (si no, el guard no estaría midiendo nada)', () => {
    expect(camposNativosEn(readFileSync(join(RAIZ, 'src/CampoArchivo.tsx'), 'utf8')).length).toBe(1)
  })

  it.each([
    '<input type="file" />',
    "<Input type='file' accept='.zip' />",
    '<input type={"file"} />',
    "React.createElement('input', { type: 'file' })",
    '<input\n  type="file"',
  ])('reconoce %j', (texto) => {
    expect(camposNativosEn(texto).length).toBeGreaterThan(0)
  })

  it.each([
    '<input type="text" />',
    '// el <input type="file"> nativo',
    ' * un `type="file"` en un comentario',
    '<input type="filename" />',
    'const tipo = "file"',
  ])('no marca %j', (texto) => {
    expect(camposNativosEn(texto)).toEqual([])
  })
})

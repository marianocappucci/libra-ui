// El mapa `exports` de package.json es lo unico que separa a este paquete de
// sus seis consumidores, y **nada de lo que corre aca lo toca**: los tests
// importan por ruta relativa (`../src/Login`) y el typecheck compila el
// fuente. Un mapa roto sale en verde de este repo y explota en el `tsc -b` del
// producto, con un "Cannot find module 'libra-ui/AuthContext'" que no dice que
// el problema esta del otro lado.
//
// Paso exactamente eso el 2026-08-16 publicando v0.23.0: una edicion automatica
// del package.json se comio la linea de `./AuthContext` mientras agregaba
// `./branding`. Los 290 tests y el typecheck siguieron verdes; lo encontro el
// build de LibraDesk.
import { readdirSync, existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = resolve(__dirname, '..')
const exports = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf8')).exports as Record<string, string>

// Modulos internos: los usa el propio paquete y no tienen por que ser
// importables desde un producto. Si alguno pasa a ser publico, se saca de aca
// y se agrega a `exports` — que es justo la decision que este guard obliga a
// tomar a mano en vez de dejarla al olvido.
const INTERNOS = new Set<string>([])

describe('el mapa de exports de package.json', () => {
  it('🔴 cada destino existe en disco', () => {
    const rotos = Object.entries(exports)
      .filter(([, destino]) => !existsSync(resolve(raiz, destino)))
      .map(([clave, destino]) => `${clave} -> ${destino}`)
    expect(rotos).toEqual([])
  })

  it('🔴 cada modulo de src/ esta exportado', () => {
    const modulos = readdirSync(resolve(raiz, 'src')).filter((f) => /\.tsx?$/.test(f))
    const exportados = new Set(Object.values(exports).map((d) => d.replace('./src/', '')))
    const huerfanos = modulos.filter((m) => !exportados.has(m) && !INTERNOS.has(m))
    expect(huerfanos).toEqual([])
  })

  it('el control — el guard sabe distinguir un destino que no existe', () => {
    // Sin esto, los dos casos de arriba pasarian igual si `existsSync` mintiera
    // o si la ruta base estuviera mal armada: una lista vacia comparada contra
    // una lista vacia siempre da verde.
    expect(existsSync(resolve(raiz, './src/no-existe-este-modulo.ts'))).toBe(false)
    expect(existsSync(resolve(raiz, './src/branding.ts'))).toBe(true)
  })
})

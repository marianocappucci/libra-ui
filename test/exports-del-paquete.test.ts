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
// Un export es una ruta o, desde `./e2e` (v0.142.0, publicado compilado), un objeto de condiciones
// (`{ types, default }`): se aplana a pares clave -> destino para que los dos guards miren cada archivo.
type Destino = string | Record<string, string>
const mapa = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf8')).exports as Record<string, Destino>
const exports: [string, string][] = Object.entries(mapa).flatMap(([clave, destino]) =>
  typeof destino === 'string'
    ? [[clave, destino] as [string, string]]
    : Object.entries(destino).map(([condicion, ruta]) => [`${clave} (${condicion})`, ruta] as [string, string]),
)

// Modulos internos: los usa el propio paquete y no tienen por que ser
// importables desde un producto. Si alguno pasa a ser publico, se saca de aca
// y se agrega a `exports` — que es justo la decision que este guard obliga a
// tomar a mano en vez de dejarla al olvido.
//
// `CaptchaAltcha.tsx` es el widget ALTCHA (~34 kB) y se carga perezoso:
// exportarlo invitaría a importarlo directo y meter el widget en el bundle
// principal. Lo que se importa es `CampoCaptcha`, que lo trae con `lazy()`.
//
// 📌 Hasta v0.69.2 `captcha.ts` y `CampoCaptcha.tsx` también eran internos: un
// producto prendía el captcha con `captchaPath` en `createLogin` y nada más.
// Se exportan desde v0.69.3 porque el portal de jugadores de LibraClub tiene
// un formulario propio —no es `createLogin`— y su backend también exige el
// captcha. La razón de arriba sigue en pie: el widget sigue siendo perezoso.
//
// `fondo-de-login.ts` (ADR-092) sólo lo usa `createLogin`: el producto elige el
// fondo con `producto` o `fondo`, no importando el mapa. `imagenes.d.ts` son
// tipos para el typecheck del kit, no un módulo.
//
// `EtiquetaDelNodo.tsx` (ADR-095) es la pastilla común de las etiquetas de reserva, de turno y de «Provisorio»: lo que un producto
// importa son las etiquetas, no la pastilla.
const INTERNOS = new Set<string>(['CaptchaAltcha.tsx', 'fondo-de-login.ts', 'imagenes.d.ts', 'EtiquetaDelNodo.tsx'])

describe('el mapa de exports de package.json', () => {
  it('🔴 cada destino existe en disco', () => {
    const rotos = exports
      .filter(([, destino]) => !existsSync(resolve(raiz, destino)))
      .map(([clave, destino]) => `${clave} -> ${destino}`)
    expect(rotos).toEqual([])
  })

  it('🔴 cada modulo de src/ esta exportado', () => {
    const modulos = readdirSync(resolve(raiz, 'src')).filter((f) => /\.tsx?$/.test(f))
    const exportados = new Set(exports.map(([, d]) => d.replace('./src/', '')))
    const huerfanos = modulos.filter((m) => !exportados.has(m) && !INTERNOS.has(m))
    expect(huerfanos).toEqual([])
  })

  // Los dos casos de arriba miran sólo `src/` (la raíz): las primitivas de `src/ui/` no los alcanzaban, y una primitiva sin su línea en `exports` (`radio-group` y
  // `textarea` entraron en 0.162.0, ADR-076) sale en verde de este repo y explota en el producto que hace `export * from 'libra-ui/ui/<x>'`.
  it('🔴 cada primitiva de src/ui/ esta exportada como libra-ui/ui/<nombre>', () => {
    const primitivas = readdirSync(resolve(raiz, 'src', 'ui')).filter((f) => /\.tsx?$/.test(f))
    expect(primitivas.length).toBeGreaterThan(15)
    const faltan = primitivas.filter((f) => mapa[`./ui/${f.replace(/\.tsx?$/, '')}`] !== `./src/ui/${f}`)
    expect(faltan).toEqual([])
  })

  it('el control — el guard sabe distinguir un destino que no existe', () => {
    // Sin esto, los dos casos de arriba pasarian igual si `existsSync` mintiera
    // o si la ruta base estuviera mal armada: una lista vacia comparada contra
    // una lista vacia siempre da verde.
    expect(existsSync(resolve(raiz, './src/no-existe-este-modulo.ts'))).toBe(false)
    expect(existsSync(resolve(raiz, './src/branding.ts'))).toBe(true)
  })
})

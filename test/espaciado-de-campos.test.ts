// El espaciado entre el label y su control, en un solo valor.
//
// **Este test lee el FUENTE, no el DOM**, y es a propósito. Lo que hay que
// impedir no es que una pantalla se rompa —ninguna se rompe con 6 px en vez de
// 8— sino que las pantallas **vuelvan a divergir**. Eso no se ve en ningún
// render: se ve comparando archivos, y sólo si alguien se acuerda de comparar.
//
// De dónde salió: el humano reportó (2026-08-14) que en los formularios "los
// labels y los cuadros de inputs casi se solapan", y que el del **login** era el
// correcto. Medido en el navegador: el login usa `gap-2` (8 px) y el resto de
// las pantallas de este paquete usaban `gap-1.5` (6 px). O sea que el paquete se
// contradecía a sí mismo, y los seis productos heredaban las dos formas.
//
// Se convergió al 8 px del login — la regla de siempre: se normaliza hacia la
// convención que alguien ya cumple, no hacia una nueva.
//
// ⚠️ **No se puede resolver con una regla CSS global.** Un `margin-bottom` sobre
// `[data-slot="label"]` tocaría también al login, que ya está en 8 px y pasaría
// a 10. El único lugar donde vive el espaciado es la clase del contenedor.
//
// 🔴 **Los fuentes se leen con `fs`, como DATOS, y no con `import.meta.glob`.**
// La primera versión usaba el glob y ensuciaba la cobertura: al importar cada
// archivo —aunque fuera `?raw`— entraban al grafo de módulos, y `Usuarios.tsx`
// pasó de **0 % a 100 %** sin un solo test nuevo. Un guard que falsea el informe
// de cobertura hace más daño del que evita: esconde los huecos reales.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Desde el root del proyecto, que es donde vitest corre. **No** desde
// `import.meta.url`: en este setup no es una URL `file:` y `fileURLToPath`
// revienta con "The URL must be of scheme file" — el archivo entero queda sin
// correr, que se lee como "1 failed suite" y no como "el guard no midió nada".
const SRC = join(process.cwd(), 'src')

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? fuentes(p) : (/\.tsx?$/.test(n) ? [p] : [])
  })
}

const ARCHIVOS = fuentes(SRC)

describe('el espaciado de los campos no vuelve a divergir', () => {
  it('encuentra los fuentes', () => {
    // Sin esto, una ruta mal armada haría pasar al test de abajo con cero
    // archivos leídos — verde por no haber mirado nada.
    expect(ARCHIVOS.length).toBeGreaterThan(10)
  })

  it('🔴 ningún contenedor de campo usa `gap-1.5`', () => {
    const culpables: string[] = []
    for (const p of ARCHIVOS) {
      readFileSync(p, 'utf8').split('\n').forEach((linea, i) => {
        if (linea.includes('grid gap-1.5')) {
          culpables.push(`${p.slice(SRC.length + 1)}:${i + 1}`)
        }
      })
    }
    // El mensaje va en el `expect` y no en un comentario: cuando esto se ponga
    // rojo, lo que se lee es esta línea, no el archivo.
    expect(culpables, 'los campos van con `grid gap-2` (8 px, el del login): '
      + '`gap-1.5` deja el label pegado al input').toEqual([])
  })

  it('el login sigue en 8 px, que es la referencia', () => {
    // Si alguien "normaliza" para el otro lado —bajando el login a 6— este test
    // lo dice. La referencia no es un número inventado: es la pantalla que el
    // humano miró y aprobó.
    expect(readFileSync(join(SRC, 'Login.tsx'), 'utf8')).toContain('grid gap-2')
  })
})

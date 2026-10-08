// Guard: una pantalla no agrega relleno propio arriba de lo que ya le da el Layout (ADR-040).
//
// 🔴 La regla que busca es la propiedad final —«el elemento raíz de una pantalla no lleva p-N, py-N, pt-N, mt-N ni my-N»—, no el `p-6` que
// encontró el relevamiento: la próxima pantalla va a copiar el `<div className="p-6">` de la de al lado, y el título vuelve a quedar más
// abajo que el nombre de la app (pedido del humano, 2026-10-08, con la captura del Dashboard de LibraCargo).
//
// Lee el FUENTE en vez de renderizar, por lo mismo que `indicadores-por-catalogo` y `campo-archivo-unico`: son decenas de pantallas, muchas
// detrás de una sesión. El parser (`src/auditoria-de-relleno.ts`) es el que copian los productos; los tests de abajo lo prueban con fuentes de
// juguete para que, cuando un producto lo copie, sepa qué formas de escribir el relleno cubre y cuáles no.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  analizarFuente, auditarRelleno, describirInfracciones, describirSobrantes, esPantallaDeProducto, rellenoDeClases,
} from '../src/auditoria-de-relleno'

const SRC = resolve(__dirname, '..', 'src')
/** El paquete tiene ~100 módulos; si el barrido ve menos de 40, algo no anduvo. */
const MINIMO_DE_ARCHIVOS = 40

/** Las pantallas del kit: las de `comercio/` (cada una es un export `libra-ui/comercio/<Nombre>`) y las sueltas de `src/`. Los demás `.tsx`
 *  (la agenda, los campos, los tutoriales) son piezas que van adentro de una pantalla, con su propio `py-1` y `px-2` por dentro. */
const SUELTAS = [
  'Configuracion', 'FacturaDetalle', 'Facturas', 'Logs', 'MpBandeja', 'PresupuestoDetalle', 'PresupuestoForm', 'Presupuestos',
  'RemitoDetalle', 'RemitoNuevo', 'Remitos', 'Usuarios',
]
const esPantallaDelKit = (ruta: string) => /^comercio\/[A-Z]\w+\.tsx$/.test(ruta) || SUELTAS.some((n) => ruta === `${n}.tsx`)

const tmp: string[] = []
afterEach(() => {
  while (tmp.length) rmSync(tmp.pop() as string, { recursive: true, force: true })
})

/** Un `src/` de juguete con los archivos dados (ruta → fuente). */
function srcDeJuguete(archivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'relleno-'))
  tmp.push(dir)
  for (const [ruta, fuente] of Object.entries(archivos)) {
    mkdirSync(join(dir, ruta, '..'), { recursive: true })
    writeFileSync(join(dir, ruta), fuente)
  }
  return dir
}

const rellenos = (fuente: string) => analizarFuente(fuente).infracciones.map((i) => i.relleno.join(' '))

describe('las pantallas del kit no agregan relleno propio (ADR-040)', () => {
  const r = auditarRelleno(SRC, { esPantalla: esPantallaDelKit })

  it('control positivo: el barrido midió el kit', () => {
    expect(r.archivos).toBeGreaterThan(MINIMO_DE_ARCHIVOS)
    expect(r.pantallas).toBeGreaterThanOrEqual(SUELTAS.length + 30)
    // Más raíces que cero: si el parser no entendiera el JSX, devolvería 0 y la lista vacía de abajo se leería como «está todo bien».
    expect(r.raices).toBeGreaterThan(r.pantallas / 2)
  })

  it('🔴 ninguna pantalla del kit arranca con relleno propio', () => {
    expect(describirInfracciones(r.infracciones)).toEqual([])
    expect(r.sobrantes).toEqual([])
  })
})

describe('rellenoDeClases: qué clases agregan relleno arriba', () => {
  it.each([
    ['p-6', ['p-6']],
    ['py-8', ['py-8']],
    ['pt-4', ['pt-4']],
    ['mt-6', ['mt-6']],
    ['my-4', ['my-4']],
    ['p-3.5', ['p-3.5']],
    ['p-[10px]', ['p-[10px]']],
    ['pt-px', ['pt-px']],
    ['md:p-6', ['md:p-6']],
    ['lg:py-8', ['lg:py-8']],
    ['container mx-auto py-8', ['py-8']],
    ['space-y-6 p-6', ['p-6']],
    ['p-4 pt-14 md:p-6 md:pt-6', ['p-4', 'pt-14', 'md:p-6', 'md:pt-6']],
  ])('%s agrega relleno', (clases, esperado) => {
    expect(rellenoDeClases(clases)).toEqual(esperado)
  })

  it.each([
    'p-0', 'pt-0', 'md:py-0', 'space-y-6', 'gap-4', 'grid gap-4', 'container mx-auto', 'max-w-3xl mx-auto', 'px-4', 'pb-6', 'mb-4', 'ml-6',
    'hover:p-6', 'print:p-8', 'max-md:p-4', 'min-h-svh', 'p-', 'padding-6', 'pt-6x',
  ])('%s no cuenta', (clases) => {
    expect(rellenoDeClases(clases)).toEqual([])
  })

  it('un py-N sobre un mensaje centrado es el aire del mensaje, no el relleno de la pantalla', () => {
    expect(rellenoDeClases('py-6 text-center text-sm text-muted-foreground')).toEqual([])
    expect(rellenoDeClases('p-6 text-center')).toEqual(['p-6'])   // el p-N sí mete aire a los costados
    expect(rellenoDeClases('py-6 text-muted-foreground')).toEqual(['py-6'])   // sin centrar es relleno de pantalla (el «Cargando…» de Torneo)
  })
})

describe('analizarFuente: dónde mira y qué entiende', () => {
  it('🔴 la forma de LibraCargo: un div p-6 en la raíz', () => {
    const f = `export default function Inicio() {
  const x = 1
  return (
    <div className="p-6">
      <TituloPantalla icono={ICONOS.dashboard}>LibraCargo</TituloPantalla>
    </div>
  )
}`
    const r = analizarFuente(f, 'pages/Inicio.tsx')
    expect(r.componentes).toBe(1)
    expect(r.raices).toBe(1)
    expect(r.infracciones).toEqual([{ archivo: 'pages/Inicio.tsx', linea: 4, etiqueta: 'div', relleno: ['p-6'], clases: 'p-6' }])
  })

  it('cubre las formas de escribir el className', () => {
    expect(rellenoDeClases('container mx-auto py-8')).toEqual(['py-8'])
    expect(rellenos(`export default function A() {\n  return <div className="container mx-auto py-8">x</div>\n}`)).toEqual(['py-8'])
    expect(rellenos(`export default function A() {\n  return <div className={'space-y-6 p-6'}>x</div>\n}`)).toEqual(['p-6'])
    expect(rellenos(`export default function A() {\n  return <section className={cn('grid gap-4', cargando && 'pt-8')}>x</section>\n}`)).toEqual(['pt-8'])
    expect(rellenos('export default function A() {\n  return <div className={`grid ${x ? "p-4" : ""}`}>x</div>\n}')).toEqual(['p-4'])
    expect(rellenos(`export default function A() {\n  return (\n    <div\n      id="x"\n      className="space-y-4 md:p-6"\n      data-a={() => 1}\n    >x</div>\n  )\n}`)).toEqual(['md:p-6'])
  })

  it('una raíz limpia (space-y, gap, el mismo componente del kit) no es infracción', () => {
    expect(rellenos(`export default function A() {\n  return <div className="space-y-6">x</div>\n}`)).toEqual([])
    expect(rellenos(`export default function A() {\n  return <div className="grid gap-4 max-w-3xl mx-auto">x</div>\n}`)).toEqual([])
    expect(rellenos(`export default function A() {\n  return <ClientesComercio />\n}`)).toEqual([])
    expect(rellenos(`export default function A() {\n  return <div>x</div>\n}`)).toEqual([])
  })

  it('lee también los return de un if (el «Cargando…» y el error), con o sin llaves', () => {
    const f = `export default function A() {
  if (cargando) return <div className="p-6">Cargando…</div>
  if (error) {
    return <div className="py-8">Error</div>
  }
  return <div className="space-y-4">ok</div>
}`
    const r = analizarFuente(f)
    expect(r.raices).toBe(3)
    expect(r.infracciones.map((i) => [i.linea, i.relleno[0]])).toEqual([[2, 'p-6'], [4, 'py-8']])
  })

  it('una flecha de cuerpo-expresión es una raíz', () => {
    expect(rellenos(`export const Pantalla = () => (\n  <div className="p-6">x</div>\n)`)).toEqual(['p-6'])
    expect(rellenos(`export const Pantalla = ({ a }: { a: () => void }) => (\n  <div className="p-6">x</div>\n)`)).toEqual(['p-6'])
    expect(rellenos(`export default () => <div className="pt-6">x</div>`)).toEqual(['pt-6'])
  })

  it('si la raíz es un fragmento, mira sus hijos directos y no lo que está más adentro', () => {
    const f = `export default function A() {
  return (
    <>
      <TituloPantalla icono={I}>T</TituloPantalla>
      <div className="p-6">
        <p className="p-2">no es raíz</p>
      </div>
    </>
  )
}`
    expect(analizarFuente(f).infracciones.map((i) => [i.linea, i.etiqueta, i.relleno[0]])).toEqual([[5, 'div', 'p-6']])
  })

  it('🔴 no mira lo que no es la raíz de la pantalla', () => {
    const f = `function Fila() {
  return <div className="p-6">una fila</div>
}
export default function A() {
  const lista = items.map((x) => {
    return <div className="p-4">{x}</div>
  })
  function render() {
    return <div className="p-8">hijo</div>
  }
  return <div className="space-y-4">{lista}<Fila /></div>
}`
    expect(rellenos(f)).toEqual([])
  })

  it('de un archivo con varios componentes lee el export default; sin default, el que se llama como el archivo', () => {
    const base = (d: string) => `export function Auxiliar() {\n  return <div className="p-6">x</div>\n}\n${d}`
    expect(analizarFuente(base(`export default function Pagina() {\n  return <div className="space-y-4">x</div>\n}`), 'pages/Pagina.tsx').infracciones).toEqual([])
    expect(analizarFuente(base(`export function Pagina() {\n  return <div className="p-6">x</div>\n}`), 'pages/Pagina.tsx').infracciones.map((i) => i.linea)).toEqual([5])
    // `export default Nombre` al final, o `export { Nombre as default }`.
    expect(rellenos(`function Pagina() {\n  return <div className="pt-8">x</div>\n}\nexport default Pagina`)).toEqual(['pt-8'])
    expect(rellenos(`function Pagina() {\n  return <div className="pt-8">x</div>\n}\nexport { Pagina as default }`)).toEqual(['pt-8'])
  })

  it('los comentarios no cuentan y no mueven las líneas', () => {
    const f = `// <div className="p-6">
export default function A() {
  /* return <div className="p-6"> */
  return <div className="space-y-4">x</div>
}`
    expect(rellenos(f)).toEqual([])
    const g = `/* un comentario
   de dos líneas */
export default function A() {
  return <div className="p-6">x</div>
}`
    expect(analizarFuente(g).infracciones[0].linea).toBe(4)
  })
})

describe('auditarRelleno: el recorrido, las excepciones y el control positivo', () => {
  const LIMPIA = `export default function Limpia() {\n  return <div className="space-y-4">x</div>\n}`
  const SUCIA = `export default function Sucia() {\n  return <div className="p-6">x</div>\n}`

  it('cuenta archivos, pantallas y raíces; sólo mide lo que está en pages/', () => {
    const dir = srcDeJuguete({ 'pages/A.tsx': LIMPIA, 'pages/sub/B.tsx': LIMPIA, 'components/C.tsx': SUCIA, 'pages/A.test.tsx': SUCIA, 'main.tsx': SUCIA })
    const r = auditarRelleno(dir)
    expect(r).toMatchObject({ archivos: 5, pantallas: 2, raices: 2, infracciones: [], exceptuadas: [], sobrantes: [] })
  })

  it('🔴 describe qué arreglar, con archivo y línea', () => {
    const dir = srcDeJuguete({ 'pages/Inicio.tsx': SUCIA })
    const r = auditarRelleno(dir)
    expect(r.infracciones).toHaveLength(1)
    const [texto] = describirInfracciones(r.infracciones)
    expect(texto).toContain('pages/Inicio.tsx:2')
    expect(texto).toContain('className="p-6"')
    expect(texto).toContain('duplica el del Layout')
    expect(texto).toContain('excepciones')
  })

  it('una excepción con motivo deja pasar a la pantalla que se dibuja fuera del Layout', () => {
    const dir = srcDeJuguete({ 'pages/Login.tsx': SUCIA, 'pages/Inicio.tsx': LIMPIA })
    const r = auditarRelleno(dir, { excepciones: { 'pages/Login.tsx': 'fuera del Layout' } })
    expect(r.infracciones).toEqual([])
    expect(r.exceptuadas).toEqual([{ archivo: 'pages/Login.tsx', motivo: 'fuera del Layout' }])
    expect(r.sobrantes).toEqual([])
  })

  it('🔴 una excepción que ya no hace falta (o que no existe) sobra, y el test del producto tiene que fallar', () => {
    const dir = srcDeJuguete({ 'pages/Login.tsx': LIMPIA })
    const r = auditarRelleno(dir, { excepciones: { 'pages/Login.tsx': 'fuera del Layout', 'pages/Fantasma.tsx': 'no existe' } })
    expect(r.sobrantes).toEqual(['pages/Login.tsx', 'pages/Fantasma.tsx'])
    expect(describirSobrantes(r.sobrantes)[0]).toContain('Sacala de la lista')
  })

  it('una excepción no tapa a las demás pantallas', () => {
    const dir = srcDeJuguete({ 'pages/Login.tsx': SUCIA, 'pages/Inicio.tsx': SUCIA })
    const r = auditarRelleno(dir, { excepciones: { 'pages/Login.tsx': 'fuera del Layout' } })
    expect(r.infracciones.map((i) => i.archivo)).toEqual(['pages/Inicio.tsx'])
  })

  it('esPantalla reemplaza la regla por ruta', () => {
    const dir = srcDeJuguete({ 'components/AbmMaestro.tsx': SUCIA.replace('Sucia', 'AbmMaestro') })
    expect(auditarRelleno(dir).pantallas).toBe(0)
    const r = auditarRelleno(dir, { esPantalla: (ruta) => ruta === 'components/AbmMaestro.tsx' })
    expect(r.pantallas).toBe(1)
    expect(r.infracciones).toHaveLength(1)
  })

  it('esPantallaDeProducto: pages/**/*.tsx salvo tests', () => {
    expect(esPantallaDeProducto('pages/Inicio.tsx')).toBe(true)
    expect(esPantallaDeProducto('pages/maestros/Choferes.tsx')).toBe(true)
    expect(esPantallaDeProducto('frontend/src/pages/Inicio.tsx')).toBe(true)
    expect(esPantallaDeProducto('pages\\Inicio.tsx')).toBe(true)
    expect(esPantallaDeProducto('pages/Inicio.test.tsx')).toBe(false)
    expect(esPantallaDeProducto('pages/helpers.ts')).toBe(false)
    expect(esPantallaDeProducto('components/Inicio.tsx')).toBe(false)
  })

  it('el kit audita sus propias pantallas con un recorrido que de verdad ve violaciones', () => {
    // El control negativo: el mismo barrido sobre un src con una pantalla sucia da rojo. Sin esto, «el kit está limpio» podría ser un parser ciego.
    const dir = srcDeJuguete({ 'comercio/Egresos.tsx': SUCIA.replace('Sucia', 'Egresos') })
    const r = auditarRelleno(dir, { esPantalla: esPantallaDelKit })
    expect(r.pantallas).toBe(1)
    expect(describirInfracciones(r.infracciones)).toHaveLength(1)
  })
})

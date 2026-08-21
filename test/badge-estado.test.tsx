// El guard de la pastilla de estado.
//
// Lo que se sostiene aca es **la regla**, no el string: que en cada tono el
// token de color de `text-` sea EL MISMO que el de `border-`, y que el fondo
// use ese mismo token. Un test que se limitara a comparar la clase contra una
// constante copiada pasaria en verde con la regla rota, porque compartiria el
// error con el fuente.
//
// Lo que este archivo NO puede probar: que Tailwind emita ese CSS y que
// `tailwind-merge` deje ganar al tono contra la clase base. El stub de shadcn
// de `test/stubs` no aplica la cva ni pasa por `cn` de verdad. Eso se mide en
// un navegador sobre un producto, no aca.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BadgeEstado, TONOS_ESTADO, type TonoEstado } from '../src/badge-estado'

// Parte la lista de clases en tokens exactos. Se compara por igualdad contra
// el prefijo separado por espacios y no por `includes`: `border-` como
// subcadena tambien matchearia `dark:border-`, y `text-red-700` matchearia
// dentro de otra clase mas larga.
function tokenDe(clases: string, prefijo: string): string | null {
  const partes = clases.split(/\s+/).filter(Boolean)
  const halladas = partes.filter((c) => c.startsWith(prefijo) && !c.slice(prefijo.length).includes(':'))
  if (halladas.length !== 1) return null
  return halladas[0].slice(prefijo.length)
}

// Devuelve la lista de motivos por los que un juego de clases NO cumple la
// regla. Vacia = cumple. Se usa tanto sobre los tonos reales como sobre los
// controles negativos, para que el que juzga sea siempre el mismo codigo.
function incumplimientos(clases: string): string[] {
  const fallas: string[] = []
  for (const [modo, pre, opacidad] of [
    ['claro', '', '10'],
    ['oscuro', 'dark:', '15'],
  ] as const) {
    const borde = tokenDe(clases, `${pre}border-`)
    const fuente = tokenDe(clases, `${pre}text-`)
    const fondo = tokenDe(clases, `${pre}bg-`)
    if (!borde || !fuente || !fondo) {
      fallas.push(`${modo}: falta o esta duplicado alguno de border/text/bg`)
      continue
    }
    if (borde !== fuente) fallas.push(`${modo}: la fuente (${fuente}) no es el mismo color que el borde (${borde})`)
    const [tonoFondo, alfa] = fondo.split('/')
    if (tonoFondo !== borde) fallas.push(`${modo}: el fondo (${tonoFondo}) no es el mismo tono que el borde (${borde})`)
    if (alfa !== opacidad) fallas.push(`${modo}: el fondo esta al ${alfa ?? 'sin alfa'} y no al ${opacidad}`)
  }
  return fallas
}

describe('el criterio visual de la pastilla de estado', () => {
  // Recorre las claves reales en vez de una lista escrita a mano: un tono
  // nuevo entra al guard solo, sin que nadie se acuerde de agregarlo.
  const tonos = Object.keys(TONOS_ESTADO) as TonoEstado[]

  it.each(tonos)('🔴 «%s» — la fuente, el borde y el fondo son el mismo color', (tono) => {
    expect(incumplimientos(TONOS_ESTADO[tono])).toEqual([])
  })

  it('el control — el juez detecta cada forma de romper la regla', () => {
    // Sin esto, los casos de arriba pasarian igual si `tokenDe` devolviera
    // siempre null y las dos listas comparadas fueran vacias.
    expect(incumplimientos('border-red-700 text-slate-600 bg-red-700/10 dark:border-red-400 dark:text-red-400 dark:bg-red-400/15'))
      .toContain('claro: la fuente (slate-600) no es el mismo color que el borde (red-700)')
    expect(incumplimientos('border-red-700 text-red-700 bg-blue-700/10 dark:border-red-400 dark:text-red-400 dark:bg-red-400/15'))
      .toContain('claro: el fondo (blue-700) no es el mismo tono que el borde (red-700)')
    expect(incumplimientos('border-red-700 text-red-700 bg-red-700/40 dark:border-red-400 dark:text-red-400 dark:bg-red-400/15'))
      .toContain('claro: el fondo esta al 40 y no al 10')
    expect(incumplimientos('border-red-700 text-red-700 bg-red-700/10'))
      .toContain('oscuro: falta o esta duplicado alguno de border/text/bg')
  })

  it('🔴 ningun tono se queda sin borde visible', () => {
    // La clase base de shadcn trae `border-transparent`. Si un tono no nombra
    // su propio color de borde, la pastilla sale sin borde y el pedido —que
    // era justamente que el borde se vea— queda incumplido en silencio.
    for (const tono of tonos) {
      expect(TONOS_ESTADO[tono]).not.toContain('border-transparent')
      expect(tokenDe(TONOS_ESTADO[tono], 'border-')).toBeTruthy()
    }
  })
})

describe('BadgeEstado', () => {
  it('rendea el texto del estado con las clases de su tono', () => {
    render(<BadgeEstado tono="ok">Cobrada</BadgeEstado>)
    const pastilla = screen.getByText('Cobrada')
    expect(pastilla.className).toContain('border-emerald-700')
    expect(pastilla.className).toContain('text-emerald-700')
  })

  it('conserva las clases que le agrega el producto', () => {
    // Las pantallas le pasan `w-fit`, `ml-1` y demas para ubicarla. Si el
    // componente las descartara, el tono entraria bien y el layout se rompe.
    render(<BadgeEstado tono="negativo" className="ml-2">Anulada</BadgeEstado>)
    expect(screen.getByText('Anulada').className).toContain('ml-2')
  })

  it('marca el tono en el DOM para poder auditarlo desde afuera', () => {
    // `data-tono` es lo que deja verificar en un navegador que la pantalla X
    // pinto el estado Y con el tono que corresponde, sin leer el fuente.
    render(<BadgeEstado tono="atencion">Pago parcial</BadgeEstado>)
    expect(screen.getByText('Pago parcial')).toHaveAttribute('data-tono', 'atencion')
  })
})

// El vocabulario de iconos de accion, compartido por los 6 productos.
//
// Lo que se prueba aca NO es "que se vea lindo": es que el modulo cumpla las
// dos propiedades de las que depende el resto del diseño.
//
//  1. El icono no elige color: lo hereda. El glifo pinta con
//     `fill="currentColor"` y no hay ningun bloque de fondo atras. Es lo que
//     hace que el tacho se ponga rojo sin que este modulo sepa nada de tachos,
//     y es justo lo que el set `fluent-color` no podia hacer.
//     Hasta el 2026-08-13 la misma propiedad se conseguia al reves: un recuadro
//     `bg-current` con el glifo en `text-white`. Se invirtio por pedido del
//     humano, y el test de abajo es lo que impide que el bloque vuelva de
//     prepo — por eso mira TODOS los exports y no uno de muestra.
//  2. Dos conceptos distintos no comparten dibujo. Suena obvio, y sin embargo
//     `PackagePlus` y `Package` dibujaban los dos el mismo `box` hasta el
//     2026-08-13: no era una preferencia discutible, era un defecto que nadie
//     veia porque ningun test miraba el glifo.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as iconos from '../src/iconos-accion'

type Icono = (props: { className?: string }) => React.ReactNode
const TODOS = Object.entries(iconos) as [string, Icono][]

/** El `d` del primer path, que es la identidad del dibujo. */
function dibujo(Icono: Icono): string {
  const { container } = render(<Icono />)
  const path = container.querySelector('svg path')
  return path?.getAttribute('d') ?? ''
}

describe('iconos-accion', () => {
  it('todos los exports dibujan un svg con contenido', () => {
    expect(TODOS.length).toBeGreaterThan(50)
    const vacios = TODOS.filter(([, Icono]) => !dibujo(Icono))
    expect(vacios.map(([nombre]) => nombre)).toEqual([])
  })

  it('el glifo hereda el color y no trae bloque atras', () => {
    const { container } = render(<iconos.Trash2 />)
    const svg = container.firstElementChild!

    // La parte POSITIVA: el dibujo se pinta con `currentColor`, que es el
    // mecanismo entero. Sin esto, el tacho deja de ponerse rojo en el boton
    // destructivo y el modulo tendria que saber de tachos.
    expect(svg.tagName).toBe('svg')
    expect(container.innerHTML).toContain('currentColor')

    // Y la negativa: nada de recuadro. `className` de un SVGElement es un
    // SVGAnimatedString, no un string — de ahi el getAttribute.
    expect(svg.getAttribute('class')).not.toContain('bg-current')
    expect(svg.getAttribute('class')).not.toContain('text-white')
  })

  it('ningun export vuelve a envolver el glifo en un recuadro', () => {
    // La version fuerte del test de arriba, sobre los ~60 exports: el defecto
    // que se quiere evitar es que alguien reintroduzca el bloque en UNO solo.
    const conBloque = TODOS.filter(([, Icono]) => {
      const { container } = render(<Icono />)
      return container.firstElementChild!.tagName !== 'svg'
        || container.innerHTML.includes('bg-current')
        || container.innerHTML.includes('text-white')
    })
    expect(conBloque.map(([nombre]) => nombre)).toEqual([])
  })

  it('los tres "mas" son tres dibujos distintos, no uno', () => {
    // Crear un registro, agregar a algo existente y el signo mas del par +/-
    // del stock. Eran el mismo icono hasta el 2026-08-13.
    const [nuevo, agregar, signo] = [
      dibujo(iconos.FilePlus), dibujo(iconos.PlusCircle), dibujo(iconos.Plus),
    ]
    expect(new Set([nuevo, agregar, signo]).size).toBe(3)
  })

  it('colocar un equipo no dibuja lo mismo que un paquete', () => {
    expect(dibujo(iconos.PackagePlus)).not.toBe(dibujo(iconos.Package))
  })

  it('la clase que le pasa la pantalla llega al svg y pisa el tamaño', () => {
    // Importa que PISE: el modulo pone `size-4` siempre, asi que si `cn()` no
    // resolviera el conflicto, una pantalla no podria agrandar ni achicar nada.
    const grande = render(<iconos.Eye className="size-8" />)
    const clase = grande.container.firstElementChild!.getAttribute('class')!
    expect(clase).toContain('size-8')
    expect(clase).not.toContain('size-4')

    const chico = render(<iconos.Plus className="size-3" />)
    expect(chico.container.querySelector('svg')!.getAttribute('class')).toContain('size-3')
  })
})

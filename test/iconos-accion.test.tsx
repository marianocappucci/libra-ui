// El vocabulario de iconos de accion, compartido por los 6 productos.
//
// Lo que se prueba aca NO es "que se vea lindo": es que el modulo cumpla las
// dos propiedades de las que depende el resto del diseño.
//
//  1. El recuadro no elige color. Pinta con `bg-current`, o sea con el
//     `currentColor` que hereda del boton, y el glifo va en blanco encima. Es
//     lo que hace que el tacho se ponga rojo sin que este modulo sepa nada de
//     tachos, y es justo lo que el set `fluent-color` no podia hacer.
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

  it('el recuadro se pinta con el color heredado y el glifo va en blanco', () => {
    const { container } = render(<iconos.Trash2 />)
    const caja = container.firstElementChild!

    // `bg-current` es el mecanismo entero: si alguien lo cambia por un color
    // fijo, el tacho deja de ponerse rojo en el boton destructivo.
    expect(caja.tagName).toBe('SPAN')
    expect(caja.className).toContain('bg-current')
    expect(caja.querySelector('svg')!.getAttribute('class')).toContain('text-white')
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

  it('los que van sobre un boton primario no traen recuadro', () => {
    // En un boton primario `currentColor` ya es blanco: con recuadro,
    // `bg-current` lo pinta blanco y el glifo blanco desaparece. Paso con el
    // "+" de "Nuevo cliente".
    for (const Icono of [iconos.FilePlus, iconos.PlusCircle, iconos.Plus,
                         iconos.SearchPlano, iconos.DownloadPlano]) {
      const { container } = render(<Icono />)
      expect(container.firstElementChild!.tagName).toBe('svg')
      expect(container.innerHTML).not.toContain('bg-current')
    }
  })

  it('la clase que le pasa la pantalla llega al elemento', () => {
    const conRecuadro = render(<iconos.Eye className="size-8" />)
    expect(conRecuadro.container.firstElementChild!.className).toContain('size-8')

    const plano = render(<iconos.Plus className="size-3" />)
    expect(plano.container.querySelector('svg')!.getAttribute('class')).toContain('size-3')
  })
})

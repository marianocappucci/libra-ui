// Las vistas del calendario compartido.
//
// 🔴 **Casi todo se mide, no se lee.** El defecto que peor se ve en un
// calendario es un bloque tapando a otro, y no deja ningún rastro en el texto:
// los dos siguen en el DOM y `getByText` los encuentra a los dos. Lo mismo con
// el alto: una rejilla con alto fijo muestra los mismos títulos que una que
// respeta la duración. Por eso las afirmaciones son sobre `top`, `height`,
// `left` y `width`, y sobre en qué columna del DOM cae cada bloque.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  ChipEvento, NavegadorCalendario, ReferenciaDeColores, RejillaHoraria,
  VistaMes, VistaSemana, claseChip, clasePunto,
  type ColumnaRejilla, type EventoRejilla,
} from '../src/agenda'

const LUNES = '2026-08-17'
const MIERCOLES = '2026-08-19'
const OTRO_DIA = '2026-10-01'

function evento(parcial: Partial<EventoRejilla> & { clave: string }): EventoRejilla {
  return {
    desde: `${MIERCOLES}T09:00:00`,
    hasta: `${MIERCOLES}T10:00:00`,
    titulo: parcial.clave,
    clase: claseChip(0),
    to: `/turnos/${parcial.clave}`,
    ...parcial,
  }
}

function montar(nodo: React.ReactNode) {
  return render(<MemoryRouter>{nodo}</MemoryRouter>)
}

/** El bloque de un evento, por el texto de su título. */
function bloque(titulo: string): HTMLElement {
  return screen.getByText(titulo).closest('a') as HTMLElement
}

// ── la rejilla horaria ─────────────────────────────────────────────────────

function unaColumna(eventos: EventoRejilla[], esHoy = false): ColumnaRejilla[] {
  return [{ clave: 'c1', encabezado: <span>Box 1</span>, eventos, esHoy }]
}

describe('RejillaHoraria', () => {
  it('🔴 el bloque mide lo que dura', () => {
    // Sin esto, una rejilla con alto fijo dibuja los mismos títulos y la
    // pantalla dejaría de contestar "cuánto ocupa", que es para lo que existe.
    montar(<RejillaHoraria columnas={unaColumna([
      evento({ clave: 'corto', desde: `${MIERCOLES}T09:00:00`, hasta: `${MIERCOLES}T10:00:00` }),
      evento({ clave: 'largo', desde: `${MIERCOLES}T14:00:00`, hasta: `${MIERCOLES}T17:00:00` }),
    ])} />)
    const alto = (t: string) => parseFloat(bloque(t).style.height)
    expect(alto('largo')).toBeCloseTo(alto('corto') * 3, 1)
  })

  it('el bloque arranca donde corresponde a su hora', () => {
    montar(<RejillaHoraria columnas={unaColumna([
      evento({ clave: 'nueve', desde: `${MIERCOLES}T09:00:00`, hasta: `${MIERCOLES}T10:00:00` }),
      evento({ clave: 'diez', desde: `${MIERCOLES}T10:00:00`, hasta: `${MIERCOLES}T11:00:00` }),
    ])} />)
    const top = (t: string) => parseFloat(bloque(t).style.top)
    // Una hora más abajo mide exactamente un alto de bloque de una hora.
    expect(top('diez') - top('nueve')).toBeCloseTo(parseFloat(bloque('nueve').style.height), 1)
  })

  it('🔴 dos eventos que se pisan se dibujan uno al lado del otro', () => {
    montar(<RejillaHoraria columnas={unaColumna([
      evento({ clave: 'uno', desde: `${MIERCOLES}T09:00:00`, hasta: `${MIERCOLES}T10:00:00` }),
      evento({ clave: 'dos', desde: `${MIERCOLES}T09:30:00`, hasta: `${MIERCOLES}T10:30:00` }),
    ])} />)
    const anchos = ['uno', 'dos'].map((t) => parseFloat(bloque(t).style.width))
    const izquierdas = ['uno', 'dos'].map((t) => parseFloat(bloque(t).style.left))
    expect(anchos.every((a) => a < 50)).toBe(true)
    expect(new Set(izquierdas).size).toBe(2)
  })

  it('🔴 el control — uno solo ocupa el ancho entero', () => {
    // Sin este control, el test de arriba pasaría en verde con TODOS los
    // bloques repartidos a media columna, que también es un defecto.
    montar(<RejillaHoraria columnas={unaColumna([evento({ clave: 'solo' })])} />)
    expect(parseFloat(bloque('solo').style.width)).toBeGreaterThan(90)
    expect(parseFloat(bloque('solo').style.left)).toBe(0)
  })

  it('cada evento cae en el cuerpo de su columna', () => {
    montar(<RejillaHoraria columnas={[
      { clave: 'a', encabezado: <span>A</span>, eventos: [evento({ clave: 'de-a' })] },
      { clave: 'b', encabezado: <span>B</span>, eventos: [evento({ clave: 'de-b' })] },
    ]} />)
    const columnaB = document.querySelector('[data-columna="b"]') as HTMLElement
    expect(within(columnaB).getByText('de-b')).toBeInTheDocument()
    expect(within(columnaB).queryByText('de-a')).not.toBeInTheDocument()
  })

  it('🔴 el encabezado vive DENTRO del contenedor que scrollea', () => {
    // Afuera, la barra de scroll le come ~15 px de ancho al cuerpo y no al
    // encabezado, y las columnas se van desfasando hacia la derecha. Lo reportó
    // el humano con una captura en LibraDesk (2026-08-14).
    montar(<RejillaHoraria columnas={unaColumna([evento({ clave: 'x' })])} />)
    const caja = document.querySelector('[data-rejilla-scroll]') as HTMLElement
    expect(caja.querySelector('[data-columna-encabezado="c1"]')).not.toBeNull()
  })

  it('la línea de ahora sólo se dibuja en la columna de hoy', () => {
    const { unmount } = montar(
      <RejillaHoraria columnas={unaColumna([evento({ clave: 'x' })], false)} />)
    expect(document.querySelector('.border-red-500')).toBeNull()
    unmount()

    // Con `esHoy`, y con la ventana estirada para que "ahora" caiga adentro
    // sea cual sea la hora a la que corra la suite.
    montar(<RejillaHoraria columnas={unaColumna([
      evento({ clave: 'y', desde: `${MIERCOLES}T00:00:00`, hasta: `${MIERCOLES}T23:59:00` }),
    ], true)} />)
    expect(document.querySelector('.border-red-500')).not.toBeNull()
  })
})

// ── el chip ────────────────────────────────────────────────────────────────

describe('ChipEvento', () => {
  it('muestra la hora y el título, y linkea al evento', () => {
    montar(<ChipEvento evento={evento({ clave: 'Corte', subtitulo: 'Ana' })} />)
    const enlace = screen.getByRole('link')
    expect(enlace).toHaveAttribute('href', '/turnos/Corte')
    expect(enlace).toHaveTextContent('09:00')
    expect(enlace).toHaveTextContent('Corte')
    expect(enlace).toHaveTextContent('Ana')
  })

  it('🔴 compacto esconde el subtítulo', () => {
    // En la celda del mes no entra: mide cuatro renglones y el subtítulo se
    // comería uno entero.
    montar(<ChipEvento evento={evento({ clave: 'Corte', subtitulo: 'Ana' })} compacto />)
    expect(screen.getByRole('link')).not.toHaveTextContent('Ana')
    expect(screen.getByRole('link')).toHaveTextContent('Corte')
  })
})

// ── la semana ──────────────────────────────────────────────────────────────

describe('VistaSemana', () => {
  const props = {
    desde: LUNES,
    hoy: MIERCOLES,
    hrefDia: (d: string) => `/agenda?vista=dia&dia=${d}`,
  }

  it('dibuja siete días, de lunes a domingo', () => {
    montar(<VistaSemana {...props} porDia={{}} />)
    const columnas = document.querySelectorAll('[data-columna]')
    expect(columnas).toHaveLength(7)
    expect(columnas[0].getAttribute('data-columna')).toBe(LUNES)
    expect(columnas[6].getAttribute('data-columna')).toBe('2026-08-23')
  })

  it('🔴 cada evento cae en la columna de su día', () => {
    montar(<VistaSemana {...props} porDia={{
      [LUNES]: [evento({ clave: 'del-lunes' })],
      [MIERCOLES]: [evento({ clave: 'del-miercoles' })],
    }} />)
    const delMiercoles = document.querySelector(`[data-columna="${MIERCOLES}"]`) as HTMLElement
    expect(within(delMiercoles).getByText('del-miercoles')).toBeInTheDocument()
    expect(within(delMiercoles).queryByText('del-lunes')).not.toBeInTheDocument()
  })

  it('el encabezado de cada día entra al día', () => {
    montar(<VistaSemana {...props} porDia={{}} />)
    expect(screen.getByRole('link', { name: /19/ }))
      .toHaveAttribute('href', `/agenda?vista=dia&dia=${MIERCOLES}`)
  })
})

// ── el mes ─────────────────────────────────────────────────────────────────

describe('VistaMes', () => {
  const props = {
    desde: '2026-07-27',
    celdas: 42,
    mes: '2026-08-15',
    hoy: MIERCOLES,
    hrefDia: (d: string) => `/agenda?vista=dia&dia=${d}`,
  }

  it('dibuja la grilla completa, con los días del mes de al lado', () => {
    montar(<VistaMes {...props} porDia={{}} />)
    // Un enlace por celda (el número del día) y ninguno de más.
    expect(screen.getAllByRole('link')).toHaveLength(42)
    // El 27 de julio es una celda real y entra a su día. Se busca por el
    // href y no por el nombre accesible: la celda dibuja el número dos veces
    // (compacto para móvil, redondo para escritorio) y además hay más de un
    // 27 en una grilla de seis semanas.
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs[0]).toBe('/agenda?vista=dia&dia=2026-07-27')
    expect(hrefs.at(-1)).toBe('/agenda?vista=dia&dia=2026-09-06')
  })

  it('🔴 más de tres eventos en un día se resumen en un "+N más" que lleva al día', () => {
    // Un tope silencioso escondería eventos sin dar forma de verlos.
    const cinco = Array.from({ length: 5 }, (_, i) => evento({ clave: `e${i}` }))
    montar(<VistaMes {...props} porDia={{ [MIERCOLES]: cinco }} />)
    expect(screen.getByText('e0')).toBeInTheDocument()
    expect(screen.getByText('e2')).toBeInTheDocument()
    expect(screen.queryByText('e3')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+2 más' }))
      .toHaveAttribute('href', `/agenda?vista=dia&dia=${MIERCOLES}`)
  })

  it('🔴 el control — con tres o menos no aparece el resumen', () => {
    const tres = Array.from({ length: 3 }, (_, i) => evento({ clave: `e${i}` }))
    montar(<VistaMes {...props} porDia={{ [MIERCOLES]: tres }} />)
    expect(screen.getByText('e2')).toBeInTheDocument()
    expect(screen.queryByText(/más$/)).not.toBeInTheDocument()
  })

  it('los eventos de un día que no se dibuja no aparecen', () => {
    montar(<VistaMes {...props} porDia={{ [OTRO_DIA]: [evento({ clave: 'fuera' })] }} />)
    expect(screen.queryByText('fuera')).not.toBeInTheDocument()
  })
})

// ── la barra de navegación ─────────────────────────────────────────────────

describe('NavegadorCalendario', () => {
  const href = (cambios: Record<string, string>) =>
    `/agenda?${new URLSearchParams({ vista: 'semana', ...cambios })}`

  it('🔴 las flechas se mueven en la unidad de la vista', () => {
    montar(<NavegadorCalendario vista="semana" dia={MIERCOLES} hoy={LUNES} href={href} />)
    expect(screen.getByLabelText('Siguiente'))
      .toHaveAttribute('href', '/agenda?vista=semana&dia=2026-08-26')
    expect(screen.getByLabelText('Anterior'))
      .toHaveAttribute('href', '/agenda?vista=semana&dia=2026-08-12')
  })

  it('en la vista de mes se mueve un mes', () => {
    montar(<NavegadorCalendario vista="mes" dia={MIERCOLES} hoy={LUNES} href={href} />)
    expect(screen.getByLabelText('Siguiente'))
      .toHaveAttribute('href', '/agenda?vista=semana&dia=2026-09-01')
  })

  it('"Hoy" vuelve al día de hoy y el título dice qué se está mirando', () => {
    montar(<NavegadorCalendario vista="mes" dia={MIERCOLES} hoy={LUNES} href={href} />)
    expect(screen.getByRole('link', { name: 'Hoy' }))
      .toHaveAttribute('href', `/agenda?vista=semana&dia=${LUNES}`)
    expect(screen.getByText(/agosto/)).toBeInTheDocument()
  })

  it('el conmutador de vistas lo pone el producto', () => {
    montar(
      <NavegadorCalendario vista="dia" dia={MIERCOLES} hoy={LUNES} href={href}>
        <span data-testid="conmutador">Día / Semana / Mes</span>
      </NavegadorCalendario>,
    )
    expect(screen.getByTestId('conmutador')).toBeInTheDocument()
  })
})

// ── la referencia ──────────────────────────────────────────────────────────

describe('ReferenciaDeColores', () => {
  it('un punto por carril, con su color', () => {
    const { container } = montar(<ReferenciaDeColores carriles={[
      { clave: '1', nombre: 'Ana', clasePunto: clasePunto(0) },
      { clave: '2', nombre: 'Beto', clasePunto: clasePunto(1) },
    ]} />)
    expect(screen.getByText('Ana')).toBeInTheDocument()
    const puntos = container.querySelectorAll('.rounded-full')
    expect(puntos).toHaveLength(2)
    expect(puntos[0].className).not.toBe(puntos[1].className)
  })

  it('sin carriles no dibuja nada', () => {
    const { container } = montar(<ReferenciaDeColores carriles={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

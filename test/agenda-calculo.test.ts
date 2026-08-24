// La aritmética del calendario: fechas, colocación de bloques y vistas.
//
// Es la mitad del módulo que se puede probar sin montar nada, y la que más
// silenciosamente se rompe: un día corrido no tira ningún error, simplemente
// pone el turno del jueves en la columna del miércoles.
import { describe, expect, it, vi } from 'vitest'
import {
  NOMBRES_DIAS, celdasGrillaMes, diaCorto, diaLargo, hora, hoyLocal,
  inicioGrillaMes, lunesDe, mesLargo, mismoMes, rangoSemana, sumarDias,
  sumarMeses,
} from '../src/agenda/fechas'
import { colocar, minutos, ventanaHoraria } from '../src/agenda/colocacion'
import { claseChip, clasePunto } from '../src/agenda/colores'
import {
  correrVista, diaDeLaUrl, rangoDeVista, tituloDeVista, vistaDeLaUrl,
} from '../src/agenda/vistas'
import type { EventoRejilla } from '../src/agenda/rejilla-horaria'

function evento(desde: string, hasta: string, clave = desde): EventoRejilla {
  return { clave, desde, hasta, titulo: clave, clase: '', to: '#' }
}

describe('fechas', () => {
  it('suma días sin correrse de día', () => {
    expect(sumarDias('2026-08-22', 1)).toBe('2026-08-23')
    expect(sumarDias('2026-08-22', -1)).toBe('2026-08-21')
    // Fin de mes y fin de año, que es donde una suma ingenua se equivoca.
    expect(sumarDias('2026-08-31', 1)).toBe('2026-09-01')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    // Bisiesto.
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('🔴 el mes siguiente del 31 de enero es febrero, no marzo', () => {
    // Sumarle un mes al día 31 sin anclar al día 1 devuelve el 3 de marzo,
    // que es el defecto clásico de esta operación.
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-01')
    expect(sumarMeses('2026-03-15', -1)).toBe('2026-02-01')
  })

  it('el lunes de la semana, con el domingo contando para la anterior', () => {
    // 2026-08-22 es sábado; 2026-08-23, domingo.
    expect(lunesDe('2026-08-22')).toBe('2026-08-17')
    expect(lunesDe('2026-08-23')).toBe('2026-08-17')
    expect(lunesDe('2026-08-24')).toBe('2026-08-24')
  })

  it('la grilla del mes arranca el lunes anterior al día 1', () => {
    // Agosto de 2026 empieza sábado: la grilla arranca el lunes 27 de julio.
    expect(inicioGrillaMes('2026-08-15')).toBe('2026-07-27')
    // Junio de 2026 empieza lunes: no hay días prestados adelante.
    expect(inicioGrillaMes('2026-06-10')).toBe('2026-06-01')
  })

  it('🔴 la grilla mide 28, 35 o 42 celdas, nunca 42 siempre', () => {
    // Agosto 2026: empieza sábado y tiene 31 días -> 6 semanas.
    expect(celdasGrillaMes('2026-08-01')).toBe(42)
    // Junio 2026: empieza lunes, 30 días -> 5 semanas justas.
    expect(celdasGrillaMes('2026-06-01')).toBe(35)
    // Febrero de un año no bisiesto que empieza lunes: 4 semanas exactas.
    expect(celdasGrillaMes('2027-02-01')).toBe(28)
  })

  it('mismoMes compara el mes calendario y no la distancia', () => {
    expect(mismoMes('2026-08-01', '2026-08-31')).toBe(true)
    expect(mismoMes('2026-08-31', '2026-09-01')).toBe(false)
  })

  it('los rótulos arrancan en lunes', () => {
    expect(NOMBRES_DIAS[0]).toBe('Lun')
    expect(NOMBRES_DIAS[6]).toBe('Dom')
    // 2026-08-20 es jueves.
    expect(diaCorto('2026-08-20')).toBe('Jue 20')
  })

  it('los títulos de las tres vistas', () => {
    expect(diaLargo('2026-08-20')).toContain('20')
    expect(diaLargo('2026-08-20')).toContain('agosto')
    // El "de" va opcional: los datos ICU de Node dan "agosto de 2026" y el
    // navegador "agosto 2026". Lo que este test sostiene es el mes y el anio,
    // no de que build de ICU salio la cadena.
    expect(mesLargo('2026-08-20')).toMatch(/^agosto (de )?2026$/)
    // Semana que no cruza el mes: el mes se nombra una vez.
    expect(rangoSemana('2026-08-17')).toBe('17 al 23 de agosto de 2026')
    // Semana que sí lo cruza: se nombra dos veces, que es lo único que se
    // entiende.
    expect(rangoSemana('2026-06-29')).toBe('29 de junio al 5 de julio de 2026')
  })

  it('🔴 la hora sale en 24 h aunque el locale del entorno diga otra cosa', () => {
    // Los datos ICU de Node dan "a. m." para es-AR donde el navegador no; sin
    // `hour12: false` explícito el formato dependería de dónde corra la suite.
    expect(hora('2026-08-20T09:00:00')).toBe('09:00')
    expect(hora('2026-08-20T21:30:00')).toBe('21:30')
  })

  it('hoyLocal da el día de Argentina, no el del runner', () => {
    // 🔴 Antes este test calculaba lo esperado con `getFullYear/getMonth/
    // getDate`, o sea **con la misma técnica que el código que probaba**. Un
    // test así no puede fallar por un defecto de zona: comparte la premisa con
    // lo que mide, y sólo verificaba que el string tuviera guiones.
    //
    // Con el reloj fijo a las 23:30 del 31-08 en Argentina —02:30 UTC del
    // 01-09— el día de UTC y el de Argentina son distintos, que es la única
    // condición en la que este assert significa algo.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T02:30:00Z'))
    try {
      expect(hoyLocal()).toBe('2026-08-31')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('colocación de bloques', () => {
  it('los minutos salen del string y no de un Date', () => {
    expect(minutos('2026-08-20T09:30:00')).toBe(570)
    expect(minutos('2026-08-20T00:00:00')).toBe(0)
  })

  it('un evento solo ocupa la columna entera', () => {
    const [uno] = colocar([evento('2026-08-20T09:00:00', '2026-08-20T10:00:00')])
    expect(uno.col).toBe(0)
    expect(uno.total).toBe(1)
  })

  it('🔴 dos eventos que se pisan se reparten el ancho', () => {
    // Sin esto uno se dibuja encima del otro y el de abajo desaparece sin que
    // nada avise: los dos textos siguen en el DOM, así que sólo se ve midiendo.
    const puestos = colocar([
      evento('2026-08-20T09:00:00', '2026-08-20T10:00:00', 'a'),
      evento('2026-08-20T09:30:00', '2026-08-20T10:30:00', 'b'),
    ])
    expect(puestos.map((e) => e.total)).toEqual([2, 2])
    expect(new Set(puestos.map((e) => e.col))).toEqual(new Set([0, 1]))
  })

  it('🔴 uno que empieza cuando el otro termina REUSA su columna', () => {
    // A media columna cada uno, la agenda diría que el carril está doblemente
    // ocupado a las 11 cuando en realidad está libre.
    const puestos = colocar([
      evento('2026-08-20T10:00:00', '2026-08-20T11:00:00', 'a'),
      evento('2026-08-20T11:00:00', '2026-08-20T12:00:00', 'b'),
    ])
    expect(puestos.every((e) => e.total === 1)).toBe(true)
  })

  it('🔴 un choque a la mañana no adelgaza el evento de la tarde', () => {
    // El ancho lo fija el racimo, no el día entero: es el criterio de Google.
    const puestos = colocar([
      evento('2026-08-20T09:00:00', '2026-08-20T10:00:00', 'a'),
      evento('2026-08-20T09:30:00', '2026-08-20T10:30:00', 'b'),
      evento('2026-08-20T16:00:00', '2026-08-20T17:00:00', 'tarde'),
    ])
    expect(puestos.find((e) => e.clave === 'tarde')!.total).toBe(1)
  })

  it('un evento con datos rotos no se vuelve un alto negativo', () => {
    const [roto] = colocar([evento('2026-08-20T10:00:00', '2026-08-20T09:00:00')])
    expect(roto.finMin).toBe(roto.inicioMin)
  })

  it('la ventana horaria va de 7 a 20 cuando todo cae adentro', () => {
    expect(ventanaHoraria([{ eventos: [
      evento('2026-08-20T09:00:00', '2026-08-20T10:00:00'),
    ] }])).toEqual([7, 20])
  })

  it('🔴 la ventana se estira, nunca recorta', () => {
    // Si recortara, el evento de madrugada desaparecería de la grilla sin que
    // nada lo dijera: la peor forma de fallar de un calendario.
    expect(ventanaHoraria([{ eventos: [
      evento('2026-08-20T05:00:00', '2026-08-20T06:00:00'),
      evento('2026-08-20T21:00:00', '2026-08-20T22:30:00'),
    ] }])).toEqual([5, 23])
  })

  it('sin eventos la ventana sigue siendo válida', () => {
    expect(ventanaHoraria([])).toEqual([7, 20])
  })
})

describe('colores', () => {
  it('los primeros ocho carriles se distinguen entre sí', () => {
    const clases = Array.from({ length: 8 }, (_, i) => claseChip(i))
    expect(new Set(clases).size).toBe(8)
    expect(new Set(Array.from({ length: 8 }, (_, i) => clasePunto(i))).size).toBe(8)
  })

  it('el noveno repite el primero en vez de quedarse sin color', () => {
    expect(claseChip(8)).toBe(claseChip(0))
    expect(clasePunto(8)).toBe(clasePunto(0))
  })

  it('🔴 ninguna clase se arma con plantillas', () => {
    // Tailwind escanea el fuente: una clase construida en runtime no se emite
    // y el bloque sale sin fondo. Se comprueba que lo devuelto sean clases
    // completas y reconocibles, no fragmentos.
    for (let i = 0; i < 8; i += 1) {
      expect(claseChip(i)).toMatch(/^bg-[a-z]+-100 /)
      expect(clasePunto(i)).toMatch(/^bg-[a-z]+-400$/)
    }
  })
})

describe('vistas', () => {
  it('la vista sale de la URL, con la semana por defecto', () => {
    expect(vistaDeLaUrl('mes')).toBe('mes')
    expect(vistaDeLaUrl('dia')).toBe('dia')
    expect(vistaDeLaUrl(null)).toBe('semana')
    expect(vistaDeLaUrl('trimestre')).toBe('semana')
  })

  it('el día de la URL se valida como fecha', () => {
    expect(diaDeLaUrl('2026-08-20', 'hoy')).toBe('2026-08-20')
    expect(diaDeLaUrl('mañana', 'hoy')).toBe('hoy')
    expect(diaDeLaUrl(null, 'hoy')).toBe('hoy')
  })

  it('🔴 el mes pide la grilla entera, no el mes', () => {
    // Pedir sólo el mes deja las celdas de los bordes vacías aunque tengan
    // eventos, y son días reales.
    expect(rangoDeVista('dia', '2026-08-20')).toEqual({ desde: '2026-08-20', dias: 1 })
    expect(rangoDeVista('semana', '2026-08-20')).toEqual({ desde: '2026-08-17', dias: 7 })
    expect(rangoDeVista('mes', '2026-08-20')).toEqual({ desde: '2026-07-27', dias: 42 })
  })

  it('cada vista se corre en su propia unidad', () => {
    expect(correrVista('dia', '2026-08-20', 1)).toBe('2026-08-21')
    expect(correrVista('semana', '2026-08-20', 1)).toBe('2026-08-27')
    expect(correrVista('semana', '2026-08-20', -1)).toBe('2026-08-13')
    expect(correrVista('mes', '2026-08-20', 1)).toBe('2026-09-01')
  })

  it('el título depende de la vista', () => {
    expect(tituloDeVista('mes', '2026-08-20')).toMatch(/^agosto (de )?2026$/)
    expect(tituloDeVista('semana', '2026-08-20')).toBe('17 al 23 de agosto de 2026')
    expect(tituloDeVista('dia', '2026-08-20')).toContain('20')
  })
})

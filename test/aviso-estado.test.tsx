// El aviso de estado: el mismo tono que la pastilla, pero para una FRASE.
//
// 🔴 **Lo que este archivo NO puede probar es justamente el desborde.** jsdom
// no hace layout: `getBoundingClientRect` devuelve ceros, así que "¿se sale del
// contenedor?" no se responde acá. Se midió en un navegador, con el CSS del
// build real de un producto y la frase real de la pantalla de ARCA:
//
//     contenedor  pastilla            bloque
//        900px    655px  entra        872px  entra
//        780px    655px  entra        752px  entra
//        600px    655px  SE SALE 83   572px  entra
//        420px    655px  SE SALE 263  392px  entra
//
// La pastilla mide **lo mismo pase lo que pase**: `whitespace-nowrap` le
// impide cortar y `w-fit shrink-0` le impiden achicar. El bloque siempre ocupa
// el ancho disponible. Lo reportó el humano el 2026-09-02 sobre la pantalla de
// ARCA de LibraCargo.
//
// Lo que sí se puede fijar acá es lo que hace que ese desborde sea IMPOSIBLE de
// volver a introducir: que el aviso no arrastre las tres clases de la pastilla.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AvisoEstado, BadgeEstado, TONOS_ESTADO, type TonoEstado } from '../src/badge-estado'

const TONOS = Object.keys(TONOS_ESTADO) as TonoEstado[]

// 🔴 **No se aserta que el aviso NO lleve `whitespace-nowrap`/`w-fit`/
// `shrink-0`.** Sería el chequeo obvio y no probaría nada: el stub de shadcn de
// `test/stubs` no aplica la cva, así que en este entorno la pastilla **tampoco**
// las lleva. El test pasaría por construcción y su control reventaría. Lo que se
// fija en cambio es lo que el aviso sí tiene —`w-full`, el tono, el
// `data-tono`— y, del otro lado, que la pantalla de ARCA lo use.

describe('AvisoEstado', () => {
  it('ocupa el ancho disponible en vez de el de su contenido', () => {
    render(<AvisoEstado tono="atencion">Algo</AvisoEstado>)
    expect(screen.getByText('Algo').className.split(/\s+/)).toContain('w-full')
  })

  it.each(TONOS)('usa el MISMO juego de tono que la pastilla (%s)', (tono) => {
    // 🔑 No se compara contra una copia de las clases: se compara contra lo que
    // la pastilla usa para ese tono. Así, cambiar un tono no puede dejar a los
    // dos componentes diciendo colores distintos para el mismo estado.
    render(
      <>
        <AvisoEstado tono={tono}>aviso</AvisoEstado>
        <BadgeEstado tono={tono}>pastilla</BadgeEstado>
      </>,
    )
    const delAviso = new Set(screen.getByText('aviso').className.split(/\s+/))
    for (const clase of TONOS_ESTADO[tono].split(/\s+/)) {
      expect(delAviso, `al aviso le falta ${clase}`).toContain(clase)
    }
  })

  it('marca el tono en el DOM, igual que la pastilla', () => {
    render(<AvisoEstado tono="ok">listo</AvisoEstado>)
    expect(screen.getByText('listo').dataset.tono).toBe('ok')
  })
})

// 🔴 **Lo que hay que proteger acá no son los íconos: es que esto NO sea una
// lista.**
//
// Hasta el 2026-08-24 `facturas.ts` tenía `MEDIOS_PAGO_LABELS`, una copia
// TypeScript de la lista del motor, y divergía en las dos direcciones: tenía
// `cheque` —que la canónica no ofrecía— y le faltaban las tarjetas. Como
// `FacturaDetalle` armaba con ella el fallback del selector de cobro, esa
// pantalla ofrecía medios que el backend rechazaba y escondía los que sí
// aceptaba.
//
// Una copia en el frontend **siempre** termina divergiendo, porque nada la
// compara con la del backend. La única defensa que sirve es que el frontend no
// tenga lista: los mapas de acá son lookups parciales con fallback, así que un
// medio nuevo en LibraCore aparece solo, y uno desconocido se dibuja igual.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ETIQUETA_CORTA, ICONO, ICONO_POR_DEFECTO, etiqueta, etiquetaCorta, iconoDe,
} from '../src/medios-pago'

describe('un medio que este módulo no conoce', () => {
  it('🔴 igual tiene ícono — el genérico, no `undefined`', () => {
    // Sin el fallback, `<Icono />` con `undefined` rompe la pantalla entera de
    // reportes. Es lo que pasaría al agregar un medio en LibraCore.
    expect(iconoDe('un_medio_que_no_existe')).toBe(ICONO_POR_DEFECTO)
  })

  it('🔴 igual se escribe, y con su slug crudo — sin maquillar', () => {
    // Nunca vacío ni "-": un medio que nadie nombró sólo se descubre si alguien
    // lo ve escrito, y ésta es la pantalla donde se cuadra la caja.
    //
    // Y **crudo**, no hecho título. Se probó humanizarlo (`un_medio` → "Un
    // medio") y estaba mal: así se lee como una etiqueta legítima y deja de ser
    // una señal de que falta nombrarlo.
    expect(etiquetaCorta('un_medio_que_no_existe')).toBe('un_medio_que_no_existe')
    expect(etiqueta('un_medio_que_no_existe')).toBe('un_medio_que_no_existe')
  })

  it('el control — un medio conocido sí tiene su ícono propio', () => {
    // Sin esto, "devolver siempre el genérico" pasaría el primer test.
    expect(iconoDe('efectivo')).not.toBe(ICONO_POR_DEFECTO)
  })
})

describe('la etiqueta que manda el backend', () => {
  const delMotor = { tarjeta_debito: 'Tarjeta de débito', invento: 'Lo Que Diga El Motor' }

  it('🔴 gana sobre lo que sepa el frontend, en la vista larga', () => {
    // El motor es la fuente. Si el frontend pisara su etiqueta, agregar un
    // medio allá no alcanzaría para que se vea bien acá.
    //
    // ⚠️ **El medio elegido importa**: acá había `invento`, que no está en
    // `ETIQUETA_CORTA`, así que el test pasaba con o sin la precedencia —
    // no había nada que pudiera ganarle. Lo delató la mutación. `tarjeta_debito`
    // sí está en las dos, y con textos distintos.
    expect(ETIQUETA_CORTA.tarjeta_debito).toBe('T. déb.')
    expect(etiqueta('tarjeta_debito', delMotor)).toBe('Tarjeta de débito')
    expect(etiqueta('invento', delMotor)).toBe('Lo Que Diga El Motor')
  })

  it('la abreviatura sí gana, porque el motor no la tiene', () => {
    // `etiquetaCorta` es para columnas angostas: "Tarjeta de débito" no entra.
    expect(etiquetaCorta('tarjeta_debito', delMotor)).toBe('T. déb.')
  })

  it('y si el frontend no tiene abreviatura, usa la larga del motor', () => {
    expect(etiquetaCorta('invento', delMotor)).toBe('Lo Que Diga El Motor')
  })
})

describe('las grafías históricas', () => {
  // Hay ventas viejas con estos medios y las grillas las muestran igual. Ver
  // `HISTORICOS` en `libracore.medios_pago`.
  it.each(['tarjeta', 'mercado_pago', 'debito', 'credito'])(
    '🔴 «%s» tiene abreviatura e ícono propios', (medio) => {
      expect(ETIQUETA_CORTA[medio]).toBeTruthy()
      expect(ICONO[medio]).toBeDefined()
    },
  )
})

describe('este módulo no declara la lista', () => {
  it('🔴 no exporta ningún array de medios', () => {
    // El guard que impide que la copia vuelva. Un `export const MEDIOS = [...]`
    // acá es exactamente el defecto que este módulo existe para cerrar: una
    // lista en el frontend que nada compara contra la del backend.
    const fuente = readFileSync(resolve(__dirname, '../src/medios-pago.ts'), 'utf8')
    const arraysExportados = fuente.match(/export const \w+\s*(:[^=]+)?=\s*\[/g) ?? []
    expect(arraysExportados).toEqual([])
  })

  it('el control — el guard reconocería un array si lo hubiera', () => {
    // Sin esto, un regex mal escrito daría una lista vacía siempre y el test de
    // arriba pasaría con la copia adentro.
    const ejemplo = 'export const MEDIOS: string[] = [\n  "efectivo",\n]'
    expect(ejemplo.match(/export const \w+\s*(:[^=]+)?=\s*\[/g)).toHaveLength(1)
  })
})

describe('facturas.ts ya no tiene su copia de la lista', () => {
  it('🔴 `MEDIOS_PAGO_LABELS` no vuelve', () => {
    // Era la copia que divergía. Que no exista es lo que obliga a
    // `FacturaDetalle` a pedirle la lista al motor.
    const fuente = readFileSync(resolve(__dirname, '../src/facturas.ts'), 'utf8')
    expect(fuente).not.toMatch(/export const MEDIOS_PAGO_LABELS/)
    // El control: el archivo se leyó de verdad y tiene contenido.
    expect(fuente).toMatch(/export type Factura/)
  })
})

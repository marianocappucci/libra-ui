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
  ETIQUETA_CORTA, ICONO, ICONO_POR_DEFECTO, esElectronico, etiqueta, etiquetaCorta,
  iconoDe,
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

describe('este módulo no declara EL VOCABULARIO', () => {
  it('🔴 no exporta ninguna lista de medios que pretenda ser la completa', () => {
    // El guard que impide que la copia vuelva. Un `export const MEDIOS = [...]`
    // acá es exactamente el defecto que este módulo existe para cerrar: una
    // lista en el frontend que nada compara contra la del backend.
    //
    // `MEDIOS_ELECTRONICOS` está exento **a propósito y por nombre**: no es el
    // vocabulario, es un SUBCONJUNTO —qué medios puede referenciar MercadoPago—
    // y espeja a `libracore.medios_pago.MEDIOS_ELECTRONICOS`. Exceptuarlo por
    // nombre y no por forma es lo que obliga a que el próximo que quiera agregar
    // una lista tenga que tocar este test y explicarse.
    const EXENTOS = new Set(['MEDIOS_ELECTRONICOS'])
    const fuente = readFileSync(resolve(__dirname, '../src/medios-pago.ts'), 'utf8')
    const arraysExportados = [...fuente.matchAll(/export const (\w+)\s*(?::[^=]+)?=\s*\[/g)]
      .map((m) => m[1])
      .filter((nombre) => !EXENTOS.has(nombre))
    expect(arraysExportados).toEqual([])
  })

  it('el control — el guard reconocería un array si lo hubiera', () => {
    // Sin esto, un regex mal escrito daría una lista vacía siempre y el test de
    // arriba pasaría con la copia adentro.
    const ejemplo = 'export const MEDIOS: string[] = [\n  "efectivo",\n]'
    expect([...ejemplo.matchAll(/export const (\w+)\s*(?::[^=]+)?=\s*\[/g)]).toHaveLength(1)
  })
})

describe('los medios electrónicos', () => {
  // Es lo que decide si se ofrece el botón de cobrar con QR. Sin una fila de
  // pago con uno de estos medios, `add_venta_pago_referencia_mp` no tiene dónde
  // sellar la referencia y **el pago se acredita en MercadoPago sin quedar
  // atado a la venta**.
  it.each(['mercadopago', 'billetera', 'cuenta_dni'])('«%s» lo es', (medio) => {
    expect(esElectronico(medio)).toBe(true)
  })

  it('🔴 las grafías históricas también', () => {
    // `qr` sólo existió dentro de un `WHERE ... IN (...)`, y `mercado_pago` es
    // la de VentaLibra. Hay filas con las dos, y el botón tiene que aparecer.
    expect(esElectronico('qr')).toBe(true)
    expect(esElectronico('mercado_pago')).toBe(true)
  })

  it('🔴 el control — el efectivo NO lo es', () => {
    // Sin esto, "devolver siempre true" pasaría todo lo de arriba, y la venta en
    // efectivo ofrecería un cobro por QR que no tiene dónde registrarse.
    expect(esElectronico('efectivo')).toBe(false)
    expect(esElectronico('transferencia')).toBe(false)
    expect(esElectronico('cuenta_corriente')).toBe(false)
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

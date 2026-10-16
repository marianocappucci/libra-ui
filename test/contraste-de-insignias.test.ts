// El texto blanco de una insignia o de un botón llena sobre un color de fondo: si el fondo es claro, no se lee (ADR-067).
//
// Lo medido en Chromium por el e2e de Contalibra (`modo-oscuro.e2e.ts`, 2026-10-15, kit 0.152.1; WCAG AA pide 4,5:1 para texto chico):
//   · «FC» del tipo de comprobante, `bg-sky-500 text-white` ............................ 2,71:1
//   · insignias del tipo de evento de Logs, blanco sobre el color que manda el motor ...... «Factura» 1,96 · «Turno» 2,57 · «Presupuesto» 2,13
//   · «Registrar pago», `bg-exito text-exito-foreground` (el éxito era #059669) ............ 3,77:1
// Los colores no cambian entre claro y oscuro, así que el defecto estaba en los dos modos.
//
// Tres cosas se fijan acá:
//   1. `fondoDeInsignia`, que resuelve los colores que vienen de DATOS (el motor): el texto sigue blanco y el fondo se oscurece lo justo, sin
//      cambiar de tono.
//   2. El éxito por defecto lleva texto blanco a 4,5:1 o más.
//   3. Un guard sobre el código: ninguna clase `bg-<color>-<tono> … text-white` del kit queda por debajo de 4,5:1, ni un `bg-destructive text-white`
//      sin su variante oscura (en oscuro el `destructive` de shadcn es un rojo claro y el blanco encima da ~2,9:1).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CONTRASTE_MINIMO_DE_INSIGNIA, estiloDeInsignia, fondoDeInsignia } from '../src/color-de-insignia'
import { COLORES_DE_TEMA, contraste, normalizarHex } from '../src/tema'

const BLANCO = '#ffffff'
const raiz = resolve(__dirname, '..')

/** Matiz HSL (0-360) de un `#rrggbb`. */
function matiz(hex: string): number {
  const n = normalizarHex(hex)!
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

// Los colores que manda `libracore.logs_router.TIPO_META` (v1.170.0) y los de las acciones de la auditoría: la paleta de Bootstrap.
const COLORES_DEL_MOTOR: Record<string, string> = {
  venta: '#0d6efd', caja: '#198754', stock: '#6f42c1', factura: '#0dcaf0', turno: '#fd7e14', remito: '#6c757d',
  presupuesto: '#20c997', actividad: '#d63384', borrar: '#dc3545',
}

describe('fondoDeInsignia: el texto blanco se lee sobre el color que mande el motor', () => {
  it('lo medido: tres de esos colores NO llegaban (factura 1,96 · turno 2,57 · presupuesto 2,13)', () => {
    expect(contraste(COLORES_DEL_MOTOR.factura, BLANCO)).toBeCloseTo(1.96, 1)
    expect(contraste(COLORES_DEL_MOTOR.turno, BLANCO)).toBeCloseTo(2.57, 1)
    expect(contraste(COLORES_DEL_MOTOR.presupuesto, BLANCO)).toBeCloseTo(2.13, 1)
  })

  for (const [tipo, color] of Object.entries(COLORES_DEL_MOTOR)) {
    it(`${tipo} (${color}): el blanco llega a 4,5:1 y el tono no cambia`, () => {
      const fondo = fondoDeInsignia(color)
      expect(contraste(fondo, BLANCO)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_DE_INSIGNIA)
      if (contraste(color, BLANCO) >= CONTRASTE_MINIMO_DE_INSIGNIA) {
        // Un color que ya llega queda EXACTAMENTE como lo mandó el motor.
        expect(fondo).toBe(color)
      } else {
        expect(fondo).not.toBe(color)
        expect(Math.abs(matiz(fondo) - matiz(color))).toBeLessThan(4)
      }
    })
  }

  it('acepta #rgb y mayúsculas, y devuelve siempre #rrggbb', () => {
    expect(fondoDeInsignia('#0DCAF0')).toBe(fondoDeInsignia('#0dcaf0'))
    expect(fondoDeInsignia('#fff')).toMatch(/^#[0-9a-f]{6}$/)
    expect(contraste(fondoDeInsignia('#fff'), BLANCO)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_DE_INSIGNIA)
  })

  it('un valor que no es un color (o ninguno) se pinta con un gris pizarra que se lee, no con un fondo que el navegador ignora', () => {
    for (const malo of [undefined, null, '', 'rojo', 'rgb(1,2,3)', '#12']) {
      const fondo = fondoDeInsignia(malo)
      expect(fondo).toBe('#475569')
      expect(contraste(fondo, BLANCO)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_DE_INSIGNIA)
    }
  })

  it('estiloDeInsignia trae el fondo ajustado y el texto blanco', () => {
    expect(estiloDeInsignia('#0dcaf0')).toEqual({ backgroundColor: fondoDeInsignia('#0dcaf0'), color: BLANCO })
  })
})

describe('el éxito: «Registrar pago» y todo `bg-exito text-exito-foreground`', () => {
  const exito = COLORES_DE_TEMA.find((d) => d.clave === 'exito')!

  it('lo medido: el éxito de antes (#059669) daba 3,77:1 con el texto blanco', () => {
    expect(contraste('#059669', BLANCO)).toBeCloseTo(3.77, 1)
  })

  it('el éxito por defecto lleva texto blanco a 4,5:1 o más, y el CSS declara el mismo valor que el catálogo', () => {
    expect(contraste(exito.porDefecto, BLANCO)).toBeGreaterThanOrEqual(4.5)
    const css = readFileSync(join(raiz, 'src/tema.css'), 'utf8')
    expect(css).toMatch(new RegExp(`--libra-exito:\\s*${exito.porDefecto};`))
    expect(css).toMatch(/--libra-exito-texto:\s*#ffffff;/)
  })

  it('el piso del texto sobre el éxito es AA: un verde claro que no admite blanco a 4,5 no se queda con blanco', () => {
    expect(exito.textoSobre?.contrasteMinimo).toBe(4.5)
  })
})

// ── El guard sobre el código ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Los tonos de Tailwind v4 (los de `tailwindcss/theme.css`, 4.3.3; el e2e midió `sky-500` = rgb(0, 166, 244), que es #00a6f4). Sólo los tonos que
// pueden llevar texto blanco; si el guard encuentra uno que no está, falla pidiendo que se agregue acá, no lo da por bueno.
const PALETA: Record<string, Record<number, string>> = {
  red: { 400: '#ff6467', 500: '#fb2c36', 600: '#e7000b', 700: '#c10007', 800: '#9f0712' },
  orange: { 400: '#ff8904', 500: '#ff6900', 600: '#f54900', 700: '#ca3500', 800: '#9f2d00' },
  amber: { 400: '#ffb900', 500: '#fe9a00', 600: '#e17100', 700: '#bb4d00', 800: '#973c00' },
  yellow: { 400: '#fdc700', 500: '#f0b100', 600: '#d08700', 700: '#a65f00', 800: '#894b00' },
  lime: { 400: '#9ae600', 500: '#7ccf00', 600: '#5ea500', 700: '#497d00', 800: '#3c6300' },
  green: { 400: '#05df72', 500: '#00c950', 600: '#00a63e', 700: '#008236', 800: '#016630' },
  emerald: { 400: '#00d492', 500: '#00bc7d', 600: '#009966', 700: '#007a55', 800: '#006045' },
  teal: { 400: '#00d5be', 500: '#00bba7', 600: '#009689', 700: '#00786f', 800: '#005f5a' },
  cyan: { 400: '#00d3f2', 500: '#00b8db', 600: '#0092b8', 700: '#007595', 800: '#005f78' },
  sky: { 400: '#00bcff', 500: '#00a6f4', 600: '#0084d1', 700: '#0069a8', 800: '#00598a' },
  blue: { 400: '#51a2ff', 500: '#2b7fff', 600: '#155dfc', 700: '#1447e6', 800: '#193cb8' },
  indigo: { 400: '#7c86ff', 500: '#615fff', 600: '#4f39f6', 700: '#432dd7', 800: '#372aac' },
  violet: { 400: '#a684ff', 500: '#8e51ff', 600: '#7f22fe', 700: '#7008e7', 800: '#5d0ec0' },
  purple: { 400: '#c27aff', 500: '#ad46ff', 600: '#9810fa', 700: '#8200db', 800: '#6e11b0' },
  fuchsia: { 400: '#ed6aff', 500: '#e12afb', 600: '#c800de', 700: '#a800b7', 800: '#8a0194' },
  pink: { 400: '#fb64b6', 500: '#f6339a', 600: '#e60076', 700: '#c6005c', 800: '#a3004c' },
  rose: { 400: '#ff637e', 500: '#ff2056', 600: '#ec003f', 700: '#c70036', 800: '#a50036' },
  slate: { 400: '#90a1b9', 500: '#62748e', 600: '#45556c', 700: '#314158', 800: '#1d293d' },
  gray: { 400: '#99a1af', 500: '#6a7282', 600: '#4a5565', 700: '#364153', 800: '#1e2939' },
  zinc: { 400: '#9f9fa9', 500: '#71717b', 600: '#52525c', 700: '#3f3f46', 800: '#27272a' },
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return /\.tsx?$/.test(nombre) ? [ruta] : []
  })
}

type Hallazgo = { donde: string; motivo: string }

/** Las líneas del kit que pintan texto blanco sobre un fondo que NO se lee, o que no se pueden juzgar. */
function insigniasIlegibles(): Hallazgo[] {
  const malas: Hallazgo[] = []
  for (const ruta of archivos(join(raiz, 'src'))) {
    const rel = relative(raiz, ruta)
    // `Tutorial` pinta SIEMPRE su insignia con `text-white` y recibe el fondo por prop (`bg-[#007eb6]` en una constante, otra línea): ahí se mide todo.
    const siempreBlanco = rel.endsWith('configuracion/tutoriales.tsx')
    readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
      if (!siempreBlanco && !/(?<![\w:-])text-white\b/.test(linea)) return
      const donde = `${rel}:${i + 1}`
      // 1. Un tono de la paleta de Tailwind (`bg-sky-500`, `dark:bg-sky-700`): se mide.
      for (const m of linea.matchAll(/(?<![\w-])((?:dark:)?)bg-([a-z]+)-(\d{3})(?![\w/-])/g)) {
        const [, prefijo, color, tono] = m
        const hex = PALETA[color]?.[Number(tono)]
        if (!hex) {
          malas.push({ donde, motivo: `bg-${color}-${tono} con texto blanco: ese tono no está en PALETA, agregalo para medirlo` })
        } else if (contraste(hex, BLANCO) < CONTRASTE_MINIMO_DE_INSIGNIA) {
          malas.push({ donde, motivo: `${prefijo}bg-${color}-${tono} (${hex}) con texto blanco da ${contraste(hex, BLANCO).toFixed(2)}:1` })
        }
      }
      // 2. Un color fijo entre corchetes (`bg-[#009ee3]`).
      for (const m of linea.matchAll(/(?<![\w-])bg-\[(#[0-9a-fA-F]{3,6})\]/g)) {
        const hex = normalizarHex(m[1])
        if (!hex || contraste(hex, BLANCO) < CONTRASTE_MINIMO_DE_INSIGNIA) {
          malas.push({ donde, motivo: `bg-[${m[1]}] con texto blanco da ${hex ? contraste(hex, BLANCO).toFixed(2) : '?'}:1` })
        }
      }
      // 3. Un token que cambia con el modo: en oscuro `destructive` y `muted-foreground` son claros. Tiene que decir qué hace en oscuro.
      for (const token of ['destructive', 'muted-foreground']) {
        if (new RegExp(`(?<![\\w:-])bg-${token}(?![\\w/-])`).test(linea) && !new RegExp(`dark:bg-${token}`).test(linea)) {
          malas.push({ donde, motivo: `bg-${token} con texto blanco y sin variante dark:: en oscuro el blanco sobre ese fondo no llega a 4,5:1` })
        }
      }
    })
  }
  return malas
}

describe('guard: ninguna insignia del kit lleva texto blanco sobre un fondo que no se lee', () => {
  it('las clases `bg-<color>-<tono> … text-white`, `bg-[#hex] … text-white` y `bg-destructive … text-white` llegan a 4,5:1 (en claro y en oscuro)', () => {
    expect(insigniasIlegibles()).toEqual([])
  })

  it('el guard sabe leer: encuentra el defecto de antes (bg-sky-500 text-white) en un texto de ejemplo', () => {
    const f = "className: 'bg-sky-500 text-white'"
    expect(contraste(PALETA.sky[500], BLANCO)).toBeCloseTo(2.71, 1)
    expect(/(?<![\w-])((?:dark:)?)bg-([a-z]+)-(\d{3})(?![\w/-])/.test(f)).toBe(true)
  })

  it('las insignias que antes no llegaban: el tono nuevo, en claro, llega', () => {
    const nuevos: [string, number][] = [['sky', 700], ['emerald', 700], ['cyan', 700], ['amber', 700], ['slate', 600]]
    for (const [c, t] of nuevos) {
      expect(contraste(PALETA[c][t], BLANCO), `${c}-${t}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

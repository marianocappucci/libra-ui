// Vencimientos y lotes sin scroll de costado (0.152.1, ADR-065): las dos tablas del reporte (lotes y «Sin lote / sin fecha») son la tabla cuando entran y tarjetas cuando no, con los botones de
// acción («Dar de baja», «Asignar vencimiento», «Conciliar») dentro de cada tarjeta: antes scrolleaban por dentro de su Card y el botón quedaba fuera de la pantalla en el celular.
// jsdom no mide el layout, así que el ancho se simula con un `ResizeObserver` falso que informa el que fije cada test (lo medido en Chromium está en el ADR-065).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Vencimientos } from '../src/comercio/Vencimientos'
import { _reiniciarPendientesEnMemoria } from '../src/comercio/vencimientos-pendientes'
import type { VencimientoLote, VencimientoSinLote, VencimientosData } from '../src/comercio/tipos'
import { montar, prepararFetch, responder } from './helpers-pantallas'

const lote = (o: Partial<VencimientoLote>): VencimientoLote => ({
  producto_id: 1, codigo: null, nombre: '', unidad: 'u', categoria: '', deposito_id: 1, deposito: 'Depósito Centro',
  deposito_activo: true, sucursal_id: 1, sucursal: 'Centro', variante_id: null, variante: null, lote: null, vence: '2026-10-01',
  dias_para_vencer: 1, saldo: 0, estado: 'por_vencer', ...o,
})
const sinLote = (o: Partial<VencimientoSinLote>): VencimientoSinLote => ({
  producto_id: 6, codigo: null, nombre: '', unidad: 'u', categoria: '', deposito_id: 1, deposito: 'Depósito Centro',
  deposito_activo: true, sucursal_id: 1, sucursal: 'Centro', variante_id: null, variante: null, saldo: 0, situacion: 'sin_fecha', ...o,
})

const YERBA = lote({ producto_id: 1, codigo: 'Y-1', nombre: 'Yerba', categoria: 'Almacén', lote: 'L1', vence: '2026-09-25', dias_para_vencer: -5, saldo: 4, estado: 'vencido' })
const LECHE = lote({
  producto_id: 4, codigo: null, nombre: 'Leche', lote: null, vence: '2026-10-01', dias_para_vencer: 1, saldo: 1234.5,
  deposito_id: 3, deposito: 'Depósito viejo', deposito_activo: false, sucursal_id: null, sucursal: null,
})
const ARROZ = sinLote({ producto_id: 6, codigo: 'A-1', nombre: 'Arroz', saldo: 20, variante_id: 2, variante: 'x1kg', categoria: 'Almacén' })
const FIDEOS = sinLote({ producto_id: 8, nombre: 'Fideos', saldo: -3, situacion: 'salidas_sin_lote' })

const DATA: VencimientosData = {
  sucursal_id: null, deposito_id: null, categoria: null, producto_id: null, incluir_vencidos: true, hoy: '2026-09-30', dias: 15, hasta: '2026-10-15',
  resumen: {
    lotes_por_vencer: 1, lotes_vencidos: 1, unidades_por_vencer: 1234.5, unidades_vencidas: 4, productos: 2, productos_sin_lote: 2,
    productos_con_salidas_sin_lote: 1, saldos_sin_fecha: 1, saldos_con_salidas_sin_lote: 1,
  },
  lotes: [YERBA, LECHE],
  sin_lote: [FIDEOS, ARROZ],
}

const RUTA = '/api/vencimientos'
const TODO = {
  [RUTA]: DATA, '/api/sucursales': [], '/api/productos/categorias': [], '/api/productos': [],
  'GET /api/vencimientos/conciliacion': { status: 404, detail: 'sin propuesta' },
}

let anchoSimulado = 0
class ObservadorFalso {
  constructor(private readonly cb: (e: { contentRect: { width: number } }[]) => void) {}
  observe() { this.cb([{ contentRect: { width: anchoSimulado } }]) }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  cleanup()
  prepararFetch()
  _reiniciarPendientesEnMemoria()
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
})
afterEach(() => { vi.unstubAllGlobals() })

async function abrir(ancho: number, props: { puedeMover?: boolean; puedeMermar?: boolean; puedeConciliar?: boolean } = { puedeConciliar: true }) {
  anchoSimulado = ancho
  responder(TODO)
  montar('/vencimientos', <Vencimientos {...props} />)
  await screen.findByText('2 lotes')
}
const tarjetasDe = (nombre: string) => within(screen.getByRole('list', { name: nombre })).getAllByRole('listitem')
const clases = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/)
/** El contenedor de los botones con texto de una tarjeta. */
const accionesDe = (tarjeta: HTMLElement) => tarjeta.querySelector('button')!.parentElement

describe('Vencimientos: tabla o tarjetas según el ancho', () => {
  it('con ancho de sobra son las dos tablas de siempre, con sus botones y sin tarjetas', async () => {
    await abrir(1600)
    expect(screen.getAllByRole('table')).toHaveLength(2)
    expect(screen.queryByRole('list', { name: 'Lotes por vencer' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Sin lote o sin fecha' })).toBeNull()
    expect(screen.getByRole('button', { name: /Dar de baja \(merma\) Yerba/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Asignar vencimiento Arroz/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Conciliar Fideos/ })).toBeTruthy()
  })

  it('a 341 px (un celular) no hay tablas: cada lote es una tarjeta con sus datos y su «Dar de baja»', async () => {
    await abrir(341)
    expect(screen.queryByRole('table')).toBeNull()
    const [yerba, leche] = tarjetasDe('Lotes por vencer')
    expect(tarjetasDe('Lotes por vencer')).toHaveLength(2)
    expect(within(yerba).getByText('Yerba')).toBeTruthy()
    expect(within(yerba).getByText('Almacén')).toBeTruthy()
    expect(within(yerba).getByText('Vencido hace 5 días')).toBeTruthy()
    expect(within(yerba).getByText('Código').nextElementSibling!.textContent).toBe('Y-1')
    expect(within(yerba).getByText('Sucursal / depósito').nextElementSibling!.textContent).toBe('Centro · Depósito Centro')
    expect(within(yerba).getByText('Lote').nextElementSibling!.textContent).toBe('L1')
    expect(within(yerba).getByText('Vence').nextElementSibling!.textContent).toContain('2026')
    expect(within(yerba).getByText('Saldo').nextElementSibling!.textContent).toContain('4')
    expect(within(yerba).getByRole('button', { name: 'Dar de baja (merma) Yerba, lote L1' })).toBeTruthy()
    // Lo que la fila de la tabla dice con un guion o con una marca, la tarjeta también.
    expect(within(leche).getByText('Código').nextElementSibling!.textContent).toBe('—')
    expect(within(leche).getByText('Lote').nextElementSibling!.textContent).toBe('—')
    expect(within(leche).getByText('Depósito inactivo')).toBeTruthy()
    expect(within(leche).getByRole('button', { name: 'Dar de baja (merma) Leche, lote sin código' })).toBeTruthy()
  })

  it('a 341 px «Sin lote / sin fecha» son tarjetas: «Conciliar» en las salidas sin lote, «Asignar vencimiento» en las sin fecha', async () => {
    await abrir(341)
    const [fideos, arroz] = tarjetasDe('Sin lote o sin fecha')
    expect(tarjetasDe('Sin lote o sin fecha')).toHaveLength(2)

    expect(within(fideos).getByText('Fideos')).toBeTruthy()
    expect(within(fideos).getByText('Salidas sin lote')).toBeTruthy()
    expect(within(fideos).getByText('Saldo sin lote').nextElementSibling!.textContent).toContain('-3')
    expect(clases(within(fideos).getByText('Saldo sin lote').nextElementSibling!.firstElementChild)).toContain('text-destructive')
    expect(within(fideos).getByRole('button', { name: /Conciliar Fideos/ })).toBeTruthy()
    expect(within(fideos).queryByRole('button', { name: /Asignar vencimiento/ })).toBeNull()

    expect(within(arroz).getByText('Arroz')).toBeTruthy()
    expect(within(arroz).getByText('x1kg · Almacén')).toBeTruthy()
    expect(within(arroz).getByText('Sin fecha')).toBeTruthy()
    expect(within(arroz).getByText('Código').nextElementSibling!.textContent).toBe('A-1')
    expect(within(arroz).getByText('Saldo sin lote').nextElementSibling!.textContent).toContain('20')
    expect(within(arroz).getByRole('button', { name: /Asignar vencimiento Arroz \(x1kg\), Centro · Depósito Centro/ })).toBeTruthy()
    expect(within(arroz).queryByRole('button', { name: /Conciliar/ })).toBeNull()
  })

  it('los botones de la tarjeta son de 44 px de alto con el rótulo entero (no el cuadrado de los de ícono) y la fila se parte', async () => {
    await abrir(341)
    for (const [lista, n] of [['Lotes por vencer', 0], ['Sin lote o sin fecha', 0], ['Sin lote o sin fecha', 1]] as const) {
      const c = clases(accionesDe(tarjetasDe(lista)[n]))
      expect(c).toContain('[&_button]:min-h-11')
      expect(c).toContain('flex-wrap')
      expect(c).not.toContain('[&_button]:size-11')
    }
  })

  it('los botones de las tarjetas hacen lo mismo que los de la tabla: abren su diálogo', async () => {
    const user = userEvent.setup()
    await abrir(341)
    await user.click(within(tarjetasDe('Lotes por vencer')[0]).getByRole('button', { name: /Dar de baja/ }))
    expect(await screen.findByRole('dialog', { name: /Dar de baja \(merma\)/ })).toBeTruthy()
    cleanup()
    await abrir(341)
    await user.click(within(tarjetasDe('Sin lote o sin fecha')[1]).getByRole('button', { name: /Asignar vencimiento/ }))
    expect(await screen.findByRole('dialog', { name: /Asignar vencimiento/ })).toBeTruthy()
    cleanup()
    await abrir(341)
    await user.click(within(tarjetasDe('Sin lote o sin fecha')[0]).getByRole('button', { name: /Conciliar/ }))
    expect(await screen.findByRole('dialog', { name: /Conciliar salidas sin lote/ })).toBeTruthy()
  })

  it('cada tabla pasa a tarjetas con su propio ancho: a 900 px la de lotes (necesita más) es tarjetas y la de «sin lote» sigue siendo tabla', async () => {
    await abrir(900)
    expect(screen.getByRole('list', { name: 'Lotes por vencer' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Sin lote o sin fecha' })).toBeNull()
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(within(screen.getByRole('table')).getByText('Fideos')).toBeTruthy()
  })

  it('sin permisos no hay botones ni fila de acciones vacía en las tarjetas', async () => {
    await abrir(341, { puedeMover: false, puedeMermar: false, puedeConciliar: false })
    for (const tarjeta of [...tarjetasDe('Lotes por vencer'), ...tarjetasDe('Sin lote o sin fecha')]) {
      expect(within(tarjeta).queryByRole('button')).toBeNull()
      expect(tarjeta.querySelector('[class*="min-h-11"]')).toBeNull()
    }
  })

  it('sólo puedeMover: las salidas sin lote no tienen botón (no hay qué asignar) y no dejan una fila de acciones vacía', async () => {
    await abrir(341, { puedeMover: true, puedeMermar: false, puedeConciliar: false })
    const [fideos, arroz] = tarjetasDe('Sin lote o sin fecha')
    expect(within(fideos).queryByRole('button')).toBeNull()
    expect(fideos.querySelector('[class*="min-h-11"]')).toBeNull()
    expect(within(arroz).getByRole('button', { name: /Asignar vencimiento/ })).toBeTruthy()
  })

  it('sin medida (sin ResizeObserver) se queda en las tablas', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    await abrir(341)
    expect(screen.getAllByRole('table')).toHaveLength(2)
    expect(screen.queryByRole('list', { name: 'Lotes por vencer' })).toBeNull()
  })

  it('en la tabla el orden por columna sigue andando (las tarjetas no lo tienen)', async () => {
    const user = userEvent.setup()
    await abrir(1600)
    await user.click(within(screen.getAllByRole('table')[0]).getByRole('button', { name: /^Saldo/ }))
    expect(within(screen.getAllByRole('table')[0]).getAllByRole('row')[1].textContent).toContain('Leche')
  })
})

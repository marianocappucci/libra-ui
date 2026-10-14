// La celda «Importe» del historial de movimientos de stock (ADR-063). Qué dice y cuándo aparece: `importes-de-merma.ts`.
import { importeDeMovimiento } from './importes-de-merma'
import type { MovimientoStock } from './tipos'

/** El importe de la merma, «—» y «sin costo» si no tiene costo cargado, o nada en los demás movimientos. */
export function ImporteDeMerma({ movimiento }: { movimiento: MovimientoStock }) {
  const i = importeDeMovimiento(movimiento)
  if (!i) return null
  if (i.importe !== null) return <span className="font-medium">{i.importe}</span>
  return (
    <span title="Esta merma no tiene costo cargado: no suma al importe">
      —{' '}<span className="text-xs text-amber-600 dark:text-amber-400">sin costo</span>
    </span>
  )
}

// La pastilla de estado de la familia Libra.
//
// El criterio, fijado por el humano el 2026-08-21 y validado contra una muestra
// renderizada: **el color de la fuente y el del borde son EL MISMO**, el borde
// es solido y se ve (1 px, no `border-transparent`), y el fondo es ese mismo
// tono mucho mas suave. Antes de esto cada producto resolvia sus estados a
// mano y convivian tres estilos distintos en la misma tabla: variantes solidas
// de shadcn (`Cobrada` en negro), tintes sin borde (`bg-emerald-500/15`) y
// solidos de color (`bg-emerald-600 text-white`).
//
// Por que 10% en claro y 15% en oscuro: son las intensidades que se eligieron
// mirando las tres opciones (6 / 10 / 16) sobre fondo blanco. `bg-<tono>/10`
// compone alfa sobre la superficie en vez de mezclar con blanco fijo, asi que
// la pastilla sigue funcionando sobre una fila con hover; se midio contra la
// mezcla opaca y la diferencia es de 5/255 por canal, imperceptible.
//
// Por que `atencion` usa amber-800 y no amber-700 como el resto usa su 700:
// amber-700 sobre su propio fondo al 10% da 4.39:1 de contraste, abajo del
// 4.5:1 que pide WCAG AA para texto normal. Con amber-800 el peor contraste
// del juego pasa a ser 4.66:1. **No “emparejar” este 800 con el resto sin
// volver a medir.**
//
// El vocabulario de estados es de cada producto (`Cobrada`, `Sin stock`,
// `Turno abierto`): lo que se comparte aca es el TONO, no el nombre del
// estado. Cada producto mapea sus estados a estos cinco tonos.
import type { ComponentProps } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Cada entrada nombra el mismo token de color en `border-` y en `text-` — que
// sean iguales ES la regla, y hay un guard en los tests que lo sostiene.
export const TONOS_ESTADO = {
  ok: 'border-emerald-700 text-emerald-700 bg-emerald-700/10 dark:border-emerald-400 dark:text-emerald-400 dark:bg-emerald-400/15',
  atencion: 'border-amber-800 text-amber-800 bg-amber-800/10 dark:border-amber-400 dark:text-amber-400 dark:bg-amber-400/15',
  negativo: 'border-red-700 text-red-700 bg-red-700/10 dark:border-red-400 dark:text-red-400 dark:bg-red-400/15',
  curso: 'border-blue-700 text-blue-700 bg-blue-700/10 dark:border-blue-400 dark:text-blue-400 dark:bg-blue-400/15',
  neutro: 'border-slate-600 text-slate-600 bg-slate-600/10 dark:border-slate-400 dark:text-slate-400 dark:bg-slate-400/15',
} as const

export type TonoEstado = keyof typeof TONOS_ESTADO

type BadgeEstadoProps = Omit<ComponentProps<typeof Badge>, 'variant'> & {
  tono: TonoEstado
}

// Se monta sobre la variante `ghost` a proposito: es la unica que no trae
// `bg-` ni `text-` propios, asi que el tono no depende de que `tailwind-merge`
// gane un conflicto contra la variante `default`. El `border-transparent` de
// la clase base si lo pisa el `border-<tono>`, que es el mismo grupo.
export function BadgeEstado({ tono, className, ...props }: BadgeEstadoProps) {
  return <Badge variant="ghost" data-tono={tono} className={cn(TONOS_ESTADO[tono], className)} {...props} />
}

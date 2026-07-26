// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era byte-idéntico -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

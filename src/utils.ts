// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era byte-idéntico -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza para comparar: sin mayusculas y sin acentos.
 *
 * Sin lo segundo, "Admision" no encuentra "Admision" con tilde -- y en un
 * sistema en castellano con datos cargados a mano eso es la mitad de las
 * busquedas que fallarian. Se sacan las marcas combinantes despues de
 * descomponer (NFD).
 *
 * `\p{M}` y no un rango escrito a mano: ese rango se escribe con caracteres
 * invisibles en el editor y cualquier reformateo se los come sin que se note.
 */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * ¿El texto contiene TODOS los terminos de la consulta, en cualquier orden?
 *
 * Vive aca y no en cada componente para que el buscador de la tabla y el de
 * los selects filtren con el mismo criterio: quien aprende a buscar en una
 * pantalla busca igual en la otra.
 *
 * Una consulta vacia (o de puros espacios) no filtra nada.
 */
export function coincideBusqueda(texto: string, consulta: string): boolean {
  const terminos = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (!terminos.length) return true
  const objetivo = normalizar(texto)
  return terminos.every((t) => objetivo.includes(t))
}

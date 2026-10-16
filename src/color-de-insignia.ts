// El color de fondo de una insignia que viene de DATOS (el motor manda de cada tipo de evento su color: `tipo_meta`, `acciones`) y el texto
// que se lee encima. ADR-067.
//
// 🔴 La insignia llevaba `text-white` fijo sobre el color que mandara el motor, y los colores del motor son los de Bootstrap (`#0dcaf0`, `#fd7e14`,
// `#20c997`...): blanco sobre ellos da 1,96:1 («Factura»), 2,57:1 («Turno») y 2,13:1 («Presupuesto»), medido en Chromium por el e2e de
// Contalibra (WCAG AA pide 4,5:1 para texto chico). El motor no sabe de contraste y no tiene por qué saberlo: el kit lo resuelve al pintar.
//
// La regla: el texto sigue siendo blanco (el criterio visual de la suite: insignias llenas, sobrias) y el FONDO se oscurece lo justo, en la
// misma dirección que su tono, hasta que el blanco llegue a 4,5:1 (`ajustarContraste`, que mezcla con negro de a poco y no cambia el matiz).
// Un color que ya llega (el rojo, el violeta, el azul) queda EXACTAMENTE como el motor lo mandó. Un valor que no es un color se pinta con un
// gris pizarra: preferible a un fondo que el navegador no entiende y un texto blanco sobre nada.
import { ajustarContraste, contraste, normalizarHex } from './tema'

/** WCAG AA para texto normal. */
export const CONTRASTE_MINIMO_DE_INSIGNIA = 4.5

const TEXTO = '#ffffff'
/** slate-600: el tono «neutro» de `badge-estado`. Blanco sobre él da 7,6:1. */
const SIN_COLOR = '#475569'

/** El fondo a pintar para el color que mandó el motor: el mismo si el texto blanco ya se lee, el más cercano más oscuro si no. */
export function fondoDeInsignia(color: string | null | undefined): string {
  const hex = normalizarHex(color)
  if (!hex) return SIN_COLOR
  return contraste(hex, TEXTO) >= CONTRASTE_MINIMO_DE_INSIGNIA ? hex : ajustarContraste(hex, TEXTO, CONTRASTE_MINIMO_DE_INSIGNIA)
}

/** `style` para una `<Badge>` cuyo color viene de datos: el fondo ajustado y el texto blanco. */
export function estiloDeInsignia(color: string | null | undefined): { backgroundColor: string; color: string } {
  return { backgroundColor: fondoDeInsignia(color), color: TEXTO }
}

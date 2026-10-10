/** Ayudas de los tests de la tarjeta de ARCA, que desde 0.135.0 va en pestañas (ADR-047): lo que no está en General se
 *  encuentra después de abrir su pestaña, como en pantalla. */
import { screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

type Usuario = ReturnType<typeof userEvent.setup>

/** Abre una pestaña de la tarjeta por su nombre (el nombre accesible incluye su etiqueta de estado: «Producción Cargado»). */
export async function abrirPestana(usuario: Usuario, nombre: RegExp | string) {
  const pestana = await screen.findByRole('tab', { name: nombre })
  await usuario.click(pestana)
  return pestana
}

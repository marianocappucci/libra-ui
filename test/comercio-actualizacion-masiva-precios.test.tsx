// Actualización masiva de precios (roadmap de producto de VentaLibra, 2026-09-28): sube la
// planilla, muestra la vista previa (costo/venta antes → después, qué no matcheó) y aplica.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'

import { ActualizacionMasivaPrecios } from '../src/comercio/ActualizacionMasivaPrecios'
import type { ResultadoPlanilla } from '../src/comercio/tipos'
import { fetchMock, montar, pedidas, prepararFetch, responder } from './helpers-pantallas'

const ARCHIVO = new File(['contenido'], 'precios.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})

const RESULTADO: ResultadoPlanilla = {
  actualizaciones: [
    { producto_id: 1, codigo: '111', nombre: 'Yerba', costo_actual: 1000, costo_nuevo: 1200, venta_actual: 1500, venta_nueva: 1800, margen_calculado: true },
    { producto_id: 2, codigo: '222', nombre: 'Fideos', costo_actual: 0, costo_nuevo: 500, venta_actual: 800, venta_nueva: 800, margen_calculado: false },
  ],
  no_encontrados: [{ codigo: '999', motivo: 'Ningún producto activo tiene este código.' }],
}

beforeEach(() => {
  cleanup()
  prepararFetch()
})

async function subir() {
  const user = userEvent.setup()
  montar('/actualizacion-masiva', <ActualizacionMasivaPrecios />)
  const input = screen.getByLabelText('Planilla de precios')
  await user.upload(input, ARCHIVO)
  return user
}

it('sube la planilla y muestra la vista previa', async () => {
  responder({ 'POST /api/actualizacion-masiva/precios/preview': RESULTADO })
  await subir()

  await screen.findByText('Yerba')
  expect(screen.getByText('Fideos')).toBeInTheDocument()
  expect(screen.getByText(/Vista previa: 2 productos/)).toBeInTheDocument()
  expect(screen.getByText(/1 código sin producto/)).toBeInTheDocument()
  expect(screen.getByText('999 — Ningún producto activo tiene este código.')).toBeInTheDocument()

  // El archivo elegido viajó en el FormData de la vista previa, no como JSON.
  const llamada = fetchMock.mock.calls[pedidas().findIndex((p) => p.startsWith('POST /api/actualizacion-masiva/precios/preview'))]
  const form = llamada[1].body as FormData
  expect(form.get('archivo')).toBe(ARCHIVO)
})

it('el producto sin costo previo se muestra sin cambios en la venta', async () => {
  responder({ 'POST /api/actualizacion-masiva/precios/preview': RESULTADO })
  await subir()
  await screen.findByText('Fideos')
  expect(screen.getByText(/sin cambios: no había costo previo/)).toBeInTheDocument()
})

it('aplicar reenvía la misma planilla al endpoint de aplicar', async () => {
  const user = userEvent.setup()
  responder({
    'POST /api/actualizacion-masiva/precios/preview': RESULTADO,
    'POST /api/actualizacion-masiva/precios/aplicar': RESULTADO,
  })
  montar('/actualizacion-masiva', <ActualizacionMasivaPrecios />)
  const input = screen.getByLabelText('Planilla de precios')
  await user.upload(input, ARCHIVO)
  await screen.findByText('Yerba')

  await user.click(screen.getByRole('button', { name: /Aplicar/ }))
  await waitFor(() => expect(screen.getByText(/2 productos actualizados/)).toBeInTheDocument())

  const indiceAplicar = pedidas().findIndex((p) => p.startsWith('POST /api/actualizacion-masiva/precios/aplicar'))
  expect(indiceAplicar).toBeGreaterThanOrEqual(0)
  const form = fetchMock.mock.calls[indiceAplicar][1].body as FormData
  expect(form.get('archivo')).toBe(ARCHIVO)
})

it('un error de la API se muestra sin romper la pantalla', async () => {
  responder({
    'POST /api/actualizacion-masiva/precios/preview': { status: 422, detail: 'La planilla no tiene ninguna fila con código y costo.' },
  })
  await subir()
  await screen.findByText('La planilla no tiene ninguna fila con código y costo.')
})

it('elegir otra planilla borra el resultado anterior', async () => {
  const user = userEvent.setup()
  responder({ 'POST /api/actualizacion-masiva/precios/preview': RESULTADO })
  await subir()
  await screen.findByText('Yerba')

  await user.click(screen.getByRole('button', { name: /Elegir otra/ }))
  expect(screen.queryByText('Yerba')).not.toBeInTheDocument()
})

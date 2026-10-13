// El diálogo de ajuste de Stock muestra las cantidades como las lee una persona (0.145.0, ADR-057): «Stock actual», el mínimo y «Stock resultante» con el mismo
// formateador del kit (`formatoCantidad`), no con el `formatEntero` del producto.
// `formatEntero` es de cada producto (`@/lib/utils`) y los productos lo escriben redondeando a entero (VentaLibra: `String(Math.round(value))`): un producto en kg con 14,15
// mostraba «14» arriba y «14,15» en «Stock resultante». El stub de este paquete no redondea, así que acá se lo reemplaza por el del producto para que el test lo reproduzca.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Stock } from '../src/comercio/Stock'
import type { StockItem } from '../src/comercio/tipos'
import { prepararFetch, responder } from './helpers-pantallas'

vi.mock('@/lib/utils', async (original) => ({
  ...(await original<typeof import('../test/stubs/lib/utils')>()),
  formatEntero: (valor: number) => String(Math.round(valor)),
}))

const HARINA: StockItem = { id: 3, codigo: null, nombre: 'Harina', unidad: 'kg', categoria: '', stock_minimo: 2.5, activo: 1, stock_actual: 14.15 }
const SAL: StockItem = { id: 4, codigo: null, nombre: 'Sal', unidad: 'u', categoria: '', stock_minimo: 0, activo: 1, stock_actual: 3 }

beforeEach(() => {
  cleanup()
  prepararFetch()
  responder({ '/api/stock': { productos: [HARINA, SAL], alertas: [] }, '/api/stock/motivos-merma': [], '/api/stock/movimientos': [] })
})

async function abrirAjuste(nombre: string) {
  const user = userEvent.setup()
  render(<MemoryRouter><Stock /></MemoryRouter>)
  const fila = (await screen.findByText(nombre)).closest('tr')!
  await user.click(within(fila).getByLabelText('Ajustar stock'))
  return { user, dialogo: await screen.findByRole('dialog') }
}

describe('Stock: el diálogo de ajuste y las cantidades con decimales', () => {
  it('«Stock actual» y el mínimo salen con decimales (14,15 kg y 2,5), igual que «Stock resultante», y no redondeados a «14» y «3»', async () => {
    const { dialogo } = await abrirAjuste('Harina')
    expect(within(dialogo).getByText('Stock actual (kg)').previousElementSibling!.textContent).toBe('14,15')
    expect(within(dialogo).getByText('Mínimo').previousElementSibling!.textContent).toBe('2,5')
    // En el modo «Fijar en…» la cantidad arranca en el stock actual: las dos cifras tienen que ser la misma.
    expect(within(dialogo).getByText(/Stock resultante:/).textContent).toBe('Stock resultante: 14,15 kg')
  })

  it('una entrada de 0,1 no deja ruido de coma flotante (14,15 + 0,1 = 14.250000000000002)', async () => {
    const { user, dialogo } = await abrirAjuste('Harina')
    await user.click(within(dialogo).getByRole('button', { name: 'Entrada' }))
    await user.type(within(dialogo).getByRole('spinbutton', { name: /Cantidad/ }), '0.1')
    expect(within(dialogo).getByText(/Stock resultante:/).textContent).toBe('Stock resultante: 14,25 kg')
  })

  it('un producto en unidades enteras no cambia: 3 y no 3,0', async () => {
    const { dialogo } = await abrirAjuste('Sal')
    expect(within(dialogo).getByText('Stock actual (u)').previousElementSibling!.textContent).toBe('3')
    expect(within(dialogo).getByText(/Stock resultante:/).textContent).toBe('Stock resultante: 3 u')
  })
})

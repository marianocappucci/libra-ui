// La bandeja de MercadoPago (2026-08-27), extraída de Contalibra y Restolibra
// —508 líneas cada una, con **una** línea de diferencia— y adoptada además por
// LibraClub, que así no llegó a ser la tercera copia.
//
// Lo que se prueba acá son **las costuras que creó la extracción**, no la
// pantalla entera: que las llamadas sigan yendo al mismo prefijo que los tres
// productos montan, que el badge que difería quedara en el de la familia, que
// la constante fiscal que se mudó al kit siga llegando al selector, y que la
// fecha se siga formateando con el helper del producto y no con uno propio.
//
// 🔴 **El modo de fallar de una extracción como ésta es mudo.** Una URL mal
// copiada no rompe el build ni la pantalla: el botón queda ahí, se aprieta, y
// el error que vuelve es un 404 que parece del servidor.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MpBandeja } from '../src/MpBandeja'
import type { Cliente, MpMovimiento, MpPago } from '../src/mp'

const CLIENTE: Cliente = {
  id: 5, name: 'Ana Perez', address: '', cuit_dni: '20111111112',
  email: 'ana@ejemplo.com', phone: '', iva_condition: 'Consumidor Final',
  auto_facturar: 0, activo: 1,
}

const PAGO_PENDIENTE: MpPago = {
  id: 11, mp_payment_id: '9001', monto: 14000,
  payer_email: 'juan@ejemplo.com', payer_name: 'Juan Gomez',
  payment_type: 'account_money', payment_method: 'mercadopago',
  descripcion_mp: 'Cobro', payer_id_type: 'DNI', payer_id_number: '30111111',
  estado_factura: 'pendiente', factura_id: null,
  created_at: '2026-08-27T10:00:00-03:00', cliente: null,
}

const PAGO_FACTURADO: MpPago = {
  ...PAGO_PENDIENTE, id: 12, estado_factura: 'facturado', factura_id: 77,
  cliente: CLIENTE,
}

const TRANSFERENCIA: MpMovimiento = {
  id: 21, mp_movement_id: 'M-3', tipo: 'bank_transfer', monto: 9500,
  fecha: '2026-08-27', descripcion: 'Transferencia recibida',
  origen_nombre: 'Comercio SRL', origen_banco: 'bind', origen_cbu: '',
  payer_email: '', payer_name: '', payer_id_type: null, payer_id_number: null,
  estado_factura: 'pendiente', factura_id: null,
  created_at: '2026-08-27T09:00:00-03:00', cliente: null,
}

/** Con email del pagador pero sin ficha: la rama del medio de la columna
 *  Cliente, la única que ofrece dar de alta con el dato que ya vino. */
const TRANSFERENCIA_CON_EMAIL: MpMovimiento = {
  ...TRANSFERENCIA, id: 22, mp_movement_id: 'M-4', fecha: '2026-08-26',
  payer_email: 'pagador@ejemplo.com', payer_name: 'Pagador Anonimo',
  origen_nombre: '',
}

const BANDEJA = {
  pendientes: [PAGO_PENDIENTE],
  historial: [PAGO_FACTURADO],
  transferencias: [TRANSFERENCIA, TRANSFERENCIA_CON_EMAIL],
  transferencias_hist: [],
  mp_concepto_default: 'Servicio',
}

let fetchMock: ReturnType<typeof vi.fn>

/** Una `Response` de verdad: `api-client` decide si parsear mirando los
 *  headers, así que un doble sin ellos hace que la pantalla muestre «Error de
 *  conexión» y el test falle por el mock y no por el código. */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function urles(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]))
}

beforeEach(() => {
  cleanup()
  fetchMock = vi.fn(() => Promise.resolve(json(BANDEJA)))
  vi.stubGlobal('fetch', fetchMock)
})

async function montar() {
  const r = render(<MemoryRouter><MpBandeja /></MemoryRouter>)
  await screen.findByText('Pagos MercadoPago')
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  return r
}

/** El botón *Sincronizar* y el selector de días viven en la pestaña «Cobros
 *  sincronizados», no en la que abre por defecto. */
async function enCobros(user: ReturnType<typeof userEvent.setup>) {
  await montar()
  await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))
  return screen.findByRole('button', { name: /sincronizar/i })
}

describe('la bandeja compartida', () => {
  it('🔴 todas sus llamadas van al prefijo que los tres productos montan', async () => {
    // El backend ya estaba unificado antes que la pantalla: los tres productos
    // arman `libracore.mp_bandeja_router` bajo `/api/mp-bandeja`. Ese acuerdo
    // es lo único que hace compartible este componente — una URL que se le
    // escape lo vuelve a atar a un producto.
    const user = userEvent.setup()
    await user.click(await enCobros(user))
    await waitFor(() => expect(urles().length).toBeGreaterThan(1))

    const ajenas = urles().filter((u) => !u.includes('/api/mp-bandeja'))
    expect(ajenas).toEqual([])
    // El control: sin esto, una lista vacía de llamadas pasaría igual.
    expect(urles().length).toBeGreaterThan(1)
  })

  it('sincronizar manda los días que dice el campo', async () => {
    const user = userEvent.setup()
    const boton = await enCobros(user)
    await user.selectOptions(screen.getByRole('combobox'), '30')
    await user.click(boton)

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/sincronizar'),
      )
      if (!llamada) throw new Error('no se llamó a /sincronizar')
      expect(JSON.parse(String(llamada[1].body))).toEqual({ dias: 30 })
    })
  })

  it('🔑 el estado del historial usa el badge de la familia, no el de shadcn', async () => {
    // **Ésta es la única línea en la que las dos copias diferían**: Contalibra
    // resolvía la columna con `BadgeEstado` y Restolibra con un `Badge` de
    // shadcn. Se unificó en el de la familia, que es el que ya usaban las otras
    // tres columnas de esta misma pantalla. `data-tono` lo pone `BadgeEstado` y
    // sólo él, así que esto distingue de verdad cuál de los dos quedó.
    await montar()
    const badge = await screen.findByText('Facturado')
    expect(badge.closest('[data-tono]')?.getAttribute('data-tono')).toBe('ok')
  })

  it('el comprobante del historial linkea al detalle del producto', async () => {
    await montar()
    expect(await screen.findByRole('link', { name: /ver factura/i }))
      .toHaveAttribute('href', '/facturas/77')
  })

  it('facturar un cobro pega en el endpoint de ESE cobro', async () => {
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    const facturarCobro = await screen.findAllByRole('button', { name: /facturar/i })
    await user.click(facturarCobro[0])

    await waitFor(() => {
      expect(urles()).toContain('/api/mp-bandeja/movimientos/21/facturar')
    })
    // El control: el id sale de la fila, no de una constante. Si viajara
    // cualquier otro, esta pantalla facturaría el cobro equivocado.
    expect(urles()).not.toContain('/api/mp-bandeja/movimientos/11/facturar')
  })

  it('ignorar un pago pendiente pega en el endpoint de ESE pago', async () => {
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /pendientes de factura/i }))

    await user.click(await screen.findByRole('button', { name: /ignorar/i }))

    await waitFor(() => {
      expect(urles()).toContain('/api/mp-bandeja/pagos/11/ignorar')
    })
  })

  it('🔴 la fecha se formatea con el helper del PRODUCTO', async () => {
    // El kit no trae formateador de presentación a propósito: `src/fechas.ts`
    // dice que `dd-mm-aaaa` vive en el helper único de cada producto. Este
    // componente lo toma de `@/lib/fechas`, que resuelve contra el consumidor.
    // Si alguien lo reemplazara por un formateador propio del kit, los tres
    // productos perderían su única fuente de formato y esto se pondría rojo.
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    expect(await screen.findByText('27-08-2026')).toBeInTheDocument()
  })

  it('🔑 el alta de cliente ofrece las condiciones de IVA que se mudaron al kit', async () => {
    // `IVA_CONDITIONS` estaba escrita dos veces, idéntica, en el `api.ts` de
    // cada producto. Al mudarla acá, que llegue al selector es lo que separa
    // «se movió» de «se movió y quedó desconectada»: el formulario compilaría
    // igual con una lista vacía.
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /pendientes de factura/i }))
    await user.click(await screen.findByRole('button', { name: /dar de alta|crear cliente/i }))

    const alta = await screen.findByText('Dar de alta cliente')
    const tarjeta = alta.closest('div')!.parentElement!
    expect(within(tarjeta).getByRole('option', { name: 'Responsable Inscripto' }))
      .toBeInTheDocument()
    expect(within(tarjeta).getByRole('option', { name: 'IVA No Responsable' }))
      .toBeInTheDocument()
  })

  it('dar de alta un cliente manda los datos tipeados, a ESE movimiento', async () => {
    // El alta desde la bandeja es el paso que convierte un cobro anónimo en algo
    // facturable. Si el id de la fila no viajara, se le crearía la ficha al
    // movimiento equivocado y el cobro seguiría sin cliente.
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    const altas = await screen.findAllByRole('button', { name: /dar de alta/i })
    await user.click(altas[0])
    await screen.findByText('Dar de alta cliente')

    // Ver la nota de arriba: sin `htmlFor` no hay `getByLabelText` que valga.
    const campos = screen.getAllByRole('textbox')
    await user.clear(campos[0])
    await user.type(campos[0], 'Comercio SRL')
    await user.type(screen.getByPlaceholderText('Para enviar la factura'), 'compras@comercio.com')
    await user.clear(screen.getByPlaceholderText('DNI / CUIT'))
    await user.type(screen.getByPlaceholderText('DNI / CUIT'), 'CUIT')
    await user.type(campos[3], '30712345678')
    await user.type(screen.getByPlaceholderText('Opcional'), 'Av. Siempreviva 742')

    // El botón que confirma se llama igual que el link de cada fila, así que
    // hay que apuntarlo dentro de su propia tarjeta.
    const tarjeta = (await screen.findByText('Dar de alta cliente'))
      .closest('div')!.parentElement!
    await user.click(within(tarjeta).getByRole('button', { name: /^dar de alta$/i }))

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/crear-cliente'),
      )
      if (!llamada) throw new Error('no se llamó a /crear-cliente')
      expect(String(llamada[0])).toBe('/api/mp-bandeja/movimientos/21/crear-cliente')
      const cuerpo = JSON.parse(String(llamada[1].body))
      expect(cuerpo.nombre).toBe('Comercio SRL')
      expect(cuerpo.email).toBe('compras@comercio.com')
      expect(cuerpo.iva_condition).toBe('Consumidor Final')
      // El CUIT decide a nombre de quién sale el comprobante: si no viajara,
      // la factura saldría a un nombre sin identificación fiscal.
      expect(cuerpo.cuit_dni).toBe('30712345678')
      expect(cuerpo.address).toBe('Av. Siempreviva 742')
    })
  })

  it('cargar el email de un emisor anónimo lo guarda en ESE movimiento', async () => {
    // Una transferencia bancaria llega sin email: sin cargarlo no hay a quién
    // mandarle el comprobante, y es la única forma de completarlo desde acá.
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    await user.click(await screen.findByRole('button', { name: /cargar email/i }))
    await user.type(
      screen.getByPlaceholderText('email@ejemplo.com'), 'tesoreria@comercio.com',
    )
    await user.click(screen.getByRole('button', { name: /^guardar$/i }))

    await waitFor(() => {
      expect(urles()).toContain('/api/mp-bandeja/movimientos/21/guardar-datos')
    })
  })

  it('reenviar el comprobante pega en el endpoint de ESA factura', async () => {
    const user = userEvent.setup()
    await montar()

    await user.click(await screen.findByRole('button', { name: /reenviar email/i }))

    await waitFor(() => {
      expect(urles()).toContain('/api/mp-bandeja/facturas/77/reenviar')
    })
    expect(await screen.findByText(/email reenviado/i)).toBeInTheDocument()
  })

  it('facturar un pago pendiente pega en el endpoint de ESE pago', async () => {
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /pendientes de factura/i }))

    await user.click(await screen.findByRole('button', { name: /facturar/i }))

    await waitFor(() => {
      expect(urles()).toContain('/api/mp-bandeja/pagos/11/facturar')
    })
  })

  it('la columna Fecha de los cobros ordena por la fecha real, no por el texto', async () => {
    // `accessorFn` cae al `created_at` cuando el movimiento no trae `fecha`.
    // Sin ella, ordenar usaría el campo crudo y las transferencias sin fecha
    // quedarían todas juntas al principio.
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    await user.click(await screen.findByRole('button', { name: /fecha/i }))
    expect(await screen.findByText('27-08-2026')).toBeInTheDocument()
  })

  it('🔴 cancelar un alta no escribe nada', async () => {
    // El formulario se abre con los datos del pagador ya cargados, así que
    // «Cancelar» tiene que ser exactamente eso: cerrar. Un cancelar que
    // igualmente postea daría de alta un cliente que nadie pidió, con los datos
    // que vinieron del cobro.
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    const altas = await screen.findAllByRole('button', { name: /dar de alta/i })
    await user.click(altas[0])
    const tarjeta = (await screen.findByText('Dar de alta cliente'))
      .closest('div')!.parentElement!
    await user.click(within(tarjeta).getByRole('button', { name: /cancelar/i }))

    await waitFor(() => {
      expect(screen.queryByText('Dar de alta cliente')).not.toBeInTheDocument()
    })
    expect(urles().filter((u) => u.includes('/crear-cliente'))).toEqual([])
  })

  it('🔴 cancelar la carga de email tampoco escribe nada', async () => {
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    await user.click(await screen.findByRole('button', { name: /cargar email/i }))
    const tarjeta = (await screen.findByText('Datos del emisor'))
      .closest('div')!.parentElement!
    await user.type(within(tarjeta).getAllByRole('textbox')[0], 'Otro Nombre')
    await user.click(within(tarjeta).getByRole('button', { name: /cancelar/i }))

    await waitFor(() => {
      expect(screen.queryByText('Datos del emisor')).not.toBeInTheDocument()
    })
    expect(urles().filter((u) => u.includes('/guardar-datos'))).toEqual([])
  })

  it('ignorar un cobro sincronizado pega en el endpoint de ESE movimiento', async () => {
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    const ignorar = await screen.findAllByRole('button', { name: /ignorar/i })
    await user.click(ignorar[0])

    await waitFor(() => {
      expect(urles()).toContain('/api/mp-bandeja/movimientos/21/ignorar')
    })
  })

  it('el alta desde un cobro con email arranca con ese email cargado', async () => {
    // La rama del medio de la columna Cliente. El dato ya vino en el cobro:
    // volver a tipearlo es donde se cuela un error de transcripción, y encima
    // el email es por donde después se manda el comprobante.
    const user = userEvent.setup()
    await montar()
    await user.click(screen.getByRole('tab', { name: /cobros sincronizados/i }))

    const altas = await screen.findAllByRole('button', { name: /dar de alta/i })
    await user.click(altas[1])

    await screen.findByText('Dar de alta cliente')
    expect(screen.getByPlaceholderText('Para enviar la factura'))
      .toHaveValue('pagador@ejemplo.com')
  })

  it('un error de la API se muestra con su detalle, no como error de conexión', async () => {
    const user = userEvent.setup()
    const boton = await enCobros(user)
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(json({ detail: 'MercadoPago no contesta.' }, 502)),
    )

    await user.click(boton)

    expect(await screen.findByText('MercadoPago no contesta.')).toBeInTheDocument()
  })
})

/** El alta de cliente del motor (`POST /api/clientes` de `libracore.clientes_router`), en la forma que pide `SelectCliente` (ADR-071).
 *
 *  La usan las pantallas del kit (Ventas, Presupuesto, Remito) y los productos que guardan sus clientes en el motor —Contalibra, Restolibra,
 *  VentaLibra—, para que el payload `{name, cuit_dni, iva_condition, …}` esté escrito una sola vez. */
import { api } from '../api-client'
import type { CampoDeAlta, ClienteNuevo } from '../SelectCliente'
import { opcionesCliente, type ClienteDeVenta } from './tipos'

/** Lo que pide el motor en el alta rápida: lo fiscal va porque con estos clientes se factura. */
export const CAMPOS_CLIENTE_DEL_MOTOR: CampoDeAlta[] = ['documento', 'condicionIva', 'telefono', 'email']

export function crearClienteDelMotor(d: ClienteNuevo): Promise<ClienteDeVenta> {
  return api.post<ClienteDeVenta>('/api/clientes', {
    name: d.nombre, cuit_dni: d.documento, iva_condition: d.condicionIva, email: d.email, phone: d.telefono,
  })
}

/** El `crear` de `SelectCliente` para los clientes del motor: da el alta, lo suma a la lista de la pantalla y devuelve su opción. */
export function crearYSumar<C extends ClienteDeVenta>(sumar: (c: C) => void) {
  return async (d: ClienteNuevo) => {
    const c = (await crearClienteDelMotor(d)) as C
    sumar(c)
    return opcionesCliente([c])[0]
  }
}

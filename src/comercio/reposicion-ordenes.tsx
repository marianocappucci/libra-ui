// Órdenes de compra en borrador desde la reposición sugerida (0.105.0, motor >= 0.34.0, ADR-022 del motor).
//
// Un diálogo que resume qué se va a crear (una orden por proveedor habitual, con los productos de la lista que hay que pedir), lo crea con
// `POST /api/reportes/reposicion/ordenes` y muestra las órdenes creadas. **Nunca envía ni confirma nada**: son borradores para revisar.
//
// Lo que se confirma es lo que se ve: el cuerpo lleva los `producto_ids` de las filas con proveedor que hay que pedir y, como `topes`, la cantidad que se
// mostró de cada una. Si los datos cambiaron mientras tanto el motor puede crear menos (lo que ya no hay que pedir vuelve en `omitidos`) pero nunca más
// de lo que se vio.
//
// 🔑 **La `clave_operacion` la guarda la pantalla y se conserva hasta que el motor contesta bien (`onResuelta`).** Si el pedido se cortó (timeout, red) y no se
// sabe si el motor lo creó, reintentar —aun cerrando y reabriendo el diálogo— manda la misma clave y el motor devuelve las mismas órdenes en vez de crear
// otras (`repetida: true`). Después de una respuesta buena la clave se descarta: la próxima apertura es otra operación, y lo ya creado cuenta como «en camino».
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api-client'
import type { GenerarOrdenesResultado, ReposicionProducto } from './tipos'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, FilePlus2 } from 'lucide-react'

const RUTA_ORDENES = '/api/reportes/reposicion/ordenes'

/** Lo que de la consulta de la pantalla viaja al motor para que calcule lo mismo que se ve. */
export type ParametrosDeOrdenes = {
  dias_rotacion: number; dias_cobertura: number; plazo_entrega_dias: number
  sucursal_id?: number; categoria?: string; proveedor_id?: number
}

function numero(valor: number | string): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 10 }).format(Number(valor))
}

function moneda(valor: string): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(valor))
}

function mensajeDeError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Error de conexión. Podés reintentar: si la orden ya se había creado, no se duplica.'
  if (err.status === 503) return 'El servidor todavía no tiene los proveedores por producto (falta la migración del motor).'
  return err.detail
}

/** Lo que se va a crear, de las filas que se ven: por proveedor, y aparte lo que no tiene proveedor. */
function resumenDeOrdenes(filas: ReposicionProducto[]) {
  const aPedir = filas.filter((p) => p.sugerido > 0)
  const grupos = new Map<number, { proveedor: string; productos: ReposicionProducto[] }>()
  const sinProveedor: ReposicionProducto[] = []
  for (const p of aPedir) {
    if (p.proveedor_id === null || p.proveedor_id === undefined) { sinProveedor.push(p); continue }
    const g = grupos.get(p.proveedor_id) ?? { proveedor: p.proveedor || `Proveedor ${p.proveedor_id}`, productos: [] }
    g.productos.push(p)
    grupos.set(p.proveedor_id, g)
  }
  return { grupos: [...grupos.values()], sinProveedor }
}

export function DialogoGenerarOrdenes({ filas, parametros, clave, rutaDeOrden, onCerrar, onCreadas, onResuelta }: {
  filas: ReposicionProducto[]
  parametros: ParametrosDeOrdenes
  /** La `clave_operacion` de este intento: la guarda quien abre el diálogo, para que sobreviva a un cierre tras un corte. */
  clave: string
  rutaDeOrden?: (id: number) => string
  onCerrar: () => void
  /** Se llama tras toda respuesta buena del motor (con órdenes nuevas, las de un reintento o ninguna): la pantalla recarga la lista, que ya cuenta lo creado como pedido. */
  onCreadas: () => void
  /** El motor contestó bien: la clave ya cumplió y se descarta. */
  onResuelta: () => void
}) {
  const { grupos, sinProveedor } = useMemo(() => resumenDeOrdenes(filas), [filas])
  const [enVuelo, setEnVuelo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<GenerarOrdenesResultado | null>(null)
  const aPedir = useMemo(() => grupos.flatMap((g) => g.productos), [grupos])

  async function generar() {
    setEnVuelo(true)
    setError(null)
    try {
      const r = await api.post<GenerarOrdenesResultado>(RUTA_ORDENES, {
        ...parametros, clave_operacion: clave, producto_ids: aPedir.map((p) => p.producto_id),
        topes: Object.fromEntries(aPedir.map((p) => [p.producto_id, p.sugerido])),
      })
      setResultado(r)
      onResuelta()
      // Se recarga tras CUALQUIER respuesta buena (también la de cero órdenes: si lo sugerido cambió, la lista de fondo ya está vieja).
      onCreadas()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnVuelo(false)
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enVuelo) onCerrar() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{resultado ? 'Órdenes en borrador' : 'Generar órdenes en borrador'}</DialogTitle>
          <DialogDescription>
            {resultado
              ? 'Quedaron como borrador: revisalas, completá lo que falte y enviálas desde Compras.'
              : 'Se crea una orden por proveedor habitual con lo que hay que pedir. Son borradores: no se envían ni se confirman.'}
          </DialogDescription>
        </DialogHeader>

        {!resultado && (
          <div className="grid gap-3 text-sm">
            {grupos.length === 0 ? (
              <p role="status" className="text-muted-foreground">
                Ningún producto de la lista tiene proveedor habitual y algo que pedir. Asignale un proveedor a cada producto desde Productos.
              </p>
            ) : (
              <ul className="grid gap-2">
                {grupos.map((g) => (
                  <li key={g.proveedor} className="rounded-md border p-3">
                    <p className="font-medium">{g.proveedor} <span className="font-normal text-muted-foreground">· {g.productos.length} producto{g.productos.length !== 1 ? 's' : ''}</span></p>
                    <p className="text-xs text-muted-foreground">{g.productos.map((p) => `${p.nombre} (${numero(p.sugerido)})`).join(', ')}</p>
                  </li>
                ))}
              </ul>
            )}
            {sinProveedor.length > 0 && (
              <p role="status" className="flex gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {sinProveedor.length} producto{sinProveedor.length !== 1 ? 's' : ''} sin proveedor habitual no entra{sinProveedor.length !== 1 ? 'n' : ''} en
                  ninguna orden: {sinProveedor.map((p) => p.nombre).join(', ')}.
                </span>
              </p>
            )}
          </div>
        )}

        {resultado && (
          <div className="grid gap-3 text-sm">
            {resultado.repetida && (
              <p role="status" className="text-xs text-muted-foreground">Estas órdenes ya se habían creado con este mismo pedido: no se duplicó nada.</p>
            )}
            {resultado.ordenes.length === 0 ? (
              <p role="status" className="text-muted-foreground">No había nada para crear: lo que hay que pedir ya está en una orden o dejó de hacer falta.</p>
            ) : (
              <ul className="grid gap-2">
                {resultado.ordenes.map((o) => (
                  <li key={o.id} className="rounded-md border p-3">
                    <p className="font-medium">
                      {rutaDeOrden ? <Link className="underline" to={rutaDeOrden(o.id)} onClick={onCerrar}>{o.number}</Link> : o.number}
                      <span className="font-normal text-muted-foreground"> · {o.proveedor ?? `Proveedor ${o.proveedor_id}`} · {o.lineas.length} línea{o.lineas.length !== 1 ? 's' : ''} · {moneda(o.total)}</span>
                    </p>
                    {o.lineas.some((l) => l.costo_cero) && (
                      <p className="mt-1 flex gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>Sin costo cargado, completalo antes de enviar: {o.lineas.filter((l) => l.costo_cero).map((l) => l.nombre).join(', ')}.</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {resultado.sin_proveedor.length > 0 && (
              <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
                Sin proveedor habitual, no entraron: {resultado.sin_proveedor.map((p) => p.nombre).join(', ')}.
              </p>
            )}
            {resultado.omitidos.length > 0 && (
              <p role="status" className="text-xs text-muted-foreground">
                {resultado.omitidos.length} producto{resultado.omitidos.length !== 1 ? 's' : ''} ya no hacía{resultado.omitidos.length !== 1 ? 'n' : ''} falta y se omitió{resultado.omitidos.length !== 1 ? 'eron' : ''}.
              </p>
            )}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {resultado ? (
            <Button type="button" onClick={onCerrar}>Cerrar</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onCerrar} disabled={enVuelo}>Cancelar</Button>
              <Button type="button" onClick={generar} disabled={enVuelo || grupos.length === 0}>
                <FilePlus2 />{enVuelo ? 'Generando…' : `Crear ${grupos.length} ${grupos.length === 1 ? 'orden' : 'órdenes'}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

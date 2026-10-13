// Listado de órdenes de compra, al 100% del ancho -- misma forma que Ventas:
// título a la izquierda, "Nueva compra" arriba a la derecha, tabla completa
// abajo y el detalle en su propia ruta (`CompraDetalle.tsx`).
//
// Extraída de `pages/Compras.tsx` de VentaLibra (F9, 2026-09-27): el único
// producto de la familia con este módulo (ver el docstring de `tipos.ts`).
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '../data-table'
import { Plus } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { sortableHeader } from '../data-table'
import { TablaOTarjetas, TarjetaDeFila } from '../tabla-o-tarjetas'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'
import { SelectBuscable } from '../SelectBuscable'
import { formatoMonto } from '../formatos'
import {
  llegoElCosto, opcionesProveedor, PURCHASE_ORDER_STATUS_LABELS, PURCHASE_ORDER_STATUS_TONO,
  type Proveedor, type PurchaseOrder,
} from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

/** El total de la orden, o `null` si no se puede calcular: alguna línea llegó sin `subtotal` (el rol no tiene `costos.ver`). */
function totalDe(order: PurchaseOrder): number | null {
  let total = 0
  for (const linea of order.items) {
    if (!llegoElCosto(linea.subtotal)) return null
    total += Number(linea.subtotal)
  }
  return Number.isFinite(total) ? total : null
}

/** `$1.234,50`, o «—» si el total no se puede calcular. Nunca «$NaN». */
function textoDelTotal(order: PurchaseOrder): string {
  const total = totalDe(order)
  return total === null ? '—' : `$${formatoMonto(total)}`
}

/** El botón "Nueva compra" y su modal: sólo elige proveedor y crea la orden
 *  vacía -- las líneas se cargan recién en el detalle, al que se navega
 *  apenas se crea (mismo criterio que "Nueva venta"). */
function NuevaCompraDialog({
  suppliers, onCreada,
}: { suppliers: Proveedor[]; onCreada: (orden: PurchaseOrder) => void }) {
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function abrir() {
    setSupplierId('')
    setError(null)
    setOpen(true)
  }

  async function crear() {
    if (!supplierId) return
    setSaving(true)
    setError(null)
    try {
      const creada = await api.post<PurchaseOrder>('/api/purchase-orders', {
        proveedor_id: Number(supplierId),
      })
      setOpen(false)
      onCreada(creada)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button onClick={abrir}><Plus />Nueva compra</Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva compra</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid gap-2">
              <Label>Proveedor</Label>
              <SelectBuscable
                value={supplierId}
                onChange={setSupplierId}
                opciones={opcionesProveedor(suppliers)}
                placeholder="Elegí un proveedor…"
                ariaLabel="Proveedor"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={saving || !supplierId}>{saving ? 'Creando…' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export type ComprasProps = {
  /** A dónde lleva el click en una fila y la creación de una orden nueva. */
  rutaDelDetalle?: (id: number) => string
  /** Si la persona puede crear órdenes de compra (`compras.escribir` en VentaLibra). Con `false` no se ofrece «Nueva compra»: el depósito lee las
   *  órdenes pero el motor le contesta 403 al alta. Sin la prop (`true`), la pantalla es la de siempre. */
  puedeEscribir?: boolean
}

export function Compras({ rutaDelDetalle = (id) => `/compras/${id}`, puedeEscribir = true }: ComprasProps) {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [o, s] = await Promise.all([
        api.get<PurchaseOrder[]>('/api/purchase-orders'),
        api.get<Proveedor[]>('/api/proveedores'),
      ])
      setOrders(o)
      setSuppliers(s)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  function supplierName(supplierId: number): string {
    return suppliers.find((s) => s.id === supplierId)?.nombre ?? `#${supplierId}`
  }

  function irAlDetalle(orden: PurchaseOrder) {
    navigate(rutaDelDetalle(orden.id))
  }

  // Ninguna línea de ninguna orden trae `subtotal`: el rol no ve costos (`costos.ver`) y la columna «Total» sólo mostraría «—» (o «$NaN»). Mismo criterio que
  // `Productos.sinCosto`. Sin líneas no hay con qué decidir: la columna queda (el total de una orden vacía es 0).
  const lineas = orders.flatMap((o) => o.items)
  const sinCosto = lineas.length > 0 && lineas.every((l) => !llegoElCosto(l.subtotal))

  // Anchos fijos al contenido real + Proveedor elastica, mismo patron que el
  // resto de la familia (ver Catalogo/Productos.tsx).
  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(() => [
    { accessorKey: 'number', header: sortableHeader('Número'), size: 130, minSize: 100, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    {
      id: 'proveedor',
      header: 'Proveedor',
      minSize: 140,
      meta: { stretch: true },
      cell: ({ row }) => <span className="block truncate">{supplierName(row.original.proveedor_id)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      size: 140,
      minSize: 110,
      cell: ({ row }) => (
        <BadgeEstado tono={PURCHASE_ORDER_STATUS_TONO[row.original.status] ?? 'neutro'}>
          {PURCHASE_ORDER_STATUS_LABELS[row.original.status] ?? row.original.status}
        </BadgeEstado>
      ),
    },
    { id: 'lineas', header: 'Líneas', size: 90, minSize: 80, cell: ({ row }) => row.original.items.length },
    ...(sinCosto ? [] : [{ id: 'total', header: 'Total', size: 130, minSize: 100, cell: ({ row }) => textoDelTotal(row.original) } as ColumnDef<PurchaseOrder>]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [suppliers, sinCosto])

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={ICONOS.ordenesDeCompra}>Compras</TituloPantalla>
        {puedeEscribir && <NuevaCompraDialog suppliers={suppliers} onCreada={irAlDetalle} />}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent>
          {/* Sin columna de acciones: la fila entera lleva al detalle. En la tarjeta lo hace el número, un link de 44 px de alto. Ver ADR-057. */}
          <TablaOTarjetas
            columns={columns}
            data={orders}
            cargando={loading}
            clave={(o) => o.id}
            etiqueta="Órdenes de compra"
            emptyMessage="Sin órdenes de compra todavía."
            onRowClick={irAlDetalle}
            tarjeta={(o) => (
              <TarjetaDeFila
                titulo={<Link to={rutaDelDetalle(o.id)} className="inline-flex min-h-11 items-center text-primary hover:underline">{o.number}</Link>}
                subtitulo={supplierName(o.proveedor_id)}
                estado={(
                  <BadgeEstado tono={PURCHASE_ORDER_STATUS_TONO[o.status] ?? 'neutro'}>
                    {PURCHASE_ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </BadgeEstado>
                )}
                datos={[
                  { etiqueta: 'Líneas', valor: o.items.length },
                  ...(sinCosto ? [] : [{ etiqueta: 'Total', valor: textoDelTotal(o) }]),
                ]}
              />
            )}
            // Mismo buscador que Clientes/Proveedores/Productos.
            search={{
              campos: (o) => [o.number, supplierName(o.proveedor_id)],
              placeholder: 'Buscar por número o proveedor',
              ariaLabel: 'Buscar orden de compra',
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

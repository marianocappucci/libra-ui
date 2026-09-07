// El listado de remitos, con búsqueda por número, cliente u observaciones.
//
// Extraída de Contalibra y Restolibra (el pase de comprobantes al kit, 2026-09-07). Las dos copias eran
// idénticas salvo comentarios y el orden de los imports; lo que de verdad difería
// entra por props. LibraDesk tiene sus propias pantallas de remitos y presupuestos,
// que son otra implementación (13-40 % de similitud) y no se tocan.
//
// De paso: el «Limpiar» recargaba con el closure viejo — la búsqueda de antes de
// limpiarla—, el mismo defecto que ya habían tenido Ventas y TesoreriaDetalle.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { api, ApiError } from './api-client'
import { type Remito } from './facturas'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { anchoColumnaAcciones, DataTable, sortableHeader } from './data-table'
import { FileText, Plus, Search, X, Eye, FileDown } from 'lucide-react'
import { TituloPantalla } from './titulo-pantalla'

export function Remitos({ urlDelPdf = (id: number) => `/remitos/${id}/pdf` }: {
  /** El PDF lo sirve el router del producto, no la API. */
  urlDelPdf?: (id: number) => string
} = {}) {
  const [remitos, setRemitos] = useState<Remito[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => { load() }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function load(busqueda = q) {
    setLoading(true)
    setError(null)
    try {
      setRemitos(await api.get<Remito[]>(`/api/remitos${busqueda ? `?q=${encodeURIComponent(busqueda)}` : ''}`))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  function limpiarBusqueda() {
    setQ('')
    // Con la búsqueda vacía explícita: `setTimeout(load, 0)` corría el `load` de
    // esta pintura, que todavía tiene la `q` vieja en su closure, y la lista volvía
    // filtrada. Mismo defecto que tenían Ventas (P9-M3) y TesoreriaDetalle (P9-M5).
    load('')
  }

  const columns = useMemo<ColumnDef<Remito>[]>(() => [
    { accessorKey: 'number', header: sortableHeader('Número'), size: 120, minSize: 100, cell: ({ row }) => <span className="font-mono text-sm">{row.original.number}</span> },
    { accessorKey: 'date', header: 'Fecha', size: 100, minSize: 90 },
    { accessorKey: 'client_name', header: 'Cliente', size: 160, minSize: 90, meta: { stretch: true }, cell: ({ row }) => <span className="block truncate" title={row.original.client_name ?? undefined}>{row.original.client_name}</span> },
    {
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      size: anchoColumnaAcciones(2),
      minSize: anchoColumnaAcciones(2),
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button asChild size="icon" variant="outline" title="Ver remito">
            <Link to={`/remitos/${row.original.id}`} aria-label="Ver remito"><Eye /></Link>
          </Button>
          <Button asChild size="icon" variant="outline" title="Descargar PDF">
            <a href={urlDelPdf(row.original.id)} target="_blank" rel="noreferrer" aria-label="Descargar PDF"><FileDown /></a>
          </Button>
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  const emptyMessage = q ? `No se encontraron remitos para "${q}".` : 'No hay remitos registrados aún.'

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={FileText}>Remitos</TituloPantalla>
        <Button asChild><Link to="/remitos/nuevo"><Plus />Nuevo remito</Link></Button>
      </div>

      <Card>
        <CardContent className="flex items-center gap-2 py-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} className="flex-1" placeholder="Buscar por número, cliente u observaciones…" />
          <Button size="icon" variant="outline" onClick={() => load()} aria-label="Buscar"><Search /></Button>
          {q && <Button size="icon" variant="outline" onClick={limpiarBusqueda} aria-label="Limpiar búsqueda"><X /></Button>}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <DataTable columns={columns} data={remitos} emptyMessage={emptyMessage} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

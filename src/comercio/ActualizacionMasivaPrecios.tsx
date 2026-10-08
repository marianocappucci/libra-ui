// La actualización masiva de precios desde la planilla de un proveedor (roadmap de producto de
// VentaLibra, 2026-09-28, primer ítem no bloqueante después de balanza/fiado/ticket/devolución --
// ver wiki/analyses/ventalibra-gaps-despensa.md). Sube un .xlsx con código y costo; el precio de
// venta se recalcula solo, manteniendo el margen que cada producto ya tenía
// (`libracommerce.erp.actualizacion_masiva`).
import { useState } from 'react'
import type { ColumnDef } from '../data-table'
import { api, ApiError } from '../api-client'
import { CampoArchivo } from '../CampoArchivo'
import type { LineaActualizada, ResultadoPlanilla } from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BadgeEstado } from '../badge-estado'
import { DataTable } from '../data-table'
import { FileSpreadsheet, Upload, CheckCircle2, TriangleAlert } from 'lucide-react'
import { TituloPantalla } from '../titulo-pantalla'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm
}

export function ActualizacionMasivaPrecios() {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [resultado, setResultado] = useState<ResultadoPlanilla | null>(null)
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [aplicado, setAplicado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function elegirArchivo(f: File) {
    setArchivo(f)
    setResultado(null)
    setAplicado(false)
    setError(null)
    setCargando(true)
    try {
      const form = new FormData()
      form.append('archivo', f)
      const data = await api.postForm<ResultadoPlanilla>('/api/actualizacion-masiva/precios/preview', form)
      setResultado(data)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setCargando(false)
    }
  }

  async function aplicar() {
    if (!archivo) return
    setAplicando(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      const data = await api.postForm<ResultadoPlanilla>('/api/actualizacion-masiva/precios/aplicar', form)
      setResultado(data)
      setAplicado(true)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setAplicando(false)
    }
  }

  function limpiar() {
    setArchivo(null)
    setResultado(null)
    setAplicado(false)
    setError(null)
  }

  const columnas: ColumnDef<LineaActualizada>[] = [
    { accessorKey: 'nombre', header: 'Producto' },
    { accessorKey: 'codigo', header: 'Código' },
    {
      accessorKey: 'costo_actual',
      header: () => <div className="text-right">Costo</div>,
      cell: ({ row }) => (
        <div className="text-right">
          {formatCurrency(row.original.costo_actual)} → <span className="font-semibold">{formatCurrency(row.original.costo_nuevo)}</span>
        </div>
      ),
    },
    {
      accessorKey: 'venta_actual',
      header: () => <div className="text-right">Venta</div>,
      cell: ({ row }) => {
        const l = row.original
        if (!l.margen_calculado) {
          return <div className="text-right text-muted-foreground">{formatCurrency(l.venta_actual)} (sin cambios: no había costo previo)</div>
        }
        return (
          <div className="text-right">
            {formatCurrency(l.venta_actual)} → <span className="font-semibold text-exito">{formatCurrency(l.venta_nueva)}</span>
          </div>
        )
      },
    },
  ]

  return (
    <div className="grid gap-4">
      <TituloPantalla icono={FileSpreadsheet}>Actualización masiva de precios</TituloPantalla>
      <p className="text-sm text-muted-foreground">
        Subí la planilla de precios de un proveedor (.xlsx, con una columna de código de barra y una de costo). El
        precio de venta se recalcula solo, manteniendo el margen que cada producto ya tenía.
      </p>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <CampoArchivo
            archivo={archivo} accept=".xlsx" className="max-w-sm" disabled={cargando || aplicando}
            aria-label="Planilla de precios"
            onChange={(f) => { if (f) void elegirArchivo(f); else limpiar() }}
          />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {cargando && <p className="text-sm text-muted-foreground">Leyendo la planilla…</p>}

      {resultado && (
        <>
          {aplicado ? (
            <BadgeEstado tono="ok" className="w-fit">
              <CheckCircle2 />
              {resultado.actualizaciones.length} {plural(resultado.actualizaciones.length, 'producto actualizado', 'productos actualizados')}
            </BadgeEstado>
          ) : resultado.actualizaciones.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Vista previa: {resultado.actualizaciones.length} {plural(resultado.actualizaciones.length, 'producto', 'productos')} para actualizar.
              </p>
              <Button onClick={() => void aplicar()} disabled={aplicando}>
                <Upload />{aplicando ? 'Aplicando…' : 'Aplicar'}
              </Button>
            </div>
          )}

          {resultado.actualizaciones.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <DataTable columns={columnas} data={resultado.actualizaciones} emptyMessage="Nada para actualizar." />
              </CardContent>
            </Card>
          )}

          {resultado.no_encontrados.length > 0 && (
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TriangleAlert className="size-4" />
                  {resultado.no_encontrados.length} {plural(resultado.no_encontrados.length, 'código sin producto', 'códigos sin producto')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm text-muted-foreground">
                {resultado.no_encontrados.map((n) => <div key={n.codigo}>{n.codigo} — {n.motivo}</div>)}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

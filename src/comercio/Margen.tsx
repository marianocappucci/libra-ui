// Margen y rotación: cuánto se ganó (ingreso, costo, margen $ y %) y cuánto se movió (unidades) por
// producto y por período, ordenable y con export CSV.
//
// Pantalla nueva (0.87.0, roadmap de producto de VentaLibra, tanda 1); la cuenta es del motor
// (`GET /api/reportes/margen`, `libracommerce.erp.margen`, ADR-015) y acá sólo se muestra. Sin props: no hay
// nada que varíe por producto. El orden se pide al servidor —no se reordena en el navegador— para que el
// CSV que se baja salga en el mismo orden que la tabla que se ve.
//
// 🔴 **Los costos que no son de la venta se avisan.** El motor devuelve `costo_estimado` (la venta no guardó
// su costo y se usó el de hoy) y `sin_costo` (no hay costo de ningún lado: el margen figura como 100 % y no
// es real). Mostrar el número sin decirlo sería contar un margen que nadie midió.
import { useEffect, useState } from 'react'
import { api, ApiError } from '../api-client'
import { TituloPantalla } from '../titulo-pantalla'
import { hoyISO, primerDiaDelMesISO } from '../fechas'
import type {
  MargenAgrupacion, MargenCifras, MargenData, MargenOrden, MargenPeriodo, MargenProducto, MargenSentido,
} from './tipos'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fecha } from '@/lib/fechas'
import { AlertTriangle, Boxes, CalendarRange, DollarSign, Download, Package, TrendingUp, X } from 'lucide-react'

const RUTA = '/api/reportes/margen'

function moneda(valor: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor)
}
function numero(valor: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(valor)
}
function porcentaje(valor: number | null): string {
  return valor === null ? '—' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(valor)} %`
}

/** Las claves de período del motor: `2026-09-01`, `2026-W36` (semana) y `2026-09` (mes). */
function etiquetaDePeriodo(periodo: string, agrupacion: MargenAgrupacion): string {
  if (agrupacion === 'dia') return fecha(periodo)
  const semana = /^(\d{4})-W(\d{2})$/.exec(periodo)
  if (agrupacion === 'semana' && semana) return `Semana ${semana[2]}/${semana[1]}`
  const mes = /^(\d{4})-(\d{2})$/.exec(periodo)
  if (agrupacion === 'mes' && mes) return `${mes[2]}/${mes[1]}`
  return periodo
}

function colorDelMargen(c: MargenCifras): string {
  return c.margen < 0 ? 'text-destructive' : 'text-exito'
}

/** Lo que falta saber de un costo, o `null` si es el de la venta. */
function notaDelCosto(c: MargenCifras): string | null {
  if (c.sin_costo) return 'sin costo cargado'
  if (c.costo_estimado) return 'costo estimado'
  return null
}

const COLUMNAS: { orden: MargenOrden; titulo: string; alinea: 'left' | 'right' }[] = [
  { orden: 'nombre', titulo: 'Producto', alinea: 'left' },
  { orden: 'unidades', titulo: 'Unidades', alinea: 'right' },
  { orden: 'unidades_por_dia', titulo: 'Por día', alinea: 'right' },
  { orden: 'ingreso', titulo: 'Ingreso', alinea: 'right' },
  { orden: 'costo', titulo: 'Costo', alinea: 'right' },
  { orden: 'margen', titulo: 'Margen', alinea: 'right' },
  { orden: 'margen_pct', titulo: 'Margen %', alinea: 'right' },
]

export function Margen() {
  const [desde, setDesde] = useState(primerDiaDelMesISO())
  const [hasta, setHasta] = useState(hoyISO())
  const [agrupacion, setAgrupacion] = useState<MargenAgrupacion>('dia')
  const [orden, setOrden] = useState<MargenOrden>('margen')
  const [sentido, setSentido] = useState<MargenSentido>('desc')
  const [productoId, setProductoId] = useState<number | null>(null)
  const [data, setData] = useState<MargenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Lo que filtra y ordena viaja igual al JSON y a los CSV: una sola forma de armar la consulta.
  function consulta(extra: Record<string, string> = {}): string {
    const q = new URLSearchParams({ desde, hasta, orden, sentido, ...extra })
    if (productoId !== null) q.set('producto_id', String(productoId))
    return q.toString()
  }

  useEffect(() => {
    // Una respuesta que llega después de otro cambio de filtro no pisa a la más nueva.
    let vigente = true
    setLoading(true)
    setError(null)
    api.get<MargenData>(`${RUTA}?${consulta({ agrupacion })}`)
      .then((d) => { if (vigente) setData(d) })
      .catch((err) => {
        if (!vigente) return
        setError(err instanceof ApiError ? err.detail : 'Error de conexión.')
        setData(null)
      })
      .finally(() => { if (vigente) setLoading(false) })
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, agrupacion, orden, sentido, productoId])

  function ordenarPor(columna: MargenOrden) {
    if (columna === orden) {
      setSentido(sentido === 'desc' ? 'asc' : 'desc')
    } else {
      setOrden(columna)
      setSentido(columna === 'nombre' ? 'asc' : 'desc')
    }
  }

  const filtrado = data?.productos.find((p) => p.producto_id === productoId) ?? null

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TituloPantalla icono={TrendingUp}>Margen y rotación</TituloPantalla>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2"><Label htmlFor="margen-desde">Desde</Label><Input id="margen-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" /></div>
          <div className="grid gap-2"><Label htmlFor="margen-hasta">Hasta</Label><Input id="margen-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" /></div>
          <div className="grid gap-2">
            <Label>Agrupar por</Label>
            <Select value={agrupacion} onValueChange={(v) => setAgrupacion(v as MargenAgrupacion)}>
              <SelectTrigger className="w-32" aria-label="Agrupar por"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dia">Día</SelectItem>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!data ? (
        loading && <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {data.resumen.productos_sin_costo > 0 && (
            <p role="status" className="flex items-start gap-2 rounded-md border border-amber-500/50 p-3 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {data.resumen.productos_sin_costo === 1 ? '1 producto no tiene' : `${data.resumen.productos_sin_costo} productos no tienen`} costo cargado:
                {' '}su margen figura como si fuera todo ganancia y no lo es. Cargá el costo en Productos.
              </span>
            </p>
          )}
          {data.resumen.productos_costo_estimado > 0 && (
            <p role="status" className="flex items-start gap-2 rounded-md border border-amber-500/50 p-3 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {data.resumen.productos_costo_estimado === 1 ? '1 producto usa' : `${data.resumen.productos_costo_estimado} productos usan`} el costo de hoy:
                {' '}la venta no guardó el costo del momento, así que el margen es una estimación.
              </span>
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <Card>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="min-w-0 [&_p]:truncate">
                  <CardDescription>Ingreso</CardDescription>
                  <p className="text-2xl font-bold">{moneda(data.resumen.ingreso)}</p>
                  <CardDescription>lo cobrado, con descuentos</CardDescription>
                </div>
                <span className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary"><DollarSign /></span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="min-w-0 [&_p]:truncate">
                  <CardDescription>Costo</CardDescription>
                  <p className="text-2xl font-bold">{moneda(data.resumen.costo)}</p>
                  <CardDescription>de lo vendido</CardDescription>
                </div>
                <span className="shrink-0 rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400"><Package /></span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="min-w-0 [&_p]:truncate">
                  <CardDescription>Margen</CardDescription>
                  <p className={`text-2xl font-bold ${colorDelMargen(data.resumen)}`}>{moneda(data.resumen.margen)}</p>
                  <CardDescription>{porcentaje(data.resumen.margen_pct)} sobre el ingreso</CardDescription>
                </div>
                <span className="shrink-0 rounded-lg bg-exito/10 p-2 text-exito"><TrendingUp /></span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="min-w-0 [&_p]:truncate">
                  <CardDescription>Unidades vendidas</CardDescription>
                  <p className="text-2xl font-bold">{numero(data.resumen.unidades)}</p>
                  <CardDescription>{data.resumen.productos} producto{data.resumen.productos !== 1 ? 's' : ''}</CardDescription>
                </div>
                <span className="shrink-0 rounded-lg bg-violet-500/10 p-2 text-violet-600 dark:text-violet-400"><Boxes /></span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><Boxes className="size-4 text-purple-600 dark:text-purple-400" />Margen y rotación por producto</CardTitle>
              <div className="flex items-center gap-2">
                {productoId !== null && (
                  <Button size="sm" variant="outline" onClick={() => setProductoId(null)}>
                    <X />Quitar filtro{filtrado ? `: ${filtrado.nombre}` : ''}
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <a href={`${RUTA}/export/productos?${consulta()}`}><Download />CSV</a>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {data.productos.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Sin ventas en el período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        {COLUMNAS.map((c) => (
                          <th
                            key={c.orden}
                            scope="col"
                            aria-sort={c.orden === orden ? (sentido === 'asc' ? 'ascending' : 'descending') : 'none'}
                            className={`p-3 font-medium ${c.alinea === 'right' ? 'text-right' : 'text-left'}`}
                          >
                            <button type="button" onClick={() => ordenarPor(c.orden)} className="font-medium hover:text-foreground">
                              {c.titulo}{c.orden === orden ? (sentido === 'asc' ? ' ▲' : ' ▼') : ''}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.productos.map((p: MargenProducto) => (
                        <tr key={p.producto_id} className="border-b last:border-0">
                          <td className="p-3">
                            <button type="button" title="Ver sólo este producto" onClick={() => setProductoId(p.producto_id)} className="text-left hover:underline">
                              {p.nombre}
                            </button>
                            {notaDelCosto(p) && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">({notaDelCosto(p)})</span>}
                          </td>
                          <td className="p-3 text-right">{numero(p.unidades)}</td>
                          <td className="p-3 text-right">{p.unidades_por_dia === null ? '—' : numero(p.unidades_por_dia)}</td>
                          <td className="p-3 text-right">{moneda(p.ingreso)}</td>
                          <td className="p-3 text-right">{moneda(p.costo)}</td>
                          <td className={`p-3 text-right font-semibold ${colorDelMargen(p)}`}>{moneda(p.margen)}</td>
                          <td className="p-3 text-right">{porcentaje(p.margen_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="size-4 text-primary" />Por período{filtrado ? `: ${filtrado.nombre}` : ''}</CardTitle>
              <Button asChild size="sm" variant="outline">
                <a href={`${RUTA}/export/periodos?${consulta({ agrupacion })}`}><Download />CSV</a>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {data.periodos.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Sin ventas en el período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <th className="p-3 text-left font-medium">Período</th>
                        <th className="p-3 text-right font-medium">Unidades</th>
                        <th className="p-3 text-right font-medium">Ingreso</th>
                        <th className="p-3 text-right font-medium">Costo</th>
                        <th className="p-3 text-right font-medium">Margen</th>
                        <th className="p-3 text-right font-medium">Margen %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.periodos.map((p: MargenPeriodo) => (
                        <tr key={p.periodo} className="border-b last:border-0">
                          <td className="p-3">{etiquetaDePeriodo(p.periodo, data.agrupacion)}</td>
                          <td className="p-3 text-right">{numero(p.unidades)}</td>
                          <td className="p-3 text-right">{moneda(p.ingreso)}</td>
                          <td className="p-3 text-right">{moneda(p.costo)}</td>
                          <td className={`p-3 text-right font-semibold ${colorDelMargen(p)}`}>{moneda(p.margen)}</td>
                          <td className="p-3 text-right">{porcentaje(p.margen_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

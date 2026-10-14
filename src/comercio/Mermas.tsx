// Mermas por período: cuánto se tiró (unidades) y cuánto valía (plata), por producto, con export CSV.
//
// Pantalla nueva (0.151.0, ADR-063); la cuenta es del motor (`GET /api/reportes/mermas`, `libracommerce.erp.mermas`, ADR-059) y acá sólo se muestra. Es el par de `Margen`: mismo
// molde (rango de fechas, resumen arriba, tabla por producto, CSV), sin props. El producto la monta detrás del permiso que ve costos: el motor no decide quién ve los importes y
// un rol sin `costos.ver` recibe 403 (esa ruta cuelga de un prefijo que el producto cubre entero).
//
// 🔴 **El importe es un piso, no un total.** Una merma sin costo cargado (el producto no lo tenía al mermar, o es anterior a ADR-059: no se reconstruye) no suma al importe; el motor la
// cuenta aparte (`movimientos_sin_costo`). Mostrar el número sin decirlo sería contar una pérdida más chica que la real, así que si `resumen.sin_costo` la pantalla avisa cuántas
// mermas faltan, y la fila de cada producto lo dice.
//
// El orden de las filas es el del motor (por importe) hasta que se ordena una columna; el CSV sale siempre en el del motor. Con el ancho justo para la tabla es tabla; si no entra son tarjetas
// (`TablaOTarjetas`, ADR-057), nunca scroll de costado.
import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api-client'
import { TituloPantalla } from '../titulo-pantalla'
import { hoyISO, primerDiaDelMesISO } from '../fechas'
import type { ColumnDef } from '../data-table'
import { sortableHeader } from '../data-table'
import { formatoCantidad, formatoMoneda } from '../formatos'
import { SelectBuscable } from '../SelectBuscable'
import { TablaOTarjetas, TarjetaDeFila } from '../tabla-o-tarjetas'
import { IconoIndicador } from '../IconoIndicador'
import { INDICADORES } from '../iconos-indicador'
import { TarjetaIndicador } from '../TarjetaIndicador'
import type { Deposito, MermaProducto, MermasData, Sucursal } from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Download, X } from 'lucide-react'

const RUTA = '/api/reportes/mermas'
/** El valor de «Todos los depósitos» en su `SelectBuscable`. */
const TODOS = '__todos__'
/** Bajo `lg` (1024 px) los botones y campos que se tocan con el dedo miden 44 px (ADR-057). */
const TACTIL_BAJO_LG = 'max-lg:h-11'

/** «1 merma» / «3 mermas». */
const mermas = (n: number) => `${n} merma${n !== 1 ? 's' : ''}`

/** Lo que dice la celda de importe de un producto: el importe de las mermas que tienen costo, y qué falta si alguna no lo tiene. */
function importeDelProducto(p: MermaProducto): { texto: string; nota: string | null } {
  if (p.movimientos_sin_costo >= p.movimientos) return { texto: '—', nota: 'sin costo cargado' }
  return { texto: formatoMoneda(p.costo_total), nota: p.sin_costo ? `sin costo en ${mermas(p.movimientos_sin_costo)}` : null }
}

export function Mermas() {
  const [desde, setDesde] = useState(primerDiaDelMesISO())
  const [hasta, setHasta] = useState(hoyISO())
  const [depositoId, setDepositoId] = useState(TODOS)
  const [productoId, setProductoId] = useState<number | null>(null)
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  // Lo último que contestó el motor, con el pedido al que contestó: mientras llega la respuesta a un filtro nuevo no se muestra la anterior bajo controles nuevos.
  const [respuesta, setRespuesta] = useState<{ pedido: string; data: MermasData | null; error: string | null } | null>(null)

  // Lo que filtra viaja igual al JSON y al CSV: una sola forma de armar la consulta.
  const consulta = useMemo(() => {
    const q = new URLSearchParams({ desde, hasta })
    if (depositoId !== TODOS) q.set('deposito_id', depositoId)
    if (productoId !== null) q.set('producto_id', String(productoId))
    return q.toString()
  }, [desde, hasta, depositoId, productoId])

  // Sin depósitos (un producto sin ellos, o un error) la pantalla sigue: sólo pierde ese filtro.
  useEffect(() => {
    let vigente = true
    api.get<Deposito[]>('/api/depositos').then((d) => { if (vigente) setDepositos(d) }).catch(() => {})
    api.get<Sucursal[]>('/api/sucursales').then((s) => { if (vigente) setSucursales(s) }).catch(() => {})
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    // Una respuesta que llega después de otro cambio de filtro no pisa a la más nueva.
    let vigente = true
    api.get<MermasData>(`${RUTA}?${consulta}`)
      .then((data) => { if (vigente) setRespuesta({ pedido: consulta, data, error: null }) })
      .catch((err) => { if (vigente) setRespuesta({ pedido: consulta, data: null, error: err instanceof ApiError ? err.detail : 'Error de conexión.' }) })
    return () => { vigente = false }
  }, [consulta])

  const actual = respuesta?.pedido === consulta
  const data = actual ? respuesta.data : null
  const error = actual ? respuesta.error : null
  const loading = !actual

  const opcionesDeDepositos = useMemo(() => [
    { value: TODOS, label: 'Todos los depósitos' },
    ...depositos.filter((d) => !!d.activo).map((d) => {
      const sucursal = sucursales.find((s) => s.id === d.branch_id)?.nombre
      return { value: String(d.id), label: sucursal ? `${sucursal} · ${d.nombre}` : d.nombre }
    }),
  ], [depositos, sucursales])

  const filtrado = data?.productos.find((p) => p.producto_id === productoId) ?? null

  const columns = useMemo<ColumnDef<MermaProducto>[]>(() => [
    {
      accessorKey: 'nombre', header: sortableHeader('Producto'), minSize: 180, meta: { stretch: true },
      cell: ({ row }) => (
        <button type="button" title="Ver sólo este producto" onClick={() => setProductoId(row.original.producto_id)} className="text-left font-medium [overflow-wrap:anywhere] hover:underline">
          {row.original.nombre}
        </button>
      ),
    },
    { accessorKey: 'codigo', header: 'Código', size: 110, minSize: 90, cell: ({ row }) => row.original.codigo || '—' },
    {
      accessorKey: 'cantidad', header: sortableHeader('Cantidad'), size: 130, minSize: 110,
      cell: ({ row }) => <span>{formatoCantidad(row.original.cantidad)} <span className="text-xs text-muted-foreground">{row.original.unidad}</span></span>,
    },
    { accessorKey: 'movimientos', header: 'Mermas', size: 90, minSize: 80, cell: ({ row }) => row.original.movimientos },
    {
      accessorKey: 'costo_total', header: sortableHeader('Importe'), size: 170, minSize: 140,
      cell: ({ row }) => {
        const i = importeDelProducto(row.original)
        return (
          <span className="font-medium">
            {i.texto}
            {i.nota && <>{' '}<span className="text-xs font-normal text-amber-600 dark:text-amber-400">({i.nota})</span></>}
          </span>
        )
      },
    },
  ], [])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TituloPantalla icono={INDICADORES.mermas}>Mermas</TituloPantalla>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="mermas-desde">Desde</Label>
            <Input id="mermas-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`w-40 ${TACTIL_BAJO_LG}`} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mermas-hasta">Hasta</Label>
            <Input id="mermas-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`w-40 ${TACTIL_BAJO_LG}`} />
          </div>
          {depositos.length > 1 && (
            <div className="grid gap-2">
              <Label htmlFor="mermas-deposito">Depósito</Label>
              <SelectBuscable id="mermas-deposito" value={depositoId} onChange={setDepositoId} opciones={opcionesDeDepositos} limpiable={false} className="w-56" />
            </div>
          )}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p role="status" className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : data && (
        <>
          {data.resumen.sin_costo && (
            <p role="status" className="flex items-start gap-2 rounded-md border border-amber-500/50 p-3 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                El importe no incluye {mermas(data.resumen.movimientos_sin_costo)} sin costo cargado
                {data.resumen.productos_sin_costo > 0 && <> ({data.resumen.productos_sin_costo === 1 ? '1 producto' : `${data.resumen.productos_sin_costo} productos`})</>}:
                {' '}lo que se perdió vale más que lo que figura. Cargá el costo en Productos para que las próximas se valoricen; las anteriores no se pueden recalcular.
              </span>
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TarjetaIndicador
              concepto="mermas" etiqueta="Importe perdido" tono={data.resumen.costo_total > 0 ? 'peligro' : 'neutro'} valor={formatoMoneda(data.resumen.costo_total)}
              ayuda={data.resumen.sin_costo ? 'sin contar las mermas sin costo' : 'al costo de cada producto'}
            />
            <TarjetaIndicador
              concepto="stock" etiqueta="Mermas registradas" valor={formatoCantidad(data.resumen.movimientos)}
              ayuda={`${data.resumen.productos} producto${data.resumen.productos !== 1 ? 's' : ''}`}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><IconoIndicador concepto="mermas" className="text-muted-foreground" />Mermas por producto</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {productoId !== null && (
                  <Button size="sm" variant="outline" className={TACTIL_BAJO_LG} onClick={() => setProductoId(null)}>
                    <X />Quitar filtro{filtrado ? `: ${filtrado.nombre}` : ''}
                  </Button>
                )}
                <Button asChild size="sm" variant="outline" className={TACTIL_BAJO_LG}>
                  <a href={`${RUTA}/export?${consulta}`}><Download />CSV</a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <TablaOTarjetas
                columns={columns}
                data={data.productos}
                clave={(p) => p.producto_id}
                etiqueta="Mermas por producto"
                emptyMessage="No hay mermas en el período."
                tarjeta={(p) => {
                  const i = importeDelProducto(p)
                  return (
                    <TarjetaDeFila
                      titulo={(
                        <button type="button" title="Ver sólo este producto" onClick={() => setProductoId(p.producto_id)} className="inline-flex min-h-11 items-center text-left hover:underline">
                          {p.nombre}
                        </button>
                      )}
                      subtitulo={p.codigo}
                      datos={[
                        { etiqueta: 'Cantidad', valor: `${formatoCantidad(p.cantidad)} ${p.unidad}` },
                        { etiqueta: 'Mermas', valor: p.movimientos },
                        { etiqueta: 'Importe', valor: <>{i.texto}{i.nota && <>{' '}<span className="text-xs text-amber-600 dark:text-amber-400">({i.nota})</span></>}</> },
                      ]}
                    />
                  )
                }}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

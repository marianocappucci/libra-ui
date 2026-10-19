// El punto de venta: listado con pestañas, filtros, y el alta de una venta con
// sus ítems (autocompletado del catálogo, lista de precio), el cliente (con
// alta rápida) y las líneas de pago con vuelto (P9-M3, 2026-09-06).
//
// Extraída de `pages/Ventas.tsx` de Contalibra y Restolibra. Lo que difería, y
// cómo quedó:
// - Restolibra ya cobraba con `LineasDePago` (importe + *Paga con* + vuelto);
//   Contalibra tenía filas que se autocompletaban con lo que faltaba, sin
//   vuelto. Queda `LineasDePago`, con el botón de completar lo que falta.
// - Contalibra abría el detalle con un click en la fila y mostraba el medio
//   abreviado; Restolibra con un botón y el medio completo con su importe.
//   Quedan las dos entradas al detalle y la abreviatura con el importe.
// - `user.role === 'admin'` para anular pasa a ser la prop `puedeAnular`: el
//   kit no sabe de sesiones.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '../data-table'
import {
  Ban, CheckCircle2, Eye, FileCheck, ListChecks, Plus, Printer, ReceiptText, X,
} from 'lucide-react'

import { api, ApiError } from '../api-client'
import { anchoColumnaAcciones, DataTable, sortableHeader } from '../data-table'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'
import { SelectBuscable } from '../SelectBuscable'
import { SelectCliente } from '../SelectCliente'
import { CAMPOS_CLIENTE_DEL_MOTOR, crearYSumar } from './alta-de-cliente'
import { anchoMinimoDeColumnas } from '../tabla'
import { TACTIL, TACTIL_BAJO_LG, useAncho, useBajoLg } from '../use-ancho'
import { hoyISO, fecha } from '../fechas'
import { useMediosPago } from './medios-pago'
import { useImprimirTicket } from './useImprimirTicket'
import { LineasDePago } from './LineasDePago'
import { lineaVacia, pagosPayload, totalDeclarado, vueltoDe, type LineaDePago } from './pagos'
import {
  ESTADO_VENTA_TONO, etiquetaDeEstadoDeVenta, formatoMoneda, opcionesCliente,
  type ClienteDeVenta, type ListaPrecio, type ProductoBusqueda, type Venta,
} from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog'

/** Una venta como tarjeta: lo que la tabla reparte en columnas, apilado, para cuando la tabla no entra en el ancho que hay (nunca se scrollea de costado, ADR-020). */
function TarjetaDeVenta({ venta, medios, factura, rutaDeDetalle, acciones }: {
  venta: Venta; medios: ReactNode; factura: ReactNode; rutaDeDetalle: (id: number) => string; acciones: ReactNode
}) {
  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={rutaDeDetalle(venta.id)} className="font-mono text-sm font-semibold text-primary hover:underline [overflow-wrap:anywhere]">{venta.numero}</Link>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{[fecha(venta.fecha), venta.cliente_nombre].filter(Boolean).join(' · ')}</p>
        </div>
        <BadgeEstado tono={ESTADO_VENTA_TONO[venta.estado] ?? 'neutro'} className="max-w-full shrink-0" title={venta.estado}><span className="truncate">{etiquetaDeEstadoDeVenta(venta.estado)}</span></BadgeEstado>
      </div>
      <p className="text-sm">Total: <strong className="text-base tabular-nums">{formatoMoneda(venta.total)}</strong></p>
      <div className="min-w-0" aria-label="Medios de pago">{medios}</div>
      <div className="min-w-0">{factura}</div>
      <div className={TACTIL}>{acciones}</div>
    </li>
  )
}

type ItemRow = { nombre: string; qty: string; precio: string; producto_id: number | null }

const EMPTY_ITEM: ItemRow = { nombre: '', qty: '1', precio: '0', producto_id: null }

export type VentasProps = {
  /** Si la sesión puede anular ventas (los productos: rol admin). */
  puedeAnular?: boolean
  rutaDeDetalle?: (id: number) => string
  /** `null` oculta el link a la factura en la columna «Factura» —el dato
   *  (`factura_display`) se sigue mostrando como texto—; sin la prop, la ruta
   *  de siempre (F4, 2026-09-15: VentaLibra no tiene pantalla de factura). */
  rutaDeFactura?: ((id: number) => string) | null
  /** A dónde ver el recibo desde el listado. `null` oculta el botón —
   *  VentaLibra no tiene recibo—; sin la prop, la ruta de siempre. */
  rutaDeRecibo?: ((id: number) => string) | null
  /** `false` oculta el alta manual —botón «Nueva venta» y su diálogo— sin
   *  tocar el listado (F4, 2026-09-15): VentaLibra carga las ventas desde su
   *  propio POS y no quiere ofrecer este formulario en su historial. */
  permitirAlta?: boolean
}

export function Ventas({
  puedeAnular = false,
  rutaDeDetalle = (id) => `/ventas/${id}`,
  rutaDeFactura = (id) => `/facturas/${id}`,
  rutaDeRecibo = (id) => `/ventas/${id}/recibo`,
  permitirAlta = true,
}: VentasProps = {}) {
  const { medios, etiquetaCorta: etiquetaCortaDeMedio } = useMediosPago()
  const { imprimir, dialogo: dialogoTicket } = useImprimirTicket()
  const navigate = useNavigate()
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('todas')
  const [q, setQ] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const [showNueva, setShowNueva] = useState(false)
  const [clientes, setClientes] = useState<ClienteDeVenta[]>([])
  const [listasPrecio, setListasPrecio] = useState<ListaPrecio[]>([])
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }])
  const [pagos, setPagos] = useState<LineaDePago[]>([lineaVacia()])
  const [clienteId, setClienteId] = useState('')
  const [listaPrecioId, setListaPrecioId] = useState('')
  const [descuento, setDescuento] = useState('0')
  const [observaciones, setObservaciones] = useState('')
  const [savingVenta, setSavingVenta] = useState(false)
  const [sugerencias, setSugerencias] = useState<{ index: number; items: ProductoBusqueda[] } | null>(null)


  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  /** `filtros` pisa el estado: lo usa *Limpiar*, que recarga en el mismo tick
   *  en que vacía los campos y todavía ve los valores viejos en el closure. */
  async function load(filtros: { q?: string; desde?: string; hasta?: string } = {}) {
    setLoading(true)
    setError(null)
    try {
      const f = { q, desde, hasta, ...filtros }
      const params = new URLSearchParams({ tab })
      if (f.q) params.set('q', f.q)
      if (f.desde) params.set('desde', f.desde)
      if (f.hasta) params.set('hasta', f.hasta)
      setVentas(await api.get<Venta[]>(`/api/ventas?${params.toString()}`))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  function limpiarFiltros() {
    setQ(''); setDesde(''); setHasta('')
    void load({ q: '', desde: '', hasta: '' })
  }

  async function anular(venta: Venta) {
    setError(null)
    try {
      await api.post(`/api/ventas/${venta.id}/anular`)
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function abrirNueva() {
    setItems([{ ...EMPTY_ITEM }])
    setPagos([lineaVacia()])
    setClienteId(''); setListaPrecioId(''); setDescuento('0'); setObservaciones('')
    setSugerencias(null)
    setError(null)
    api.get<ClienteDeVenta[]>('/api/clientes').then((c) => setClientes(c.filter((x) => x.activo))).catch(() => {})
    api.get<ListaPrecio[]>('/api/listas-precio').then(setListasPrecio).catch(() => {})
    setShowNueva(true)
  }

  async function buscarProducto(index: number, texto: string) {
    updateItem(index, 'nombre', texto)
    if (texto.trim().length < 2) {
      setSugerencias(null)
      return
    }
    try {
      const lp = listaPrecioId ? `&lista_id=${listaPrecioId}` : ''
      const res = await api.get<ProductoBusqueda[]>(`/productos/buscar?q=${encodeURIComponent(texto)}${lp}`)
      setSugerencias({ index, items: res })
    } catch {
      setSugerencias(null)
    }
  }

  function elegirProducto(index: number, p: ProductoBusqueda) {
    setItems((rows) => rows.map((r, i) => i === index ? { nombre: p.nombre, qty: r.qty || '1', precio: String(p.precio_venta), producto_id: p.id } : r))
    setSugerencias(null)
  }

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((rows) => rows.map((r, i) => i === index ? { ...r, [field]: value, ...(field === 'nombre' ? { producto_id: null } : {}) } : r))
  }

  function addItemRow() {
    setItems((rows) => [...rows, { ...EMPTY_ITEM }])
  }

  function removeItemRow(index: number) {
    setItems((rows) => rows.filter((_, i) => i !== index))
  }

  const subtotalCalc = items.reduce((acc, r) => acc + (Number(r.qty) || 0) * (Number(r.precio) || 0), 0)
  const totalCalc = Math.max(0, subtotalCalc - (Number(descuento) || 0))

  // 🔑 Al elegir el medio el importe ya tiene que estar puesto: mientras haya una
  // sola línea y nadie la haya tocado, sigue al total. El monto escrito a mano no
  // se pisa (`tocado`), y con dos o más líneas el reparto es del cajero.
  useEffect(() => {
    setPagos((lineas) => {
      if (lineas.length !== 1 || lineas[0].tocado) return lineas
      const monto = totalCalc > 0 ? String(Math.round(totalCalc * 100) / 100) : ''
      return lineas[0].monto === monto ? lineas : [{ ...lineas[0], monto }]
    })
  }, [totalCalc])
  // El vuelto sale de *Paga con*, línea por línea — no de restarle el total a
  // lo declarado: esa resta hacía pasar por vuelto plata que igual quedaba
  // registrada.
  const vueltoCalc = pagos.reduce((acc, p) => acc + vueltoDe(p), 0)

  async function crearVenta() {
    if (totalDeclarado(pagos) > totalCalc + 0.005) {
      // 🔴 Se corta ACÁ. El importe de más no es un vuelto: entraría a la caja
      // tal cual y saldría como sobrante en el arqueo. Para devolver plata está
      // *Paga con*, en la línea de efectivo.
      setError(
        'Los importes de pago suman más que el total. Si estás calculando un '
        + 'vuelto, usá «Paga con» en la línea de efectivo.',
      )
      return
    }
    setSavingVenta(true)
    setError(null)
    try {
      const venta = await api.post<Venta>('/api/ventas', {
        fecha: hoyISO(),
        items: items.filter((r) => r.nombre.trim() && Number(r.qty) > 0).map((r) => ({
          nombre: r.nombre, qty: Number(r.qty), precio: Number(r.precio) || 0, producto_id: r.producto_id,
        })),
        descuento: Number(descuento) || 0,
        cliente_id: clienteId ? Number(clienteId) : null,
        observaciones,
        pagos: pagosPayload(pagos),
      })
      setShowNueva(false)
      navigate(rutaDeDetalle(venta.id))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSavingVenta(false)
    }
  }

  const mediosDe = (v: Venta) => (
    <div className="flex flex-wrap gap-1">
      {v.pagos.length === 0
        ? <span className="text-muted-foreground">—</span>
        : v.pagos.map((p, i) => (
          <Badge key={i} variant="outline" className="max-w-full font-normal"><span className="truncate">{etiquetaCortaDeMedio(p.medio)}: {formatoMoneda(p.monto)}</span></Badge>
        ))}
    </div>
  )

  const facturaDe = (v: Venta) => v.factura_display
    ? rutaDeFactura
      ? <Link to={rutaDeFactura(v.factura_id as number)} onClick={(e) => e.stopPropagation()} className="inline-flex max-w-full items-center gap-1 truncate text-sm font-medium text-exito hover:underline" title={v.factura_display}><ReceiptText className="size-3.5 shrink-0" /><span className="truncate">{v.factura_display}</span></Link>
      : <span className="inline-flex max-w-full items-center gap-1 truncate text-sm font-medium" title={v.factura_display}><ReceiptText className="size-3.5 shrink-0" /><span className="truncate">{v.factura_display}</span></span>
    : v.estado !== 'anulada'
      // LibraEdge (ADR-077): la venta de un nodo que espera su factura en la bandeja se factura sola al volver la conexión.
      ? <BadgeEstado tono="atencion">{v.factura_pendiente ? 'Pendiente (sin conexión)' : 'Sin facturar'}</BadgeEstado>
      : <span className="text-muted-foreground">—</span>

  const acciones = (v: Venta) => (
    <div className={`flex justify-end gap-1 ${TACTIL_BAJO_LG}`} onClick={(e) => e.stopPropagation()}>
      <Button asChild size="icon" variant="outline" title="Ver venta"><Link to={rutaDeDetalle(v.id)} aria-label="Ver venta"><Eye /></Link></Button>
      <Button size="icon" variant="outline" title="Imprimir ticket" aria-label="Imprimir ticket" onClick={() => imprimir(`/ventas/${v.id}/ticket`)}><Printer /></Button>
      {v.pagos.length > 0 && rutaDeRecibo && (
        <Button asChild size="icon" variant="outline" title="Ver recibo"><a href={rutaDeRecibo(v.id)} target="_blank" rel="noreferrer" aria-label="Ver recibo"><FileCheck /></a></Button>
      )}
      {puedeAnular && v.estado !== 'anulada' && (
        <Button size="icon" variant="outline" title="Anular" aria-label="Anular" onClick={() => anular(v)}><Ban /></Button>
      )}
    </div>
  )

  // Los botones que puede llegar a tener una fila: el umbral de las tarjetas es la suma de las columnas, así que la de acciones no reserva los que el producto no muestra.
  const botonesDeAccion = 2 + (rutaDeRecibo ? 1 : 0) + (puedeAnular ? 1 : 0)

  const bajoLg = useBajoLg()
  const columns = useMemo<ColumnDef<Venta>[]>(() => [
    // 110 px: «POS-000010» en monoespaciada mide 84,3 px y con 100 la caja quedaba en 84 y se cortaba con «…» (medido en Chromium contra VentaLibra dev).
    { accessorKey: 'numero', header: sortableHeader('N°'), size: 110, minSize: 100, cell: ({ row }) => <span className="block truncate font-mono text-sm font-semibold text-primary" title={row.original.numero}>{row.original.numero}</span> },
    { accessorKey: 'fecha', header: 'Fecha', size: 100, minSize: 90, cell: ({ row }) => fecha(row.original.fecha) },
    {
      accessorKey: 'cliente_nombre',
      header: 'Cliente',
      size: 130,
      minSize: 90,
      meta: { stretch: true },
      cell: ({ row }) => <span className="block w-full truncate" title={row.original.cliente_nombre ?? undefined}>{row.original.cliente_nombre || '—'}</span>,
    },
    {
      id: 'pagos',
      header: 'Medios de pago',
      size: 150,
      minSize: 110,
      cell: ({ row }) => mediosDe(row.original),
    },
    // 120 px: «$ 3.703.701,00» entra entero (con 100 se cortaba en seco, medido en Chromium); más largo, «…» y el importe en el `title`. ADR-021.
    { accessorKey: 'total', header: 'Total', size: 120, minSize: 100, cell: ({ row }) => <span className="block truncate font-medium tabular-nums" title={formatoMoneda(row.original.total)}>{formatoMoneda(row.original.total)}</span> },
    {
      accessorKey: 'estado',
      header: 'Estado',
      size: 110,
      minSize: 90,
      cell: ({ row }) => <BadgeEstado tono={ESTADO_VENTA_TONO[row.original.estado] ?? 'neutro'} className="max-w-full" title={row.original.estado}><span className="truncate">{etiquetaDeEstadoDeVenta(row.original.estado)}</span></BadgeEstado>,
    },
    {
      id: 'factura',
      header: 'Factura',
      size: 140,
      minSize: 100,
      cell: ({ row }) => facturaDe(row.original),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      size: anchoColumnaAcciones(botonesDeAccion, bajoLg),
      minSize: anchoColumnaAcciones(botonesDeAccion, bajoLg),
      cell: ({ row }) => acciones(row.original),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [puedeAnular, medios, botonesDeAccion, bajoLg])

  // Como en Stock (ADR-016): la tabla pide la suma de los `size` de sus columnas; si el contenedor es más angosto, tarjetas en vez de scroll de costado. Sin medida (0), la tabla.
  const [medidaTabla, anchoTabla] = useAncho()
  const anchoMinimoTabla = useMemo(() => anchoMinimoDeColumnas(columns), [columns])
  const enTarjetas = anchoTabla > 0 && anchoTabla < anchoMinimoTabla

  const emptyMessage = tab === 'sin_facturar'
    ? 'No hay ventas pendientes de facturar.'
    : tab === 'facturadas'
      ? 'No hay ventas facturadas aún.'
      : 'No hay ventas registradas aún.'

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={ICONOS.ventas}>Ventas</TituloPantalla>
        {permitirAlta && (
        <Dialog open={showNueva} onOpenChange={setShowNueva}>
          <DialogTrigger asChild>
            <Button onClick={abrirNueva}><Plus />Nueva venta</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ICONOS.ventas className="size-4" />Nueva venta</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <SelectCliente
                  etiqueta="Cliente"
                  value={clienteId}
                  onChange={setClienteId}
                  opciones={opcionesCliente(clientes)}
                  placeholder="Consumidor Final"
                  ariaLabel="Cliente"
                  classNameSelect="w-52"
                  crear={crearYSumar<ClienteDeVenta>((c) => setClientes((prev) => [...prev, c]))}
                  campos={CAMPOS_CLIENTE_DEL_MOTOR}
                />
                {listasPrecio.length > 0 && (
                  <div className="grid gap-2">
                    <Label htmlFor="venta-lista">Lista de precios</Label>
                    <SelectBuscable
                      id="venta-lista"
                      value={listaPrecioId}
                      onChange={setListaPrecioId}
                      opciones={[
                        { value: '', label: '— Precio de venta —' },
                        ...listasPrecio.map((l) => ({ value: String(l.id), label: l.nombre })),
                      ]}
                      ariaLabel="Lista de precios"
                      limpiable={false}
                      className="w-48"
                    />
                  </div>
                )}
                <div className="grid gap-2"><Label htmlFor="venta-obs">Observaciones</Label><Input id="venta-obs" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="w-64" /></div>
              </div>

              <div className="grid gap-2">
                <Label>Ítems</Label>
                {items.map((row, i) => (
                  <div key={i} className="relative flex flex-wrap items-center gap-2">
                    <Input
                      value={row.nombre} onChange={(e) => buscarProducto(i, e.target.value)}
                      placeholder="Producto o descripción…" aria-label={`Ítem ${i + 1}`} className="w-56"
                    />
                    {sugerencias?.index === i && sugerencias.items.length > 0 && (
                      <div className="absolute top-9 left-0 z-10 w-56 rounded-md border bg-popover shadow-md">
                        {sugerencias.items.map((p) => (
                          <button
                            key={p.id} type="button"
                            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                            onClick={() => elegirProducto(i, p)}
                          >
                            {p.nombre} — {formatoMoneda(p.precio_venta)}
                          </button>
                        ))}
                      </div>
                    )}
                    <Input type="number" step="0.01" value={row.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} className="w-20" placeholder="Cant." aria-label={`Cantidad ${i + 1}`} />
                    <Input type="number" step="0.01" value={row.precio} onChange={(e) => updateItem(i, 'precio', e.target.value)} className="w-28" placeholder="Precio" aria-label={`Precio ${i + 1}`} />
                    <span className="w-28 text-sm text-muted-foreground">{formatoMoneda((Number(row.qty) || 0) * (Number(row.precio) || 0))}</span>
                    {items.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeItemRow(i)}><X />Quitar</Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-fit" onClick={addItemRow}><Plus />Agregar ítem</Button>
              </div>

              <div className="grid gap-2">
                <Label>Pagos</Label>
                <LineasDePago
                  lineas={pagos}
                  onChange={setPagos}
                  medios={medios}
                  aPagar={totalCalc}
                  formatCurrency={formatoMoneda}
                  deshabilitado={savingVenta}
                />
              </div>

              <div className="flex flex-wrap items-end gap-4 border-t pt-4">
                <div className="grid gap-2"><Label htmlFor="venta-descuento">Descuento</Label><Input id="venta-descuento" type="number" step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} className="w-28" /></div>
                <p className="text-sm">Subtotal: <span className="font-medium">{formatoMoneda(subtotalCalc)}</span></p>
                <p className="text-sm">Total: <span className="font-medium">{formatoMoneda(totalCalc)}</span></p>
                {vueltoCalc > 0 && (
                  <p className="text-sm">Vuelto: <span className="font-semibold text-primary">{formatoMoneda(vueltoCalc)}</span></p>
                )}
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button disabled={savingVenta} onClick={crearVenta}><CheckCircle2 />{savingVenta ? 'Guardando…' : 'Registrar venta'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* A 320 px las tres pestañas suman 324: sin `flex-wrap` ensanchaban la página (medido en Chromium, ADR-020). */}
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="todas"><ListChecks />Todas</TabsTrigger>
          <TabsTrigger value="sin_facturar"><ReceiptText />Sin facturar</TabsTrigger>
          <TabsTrigger value="facturadas"><FileCheck />Facturadas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 py-3">
          <div className="grid gap-2"><Label htmlFor="ventas-desde">Desde</Label><Input id="ventas-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" /></div>
          <div className="grid gap-2"><Label htmlFor="ventas-hasta">Hasta</Label><Input id="ventas-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" /></div>
          <div className="grid gap-2">
            <Label htmlFor="ventas-q">Buscar</Label>
            <Input id="ventas-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} className="min-w-48" placeholder="Buscar…" />
          </div>
          <Button size="sm" variant="outline" onClick={() => load()}>Filtrar</Button>
          {(q || desde || hasta) && <Button size="sm" variant="outline" onClick={limpiarFiltros}>Limpiar</Button>}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent>
          <div ref={medidaTabla} className="min-w-0">
            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : enTarjetas ? (
              ventas.length === 0
                ? <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
                : (
                  <ul className="grid gap-3" aria-label="Ventas">
                    {ventas.map((v) => (
                      <TarjetaDeVenta key={v.id} venta={v} medios={mediosDe(v)} factura={facturaDe(v)} rutaDeDetalle={rutaDeDetalle} acciones={acciones(v)} />
                    ))}
                  </ul>
                )
            ) : (
              <DataTable columns={columns} data={ventas} emptyMessage={emptyMessage} onRowClick={(v) => navigate(rutaDeDetalle(v.id))} />
            )}
          </div>
        </CardContent>
      </Card>

      {dialogoTicket}
    </div>
  )
}

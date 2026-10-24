// La bandeja de comprobantes pendientes de facturar (ADR-087): lo que otros sistemas —o el nodo de LibraEdge del propio
// producto— dejaron para facturar. Era una pantalla propia de Contalibra (`pages/ComprobantesPendientes.tsx`); el ADR-077
// dejó anotado que subía al kit cuando un segundo producto la necesitara, y ese producto es el que vende desde un nodo
// (RestoLibra, VentaLibra), donde la bandeja es la que muestra las ventas cobradas sin conexión.
//
// ## Qué es del kit y qué es del producto
//
// El backend es el mismo en todos: `libracore.comprobantes_router.build_comprobantes_bandeja_router`, bajo
// `/api/comprobantes-pendientes` (`ruta` sólo si el producto lo monta en otro lado). Lo que decide cada producto entra por
// props: **cómo se factura** (`alFacturar`: el formulario de factura es de cada producto, así que la bandeja no navega sola),
// **el permiso de descartar** (`puedeDescartar`), el adónde lleva «Ver factura» (`rutaFactura`), los textos y los orígenes.
//
// ## Las ventas del nodo no se tildan ni se descartan
//
// Una fila `origen_tipo = "venta"` (`esVentaSinConexion`) es una venta ya cobrada sin conexión. Se factura desde la venta o
// sola al volver la conexión: con el formulario saldría una factura sin vínculo con la venta y la tanda del nodo emitiría
// otra (el motor lo rechaza con 409 `se_factura_desde_la_venta`), y descartarla la dejaría cobrada y sin factura para
// siempre (409 desde libracore v1.186.1). Por eso en esa fila no hay casilla ni «Descartar»: hay `BotonFacturarPendientesDelNodo`
// y la etiqueta `EtiquetaVentaSinConexion`. Fuera de un nodo no hay ninguna fila así y la tabla queda como siempre.
//
// ## La cola de comprobantes del nodo (ADR-094)
//
// Con `cola`, la pantalla suma una pestaña «Cola de ARCA»: las facturas y cartas de porte que el nodo dejó pendientes sin conexión
// (`cola_arca`, libracore ADR-079), con sus acciones (`PanelDeLaCola`). Es otra tabla que la de acá —de máquina, con un estado por
// pedido— pero se mira en el mismo lugar. Sin `cola` (o fuera de un nodo, o si el producto no monta la ruta) no hay pestaña ni se
// pregunta nada: la pantalla queda como siempre.
//
// Lo que resuelve contra el consumidor son los `@/components/ui/*`, como `MpBandeja`.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Info, ReceiptText, X } from 'lucide-react'

import { api, ApiError } from './api-client'
import { BadgeEstado } from './badge-estado'
import { PanelDeLaCola, type PanelDeLaColaProps } from './BandejaDeLaCola'
import { BotonFacturarPendientesDelNodo, EtiquetaVentaSinConexion } from './CartelSinConexion'
import { ESTADOS_ABIERTOS, estaAbierto, useColaDelNodo } from './cola-del-nodo'
import {
  ORIGENES_DE_COMPROBANTE, RUTA_COMPROBANTES_PENDIENTES, TEXTO_BANDEJA_DE_CONSULTA, TITULO_BANDEJA, periodoDelComprobante,
  type BandejaDeComprobantesDatos, type ComprobantePendiente, type OrigenDeComprobante, type PrefillComprobantes,
} from './comprobantes-pendientes'
import { DataTable, sortableHeader, type ColumnDef } from './data-table'
import { formatoMoneda } from './formatos'
import { ICONOS } from './iconos-identidad'
import { esVentaSinConexion } from './nodo-offline'
import { TituloPantalla } from './titulo-pantalla'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Pestana = 'pendientes' | 'facturados' | 'descartados' | 'cola'

export type BandejaDeComprobantesProps = {
  /** Qué hacer con los comprobantes elegidos, ya armado el formulario (`POST .../facturar-prefill`, que no escribe nada):
   *  el producto lleva a su formulario de factura con ese `prefill` cargado. La emisión y el CAE pasan ahí, **la bandeja
   *  nunca factura por su cuenta**. Sin esta prop no hay casillas ni «Facturar»: la bandeja es de consulta (y de las ventas
   *  del nodo, que se facturan desde la venta). */
  alFacturar?: (prefill: PrefillComprobantes) => void
  /** ¿Puede descartar a mano este usuario? Por defecto sí. Una venta del nodo no se descarta nunca, con o sin permiso. */
  puedeDescartar?: boolean
  /** Adónde lleva «Ver factura» en el historial. Por defecto `/facturas/<id>`. */
  rutaFactura?: (facturaId: number) => string
  /** Dónde el producto montó el router de la bandeja. Por defecto `/api/comprobantes-pendientes`. */
  ruta?: string
  /** Dónde montó `POST .../facturar-pendientes` del nodo. Por defecto la del kit (`/api/nodo/facturar-pendientes`). */
  rutaFacturarPendientes?: string
  /** El título de la pantalla; el ícono es siempre el del concepto del catálogo (`ICONOS.comprobantesAFacturar`), el del menú. */
  titulo?: string
  /** El texto de arriba de la tabla de pendientes. Por defecto el que explica el agrupado (con `alFacturar`) o el de
   *  consulta (sin él). `null` lo saca. */
  introduccion?: ReactNode
  /** Los orígenes del producto, que suman a los de la familia (`ORIGENES_DE_COMPROBANTE`) o los pisan. */
  origenes?: Record<string, OrigenDeComprobante>
  /** Suma la pestaña «Cola de ARCA» (ADR-094): los pedidos de `cola_arca` del nodo. `true` con la ruta de siempre
   *  (`/api/nodo/cola`); un objeto para cambiar la `ruta`, `puedeResolver`, `describir` o `introduccion` (los de `PanelDeLaCola`).
   *  La pestaña sólo aparece en un nodo con la ruta montada. */
  cola?: boolean | Omit<PanelDeLaColaProps, 'cola' | 'className'>
  className?: string
}

// Módulo y no inline en los parámetros: una función nueva por render rehace las columnas del historial cada vez.
const rutaDeFacturaPorDefecto = (facturaId: number) => `/facturas/${facturaId}`

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

function Origen({ tipo, producto, origenes }: { tipo: string; producto: string; origenes: Record<string, OrigenDeComprobante> }) {
  // Una venta cobrada sin conexión en el nodo de este producto (ADR-077): no la mandó otro sistema.
  if (esVentaSinConexion({ origen_tipo: tipo })) return <EtiquetaVentaSinConexion />
  const conf = origenes[tipo] ?? { label: tipo, icon: FileText }
  const Icon = conf.icon
  return (
    <span className="inline-flex items-center gap-1.5" title={`Enviado por ${producto}`}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{conf.label}</span>
    </span>
  )
}

export function BandejaDeComprobantes({
  alFacturar, puedeDescartar = true, rutaFactura = rutaDeFacturaPorDefecto, ruta = RUTA_COMPROBANTES_PENDIENTES,
  rutaFacturarPendientes, titulo = TITULO_BANDEJA, introduccion, origenes: origenesPropios, cola: colaPedida, className,
}: BandejaDeComprobantesProps) {
  const [data, setData] = useState<BandejaDeComprobantesDatos | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tabElegida, setTab] = useState<Pestana>('pendientes')
  const [elegidos, setElegidos] = useState<number[]>([])
  const [descartando, setDescartando] = useState<ComprobantePendiente | null>(null)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  const origenes = useMemo(() => ({ ...ORIGENES_DE_COMPROBANTE, ...origenesPropios }), [origenesPropios])

  // La cola se pide aunque la pestaña no esté abierta: el conteo del rótulo y saber si hay pestaña dependen de ella.
  const conCola = colaPedida !== undefined && colaPedida !== false
  const propiedadesDeLaCola = typeof colaPedida === 'object' ? colaPedida : undefined
  const usoDeLaCola = useColaDelNodo({ ruta: propiedadesDeLaCola?.ruta, estados: ESTADOS_ABIERTOS, habilitada: conCola })
  const hayCola = conCola && usoDeLaCola.disponible === true
  const abiertosDeLaCola = usoDeLaCola.pedidos.filter((p) => estaAbierto(p.estado)).length
  // Si la cola deja de estar (el nodo ya no contesta la ruta) y era la pestaña abierta, se vuelve a la primera.
  const tab: Pestana = tabElegida === 'cola' && !hayCola ? 'pendientes' : tabElegida

  const load = useCallback(async () => {
    setError(null)
    try {
      const nueva = await api.get<BandejaDeComprobantesDatos>(ruta)
      setData(nueva)
      // Lo que se resolvió mientras tanto (la tanda del nodo, otra persona) ya no se puede elegir: mandarlo al prefill
      // daría un 409.
      setElegidos((prev) => prev.filter((id) => nueva.pendientes.some((c) => c.id === id)))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }, [ruta])

  useEffect(() => { void load() }, [load])

  // Memoizado y no `data?.pendientes ?? []` a secas: el `??` devuelve un array nuevo en cada render y los `useMemo` de
  // abajo se recalcularían siempre.
  const pendientes = useMemo(() => data?.pendientes ?? [], [data])

  // Las ventas que el nodo cobró sin conexión no se juntan en el formulario: se facturan desde la venta, con «Facturar
  // ahora» o solas al volver la conexión. Fuera de un nodo no hay ninguna y la columna queda del ancho de la casilla.
  const hayVentasDelNodo = useMemo(() => pendientes.some(esVentaSinConexion), [pendientes])

  // Sólo se pueden facturar juntos comprobantes del mismo cliente: una factura tiene un solo receptor. El backend lo
  // rechaza igual (422), pero dejar tildar lo que después va a fallar es una trampa — acá se deshabilita.
  const clienteElegido = useMemo(() => {
    const primero = pendientes.find((c) => elegidos.includes(c.id))
    return primero ? (primero.cliente_cuit || primero.cliente_razon) : null
  }, [pendientes, elegidos])

  const totalElegido = useMemo(
    () => pendientes.filter((c) => elegidos.includes(c.id)).reduce((acc, c) => acc + c.total, 0),
    [pendientes, elegidos],
  )

  async function facturar() {
    if (!alFacturar) return
    setSaving(true)
    setError(null)
    try {
      const prefill = await api.post<PrefillComprobantes>(`${ruta}/facturar-prefill`, { ids: elegidos })
      alFacturar(prefill)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmarDescarte() {
    if (!descartando) return
    setSaving(true)
    setError(null)
    try {
      await api.post(`${ruta}/${descartando.id}/descartar`, { motivo })
      setDescartando(null)
      setMotivo('')
      await load()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  const columnsPendientes = useMemo<ColumnDef<ComprobantePendiente>[]>(() => {
    const columnas: ColumnDef<ComprobantePendiente>[] = []
    // Sin `alFacturar` no hay nada que elegir: la columna sólo existe si hay casillas o botones de venta del nodo.
    if (alFacturar || hayVentasDelNodo) {
      columnas.push({
        id: 'elegir',
        header: '',
        size: hayVentasDelNodo ? 150 : 40,
        minSize: hayVentasDelNodo ? 150 : 40,
        cell: ({ row }) => {
          const c = row.original
          // 🔴 No se tilda: con el formulario saldría una factura sin vínculo con la venta y la tanda del nodo emitiría
          // otra. En su lugar, facturar ya desde la venta.
          if (esVentaSinConexion(c)) return <BotonFacturarPendientesDelNodo ruta={rutaFacturarPendientes} onFacturado={() => { void load() }} />
          if (!alFacturar) return null
          // Sólo se pueden juntar comprobantes del mismo cliente. La comparación va inline y no en un helper para que el
          // arreglo de dependencias del memo sea el de verdad.
          const habilitado = clienteElegido === null
            || (c.cliente_cuit || c.cliente_razon) === clienteElegido
          return (
            // Checkbox nativo, como el resto de las pantallas de la suite (Cajas, Recibos, ListaPrecioDetalle): no hay
            // componente de checkbox en el kit y agregarlo traería una dependencia de radix por una sola tabla.
            <input
              type="checkbox"
              checked={elegidos.includes(c.id)}
              disabled={!habilitado}
              onChange={() => setElegidos((prev) => prev.includes(c.id)
                ? prev.filter((x) => x !== c.id)
                : [...prev, c.id])}
              aria-label={`Elegir ${c.cliente_razon}`}
              title={habilitado ? undefined : 'Es de otro cliente: una factura tiene un solo receptor'}
            />
          )
        },
      })
    }
    columnas.push(
      {
        accessorKey: 'cliente_razon',
        header: sortableHeader('Cliente'),
        size: 180,
        minSize: 120,
        meta: { stretch: true },
        cell: ({ row }) => (
          <div className="w-full">
            <p className="truncate font-medium" title={row.original.cliente_razon}>{row.original.cliente_razon}</p>
            {row.original.cliente_cuit && <p className="truncate text-xs text-muted-foreground">{row.original.cliente_cuit}</p>}
          </div>
        ),
      },
      {
        id: 'origen',
        header: 'Origen',
        size: 150,
        minSize: 110,
        cell: ({ row }) => <Origen tipo={row.original.origen_tipo} producto={row.original.origen_producto} origenes={origenes} />,
      },
      {
        id: 'detalle',
        header: 'Detalle',
        size: 200,
        minSize: 140,
        cell: ({ row }) => {
          const items = row.original.items
          const primero = items[0]?.description ?? '—'
          const resto = items.length - 1
          return (
            <span className="block w-full truncate" title={items.map((i) => i.description).join(' · ')}>
              {primero}{resto > 0 ? ` +${resto}` : ''}
            </span>
          )
        },
      },
      { id: 'periodo', header: 'Período', size: 170, minSize: 130, cell: ({ row }) => periodoDelComprobante(row.original) },
      {
        accessorKey: 'total',
        header: sortableHeader('Total'),
        size: 110,
        minSize: 90,
        cell: ({ row }) => <span className="font-medium">{formatoMoneda(row.original.total)}</span>,
      },
    )
    if (puedeDescartar) {
      columnas.push({
        id: 'acciones',
        header: '',
        size: 60,
        minSize: 60,
        // Una venta del nodo ya está cobrada: no se descarta, se factura (desde la venta o sola al volver la conexión).
        cell: ({ row }) => esVentaSinConexion(row.original) ? null : (
          <Button
            size="icon" variant="outline" title="Descartar"
            onClick={() => { setDescartando(row.original); setMotivo('') }}
          >
            <X className="size-4" />
          </Button>
        ),
      })
    }
    return columnas
  }, [alFacturar, puedeDescartar, elegidos, clienteElegido, hayVentasDelNodo, origenes, rutaFacturarPendientes, load])

  const columnsResueltos = useMemo<ColumnDef<ComprobantePendiente>[]>(() => [
    {
      accessorKey: 'cliente_razon',
      header: sortableHeader('Cliente'),
      size: 180,
      minSize: 120,
      meta: { stretch: true },
      cell: ({ row }) => <span className="block w-full truncate" title={row.original.cliente_razon}>{row.original.cliente_razon}</span>,
    },
    {
      id: 'origen',
      header: 'Origen',
      size: 150,
      minSize: 110,
      cell: ({ row }) => <Origen tipo={row.original.origen_tipo} producto={row.original.origen_producto} origenes={origenes} />,
    },
    {
      accessorKey: 'total',
      header: 'Total',
      size: 110,
      minSize: 90,
      cell: ({ row }) => formatoMoneda(row.original.total),
    },
    { accessorKey: 'resuelto_at', header: sortableHeader('Resuelto'), size: 140, minSize: 110 },
    { accessorKey: 'resuelto_por', header: 'Por', size: 120, minSize: 90 },
    {
      id: 'resultado',
      header: 'Resultado',
      size: 150,
      minSize: 120,
      cell: ({ row }) => {
        const c = row.original
        if (c.estado === 'facturado') {
          return c.factura_id
            ? <Button asChild size="sm" variant="outline"><Link to={rutaFactura(c.factura_id)}><ReceiptText className="mr-1 size-4" />Ver factura</Link></Button>
            : <BadgeEstado tono="ok">Facturado</BadgeEstado>
        }
        return (
          <span className="block w-full truncate text-muted-foreground" title={c.motivo_descarte || undefined}>
            {c.motivo_descarte || 'Descartado'}
          </span>
        )
      },
    },
  ], [origenes, rutaFactura])

  const filas = tab === 'pendientes' ? pendientes
    : tab === 'facturados' ? (data?.facturados ?? [])
      : (data?.descartados ?? [])

  const textoIntroduccion: ReactNode = introduccion !== undefined ? introduccion : alFacturar
    ? (
      <>
        Lo que otros sistemas dejaron para facturar acá. Elegí uno o varios
        del <strong>mismo cliente</strong> para juntarlos en una factura —
        nada se emite hasta que lo confirmes en el formulario.
      </>
    )
    : TEXTO_BANDEJA_DE_CONSULTA

  return (
    <div className={`grid gap-4 ${className ?? ''}`}>
      <TituloPantalla icono={ICONOS.comprobantesAFacturar}>{titulo}</TituloPantalla>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            {tab === 'pendientes' ? 'Pendientes' : tab === 'facturados' ? 'Facturados' : tab === 'descartados' ? 'Descartados' : 'Cola de ARCA'}
          </CardTitle>
          <Tabs value={tab} onValueChange={(v) => { setTab(v as Pestana); setElegidos([]) }}>
            <TabsList>
              <TabsTrigger value="pendientes">
                Pendientes{data ? ` (${data.total_pendientes})` : ''}
              </TabsTrigger>
              <TabsTrigger value="facturados">Facturados</TabsTrigger>
              <TabsTrigger value="descartados">Descartados</TabsTrigger>
              {hayCola && <TabsTrigger value="cola">Cola de ARCA{usoDeLaCola.cola ? ` (${abiertosDeLaCola})` : ''}</TabsTrigger>}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="grid gap-3">
          {tab === 'cola' && <PanelDeLaCola cola={usoDeLaCola} {...propiedadesDeLaCola} />}

          {tab === 'pendientes' && textoIntroduccion !== null && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>{textoIntroduccion}</span>
            </p>
          )}

          {tab === 'cola' ? null : loading && !data
            ? <p className="text-sm text-muted-foreground">Cargando…</p>
            : filas.length === 0
              ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {tab === 'pendientes' ? 'No hay nada esperando para facturar.' : 'Todavía no hay nada acá.'}
                </p>
              )
              : (
                <DataTable
                  columns={tab === 'pendientes' ? columnsPendientes : columnsResueltos}
                  data={filas}
                />
              )}

          {alFacturar && tab === 'pendientes' && elegidos.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
              {/* La frase entera en un solo nodo: partida en `<strong>{n}</strong>` más texto suelto, quedaba imposible de
                  buscar por texto y —lo que importa más— la lee mal un lector de pantalla. */}
              <p className="text-sm">
                <strong>
                  {elegidos.length === 1
                    ? '1 comprobante elegido'
                    : `${elegidos.length} comprobantes elegidos`}
                </strong>
                {' · '}
                <strong>{formatoMoneda(totalElegido)}</strong>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setElegidos([])}>Limpiar</Button>
                <Button disabled={saving} onClick={facturar}>
                  <ReceiptText className="mr-1 size-4" />
                  {saving ? 'Preparando…' : 'Facturar'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {descartando && puedeDescartar && !esVentaSinConexion(descartando) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Descartar comprobante</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {descartando.cliente_razon} · {formatoMoneda(descartando.total)}.
              No se factura y el sistema de origen deja de reenviarlo.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="motivo-descarte">Motivo</Label>
              <Input
                id="motivo-descarte" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: se cobró por fuera"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDescartando(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={saving} onClick={confirmarDescarte}>
                Descartar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// El listado de comprobantes de la familia: facturas, notas de crédito y notas
// de débito.
//
// Estaba escrito dos veces —Contalibra y Restolibra, 298 y 296 líneas— y las
// dos copias diferían en **26 líneas**, todas de un mismo lugar: las etiquetas
// de los badges de tipo. Se unifica en la forma de Contalibra, que es la mejor
// de las dos: etiquetas cortas (`FA`, `NCB`) para que la columna Tipo ocupe lo
// mínimo, con el nombre completo en el `title`. Restolibra pierde `Fact. A` y
// gana el tooltip, que es un cambio visible y deliberado.
//
// LibraClub NO era una tercera copia: su pantalla se escribió aparte y difería
// en 448 líneas. Entra acá igual, y el motivo es funcional — desde que el
// producto emite notas de crédito y débito, su listado sin pestañas las dejaba
// sin ningún lugar donde verse.
//
// ## Lo que cada producto decide
//
// Casi todo cuelga de **una** pregunta: ¿este producto lleva los cobros contra
// el comprobante? De ahí salen la pestaña «Sin cobrar», los estados
// Cobrada/Parcial/Acreditada/Sin cobrar y el botón de registrar cobro. En LibraClub la
// respuesta es **no**: el cruce `caja_movimientos.factura_id` sólo lo llena el
// cobro por QR —el efectivo se carga como monto y concepto libre, sin vínculo
// con la reserva—, así que mostrar «Sin cobrar» diría eso de todo lo cobrado en
// efectivo. Es la misma decisión que ya se había tomado para la columna de
// cobrado el 2026-08-27.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IndicadorEnvioEmail } from './envios-email'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from './data-table'
import { TACTIL_BAJO_LG } from './use-ancho'
import {
  CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Eye, FileDown, FileMinus, FilePlus, Hourglass, Search, X,
} from 'lucide-react'

import { api, ApiError } from './api-client'
import type { Factura } from './facturas'
import { anchoColumnaAcciones, DataTable, sortableHeader } from './data-table'
import { BadgeEstado } from './badge-estado'
import { TituloPantalla } from './titulo-pantalla'
import { ICONOS } from './iconos-identidad'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { formatoMoneda } from './formatos'
import { acreditadoDe, estadoDeCobro, pendienteDe, puedeCobrar } from './estado-de-cobro'
import { NC, esCobrable, letraDe, nombreDe, siglaDe } from './tipos-de-comprobante'

// Etiquetas cortas (FA/FB/FC, NCA…, NDA…, FEA… para las FCE) para que la columna Tipo ocupe lo mínimo — el nombre completo queda en el `title`
// de cada badge. La sigla y el nombre salen de `tipos-de-comprobante`; acá sólo el color, que depende de la letra y de si es nota de crédito.
const COLOR_POR_LETRA = {
  A: 'bg-primary text-primary-foreground',
  B: 'bg-secondary text-secondary-foreground',
  C: 'bg-sky-700 text-white',
} as const
const COLOR_NOTA_DE_CREDITO = 'bg-destructive text-white dark:bg-destructive/60'

function badgeDeTipo(tipo: number): { label: string; titulo: string; className: string } {
  const letra = letraDe(tipo)
  if (!letra) return { label: '?', titulo: 'Comprobante', className: 'bg-secondary text-secondary-foreground' }
  return {
    label: siglaDe(tipo),
    titulo: nombreDe(tipo),
    className: NC.includes(tipo) ? COLOR_NOTA_DE_CREDITO : COLOR_POR_LETRA[letra],
  }
}

/** Una factura **sin CAE no es un error**: existe, tiene número, y lo que falta
 *  es que ARCA la autorice. Sin certificado cargado pasa siempre. */
function estaAutorizada(f: Factura): boolean {
  return Boolean(f.cae) && f.cae !== 'PENDIENTE'
}

export type VistaDeComprobantes = 'facturas' | 'sin_cobrar' | 'nc' | 'nd'

export type FacturasProps = {
  /** Cómo se arma el link al PDF. Difiere por producto: Contalibra y
   *  Restolibra lo sirven desde su router Jinja2 (`/facturas/{id}/pdf`) y
   *  LibraClub desde su API (`/api/facturas/{id}/pdf`). */
  urlDelPdf: (id: number) => string
  /** 🔑 Si este producto cruza los cobros contra el comprobante. Con `false` se
   *  van la pestaña «Sin cobrar», los estados Cobrada/Parcial/Acreditada y el botón de
   *  cobro: sin ese cruce, todos dirían «Sin cobrar» aunque esté cobrado. */
  muestraCobros?: boolean
  /** A dónde lleva el botón «Ver comprobante». **Sin esto no se dibuja**, ni
   *  tampoco el de cobro: un producto que todavía no tiene pantalla de detalle
   *  mandaría a una ruta inexistente, que en estas SPA no da 404 sino que cae en
   *  el catch-all y redirige a otra pantalla — un botón que se ve, se aprieta y
   *  te saca de donde estabas. */
  rutaDelDetalle?: (id: number) => string
  /** Los controles del encabezado, a la derecha. Los arma el producto porque el
   *  alta no es igual en todos —y en uno todavía no existe—. */
  acciones?: ReactNode
  /** Qué decir cuando no hay ningún comprobante todavía. El default sirve para
   *  un producto donde se emite desde esta misma pantalla; el que emite desde
   *  otro lado tiene que decir desde dónde. */
  mensajeVacio?: string
}

/** `sin_enviar` incluye los envíos que fallaron y sólo comprobantes con CAE (lo decide el motor). */
type FiltroEnvio = 'todas' | 'enviada' | 'sin_enviar'

export function Facturas({
  urlDelPdf,
  rutaDelDetalle,
  muestraCobros = true,
  acciones,
  mensajeVacio = 'No hay comprobantes registrados aún.',
}: FacturasProps) {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<VistaDeComprobantes>('facturas')
  const [q, setQ] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  // Filtro por el rastro de envíos por mail (libracore ≥ v1.166.0, ADR-051 del motor).
  const [envio, setEnvio] = useState<FiltroEnvio>('todas')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [totalPages, setTotalPages] = useState(1)
  const [sinCobrarCount, setSinCobrarCount] = useState(0)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, page])

  useEffect(() => {
    if (!muestraCobros) return
    // El contador del badge de «Sin cobrar», independiente del filtro y la
    // página activos.
    api.get<{ total: number }>('/api/facturas?vista=sin_cobrar')
      .then((d) => setSinCobrarCount(d.total))
      .catch(() => {})
  }, [facturas, muestraCobros])

  function describirError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  /** Los filtros que se le mandan al backend.
   *
   * 🔴 Se pueden pasar por parámetro, y no es un adorno: `limpiarFiltros` los
   * necesita. La versión anterior hacía `setQ('')` y después
   * `setTimeout(cargar, 0)`, pero `cargar` es la función de ESTE render y
   * cierra sobre el `q` **viejo**: la pantalla borraba los campos y volvía a
   * consultar con el filtro puesto. Los inputs vacíos y la tabla filtrada — el
   * operador cree que no hay más comprobantes.
   *
   * Venía de Contalibra y se encontró al extraer esto y escribirle un test.
   */
  type Filtros = { q: string; desde: string; hasta: string; envio: FiltroEnvio }

  function armarQuery(f: Filtros, pagina: number): string {
    const params = new URLSearchParams({ vista, page: String(pagina) })
    if (f.q) params.set('q', f.q)
    if (f.desde) params.set('desde', f.desde)
    if (f.hasta) params.set('hasta', f.hasta)
    if (f.envio !== 'todas') params.set('envio', f.envio)
    return params.toString()
  }

  async function cargar(f: Filtros = { q, desde, hasta, envio }, pagina: number = page) {
    setLoading(true)
    setError(null)
    try {
      const datos = await api.get<{ items: Factura[]; total: number; total_pages: number }>(
        `/api/facturas?${armarQuery(f, pagina)}`,
      )
      setFacturas(datos.items)
      setTotal(datos.total)
      setTotalPages(datos.total_pages)
    } catch (err) {
      setError(describirError(err))
    } finally {
      setLoading(false)
    }
  }

  function buscar() {
    setPage(1)
    cargar()
  }

  function limpiarFiltros() {
    const vacios: Filtros = { q: '', desde: '', hasta: '', envio: 'todas' }
    setQ(''); setDesde(''); setHasta(''); setEnvio('todas'); setPage(1)
    // Con los filtros explícitos, no con lo que haya en el estado: acá todavía
    // tiene lo viejo.
    cargar(vacios, 1)
  }

  const esNota = vista === 'nc' || vista === 'nd'
  // Se cobra lo cobrable (ADR-074): las facturas y las notas de débito, no las de crédito. Lo decide el tipo de cada fila, con la lista del
  // kit (`tipos-de-comprobante`); la vista sólo dice si hay alguna fila que se cobre, para dimensionar la columna de acciones.
  const hayCobrables = vista !== 'nc'

  // El PDF está siempre; el detalle y el cobro dependen del producto.
  const cuantosBotones = 1 + (rutaDelDetalle ? 1 : 0)
    + (rutaDelDetalle && muestraCobros && hayCobrables ? 1 : 0)

  const columns = useMemo<ColumnDef<Factura>[]>(() => {
    const cols: ColumnDef<Factura>[] = [
      {
        accessorKey: 'numero',
        header: sortableHeader('Número'),
        // El número siempre mide lo mismo (0000-00000000, mono), así que la
        // columna va fija a ese ancho en vez de repartirse espacio de más.
        size: 120,
        minSize: 100,
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {String(row.original.punto_venta).padStart(4, '0')}-
            {String(row.original.numero).padStart(8, '0')}
          </span>
        ),
      },
      {
        id: 'tipo',
        header: 'Tipo',
        size: 70,
        minSize: 55,
        cell: ({ row }) => {
          const b = badgeDeTipo(row.original.tipo)
          return <Badge className={b.className} title={b.titulo}>{b.label}</Badge>
        },
      },
      { accessorKey: 'fecha', header: 'Fecha', size: 100, minSize: 90 },
      // Cliente es la columna elástica: su `size` sólo fija cuánto ancho pide
      // como mínimo (para el scroll interno), porque en pantalla se queda con
      // todo el sobrante. Cuanto más chico, en pantallas más angostas entra la
      // tabla completa — importante en las vistas NC/ND, que suman una columna.
      {
        accessorKey: 'cliente_razon',
        header: 'Cliente',
        size: 160,
        minSize: 90,
        meta: { stretch: true },
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.cliente_razon ?? undefined}>
            {row.original.cliente_razon}
          </span>
        ),
      },
    ]

    if (esNota) {
      cols.push({
        id: 'cbte_asoc',
        header: 'Cbte. asoc.',
        size: 118,
        minSize: 95,
        cell: ({ row }) => row.original.cbte_asoc_nro
          ? (
            <span className="font-mono text-xs text-muted-foreground">
              {String(row.original.cbte_asoc_pv ?? 0).padStart(4, '0')}-
              {String(row.original.cbte_asoc_nro).padStart(8, '0')}
            </span>
          )
          : null,
      })
    }

    cols.push({
      accessorKey: 'total',
      header: () => <div className="text-right">Total</div>,
      size: 130,
      minSize: 100,
      cell: ({ row }) => (
        <div className={`truncate text-right font-medium ${vista === 'nc' ? 'text-destructive' : vista === 'nd' ? 'text-primary' : ''}`}>
          {vista === 'nc' ? '- ' : vista === 'nd' ? '+ ' : ''}
          {formatoMoneda(row.original.total)}
        </div>
      ),
    })

    cols.push({
      id: 'estado',
      header: 'Estado',
      size: 112,
      minSize: 90,
      cell: ({ row }) => {
        const f = row.original
        if (!estaAutorizada(f)) {
          // El rótulo es siempre «Sin CAE»; el motivo, si lo hay, va de ayuda.
          return (
            <span title={f.cae_error || undefined}>
              <BadgeEstado tono="neutro">Sin CAE</BadgeEstado>
            </span>
          )
        }
        // Sin cruce de cobros no se puede decir más que «autorizada»: inventar
        // un «Sin cobrar» sería mentirle al que ya cobró en efectivo.
        if (!esCobrable(f.tipo) || !muestraCobros) {
          return <BadgeEstado tono="ok"><CheckCircle2 />Autorizada</BadgeEstado>
        }
        // La cuenta es la del motor (`pendiente`, `total_acreditado`: ADR-059) y se lee en `estado-de-cobro.ts`,
        // no se resta acá. «Acreditada» no es «Cobrada»: las notas de crédito la dejaron en cero sin que nadie
        // pague, y no se puede cobrar.
        const estado = estadoDeCobro(f)
        if (estado === 'acreditada') {
          return (
            <span title={`Acreditada por notas de crédito: ${formatoMoneda(acreditadoDe(f))}`}>
              <BadgeEstado tono="neutro"><FileMinus />Acreditada</BadgeEstado>
            </span>
          )
        }
        if (estado === 'cobrada') return <BadgeEstado tono="ok"><CheckCircle2 />Cobrada</BadgeEstado>
        // Con una nota parcial, lo que falta ya no es el total menos lo cobrado: el `title` dice cuánto.
        const conNota = acreditadoDe(f) > 0
        const ayuda = conNota ? `Falta ${formatoMoneda(pendienteDe(f))} (acreditado por notas de crédito: ${formatoMoneda(acreditadoDe(f))})` : undefined
        if (estado === 'parcial') return <span title={ayuda}><BadgeEstado tono="atencion"><Hourglass />Parcial</BadgeEstado></span>
        return <span title={ayuda}><BadgeEstado tono="neutro"><Hourglass />Sin cobrar</BadgeEstado></span>
      },
    })

    cols.push({
      id: 'mail',
      header: 'Mail',
      size: 100,
      minSize: 90,
      cell: ({ row }) => (estaAutorizada(row.original) ? <IndicadorEnvioEmail resumen={row.original.envio_email} /> : null),
    })

    cols.push({
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      // Sólo iconos (el texto vive en el tooltip). El ancho lo calcula
      // `anchoColumnaAcciones` a partir de la cantidad de botones — hacer la
      // cuenta a mano fue el bug: los 116px de antes se olvidaban del padding
      // de la celda y recortaban 16px del PRIMER botón.
      size: anchoColumnaAcciones(cuantosBotones),
      minSize: anchoColumnaAcciones(cuantosBotones),
      cell: ({ row }) => {
        const f = row.original
        const sePuedeCobrar = Boolean(rutaDelDetalle) && muestraCobros && esCobrable(f.tipo)
          && estaAutorizada(f) && puedeCobrar(f)
        return (
          <div className={`flex justify-end gap-1 ${TACTIL_BAJO_LG}`}>
            {sePuedeCobrar && rutaDelDetalle && (
              <Button asChild size="icon" variant="outline" title="Registrar cobro">
                <Link to={rutaDelDetalle(f.id)} aria-label="Registrar cobro"><CircleDollarSign /></Link>
              </Button>
            )}
            {rutaDelDetalle && (
              <Button asChild size="icon" variant="outline" title="Ver comprobante">
                <Link to={rutaDelDetalle(f.id)} aria-label="Ver comprobante"><Eye /></Link>
              </Button>
            )}
            <Button asChild size="icon" variant="outline" title="Descargar PDF">
              <a
                href={urlDelPdf(f.id)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Descargar PDF del comprobante ${String(f.punto_venta).padStart(4, '0')}-${String(f.numero).padStart(8, '0')}`}
              >
                <FileDown />
              </a>
            </Button>
          </div>
        )
      },
    })

    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, muestraCobros, cuantosBotones])

  function filtrarPorEnvio(valor: FiltroEnvio) {
    setEnvio(valor)
    setPage(1)
    // Se aplica en el acto, como las pestañas: con el valor nuevo explícito, porque el estado
    // todavía tiene el viejo (ver `Filtros`).
    cargar({ q, desde, hasta, envio: valor }, 1)
  }

  const hayFiltros = Boolean(q || desde || hasta || envio !== 'todas')

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={ICONOS.comprobantes}>Comprobantes</TituloPantalla>
        {acciones}
      </div>

      <Tabs value={vista} onValueChange={(v) => { setVista(v as VistaDeComprobantes); setPage(1) }}>
        <TabsList>
          <TabsTrigger value="facturas"><ICONOS.comprobantes />Facturas</TabsTrigger>
          {muestraCobros && (
            <TabsTrigger value="sin_cobrar">
              <Hourglass />Sin cobrar
              {sinCobrarCount > 0 && <Badge variant="secondary" className="ml-1">{sinCobrarCount}</Badge>}
            </TabsTrigger>
          )}
          <TabsTrigger value="nc"><FileMinus />Notas de Crédito</TabsTrigger>
          <TabsTrigger value="nd"><FilePlus />Notas de Débito</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Buscar por número, cliente…"
            aria-label="Buscar comprobantes"
            className="min-w-48 flex-1"
          />
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" className="w-40" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" className="w-40" />
          <Select value={envio} onValueChange={(v) => filtrarPorEnvio(v as FiltroEnvio)}>
            <SelectTrigger aria-label="Envío por mail" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Mail: todas</SelectItem>
              <SelectItem value="enviada">Enviadas</SelectItem>
              <SelectItem value="sin_enviar">Sin enviar</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" aria-label="Buscar" onClick={buscar}><Search /></Button>
          {hayFiltros && (
            <Button variant="outline" size="icon" aria-label="Limpiar filtros" onClick={limpiarFiltros}><X /></Button>
          )}
          {total !== null && (
            <span className="ml-auto text-sm text-muted-foreground">
              {total} resultado{total !== 1 ? 's' : ''}
            </span>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <DataTable
              columns={columns}
              data={facturas}
              emptyMessage={
                hayFiltros ? 'No se encontraron comprobantes con ese criterio.'
                  : vista === 'nc' ? 'No hay notas de crédito registradas aún.'
                  : vista === 'nd' ? 'No hay notas de débito registradas aún.'
                  : mensajeVacio
              }
            />
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <Button size="icon" variant="outline" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .map((p, idx, arr) => (
              <span key={p} className="flex items-center gap-1">
                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-muted-foreground">…</span>}
                <Button size="icon" variant={p === page ? 'default' : 'outline'} onClick={() => setPage(p)}>{p}</Button>
              </span>
            ))}
          <Button size="icon" variant="outline" aria-label="Página siguiente" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}

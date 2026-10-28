// El registro de los avisos que salieron (o no) por WhatsApp y por mail (ADR-097), contraparte de `GET /api/avisos/envios` (ADR-090 del motor).
//
// Es una pieza, no una pantalla: el producto la pone en su pantalla «Avisos», debajo de `ConfiguracionDeAvisos`. Responde «¿le llegó?»: fecha,
// canal, destino, tipo, estado (`BadgeEstado`) y el motivo de lo que falló.
//
//     <RegistroDeAvisos esAdmin />                                         // el router en /api/avisos
//     <RegistroDeAvisos basePath="/api/avisos" etiquetaDelTipo={(t) => TIPOS[t] ?? t} />
//
// ## El destino: enmascarado salvo para un administrador
//
// `GET /envios` trae el teléfono o el mail **completos** (el registro existe para contestar «¿le llegó a Ana?»), y el router es sólo de
// administrador. Esta pieza no sabe quién mira: con `esAdmin` muestra el destino entero, sin esa prop lo enmascara (`••••••••1234`). El
// producto la monta detrás de su gate de administrador y le pasa `esAdmin`; sin ella, el default es el seguro.
//
// ## Paginación
//
// El motor no pagina: devuelve los últimos `limite` (hasta 500) con filtros por canal y estado. Se piden de una vez y se muestran de a
// `porPagina`; cambiar un filtro vuelve a pedir. Si llegan tantos como el límite, la pieza avisa que hay más viejos que no se ven.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react'
import { ApiError } from './api-client'
import {
  ESTADO_DE_ENVIO, ESTADOS_DE_ENVIO, RUTA_AVISOS_POR_DEFECTO, clienteDeAvisos, enmascararDestino, etiquetaDeCanal, etiquetaDeTipoPorDefecto,
  type Envio, type EstadoDeEnvio,
} from './avisos'
import { BadgeEstado } from './badge-estado'
import { fechaHoraDeTexto } from './fechas'
import { TablaOTarjetas, TarjetaDeFila } from './tabla-o-tarjetas'
import type { ColumnDef } from './tabla'
import { cn } from './utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TODOS = '__todos__'
const LIMITE_POR_DEFECTO = 200
const POR_PAGINA_POR_DEFECTO = 20

export type RegistroDeAvisosProps = {
  /** Donde el producto montó `build_avisos_router`. Por defecto `/api/avisos`. */
  basePath?: string
  /** `true` muestra el teléfono o el mail completos. Sin ella, enmascarados. */
  esAdmin?: boolean
  /** Cuántos avisos pedir (los más nuevos; el motor admite hasta 500). Por defecto 200. */
  limite?: number
  /** Cuántas filas por página. Por defecto 20. */
  porPagina?: number
  /** El rótulo de un `tipo` (lo pone quien avisa, así que el vocabulario es del producto). Por defecto, el tipo con la primera en mayúscula. */
  etiquetaDelTipo?: (tipo: string) => string
  /** El título de la tarjeta. `null` lo saca. */
  titulo?: string | null
  className?: string
}

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'No se pudo leer el registro de avisos.'
}

export function RegistroDeAvisos({
  basePath = RUTA_AVISOS_POR_DEFECTO, esAdmin = false, limite = LIMITE_POR_DEFECTO, porPagina = POR_PAGINA_POR_DEFECTO,
  etiquetaDelTipo = etiquetaDeTipoPorDefecto, titulo = 'Registro de avisos', className,
}: RegistroDeAvisosProps = {}) {
  const [envios, setEnvios] = useState<Envio[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canal, setCanal] = useState(TODOS)
  const [estado, setEstado] = useState(TODOS)
  const [pagina, setPagina] = useState(1)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const lista = await clienteDeAvisos(basePath).envios({
        canal: canal === TODOS ? undefined : canal, estado: estado === TODOS ? undefined : estado, limite,
      })
      setEnvios(lista)
      setPagina(1)
    } catch (err) {
      setError(describirError(err))
    } finally {
      setCargando(false)
    }
  }, [basePath, canal, estado, limite])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const columnas = useMemo<ColumnDef<Envio>[]>(() => {
    const destino = (e: Envio) => (esAdmin ? e.destino || '—' : enmascararDestino(e.destino))
    return [
      { id: 'fecha', header: 'Fecha', size: 130, minSize: 120, cell: ({ row }) => fechaHoraDeTexto(row.original.created_at) },
      { id: 'canal', header: 'Canal', size: 90, minSize: 80, cell: ({ row }) => etiquetaDeCanal(row.original.canal) },
      {
        id: 'destino', header: 'Destino', size: 170, minSize: 130,
        cell: ({ row }) => <span className="block truncate font-mono text-xs" title={esAdmin ? destino(row.original) : undefined}>{destino(row.original)}</span>,
      },
      { id: 'tipo', header: 'Tipo', size: 140, minSize: 110, cell: ({ row }) => <span className="block truncate">{etiquetaDelTipo(row.original.tipo)}</span> },
      { id: 'estado', header: 'Estado', size: 120, minSize: 100, cell: ({ row }) => <InsigniaDeEstado envio={row.original} /> },
      {
        id: 'detalle', header: 'Detalle', size: 260, minSize: 160,
        cell: ({ row }) => {
          const texto = detalleDe(row.original)
          return <span className="block truncate text-muted-foreground" title={texto}>{texto || '—'}</span>
        },
      },
    ]
  }, [esAdmin, etiquetaDelTipo])

  const total = envios?.length ?? 0
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  const desde = (pagina - 1) * porPagina
  const visibles = (envios ?? []).slice(desde, desde + porPagina)
  const sinFiltros = canal === TODOS && estado === TODOS
  const hayMas = total > 0 && total >= limite

  return (
    <Card className={className}>
      {titulo !== null && (
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn('space-y-3', titulo === null && 'pt-6')}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="avisos-filtro-canal">Canal</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger id="avisos-filtro-canal" aria-label="Canal" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Correo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="avisos-filtro-estado">Estado</Label>
            {/* select-cerrado: los seis estados de un aviso los fija el motor (`avisos_envios.ESTADOS`), no salen de la base */}
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger id="avisos-filtro-estado" aria-label="Estado" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {ESTADOS_DE_ENVIO.map((e) => <SelectItem key={e} value={e}>{ESTADO_DE_ENVIO[e].etiqueta}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void cargar()} disabled={cargando}>
            <RefreshCw className={cn('size-4', cargando && 'animate-spin')} aria-hidden="true" />Actualizar
          </Button>
        </div>

        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

        {!error && envios !== null && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Mostrando <strong className="text-foreground">{desde + 1}–{desde + visibles.length}</strong>
              {' '}de <strong className="text-foreground">{total}</strong> avisos
            </span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="size-7" aria-label="Anterior" disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}><ChevronLeft /></Button>
              <span>Pág {pagina} / {paginas}</span>
              <Button size="icon" variant="outline" className="size-7" aria-label="Siguiente" disabled={pagina >= paginas}
                onClick={() => setPagina((p) => p + 1)}><ChevronRight /></Button>
            </div>
          </div>
        )}

        {!error && (
          <TablaOTarjetas
            columns={columnas}
            data={visibles}
            clave={(e) => e.id}
            etiqueta="Avisos"
            cargando={cargando && envios === null}
            emptyMessage={
              <span className="flex flex-col items-center gap-2">
                <Inbox className="size-6" aria-hidden="true" />
                {sinFiltros ? 'Todavía no se registró ningún aviso.' : 'No hay avisos con esos filtros.'}
              </span>
            }
            tarjeta={(e) => (
              <TarjetaDeFila
                titulo={etiquetaDelTipo(e.tipo)}
                subtitulo={`${fechaHoraDeTexto(e.created_at)} · ${etiquetaDeCanal(e.canal)}`}
                estado={<InsigniaDeEstado envio={e} />}
                datos={[
                  { etiqueta: 'Destino', valor: <span className="font-mono text-xs">{esAdmin ? e.destino || '—' : enmascararDestino(e.destino)}</span> },
                  { etiqueta: 'Detalle', valor: detalleDe(e) || '—' },
                ]}
              />
            )}
          />
        )}

        {hayMas && !error && (
          <p className="text-xs text-muted-foreground">Se muestran los últimos {limite} avisos; los más viejos no entran en la lista.</p>
        )}
      </CardContent>
    </Card>
  )
}

/** El motivo de lo que no salió; si hubo más de un intento, se dice. */
function detalleDe(e: Envio): string {
  const intentos = e.intentos > 1 ? `${e.intentos} intentos` : ''
  return [e.detalle, intentos].filter(Boolean).join(' · ')
}

function InsigniaDeEstado({ envio }: { envio: Envio }) {
  const info = ESTADO_DE_ENVIO[envio.estado as EstadoDeEnvio]
  // Un estado que el kit no conoce (un motor más nuevo) se ve con su nombre y en neutro, no se rompe.
  if (!info) return <BadgeEstado tono="neutro">{envio.estado}</BadgeEstado>
  return <span title={info.ayuda}><BadgeEstado tono={info.tono}>{info.etiqueta}</BadgeEstado></span>
}

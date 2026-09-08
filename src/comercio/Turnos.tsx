// Los turnos de caja: apertura, listado y el turno abierto (P9-M3, 2026-09-06).
// Extraída de `pages/Turnos.tsx`, byte a byte igual en Contalibra y Restolibra;
// `user.role === 'admin'` pasa a ser la prop `esAdmin`.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '../data-table'
import { api, ApiError } from '../api-client'
import { formatoMoneda, type Turno } from './tipos'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BadgeEstado } from '../badge-estado'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from '@/components/ui/dialog'
import { anchoColumnaAcciones, DataTable, sortableHeader } from '../data-table'
import { Clock, PlayCircle, StopCircle, Eye, ArrowUpCircle, ArrowDownCircle, CheckCircle2 } from 'lucide-react'
import { TituloPantalla } from '../titulo-pantalla'
import { fechaHora } from '@/lib/fechas'

// El backend guarda "YYYY-MM-DD HH:MM:SS"; en el listado los segundos son
// ruido y cuestan ~18px de ancho por columna (son dos). Se recortan solo si
// el valor tiene exactamente ese formato -- cualquier otra cosa pasa igual.
function sinSegundos(valor: string | null | undefined): string {
  return fechaHora(valor)
}

function DiferenciaBadge({ esperado, declarado }: { esperado: number | null; declarado: number | null }) {
  if (esperado === null || declarado === null) return <span className="text-muted-foreground">—</span>
  const dif = Math.round((declarado - esperado) * 100) / 100
  if (dif > 0.01) {
    return <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"><ArrowUpCircle className="size-4" />+{formatoMoneda(dif)}</span>
  }
  if (dif < -0.01) {
    return <span className="inline-flex items-center gap-1 font-medium text-destructive"><ArrowDownCircle className="size-4" />−{formatoMoneda(Math.abs(dif))}</span>
  }
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><CheckCircle2 className="size-4" />OK</span>
}

export type TurnosProps = {
  /** Si la sesión ve los turnos de todos los cajeros (los productos: rol admin). */
  esAdmin?: boolean
}

export function Turnos({ esAdmin = false }: TurnosProps = {}) {
  const navigate = useNavigate()
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [turnoActivo, setTurnoActivo] = useState<Turno | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- Dialog "Abrir turno" (antes página /turnos/abrir) ---
  const [abrirOpen, setAbrirOpen] = useState(false)
  const [montoInicial, setMontoInicial] = useState('0')
  const [notas, setNotas] = useState('')
  const [abriendo, setAbriendo] = useState(false)

  useEffect(() => { load() }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ turnos: Turno[]; turno_activo: Turno | null }>('/api/turnos')
      setTurnos(data.turnos)
      setTurnoActivo(data.turno_activo)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  function abrirDialogoTurno() {
    setMontoInicial('0')
    setNotas('')
    setAbrirOpen(true)
  }

  async function abrirTurno() {
    setAbriendo(true)
    setError(null)
    try {
      const turno = await api.post<Turno>('/api/turnos/abrir', { monto_inicial: Number(montoInicial) || 0, notas })
      setAbrirOpen(false)
      navigate(`/turnos/${turno.id}`)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setAbriendo(false)
    }
  }

  const columns = useMemo<ColumnDef<Turno>[]>(() => {
    const cols: ColumnDef<Turno>[] = [
      { accessorKey: 'id', header: 'N°', size: 45, minSize: 40, cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.id}</span> },
    ]
    if (esAdmin) {
      cols.push({ accessorKey: 'usuario_nombre', header: sortableHeader('Cajero'), size: 85, minSize: 80, meta: { stretch: true }, cell: ({ row }) => <span className="block truncate font-medium" title={row.original.usuario_nombre ?? undefined}>{row.original.usuario_nombre}</span> })
    }
    cols.push(
      { accessorKey: 'apertura', header: 'Apertura', size: 126, minSize: 110, cell: ({ row }) => <span className="block truncate" title={row.original.apertura ?? undefined}>{sinSegundos(row.original.apertura)}</span> },
      { accessorKey: 'cierre', header: 'Cierre', size: 126, minSize: 110, cell: ({ row }) => <span className="block truncate" title={row.original.cierre ?? undefined}>{sinSegundos(row.original.cierre) || '—'}</span> },
      {
        accessorKey: 'monto_inicial',
        header: () => <div className="text-right">Fondo inicial</div>,
        size: 114,
        minSize: 95,
        // El fondo de apertura es el dato menos consultado de un vistazo (los
        // que importan al cerrar son esperado/declarado/diferencia) y ademas
        // esta en el detalle del turno: se oculta por debajo de 1400px para
        // que las otras 9 columnas entren completas en pantallas de 1280.
        meta: { opcional: true, className: 'hidden min-[1400px]:table-cell', colClassName: 'hidden min-[1400px]:table-column' },
        cell: ({ row }) => <div className="truncate text-right">{formatoMoneda(row.original.monto_inicial)}</div>,
      },
      // Encabezados acortados (eran "Efectivo esperado"/"Efectivo declarado")
      // para que el ancho lo fije el monto y no el titulo: Turnos ya arranca
      // con 10 columnas, es la tabla mas ancha del sistema.
      { accessorKey: 'monto_esperado_cierre', header: () => <div className="text-right">Esperado</div>, size: 114, minSize: 95, cell: ({ row }) => <div className="truncate text-right">{row.original.monto_esperado_cierre != null ? formatoMoneda(row.original.monto_esperado_cierre) : '—'}</div> },
      { accessorKey: 'monto_declarado_cierre', header: () => <div className="text-right">Declarado</div>, size: 114, minSize: 95, cell: ({ row }) => <div className="truncate text-right">{row.original.monto_declarado_cierre != null ? formatoMoneda(row.original.monto_declarado_cierre) : '—'}</div> },
      {
        id: 'diferencia',
        header: 'Diferencia',
        size: 100,
        minSize: 85,
        cell: ({ row }) => <DiferenciaBadge esperado={row.original.monto_esperado_cierre} declarado={row.original.monto_declarado_cierre} />,
      },
      {
        accessorKey: 'estado',
        header: 'Estado',
        size: 80,
        minSize: 70,
        cell: ({ row }) => <BadgeEstado tono={row.original.estado === 'abierto' ? 'ok' : 'neutro'}>{row.original.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</BadgeEstado>,
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Acciones</div>,
        size: anchoColumnaAcciones(1),
        minSize: anchoColumnaAcciones(1),
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button asChild size="icon" variant="outline" title="Ver detalle">
              <Link to={`/turnos/${row.original.id}`} aria-label="Ver detalle"><Eye /></Link>
            </Button>
          </div>
        ),
      },
    )
    return cols
  }, [esAdmin])

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={Clock}>Turnos de caja</TituloPantalla>
        {!turnoActivo && (
          <Dialog open={abrirOpen} onOpenChange={setAbrirOpen}>
            <DialogTrigger asChild>
              <Button onClick={abrirDialogoTurno}><PlayCircle />Abrir turno</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><PlayCircle className="size-4 text-emerald-600" />Abrir turno</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">Registrá el efectivo en caja al inicio del turno. Se usa para calcular la diferencia al cierre.</p>
                <div className="grid gap-2"><Label htmlFor="turno-fondo">Fondo inicial</Label><Input id="turno-fondo" type="number" step="0.01" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} /></div>
                <div className="grid gap-2"><Label htmlFor="turno-notas">Notas</Label><Input id="turno-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: Turno mañana, cajero Juan…" /></div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <Button disabled={abriendo} onClick={abrirTurno}><PlayCircle />{abriendo ? 'Abriendo…' : 'Abrir turno ahora'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {turnoActivo && (
        <Card className="border-emerald-600/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="inline-block size-2.5 rounded-full bg-emerald-500" />Turno abierto
            </CardTitle>
            <CardDescription>Desde {fechaHora(turnoActivo.apertura)} — fondo inicial {formatoMoneda(turnoActivo.monto_inicial)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link to={`/turnos/${turnoActivo.id}`}><Eye />Ver detalle</Link></Button>
            <Button asChild size="sm" variant="destructive"><Link to={`/turnos/${turnoActivo.id}/cerrar`}><StopCircle />Cerrar turno</Link></Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{esAdmin ? 'Todos los turnos' : 'Mis turnos'}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <DataTable columns={columns} data={turnos} emptyMessage="No hay turnos registrados." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

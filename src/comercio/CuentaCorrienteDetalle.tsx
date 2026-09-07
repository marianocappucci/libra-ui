// La cuenta corriente de un cliente: los movimientos, el saldo, el pago a
// cuenta (con el recibo de cobranza donde el producto lo emite) y la baja de un
// pago.
//
// Extraída de `pages/CuentaCorrienteDetalle.tsx` de Contalibra y Restolibra
// (P9-M4, 2026-09-07). Lo que difería y cómo quedó:
// - `user.role === 'admin'` para borrar un pago pasa a ser la prop `esAdmin`.
// - Contalibra abre el recibo de cobranza al pagar y tiene el botón "Ver recibo"
//   por movimiento (`POST /api/recibos/cobranza/{id}`); Restolibra no emite
//   recibos. Es la prop `conRecibos`, que va de la mano de `con_recibos` en
//   `build_cuenta_corriente_router` del backend.
import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { api, ApiError } from '../api-client'
import { type Caja } from '../facturas'
import { type Cliente } from '../mp'
import { type MovimientoCC } from './tipos'
import { useMediosPago } from './medios-pago'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { BadgeEstado } from '../badge-estado'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { anchoColumnaAcciones, DataTable } from '../data-table'
import {
  ArrowLeft, BookOpen, CircleDollarSign, Trash2, ArrowUpCircle, ArrowDownCircle,
  ShoppingCart, Receipt, ReceiptText, User,
} from 'lucide-react'
import { TituloPantalla } from '../titulo-pantalla'
import { hoyISO } from '../fechas'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

export function CuentaCorrienteDetalle({ esAdmin = false, conRecibos = false }: { esAdmin?: boolean; conRecibos?: boolean } = {}) {
  const { medios, etiqueta: etiquetaDeMedio } = useMediosPago()
  const { id } = useParams<{ id: string }>()
  const clienteId = Number(id)

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoCC[]>([])
  const [saldo, setSaldo] = useState(0)
  const [cajas, setCajas] = useState<Caja[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pagoOpen, setPagoOpen] = useState(false)
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [concepto, setConcepto] = useState('Pago a cuenta')
  const [medioPago, setMedioPago] = useState('efectivo')
  const [cajaId, setCajaId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [pagando, setPagando] = useState(false)
  const [confirmDeletePago, setConfirmDeletePago] = useState<number | null>(null)

  useEffect(() => {
    api.get<Caja[]>('/api/cuenta-corriente/cajas').then(setCajas).catch(() => {})
  }, [])

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ cliente: Cliente; movimientos: MovimientoCC[]; saldo: number }>(`/api/cuenta-corriente/${clienteId}`)
      setCliente(data.cliente)
      setMovimientos(data.movimientos)
      setSaldo(data.saldo)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  function abrirPago() {
    setMonto(saldo > 0 ? String(saldo) : '')
    setReferencia('')
    setFecha(hoyISO())
    setConcepto('Pago a cuenta')
    const caja = cajas.find((c) => c.es_default) ?? cajas[0]
    setCajaId(caja ? String(caja.id) : '')
    setMedioPago(caja?.medios_pago[0] ?? 'efectivo')
    setPagoOpen(true)
  }

  async function pagar() {
    if (!monto) return
    setPagando(true)
    setError(null)
    // Con recibos, la ventana se abre ANTES del await: si se abriera con la
    // respuesta, el navegador la trataría como popup no pedido por el usuario y
    // la bloquearía. Se abre en blanco y después se le pone la URL.
    const ventana = conRecibos ? window.open('', '_blank') : null
    try {
      const data = await api.post<{ movimientos: MovimientoCC[]; saldo: number; recibo_id: number | null }>(`/api/cuenta-corriente/${clienteId}/pagar`, {
        monto: Number(monto), fecha, concepto: concepto || 'Pago a cuenta', referencia,
        medio_pago: medioPago, caja_id: cajaId ? Number(cajaId) : null,
      })
      setMovimientos(data.movimientos)
      setSaldo(data.saldo)
      setPagoOpen(false)
      // El cobro ya está registrado aunque el recibo no haya salido (el backend
      // no revierte por eso). Si no vino id, se cierra la ventana en vez de
      // dejarla en blanco — el botón por movimiento lo reintenta.
      if (ventana && data.recibo_id) ventana.location.href = `/api/recibos/${data.recibo_id}/pdf`
      else ventana?.close()
    } catch (err) {
      ventana?.close()
      setError(describeError(err))
    } finally {
      setPagando(false)
    }
  }

  async function verRecibo(ccPagoId: number) {
    const ventana = window.open('', '_blank')
    setError(null)
    try {
      // Idempotente: emite el recibo si el pago todavía no tiene uno, y
      // devuelve el que ya existía si lo tiene. Por eso alcanza un solo botón.
      const recibo = await api.post<{ id: number }>(`/api/recibos/cobranza/${ccPagoId}`, {})
      ventana!.location.href = `/api/recibos/${recibo.id}/pdf`
    } catch (err) {
      ventana?.close()
      setError(describeError(err))
    }
  }

  async function eliminarPago(pagoId: number) {
    setError(null)
    try {
      await api.del(`/api/cuenta-corriente/pagos/${pagoId}`)
      const data = await api.get<{ movimientos: MovimientoCC[]; saldo: number }>(`/api/cuenta-corriente/${clienteId}`)
      setMovimientos(data.movimientos)
      setSaldo(data.saldo)
    } catch (err) {
      setError(describeError(err))
    }
  }

  const totales = useMemo(() => {
    let cargado = 0
    let abonado = 0
    for (const m of movimientos) {
      if (m.tipo === 'debito') cargado += m.monto
      else abonado += m.monto
    }
    return { cargado, abonado }
  }, [movimientos])

  const movColumns = useMemo<ColumnDef<MovimientoCC>[]>(() => [
    { accessorKey: 'fecha', header: 'Fecha' },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => (
        row.original.tipo === 'debito'
          ? <BadgeEstado tono="negativo"><ArrowUpCircle />Cargo</BadgeEstado>
          : <BadgeEstado tono="ok"><ArrowDownCircle />Abono</BadgeEstado>
      ),
    },
    {
      accessorKey: 'concepto',
      header: 'Concepto',
      cell: ({ row }) => {
        if (row.original.venta_id) {
          return <Link to={`/ventas/${row.original.venta_id}`} className="flex items-center gap-1 font-medium text-primary hover:underline"><ShoppingCart className="size-3.5" />{row.original.concepto}</Link>
        }
        if (row.original.factura_id) {
          return <Link to={`/facturas/${row.original.factura_id}`} className="flex items-center gap-1 font-medium text-primary hover:underline"><Receipt className="size-3.5" />{row.original.concepto}</Link>
        }
        return row.original.concepto
      },
    },
    { accessorKey: 'usuario_nombre', header: 'Usuario', cell: ({ row }) => <span className="text-sm">{row.original.usuario_nombre || '—'}</span> },
    {
      accessorKey: 'referencia',
      header: 'Referencia / Medio',
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1 text-muted-foreground">
          {row.original.referencia || '—'}
          {row.original.medio && <Badge variant="outline">{etiquetaDeMedio(row.original.medio)}</Badge>}
        </span>
      ),
    },
    {
      accessorKey: 'monto',
      header: () => <div className="text-right">Monto</div>,
      cell: ({ row }) => (
        <div className={`text-right font-semibold ${row.original.tipo === 'debito' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {row.original.tipo === 'debito' ? '+' : '−'} {formatCurrency(row.original.monto)}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: anchoColumnaAcciones(conRecibos ? 2 : 1),
      minSize: anchoColumnaAcciones(conRecibos ? 2 : 1),
      cell: ({ row }) => (
        row.original.cc_pago_id && (conRecibos || esAdmin) ? (
          <div className="flex justify-end gap-1">
            {conRecibos && (
              <Button size="icon" variant="ghost" title="Ver recibo" aria-label="Ver recibo" onClick={() => verRecibo(row.original.cc_pago_id!)}><ReceiptText /></Button>
            )}
            {esAdmin && (
              <Button size="icon" variant="ghost" title="Eliminar pago" aria-label="Eliminar pago" onClick={() => setConfirmDeletePago(row.original.cc_pago_id!)}><Trash2 /></Button>
            )}
          </div>
        ) : null
      ),
    },
    // `etiquetaDeMedio` entra en las dependencias: con `[user]` a secas las
    // columnas quedaban con el closure de la primera pintura, cuando el hook
    // todavía no había traído los medios, y la tabla mostraba `transferencia`
    // en vez de "Transferencia" hasta el próximo cambio de props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [esAdmin, conRecibos, etiquetaDeMedio])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPantalla icono={BookOpen}>{cliente ? cliente.name : 'Cuenta Corriente'}
          {cliente && (
            saldo > 0 ? (
              <BadgeEstado tono="atencion">Debe {formatCurrency(saldo)}</BadgeEstado>
            ) : saldo < 0 ? (
              <BadgeEstado tono="ok">A favor {formatCurrency(saldo * -1)}</BadgeEstado>
            ) : (
              <BadgeEstado tono="neutro">Saldo $0</BadgeEstado>
            )
          )}</TituloPantalla>
        {cliente && (
          <div className="flex flex-wrap gap-2">
            <Dialog open={pagoOpen} onOpenChange={setPagoOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={abrirPago}>
                  <CircleDollarSign />Registrar pago
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><CircleDollarSign className="size-4" />Registrar pago — {cliente.name}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  {saldo > 0 && (
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                      Saldo pendiente: <strong>{formatCurrency(saldo)}</strong>
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2"><Label>Monto <span className="text-destructive">*</span></Label><Input type="number" step="0.01" min="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
                    <div className="grid gap-2"><Label>Fecha <span className="text-destructive">*</span></Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
                  </div>
                  <div className="grid gap-2"><Label>Concepto</Label><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Medio de pago</Label>
                      <Select value={medioPago} onValueChange={setMedioPago}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {/* Del motor, no de una copia TypeScript: ésa tenía
                              `cheque` de más y le faltaban las tarjetas. */}
                          {medios.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Referencia <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                      <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° transferencia, cheque…" />
                    </div>
                  </div>
                  {cajas.length > 0 && (
                    <div className="grid gap-2">
                      <Label>Registrar en caja <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                      <Select value={cajaId || 'ninguna'} onValueChange={(v) => setCajaId(v === 'ninguna' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="— No registrar en caja —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ninguna">— No registrar en caja —</SelectItem>
                          {cajas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                  <Button disabled={pagando || !monto} onClick={pagar}><CircleDollarSign />{pagando ? 'Guardando…' : 'Registrar pago'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button asChild size="sm" variant="outline"><Link to={`/clientes/${cliente.id}`}><User />Ficha cliente</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/cuenta-corriente"><ArrowLeft />Volver</Link></Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading || !cliente ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardHeader><CardDescription>Total cargado</CardDescription><CardTitle className="text-xl text-destructive">{formatCurrency(totales.cargado)}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>Total abonado</CardDescription><CardTitle className="text-xl text-emerald-600 dark:text-emerald-400">{formatCurrency(totales.abonado)}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>Saldo actual</CardDescription><CardTitle className={saldo > 0 ? 'text-xl text-amber-600 dark:text-amber-400' : 'text-xl text-emerald-600 dark:text-emerald-400'}>{formatCurrency(saldo)}</CardTitle></CardHeader></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Historial de movimientos</CardTitle></CardHeader>
            <CardContent>
              <DataTable columns={movColumns} data={movimientos} emptyMessage="No hay movimientos registrados." />
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirmDeletePago !== null}
        onOpenChange={(o) => !o && setConfirmDeletePago(null)}
        title="¿Eliminar este pago?"
        onConfirm={() => { if (confirmDeletePago !== null) eliminarPago(confirmDeletePago); setConfirmDeletePago(null) }}
      />
    </div>
  )
}

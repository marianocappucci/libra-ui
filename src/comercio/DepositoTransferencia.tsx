// Transferir stock entre depósitos (P9-M1, 2026-09-06). Era idéntico en
// Contalibra y Restolibra salvo el orden de dos imports.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, Info, Warehouse } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { SelectBuscable } from '../SelectBuscable'
import { TituloPantalla } from '../titulo-pantalla'
import { hoyISO } from '../fechas'
import { opcionesProducto, type Deposito, type Producto, type StockPorDeposito } from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export type DepositoTransferenciaProps = {
  rutaDeDepositos?: string
}

export function DepositoTransferencia({ rutaDeDepositos = '/depositos' }: DepositoTransferenciaProps) {
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [error, setError] = useState<string | null>(null)

  const [productoId, setProductoId] = useState('')
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [observaciones, setObservaciones] = useState('')
  const [stockOrigen, setStockOrigen] = useState<StockPorDeposito[]>([])
  const [transfiriendo, setTransfiriendo] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    api.get<Deposito[]>('/api/depositos').then(setDepositos).catch(() => {})
    api.get<Producto[]>('/api/productos').then((p) => setProductos(p.filter((x) => x.activo))).catch(() => {})
  }, [])

  useEffect(() => {
    if (productoId) {
      api.get<StockPorDeposito[]>(`/api/depositos/stock-producto/${productoId}`).then(setStockOrigen).catch(() => setStockOrigen([]))
    } else {
      setStockOrigen([])
    }
  }, [productoId])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function transferir() {
    setTransfiriendo(true)
    setError(null)
    setOk(false)
    try {
      await api.post('/api/depositos/transferir', {
        producto_id: Number(productoId), origen_id: Number(origenId), destino_id: Number(destinoId),
        cantidad: Number(cantidad), fecha, observaciones,
      })
      setCantidad('')
      setObservaciones('')
      setOk(true)
      if (productoId) api.get<StockPorDeposito[]>(`/api/depositos/stock-producto/${productoId}`).then(setStockOrigen)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setTransfiriendo(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPantalla icono={Warehouse}>Transferir stock</TituloPantalla>
        <Button asChild size="sm" variant="outline"><Link to={rutaDeDepositos}><ArrowLeft />Volver</Link></Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">Transferencia realizada correctamente.</p>}

      <div className="flex justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader><CardTitle className="text-base">Transferir stock entre depósitos</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Producto <span className="text-destructive">*</span></Label>
              <SelectBuscable
                value={productoId}
                onChange={setProductoId}
                opciones={opcionesProducto(productos)}
                placeholder="— Seleccioná un producto —"
                ariaLabel="Producto"
                className="w-full"
              />
            </div>

            {stockOrigen.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground"><Info className="size-4" />Stock disponible por depósito:</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {stockOrigen.map((s) => (
                    <li key={s.id}>{s.nombre}{s.es_default ? ' ★' : ''}: <span className="font-medium text-foreground">{s.stock_actual}</span></li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Depósito origen <span className="text-destructive">*</span></Label>
                <Select value={origenId} onValueChange={setOrigenId}>
                  <SelectTrigger aria-label="Depósito origen"><SelectValue placeholder="— Origen —" /></SelectTrigger>
                  <SelectContent>
                    {depositos.filter((d) => d.activo).map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nombre}{d.es_default ? ' ★' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Depósito destino <span className="text-destructive">*</span></Label>
                <Select value={destinoId} onValueChange={setDestinoId}>
                  <SelectTrigger aria-label="Depósito destino"><SelectValue placeholder="— Destino —" /></SelectTrigger>
                  <SelectContent>
                    {depositos.filter((d) => d.activo).map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nombre}{d.es_default ? ' ★' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2"><Label>Cantidad <span className="text-destructive">*</span></Label><Input type="number" min="0.001" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} aria-label="Cantidad" /></div>
              <div className="grid gap-2"><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
              <div className="grid gap-2"><Label>Observaciones</Label><Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Opcional" /></div>
            </div>

            <Button disabled={transfiriendo || !productoId || !origenId || !destinoId || !cantidad} onClick={transferir}>
              <ArrowLeftRight />{transfiriendo ? 'Transfiriendo…' : 'Confirmar transferencia'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

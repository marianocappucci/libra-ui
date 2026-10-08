// El tablero: KPIs del mes, accesos rápidos, facturas sin cobrar, presupuestos
// pendientes y los últimos movimientos de caja.
//
// Extraída de `pages/Dashboard.tsx` de Contalibra (fase 13, 2026-09-27): el
// único de los tres productos con pantalla propia (Restolibra redirige
// `/dashboard` a `/salon` sin llegar a renderizarlo). Lo que difiere entre
// productos son los accesos rápidos (Contalibra: factura/presupuesto/remito,
// documentos que otros productos no tienen) y si existen facturas/presupuestos/
// una pantalla de caja general — todo queda como props aditivas, default el
// comportamiento de Contalibra.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Inbox } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'
import { IconoIndicador } from '../IconoIndicador'
import { TarjetaIndicador } from '../TarjetaIndicador'
import type { DashboardData } from './tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { fecha } from '@/lib/fechas'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

const ACCIONES_DEFAULT = [
  { label: '+ Nueva Factura', to: '/facturas/nueva' },
  { label: '+ Nuevo Presupuesto', to: '/presupuestos/nuevo' },
  { label: '+ Nuevo Remito', to: '/remitos/nuevo' },
  { label: '+ Nuevo Movimiento de Caja', to: '/caja?nuevo=1' },
]

export type DashboardProps = {
  /** Los botones de acceso rápido debajo de los KPIs. Default: los cuatro de Contalibra (factura,
   *  presupuesto, remito, movimiento de caja) — documentos que otros productos no tienen. */
  accionesRapidas?: { label: string; to: string }[]
  /** Si se muestra la tarjeta "Presupuestos sin respuesta". `false` en un producto sin presupuestos
   *  (la consulta siempre da vacía, pero el link a `/presupuestos` sería una ruta muerta). */
  conPresupuestos?: boolean
  /** A dónde lleva una factura de "Facturas sin cobrar". `null` en un producto sin pantalla de facturas
   *  (el dato de la factura queda como texto en otro lado) — oculta el botón "Ver", no la tarjeta. */
  rutaDeFactura?: ((id: number) => string) | null
  /** A dónde lleva "Ver todas" de "Facturas sin cobrar". `null` oculta el botón. */
  rutaDeFacturas?: string | null
  /** A dónde lleva "Ver caja completa". `null` oculta el botón. */
  rutaDeCaja?: string | null
}

export function Dashboard({
  accionesRapidas = ACCIONES_DEFAULT,
  conPresupuestos = true,
  rutaDeFactura = (id) => `/facturas/${id}`,
  rutaDeFacturas = '/facturas',
  rutaDeCaja = '/caja',
}: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setData(await api.get<DashboardData>('/api/dashboard'))
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Error de conexión.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={ICONOS.dashboard}>Dashboard</TituloPantalla>
        {data && (
          <span className="text-sm text-muted-foreground">{fecha(data.mes_hasta)}</span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Los cuatro KPI toman su ícono del catálogo de indicadores (ADR-038): se pasa el concepto, no un ícono de lucide. */}
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <TarjetaIndicador
              concepto="facturado" etiqueta="Facturado este mes" tono="primario" valor={formatCurrency(data.facturado_mes)}
              ayuda={<>{data.cant_facturas_mes} factura{data.cant_facturas_mes !== 1 ? 's' : ''}</>}
            />
            <TarjetaIndicador concepto="cobros" etiqueta="Cobrado este mes" tono="exito" valor={formatCurrency(data.cobrado_mes)} ayuda="Ingresos en caja" />
            <TarjetaIndicador concepto="egresos" etiqueta="Egresos este mes" tono="peligro" valor={formatCurrency(data.egresos_mes)} ayuda="Gastos en caja" />
            <TarjetaIndicador
              concepto="caja" etiqueta="Saldo total en caja" tono={data.saldo_total >= 0 ? 'exito' : 'peligro'}
              valor={formatCurrency(data.saldo_total)} ayuda="Histórico acumulado"
            />
          </div>

          {accionesRapidas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {accionesRapidas.map((a, i) => (
                <Button key={a.to} asChild size="sm" variant={i === 0 ? 'default' : 'outline'}>
                  <Link to={a.to}>{a.label}</Link>
                </Button>
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base"><IconoIndicador concepto="porCobrar" className="text-muted-foreground" />Facturas sin cobrar</CardTitle>
                {rutaDeFacturas && <Button asChild size="sm" variant="outline"><Link to={rutaDeFacturas}>Ver todas</Link></Button>}
              </CardHeader>
              <CardContent>
                {data.facturas_sin_cobrar.length === 0 ? (
                  <p className="flex flex-col items-center gap-2 py-4 text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="size-6 text-exito" />Todas las facturas están cobradas.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {data.facturas_sin_cobrar.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">
                            <span className="text-muted-foreground">{f.letra}</span> {f.label_numero}
                          </p>
                          <p className="truncate text-muted-foreground">{f.cliente_razon} — {fecha(f.fecha)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="font-medium">{formatCurrency(f.total)}</span>
                          {rutaDeFactura && <Button asChild size="sm" variant="outline"><Link to={rutaDeFactura(f.id)}>Ver</Link></Button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {conPresupuestos && (
              <Card>
                <CardHeader className="flex items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base"><IconoIndicador concepto="presupuestos" className="text-muted-foreground" />Presupuestos sin respuesta</CardTitle>
                  <Button asChild size="sm" variant="outline"><Link to="/presupuestos">Ver todos</Link></Button>
                </CardHeader>
                <CardContent>
                  {data.presupuestos_pendientes.length === 0 ? (
                    <p className="flex flex-col items-center gap-2 py-4 text-center text-sm text-muted-foreground">
                      <Inbox className="size-6" />Sin presupuestos pendientes.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {data.presupuestos_pendientes.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">{p.number}</p>
                            <p className="truncate text-muted-foreground">{p.client_name}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="font-medium">{formatCurrency(p.total)}</span>
                            <Button asChild size="sm" variant="outline"><Link to={`/presupuestos/${p.id}`}>Ver</Link></Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader className="flex items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><IconoIndicador concepto="caja" className="text-muted-foreground" />Últimos movimientos de caja</CardTitle>
              {rutaDeCaja && <Button asChild size="sm" variant="outline"><Link to={rutaDeCaja}>Ver caja completa</Link></Button>}
            </CardHeader>
            <CardContent>
              {data.ultimos_movimientos.length === 0 ? (
                <p className="flex flex-col items-center gap-2 py-4 text-center text-sm text-muted-foreground">
                  <Inbox className="size-6" />Sin movimientos registrados.
                </p>
              ) : (
                <ul className="divide-y">
                  {data.ultimos_movimientos.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{m.concepto}</p>
                        <p className="truncate text-muted-foreground">{fecha(m.fecha)}{m.referencia ? ` — ${m.referencia}` : ''}</p>
                      </div>
                      <span className={`shrink-0 font-medium ${m.tipo === 'ingreso' ? 'text-exito' : 'text-destructive'}`}>
                        {m.tipo === 'ingreso' ? '+' : '−'} {formatCurrency(m.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

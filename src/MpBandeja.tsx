// La bandeja de MercadoPago: conciliar lo que entró a la cuenta y facturarlo.
//
// Estaba escrita **dos veces** —Contalibra y Restolibra, 508 líneas cada una— y
// las dos copias diferían en **una sola línea**: el badge de la columna Estado
// del historial de cobros. Se unifica en la forma de Contalibra (`BadgeEstado`),
// que es la que usa el resto de esta misma pantalla en las otras tres columnas;
// Restolibra pierde ahí un `Badge` de shadcn y gana la consistencia.
//
// LibraClub la estrena con este cambio, así que no llegó a existir la tercera
// copia.
//
// ## Por qué entra entera y sin props de ruta
//
// El backend ya estaba unificado: los tres productos montan el MISMO router
// —`libracore.mp_bandeja_router`— bajo el MISMO prefijo `/api/mp-bandeja`, y lo
// único que cada uno decide es qué `external_reference` omitir, que se resuelve
// del lado del servidor. Así que acá no hay una sola URL que parametrizar.
//
// Lo que sí se resuelve contra el consumidor son los `@/components/ui/*`: cada
// producto trae sus primitivas. Las fechas son del kit desde 0.146.0 (`./fechas`, ADR-058).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from './data-table'
import { TACTIL_BAJO_LG } from './use-ancho'
import { api, ApiError } from './api-client'
import { IVA_CONDITIONS } from './facturas'
import { legible, nombreDelMedio, type Cliente, type MpMovimiento, type MpPago } from './mp'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { BadgeEstado } from './badge-estado'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { anchoColumnaAcciones, DataTable, sortableHeader } from './data-table'
import {
  CreditCard, Wallet, Landmark, Banknote, RefreshCw, UserPlus, ReceiptText, X, Mail,
  Forward, UserRoundX, MailWarning, History, ArrowDownCircle, Hourglass, Info, User,
} from 'lucide-react'
import { TituloPantalla } from './titulo-pantalla'
import { ICONOS } from './iconos-identidad'
import { fecha } from './fechas'
import { formatoMoneda } from './formatos'

type Bandeja = {
  pendientes: MpPago[]
  historial: MpPago[]
  transferencias: MpMovimiento[]
  transferencias_hist: MpMovimiento[]
  mp_concepto_default: string
}

/** El tipo de pago, sin el código del medio: «Tarjeta de crédito» y no «Tarjeta de crédito (VISA)». El medio
 *  concreto va en su propia columna (Cobros sincronizados), traducido con `nombreDelMedio`. */
function OrigenBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-muted-foreground">—</span>
  const t = tipo.toLowerCase()
  const map: Record<string, { label: string; icon: typeof Wallet; className: string }> = {
    account_money: { label: 'Cuenta MP', icon: Wallet, className: 'bg-sky-500 text-white' },
    credit_card: { label: 'Tarjeta de crédito', icon: CreditCard, className: 'bg-emerald-600 text-white' },
    debit_card: { label: 'Tarjeta de débito', icon: CreditCard, className: 'bg-cyan-600 text-white' },
    ticket: { label: 'Efectivo', icon: Banknote, className: 'bg-amber-500 text-white' },
    bank_transfer: { label: 'Transferencia', icon: Landmark, className: 'bg-secondary text-secondary-foreground' },
  }
  const conf = map[t] ?? { label: legible(tipo), icon: CreditCard, className: 'bg-muted text-foreground' }
  const Icon = conf.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${conf.className}`}>
      <Icon className="size-3.5" />{conf.label}
    </span>
  )
}

export function MpBandeja() {
  const [data, setData] = useState<Bandeja | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [dias, setDias] = useState('7')
  const [tab, setTab] = useState<'historial' | 'cobros' | 'pendientes'>('historial')

  const [creandoCliente, setCreandoCliente] = useState<{ kind: 'pago' | 'mov'; id: number } | null>(null)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [tipoId, setTipoId] = useState('DNI')
  const [cuit, setCuit] = useState('')
  const [direccion, setDireccion] = useState('')
  const [ivaCond, setIvaCond] = useState('Consumidor Final')
  const [saving, setSaving] = useState(false)

  const [cargandoEmail, setCargandoEmail] = useState<number | null>(null)
  const [emailMov, setEmailMov] = useState('')
  const [nombreMov, setNombreMov] = useState('')

  useEffect(() => { load() }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setData(await api.get<Bandeja>('/api/mp-bandeja'))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  async function sincronizar() {
    setSyncing(true)
    setError(null)
    setMsg(null)
    try {
      const res = await api.post<{ nuevos: number }>('/api/mp-bandeja/sincronizar', { dias: Number(dias) })
      setMsg(`Sincronizado: ${res.nuevos} movimiento(s) nuevo(s).`)
      await load()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSyncing(false)
    }
  }

  async function ignorar(kind: 'pago' | 'mov', id: number) {
    setError(null)
    try {
      await api.post(`/api/mp-bandeja/${kind === 'pago' ? 'pagos' : 'movimientos'}/${id}/ignorar`)
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function abrirCrearCliente(kind: 'pago' | 'mov', item: MpPago | MpMovimiento) {
    setError(null)
    setCreandoCliente({ kind, id: item.id })
    setNombre(item.payer_name || ''); setEmail(item.payer_email || '')
    setTipoId(item.payer_id_type || 'DNI'); setCuit(item.payer_id_number || '')
    setDireccion(''); setIvaCond('Consumidor Final')
  }

  async function crearCliente() {
    if (!creandoCliente || !nombre.trim()) return
    setSaving(true)
    setError(null)
    try {
      const path = creandoCliente.kind === 'pago' ? 'pagos' : 'movimientos'
      await api.post(`/api/mp-bandeja/${path}/${creandoCliente.id}/crear-cliente`, {
        nombre, email, cuit_dni: cuit, iva_condition: ivaCond, address: direccion,
      })
      setCreandoCliente(null)
      await load()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  function abrirCargarEmail(m: MpMovimiento) {
    setError(null)
    setCargandoEmail(m.id)
    setEmailMov(m.payer_email || '')
    setNombreMov(m.payer_name || m.origen_nombre || '')
  }

  async function guardarEmailMov() {
    if (cargandoEmail === null || !emailMov.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.post(`/api/mp-bandeja/movimientos/${cargandoEmail}/guardar-datos`, {
        payer_email: emailMov.trim(), payer_name: nombreMov.trim(),
      })
      setCargandoEmail(null)
      await load()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  async function facturar(kind: 'pago' | 'mov', id: number) {
    setSaving(true)
    setError(null)
    setMsg(null)
    try {
      const path = kind === 'pago' ? 'pagos' : 'movimientos'
      const res = await api.post<{ numero: string; tipo_label: string; email_sent: boolean }>(`/api/mp-bandeja/${path}/${id}/facturar`, {})
      setMsg(`Facturado: ${res.tipo_label} ${res.numero}${res.email_sent ? ' — email enviado' : ''}`)
      await load()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  async function reenviarEmail(facturaId: number) {
    setSaving(true)
    setError(null)
    setMsg(null)
    try {
      await api.post(`/api/mp-bandeja/facturas/${facturaId}/reenviar`, {})
      setMsg('Email reenviado correctamente.')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  const pendientesPagos = data?.pendientes ?? []
  const historialPagos = data?.historial ?? []
  const pendientesMov = data?.transferencias ?? []
  const historialMov = data?.transferencias_hist ?? []

  // Historial reciente (pestaña 1 del template viejo): una única tabla que combina
  // pagos (webhook) y transferencias/movimientos ya procesados — igual que
  // mp_bandeja.html, que itera `historial` y luego `transferencias_hist` en el
  // mismo <tbody>, sin resortear por fecha.
  type HistRow = {
    key: string
    fecha: string
    tipoNode: ReactNode
    emisor: string
    cliente: Cliente | null
    monto: number
    estado_factura: string
    factura_id: number | null
    reenvioRequiereEmail: boolean
  }

  const historialRows = useMemo<HistRow[]>(() => [
    ...historialPagos.map((p): HistRow => ({
      key: `p${p.id}`,
      fecha: p.created_at,
      tipoNode: <OrigenBadge tipo={p.payment_type} />,
      emisor: p.payer_name || p.payer_email || '—',
      cliente: p.cliente,
      monto: p.monto,
      estado_factura: p.estado_factura,
      factura_id: p.factura_id,
      reenvioRequiereEmail: true,
    })),
    ...historialMov.map((m): HistRow => ({
      key: `m${m.id}`,
      fecha: m.fecha || m.created_at,
      tipoNode: <OrigenBadge tipo={m.tipo} />,
      emisor: m.origen_nombre || m.payer_name || '—',
      cliente: m.cliente,
      monto: m.monto,
      estado_factura: m.estado_factura,
      factura_id: m.factura_id,
      reenvioRequiereEmail: false,
    })),
  ], [historialPagos, historialMov])

  const columnsHistorial = useMemo<ColumnDef<HistRow>[]>(() => [
    { accessorKey: 'fecha', header: sortableHeader('Fecha'), size: 100, minSize: 90 },
    { id: 'tipo', header: 'Tipo', cell: ({ row }) => row.original.tipoNode, size: 170, minSize: 130 },
    { accessorKey: 'emisor', header: 'Emisor / Pagador', size: 150, minSize: 90, meta: { stretch: true }, cell: ({ row }) => <span className="block w-full truncate" title={row.original.emisor}>{row.original.emisor}</span> },
    { id: 'cliente', header: 'Cliente', size: 140, minSize: 90, cell: ({ row }) => row.original.cliente ? <span className="block w-full truncate" title={row.original.cliente.name}>{row.original.cliente.name}</span> : <span className="text-muted-foreground">—</span> },
    { accessorKey: 'monto', header: 'Monto', size: 100, minSize: 80, cell: ({ row }) => <span className="font-medium">{formatoMoneda(row.original.monto)}</span> },
    { id: 'estado', header: 'Estado', size: 90, minSize: 80, cell: ({ row }) => <BadgeEstado tono={row.original.estado_factura === 'facturado' ? 'ok' : 'neutro'}>{row.original.estado_factura === 'facturado' ? 'Facturado' : 'Ignorado'}</BadgeEstado> },
    {
      id: 'factura',
      header: 'Factura',
      size: 130,
      minSize: 110,
      cell: ({ row }) => {
        const r = row.original
        if (!r.factura_id) return <span className="text-muted-foreground">—</span>
        const puedeReenviar = r.reenvioRequiereEmail ? Boolean(r.cliente?.email) : true
        return (
          <div className="flex items-center gap-1">
            <Button asChild size="icon" variant="outline" title="Ver factura"><Link to={`/facturas/${r.factura_id}`} aria-label="Ver factura"><ReceiptText /></Link></Button>
            {puedeReenviar
              ? <Button size="icon" variant="outline" title="Reenviar email" disabled={saving} onClick={() => reenviarEmail(r.factura_id!)}><Forward className="size-4" /></Button>
              : <BadgeEstado tono="atencion"><MailWarning className="mr-1 size-3.5" />Sin email</BadgeEstado>}
          </div>
        )
      },
    },
  ], [saving])

  // Cobros sincronizados (pestaña 2): transferencias pendientes de facturar.
  const columnsCobros = useMemo<ColumnDef<MpMovimiento>[]>(() => [
    {
      id: 'fecha', header: sortableHeader('Fecha'), size: 100, minSize: 90,
      accessorFn: (r) => r.fecha || r.created_at,
      cell: ({ row }) => fecha(row.original.fecha || row.original.created_at),
    },
    {
      id: 'emisor',
      header: 'Emisor',
      size: 160,
      minSize: 90,
      meta: { stretch: true },
      cell: ({ row }) => (
        <div className="w-full">
          <p className="truncate font-medium" title={row.original.origen_nombre ?? undefined}>{row.original.origen_nombre || '—'}</p>
          {row.original.payer_id_number && <p className="truncate text-xs text-muted-foreground">{row.original.payer_id_type || 'ID'}: {row.original.payer_id_number}</p>}
        </div>
      ),
    },
    {
      id: 'banco',
      header: 'Medio de pago',
      // Más ancha que cuando mostraba el código: «Transferencia desde billetera virtual» es el texto más largo.
      size: 190,
      minSize: 140,
      cell: ({ row }) => row.original.origen_banco
        ? <Badge variant="outline" className="whitespace-normal text-left">{nombreDelMedio(row.original.origen_banco)}</Badge>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'cbu',
      header: 'CBU/CVU origen',
      size: 140,
      minSize: 100,
      cell: ({ row }) => row.original.origen_cbu ? <code className="block w-full truncate text-xs" title={row.original.origen_cbu}>{row.original.origen_cbu}</code> : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'cliente',
      header: 'Cliente / Email',
      size: 160,
      minSize: 90,
      cell: ({ row }) => {
        const m = row.original
        if (m.cliente) return <span className="flex w-full items-center gap-1"><User className="size-3.5 shrink-0 text-emerald-600" /><span className="truncate" title={m.cliente.name}>{m.cliente.name}</span></span>
        if (m.payer_email) return (
          <div className="grid w-full gap-0.5">
            <span className="flex items-center gap-1 text-sm"><Mail className="size-3.5 shrink-0" /><span className="truncate" title={m.payer_email}>{m.payer_email}</span></span>
            <Button size="sm" variant="link" className="h-auto justify-start p-0" onClick={() => abrirCrearCliente('mov', m)}><UserPlus className="size-3.5" />Dar de alta</Button>
          </div>
        )
        return (
          <div className="grid gap-0.5">
            <span className="flex items-center gap-1 text-sm text-muted-foreground"><UserRoundX className="size-3.5" />Sin email</span>
            <div className="flex gap-2">
              <Button size="sm" variant="link" className="h-auto justify-start p-0" onClick={() => abrirCargarEmail(m)}><Mail className="size-3.5" />Cargar email</Button>
              {m.origen_nombre && <Button size="sm" variant="link" className="h-auto justify-start p-0" onClick={() => abrirCrearCliente('mov', m)}><UserPlus className="size-3.5" />Dar de alta</Button>}
            </div>
          </div>
        )
      },
    },
    { accessorKey: 'monto', header: 'Monto', size: 100, minSize: 80, cell: ({ row }) => <span className="font-medium">{formatoMoneda(row.original.monto)}</span> },
    {
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      size: anchoColumnaAcciones(2),
      minSize: anchoColumnaAcciones(2),
      cell: ({ row }) => (
        <div className={`flex justify-end gap-1 ${TACTIL_BAJO_LG}`}>
          <Button size="icon" variant="outline" title="Facturar" disabled={saving} onClick={() => facturar('mov', row.original.id)}><ReceiptText /></Button>
          <Button size="icon" variant="outline" title="Ignorar" onClick={() => ignorar('mov', row.original.id)}><X /></Button>
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [saving])

  // Pendientes de factura (pestaña 3): pagos por webhook sin facturar todavía.
  const columnsPendientes = useMemo<ColumnDef<MpPago>[]>(() => [
    { accessorKey: 'created_at', header: sortableHeader('Fecha'), size: 100, minSize: 90 },
    {
      id: 'pagador',
      header: 'Pagador',
      size: 160,
      minSize: 90,
      meta: { stretch: true },
      cell: ({ row }) => (
        <div className="w-full">
          <p className="truncate font-medium" title={row.original.payer_name ?? undefined}>{row.original.payer_name || '—'}</p>
          {row.original.payer_email && <p className="truncate text-xs text-muted-foreground" title={row.original.payer_email}>{row.original.payer_email}</p>}
          {row.original.payer_id_number && <p className="truncate text-xs text-muted-foreground">{row.original.payer_id_type || 'ID'}: {row.original.payer_id_number}</p>}
        </div>
      ),
    },
    { id: 'origen', header: 'Origen', size: 160, minSize: 130, cell: ({ row }) => <OrigenBadge tipo={row.original.payment_type} /> },
    {
      id: 'cliente',
      header: 'Cliente',
      size: 160,
      minSize: 90,
      cell: ({ row }) => {
        const p = row.original
        if (p.cliente) return (
          <div className="grid w-full gap-0.5">
            <span className="flex items-center gap-1"><User className="size-3.5 shrink-0 text-emerald-600" /><span className="truncate" title={p.cliente.name}>{p.cliente.name}</span></span>
            {!p.cliente.email && <BadgeEstado tono="atencion" className="w-fit"><MailWarning className="mr-1 size-3.5" />Sin email</BadgeEstado>}
          </div>
        )
        return (
          <div className="grid gap-0.5">
            <span className="flex items-center gap-1 text-sm text-muted-foreground"><UserRoundX className="size-3.5" />Sin registro</span>
            <Button size="sm" variant="link" className="h-auto justify-start p-0" onClick={() => abrirCrearCliente('pago', p)}><UserPlus className="size-3.5" />Dar de alta</Button>
          </div>
        )
      },
    },
    { accessorKey: 'monto', header: 'Monto', size: 100, minSize: 80, cell: ({ row }) => <span className="font-medium">{formatoMoneda(row.original.monto)}</span> },
    {
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      size: anchoColumnaAcciones(2),
      minSize: anchoColumnaAcciones(2),
      cell: ({ row }) => (
        <div className={`flex justify-end gap-1 ${TACTIL_BAJO_LG}`}>
          <Button size="icon" variant="outline" title="Facturar" disabled={saving} onClick={() => facturar('pago', row.original.id)}><ReceiptText /></Button>
          <Button size="icon" variant="outline" title="Ignorar" onClick={() => ignorar('pago', row.original.id)}><X /></Button>
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [saving])

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={ICONOS.pagosMercadoPago}>Pagos MercadoPago</TituloPantalla>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="historial">
            <History />Historial reciente
            <Badge variant="secondary" className="ml-1">{historialRows.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cobros">
            <ArrowDownCircle />Cobros sincronizados
            <Badge variant="secondary" className="ml-1">{pendientesMov.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pendientes">
            <Hourglass />Pendientes de factura
            <Badge variant="secondary" className="ml-1">{pendientesPagos.length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 🔑 Modales y no tarjetas arriba de la tabla: el link de cada fila puede
          estar muy abajo, y una tarjeta que aparece arriba queda fuera de la
          vista (reclamo del 2026-10-14). El error del alta se muestra adentro
          por lo mismo: el de la pantalla queda tapado por el modal. */}
      <Dialog open={creandoCliente !== null} onOpenChange={(abierto) => { if (!abierto) setCreandoCliente(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="size-4" />Dar de alta cliente</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2"><Label>Nombre / Razón social *</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
            <div className="grid gap-2 sm:col-span-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Para enviar la factura" /></div>
            <div className="grid gap-2"><Label>Tipo ID</Label><Input value={tipoId} onChange={(e) => setTipoId(e.target.value)} placeholder="DNI / CUIT" /></div>
            <div className="grid gap-2"><Label>CUIT/DNI</Label><Input value={cuit} onChange={(e) => setCuit(e.target.value)} /></div>
            <div className="grid gap-2 sm:col-span-2"><Label>Domicilio</Label><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Opcional" /></div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Condición IVA</Label>
              {/* select-cerrado: las condiciones frente al IVA son un catálogo cerrado de ARCA, fijo en el código (`IVA_CONDITIONS`) */}
              <Select value={ivaCond} onValueChange={setIvaCond}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IVA_CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button disabled={saving || !nombre.trim()} onClick={crearCliente}><UserPlus />{saving ? 'Guardando…' : 'Dar de alta'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cargandoEmail !== null} onOpenChange={(abierto) => { if (!abierto) setCargandoEmail(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="size-4" />Datos del emisor</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2"><Label>Nombre completo</Label><Input value={nombreMov} onChange={(e) => setNombreMov(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Email *</Label><Input type="email" value={emailMov} onChange={(e) => setEmailMov(e.target.value)} placeholder="email@ejemplo.com" /></div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button disabled={saving || !emailMov.trim()} onClick={guardarEmailMov}><Mail />{saving ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : tab === 'historial' ? (
        <Card>
          <CardContent className="p-0">
            <DataTable columns={columnsHistorial} data={historialRows} emptyMessage="Todavía no hay movimientos en el historial." />
          </CardContent>
        </Card>
      ) : tab === 'cobros' ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Info className="size-4" />Pagos aprobados no capturados por webhook.</p>
              <div className="flex items-center gap-2">
                <Select value={dias} onValueChange={setDias}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 días</SelectItem>
                    <SelectItem value="15">Últimos 15 días</SelectItem>
                    <SelectItem value="30">Últimos 30 días</SelectItem>
                    <SelectItem value="60">Últimos 60 días</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={syncing} onClick={sincronizar}><RefreshCw />{syncing ? 'Sincronizando…' : 'Sincronizar'}</Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <DataTable columns={columnsCobros} data={pendientesMov} emptyMessage="Usá el botón Sincronizar para traer las transferencias recibidas." />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable columns={columnsPendientes} data={pendientesPagos} emptyMessage="Sin pagos pendientes." />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

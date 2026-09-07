// El alta y la edición de un presupuesto: cliente, ítems con autocompletado del
// catálogo y precios, IVA y totales.
//
// Extraída de Contalibra y Restolibra (el pase de comprobantes al kit, 2026-09-07). Las dos copias eran
// idénticas salvo comentarios y el orden de los imports; lo que de verdad difería
// entra por props. LibraDesk tiene sus propias pantallas de remitos y presupuestos,
// que son otra implementación (13-40 % de similitud) y no se tocan.
//
// Lo que difería: toda la cotización por lista de precios, que Restolibra no tiene
// en esta pantalla. Entra por dos props —`conSelectorDeLista` y `conQuiebres`—
// porque en Contalibra eran dos gates distintos: el selector se dibujaba siempre y
// el add-on mayorista gateaba sólo el re-precio por cantidad.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from './api-client'
import { type Presupuesto } from './facturas'
import { type Cliente } from './mp'
import { type ListaPrecio, type ProductoBusqueda, opcionesCliente } from './comercio/tipos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Calculator, Trash2 } from 'lucide-react'
import { SelectBuscable } from './SelectBuscable'
import { TituloPantalla } from './titulo-pantalla'
import { enDiasISO, hoyISO } from './fechas'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

// `producto_id` se guarda sólo en el front (el presupuesto no lo persiste): lo
// necesita el re-precio por cantidad del add-on mayorista.
type ItemRow = { description: string; qty: string; unit_price: string; producto_id: number | null }
const EMPTY_ITEM: ItemRow = { description: '', qty: '1', unit_price: '0', producto_id: null }

// Misma pagina para alta y edicion, igual que el form.html viejo -- si hay
// :id en la ruta (/presupuestos/:id/editar) precarga el presupuesto existente.
export function PresupuestoForm({ conSelectorDeLista = false, conQuiebres = false }: {
  /** Cotizar eligiendo una lista de precios: dibuja el selector, preselecciona la
   *  lista asignada al cliente y le pasa `lista_id` a la búsqueda de productos.
   *  Es el módulo `listas_precio`, no el add-on. Contalibra lo prende siempre —el
   *  backend ya gatea con un 403 y sin módulo la lista queda vacía—; Restolibra
   *  no lo tiene en esta pantalla. */
  conSelectorDeLista?: boolean
  /** El add-on mayorista: re-cotiza el renglón por cantidad cuando el producto
   *  tiene quiebres (10+, 50+…). Mismo nombre y mismo significado que en
   *  `comercio/ListaPrecioDetalle`. El kit no lee la sesión: quién tiene el
   *  add-on lo sabe el producto.
   *
   *  🔑 Son dos props y no una: en Contalibra el add-on gateaba **sólo** el
   *  re-precio, y el selector se dibujaba con o sin él. Con una sola prop, un
   *  producto con el módulo y sin el add-on perdería el selector que hoy ve. */
  conQuiebres?: boolean
} = {}) {
  const { id } = useParams<{ id: string }>()
  const editingId = id ? Number(id) : null
  const navigate = useNavigate()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loadingPresupuesto, setLoadingPresupuesto] = useState(Boolean(editingId))

  const [clienteId, setClienteId] = useState('')
  const [clienteNombreLibre, setClienteNombreLibre] = useState('')
  const [date, setDate] = useState(hoyISO())
  // 30 días desde hoy en Argentina. La cuenta vieja partía de `new Date()` y
  // salía por `toISOString()`, así que arrastraba el mismo corrimiento a UTC
  // que la fecha de emisión de acá arriba: de noche, un presupuesto emitido el
  // 12 vencía el 12 del mes siguiente en vez del 11.
  const [validUntil, setValidUntil] = useState(() => enDiasISO(30))
  const [taxRate, setTaxRate] = useState('0.21')
  const [observations, setObservations] = useState('')
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sugerencias, setSugerencias] = useState<{ index: number; items: ProductoBusqueda[] } | null>(null)
  // Lista de precios con la que se cotiza. `''` = precio de venta base. El
  // selector aparece si la instancia tiene el modulo `listas_precio` (sin el,
  // /api/listas-precio da 403 y la lista queda vacia). Con el add-on `mayorista`,
  // ademas, se preselecciona la lista asignada al cliente elegido.
  const [listasPrecio, setListasPrecio] = useState<ListaPrecio[]>([])
  const [listaPrecioId, setListaPrecioId] = useState('')

  useEffect(() => {
    api.get<Cliente[]>('/api/clientes').then((c) => setClientes(c.filter((x) => x.activo))).catch(() => {})
    if (conSelectorDeLista) api.get<ListaPrecio[]>('/api/listas-precio').then(setListasPrecio).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Add-on mayorista: al elegir un cliente, se preselecciona su lista asignada.
  // Si la instancia no tiene el add-on, el endpoint da 403 y no se toca la
  // seleccion manual. Con el add-on y sin lista asignada, vuelve al precio base.
  useEffect(() => {
    if (!conSelectorDeLista || !clienteId) return
    api.get<{ lista_id: number | null }>(`/api/clientes/${clienteId}/lista-precio`)
      .then((r) => setListaPrecioId(r.lista_id === null ? '' : String(r.lista_id)))
      .catch(() => {})
  }, [conSelectorDeLista, clienteId])

  useEffect(() => {
    if (!editingId) return
    api.get<Presupuesto>(`/api/presupuestos/${editingId}`).then((p) => {
      setClienteId(p.client_id ? String(p.client_id) : '')
      setClienteNombreLibre(p.client_id ? '' : p.client_name)
      setDate(p.date)
      setValidUntil(p.valid_until)
      setTaxRate(String(p.tax_rate))
      setObservations(p.observations)
      // `producto_id: null`: el presupuesto guardado no lo tiene, así que un
      // renglón precargado no re-cotiza por cantidad hasta que se re-elige el producto.
      setItems(p.items.map((it) => ({ description: it.description, qty: String(it.qty), unit_price: String(it.unit_price), producto_id: null })))
    }).catch((err) => setError(describeError(err))).finally(() => setLoadingPresupuesto(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  function addItem() { setItems((rows) => [...rows, { ...EMPTY_ITEM }]) }
  function removeItem(i: number) {
    if (items.length <= 1) return
    setItems((rows) => rows.filter((_, idx) => idx !== i))
  }
  function updateItem(i: number, field: 'description' | 'qty' | 'unit_price', value: string) {
    setItems((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  // Add-on mayorista: re-cotiza el renglón por cantidad. El precio de un producto
  // puede bajar por quiebre (10+, 50+…); el endpoint resuelve el que aplica a la
  // cantidad. Sin el add-on o sin lista, no hace nada (queda el precio ya puesto).
  async function reResolverPrecio(i: number, productoId: number | null, cantidad: number) {
    if (!conQuiebres || !productoId || !listaPrecioId || !(cantidad > 0)) return
    try {
      const r = await api.get<{ precio: number | null }>(
        `/api/listas-precio/${listaPrecioId}/precio?producto_id=${productoId}&cantidad=${cantidad}`,
      )
      if (r.precio !== null) {
        setItems((rows) => rows.map((row, idx) => idx === i ? { ...row, unit_price: String(r.precio) } : row))
      }
    } catch { /* sin add-on o sin lista: se queda con el precio ya puesto */ }
  }

  function cambiarCantidad(i: number, value: string, productoId: number | null) {
    updateItem(i, 'qty', value)
    reResolverPrecio(i, productoId, Number(value))
  }

  async function buscarProducto(i: number, texto: string) {
    updateItem(i, 'description', texto)
    if (texto.trim().length < 2) {
      setSugerencias(null)
      return
    }
    try {
      const lp = listaPrecioId ? `&lista_id=${listaPrecioId}` : ''
      const res = await api.get<ProductoBusqueda[]>(`/productos/buscar?q=${encodeURIComponent(texto)}${lp}`)
      setSugerencias({ index: i, items: res })
    } catch {
      setSugerencias(null)
    }
  }

  function elegirProducto(i: number, p: ProductoBusqueda) {
    const cantidad = Number(items[i]?.qty) || 1
    setItems((rows) => rows.map((r, idx) => idx === i ? { ...r, description: p.nombre, unit_price: String(p.precio_venta), producto_id: p.id } : r))
    setSugerencias(null)
    // La búsqueda ya trae el precio base de la lista; re-resolver aplica el
    // quiebre si la cantidad del renglón ya está por encima de uno.
    reResolverPrecio(i, p.id, cantidad)
  }

  async function guardar() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        date, valid_until: validUntil, client_id: clienteId ? Number(clienteId) : null,
        client_name: clienteId ? '' : clienteNombreLibre, tax_rate: Number(taxRate) || 0, observations,
        items: items.filter((r) => r.description.trim()).map((r) => ({
          description: r.description, qty: Number(r.qty) || 0, unit_price: Number(r.unit_price) || 0,
        })),
      }
      const p = editingId
        ? await api.put<Presupuesto>(`/api/presupuestos/${editingId}`, payload)
        : await api.post<Presupuesto>('/api/presupuestos', payload)
      navigate(`/presupuestos/${p.id}`)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  const subtotalCalc = items.reduce((acc, r) => acc + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0)
  const ivaCalc = subtotalCalc * (Number(taxRate) || 0)

  return (
    <div className="grid gap-4">
      <TituloPantalla icono={Calculator}>{editingId ? 'Editar presupuesto' : 'Nuevo presupuesto'}</TituloPantalla>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loadingPresupuesto ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del presupuesto</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label>Cliente</Label>
                <SelectBuscable
                  value={clienteId}
                  onChange={(v) => { setClienteId(v); setClienteNombreLibre('') }}
                  opciones={opcionesCliente(clientes)}
                  placeholder="Elegir cliente…"
                  ariaLabel="Cliente"
                  className="w-52"
                />
              </div>
              {!clienteId && (
                <div className="grid gap-2"><Label>o nombre libre</Label><Input value={clienteNombreLibre} onChange={(e) => setClienteNombreLibre(e.target.value)} className="w-48" /></div>
              )}
              <div className="grid gap-2"><Label>Fecha</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></div>
              <div className="grid gap-2"><Label>Válido hasta</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-40" /></div>
              <div className="grid gap-2">
                <Label>IVA</Label>
                <Select value={taxRate} onValueChange={setTaxRate}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.21">21%</SelectItem>
                    <SelectItem value="0.105">10.5%</SelectItem>
                    <SelectItem value="0.0">0%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {conSelectorDeLista && listasPrecio.length > 0 && (
                <div className="grid gap-2">
                  <Label>Lista de precios</Label>
                  <Select value={listaPrecioId || '__base__'} onValueChange={(v) => setListaPrecioId(v === '__base__' ? '' : v)}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__base__">— Precio de venta base —</SelectItem>
                      {listasPrecio.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b p-3">
                <Label>Ítems</Label>
                <Button size="sm" variant="outline" onClick={addItem}>+ Agregar ítem</Button>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Descripción</th>
                    <th className="w-24 p-2 text-left font-medium">Cantidad</th>
                    <th className="w-32 p-2 text-left font-medium">Precio unit.</th>
                    <th className="w-28 p-2 text-right font-medium">Subtotal</th>
                    <th className="w-10 p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="relative p-2">
                        <Input value={row.description} onChange={(e) => buscarProducto(i, e.target.value)} placeholder="Descripción o producto…" />
                        {sugerencias?.index === i && sugerencias.items.length > 0 && (
                          <div className="absolute left-2 top-11 z-10 w-64 rounded-md border bg-popover shadow-md">
                            {sugerencias.items.map((p) => (
                              <button
                                key={p.id} type="button"
                                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                                onClick={() => elegirProducto(i, p)}
                              >
                                {p.nombre} — {formatCurrency(p.precio_venta)}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-2"><Input type="number" step="0.01" value={row.qty} onChange={(e) => cambiarCantidad(i, e.target.value, row.producto_id)} /></td>
                      <td className="p-2"><Input type="number" step="0.01" value={row.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} /></td>
                      <td className="p-2 text-right font-medium">{formatCurrency((Number(row.qty) || 0) * (Number(row.unit_price) || 0))}</td>
                      <td className="p-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="p-2 text-right font-medium text-muted-foreground">Subtotal</td>
                    <td className="p-2 text-right font-medium">{formatCurrency(subtotalCalc)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="p-2 text-right font-medium text-muted-foreground">IVA ({Math.round((Number(taxRate) || 0) * 100)}%)</td>
                    <td className="p-2 text-right font-medium">{formatCurrency(ivaCalc)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="p-2 text-right text-base font-bold">TOTAL</td>
                    <td className="p-2 text-right text-base font-bold text-primary">{formatCurrency(subtotalCalc + ivaCalc)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid gap-2"><Label>Observaciones</Label><Input value={observations} onChange={(e) => setObservations(e.target.value)} /></div>

            <div className="flex flex-wrap items-end gap-2 border-t pt-4">
              <Button disabled={saving} onClick={guardar}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear presupuesto'}</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/presupuestos')}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

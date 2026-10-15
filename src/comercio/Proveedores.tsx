// El listado de proveedores con el alta en diálogo.
//
// Extraída de `pages/Proveedores.tsx` de Contalibra y Restolibra (P9-M4, 2026-09-07):
// la copia de cada producto era la misma salvo comentarios y estilo de botones;
// queda la de Contalibra (botones de ícono con `aria-label`).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ColumnDef } from '../data-table'
import { api, ApiError } from '../api-client'
import { IVA_CONDITIONS } from '../facturas'
import { type Proveedor } from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from '../ui/dialog'
import { anchoColumnaAcciones, sortableHeader } from '../data-table'
import { TablaOTarjetas, TarjetaDeFila } from '../tabla-o-tarjetas'
import { TACTIL_BAJO_LG, useBajoLg } from '../use-ancho'
import { Plus, Pencil, Eye, Search, X } from 'lucide-react'
import { TituloPantalla } from '../titulo-pantalla'
import { ICONOS } from '../iconos-identidad'

const proveedorSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  cuit_dni: z.string().trim().optional(),
  email: z.string().trim().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  iva_condition: z.string().optional(),
})

type ProveedorFormValues = z.infer<typeof proveedorSchema>
const EMPTY_VALUES: ProveedorFormValues = {
  nombre: '', cuit_dni: '', email: '', phone: '', address: '', iva_condition: '',
}

export function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  // Alta de proveedor como Dialog inline -- antes era la página
  // /proveedores/nuevo (ProveedorForm.tsx, ahora eliminada). Ver
  // web/templates/proveedores/form.html para el origen de estos campos.
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [creando, setCreando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ProveedorFormValues>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    loadProveedores()
  }, [])

  function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail
    return 'Error de conexión.'
  }

  async function loadProveedores(query = q) {
    setLoading(true)
    setError(null)
    try {
      const path = query ? `/api/proveedores?q=${encodeURIComponent(query)}` : '/api/proveedores'
      setProveedores(await api.get<Proveedor[]>(path))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  function limpiarBusqueda() {
    setQ('')
    loadProveedores('')
  }

  function abrirNuevo() {
    form.reset(EMPTY_VALUES)
    setFormError(null)
    setNuevoOpen(true)
  }

  async function crearProveedor(values: ProveedorFormValues) {
    setCreando(true)
    setFormError(null)
    const payload = {
      nombre: values.nombre,
      cuit_dni: values.cuit_dni || '',
      email: values.email || '',
      phone: values.phone || '',
      address: values.address || '',
      iva_condition: values.iva_condition || '',
    }
    try {
      await api.post<Proveedor>('/api/proveedores', payload)
      setNuevoOpen(false)
      await loadProveedores()
    } catch (err) {
      setFormError(describeError(err))
    } finally {
      setCreando(false)
    }
  }

  // Los dos botones de la fila, en la tabla y en la tarjeta.
  const acciones = (p: Proveedor) => (
    <div className={`flex justify-end gap-1 ${TACTIL_BAJO_LG}`}>
      <Button asChild size="icon" variant="outline" title="Ver proveedor"><Link to={`/proveedores/${p.id}`} aria-label="Ver proveedor"><Eye /></Link></Button>
      <Button asChild size="icon" variant="outline" title="Editar proveedor"><Link to={`/proveedores/${p.id}`} aria-label="Editar proveedor"><Pencil /></Link></Button>
    </div>
  )

  // Orden igual a web/templates/proveedores/list.html: Nombre, CUIT/DNI,
  // Email, Teléfono, acciones. Esa fila solo tenía Ver + Editar -- "Eliminar
  // proveedor" vivía como botón aparte al pie de la página de detalle
  // (proveedores/detail.html), no en la fila de la lista. "Ver" navega a la
  // página propia (/proveedores/:id); "Editar" ahora abre el modal de
  // edición inline en esa misma página de detalle en vez de navegar a
  // /proveedores/:id/editar.
  // Con `size` (ADR-057) la tabla es de layout fijo, con Nombre elástico, y la suma de los `size` es el ancho desde el cual entra: más angosto, tarjetas.
  const bajoLg = useBajoLg()
  const columns = useMemo<ColumnDef<Proveedor>[]>(() => [
    { accessorKey: 'nombre', header: sortableHeader('Nombre'), size: 200, minSize: 130, meta: { stretch: true }, cell: ({ row }) => (
      <Link to={`/proveedores/${row.original.id}`} className="block truncate font-medium hover:underline" title={row.original.nombre}>{row.original.nombre}</Link>
    ) },
    { accessorKey: 'cuit_dni', header: 'CUIT/DNI', size: 130, minSize: 110, cell: ({ row }) => <span className="block truncate" title={row.original.cuit_dni ?? undefined}>{row.original.cuit_dni || '—'}</span> },
    { accessorKey: 'email', header: 'Email', size: 200, minSize: 120, cell: ({ row }) => <span className="block truncate" title={row.original.email ?? undefined}>{row.original.email || '—'}</span> },
    { accessorKey: 'phone', header: 'Teléfono', size: 130, minSize: 100, cell: ({ row }) => <span className="block truncate" title={row.original.phone ?? undefined}>{row.original.phone || '—'}</span> },
    {
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      size: anchoColumnaAcciones(2, bajoLg),
      minSize: anchoColumnaAcciones(2, bajoLg),
      cell: ({ row }) => acciones(row.original),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [bajoLg])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TituloPantalla icono={ICONOS.proveedores}>Proveedores</TituloPantalla>
        <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
          <DialogTrigger asChild>
            <Button onClick={abrirNuevo}><Plus />Nuevo proveedor</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ICONOS.proveedores className="size-4" />Nuevo proveedor</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form className="flex flex-wrap items-start gap-3" onSubmit={form.handleSubmit(crearProveedor)}>
                {formError && <p className="w-full text-sm text-destructive">{formError}</p>}
                <FormField
                  control={form.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input {...field} className="w-48" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cuit_dni"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CUIT/DNI</FormLabel>
                      <FormControl>
                        <Input {...field} className="w-36" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input {...field} className="w-36" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} className="w-52" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dirección</FormLabel>
                      <FormControl>
                        <Input {...field} className="w-52" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="iva_condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condición de IVA</FormLabel>
                      {/* select-cerrado: las condiciones frente al IVA son un catálogo cerrado de ARCA, fijo en el código (`IVA_CONDITIONS`) */}
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-52">
                            <SelectValue placeholder="Condición de IVA…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {IVA_CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="w-full">
                  <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                  <Button type="submit" disabled={creando}>{creando ? 'Guardando…' : 'Crear proveedor'}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadProveedores()}
            placeholder="Buscar por nombre o CUIT…"
            className="w-72"
          />
          <Button variant="outline" size="icon" onClick={() => loadProveedores()}><Search /></Button>
          {q && <Button variant="outline" size="icon" onClick={limpiarBusqueda}><X /></Button>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <TablaOTarjetas
            columns={columns}
            data={proveedores}
            cargando={loading}
            clave={(p) => p.id}
            etiqueta="Proveedores"
            emptyMessage={q ? `No se encontraron proveedores para "${q}".` : 'No hay proveedores registrados aún.'}
            tarjeta={(p) => (
              <TarjetaDeFila
                titulo={<Link to={`/proveedores/${p.id}`} className="text-primary hover:underline">{p.nombre}</Link>}
                datos={[
                  { etiqueta: 'CUIT/DNI', valor: p.cuit_dni || '—' },
                  { etiqueta: 'Email', valor: p.email || '—' },
                  { etiqueta: 'Teléfono', valor: p.phone || '—' },
                ]}
                acciones={acciones(p)}
              />
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}

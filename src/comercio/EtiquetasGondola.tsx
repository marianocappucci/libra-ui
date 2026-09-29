// Las etiquetas de góndola: se eligen productos (todos, por categoría o buscando), se ve la hoja y se imprime
// (roadmap de producto de VentaLibra, 2026-09-29 — ver wiki/analyses/ventalibra-gaps-despensa.md, «etiquetas de
// góndola»). Cada etiqueta lleva el nombre, el precio y el código de barras de siempre del producto.
//
// ## De dónde salen los datos: de lo que el motor ya expone, sin endpoint nuevo
//
// Es una pantalla **de sólo lectura**: `GET /api/productos` (nombre, código principal, precio, unidad),
// `GET /api/productos/categorias` y, para los precios de una lista, `GET /api/listas-precio` y
// `GET /api/listas-precio/{id}/items`. No escribe nada ni toca stock.
//
// ## Qué precio dice la etiqueta
//
// El que cobra el POS. Con una lista **predeterminada** el POS cobra el precio de esa lista (ADR-042 de VentaLibra) y
// cae al precio de venta del producto si la lista no lo tiene; la pantalla arranca en esa lista y hace lo mismo. Se
// puede elegir otra lista o el precio de venta del catálogo. 🔴 Es el precio **base** de la lista: no resuelve
// quiebres por cantidad ni vigencias (una promoción por fecha), que dependen de cuándo y cuánto se compre.
//
// ## Cómo se imprime
//
// «Ver e imprimir» abre la hoja a pantalla completa (un portal sobre `document.body`) y `window.print()` la manda al
// navegador. El `@media print` de abajo esconde **todo lo demás del `body`**, sea cual sea el layout del producto:
// no depende de conocer la sidebar. Hoja A4 vertical con 2, 3 o 4 columnas, un borde punteado para recortar; el tamaño
// de la etiqueta sale del ancho de la columna. No es una impresora de rollo (Zebra/térmica): esa necesita el tamaño de
// papel de cada modelo y un driver, y va aparte.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ColumnDef } from '../data-table'
import { ArrowLeft, Printer, ScanBarcode } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { DataTable } from '../data-table'
import { BadgeEstado } from '../badge-estado'
import { TituloPantalla } from '../titulo-pantalla'
import { coincideBusqueda } from '../utils'
import { CodigoDeBarras } from './CodigoDeBarras'
import type { CategoriaProducto, ItemListaPrecio, ListaPrecio, Producto } from './tipos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// Radix Select no admite value="" (reservado): «todas» y «sin lista» viajan como un sentinel, mismo patrón que
// Egresos ("__sin__") y Productos ("__ninguna__").
const TODAS = '__todas__'
const SIN_LISTA = '__catalogo__'
const COLUMNAS = ['2', '3', '4']

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

// Lo que rige cuando la hoja se imprime. `@page` va acá y no en el CSS del producto para que sólo exista mientras la
// hoja está abierta: no cambia el tamaño de papel del ticket ni de ninguna otra impresión.
const CSS_DE_IMPRESION = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not([data-etiquetas-impresion]) { display: none !important; }
  [data-etiquetas-impresion] { position: static !important; overflow: visible !important; background: #fff !important; }
}
`

type Fila = {
  producto: Producto
  /** El precio que dice la etiqueta (ver el encabezado). */
  precio: number
}

function VistaDeImpresion({ filas, onCerrar }: { filas: Fila[]; onCerrar: () => void }) {
  const [columnas, setColumnas] = useState('3')
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => { raiz.current?.focus() }, [])
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return createPortal(
    <div
      ref={raiz} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Vista de impresión de etiquetas"
      data-etiquetas-impresion=""
      className="fixed inset-0 z-50 overflow-auto bg-muted outline-none"
    >
      <style>{CSS_DE_IMPRESION}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3 print:hidden">
        <Button type="button" variant="outline" onClick={onCerrar}><ArrowLeft />Volver</Button>
        <p className="text-sm text-muted-foreground">
          {filas.length} {plural(filas.length, 'etiqueta', 'etiquetas')} · hoja A4 · recortá por la línea punteada
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="etiquetas-columnas">Columnas</Label>
          <Select value={columnas} onValueChange={setColumnas}>
            <SelectTrigger id="etiquetas-columnas" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMNAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" onClick={() => window.print()}><Printer />Imprimir</Button>
        </div>
      </div>

      {/* Blanco y negro fijos: la etiqueta se imprime igual con el tema oscuro puesto. */}
      <div className="mx-auto my-6 max-w-full bg-white p-[10mm] text-black shadow print:m-0 print:p-0 print:shadow-none" style={{ width: '210mm' }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
          {filas.map(({ producto, precio }) => (
            <div
              key={producto.id} data-etiqueta=""
              className="flex break-inside-avoid flex-col justify-between gap-1 border border-dashed border-neutral-400 p-2"
              style={{ minHeight: '38mm' }}
            >
              <p className="line-clamp-2 text-[11pt] font-semibold leading-tight">{producto.nombre}</p>
              <p className="text-[22pt] font-bold leading-none">
                {formatCurrency(precio)}
                {producto.unidad && producto.unidad !== 'u' && <span className="ml-1 text-[9pt] font-normal">/ {producto.unidad}</span>}
              </p>
              {producto.codigo && (
                <div className="grid justify-items-center gap-0.5">
                  <CodigoDeBarras codigo={producto.codigo} />
                  <p className="font-mono text-[8pt] tracking-wider">{producto.codigo}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function EtiquetasGondola() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [listas, setListas] = useState<ListaPrecio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [categoria, setCategoria] = useState(TODAS)
  const [q, setQ] = useState('')
  const [listaId, setListaId] = useState(SIN_LISTA)
  // Con el `id` de la lista a la que pertenecen: mientras llegan los de una lista recién elegida, los de la anterior
  // no valen (se mostrarían precios de otra lista).
  const [preciosDeLista, setPreciosDeLista] = useState<{ lista: string; precios: Map<number, ItemListaPrecio> } | null>(null)
  const [avisoLista, setAvisoLista] = useState<string | null>(null)

  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [vista, setVista] = useState(false)
  const cerrarVista = useCallback(() => setVista(false), [])

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      try {
        const [prods, cats, ls] = await Promise.all([
          api.get<Producto[]>('/api/productos'),
          // Sin categorías o sin listas (un usuario sin permiso de listas recibe 403) la pantalla sigue: sólo pierde
          // el filtro o el precio de lista.
          api.get<CategoriaProducto[]>('/api/productos/categorias').catch(() => [] as CategoriaProducto[]),
          api.get<ListaPrecio[]>('/api/listas-precio').catch(() => [] as ListaPrecio[]),
        ])
        if (cancelado) return
        setProductos(prods)
        setCategorias(cats)
        setListas(ls)
        // Como el POS: si hay una lista predeterminada (y activa), es la que rige.
        const predeterminada = ls.find((l) => l.es_default && l.activa)
        if (predeterminada) setListaId(String(predeterminada.id))
      } catch (err) {
        if (!cancelado) setError(describeError(err))
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    void cargar()
    return () => { cancelado = true }
  }, [])

  // Los precios de la lista elegida. Cada cambio de lista pide los suyos; si falla, se vuelve al catálogo y se avisa
  // en vez de mostrar una lista con los precios de otra.
  useEffect(() => {
    if (listaId === SIN_LISTA) return
    let cancelado = false
    api.get<ItemListaPrecio[]>(`/api/listas-precio/${listaId}/items`)
      .then((items) => {
        if (cancelado) return
        setPreciosDeLista({ lista: listaId, precios: new Map(items.map((i) => [i.id, i])) })
        setAvisoLista(null)
      })
      .catch(() => {
        if (cancelado) return
        setAvisoLista('No se pudieron leer los precios de la lista: las etiquetas usan el precio de venta del producto.')
        setListaId(SIN_LISTA)
      })
    return () => { cancelado = true }
  }, [listaId])

  // Una etiqueta de góndola es de un producto que se vende: los inactivos y los servicios (no tienen góndola) no se
  // ofrecen.
  const activos = useMemo(() => productos.filter((p) => p.activo && p.tipo !== 'servicio'), [productos])

  const precioDe = (p: Producto): number => {
    const enLista = preciosDeLista?.lista === listaId ? preciosDeLista.precios.get(p.id) : undefined
    return enLista?.en_lista ? enLista.precio_lista : p.precio_venta
  }

  const visibles = useMemo(
    () => activos.filter((p) => (categoria === TODAS || p.categoria === categoria)
      && coincideBusqueda(`${p.nombre} ${p.codigo ?? ''} ${p.categoria}`, q)),
    [activos, categoria, q],
  )

  // Se imprime en el orden del listado, no en el orden en que se fueron tildando.
  const filas: Fila[] = activos.filter((p) => elegidos.has(p.id)).map((producto) => ({ producto, precio: precioDe(producto) }))

  function alternar(id: number) {
    setElegidos((actuales) => {
      const nuevos = new Set(actuales)
      if (!nuevos.delete(id)) nuevos.add(id)
      return nuevos
    })
  }

  function elegirLosQueSeVen() {
    setElegidos((actuales) => new Set([...actuales, ...visibles.map((p) => p.id)]))
  }

  const columnas: ColumnDef<Producto>[] = [
    {
      id: 'elegir',
      header: '',
      cell: ({ row }) => (
        <input
          type="checkbox" className="size-4" checked={elegidos.has(row.original.id)}
          aria-label={`Etiqueta de ${row.original.nombre}`} onChange={() => alternar(row.original.id)}
        />
      ),
    },
    { accessorKey: 'nombre', header: 'Producto' },
    { accessorKey: 'categoria', header: 'Categoría' },
    {
      accessorKey: 'codigo',
      header: 'Código',
      cell: ({ row }) => row.original.codigo
        ? row.original.codigo
        : <BadgeEstado tono="atencion">Sin código</BadgeEstado>,
    },
    {
      id: 'precio',
      header: () => <div className="text-right">Precio</div>,
      cell: ({ row }) => <div className="text-right">{formatCurrency(precioDe(row.original))}</div>,
    },
  ]

  return (
    <div className="grid gap-4">
      <TituloPantalla icono={ScanBarcode}>Etiquetas de góndola</TituloPantalla>
      <p className="text-sm text-muted-foreground">
        Elegí los productos y armá la hoja de etiquetas para imprimir: nombre, precio y código de barras. Un producto
        sin código sale igual, sin barras.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {avisoLista && <p className="text-sm text-destructive">{avisoLista}</p>}

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label htmlFor="etiquetas-buscar">Buscar producto</Label>
              <Input id="etiquetas-buscar" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
            </div>
            {categorias.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="etiquetas-categoria">Categoría</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger id="etiquetas-categoria" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>Todas las categorías</SelectItem>
                    {categorias.map((c) => <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {listas.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="etiquetas-lista">Precio</Label>
                <Select value={listaId} onValueChange={setListaId}>
                  <SelectTrigger id="etiquetas-lista" className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_LISTA}>Precio de venta del producto</SelectItem>
                    {listas.filter((l) => l.activa).map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.nombre}{l.es_default ? ' (predeterminada)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={elegirLosQueSeVen} disabled={visibles.length === 0}>
              Elegir los {visibles.length} que se ven
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setElegidos(new Set())} disabled={elegidos.size === 0}>
              Quitar la selección
            </Button>
            <p className="text-sm text-muted-foreground">
              {filas.length} {plural(filas.length, 'elegido', 'elegidos')}
            </p>
            <Button type="button" className="ml-auto" onClick={() => setVista(true)} disabled={filas.length === 0}>
              <Printer />Ver e imprimir
            </Button>
          </div>

          {cargando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <DataTable columns={columnas} data={visibles} emptyMessage="No hay productos para mostrar." />
          )}
        </CardContent>
      </Card>

      {vista && <VistaDeImpresion filas={filas} onCerrar={cerrarVista} />}
    </div>
  )
}

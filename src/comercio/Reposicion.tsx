// Reposición sugerida: qué conviene pedir, por producto, según lo que se vende, lo que hay y lo que ya viene.
// Sólo lectura y sólo sugiere: no genera ninguna orden de compra.
//
// Pantalla nueva (0.90.0, roadmap de producto de VentaLibra, B-2); la cuenta es del motor
// (`GET /api/reportes/reposicion`, `libracommerce.erp.reposicion`, ADR-017) y acá sólo se muestra. Sin props, como
// `Margen`: no hay nada que varíe por producto.
//
// Diferencias con `Margen` que no son casualidad:
// - **El orden es del navegador.** El motor no recibe un `orden`: devuelve la lista por urgencia (menor cobertura
//   primero, después lo que más hay que pedir, sin rotación al final) y ése es el orden por defecto. Reordenar por
//   otra columna es local, así que el CSV sale siempre en el orden de urgencia del motor, no en el de la tabla.
// - **Los parámetros se validan acá con los mismos topes que el motor** (`erp.reposicion.MAX_*`): un valor fuera de
//   rango no se manda (el motor contestaría 422) y no se muestra una lista que no corresponde a lo que dicen los campos.
//
// **Proveedor habitual (0.102.0, motor >= 0.33.0, ADR-021):** una columna «Proveedor» y un filtro por proveedor, sólo si el motor lo maneja
// (la respuesta trae la clave `proveedor_id`; con uno anterior la pantalla es la de siempre).
//
// **Órdenes en borrador (0.105.0, motor >= 0.34.0, ADR-022):** el botón «Generar órdenes en borrador» (prop `conGenerarOrdenes`: el producto la enciende
// sólo si su motor es >= 0.34.0 y quien mira puede escribir Compras) crea una orden por proveedor habitual con lo que se ve; ver `reposicion-ordenes.tsx`. `rutaDeOrden` lleva a cada orden creada.
//
// 🔴 **Los avisos por fila no son adorno.** `posible_quiebre` dice que la rotación de ese producto se estimó con
// pocos días con stock y puede estar subestimada (se sugiere de menos); `sin_ventas` que no hay rotación, y por eso
// la cobertura es un guion y el producto sólo aparece si está bajo el mínimo; `en_camino_sin_sucursal`, que con una
// sucursal elegida se está descontando lo pedido en órdenes que no dicen a qué sucursal van.
// `vencido` (0.95.0, motor >= 0.31.0): la parte del stock que está en lotes vencidos; la sugerencia no la cuenta como stock,
// y se avisa en la celda para que no parezca que sobra mercadería. Falta con un motor anterior: no se muestra nada.
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../api-client'
import { TituloPantalla } from '../titulo-pantalla'
import type {
  CategoriaProducto, Proveedor, ReposicionData, ReposicionMotivo, ReposicionProducto, Sucursal,
} from './tipos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Download, FilePlus2, PackagePlus, TrendingDown } from 'lucide-react'
import { nuevaClaveDeOperacion } from './clave-de-operacion'
import { DialogoGenerarOrdenes, type IntentoDeOrdenes, type ParametrosDeOrdenes } from './reposicion-ordenes'

const RUTA = '/api/reportes/reposicion'
/** El valor de «Toda la instancia» y de «Todas las categorías» en su `Select` (uno de Radix no admite `''`). */
const TODAS = '__todas__'

type ClaveParametro = 'dias_rotacion' | 'dias_cobertura' | 'plazo_entrega_dias'
/** Los defaults y topes del motor (`erp.reposicion`: `DIAS_*`, `PLAZO_ENTREGA_DIAS` y `MAX_*`). */
const PARAMETROS: { clave: ClaveParametro; etiqueta: string; defecto: string; max: number }[] = [
  { clave: 'dias_rotacion', etiqueta: 'Días de rotación', defecto: '30', max: 365 },
  { clave: 'dias_cobertura', etiqueta: 'Días de cobertura', defecto: '15', max: 365 },
  { clave: 'plazo_entrega_dias', etiqueta: 'Plazo de entrega (días)', defecto: '3', max: 180 },
]

const ETIQUETA_DEL_MOTIVO: Record<ReposicionMotivo, string> = {
  bajo_minimo: 'Bajo el mínimo',
  por_rotacion: 'Por rotación',
  ambos: 'Bajo el mínimo y por rotación',
}
const etiquetaDelMotivo = (m: ReposicionMotivo | null) => (m ? ETIQUETA_DEL_MOTIVO[m] : '—')

/** Las cantidades se muestran como las manda el motor, que ya las redondeó a la escala de la unidad: sin un tope
 *  de decimales más bajo que el suyo (una unidad de 6 decimales no puede mostrar 0,0004 como 0). */
function numero(valor: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 10 }).format(valor)
}

/** El motivo del rechazo de un parámetro, o `null` si vale: un entero de 1 hasta su tope, como en el motor. */
function errorDelParametro(valor: string, max: number): string | null {
  const n = Number(valor)
  return /^\d+$/.test(valor.trim()) && n >= 1 && n <= max ? null : `Tiene que ser un entero entre 1 y ${max}.`
}

type ClaveOrden =
  | 'nombre' | 'codigo' | 'stock' | 'en_camino' | 'stock_minimo' | 'unidades_vendidas' | 'rotacion_diaria'
  | 'cobertura_dias' | 'sugerido' | 'motivo' | 'proveedor'

const COLUMNAS: { orden: ClaveOrden; titulo: string; alinea: 'left' | 'right' }[] = [
  { orden: 'nombre', titulo: 'Producto', alinea: 'left' },
  { orden: 'codigo', titulo: 'Código', alinea: 'left' },
  { orden: 'stock', titulo: 'Stock', alinea: 'right' },
  { orden: 'en_camino', titulo: 'En camino', alinea: 'right' },
  { orden: 'stock_minimo', titulo: 'Mínimo', alinea: 'right' },
  { orden: 'unidades_vendidas', titulo: 'Vendido en la ventana', alinea: 'right' },
  { orden: 'rotacion_diaria', titulo: 'Rotación diaria', alinea: 'right' },
  { orden: 'cobertura_dias', titulo: 'Cobertura (días)', alinea: 'right' },
  { orden: 'sugerido', titulo: 'Sugerido', alinea: 'right' },
  { orden: 'motivo', titulo: 'Motivo', alinea: 'left' },
]

const COLUMNA_PROVEEDOR: { orden: ClaveOrden; titulo: string; alinea: 'left' | 'right' } = { orden: 'proveedor', titulo: 'Proveedor', alinea: 'left' }

/** Lo que se ordena de cada fila; `null` (sin código, sin cobertura, sin motivo) va siempre al final. */
function valorDeOrden(p: ReposicionProducto, clave: ClaveOrden): number | string | null {
  if (clave === 'motivo') return p.motivo ? etiquetaDelMotivo(p.motivo) : null
  if (clave === 'codigo') return p.codigo || null
  if (clave === 'proveedor') return p.proveedor || null
  return p[clave]
}

function ordenar(productos: ReposicionProducto[], orden: { clave: ClaveOrden; sentido: 1 | -1 } | null): ReposicionProducto[] {
  if (!orden) return productos
  const { clave, sentido } = orden
  // `sort` es estable: lo que empata queda en el orden de urgencia del motor.
  return [...productos].sort((a, b) => {
    const x = valorDeOrden(a, clave)
    const y = valorDeOrden(b, clave)
    if (x === null || y === null) return x === y ? 0 : (x === null ? 1 : -1)
    const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'es', { sensitivity: 'base' }) : Number(x) - Number(y)
    return c * sentido
  })
}

export type ReposicionProps = {
  /** El botón «Generar órdenes en borrador». **Lo enciende el producto** y sólo si su motor tiene `POST /api/reportes/reposicion/ordenes` (>= 0.34.0) y quien
   *  mira puede escribir Compras: la pantalla no puede saberlo desde los datos de la lista. */
  conGenerarOrdenes?: boolean
  /** A dónde lleva el número de cada orden creada. Sin esto, el número es texto. */
  rutaDeOrden?: (id: number) => string
}

export function Reposicion({ conGenerarOrdenes = false, rutaDeOrden }: ReposicionProps = {}) {
  const [valores, setValores] = useState<Record<ClaveParametro, string>>(
    () => Object.fromEntries(PARAMETROS.map((p) => [p.clave, p.defecto])) as Record<ClaveParametro, string>,
  )
  const [sucursal, setSucursal] = useState(TODAS)
  const [categoria, setCategoria] = useState(TODAS)
  const [soloAPedir, setSoloAPedir] = useState(true)
  const [orden, setOrden] = useState<{ clave: ClaveOrden; sentido: 1 | -1 } | null>(null)
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [proveedor, setProveedor] = useState(TODAS)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  // Una vez que el motor contestó con la clave `proveedor_id` maneja proveedores: se recuerda aunque una consulta posterior falle o venga vacía.
  const [conProveedor, setConProveedor] = useState(false)
  // El intento de generar órdenes en curso (una copia de lo que se vio, los parámetros y la clave de la operación): recargar la lista de fondo, o que la recarga falle,
  // no lo cierra ni le cambia lo que muestra. `pendiente` es el que se cortó sin saber si llegó: reabrir lo reenvía tal cual (ver `reposicion-ordenes.tsx`).
  const [generando, setGenerando] = useState<IntentoDeOrdenes | null>(null)
  const pendiente = useRef<IntentoDeOrdenes | null>(null)
  // Lo mismo que `pendiente`, como estado, para que el botón de reintento aparezca aunque la lista esté vacía o no haya cargado.
  const [hayPendiente, setHayPendiente] = useState(false)
  // Sube cuando se crean órdenes: la lista se vuelve a pedir (lo creado ya cuenta como «en camino»).
  const [recarga, setRecarga] = useState(0)
  // Lo último que contestó el motor, con la consulta a la que contestó: que `loading` y `error` se deriven de acá
  // (y no de estados sueltos que hay que apagar y prender) evita mostrar el error o la carga de una consulta vieja.
  const [respuesta, setRespuesta] = useState<{ consulta: string; recarga: number; data: ReposicionData | null; error: string | null } | null>(null)

  const errores = Object.fromEntries(PARAMETROS.map((p) => [p.clave, errorDelParametro(valores[p.clave], p.max)])) as
    Record<ClaveParametro, string | null>
  const valido = PARAMETROS.every((p) => errores[p.clave] === null)

  // Una sola forma de armar la consulta para el JSON y para el CSV. `null` con un parámetro inválido: no se pide.
  const consulta = useMemo(() => {
    if (!valido) return null
    const q = new URLSearchParams({
      dias_rotacion: String(Number(valores.dias_rotacion)),
      dias_cobertura: String(Number(valores.dias_cobertura)),
      plazo_entrega_dias: String(Number(valores.plazo_entrega_dias)),
      solo_a_pedir: String(soloAPedir),
    })
    if (sucursal !== TODAS) q.set('sucursal_id', sucursal)
    if (categoria !== TODAS) q.set('categoria', categoria)
    if (proveedor !== TODAS) q.set('proveedor_id', proveedor)
    return q.toString()
  }, [valido, valores, soloAPedir, sucursal, categoria, proveedor])

  // Sin sucursales o sin categorías (un producto sin sucursales, o un usuario sin permiso) la pantalla sigue: sólo
  // pierde ese filtro.
  useEffect(() => {
    let vigente = true
    api.get<Sucursal[]>('/api/sucursales').then((s) => { if (vigente) setSucursales(s) }).catch(() => {})
    api.get<CategoriaProducto[]>('/api/productos/categorias').then((c) => { if (vigente) setCategorias(c) }).catch(() => {})
    api.get<Proveedor[]>('/api/proveedores').then((p) => { if (vigente && Array.isArray(p)) setProveedores(p) }).catch(() => {})
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    // Con un parámetro inválido no se pide (y la pantalla no muestra ni la lista ni el error de antes: ver abajo).
    if (consulta === null) return
    // Una respuesta que llega después de otro cambio de parámetros no pisa a la más nueva.
    let vigente = true
    api.get<ReposicionData>(`${RUTA}?${consulta}`)
      .then((data) => {
        if (!vigente) return
        setRespuesta({ consulta, recarga, data, error: null })
        if (data && typeof data === 'object' && 'proveedor_id' in data) setConProveedor(true)
      })
      .catch((err) => {
        if (vigente) setRespuesta({ consulta, recarga, data: null, error: err instanceof ApiError ? err.detail : 'Error de conexión.' })
      })
    return () => { vigente = false }
  }, [consulta, recarga])

  // Sólo vale lo que contestó el motor a la consulta de los controles de ahora: mientras llega la de un cambio
  // reciente no se muestra la tabla anterior (sus cantidades serían de otros parámetros); se muestra «Cargando…».
  // La recarga cuenta: tras crear órdenes la lista de antes está vieja (sus cantidades no incluyen lo recién pedido) y no se muestra hasta que llega la nueva.
  const actual = respuesta?.consulta === consulta && respuesta.recarga === recarga
  const data = actual ? respuesta.data : null
  const loading = !actual
  const error = actual ? respuesta.error : null

  function ordenarPor(clave: ClaveOrden) {
    if (orden?.clave === clave) setOrden({ clave, sentido: orden.sentido === 1 ? -1 : 1 })
    else setOrden({ clave, sentido: clave === 'nombre' || clave === 'codigo' || clave === 'motivo' || clave === 'proveedor' ? 1 : -1 })
  }

  const productos = useMemo(() => ordenar(data?.productos ?? [], orden), [data, orden])
  // Lo mismo que se pidió para la lista: el motor calcula con estos parámetros lo que se va a crear.
  const parametrosDeOrdenes: ParametrosDeOrdenes = {
    dias_rotacion: Number(valores.dias_rotacion), dias_cobertura: Number(valores.dias_cobertura), plazo_entrega_dias: Number(valores.plazo_entrega_dias),
    ...(sucursal !== TODAS ? { sucursal_id: Number(sucursal) } : {}),
    ...(categoria !== TODAS ? { categoria } : {}),
    ...(proveedor !== TODAS ? { proveedor_id: Number(proveedor) } : {}),
  }
  const columnas = conProveedor ? [...COLUMNAS.slice(0, 2), COLUMNA_PROVEEDOR, ...COLUMNAS.slice(2)] : COLUMNAS
  // Lo que dice la ayuda son los controles, que son también lo que muestra la tabla (sólo se muestra la de esta consulta).
  const horizonte = valido ? Number(valores.dias_cobertura) + Number(valores.plazo_entrega_dias) : null

  return (
    <div className="grid gap-4">
      <TituloPantalla icono={PackagePlus}>Reposición sugerida</TituloPantalla>

      <div className="flex flex-wrap items-start gap-3">
        {sucursales.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="reposicion-sucursal">Sucursal</Label>
            <Select value={sucursal} onValueChange={setSucursal}>
              <SelectTrigger id="reposicion-sucursal" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Toda la instancia</SelectItem>
                {sucursales.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {categorias.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="reposicion-categoria">Categoría</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger id="reposicion-categoria" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas las categorías</SelectItem>
                {categorias.map((c) => <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {conProveedor && proveedores.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="reposicion-proveedor">Proveedor</Label>
            <Select value={proveedor} onValueChange={setProveedor}>
              <SelectTrigger id="reposicion-proveedor" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos los proveedores</SelectItem>
                {proveedores.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {PARAMETROS.map((p) => (
          <div key={p.clave} className="grid gap-2">
            <Label htmlFor={`reposicion-${p.clave}`}>{p.etiqueta}</Label>
            <Input
              id={`reposicion-${p.clave}`} type="number" inputMode="numeric" min={1} max={p.max} step={1}
              value={valores[p.clave]} className="w-40"
              aria-invalid={errores[p.clave] !== null} aria-describedby={errores[p.clave] ? `reposicion-${p.clave}-error` : undefined}
              onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))}
            />
            {errores[p.clave] && (
              <p id={`reposicion-${p.clave}-error`} role="alert" className="max-w-40 text-xs text-destructive">{errores[p.clave]}</p>
            )}
          </div>
        ))}
        <label className="flex items-center gap-2 pt-8 text-sm">
          <input type="checkbox" checked={soloAPedir} onChange={(e) => setSoloAPedir(e.target.checked)} className="size-4" />
          Sólo lo que hay que pedir
        </label>
      </div>

      {conGenerarOrdenes && hayPendiente && !generando && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>Un pedido de órdenes en borrador se cortó y no se sabe si llegó.</span>
          <Button size="sm" variant="outline" onClick={() => setGenerando(pendiente.current)}>Reintentar el pedido anterior</Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Se mira lo que se vendió en los últimos {valido ? valores.dias_rotacion : '…'} días y se proyecta a los días de
        cobertura más el plazo de entrega{horizonte !== null ? ` (${horizonte} días)` : ''}: sugerido = lo que se vendería en ese
        tiempo, menos lo que hay y lo que ya viene en camino. Si con eso no se llega al stock mínimo, se pide lo que falta
        para llegar. Lo que está en lotes vencidos no cuenta como stock. Sólo sugiere: no genera ninguna orden de compra.
      </p>

      {valido && error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!valido ? (
        <p role="status" className="py-6 text-center text-sm text-muted-foreground">Corregí los parámetros para ver la sugerencia.</p>
      ) : !data ? (
        loading && <p role="status" className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="size-4 text-primary" />
              {data.resumen.productos} producto{data.resumen.productos !== 1 ? 's' : ''}
              {data.resumen.productos > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {' · '}{data.resumen.a_pedir} a pedir · {data.resumen.posible_quiebre} con posible quiebre · {data.resumen.sin_ventas} sin ventas
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {orden && (
                <Button size="sm" variant="outline" onClick={() => setOrden(null)}>Orden por urgencia</Button>
              )}
              {conGenerarOrdenes && (
                <Button size="sm" onClick={() => setGenerando(pendiente.current ?? { clave: nuevaClaveDeOperacion(), filas: data.productos, parametros: parametrosDeOrdenes })} disabled={data.productos.length === 0}>
                  <FilePlus2 />Generar órdenes en borrador
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <a href={`${RUTA}/export?${consulta}`}><Download />CSV</a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {data.productos.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {data.solo_a_pedir ? 'Nada que pedir con estos parámetros' : 'No hay productos con estos parámetros'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      {columnas.map((c) => (
                        <th
                          key={c.orden}
                          scope="col"
                          aria-sort={c.orden === orden?.clave ? (orden.sentido === 1 ? 'ascending' : 'descending') : 'none'}
                          className={`p-3 font-medium ${c.alinea === 'right' ? 'text-right' : 'text-left'}`}
                        >
                          <button type="button" onClick={() => ordenarPor(c.orden)} className="font-medium hover:text-foreground">
                            {c.titulo}{c.orden === orden?.clave ? (orden.sentido === 1 ? ' ▲' : ' ▼') : ''}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map((p) => (
                      <tr key={p.producto_id} className="border-b last:border-0">
                        <td className="p-3">
                          <span className="font-medium">{p.nombre}</span>
                          {p.categoria && <span className="ml-2 text-xs text-muted-foreground">{p.categoria}</span>}
                          {(p.sin_ventas || p.posible_quiebre) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.sin_ventas && (
                                <Badge variant="outline" className="whitespace-normal">Sin ventas en la ventana</Badge>
                              )}
                              {p.posible_quiebre && (
                                <Badge variant="outline" className="whitespace-normal border-amber-500/50 text-amber-600 dark:text-amber-400">
                                  <AlertTriangle aria-hidden="true" />Posible quiebre: la rotación puede estar subestimada
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3">{p.codigo || '—'}</td>
                        {conProveedor && <td className="p-3">{p.proveedor || '—'}</td>}
                        <td className={`min-w-36 p-3 text-right ${p.stock <= 0 ? 'text-destructive' : ''}`}>
                          {numero(p.stock)}
                          {(p.vencido ?? 0) > 0 && (
                            <span className="block text-xs text-amber-600 dark:text-amber-400">
                              incluye {numero(p.vencido ?? 0)} vencido, que no se cuenta para pedir
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {numero(p.en_camino)}
                          {data.sucursal_id !== null && p.en_camino_sin_sucursal > 0 && (
                            <span className="block text-xs text-amber-600 dark:text-amber-400">
                              incluye {numero(p.en_camino_sin_sucursal)} de órdenes sin sucursal, contadas en esta sucursal
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">{numero(p.stock_minimo)}</td>
                        <td className="p-3 text-right">{numero(p.unidades_vendidas)}</td>
                        <td className="p-3 text-right">{numero(p.rotacion_diaria)}</td>
                        <td className="p-3 text-right">{p.cobertura_dias === null ? '—' : numero(p.cobertura_dias)}</td>
                        <td className="p-3 text-right font-semibold">
                          {numero(p.sugerido)}{p.unidad && <> <span className="text-xs font-normal text-muted-foreground">{p.unidad}</span></>}
                        </td>
                        <td className="p-3">{etiquetaDelMotivo(p.motivo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {generando && (
        <DialogoGenerarOrdenes
          key={generando.clave}
          intento={generando}
          reanudado={pendiente.current === generando}
          rutaDeOrden={rutaDeOrden}
          onCerrar={() => setGenerando(null)}
          onCreadas={() => setRecarga((n) => n + 1)}
          onEstado={(estado) => { pendiente.current = estado === 'incierto' ? generando : null; setHayPendiente(estado === 'incierto') }}
          onDescartar={() => {
            pendiente.current = null
            setHayPendiente(false)
            if (data) setGenerando({ clave: nuevaClaveDeOperacion(), filas: data.productos, parametros: parametrosDeOrdenes })
            else setGenerando(null)
          }}
        />
      )}
    </div>
  )
}


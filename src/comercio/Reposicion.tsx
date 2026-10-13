// Reposición sugerida: qué conviene pedir, por producto, según lo que se vende, lo que hay y lo que ya viene.
// Sólo lectura y sólo sugiere: no genera ninguna orden de compra.
//
// Pantalla nueva (0.90.0, roadmap de producto de VentaLibra, B-2); la cuenta es del motor
// (`GET /api/reportes/reposicion`, `libracommerce.erp.reposicion`, ADR-017) y acá sólo se muestra. Sin props, como
// `Margen`: no hay nada que varíe por producto.
//
// Diferencias con `Margen` que no son casualidad:
// - **El orden de la tabla es del navegador; el del CSV lo hace el motor.** La lista llega por urgencia (menor cobertura
//   primero, después lo que más hay que pedir, sin rotación al final) y ése es el orden por defecto; reordenar por otra
//   columna es local y no vuelve a pedir. Al CSV, en cambio, se le manda la columna y el sentido activos (`orden` y
//   `sentido`, motor >= 0.45.0, ADR-037) para que salga como se ve; con un motor más viejo ignora los parámetros y sale
//   por urgencia.
// - **Los parámetros se validan acá con los mismos topes que el motor** (`erp.reposicion.MAX_*`): un valor fuera de
//   rango no se manda (el motor contestaría 422) y no se muestra una lista que no corresponde a lo que dicen los campos.
//
// **Proveedor habitual (0.102.0, motor >= 0.33.0, ADR-021):** una columna «Proveedor» y un filtro por proveedor, sólo si el motor lo maneja
// (la respuesta trae la clave `proveedor_id`; con uno anterior la pantalla es la de siempre).
//
// **Estacionalidad (0.107.0, motor >= 0.35.0, ADR-023):** un interruptor «Ajustar por estacionalidad» (sólo si el motor lo maneja: la respuesta trae la clave `estacionalidad`)
// que proyecta con lo que pasó hace un año, y una columna «Estacional» con el factor de cada producto (`×3`: hace un año, después de una ventana como la de ahora, se vendió el
// triple por día; un guion = sin historia de hace un año, sin ajuste). Las órdenes en borrador se calculan con el mismo ajuste que se ve.
//
// **Descontar lo que vence en el horizonte (0.109.0, motor >= 0.37.0, ADR-025 del motor; ADR-011 de libra-ui):** un interruptor «Descontar lo que vence en el horizonte»
// (sólo si el motor lo maneja: la respuesta trae la clave `descontar_por_vencer`; apagado por defecto) y una columna «Por vencer» sólo con la opción prendida: lo de los lotes que
// vencen dentro del horizonte (cobertura + plazo) y no alcanza a venderse antes de vencer, que el motor ya restó del stock que usa para sugerir. Es el mismo patrón que la
// estacionalidad y los dos interruptores conviven. Las órdenes en borrador llevan el mismo valor que se ve.
//
// **Layout (0.110.0, ADR-012):** hallazgos de una verificación con Chromium real. Los tres interruptores son un solo bloque (`flex-wrap`, alineado con los campos); la tabla usa un
// relleno lateral chico y «Sugerido» queda pegado al borde derecho si hay que desplazarla; las notas largas de las celdas angostas (`Nota`) se ven cortas, con el texto completo en
// el `title` y para el lector de pantalla.
//
// **Órdenes en borrador (0.105.0, motor >= 0.34.0, ADR-022):** el botón «Generar órdenes en borrador» (prop `conGenerarOrdenes`: el producto la enciende
// sólo si su motor es >= 0.34.0 y quien mira puede escribir Compras) crea una orden por proveedor habitual con lo que se ve; ver `reposicion-ordenes.tsx`. `rutaDeOrden` lleva a cada orden creada.
//
// **Mínimo por sucursal (0.108.0, ADR-010):** con una sucursal elegida, la fila trae `stock_minimo` ya resuelto y `stock_minimo_propio`: si es `true`, el mínimo
// que se ve es el que ese producto tiene en esa sucursal (se carga en el formulario del producto, «Mínimo por sucursal») y la celda lo dice con texto; si no, es el global.
//
// **Filtros plegables en el celular (0.144.0, ADR-056):** bajo `sm` (640 px) los filtros y parámetros van dentro de un bloque «Filtros y parámetros», plegado por defecto, cuyo
// encabezado resume lo que está activo; desde `sm` se ve el bloque entero, sin botón. Se abre solo si un parámetro tiene error. Y el valor elegido de los tres selects ocupa hasta
// 2 líneas en el celular (`lineasEnMovil`, de `SelectBuscable`).
//
// **Borradores (0.147.0, motor >= 0.59.0, ADR-056 del motor; ADR-059 de libra-ui):** una columna «En borrador» (lo pendiente de las órdenes en borrador, ordenable) y el interruptor
// «Contar borradores como pedidos» (prendido por defecto = lo de siempre: el borrador resta de lo sugerido), ambos sólo si el motor lo maneja (la respuesta trae la clave
// `contar_borradores`). Apagado viaja `contar_borradores=false` en la consulta, el CSV y las órdenes en borrador; prendido no viaja nada (es el default del motor, la consulta no cambia).
// La columna queda en las dos posiciones del interruptor: con él prendido el borrador ya está dentro de «En camino», apagado no.
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
import { AlertTriangle, ChevronDown, Download, FilePlus2, PackagePlus, TrendingDown } from 'lucide-react'
import { nuevaClaveDeOperacion } from './clave-de-operacion'
import { DialogoGenerarOrdenes } from './reposicion-ordenes'
import { borrarIntentoPendiente, leerIntentoPendiente, type IntentoDeOrdenes, type ParametrosDeOrdenes } from './reposicion-ordenes-pendiente'
import { SelectBuscable } from '../SelectBuscable'
import { formatoCantidad } from '../formatos'
import { cn } from '../utils'

const RUTA = '/api/reportes/reposicion'
/** El relleno de las celdas de la tabla (ADR-012): 6 px a los lados en vez de 12: con las 13 columnas (las dos opcionales, Estacional y Por vencer, prendidas) son unos 150 px menos de ancho y la tabla entra en 1440 px sin desplazarse. */
const PAD = 'px-1.5 py-3'
/** «Sugerido», la columna que importa, queda pegada al borde derecho si la tabla se desborda y hay que desplazarla (la pantalla es angosta o hay muchas columnas). */
const FIJA = 'sticky right-0 bg-card'
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

/** Una nota corta a la vista y completa para todo lo demás: el texto largo en una celda angosta se apilaba en 4-7 líneas (ADR-012). A la vista va la forma corta, sin
 *  partirse (`whitespace-nowrap`); el texto completo queda en el `title` (al pasar el mouse) y para el lector de pantalla (`sr-only`), y en el `textContent`.
 *  `relative` es para que el `sr-only` (que es `absolute`) quede dentro del `overflow-x-auto` de la tabla y no agrande el scroll de la página.
 *  Si el completo empieza con la forma corta («no cuenta» / «no cuenta como stock») sólo se oculta lo que sobra; si no, se oculta a los lectores la forma corta y se lee el completo. */
function Nota({ corto, completo, className = '' }: { corto: string; completo: string; className?: string }) {
  const prefijo = completo.startsWith(corto)
  return (
    <span title={completo} className={`${className} relative whitespace-nowrap`}>
      {prefijo
        ? <>{corto}<span className="sr-only">{completo.slice(corto.length)}</span></>
        : <><span aria-hidden="true">{corto}</span><span className="sr-only">{completo}</span></>}
    </span>
  )
}

/** El motivo del rechazo de un parámetro, o `null` si vale: un entero de 1 hasta su tope, como en el motor. */
function errorDelParametro(valor: string, max: number): string | null {
  const n = Number(valor)
  return /^\d+$/.test(valor.trim()) && n >= 1 && n <= max ? null : `Tiene que ser un entero entre 1 y ${max}.`
}

type ClaveOrden =
  | 'nombre' | 'codigo' | 'stock' | 'en_camino' | 'stock_minimo' | 'unidades_vendidas' | 'rotacion_diaria'
  | 'cobertura_dias' | 'sugerido' | 'motivo' | 'proveedor' | 'factor_estacional' | 'por_vencer' | 'en_borrador'

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

const COLUMNA_ESTACIONAL: { orden: ClaveOrden; titulo: string; alinea: 'left' | 'right' } = { orden: 'factor_estacional', titulo: 'Estacional', alinea: 'right' }
const COLUMNA_POR_VENCER: { orden: ClaveOrden; titulo: string; alinea: 'left' | 'right' } = { orden: 'por_vencer', titulo: 'Por vencer', alinea: 'right' }
const COLUMNA_EN_BORRADOR: { orden: ClaveOrden; titulo: string; alinea: 'left' | 'right' } = { orden: 'en_borrador', titulo: 'En borrador', alinea: 'right' }
const COLUMNA_PROVEEDOR: { orden: ClaveOrden; titulo: string; alinea: 'left' | 'right' } = { orden: 'proveedor', titulo: 'Proveedor', alinea: 'left' }

/** Lo que se ordena de cada fila; `null` (sin código, sin cobertura, sin motivo) va siempre al final. */
function valorDeOrden(p: ReposicionProducto, clave: ClaveOrden): number | string | null {
  if (clave === 'motivo') return p.motivo ? etiquetaDelMotivo(p.motivo) : null
  if (clave === 'codigo') return p.codigo || null
  if (clave === 'proveedor') return p.proveedor || null
  if (clave === 'factor_estacional') return p.factor_estacional ?? null
  if (clave === 'por_vencer') return p.por_vencer ?? null
  if (clave === 'en_borrador') return p.en_borrador ?? null
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

/** El nombre completo de la opción elegida, para el `title` del select: el valor se corta con `line-clamp-1` y un nombre largo de sucursal, categoría o proveedor no se leía entero sin abrir la lista. «Todas…» (el valor `TODAS`) no lleva título. */
function tituloDe(valor: string, opciones: [string, string][]): string | undefined {
  return opciones.find(([v]) => v === valor)?.[1]
}

const RESPUESTA_INESPERADA = 'La respuesta del servidor no tiene el formato esperado.'

/** Lo mínimo que lee la pantalla: un objeto con `productos` (lista) y `resumen` (objeto). */
function esReposicion(data: unknown): data is ReposicionData {
  if (typeof data !== 'object' || data === null) return false
  const { productos, resumen } = data as { productos?: unknown; resumen?: unknown }
  return Array.isArray(productos) && typeof resumen === 'object' && resumen !== null
}

/** Lo que se espera tras la última tecla en un parámetro antes de pedirle al motor: sin esto cada dígito tipeado es un pedido. */
const DEMORA_PARAMETROS_MS = 300

export function Reposicion({ conGenerarOrdenes = false, rutaDeOrden }: ReposicionProps = {}) {
  const [valores, setValores] = useState<Record<ClaveParametro, string>>(
    () => Object.fromEntries(PARAMETROS.map((p) => [p.clave, p.defecto])) as Record<ClaveParametro, string>,
  )
  const [sucursal, setSucursal] = useState(TODAS)
  const [categoria, setCategoria] = useState(TODAS)
  const [soloAPedir, setSoloAPedir] = useState(true)
  const [estacionalidad, setEstacionalidad] = useState(false)
  // Una vez que el motor contestó con la clave `estacionalidad` la maneja: se recuerda aunque una consulta posterior falle o venga vacía.
  const [conEstacionalidad, setConEstacionalidad] = useState(false)
  const [descontarPorVencer, setDescontarPorVencer] = useState(false)
  // Igual que `conEstacionalidad`: una vez que el motor contestó con la clave `descontar_por_vencer` la maneja.
  const [conDescontarPorVencer, setConDescontarPorVencer] = useState(false)
  // Prendido por defecto = el comportamiento de siempre del motor (los borradores restan). Sólo se ofrece, y sólo viaja apagado, si el motor lo maneja.
  const [contarBorradores, setContarBorradores] = useState(true)
  // Igual que `conEstacionalidad`: una vez que el motor contestó con la clave `contar_borradores` la maneja.
  const [conContarBorradores, setConContarBorradores] = useState(false)
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
  // Arranca con lo que haya quedado en `sessionStorage` (una recarga o salir y volver no pierde un pedido cortado).
  const [guardado] = useState(leerIntentoPendiente)
  const pendiente = useRef<IntentoDeOrdenes | null>(guardado)
  // Lo mismo que `pendiente`, como estado, para que el botón de reintento aparezca aunque la lista esté vacía o no haya cargado.
  const [clavePendiente, setClavePendiente] = useState<string | null>(guardado?.clave ?? null)
  const hayPendiente = clavePendiente !== null
  // Sube cuando se crean órdenes: la lista se vuelve a pedir (lo creado ya cuenta como «en camino»).
  const [recarga, setRecarga] = useState(0)
  // Lo último que contestó el motor, con la consulta a la que contestó: que `loading` y `error` se deriven de acá
  // (y no de estados sueltos que hay que apagar y prender) evita mostrar el error o la carga de una consulta vieja.
  const [respuesta, setRespuesta] = useState<{ consulta: string; recarga: number; data: ReposicionData | null; error: string | null } | null>(null)

  // Los parámetros que se tipean se piden con demora (DEMORA_PARAMETROS_MS): los selectores y las casillas, no.
  const [valoresPedidos, setValoresPedidos] = useState(valores)
  useEffect(() => {
    if (valoresPedidos === valores) return
    const t = setTimeout(() => setValoresPedidos(valores), DEMORA_PARAMETROS_MS)
    return () => clearTimeout(t)
  }, [valores, valoresPedidos])
  // Mientras los controles van adelante de lo pedido, la tabla de antes (de otros parámetros) no se muestra.
  const demorando = valoresPedidos !== valores

  const errores = Object.fromEntries(PARAMETROS.map((p) => [p.clave, errorDelParametro(valores[p.clave], p.max)])) as
    Record<ClaveParametro, string | null>
  // Se pide sólo si valen los parámetros de ahora y los que se van a mandar.
  const valido = PARAMETROS.every((p) => errores[p.clave] === null)
  const validoPedido = valido && PARAMETROS.every((p) => errorDelParametro(valoresPedidos[p.clave], p.max) === null)

  // Los filtros y parámetros, plegados en el celular (ADR-056); desde `sm` el bloque se ve siempre y el botón no existe. Con un parámetro inválido se abre solo: el motivo
  // de que la tabla no se actualice no puede quedar escondido. Se abre en el momento en que aparece el error (ajuste de estado durante el render, el patrón de React para
  // esto) y no se deriva de él, para que, abierto por el error, se pueda cerrar a mano sin que vuelva a abrirse hasta que haya un error nuevo.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [conErrorDeParametro, setConErrorDeParametro] = useState(false)
  if (conErrorDeParametro === valido) {
    setConErrorDeParametro(!valido)
    if (!valido) setFiltrosAbiertos(true)
  }

  // Una sola forma de armar la consulta para el JSON y para el CSV. `null` con un parámetro inválido: no se pide.
  const consulta = useMemo(() => {
    // Con los controles adelante de lo pedido tampoco se pide: sería repetir la consulta de antes.
    if (!validoPedido || demorando) return null
    const q = new URLSearchParams({
      dias_rotacion: String(Number(valoresPedidos.dias_rotacion)),
      dias_cobertura: String(Number(valoresPedidos.dias_cobertura)),
      plazo_entrega_dias: String(Number(valoresPedidos.plazo_entrega_dias)),
      solo_a_pedir: String(soloAPedir),
      ...(estacionalidad ? { estacionalidad: 'true' } : {}),
      ...(descontarPorVencer ? { descontar_por_vencer: 'true' } : {}),
      ...(contarBorradores ? {} : { contar_borradores: 'false' }),
    })
    if (sucursal !== TODAS) q.set('sucursal_id', sucursal)
    if (categoria !== TODAS) q.set('categoria', categoria)
    if (proveedor !== TODAS) q.set('proveedor_id', proveedor)
    return q.toString()
  }, [validoPedido, demorando, valoresPedidos, soloAPedir, estacionalidad, descontarPorVencer, contarBorradores, sucursal, categoria, proveedor])

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
        // Una respuesta que no es lo que el motor promete (un proxy, otra versión) no se pinta: la tabla leería `resumen` y `productos`.
        if (!esReposicion(data)) {
          setRespuesta({ consulta, recarga, data: null, error: RESPUESTA_INESPERADA })
          return
        }
        setRespuesta({ consulta, recarga, data, error: null })
        if (data && typeof data === 'object' && 'proveedor_id' in data) setConProveedor(true)
        if (data && typeof data === 'object' && 'estacionalidad' in data) setConEstacionalidad(true)
        if (data && typeof data === 'object' && 'descontar_por_vencer' in data) setConDescontarPorVencer(true)
        if (data && typeof data === 'object' && 'contar_borradores' in data) setConContarBorradores(true)
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
    ...(estacionalidad ? { estacionalidad: true } : {}),
    ...(descontarPorVencer ? { descontar_por_vencer: true } : {}),
    ...(contarBorradores ? {} : { contar_borradores: false }),
  }
  const conColumnaEstacional = data?.estacionalidad === true
  // Un motor que contesta el eco pero no manda `por_vencer` en las filas no tiene qué mostrar: sin columna (y sin romper).
  const conColumnaPorVencer = data?.descontar_por_vencer === true && data.productos.some((p) => typeof p.por_vencer === 'number')
  // Un motor que contesta el eco pero no manda `en_borrador` en las filas no tiene qué mostrar: sin columna (y sin romper).
  const conColumnaEnBorrador = typeof data?.contar_borradores === 'boolean' && data.productos.some((p) => typeof p.en_borrador === 'number')
  const conProveedorEnBase = conProveedor ? [...COLUMNAS.slice(0, 2), COLUMNA_PROVEEDOR, ...COLUMNAS.slice(2)] : COLUMNAS
  const conPorVencerEnBase = conColumnaPorVencer ? conProveedorEnBase.flatMap((c) => (c.orden === 'stock' ? [c, COLUMNA_POR_VENCER] : [c])) : conProveedorEnBase
  const base = conColumnaEnBorrador ? conPorVencerEnBase.flatMap((c) => (c.orden === 'en_camino' ? [c, COLUMNA_EN_BORRADOR] : [c])) : conPorVencerEnBase
  const columnas = conColumnaEstacional ? [...base.slice(0, base.findIndex((c) => c.orden === 'sugerido')), COLUMNA_ESTACIONAL, ...base.slice(base.findIndex((c) => c.orden === 'sugerido'))] : base
  // Lo que dice la ayuda son los controles, que son también lo que muestra la tabla (sólo se muestra la de esta consulta).
  const horizonte = valido ? Number(valores.dias_cobertura) + Number(valores.plazo_entrega_dias) : null
  // El nombre completo de lo elegido en cada select: va al `title` y al resumen del bloque plegado. `undefined` con «todas».
  const tituloSucursal = tituloDe(sucursal, sucursales.map((x) => [String(x.id), x.nombre]))
  const tituloCategoria = tituloDe(categoria, categorias.map((x) => [x.nombre, x.nombre]))
  const tituloProveedor = tituloDe(proveedor, proveedores.map((x) => [String(x.id), x.nombre]))
  // Lo activo, en una o dos líneas, para el encabezado del bloque plegado: lo que acota la lista (o «Toda la instancia» si nada la acota), el horizonte (cobertura + plazo, sólo si los
  // dos valen) y las casillas prendidas. Una casilla que el motor no maneja no se nombra aunque haya quedado prendida.
  const alcance = [tituloSucursal, tituloCategoria, tituloProveedor].filter((t): t is string => t !== undefined)
  const resumenDeFiltros = [
    ...(alcance.length > 0 ? alcance : ['Toda la instancia']),
    ...(valido ? [`${Number(valores.dias_cobertura)} + ${Number(valores.plazo_entrega_dias)} días`] : []),
    ...(soloAPedir ? ['Sólo lo que hay que pedir'] : []),
    ...(conEstacionalidad && estacionalidad ? ['Ajustar por estacionalidad'] : []),
    ...(conDescontarPorVencer && descontarPorVencer ? ['Descontar lo que vence en el horizonte'] : []),
    ...(conContarBorradores && !contarBorradores ? ['Sin contar borradores'] : []),
  ].join(' · ')

  return (
    <div className="grid gap-4">
      <TituloPantalla icono={PackagePlus}>Reposición sugerida</TituloPantalla>

      <button
        type="button" aria-expanded={filtrosAbiertos} aria-controls="reposicion-filtros" onClick={() => setFiltrosAbiertos((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-left outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:hidden"
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm font-medium">Filtros y parámetros</span>
          <span className="line-clamp-2 break-words text-xs text-muted-foreground">{resumenDeFiltros}</span>
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground', filtrosAbiertos && 'rotate-180')} />
      </button>

      {/* Cerrado, sólo se oculta bajo `sm`: `hidden` saca el bloque del orden de foco y del árbol de accesibilidad, y `sm:flex` lo devuelve en pantallas anchas sin medir nada con JS. */}
      <div id="reposicion-filtros" className={cn('flex-wrap items-start gap-3 sm:flex', filtrosAbiertos ? 'flex' : 'hidden')}>
        {sucursales.length > 0 && (
          <div className="grid w-full gap-2 sm:w-auto">
            <Label htmlFor="reposicion-sucursal">Sucursal</Label>
            <SelectBuscable
              id="reposicion-sucursal"
              value={sucursal}
              onChange={setSucursal}
              opciones={[
                { value: TODAS, label: 'Toda la instancia' },
                ...sucursales.map((s) => ({ value: String(s.id), label: s.nombre })),
              ]}
              limpiable={false}
              title={tituloSucursal}
              lineasEnMovil={2}
              className="w-full min-w-0 sm:w-64"
            />
          </div>
        )}
        {categorias.length > 0 && (
          <div className="grid w-full gap-2 sm:w-auto">
            <Label htmlFor="reposicion-categoria">Categoría</Label>
            <SelectBuscable
              id="reposicion-categoria"
              value={categoria}
              onChange={setCategoria}
              opciones={[
                { value: TODAS, label: 'Todas las categorías' },
                ...categorias.map((c) => ({ value: c.nombre, label: c.nombre })),
              ]}
              limpiable={false}
              title={tituloCategoria}
              lineasEnMovil={2}
              className="w-full min-w-0 sm:w-64"
            />
          </div>
        )}
        {conProveedor && proveedores.length > 0 && (
          <div className="grid w-full gap-2 sm:w-auto">
            <Label htmlFor="reposicion-proveedor">Proveedor</Label>
            <SelectBuscable
              id="reposicion-proveedor"
              value={proveedor}
              onChange={setProveedor}
              opciones={[
                { value: TODAS, label: 'Todos los proveedores' },
                ...proveedores.map((p) => ({ value: String(p.id), label: p.nombre })),
              ]}
              limpiable={false}
              title={tituloProveedor}
              lineasEnMovil={2}
              className="w-full min-w-0 sm:w-64"
            />
          </div>
        )}
        {PARAMETROS.map((p) => (
          <div key={p.clave} className="grid gap-2">
            <Label htmlFor={`reposicion-${p.clave}`}>{p.etiqueta}</Label>
            <Input
              id={`reposicion-${p.clave}`} type="number" inputMode="numeric" min={1} max={p.max} step={1}
              value={valores[p.clave]} className="w-40 max-sm:h-11"
              aria-invalid={errores[p.clave] !== null} aria-describedby={errores[p.clave] ? `reposicion-${p.clave}-error` : undefined}
              onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))}
            />
            {errores[p.clave] && (
              <p id={`reposicion-${p.clave}-error`} role="alert" className="max-w-40 text-xs text-destructive">{errores[p.clave]}</p>
            )}
          </div>
        ))}
        {/* Los tres interruptores juntos (ADR-012): un solo bloque que salta de línea entero y se alinea con los campos (el rótulo invisible de arriba hace de la
            fila de rótulos de los campos); adentro, `flex-wrap` con huecos parejos, sin paddings sueltos que desalineen unos de otros. */}
        <div className="grid gap-2">
          <span aria-hidden="true" className="invisible hidden text-sm leading-none sm:block">&nbsp;</span>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <label className="flex min-h-9 items-center gap-2 text-sm max-sm:min-h-11 sm:whitespace-nowrap">
              <input type="checkbox" checked={soloAPedir} onChange={(e) => setSoloAPedir(e.target.checked)} className="size-4 shrink-0" />
              Sólo lo que hay que pedir
            </label>
            {conEstacionalidad && (
              <label className="flex min-h-9 items-center gap-2 text-sm max-sm:min-h-11 sm:whitespace-nowrap" title="Proyecta con lo que pasó hace un año: lo que se vendió después de una ventana como la de ahora">
                <input type="checkbox" checked={estacionalidad} onChange={(e) => {
                  setEstacionalidad(e.target.checked)
                  // Al apagarlo la columna desaparece: un orden por ella quedaría activo sin que se vea (y sin su flecha).
                  if (!e.target.checked && orden?.clave === 'factor_estacional') setOrden(null)
                }} className="size-4 shrink-0" />
                Ajustar por estacionalidad
              </label>
            )}
            {conDescontarPorVencer && (
              <div className="grid max-w-xs">
                <label className="flex min-h-9 items-center gap-2 text-sm max-sm:min-h-11 sm:whitespace-nowrap">
                  <input type="checkbox" checked={descontarPorVencer} aria-describedby="reposicion-por-vencer-ayuda" onChange={(e) => {
                    setDescontarPorVencer(e.target.checked)
                    // Al apagarlo la columna desaparece: un orden por ella quedaría activo sin que se vea (y sin su flecha).
                    if (!e.target.checked && orden?.clave === 'por_vencer') setOrden(null)
                  }} className="size-4 shrink-0" />
                  Descontar lo que vence en el horizonte
                </label>
                <p id="reposicion-por-vencer-ayuda" className="text-xs text-muted-foreground">Lo que no se alcanza a vender antes de vencer no cuenta como stock.</p>
              </div>
            )}
            {conContarBorradores && (
              <div className="grid max-w-xs">
                <label className="flex min-h-9 items-center gap-2 text-sm max-sm:min-h-11 sm:whitespace-nowrap">
                  <input type="checkbox" checked={contarBorradores} aria-describedby="reposicion-borradores-ayuda" onChange={(e) => setContarBorradores(e.target.checked)} className="size-4 shrink-0" />
                  Contar borradores como pedidos
                </label>
                <p id="reposicion-borradores-ayuda" className="text-xs text-muted-foreground">Una orden en borrador todavía no se mandó al proveedor. Apagado, no resta de lo sugerido.</p>
              </div>
            )}
          </div>
        </div>
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
        para llegar. Lo que está en lotes vencidos no cuenta como stock{descontarPorVencer && data?.descontar_por_vencer === true
          ? `, ni lo que vence dentro del horizonte${horizonte !== null ? ` (${horizonte} días)` : ''} y no se alcanza a vender antes de vencer`
          : ''}.{!contarBorradores && data?.contar_borradores === false
          ? ' Las órdenes en borrador no se cuentan como pedidas: se ven aparte, en «En borrador».'
          : ''} Sólo sugiere: no genera ninguna orden de compra.
      </p>

      {valido && error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!valido ? (
        <p role="status" className="py-6 text-center text-sm text-muted-foreground">Corregí los parámetros para ver la sugerencia.</p>
      ) : !data ? (
        loading && <p role="status" className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0">
            {/* Dos hijos y no cuatro: con el icono, el número y «producto» sueltos dentro del flex cada pedazo era una columna y «1 producto» se partía en dos líneas (390 px). */}
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
              <span className="flex items-center gap-2 whitespace-nowrap">
                <TrendingDown className="size-4 shrink-0 text-primary" />
                {data.resumen.productos} producto{data.resumen.productos !== 1 ? 's' : ''}
              </span>
              {data.resumen.productos > 0 && (
                <span className="text-sm font-normal leading-snug text-muted-foreground">
                  {'· '}{data.resumen.a_pedir} a pedir · {data.resumen.posible_quiebre} con posible quiebre · {data.resumen.sin_ventas} sin ventas
                </span>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {orden && (
                <Button size="sm" variant="outline" onClick={() => setOrden(null)}>Orden por urgencia</Button>
              )}
              {conGenerarOrdenes && (
                <Button size="sm" onClick={() => setGenerando(pendiente.current ?? { clave: nuevaClaveDeOperacion(), filas: data.productos, parametros: parametrosDeOrdenes })} disabled={data.productos.length === 0}>
                  <FilePlus2 />Generar órdenes en borrador
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <a href={`${RUTA}/export?${consulta}${orden ? `&orden=${orden.clave}&sentido=${orden.sentido === 1 ? 'asc' : 'desc'}` : ''}`}><Download />CSV</a>
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
                          className={`${PAD} font-medium ${c.alinea === 'right' ? 'text-right' : 'text-left'} ${c.orden === 'sugerido' ? FIJA : ''}`}
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
                        <td className={PAD}>
                          <span className="font-medium">{p.nombre}</span>
                          {p.categoria && <span className="ml-2 text-xs text-muted-foreground">{p.categoria}</span>}
                          {(p.sin_ventas || p.posible_quiebre) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.sin_ventas && (
                                <Badge variant="outline"><Nota corto="Sin ventas" completo="Sin ventas en la ventana" /></Badge>
                              )}
                              {p.posible_quiebre && (
                                <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                                  <AlertTriangle aria-hidden="true" /><Nota corto="Posible quiebre" completo="Posible quiebre: la rotación puede estar subestimada" />
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={`${PAD} whitespace-nowrap`}>{p.codigo || '—'}</td>
                        {conProveedor && <td className={PAD}>{p.proveedor || '—'}</td>}
                        <td className={`${PAD} text-right ${p.stock <= 0 ? 'text-destructive' : ''}`}>
                          {formatoCantidad(p.stock)}
                          {(p.vencido ?? 0) > 0 && (
                            <Nota
                              className="block text-xs text-amber-600 dark:text-amber-400"
                              corto={`incl. ${formatoCantidad(p.vencido ?? 0)} vencido`} completo={`incluye ${formatoCantidad(p.vencido ?? 0)} vencido, que no se cuenta para pedir`}
                            />
                          )}
                        </td>
                        {conColumnaPorVencer && (
                          <td className={`${PAD} text-right`} title={(p.por_vencer ?? 0) > 0 ? 'Vence dentro del horizonte y no se alcanza a vender: no cuenta como stock' : undefined}>
                            {(p.por_vencer ?? 0) > 0 ? formatoCantidad(p.por_vencer ?? 0) : '—'}
                            {(p.por_vencer ?? 0) > 0 && <Nota className="block text-xs text-amber-600 dark:text-amber-400" corto="no cuenta" completo="no cuenta como stock" />}
                          </td>
                        )}
                        <td className={`${PAD} text-right`}>
                          {formatoCantidad(p.en_camino)}
                          {data.sucursal_id !== null && p.en_camino_sin_sucursal > 0 && (
                            <Nota
                              className="block text-xs text-amber-600 dark:text-amber-400"
                              corto={`incl. ${formatoCantidad(p.en_camino_sin_sucursal)} sin sucursal`}
                              completo={`incluye ${formatoCantidad(p.en_camino_sin_sucursal)} de órdenes sin sucursal, contadas en esta sucursal`}
                            />
                          )}
                        </td>
                        {conColumnaEnBorrador && (
                          <td className={`${PAD} text-right`}>
                            {(p.en_borrador ?? 0) > 0 ? formatoCantidad(p.en_borrador ?? 0) : '—'}
                            {(p.en_borrador ?? 0) > 0 && (data.contar_borradores
                              ? <Nota className="block text-xs text-muted-foreground" corto="ya contado" completo="ya contado en «En camino»: resta de lo sugerido" />
                              : <Nota className="block text-xs text-amber-600 dark:text-amber-400" corto="no resta" completo="no resta de lo sugerido: todavía no se mandó al proveedor" />)}
                          </td>
                        )}
                        <td className={`${PAD} text-right`}>
                          {formatoCantidad(p.stock_minimo)}
                          {data.sucursal_id !== null && p.stock_minimo_propio === true && (
                            <Nota className="block text-xs text-muted-foreground" corto="propio" completo="propio de la sucursal" />
                          )}
                        </td>
                        <td className={`${PAD} text-right`}>{formatoCantidad(p.unidades_vendidas)}</td>
                        <td className={`${PAD} text-right`}>{formatoCantidad(p.rotacion_diaria)}</td>
                        <td className={`${PAD} text-right`}>{p.cobertura_dias === null ? '—' : formatoCantidad(p.cobertura_dias)}</td>
                        {conColumnaEstacional && (
                          <td className={`${PAD} text-right`} title={p.factor_estacional == null ? 'Sin historia de hace un año: no se ajustó' : undefined}>
                            {p.factor_estacional == null ? '—' : `×${formatoCantidad(p.factor_estacional)}`}
                          </td>
                        )}
                        <td className={`${PAD} text-right font-semibold ${FIJA}`}>
                          {formatoCantidad(p.sugerido)}{p.unidad && <> <span className="text-xs font-normal text-muted-foreground">{p.unidad}</span></>}
                        </td>
                        <td className={PAD}>{etiquetaDelMotivo(p.motivo)}</td>
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
          reanudado={clavePendiente === generando.clave}
          rutaDeOrden={rutaDeOrden}
          onCerrar={() => setGenerando(null)}
          onCreadas={() => setRecarga((n) => n + 1)}
          onEstado={(estado) => {
            pendiente.current = estado === 'incierto' ? generando : null
            if (estado === 'definitivo') borrarIntentoPendiente()
            setClavePendiente(estado === 'incierto' ? generando.clave : null)
          }}
          onDescartar={() => {
            pendiente.current = null
            borrarIntentoPendiente()
            setClavePendiente(null)
            if (data) setGenerando({ clave: nuevaClaveDeOperacion(), filas: data.productos, parametros: parametrosDeOrdenes })
            else setGenerando(null)
          }}
        />
      )}
    </div>
  )
}


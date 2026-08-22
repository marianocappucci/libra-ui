// Extraído 2026-08-06 de LibraDesk, donde nació el día anterior, al ir a
// repetirlo en Gestiolibra, MedLibra y VentaLibra: la pantalla es la misma en
// los cuatro porque **el backend le manda hasta la lista de entidades y los
// colores de cada acción** — no hay nada del dominio de un producto acá
// adentro. El backend que la alimenta es
// `libraauth.auditoria.build_logs_router()`.
//
// ## 2026-08-22 — la consola queda normalizada contra la de Contalibra
//
// Había dos consolas de Logs en la familia: ésta (LibraDesk, MedLibra,
// Gestiolibra, VentaLibra, LibraClub) y la copia propia de Contalibra y
// Restolibra, que alimenta otro backend. Se veían distinto en todo: la fecha,
// el paginador, los filtros, los estados vacíos y la mitad de los accesos.
//
// **La referencia visual es la de Contalibra** y las directrices que se
// adoptan acá son cinco:
//
// 1. **La actividad se agrupa por día**, con un separador que dice la fecha una
//    vez, y la fila pasa a mostrar sólo la hora. Antes cada fila repetía
//    `05-08 14:32`: la fecha cien veces por página para leer, en realidad, la
//    hora.
// 2. **La acción se filtra con las píldoras de color**, no con un `select`.
//    El backend ya manda `{label, color}` por acción — el color estaba
//    dibujado en el badge de cada fila pero no se podía usar para filtrar.
// 3. **El paginador dice cuánto se está viendo** ("Mostrando 100 de 2.480") y
//    navega con flechas, en vez de dos botones que no dicen dónde estás.
// 4. **Los estados vacíos son un icono y una frase centrados**, no una celda
//    de tabla con texto.
// 5. **Los accesos son una lista, no una tabla.** Son cuatro datos por
//    renglón; una tabla con encabezados para eso es andamiaje de más.
//
// Lo que NO se copió de Contalibra, y por qué:
//
// - **El botón "Exportar CSV".** `build_logs_router()` no tiene endpoint de
//   exportación: el botón daría 404 en los cinco productos. Es una pantalla
//   distinta de la que se puede hacer acá.
// - **El filtro multi-valor.** Las píldoras de Contalibra seleccionan varios
//   tipos a la vez; acá el router recibe `accion: str = ""` (un solo valor).
//   Las píldoras filtran de a una —tocar la activa vuelve a "todas"—, que es
//   lo que el backend sabe contestar. Hacerlo multi-valor es un cambio de
//   libraauth y de sus cinco consumidores, no de esta pantalla.
//
// Y lo que se conserva de acá y Contalibra no tiene: **la fila desplegable con
// el antes/después**. Es lo que hace que "editado" diga qué se editó. El log
// de Contalibra es una línea de tiempo de ventas, caja y stock, sin diff campo
// por campo: allá el acordeón se abriría vacío, así que no se le puso.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api-client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  BookText, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Inbox, LogIn,
  LogOut, Shield, ShieldAlert,
} from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { TituloPantalla } from './titulo-pantalla'

const TODOS = '__todos__'

export type ActividadLog = {
  id: number
  ts: string
  usuario: string
  accion: string
  entidad: string
  entidad_id: number | null
  descripcion: string
  // `{columna: [antes, despues]}`. Null en altas y bajas: ahí no hay diff que
  // mostrar, la fila entera es la novedad.
  cambios: Record<string, [unknown, unknown]> | null
}

export type AccesoLog = {
  id: number
  ts: string
  evento: 'login' | 'logout' | 'login_fallido' | string
  username: string
  ip: string
  detalle: string
}

export type LogsData = {
  actividad: ActividadLog[]
  total: number
  total_pages: number
  page: number
  entidades: string[]
  acciones: Record<string, { label: string; color: string }>
  usuarios: string[]
  accesos: AccesoLog[]
}

/** Badge lleno y no icono suelto, igual que Contalibra: el evento de acceso es
 *  una etiqueta ("qué pasó"), y en una lista sin columnas un icono a secas se
 *  pierde entre el nombre de usuario y la IP. */
const EVENTO_META: Record<string, { label: string; icon: typeof LogIn; className: string }> = {
  login: { label: 'Ingreso', icon: LogIn, className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  logout: { label: 'Salida', icon: LogOut, className: 'bg-muted-foreground text-white hover:bg-muted-foreground' },
  login_fallido: { label: 'Intento fallido', icon: ShieldAlert, className: 'bg-destructive text-white hover:bg-destructive' },
}

/** `2026-08-05 14:32:10` → `["05-08-2026", "14:32:10"]`.
 *
 *  Un `ts` que no tenga esa forma se devuelve entero como fecha y sin hora, en
 *  vez de recortarse a ciegas: `slice(11, 19)` sobre un texto corto devuelve
 *  la cadena vacía, que en pantalla es una celda en blanco que parece un dato
 *  faltante en vez de un formato inesperado.
 *
 *  El separador es el GUION: el formato visible del ecosistema es
 *  `dd-mm-aaaa`, y este componente lo consumen los seis productos. */
const FORMA_TS = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/

function partirTs(ts: string): { fecha: string; hora: string } {
  const m = FORMA_TS.exec(ts)
  if (!m) return { fecha: ts, hora: '—' }
  return { fecha: `${m[3]}-${m[2]}-${m[1]}`, hora: m[4] }
}

function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  return String(v)
}

/** Las columnas que cambiaron, una por línea. Se muestra sólo al desplegar:
 *  en la fila va el qué y el quién, que es lo que se escanea. */
function Cambios({ cambios }: { cambios: Record<string, [unknown, unknown]> }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {Object.entries(cambios).map(([campo, [antes, despues]]) => (
          <tr key={campo} className="border-b last:border-0">
            <td className="py-1 pr-3 font-medium text-muted-foreground">{campo}</td>
            <td className="py-1 pr-2 text-muted-foreground line-through">{valor(antes)}</td>
            <td className="py-1 font-medium">{valor(despues)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** El estado vacío de las dos pestañas: un icono y una frase, centrados.
 *  Directriz de Contalibra — una celda de tabla con texto adentro se lee como
 *  una fila más, y lo que hay que comunicar es que no hay filas. */
function SinDatos({ icono: Icono, children }: {
  icono: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Icono className="size-6" />{children}
    </p>
  )
}

/**
 * Logs — admin-only, gateado también en el backend (`require_admin`).
 *
 * **Dos pestañas y no dos tablas apiladas** (desde el 2026-08-19): la actividad
 * del sistema y los accesos son dos preguntas distintas ("quién borró esto" /
 * "quién entró"), se filtran distinto y se miran en momentos distintos.
 * Apiladas, para llegar a los accesos había que scrollear las 100 filas de la
 * página de actividad, así que la mitad de abajo se veía por accidente.
 * Contalibra y Restolibra, que tienen su propia copia de esta pantalla, las
 * muestran igual.
 *
 * Los filtros son de la actividad y por eso viven adentro de su pestaña: no
 * aplican a los accesos, que llegan enteros en la misma respuesta.
 *
 * La actividad la escribe el `flush` de SQLAlchemy, así que **no hay nada que
 * activar por entidad**: lo que aparece acá es todo lo que el sistema escribió.
 *
 * `basePath` es la ruta del router de logs en el backend. El default `/logs`
 * es el de Gestiolibra/MedLibra/VentaLibra; LibraDesk monta el suyo bajo
 * `/api/logs` y pasa esa ruta explícita — mismo criterio que `Usuarios`.
 */
export function Logs({ basePath = '/logs', icono }: {
  basePath?: string
  /** El icono del sidebar de este producto. Obligatorio: ver `Usuarios`. */
  icono: ComponentType<{ className?: string }>
}) {
  const [data, setData] = useState<LogsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [abierta, setAbierta] = useState<number | null>(null)

  const [entidad, setEntidad] = useState(TODOS)
  const [accion, setAccion] = useState(TODOS)
  const [usuario, setUsuario] = useState(TODOS)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ page: String(page) })
    if (entidad !== TODOS) qs.set('entidad', entidad)
    if (accion !== TODOS) qs.set('accion', accion)
    if (usuario !== TODOS) qs.set('usuario', usuario)
    if (desde) qs.set('desde', desde)
    if (hasta) qs.set('hasta', hasta)
    try {
      setData(await api.get<LogsData>(`${basePath}?${qs}`))
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Error de conexión.')
    } finally {
      setLoading(false)
    }
  }, [basePath, page, entidad, accion, usuario, desde, hasta])

  useEffect(() => { void cargar() }, [cargar])

  // Cualquier filtro nuevo vuelve a la página 1: quedarse en la 4 de un
  // resultado que ahora tiene 2 muestra una tabla vacía que parece un error.
  function filtrar(set: (v: string) => void) {
    return (v: string) => { set(v); setPage(1); setAbierta(null) }
  }

  function limpiarFiltros() {
    setPage(1)
    setAbierta(null)
    setEntidad(TODOS)
    setAccion(TODOS)
    setUsuario(TODOS)
    setDesde('')
    setHasta('')
  }

  // Un grupo por día, en el orden en que vienen las filas. El backend las manda
  // ordenadas por `ts` descendente, así que basta con cortar cuando cambia la
  // fecha: agrupar con un `Map` reordenaría los días si alguna vez dejaran de
  // venir contiguos, que es peor que mostrar dos grupos con la misma fecha.
  const grupos = useMemo(() => {
    const out: { fecha: string; filas: ActividadLog[] }[] = []
    for (const fila of data?.actividad ?? []) {
      const { fecha } = partirTs(fila.ts)
      const ultimo = out[out.length - 1]
      if (ultimo && ultimo.fecha === fecha) ultimo.filas.push(fila)
      else out.push({ fecha, filas: [fila] })
    }
    return out
  }, [data])

  const sinFiltros = entidad === TODOS && accion === TODOS && usuario === TODOS && !desde && !hasta

  if (loading && !data) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
  }
  if (error && !data) {
    return <p className="py-6 text-center text-sm text-destructive">{error}</p>
  }
  if (!data) return null

  return (
    <div className="grid gap-4">
      <TituloPantalla icono={icono}>Logs</TituloPantalla>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="actividad" className="gap-4">
        {/* El nombre de la pestaña ES el título de la sección: repetirlo en un
            `CardHeader` adentro sería decir lo mismo dos veces a un renglón de
            distancia. Los rótulos y los iconos son los de Contalibra. */}
        <TabsList>
          <TabsTrigger value="actividad">
            <BookText className="size-4" />Actividad del sistema
          </TabsTrigger>
          <TabsTrigger value="accesos">
            <Shield className="size-4" />Accesos de usuarios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actividad" className="grid gap-4">
          <Card>
            <CardContent className="grid gap-4">
              {/* Las píldoras de acción: el color lo manda el backend, es el
                  mismo con el que se pinta el badge de cada fila. La que no
                  está elegida baja a 0.4 de opacidad — sin nada elegido están
                  todas enteras, que es el estado "todas". */}
              <div className="grid gap-2">
                <Label>Acción</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.acciones).map(([id, meta]) => {
                    const elegida = accion === TODOS || accion === id
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={accion === id}
                        onClick={() => filtrar(setAccion)(accion === id ? TODOS : id)}
                        className="rounded-full transition-opacity"
                        style={{ opacity: elegida ? 1 : 0.4 }}
                      >
                        <Badge style={{ backgroundColor: meta.color }} className="cursor-pointer gap-1 text-white hover:opacity-90">
                          {meta.label}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                {/* `htmlFor` + `id` en el trigger: sin eso el `Label` queda suelto
                    y un lector de pantalla anuncia el select sin nombre. */}
                <div className="grid gap-2">
                  <Label htmlFor="filtro-entidad">Entidad</Label>
                  <Select value={entidad} onValueChange={filtrar(setEntidad)}>
                    <SelectTrigger id="filtro-entidad" className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todas</SelectItem>
                      {data.entidades.map((e) => (
                        <SelectItem key={e} value={e}>{e.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="filtro-usuario">Usuario</Label>
                  <Select value={usuario} onValueChange={filtrar(setUsuario)}>
                    <SelectTrigger id="filtro-usuario" className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos</SelectItem>
                      {data.usuarios.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="desde">Desde</Label>
                  <Input id="desde" type="date" className="w-40" value={desde}
                    onChange={(e) => filtrar(setDesde)(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hasta">Hasta</Label>
                  <Input id="hasta" type="date" className="w-40" value={hasta}
                    onChange={(e) => filtrar(setHasta)(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={limpiarFiltros}>Limpiar</Button>
              </div>
            </CardContent>
          </Card>

          {/* Cuánto se está viendo y de cuánto, arriba de la tabla: la
              directriz de Contalibra es que el paginador diga dónde estás, no
              sólo cómo moverte. Va siempre, aunque haya una sola página — con
              una sola página lo que informa es el total. */}
          <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
            <span>
              Mostrando <strong className="text-foreground">{data.actividad.length}</strong>
              {' '}de <strong className="text-foreground">{data.total}</strong> registros
            </span>
            <div className="flex items-center gap-2">
              {/* `aria-label` y no sólo el icono: un botón cuyo único contenido
                  es un `svg` no tiene nombre accesible, y el paginador de una
                  pantalla de admin es de lo primero que se navega por teclado. */}
              <Button size="icon" variant="outline" className="size-7" aria-label="Anterior"
                disabled={data.page <= 1}
                onClick={() => { setPage((p) => p - 1); setAbierta(null) }}><ChevronLeft /></Button>
              <span>Pág {data.page} / {data.total_pages}</span>
              <Button size="icon" variant="outline" className="size-7" aria-label="Siguiente"
                disabled={data.page >= data.total_pages}
                onClick={() => { setPage((p) => p + 1); setAbierta(null) }}><ChevronRight /></Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {data.actividad.length === 0 ? (
                <SinDatos icono={Inbox}>
                  {sinFiltros
                    ? 'Todavía no hay actividad registrada.'
                    : 'No hay actividad con esos filtros.'}
                </SinDatos>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <th className="w-8 p-3" />
                        <th className="w-24 p-3 text-left font-medium">Hora</th>
                        <th className="w-32 p-3 text-left font-medium">Acción</th>
                        <th className="p-3 text-left font-medium">Qué</th>
                        <th className="w-40 p-3 text-left font-medium">Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.map((g) => (
                        <Fragment key={g.fecha}>
                          <tr className="bg-muted/50">
                            <td colSpan={5} className="px-3 py-1.5">
                              <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                <CalendarDays className="size-3.5" />{g.fecha}
                              </span>
                            </td>
                          </tr>
                          {g.filas.map((fila) => {
                            const meta = data.acciones[fila.accion]
                            const tieneCambios = fila.cambios !== null && Object.keys(fila.cambios).length > 0
                            const desplegada = abierta === fila.id
                            return (
                              <Fragment key={fila.id}>
                                <tr
                                  className={`border-b last:border-0 ${tieneCambios ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                                  onClick={() => tieneCambios && setAbierta(desplegada ? null : fila.id)}
                                >
                                  <td className="p-3 text-muted-foreground">
                                    {tieneCambios && (
                                      <ChevronDown
                                        className={`size-4 transition-transform ${desplegada ? '' : '-rotate-90'}`}
                                      />
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap p-3 font-mono text-xs text-muted-foreground" title={fila.ts}>
                                    {partirTs(fila.ts).hora}
                                  </td>
                                  <td className="p-3">
                                    <Badge style={meta ? { backgroundColor: meta.color } : undefined}
                                      className={meta ? 'text-white' : undefined}
                                      variant={meta ? undefined : 'outline'}>
                                      {meta?.label ?? fila.accion}
                                    </Badge>
                                  </td>
                                  <td className="p-3">
                                    {fila.descripcion}
                                    {fila.entidad_id !== null && (
                                      <span className="ml-1 text-xs text-muted-foreground">#{fila.entidad_id}</span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap p-3">{fila.usuario}</td>
                                </tr>
                                {desplegada && fila.cambios && (
                                  <tr className="border-b bg-muted/20 last:border-0">
                                    <td />
                                    <td colSpan={4} className="p-3"><Cambios cambios={fila.cambios} /></td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accesos">
          <Card>
            {/* Sin título: lo dice la pestaña. Lo que no dice la pestaña es
                hasta dónde llega la lista, y eso sí va. */}
            <CardHeader className="flex items-center justify-end space-y-0">
              <span className="text-xs text-muted-foreground">Últimos 100 eventos</span>
            </CardHeader>
            <CardContent className="p-0">
              {data.accesos.length === 0 ? (
                <SinDatos icono={Shield}>Todavía no hay accesos registrados.</SinDatos>
              ) : (
                <ul className="divide-y">
                  {data.accesos.map((a) => {
                    const meta = EVENTO_META[a.evento]
                    const Icono = meta?.icon ?? Shield
                    const { fecha, hora } = partirTs(a.ts)
                    return (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <Badge className={`gap-1 ${meta?.className ?? ''}`}>
                            <Icono className="size-3.5" />{meta?.label ?? a.evento}
                          </Badge>
                          <span className="font-medium">{a.username}</span>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {a.ip || '—'} · {hora === '—' ? fecha : `${fecha} ${hora}`}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// La barra de estado del pie (ADR-083): una línea chica abajo del contenido con LibraEdge, el usuario y la sucursal, el
// certificado de ARCA, el último respaldo y la versión. La lógica (la consulta compartida y los textos) está en
// `estado-del-sistema.ts`; el motor es `GET /api/estado-del-sistema` (libracore ADR-075).
//
// - **Discreta:** `text-xs`, gris; sólo lo que pide atención toma el color de estado del kit (los mismos tonos que
//   `badge-estado.tsx`: ámbar 800 y rojo 700, que pasan AA sobre el fondo). El certificado al día no se muestra en la
//   línea, sólo en el detalle.
// - **En el celular** (menos de 640 px) cada parte queda en su ícono y el texto pasa a `sr-only`: el lector de pantalla
//   lo sigue leyendo. Tocar la barra abre el detalle arriba de ella.
// - **Accesible:** es un botón con `aria-expanded` que abre una región con nombre; Escape la cierra y devuelve el foco.
// - Sin la ruta en el producto (404) o sin permiso, no dibuja nada.
import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { ChevronUp, DatabaseBackup, Info, ShieldAlert, UserRound, WifiOff } from 'lucide-react'

import {
  TEXTO_POR_NIVEL, detalleArca, detalleLibraEdge, detalleRespaldo, partesLibraEdge, textoArca, textoRespaldo, useEstadoDelSistema,
  type EstadoDelSistema, type NivelDelSistema,
} from './estado-del-sistema'
import { ICONOS } from './iconos-identidad'
import { MarcaProducto } from './MarcaProducto'
import { useConexionDelNodo } from './nodo-offline'
import { cn } from './utils'

export type OpcionesBarraDeEstado = {
  /** Otra ruta del motor. Por defecto `/api/estado-del-sistema`. */
  ruta?: string
  /** La sucursal según el producto, si la elige el navegador (el selector de LibraDesk). Es un hook: se llama en cada
   *  render. Sin él, la que diga el servidor. */
  useSucursal?: () => string | null | undefined
}

/** Lo que el layout le pasa: el nombre que ya muestra en la barra lateral. */
type Props = OpcionesBarraDeEstado & { nombre?: string | null; className?: string }

function sinSucursal(): null {
  return null
}

function Parte({ icono: Icono, nivel = 'ok', texto, children, slot }: {
  icono?: ComponentType<{ className?: string }>
  nivel?: NivelDelSistema
  texto: string
  children?: ReactNode
  slot: string
}) {
  return (
    <span data-slot={slot} data-nivel={nivel} className={cn('flex min-w-0 shrink-0 items-center gap-1', TEXTO_POR_NIVEL[nivel])}>
      {children ?? (Icono && <Icono className="size-3.5 shrink-0" aria-hidden="true" />)}
      {/* Lo que pide atención lleva además un punto de su color: en el celular, donde sólo queda el ícono, es la señal. */}
      {nivel !== 'ok' && <span aria-hidden="true" data-slot="punto-de-estado" className="size-1.5 shrink-0 rounded-full bg-current sm:hidden" />}
      {/* En el celular, sólo el ícono a la vista; el texto queda para el lector de pantalla. */}
      <span className="sr-only truncate sm:not-sr-only">{texto}</span>
    </span>
  )
}

function Seccion({ titulo, nivel = 'ok', lineas }: { titulo: string; nivel?: NivelDelSistema; lineas: string[] }) {
  return (
    <div className="min-w-0">
      <h3 className={cn('text-xs font-semibold', nivel === 'ok' ? 'text-foreground' : TEXTO_POR_NIVEL[nivel])}>{titulo}</h3>
      {lineas.map((l) => <p key={l} className="text-xs text-muted-foreground">{l}</p>)}
    </div>
  )
}

/** Las partes de la línea, en orden: LibraEdge, usuario y sucursal, ARCA, respaldo. */
function partes(d: EstadoDelSistema, nombre: string | null, sucursal: string | null, edge: { en_linea?: boolean; a_facturar?: number }) {
  const lista: ReactNode[] = []
  const le = d.libraedge
  if (le) {
    // En un nodo, si el cartel ya consulta `/api/nodo/conexion` (cada 45 s), su dato es más fresco: se usa ése.
    const vivo = le.rol === 'nodo' && edge.en_linea !== undefined
      ? { ...le, en_linea: edge.en_linea, a_facturar: edge.a_facturar ?? le.a_facturar, nivel: (edge.en_linea ? 'ok' : 'atencion') as NivelDelSistema }
      : le
    lista.push(
      <Parte key="edge" slot="estado-libraedge" nivel={vivo.nivel} texto={`LibraEdge: ${partesLibraEdge(vivo).join(' · ')}`}>
        <MarcaProducto producto="libraedge" variante="favicon" className="size-3.5 shrink-0 rounded-sm" />
        {vivo.rol === 'nodo' && !vivo.en_linea && <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />}
      </Parte>,
    )
  }
  const quien = [nombre, sucursal].filter(Boolean).join(' · ')
  if (quien) lista.push(<Parte key="usuario" slot="estado-usuario" icono={sucursal ? ICONOS.sucursales : UserRound} texto={quien} />)
  const arca = d.arca && textoArca(d.arca)
  if (d.arca && arca) lista.push(<Parte key="arca" slot="estado-arca" icono={ShieldAlert} nivel={d.arca.nivel} texto={arca} />)
  if (d.respaldo) {
    lista.push(<Parte key="respaldo" slot="estado-respaldo" icono={DatabaseBackup} nivel={d.respaldo.nivel} texto={textoRespaldo(d.respaldo)} />)
  }
  return lista
}

/** La barra de estado. La monta `createLayout({ barraDeEstado })`; un producto con layout propio la pone al pie. */
export function BarraDeEstado({ ruta, useSucursal = sinSucursal, nombre, className }: Props) {
  const datos = useEstadoDelSistema({ ruta })
  const sucursalDelProducto = useSucursal()
  const conexion = useConexionDelNodo()
  const [abierta, setAbierta] = useState(false)
  const idDetalle = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierta) return
    function afuera(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierta(false)
    }
    document.addEventListener('mousedown', afuera)
    return () => document.removeEventListener('mousedown', afuera)
  }, [abierta])

  if (!datos) return null

  const nombreVisible = nombre || datos.usuario.nombre
  const sucursal = sucursalDelProducto || datos.usuario.sucursal
  const edge = conexion.esNodo ? { en_linea: !conexion.sinConexion, a_facturar: conexion.aFacturar } : {}
  const lista = partes(datos, nombreVisible ?? null, sucursal ?? null, edge)
  const version = datos.version.producto

  return (
    <div
      ref={raiz}
      data-slot="barra-de-estado"
      className={cn(
        // `sticky bottom-0` dentro del `SidebarInset`: queda al pie de la ventana con contenido largo y al pie del
        // contenido con uno corto. El margen de abajo es el del área segura del teléfono (la barra de gestos).
        'sticky bottom-0 z-10 mt-auto border-t bg-background/95 pb-[env(safe-area-inset-bottom)] text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && abierta) {
          setAbierta(false)
          boton.current?.focus()
        }
      }}
    >
      {abierta && (
        <div id={idDetalle} role="region" aria-label="Detalle del estado del sistema"
          className="grid max-h-[50vh] gap-3 overflow-y-auto border-b px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {datos.libraedge && (
            <Seccion titulo="LibraEdge" nivel={datos.libraedge.nivel} lineas={detalleLibraEdge(
              datos.libraedge.rol === 'nodo' && edge.en_linea !== undefined
                ? { ...datos.libraedge, en_linea: edge.en_linea, a_facturar: edge.a_facturar ?? datos.libraedge.a_facturar }
                : datos.libraedge)} />
          )}
          <Seccion titulo="Sesión" lineas={[
            ...(nombreVisible ? [`Usuario: ${nombreVisible}${datos.usuario.rol ? ` (${datos.usuario.rol})` : ''}.`] : []),
            ...(sucursal ? [`Sucursal: ${sucursal}.`] : []),
          ]} />
          {datos.arca && <Seccion titulo="ARCA" nivel={datos.arca.nivel} lineas={[detalleArca(datos.arca)]} />}
          {datos.respaldo && <Seccion titulo="Respaldo" nivel={datos.respaldo.nivel} lineas={detalleRespaldo(datos.respaldo)} />}
          <Seccion titulo="Versión" lineas={[
            version ? `Sistema: ${version}.` : 'Sistema: versión de desarrollo.',
            ...(datos.version.motor ? [`Motor: ${datos.version.motor}.`] : []),
          ]} />
        </div>
      )}
      <button
        ref={boton}
        type="button"
        aria-expanded={abierta}
        aria-controls={abierta ? idDetalle : undefined}
        onClick={() => setAbierta((a) => !a)}
        // 36 px de alto en el celular (se toca con el dedo), 28 en escritorio: una línea.
        className="flex h-9 w-full min-w-0 items-center gap-3 overflow-hidden px-4 text-left hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:h-7"
      >
        <span className="sr-only">Estado del sistema: </span>
        {lista}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {version && <span className="hidden truncate tabular-nums md:inline" data-slot="estado-version">{version}</span>}
          {!version && lista.length === 0 && <Info className="size-3.5" aria-hidden="true" />}
          <ChevronUp className={cn('size-3.5 transition-transform', abierta ? 'rotate-180' : '')} aria-hidden="true" />
        </span>
      </button>
    </div>
  )
}

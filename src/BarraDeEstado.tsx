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
import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { ChevronUp, DatabaseBackup, Info, ShieldAlert, UserRound, WifiOff } from 'lucide-react'

import {
  TEXTO_POR_NIVEL, detalleArca, detalleLibraEdge, detalleRespaldo, partesLibraEdge, textoArca, textoRespaldo, useEstadoDelSistema,
  type EstadoDelSistema, type NivelDelSistema,
} from './estado-del-sistema'
import { ICONOS } from './iconos-identidad'
import { MarcaProducto } from './MarcaProducto'
import { nombreDeLibraEdge, useMarca } from './marca'
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

/** Publica el alto de la barra para el resto de la página: `--alto-barra-de-estado` (los pies `sticky` de las pantallas
 *  se corren con `bottom-(--alto-barra-de-estado,0px)`) y `scroll-padding-bottom`, para que `scrollIntoView` (el teclado,
 *  un `focus`, Playwright) no deje un elemento debajo de la barra. 0 lo saca. */
function publicarAlto(alto: number) {
  if (typeof document === 'undefined') return
  const raizDoc = document.documentElement
  if (alto > 0) {
    raizDoc.style.setProperty('--alto-barra-de-estado', `${alto}px`)
    raizDoc.style.scrollPaddingBottom = `${alto}px`
  } else {
    raizDoc.style.removeProperty('--alto-barra-de-estado')
    raizDoc.style.scrollPaddingBottom = ''
  }
}

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
function partes(
  d: EstadoDelSistema, nombre: string | null, sucursal: string | null, edge: { en_linea?: boolean; a_facturar?: number },
  marcaPropia: boolean,
) {
  const lista: ReactNode[] = []
  const le = d.libraedge
  if (le) {
    // En un nodo, si el cartel ya consulta `/api/nodo/conexion` (cada 45 s), su dato es más fresco: se usa ése.
    const vivo = le.rol === 'nodo' && edge.en_linea !== undefined
      ? { ...le, en_linea: edge.en_linea, a_facturar: edge.a_facturar ?? le.a_facturar, nivel: (edge.en_linea ? 'ok' : 'atencion') as NivelDelSistema }
      : le
    lista.push(
      <Parte key="edge" slot="estado-libraedge" nivel={vivo.nivel} texto={`${nombreDeLibraEdge(marcaPropia)}: ${partesLibraEdge(vivo).join(' · ')}`}>
        {!marcaPropia && <MarcaProducto producto="libraedge" variante="favicon" className="size-3.5 shrink-0 rounded-sm" />}
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
  /** La línea de la barra (sin el detalle): es lo que se mide. */
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierta) return
    function afuera(e: MouseEvent) {
      const barra = raiz.current?.parentElement
      if (barra && !barra.contains(e.target as Node)) setAbierta(false)
    }
    document.addEventListener('mousedown', afuera)
    return () => document.removeEventListener('mousedown', afuera)
  }, [abierta])

  // El alto de la barra CERRADA (la línea y el área segura): lo reserva el espaciador de abajo del contenido y lo publica
  // en `--alto-barra-de-estado` (y en `scroll-padding-bottom`) para que nada quede debajo. El detalle abierto no cuenta:
  // se despliega hacia arriba, encima del contenido, sin moverlo.
  const [alto, setAlto] = useState(0)
  const hayDatos = datos !== null
  useLayoutEffect(() => {
    // La barra entera (con su borde y el área segura): el detalle va `absolute`, así que no suma.
    const linea = raiz.current?.parentElement
    if (!hayDatos || !linea) return
    const medir = () => setAlto(Math.ceil(linea.getBoundingClientRect().height))
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    observador.observe(linea)
    return () => observador.disconnect()
  }, [hayDatos])
  useEffect(() => publicarAlto(alto), [alto])
  useEffect(() => () => publicarAlto(0), [])
  const { propia: marcaPropia } = useMarca()

  if (!datos) return null

  const nombreVisible = nombre || datos.usuario.nombre
  const sucursal = sucursalDelProducto || datos.usuario.sucursal
  const edge = conexion.esNodo ? { en_linea: !conexion.sinConexion, a_facturar: conexion.aFacturar } : {}
  const lista = partes(datos, nombreVisible ?? null, sucursal ?? null, edge, marcaPropia)
  const version = datos.version.producto

  return (
    <>
      {/* El lugar de la barra en el flujo: el contenido termina arriba de ella, así el último botón de una pantalla larga
          nunca queda debajo. Mide lo mismo que la barra cerrada. */}
      <div aria-hidden="true" data-slot="espacio-de-la-barra-de-estado" className="shrink-0" style={{ height: alto }} />
      <div
        data-slot="barra-de-estado"
        className={cn(
          // 🔑 FIJA al pie de la COLUMNA DEL CONTENIDO (decisión del humano, 2026-10-20): siempre a la vista, sin tapar la
          // barra lateral. `--izquierda-barra-de-estado` lo pone el layout (el ancho de la barra lateral, abierta o en
          // íconos); sin layout del kit, de borde a borde. z-30: arriba del contenido y de sus pies `sticky` (que se corren
          // con `--alto-barra-de-estado`), debajo de los diálogos y las hojas (z-50) y del aviso de Términos (z-40).
          'fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] text-xs text-muted-foreground',
          'transition-[left] duration-200 ease-linear md:left-[var(--izquierda-barra-de-estado,0px)]',
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
          // Hacia arriba y por encima del contenido (no lo empuja): se cierra con Escape, con un clic afuera o tocando la barra.
          <div id={idDetalle} role="region" aria-label="Detalle del estado del sistema"
            className="absolute inset-x-0 bottom-full grid max-h-[50vh] gap-3 overflow-y-auto border-t bg-background px-4 py-3 shadow-lg sm:grid-cols-2 lg:grid-cols-4">
            {datos.libraedge && (
              <Seccion titulo={nombreDeLibraEdge(marcaPropia)} nivel={datos.libraedge.nivel} lineas={detalleLibraEdge(
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
        <div ref={raiz}>
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
      </div>
    </>
  )
}

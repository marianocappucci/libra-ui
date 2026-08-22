/** La pantalla bloqueante de Términos y Condiciones, y el gate que la muestra.
 *
 *  El contrato de la Suite Libra tiene que estar aceptado antes de poder operar
 *  (cláusula 30.1). El corte real lo hace el backend —`libraauth.terminos`
 *  responde 403 a cualquier llamada gateada por rol mientras la instancia no
 *  haya aceptado la versión vigente—; esto es la mitad que la persona ve y por
 *  donde acepta.
 *
 *  🔴 **La pantalla no es el gate.** Si sólo existiera esto, bastaría con abrir
 *  las herramientas de desarrollo para saltearla. Lo que protege los datos es el
 *  403 del backend; acá no hay ninguna decisión de seguridad.
 *
 *  Vive en libra-ui porque el contrato es el mismo para los ocho productos: que
 *  cada uno escriba su pantalla es exactamente cómo se llega a ocho textos de
 *  aceptación distintos para un solo contrato.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { api, configurarTerminosPendientes } from './api-client'

/** Estilos del contrato inyectado.
 *
 *  🔴 **Hacen falta y no son cosmética.** El HTML del contrato entra por
 *  `dangerouslySetInnerHTML`, así que sus etiquetas no llevan ninguna clase de
 *  Tailwind — y el preflight de Tailwind le saca a `h2`, `ul` y `table` todo el
 *  estilo del navegador. Sin esto, 33 secciones, dos tablas y una docena de
 *  listas salen como un muro de texto de 14 px: medido en el navegador, `h2`
 *  salía con el mismo tamaño y el mismo peso que un `<p>`, las listas sin
 *  viñeta y las tablas sin un solo borde. Un contrato que no se puede leer es
 *  un contrato que nadie lee — y acá lo que se firma es haberlo leído.
 *
 *  Va como `<style>` y no como clases de Tailwind porque el HTML lo genera el
 *  backend: no hay dónde colgarlas. Los colores salen de las variables de
 *  shadcn que los ocho productos ya definen, con un valor de reserva por si
 *  alguno no la tuviera.
 */
const ESTILOS_DEL_CONTRATO = `
.terminos-texto h1 { display: none; }
.terminos-texto h2 { font-size: 1rem; font-weight: 600; margin: 1.5rem 0 .5rem; }
.terminos-texto h3 { font-size: .9375rem; font-weight: 600; margin: 1rem 0 .375rem; }
.terminos-texto p { margin: 0 0 .75rem; }
.terminos-texto ul { list-style: disc; margin: 0 0 .75rem; padding-left: 1.25rem; }
.terminos-texto ol { list-style: decimal; margin: 0 0 .75rem; padding-left: 1.25rem; }
.terminos-texto li { margin-bottom: .25rem; }
.terminos-texto strong { font-weight: 600; }
.terminos-texto table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; }
.terminos-texto th, .terminos-texto td {
  border: 1px solid var(--border, #e5e7eb); padding: .375rem .5rem; text-align: left;
}
.terminos-texto th { font-weight: 600; background: var(--muted, #f8fafc); }
.terminos-texto blockquote {
  border-left: 3px solid var(--border, #e5e7eb); padding-left: .75rem;
  margin: 0 0 .75rem; color: var(--muted-foreground, #64748b);
}
.terminos-texto code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .8125rem; }
`

export type EstadoTerminos = {
  version: string
  vigente_desde: string
  hash_texto: string
  pendiente: boolean
  puede_aceptar: boolean
  aceptada_por?: string | null
  aceptada_at?: string | null
  texto?: string | null
  texto_html?: string | null
}

/** La pantalla completa: el contrato, la casilla y el botón.
 *
 *  Pide el texto con `?texto=1` — el estado liviano que consulta el gate no lo
 *  trae, porque son ~30 KB que sólo necesita esta pantalla.
 */
export function PantallaTerminos({
  basePath = '/terminos', onAceptado, onSalir,
}: {
  basePath?: string
  onAceptado?: () => void
  onSalir?: () => void
}) {
  const [estado, setEstado] = useState<EstadoTerminos | null>(null)
  const [leido, setLeido] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api.get<EstadoTerminos>(`${basePath}?texto=1`)
      .then(setEstado)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer el contrato.'))
  }, [basePath])

  async function aceptar() {
    if (!estado) return
    setEnviando(true)
    setError(null)
    try {
      // Se manda la versión que se tenía delante. Si mientras tanto entró un
      // deploy con un texto nuevo, el backend contesta 409 en vez de registrar
      // una aceptación de algo que esta pantalla no mostró.
      await api.post(`${basePath}/aceptar`, { version: estado.version })
      onAceptado?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la aceptación.')
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4 sm:p-8">
      <style>{ESTILOS_DEL_CONTRATO}</style>
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg">

        <header className="border-b px-6 py-5">
          <h1 className="text-xl font-semibold text-card-foreground">
            Términos y Condiciones del Servicio
          </h1>
          {estado && (
            <p className="mt-1 text-sm text-muted-foreground">
              Versión {estado.version} · vigente desde el {estado.vigente_desde}
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Para seguir usando el sistema hace falta la conformidad del responsable
            de la cuenta.
          </p>
        </header>

        <div
          data-testid="terminos-texto"
          className="terminos-texto min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-card-foreground"
        >
          {!estado && !error && <p className="text-muted-foreground">Cargando el contrato…</p>}
          {estado?.texto_html && (
            // El HTML lo genera `libraauth.terminos.texto_html()` a partir del
            // mismo Markdown que se hashea, y es el mismo convertidor que arma
            // las páginas públicas. No es contenido de usuario: viaja adentro
            // del paquete del backend.
            <div dangerouslySetInnerHTML={{ __html: estado.texto_html }} />
          )}
        </div>

        <footer className="space-y-3 border-t px-6 py-4">
          {estado && (
            <p className="text-xs text-muted-foreground">
              Huella SHA-256 del texto:{' '}
              <code className="break-all">{estado.hash_texto}</code>
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {estado && !estado.puede_aceptar && (
            <p className="text-sm text-muted-foreground">
              Sólo el responsable de la cuenta —un usuario con rol de administrador—
              puede aceptar estos Términos. Pedile que ingrese al sistema.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {estado?.puede_aceptar ? (
              <label className="flex items-center gap-2 text-sm text-card-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={leido}
                  onChange={(e) => setLeido(e.target.checked)}
                />
                Leí y acepto los Términos y Condiciones en nombre de la empresa.
              </label>
            ) : <span />}

            <div className="flex gap-2">
              {/* Siempre hay salida. Sin esto, un operador que no puede aceptar
                  queda encerrado en esta pantalla sin forma de cerrar sesión. */}
              {onSalir && (
                <Button variant="outline" onClick={onSalir}>Cerrar sesión</Button>
              )}
              {estado?.puede_aceptar && (
                <Button disabled={!leido || enviando} onClick={aceptar}>
                  {enviando ? 'Registrando…' : 'Aceptar y continuar'}
                </Button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

/** Envuelve la aplicación: mientras la instancia no haya aceptado la versión
 *  vigente, muestra `PantallaTerminos` en lugar de los hijos.
 *
 *  Se entera por dos caminos, y los dos hacen falta:
 *
 *  1. **Una consulta al montar**, cuando ya hay sesión. Sin esto, una pantalla
 *     que no pida datos —o que los tenga cacheados— dejaría ver la aplicación
 *     como si nada.
 *  2. **La intercepción del 403** de `api-client`. Sin esto, una versión nueva
 *     del contrato publicada con la pestaña abierta no cortaría hasta recargar.
 */
export function GateTerminos({
  children, basePath = '/terminos', activo = true, onSalir,
}: {
  children: ReactNode
  basePath?: string
  activo?: boolean
  onSalir?: () => void
}) {
  const [pendiente, setPendiente] = useState(false)

  useEffect(() => {
    configurarTerminosPendientes(() => setPendiente(true))
  }, [])

  useEffect(() => {
    if (!activo) {
      setPendiente(false)
      return
    }
    let vigente = true
    api.get<EstadoTerminos>(basePath)
      .then((e) => { if (vigente) setPendiente(e.pendiente) })
      // Un error acá NO bloquea: una instancia con el router sin montar, o una
      // llamada que falla por red, no puede dejar a nadie afuera del sistema. Lo
      // que garantiza el corte es el 403 del backend, no esta consulta.
      .catch(() => { if (vigente) setPendiente(false) })
    return () => { vigente = false }
  }, [activo, basePath])

  if (pendiente) {
    return (
      <PantallaTerminos
        basePath={basePath}
        onSalir={onSalir}
        onAceptado={() => {
          // Recarga entera y no un `setPendiente(false)`: al destrabarse, media
          // aplicación quedó con datos que nunca llegaron (todas las llamadas
          // que este gate rechazó). Volver a montar es más barato que perseguir
          // cada pantalla para que reintente.
          if (typeof window !== 'undefined') window.location.reload()
          else setPendiente(false)
        }}
      />
    )
  }
  return <>{children}</>
}

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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog'

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

/** La próxima versión anunciada, que todavía no rige (`libraauth` ADR-024). `aceptada`: si la instancia ya la aceptó por
 *  adelantado. `texto`/`texto_html` sólo vienen con `?texto=1`. */
export type ProximaVersion = {
  version: string
  vigente_desde: string
  hash_texto: string
  aceptada: boolean
  aceptada_por?: string | null
  aceptada_at?: string | null
  resumen_del_cambio?: string | null
  texto?: string | null
  texto_html?: string | null
}

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
  /** `null` o ausente: no hay próxima versión (o el backend es anterior a libraauth 0.51.0). */
  proxima?: ProximaVersion | null
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

// ── El aviso de la próxima versión (aceptación por adelantado) ───────────────────────────────────────────────────────────

/** La landing con el texto de la próxima versión, por si el sistema no puede mostrarlo (cláusula 29.2). */
export const URL_TERMINOS_PROXIMA = '/legal/terminos-proxima.html'

const PREFIJO_OCULTA = 'libra-ui:terminos-proxima-oculta:'

// `sessionStorage` puede no estar (ventana privada, datos bloqueados) o lanzar: sin él «Más tarde» sólo dura mientras el
// aviso está montado, y el aviso sigue funcionando.
function estaOculta(version: string): boolean {
  try { return window.sessionStorage.getItem(PREFIJO_OCULTA + version) === '1' } catch { return false }
}
function ocultarEnEstaSesion(version: string) {
  try { window.sessionStorage.setItem(PREFIJO_OCULTA + version, '1') } catch { /* sin almacenamiento */ }
}
/** Al cerrar sesión: «Más tarde» vale hasta el próximo ingreso, no hasta cerrar la pestaña. */
function olvidarOcultas() {
  try {
    const claves: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i)
      if (k?.startsWith(PREFIJO_OCULTA)) claves.push(k)
    }
    claves.forEach((k) => window.sessionStorage.removeItem(k))
  } catch { /* sin almacenamiento */ }
}

/** Aviso NO bloqueante de que va a regir una versión nueva de los Términos, con la posibilidad de aceptarla desde ya.
 *
 *  Una tarjeta fija abajo (a la derecha en escritorio, de borde a borde en el celular) y no un banner en el flujo ni un
 *  modal: el banner en el flujo choca con los layouts de pantalla completa y con la barra lateral fija, y el modal
 *  tapa la pantalla de quien entra a trabajar. Esto se ve, se ignora con «Más tarde» y no mueve nada.
 *
 *  🔑 **Es una comodidad, no un corte.** El gate bloqueante del día de la vigencia no depende de esto: si el responsable
 *  no acepta acá, ese día `PantallaTerminos` pide la aceptación como siempre. La decisión de seguridad sigue siendo del
 *  backend; acá sólo se registra una aceptación antes de tiempo.
 *
 *  Pide el texto recién cuando se lo quiere leer (`?texto=1`, ~30 KB) y, si no llega, ofrece la landing pública. */
export function AvisoProximaVersion({
  proxima, basePath = '/terminos', urlTexto = URL_TERMINOS_PROXIMA, onAceptada,
}: {
  proxima: ProximaVersion
  basePath?: string
  /** Dónde está el texto público de la próxima versión, si el sistema no puede mostrarlo. */
  urlTexto?: string
  onAceptada?: () => void
}) {
  const [fase, setFase] = useState<'aviso' | 'aceptada' | 'oculta'>(
    () => (estaOculta(proxima.version) ? 'oculta' : 'aviso'),
  )
  const [leido, setLeido] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verTexto, setVerTexto] = useState(false)
  const [html, setHtml] = useState<string | null>(null)
  const [sinTexto, setSinTexto] = useState(false)

  if (fase === 'oculta') return null

  function masTarde() {
    ocultarEnEstaSesion(proxima.version)
    setFase('oculta')
  }

  async function aceptar() {
    setEnviando(true)
    setError(null)
    try {
      // La versión que se tiene delante, como en la pantalla del gate: si el 09-11 pasó mientras tanto, el backend
      // contesta con la vigente o 409 y no registra una aceptación de algo que no se mostró.
      await api.post(`${basePath}/aceptar`, { version: proxima.version })
      setFase('aceptada')
      onAceptada?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la aceptación.')
    } finally {
      setEnviando(false)
    }
  }

  async function leer() {
    setVerTexto(true)
    if (html) return
    setSinTexto(false)
    try {
      const e = await api.get<EstadoTerminos>(`${basePath}?texto=1`)
      const texto = e.proxima?.texto_html
      if (texto) setHtml(texto)
      else setSinTexto(true)
    } catch {
      setSinTexto(true)
    }
  }

  const titulo = 'Nueva versión de los Términos y Condiciones'
  return (
    <section
      role="region"
      aria-label={titulo}
      data-testid="aviso-proxima-version"
      className="fixed inset-x-3 bottom-[calc(var(--alto-barra-de-estado,0px)+max(0.75rem,env(safe-area-inset-bottom)))] z-40 rounded-lg border bg-card p-4 text-card-foreground shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-[calc(var(--alto-barra-de-estado,0px)+1rem)] sm:w-[26rem]"
    >
      {fase === 'aceptada' ? (
        <div className="flex items-center justify-between gap-3">
          <p role="status" className="text-sm font-medium">Aceptado. Gracias.</p>
          <Button variant="outline" size="sm" className="max-lg:h-11" onClick={() => setFase('oculta')}>
            Cerrar
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{titulo}</h2>
            <p className="text-sm text-muted-foreground">
              Desde el {proxima.vigente_desde} rige la versión {proxima.version} de los Términos y Condiciones.
              {proxima.resumen_del_cambio ? ` ${proxima.resumen_del_cambio}` : ''}
            </p>
            <Button
              variant="link"
              className="h-auto p-0 text-sm max-lg:min-h-11"
              onClick={() => { void leer() }}
            >
              Leer la versión {proxima.version}
            </Button>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary max-lg:mt-0 max-lg:size-5"
              checked={leido}
              onChange={(e) => setLeido(e.target.checked)}
            />
            Leí la versión {proxima.version} y la acepto en nombre de la empresa.
          </label>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="max-lg:h-11" onClick={masTarde}>
              Más tarde
            </Button>
            <Button size="sm" className="max-lg:h-11" disabled={!leido || enviando} onClick={() => { void aceptar() }}>
              {enviando ? 'Registrando…' : 'Aceptar'}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={verTexto} onOpenChange={setVerTexto}>
        <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-3 sm:max-w-3xl">
          <style>{ESTILOS_DEL_CONTRATO}</style>
          <DialogHeader>
            <DialogTitle>Términos y Condiciones — versión {proxima.version}</DialogTitle>
            <DialogDescription>Rige desde el {proxima.vigente_desde}.</DialogDescription>
          </DialogHeader>
          <div
            data-testid="terminos-proxima-texto"
            className="terminos-texto min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-relaxed"
          >
            {html
              // Mismo origen y mismo convertidor que el de la vigente (`libraauth.terminos.texto_html_proximo`).
              ? <div dangerouslySetInnerHTML={{ __html: html }} />
              : sinTexto
                ? (
                  <p>
                    No pudimos cargar el texto en el sistema.{' '}
                    <a className="underline" href={urlTexto} target="_blank" rel="noreferrer">
                      Leelo en la página pública
                    </a>.
                  </p>
                )
                : <p className="text-muted-foreground">Cargando el texto…</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Huella SHA-256 del texto: <code className="break-all">{proxima.hash_texto}</code>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerTexto(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
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
  children, basePath = '/terminos', activo = true, onSalir, urlTextoProxima,
}: {
  children: ReactNode
  basePath?: string
  activo?: boolean
  onSalir?: () => void
  /** Dónde está la landing con el texto de la próxima versión; por defecto `URL_TERMINOS_PROXIMA`. */
  urlTextoProxima?: string
}) {
  const [pendiente, setPendiente] = useState(false)
  // La próxima versión que hay que avisar: sólo para quien puede aceptarla y mientras no la haya aceptado la instancia.
  const [proxima, setProxima] = useState<ProximaVersion | null>(null)

  useEffect(() => {
    configurarTerminosPendientes(() => setPendiente(true))
  }, [])

  useEffect(() => {
    if (!activo) {
      setPendiente(false)
      setProxima(null)
      // «Más tarde» vale hasta el próximo ingreso: al salir (o al vencer la sesión) se olvida.
      olvidarOcultas()
      return
    }
    let vigente = true
    api.get<EstadoTerminos>(basePath)
      .then((e) => {
        if (!vigente) return
        setPendiente(e.pendiente)
        // Quien no puede aceptar no ve nada: el aviso es una puerta para el responsable, no una noticia para todos.
        setProxima(e.puede_aceptar && e.proxima && !e.proxima.aceptada ? e.proxima : null)
      })
      // Un error acá NO bloquea: una instancia con el router sin montar, o una
      // llamada que falla por red, no puede dejar a nadie afuera del sistema. Lo
      // que garantiza el corte es el 403 del backend, no esta consulta.
      .catch(() => { if (vigente) { setPendiente(false); setProxima(null) } })
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
  return (
    <>
      {children}
      {proxima && <AvisoProximaVersion proxima={proxima} basePath={basePath} urlTexto={urlTextoProxima} />}
    </>
  )
}

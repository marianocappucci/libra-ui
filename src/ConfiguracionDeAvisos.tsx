// La pantalla de configuración de los avisos por WhatsApp y por mail (ADR-097), contraparte de `build_avisos_router` de libracore (ADR-090).
//
// Es una pieza, no una pantalla: el producto la pone dentro de su Configuración (o de la pantalla «Avisos»), al lado de `RegistroDeAvisos`.
// Mismas formas que `ConfiguracionSmtp` y que el token de MercadoPago:
//
//     <ConfiguracionDeAvisos />                          // el router en /api/avisos
//     <ConfiguracionDeAvisos basePath="/api/avisos" demo={esDemo} />
//
// ## Lo delicado: la apikey de Evolution es sólo de escritura
//
// El motor nunca la devuelve (`apikey_cargada: true|false`). Por eso el campo arranca siempre vacío, **la clave `apikey` sólo viaja si se
// tipeó algo** y sacarla es una casilla aparte (`quitar_apikey`). Ver `cuerpoParaGuardar`, que tiene su test.
//
// ## Lo que explica en criollo
//
// - Los tres modos de WhatsApp (Apagado, Registro, Evolution) con qué hace cada uno.
// - Por qué no manda (`motivo` del motor): falta la URL, la instancia o la apikey, o no hay dónde guardarla.
// - Un nodo de LibraEdge: `PUT` y `probar` contestan 409 `solo_en_el_central`; la pantalla lo dice y se queda de consulta.
// - Una demo: nunca manda por WhatsApp. El motor no avisa que es una demo en el `GET`, así que el producto lo pasa con `demo`; sin esa prop,
//   el motor igual lo dice al guardar (422) y al probar (`simulado`), y la pantalla muestra ese texto.
// - Un 502 de Evolution (apikey mala, instancia caída): se dice qué revisar, sin mandar a nadie al login.
//
// Lo que **no** hace: probar el canal de correo (el SMTP tiene su propio «Probar conexión» en Configuración).
import { useEffect, useId, useState, type FormEvent } from 'react'
import { ApiError } from './api-client'
import {
  MODOS_DE_WHATSAPP, RUTA_AVISOS_POR_DEFECTO, TEXTO_CORREO_LISTO, TEXTO_CORREO_SIN_SERVIDOR, TEXTO_DE_DEMO, TEXTO_SOLO_EN_EL_CENTRAL,
  clienteDeAvisos, cuerpoParaGuardar, estadoDeWhatsApp, tituloDelModo,
  type ConfigDeWhatsApp, type EstadoDeAvisos, type ModoDeWhatsApp, type ResultadoDePrueba,
} from './avisos'
import { AvisoEstado, BadgeEstado, type TonoEstado } from './badge-estado'
import { CODIGO_SOLO_EN_EL_CENTRAL } from './cola-del-nodo'
import { codigoDelError } from './nodo-offline'
import { PasswordInput } from './PasswordInput'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { cn } from './utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Formulario = { modo: string; url: string; instancia: string }

const MODOS_POR_DEFECTO = ['apagado', 'registro', 'evolution']

function aFormulario(wa: ConfigDeWhatsApp): Formulario {
  return { modo: wa.modo, url: wa.url, instancia: wa.instancia }
}

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

/** Lo que se le dice a la persona cuando la prueba de envío no salió. */
function textoDeErrorDePrueba(err: unknown): string {
  if (!(err instanceof ApiError)) return 'No se pudo hacer la prueba: error de conexión.'
  // 502: Evolution (no la sesión) fue el que falló; el motor manda el motivo en una frase propia.
  if (err.status === 502) {
    const motivo = err.detail.replace(/[.\s]+$/, '')
    return `Evolution no pudo mandar la prueba: ${motivo}. Revisá la URL, el nombre de la instancia y la apikey, y que el número siga vinculado.`
  }
  return err.detail
}

export type ConfiguracionDeAvisosProps = {
  /** Donde el producto montó `build_avisos_router`. Por defecto `/api/avisos`. */
  basePath?: string
  /** `true` en una demo: Evolution no se puede elegir y la pantalla lo explica de entrada. Un producto sin ese dato lo omite. */
  demo?: boolean
  className?: string
}

export function ConfiguracionDeAvisos({ basePath = RUTA_AVISOS_POR_DEFECTO, demo = false, className }: ConfiguracionDeAvisosProps = {}) {
  const id = useId()
  const [estado, setEstado] = useState<EstadoDeAvisos | null>(null)
  const [form, setForm] = useState<Formulario>({ modo: 'apagado', url: '', instancia: '' })
  const [apikey, setApikey] = useState('')
  const [quitarApikey, setQuitarApikey] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [soloCentral, setSoloCentral] = useState(false)

  const [telefono, setTelefono] = useState('')
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<{ tono: TonoEstado; texto: string } | null>(null)

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath])

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const e = await clienteDeAvisos(basePath).config()
      setEstado(e)
      setForm(aFormulario(e.whatsapp))
    } catch (err) {
      setError(describirError(err))
    } finally {
      setCargando(false)
    }
  }

  function actualizar(campo: keyof Formulario, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const nuevo = await clienteDeAvisos(basePath).guardar(cuerpoParaGuardar(form, apikey, quitarApikey))
      setEstado(nuevo)
      setForm(aFormulario(nuevo.whatsapp))
      setApikey('')
      setQuitarApikey(false)
      setAviso('Configuración guardada.')
    } catch (err) {
      if (codigoDelError(err) === CODIGO_SOLO_EN_EL_CENTRAL) setSoloCentral(true)
      else setError(describirError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function probar(e: FormEvent) {
    e.preventDefault()
    if (!telefono.trim()) {
      setPrueba({ tono: 'atencion', texto: 'Escribí el número al que mandar la prueba.' })
      return
    }
    setProbando(true)
    setPrueba(null)
    try {
      const r = await clienteDeAvisos(basePath).probar(telefono.trim(), 'whatsapp')
      setPrueba(resultadoDeLaPrueba(r, estado?.whatsapp.modo, demo))
    } catch (err) {
      if (codigoDelError(err) === CODIGO_SOLO_EN_EL_CENTRAL) setSoloCentral(true)
      else setPrueba({ tono: 'negativo', texto: textoDeErrorDePrueba(err) })
    } finally {
      setProbando(false)
    }
  }

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>

  if (!estado) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm font-medium text-destructive">{error ?? 'No se pudo leer la configuración de avisos.'}</p>
        <Button variant="outline" onClick={() => void cargar()}>Reintentar</Button>
      </div>
    )
  }

  const wa = estado.whatsapp
  const situacion = estadoDeWhatsApp(wa)
  const modos = wa.modos.length > 0 ? wa.modos : MODOS_POR_DEFECTO
  const sinGuardar = form.modo !== wa.modo || form.url.trim() !== wa.url || form.instancia.trim() !== wa.instancia || apikey.trim() !== '' || quitarApikey
  const bloqueado = soloCentral

  return (
    <div className={cn('space-y-4', className)}>
      <Card>
        <CardHeader>
          <CardTitle>Avisos por WhatsApp y por mail</CardTitle>
          <CardDescription>
            Cómo salen los avisos a los clientes (confirmaciones, recordatorios). Qué se avisa y con qué texto lo decide el sistema; acá se elige el canal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">WhatsApp:</span>
              <BadgeEstado tono={situacion.tono}>{situacion.titulo}</BadgeEstado>
              <span className="text-muted-foreground">{situacion.detalle}</span>
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Correo:</span>
              <BadgeEstado tono={estado.email.disponible ? 'ok' : 'atencion'}>{estado.email.disponible ? 'Disponible' : 'Sin servidor'}</BadgeEstado>
              <span className="text-muted-foreground">{estado.email.disponible ? TEXTO_CORREO_LISTO : TEXTO_CORREO_SIN_SERVIDOR}</span>
            </p>
          </div>

          {demo && <AvisoEstado tono="atencion" role="note">{TEXTO_DE_DEMO}</AvisoEstado>}
          {soloCentral && <AvisoEstado tono="atencion" role="alert">{TEXTO_SOLO_EN_EL_CENTRAL}</AvisoEstado>}
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          {aviso && <p role="status" className="text-sm font-medium text-primary">{aviso}</p>}

          <div className="space-y-2">
            <p id={`${id}-modo`} className="text-sm font-medium">Modo de WhatsApp</p>
            <RadioGroup
              aria-labelledby={`${id}-modo`}
              value={form.modo}
              onValueChange={(v) => actualizar('modo', v)}
              disabled={bloqueado}
              className="gap-3"
            >
              {modos.map((m) => {
                const info = MODOS_DE_WHATSAPP[m as ModoDeWhatsApp]
                const noSePuede = demo && m === 'evolution'
                return (
                  <div key={m} className="flex items-start gap-3">
                    <RadioGroupItem
                      value={m} id={`${id}-modo-${m}`} className="mt-1" disabled={noSePuede || bloqueado}
                      aria-describedby={info ? `${id}-modo-${m}-ayuda` : undefined}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={`${id}-modo-${m}`}>{tituloDelModo(m)}</Label>
                      {info && <p id={`${id}-modo-${m}-ayuda`} className="text-xs text-muted-foreground">{info.explicacion}</p>}
                    </div>
                  </div>
                )
              })}
            </RadioGroup>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <p className="text-sm font-medium">Conexión con Evolution</p>
              <p className="text-xs text-muted-foreground">
                Se usa sólo en el modo Evolution, pero conviene cargarla y probarla antes de pasarse a ese modo.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={`${id}-url`}>URL base de Evolution</Label>
                <Input
                  id={`${id}-url`} value={form.url} placeholder="https://evolution.miempresa.com" disabled={bloqueado}
                  autoComplete="off" translate="no" onChange={(e) => actualizar('url', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-instancia`}>Instancia</Label>
                <Input
                  id={`${id}-instancia`} value={form.instancia} placeholder="mi-negocio" disabled={bloqueado}
                  autoComplete="off" translate="no" onChange={(e) => actualizar('instancia', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`${id}-apikey`}>API key</Label>
                  {wa.apikey_cargada && !quitarApikey && <BadgeEstado tono="ok">Cargada</BadgeEstado>}
                  {quitarApikey && <BadgeEstado tono="atencion">Se quita al guardar</BadgeEstado>}
                </div>
                <PasswordInput
                  id={`${id}-apikey`} value={apikey} disabled={bloqueado || quitarApikey}
                  autoComplete="new-password" translate="no"
                  placeholder={wa.apikey_cargada ? 'Cargada — dejalo vacío para no cambiarla' : 'Pegá la apikey de la instancia'}
                  onChange={(e) => setApikey(e.target.value)}
                />
                {wa.apikey_cargada && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox" checked={quitarApikey} disabled={bloqueado}
                      onChange={(e) => {
                        setQuitarApikey(e.target.checked)
                        if (e.target.checked) setApikey('')
                      }}
                    />
                    Quitar la apikey guardada
                  </label>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">La apikey se guarda cifrada y no vuelve a mostrarse.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void guardar()} disabled={guardando || bloqueado}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Probar el envío</CardTitle>
          <CardDescription>
            Manda un mensaje de prueba, siempre el mismo texto fijo, a un número tuyo. Usa lo que está guardado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={(e) => void probar(e)} className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-2">
              <Label htmlFor={`${id}-telefono`}>Número de WhatsApp</Label>
              <Input
                id={`${id}-telefono`} type="tel" value={telefono} placeholder="11 5555-1234" disabled={bloqueado}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={probando || bloqueado}>
              {probando ? 'Enviando…' : 'Probar envío'}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">Con característica y sin 0 ni 15, por ejemplo 11 5555-1234.</p>
          {sinGuardar && !bloqueado && (
            <p className="text-xs text-muted-foreground">Tenés cambios sin guardar: la prueba usa la configuración guardada, no lo que está en pantalla.</p>
          )}
          {prueba && (
            <AvisoEstado tono={prueba.tono} role={prueba.tono === 'negativo' ? 'alert' : 'status'}>{prueba.texto}</AvisoEstado>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Qué se le dice a la persona cuando la prueba contestó 200. `simulado` quiere decir que no salió nada. */
function resultadoDeLaPrueba(r: ResultadoDePrueba, modoGuardado: string | undefined, demo: boolean): { tono: TonoEstado; texto: string } {
  if (!r.simulado) return { tono: 'ok', texto: 'Listo: el mensaje de prueba salió. Fijate si te llegó al WhatsApp de ese número.' }
  // Con el modo Evolution guardado y un proveedor simulado, lo que simuló fue la demo; en cualquier otro caso, el modo Registro.
  if (demo || modoGuardado === 'evolution') {
    return { tono: 'atencion', texto: 'Esto es una demo: la prueba quedó anotada pero no salió ningún mensaje, porque una demo nunca manda por WhatsApp.' }
  }
  return { tono: 'curso', texto: 'La prueba quedó anotada pero no salió ningún mensaje: WhatsApp está en modo Registro. Pasá a Evolution para mandar de verdad.' }
}

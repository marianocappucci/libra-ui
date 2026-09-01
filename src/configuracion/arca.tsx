/** La sección de ARCA (facturación electrónica), una sola para toda la familia.
 *
 *  Reemplaza a la `ArcaCard` vieja de este mismo paquete, que pedía el
 *  **path del certificado en el servidor** en un campo de texto. Eso tenía dos
 *  problemas y ninguno se veía en pantalla:
 *
 *  1. 🔴 **El alta no se podía hacer desde el navegador.** Alguien tenía que
 *     dejar el `.crt` y el `.key` dentro del volumen del contenedor a mano, y
 *     recién después escribir la ruta acá. Cuatro productos —Gestiolibra,
 *     MedLibra, VentaLibra y LibraClub— estaban así.
 *  2. 🔴 **Era un path que el admin escribe y el servidor abre.**
 *
 *  Ahora habla con `libracore.arca_router.build_arca_router`, que ya existía y
 *  sólo montaban Contalibra y Restolibra: sube los archivos, los **valida antes
 *  de escribirlos**, chequea que el certificado y la clave sean pareja, y sabe
 *  cuándo vence.
 *
 *  🔑 **El vencimiento es el dato que evita la falla silenciosa.** Los
 *  certificados de ARCA duran dos años y el día que vencen la facturación deja
 *  de andar sin que nadie haya tocado nada. Por eso `GET /estado` se pide
 *  aparte de la configuración y su resultado encabeza la tarjeta.
 */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Save, Send, ShieldCheck } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import {
  AMBIENTES_ARCA, NOMBRE_DEL_AMBIENTE, nombreDelAmbiente, parDe,
  type AmbienteArca, type ParDeArca,
} from './arca-pares'
import { Campo, AccionesDeSeccion } from './campos'
import { TutorialArcaCertificado, TutorialArcaPadron } from './tutoriales'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/** Lo que devuelve `GET {basePath}`. `null` si la instancia todavía no facturó. */
export type ConfigArca = {
  empresa: string
  cuit: string
  punto_venta: number
  ambiente: string
  alias: string
  certificado_path: string
  clave_path: string
  tiene_certificado: boolean
  tiene_clave: boolean
  /** 🔑 Opcional: un producto con un LibraCore anterior al 2026-09-01 no lo
   *  manda, y la pantalla tiene que seguir funcionando con un solo par. */
  pares?: Record<string, ParDeArca>
}

/** Lo que devuelve `GET {basePath}/estado`. */
export type EstadoArca = {
  configurado: boolean
  ambiente: string
  cuit: string
  tiene_certificado: boolean
  tiene_clave: boolean
  vence?: string
  dias_para_vencer?: number
  vencido?: boolean
  sujeto?: string
  error_certificado?: string
  pares?: Record<string, ParDeArca>
}

function vacia(empresa: string): ConfigArca {
  return {
    empresa, cuit: '', punto_venta: 1, ambiente: 'homologacion', alias: '',
    certificado_path: '', clave_path: '', tiene_certificado: false, tiene_clave: false,
  }
}

/** Cuántos días antes de vencer se empieza a avisar. Un certificado dura dos
 *  años: con un mes hay tiempo de sobra para renovarlo, y menos que eso
 *  convierte el aviso en una urgencia. */
const DIAS_DE_AVISO = 30

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

/** El aviso de vencimiento, arriba de todo.
 *
 *  Tres estados y no dos: "vencido" y "por vencer" piden acciones distintas y
 *  en momentos distintos, y confundirlos deja al cliente descubriendo que no
 *  puede facturar el día que factura.
 */
function AvisoDeVencimiento({ estado }: { estado: EstadoArca }) {
  if (estado.error_certificado) {
    return (
      <BadgeEstado tono="negativo">
        El certificado cargado no se puede leer: {estado.error_certificado}
      </BadgeEstado>
    )
  }
  if (!estado.vence) return null
  if (estado.vencido) {
    return (
      <BadgeEstado tono="negativo">
        Certificado VENCIDO el {estado.vence} — la facturación no va a funcionar
      </BadgeEstado>
    )
  }
  if ((estado.dias_para_vencer ?? 999) <= DIAS_DE_AVISO) {
    return (
      <BadgeEstado tono="atencion">
        El certificado vence el {estado.vence} — quedan {estado.dias_para_vencer} días
      </BadgeEstado>
    )
  }
  return (
    <BadgeEstado tono="ok"><CheckCircle2 />Certificado válido hasta el {estado.vence}</BadgeEstado>
  )
}

/** Subir una de las dos mitades del par.
 *
 *  El `input` se limpia después de cada elección para que subir DOS VECES el
 *  mismo archivo vuelva a disparar el `change`: si no, corregir y resubir el
 *  mismo nombre no hace nada y parece que la pantalla se colgó.
 */
function SubirMitad({ label, accept, cargado, disabled, idSufijo, onArchivo }: {
  label: string
  accept: string
  cargado: boolean
  disabled: boolean
  /** 🔑 El ambiente al que pertenece este campo. Desde que la tarjeta muestra
   *  los DOS pares hay dos "Certificado (.crt)" en la misma pantalla: sin
   *  distinguirlos, el `aria-label` deja de identificar un solo control —para
   *  quien usa lector de pantalla y para los tests— y no hay forma de decir a
   *  cuál de los dos ambientes se está subiendo. */
  idSufijo: string
  onArchivo: (f: File) => void
}) {
  const etiqueta = `${label} — ${nombreDelAmbiente(idSufijo)}`
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {cargado && <BadgeEstado tono="ok" className="w-fit"><CheckCircle2 />Cargado</BadgeEstado>}
      <Input
        type="file" accept={accept} disabled={disabled} aria-label={etiqueta}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onArchivo(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** El resumen de un par: si está, hasta cuándo, o qué le falta. */
function ResumenDelPar({ par }: { par: ParDeArca }) {
  if (par.error_certificado) {
    return (
      <BadgeEstado tono="negativo">
        El certificado no se puede leer: {par.error_certificado}
      </BadgeEstado>
    )
  }
  if (!par.tiene_certificado && !par.tiene_clave) {
    return <BadgeEstado tono="neutro">Sin cargar</BadgeEstado>
  }
  if (!par.completo) {
    // 🔑 Se dice CUÁL falta. "Incompleto" a secas manda a mirar los dos campos.
    return (
      <BadgeEstado tono="atencion">
        Falta {par.tiene_certificado ? 'la clave privada' : 'el certificado'}
      </BadgeEstado>
    )
  }
  if (par.vencido) {
    return <BadgeEstado tono="negativo">Vencido el {par.vence}</BadgeEstado>
  }
  if ((par.dias_para_vencer ?? 999) <= DIAS_DE_AVISO) {
    return (
      <BadgeEstado tono="atencion">
        Vence el {par.vence} — quedan {par.dias_para_vencer} días
      </BadgeEstado>
    )
  }
  return (
    <BadgeEstado tono="ok">
      <CheckCircle2 />Válido hasta el {par.vence}
    </BadgeEstado>
  )
}

/** El aviso de que el ambiente elegido no tiene con qué facturar.
 *
 *  🔴 **Es el hueco que abre tener dos pares.** Con un solo par, "hay
 *  certificado" y "puedo facturar" eran lo mismo. Ahora el selector puede
 *  apuntar a un ambiente vacío mientras el otro está completo: la pantalla
 *  muestra credenciales cargadas por todos lados y la facturación no anda.
 *
 *  Es exactamente el paso donde se rompe el flujo que esta pantalla habilita —
 *  mover la llave a producción antes de haber subido el par de producción—, así
 *  que se dice acá y no se descubre al emitir el primer comprobante.
 */
function AvisoDelSelector({ cfg }: { cfg: ConfigArca }) {
  const elegido = parDe(cfg, cfg.ambiente)
  if (elegido.completo) return null
  const nombre = nombreDelAmbiente(cfg.ambiente)
  const otro = AMBIENTES_ARCA.find((a) => a !== cfg.ambiente && parDe(cfg, a).completo)
  return (
    <BadgeEstado tono="negativo">
      El ambiente elegido es <strong>{nombre}</strong> y todavía no tiene el par
      completo: la facturación no va a funcionar.
      {otro && ` El par de ${NOMBRE_DEL_AMBIENTE[otro].toLowerCase()} sí está cargado.`}
    </BadgeEstado>
  )
}

/** El par de credenciales de UN ambiente: estado, las dos mitades y el quitar.
 *
 *  🔴 **Los dos se ven siempre, incluso el que no está en uso.** El momento que
 *  esta pantalla tiene que cubrir es el de la transición: el operador está
 *  probando contra homologación y necesita ver, sin mover el selector, que el
 *  par de producción ya está cargado y hasta cuándo dura. Mostrar sólo el
 *  ambiente activo convierte el corte a facturación real en un salto a ciegas.
 */
function ParDeCredenciales({ ambiente, par, enUso, disabled, onArchivo, onQuitar }: {
  ambiente: AmbienteArca
  par: ParDeArca
  enUso: boolean
  disabled: boolean
  onArchivo: (tramo: 'certificado' | 'clave', f: File) => void
  onQuitar: () => void
}) {
  return (
    <section
      aria-label={`Credenciales de ${NOMBRE_DEL_AMBIENTE[ambiente]}`}
      className="grid gap-3 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{NOMBRE_DEL_AMBIENTE[ambiente]}</span>
        {enUso && <BadgeEstado tono="ok">En uso</BadgeEstado>}
        <ResumenDelPar par={par} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SubirMitad
          label="Certificado (.crt)" accept=".crt,.pem" cargado={par.tiene_certificado}
          disabled={disabled} idSufijo={ambiente}
          onArchivo={(f) => onArchivo('certificado', f)}
        />
        <SubirMitad
          label="Clave privada (.key)" accept=".key,.pem" cargado={par.tiene_clave}
          disabled={disabled} idSufijo={ambiente}
          onArchivo={(f) => onArchivo('clave', f)}
        />
      </div>

      {(par.tiene_certificado || par.tiene_clave) && (
        <Button
          type="button" variant="outline" size="sm" className="w-fit"
          disabled={disabled} onClick={onQuitar}
        >
          Quitar el par de {NOMBRE_DEL_AMBIENTE[ambiente].toLowerCase()}
        </Button>
      )}
    </section>
  )
}

/** Facturación electrónica.
 *
 *  `basePath` existe porque los productos ya publicaron rutas distintas
 *  (`/config/arca` en cuatro, `/api/config/arca` en Contalibra y Restolibra) y
 *  cambiar el prefijo rompe el frontend desplegado. La ruta se normaliza
 *  producto por producto, no de prepo desde el kit.
 *
 *  🔴 **`empresa` es el slug de la fila de `arca_config`, y en una instancia
 *  nueva es lo único que evita una falla muda.** Cuatro productos leen su
 *  configuración de facturación con un slug FIJO —`negocio` en Gestiolibra,
 *  `consultorio` en MedLibra, `venta` en VentaLibra, `complejo` en LibraClub—.
 *  Si la instancia todavía no tiene fila, el `GET` devuelve `null` y el primer
 *  guardado crea una: sin este dato la crearía como **`default`**, que el
 *  servicio de facturación de esos cuatro **no lee nunca**. El admin sube el
 *  certificado, la pantalla dice "Guardado", y al emitir la primera factura el
 *  producto responde que ARCA no está configurado.
 *
 *  En una instancia que YA tiene fila no cambia nada: el `GET` devuelve el
 *  slug real y es ése el que viaja de vuelta.
 */
export function ArcaCard({ producto, basePath = '/config/arca', empresa = 'default' }: {
  producto: string
  basePath?: string
  empresa?: string
}) {
  const [cfg, setCfg] = useState<ConfigArca | null>(null)
  // 🔴 El punto de venta va como STRING mientras se edita, aunque el backend lo
  // reciba como entero. Coercionarlo en cada tecla —`Number(v) || 1`— hace que
  // borrar el campo lo deje en "1" en el acto, y tipear "7" encima devuelva
  // **17**: no hay forma de reemplazar el valor sin que quede el anterior
  // adelante. La conversión va una sola vez, al guardar.
  const [puntoVenta, setPuntoVenta] = useState('1')
  const [estado, setEstado] = useState<EstadoArca | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [probando, setProbando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const actual = await api.get<ConfigArca | null>(basePath)
      setCfg(actual ?? vacia(empresa))
      setPuntoVenta(String((actual ?? vacia(empresa)).punto_venta))
    } catch (err) {
      setError(describirError(err))
      setCfg(vacia(empresa))
    } finally {
      setCargando(false)
    }
    // El estado no bloquea la pantalla: una instancia con un LibraCore viejo no
    // tiene el endpoint y el formulario tiene que funcionar igual.
    try {
      setEstado(await api.get<EstadoArca>(`${basePath}/estado`))
    } catch {
      setEstado(null)
    }
  }, [basePath, empresa])

  useEffect(() => { void cargar() }, [cargar])

  async function guardar() {
    if (!cfg) return
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      await api.put(basePath, {
        empresa: cfg.empresa, cuit: cfg.cuit, punto_venta: Number(puntoVenta) || 1,
        ambiente: cfg.ambiente, alias: cfg.alias,
      })
      setAviso('Guardado.')
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  /** 🔴 El `ambiente` viaja SIEMPRE, incluso para el que está en uso.
   *
   *  Sin él el backend cae al selector, que casi siempre es el mismo — y esa
   *  coincidencia es justo lo que hace peligroso el descuido: funciona en todas
   *  las pruebas y falla el día que el operador sube el par de producción
   *  estando parado en homologación, pisando el que no era.
   */
  async function subir(ambiente: AmbienteArca, tramo: 'certificado' | 'clave', archivo: File) {
    if (!cfg) return
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      await api.postForm(
        `${basePath}/${tramo}?empresa=${encodeURIComponent(cfg.empresa)}`
        + `&ambiente=${encodeURIComponent(ambiente)}`,
        form,
      )
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function quitarCredenciales(ambiente: AmbienteArca) {
    if (!cfg) return
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      await api.del(
        `${basePath}/credenciales?empresa=${encodeURIComponent(cfg.empresa)}`
        + `&ambiente=${encodeURIComponent(ambiente)}`,
      )
      setAviso(`Se quitó el par de ${NOMBRE_DEL_AMBIENTE[ambiente].toLowerCase()}.`)
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function probar() {
    if (!cfg) return
    setProbando(true)
    setError(null)
    setAviso(null)
    try {
      const r = await api.post<{ ok: boolean; ambiente?: string }>(
        `${basePath}/probar?empresa=${encodeURIComponent(cfg.empresa)}`, {},
      )
      setAviso(`Autenticado OK (${r.ambiente})`)
    } catch (err) {
      setError(describirError(err))
    } finally {
      setProbando(false)
    }
  }

  if (cargando || !cfg) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />ARCA (facturación electrónica)
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="col-span-full">
          <TutorialArcaCertificado />
          <TutorialArcaPadron producto={producto} />
        </div>

        {estado && (
          <div className="col-span-full"><AvisoDeVencimiento estado={estado} /></div>
        )}

        <Campo id="arca-cuit" label="CUIT" value={cfg.cuit} onChange={(v) => setCfg({ ...cfg, cuit: v })} />
        <Campo
          id="arca-punto-venta" label="Punto de venta" value={puntoVenta}
          onChange={setPuntoVenta}
        />
        <div className="grid gap-2">
          <Label>Ambiente</Label>
          <Select value={cfg.ambiente} onValueChange={(v) => setCfg({ ...cfg, ambiente: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="homologacion">Homologación (pruebas)</SelectItem>
              <SelectItem value="produccion">Producción</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Campo id="arca-alias" label="Alias" value={cfg.alias} onChange={(v) => setCfg({ ...cfg, alias: v })} />

        <div className="col-span-full grid gap-3">
          {/* 🔑 El aviso va ANTES de los dos bloques: es la respuesta a "¿puedo
              facturar?", y responderla después de dos formularios de subida la
              deja abajo del pliegue justo cuando dice que no. */}
          <AvisoDelSelector cfg={cfg} />
          {AMBIENTES_ARCA.map((amb) => (
            <ParDeCredenciales
              key={amb}
              ambiente={amb}
              par={parDe(cfg, amb)}
              enUso={cfg.ambiente === amb}
              disabled={ocupado}
              onArchivo={(tramo, f) => void subir(amb, tramo, f)}
              onQuitar={() => void quitarCredenciales(amb)}
            />
          ))}
        </div>

        <AccionesDeSeccion>
          <Button disabled={ocupado} onClick={() => void guardar()}>
            <Save />{ocupado ? 'Guardando…' : 'Guardar ARCA'}
          </Button>
          {estado?.configurado && (
            <Button type="button" variant="outline" disabled={probando} onClick={() => void probar()}>
              <Send />{probando ? 'Probando…' : 'Probar conexión'}
            </Button>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
          {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
        </AccionesDeSeccion>
      </CardContent>
    </Card>
  )
}

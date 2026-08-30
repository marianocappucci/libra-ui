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
}

const VACIA: ConfigArca = {
  empresa: 'default', cuit: '', punto_venta: 1, ambiente: 'homologacion', alias: '',
  certificado_path: '', clave_path: '', tiene_certificado: false, tiene_clave: false,
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
function SubirMitad({ label, accept, cargado, disabled, onArchivo }: {
  label: string
  accept: string
  cargado: boolean
  disabled: boolean
  onArchivo: (f: File) => void
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {cargado && <BadgeEstado tono="ok" className="w-fit"><CheckCircle2 />Cargado</BadgeEstado>}
      <Input
        type="file" accept={accept} disabled={disabled} aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onArchivo(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Facturación electrónica.
 *
 *  `basePath` existe porque los productos ya publicaron rutas distintas
 *  (`/config/arca` en cuatro, `/api/config/arca` en Contalibra y Restolibra) y
 *  cambiar el prefijo rompe el frontend desplegado. La ruta se normaliza
 *  producto por producto, no de prepo desde el kit.
 */
export function ArcaCard({ producto, basePath = '/config/arca' }: {
  producto: string
  basePath?: string
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
      setCfg(actual ?? VACIA)
      setPuntoVenta(String((actual ?? VACIA).punto_venta))
    } catch (err) {
      setError(describirError(err))
      setCfg(VACIA)
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
  }, [basePath])

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

  async function subir(tramo: 'certificado' | 'clave', archivo: File) {
    if (!cfg) return
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      await api.postForm(
        `${basePath}/${tramo}?empresa=${encodeURIComponent(cfg.empresa)}`, form,
      )
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function quitarCredenciales() {
    if (!cfg) return
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      await api.del(`${basePath}/credenciales?empresa=${encodeURIComponent(cfg.empresa)}`)
      setAviso('Se quitaron el certificado y la clave.')
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

        <SubirMitad
          label="Certificado (.crt)" accept=".crt,.pem" cargado={cfg.tiene_certificado}
          disabled={ocupado} onArchivo={(f) => void subir('certificado', f)}
        />
        <SubirMitad
          label="Clave privada (.key)" accept=".key,.pem" cargado={cfg.tiene_clave}
          disabled={ocupado} onArchivo={(f) => void subir('clave', f)}
        />

        <AccionesDeSeccion>
          <Button disabled={ocupado} onClick={() => void guardar()}>
            <Save />{ocupado ? 'Guardando…' : 'Guardar ARCA'}
          </Button>
          {estado?.configurado && (
            <Button type="button" variant="outline" disabled={probando} onClick={() => void probar()}>
              <Send />{probando ? 'Probando…' : 'Probar conexión'}
            </Button>
          )}
          {(cfg.tiene_certificado || cfg.tiene_clave) && (
            <Button type="button" variant="outline" disabled={ocupado} onClick={() => void quitarCredenciales()}>
              Quitar certificado y clave
            </Button>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
          {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
        </AccionesDeSeccion>
      </CardContent>
    </Card>
  )
}

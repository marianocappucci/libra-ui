/** La sección "Empresa": los datos que encabezan comprobantes y PDF, y el logo.
 *
 *  Van en **una sola tarjeta**, como en Contalibra. Hasta hoy este paquete los
 *  partía en dos (`EmpresaCard` + `LogoCard`), y era la diferencia más visible
 *  entre la Configuración de Contalibra y la de los otros seis: una pantalla
 *  con una tarjeta contra una con dos.
 *
 *  ## La condición de IVA: tres opciones explicadas, no cinco peladas
 *
 *  Contalibra ofrece `Monotributista (emite Factura C)`, `Responsable Inscripto
 *  (emite Factura A y B)` e `IVA Exento (emite Factura B)`. Este paquete
 *  ofrecía además `Consumidor Final` y `No Alcanzado`, **que no son
 *  condiciones de un emisor**: son del receptor. Un emisor no puede estar "no
 *  alcanzado" y facturar.
 *
 *  🔴 Pero una instancia puede tener uno de esos dos ya guardado. Si la lista
 *  se recorta a secas, el `<Select>` no encuentra el valor, muestra el campo
 *  vacío, y **el primer guardado lo pisa en silencio**. Por eso el valor
 *  guardado que no esté en la lista se agrega como una opción más, marcada.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, CheckCircle2, Save, Upload } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { Campo, AccionesDeSeccion } from './campos'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export type DatosEmpresa = {
  empresa_nombre: string
  empresa_direccion: string
  empresa_cuit: string
  empresa_telefono: string
  empresa_email: string
  empresa_iibb: string
  empresa_iva_condition: string
  empresa_inicio_actividades: string
}

const VACIO: DatosEmpresa = {
  empresa_nombre: '', empresa_direccion: '', empresa_cuit: '', empresa_telefono: '',
  empresa_email: '', empresa_iibb: '', empresa_iva_condition: 'Monotributista',
  empresa_inicio_actividades: '',
}

/** Las condiciones de un **emisor**, con qué comprobante emite cada una. */
export const CONDICIONES_IVA: { valor: string; label: string }[] = [
  { valor: 'Monotributista', label: 'Monotributista (emite Factura C)' },
  { valor: 'Responsable Inscripto', label: 'Responsable Inscripto (emite Factura A y B)' },
  { valor: 'IVA Exento', label: 'IVA Exento (emite Factura B)' },
]

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

export function EmpresaCard({ basePath = '/api/config/empresa' }: { basePath?: string } = {}) {
  const [datos, setDatos] = useState<DatosEmpresa>(VACIO)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // `version` fuerza a recargar la imagen después de subir o borrar: el
  // navegador cachea la URL y sin esto se sigue viendo el logo anterior aunque
  // el nuevo ya esté en el servidor.
  const [version, setVersion] = useState(0)
  const [hayLogo, setHayLogo] = useState<boolean | null>(null)
  const inputLogo = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setDatos(await api.get<DatosEmpresa>(basePath))
    } catch (err) {
      setError(describirError(err))
    } finally {
      setCargando(false)
    }
  }, [basePath])

  useEffect(() => { void cargar() }, [cargar])

  useEffect(() => {
    let vivo = true
    fetch(`${basePath}/logo`, { credentials: 'include' })
      .then((r) => { if (vivo) setHayLogo(r.ok) })
      .catch(() => { if (vivo) setHayLogo(false) })
    return () => { vivo = false }
  }, [basePath, version])

  async function guardar() {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      setDatos(await api.put<DatosEmpresa>(basePath, datos))
      setAviso('Datos guardados.')
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function subirLogo(archivo: File) {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      const form = new FormData()
      form.append('logo', archivo)
      await api.postForm(`${basePath}/logo`, form)
      setVersion((v) => v + 1)
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
      if (inputLogo.current) inputLogo.current.value = ''
    }
  }

  async function quitarLogo() {
    setError(null)
    setAviso(null)
    try {
      await api.del(`${basePath}/logo`)
      setVersion((v) => v + 1)
    } catch (err) {
      setError(describirError(err))
    }
  }

  // Si lo guardado no está entre las tres condiciones, entra como una opción
  // más para que el `<Select>` lo pueda mostrar. Ver el docstring del módulo.
  const condiciones = CONDICIONES_IVA.some((c) => c.valor === datos.empresa_iva_condition)
    || !datos.empresa_iva_condition
    ? CONDICIONES_IVA
    : [...CONDICIONES_IVA, { valor: datos.empresa_iva_condition, label: datos.empresa_iva_condition }]

  if (cargando) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4" />Datos de la empresa
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Campo id="cfg-empresa_nombre" label="Nombre" value={datos.empresa_nombre} onChange={(v) => setDatos({ ...datos, empresa_nombre: v })} />
        <Campo id="cfg-empresa_cuit" label="CUIT" placeholder="20-12345678-9" value={datos.empresa_cuit} onChange={(v) => setDatos({ ...datos, empresa_cuit: v })} />
        <Campo id="cfg-empresa_direccion" label="Dirección" value={datos.empresa_direccion} onChange={(v) => setDatos({ ...datos, empresa_direccion: v })} />
        <Campo id="cfg-empresa_telefono" label="Teléfono" value={datos.empresa_telefono} onChange={(v) => setDatos({ ...datos, empresa_telefono: v })} />
        <Campo id="cfg-empresa_email" label="Email" value={datos.empresa_email} onChange={(v) => setDatos({ ...datos, empresa_email: v })} />
        <Campo id="cfg-empresa_iibb" label="Ingresos Brutos" value={datos.empresa_iibb} onChange={(v) => setDatos({ ...datos, empresa_iibb: v })} />
        <div className="grid gap-2">
          <Label>Condición de IVA</Label>
          <Select
            value={datos.empresa_iva_condition}
            onValueChange={(v) => setDatos({ ...datos, empresa_iva_condition: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {condiciones.map((c) => (
                <SelectItem key={c.valor} value={c.valor}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Campo
          id="cfg-empresa_inicio_actividades" label="Inicio de actividades" type="date"
          value={datos.empresa_inicio_actividades}
          onChange={(v) => setDatos({ ...datos, empresa_inicio_actividades: v })}
        />

        <div className="col-span-full grid gap-2">
          <Label>Logo (PNG o JPG)</Label>
          {hayLogo && (
            <div className="flex items-center gap-3">
              <img
                src={`${basePath}/logo?v=${version}`} alt="Logo de la empresa"
                className="h-16 max-w-48 rounded-md border bg-white object-contain p-1.5"
              />
              <BadgeEstado tono="ok"><CheckCircle2 />Logo cargado</BadgeEstado>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={inputLogo} type="file" accept=".png,.jpg,.jpeg" disabled={ocupado}
              aria-label="Logo (PNG o JPG)" className="max-w-sm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirLogo(f) }}
            />
            {hayLogo && (
              <Button type="button" variant="outline" size="sm" onClick={() => void quitarLogo()}>
                <Upload className="rotate-180" />Quitar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Sale en el encabezado de los comprobantes. Dejalo vacío para mantener el logo actual.
          </p>
        </div>

        <AccionesDeSeccion>
          <Button disabled={ocupado} onClick={() => void guardar()}>
            <Save />{ocupado ? 'Guardando…' : 'Guardar datos de empresa'}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
          {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
        </AccionesDeSeccion>
      </CardContent>
    </Card>
  )
}

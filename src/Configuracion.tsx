/** La pantalla de Configuración compartida — **la copia única de la familia**.
 *
 *  > *"Quiero que todas las pantallas de configuración de todas las
 *  > aplicaciones de la familia Libra sean iguales a la de Contalibra […] la
 *  > idea es que después si hago una modificación en la configuración o una
 *  > actualización se actualice en todas, que todo esté normalizado y sea
 *  > transversal."* — el humano, 2026-08-29.
 *
 *  Antes de ese pedido había **tres pantallas distintas** para lo mismo:
 *
 *  - Contalibra y Restolibra, con un `Config.tsx` propio de ~950 líneas cada
 *    uno: pestañas de shadcn, sub-navegación lateral en Integraciones, botón de
 *    *Backup rápido*, y los **tutoriales** de MercadoPago, ARCA y Gmail;
 *  - Gestiolibra, MedLibra, VentaLibra y LibraClub, con `createConfiguracion`
 *    de este paquete: pestañas planas, sin sub-navegación, sin backup rápido y
 *    sin ningún tutorial;
 *  - LibraCargo con pestañas propias y LibraDesk con un conmutador por rutas.
 *
 *  🔴 **Mientras la versión buena viviera adentro de un producto, arreglarla no
 *  arreglaba a los otros siete.** Ese es el punto del pedido, y es la razón de
 *  que esta pantalla —tutoriales incluidos— esté acá.
 *
 *  ## La estructura, calcada de Contalibra
 *
 *      Configuración                                    [Backup rápido]
 *      ─────────────────────────────────────────────────────────────
 *      [Empresa] [Integraciones] [·las del producto·] [Datos / Backup]
 *      ─────────────────────────────────────────────────────────────
 *
 *  **Integraciones agrupa MercadoPago / ARCA / Email en una sub-navegación
 *  lateral**, no como pestañas de primer nivel. Es lo que hacía la vieja
 *  `config.html` y lo que Contalibra conservó: las tres son "con qué otro
 *  sistema habla esto", y sacarlas al primer nivel deja una barra de siete
 *  pestañas donde tres son de lo mismo.
 *
 *  ## El "según corresponda" sigue siendo del producto
 *
 *  MedLibra no imprime tickets de comanda; LibraDesk no factura por ARCA —manda
 *  a Contalibra o a SOS Contador—; VentaLibra usa balanza. El producto declara
 *  qué integraciones tiene y qué secciones propias agrega; lo que **no** puede
 *  hacer es cambiar el armado, que es lo que se venía divergiendo.
 *
 *  ## La sección activa va en la URL
 *
 *  `?seccion=datos`, y dentro de Integraciones `?integracion=arca`, para que se
 *  pueda mandar "andá a Datos / Backup" por mensaje y el botón "atrás" del
 *  navegador haga lo que se espera.
 */
import type { ComponentType, ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Building2, Database, Download, Mail, Phone, Power, ShieldCheck,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TituloPantalla } from './titulo-pantalla'
import { ArcaCard } from './configuracion/arca'
import { DatosBackupCard, ResguardoExternoCard } from './configuracion/datos'
import { EmailCard } from './configuracion/email'
import { EmpresaCard } from './configuracion/empresa'
import { MercadoPagoCard, type TextoAutoFacturar } from './configuracion/mercadopago'

export type { BackupGuardado, ResguardoExterno } from './configuracion/datos'
export type { DatosEmpresa } from './configuracion/empresa'
export type { ConfigArca, EstadoArca } from './configuracion/arca'
export type { ConfigMercadoPago, TextoAutoFacturar } from './configuracion/mercadopago'
export { ArcaCard, DatosBackupCard, EmailCard, EmpresaCard, MercadoPagoCard, ResguardoExternoCard }
export {
  Tutorial, TutorialArcaCertificado, TutorialArcaPadron, TutorialCode, TutorialGmail,
  TutorialLink, TutorialMercadoPago, TutorialNote, TutorialStep,
} from './configuracion/tutoriales'

export type SeccionConfig = {
  clave: string
  label: string
  icono?: ComponentType<{ className?: string }>
  contenido: ReactNode
}

/** Con qué otros sistemas habla el producto. Lo que no se declara, no aparece:
 *  una pestaña de MercadoPago en un producto sin endpoints de MercadoPago
 *  guarda credenciales que nadie va a leer. */
export type Integraciones = {
  mercadopago?: boolean | {
    basePath?: string
    rutaWebhook?: string
    autoFacturar?: TextoAutoFacturar | false
  }
  arca?: boolean | { basePath?: string }
  email?: boolean | { basePath?: string }
  /** Integraciones propias del producto, en la misma sub-navegación. El caso
   *  vivo es la **Facturación de LibraDesk**, que no emite por ARCA sino que
   *  manda lo facturable a Contalibra o a SOS Contador: es una integración con
   *  otro sistema, así que va acá y no como pestaña de primer nivel. */
  extra?: SeccionConfig[]
}

function opciones<T extends object>(valor: boolean | T | undefined): T | null {
  if (!valor) return null
  return (valor === true ? {} : valor) as T
}

/** La sub-navegación lateral de Integraciones.
 *
 *  🔑 Al elegir una sub-sección se reescriben **las dos** claves del query
 *  (`seccion` e `integracion`). Escribir sólo `integracion` borraría `seccion`
 *  —`setParams` reemplaza el query entero, no lo mergea— y la pantalla saltaría
 *  a la primera pestaña en el mismo click.
 */
function SubNavegacion({ secciones }: { secciones: SeccionConfig[] }) {
  const [params, setParams] = useSearchParams()
  const pedida = params.get('integracion')
  const actual = secciones.find((s) => s.clave === pedida) ?? secciones[0]

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex shrink-0 flex-row gap-1 sm:w-48 sm:flex-col sm:border-r sm:pr-2">
        {secciones.map((s) => {
          const Icono = s.icono
          const activa = actual.clave === s.clave
          return (
            <button
              key={s.clave} type="button"
              aria-current={activa ? 'page' : undefined}
              onClick={() => setParams({ seccion: 'integraciones', integracion: s.clave })}
              className={`flex items-center gap-2 rounded-md border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                activa
                  ? 'border-primary bg-primary/5 font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted'
              }`}
            >
              {Icono && <Icono className="size-4" />}{s.label}
            </button>
          )
        })}
      </div>
      <div className="max-w-2xl flex-1">{actual.contenido}</div>
    </div>
  )
}

export function createConfiguracion({
  icono, producto, integraciones, propias = [], empresa, datos, backupRapido = true,
}: {
  /** El icono que el sidebar de este producto le da a /configuracion. */
  icono: ComponentType<{ className?: string }>
  /** Cómo se llama el producto. Sale en los tutoriales de Gmail y de Padrón
   *  A13, que le piden al cliente que nombre **este** sistema. Escribir
   *  "Contalibra" en el kit haría que MedLibra le pida al cliente una
   *  contraseña de aplicación llamada *Contalibra*. */
  producto: string
  integraciones?: Integraciones
  /** Las secciones propias del producto. Van entre Integraciones y
   *  Datos / Backup: lo que se parametriza al arrancar antes de lo que se toca
   *  una vez y da miedo. */
  propias?: SeccionConfig[]
  empresa?: false | { basePath?: string }
  datos?: false | { basePath?: string }
  /** El botón fijo al final de la barra. Baja una copia sin entrar a la
   *  pestaña: el cliente lo aprieta antes de hacer algo que lo pone nervioso. */
  backupRapido?: boolean
}) {
  const opcEmpresa = empresa === false ? null : (empresa ?? {})
  const opcDatos = datos === false ? null : (datos ?? {})
  const basePathDatos = opcDatos?.basePath ?? '/api/config'

  const opcMp = opciones(integraciones?.mercadopago)
  const opcArca = opciones(integraciones?.arca)
  const opcEmail = opciones(integraciones?.email)

  const deIntegraciones: SeccionConfig[] = [
    ...(opcMp ? [{
      clave: 'mercadopago', label: 'MercadoPago', icono: Phone,
      contenido: <MercadoPagoCard {...opcMp} />,
    }] : []),
    ...(opcArca ? [{
      clave: 'arca', label: 'ARCA / AFIP', icono: ShieldCheck,
      contenido: <ArcaCard producto={producto} {...opcArca} />,
    }] : []),
    ...(opcEmail ? [{
      clave: 'email', label: 'Email / SMTP', icono: Mail,
      contenido: <EmailCard producto={producto} {...opcEmail} />,
    }] : []),
    ...(integraciones?.extra ?? []),
  ]

  const secciones: SeccionConfig[] = [
    ...(opcEmpresa ? [{
      clave: 'empresa', label: 'Empresa', icono: Building2,
      contenido: <EmpresaCard {...opcEmpresa} />,
    }] : []),
    ...(deIntegraciones.length > 0 ? [{
      clave: 'integraciones', label: 'Integraciones', icono: Power,
      contenido: <SubNavegacion secciones={deIntegraciones} />,
    }] : []),
    ...propias,
    ...(opcDatos ? [{
      clave: 'datos', label: 'Datos / Backup', icono: Database,
      contenido: <DatosBackupCard basePath={basePathDatos} />,
    }] : []),
  ]

  if (secciones.length === 0) {
    throw new Error('createConfiguracion necesita al menos una sección')
  }

  return function Configuracion() {
    const [params, setParams] = useSearchParams()
    const pedida = params.get('seccion')
    const actual = secciones.find((s) => s.clave === pedida) ?? secciones[0]

    return (
      <div className="grid gap-4">
        <TituloPantalla icono={icono}>Configuración</TituloPantalla>

        {/* La barra separada del contenido por una línea, y el botón de backup
            rápido fijo a la derecha — igual que Contalibra. El `pb-2` es el
            aire entre las píldoras y esa línea: sin él el `TabsList` queda
            apoyado sobre el borde. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          {/* `value` y no `defaultValue`: la sección la manda la URL, así que
              el conmutador es controlado. Con `defaultValue` un `?seccion=`
              distinto al arrancar pintaría una pestaña y mostraría otra. */}
          <Tabs value={actual.clave} onValueChange={(v) => setParams({ seccion: v })}>
            <TabsList>
              {secciones.map((s) => {
                const Icono = s.icono
                return (
                  <TabsTrigger key={s.clave} value={s.clave}>
                    {Icono && <Icono className="size-4" />}{s.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
          {backupRapido && opcDatos && (
            <Button asChild size="sm" variant="outline">
              <a href={`${basePathDatos}/backup-ahora`} download><Download />Backup rápido</a>
            </Button>
          )}
        </div>

        {/* El contenido va afuera del `Tabs` y no en un `TabsContent`: las
            secciones son componentes con estado y pedidos propios, y Radix
            desmonta la pestaña inactiva. Adentro, cambiar de pestaña y volver
            recargaría el formulario y perdería lo tipeado sin guardar; acá el
            contenido lo elige la URL. */}
        <div className="grid gap-4">{actual.contenido}</div>
      </div>
    )
  }
}

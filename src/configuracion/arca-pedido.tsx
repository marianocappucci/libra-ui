/** «Generar pedido de certificado»: la clave de ARCA nace en el servidor (libracore ADR-036, kit ADR-041).
 *
 *  Para una empresa nueva —o una renovación— el operador no genera nada afuera: aprieta el botón, el
 *  motor crea la clave **dentro del servidor** y esta pantalla ofrece **sólo el `.csr`**, que es
 *  público, con los pasos de ARCA armados con el CUIT y el alias de esa empresa. Cuando ARCA devuelve el
 *  `.crt` se sube en la misma tarjeta, **sin campo de clave**: el motor comprueba que empareja con la
 *  clave del pedido y deja el par instalado.
 *
 *  ## Lo que esta pieza tiene que hacer imposible
 *
 *  1. 🔴 **Que la clave pase por el navegador.** Acá no hay ningún lugar donde aparezca: el `POST`
 *     devuelve el `.csr` y el estado del pedido, y la descarga es un enlace a `…/pedido.csr`.
 *  2. 🔴 **Perder una clave sin querer.** Descartar un pedido borra su clave, y si el `.csr` ya está en
 *     ARCA el `.crt` que vuelva queda sin pareja. Por eso es un diálogo aparte que lo dice, y no un botón
 *     que actúa al primer clic. (Generar un pedido nuevo con uno pendiente ni se ofrece: se descarta
 *     primero, a propósito.)
 *  3. Que se confundan los ambientes. Cada tarjeta es de **un** ambiente y los pasos que muestra son los
 *     de ese ambiente: el trámite de homologación (WSASS) y el de producción son dos cosas distintas.
 *
 *  El estado del pedido viene dentro del par (`par.pedido`) que el motor ya manda: no hay una llamada
 *  más para saber si hay uno pendiente.
 */
import { useState } from 'react'
import { Clock, Download, FilePlus2, ListChecks, Trash2 } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { AvisoEstado } from '../badge-estado'
import {
  aliasSugerido, nombreDelAmbiente, pasosParaArca, puedePedirCertificado,
  type AmbienteArca, type ParDeArca, type PedidoGenerado,
} from './arca-pares'
import { Campo } from './campos'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Lo que `ParDeCredenciales` necesita saber para ofrecer el pedido de **un** ambiente. */
export type ConfigPedido = {
  /** `wsfe` para la facturación, o el id del servicio (`wscpe`). */
  servicio: string
  /** Cómo se llama el servicio en pantalla (`Facturación electrónica`). */
  etiqueta: string
  /** El nombre del producto, para el alias sugerido. */
  producto: string
  /** La ruta del motor para ese tramo y ese ambiente, con `empresa` y `ambiente` ya en la query. */
  ruta: (tramo: 'pedido' | 'pedido.csr') => string
  /** Con qué se prellena el formulario: los datos de la empresa, si el producto los tiene. */
  cuit: string
  razonSocial: string
  /** Pide de nuevo el estado, **sin desmontar la tarjeta**: el diálogo vive adentro. */
  onCambio: () => Promise<void>
}

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

/** El enlace de descarga del `.csr`, dibujado como un botón. */
function DescargarCsr({ href, nombre, className }: { href: string; nombre: string; className?: string }) {
  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <a href={href} download={`${nombre}.csr`}><Download />Descargar el .csr</a>
    </Button>
  )
}

function PasosParaArca({ ambiente, servicio, alias, cuit }: {
  ambiente: AmbienteArca; servicio: string; alias: string; cuit: string
}) {
  return (
    <ol className="ml-4 list-decimal space-y-1.5 text-sm text-muted-foreground">
      {pasosParaArca({ ambiente, servicio, alias, cuit }).map((paso) => <li key={paso}>{paso}</li>)}
    </ol>
  )
}

/** El bloque del pedido de un par: el botón para generarlo, o —con uno pendiente— su estado.
 *
 *  Va entre el resumen del par y los campos de archivo. No pinta nada cuando el par ya está completo y
 *  vigente: ahí un botón de pedir certificado sería, casi siempre, un error. */
export function BloqueDePedido({ ambiente, par, disabled, contexto, config }: {
  ambiente: AmbienteArca
  par: ParDeArca
  disabled: boolean
  /** El servicio, sólo cuando la tarjeta muestra más de uno (ver `SubirMitad`). */
  contexto?: string
  config: ConfigPedido
}) {
  const [abierto, setAbierto] = useState(false)
  const [generado, setGenerado] = useState<PedidoGenerado | null>(null)
  const [descartando, setDescartando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cuit, setCuit] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [alias, setAlias] = useState('')

  const pendiente = par.pedido?.pendiente ? par.pedido : null
  const sufijo = `${contexto ? `${contexto} — ` : ''}${nombreDelAmbiente(ambiente)}`

  function abrirFormulario() {
    // Se prellena al abrir y no al montar: el CUIT puede haberse editado arriba mientras tanto.
    setCuit(config.cuit)
    setRazonSocial(config.razonSocial)
    setAlias(aliasSugerido(config.producto, config.servicio, ambiente))
    setGenerado(null)
    setError(null)
    setAbierto(true)
  }

  function verPasos() {
    setGenerado(null)
    setError(null)
    setAbierto(true)
  }

  async function generar() {
    setOcupado(true)
    setError(null)
    try {
      const r = await api.post<PedidoGenerado>(config.ruta('pedido'), {
        cuit: cuit.trim(), razon_social: razonSocial.trim(), alias: alias.trim(),
      })
      setGenerado(r)
      await config.onCambio()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function descartar() {
    setOcupado(true)
    setError(null)
    try {
      await api.del(config.ruta('pedido'))
      setDescartando(false)
      await config.onCambio()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  // Los datos con los que se muestran los pasos: los del pedido recién generado o, si se vuelve a abrir
  // uno pendiente, los que guardó el servidor.
  const dePasos = generado ?? pendiente
  const csr = dePasos ? config.ruta('pedido.csr') : ''

  return (
    <>
      {pendiente ? (
        <div className="grid gap-2 rounded-md border border-dashed p-3" role="group"
             aria-label={`Pedido de certificado — ${sufijo}`}>
          <AvisoEstado tono="curso" className="flex items-center gap-2">
            <Clock className="size-4 shrink-0" aria-hidden />
            Esperando el certificado de ARCA (pedido del {pendiente.creado})
          </AvisoEstado>
          <p className="text-xs text-muted-foreground">
            Alias <span className="font-mono">{pendiente.alias}</span> · CUIT {pendiente.cuit}.
            Cuando ARCA devuelva el certificado (.crt), subilo abajo: la clave ya está guardada en el servidor.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <DescargarCsr href={config.ruta('pedido.csr')} nombre={pendiente.alias} />
            <Button type="button" variant="outline" size="sm" disabled={disabled}
                    aria-label={`Ver los pasos para ARCA — ${sufijo}`} onClick={verPasos}>
              <ListChecks />Ver los pasos
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={disabled}
                    aria-label={`Descartar el pedido — ${sufijo}`}
                    onClick={() => { setError(null); setDescartando(true) }}>
              <Trash2 />Descartar pedido
            </Button>
          </div>
        </div>
      ) : puedePedirCertificado(par) ? (
        <div>
          <Button type="button" variant="outline" size="sm" className="w-fit" disabled={disabled}
                  aria-label={`Generar pedido de certificado — ${sufijo}`} onClick={abrirFormulario}>
            <FilePlus2 />Generar pedido de certificado
          </Button>
        </div>
      ) : null}

      <Dialog open={abierto} onOpenChange={(v) => { if (!ocupado) setAbierto(v) }}>
        <DialogContent className="max-w-lg" aria-label={`Pedido de certificado — ${sufijo}`}>
          {dePasos ? (
            <>
              <DialogHeader>
                <DialogTitle>{generado ? 'Pedido generado' : 'Pasos para ARCA'}</DialogTitle>
                <DialogDescription>
                  {config.etiqueta} — {nombreDelAmbiente(ambiente)}. La clave privada quedó guardada en el
                  servidor y no se puede descargar: de este pedido sólo sale el archivo .csr.
                </DialogDescription>
              </DialogHeader>
              <DescargarCsr href={csr} nombre={dePasos.alias} className="w-fit" />
              <PasosParaArca
                ambiente={ambiente} servicio={config.servicio} alias={dePasos.alias} cuit={dePasos.cuit}
              />
              <DialogFooter>
                <DialogClose asChild><Button type="button">Cerrar</Button></DialogClose>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Generar pedido de certificado</DialogTitle>
                <DialogDescription>
                  {config.etiqueta} — {nombreDelAmbiente(ambiente)}. Se crea una clave privada nueva
                  dentro del servidor, que no se puede descargar. De este paso sólo sale el archivo .csr, el
                  que se presenta ante ARCA.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <Campo id={`pedido-cuit-${ambiente}-${config.servicio}`} label="CUIT" value={cuit}
                       onChange={setCuit} ayuda="Sin guiones. El del titular del certificado." />
                <Campo id={`pedido-razon-${ambiente}-${config.servicio}`} label="Razón social"
                       value={razonSocial} onChange={setRazonSocial}
                       ayuda="Sin tildes: ARCA no las admite en el pedido." />
                <Campo id={`pedido-alias-${ambiente}-${config.servicio}`} label="Alias" value={alias}
                       onChange={setAlias}
                       ayuda="Sólo letras y números, sin guiones. ARCA lo muestra en su lista de certificados." />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={ocupado}>Cancelar</Button>
                </DialogClose>
                <Button type="button" disabled={ocupado} onClick={() => void generar()}>
                  {ocupado ? 'Generando…' : 'Generar pedido'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={descartando} onOpenChange={(v) => { if (!ocupado) setDescartando(v) }}>
        <DialogContent className="max-w-md" aria-label={`Descartar el pedido — ${sufijo}`}>
          <DialogHeader>
            <DialogTitle>Descartar el pedido de certificado</DialogTitle>
            <DialogDescription>
              Se borra el pedido y <strong>su clave privada</strong>. Si el archivo .csr ya se presentó
              ante ARCA, el certificado que devuelva no va a servir: habría que generar un pedido nuevo.
              El certificado que ya esté cargado no se toca.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={ocupado}>Cancelar</Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={ocupado} onClick={() => void descartar()}>
              {ocupado ? 'Descartando…' : 'Descartar el pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

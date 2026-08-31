/** Ver y descargar el QR de la caja de MercadoPago.
 *
 *  Habla con los dos endpoints que agrega
 *  `libracore.mp_config_router.build_mp_config_router`: `GET {basePath}/qr`
 *  (qué caja es) y `GET {basePath}/qr/{formato}` (los bytes).
 *
 *  ## 🔴 Por qué esto es una pantalla y no una instrucción
 *
 *  El QR de mostrador es un **cartel impreso**, y hasta hoy conseguirlo era
 *  entrar al panel de MercadoPago, encontrar la caja entre las de todos los
 *  productos y bajar el archivo. En la cuenta de prueba de esta familia hay
 *  **diez cajas** que se llaman parecido —`CONTADEV`, `CONTADEMO`, `RESTODEV`,
 *  `RESTODEMO`…—, y bajar la del vecino no da ningún error: da un cartel que
 *  cobra en la caja equivocada.
 *
 *  Acá la caja no se elige: es **la que esta instancia tiene configurada**.
 *
 *  ## 🔴 Y por qué la imagen la trae el motor
 *
 *  Las URLs que publica MercadoPago se sirven **sin autenticación** (medido
 *  contra la cuenta real). O sea que la URL *es* el cartel: quien la tenga
 *  puede imprimir el QR que cobra en esa cuenta. El motor baja los bytes y la
 *  URL no llega al navegador. De paso, el archivo se descarga con un nombre
 *  que se entiende en vez del hash de 64 caracteres de MercadoPago, y una
 *  instancia detrás de una red que no llega a `mercadopago.com` puede imprimir
 *  el cartel igual.
 */
import { useCallback, useState } from 'react'
import { Download, QrCode } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

/** Lo que devuelve `GET {basePath}/qr`. */
export type QrDeCaja = {
  /** El `external_id` **canónico de MercadoPago**, no el que está escrito en la
   *  configuración: el filtro de MP no distingue mayúsculas, así que una caja
   *  configurada `contadev` matchea `CONTADEV` y hay que mostrar cuál es de
   *  verdad. */
  pos_id: string
  pos_nombre: string
  pos_numero: number | null
  /** `prueba`, `produccion` o `indeterminado`. Ver `AVISO_DE_AMBIENTE`. */
  ambiente: string
  /** Cuáles de los tres archivos tiene publicados **esta** caja. */
  formatos: string[]
}

const FORMATOS: Record<string, { label: string; ayuda: string }> = {
  qr: {
    label: 'QR solo',
    ayuda: 'La imagen del código, sin marco. Para pegar en un cartel propio.',
  },
  cartel: {
    label: 'Cartel de MercadoPago',
    ayuda: 'El cartel armado, con la marca y las instrucciones. Imagen PNG.',
  },
  pdf: {
    label: 'Cartel para imprimir',
    ayuda: 'El mismo cartel en PDF, que es lo que conviene mandar a la impresora.',
  },
}

function describirError(err: unknown): string {
  // 🔴 El `detail` del motor es el mensaje **útil**: distingue "falta el POS
  // ID" de "esa caja no está en esta cuenta", que se arreglan en lugares
  // distintos. Reemplazarlo por un texto propio pierde justamente eso.
  if (err instanceof ApiError) return err.detail
  return 'No se pudo consultar el QR de la caja.'
}

export function QrDeLaCajaDialog({ basePath }: { basePath: string }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<QrDeCaja | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 🔴 Se consulta al ABRIR, no al montar. Cada apertura le cuesta dos
  // llamadas a la API de MercadoPago al motor; hacerlas en cada carga de
  // Configuración —en los ocho productos— es pagarlas siempre para una
  // pantalla que casi nunca se mira.
  const alCambiar = useCallback(async (open: boolean) => {
    setAbierto(open)
    // 🔴 `if (!open) return` y no sólo `if (open)`: `onOpenChange` dispara
    // **también al cerrar**, así que sin esta salida cerrar el diálogo se
    // llevaría otras dos llamadas a la API de MercadoPago sin mostrar nada.
    if (!open) return
    setCargando(true)
    setError(null)
    setDatos(null)
    try {
      setDatos(await api.get<QrDeCaja>(`${basePath}/qr`))
    } catch (err) {
      setError(describirError(err))
    } finally {
      setCargando(false)
    }
  }, [basePath])

  return (
    <Dialog open={abierto} onOpenChange={(v) => void alCambiar(v)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <QrCode />Ver QR de la caja
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>QR de la caja</DialogTitle>
          <DialogDescription>
            El cartel que se pega en el mostrador. Es el de la caja que esta
            instancia tiene configurada.
          </DialogDescription>
        </DialogHeader>

        {cargando && <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>}

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </p>
        )}

        {datos && (
          <div className="grid gap-3">
            {/* 🔴 El aviso de ambiente va TAMBIÉN acá, y no sólo en la tarjeta.
                Un QR de una cuenta de prueba se ve idéntico a uno real y no
                cobra nada: sin decirlo en el momento de imprimirlo, el error se
                descubre con el cartel ya pegado en el mostrador. */}
            {datos.ambiente === 'prueba' && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <strong>Este QR es de una cuenta de prueba.</strong> Escanearlo no
                cobra nada: no lo imprimas para el mostrador.
              </p>
            )}
            {datos.ambiente === 'indeterminado' && (
              <p className="rounded-md border p-3 text-xs text-muted-foreground">
                Todavía no se sabe si la credencial es de prueba o real, así que
                tampoco si este QR cobra de verdad. Probá la conexión para
                averiguarlo.
              </p>
            )}

            <p className="text-sm">
              <strong>{datos.pos_nombre || 'Caja sin nombre'}</strong>
              {' — '}
              <span className="font-mono text-xs">{datos.pos_id}</span>
            </p>

            <img
              src={`${basePath}/qr/qr`}
              alt={`Código QR de la caja ${datos.pos_id}`}
              className="mx-auto w-56 max-w-full rounded-md border bg-white p-2"
            />

            <div className="grid gap-2">
              {datos.formatos.map((formato) => {
                const texto = FORMATOS[formato]
                if (!texto) return null
                return (
                  <a
                    key={formato}
                    href={`${basePath}/qr/${formato}`}
                    download
                    className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{texto.label}</span>
                      <span className="block text-xs text-muted-foreground">{texto.ayuda}</span>
                    </span>
                    <Download className="size-4 shrink-0" aria-hidden />
                  </a>
                )
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

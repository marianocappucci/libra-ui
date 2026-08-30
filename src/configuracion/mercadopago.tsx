/** La sección de MercadoPago, una sola para toda la familia.
 *
 *  Hasta hoy había **cuatro** formularios distintos para lo mismo: el `MpTab`
 *  de Contalibra, el de Restolibra, el `ConfigMercadoPago` de VentaLibra y el
 *  de LibraClub. Ninguno tenía los mismos campos que otro — a VentaLibra le
 *  faltaba el webhook secret, a LibraClub la descripción del cobro y la
 *  alícuota, y sólo Contalibra mostraba la URL del webhook.
 *
 *  Habla con `libracore.mp_config_router.build_mp_config_router`.
 *
 *  ## 🔴 Los secretos vuelven ENMASCARADOS, y eso cambia el formulario
 *
 *  `GET` devuelve `APP_USR-1234…9f2a`, no el token. Si el campo mostrara ese
 *  valor y el `PUT` lo mandara tal cual, **guardar la descripción del cobro
 *  reemplazaría el token por su propia máscara** y el cobro dejaría de andar.
 *
 *  Por eso los dos campos secretos arrancan **vacíos**, con la máscara como
 *  `placeholder`: se ve cuál credencial está cargada sin que el valor visible
 *  sea el que se manda. Vacío significa "no lo toqués" —el backend lo entiende
 *  así— y para desconectar la cuenta está el botón de quitar. Es el mismo
 *  mecanismo que la contraseña de SMTP en `ConfiguracionSmtp`.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Phone, Save, Send } from 'lucide-react'

import { api, ApiError } from '../api-client'
import { BadgeEstado, type TonoEstado } from '../badge-estado'
import { Campo, AccionesDeSeccion } from './campos'
import { TutorialMercadoPago } from './tutoriales'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { fechaHora } from '@/lib/fechas'

/** Lo que devuelve `GET {basePath}`. Los dos secretos vienen enmascarados y
 *  acompañados de un booleano que dice si hay algo cargado. */
export type ConfigMercadoPago = {
  mp_access_token: string
  mp_access_token_cargado: boolean
  mp_webhook_secret: string
  mp_webhook_secret_cargado: boolean
  mp_concepto_descripcion: string
  mp_iva_rate: string
  mp_user_id: string
  mp_pos_id: string
  mp_auto_facturar_ventas: boolean
  /** De qué ambiente es la credencial: `''` (no hay), `prueba`, `produccion` o
   *  `indeterminado`. Lo deriva el motor — ver `AVISO_DE_AMBIENTE`. */
  mp_ambiente?: string
  /** Cuándo se determinó, `'YYYY-MM-DD HH:MM:SS'`. Vacío cuando no hizo falta
   *  preguntar (un token `TEST-` se reconoce solo). */
  mp_ambiente_verificado?: string
}

const VACIA: ConfigMercadoPago = {
  mp_access_token: '', mp_access_token_cargado: false,
  mp_webhook_secret: '', mp_webhook_secret_cargado: false,
  mp_concepto_descripcion: '', mp_iva_rate: '0',
  mp_user_id: '', mp_pos_id: '', mp_auto_facturar_ventas: false,
  mp_ambiente: '', mp_ambiente_verificado: '',
}

/** Qué pastilla le corresponde a cada ambiente.
 *
 *  🔴 **Por qué esto está en pantalla.** MercadoPago no tiene un ambiente de
 *  homologación como ARCA: no hay host de sandbox, es el mismo
 *  `api.mercadopago.com` y lo que define el ambiente es el token. Sin este
 *  cartel las dos fallas son mudas — un token de producción en una instancia
 *  `dev` cobra plata de verdad, y uno de prueba en la instancia de un cliente
 *  no cobra nada — y las dos se ven exactamente igual: el QR se genera y la
 *  orden se crea.
 *
 *  `indeterminado` no es un error: es "hay un token y todavía nadie le
 *  preguntó a MercadoPago de quién es". Se sale de ahí con "Probar conexión".
 */
const AVISO_DE_AMBIENTE: Record<string, { tono: TonoEstado; texto: string; ayuda: string }> = {
  // ⚠️ Los tres textos arrancan con "Ambiente" y NO con "Credenciales": el
  // tutorial de esta misma tarjeta ya dice "Credenciales de producción" —es el
  // nombre de la pestaña del panel de MercadoPago—, y dos frases casi iguales
  // en la misma pantalla diciendo cosas distintas se leen mal.
  prueba: {
    tono: 'atencion',
    texto: 'Ambiente de prueba',
    ayuda: 'Los cobros de esta instancia NO son reales: no entra plata a ninguna cuenta.',
  },
  produccion: {
    tono: 'ok',
    texto: 'Ambiente de producción',
    ayuda: 'Los cobros de esta instancia son reales y entran a la cuenta del titular.',
  },
  indeterminado: {
    tono: 'neutro',
    texto: 'Ambiente sin verificar',
    ayuda: 'Hay un Access Token cargado, pero todavía no se sabe si es de prueba o real. '
      + 'Probá la conexión para averiguarlo.',
  },
}

/** Si el QR de caja puede cobrar.
 *
 *  🔴 **Hacen falta los TRES, no sólo el token.** El QR de mostrador es el
 *  cartel impreso: el `user_id` es el collector de la cuenta y el `pos_id` es
 *  el external_id de la caja, y los dos van en la URL de la orden. Con el token
 *  solo, el POS no puede armar el cobro y el sintoma es un 404 que no dice eso.
 *
 *  El aviso venia de las pantallas propias de VentaLibra y LibraClub, que lo
 *  calculaban en el backend (`esta_configurado()`). Se calcula acá porque el
 *  router del motor no lo devuelve — y perderlo al unificar habria sido un
 *  retroceso: sin el, una caja mal configurada se descubre recien cuando un
 *  cliente escanea el cartel y no pasa nada.
 */
export function puedeCobrarPorQr(cfg: ConfigMercadoPago): boolean {
  return cfg.mp_access_token_cargado
    && cfg.mp_user_id.trim() !== ''
    && cfg.mp_pos_id.trim() !== ''
}

function describirError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

/** Qué texto va en el campo secreto cuando está vacío: la máscara si hay algo
 *  cargado, y una pista de formato si no. */
function placeholderDeSecreto(cargado: boolean, mascara: string, pista: string): string {
  return cargado ? `${mascara} — dejalo vacío para no cambiarlo` : pista
}

/** El texto del toggle de facturación automática lo pone el producto: en
 *  Contalibra factura *ventas*, en LibraClub *turnos*, en LibraCargo *órdenes*.
 *  Sin esto el toggle diría "ventas" en un club de pádel. */
export type TextoAutoFacturar = { label: string; ayuda: string }

const AUTO_FACTURAR_POR_DEFECTO: TextoAutoFacturar = {
  label: 'Facturar automáticamente las ventas cobradas por QR',
  ayuda: 'Al acreditarse el pago, se emite la factura con CAE y queda vinculada a la venta. '
    + 'Sin cliente asignado se emite a Consumidor Final. Apagado, la venta queda sin facturar '
    + 'y se emite desde el detalle de la venta.',
}

export function MercadoPagoCard({
  basePath = '/api/config/mercadopago',
  rutaWebhook = '/webhooks/mercadopago',
  autoFacturar = AUTO_FACTURAR_POR_DEFECTO,
  webhook = true,
}: {
  basePath?: string
  /** Dónde escucha el webhook ESTE producto. LibraClub lo tiene en
   *  `/api/portal/webhook`, no en la ruta de la familia. */
  rutaWebhook?: string
  /** `false` en un producto que todavía no emite factura al acreditarse el
   *  pago: mostrar un interruptor que no hace nada es peor que no mostrarlo. */
  autoFacturar?: TextoAutoFacturar | false
  /** 🔴 `false` en un producto **sin webhook de MercadoPago**. Esconde el campo
   *  del Webhook Secret y el bloque de la URL.
   *
   *  El caso vivo es **VentaLibra**, y su ausencia de webhook es deliberada y
   *  está documentada: en la instancia real del cliente el webhook no llegó
   *  nunca —cero POST en el log— y el cobro se resuelve con un poll. Pedirle al
   *  comercio una firma secreta para un webhook que no existe es mandarlo a
   *  configurar algo que no hace nada, y despues a buscar por qué "no anda". */
  webhook?: boolean
} = {}) {
  const [cfg, setCfg] = useState<ConfigMercadoPago | null>(null)
  const [token, setToken] = useState('')
  const [secreto, setSecreto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [probando, setProbando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const urlWebhook = `${window.location.origin}${rutaWebhook}`

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setCfg(await api.get<ConfigMercadoPago>(basePath))
    } catch (err) {
      setError(describirError(err))
      setCfg(VACIA)
    } finally {
      setCargando(false)
    }
  }, [basePath])

  useEffect(() => { void cargar() }, [cargar])

  async function guardar() {
    if (!cfg) return
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      // 🔴 Los secretos van SÓLO si se tipeó algo. Ver el docstring del módulo.
      await api.put(basePath, {
        mp_access_token: token,
        mp_webhook_secret: secreto,
        mp_concepto_descripcion: cfg.mp_concepto_descripcion,
        mp_iva_rate: cfg.mp_iva_rate,
        mp_user_id: cfg.mp_user_id,
        mp_pos_id: cfg.mp_pos_id,
        mp_auto_facturar_ventas: !!cfg.mp_auto_facturar_ventas,
      })
      setToken('')
      setSecreto('')
      setAviso('Guardado.')
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function quitarCredenciales() {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      await api.del(`${basePath}/credenciales`)
      setToken('')
      setSecreto('')
      setAviso('Se quitaron las credenciales.')
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function probar() {
    setProbando(true)
    setError(null)
    setAviso(null)
    try {
      const r = await api.post<{ ok: boolean; nickname?: string; user_id?: number }>(
        `${basePath}/probar`, {},
      )
      // El `user_id` es justo lo que hay que copiar en el campo de al lado para
      // armar el QR de caja, así que se muestra en vez de un "OK" pelado.
      setAviso(`Conectado — ${r.nickname ?? 'cuenta verificada'}${r.user_id ? ` (User ID ${r.user_id})` : ''}`)
      // 🔴 Recargar NO es de más: probar es lo que AVERIGUA el ambiente, así
      // que sin esto el cartel sigue diciendo "sin verificar" justo después de
      // haberlo verificado, y la única forma de verlo cambiar sería recargar la
      // pantalla a mano.
      await cargar()
    } catch (err) {
      setError(describirError(err))
    } finally {
      setProbando(false)
    }
  }

  function copiarWebhook() {
    void navigator.clipboard.writeText(urlWebhook).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  if (cargando || !cfg) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
  }

  // Sin credencial cargada no hay ambiente del que hablar, y un backend viejo
  // —un producto que todavía no subió el pin de LibraCore— no manda el campo:
  // en los dos casos el cartel no aparece, en vez de decir algo inventado.
  const aviso_ambiente = AVISO_DE_AMBIENTE[cfg.mp_ambiente ?? '']

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Phone className="size-4" />MercadoPago
          {aviso_ambiente && <BadgeEstado tono={aviso_ambiente.tono}>{aviso_ambiente.texto}</BadgeEstado>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {aviso_ambiente && (
          <p className="col-span-full text-xs text-muted-foreground">
            {aviso_ambiente.ayuda}
            {cfg.mp_ambiente_verificado
              ? ` Verificado el ${fechaHora(cfg.mp_ambiente_verificado)}.`
              : ''}
          </p>
        )}
        <div className="col-span-full"><TutorialMercadoPago /></div>

        <Campo
          id="mp-access-token" label="Access Token" type="password" value={token}
          onChange={setToken}
          placeholder={placeholderDeSecreto(cfg.mp_access_token_cargado, cfg.mp_access_token, 'APP_USR-…')}
        />
        {webhook && (
          <Campo
            id="mp-webhook-secret" label="Webhook Secret" type="password" value={secreto}
            onChange={setSecreto}
            placeholder={placeholderDeSecreto(cfg.mp_webhook_secret_cargado, cfg.mp_webhook_secret, 'La firma que genera MercadoPago')}
          />
        )}
        <Campo
          id="mp-concepto" label="Descripción del cobro" value={cfg.mp_concepto_descripcion}
          onChange={(v) => setCfg({ ...cfg, mp_concepto_descripcion: v })}
        />
        <div className="grid gap-2">
          <Label>Alícuota IVA</Label>
          <Select value={cfg.mp_iva_rate || '0'} onValueChange={(v) => setCfg({ ...cfg, mp_iva_rate: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Sin IVA (Monotributista / Exento)</SelectItem>
              <SelectItem value="0.21">21%</SelectItem>
              <SelectItem value="0.105">10,5%</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Campo
          id="mp-user-id" label="User ID (QR)" value={cfg.mp_user_id}
          onChange={(v) => setCfg({ ...cfg, mp_user_id: v })}
        />
        <Campo
          id="mp-pos-id" label="POS ID (QR)" value={cfg.mp_pos_id}
          onChange={(v) => setCfg({ ...cfg, mp_pos_id: v })}
          ayuda={<>El <strong>identificador externo</strong> de la caja, no su nombre.</>}
        />

        {autoFacturar && (
          <div className="col-span-full flex items-start gap-3 rounded-md border p-3">
            <Switch
              id="mp-auto-facturar-ventas"
              checked={!!cfg.mp_auto_facturar_ventas}
              onCheckedChange={(v: boolean) => setCfg({ ...cfg, mp_auto_facturar_ventas: v })}
            />
            <div className="grid gap-1">
              <Label htmlFor="mp-auto-facturar-ventas">{autoFacturar.label}</Label>
              <p className="text-xs text-muted-foreground">{autoFacturar.ayuda}</p>
            </div>
          </div>
        )}

        {webhook && (
        <div className="col-span-full grid gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">URL del webhook para registrar en MercadoPago</p>
          <div className="flex gap-2">
            <Input readOnly value={urlWebhook} aria-label="URL del webhook" className="font-mono text-xs" />
            <Button type="button" size="sm" variant="outline" onClick={copiarWebhook}>
              {copiado ? <Check /> : <Copy />}{copiado ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Evento a suscribir: Pagos (payment). El Webhook Secret lo genera MP al guardar el webhook.
          </p>
        </div>
        )}

        {!puedeCobrarPorQr(cfg) && (
          <p className="col-span-full rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            Faltan datos: el mostrador no va a ofrecer el cobro con QR hasta que
            el Access Token, el User ID y el POS ID estén los tres cargados.
          </p>
        )}

        <AccionesDeSeccion>
          <Button disabled={ocupado} onClick={() => void guardar()}>
            <Save />{ocupado ? 'Guardando…' : 'Guardar MercadoPago'}
          </Button>
          {cfg.mp_access_token_cargado && (
            <Button type="button" variant="outline" disabled={probando} onClick={() => void probar()}>
              <Send />{probando ? 'Probando…' : 'Probar conexión'}
            </Button>
          )}
          {(cfg.mp_access_token_cargado || (webhook && cfg.mp_webhook_secret_cargado)) && (
            <Button type="button" variant="outline" disabled={ocupado} onClick={() => void quitarCredenciales()}>
              Quitar credenciales
            </Button>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
          {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
        </AccionesDeSeccion>
      </CardContent>
    </Card>
  )
}

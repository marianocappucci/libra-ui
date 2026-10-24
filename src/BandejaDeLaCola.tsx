// La bandeja de la cola de comprobantes del nodo (ADR-094): lista los pedidos de `cola_arca` por tipo y estado y deja resolver los
// que una persona tiene que mirar, con las acciones del motor (`libracore.cola_arca_router`, ADR-079).
//
// ## Es la bandeja de comprobantes, extendida
//
// La pantalla de siempre del nodo es `BandejaDeComprobantes` (las ventas cobradas sin conexión que esperan la factura). La cola es
// otra tabla —de máquina, con un estado por pedido— pero se mira en el mismo lugar: `<BandejaDeComprobantes cola />` suma la
// pestaña «Cola de ARCA». Un producto que no tiene esa bandeja (LibraCargo, LibraClub) monta `BandejaDeLaCola`, que es la misma
// lista con su título. Las dos usan `PanelDeLaCola`.
//
// ## Qué hace cada acción
//
// | Estado | Acciones | Ruta del motor |
// |---|---|---|
// | `esperando` | Descartar | `POST {ruta}/{id}/descartar` `{motivo}` |
// | `a_revisar` | Reintentar, Marcar emitido, Descartar | `…/reintentar` `{}`, `…/emitido` `{resultado}` |
// | `incierto` | Reintentar **con confirmación**, Marcar emitido, Descartar | `…/reintentar` `{confirmo_que_no_salio: true}` |
// | `emitiendo` | — (lo está emitiendo alguien) | |
//
// 🔴 **Un `incierto` no se reintenta de un click.** No se sabe si ARCA lo emitió; reintentar con el mismo número puede chocar con
// una carta emitida y con el siguiente puede dejar dos para el mismo viaje. La pantalla pregunta «¿Confirmás que este comprobante
// NO salió en ARCA?» y recién con el sí manda `confirmo_que_no_salio: true`; el motor lo exige igual (422).
//
// Reintentar, descartar y marcar emitido deciden sobre plata y sobre un documento fiscal: el motor los guarda detrás de
// `resolver_con` (el producto pone «sólo administradores»). `puedeResolver={false}` los saca de la pantalla; «Emitir ahora» no
// lo necesita.
//
// Lo que resuelve contra el consumidor son los `@/components/ui/*` y `@/components/confirm-dialog`, como `BandejaDeComprobantes`.
import { useState, type ReactNode } from 'react'
import { Info, RotateCcw, Send } from 'lucide-react'

import { api, ApiError } from './api-client'
import { AvisoEstado } from './badge-estado'
import { EtiquetaDePedido } from './AvisosDeLaCola'
import {
  ESTADOS_ABIERTOS, ESTADOS_FINALES, ETIQUETA_DE_TIPO, EXPLICACION_NO_SALIO, PREGUNTA_NO_SALIO, RUTA_COLA_DEL_NODO,
  TEXTO_COLA_DEL_NODO, TEXTO_FUERA_DE_UN_NODO, TEXTO_SIN_CONEXION_PARA_EMITIR, TIPOS_DE_PEDIDO, TITULO_COLA,
  comprobantesEnCola, estaAbierto, pideRevision, resultadoDelPedido, useColaDelNodo,
  type PedidoDeCola, type TipoDePedido, type UsoDeLaCola,
} from './cola-del-nodo'
import { fechaHora } from './fechas'
import { ICONOS } from './iconos-identidad'
import { TarjetaDeFila } from './tabla-o-tarjetas'
import { TituloPantalla } from './titulo-pantalla'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Pestana = 'abiertos' | 'resueltos'
type Resolucion = { que: 'descartar' | 'emitido'; pedido: PedidoDeCola }

export type PanelDeLaColaProps = {
  /** Lo que devolvió `useColaDelNodo` para los pedidos abiertos (sin `estados`, o con `ESTADOS_ABIERTOS`). Lo recibe y no lo pide el
   *  panel para que quien lo monta (la pestaña de `BandejaDeComprobantes`) pueda mostrar el conteo antes de abrirla. */
  cola: UsoDeLaCola
  /** Dónde el producto montó `build_cola_del_nodo_router`. Por defecto `/api/nodo/cola`. */
  ruta?: string
  /** ¿Puede este usuario reintentar, descartar y marcar emitido? Por defecto sí; el motor lo exige igual con su `resolver_con`. */
  puedeResolver?: boolean
  /** El título de cada tarjeta. Por defecto «Carta de porte · #<origen_id>» (hasta los dos puntos); el producto lo mejora con lo suyo
   *  («Orden 123 · Cereales SA», leyendo `pedido.datos`). */
  describir?: (pedido: PedidoDeCola) => ReactNode
  /** El texto de arriba de la lista. `null` lo saca. */
  introduccion?: ReactNode
  className?: string
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

// El `origen_id` es de cada producto: un número (`41`) o, como en LibraCargo, `orden41:<uuid>` (único por pedido). Se muestra hasta los
// dos puntos —el uuid no le dice nada a nadie— y con «#» si es un número.
function tituloPorDefecto(p: PedidoDeCola): string {
  const referencia = p.origen_id.split(':')[0]
  return `${ETIQUETA_DE_TIPO[p.origen_tipo] ?? p.origen_tipo} · ${/^\d+$/.test(referencia) ? `#${referencia}` : referencia}`
}

/** Primero lo que pide a una persona; después, en el orden en que va a salir (el más viejo primero). */
const porUrgencia = (a: PedidoDeCola, b: PedidoDeCola) =>
  Number(pideRevision(b.estado)) - Number(pideRevision(a.estado)) || a.id - b.id

function textoDeEmitirAhora(r: { emitidos?: unknown[]; a_revisar?: unknown[]; inciertos?: unknown[]; quedan?: number }): string {
  const partes = [(r.emitidos?.length ?? 0) === 1 ? '1 emitido' : `${r.emitidos?.length ?? 0} emitidos`]
  if (r.a_revisar?.length) partes.push(`${r.a_revisar.length} a revisar`)
  if (r.inciertos?.length) partes.push(`${r.inciertos.length} inciertos`)
  if (r.quedan) partes.push(`quedan ${r.quedan}`)
  return `${partes.join('; ')}.`
}

/** La lista de la cola con sus acciones, sin título: es el contenido de `BandejaDeLaCola` y de la pestaña «Cola de ARCA». */
export function PanelDeLaCola({
  cola, ruta = RUTA_COLA_DEL_NODO, puedeResolver = true, describir = tituloPorDefecto, introduccion, className,
}: PanelDeLaColaProps) {
  const [pestana, setPestana] = useState<Pestana>('abiertos')
  const [tipo, setTipo] = useState<TipoDePedido | null>(null)
  const [resolucion, setResolucion] = useState<Resolucion | null>(null)
  const [valor, setValor] = useState('')
  const [paraReintentar, setParaReintentar] = useState<PedidoDeCola | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const resueltos = useColaDelNodo({ ruta, estados: ESTADOS_FINALES, limite: 50, intervaloMs: 0, habilitada: pestana === 'resueltos' })

  const datos = cola.cola
  const abiertos = cola.pedidos.filter((p) => estaAbierto(p.estado)).sort(porUrgencia)
  const hayEsperando = abiertos.some((p) => p.estado === 'esperando')
  const sinConexion = datos !== null && !datos.en_linea
  const lista = (pestana === 'abiertos' ? abiertos : resueltos.pedidos).filter((p) => tipo === null || p.origen_tipo === tipo)
  // El filtro por tipo sólo aparece cuando hay de los dos: un producto que sólo factura (LibraClub) no tiene nada que filtrar.
  const tiposPresentes = TIPOS_DE_PEDIDO.filter((t) => [...abiertos, ...resueltos.pedidos].some((p) => p.origen_tipo === t))
  const cuantosRevisar = abiertos.filter((p) => pideRevision(p.estado)).length

  async function recargar() {
    await Promise.all([cola.recargar(), pestana === 'resueltos' ? resueltos.recargar() : Promise.resolve()])
  }

  /** Una acción del motor: ocupa la pantalla, muestra el mensaje del motor si falla y recarga la cola si sale. */
  async function correr(accion: () => Promise<unknown>, alTerminar?: () => void) {
    setOcupado(true)
    setError(null)
    setMensaje(null)
    try {
      await accion()
      alTerminar?.()
      await recargar()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setOcupado(false)
    }
  }

  const reintentar = (p: PedidoDeCola, confirmoQueNoSalio: boolean) =>
    correr(() => api.post(`${ruta}/${p.id}/reintentar`, confirmoQueNoSalio ? { confirmo_que_no_salio: true } : {}))

  const emitirAhora = () => correr(async () => {
    setMensaje(textoDeEmitirAhora(await api.post(`${ruta}/emitir`)))
  })

  const confirmarResolucion = () => {
    if (!resolucion) return
    const { que, pedido } = resolucion
    if (que === 'descartar') {
      return correr(() => api.post(`${ruta}/${pedido.id}/descartar`, { motivo: valor }), () => setResolucion(null))
    }
    const resultado = pedido.origen_tipo === 'cpe' ? { ctg: valor.trim() } : { factura_id: Number(valor.trim()) }
    return correr(() => api.post(`${ruta}/${pedido.id}/emitido`, { resultado }), () => setResolucion(null))
  }

  const abrirResolucion = (que: Resolucion['que'], pedido: PedidoDeCola) => {
    setResolucion({ que, pedido })
    setValor('')
    setError(null)
  }

  // Sólo con un número entero positivo se puede marcar una factura emitida; una CTG, con algo escrito.
  const valorValido = resolucion?.que !== 'emitido' ? true
    : resolucion.pedido.origen_tipo === 'cpe' ? valor.trim() !== '' : /^[1-9]\d*$/.test(valor.trim())

  function acciones(p: PedidoDeCola): ReactNode {
    if (!puedeResolver || !estaAbierto(p.estado) || p.estado === 'emitiendo') return null
    return (
      <>
        {pideRevision(p.estado) && (
          <Button size="sm" variant="outline" disabled={ocupado}
            onClick={() => (p.estado === 'incierto' ? setParaReintentar(p) : void reintentar(p, false))}>
            <RotateCcw className="size-4" aria-hidden="true" />Reintentar
          </Button>
        )}
        {pideRevision(p.estado) && (
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => abrirResolucion('emitido', p)}>Marcar emitido</Button>
        )}
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => abrirResolucion('descartar', p)}>Descartar</Button>
      </>
    )
  }

  function tarjeta(p: PedidoDeCola) {
    const datosDeLaTarjeta: { etiqueta: string; valor: ReactNode }[] = []
    if (p.ultimo_error) datosDeLaTarjeta.push({ etiqueta: p.estado === 'a_revisar' ? 'Mensaje de ARCA' : 'Motivo', valor: p.ultimo_error })
    if (p.estado === 'incierto') datosDeLaTarjeta.push({ etiqueta: 'Qué pasó', valor: 'No se sabe si ARCA lo emitió.' })
    if (p.intentos > 0) datosDeLaTarjeta.push({ etiqueta: 'Intentos', valor: p.intentos })
    const resultado = resultadoDelPedido(p)
    if (resultado) datosDeLaTarjeta.push({ etiqueta: 'Resultado', valor: resultado })
    if (p.resuelto_at) datosDeLaTarjeta.push({ etiqueta: 'Resuelto', valor: fechaHora(p.resuelto_at) })
    return (
      <TarjetaDeFila
        key={p.id}
        titulo={describir(p)}
        subtitulo={`Pedido ${fechaHora(p.created_at)}`}
        estado={<EtiquetaDePedido estado={p.estado} />}
        datos={datosDeLaTarjeta}
        accionesConTexto={acciones(p)}
      />
    )
  }

  if (cola.disponible === false) {
    return <p className={`text-sm text-muted-foreground ${className ?? ''}`}>{TEXTO_FUERA_DE_UN_NODO}</p>
  }

  const textoIntroduccion = introduccion !== undefined ? introduccion : TEXTO_COLA_DEL_NODO
  const cargandoLaLista = pestana === 'abiertos' ? cola.cargando && !datos : resueltos.cargando && !resueltos.cola

  return (
    <div className={`grid gap-3 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={pestana} onValueChange={(v) => { setPestana(v as Pestana); setResolucion(null) }}>
          <TabsList>
            <TabsTrigger value="abiertos">En cola{datos ? ` (${abiertos.length})` : ''}</TabsTrigger>
            <TabsTrigger value="resueltos">Resueltos</TabsTrigger>
          </TabsList>
        </Tabs>
        {tiposPresentes.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de comprobante">
            <Button size="sm" variant={tipo === null ? 'default' : 'outline'} aria-pressed={tipo === null} onClick={() => setTipo(null)}>Todos</Button>
            {tiposPresentes.map((t) => (
              <Button key={t} size="sm" variant={tipo === t ? 'default' : 'outline'} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
                {t === 'cpe' ? 'Cartas de porte' : 'Facturas'}
              </Button>
            ))}
          </div>
        )}
      </div>

      {textoIntroduccion !== null && pestana === 'abiertos' && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{textoIntroduccion}</span>
        </p>
      )}

      {sinConexion && <AvisoEstado tono="atencion" role="status">{TEXTO_SIN_CONEXION_PARA_EMITIR}</AvisoEstado>}

      {pestana === 'abiertos' && abiertos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {comprobantesEnCola(abiertos.length)}{cuantosRevisar > 0 ? ` · ${cuantosRevisar} para revisar` : ''}
          </p>
          {hayEsperando && (
            <Button size="sm" variant="outline" disabled={ocupado || sinConexion} onClick={() => void emitirAhora()}
              title={sinConexion ? TEXTO_SIN_CONEXION_PARA_EMITIR : undefined}>
              <Send className="size-4" aria-hidden="true" />Emitir ahora
            </Button>
          )}
        </div>
      )}

      {(error ?? cola.error) && <p role="alert" className="text-sm text-destructive">{error ?? cola.error}</p>}
      {mensaje && <p role="status" className="text-sm text-muted-foreground">{mensaje}</p>}

      {cargandoLaLista
        ? <p className="text-sm text-muted-foreground">Cargando…</p>
        : lista.length === 0
          ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {pestana === 'abiertos' ? 'No hay comprobantes esperando salir.' : 'Todavía no hay nada acá.'}
            </p>
          )
          : <ul className="grid gap-2" aria-label={pestana === 'abiertos' ? 'Comprobantes en cola' : 'Comprobantes resueltos'}>{lista.map(tarjeta)}</ul>}

      {resolucion && puedeResolver && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {resolucion.que === 'descartar' ? 'Descartar comprobante' : 'Marcar como emitido'}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {describir(resolucion.pedido)}.{' '}
              {resolucion.que === 'descartar'
                ? 'No se emite: el pedido se cierra y no sale nunca.'
                : 'Marcalo sólo si comprobaste en ARCA que sí salió. Queda cerrado con el dato que cargues.'}
            </p>
            <div className="grid gap-2">
              <Label htmlFor="cola-valor">
                {resolucion.que === 'descartar' ? 'Motivo' : resolucion.pedido.origen_tipo === 'cpe' ? 'N.º de CTG' : 'N.º de la factura'}
              </Label>
              <Input
                id="cola-valor" value={valor} onChange={(e) => setValor(e.target.value)}
                placeholder={resolucion.que === 'descartar' ? 'Ej: se hizo a mano' : undefined}
                inputMode={resolucion.que === 'emitido' ? 'numeric' : undefined}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setResolucion(null)}>Cancelar</Button>
              <Button
                variant={resolucion.que === 'descartar' ? 'destructive' : 'default'} disabled={ocupado || !valorValido}
                onClick={() => void confirmarResolucion()}
              >
                {resolucion.que === 'descartar' ? 'Descartar' : 'Marcar emitido'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={paraReintentar !== null}
        onOpenChange={(abierto) => { if (!abierto) setParaReintentar(null) }}
        title={PREGUNTA_NO_SALIO}
        description={EXPLICACION_NO_SALIO}
        confirmLabel="Confirmo que no salió"
        onConfirm={() => { if (paraReintentar) void reintentar(paraReintentar, true) }}
      />
    </div>
  )
}

export type BandejaDeLaColaProps = Omit<PanelDeLaColaProps, 'cola'> & {
  /** El título de la pantalla; el ícono es el de la bandeja de comprobantes del catálogo (`ICONOS.comprobantesAFacturar`). */
  titulo?: string
  /** Cada cuánto vuelve a preguntar la cola. Por defecto 30 s; `0` no repite. */
  intervaloMs?: number
}

/** La pantalla de la cola de comprobantes del nodo, para un producto que no tiene `BandejaDeComprobantes` (LibraCargo, LibraClub). */
export function BandejaDeLaCola({ titulo = TITULO_COLA, intervaloMs, ruta, ...panel }: BandejaDeLaColaProps) {
  const cola = useColaDelNodo({ ruta, intervaloMs, estados: ESTADOS_ABIERTOS })
  return (
    <div className="grid gap-4">
      <TituloPantalla icono={ICONOS.comprobantesAFacturar}>{titulo}</TituloPantalla>
      <Card>
        <CardContent className="pt-6">
          <PanelDeLaCola cola={cola} ruta={ruta} {...panel} />
        </CardContent>
      </Card>
    </div>
  )
}

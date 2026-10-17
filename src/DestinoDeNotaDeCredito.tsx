// La elección de qué hacer con la plata de una nota de crédito (ADR-073). La lógica, el hook y los tipos están en `destino-de-nota.ts`.
import { formatoMoneda } from './formatos'
import { SelectBuscable } from './SelectBuscable'
import {
  MENSAJE_SIN_CLIENTE, MENSAJE_SIN_TURNO, medioDeDevolucion,
  type DestinoElegido, type OfertaDeDestino,
} from './destino-de-nota'

/** La elección, para la pantalla que emite la nota. Sobria: dos opciones y, devolviendo, el medio. */
export function DestinoDeNotaDeCredito({
  oferta, elegido, onChange,
}: {
  oferta: OfertaDeDestino
  elegido: DestinoElegido
  onChange: (elegido: DestinoElegido) => void
}) {
  const sinCliente = !oferta.cliente_identificado
  return (
    <fieldset className="grid gap-2 rounded-md border p-3 text-sm">
      <legend className="px-1 font-medium">¿Qué pasa con la plata?</legend>
      <p className="text-muted-foreground">
        La factura ya está cobrada: esta nota deja <strong>{formatoMoneda(oferta.monto)}</strong> de más
        {oferta.excedente > 0 && <> (los otros {formatoMoneda(oferta.excedente)} que acredita no estaban cobrados)</>}.
      </p>
      <label className="flex items-center gap-2">
        <input type="radio" name="destino-nota" checked={elegido.destino === 'devolver'} disabled={oferta.sin_turno}
               onChange={() => onChange({ ...elegido, destino: 'devolver' })} />
        Devolver {formatoMoneda(oferta.monto)}
      </label>
      {oferta.sin_turno && <p role="alert" className="text-destructive">{MENSAJE_SIN_TURNO}</p>}
      {elegido.destino === 'devolver' && !oferta.sin_turno && (
        <div className="grid gap-1 pl-6">
          <SelectBuscable
            value={medioDeDevolucion(oferta, elegido)}
            onChange={(medio) => onChange({ ...elegido, medio })}
            opciones={oferta.medios.map((m) => ({ value: m.id, label: m.label }))}
            ariaLabel="Medio con el que se devuelve"
            placeholder="Medio de pago"
            limpiable={false}
            className="w-56"
          />
          {oferta.medio_sugerido === null && elegido.medio === '' && (
            <p className="text-muted-foreground">Se cobró con más de un medio: elegí con cuál devolver.</p>
          )}
        </div>
      )}
      <label className="flex items-center gap-2">
        <input type="radio" name="destino-nota" checked={elegido.destino === 'a_favor'} disabled={sinCliente}
               onChange={() => onChange({ ...elegido, destino: 'a_favor' })} />
        Dejar a favor del cliente
      </label>
      {sinCliente && <p className="pl-6 text-muted-foreground">{MENSAJE_SIN_CLIENTE}</p>}
      {elegido.destino === null && <p className="text-muted-foreground">Elegí una opción para poder emitir la nota.</p>}
    </fieldset>
  )
}

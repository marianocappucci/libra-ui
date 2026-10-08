// El select con búsqueda. Nació del problema real: una empresa con cientos
// de clientes no puede elegirlos recorriendo una lista ordenada.
//
// Desde la v0.129.0 (ADR-039) el modo por defecto es el campo de texto con lupa;
// el botón que abre un desplegable con el buscador adentro es `buscarEscribiendo={false}`.
// Los dos primeros bloques prueban ese modo explícito (es lo que conservan los que no migran);
// el tercero, el de campo, no pasa la prop: prueba que es el de siempre.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { SelectBuscable, type OpcionSelect } from '../src/SelectBuscable'

const CLIENTES: OpcionSelect[] = [
  { value: '1', label: 'Compulibra', hint: 'Suipacha' },
  { value: '2', label: 'Hospital Esteban Iribarne', hint: 'Suipacha' },
  { value: '3', label: 'Panadería La Espiga', hint: 'Mercedes' },
  { value: '4', label: 'Ferretería El Tornillo', hint: 'Luján' },
]

/** Envoltorio con estado, que es como lo usa una pantalla de verdad. */
function ConEstado({ inicial = '', onChange }: { inicial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(inicial)
  return (
    <SelectBuscable
      buscarEscribiendo={false}
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v) }}
      opciones={CLIENTES}
      placeholder="Cliente…"
      ariaLabel="Cliente"
    />
  )
}

const abrir = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('combobox', { name: 'Cliente' }))

const opciones = () => within(screen.getByRole('listbox')).queryAllByRole('option').map((o) => o.textContent)

describe('SelectBuscable en modo botón (`buscarEscribiendo={false}`)', () => {
  it('cerrado muestra el placeholder cuando no hay nada elegido', () => {
    render(<ConEstado />)
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveTextContent('Cliente…')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('cerrado muestra la etiqueta de la opción elegida', () => {
    // Montaje nuevo y no un rerender: el valor inicial de un useState no se
    // reinicializa al re-renderizar, así que un rerender no probaría nada.
    render(<ConEstado inicial="3" />)
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveTextContent('Panadería La Espiga')
  })

  it('al abrir, el foco va al campo de búsqueda', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)
    expect(screen.getByRole('textbox', { name: 'Buscar entre las opciones' })).toHaveFocus()
  })

  it('filtra por lo que se escribe, ignorando acentos', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)
    expect(opciones()).toHaveLength(4)

    // Sin acento encuentra el que lo tiene: es la mitad de las búsquedas
    // que fallarían en datos cargados a mano.
    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'panaderia')
    expect(opciones()).toHaveLength(1)
    expect(opciones()[0]).toContain('Panadería La Espiga')
  })

  it('busca también por el hint, no sólo por la etiqueta', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)

    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'mercedes')
    expect(opciones()).toHaveLength(1)
    expect(opciones()[0]).toContain('Panadería')
  })

  it('exige todos los términos, en cualquier orden', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)
    const campo = screen.getByRole('textbox', { name: 'Buscar entre las opciones' })

    await user.type(campo, 'hospital suipacha')
    expect(opciones()).toHaveLength(1)

    await user.clear(campo)
    await user.type(campo, 'suipacha hospital')
    expect(opciones()).toHaveLength(1)
  })

  it('elegir con el mouse devuelve el value y cierra', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.click(screen.getByRole('option', { name: /Ferretería El Tornillo/ }))
    expect(alElegir).toHaveBeenCalledWith('4')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveTextContent('Ferretería El Tornillo')
  })

  it('se puede elegir sin tocar el mouse: escribir y Enter', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'tornillo{Enter}')
    expect(alElegir).toHaveBeenCalledWith('4')
  })

  it('las flechas mueven el resaltado y Enter elige el resaltado', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(alElegir).toHaveBeenCalledWith('3')
  })

  it('escribir mueve el resaltado al primer resultado', async () => {
    // Si no lo hiciera, Enter elegiría una opción que el filtro dejó afuera:
    // el usuario ve un resultado y se le guarda otro.
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'compu')
    await user.keyboard('{Enter}')
    expect(alElegir).toHaveBeenCalledWith('1')
  })

  it('abre resaltando la opción ya elegida, así Enter no la cambia', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado inicial="3" onChange={alElegir} />)
    await abrir(user)

    await user.keyboard('{Enter}')
    expect(alElegir).toHaveBeenCalledWith('3')
  })

  it('Escape cierra sin elegir', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<ConEstado onChange={alElegir} />)
    await abrir(user)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(alElegir).not.toHaveBeenCalled()
  })

  it('un click afuera cierra el desplegable', async () => {
    const user = userEvent.setup()
    render(<><ConEstado /><button type="button">afuera</button></>)
    await abrir(user)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'afuera' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('sin resultados lo dice, en vez de mostrar una lista vacía', async () => {
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)

    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'zzz')
    expect(screen.getByText('Sin resultados.')).toBeInTheDocument()
    expect(opciones()).toHaveLength(0)
  })

  it('la búsqueda se limpia al reabrir', async () => {
    // Reabrir y encontrarse el filtro anterior aplicado hace pensar que se
    // perdieron opciones.
    const user = userEvent.setup()
    render(<ConEstado />)
    await abrir(user)
    await user.type(screen.getByRole('textbox', { name: 'Buscar entre las opciones' }), 'compu')
    expect(opciones()).toHaveLength(1)

    await user.keyboard('{Escape}')
    await abrir(user)
    expect(screen.getByRole('textbox', { name: 'Buscar entre las opciones' })).toHaveValue('')
    expect(opciones()).toHaveLength(4)
  })

  it('marca cuál está elegida para un lector de pantalla', async () => {
    const user = userEvent.setup()
    render(<ConEstado inicial="2" />)
    await abrir(user)

    const elegida = screen.getByRole('option', { name: /Hospital Esteban Iribarne/ })
    expect(elegida).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /Compulibra/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('deshabilitado no abre', async () => {
    const user = userEvent.setup()
    render(
      <SelectBuscable buscarEscribiendo={false} value="" onChange={vi.fn()} opciones={CLIENTES} ariaLabel="Cliente" disabled />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('SelectBuscable (modo botón) dentro de un formulario', () => {
  // `FormControl` de shadcn es un `Slot.Root`: le pasa `id`, `aria-describedby`
  // y `aria-invalid` al hijo sin saber qué componente es. Un `<input>` o el
  // `SelectTrigger` de Radix las reciben como atributos del DOM; un componente
  // propio las recibe como props de React y, **si no las declara, se pierden
  // sin ningún error**. Hasta la v0.25.0 éste no las declaraba: adentro de un
  // formulario, con su `<FormLabel>` puesto, quedaba sin nombre accesible.
  //
  // Estos tests no montan un `FormControl` —vive en el consumidor, no acá, y
  // stubearlo sería probar el stub—. Montan el DOM que ese `FormControl`
  // produce, que es lo que de verdad tiene que funcionar.

  it('🔴 el `id` llega al disparador, así el `htmlFor` de la etiqueta lo nombra', () => {
    // Éste es el defecto que motivó el cambio: la etiqueta estaba, era visible,
    // y el lector de pantalla igual anunciaba «botón, Cliente…» — el valor, no
    // el campo. Y sin `id` no había forma de atarla desde afuera.
    render(
      <>
        <label htmlFor="cliente">Cliente (locatario)</label>
        <SelectBuscable buscarEscribiendo={false} id="cliente" value="" onChange={vi.fn()} opciones={CLIENTES} placeholder="Cliente…" />
      </>,
    )

    // Un `<label for>` nombra al `<button>` porque el botón es un elemento
    // *labelable*. Es el mismo mecanismo por el que el `SelectTrigger` de Radix
    // ya andaba solo adentro de un `FormControl`.
    expect(screen.getByRole('combobox', { name: 'Cliente (locatario)' })).toBeInTheDocument()
  })

  it('el `ariaLabel` explícito le gana a la etiqueta, para el que ya lo pasa', () => {
    // Los seis productos que consumen esto vienen pasando `ariaLabel` a mano
    // porque era la única salida. No tienen que sacarlo para actualizar: si
    // están los dos, gana `aria-label`, que es lo que dice el algoritmo de
    // nombre accesible.
    render(
      <>
        <label htmlFor="cliente">La etiqueta visible</label>
        <SelectBuscable buscarEscribiendo={false} id="cliente" ariaLabel="El aria-label" value="" onChange={vi.fn()} opciones={CLIENTES} />
      </>,
    )
    expect(screen.getByRole('combobox', { name: 'El aria-label' })).toBeInTheDocument()
  })

  it('el mensaje de validación se anuncia, y el campo queda marcado en error', () => {
    // Lo mismo que el `id`, y por el mismo motivo: `FormControl` los inyecta y
    // se perdían. El `<FormMessage>` se veía en pantalla y no se anunciaba
    // nunca.
    render(
      <>
        <label htmlFor="cliente">Cliente</label>
        <SelectBuscable
          buscarEscribiendo={false}
          id="cliente"
          aria-describedby="cliente-msg"
          aria-invalid
          value="" onChange={vi.fn()} opciones={CLIENTES}
        />
        <p id="cliente-msg">Elegí un cliente</p>
      </>,
    )

    const combo = screen.getByRole('combobox', { name: 'Cliente' })
    expect(combo).toHaveAccessibleDescription('Elegí un cliente')
    expect(combo).toBeInvalid()
  })

  it('el `id` de afuera no le pisa el suyo al desplegable', async () => {
    // El componente ya tenía un `useId()` propio para el `aria-controls` del
    // listbox. Al sumar la prop hubo que separarlos: si el desplegable pasara a
    // usar el `id` del control, dos selects con el mismo `id` —o el `id` del
    // botón repetido en el div— romperían el `aria-controls`.
    const user = userEvent.setup()
    render(
      <SelectBuscable buscarEscribiendo={false} id="cliente" ariaLabel="Cliente" value="" onChange={vi.fn()} opciones={CLIENTES} />,
    )

    const combo = screen.getByRole('combobox', { name: 'Cliente' })
    expect(combo).toHaveAttribute('id', 'cliente')

    await user.click(combo)
    const listbox = screen.getByRole('listbox')
    expect(listbox.id).not.toBe('cliente')
    // Y el `aria-controls` sigue apuntando al desplegable de verdad.
    expect(combo).toHaveAttribute('aria-controls', listbox.id)
  })

  it('sin `id` no aparece el atributo, y todo lo de siempre sigue igual', async () => {
    // El uso suelto —un `<Label>` al lado, sin formulario— es el mayoritario en
    // los consumidores. No tiene que cambiar nada para él.
    const user = userEvent.setup()
    render(<ConEstado />)

    const combo = screen.getByRole('combobox', { name: 'Cliente' })
    expect(combo).not.toHaveAttribute('id')
    expect(combo).not.toHaveAttribute('aria-describedby')

    await user.click(combo)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('SelectBuscable en modo de campo (campo de texto con lupa): el modo por defecto desde la v0.129.0', () => {
  // El modo por defecto es un botón que abre un desplegable con el buscador
  // adentro: la gente no descubre que puede escribir. Acá el control cerrado ya
  // es el campo donde se escribe. (ADR-031)

  function Campo({
    inicial = '', onChange, id,
  }: { inicial?: string; onChange?: (v: string) => void; id?: string }) {
    const [value, setValue] = useState(inicial)
    return (
      <SelectBuscable
        id={id}
        value={value}
        onChange={(v) => { setValue(v); onChange?.(v) }}
        opciones={CLIENTES}
        placeholder="Buscar cliente…"
        ariaLabel="Cliente"
      />
    )
  }

  const combo = () => screen.getByRole('combobox', { name: 'Cliente' })

  it('cerrado es un campo de texto con el placeholder, no un botón', () => {
    render(<Campo />)
    expect(combo().tagName).toBe('INPUT')
    expect(combo()).toHaveAttribute('placeholder', 'Buscar cliente…')
    expect(combo()).toHaveValue('')
    expect(combo()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    // Sin nada elegido no hay con qué vaciar.
    expect(screen.queryByRole('button', { name: 'Quitar la selección' })).not.toBeInTheDocument()
  })

  it('escribir abre la lista ya filtrada, sin un click intermedio', async () => {
    const user = userEvent.setup()
    render(<Campo />)
    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.keyboard('panaderia')

    expect(combo()).toHaveAttribute('aria-expanded', 'true')
    expect(opciones()).toEqual(['Panadería La Espiga' + 'Mercedes'])
  })

  it('escribir sin haber hecho click también abre (foco por teclado)', async () => {
    const user = userEvent.setup()
    render(<Campo />)
    await user.tab()
    expect(combo()).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.keyboard('torni')
    expect(opciones()).toHaveLength(1)
  })

  it('busca también por el hint y exige todos los términos', async () => {
    const user = userEvent.setup()
    render(<Campo />)
    await user.type(combo(), 'suipacha hospital')
    expect(opciones()).toHaveLength(1)
    expect(opciones()[0]).toContain('Hospital Esteban Iribarne')
  })

  it('un click abre la lista completa', async () => {
    const user = userEvent.setup()
    render(<Campo />)
    await user.click(combo())
    expect(opciones()).toHaveLength(4)
  })

  it('Enter elige la opción resaltada, que al escribir es la primera del filtro', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Campo onChange={alElegir} />)
    await user.type(combo(), 'suipacha{Enter}')

    expect(alElegir).toHaveBeenCalledWith('1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(combo()).toHaveValue('Compulibra')
  })

  it('las flechas mueven el resaltado, y aria-activedescendant lo sigue', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Campo onChange={alElegir} />)
    await user.click(combo())

    const activa = () => document.getElementById(combo().getAttribute('aria-activedescendant')!)
    expect(activa()).toHaveTextContent('Compulibra')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(activa()).toHaveTextContent('Panadería La Espiga')
    expect(activa()).toHaveAttribute('role', 'option')
    await user.keyboard('{ArrowUp}{ArrowDown}{Enter}')
    expect(alElegir).toHaveBeenCalledWith('3')
  })

  it('ArrowDown con la lista cerrada la abre', async () => {
    const user = userEvent.setup()
    render(<Campo />)
    await user.tab()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('elegir con el mouse devuelve el value, cierra y deja la etiqueta en el campo', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Campo onChange={alElegir} />)
    await user.type(combo(), 'ferre')
    await user.click(screen.getByRole('option', { name: /Ferretería El Tornillo/ }))

    expect(alElegir).toHaveBeenCalledWith('4')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(combo()).toHaveValue('Ferretería El Tornillo')
    // El foco no se fue: seguir buscando no pide otro click.
    expect(combo()).toHaveFocus()
  })

  it('con algo elegido, la lista se abre resaltándolo y Enter no cambia la selección', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Campo inicial="3" onChange={alElegir} />)
    expect(combo()).toHaveValue('Panadería La Espiga')

    await user.click(combo())
    expect(opciones()).toHaveLength(4)
    expect(screen.getByRole('option', { name: /Panadería/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(alElegir).toHaveBeenCalledWith('3')
  })

  it('con algo elegido, enfocar y escribir empieza una búsqueda nueva', async () => {
    // El foco selecciona todo: lo escrito reemplaza la etiqueta y no se le pega.
    const user = userEvent.setup()
    render(<Campo inicial="3" />)
    await user.click(combo())
    await user.keyboard('hospital')

    expect(combo()).toHaveValue('hospital')
    expect(opciones()).toHaveLength(1)
    expect(opciones()[0]).toContain('Hospital Esteban Iribarne')
  })

  it('tras elegir, la próxima letra tampoco se pega a la etiqueta', async () => {
    const user = userEvent.setup()
    render(<Campo />)
    await user.type(combo(), 'compu{Enter}')
    expect(combo()).toHaveValue('Compulibra')

    await user.keyboard('luj')
    expect(combo()).toHaveValue('luj')
    expect(opciones()).toHaveLength(1)
    expect(opciones()[0]).toContain('Ferretería El Tornillo')
  })

  it('la × vacía la selección, cierra y deja el foco en el campo', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Campo inicial="2" onChange={alElegir} />)
    expect(combo()).toHaveValue('Hospital Esteban Iribarne')

    await user.click(screen.getByRole('button', { name: 'Quitar la selección' }))
    expect(alElegir).toHaveBeenCalledWith('')
    expect(combo()).toHaveValue('')
    expect(combo()).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar la selección' })).not.toBeInTheDocument()
  })

  it('Escape cierra sin elegir y devuelve la etiqueta elegida', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Campo inicial="3" onChange={alElegir} />)
    await user.click(combo())
    await user.keyboard('zzz')
    expect(combo()).toHaveValue('zzz')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(combo()).toHaveValue('Panadería La Espiga')
    expect(alElegir).not.toHaveBeenCalled()
  })

  it('Escape con la lista cerrada no se traga la tecla (puede ser de un diálogo)', async () => {
    const user = userEvent.setup()
    const alEscape = vi.fn()
    render(<div onKeyDown={(e) => { if (e.key === 'Escape') alEscape(e.defaultPrevented) }}><Campo /></div>)
    await user.tab()
    await user.keyboard('{Escape}')
    expect(alEscape).toHaveBeenCalledWith(false)
  })

  it('al perder el foco sin elegir, cierra y restaura la etiqueta; lo escrito se descarta', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<><Campo inicial="1" onChange={alElegir} /><button type="button">afuera</button></>)
    await user.click(combo())
    await user.keyboard('panad')
    expect(combo()).toHaveValue('panad')

    await user.click(screen.getByRole('button', { name: 'afuera' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(combo()).toHaveValue('Compulibra')
    expect(alElegir).not.toHaveBeenCalled()
  })

  it('Tab cierra y restaura la etiqueta', async () => {
    const user = userEvent.setup()
    render(<><Campo inicial="1" /><button type="button">siguiente</button></>)
    await user.click(combo())
    await user.keyboard('zzz')
    await user.tab()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(combo()).toHaveValue('Compulibra')
  })

  it('sin resultados lo dice y Enter no elige nada', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Campo onChange={alElegir} />)
    await user.type(combo(), 'zzz{Enter}')
    expect(screen.getByText('Sin resultados.')).toBeInTheDocument()
    expect(opciones()).toHaveLength(0)
    expect(alElegir).not.toHaveBeenCalled()
    expect(combo()).not.toHaveAttribute('aria-activedescendant')
  })

  it('Enter con la lista cerrada sigue su camino: envía el formulario', async () => {
    const user = userEvent.setup()
    const alEnviar = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(<form onSubmit={alEnviar}><Campo inicial="1" /><button type="submit">ok</button></form>)
    await user.click(combo())
    await user.keyboard('{Escape}{Enter}')
    expect(alEnviar).toHaveBeenCalledTimes(1)
  })

  describe('accesibilidad', () => {
    it('es un combobox con el nombre accesible que se le pasa', () => {
      render(<Campo />)
      expect(screen.getByRole('combobox', { name: 'Cliente' })).toBeInTheDocument()
    })

    it('abierto, aria-controls apunta a un listbox con options', async () => {
      const user = userEvent.setup()
      render(<Campo />)
      await user.click(combo())
      const lista = screen.getByRole('listbox')
      expect(combo()).toHaveAttribute('aria-expanded', 'true')
      expect(combo()).toHaveAttribute('aria-controls', lista.id)
      expect(combo()).toHaveAttribute('aria-autocomplete', 'list')
      expect(within(lista).getAllByRole('option')).toHaveLength(4)
    })

    it('el `id` va al campo y el `htmlFor` de una etiqueta lo nombra', () => {
      render(
        <>
          <label htmlFor="cliente">Cliente (locatario)</label>
          <SelectBuscable id="cliente" value="" onChange={vi.fn()} opciones={CLIENTES} />
        </>,
      )
      expect(screen.getByRole('combobox', { name: 'Cliente (locatario)' })).toHaveAttribute('id', 'cliente')
    })

    it('`aria-describedby` y `aria-invalid` llegan al campo', () => {
      render(
        <>
          <SelectBuscable
            ariaLabel="Cliente" aria-describedby="msg" aria-invalid
            value="" onChange={vi.fn()} opciones={CLIENTES}
          />
          <p id="msg">Elegí un cliente</p>
        </>,
      )
      expect(combo()).toHaveAccessibleDescription('Elegí un cliente')
      expect(combo()).toBeInvalid()
    })

    it('el `className` va al contenedor, que es lo que tiene ancho', () => {
      const { container } = render(
        <SelectBuscable
          ariaLabel="Cliente" className="w-64"
          value="" onChange={vi.fn()} opciones={CLIENTES}
        />,
      )
      expect(container.firstElementChild).toHaveClass('relative', 'w-64')
    })
  })

  it('deshabilitado no abre y no ofrece la ×', async () => {
    const user = userEvent.setup()
    render(
      <SelectBuscable
        ariaLabel="Cliente" value="1" onChange={vi.fn()} opciones={CLIENTES} disabled
      />,
    )
    expect(combo()).toBeDisabled()
    await user.click(combo())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar la selección' })).not.toBeInTheDocument()
  })

  it('🔴 sin pasar nada es el campo de texto; el botón es sólo `buscarEscribiendo={false}`', () => {
    // Éste es el cambio de la v0.129.0: antes el campo era opt-in (`buscarEscribiendo`) y el botón el defecto.
    const { unmount } = render(
      <SelectBuscable ariaLabel="Cliente" value="" onChange={vi.fn()} opciones={CLIENTES} />,
    )
    expect(combo().tagName).toBe('INPUT')
    unmount()

    render(<SelectBuscable buscarEscribiendo ariaLabel="Cliente" value="" onChange={vi.fn()} opciones={CLIENTES} />)
    expect(combo().tagName).toBe('INPUT')
  })

  it('con `buscarEscribiendo={false}` sigue siendo el botón de siempre', () => {
    render(<ConEstado />)
    expect(screen.getByRole('combobox', { name: 'Cliente' }).tagName).toBe('BUTTON')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe.each([
  ['campo (el defecto)', {}],
  ['botón (`buscarEscribiendo={false}`)', { buscarEscribiendo: false }],
] as const)('SelectBuscable, lo que le hace falta para reemplazar a un Select: modo %s', (_nombre, modo) => {
  const enBoton = 'buscarEscribiendo' in modo

  const CAJAS: OpcionSelect[] = [
    { value: '1', label: 'Caja 1' },
    { value: '2', label: 'Caja 2 (turno abierto)', disabled: true },
    { value: '3', label: 'Caja 3' },
  ]

  function Cajas({ onChange, inicial = '' }: { onChange?: (v: string) => void; inicial?: string }) {
    const [value, setValue] = useState(inicial)
    return (
      <SelectBuscable
        {...modo} ariaLabel="Caja" value={value} opciones={CAJAS}
        onChange={(v) => { setValue(v); onChange?.(v) }}
      />
    )
  }
  const caja = () => screen.getByRole('combobox', { name: 'Caja' })

  it('una opción deshabilitada se ve, está marcada para un lector de pantalla y un click no la elige', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Cajas onChange={alElegir} />)
    await user.click(caja())

    const deshabilitada = screen.getByRole('option', { name: /Caja 2/ })
    expect(deshabilitada).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('option', { name: /Caja 1/ })).not.toHaveAttribute('aria-disabled')
    await user.click(deshabilitada)
    expect(alElegir).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('las flechas saltean la deshabilitada y Enter nunca la elige', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(<Cajas onChange={alElegir} />)
    await user.click(caja())

    await user.keyboard('{ArrowDown}{Enter}')
    expect(alElegir).toHaveBeenCalledWith('3')
  })

  it('si la primera está deshabilitada, el resaltado arranca en la primera que se puede elegir', async () => {
    const user = userEvent.setup()
    const alElegir = vi.fn()
    render(
      <SelectBuscable
        {...modo} ariaLabel="Caja" value="" onChange={alElegir}
        opciones={[{ value: 'a', label: 'Ocupada', disabled: true }, { value: 'b', label: 'Libre' }]}
      />,
    )
    await user.click(caja())
    await user.keyboard('{Enter}')
    expect(alElegir).toHaveBeenCalledWith('b')
  })

  it('una lista con una opción de valor vacío («Todas») la muestra como etiqueta cuando no hay filtro', async () => {
    // Es lo que reemplaza a los centinelas `__todas__` de los Select de Radix, que no admiten `value=""`.
    const user = userEvent.setup()
    const alElegir = vi.fn()
    function Filtro() {
      const [v, setV] = useState('')
      return (
        <SelectBuscable
          {...modo} ariaLabel="Caja" value={v} placeholder="Elegí una caja…"
          onChange={(x) => { setV(x); alElegir(x) }}
          opciones={[{ value: '', label: 'Todas las cajas' }, ...CAJAS]}
        />
      )
    }
    render(<Filtro />)
    if (enBoton) expect(caja()).toHaveTextContent('Todas las cajas')
    else expect(caja()).toHaveValue('Todas las cajas')

    await user.click(caja())
    await user.click(screen.getByRole('option', { name: 'Caja 3' }))
    expect(alElegir).toHaveBeenLastCalledWith('3')
    await user.click(caja())
    await user.click(screen.getByRole('option', { name: 'Todas las cajas' }))
    expect(alElegir).toHaveBeenLastCalledWith('')
    if (enBoton) expect(caja()).toHaveTextContent('Todas las cajas')
    else expect(caja()).toHaveValue('Todas las cajas')
  })

  it('`required` queda en el campo para que lo lea un lector de pantalla', () => {
    render(<SelectBuscable {...modo} ariaLabel="Caja" required value="" onChange={vi.fn()} opciones={CAJAS} />)
    expect(caja()).toHaveAttribute('aria-required', 'true')
    if (!enBoton) expect(caja()).toBeRequired()
  })

  it('sin `required` no aparece ningún atributo de obligatorio', () => {
    render(<SelectBuscable {...modo} ariaLabel="Caja" value="" onChange={vi.fn()} opciones={CAJAS} />)
    expect(caja()).not.toHaveAttribute('aria-required')
    expect(caja()).not.toBeRequired()
  })

  it('un valor que no está en la lista (los datos todavía no llegaron) muestra el placeholder, no revienta', () => {
    render(
      <SelectBuscable {...modo} ariaLabel="Caja" value="99" placeholder="Elegí una caja…" onChange={vi.fn()} opciones={[]} />,
    )
    if (enBoton) expect(caja()).toHaveTextContent('Elegí una caja…')
    else {
      expect(caja()).toHaveValue('')
      expect(caja()).toHaveAttribute('placeholder', 'Elegí una caja…')
    }
  })

  it('Escape con la lista abierta, dentro de un diálogo de Radix, cierra la lista y NO el diálogo', async () => {
    // 🔴 Medido: Radix escucha el Escape en `document`, en captura, antes que React. Sin el arreglo de la v0.129.0 cerrar la lista cerraba
    // también el diálogo y se perdía lo cargado en el formulario. Una segunda vez, con la lista ya cerrada, el diálogo sí se cierra.
    const user = userEvent.setup()
    const alCerrarElDialogo = vi.fn()
    render(
      <Dialog.Root open onOpenChange={(abierto) => { if (!abierto) alCerrarElDialogo() }}>
        <Dialog.Portal>
          <Dialog.Content aria-describedby={undefined}>
            <Dialog.Title>Cobrar</Dialog.Title>
            <Cajas />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    )
    await user.click(caja())
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(alCerrarElDialogo).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(alCerrarElDialogo).toHaveBeenCalledTimes(1)
  })
})

describe('SelectBuscable, la × y los formularios nativos', () => {
  const CAJAS: OpcionSelect[] = [{ value: '1', label: 'Caja 1' }, { value: '3', label: 'Caja 3' }]
  const cruz = () => screen.queryByRole('button', { name: 'Quitar la selección' })

  it('la × se ofrece con algo elegido', () => {
    render(<SelectBuscable ariaLabel="Caja" value="1" onChange={vi.fn()} opciones={CAJAS} />)
    expect(cruz()).toBeInTheDocument()
  })

  it('un campo `required` no ofrece la ×: vaciarlo no es una elección', () => {
    render(<SelectBuscable ariaLabel="Caja" required value="1" onChange={vi.fn()} opciones={CAJAS} />)
    expect(cruz()).not.toBeInTheDocument()
  })

  it('`limpiable={false}` la saca; `limpiable` la fuerza aunque sea `required`', () => {
    const { unmount } = render(<SelectBuscable ariaLabel="Caja" limpiable={false} value="1" onChange={vi.fn()} opciones={CAJAS} />)
    expect(cruz()).not.toBeInTheDocument()
    unmount()
    render(<SelectBuscable ariaLabel="Caja" required limpiable value="1" onChange={vi.fn()} opciones={CAJAS} />)
    expect(cruz()).toBeInTheDocument()
  })

  it('con una opción «Todas» (valor vacío) en la lista tampoco: ésa es la forma explícita de vaciar', () => {
    render(
      <SelectBuscable ariaLabel="Caja" value="1" onChange={vi.fn()} opciones={[{ value: '', label: 'Todas' }, ...CAJAS]} />,
    )
    expect(cruz()).not.toBeInTheDocument()
  })

  it('un `required` vacío frena el envío del formulario y con algo elegido lo deja pasar', () => {
    const { rerender } = render(
      <form><SelectBuscable ariaLabel="Caja" required value="" onChange={vi.fn()} opciones={CAJAS} /></form>,
    )
    const formulario = document.querySelector('form')!
    expect(formulario.checkValidity()).toBe(false)

    rerender(<form><SelectBuscable ariaLabel="Caja" required value="1" onChange={vi.fn()} opciones={CAJAS} /></form>)
    expect(formulario.checkValidity()).toBe(true)
  })

  it('escribir a medias y no elegir nada no cuenta como valor: el formulario sigue sin pasar', () => {
    render(<form><SelectBuscable ariaLabel="Caja" required value="" onChange={vi.fn()} opciones={CAJAS} /></form>)
    const campo = screen.getByRole('combobox', { name: 'Caja' })
    fireEvent.change(campo, { target: { value: 'caj' } })
    fireEvent.blur(campo)
    expect(campo).toHaveValue('')
    expect(document.querySelector('form')!.checkValidity()).toBe(false)
  })
})

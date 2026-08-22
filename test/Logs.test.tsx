// Pantalla de logs — extraída de LibraDesk (2026-08-06).
//
// Lo que estos tests fijan, en orden de lo que se rompe sin que se note:
//
// 1. **Los filtros viajan al backend.** El filtrado es del lado del servidor
//    (la tabla viene paginada de a 100): un filtro que sólo cambiara el estado
//    local se vería igual en pantalla y devolvería la misma primera página.
// 2. **`basePath` se respeta.** Es la única diferencia entre los cuatro
//    consumidores: LibraDesk monta el router bajo `/api/logs` y los otros tres
//    bajo `/logs`. Si se ignorara, la pantalla andaría en tres productos y en
//    el cuarto daría 404.
// 3. **Cambiar un filtro vuelve a la página 1.** Quedarse en la 4 de un
//    resultado que ahora tiene 2 muestra una tabla vacía que parece un error.
// 4. **El diff se ve al desplegar.** Sin el antes/después, "editado" no dice
//    qué se editó, que es la mitad del valor de la pantalla.
// 5. **Las dos mitades son dos pestañas.** Desde el 2026-08-19 los accesos no
//    van debajo de la actividad sino en su propia pestaña, y la pestaña que no
//    está activa no está en el DOM: un test que busque un acceso sin cambiar
//    de pestaña no lo encuentra, y eso es lo correcto — es lo mismo que le
//    pasa a quien mira la pantalla.
// 6. **La fecha se dice una vez por día.** Desde el 2026-08-22 la consola sigue
//    las directrices de la de Contalibra: separador por día y la fila con la
//    hora sola. Es lo primero que se rompe si alguien "arregla" la columna
//    volviendo a meterle la fecha, y en pantalla no se nota hasta que hay dos
//    días distintos.
// 7. **La acción se filtra con las píldoras.** El filtro dejó de ser un
//    `select`; lo que no cambió es que el filtrado es del lado del servidor,
//    así que lo que se afirma es que el valor VIAJA, no que la lista se vea
//    distinta.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logs } from '../src/Logs'

function IconoFalso({ className }: { className?: string }) {
  return <svg data-testid="icono" className={className} />
}

const RESPUESTA = {
  actividad: [
    {
      id: 3, ts: '2026-08-05 14:32:10', usuario: 'admin', accion: 'editar',
      entidad: 'cliente', entidad_id: 7, descripcion: 'Cliente — Compulibra',
      cambios: { nombre: ['Nombre viejo', 'Nombre nuevo'] },
    },
    {
      id: 2, ts: '2026-08-05 14:30:00', usuario: 'tecnico1', accion: 'borrar',
      entidad: 'turno', entidad_id: 4, descripcion: 'Turno — Consulta',
      cambios: null,
    },
  ],
  total: 2,
  total_pages: 1,
  page: 1,
  entidades: ['cliente', 'turno'],
  acciones: {
    crear: { label: 'Creado', color: '#198754' },
    editar: { label: 'Editado', color: '#0d6efd' },
    borrar: { label: 'Borrado', color: '#dc3545' },
  },
  usuarios: ['admin', 'tecnico1'],
  accesos: [
    { id: 9, ts: '2026-08-05 14:29:00', evento: 'login', username: 'admin', ip: '203.0.113.7', detalle: '' },
    { id: 8, ts: '2026-08-05 14:28:00', evento: 'login_fallido', username: 'fantasma', ip: '203.0.113.9', detalle: '' },
  ],
}

let urls: string[] = []

function responder(extra: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    urls.push(String(url))
    const cuerpo = { ...RESPUESTA, ...extra }
    if (String(url).includes('page=2')) cuerpo.page = 2
    return Promise.resolve(new Response(JSON.stringify(cuerpo), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
  }))
}

beforeEach(() => {
  urls = []
  responder()
})

async function esperarCarga() {
  await waitFor(() => expect(screen.getByText('Cliente — Compulibra')).toBeInTheDocument())
}

// La actividad es la pestaña por defecto; los accesos hay que ir a buscarlos.
async function irAAccesos() {
  await userEvent.click(screen.getByRole('tab', { name: /Accesos/ }))
}

// Los accesos son un `ul` desde el 2026-08-22 (antes una tabla). `role=list`
// y no una clase de Tailwind: lo que importa es que siga siendo una lista para
// quien la navega con lector de pantalla.
function listaDeAccesos(): HTMLElement {
  return screen.getByRole('list')
}

// El stub de shadcn no propaga el `id` del trigger al `<select>` nativo, así
// que los dos filtros de lista se toman por orden: entidad, usuario. La acción
// ya no está acá: desde el 2026-08-22 se filtra con las píldoras de color.
const FILTROS = { entidad: 0, usuario: 1 }

function selectDe(cual: keyof typeof FILTROS): HTMLSelectElement {
  return screen.getAllByRole('combobox')[FILTROS[cual]] as HTMLSelectElement
}

// La píldora de una acción, por su etiqueta ("Editado", "Borrado"). Se toma el
// `button` y no el `Badge` de adentro: el badge es un `span` y el click tiene
// que ir al control.
function pildoraDe(label: string): HTMLElement {
  return screen.getByRole('button', { name: label })
}

describe('Logs — actividad', () => {
  it('muestra qué pasó, quién lo hizo y cuándo', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    // Acotado a la tabla: "Editado" también es la etiqueta de la píldora de
    // filtro, así que una búsqueda global encuentra dos.
    const tablaActividad = screen.getAllByRole('table')[0]
    expect(within(tablaActividad).getByText('Editado')).toBeInTheDocument()
    expect(within(tablaActividad).getByText('tecnico1')).toBeInTheDocument()
    // La fila muestra SÓLO la hora — la fecha la dice el separador del día.
    // El `title` conserva el `ts` completo para el que quiera el dato exacto.
    expect(screen.getByTitle('2026-08-05 14:32:10')).toHaveTextContent('14:32:10')
  })

  it('la fecha se dice una vez por día, no una vez por fila', async () => {
    // Dos filas del 05 y una del 04. Si la fecha volviera a la fila habría
    // tres apariciones del 05-08-2026 en vez de una: ese es el control que
    // distingue "hay un separador" de "cada fila repite la fecha".
    responder({
      actividad: [
        { ...RESPUESTA.actividad[0], id: 30, ts: '2026-08-05 14:32:10' },
        { ...RESPUESTA.actividad[1], id: 20, ts: '2026-08-05 09:00:00' },
        { ...RESPUESTA.actividad[1], id: 10, ts: '2026-08-04 18:15:00' },
      ],
      total: 3,
    })
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    expect(screen.getAllByText('05-08-2026')).toHaveLength(1)
    expect(screen.getAllByText('04-08-2026')).toHaveLength(1)
    // Y las horas sí, una por fila.
    expect(screen.getByText('09:00:00')).toBeInTheDocument()
    expect(screen.getByText('18:15:00')).toBeInTheDocument()
  })

  it('dice cuántos registros se están viendo y de cuántos', async () => {
    responder({ total: 250, total_pages: 3 })
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    // "Mostrando 2 de 250": el 2 son las filas de esta página, el 250 el total
    // del filtro. Sin el total, el paginador dice "Pág 1 / 3" y no cuánto es.
    expect(screen.getByText(/Mostrando/)).toHaveTextContent('Mostrando 2 de 250 registros')
  })

  it('el antes y el después se ven al desplegar la fila', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    expect(screen.queryByText('Nombre viejo')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Cliente — Compulibra'))

    expect(screen.getByText('Nombre viejo')).toBeInTheDocument()
    expect(screen.getByText('Nombre nuevo')).toBeInTheDocument()
  })

  it('avisa distinto cuando no hay nada que cuando el filtro no matchea', async () => {
    responder({ actividad: [], total: 0 })
    render(<Logs icono={IconoFalso} />)
    await waitFor(() => {
      expect(screen.getByText('Todavía no hay actividad registrada.')).toBeInTheDocument()
    })
  })
})

describe('Logs — el backend manda', () => {
  it('respeta el basePath del producto', async () => {
    render(<Logs basePath="/api/logs" icono={IconoFalso} />)
    await esperarCarga()
    expect(urls[0]).toContain('/api/logs?')
  })

  it('el default es /logs', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    expect(urls[0]).toMatch(/^\/logs\?/)
  })

  it('las entidades del filtro salen de la respuesta, no de una lista propia', async () => {
    // Es lo que permite que la misma pantalla sirva a cuatro dominios
    // distintos sin tocarla.
    responder({ entidades: ['paciente', 'receta', 'estudio'] })
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    const opciones = within(selectDe('entidad')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Todas', 'paciente', 'receta', 'estudio'])
  })
})

describe('Logs — filtros', () => {
  it('el filtro de entidad viaja al backend', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    urls = []

    await userEvent.selectOptions(selectDe('entidad'), 'turno')

    await waitFor(() => expect(urls.some((u) => u.includes('entidad=turno'))).toBe(true))
  })

  it('la píldora de acción viaja al backend', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    urls = []

    await userEvent.click(pildoraDe('Borrado'))

    // El valor que viaja es la CLAVE de la acción, no la etiqueta: el backend
    // filtra por `borrar`, "Borrado" es sólo lo que se muestra.
    await waitFor(() => expect(urls.some((u) => u.includes('accion=borrar'))).toBe(true))
  })

  it('tocar la píldora activa vuelve a todas', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    urls = []
    await userEvent.click(pildoraDe('Borrado'))
    // Control positivo dentro del mismo test: si el filtro no viajara NUNCA,
    // el "no aparece `accion=`" de más abajo pasaría en verde sin medir nada.
    await waitFor(() => expect(urls.some((u) => u.includes('accion=borrar'))).toBe(true))
    expect(pildoraDe('Borrado')).toHaveAttribute('aria-pressed', 'true')
    urls = []

    await userEvent.click(pildoraDe('Borrado'))

    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    // Sin ninguna elegida no se manda el parámetro: "todas" es la ausencia del
    // filtro, no un valor especial que el backend tenga que conocer.
    expect(urls.every((u) => !u.includes('accion='))).toBe(true)
    expect(pildoraDe('Borrado')).toHaveAttribute('aria-pressed', 'false')
  })

  it('Limpiar borra todos los filtros de una', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    await userEvent.click(pildoraDe('Editado'))
    await userEvent.selectOptions(selectDe('entidad'), 'turno')
    await userEvent.type(screen.getByLabelText('Desde'), '2026-08-01')
    await waitFor(() => expect(urls.some((u) => u.includes('desde=2026-08-01'))).toBe(true))
    urls = []

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    const ultima = urls[urls.length - 1]
    expect(ultima).not.toContain('accion=')
    expect(ultima).not.toContain('entidad=')
    expect(ultima).not.toContain('desde=')
  })

  it('el filtro de fecha viaja al backend', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    urls = []

    await userEvent.type(screen.getByLabelText('Desde'), '2026-08-01')

    await waitFor(() => expect(urls.some((u) => u.includes('desde=2026-08-01'))).toBe(true))
  })

  it('cambiar un filtro vuelve a la página 1', async () => {
    responder({ total: 250, total_pages: 3 })
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(urls.some((u) => u.includes('page=2'))).toBe(true))
    urls = []

    await userEvent.selectOptions(selectDe('usuario'), 'tecnico1')

    await waitFor(() => expect(urls.some((u) => u.includes('page=1'))).toBe(true))
    expect(urls.every((u) => !u.includes('page=2'))).toBe(true)
  })
})

describe('Logs — estados de la pantalla', () => {
  it('avisa si la carga falla', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ detail: 'no autorizado' }), {
        status: 403, headers: { 'content-type': 'application/json' },
      }),
    )))
    render(<Logs icono={IconoFalso} />)
    await waitFor(() => expect(screen.getByText('no autorizado')).toBeInTheDocument())
  })

  it('avisa cuando el filtro no matchea nada, distinto de cuando no hay nada', async () => {
    responder({ actividad: [], total: 0 })
    render(<Logs icono={IconoFalso} />)
    await waitFor(() => expect(screen.getByText('Todavía no hay actividad registrada.')).toBeInTheDocument())

    await userEvent.click(pildoraDe('Editado'))

    await waitFor(() => {
      expect(screen.getByText('No hay actividad con esos filtros.')).toBeInTheDocument()
    })
  })

  it('la fila se cierra al volver a tocarla, y una sin cambios no abre nada', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    await userEvent.click(screen.getByText('Cliente — Compulibra'))
    expect(screen.getByText('Nombre viejo')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Cliente — Compulibra'))
    expect(screen.queryByText('Nombre viejo')).not.toBeInTheDocument()

    // El borrado no tiene diff: la fila entera es la novedad.
    await userEvent.click(screen.getByText('Turno — Consulta'))
    expect(screen.queryByText('Nombre viejo')).not.toBeInTheDocument()
  })

  it('los valores vacíos y los booleanos se leen', async () => {
    responder({
      actividad: [{
        id: 1, ts: '2026-08-05 10:00:00', usuario: 'ana', accion: 'editar',
        entidad: 'cliente', entidad_id: 1, descripcion: 'Cliente — X',
        cambios: { activo: [null, true], baja: [true, false] },
      }],
    })
    render(<Logs icono={IconoFalso} />)
    await waitFor(() => expect(screen.getByText('Cliente — X')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Cliente — X'))

    // `null` se muestra como raya, no como "null". Los dos booleanos dan un
    // "sí" cada uno (el `[null, true]` y el `[true, false]`), así que se
    // cuentan en vez de buscarlos de a uno.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getAllByText('sí')).toHaveLength(2)
    expect(screen.getByText('no')).toBeInTheDocument()
  })

  it('un ts con formato inesperado se muestra tal cual en vez de romper', async () => {
    responder({
      actividad: [{
        id: 1, ts: 'sin-formato', usuario: 'ana', accion: 'crear',
        entidad: 'cliente', entidad_id: 1, descripcion: 'Cliente — Y', cambios: null,
      }],
    })
    render(<Logs icono={IconoFalso} />)
    // El `ts` entero encabeza el grupo, y la hora queda en raya: recortar a
    // ciegas con `slice(11, 19)` sobre un texto corto devuelve la cadena
    // vacía, que en pantalla es una celda en blanco — parece un dato faltante
    // en vez de un formato que no se entendió.
    await waitFor(() => expect(screen.getByText('sin-formato')).toBeInTheDocument())
    expect(screen.getByTitle('sin-formato')).toHaveTextContent('—')
  })

  it('se puede ir y volver entre páginas', async () => {
    responder({ total: 250, total_pages: 3 })
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(urls.some((u) => u.includes('page=2'))).toBe(true))

    urls = []
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    await waitFor(() => expect(urls.some((u) => u.includes('page=1'))).toBe(true))
  })

  it('con una sola página el paginador está pero no lleva a ningún lado', async () => {
    // Cambió el 2026-08-22: antes desaparecía. La directriz de Contalibra es
    // que la línea diga siempre cuánto se está viendo, y con una sola página
    // eso sigue siendo información — lo que no tiene que haber es a dónde ir.
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    expect(screen.getByText(/Mostrando/)).toHaveTextContent('Mostrando 2 de 2 registros')
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('el filtro hasta también viaja', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    urls = []

    await userEvent.type(screen.getByLabelText('Hasta'), '2026-08-31')

    await waitFor(() => expect(urls.some((u) => u.includes('hasta=2026-08-31'))).toBe(true))
  })

  it('una acción que el backend no describe se muestra igual', async () => {
    // El backend manda el diccionario de acciones; si aparece una que no está
    // ahí, la fila tiene que seguir siendo legible en vez de quedar vacía.
    responder({
      actividad: [{
        id: 1, ts: '2026-08-05 10:00:00', usuario: 'ana', accion: 'archivar',
        entidad: 'cliente', entidad_id: 1, descripcion: 'Cliente — Z', cambios: null,
      }],
    })
    render(<Logs icono={IconoFalso} />)
    await waitFor(() => expect(screen.getByText('archivar')).toBeInTheDocument())
  })

  it('un acceso con evento desconocido y sin IP no rompe la lista', async () => {
    responder({
      accesos: [{ id: 1, ts: '2026-08-05 10:00:00', evento: 'password_reset', username: 'ana', ip: '', detalle: '' }],
    })
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    await irAAccesos()

    const renglon = listaDeAccesos().querySelector('li')!
    expect(within(renglon).getByText('password_reset')).toBeInTheDocument()
    // Sin IP la raya ocupa su lugar, y la fecha sigue estando: si se rompiera
    // el renglón entero, la ausencia de la IP no se distinguiría.
    expect(renglon).toHaveTextContent('— · 05-08-2026 10:00:00')
  })

  it('sin accesos lo dice', async () => {
    responder({ accesos: [] })
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    await irAAccesos()
    expect(screen.getByText('Todavía no hay accesos registrados.')).toBeInTheDocument()
  })
})

describe('Logs — accesos', () => {
  it('el intento fallido se distingue del ingreso', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    await irAAccesos()

    expect(screen.getByText('Ingreso')).toBeInTheDocument()
    expect(screen.getByText('Intento fallido')).toBeInTheDocument()
    expect(screen.getByText('fantasma')).toBeInTheDocument()
  })

  it('muestra la IP, que es el dato por el que se mira esta lista', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    await irAAccesos()

    const renglones = listaDeAccesos().querySelectorAll('li')
    expect(renglones).toHaveLength(2)
    expect(renglones[0]).toHaveTextContent('203.0.113.7')
  })

  it('los accesos son una lista y no una tabla', async () => {
    // Directriz de Contalibra: cuatro datos por renglón no necesitan
    // encabezados de columna. El control es que NO quede ninguna tabla en la
    // pestaña — sin él, agregar la lista al lado de la tabla vieja pasaría.
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    await irAAccesos()

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(listaDeAccesos()).toBeInTheDocument()
  })
})

describe('Logs — las dos mitades no comparten pantalla', () => {
  it('la actividad es la pestaña por defecto y los accesos no están debajo', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()

    // El acceso viene en la MISMA respuesta que ya se rendeó y aun así no está
    // en el DOM. Ese es el control que distingue una pestaña de dos tablas
    // apiladas: sin él, el test pasaría igual con el diseño viejo.
    expect(screen.queryByText('fantasma')).not.toBeInTheDocument()
    expect(screen.getAllByRole('table')).toHaveLength(1)
  })

  it('al ir a accesos la actividad deja de estar, y sus filtros también', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    await irAAccesos()

    expect(screen.getByText('fantasma')).toBeInTheDocument()
    expect(screen.queryByText('Cliente — Compulibra')).not.toBeInTheDocument()
    // Los filtros son de la actividad: no aplican a los accesos y por eso
    // viven adentro de esa pestaña, no arriba de las dos.
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument()
  })

  it('se vuelve a la actividad sin recargar', async () => {
    render(<Logs icono={IconoFalso} />)
    await esperarCarga()
    urls = []
    await irAAccesos()
    await userEvent.click(screen.getByRole('tab', { name: /Actividad/ }))

    expect(screen.getByText('Cliente — Compulibra')).toBeInTheDocument()
    // Cambiar de pestaña no vuelve a pedir: las dos mitades llegan juntas.
    expect(urls).toHaveLength(0)
  })
})

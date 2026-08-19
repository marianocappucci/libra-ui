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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logs } from '../src/Logs'

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

// El stub de shadcn no propaga el `id` del trigger al `<select>` nativo, así
// que los tres filtros se toman por orden: entidad, acción, usuario.
const FILTROS = { entidad: 0, accion: 1, usuario: 2 }

function selectDe(cual: keyof typeof FILTROS): HTMLSelectElement {
  return screen.getAllByRole('combobox')[FILTROS[cual]] as HTMLSelectElement
}

describe('Logs — actividad', () => {
  it('muestra qué pasó, quién lo hizo y cuándo', async () => {
    render(<Logs />)
    await esperarCarga()

    // Acotado a la tabla: "Editado" también es una opción del filtro de
    // acción, así que una búsqueda global encuentra dos.
    const tablaActividad = screen.getAllByRole('table')[0]
    expect(within(tablaActividad).getByText('Editado')).toBeInTheDocument()
    expect(within(tablaActividad).getByText('tecnico1')).toBeInTheDocument()
    // `2026-08-05 14:32:10` se muestra como `05-08 14:32`, con la fecha
    // completa en el title. El separador es el guion desde el 2026-08-12: el
    // formato visible del ecosistema es dd-mm-aaaa.
    expect(screen.getByTitle('2026-08-05 14:32:10')).toHaveTextContent('05-08 14:32')
  })

  it('el antes y el después se ven al desplegar la fila', async () => {
    render(<Logs />)
    await esperarCarga()
    expect(screen.queryByText('Nombre viejo')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Cliente — Compulibra'))

    expect(screen.getByText('Nombre viejo')).toBeInTheDocument()
    expect(screen.getByText('Nombre nuevo')).toBeInTheDocument()
  })

  it('avisa distinto cuando no hay nada que cuando el filtro no matchea', async () => {
    responder({ actividad: [], total: 0 })
    render(<Logs />)
    await waitFor(() => {
      expect(screen.getByText('Todavía no hay actividad registrada.')).toBeInTheDocument()
    })
  })
})

describe('Logs — el backend manda', () => {
  it('respeta el basePath del producto', async () => {
    render(<Logs basePath="/api/logs" />)
    await esperarCarga()
    expect(urls[0]).toContain('/api/logs?')
  })

  it('el default es /logs', async () => {
    render(<Logs />)
    await esperarCarga()
    expect(urls[0]).toMatch(/^\/logs\?/)
  })

  it('las entidades del filtro salen de la respuesta, no de una lista propia', async () => {
    // Es lo que permite que la misma pantalla sirva a cuatro dominios
    // distintos sin tocarla.
    responder({ entidades: ['paciente', 'receta', 'estudio'] })
    render(<Logs />)
    await esperarCarga()

    const opciones = within(selectDe('entidad')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Todas', 'paciente', 'receta', 'estudio'])
  })
})

describe('Logs — filtros', () => {
  it('el filtro de entidad viaja al backend', async () => {
    render(<Logs />)
    await esperarCarga()
    urls = []

    await userEvent.selectOptions(selectDe('entidad'), 'turno')

    await waitFor(() => expect(urls.some((u) => u.includes('entidad=turno'))).toBe(true))
  })

  it('el filtro de fecha viaja al backend', async () => {
    render(<Logs />)
    await esperarCarga()
    urls = []

    await userEvent.type(screen.getByLabelText('Desde'), '2026-08-01')

    await waitFor(() => expect(urls.some((u) => u.includes('desde=2026-08-01'))).toBe(true))
  })

  it('cambiar un filtro vuelve a la página 1', async () => {
    responder({ total: 250, total_pages: 3 })
    render(<Logs />)
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
    render(<Logs />)
    await waitFor(() => expect(screen.getByText('no autorizado')).toBeInTheDocument())
  })

  it('avisa cuando el filtro no matchea nada, distinto de cuando no hay nada', async () => {
    responder({ actividad: [], total: 0 })
    render(<Logs />)
    await waitFor(() => expect(screen.getByText('Todavía no hay actividad registrada.')).toBeInTheDocument())

    await userEvent.selectOptions(selectDe('accion'), 'editar')

    await waitFor(() => {
      expect(screen.getByText('No hay actividad con esos filtros.')).toBeInTheDocument()
    })
  })

  it('la fila se cierra al volver a tocarla, y una sin cambios no abre nada', async () => {
    render(<Logs />)
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
    render(<Logs />)
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
    render(<Logs />)
    await waitFor(() => expect(screen.getByTitle('sin-formato')).toHaveTextContent('sin-formato'))
  })

  it('se puede ir y volver entre páginas', async () => {
    responder({ total: 250, total_pages: 3 })
    render(<Logs />)
    await esperarCarga()

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(urls.some((u) => u.includes('page=2'))).toBe(true))

    urls = []
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    await waitFor(() => expect(urls.some((u) => u.includes('page=1'))).toBe(true))
  })

  it('sin más de una página no hay paginador', async () => {
    render(<Logs />)
    await esperarCarga()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()
  })

  it('el filtro hasta también viaja', async () => {
    render(<Logs />)
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
    render(<Logs />)
    await waitFor(() => expect(screen.getByText('archivar')).toBeInTheDocument())
  })

  it('un acceso con evento desconocido y sin IP no rompe la tabla', async () => {
    responder({
      accesos: [{ id: 1, ts: '2026-08-05 10:00:00', evento: 'password_reset', username: 'ana', ip: '', detalle: '' }],
    })
    render(<Logs />)
    await esperarCarga()
    await irAAccesos()

    const tablaAccesos = screen.getAllByRole('table').at(-1)!
    expect(within(tablaAccesos).getByText('password_reset')).toBeInTheDocument()
    expect(within(tablaAccesos).getByText('—')).toBeInTheDocument()
  })

  it('sin accesos lo dice', async () => {
    responder({ accesos: [] })
    render(<Logs />)
    await esperarCarga()
    await irAAccesos()
    expect(screen.getByText('Todavía no hay accesos registrados.')).toBeInTheDocument()
  })
})

describe('Logs — accesos', () => {
  it('el intento fallido se distingue del ingreso', async () => {
    render(<Logs />)
    await esperarCarga()
    await irAAccesos()

    expect(screen.getByText('Ingreso')).toBeInTheDocument()
    expect(screen.getByText('Intento fallido')).toBeInTheDocument()
    expect(screen.getByText('fantasma')).toBeInTheDocument()
  })

  it('muestra la IP, que es el dato por el que se mira esta tabla', async () => {
    render(<Logs />)
    await esperarCarga()
    await irAAccesos()

    const tablaAccesos = screen.getAllByRole('table').at(-1)!
    expect(within(tablaAccesos).getByText('203.0.113.7')).toBeInTheDocument()
  })
})

describe('Logs — las dos mitades no comparten pantalla', () => {
  it('la actividad es la pestaña por defecto y los accesos no están debajo', async () => {
    render(<Logs />)
    await esperarCarga()

    // El acceso viene en la MISMA respuesta que ya se rendeó y aun así no está
    // en el DOM. Ese es el control que distingue una pestaña de dos tablas
    // apiladas: sin él, el test pasaría igual con el diseño viejo.
    expect(screen.queryByText('fantasma')).not.toBeInTheDocument()
    expect(screen.getAllByRole('table')).toHaveLength(1)
  })

  it('al ir a accesos la actividad deja de estar, y sus filtros también', async () => {
    render(<Logs />)
    await esperarCarga()
    await irAAccesos()

    expect(screen.getByText('fantasma')).toBeInTheDocument()
    expect(screen.queryByText('Cliente — Compulibra')).not.toBeInTheDocument()
    // Los filtros son de la actividad: no aplican a los accesos y por eso
    // viven adentro de esa pestaña, no arriba de las dos.
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument()
  })

  it('se vuelve a la actividad sin recargar', async () => {
    render(<Logs />)
    await esperarCarga()
    urls = []
    await irAAccesos()
    await userEvent.click(screen.getByRole('tab', { name: /Actividad/ }))

    expect(screen.getByText('Cliente — Compulibra')).toBeInTheDocument()
    // Cambiar de pestaña no vuelve a pedir: las dos mitades llegan juntas.
    expect(urls).toHaveLength(0)
  })
})

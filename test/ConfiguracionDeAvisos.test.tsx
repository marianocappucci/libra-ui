// La pantalla de configuración de los avisos (ADR-097), contraparte de `build_avisos_router` del motor (ADR-090).
//
// El grueso está sobre UNA regla: la apikey de Evolution es sólo de escritura. El motor nunca la devuelve, así que el campo arranca vacío y
// **no viaja** salvo que se haya tipeado algo (o se pida quitarla): guardar la URL con el campo vacío no puede tocarla. Después, lo que la
// persona tiene que entender: los modos, por qué no manda, el 502 de Evolution, el nodo (409) y la demo.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfiguracionDeAvisos } from '../src/ConfiguracionDeAvisos'
import type { EstadoDeAvisos } from '../src/avisos'

const REGISTRO: EstadoDeAvisos = {
  whatsapp: {
    modo: 'registro', modos: ['apagado', 'registro', 'evolution'], url: '', instancia: '',
    apikey_cargada: false, disponible: true, motivo: '',
  },
  email: { disponible: true },
}

const EVOLUTION: EstadoDeAvisos = {
  whatsapp: {
    modo: 'evolution', modos: ['apagado', 'registro', 'evolution'], url: 'https://evolution.club.test', instancia: 'club-demo',
    apikey_cargada: true, disponible: true, motivo: '',
  },
  email: { disponible: true },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** `GET /config` contesta `estado`; el resto lo decide cada test con `respuestas`. */
function responde(estado: EstadoDeAvisos, respuestas: Record<string, () => Response> = {}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const clave = `${init?.method ?? 'GET'} ${url}`
    return Promise.resolve(respuestas[clave]?.() ?? json(estado))
  })
}

async function montar(estado: EstadoDeAvisos, respuestas: Record<string, () => Response> = {}, props: { demo?: boolean; basePath?: string } = {}) {
  responde(estado, respuestas)
  render(<ConfiguracionDeAvisos {...props} />)
  await screen.findByLabelText('URL base de Evolution')
}

function llamada(metodo: string, ruta: string) {
  const c = fetchMock.mock.calls.find((x) => (x[1]?.method ?? 'GET') === metodo && String(x[0]).endsWith(ruta))
  expect(c, `no se hizo ${metodo} ${ruta}`).toBeTruthy()
  return c!
}
const cuerpo = (metodo: string, ruta: string) => JSON.parse(llamada(metodo, ruta)[1].body as string)

describe('carga', () => {
  it('pide la configuración al router y muestra la URL, la instancia y el modo', async () => {
    await montar(EVOLUTION)
    expect(String(llamada('GET', '/config')[0])).toBe('/api/avisos/config')
    expect(screen.getByLabelText('URL base de Evolution')).toHaveValue('https://evolution.club.test')
    expect(screen.getByLabelText('Instancia')).toHaveValue('club-demo')
    expect(screen.getByRole('radio', { name: 'Evolution', checked: true })).toBeInTheDocument()
  })

  it('usa el basePath del producto', async () => {
    await montar(REGISTRO, {}, { basePath: '/api/club/avisos' })
    expect(String(llamada('GET', '/config')[0])).toBe('/api/club/avisos/config')
  })

  it('🔑 la apikey nunca se muestra: el campo está vacío y un aviso dice que está «Cargada»', async () => {
    await montar(EVOLUTION)
    expect(screen.getByLabelText('API key')).toHaveValue('')
    expect(screen.getByText('Cargada')).toBeInTheDocument()
    expect(screen.getByLabelText('API key')).toHaveAttribute('placeholder', expect.stringContaining('dejalo vacío'))
  })

  it('sin apikey guardada no dice «Cargada» ni ofrece quitarla', async () => {
    await montar(REGISTRO)
    expect(screen.queryByText('Cargada')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Quitar la apikey guardada')).not.toBeInTheDocument()
  })

  it('un error al leer lo dice y deja reintentar', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'Error interno' }, 500))
    render(<ConfiguracionDeAvisos />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno')
    responde(REGISTRO)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByLabelText('URL base de Evolution')).toBeInTheDocument()
  })
})

describe('los modos, en criollo', () => {
  it('cada modo trae su explicación', async () => {
    await montar(REGISTRO)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByText(/Arma los mensajes pero no manda nada/)).toBeInTheDocument()
    expect(screen.getByText(/Manda de verdad, desde el número vinculado/)).toBeInTheDocument()
    expect(screen.getByText('No se arma ni se manda ningún aviso por WhatsApp.')).toBeInTheDocument()
    // La explicación está atada al radio, no suelta.
    expect(screen.getByRole('radio', { name: 'Registro' })).toHaveAccessibleDescription(/Arma los mensajes pero no manda nada/)
  })

  it('el resumen de arriba dice qué hace el modo guardado', async () => {
    await montar(REGISTRO)
    expect(screen.getByText('En registro')).toBeInTheDocument()
    expect(screen.getByText(/pero no sale ningún mensaje/)).toBeInTheDocument()
  })

  it('con Evolution disponible dice «Conectado»', async () => {
    await montar(EVOLUTION)
    expect(screen.getByText('Conectado')).toBeInTheDocument()
  })

  it('muestra por qué no manda (el `motivo` del motor)', async () => {
    await montar({
      ...EVOLUTION,
      whatsapp: { ...EVOLUTION.whatsapp, apikey_cargada: false, disponible: false, motivo: 'Falta cargar la apikey.' },
    })
    expect(screen.getByText('No manda')).toBeInTheDocument()
    expect(screen.getByText('Falta cargar la apikey.')).toBeInTheDocument()
  })

  it('apagado dice «WhatsApp está apagado.»', async () => {
    await montar({
      ...REGISTRO, whatsapp: { ...REGISTRO.whatsapp, modo: 'apagado', disponible: false, motivo: 'WhatsApp está apagado.' },
    })
    expect(screen.getByText('Apagado', { selector: '[data-tono]' })).toBeInTheDocument()
    expect(screen.getByText('WhatsApp está apagado.')).toBeInTheDocument()
  })

  it('dice si el correo tiene servidor y, si no, dónde se carga', async () => {
    await montar({ ...REGISTRO, email: { disponible: false } })
    expect(screen.getByText('Sin servidor')).toBeInTheDocument()
    expect(screen.getByText(/Se carga en Configuración, en «Email \/ SMTP»/)).toBeInTheDocument()
  })

  it('un modo que el kit no conoce se lista con su nombre y no rompe', async () => {
    await montar({ ...REGISTRO, whatsapp: { ...REGISTRO.whatsapp, modo: 'meta', modos: ['apagado', 'meta'] } })
    expect(screen.getByRole('radio', { name: 'meta', checked: true })).toBeInTheDocument()
  })
})

describe('guardar', () => {
  it('🔴 sin tocar la apikey NO la manda (ni vacía ni `quitar_apikey`)', async () => {
    const user = userEvent.setup()
    await montar(EVOLUTION, { 'PUT /api/avisos/config': () => json(EVOLUTION) })
    await user.clear(screen.getByLabelText('Instancia'))
    await user.type(screen.getByLabelText('Instancia'), 'club-nueva')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText('Configuración guardada.')

    const c = cuerpo('PUT', '/config')
    expect(c).toEqual({ modo: 'evolution', url: 'https://evolution.club.test', instancia: 'club-nueva' })
    expect('apikey' in c).toBe(false)
    expect('quitar_apikey' in c).toBe(false)
  })

  it('con una apikey tipeada la manda, y después el campo queda vacío', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO, {
      'PUT /api/avisos/config': () => json({ ...EVOLUTION }),
    })
    await user.type(screen.getByLabelText('URL base de Evolution'), 'https://evolution.club.test')
    await user.type(screen.getByLabelText('Instancia'), 'club-demo')
    await user.type(screen.getByLabelText('API key'), ' SECRETA-123 ')
    await user.click(screen.getByRole('radio', { name: 'Evolution' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText('Configuración guardada.')

    expect(cuerpo('PUT', '/config')).toEqual({
      modo: 'evolution', url: 'https://evolution.club.test', instancia: 'club-demo', apikey: 'SECRETA-123',
    })
    expect(screen.getByLabelText('API key')).toHaveValue('')
    expect(screen.getByText('Cargada')).toBeInTheDocument()
    // La apikey no quedó en ningún lado de la pantalla.
    expect(document.body.textContent).not.toContain('SECRETA-123')
  })

  it('«Quitar la apikey guardada» manda `quitar_apikey` y no una apikey', async () => {
    const user = userEvent.setup()
    await montar(EVOLUTION, { 'PUT /api/avisos/config': () => json(REGISTRO) })
    await user.type(screen.getByLabelText('API key'), 'algo')
    await user.click(screen.getByLabelText('Quitar la apikey guardada'))
    expect(screen.getByLabelText('API key')).toHaveValue('')
    expect(screen.getByLabelText('API key')).toBeDisabled()
    expect(screen.getByText('Se quita al guardar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText('Configuración guardada.')

    const c = cuerpo('PUT', '/config')
    expect(c.quitar_apikey).toBe(true)
    expect('apikey' in c).toBe(false)
  })

  it('un 422 del motor (falta la URL, por ejemplo) se muestra tal cual', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO, {
      'PUT /api/avisos/config': () => json({ detail: 'Para usar Evolution falta cargar la URL y la apikey.' }, 422),
    })
    await user.click(screen.getByRole('radio', { name: 'Evolution' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Para usar Evolution falta cargar la URL y la apikey.')
  })
})

describe('probar el envío', () => {
  it('manda el número al router y dice que salió', async () => {
    const user = userEvent.setup()
    await montar(EVOLUTION, {
      'POST /api/avisos/probar': () => json({ ok: true, estado: 'enviado', simulado: false, detalle: '' }),
    })
    await user.type(screen.getByLabelText('Número de WhatsApp'), '11 5555-1234')
    await user.click(screen.getByRole('button', { name: 'Probar envío' }))
    expect(await screen.findByRole('status')).toHaveTextContent('el mensaje de prueba salió')
    expect(cuerpo('POST', '/probar')).toEqual({ canal: 'whatsapp', destino: '11 5555-1234' })
  })

  it('sin número no llama al router', async () => {
    const user = userEvent.setup()
    await montar(EVOLUTION)
    await user.click(screen.getByRole('button', { name: 'Probar envío' }))
    expect(screen.getByRole('status')).toHaveTextContent('Escribí el número')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/probar'))).toBe(false)
  })

  it('en modo Registro dice que quedó anotada y no salió nada', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO, {
      'POST /api/avisos/probar': () => json({ ok: true, estado: 'registrado', simulado: true, detalle: '' }),
    })
    await user.type(screen.getByLabelText('Número de WhatsApp'), '1155551234')
    await user.click(screen.getByRole('button', { name: 'Probar envío' }))
    expect(await screen.findByRole('status')).toHaveTextContent('WhatsApp está en modo Registro')
  })

  it('una prueba «simulada» con Evolution guardado es una demo, y se explica', async () => {
    const user = userEvent.setup()
    await montar(EVOLUTION, {
      'POST /api/avisos/probar': () => json({ ok: true, estado: 'registrado', simulado: true, detalle: '' }),
    })
    await user.type(screen.getByLabelText('Número de WhatsApp'), '1155551234')
    await user.click(screen.getByRole('button', { name: 'Probar envío' }))
    expect(await screen.findByRole('status')).toHaveTextContent('una demo nunca manda por WhatsApp')
  })

  it('🔴 un 502 de Evolution dice qué revisar y no manda al login', async () => {
    const alVencer = vi.fn()
    const { configurarSesionVencida } = await import('../src/api-client')
    configurarSesionVencida(alVencer)
    const user = userEvent.setup()
    await montar(EVOLUTION, {
      'POST /api/avisos/probar': () => json({ detail: { codigo: 'fallo_del_proveedor', mensaje: 'Evolution rechazó la apikey (401).' } }, 502),
    })
    await user.type(screen.getByLabelText('Número de WhatsApp'), '1155551234')
    await user.click(screen.getByRole('button', { name: 'Probar envío' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Evolution no pudo mandar la prueba: Evolution rechazó la apikey (401).')
    expect(alerta).toHaveTextContent('Revisá la URL, el nombre de la instancia y la apikey')
    expect(alVencer).not.toHaveBeenCalled()
  })

  it('un 409 `no_disponible` (WhatsApp apagado) muestra el motivo del motor', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO, {
      'POST /api/avisos/probar': () => json({ detail: { codigo: 'no_disponible', mensaje: 'WhatsApp está apagado.' } }, 409),
    })
    await user.type(screen.getByLabelText('Número de WhatsApp'), '1155551234')
    await user.click(screen.getByRole('button', { name: 'Probar envío' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('WhatsApp está apagado.')
  })

  it('un 422 por un teléfono que no se reconoce se muestra tal cual', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO, {
      'POST /api/avisos/probar': () => json({ detail: 'El teléfono no se reconoce: escribilo con característica, por ejemplo 11 5555-1234.' }, 422),
    })
    await user.type(screen.getByLabelText('Número de WhatsApp'), '555')
    await user.click(screen.getByRole('button', { name: 'Probar envío' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El teléfono no se reconoce')
  })

  it('avisa que la prueba usa lo guardado cuando hay cambios sin guardar', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO)
    expect(screen.queryByText(/cambios sin guardar/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Instancia'), 'x')
    expect(screen.getByText(/Tenés cambios sin guardar/)).toBeInTheDocument()
  })
})

describe('un nodo de LibraEdge (409 `solo_en_el_central`)', () => {
  const nodo = () => json({ detail: { codigo: 'solo_en_el_central', mensaje: 'Esta función sólo está disponible en el central, no en el equipo del local.' } }, 409)

  it('al guardar lo explica y deja la pantalla de consulta', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO, { 'PUT /api/avisos/config': nodo })
    await user.type(screen.getByLabelText('Instancia'), 'club')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/Este equipo es un nodo del local/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Probar envío' })).toBeDisabled()
    expect(screen.getByLabelText('URL base de Evolution')).toBeDisabled()
    // No es un error rojo suelto: el aviso del nodo reemplaza al mensaje genérico.
    expect(screen.queryByText('Esta función sólo está disponible en el central, no en el equipo del local.')).not.toBeInTheDocument()
  })

  it('al probar también', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO, { 'POST /api/avisos/probar': nodo })
    await user.type(screen.getByLabelText('Número de WhatsApp'), '1155551234')
    await user.click(screen.getByRole('button', { name: 'Probar envío' }))
    expect(await screen.findByText(/Este equipo es un nodo del local/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
})

describe('una demo', () => {
  it('con `demo` lo dice de entrada y no deja elegir Evolution', async () => {
    await montar(REGISTRO, {}, { demo: true })
    expect(screen.getByText(/Esto es una demo: los avisos por WhatsApp sólo se anotan/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Evolution' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Registro' })).toBeEnabled()
  })

  it('sin `demo` no dice nada de demos y Evolution se puede elegir', async () => {
    await montar(REGISTRO)
    expect(screen.queryByText(/Esto es una demo/)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Evolution' })).toBeEnabled()
  })

  it('sin `demo`, el 422 del motor al guardar Evolution en una demo se muestra', async () => {
    const user = userEvent.setup()
    await montar(REGISTRO, {
      'PUT /api/avisos/config': () => json({ detail: 'En una demo los avisos por WhatsApp sólo se registran: no se puede conectar Evolution.' }, 422),
    })
    await user.click(screen.getByRole('radio', { name: 'Evolution' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('En una demo los avisos por WhatsApp sólo se registran'))
  })
})

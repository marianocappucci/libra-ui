// Los caminos de error de la Configuración canónica.
//
// Van en un archivo aparte del de la pantalla porque **cada uno necesita su
// propio `fetch`**: lo que se prueba acá no es qué se rinde cuando todo anda,
// sino qué se ve cuando el backend dice que no.
//
// 🔴 **Es el modo de fallar propio de una pantalla de configuración**: guardar
// no devuelve nada visible, así que un error tragado se lee como "guardó". El
// cliente cierra la pantalla convencido de que cargó su certificado, y se
// entera al emitir la primera factura.
//
// Y una segunda razón, menos obvia: el `catch` de cada acción es la única rama
// donde `ocupado` vuelve a `false`. Sin cubrirla, un error dejaría los botones
// deshabilitados para siempre y la pantalla habría que recargarla — eso
// tampoco se ve mirando el camino feliz.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ArcaCard, DatosBackupCard, EmpresaCard, MercadoPagoCard,
} from '../src/Configuracion'

const ARCA = {
  empresa: 'default', cuit: '20111111119', punto_venta: 3,
  ambiente: 'homologacion', alias: '',
  certificado_path: '/certs/c.crt', clave_path: '/certs/c.key',
  tiene_certificado: true, tiene_clave: true,
}

const MP = {
  mp_access_token: 'APP_…9f2a', mp_access_token_cargado: true,
  mp_webhook_secret: '', mp_webhook_secret_cargado: false,
  mp_concepto_descripcion: '', mp_iva_rate: '', mp_user_id: '9', mp_pos_id: 'CAJA01',
  mp_auto_facturar_ventas: false,
}

const EMPRESA = {
  empresa_nombre: 'X', empresa_direccion: '', empresa_cuit: '', empresa_telefono: '',
  empresa_email: '', empresa_iibb: '', empresa_iva_condition: 'Monotributista',
  empresa_inicio_actividades: '',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

const montar = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

/** Responde bien a las lecturas y falla en todo lo que escribe.
 *
 *  Es la forma del defecto que importa: la pantalla carga, se ve normal, y
 *  recién al apretar Guardar hay que decir que no anduvo.
 */
function fallaAlEscribir(detalle: string, lecturas: (u: string) => Response) {
  vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET'
    if (metodo === 'GET') return Promise.resolve(lecturas(String(url)))
    return Promise.resolve(json({ detail: detalle }, 422))
  }))
}

const LECTURAS_ARCA = (u: string) => {
  if (u.includes('/estado')) {
    return json({
      configurado: true, ambiente: 'homologacion', cuit: '20111111119',
      tiene_certificado: true, tiene_clave: true,
    })
  }
  return json(ARCA)
}

beforeEach(() => {
  vi.unstubAllGlobals()
})


describe('ARCA — cuando el backend dice que no', () => {
  it('un certificado que no es un certificado se rechaza con el motivo de ARCA', async () => {
    // El router valida el archivo ANTES de escribirlo: subir el `.csr` —el
    // pedido— en vez del `.crt` que ARCA devuelve es el error habitual, y sin
    // este mensaje se descubría recién al emitir el primer comprobante.
    fallaAlEscribir('El certificado no es un certificado X.509 válido.', LECTURAS_ARCA)
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    // ⚠️ La extensión tiene que matchear el `accept` del input: `userEvent`
    // respeta ese filtro y con un `.csr` no sube nada, así que el test pasaría
    // por no haber ejercido la subida. El caso real es justamente éste: el
    // portal de ARCA entrega el CSR y el certificado con la misma extensión
    // `.pem`, y lo que distingue uno de otro es el contenido — que es lo que
    // el backend mira.
    await usuario.upload(
      await screen.findByLabelText(/Certificado/),
      new File(['-----BEGIN CERTIFICATE REQUEST-----'], 'pedido.pem', { type: 'text/plain' }),
    )

    expect(await screen.findByText(/no es un certificado X.509 válido/)).toBeInTheDocument()
  })

  it('una clave que no es pareja del certificado lo dice', async () => {
    fallaAlEscribir('Esta clave privada no es pareja del certificado que ya está cargado.', LECTURAS_ARCA)
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Clave privada/),
      new File(['x'], 'otra.key', { type: 'text/plain' }),
    )

    expect(await screen.findByText(/no es pareja del certificado/)).toBeInTheDocument()
  })

  it('guardar con un CUIT que el backend rechaza no dice "Guardado"', async () => {
    fallaAlEscribir('CUIT inválido.', LECTURAS_ARCA)
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/^CUIT$/)
    await usuario.click(screen.getByRole('button', { name: /Guardar ARCA/ }))

    expect(await screen.findByText(/CUIT inválido/)).toBeInTheDocument()
    expect(screen.queryByText(/^Guardado\.$/)).toBeNull()
    // Y el botón vuelve a estar disponible: si `ocupado` quedara en `true`, la
    // pantalla habría que recargarla para reintentar.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Guardar ARCA/ })).toBeEnabled()
    })
  })

  it('🔑 probar conexión muestra el texto que devuelve ARCA, no un "error"', async () => {
    // Es el texto que distingue un certificado vencido de uno al que nadie le
    // dio de alta la relación con `wsfe`. Un mensaje genérico deja al cliente
    // sin saber a cuál de los dos portales entrar.
    vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
      if ((opciones?.method ?? 'GET') === 'GET') return Promise.resolve(LECTURAS_ARCA(String(url)))
      return Promise.resolve(json(
        { detail: 'ARCA rechazó la autenticación: cee.notAuthorized' }, 502,
      ))
    }))
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Probar conexión/ }))

    expect(await screen.findByText(/cee\.notAuthorized/)).toBeInTheDocument()
  })

  it('quitar el par, si falla, lo dice', async () => {
    fallaAlEscribir('Esta instancia no tiene configuración de ARCA.', LECTURAS_ARCA)
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Quitar certificado y clave/ }))

    expect(await screen.findByText(/no tiene configuración de ARCA/)).toBeInTheDocument()
  })

  it('una instancia que todavía no facturó abre el formulario vacío, no un error', async () => {
    // `GET` devuelve `null` cuando no hay fila. Sin la caída a la config vacía
    // la pantalla se quedaría en "Cargando…" para siempre — y el alta de un
    // cliente nuevo es justo ese caso.
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      String(url).includes('/estado')
        ? json({ configurado: false, ambiente: '', cuit: '', tiene_certificado: false, tiene_clave: false })
        : json(null),
    )))
    montar(<ArcaCard producto="Contalibra" />)

    expect(await screen.findByLabelText(/^CUIT$/)).toHaveValue('')
    // Sin certificado no ofrece probar ni quitar: son acciones sobre algo que
    // no está.
    expect(screen.queryByRole('button', { name: /Probar conexión/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Quitar certificado/ })).toBeNull()
  })

  it('un LibraCore viejo sin `/estado` no rompe la pantalla, sólo no avisa el vencimiento', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      String(url).includes('/estado') ? json({ detail: 'Not Found' }, 404) : json(ARCA),
    )))
    montar(<ArcaCard producto="Contalibra" />)

    expect(await screen.findByLabelText(/^CUIT$/)).toHaveValue('20111111119')
    expect(screen.queryByText(/vence/i)).toBeNull()
  })

  it('un certificado ilegible se reporta como tal, no como "sin certificado"', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      String(url).includes('/estado')
        ? json({
          configurado: true, ambiente: 'homologacion', cuit: '20111111119',
          tiene_certificado: true, tiene_clave: true,
          error_certificado: 'no se pudo parsear',
        })
        : json(ARCA),
    )))
    montar(<ArcaCard producto="Contalibra" />)

    expect(await screen.findByText(/no se puede leer: no se pudo parsear/)).toBeInTheDocument()
  })

  it('el backend caído se muestra, no deja la pantalla en blanco', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    montar(<ArcaCard producto="Contalibra" />)

    expect(await screen.findByText(/Error de conexión/)).toBeInTheDocument()
  })
})


describe('MercadoPago — cuando el backend dice que no', () => {
  it('guardar con un error del backend no dice "Guardado"', async () => {
    fallaAlEscribir('La alícuota no es válida.', () => json(MP))
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/User ID \(QR\)/)
    await usuario.click(screen.getByRole('button', { name: /Guardar MercadoPago/ }))

    expect(await screen.findByText(/La alícuota no es válida/)).toBeInTheDocument()
    expect(screen.queryByText(/^Guardado\.$/)).toBeNull()
  })

  it('🔑 un token vencido se distingue de uno de otra aplicación', async () => {
    // El texto de MercadoPago va tal cual, recortado: es lo único que dice cuál
    // de los dos problemas es.
    vi.stubGlobal('fetch', vi.fn((_url: string, opciones?: RequestInit) => {
      if ((opciones?.method ?? 'GET') === 'GET') return Promise.resolve(json(MP))
      return Promise.resolve(json({ detail: 'MercadoPago respondió 401: invalid_token' }, 502))
    }))
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Probar conexión/ }))

    expect(await screen.findByText(/invalid_token/)).toBeInTheDocument()
  })

  it('probar sin nickname no imprime "undefined"', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, opciones?: RequestInit) => {
      if ((opciones?.method ?? 'GET') === 'GET') return Promise.resolve(json(MP))
      return Promise.resolve(json({ ok: true }))
    }))
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Probar conexión/ }))

    expect(await screen.findByText(/cuenta verificada/)).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).toBeNull()
  })

  it('quitar las credenciales, si falla, lo dice', async () => {
    fallaAlEscribir('No se pudo escribir la configuración.', () => json(MP))
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Quitar credenciales/ }))

    expect(await screen.findByText(/No se pudo escribir/)).toBeInTheDocument()
  })

  it('una alícuota vacía cae en "Sin IVA" y no en un select en blanco', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(MP))))
    montar(<MercadoPagoCard />)

    await screen.findByLabelText(/User ID \(QR\)/)
    // `mp_iva_rate: ''` es lo que devuelve una instancia que nunca guardó esta
    // sección. Sin la caída a '0', el `<Select>` queda sin valor y el primer
    // guardado manda vacío.
    expect(screen.getByRole('combobox')).toHaveValue('0')
  })

  it('la URL del webhook se copia al portapapeles', async () => {
    const escribir = vi.fn(() => Promise.resolve())
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(MP))))
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()
    // 🔴 El doble va DESPUÉS de `setup()`, no antes: `userEvent` instala su
    // propio `navigator.clipboard` al arrancar y pisaría el espía, dejando el
    // test rojo por un motivo que no tiene nada que ver con la pantalla.
    // Y `defineProperty` y no `Object.assign`: en jsdom `clipboard` es un
    // getter, y asignarle tira "which has only a getter".
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escribir }, configurable: true,
    })

    await usuario.click(await screen.findByRole('button', { name: /Copiar/ }))

    expect(escribir).toHaveBeenCalledWith(`${window.location.origin}/webhooks/mercadopago`)
    expect(await screen.findByRole('button', { name: /Copiado/ })).toBeInTheDocument()
  })

  it('la ruta del webhook la puede cambiar el producto', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(MP))))
    montar(<MercadoPagoCard rutaWebhook="/api/webhooks/mp" />)

    expect(await screen.findByLabelText(/URL del webhook/))
      .toHaveValue(`${window.location.origin}/api/webhooks/mp`)
  })

  it('el backend caído se muestra, no deja la pantalla en blanco', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    montar(<MercadoPagoCard />)

    expect(await screen.findByText(/Error de conexión/)).toBeInTheDocument()
  })
})


describe('Empresa y Datos / Backup — cuando el backend dice que no', () => {
  it('guardar los datos de empresa sin permiso lo dice', async () => {
    fallaAlEscribir('Solo un administrador puede cambiar los datos de la empresa.',
      (u) => (u.includes('/logo') ? new Response('', { status: 404 }) : json(EMPRESA)))
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/^Nombre$/)
    await usuario.click(screen.getByRole('button', { name: /Guardar datos de empresa/ }))

    expect(await screen.findByText(/Solo un administrador/)).toBeInTheDocument()
  })

  it('un logo que el motor rechaza no se anuncia como cargado', async () => {
    fallaAlEscribir('El archivo no es una imagen PNG o JPG.',
      (u) => (u.includes('/logo') ? new Response('', { status: 404 }) : json(EMPRESA)))
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Logo \(PNG o JPG\)/),
      // `.png` por el `accept` del input; lo que el motor rechaza es el
      // contenido, no la extensión.
      new File(['%PDF-1.4'], 'documento.png', { type: 'image/png' }),
    )

    expect(await screen.findByText(/no es una imagen PNG o JPG/)).toBeInTheDocument()
  })

  it('quitar el logo, si falla, lo dice', async () => {
    fallaAlEscribir('No se pudo borrar el archivo.', () => json(EMPRESA))
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Quitar/ }))

    expect(await screen.findByText(/No se pudo borrar/)).toBeInTheDocument()
  })

  it('si no se pueden listar las copias lo dice, en vez de "todavía no hay ninguna"', async () => {
    // 🔴 La diferencia importa: "no hay ninguna" es tranquilizador y falso. Un
    // cliente que ve eso cree que el backup automático nunca corrió, cuando lo
    // que pasó es que la pantalla no pudo preguntar.
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      String(url).includes('/backups')
        ? json({ detail: 'No se puede leer el directorio de copias.' }, 500)
        : json({ contratado: false, al_dia: null, motivo: null, detalle: null }),
    )))
    montar(<DatosBackupCard />)

    expect(await screen.findByText(/No se puede leer el directorio/)).toBeInTheDocument()
    expect(screen.queryByText(/Todavía no hay ninguna/)).toBeNull()
  })

  it('crear una copia, si falla, lo dice', async () => {
    fallaAlEscribir('Sin espacio en disco.', () => json([]))
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Guardar copia en el servidor/ }))

    expect(await screen.findByText(/Sin espacio en disco/)).toBeInTheDocument()
  })

  it('🔴 una restauración fallida NO dice "Datos restaurados"', async () => {
    fallaAlEscribir('El archivo no es un backup de esta instancia.', () => json([]))
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Archivo de backup/),
      new File(['x'], 'otra-cosa.zip', { type: 'application/zip' }),
    )
    await usuario.click(await screen.findByRole('button', { name: /^Restaurar$/ }))

    expect(await screen.findByText(/no es un backup de esta instancia/)).toBeInTheDocument()
    expect(screen.queryByText(/Datos restaurados/)).toBeNull()
  })

  it('un motor viejo que restaura sin devolver el nombre de la copia previa igual confirma', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
      if (String(url).includes('/restore')) return Promise.resolve(json({ ok: true }))
      if ((opciones?.method ?? 'GET') === 'GET') return Promise.resolve(json([]))
      return Promise.resolve(json({ ok: true }))
    }))
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Archivo de backup/),
      new File(['x'], 'copia.zip', { type: 'application/zip' }),
    )
    await usuario.click(await screen.findByRole('button', { name: /^Restaurar$/ }))

    expect(await screen.findByText(/Se guardó una copia del estado anterior/)).toBeInTheDocument()
  })

  it('el producto puede mover la ruta base, y todo lo de la sección la sigue', async () => {
    // LibraCargo y LibraDesk montan el router de backup en otro prefijo. Si la
    // ruta estuviera hardcodeada, la pestaña saldría vacía en esos dos sin un
    // error visible.
    const vistas: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      vistas.push(String(url))
      return Promise.resolve(json([]))
    }))
    montar(<DatosBackupCard basePath="/api/configuracion" />)

    await waitFor(() => {
      expect(vistas.some((u) => u.includes('/api/configuracion/backups'))).toBe(true)
    })
    expect(screen.getByRole('link', { name: /Descargar copia ahora/ }))
      .toHaveAttribute('href', '/api/configuracion/backup-ahora')
  })
})

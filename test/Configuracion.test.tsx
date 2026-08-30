// La pantalla de Configuración canónica de la familia (2026-08-29).
//
// Lo que estos tests fijan, en orden de lo que se rompe sin que se note:
//
//  1. 🔴 **El token de MercadoPago no se pisa con su propia máscara.** El
//     backend devuelve `APP_USR-1234…9f2a`; si el formulario mandara ese valor,
//     guardar la descripción del cobro reemplazaría la credencial por la
//     máscara y el cobro con QR dejaría de andar. Nadie lo ve hasta que un
//     cliente escanea el QR.
//  2. 🔴 **El "según corresponda".** Un producto declara sus integraciones y no
//     puede aparecerle una que no declaró. Si la pantalla rindiera las tres
//     siempre, MedLibra tendría una pestaña de MercadoPago que guarda
//     credenciales contra endpoints que no existen.
//  3. **Los tutoriales nombran a ESTE producto.** El de Gmail le pide al
//     cliente que cree una contraseña de aplicación con el nombre del sistema:
//     si dijera "Contalibra" en MedLibra, el tutorial es peor que no estar,
//     porque parece correcto.
//  4. **Elegir el archivo de restore NO dispara el restore.** Es la acción que
//     reemplaza todos los datos del cliente.
//  5. **La sección activa va en la URL**, y la sub-sección de Integraciones
//     también — sin eso no se puede mandar "andá a Email / SMTP".
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { Link, MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ArcaCard, DatosBackupCard, EmailCard, EmpresaCard, MercadoPagoCard,
  createConfiguracion,
} from '../src/Configuracion'

function IconoFalso({ className }: { className?: string }) {
  return <svg data-testid="icono" className={className} />
}

const EMPRESA = {
  empresa_nombre: 'Ferretería Suipacha', empresa_direccion: 'Suipacha 123',
  empresa_cuit: '20-12345678-9', empresa_telefono: '', empresa_email: '',
  empresa_iibb: '', empresa_iva_condition: 'Responsable Inscripto',
  empresa_inicio_actividades: '',
}

const BACKUPS = [
  { filename: 'backup_manual_20260805_120000.zip', size_mb: 1.2, mtime: '2026-08-05 12:00:00' },
]

const ARCA = {
  empresa: 'default', cuit: '20111111119', punto_venta: 3,
  ambiente: 'homologacion', alias: 'ferreteria',
  certificado_path: '/certs/c.crt', clave_path: '/certs/c.key',
  tiene_certificado: true, tiene_clave: true,
}

const MP = {
  mp_access_token: 'APP_…9f2a', mp_access_token_cargado: true,
  mp_webhook_secret: 'abcd…7788', mp_webhook_secret_cargado: true,
  mp_concepto_descripcion: 'Cobro mercadopago', mp_iva_rate: '0',
  mp_user_id: '75023836', mp_pos_id: 'default',
  mp_auto_facturar_ventas: true,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

let pedidos: { url: string; metodo: string; body: unknown }[] = []
let hayLogo = true
let estadoArca: Record<string, unknown> = {
  configurado: true, ambiente: 'homologacion', cuit: '20111111119',
  tiene_certificado: true, tiene_clave: true,
  vence: '15-06-2027', dias_para_vencer: 290, vencido: false,
}

const montar = (ui: ReactElement, ruta = '/configuracion') =>
  render(<MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>)

beforeEach(() => {
  pedidos = []
  hayLogo = true
  estadoArca = {
    configurado: true, ambiente: 'homologacion', cuit: '20111111119',
    tiene_certificado: true, tiene_clave: true,
    vence: '15-06-2027', dias_para_vencer: 290, vencido: false,
  }
  vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
    const u = String(url)
    const metodo = opciones?.method ?? 'GET'
    pedidos.push({ url: u, metodo, body: opciones?.body ?? null })

    if (u.includes('/api/config/empresa/logo')) {
      if (metodo === 'GET' && !hayLogo) return Promise.resolve(new Response('', { status: 404 }))
      return Promise.resolve(json({ ok: true }))
    }
    if (u.includes('/api/config/empresa')) return Promise.resolve(json(EMPRESA))
    if (u.includes('/api/config/backups')) {
      return Promise.resolve(metodo === 'GET' ? json(BACKUPS) : json({ ok: true, filename: 'x.zip' }))
    }
    if (u.includes('/api/config/restore')) {
      return Promise.resolve(json({ ok: true, backup_previo: 'backup_antes_restore_hoy.zip' }))
    }
    if (u.includes('/api/config/resguardo-externo')) {
      return Promise.resolve(json({ contratado: false, al_dia: null, motivo: null, detalle: null }))
    }
    if (u.includes('/mercadopago/probar')) {
      return Promise.resolve(json({ ok: true, nickname: 'FERRETERIA', user_id: 75023836 }))
    }
    if (u.includes('/mercadopago')) return Promise.resolve(json(MP))
    if (u.includes('/config/arca/estado')) return Promise.resolve(json(estadoArca))
    if (u.includes('/config/arca/probar')) {
      return Promise.resolve(json({ ok: true, ambiente: 'homologacion' }))
    }
    if (u.includes('/config/arca')) return Promise.resolve(json(ARCA))
    if (u.includes('/admin/smtp')) {
      return Promise.resolve(json({
        origen: 'entorno', host: '', port: 587, user: '', from_email: '', from_name: '',
        password_definida: false, password_indescifrable: false, configurado: false,
      }))
    }
    return Promise.resolve(json([]))
  }))
})


describe('🔴 El "según corresponda"', () => {
  it('sólo muestra las integraciones que el producto declaró', async () => {
    const Configuracion = createConfiguracion({
      icono: IconoFalso, producto: 'MedLibra',
      integraciones: { arca: true, email: true },
      propias: [{ clave: 'sedes', label: 'Sedes', contenido: <p>sedes acá</p> }],
    })
    montar(<Configuracion />)

    for (const esperada of ['Empresa', 'Integraciones', 'Sedes', 'Datos / Backup']) {
      expect(await screen.findByRole('tab', { name: new RegExp(esperada) })).toBeInTheDocument()
    }
    // Integraciones arranca en la primera declarada: ARCA, porque este producto
    // no declaró MercadoPago.
    await usuarioVaA('Integraciones')
    expect(await screen.findByRole('button', { name: /ARCA \/ AFIP/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Email \/ SMTP/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /MercadoPago/ })).toBeNull()
  })

  it('un producto sin ninguna integración no muestra la pestaña', async () => {
    const Configuracion = createConfiguracion({ icono: IconoFalso, producto: 'X' })
    montar(<Configuracion />)

    expect(await screen.findByRole('tab', { name: /Empresa/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Integraciones/ })).toBeNull()
  })

  it('una integración propia entra en la misma sub-navegación', async () => {
    // El caso vivo es la Facturación de LibraDesk, que no emite por ARCA sino
    // que manda lo facturable a Contalibra o a SOS Contador.
    const Configuracion = createConfiguracion({
      icono: IconoFalso, producto: 'LibraDesk',
      integraciones: {
        email: true,
        extra: [{ clave: 'facturacion', label: 'Facturación', contenido: <p>a dónde va</p> }],
      },
    })
    montar(<Configuracion />, '/configuracion?seccion=integraciones&integracion=facturacion')

    expect(await screen.findByText('a dónde va')).toBeInTheDocument()
    // Y sigue sin ofrecer ARCA, que este producto no tiene.
    expect(screen.queryByRole('button', { name: /ARCA/ })).toBeNull()
  })

  it('con UNA sola integración no dibuja la sub-navegación', async () => {
    // Una barra lateral con un botón solo, ocupando el ancho de la pestaña, se
    // lee como algo roto. El caso vivo es MedLibra: desde el ADR-036 no factura
    // por ARCA ni cobra por MercadoPago, y le queda sólo el correo.
    const Configuracion = createConfiguracion({
      icono: IconoFalso, producto: 'MedLibra', integraciones: { email: true },
    })
    montar(<Configuracion />, '/configuracion?seccion=integraciones')

    // El contenido está…
    expect(await screen.findByText(/Correo saliente/)).toBeInTheDocument()
    // …y el botón de la sub-navegación no.
    expect(screen.queryByRole('button', { name: /Email \/ SMTP/ })).toBeNull()
  })

  it('el control — con dos, la sub-navegación sí está', async () => {
    // Sin esto, una pantalla que NUNCA dibujara la sub-navegación pasaría el
    // test de arriba y dejaría a Contalibra sin forma de llegar a ARCA.
    const Configuracion = createConfiguracion({
      icono: IconoFalso, producto: 'Contalibra',
      integraciones: { mercadopago: true, email: true },
    })
    montar(<Configuracion />, '/configuracion?seccion=integraciones')

    expect(await screen.findByRole('button', { name: /MercadoPago/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Email \/ SMTP/ })).toBeInTheDocument()
  })

  it('sin ninguna sección es un error de programación, no una pantalla vacía', () => {
    expect(() => createConfiguracion({
      icono: IconoFalso, producto: 'X', empresa: false, datos: false,
    })).toThrow(/al menos una/)
  })
})


async function usuarioVaA(pestania: string) {
  const usuario = userEvent.setup()
  await usuario.click(await screen.findByRole('tab', { name: new RegExp(pestania) }))
}


describe('La sección activa', () => {
  const armar = () => createConfiguracion({
    icono: IconoFalso, producto: 'Contalibra', integraciones: { mercadopago: true, email: true },
  })

  it('arranca en la primera', async () => {
    const Configuracion = armar()
    montar(<Configuracion />)
    expect(await screen.findByRole('tab', { name: /Empresa/ }))
      .toHaveAttribute('aria-selected', 'true')
  })

  it('sale de la URL, así se puede linkear', async () => {
    const Configuracion = armar()
    montar(<Configuracion />, '/configuracion?seccion=datos')

    expect(await screen.findByRole('tab', { name: /Datos \/ Backup/ }))
      .toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Copia de tus datos/)).toBeInTheDocument()
  })

  it('una sección inventada en la URL cae en la primera y no rompe', async () => {
    const Configuracion = armar()
    montar(<Configuracion />, '/configuracion?seccion=no-existe')

    expect(await screen.findByRole('tab', { name: /Empresa/ }))
      .toHaveAttribute('aria-selected', 'true')
  })

  it('la pestaña marcada sigue a la URL aunque nadie haya tocado la barra', async () => {
    // 🔴 El control que un `defaultValue` aprueba por casualidad: los otros
    // tests miran el PRIMER render, y ahí un conmutador no-controlado acierta.
    // La diferencia se ve cuando la URL cambia DESPUÉS —el botón "atrás", un
    // link a otra sección—, que es cuando `defaultValue` deja la píldora
    // clavada mientras abajo se muestra otro contenido.
    const Configuracion = armar()
    render(
      <MemoryRouter initialEntries={['/configuracion']}>
        <Link to="/configuracion?seccion=datos">ir a datos</Link>
        <Configuracion />
      </MemoryRouter>,
    )
    const usuario = userEvent.setup()
    expect(await screen.findByRole('tab', { name: /Empresa/ }))
      .toHaveAttribute('aria-selected', 'true')

    await usuario.click(screen.getByRole('link', { name: 'ir a datos' }))

    expect(await screen.findByRole('tab', { name: /Datos \/ Backup/ }))
      .toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Empresa/ }))
      .toHaveAttribute('aria-selected', 'false')
  })

  it('la sub-sección de Integraciones también sale de la URL', async () => {
    const Configuracion = armar()
    montar(<Configuracion />, '/configuracion?seccion=integraciones&integracion=email')

    // El formulario de SMTP es el de la sección de Email; el de MercadoPago no
    // está montado, así que su tutorial tampoco.
    expect(await screen.findByText(/Correo saliente/)).toBeInTheDocument()
    expect(screen.queryByText(/Access Token, User ID, POS ID/)).toBeNull()
  })

  it('🔴 elegir una sub-sección no saca de Integraciones', async () => {
    // `setParams` reemplaza el query entero: escribir sólo `integracion`
    // borraría `seccion` y la pantalla saltaría a Empresa en el mismo click.
    const Configuracion = armar()
    montar(<Configuracion />, '/configuracion?seccion=integraciones')
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Email \/ SMTP/ }))

    expect(await screen.findByRole('tab', { name: /Integraciones/ }))
      .toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Correo saliente/)).toBeInTheDocument()
  })

  it('sólo se renderiza el contenido de la activa', async () => {
    const Configuracion = armar()
    montar(<Configuracion />)

    await screen.findByText(/Datos de la empresa/)
    expect(screen.queryByText(/Copia de tus datos/)).toBeNull()
  })

  it('el botón de backup rápido está siempre, al lado de las pestañas', async () => {
    const Configuracion = armar()
    montar(<Configuracion />)

    // En la pestaña de Empresa, sin haber entrado a Datos / Backup.
    expect(await screen.findByRole('link', { name: /Backup rápido/ }))
      .toHaveAttribute('href', '/api/config/backup-ahora')
  })
})


describe('Empresa', () => {
  it('carga y guarda los datos', async () => {
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    expect(await screen.findByLabelText(/^Nombre$/)).toHaveValue('Ferretería Suipacha')

    await usuario.click(screen.getByRole('button', { name: /Guardar datos de empresa/ }))
    await waitFor(() => {
      expect(pedidos.some((p) => p.url.includes('/api/config/empresa') && p.metodo === 'PUT'))
        .toBe(true)
    })
  })

  it('lo que se tipea llega al PUT', async () => {
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    const cuit = await screen.findByLabelText(/^CUIT$/)
    await usuario.clear(cuit)
    await usuario.type(cuit, '27999999994')
    await usuario.click(screen.getByRole('button', { name: /Guardar datos de empresa/ }))

    const put = await esperarPedido('/api/config/empresa', 'PUT')
    expect(JSON.parse(String(put.body)).empresa_cuit).toBe('27999999994')
  })

  it('la condición de IVA dice con qué comprobante emite cada una', async () => {
    montar(<EmpresaCard />)
    // Es el campo que decide el tipo de comprobante. "Responsable Inscripto" a
    // secas no le dice a nadie que va a emitir A y B.
    expect(await screen.findByText('Responsable Inscripto (emite Factura A y B)'))
      .toBeInTheDocument()
  })

  it('🔴 una condición guardada fuera de la lista no se pierde en silencio', async () => {
    // Este paquete ofrecía cinco condiciones, dos de las cuales son del
    // receptor y no del emisor. Al recortar la lista a tres, una instancia con
    // "Consumidor Final" guardado mostraría el campo vacío y el primer
    // guardado lo pisaría sin que nadie lo haya elegido.
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('/logo')) return Promise.resolve(new Response('', { status: 404 }))
      return Promise.resolve(json({ ...EMPRESA, empresa_iva_condition: 'Consumidor Final' }))
    }))
    montar(<EmpresaCard />)

    expect(await screen.findByText('Consumidor Final')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('Consumidor Final')
  })

  it('el logo se sube como multipart, con el nombre de campo que espera el motor', async () => {
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Logo \(PNG o JPG\)/),
      new File(['x'], 'logo.png', { type: 'image/png' }),
    )

    const subida = await esperarPedido('/logo', 'POST')
    expect(subida.body).toBeInstanceOf(FormData)
    expect((subida.body as FormData).get('logo')).toBeInstanceOf(File)
  })

  it('sin logo no muestra una imagen rota ni ofrece quitarlo', async () => {
    hayLogo = false
    montar(<EmpresaCard />)

    await screen.findByLabelText(/^Nombre$/)
    expect(document.querySelector('img[alt="Logo de la empresa"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull()
  })

  it('con logo se puede quitar, sin entrar al volumen del contenedor', async () => {
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Quitar/ }))

    await esperarPedido('/logo', 'DELETE')
  })

  it('un error de red se muestra, no se traga', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    montar(<EmpresaCard />)

    expect(await screen.findByText(/Error de conexión/)).toBeInTheDocument()
  })
})


async function esperarPedido(fragmento: string, metodo: string) {
  return waitFor(() => {
    const p = pedidos.find((x) => x.url.includes(fragmento) && x.metodo === metodo)
    expect(p, `no llegó ningún ${metodo} a ${fragmento}`).toBeTruthy()
    return p!
  })
}


describe('Datos / Backup', () => {
  it('lista las copias con la fecha formateada y ofrece la descarga como link', async () => {
    montar(<DatosBackupCard />)

    expect(await screen.findByText('backup_manual_20260805_120000.zip')).toBeInTheDocument()
    // dd-mm-aaaa HH:MM, el formato de la familia. Sin el formateador salía el
    // ISO crudo del servidor.
    expect(screen.getByText(/05-08-2026 12:00/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Descargar copia ahora/ }))
      .toHaveAttribute('href', '/api/config/backup-ahora')
  })

  it('guardar una copia en el servidor la crea y recarga el listado', async () => {
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Guardar copia en el servidor/ }))

    await waitFor(() => {
      expect(pedidos.filter((p) => p.url.includes('/api/config/backups') && p.metodo === 'POST'))
        .toHaveLength(1)
    })
    expect(await screen.findByText(/Copia guardada en el servidor/)).toBeInTheDocument()
  })

  it('🔴 elegir el archivo NO dispara el restore', async () => {
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Archivo de backup/),
      new File(['x'], 'copia.zip', { type: 'application/zip' }),
    )

    expect(await screen.findByText(/copia\.zip/)).toBeInTheDocument()
    expect(pedidos.some((p) => p.url.includes('/restore'))).toBe(false)
  })

  it('confirmando sí restaura, y dice dónde quedó el estado anterior', async () => {
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Archivo de backup/),
      new File(['x'], 'copia.zip', { type: 'application/zip' }),
    )
    await usuario.click(await screen.findByRole('button', { name: /^Restaurar$/ }))

    expect(await screen.findByText(/backup_antes_restore_hoy\.zip/)).toBeInTheDocument()
  })

  it('cancelar no deja el archivo elegido', async () => {
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Archivo de backup/),
      new File(['x'], 'copia.zip', { type: 'application/zip' }),
    )
    await usuario.click(await screen.findByRole('button', { name: /Cancelar/ }))

    expect(screen.queryByText(/copia\.zip/)).toBeNull()
    expect(pedidos.some((p) => p.url.includes('/restore'))).toBe(false)
  })

  it('quien no contrató la copia externa ve la propuesta, no una alarma', async () => {
    montar(<DatosBackupCard />)

    expect(await screen.findByText(/Consultanos para activarlo/)).toBeInTheDocument()
  })
})


describe('ARCA', () => {
  it('carga la configuración existente', async () => {
    montar(<ArcaCard producto="Contalibra" />)

    expect(await screen.findByLabelText(/^CUIT$/)).toHaveValue('20111111119')
    expect(screen.getByLabelText(/Punto de venta/)).toHaveValue('3')
  })

  it('guarda el punto de venta como número, no como texto', async () => {
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/^CUIT$/)
    await usuario.click(screen.getByRole('button', { name: /Guardar ARCA/ }))

    const put = await esperarPedido('/config/arca', 'PUT')
    // El backend declara `punto_venta: int`. Mandarlo como string da un 422 que
    // sólo aparece al guardar.
    expect(JSON.parse(String(put.body)).punto_venta).toBe(3)
  })

  it('🔴 el certificado se SUBE, no se escribe un path del servidor', async () => {
    // Es el defecto que esta pantalla vino a cerrar: cuatro productos pedían un
    // `certificado_path` que alguien tenía que haber dejado a mano dentro del
    // volumen del contenedor.
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Certificado/),
      new File(['x'], 'mi.crt', { type: 'application/x-x509-ca-cert' }),
    )

    const subida = await esperarPedido('/config/arca/certificado', 'POST')
    expect(subida.body).toBeInstanceOf(FormData)
    expect((subida.body as FormData).get('archivo')).toBeInstanceOf(File)
    // Y no queda ningún campo de texto donde tipear una ruta.
    expect(screen.queryByLabelText(/Path del certificado/)).toBeNull()
  })

  it('la clave privada también', async () => {
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.upload(
      await screen.findByLabelText(/Clave privada/),
      new File(['x'], 'mi.key', { type: 'application/octet-stream' }),
    )

    const subida = await esperarPedido('/config/arca/clave', 'POST')
    expect((subida.body as FormData).get('archivo')).toBeInstanceOf(File)
  })

  it('🔑 avisa cuándo vence el certificado', async () => {
    montar(<ArcaCard producto="Contalibra" />)

    expect(await screen.findByText(/Certificado válido hasta el 15-06-2027/)).toBeInTheDocument()
  })

  it('🔑 un certificado vencido lo dice fuerte: la facturación no anda', async () => {
    // Duran dos años y el día que vencen la facturación deja de andar sin que
    // nadie haya tocado nada. Es la falla silenciosa que este aviso cierra.
    estadoArca = { ...estadoArca, vence: '01-08-2026', dias_para_vencer: -28, vencido: true }
    montar(<ArcaCard producto="Contalibra" />)

    expect(await screen.findByText(/VENCIDO el 01-08-2026/)).toBeInTheDocument()
  })

  it('y a menos de 30 días avisa antes de que pase', async () => {
    estadoArca = { ...estadoArca, vence: '10-09-2026', dias_para_vencer: 12, vencido: false }
    montar(<ArcaCard producto="Contalibra" />)

    expect(await screen.findByText(/quedan 12 días/)).toBeInTheDocument()
  })

  it('probar conexión autentica de verdad contra ARCA', async () => {
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Probar conexión/ }))

    // POST y no GET: probar autentica, no es una lectura.
    await esperarPedido('/config/arca/probar', 'POST')
    expect(await screen.findByText(/Autenticado OK/)).toBeInTheDocument()
  })

  it('se puede quitar el par sin entrar al volumen', async () => {
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Quitar certificado y clave/ }))

    await esperarPedido('/config/arca/credenciales', 'DELETE')
  })

  it('🔴 en una instancia SIN fila, la crea con el slug que declara el producto', async () => {
    // La falla que esto impide es muda: Gestiolibra lee su facturación con
    // `negocio`, MedLibra con `consultorio`, VentaLibra con `venta` y LibraClub
    // con `complejo`. Si el primer guardado creara la fila como `default`, la
    // pantalla diría "Guardado" y el producto seguiría contestando que ARCA no
    // está configurado al emitir la primera factura.
    vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
      const u = String(url)
      const metodo = opciones?.method ?? 'GET'
      pedidos.push({ url: u, metodo, body: opciones?.body ?? null })
      if (u.includes('/estado')) return Promise.resolve(json({ configurado: false }))
      // Instancia nueva: todavía no hay fila.
      return Promise.resolve(json(metodo === 'GET' ? null : { ok: true }))
    }))
    montar(<ArcaCard producto="MedLibra" empresa="consultorio" />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/^CUIT$/)
    await usuario.click(screen.getByRole('button', { name: /Guardar ARCA/ }))

    const put = await esperarPedido('/config/arca', 'PUT')
    expect(JSON.parse(String(put.body)).empresa).toBe('consultorio')
  })

  it('el control — sin declararlo cae en `default`, que es lo correcto para Contalibra', async () => {
    // Contalibra y Restolibra son multi-empresa: no tienen un slug fijo, y su
    // fila se dio de alta con la razón social. Si `empresa` fuera obligatorio o
    // el default fuera otro, el test de arriba pasaría igual y estos dos
    // romperían.
    vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
      const u = String(url)
      const metodo = opciones?.method ?? 'GET'
      pedidos.push({ url: u, metodo, body: opciones?.body ?? null })
      if (u.includes('/estado')) return Promise.resolve(json({ configurado: false }))
      return Promise.resolve(json(metodo === 'GET' ? null : { ok: true }))
    }))
    montar(<ArcaCard producto="Contalibra" />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/^CUIT$/)
    await usuario.click(screen.getByRole('button', { name: /Guardar ARCA/ }))

    const put = await esperarPedido('/config/arca', 'PUT')
    expect(JSON.parse(String(put.body)).empresa).toBe('default')
  })

  it('en una instancia que YA tiene fila, manda el slug real y no el declarado', async () => {
    // El caso de Contalibra en producción: la fila se llama como la razón
    // social. Pisarla con el slug declarado crearía una segunda fila al lado de
    // la que la instancia venía usando.
    //
    // ⚠️ La fila del servidor se llama `razon-social-real` y NO `default`: con
    // el fixture normal —que devuelve `default`— este assert se cumpliría
    // también si el componente ignorara la respuesta y usara siempre su
    // fallback, que es justo lo que hay que distinguir.
    vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
      const u = String(url)
      const metodo = opciones?.method ?? 'GET'
      pedidos.push({ url: u, metodo, body: opciones?.body ?? null })
      if (u.includes('/estado')) return Promise.resolve(json(estadoArca))
      return Promise.resolve(json(metodo === 'GET' ? { ...ARCA, empresa: 'razon-social-real' } : { ok: true }))
    }))
    montar(<ArcaCard producto="Contalibra" empresa="otro-slug" />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/^CUIT$/)
    await usuario.click(screen.getByRole('button', { name: /Guardar ARCA/ }))

    const put = await esperarPedido('/config/arca', 'PUT')
    expect(JSON.parse(String(put.body)).empresa).toBe('razon-social-real')
  })

  it('el tutorial de Padrón A13 nombra a ESTE producto', async () => {
    montar(<ArcaCard producto="MedLibra" />)

    expect(await screen.findByText(/el certificado que ya configuraste en MedLibra/))
      .toBeInTheDocument()
  })
})


describe('MercadoPago', () => {
  it('muestra los campos no secretos como vienen', async () => {
    montar(<MercadoPagoCard />)

    expect(await screen.findByLabelText(/User ID \(QR\)/)).toHaveValue('75023836')
    expect(screen.getByLabelText(/POS ID \(QR\)/)).toHaveValue('default')
  })

  it('🔴 el token enmascarado NO viaja en el PUT', async () => {
    // El defecto que este test existe para impedir: `GET` devuelve
    // `APP_…9f2a`. Si el campo lo mostrara como valor y el `PUT` lo mandara,
    // guardar cualquier otra cosa reemplazaría la credencial por su máscara y
    // el cobro con QR dejaría de andar — sin ningún error en pantalla.
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    const token = await screen.findByLabelText(/Access Token/)
    expect(token).toHaveValue('')
    // La máscara se ve, pero como pista: dice CUÁL credencial está cargada.
    expect(token).toHaveAttribute('placeholder', expect.stringContaining('APP_…9f2a'))

    await usuario.click(screen.getByRole('button', { name: /Guardar MercadoPago/ }))

    const put = await esperarPedido('/mercadopago', 'PUT')
    const cuerpo = JSON.parse(String(put.body))
    expect(cuerpo.mp_access_token).toBe('')
    expect(cuerpo.mp_webhook_secret).toBe('')
    // Y lo que no es secreto sí va, o guardar no guardaría nada.
    expect(cuerpo.mp_user_id).toBe('75023836')
  })

  it('un token tipeado sí viaja', async () => {
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await usuario.type(await screen.findByLabelText(/Access Token/), 'APP_USR-nuevo')
    await usuario.click(screen.getByRole('button', { name: /Guardar MercadoPago/ }))

    const put = await esperarPedido('/mercadopago', 'PUT')
    expect(JSON.parse(String(put.body)).mp_access_token).toBe('APP_USR-nuevo')
  })

  it('el toggle de facturación automática viaja como booleano', async () => {
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('switch'))
    await usuario.click(screen.getByRole('button', { name: /Guardar MercadoPago/ }))

    const put = await esperarPedido('/mercadopago', 'PUT')
    expect(JSON.parse(String(put.body)).mp_auto_facturar_ventas).toBe(false)
  })

  it('el texto del toggle lo pone el producto', async () => {
    // En un club de pádel no se cobran "ventas": se cobran turnos.
    montar(<MercadoPagoCard autoFacturar={{
      label: 'Facturar automáticamente los turnos cobrados por QR', ayuda: 'Sólo los del QR.',
    }} />)

    expect(await screen.findByText(/los turnos cobrados por QR/)).toBeInTheDocument()
  })

  it('un producto que todavía no emite al acreditarse no muestra el toggle', async () => {
    montar(<MercadoPagoCard autoFacturar={false} />)

    await screen.findByLabelText(/User ID \(QR\)/)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('probar conexión devuelve el User ID, que es lo que hay que copiar al lado', async () => {
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Probar conexión/ }))

    expect(await screen.findByText(/FERRETERIA.*75023836/)).toBeInTheDocument()
  })

  it('se pueden quitar las credenciales: con "vacío = no lo toqués" no hay otra forma', async () => {
    montar(<MercadoPagoCard />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Quitar credenciales/ }))

    await esperarPedido('/mercadopago/credenciales', 'DELETE')
  })

  it('sin credenciales cargadas no ofrece probar ni quitar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({
      ...MP, mp_access_token: '', mp_access_token_cargado: false,
      mp_webhook_secret: '', mp_webhook_secret_cargado: false,
    }))))
    montar(<MercadoPagoCard />)

    await screen.findByLabelText(/User ID \(QR\)/)
    expect(screen.queryByRole('button', { name: /Probar conexión/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Quitar credenciales/ })).toBeNull()
  })

  it('🔴 avisa que el QR no cobra si faltan datos, aunque el token esté cargado', async () => {
    // Hacen falta los TRES: el `user_id` es el collector de la cuenta y el
    // `pos_id` el external_id de la caja, y los dos van en la URL de la orden.
    // Sin el aviso, una caja a medio configurar se descubre recién cuando un
    // cliente escanea el cartel impreso del mostrador y no pasa nada.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ ...MP, mp_pos_id: '' }))))
    montar(<MercadoPagoCard />)

    expect(await screen.findByText(/Faltan datos/)).toBeInTheDocument()
  })

  it('el control — con los tres cargados el aviso no está', async () => {
    // Sin esto, un aviso que se mostrara SIEMPRE pasaría el test de arriba y
    // le diría a un comercio que cobra bien que le falta configurar algo.
    montar(<MercadoPagoCard />)

    await screen.findByLabelText(/User ID \(QR\)/)
    expect(screen.queryByText(/Faltan datos/)).toBeNull()
  })

  it('🔴 un producto SIN webhook no pide una firma para un webhook que no existe', async () => {
    // VentaLibra cobra por poll y no monta webhook: está documentado y medido
    // —en la instancia real del cliente no llegó ni un POST—. Pedirle al
    // comercio el Webhook Secret lo manda a configurar algo que no hace nada, y
    // después a buscar por qué "no anda".
    montar(<MercadoPagoCard webhook={false} />)

    await screen.findByLabelText(/Access Token/)
    expect(screen.queryByLabelText(/Webhook Secret/)).toBeNull()
    expect(screen.queryByText(/URL del webhook/)).toBeNull()
  })

  it('sin webhook, guardar no toca el secreto que hubiera guardado', async () => {
    // El campo no está, así que `secreto` queda vacío — y vacío significa "no
    // lo toqués" del lado del motor. Si mandara `null` o el valor enmascarado,
    // esconder el campo BORRARÍA la firma de una instancia que sí la tenía.
    montar(<MercadoPagoCard webhook={false} />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/Access Token/)
    await usuario.click(screen.getByRole('button', { name: /Guardar MercadoPago/ }))

    const put = await esperarPedido('/mercadopago', 'PUT')
    expect(JSON.parse(String(put.body)).mp_webhook_secret).toBe('')
  })

  it('muestra la URL del webhook para registrar en MercadoPago', async () => {
    montar(<MercadoPagoCard />)

    expect(await screen.findByLabelText(/URL del webhook/))
      .toHaveValue(`${window.location.origin}/webhooks/mercadopago`)
  })
})


describe('Los tutoriales', () => {
  it('el de Gmail nombra a ESTE producto', async () => {
    // Si dijera "Contalibra" en MedLibra, el cliente crearía una contraseña de
    // aplicación con el nombre equivocado — y el tutorial parece correcto.
    montar(<EmailCard producto="MedLibra" />)

    expect(await screen.findByText(/escribí/)).toBeInTheDocument()
    expect(screen.getByText('MedLibra')).toBeInTheDocument()
  })

  it('el de MercadoPago explica los cuatro datos, no sólo el token', async () => {
    montar(<MercadoPagoCard />)

    expect(await screen.findByText(/Access Token, User ID, POS ID y Webhook Secret/))
      .toBeInTheDocument()
    expect(screen.getByText(/External ID del punto de venta/)).toBeInTheDocument()
  })

  it('arrancan cerrados: son ayuda, no el contenido de la pantalla', async () => {
    montar(<MercadoPagoCard />)

    await screen.findByLabelText(/User ID \(QR\)/)
    const acordeon = document.querySelector('details')
    expect(acordeon).not.toBeNull()
    expect(acordeon!.open).toBe(false)
  })
})

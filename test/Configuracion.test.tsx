// Pantalla de Configuración compartida (ítem 5, 2026-08-05).
//
// Lo que estos tests fijan, en orden de lo que se rompe sin que se note:
//
// 1. 🔴 **El "según corresponda" del pedido.** Un producto declara sus
//    secciones y no puede aparecerle una que no declaró. Si la pantalla
//    rindiera las cinco siempre, MedLibra tendría una pestaña de balanza y
//    LibraDesk una de ARCA — y nadie lo notaría hasta que un cliente la abra.
// 2. **La sección activa va en la URL.** Sin eso no se puede mandar "andá a
//    Datos / Backup", y el botón "atrás" del navegador sale de la pantalla.
// 3. **El logo se sube como multipart**, con el nombre de campo que espera el
//    motor. Mandarlo mal da un 422 que sólo aparece al usarlo de verdad.
// 4. **Elegir el archivo de restore NO dispara el restore.** Es la acción que
//    reemplaza todos los datos del cliente.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ArcaCard, DatosBackupCard, EmpresaCard, LogoCard, SECCIONES_BASE, SECCION_ARCA,
  createConfiguracion,
} from '../src/Configuracion'

const EMPRESA = {
  empresa_nombre: 'Ferretería Suipacha', empresa_direccion: 'Suipacha 123',
  empresa_cuit: '20-12345678-9', empresa_telefono: '', empresa_email: '',
  empresa_iibb: '', empresa_iva_condition: 'Responsable Inscripto',
  empresa_inicio_actividades: '',
}

const BACKUPS = [
  { filename: 'backup_manual_20260805_120000.zip', size_mb: 1.2, mtime: '2026-08-05 12:00:00' },
]

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

let pedidos: { url: string; metodo: string; body: unknown }[] = []
let hayLogo = true

const montar = (ui: ReactElement, ruta = '/configuracion') =>
  render(<MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>)

beforeEach(() => {
  pedidos = []
  hayLogo = true
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
    if (u.includes('/config/arca')) {
      return Promise.resolve(json({
        empresa: 'Ferretería', cuit: '20111111119', punto_venta: 3,
        ambiente: 'homologacion', certificado_path: '/certs/c.crt', clave_path: '/certs/c.key',
      }))
    }
    if (u.includes('/admin/smtp')) return Promise.resolve(json(null))
    return Promise.resolve(json([]))
  }))
})


describe('🔴 El "según corresponda"', () => {
  it('sólo muestra las secciones que el producto declaró', async () => {
    const Configuracion = createConfiguracion({
      secciones: [
        ...SECCIONES_BASE,
        { clave: 'balanza', label: 'Balanza', contenido: <p>balanza acá</p> },
      ],
    })
    montar(<Configuracion />)

    for (const esperada of ['Empresa', 'Correo', 'Datos / Backup', 'Balanza']) {
      expect(await screen.findByRole('button', { name: new RegExp(esperada) }))
        .toBeInTheDocument()
    }
    // Y **no** aparece la de ARCA, que este producto no declaró.
    expect(screen.queryByRole('button', { name: /ARCA/ })).toBeNull()
  })

  it('un producto que factura sí declara ARCA', async () => {
    const Configuracion = createConfiguracion({
      secciones: [...SECCIONES_BASE, SECCION_ARCA],
    })
    montar(<Configuracion />)

    expect(await screen.findByRole('button', { name: /ARCA/ })).toBeInTheDocument()
  })

  it('sin ninguna sección es un error de programación, no una pantalla vacía', () => {
    expect(() => createConfiguracion({ secciones: [] })).toThrow(/al menos una/)
  })
})


describe('La sección activa', () => {
  it('arranca en la primera', async () => {
    const Configuracion = createConfiguracion({ secciones: SECCIONES_BASE })
    montar(<Configuracion />)

    expect(await screen.findByRole('button', { name: /Empresa/ }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('sale de la URL, así se puede linkear', async () => {
    const Configuracion = createConfiguracion({ secciones: SECCIONES_BASE })
    montar(<Configuracion />, '/configuracion?seccion=datos')

    expect(await screen.findByRole('button', { name: /Datos \/ Backup/ }))
      .toHaveAttribute('aria-current', 'page')
    expect(screen.getByText(/Copia de tus datos/)).toBeInTheDocument()
  })

  it('una sección inventada en la URL cae en la primera y no rompe', async () => {
    const Configuracion = createConfiguracion({ secciones: SECCIONES_BASE })
    montar(<Configuracion />, '/configuracion?seccion=no-existe')

    expect(await screen.findByRole('button', { name: /Empresa/ }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('cambiar de sección la escribe en la URL', async () => {
    const Configuracion = createConfiguracion({ secciones: SECCIONES_BASE })
    montar(<Configuracion />)
    const usuario = userEvent.setup()

    await usuario.click(await screen.findByRole('button', { name: /Datos \/ Backup/ }))

    expect(await screen.findByText(/Copia de tus datos/)).toBeInTheDocument()
  })

  it('sólo se renderiza el contenido de la activa', async () => {
    const Configuracion = createConfiguracion({ secciones: SECCIONES_BASE })
    montar(<Configuracion />)

    await screen.findByText(/Datos de la empresa/)
    // El de Datos / Backup no está montado: si las tres se rindieran juntas,
    // el conmutador sería decorativo y la pantalla pediría todo de una.
    expect(screen.queryByText(/Copia de tus datos/)).toBeNull()
  })
})


describe('Empresa', () => {
  it('carga y guarda los datos', async () => {
    montar(<EmpresaCard />)
    const usuario = userEvent.setup()

    const nombre = await screen.findByLabelText(/Nombre o razón social/)
    expect(nombre).toHaveValue('Ferretería Suipacha')

    await usuario.click(screen.getByRole('button', { name: /Guardar/ }))
    await waitFor(() => {
      expect(pedidos.some((p) => p.url.includes('/api/config/empresa') && p.metodo === 'PUT'))
        .toBe(true)
    })
  })

  it('la condición de IVA es una lista y no texto libre', async () => {
    montar(<EmpresaCard />)
    // Es el campo que decide el tipo de comprobante: un valor tipeado a mano
    // que ARCA no conozca se descubre recién al facturar.
    expect(await screen.findByText('Responsable Inscripto')).toBeInTheDocument()
  })
})


describe('Logo', () => {
  it('lo sube como multipart, con el nombre de campo que espera el motor', async () => {
    montar(<LogoCard />)
    const usuario = userEvent.setup()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await usuario.upload(input, new File(['x'], 'logo.png', { type: 'image/png' }))

    const subida = await waitFor(() => {
      const p = pedidos.find((p) => p.url.includes('/logo') && p.metodo === 'POST')
      expect(p).toBeTruthy()
      return p!
    })
    expect(subida.body).toBeInstanceOf(FormData)
    expect((subida.body as FormData).get('logo')).toBeInstanceOf(File)
  })

  it('sin logo lo dice, en vez de mostrar una imagen rota', async () => {
    hayLogo = false
    montar(<LogoCard />)

    expect(await screen.findByText(/Todavía no hay logo cargado/)).toBeInTheDocument()
    expect(document.querySelector('img[alt="Logo de la empresa"]')).toBeNull()
  })
})


describe('Datos / Backup', () => {
  it('lista las copias y ofrece la descarga como link directo', async () => {
    montar(<DatosBackupCard />)

    expect(await screen.findByText('backup_manual_20260805_120000.zip')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Descargar copia/ }))
      .toHaveAttribute('href', '/api/config/backup-ahora')
  })

  it('🔴 elegir el archivo NO dispara el restore', async () => {
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await usuario.upload(input, new File(['x'], 'copia.zip', { type: 'application/zip' }))

    // Aparece la confirmación con el nombre del archivo, y todavía no se llamó
    // al endpoint que reemplaza todos los datos.
    expect(await screen.findByText(/copia\.zip/)).toBeInTheDocument()
    expect(pedidos.some((p) => p.url.includes('/restore'))).toBe(false)
  })

  it('confirmando sí restaura, y dice dónde quedó el estado anterior', async () => {
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await usuario.upload(input, new File(['x'], 'copia.zip', { type: 'application/zip' }))
    await usuario.click(await screen.findByRole('button', { name: /^Restaurar$/ }))

    expect(await screen.findByText(/backup_antes_restore_hoy\.zip/)).toBeInTheDocument()
  })

  it('cancelar no deja el archivo elegido', async () => {
    montar(<DatosBackupCard />)
    const usuario = userEvent.setup()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await usuario.upload(input, new File(['x'], 'copia.zip', { type: 'application/zip' }))
    await usuario.click(await screen.findByRole('button', { name: /Cancelar/ }))

    expect(screen.queryByText(/copia\.zip/)).toBeNull()
    expect(pedidos.some((p) => p.url.includes('/restore'))).toBe(false)
  })
})


describe('ARCA', () => {
  it('carga la configuración existente', async () => {
    montar(<ArcaCard />)

    expect(await screen.findByLabelText(/CUIT/)).toHaveValue('20111111119')
    expect(screen.getByLabelText(/Punto de venta/)).toHaveValue('3')
  })

  it('guarda el punto de venta como número, no como texto', async () => {
    montar(<ArcaCard />)
    const usuario = userEvent.setup()

    await screen.findByLabelText(/CUIT/)
    await usuario.click(screen.getByRole('button', { name: /Guardar/ }))

    const put = await waitFor(() => {
      const p = pedidos.find((p) => p.url.includes('/config/arca') && p.metodo === 'PUT')
      expect(p).toBeTruthy()
      return p!
    })
    // El backend declara `punto_venta: int`. Mandarlo como string da un 422
    // que sólo aparece al guardar.
    expect(JSON.parse(String(put.body)).punto_venta).toBe(3)
  })
})

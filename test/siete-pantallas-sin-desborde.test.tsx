// Siete pantallas sin scroll horizontal de página (Logs, Libros IVA, Configuración, Transferencias, Reportes, Cajas y Tesorería).
// jsdom no mide el layout: lo que estos tests fijan son las clases que, medidas en Chromium, hacen que el desborde dé 0 px (el cómo y el cuánto
// están en el ADR de la versión). Quitar una clase pone roja una sola prueba, con el nombre del elemento que ensanchaba la página.
//
// Lo medido (VentaLibra dev, 390 px; antes → después): Logs 4 → 0 · Libros IVA 522 → 0 · Configuración 491 → 0 · Transferencias 161 → 0 ·
// Reportes 99 → 0 · Cajas 79 → 0 · Tesorería 17 → 0. A 320 px: 74, 592, 561, 230, 168, 148 y 87 → 0.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createConfiguracion, TutorialLink } from '../src/Configuracion'
import { Logs } from '../src/Logs'
import { Cajas } from '../src/comercio/Cajas'
import { DepositoTransferencia } from '../src/comercio/DepositoTransferencia'
import { LibrosIva } from '../src/comercio/LibrosIva'
import { Reportes } from '../src/comercio/Reportes'
import { Tesoreria } from '../src/comercio/Tesoreria'
import type { CajaConfig, CuentaTesoreria, LibrosIvaData, ReportesData } from '../src/comercio/tipos'
import { montar, prepararFetch, responder } from './helpers-pantallas'

const clases = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/)
const tiene = (el: Element | null | undefined, ...esperadas: string[]) => {
  const c = clases(el)
  for (const e of esperadas) expect(c, `falta la clase «${e}» en <${el?.tagName.toLowerCase()} class="${el?.getAttribute('class')}">`).toContain(e)
}

function Icono({ className }: { className?: string }) {
  return <svg data-testid="icono" className={className} />
}
function cabeceraDe(titulo: string) {
  return screen.getByRole('heading', { name: titulo }).parentElement as HTMLElement
}

beforeEach(() => { cleanup(); prepararFetch() })
afterEach(() => { vi.unstubAllGlobals() })

describe('Logs', () => {
  it('la barra de pestañas hace wrap: a 390 px las dos juntas medían 394 y ensanchaban la página', async () => {
    responder({
      '/logs': {
        actividad: [], total: 0, total_pages: 1, page: 1, entidades: [], acciones: {}, usuarios: [], accesos: [],
      },
    })
    render(<Logs icono={Icono} />)
    const barra = await screen.findByRole('tablist')
    tiene(barra, 'h-auto', 'flex-wrap')
  })
})

describe('Configuración', () => {
  const MP = { mp_access_token: '', mp_access_token_cargado: false, mp_iva_rate: '0', mp_ambiente: 'produccion' }
  beforeEach(() => {
    responder({
      '/api/config/empresa': {}, '/api/config/backups': [], '/api/config/resguardo-externo': { contratado: false },
      '/api/config/mercadopago': MP, '/api/config/arca': {}, '/api/config/arca/estado': { configurado: false },
      '/api/config/email': {}, '/admin/smtp': { origen: 'entorno', configurado: false },
    })
  })
  const Configuracion = createConfiguracion({
    icono: Icono, producto: 'X', integraciones: { mercadopago: { webhook: false }, arca: true, email: true },
    propias: [1, 2, 3, 4].map((n) => ({ clave: `p${n}`, label: `Propia número ${n}`, contenido: <p>p{n}</p> })),
  })
  const abrir = (ruta: string) => render(<MemoryRouter initialEntries={[ruta]}><Configuracion /></MemoryRouter>)

  it('la barra de secciones hace wrap: con siete pestañas medía 865 px y ensanchaba la página 491 px a 390', async () => {
    abrir('/configuracion')
    tiene(await screen.findByRole('tablist'), 'h-auto', 'flex-wrap')
  })

  it('la sub-navegación de Integraciones hace wrap (tres botones no entran a 320 px) y su contenido puede achicarse', async () => {
    abrir('/configuracion?seccion=integraciones')
    const botones = (await screen.findByRole('button', { name: /MercadoPago/ })).parentElement!
    tiene(botones, 'flex-row', 'flex-wrap')
    tiene(botones.nextElementSibling, 'min-w-0', 'max-w-2xl')
  })

  it('el selector de alícuota de MercadoPago ocupa su columna y no la ensancha (277 px de valor en una columna de 97)', async () => {
    abrir('/configuracion?seccion=integraciones')
    await screen.findByText('Alícuota IVA')
    const select = await waitFor(() => {
      const opcion = Array.from(document.querySelectorAll('option')).find((o) => o.textContent === 'Sin IVA (Monotributista / Exento)')
      expect(opcion).toBeTruthy()
      return opcion!.closest('select')!
    })
    tiene(select, 'w-full', 'min-w-0', 'sm:w-fit', 'sm:max-w-full')
    tiene(select.parentElement, 'min-w-0')
  })

  it('el link de un tutorial parte una URL larga en vez de ensanchar la columna', () => {
    render(<TutorialLink href="https://www.mercadopago.com.ar/developers/panel/app">mercadopago.com.ar/developers/panel/app</TutorialLink>)
    tiene(screen.getByRole('link'), '[overflow-wrap:anywhere]')
  })
})

describe('Libros IVA', () => {
  const LIBROS: LibrosIvaData = {
    desde: '2026-09-01', hasta: '2026-09-30', empresa_cuit: '30-1', facturas: [], egresos: [],
    resumen_v: { cbtes: 0, neto: 0, iva: 0, total: 0, por_tasa: {} },
    resumen_c: { cbtes: 0, neto: 0, iva: 0, total: 0, por_tasa: {} },
  }
  const NOMBRES = { ventas: ['REGINFO_VENTAS_CBTE', 'REGINFO_VENTAS_ALICUOTAS'], compras: ['REGINFO_COMPRAS_CBTE', 'REGINFO_COMPRAS_ALICUOTAS'] }

  it('las pestañas hacen wrap (a 320 px miden 321)', async () => {
    responder({ '/api/libros-iva': LIBROS })
    montar('/libros-iva', <LibrosIva />)
    tiene(await screen.findByRole('tablist'), 'h-auto', 'flex-wrap')
  })

  for (const lado of ['ventas', 'compras'] as const) {
    it(`${lado}: la cabecera de exportación hace wrap y los botones REGINFO topan en el ancho y parten el nombre`, async () => {
      responder({ '/api/libros-iva': LIBROS })
      const user = userEvent.setup()
      montar('/libros-iva', <LibrosIva />)
      await screen.findByRole('tablist')
      if (lado === 'compras') await user.click(screen.getByRole('tab', { name: /IVA Compras/ }))
      const [cbte, alicuotas] = NOMBRES[lado].map((n) => screen.getByRole('link', { name: n }))
      // La cabecera de la tarjeta (título + botones) no puede ser un `flex` sin wrap: el botón más largo mide 254 px.
      tiene(cbte.parentElement!.parentElement, 'flex', 'flex-wrap')
      tiene(cbte.parentElement, 'flex-wrap', 'min-w-0')
      for (const boton of [cbte, alicuotas]) tiene(boton, 'max-w-full', 'whitespace-normal', '[overflow-wrap:anywhere]', 'h-auto', 'min-h-8')
    })

    it(`${lado}: el párrafo de ayuda lleva su texto en un solo \`span\` (como hijos sueltos de un flex medía 912 px)`, async () => {
      responder({ '/api/libros-iva': LIBROS })
      const user = userEvent.setup()
      montar('/libros-iva', <LibrosIva />)
      await screen.findByRole('tablist')
      if (lado === 'compras') await user.click(screen.getByRole('tab', { name: /IVA Compras/ }))
      const parrafo = screen.getByText(/se importan en el Aplicativo REGINFO/, { selector: 'span' }).closest('p')!
      // Hijos directos: el icono y el `span` del texto. Ningún `strong` ni `code` suelto en el `flex`.
      expect(Array.from(parrafo.children).map((h) => h.tagName.toLowerCase())).toEqual(['svg', 'span'])
      tiene(parrafo.querySelector('span'), 'min-w-0', '[overflow-wrap:anywhere]')
      expect(within(parrafo).getByText(NOMBRES[lado][0], { selector: 'strong' })).toBeTruthy()
    })
  }
})

describe('Transferencias', () => {
  const HISTORIAL = [{
    id: 5, producto_id: 1, producto: 'Milanesa', variant_id: null, cantidad: 4, origen_id: 1, origen: 'Salón',
    destino_id: 2, destino: 'Bodega', fecha: '2026-09-26T10:00:00', observaciones: 'reposición', usuario_id: 1,
  }]

  it('el historial scrollea dentro de su tarjeta y no la página (seis columnas miden 551 px)', async () => {
    responder({ '/api/depositos': [], '/api/productos': [], '/api/depositos/transferencias': HISTORIAL })
    render(<MemoryRouter><DepositoTransferencia conHistorial /></MemoryRouter>)
    const tabla = (await screen.findByRole('table')) as HTMLElement
    tiene(tabla.parentElement, 'overflow-x-auto')
  })

  it('la tarjeta del formulario puede achicarse: su mínimo (309 px) ensanchaba la columna a 320 px', async () => {
    responder({ '/api/depositos': [], '/api/productos': [] })
    render(<MemoryRouter><DepositoTransferencia /></MemoryRouter>)
    const titulo = await screen.findByText('Transferir stock entre depósitos')
    const centrado = titulo.closest('.justify-center')
    tiene(centrado, 'flex', 'min-w-0', 'justify-center')
  })
})

describe('Reportes', () => {
  const REPORTES: ReportesData = {
    desde: '2026-09-01', hasta: '2026-09-30', agrupacion: 'dia',
    resumen: { ventas_cantidad: 0, ventas_total: 0, facturas_cantidad: 0, caja_saldo: 0 },
    ventas_ts: [], medios: [], productos: [], caja: [], stock_bajo: [], medio_label: {},
  }

  it('los filtros (Desde, Hasta, Agrupar por: 472 px) hacen wrap', async () => {
    responder({ '/api/reportes': REPORTES })
    montar('/reportes', <Reportes />)
    const filtros = (await screen.findByText('Agrupar por')).closest('.grid')!.parentElement
    tiene(filtros, 'flex', 'flex-wrap', 'items-end')
  })
})

describe('Cajas', () => {
  const CAJA: CajaConfig = { id: 1, nombre: 'Caja Principal', descripcion: '', medios_pago: [], es_default: 1, activo: 1, punto_venta: null, mp_pos_id: null }

  it('la cabecera y el grupo de acciones (filtro de sucursal de 224 px + «Nueva caja») hacen wrap', async () => {
    responder({ '/api/cajas': [CAJA], '/api/cajas/medios-disponibles': [] })
    montar('/cajas', <Cajas />)
    await screen.findByText('Caja Principal')
    const cabecera = cabeceraDe('Cajas')
    tiene(cabecera, 'flex', 'flex-wrap', 'justify-between')
    tiene(cabecera.lastElementChild, 'flex', 'flex-wrap')
  })

  it('en cada tarjeta los badges hacen wrap y el nombre parte, con el icono sin achicarse (2 px de desborde a 768 px con el menú abierto)', async () => {
    responder({ '/api/cajas': [{ ...CAJA, tiene_turno_abierto: true }], '/api/cajas/medios-disponibles': [] })
    montar('/cajas', <Cajas />)
    const nombre = (await screen.findByText('Caja Principal')).closest('p')!
    tiene(nombre, '[overflow-wrap:anywhere]')
    tiene(nombre.querySelector('svg'), 'shrink-0')
    tiene(nombre.nextElementSibling, 'flex', 'flex-wrap', 'justify-end')
  })
})

describe('Tesorería', () => {
  const BANCO: CuentaTesoreria = { id: 1, nombre: 'Banco Galicia', tipo: 'banco', banco: 'Galicia', numero: '1234', descripcion: '', saldo_inicial: 0, saldo: 0, activa: 1 }

  it('la cabecera y el grupo («Transferir» + «Nueva cuenta») hacen wrap', async () => {
    responder({ '/api/tesoreria': { cuentas: [BANCO], movimientos: [], resumen: { total: 0 } } })
    montar('/tesoreria', <Tesoreria />)
    await screen.findByText('Banco Galicia')
    const cabecera = cabeceraDe('Tesorería')
    tiene(cabecera, 'flex', 'flex-wrap', 'justify-between')
    tiene(cabecera.lastElementChild, 'flex', 'flex-wrap')
  })
})

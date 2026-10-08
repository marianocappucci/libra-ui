// Las tarjetas de reportes e indicadores (ADR-038): que el ícono salga del catálogo y no de la pantalla, que estén en el recuadro y que los
// estados (cargando, con enlace, con variación) se vean.
//
// Lo que este archivo NO puede probar: cómo se ven. En jsdom no hay hoja de Tailwind, así que no se mide el color ni el modo oscuro; eso se
// mira en un navegador sobre un producto. Acá se mide qué ícono, dónde, con qué clases y qué enlace.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LucideIcon } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GrillaDeIndicadores } from '../src/GrillaDeIndicadores'
import { TarjetaIndicador } from '../src/TarjetaIndicador'
import { TarjetaReporte } from '../src/TarjetaReporte'
import { Dashboard } from '../src/comercio/Dashboard'
import { Reportes } from '../src/comercio/Reportes'
import type { DashboardData, ReportesData } from '../src/comercio/tipos'
import { iconoDelIndicador, type ConceptoIndicador } from '../src/iconos-indicador'
import { montar, prepararFetch, responder } from './helpers-pantallas'

/** El SVG que rinde un componente, como texto: lucide le pone `class="lucide lucide-<nombre>"`, así que dos íconos distintos nunca coinciden. */
function svgDe(Icono: LucideIcon): string {
  const { container, unmount } = render(<Icono />)
  const svg = container.querySelector('svg')!.outerHTML.replace(' aria-hidden="true"', '')
  unmount()
  return svg
}

/** El ícono que una tarjeta dibuja en su recuadro, sin los atributos que le agrega la tarjeta (`aria-hidden`). */
function iconoDelRecuadro(tarjeta: Element): string {
  const svg = tarjeta.querySelector('[data-slot="icono-tile"] svg')!
  return svg.outerHTML.replace(' aria-hidden="true"', '')
}

function enRouter(elemento: React.ReactElement) {
  return render(<MemoryRouter>{elemento}</MemoryRouter>)
}

describe('TarjetaIndicador', () => {
  it('rinde la etiqueta, la cifra y la ayuda', () => {
    render(<TarjetaIndicador concepto="cobros" etiqueta="Cobrado este mes" valor="$ 1.000" ayuda="Ingresos en caja" />)
    expect(screen.getByText('Cobrado este mes')).toBeInTheDocument()
    expect(screen.getByText('$ 1.000')).toBeInTheDocument()
    expect(screen.getByText('Ingresos en caja')).toBeInTheDocument()
  })

  it.each<ConceptoIndicador>(['cobros', 'ventas', 'stockBajo', 'proveedores', 'gastos', 'ordenesDeCarga'])(
    '🔴 el ícono de «%s» es el del catálogo, dentro del recuadro', (concepto) => {
      const { container } = render(<TarjetaIndicador concepto={concepto} etiqueta="x" valor="1" />)
      const tarjeta = container.querySelector('[data-slot="tarjeta-indicador"]')!
      expect(tarjeta.getAttribute('data-concepto')).toBe(concepto)
      expect(iconoDelRecuadro(tarjeta)).toBe(svgDe(iconoDelIndicador(concepto)))
    },
  )

  it('el recuadro es el mismo del título de pantalla (`icono-tile`) y el glifo es decorativo', () => {
    const { container } = render(<TarjetaIndicador concepto="caja" etiqueta="Saldo" valor="1" />)
    const recuadro = container.querySelector('[data-slot="icono-tile"]')!
    expect(recuadro.className).toContain('bg-muted')
    expect(recuadro.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('aplica la excepción del producto al ícono', () => {
    const { container } = render(<TarjetaIndicador concepto="proveedores" producto="libracargo" etiqueta="Saldo de proveedores" valor="1" />)
    expect(container.querySelector('[data-slot="icono-tile"] svg')!.getAttribute('class')).toContain('lucide-store')
  })

  it('sin tono, la cifra no se pinta: pintar es decir algo de ella', () => {
    render(<TarjetaIndicador concepto="ventas" etiqueta="Ventas" valor="12" />)
    const cifra = screen.getByText('12')
    expect(cifra.className).not.toMatch(/text-(exito|destructive|primary|amber)/)
  })

  it.each([
    ['primario', 'text-primary', 'bg-primary/10'],
    ['exito', 'text-exito', 'bg-exito/10'],
    ['peligro', 'text-destructive', 'bg-destructive/10'],
    ['aviso', 'text-amber-600', 'bg-amber-500/10'],
  ] as const)('tono «%s»: pinta la cifra y el recuadro (con modo oscuro)', (tono, texto, fondo) => {
    const { container } = render(<TarjetaIndicador concepto="cobros" etiqueta="x" valor="777" tono={tono} />)
    expect(screen.getByText('777').className).toContain(texto)
    expect(container.querySelector('[data-slot="icono-tile"]')!.className).toContain(fondo)
  })

  it('el tono de aviso tiene su variante oscura', () => {
    const { container } = render(<TarjetaIndicador concepto="stockBajo" etiqueta="x" valor="1" tono="aviso" />)
    expect(container.querySelector('[data-slot="icono-tile"]')!.className).toContain('dark:text-amber-400')
  })

  it('cargando: deja la etiqueta y el ícono y pone un esqueleto en lugar de la cifra y la ayuda', () => {
    const { container } = render(
      <TarjetaIndicador concepto="ventas" etiqueta="Ventas" valor="999" ayuda="operaciones" variacion={{ porcentaje: 5 }} cargando />,
    )
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="valor-cargando"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="icono-tile"] svg')).not.toBeNull()
    expect(screen.queryByText('999')).toBeNull()
    expect(screen.queryByText('operaciones')).toBeNull()
    expect(container.querySelector('[data-slot="variacion"]')).toBeNull()
  })

  it('no está cargando: no hay esqueleto', () => {
    const { container } = render(<TarjetaIndicador concepto="ventas" etiqueta="Ventas" valor="1" />)
    expect(container.querySelector('[data-slot="valor-cargando"]')).toBeNull()
  })

  it('con `children` suma un desglose debajo de la cifra, y cargando lo oculta', () => {
    const { container, rerender } = render(
      <TarjetaIndicador concepto="turnos" etiqueta="Turnos" valor="9"><ul><li>Confirmados 5</li></ul></TarjetaIndicador>,
    )
    expect(container.querySelector('[data-slot="detalle-indicador"]')).toHaveTextContent('Confirmados 5')
    rerender(<TarjetaIndicador concepto="turnos" etiqueta="Turnos" valor="9" cargando><ul><li>Confirmados 5</li></ul></TarjetaIndicador>)
    expect(container.querySelector('[data-slot="detalle-indicador"]')).toBeNull()
  })

  it('sin `children` no hay desglose', () => {
    const { container } = render(<TarjetaIndicador concepto="turnos" etiqueta="Turnos" valor="9" />)
    expect(container.querySelector('[data-slot="detalle-indicador"]')).toBeNull()
  })

  it('sin ayuda no dibuja la línea de ayuda', () => {
    const { container } = render(<TarjetaIndicador concepto="ventas" etiqueta="Ventas" valor="1" />)
    expect(container.querySelectorAll('p')).toHaveLength(2) // la etiqueta (stub de CardDescription) y la cifra
  })

  it('con `a` la tarjeta entera es un enlace', () => {
    enRouter(<TarjetaIndicador concepto="caja" etiqueta="Saldo" valor="1" a="/caja" />)
    const enlace = screen.getByRole('link')
    expect(enlace).toHaveAttribute('href', '/caja')
    expect(within(enlace).getByText('Saldo')).toBeInTheDocument()
  })

  it('sin `a` no es un enlace (y no necesita un router)', () => {
    render(<TarjetaIndicador concepto="caja" etiqueta="Saldo" valor="1" />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  describe('variación', () => {
    function variacion() {
      return document.querySelector('[data-slot="variacion"]') as HTMLElement
    }

    it('sube: flecha arriba, signo más y en verde', () => {
      render(<TarjetaIndicador concepto="ventas" etiqueta="V" valor="1" variacion={{ porcentaje: 12.5 }} />)
      expect(variacion().textContent).toBe('+12,5 %')
      expect(variacion().className).toContain('text-exito')
      expect(variacion().querySelector('svg')!.getAttribute('class')).toContain('lucide-arrow-up')
      expect(variacion().getAttribute('aria-label')).toBe('Sube 12,5 por ciento')
    })

    it('baja: flecha abajo, signo menos y en rojo', () => {
      render(<TarjetaIndicador concepto="ventas" etiqueta="V" valor="1" variacion={{ porcentaje: -3 }} />)
      expect(variacion().textContent).toMatch(/^[-−]3 %$/)
      expect(variacion().className).toContain('text-destructive')
      expect(variacion().querySelector('svg')!.getAttribute('class')).toContain('lucide-arrow-down')
      expect(variacion().getAttribute('aria-label')).toBe('Baja 3 por ciento')
    })

    it('🔴 cuando subir es malo (egresos), la flecha sube pero el color es el malo', () => {
      render(<TarjetaIndicador concepto="egresos" etiqueta="E" valor="1" variacion={{ porcentaje: 8, subirEsBueno: false }} />)
      expect(variacion().querySelector('svg')!.getAttribute('class')).toContain('lucide-arrow-up')
      expect(variacion().className).toContain('text-destructive')
    })

    it('cuando subir es malo y baja, el color es el bueno', () => {
      render(<TarjetaIndicador concepto="egresos" etiqueta="E" valor="1" variacion={{ porcentaje: -8, subirEsBueno: false }} />)
      expect(variacion().className).toContain('text-exito')
    })

    it('sin cambio: guion, sin signo y en gris', () => {
      render(<TarjetaIndicador concepto="ventas" etiqueta="V" valor="1" variacion={{ porcentaje: 0 }} />)
      expect(variacion().textContent).toBe('0 %')
      expect(variacion().className).toContain('text-muted-foreground')
      expect(variacion().querySelector('svg')!.getAttribute('class')).toContain('lucide-minus')
      expect(variacion().getAttribute('aria-label')).toBe('Sin cambios 0 por ciento')
    })
  })
})

describe('TarjetaIndicador horizontal y GrillaDeIndicadores (ADR-042)', () => {
  const tarjeta = (c: HTMLElement) => c.querySelector('[data-slot="tarjeta-indicador"]') as HTMLElement

  it('🔴 sin grilla ni `disposicion` es la de siempre: nada cambia para los demás tableros', () => {
    const { container } = render(<TarjetaIndicador concepto="cobros" etiqueta="Cobrado" valor="$ 1" ayuda="x" />)
    expect(tarjeta(container).getAttribute('data-disposicion')).toBeNull()
    expect(container.querySelector('[data-slot="icono-tile"]')!.className).toContain('size-9')
    expect(container.querySelector('[data-slot="valor-indicador"]')).toBeNull()
  })

  it('horizontal: el recuadro de 40 px va primero, la etiqueta en el medio y la cifra al final, a la derecha y sin cortar', () => {
    const { container } = render(<TarjetaIndicador disposicion="horizontal" concepto="cobros" etiqueta="Cobrado este mes" valor="$ 1.234.567" ayuda="Ingresos en caja" />)
    const t = tarjeta(container)
    expect(t.getAttribute('data-disposicion')).toBe('horizontal')
    const fila = t.firstElementChild as HTMLElement
    const [recuadro, medio, cifra] = [...fila.children] as HTMLElement[]
    expect(recuadro.getAttribute('data-slot')).toBe('icono-tile')
    expect(recuadro.className).toContain('size-10')
    expect(medio.className).toContain('min-w-0')
    expect(medio).toHaveTextContent('Cobrado este mes')
    expect(medio).toHaveTextContent('Ingresos en caja')
    expect(cifra).toHaveTextContent('$ 1.234.567')
    for (const clase of ['text-2xl', 'font-bold', 'text-right', 'whitespace-nowrap', 'shrink-0']) expect(cifra.className).toContain(clase)
    expect(medio.className).not.toContain('truncate') // la etiqueta puede envolver
    expect(fila.getAttribute('data-slot')).toBe('fila-indicador')
    expect(fila.className).toContain('flex-wrap') // si la cifra no entra al lado, baja en vez de salirse de la tarjeta
    expect(cifra.className).toContain('ml-auto')
    expect(fila.className).toContain('flex-1') // si la grilla la estira a la altura de la vecina, la fila llena y centra el contenido
    expect(fila.className).toContain('px-4.5')
    expect(fila.className).toContain('py-3.5')
  })

  it('horizontal conserva el ícono del catálogo, el tono y la excepción del producto', () => {
    const { container } = render(<TarjetaIndicador disposicion="horizontal" concepto="proveedores" producto="libracargo" tono="peligro" etiqueta="x" valor="9" />)
    expect(iconoDelRecuadro(tarjeta(container))).toBe(svgDe(iconoDelIndicador('proveedores', 'libracargo')))
    expect(screen.getByText('9').className).toContain('text-destructive')
    expect(container.querySelector('[data-slot="icono-tile"]')!.className).toContain('bg-destructive/10')
  })

  it('horizontal: la variación va en el medio, debajo de la etiqueta', () => {
    const { container } = render(<TarjetaIndicador disposicion="horizontal" concepto="ventas" etiqueta="V" valor="1" variacion={{ porcentaje: 4 }} />)
    expect(container.querySelector('[data-slot="variacion"]')!.parentElement!.className).toContain('min-w-0')
  })

  it('horizontal cargando: etiqueta e ícono quedan, un esqueleto ocupa el lugar de la cifra', () => {
    const { container } = render(<TarjetaIndicador disposicion="horizontal" concepto="ventas" etiqueta="Ventas" valor="999" ayuda="ops" variacion={{ porcentaje: 5 }} cargando />)
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="valor-cargando"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="icono-tile"] svg')).not.toBeNull()
    for (const t of ['999', 'ops']) expect(screen.queryByText(t)).toBeNull()
    expect(container.querySelector('[data-slot="variacion"]')).toBeNull()
  })

  it('horizontal con `children`: el desglose va debajo, a todo el ancho, y cargando lo oculta', () => {
    const { container, rerender } = render(
      <TarjetaIndicador disposicion="horizontal" concepto="turnos" etiqueta="Turnos" valor="9"><ul><li>Confirmados 5</li></ul></TarjetaIndicador>,
    )
    const detalle = container.querySelector('[data-slot="detalle-indicador"]') as HTMLElement
    expect(detalle).toHaveTextContent('Confirmados 5')
    expect(detalle.previousElementSibling).toBe(tarjeta(container).firstElementChild) // después de la fila, no adentro
    expect(detalle.className).toContain('border-t')
    rerender(<TarjetaIndicador disposicion="horizontal" concepto="turnos" etiqueta="Turnos" valor="9" cargando><ul><li>Confirmados 5</li></ul></TarjetaIndicador>)
    expect(container.querySelector('[data-slot="detalle-indicador"]')).toBeNull()
  })

  it('horizontal con `a`: la tarjeta entera es un enlace', () => {
    enRouter(<TarjetaIndicador disposicion="horizontal" concepto="caja" etiqueta="Saldo" valor="1" a="/caja" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/caja')
  })

  it('la grilla estándar es la de siempre y no cambia las tarjetas', () => {
    const { container } = render(
      <GrillaDeIndicadores><TarjetaIndicador concepto="ventas" etiqueta="V" valor="1" /></GrillaDeIndicadores>,
    )
    const grilla = container.querySelector('[data-slot="grilla-de-indicadores"]')!
    expect(grilla.getAttribute('data-variante')).toBe('estandar')
    expect(grilla.className).toContain('sm:grid-cols-2')
    expect(grilla.className).toContain('2xl:grid-cols-4')
    expect(tarjeta(container).getAttribute('data-disposicion')).toBeNull()
  })

  it('🔴 la grilla ancha: una columna en celular, dos desde lg, y sus tarjetas salen horizontales sin pedirlo una por una', () => {
    const { container } = render(
      <GrillaDeIndicadores variante="ancha" className="mb-4">
        <TarjetaIndicador concepto="ventas" etiqueta="A" valor="1" />
        <TarjetaIndicador concepto="caja" etiqueta="B" valor="2" />
      </GrillaDeIndicadores>,
    )
    const grilla = container.querySelector('[data-slot="grilla-de-indicadores"]')!
    for (const clase of ['grid', 'grid-cols-1', 'lg:grid-cols-2', 'gap-4', 'mb-4']) expect(grilla.className).toContain(clase)
    expect(grilla.className).not.toContain('2xl:grid-cols-4')
    const tarjetas = container.querySelectorAll('[data-slot="tarjeta-indicador"]')
    expect(tarjetas).toHaveLength(2)
    for (const t of tarjetas) expect(t.getAttribute('data-disposicion')).toBe('horizontal')
  })

  it('una tarjeta que pide su disposición gana a la de la grilla', () => {
    const { container } = render(
      <GrillaDeIndicadores variante="ancha"><TarjetaIndicador disposicion="vertical" concepto="ventas" etiqueta="A" valor="1" /></GrillaDeIndicadores>,
    )
    expect(tarjeta(container).getAttribute('data-disposicion')).toBeNull()
  })
})

describe('TarjetaReporte', () => {
  it('rinde el título, la descripción y la nota', () => {
    render(<TarjetaReporte concepto="saldos" titulo="Saldos de cuenta corriente" descripcion="Las tres cuentas de una vez" nota="Se filtra por: tercero" />)
    expect(screen.getByText('Saldos de cuenta corriente')).toBeInTheDocument()
    expect(screen.getByText('Las tres cuentas de una vez')).toBeInTheDocument()
    expect(screen.getByText('Se filtra por: tercero')).toBeInTheDocument()
  })

  it.each<ConceptoIndicador>(['saldos', 'caja', 'comisiones', 'incidencias', 'proveedores', 'auditoria'])(
    '🔴 el ícono de «%s» es el del catálogo, en el recuadro del título', (concepto) => {
      const { container } = render(<TarjetaReporte concepto={concepto} titulo="x" />)
      const tarjeta = container.querySelector('[data-slot="tarjeta-reporte"]')!
      expect(tarjeta.getAttribute('data-concepto')).toBe(concepto)
      expect(iconoDelRecuadro(tarjeta)).toBe(svgDe(iconoDelIndicador(concepto)))
    },
  )

  it('el recuadro es el de TituloPantalla: 32 px, fondo muted, glifo de 20', () => {
    const { container } = render(<TarjetaReporte concepto="caja" titulo="Caja" />)
    const recuadro = container.querySelector('[data-slot="icono-tile"]')!
    for (const clase of ['size-8', 'bg-muted', '[&>svg]:size-5']) expect(recuadro.className).toContain(clase)
  })

  it('aplica la excepción del producto al ícono', () => {
    const { container } = render(<TarjetaReporte concepto="proveedores" producto="libracargo" titulo="Proveedores" />)
    expect(container.querySelector('[data-slot="icono-tile"] svg')!.getAttribute('class')).toContain('lucide-store')
  })

  it('con `a` es un enlace a esa ruta, con el chevron', () => {
    const { container } = enRouter(<TarjetaReporte concepto="saldos" titulo="Saldos" descripcion="d" a="/reportes/saldos" />)
    const enlace = screen.getByRole('link', { name: /Saldos/ })
    expect(enlace).toHaveAttribute('href', '/reportes/saldos')
    expect(container.querySelector('svg.lucide-chevron-right')).not.toBeNull()
  })

  it('con `onClick` es un botón que lo llama', async () => {
    const onClick = vi.fn()
    render(<TarjetaReporte concepto="caja" titulo="Caja" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: /Caja/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('sin `a` ni `onClick` es informativa: ni enlace, ni botón, ni chevron', () => {
    const { container } = render(<TarjetaReporte concepto="caja" titulo="Caja" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('svg.lucide-chevron-right')).toBeNull()
  })

  it('sólo reacciona al mouse si lleva a algún lado', () => {
    const informativa = render(<TarjetaReporte concepto="caja" titulo="Caja" />).container.firstElementChild!
    expect(informativa.className).not.toContain('hover:bg-accent')
    const boton = render(<TarjetaReporte concepto="caja" titulo="Otra" onClick={() => {}} />).container.firstElementChild!
    expect(boton.className).toContain('hover:bg-accent')
  })

  it('suma las clases del llamador', () => {
    const { container } = render(<TarjetaReporte concepto="caja" titulo="Caja" className="md:col-span-2" />)
    expect(container.firstElementChild!.className).toContain('md:col-span-2')
  })
})

// ── Las dos pantallas del kit que ya las usan ────────────────────────────

describe('Reportes y Dashboard del kit toman sus íconos del catálogo', () => {
  beforeEach(() => {
    prepararFetch()
  })

  const REPORTES: ReportesData = {
    desde: '2026-09-01', hasta: '2026-09-30', agrupacion: 'dia',
    resumen: { ventas_cantidad: 3, ventas_total: 450, facturas_cantidad: 1, caja_saldo: 450 },
    ventas_ts: [{ periodo: '2026-09-01', cantidad: 1, total: 100 }],
    medios: [{ medio: 'efectivo', operaciones: 2, total: 300 }],
    productos: [{ nombre: 'Yerba', cantidad: 4, total: 400 }],
    caja: [{ tipo: 'ingreso', cantidad: 3, total: 450 }],
    stock_bajo: [{ id: 2, nombre: 'Azúcar', codigo: null, stock_actual: 1, stock_minimo: 5 }],
    medio_label: { efectivo: 'Efectivo' },
  }

  const DASHBOARD: DashboardData = {
    mes_desde: '2026-09-01', mes_hasta: '2026-09-27',
    facturado_mes: 100000, cobrado_mes: 80000, egresos_mes: 20000, saldo_total: 150000, cant_facturas_mes: 1,
    facturas_sin_cobrar: [], presupuestos_pendientes: [], ultimos_movimientos: [],
  }

  const conceptosDeKpi = (): string[] =>
    [...document.querySelectorAll('[data-slot="tarjeta-indicador"]')].map((t) => t.getAttribute('data-concepto')!)
  const conceptosDeTitulo = (): string[] =>
    [...document.querySelectorAll('svg[data-concepto]')].map((s) => s.getAttribute('data-concepto')!)

  it('🔴 Reportes: cuatro KPI y cinco bloques, todos con un concepto del catálogo', async () => {
    responder({ '/api/reportes': REPORTES })
    montar('/reportes', <Reportes />)
    await screen.findByText('Ventas en período')
    expect(conceptosDeKpi()).toEqual(['ventas', 'montoVendido', 'comprobantes', 'caja'])
    // Los bloques con título: ventas, medios de pago, productos, caja y el aviso de stock bajo.
    expect(conceptosDeTitulo()).toEqual(['ventas', 'mediosDePago', 'productos', 'caja', 'stockBajo'])
    for (const t of document.querySelectorAll('[data-slot="tarjeta-indicador"]')) {
      expect(iconoDelRecuadro(t)).toBe(svgDe(iconoDelIndicador(t.getAttribute('data-concepto') as ConceptoIndicador)))
    }
  })

  it('Reportes: «Productos más vendidos» ya no usa el ícono del stock', async () => {
    responder({ '/api/reportes': REPORTES })
    montar('/reportes', <Reportes />)
    await screen.findByText('Productos más vendidos')
    const titulo = screen.getByText('Productos más vendidos')
    expect(titulo.querySelector('svg')!.getAttribute('class')).toContain('lucide-package')
    expect(titulo.querySelector('svg')!.getAttribute('class')).not.toContain('lucide-boxes')
  })

  it('🔴 Dashboard: cuatro KPI y tres bloques, todos con un concepto del catálogo', async () => {
    responder({ '/api/dashboard': DASHBOARD })
    montar('/dashboard', <Dashboard />)
    await screen.findByText('Facturado este mes')
    expect(conceptosDeKpi()).toEqual(['facturado', 'cobros', 'egresos', 'caja'])
    expect(conceptosDeTitulo()).toEqual(['porCobrar', 'presupuestos', 'caja'])
    for (const t of document.querySelectorAll('[data-slot="tarjeta-indicador"]')) {
      expect(iconoDelRecuadro(t)).toBe(svgDe(iconoDelIndicador(t.getAttribute('data-concepto') as ConceptoIndicador)))
    }
  })

  it('Dashboard: el saldo en rojo cuando es negativo y en verde cuando no', async () => {
    responder({ '/api/dashboard': { ...DASHBOARD, saldo_total: -500 } })
    montar('/dashboard', <Dashboard />)
    await screen.findByText('Saldo total en caja')
    const saldo = document.querySelector('[data-concepto="caja"]')!
    expect(screen.getByText(/500/).className).toContain('text-destructive')
    expect(saldo.querySelector('[data-slot="icono-tile"]')!.className).toContain('bg-destructive/10')
  })

  it('Dashboard: el título de pantalla sigue siendo el primer recuadro de la página', async () => {
    responder({ '/api/dashboard': DASHBOARD })
    montar('/dashboard', <Dashboard />)
    await screen.findByText('Facturado este mes')
    const primero = document.querySelector('[data-slot="icono-tile"]')!
    expect(primero.closest('h2')).not.toBeNull()
  })
})

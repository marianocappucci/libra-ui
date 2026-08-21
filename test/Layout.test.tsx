// El menú lateral de los seis productos. Lo que se prueba acá es **quién ve
// qué**, que es lo único de este componente que puede fallar en silencio: un
// ítem de más se ve enseguida, uno de menos parece que el producto no lo tiene.
//
// Agregado el 2026-08-06 con el visitante de la demo: pedido del humano de que
// vea todos los menús "como si fuera admin aunque no deje modificar".
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createLayout } from '../src/Layout'

type Usuario = { role?: string; name?: string; demo_readonly?: boolean }

// El menú renderiza `<item.icon />` sin guarda, así que el icono no es
// opcional en la práctica: pasar items sin él revienta con "Element type is
// invalid". Uno de mentira alcanza — lo que se prueba acá es el filtro.
const Icono = () => <svg />

function montar(user: Usuario | null) {
  const Layout = createLayout<Usuario>({
    productName: 'MedLibra',
    productInitial: 'M',
    navItems: [
      { to: '/agenda', label: 'Agenda', icon: Icono },
      { to: '/pacientes', label: 'Pacientes', icon: Icono },
      { to: '/reportes', label: 'Dashboard', icon: Icono, adminOnly: true },
      { to: '/usuarios', label: 'Usuarios', icon: Icono, adminOnly: true },
      { to: '/configuracion', label: 'Configuración', icon: Icono, adminOnly: true },
    ],
    useAuth: () => ({ user, logout: vi.fn() }),
  })
  // El Layout envuelve a la pantalla: `children` es obligatorio.
  render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

const SIEMPRE = ['Agenda', 'Pacientes']
const DE_ADMIN = ['Dashboard', 'Usuarios', 'Configuración']

describe('quién ve los menús de administración', () => {
  it('un admin los ve', () => {
    montar({ role: 'admin', name: 'Ana' })
    for (const label of [...SIEMPRE, ...DE_ADMIN]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('un staff común NO los ve', () => {
    // La mitad que hace útil al test de abajo: sin esto, "el visitante los ve"
    // podría estar pasando porque el filtro no filtra nada.
    montar({ role: 'staff', name: 'Pedro' })
    for (const label of SIEMPRE) expect(screen.getByText(label)).toBeInTheDocument()
    for (const label of DE_ADMIN) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })

  it('🔴 el visitante de la demo los ve, con su rol intacto', () => {
    // Es el pedido: la demo tiene que mostrarse entera. El backend le abre
    // sólo la lectura, así que ver el menú no le da poder de escribir.
    montar({ role: 'staff', name: 'Visitante', demo_readonly: true })
    for (const label of [...SIEMPRE, ...DE_ADMIN]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('la bandera en false se comporta como un staff cualquiera', () => {
    montar({ role: 'staff', name: 'Pedro', demo_readonly: false })
    for (const label of DE_ADMIN) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })
})

// ── El gate por MÓDULO ────────────────────────────────────────────────────────
//
// Es el que decide si un cliente ve una pantalla que su plan no incluye, y el
// que menos se nota cuando falla: un ítem de más se lo ve enseguida, uno de
// menos parece que el producto no lo tiene. Agregado el 2026-08-12 — la rama
// estaba sin cubrir entera (`Layout.tsx` tenía 37% de ramas).

function montarConModulos(
  user: Usuario | null,
  hasModule?: (u: Usuario, m: string) => boolean,
) {
  const Layout = createLayout<Usuario>({
    productName: 'VentaLibra',
    productInitial: 'V',
    navItems: [
      { to: '/ventas', label: 'Ventas', icon: Icono },
      { to: '/facturacion', label: 'Facturación', icon: Icono, module: 'facturacion' },
      { to: '/stock', label: 'Stock', icon: Icono, module: 'stock' },
    ],
    hasModule,
    useAuth: () => ({ user, logout: vi.fn() }),
  })
  render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
}

describe('el gate por módulo', () => {
  it('esconde el ítem cuyo módulo el plan no tiene', () => {
    montarConModulos({ role: 'admin' }, (_u, m) => m === 'stock')
    // el que no declara módulo se ve siempre
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    expect(screen.getByText('Stock')).toBeInTheDocument()
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument()
  })

  it('sin `hasModule`, los ítems con módulo se ven', () => {
    // Es el caso de los productos que todavía no gatean por plan: no se les
    // puede esconder media aplicación por no haber pasado la función.
    montarConModulos({ role: 'admin' })
    for (const l of ['Ventas', 'Facturación', 'Stock']) {
      expect(screen.getByText(l)).toBeInTheDocument()
    }
  })

  it('🔴 sin usuario, los ítems con módulo NO se ven', () => {
    // `moduleVisible` devuelve false sin usuario. Importa: durante el arranque
    // el layout puede renderizar antes de que la sesión resuelva, y mostrar
    // ahí un módulo que el cliente no pagó es peor que no mostrar nada.
    montarConModulos(null, () => true)
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument()
    expect(screen.queryByText('Stock')).not.toBeInTheDocument()
  })
})

// ── `hideFor`, secciones y submenús ───────────────────────────────────────────

describe('secciones, hideFor y submenús', () => {
  function montarSecciones(user: Usuario) {
    const Layout = createLayout<Usuario>({
      productName: 'LibraDesk',
      productInitial: 'L',
      navSections: [
        {
          label: 'Operación',
          items: [
            { to: '/tickets', label: 'Tickets', icon: Icono },
            { to: '/equipos', label: 'Equipos', icon: Icono, hideFor: (u) => u.role === 'staff' },
          ],
        },
        {
          label: 'Sólo dueños',
          hideFor: (u) => u.role !== 'admin',
          items: [{ to: '/rentabilidad', label: 'Rentabilidad', icon: Icono }],
        },
      ],
      useAuth: () => ({ user, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
  }

  it('un admin ve las dos secciones enteras', () => {
    montarSecciones({ role: 'admin' })
    expect(screen.getByText('Operación')).toBeInTheDocument()
    expect(screen.getByText('Sólo dueños')).toBeInTheDocument()
    expect(screen.getByText('Rentabilidad')).toBeInTheDocument()
    expect(screen.getByText('Equipos')).toBeInTheDocument()
  })

  it('`hideFor` esconde el ítem y, si vacía la sección, también el título', () => {
    // Las dos mitades juntas: sin la segunda, una sección vacía dejaría un
    // encabezado colgado sin nada debajo.
    montarSecciones({ role: 'staff' })
    expect(screen.getByText('Tickets')).toBeInTheDocument()
    expect(screen.queryByText('Equipos')).not.toBeInTheDocument()
    expect(screen.queryByText('Sólo dueños')).not.toBeInTheDocument()
    expect(screen.queryByText('Rentabilidad')).not.toBeInTheDocument()
  })

  it('el submenú se filtra por módulo, igual que el ítem padre', () => {
    const Layout = createLayout<Usuario>({
      productName: 'Contalibra',
      productInitial: 'C',
      navItems: [{
        to: '/ventas', label: 'Ventas', icon: Icono,
        children: [
          { to: '/ventas/pos', label: 'POS' },
          { to: '/ventas/remitos', label: 'Remitos', module: 'remitos' },
        ],
      }],
      hasModule: () => false,
      useAuth: () => ({ user: { role: 'admin' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    expect(screen.getByText('POS')).toBeInTheDocument()
    expect(screen.queryByText('Remitos')).not.toBeInTheDocument()
  })

  it('el badge sale sólo cuando la función devuelve algo', () => {
    const Layout = createLayout<Usuario>({
      productName: 'LibraDesk',
      productInitial: 'L',
      navItems: [
        { to: '/pendientes', label: 'Pendientes', icon: Icono, badge: () => 7 },
        { to: '/cerrados', label: 'Cerrados', icon: Icono, badge: () => null },
      ],
      useAuth: () => ({ user: { role: 'admin' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    expect(screen.getByText('7')).toBeInTheDocument()
    // el de `null` no tiene que dejar un badge vacío colgado
    expect(screen.getByText('Cerrados')).toBeInTheDocument()
  })

  it('el badge no pide un color de texto que ningún tema define', () => {
    const Layout = createLayout<Usuario>({
      productName: 'LibraDesk',
      productInitial: 'L',
      navItems: [{ to: '/pendientes', label: 'Pendientes', icon: Icono, badge: () => 106 }],
      useAuth: () => ({ user: { role: 'admin' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    const badge = screen.getByText('106')
    // `--destructive-foreground` no existe en el `index.css` de ningún
    // producto: la clase no se emite, tailwind-merge igual borra el
    // `text-sidebar-foreground` de la base, y el número se queda sin color
    // propio. Que no vuelva a entrar por copiar y pegar.
    expect(badge.className).not.toMatch(/text-destructive-foreground/)
    // Esto mira clases, no píxeles: prueba que el badge PIDE un color de
    // texto explicito, no que el navegador lo pinte legible. El contraste se
    // mide en el navegador contra el CSS compilado del producto.
    expect(badge.className).toMatch(/text-amber-900/)
  })
})

// ── La cabecera ───────────────────────────────────────────────────────────────

describe('la cabecera del menú', () => {
  it('sin `icon` usa la inicial del producto', () => {
    const Layout = createLayout<Usuario>({
      productName: 'MedLibra', productInitial: 'M',
      navItems: [{ to: '/a', label: 'Agenda', icon: Icono }],
      useAuth: () => ({ user: { role: 'admin', name: 'Ana Perez' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('con `getUserSubtitle` lo muestra, y con el nombre arma las iniciales', () => {
    const Layout = createLayout<Usuario>({
      productName: 'MedLibra', productInitial: 'M',
      navItems: [{ to: '/a', label: 'Agenda', icon: Icono }],
      getUserName: (u) => u.name ?? '',
      getUserSubtitle: () => 'Consultorio Central',
      useAuth: () => ({ user: { role: 'admin', name: 'Ana Perez' }, logout: vi.fn() }),
    })
    render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    expect(screen.getByText('Consultorio Central')).toBeInTheDocument()
    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
  })
})

// ── La barra superior, que ya no está (v0.19.0) ───────────────────────────────
//
// Se fue para los seis productos a la vez. Se prueba acá y no en cada producto
// porque el `<header>` lo dibujaba este archivo: si vuelve, vuelve para todos.

describe('la barra superior no existe más', () => {
  function montarLayout() {
    const Layout = createLayout<Usuario>({
      productName: 'MedLibra', productInitial: 'M',
      navItems: [{ to: '/a', label: 'Agenda', icon: Icono }],
      useAuth: () => ({ user: { role: 'admin', name: 'Ana Perez' }, logout: vi.fn() }),
    })
    return render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
  }

  it('🔴 no queda ningún `<header>` arriba del contenido', () => {
    // El `<header>` era exclusivo de la barra: ninguna pieza del sidebar
    // (`SidebarHeader` incluido) renderiza uno.
    const { container } = montarLayout()
    expect(container.querySelector('header')).toBeNull()
  })

  it('🔴 el nombre del producto se dice una sola vez, en el sidebar', () => {
    // La mitad que caza el defecto de verdad: con la barra puesta, el nombre
    // aparecía dos veces —una en el sidebar y otra en la barra—, así que este
    // test falla con un `2` si alguien la reintroduce.
    montarLayout()
    expect(screen.getAllByText('MedLibra')).toHaveLength(1)
  })

  it('el trigger sobrevive, flotante y sólo en mobile', () => {
    // No se puede sacar del todo: en mobile la sidebar arranca cerrada. En
    // desktop sobra, y quedaría flotando encima del contenido.
    montarLayout()
    const trigger = screen.getByLabelText('Alternar barra lateral')
    expect(trigger.className).toContain('fixed')
    expect(trigger.className).toContain('md:hidden')
  })

  it('el contenido deja el hueco del trigger sólo en mobile', () => {
    // `pt-12` en mobile para no quedar debajo del botón flotante, y `md:pt-6`
    // para que en desktop el contenido arranque arriba de todo — que es el
    // punto de haber sacado la barra.
    montarLayout()
    const main = screen.getByText('contenido').parentElement as HTMLElement
    expect(main.tagName).toBe('MAIN')
    expect(main.className).toContain('pt-12')
    expect(main.className).toContain('md:pt-6')
  })
})

// ── El menú del usuario (v0.20.0) ────────────────────────────────────────────
//
// El pie del sidebar era el nombre del usuario —a veces un link— y un botón de
// salir al lado. Pedido del humano (2026-08-14) al querer meter ahí el selector
// de sucursal de LibraDesk: el pie es donde uno busca "lo mío", y lo único que
// ofrecía era irse.
//
// Lo que estos tests sostienen es que el menú **esconde de verdad**: el stub de
// `DropdownMenu` sólo renderiza el contenido con el menú abierto, igual que
// Radix. Con un stub que renderizara siempre, "hay un ítem Salir" pasaría sin
// haber abierto nada — y el trigger podría no existir.

describe('el menú del usuario', () => {
  function montarMenu(extra: Record<string, unknown> = {}) {
    const logout = vi.fn()
    const Layout = createLayout<Usuario>({
      productName: 'MedLibra', productInitial: 'M',
      navItems: [{ to: '/a', label: 'Agenda', icon: Icono }],
      getUserName: (u) => u.name ?? '',
      useAuth: () => ({ user: { role: 'admin', name: 'Ana Perez' }, logout }),
      ...extra,
    })
    const utils = render(<MemoryRouter><Layout><p>contenido</p></Layout></MemoryRouter>)
    return { ...utils, logout }
  }

  const abrir = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /Ana Perez/ }))
  }

  it('🔴 cerrado no muestra nada del menú; el nombre del usuario lo abre', async () => {
    const user = userEvent.setup()
    montarMenu()
    // La primera mitad es la que hace útil a la segunda.
    expect(screen.queryByText('Salir')).not.toBeInTheDocument()
    expect(screen.queryByText('Cambiar contraseña')).not.toBeInTheDocument()

    await abrir(user)
    expect(screen.getByText('Salir')).toBeInTheDocument()
    expect(screen.getByText('Cambiar contraseña')).toBeInTheDocument()
  })

  it('«Salir» cierra la sesión', async () => {
    const user = userEvent.setup()
    const { logout } = montarMenu()
    await abrir(user)
    await user.click(screen.getByText('Salir'))
    expect(logout).toHaveBeenCalled()
  })

  it('`userMenu` se dibuja adentro del menú, no suelto en la pantalla', async () => {
    // Es el slot del selector de sucursal. Si se dibujara afuera, volvería a ser
    // la barra que el pedido vino a sacar.
    const user = userEvent.setup()
    montarMenu({ userMenu: <span>selector de sucursal</span> })
    expect(screen.queryByText('selector de sucursal')).not.toBeInTheDocument()

    await abrir(user)
    expect(screen.getByText('selector de sucursal')).toBeInTheDocument()
  })

  it('«Cambiar contraseña» abre el diálogo', async () => {
    const user = userEvent.setup()
    montarMenu()
    await abrir(user)
    await user.click(screen.getByText('Cambiar contraseña'))
    // Se busca un campo del formulario y no el título: que el diálogo exista
    // sin sus campos no le sirve a nadie.
    expect(await screen.findByLabelText('Contraseña actual')).toBeInTheDocument()
  })

  it('«Mi cuenta» aparece sólo si el producto pasa `accountTo`', async () => {
    const user = userEvent.setup()
    const { unmount } = montarMenu()
    await abrir(user)
    expect(screen.queryByText('Mi cuenta')).not.toBeInTheDocument()
    unmount()

    montarMenu({ accountTo: '/mi-cuenta' })
    await abrir(user)
    expect(screen.getByRole('link', { name: /Mi cuenta/ })).toHaveAttribute('href', '/mi-cuenta')
  })
})

// El inset tiene que poder encogerse: sin eso, una pantalla con contenido ancho
// no scrollea adentro de su contenedor, empuja el layout entero y el `<body>`
// termina con scroll horizontal.
//
// 🟡 **Este test NO prueba el layout, y hay que saberlo.** jsdom no calcula
// anchos: lo único que fija es que la clase siga puesta. La prueba de verdad se
// hizo en un navegador —`dev.libraclub.com.ar`, 2026-08-20, agenda semanal—:
// con `min-width:auto` el inset medía 1105 sobre una ventana de 1105 y sobraban
// 256px; con `min-width:0` pasó a 849 y el exceso a cero. Si alguna vez esto
// falla, el camino es volver a medirlo así, no discutir la clase.
describe('el inset se puede encoger', () => {
  it('lleva min-w-0, que es lo que deja scrollear al contenido ancho', () => {
    montar({ role: 'admin', name: 'Ana' })
    const inset = document.querySelector('[data-slot="sidebar-inset"], main')
    expect(inset).toBeTruthy()
    expect(inset!.className).toContain('min-w-0')
  })
})

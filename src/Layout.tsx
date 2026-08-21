// v0.3.0 (2026-07-27): generalizado para soportar secciones agrupadas con
// hijos anidados, filtro por modulo, badges, ocultamiento por rol e icono/
// links de header -- necesario para sumar Contalibra/Restolibra (sidebar
// con 9-10 secciones, filtro real por plan/modulo, y en Restolibra
// ocultamiento completo de secciones para el rol "mozo"). Todos los campos
// nuevos son opcionales con default = comportamiento anterior a v0.3.0, asi
// que Gestiolibra/MedLibra/VentaLibra (que llaman
// `createLayout({ productName, productInitial, navItems })` tal cual) no
// cambian de renderizado. Ver wiki/entities/libra-ui.md.
//
// v0.19.0 (2026-08-14): se fue la barra superior. Repetia el nombre del
// producto que la sidebar ya dice arriba a la izquierda, y le comia 3,5rem de
// alto al contenido en todas las pantallas. El trigger de colapsar que vivia
// ahi queda flotante y solo en mobile (en desktop el atajo es Ctrl/Cmd+B, que
// SidebarProvider ya trae). Contalibra y Restolibra ya corrian asi via
// `topbar: false`; la opcion se elimina en vez de invertir su default para no
// dejar una variante que nadie usa -- si la barra vuelve alguna vez, vuelve
// para los seis productos a la vez.
import { useState, type ReactNode, type ComponentType } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { KeyRound, LogOut, UserRound } from 'lucide-react'
import { useAuth as useAuthDefault } from './AuthContext'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CambiarPassword } from './CambiarPassword'
import type { ProductLogo } from './branding'
import { cn } from './utils'

export type NavChild<TUser> = {
  to: string
  label: string
  module?: string
  icon?: ComponentType<{ className?: string }>
  hideFor?: (user: TUser) => boolean
}

export type NavItem<TUser> = {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  module?: string
  adminOnly?: boolean
  hideFor?: (user: TUser) => boolean
  children?: NavChild<TUser>[]
  badge?: (user: TUser) => ReactNode
}

export type NavSection<TUser> = {
  label?: string
  items: NavItem<TUser>[]
  hideFor?: (user: TUser) => boolean
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function createLayout<TUser = { role?: string; name?: string }>({
  productName, productInitial, navItems, navSections,
  icon: HeaderIcon, logo, wordmarkClassName, homeTo, accountTo,
  hasModule, getUserName, getUserSubtitle, userMenu,
  useAuth = useAuthDefault as unknown as () => { user: TUser | null; logout: () => Promise<void> },
}: {
  productName: string
  productInitial: string
  // Forma vieja (lista plana, pre-v0.3.0) -- se envuelve en una unica
  // seccion sin label. `navSections` (agrupado) tiene prioridad si se
  // pasan los dos.
  navItems?: NavItem<TUser>[]
  navSections?: NavSection<TUser>[]
  // Icono Lucide para el box del header -- si no se pasa, se muestra
  // `productInitial` como texto (comportamiento de siempre).
  icon?: ComponentType<{ className?: string }>
  // Logo del producto, a la izquierda del nombre. Si se pasa, reemplaza al box
  // entero, **incluido `icon`**: son dos formas de llenar el mismo hueco y el
  // logo es la más específica. Ver `branding.ts`.
  logo?: ProductLogo
  // Clases extra para el nombre del producto. Se mergean con
  // `truncate font-semibold` via `cn`. LibraDesk lo usa para su Montserrat Bold.
  wordmarkClassName?: string
  // Si se pasan, el logo/footer quedan como `NavLink` clickeable a esas
  // rutas -- si no, quedan como `div` no clickeable (comportamiento de
  // siempre).
  homeTo?: string
  accountTo?: string
  hasModule?: (user: TUser, module: string) => boolean
  getUserName?: (user: TUser) => string
  getUserSubtitle?: (user: TUser) => string | undefined
  // Lo que el PRODUCTO quiera meter en el menu del usuario, arriba de
  // "Cambiar contrasena" y "Salir". Es un slot y no una lista de items
  // tipada porque lo que entra son controles, no links: el primero es el
  // selector de sucursal de LibraDesk, que es un `<Select>` con su propio
  // estado. Una API de `{label, to, icon}` no lo habria podido expresar.
  userMenu?: ReactNode
  // Hook `useAuth` a usar -- por defecto el de la instancia pre-configurada
  // de este modulo. Productos con su propia `createAuthContext`
  // (Contalibra/Restolibra) pasan el suyo.
  useAuth?: () => { user: TUser | null; logout: () => Promise<void> }
}) {
  // "Menu" es el label hardcodeado que ya tenia la version pre-v0.3.0
  // cuando se usa `navItems` (lista plana) -- se preserva aca para no
  // cambiar el render de Gestiolibra/MedLibra/VentaLibra.
  const sections: NavSection<TUser>[] = navSections ?? [{ label: 'Menú', items: navItems ?? [] }]

  function AppSidebar() {
    const { user, logout } = useAuth()
    const location = useLocation()
    const [cambiandoPassword, setCambiandoPassword] = useState(false)
    // El visitante de una demo pública ve **todos** los menús, incluidos los
    // de administración. No es un rol más alto: el backend le abre sólo la
    // lectura (libraauth v0.18.0, `json_api_require_role`) y los botones de
    // guardar de cada pantalla se siguen gateando por `role`, que sigue siendo
    // el suyo. Sin esto, la demo de MedLibra mostraba una sola entrada de menú
    // y las otras cinco escondían Configuración, Usuarios y Logs.
    const datos = user as { role?: string; demo_readonly?: boolean } | null
    const isAdmin = datos?.role === 'admin'
    const veLosMenusDeAdmin = isAdmin || datos?.demo_readonly === true

    function moduleVisible(module?: string): boolean {
      if (!module) return true
      if (!user) return false
      return hasModule ? hasModule(user, module) : true
    }

    const HeaderContent = (
      <>
        {logo ? (
          <img
            src={logo.src}
            alt={logo.alt ?? productName}
            // `max-w-none` NO es decorativo. El preflight de Tailwind le pone
            // `max-width: 100%` a toda imagen, y con la sidebar colapsada el
            // contenedor del encabezado deja 15 px de ancho util (48 de la barra
            // menos dos niveles de padding). Sin esto el logo se recorta a
            // 15x32 en modo icono. El box de la inicial no tenia el problema
            // porque un div no lo alcanza esa regla — medido en el navegador el
            // 2026-08-16, no se ve en jsdom.
            className={cn('block h-8 w-8 max-w-none shrink-0 object-contain', logo.className)}
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
            {HeaderIcon ? <HeaderIcon className="size-4" /> : productInitial}
          </div>
        )}
        {/* El interlineado de las dos lineas, MEDIDO en un navegador el
            2026-08-16 y no estimado. Antes: el nombre del producto arrastraba
            24 px (16 de fuente x 1.5) y el de la empresa 16, o sea un bloque de
            40 px contra los 32 del box de la marca. El alto del encabezado lo
            decidia el TEXTO, y entre las dos palabras quedaba mas aire que el
            que ocupa la marca entera.

            Con esto el bloque baja a 31 px — por debajo de los 32 del box — asi
            que la fila pasa a medir lo que mide la MARCA, que es lo que pidio
            el humano: "que entre las dos tengan el mismo alto que el logo".

            Por que `leading-none` arriba y `leading-tight` abajo, y no lo mismo
            en las dos: los seis nombres de producto (LibraDesk, VentaLibra,
            RestoLibra, ContaLibra, MedLibra, GestioLibra) no tienen ninguna
            letra con cola, asi que ajustar la caja al tamano de la fuente no
            recorta nada. El nombre de la EMPRESA lo escribe el cliente y puede
            tener una "g" o una "p", asi que ahi se deja el 1.25 de aire.

            `justify-center` es la otra mitad: con el bloque mas bajo que la
            marca hay que centrarlo contra ella en vez de dejarlo pegado arriba.
            Y hace falta igual cuando el producto usa un logo mas alto que el
            default — LibraDesk lo pone en 36 px.

            Va para los seis: este encabezado se dibuja una sola vez, aca. */}
        <div className="flex min-w-0 flex-col justify-center group-data-[collapsible=icon]:hidden">
          <span className={cn('truncate font-semibold leading-none', wordmarkClassName)}>{productName}</span>
          {getUserSubtitle && user && getUserSubtitle(user) && (
            <span className="truncate text-xs leading-tight text-muted-foreground">{getUserSubtitle(user)}</span>
          )}
        </div>
      </>
    )

    const FooterContent = (
      <>
        <span className="truncate text-sm font-medium">{user && getUserName ? getUserName(user) : (user as { name?: string } | null)?.name}</span>
        <span className="truncate text-xs text-muted-foreground capitalize">{(user as { role?: string } | null)?.role}</span>
      </>
    )

    return (
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {homeTo ? (
            <NavLink to={homeTo} className="flex items-center gap-2 px-2 py-1.5">{HeaderContent}</NavLink>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5">{HeaderContent}</div>
          )}
        </SidebarHeader>
        <SidebarContent>
          {sections.map((section, si) => {
            if (user && section.hideFor?.(user)) return null
            const items = section.items
              .filter((item) => !(user && item.hideFor?.(user)))
              .filter((item) => (!item.adminOnly || veLosMenusDeAdmin) && moduleVisible(item.module))
            if (items.length === 0) return null
            return (
              <SidebarGroup key={section.label ?? si}>
                {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => {
                      const children = (item.children ?? [])
                        .filter((child) => !(user && child.hideFor?.(user)))
                        .filter((child) => moduleVisible(child.module))
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton asChild isActive={location.pathname === item.to}>
                            <NavLink to={item.to}>
                              <item.icon className="size-4" />
                              <span>{item.label}</span>
                            </NavLink>
                          </SidebarMenuButton>
                          {user && item.badge && item.badge(user) != null && (
                            <SidebarMenuBadge
                              // Ambar y no `bg-destructive`: el badge cuenta cosas que
                              // llegaron y hay que mirar (pagos sin conciliar,
                              // comprobantes a facturar), no errores.
                              //
                              // Y el rojo venia roto de legibilidad: lo acompanaba
                              // `text-destructive-foreground`, que NO es una variable
                              // del tema de ningun producto -- los `index.css` definen
                              // `--destructive` a secas. La clase no se emite, pero
                              // tailwind-merge igual la toma por clase de color y borra
                              // el `text-sidebar-foreground` de la base, asi que el
                              // numero terminaba heredando el color del sidebar: negro
                              // sobre rojo, 4,15:1 medido en el navegador, debajo del
                              // 4,5 que pide AA para 12 px.
                              //
                              // Los pares hover/activo se pisan a mano porque la base
                              // reasigna el color a `text-sidebar-accent-foreground`
                              // apenas el mouse toca el item.
                              className={cn(
                                'bg-amber-100 font-semibold text-amber-900',
                                'peer-hover/menu-button:text-amber-900 peer-data-[active=true]/menu-button:text-amber-900',
                                'dark:bg-amber-500/20 dark:text-amber-200',
                                'dark:peer-hover/menu-button:text-amber-200 dark:peer-data-[active=true]/menu-button:text-amber-200',
                              )}
                            >
                              {item.badge(user)}
                            </SidebarMenuBadge>
                          )}
                          {children.length > 0 && (
                            <SidebarMenuSub>
                              {children.map((child) => (
                                <SidebarMenuSubItem key={child.to}>
                                  <SidebarMenuSubButton asChild isActive={location.pathname === child.to}>
                                    <NavLink to={child.to}>
                                      {child.icon && <child.icon className="size-4" />}
                                      <span>{child.label}</span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          )}
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          })}
        </SidebarContent>
        <SidebarFooter>
          {/* El nombre del usuario abre un menu, en vez de ser un link (o nada)
              con un boton de salir al lado. Pedido del humano el 2026-08-14 al
              querer meter ahi el selector de sucursal de LibraDesk: el pie del
              sidebar es donde uno busca "lo mio", y hasta ahora lo unico que
              ofrecia era irse.

              El boton de salir suelto se va: quedaba un icono sin rotulo, y era
              la accion mas destructiva de las tres. Adentro del menu tiene
              nombre y hay que abrir para llegar. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{user && getUserName ? initials(getUserName(user)) : (user as { name?: string } | null)?.name ? initials((user as { name: string }).name) : '?'}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                  {FooterContent}
                </span>
              </button>
            </DropdownMenuTrigger>
            {/* `side="top"`: el pie del sidebar esta abajo de todo, y un menu
                que se abriera hacia abajo quedaria fuera de la pantalla. */}
            <DropdownMenuContent side="top" align="start" className="w-60">
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                {user && getUserName ? getUserName(user) : (user as { name?: string } | null)?.name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {userMenu && (
                <>
                  {/* Un `<div>` y no un `DropdownMenuItem`: lo que entra son
                      controles con su propio estado (el selector de sucursal de
                      LibraDesk), y un item se "elige" y cierra el menu.

                      ⚠️ **Falta verificarlo en el navegador con un `<Select>` de
                      Radix adentro.** Radix cierra el menu ante un click de
                      afuera, y el contenido de un `Select` va en un portal —o
                      sea, tecnicamente afuera—, asi que abrir el desplegable
                      podria cerrar el menu que lo contiene. No se puede medir
                      con los stubs de este paquete: hace falta Radix de verdad.
                      Si pasa, la salida conocida es `modal={false}` en el
                      `DropdownMenu`. */}
                  <div className="px-2 py-1.5">
                    {userMenu}
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}

              {accountTo && (
                <DropdownMenuItem asChild>
                  <NavLink to={accountTo}><UserRound />Mi cuenta</NavLink>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setCambiandoPassword(true)}>
                <KeyRound />Cambiar contraseña
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => logout()}>
                <LogOut />Salir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Fuera del menu: si viviera adentro, cerrarlo desmontaria el dialogo
              en el mismo gesto que lo abre. */}
          <CambiarPassword
            open={cambiandoPassword}
            onOpenChange={setCambiandoPassword}
          />
        </SidebarFooter>
      </Sidebar>
    )
  }

  return function Layout({ children }: { children: ReactNode }) {
    return (
      <SidebarProvider>
        <AppSidebar />
        {/* 🔴 `min-w-0` NO es decorativo: sin el, el contenido ancho empuja el
            layout entero en vez de scrollear adentro de su contenedor.

            `SidebarInset` es un item de un flex row, y por lo tanto tiene
            `min-width: auto`, o sea que no puede encogerse por debajo del
            min-content de lo que lleva adentro. Cuando ese min-content supera
            el espacio disponible, el inset se queda con el ancho COMPLETO del
            wrapper y se suma al hueco de 256px de la sidebar: el `<body>`
            termina con 256px de scroll horizontal.

            Medido en `dev.libraclub.com.ar` el 2026-08-20, sobre la agenda
            semanal: inset 1105 sobre una ventana de 1105 y 256px de exceso;
            poniendole `min-width:0` en vivo, el inset pasa a 849 y el exceso a
            CERO, con la grilla ancha scrolleando adentro de su
            `overflow-x-auto` como corresponde.

            El `<main>` de abajo ya tenia su propio `min-w-0` por esta misma
            razon; faltaba el de este nivel. Le pasa a los seis productos, no
            solo al que lo destapo — cualquier pantalla con contenido ancho. */}
        <SidebarInset className="min-w-0">
          {/* Unico resto de la barra vieja: en mobile la sidebar arranca
              cerrada y sin esto no hay como abrirla. En desktop no hace falta
              -- la sidebar esta a la vista y Ctrl/Cmd+B la colapsa. */}
          <SidebarTrigger className="fixed top-2 left-2 z-20 md:hidden" />
          {/* min-w-0 es necesario para que los contenedores de scroll
              horizontal de las tablas (overflow-x-auto) puedan encogerse
              dentro del flex en vez de desbordarlo -- sin esto, una tabla
              ancha empuja el layout entero en vez de scrollear.
              El pt-12 de mobile es el hueco del trigger flotante. */}
          <main className="min-w-0 flex-1 space-y-4 p-4 pt-12 md:p-6 md:pt-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    )
  }
}

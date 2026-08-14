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
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CambiarPassword } from './CambiarPassword'

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
  icon: HeaderIcon, homeTo, accountTo,
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
          {HeaderIcon ? <HeaderIcon className="size-4" /> : productInitial}
        </div>
        <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
          <span className="truncate font-semibold">{productName}</span>
          {getUserSubtitle && user && getUserSubtitle(user) && (
            <span className="truncate text-xs text-muted-foreground">{getUserSubtitle(user)}</span>
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
                            <SidebarMenuBadge className="bg-destructive text-destructive-foreground">
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
                  {/* `onSelect` frenado: adentro hay controles con su propio
                      estado (el selector de sucursal), y el default de Radix es
                      cerrar el menu al primer click — o sea que elegir una
                      opcion cerraria el menu antes de poder elegirla. */}
                  <div
                    className="px-2 py-1.5"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
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
        <SidebarInset>
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

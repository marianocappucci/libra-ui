// v0.3.0 (2026-07-27): generalizado para soportar secciones agrupadas con
// hijos anidados, filtro por modulo, badges, ocultamiento por rol e icono/
// links de header -- necesario para sumar Contalibra/Restolibra (sidebar
// con 9-10 secciones, filtro real por plan/modulo, y en Restolibra
// ocultamiento completo de secciones para el rol "mozo"). Todos los campos
// nuevos son opcionales con default = comportamiento anterior a v0.3.0, asi
// que Gestiolibra/MedLibra/VentaLibra (que llaman
// `createLayout({ productName, productInitial, navItems })` tal cual) no
// cambian de renderizado. Ver wiki/entities/libra-ui.md.
import { type ReactNode, type ComponentType } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

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
  icon: HeaderIcon, homeTo, accountTo, topbar = true,
  hasModule, getUserName, getUserSubtitle,
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
  // Barra superior con el nombre del producto -- default `true`
  // (comportamiento de siempre). Contalibra/Restolibra la sacan
  // (`topbar: false`) y usan un trigger flotante solo en mobile.
  topbar?: boolean
  hasModule?: (user: TUser, module: string) => boolean
  getUserName?: (user: TUser) => string
  getUserSubtitle?: (user: TUser) => string | undefined
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
    const isAdmin = (user as { role?: string } | null)?.role === 'admin'

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
              .filter((item) => (!item.adminOnly || isAdmin) && moduleVisible(item.module))
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
          <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{user && getUserName ? initials(getUserName(user)) : (user as { name?: string } | null)?.name ? initials((user as { name: string }).name) : '?'}</AvatarFallback>
            </Avatar>
            {accountTo ? (
              <NavLink to={accountTo} className="flex flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden hover:underline">
                {FooterContent}
              </NavLink>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                {FooterContent}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="group-data-[collapsible=icon]:hidden"
              onClick={() => logout()}
              title="Salir"
            >
              <LogOut />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
    )
  }

  return function Layout({ children }: { children: ReactNode }) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {topbar ? (
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <span className="text-sm text-muted-foreground">{productName}</span>
            </header>
          ) : (
            <SidebarTrigger className="fixed top-2 left-2 z-20 md:hidden" />
          )}
          {/* min-w-0 es necesario para que los contenedores de scroll
              horizontal de las tablas (overflow-x-auto) puedan encogerse
              dentro del flex en vez de desbordarlo -- sin esto, una tabla
              ancha empuja el layout entero en vez de scrollear. */}
          <main className={topbar ? 'min-w-0 flex-1 space-y-4 p-4 md:p-6' : 'min-w-0 flex-1 space-y-4 p-4 pt-12 md:p-6 md:pt-6'}>{children}</main>
        </SidebarInset>
      </SidebarProvider>
    )
  }
}

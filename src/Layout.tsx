// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era idéntico salvo NAV_ITEMS/branding -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md. `createLayout()`
// recibe esa parte propia de cada producto como config.
import { type ReactNode, type ComponentType } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from './AuthContext'
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

export type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  adminOnly?: boolean
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function createLayout({
  productName, productInitial, navItems,
}: {
  productName: string
  productInitial: string
  navItems: NavItem[]
}) {
  function AppSidebar() {
    const { user, logout } = useAuth()
    const location = useLocation()

    return (
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
              {productInitial}
            </div>
            <span className="font-semibold group-data-[collapsible=icon]:hidden">{productName}</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menú</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.filter((item) => !item.adminOnly || user?.role === 'admin').map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={location.pathname === item.to}>
                      <NavLink to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{user ? initials(user.name) : '?'}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium">{user?.name}</span>
              <span className="truncate text-xs text-muted-foreground capitalize">{user?.role}</span>
            </div>
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
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm text-muted-foreground">{productName}</span>
          </header>
          <main className="flex-1 space-y-4 p-4 md:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    )
  }
}

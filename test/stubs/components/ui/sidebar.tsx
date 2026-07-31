// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Las 17 piezas del sidebar son contenedores de composicion: alcanza con
// rendear HTML semantico y reenviar TODAS las props, incluido `className`,
// que Layout le pasa a varias (lo delato el chequeo de tipos).
import type { ComponentProps } from 'react'

type DivProps = ComponentProps<'div'>
type UlProps = ComponentProps<'ul'>
type LiProps = ComponentProps<'li'>
type SpanProps = ComponentProps<'span'>

// `asChild`/`isActive`/`tooltip` son de shadcn: se aceptan y se descartan
// para que React no avise por atributos desconocidos en el DOM.
type BotonProps = ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string
}

function Boton({ asChild: _a, isActive: _i, tooltip: _t, ...props }: BotonProps) {
  return <button {...props} />
}

export function SidebarProvider(props: DivProps) { return <div {...props} /> }
export function Sidebar({ collapsible: _c, ...props }: DivProps & { collapsible?: string }) {
  return <div {...props} />
}
export function SidebarHeader(props: DivProps) { return <div {...props} /> }
export function SidebarContent(props: DivProps) { return <div {...props} /> }
export function SidebarFooter(props: DivProps) { return <div {...props} /> }
export function SidebarGroup(props: DivProps) { return <div {...props} /> }
export function SidebarGroupContent(props: DivProps) { return <div {...props} /> }
export function SidebarGroupLabel(props: DivProps) { return <div {...props} /> }
export function SidebarInset(props: ComponentProps<'main'>) { return <main {...props} /> }
export function SidebarMenu(props: UlProps) { return <ul {...props} /> }
export function SidebarMenuItem(props: LiProps) { return <li {...props} /> }
export function SidebarMenuButton(props: BotonProps) { return <Boton {...props} /> }
export function SidebarMenuBadge(props: SpanProps) { return <span {...props} /> }
export function SidebarMenuSub(props: UlProps) { return <ul {...props} /> }
export function SidebarMenuSubItem(props: LiProps) { return <li {...props} /> }
export function SidebarMenuSubButton(props: BotonProps) { return <Boton {...props} /> }
export function SidebarTrigger(props: ComponentProps<'button'>) {
  return <button aria-label="Alternar barra lateral" {...props} />
}

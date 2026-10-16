"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "../utils"

// 🔴 `activationMode="manual"` por defecto (2026-10-09): con el automático de Radix, la pestaña que tiene el foco se reactiva
// sola. En las pestañas atadas a la URL (Configuración del kit, Agenda, Cuenta corriente…) el «atrás» del navegador no volvía:
// cambiaba la URL, la pestaña con foco se reactivaba y empujaba de nuevo la suya. Medido en Chromium con radix-ui 1.6.7 y
// 1.7.0; en jsdom recién se ve con 1.7.0. Con manual, las flechas mueven el foco y Enter o Espacio activan (patrón ARIA válido).
//
// Es el archivo que los ocho productos tenían copiado en `components/ui/tabs.tsx`, idéntico byte a byte desde `import * as React`
// (cambiaban sólo el encabezado y el `"use client"`); acá sólo cambia de dónde sale `cn`. ADR-058.
function Tabs({
  className,
  activationMode = "manual",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      activationMode={activationMode}
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

// 🔴 La fila de pestañas se PARTE en renglones cuando no entra (`flex-wrap`, `min-h-9` en vez de `h-9`, `max-w-full`), ADR-067. Antes era
// `h-9 w-fit` sin wrap y cada `TabsTrigger` es `whitespace-nowrap`: las pestañas de Comprobantes, de la bandeja de MercadoPago y de Logs
// medían 579, 670 y 394 px a 390 px de ventana y ensanchaban la página entera (la grilla de la pantalla crece al mínimo de su
// contenido). Seis pantallas lo arreglaban una por una con `className="h-auto flex-wrap"`; las otras no. En un solo renglón mide lo de
// siempre, 36 px (3 + 30 de pestaña + 3); con una insignia de contador adentro de una pestaña son 38, como ya eran en esas seis.
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex min-h-9 w-fit max-w-full flex-wrap items-center justify-center gap-y-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:shadow-sm dark:text-muted-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }

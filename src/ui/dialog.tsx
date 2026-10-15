"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "../utils"

// Es el diálogo que los ocho productos tenían copiado en `components/ui/dialog.tsx` (ADR-064). A diferencia de las pestañas (ADR-058), las copias NO eran
// idénticas: había cinco variantes, y las diferencias eran de dos clases. Las que arreglaban un defecto real (y que sólo tenía algún producto) se juntaron
// acá para todos; las de gusto se resolvieron con la variante de Contalibra y Restolibra, que es la de shadcn/ui actual:
//   - el tope de alto con scroll (`max-h` + `overflow-y-auto`): sin él un diálogo más alto que la pantalla se sale por arriba y por abajo y el pie, con
//     «Guardar» y «Cancelar», queda inalcanzable. Lo tenían LibraCargo, LibraClub, LibraDesk, Contalibra y Restolibra; faltaba en VentaLibra, GestioLibra
//     y MedLibra. Se usa el de Restolibra (`100svh`), que no se corta bajo la barra del navegador del celular;
//   - la X de cerrar de 44 px bajo `lg` (el icono sigue en 16): sólo la tenía VentaLibra (ADR-057 del kit, medido en Chromium: 16×16);
//   - el nombre accesible de la X en castellano: seis productos lo dejaron como lo genera shadcn («Close»). Es «Cerrar ventana» y no «Cerrar» a propósito:
//     muchos diálogos tienen además su propio botón «Cerrar» en el pie, y dos botones con el mismo nombre son ambiguos para un lector de pantalla y para
//     `getByRole('button', { name: 'Cerrar' })` (tres tests del kit lo mostraron al pasar a Radix de verdad);
//   - el ancho: `sm:max-w-lg` y un margen de 1 rem a cada lado en el celular (Contalibra, Restolibra y shadcn). Seis productos tenían `sm:max-w-md` y sin
//     margen. 🔴 Es lo único que se ve distinto en los diálogos de ancho por defecto: una pantalla que quiera otro ancho lo pide con `className`
//     (`cn` es `twMerge`, el último gana).
// `DialogContent` lo usan 50 diálogos de las pantallas del kit; ninguno cambia de estructura.

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // El tope de alto y su scroll viven ACÁ y no en cada pantalla: es el único lugar por el que pasan todos los diálogos. Un modal que necesite otra cosa
          // lo pisa por `className` (un `overflow-hidden` de una pantalla que arma su propio scroll interno le gana a este `overflow-y-auto`).
          "fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100svh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          // Bajo `lg` la X tiene 44 px de área táctil y va a la esquina, así el icono queda donde estaba (a 15 px del borde en vez de 16).
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-hidden disabled:pointer-events-none max-lg:top-0 max-lg:right-0 max-lg:flex max-lg:size-11 max-lg:items-center max-lg:justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Cerrar ventana</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

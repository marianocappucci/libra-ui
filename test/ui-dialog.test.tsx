// El diálogo del kit (`libra-ui/ui/dialog`, 0.152.0, ADR-064): lo que los ocho productos tenían copiado en `components/ui/dialog.tsx`, ahora uno solo.
//
// Corre con el Dialog REAL de Radix (el stub del paquete se borró): lo que se fija es lo que las cinco copias de los productos no tenían todas en común (el tope de alto con scroll,
// la X de 44 px bajo `lg`, su nombre en castellano) y que el kit ya no depende del `dialog` del consumidor.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../src/ui/dialog'

beforeEach(cleanup)

function Ejemplo({ className, showCloseButton }: { className?: string; showCloseButton?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger>Abrir</DialogTrigger>
      <DialogContent className={className} {...(showCloseButton === undefined ? {} : { showCloseButton })}>
        <DialogHeader>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descripción</DialogDescription>
        </DialogHeader>
        <DialogFooter><button type="button">Guardar</button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

async function abrir(props: Parameters<typeof Ejemplo>[0] = {}) {
  const user = userEvent.setup()
  render(<Ejemplo {...props} />)
  await user.click(screen.getByRole('button', { name: 'Abrir' }))
  return { user, dialogo: await screen.findByRole('dialog', { name: 'Título' }) }
}

describe('Dialog: el diálogo del kit', () => {
  it('abre con título y descripción, y lleva los data-slot de shadcn', async () => {
    const { dialogo } = await abrir()
    expect(dialogo).toHaveAccessibleDescription('Descripción')
    for (const slot of ['dialog-content', 'dialog-header', 'dialog-footer', 'dialog-title', 'dialog-description', 'dialog-overlay', 'dialog-close']) {
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull()
    }
  })

  it('🔴 el tope de alto con scroll vive acá: un diálogo más alto que la pantalla no deja afuera «Guardar»', async () => {
    const { dialogo } = await abrir()
    expect(dialogo.className).toContain('max-h-[calc(100svh-2rem)]')
    expect(dialogo.className).toContain('overflow-y-auto')
  })

  it('el ancho: 1 rem de margen en el celular y `sm:max-w-lg` desde sm', async () => {
    const { dialogo } = await abrir()
    expect(dialogo.className).toContain('max-w-[calc(100%-2rem)]')
    expect(dialogo.className).toContain('sm:max-w-lg')
  })

  it('una pantalla pide otro ancho o su propio scroll por `className` y le gana al del kit (twMerge)', async () => {
    const { dialogo } = await abrir({ className: 'sm:max-w-sm overflow-hidden' })
    expect(dialogo.className).toContain('sm:max-w-sm')
    expect(dialogo.className).not.toContain('sm:max-w-lg')
    expect(dialogo.className).toContain('overflow-hidden')
    expect(dialogo.className).not.toContain('overflow-y-auto')
  })

  it('la X de cerrar mide 44 px bajo `lg`, se llama «Cerrar ventana» (no «Close») y cierra', async () => {
    const { user } = await abrir()
    const x = screen.getByRole('button', { name: 'Cerrar ventana' })
    expect(x.className).toContain('max-lg:size-11')
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    await user.click(x)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('«Cerrar ventana» no choca con un botón «Cerrar» del pie: buscar «Cerrar» a secas sigue dando uno solo', async () => {
    const user = userEvent.setup()
    render(
      <Dialog defaultOpen>
        <DialogContent><DialogTitle>Resultado</DialogTitle><DialogFooter><button type="button">Cerrar</button></DialogFooter></DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar ventana' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument() // el botón del pie es del producto: no cierra solo
  })

  it('`showCloseButton={false}` saca la X', async () => {
    await abrir({ showCloseButton: false })
    expect(screen.queryByRole('button', { name: 'Cerrar ventana' })).toBeNull()
  })

  it('Escape cierra y devuelve el foco al que lo abrió', async () => {
    const { user } = await abrir()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })
})

describe('el kit usa su propio diálogo', () => {
  const SRC = resolve(__dirname, '..', 'src')
  function fuentes(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fuentes(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []))
  }

  it('🔴 ningún fuente importa `@/components/ui/dialog` del consumidor', () => {
    const que = fuentes(SRC).filter((f) => /@\/components\/ui\/dialog['"]/.test(readFileSync(f, 'utf8')))
    expect(que.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })
})

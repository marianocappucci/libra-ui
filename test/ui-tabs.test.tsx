// El primitivo de pestañas del kit (`libra-ui/ui/tabs`, 0.146.0, ADR-058): `activationMode="manual"` por defecto.
//
// Es el arreglo del 2026-10-09: con el modo automático de Radix, la pestaña que tiene el foco se reactiva sola cuando cambia la URL, y en las pestañas atadas a la URL
// (Configuración, Agenda, Cuenta corriente…) el «atrás» del navegador no volvía. Hasta acá lo tenía copiado cada producto en su `components/ui/tabs.tsx`.
// Ese «atrás» sólo se reproduce en un navegador (se midió en Chromium); acá se fija lo que sí se ve en jsdom y distingue los dos modos: que las flechas muevan el foco sin activar.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/ui/tabs'

beforeEach(cleanup)

function Pestanas({ activationMode }: { activationMode?: 'automatic' | 'manual' }) {
  return (
    <Tabs defaultValue="uno" {...(activationMode ? { activationMode } : {})}>
      <TabsList aria-label="Secciones">
        <TabsTrigger value="uno">Uno</TabsTrigger>
        <TabsTrigger value="dos">Dos</TabsTrigger>
        <TabsTrigger value="tres">Tres</TabsTrigger>
      </TabsList>
      <TabsContent value="uno">Contenido uno</TabsContent>
      <TabsContent value="dos">Contenido dos</TabsContent>
      <TabsContent value="tres">Contenido tres</TabsContent>
    </Tabs>
  )
}

const activa = () => screen.getByRole('tab', { selected: true }).textContent

describe('Tabs: activación manual por defecto', () => {
  it('🔴 las flechas mueven el foco pero NO activan la pestaña; Enter la activa', async () => {
    const user = userEvent.setup()
    render(<Pestanas />)
    await user.click(screen.getByRole('tab', { name: 'Uno' }))
    expect(activa()).toBe('Uno')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveFocus()
    expect(activa()).toBe('Uno')
    expect(screen.getByText('Contenido uno')).toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(activa()).toBe('Dos')
    expect(screen.getByText('Contenido dos')).toBeInTheDocument()
    expect(screen.queryByText('Contenido uno')).toBeNull()
  })

  it('el Espacio también activa', async () => {
    const user = userEvent.setup()
    render(<Pestanas />)
    await user.click(screen.getByRole('tab', { name: 'Uno' }))
    await user.keyboard('{ArrowRight}{ArrowRight} ')
    expect(activa()).toBe('Tres')
  })

  it('el control — con `activationMode="automatic"` las flechas SÍ activan (el defecto mide algo)', async () => {
    const user = userEvent.setup()
    render(<Pestanas activationMode="automatic" />)
    await user.click(screen.getByRole('tab', { name: 'Uno' }))
    await user.keyboard('{ArrowRight}')
    expect(activa()).toBe('Dos')
  })

  it('lleva los data-slot de shadcn y el contenido inactivo no está en el DOM', () => {
    const { container } = render(<Pestanas />)
    for (const slot of ['tabs', 'tabs-list', 'tabs-trigger', 'tabs-content']) expect(container.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull()
    expect(screen.queryByText('Contenido dos')).toBeNull()
  })
})

describe('el kit usa su propio primitivo de pestañas', () => {
  const SRC = resolve(__dirname, '..', 'src')
  function fuentes(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fuentes(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []))
  }

  it('🔴 ningún fuente importa `@/components/ui/tabs` del consumidor', () => {
    const archivos = fuentes(SRC)
    expect(archivos.length).toBeGreaterThan(50)
    expect(archivos.filter((f) => /from\s+['"]@\/components\/ui\/tabs['"]/.test(readFileSync(f, 'utf8')))).toEqual([])
  })

  it('el control — y sí lo importan de `ui/tabs` (la pantalla de Configuración, entre otras)', () => {
    expect(readFileSync(join(SRC, 'Configuracion.tsx'), 'utf8')).toMatch(/from\s+'\.\/ui\/tabs'/)
  })
})

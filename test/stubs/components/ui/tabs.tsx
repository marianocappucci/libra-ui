// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
//
// Lo unico que SI imita, porque de eso dependen los tests: el contenido de
// la pestana inactiva NO esta en el DOM. Radix desmonta el `TabsContent`
// que no esta activo salvo `forceMount`, y un stub que rendeara las dos a
// la vez dejaria pasar tests que en el navegador no encuentran nada.
import type { ReactNode } from 'react'

import { createContext, useContext, useState } from 'react'

const TabsCtx = createContext<{
  value: string
  setValue: (v: string) => void
}>({ value: '', setValue: () => {} })

// Los DOS modos, no sólo el no-controlado: `Logs` usa `defaultValue` y
// `Configuracion` usa `value` + `onValueChange`, porque su sección activa sale
// de la URL. Un stub que ignorara `value` dejaría pasar un conmutador que se
// pinta solo y nunca escucha a quien lo controla — que en `Configuracion` es
// exactamente el defecto que importa (entrar con `?seccion=datos` y ver
// resaltada la primera pestaña).
export function Tabs({ defaultValue = '', value, onValueChange, children }: {
  defaultValue?: string
  value?: string
  onValueChange?: (v: string) => void
  className?: string
  children?: ReactNode
}) {
  const [interno, setInterno] = useState(defaultValue)
  const controlado = value !== undefined
  return (
    <TabsCtx.Provider
      value={{
        value: controlado ? value : interno,
        setValue: (v) => { if (!controlado) setInterno(v); onValueChange?.(v) },
      }}
    >
      <div>{children}</div>
    </TabsCtx.Provider>
  )
}

export function TabsList({ children }: { className?: string; children?: ReactNode }) {
  return <div role="tablist">{children}</div>
}

export function TabsTrigger({ value, children }: {
  value: string
  className?: string
  children?: ReactNode
}) {
  const { value: activa, setValue } = useContext(TabsCtx)
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa === value}
      onClick={() => setValue(value)}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children }: {
  value: string
  className?: string
  children?: ReactNode
}) {
  const { value: activa } = useContext(TabsCtx)
  if (activa !== value) return null
  return <div role="tabpanel">{children}</div>
}

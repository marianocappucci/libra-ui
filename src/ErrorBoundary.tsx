// La pantalla de «Algo falló» (ADR-053).
//
// Sin esto, un error al RENDERIZAR desmonta toda la aplicación y el usuario queda frente a una pantalla en blanco, sin
// una palabra y sin saber qué hacer. Con esto ve que algo falló, qué hacer (recargar) y —si el backend le puso un
// código— el `ref` que puede dictarle a soporte para que encuentre su error en el registro de la instancia.
//
//   createRoot(el).render(<ErrorBoundary><App /></ErrorBoundary>)       // en main.tsx
//
// Un error de render es un defecto de la aplicación, así que además se reporta (`reportarError`, que no hace nada si
// el producto no llamó a `instalarReporteDeErrores`). Un `ApiError` no se reporta —es una respuesta del servidor— pero
// sí muestra su `ref`: un 500 que reventó una pantalla (por ejemplo con `throwOnError`) lo trae.
//
// Es una clase porque React no tiene otra forma de atrapar errores de render.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from './api-client'
import { reportarError } from './errores-del-navegador'

export type ErrorBoundaryProps = {
  children: ReactNode
  /** Qué hacer al apretar «Recargar». Por defecto, recargar la página (los tests lo reemplazan). */
  alRecargar?: () => void
}

type Estado = { error: unknown; hayError: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, Estado> {
  state: Estado = { error: null, hayError: false }

  static getDerivedStateFromError(error: unknown): Estado {
    return { error, hayError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportarError(error, { componentStack: info.componentStack ?? undefined })
  }

  render() {
    if (!this.state.hayError) return this.props.children
    const { error } = this.state
    const ref = error instanceof ApiError ? error.ref : undefined
    const recargar = this.props.alRecargar ?? (() => window.location.reload())
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4" role="alert">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <TriangleAlert className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle>Algo falló.</CardTitle>
            <CardDescription>Recargá la página.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button onClick={recargar}>Recargar</Button>
            {ref && (
              <p className="text-center text-xs text-muted-foreground">
                Si el problema sigue, avisá este código: <span className="font-mono">{ref}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }
}

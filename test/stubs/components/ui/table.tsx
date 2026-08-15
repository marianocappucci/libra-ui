// Stub de shadcn para los tests de este paquete -- ver vitest.config.ts.
// Rendea HTML semantico y reenvia props; no imita estilos ni estructura
// interna, que son de la libreria y tienen sus propios tests.
import type { ComponentProps } from 'react'

export function Table(props: ComponentProps<'table'>) {
  return <table {...props} />
}
export function TableHeader(props: ComponentProps<'thead'>) {
  return <thead {...props} />
}
export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />
}
export function TableRow(props: ComponentProps<'tr'>) {
  return <tr {...props} />
}
export function TableHead(props: ComponentProps<'th'>) {
  return <th {...props} />
}
export function TableCell(props: ComponentProps<'td'>) {
  return <td {...props} />
}

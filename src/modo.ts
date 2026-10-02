// El modo claro / oscuro de la suite (ADR-009, `v0.97.0`). Cada producto ya trae los tokens `.dark` de shadcn en su `index.css`; lo que
// faltaba era quien pusiera la clase. Se elige por navegador (no por usuario ni por suite: es una preferencia de quien mira la pantalla) y
// se guarda en `localStorage`. El defecto es **claro**, como hasta ahora: nadie ve un cambio hasta que lo elige.

export const MODOS = ['claro', 'oscuro', 'sistema'] as const
export type Modo = (typeof MODOS)[number]

export const CLAVE_DE_MODO = 'libra.modo'

export function esModo(v: unknown): v is Modo {
  return typeof v === 'string' && (MODOS as readonly string[]).includes(v)
}

/** El modo guardado, o `claro` si no hay (o no hay almacenamiento). */
export function leerModo(): Modo {
  try {
    const v = window.localStorage.getItem(CLAVE_DE_MODO)
    return esModo(v) ? v : 'claro'
  } catch {
    return 'claro'
  }
}

function sistemaEsOscuro(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Pone o saca la clase `dark` de `<html>` (y `color-scheme`, para las barras de scroll y los controles nativos). No guarda nada. */
export function aplicarModo(modo: Modo, elemento: HTMLElement = document.documentElement): void {
  const oscuro = modo === 'oscuro' || (modo === 'sistema' && sistemaEsOscuro())
  elemento.classList.toggle('dark', oscuro)
  elemento.style.colorScheme = oscuro ? 'dark' : 'light'
}

const oyentes = new Set<(modo: Modo) => void>()

/** Cambia el modo: lo aplica, lo guarda y avisa a quien lo muestre. */
export function fijarModo(modo: Modo): void {
  try {
    window.localStorage.setItem(CLAVE_DE_MODO, modo)
  } catch {
    // Sin almacenamiento el modo rige hasta recargar.
  }
  aplicarModo(modo)
  oyentes.forEach((o) => o(modo))
}

export function suscribirseAlModo(oyente: (modo: Modo) => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

let escuchaElSistema = false

/** Aplica el modo guardado y, con `sistema`, sigue los cambios del sistema operativo. Lo llama `cargarTema` (o el `main.tsx`, antes de
 *  montar React); es idempotente. */
export function iniciarModo(): Modo {
  if (typeof window === 'undefined') return 'claro'
  const modo = leerModo()
  aplicarModo(modo)
  if (!escuchaElSistema && typeof window.matchMedia === 'function') {
    escuchaElSistema = true
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (leerModo() === 'sistema') aplicarModo('sistema')
    })
  }
  return modo
}

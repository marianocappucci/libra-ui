// Una entrada del menú también se marca en las rutas de `activoEn` (y debajo de ellas).
// Lo pidió una sección con pestañas que abre pantallas con rutas propias: las pre facturas
// de LibraCargo viven dentro de "Comprobantes", y entrar al detalle dejaba el menú sin nada marcado.
// El `Layout` usa esta función para `isActive` de cada entrada y de cada hijo.
import { describe, expect, it } from 'vitest'
import { estaActivo } from '../src/Layout'

describe('estaActivo', () => {
  it('la ruta exacta', () => {
    expect(estaActivo('/comprobantes', '/comprobantes')).toBe(true)
    expect(estaActivo('/comprobantes/facturar', '/comprobantes')).toBe(false)
  })
  it('una ruta de activoEn, ella misma y lo que cuelga', () => {
    const en = ['/pre-facturas', '/comprobantes/']
    expect(estaActivo('/pre-facturas', '/comprobantes', en)).toBe(true)
    expect(estaActivo('/pre-facturas/7/editar', '/comprobantes', en)).toBe(true)
    expect(estaActivo('/comprobantes/facturar', '/comprobantes', en)).toBe(true)
  })
  it('no confunde un prefijo de texto con una ruta', () => {
    expect(estaActivo('/pre-facturas-viejas', '/comprobantes', ['/pre-facturas'])).toBe(false)
  })
})

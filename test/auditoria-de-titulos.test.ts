// El guard que audita los títulos, auditado.
//
// 🔴 **Los dos parsers leen TSX con expresiones regulares y su forma de fallar
// es devolver cero**, que sin control se lee como "no hay desajustes". Los dos
// casos de acá abajo NO son hipotéticos: son los dos bugs que este guard tuvo
// mientras se escribía, el 2026-08-21, y los dos daban un informe tranquilizador
// y falso.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  auditarTitulos, describirDesajustes, iconoDelTitulo, iconosDelNav, resolverAlias,
  rutasDelRouter,
} from '../src/auditoria-de-titulos'

const NAV = `
const NAV_SECTIONS: NavSection<User>[] = [
  { items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Ventas',
    items: [
      { to: '/facturas', label: 'Comprobantes', icon: Receipt, module: 'facturacion' },
      {
        to: '/clientes', label: 'Clientes', icon: Users, module: 'clientes',
        children: [{ to: '/cuenta-corriente', label: 'Cuenta Corriente', module: 'cuenta_corriente', icon: BookOpen }],
      },
    ],
  },
]`

describe('iconosDelNav', () => {
  it('🔴 toma el icono del MISMO objeto, no el del vecino', () => {
    // El bug real: una ventana centrada en el `to:` alcanzaba al `icon:` de la
    // entrada de al lado. `/clientes` daba `FileText` —el icono de otra fila—
    // cuando el fuente dice `Users`, y el informe marcaba como desajuste 38 de
    // 42 pantallas que en realidad estaban bien.
    const nav = iconosDelNav(NAV)
    expect(nav.get('/dashboard')).toBe('LayoutDashboard')
    expect(nav.get('/facturas')).toBe('Receipt')
    expect(nav.get('/clientes')).toBe('Users')
  })

  it('entra a los `children`, que son entradas del menú igual', () => {
    expect(iconosDelNav(NAV).get('/cuenta-corriente')).toBe('BookOpen')
  })

  it('el control — mide algo', () => {
    // Sin esto, un parser que devolviera un mapa vacío pasaría los `toBe`
    // de arriba como `undefined !== 'Users'`… no: los haría fallar. Pero un
    // parser que devolviera el mapa a medias sí pasaría desapercibido.
    expect(iconosDelNav(NAV).size).toBe(4)
    expect(iconosDelNav('').size).toBe(0)
  })
})

const APP = `
      <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
      <Route path="/ventas" element={<StandaloneRoute><Ventas /></StandaloneRoute>} />
      <Route path="/stock" element={<Stock />} />
`

describe('rutasDelRouter', () => {
  it('🔴 saltea los envoltorios y llega a la pantalla', () => {
    // El otro bug real: sin saltear `ProtectedRoute`, seis de los ocho
    // productos devolvían `ProtectedRoute` para TODAS sus rutas, el guard no
    // encontraba ningún archivo de pantalla y el informe salía sin un solo
    // desajuste.
    const r = rutasDelRouter(APP)
    expect(r.get('/clientes')).toBe('Clientes')
    expect(r.get('/ventas')).toBe('Ventas')
    expect(r.get('/stock')).toBe('Stock')
  })

  it('el control — no inventa rutas', () => {
    expect(rutasDelRouter('').size).toBe(0)
  })
})

describe('iconoDelTitulo', () => {
  it('lo encuentra en la forma nueva', () => {
    expect(iconoDelTitulo('<TituloPantalla icono={Users}>Clientes</TituloPantalla>'))
      .toEqual({ icono: 'Users', forma: 'TituloPantalla' })
  })

  it('lo encuentra en la forma escrita a mano', () => {
    const viejo = '<h2 className="flex items-center gap-2 text-lg font-semibold"><Package className="size-5" />Productos</h2>'
    expect(iconoDelTitulo(viejo)).toEqual({ icono: 'Package', forma: 'h a mano' })
  })

  it('distingue «sin icono» de «sin título»', () => {
    // No es lo mismo: una pantalla sin título no es un desajuste que arreglar
    // acá, y contarla como tal manda a buscar un icono a un archivo que no
    // tiene dónde ponerlo.
    expect(iconoDelTitulo('<h2 className="text-lg">Remito 0001</h2>').forma).toBe('título SIN icono')
    expect(iconoDelTitulo('<div>nada</div>').forma).toBe('sin título')
  })
})

describe('resolverAlias', () => {
  it('🔴 resuelve el `as` de un import', () => {
    // El tercer bug real: LibraDesk importa `{ Activos as IconoActivos }` y el
    // guard marcaba `IconoActivos ≠ Activos` en dos pantallas que usaban
    // exactamente el icono correcto. Un guard que inventa trabajo se ignora, y
    // ahí deja de servir para el trabajo de verdad.
    const fuente = "import { Activos as IconoActivos, PackageSearch as IconoStock } from '@/components/iconos'"
    expect(resolverAlias(fuente, 'IconoActivos')).toBe('Activos')
    expect(resolverAlias(fuente, 'IconoStock')).toBe('PackageSearch')
  })

  it('deja igual lo que no tiene alias', () => {
    expect(resolverAlias("import { Users } from 'lucide-react'", 'Users')).toBe('Users')
  })

  it('el control — no matchea un nombre que sólo lo contiene', () => {
    // `Stock` no debe resolverse por la línea de `IconoStock`.
    const fuente = "import { PackageSearch as IconoStock } from 'x'"
    expect(resolverAlias(fuente, 'Stock')).toBe('Stock')
  })
})

describe('auditarTitulos, de punta a punta', () => {
  // Se arma un producto de mentira en disco: es la unica forma de ejercitar la
  // lectura de archivos, que es justo donde el guard falla en silencio (un
  // archivo que no existe devuelve '' y la pantalla desaparece del informe sin
  // que nada avise).
  let raiz: string

  beforeAll(() => {
    raiz = mkdtempSync(join(tmpdir(), 'auditoria-'))
    mkdirSync(join(raiz, 'components'), { recursive: true })
    mkdirSync(join(raiz, 'pages'), { recursive: true })
    writeFileSync(join(raiz, 'components', 'Layout.tsx'), `
      const NAV = [
        { to: '/clientes', label: 'Clientes', icon: Users },
        { to: '/stock', label: 'Stock', icon: Boxes },
        { to: '/remitos', label: 'Remitos', icon: FileText },
        { to: '/config', label: 'Config', icon: Settings },
        { to: '/sin-pantalla', label: 'Huerfana', icon: Ghost },
      ]`)
    writeFileSync(join(raiz, 'App.tsx'), `
      <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
      <Route path="/clientes/:id" element={<ProtectedRoute><ClienteDetalle /></ProtectedRoute>} />
      <Route path="/stock" element={<ProtectedRoute><Stock /></ProtectedRoute>} />
      <Route path="/remitos/:id" element={<ProtectedRoute><RemitoDetalle /></ProtectedRoute>} />
      <Route path="/config" element={<ProtectedRoute><Config /></ProtectedRoute>} />
      <Route path="/fuera-del-nav" element={<ProtectedRoute><Suelta /></ProtectedRoute>} />`)

    // Cumple.
    writeFileSync(join(raiz, 'pages', 'Clientes.tsx'),
      "import { Users } from 'lucide-react'\n<TituloPantalla icono={Users}>Clientes</TituloPantalla>")
    // El detalle hereda el icono de su entrada del menu: tambien cumple.
    writeFileSync(join(raiz, 'pages', 'ClienteDetalle.tsx'),
      "import { Users } from 'lucide-react'\n<TituloPantalla icono={Users}>Cliente</TituloPantalla>")
    // Icono equivocado.
    writeFileSync(join(raiz, 'pages', 'Stock.tsx'),
      "import { Archive } from 'lucide-react'\n<TituloPantalla icono={Archive}>Stock</TituloPantalla>")
    // Titulo sin icono.
    writeFileSync(join(raiz, 'pages', 'RemitoDetalle.tsx'), '<h2 className="text-lg">Remito</h2>')
    // Sin titulo propio: NO es un pendiente.
    writeFileSync(join(raiz, 'pages', 'Config.tsx'), '<div>panel</div>')
  })

  afterAll(() => rmSync(raiz, { recursive: true, force: true }))

  it('🔴 clasifica cada pantalla donde corresponde', () => {
    const a = auditarTitulos(raiz)
    expect(a.conIcono).toBe(2)
    expect(a.distinto.map((d) => d.pantalla)).toEqual(['Stock'])
    expect(a.sinIcono.map((d) => d.pantalla)).toEqual(['RemitoDetalle'])
    expect(a.sinTitulo.map((d) => d.pantalla)).toEqual(['Config'])
  })

  it('🔴 el control — dice cuánto midió, no sólo qué encontró mal', () => {
    // Sin esto, un parser roto que devolviera todo vacío pasaría los `toEqual`
    // de listas vacías del test de un producto ya normalizado.
    const a = auditarTitulos(raiz)
    expect(a.rutasDelNav).toBe(5)
    expect(a.pantallas).toBe(5)
  })

  it('la ruta que no está en el menú no se cuenta', () => {
    // `/fuera-del-nav` no tiene entrada: no es un desajuste, es una pantalla
    // que se llega por link. Y `/sin-pantalla` está en el menú sin ruta.
    const a = auditarTitulos(raiz)
    expect([...a.distinto, ...a.sinIcono, ...a.sinTitulo].map((d) => d.pantalla))
      .not.toContain('Suelta')
  })

  it('el control negativo — un directorio vacío no inventa nada', () => {
    const vacio = mkdtempSync(join(tmpdir(), 'auditoria-vacia-'))
    const a = auditarTitulos(vacio)
    expect(a).toMatchObject({ rutasDelNav: 0, pantallas: 0, conIcono: 0 })
    rmSync(vacio, { recursive: true, force: true })
  })
})

describe('describirDesajustes', () => {
  it('dice qué pantalla y qué icono, para poder arreglarlo sin investigar', () => {
    expect(describirDesajustes([
      { ruta: '/stock', pantalla: 'Stock', titulo: 'Archive', sidebar: 'Boxes', forma: 'h a mano' },
    ])).toEqual(['/stock (Stock): título=Archive, sidebar=Boxes'])
  })

  it('nombra la forma cuando no hay icono', () => {
    expect(describirDesajustes([
      { ruta: '/remitos/:id', pantalla: 'RemitoDetalle', titulo: null, sidebar: 'FileText', forma: 'título SIN icono' },
    ])).toEqual(['/remitos/:id (RemitoDetalle): título=título SIN icono, sidebar=FileText'])
  })
})

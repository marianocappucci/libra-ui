// El guard de que todo desplegable de datos se busca escribiendo (ADR-039), corrido sobre el propio kit.
//
// 🔴 Lo que se prueba acá es la regla —«un desplegable cuyas opciones arma el código es SelectBuscable»—, no el nombre de la pantalla que lo
// tenía: la próxima que muestre una lista de clientes con un `<Select>` va a ser otra. Lee el FUENTE en vez de renderizar, por lo mismo que
// `campo-archivo-unico` y `indicadores-por-catalogo`: son decenas de pantallas, muchas detrás de una sesión.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  MARCA_CERRADO, MAX_CERRADO, auditarSelects, desplegablesEn, describirInfracciones, infraccionDe, leerOpciones, sinComentarios,
} from '../src/auditoria-de-selects'

const SRC = resolve(__dirname, '..', 'src')

/** Un `<Select>` de shadcn con lo que se le ponga adentro, como lo escribe cualquier pantalla. */
const shadcn = (hijos: string, antes = '') => `${antes}
<Select value={v} onValueChange={setV}>
  <SelectTrigger className="w-48"><SelectValue placeholder="Elegí…" /></SelectTrigger>
  <SelectContent>${hijos}</SelectContent>
</Select>`

describe('el guard de selects sobre el propio kit', () => {
  const r = auditarSelects(SRC)

  it('midió algo: el control positivo (si no, una lista vacía de infracciones no probaría nada)', () => {
    expect(r.archivos).toBeGreaterThanOrEqual(100)
    // Los selects de datos del kit pasaron a SelectBuscable, pero los cerrados siguen: el guard tiene que verlos.
    expect(r.desplegables).toBeGreaterThanOrEqual(25)
    expect(r.shadcn).toBe(r.desplegables - r.nativos)
  })

  it('🔴 ningún desplegable de datos del kit es un Select sin búsqueda', () => {
    expect(describirInfracciones(r.infracciones)).toEqual([])
  })

  it('el kit no tiene ningún <select> nativo', () => {
    expect(r.nativos).toBe(0)
  })

  it('cada marca «select-cerrado» del kit dice por qué (y se cuentan, para que no se abuse)', () => {
    const marcados = r.todos.filter((d) => d.marca !== undefined)
    expect(marcados.every((d) => d.marca !== '')).toBe(true)
    expect(r.marcados).toBe(marcados.length)
    // Una marca por cada lista que sale de una constante del código. Si el número sube, es una decisión que se mira en la revisión.
    expect(r.marcados).toBeLessThanOrEqual(25)
  })

  it('el guard falla con una violación: un <Select> de clientes agregado a un fuente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'libra-ui-selects-'))
    try {
      mkdirSync(join(dir, 'pantallas'))
      writeFileSync(join(dir, 'pantallas', 'Nueva.tsx'), shadcn('{clientes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}', '<Label>Cliente</Label>'))
      const roto = auditarSelects(dir)
      expect(roto.desplegables).toBe(1)
      const mensajes = describirInfracciones(roto.infracciones)
      expect(mensajes).toHaveLength(1)
      expect(mensajes[0]).toContain('pantallas/Nueva.tsx:2')
      expect(mensajes[0]).toContain('SelectBuscable')
      expect(mensajes[0]).toContain('clientes')
      expect(mensajes[0]).toContain('Cliente')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

})

describe('qué es un desplegable de datos', () => {
  it.each([
    ['un .map', '{cajas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}', 'cajas'],
    ['un .map en varias líneas', '{\n  listas\n    .filter((l) => l.activa)\n    .map((l) => (\n      <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>\n    ))\n}', 'listas.filter(…)'],
    ['un .map con opcional', '{data?.usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}', 'data?.usuarios'],
    ['un Object.entries', '{Object.entries(ESTADOS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}', 'Object.entries(ESTADOS)'],
    ['una constante', '{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}', 'ESTADOS'],
    ['un fijo más un .map', '<SelectItem value="">Todas</SelectItem>{categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}', 'categorias'],
    ['una variable suelta', '{items}', 'items'],
    ['una llamada', '{renderItems()}', '(llamada)'],
    ['un componente propio', '<OpcionesDeClientes />', '(componente)'],
    ['un condicional con .map adentro', '{hay && cajas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}', 'cajas'],
  ])('%s', (_n, hijos, lista) => {
    const [d] = desplegablesEn(shadcn(hijos), 'x.tsx')
    expect(d.origen).toBe('datos')
    expect(d.lista).toBe(lista)
    expect(infraccionDe(d)?.razon).toBe('datos')
  })

  it('sigue siendo de datos aunque tenga un FormControl y las clases con cn(…) y flechas del disparador', () => {
    const [d] = desplegablesEn(`
<Select value={field.value} onValueChange={(v) => field.onChange(v)}>
  <FormControl><SelectTrigger className={cn('w-48', x > 3 && 'h-11')}><SelectValue /></SelectTrigger></FormControl>
  <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>{cajas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
</Select>`)
    expect(d.origen).toBe('datos')
  })
})

describe('qué es un desplegable cerrado', () => {
  it('opciones escritas a mano, hasta 8: estado, tipo, sí/no', () => {
    const items = Array.from({ length: MAX_CERRADO }, (_, i) => `<SelectItem value="${i}">Opción ${i}</SelectItem>`).join('')
    const [d] = desplegablesEn(shadcn(items))
    expect(d).toMatchObject({ origen: 'fijo', opciones: MAX_CERRADO })
    expect(infraccionDe(d)).toBeNull()
  })

  it('más de 8 opciones fijas se buscan igual que las de datos (provincias, meses)', () => {
    const items = Array.from({ length: MAX_CERRADO + 1 }, (_, i) => `<SelectItem value="${i}">Mes ${i}</SelectItem>`).join('')
    const [d] = desplegablesEn(shadcn(items))
    expect(infraccionDe(d)).toMatchObject({ razon: 'muchas' })
  })

  it('un condicional de ítems fijos sigue siendo cerrado', () => {
    const [d] = desplegablesEn(shadcn('<SelectItem value="a">A</SelectItem>{conPremium && <SelectItem value="p">Premium</SelectItem>}'))
    expect(d.origen).toBe('fijo')
    expect(infraccionDe(d)).toBeNull()
  })

  it('un ítem con contenido propio (un punto de color) y una expresión de texto no lo vuelven de datos', () => {
    const [d] = desplegablesEn(shadcn('<SelectItem value="a"><span className={`dot ${c}`} />{ETIQUETA.a}</SelectItem><SelectItem value="b">B</SelectItem>'))
    expect(d.origen).toBe('fijo')
  })

  it('un <select> nativo se juzga igual: cerrado pasa, de datos no', () => {
    const [cerrado] = desplegablesEn('<select value={v}><option value="a">A</option><option value="b">B</option></select>')
    expect(cerrado).toMatchObject({ tipo: 'nativo', origen: 'fijo', opciones: 2 })
    expect(infraccionDe(cerrado)).toBeNull()

    const [datos] = desplegablesEn('<select value={v}>{fleteros.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>')
    expect(datos).toMatchObject({ tipo: 'nativo', origen: 'datos', lista: 'fleteros' })
    expect(infraccionDe(datos)?.razon).toBe('datos')
  })

  it('`prohibirNativos` marca también el nativo cerrado', () => {
    const [cerrado] = desplegablesEn('<select><option value="a">A</option></select>')
    expect(infraccionDe(cerrado, { prohibirNativos: true })?.razon).toBe('nativo')
  })
})

describe('la excepción explícita: «select-cerrado: <motivo>»', () => {
  const conMarca = (comentario: string) => shadcn('{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}', comentario)

  it('con motivo, en el renglón de arriba, deja pasar una lista de una constante', () => {
    const [d] = desplegablesEn(conMarca(`{/* ${MARCA_CERRADO}: los cuatro estados del turno, fijos en el código */}`))
    expect(d.marca).toBe('los cuatro estados del turno, fijos en el código')
    expect(infraccionDe(d)).toBeNull()
  })

  it('también como comentario de línea', () => {
    const [d] = desplegablesEn(conMarca(`// ${MARCA_CERRADO}: tipos de cuenta`))
    expect(infraccionDe(d)).toBeNull()
  })

  it('sin motivo no vale: es una infracción más, que dice cómo arreglarla', () => {
    const [d] = desplegablesEn(conMarca(`{/* ${MARCA_CERRADO} */}`))
    expect(d.marca).toBe('')
    const i = infraccionDe(d)
    expect(i?.razon).toBe('marca-sin-motivo')
    expect(describirInfracciones([i!])[0]).toContain('escribí el motivo')
  })

  it('una marca lejos (más de tres renglones) no se la lleva un select que no es el suyo', () => {
    const lejos = `// ${MARCA_CERRADO}: de otro\n\n\n\n\n${conMarca('')}`
    const [d] = desplegablesEn(lejos)
    expect(d.marca).toBeUndefined()
    expect(infraccionDe(d)?.razon).toBe('datos')
  })
})

describe('lo que el lector no confunde', () => {
  it('SelectBuscable y SelectItem no son un <Select>', () => {
    expect(desplegablesEn('<SelectBuscable value={v} onChange={set} opciones={o} />\n<SelectItem value="a">A</SelectItem>')).toEqual([])
  })

  it('un <Select> en un comentario o en un docstring no cuenta', () => {
    expect(desplegablesEn('// el <Select value={v}>…</Select> de antes\n/* y este <select> también */')).toEqual([])
  })

  it('un <Select /> autocerrado o sin cierre no rompe el recorrido', () => {
    expect(desplegablesEn('<Select value={v} />')).toEqual([])
    expect(desplegablesEn('const a = <Select value={v}>')).toEqual([])
  })

  it('el renglón del hallazgo es el del `<Select` aunque haya comentarios multilínea antes', () => {
    const [d] = desplegablesEn(`/* uno\n dos\n tres */\n\n${shadcn('<SelectItem value="a">A</SelectItem>')}`)
    expect(d.linea).toBe(6)
  })

  it('la pista dice qué elige: la etiqueta de al lado, el aria-label o el placeholder', () => {
    expect(desplegablesEn(shadcn('<SelectItem value="a">A</SelectItem>', '<Label htmlFor="x">Condición de IVA</Label>'))[0].pista).toBe('Condición de IVA')
    expect(desplegablesEn('<Select value={v}><SelectTrigger aria-label="Depósito"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="a">A</SelectItem></SelectContent></Select>')[0].pista).toBe('Depósito')
    expect(desplegablesEn('<Select value={v}><SelectTrigger><SelectValue placeholder="Elegí un rubro…" /></SelectTrigger><SelectContent><SelectItem value="a">A</SelectItem></SelectContent></Select>')[0].pista).toBe('Elegí un rubro…')
  })

  it('una etiqueta que envuelve al desplegable lo nombra', () => {
    const [d] = desplegablesEn('<label>Deporte <select value={v}><option value="a">A</option></select></label>')
    expect(d.pista).toBe('Deporte')
  })

  it('los comentarios se blanquean sin mover un solo carácter', () => {
    const f = 'a /* x\ny */ b\n// c\nd'
    expect(sinComentarios(f)).toHaveLength(f.length)
    expect(sinComentarios(f).split('\n')).toHaveLength(f.split('\n').length)
  })

  it('leerOpciones, sin nada adentro, no inventa datos', () => {
    expect(leerOpciones('')).toEqual({ literales: 0, datos: false })
  })
})

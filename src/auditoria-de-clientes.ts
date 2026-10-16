/** El guard de que todo campo donde se elige un cliente ofrece darlo de alta ahí mismo (ADR-071). Uno para toda la suite.
 *
 *  **La regla.** Un desplegable que elige un cliente —por su `value`, su `aria-label`, sus `opciones` o la etiqueta de al lado— tiene que ser
 *  `SelectCliente` (libra-ui/SelectCliente), que es el buscador de siempre con el botón «Agregar nuevo cliente» al lado. El humano lo pidió así el
 *  2026-10-16: que no vuelva a pasar lo del mostrador de LibraDesk, donde un cliente que no estaba cargado no se podía elegir y había que salir
 *  de la recepción para crearlo.
 *
 *  **La excepción es explícita y vive en el código.** Un *filtro* de listado o de reporte («ver las ventas de tal cliente») no crea nada y no
 *  lleva alta: se marca con un comentario `cliente-sin-alta: <motivo>` en el mismo renglón o en los tres de arriba. El motivo es obligatorio.
 *
 *  **Qué es «cliente».** Por defecto, lo que diga `client`/`cliente`. Un producto donde el cliente se llama de otra forma (pacientes, socios)
 *  pasa su palabra en `palabras`.
 *
 *  ⚠️ **Es de test: importa `node:fs`** (por `fuentes`). Va sólo desde un `*.test.ts`, igual que `auditarSelects`:
 *
 *      const r = auditarCamposDeCliente(resolve(__dirname, '..'))
 *      expect(r.campos).toBeGreaterThan(0)         // el control: midió algo
 *      expect(describirCamposSinAlta(r.infracciones)).toEqual([])
 */
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { atributo, etiquetaDeAlLado, finDeEtiqueta, fuentes, sinComentarios } from './auditoria-de-selects'

export const MARCA_SIN_ALTA = 'cliente-sin-alta'

/** Las raíces que nombran al cliente en el código y en pantalla. Un producto donde el cliente es otro (pacientes, socios) pasa las suyas. */
export const PALABRAS = ['client']

export type CampoDeCliente = {
  archivo: string
  linea: number
  /** El componente: `SelectCliente` (bien), `SelectBuscable`, `Select` o `select`. */
  componente: string
  /** Qué hizo que se lo considere de cliente. */
  pista: string
  /** El motivo de la marca `cliente-sin-alta:`, si la lleva (`''` si la marca no dice nada). */
  marca?: string
}

export type CampoSinAlta = { archivo: string; linea: number; componente: string; razon: 'sin-alta' | 'marca-sin-motivo'; pista: string }

export type AuditoriaDeClientes = {
  archivos: number
  /** Cuántos campos de cliente encontró, con alta o sin ella. Es el control positivo. */
  campos: number
  /** Cuántos ya son `SelectCliente`. */
  conAlta: number
  /** Cuántos están permitidos sólo por la marca. */
  marcados: number
  todos: CampoDeCliente[]
  infracciones: CampoSinAlta[]
}

function marcaCerca(original: string, linea: number): string | undefined {
  const renglones = original.split('\n')
  for (let i = linea - 1; i >= Math.max(0, linea - 4); i--) {
    const m = new RegExp(`${MARCA_SIN_ALTA}(?:\\s*:(.*))?`).exec(renglones[i] ?? '')
    if (m) return (m[1] ?? '').replace(/\*\/\s*\}?\s*$/, '').replace(/^[\s:–—-]+/, '').trim()
  }
  return undefined
}

/** Las cadenas literales de una expresión, vaciadas: lo que dicen es texto para la pantalla, no qué elige el campo. */
function sinCadenas(expr: string): string {
  return expr.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
}

/** Los campos de cliente de un fuente. Pura.
 *
 *  Se mira el **código** (`value`, `onChange`, `opciones`) y el **texto** (`aria-label`, la etiqueta de al lado) por separado, porque se equivocan
 *  distinto. En el código cuenta un identificador que *empieza* con la palabra (`clienteId`, `alta.cliente_id`, `clientes.map`,
 *  `opcionesCliente(`): `equiposDelCliente` o `DEL_CLIENTE` nombran a un equipo, no eligen un cliente, y el primer borrador los contaba. En el
 *  texto cuenta la palabra suelta («Cliente», «Filtrar por cliente»). `componentes` suma los envoltorios propios del producto (el `Elegir` de
 *  LibraCargo), que el lector no puede ver por adentro. */
export function camposDeClienteEn(
  fuente: string, archivo = '', palabras: string[] = PALABRAS, componentes: string[] = [],
): CampoDeCliente[] {
  const limpio = sinComentarios(fuente)
  const raices = palabras.join('|')
  const enCodigo = new RegExp(`(?<![A-Za-z0-9_])(?:${raices})|opciones(?:${raices})`, 'i')
  const enTexto = new RegExp(`(?<![A-Za-zÀ-ÿ])(?:${raices})`, 'i')
  const etiquetas = ['SelectCliente', 'SelectBuscable', 'Select', 'select', ...componentes].join('|')
  const hallados: CampoDeCliente[] = []
  for (const m of limpio.matchAll(new RegExp(`<(${etiquetas})(?=[\\s>/])`, 'g'))) {
    const ini = m.index
    const fin = finDeEtiqueta(limpio, ini + m[0].length)
    if (fin < 0) continue
    const apertura = limpio.slice(ini, fin + 1)
    const codigo = ['value', 'opciones', 'onValueChange', 'onChange', 'name'].map((a) => atributo(apertura, a))
    const texto = [atributo(apertura, 'aria-label'), atributo(apertura, 'ariaLabel'), atributo(apertura, 'label'), etiquetaDeAlLado(limpio, ini)]
    // En el código no cuentan las cadenas: `opciones={[{ label: 'No, es del cliente' }]}` elige un proveedor, no un cliente (falso positivo
    // medido en LibraDesk, 0.158.1).
    const pista = codigo.map(sinCadenas).find((c) => c && enCodigo.test(c)) ?? texto.find((c) => c && enTexto.test(c))
    if (!pista) continue
    const linea = limpio.slice(0, ini).split('\n').length
    hallados.push({ archivo, linea, componente: m[1], pista: pista.replace(/\s+/g, ' ').slice(0, 60), marca: marcaCerca(fuente, linea) })
  }
  return hallados
}

export function infraccionDeCampo(c: CampoDeCliente): CampoSinAlta | null {
  if (c.componente === 'SelectCliente') return null
  if (c.marca !== undefined) return c.marca ? null : { ...c, razon: 'marca-sin-motivo' }
  return { archivo: c.archivo, linea: c.linea, componente: c.componente, pista: c.pista, razon: 'sin-alta' }
}

export function auditarCamposDeCliente(
  raizSrc: string, opciones: { palabras?: string[]; componentes?: string[] } = {},
): AuditoriaDeClientes {
  const todosLosFuentes = fuentes(raizSrc)
  const todos: CampoDeCliente[] = []
  const infracciones: CampoSinAlta[] = []
  for (const ruta of todosLosFuentes) {
    const relativa = relative(raizSrc, ruta).replaceAll('\\', '/')
    for (const c of camposDeClienteEn(readFileSync(ruta, 'utf8'), relativa, opciones.palabras, opciones.componentes)) {
      todos.push(c)
      const i = infraccionDeCampo(c)
      if (i) infracciones.push(i)
    }
  }
  return {
    archivos: todosLosFuentes.length,
    campos: todos.length,
    conAlta: todos.filter((c) => c.componente === 'SelectCliente').length,
    marcados: todos.filter((c) => c.marca).length,
    todos,
    infracciones,
  }
}

/** Un renglón por campo, para que el test falle diciendo qué arreglar. */
export function describirCamposSinAlta(infracciones: CampoSinAlta[]): string[] {
  return infracciones.map((i) => {
    const donde = `${i.archivo}:${i.linea}`
    if (i.razon === 'marca-sin-motivo') return `${donde}: la marca «${MARCA_SIN_ALTA}» no dice por qué; escribí el motivo después de los dos puntos`
    return `${donde}: <${i.componente}> elige un cliente (${i.pista}) y no ofrece el alta; usá SelectCliente (libra-ui/SelectCliente), o si es un filtro que no crea nada, marcalo con «${MARCA_SIN_ALTA}: <motivo>»`
  })
}

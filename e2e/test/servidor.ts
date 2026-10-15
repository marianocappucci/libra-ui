import http from 'node:http'
import type { AddressInfo } from 'node:net'

// Un "producto" de juguete: lo justo para ejercitar las ayudas de `libra-ui/e2e` en un Chromium de verdad.

const PAGINA = (cuerpo: string) => `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0">${cuerpo}</body></html>`

const LOGIN = PAGINA(`
<form id="f">
  <input id="username" aria-label="Usuario"><input id="password" type="password" aria-label="Clave">
  <altcha-widget><label for="robot">No soy un robot</label><input id="robot" type="checkbox"></altcha-widget>
  <button id="ingresar" type="submit" disabled>Ingresar</button>
  <p id="error" hidden>Credenciales inválidas</p>
</form>
<script>
  const boton = document.getElementById('ingresar')
  document.getElementById('robot').addEventListener('change', (e) => { setTimeout(() => { boton.disabled = !e.target.checked }, 150) })
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault()
    const r = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }) })
    if (r.ok) location.href = '/pos'
    else document.getElementById('error').hidden = false
  })
</script>`)

// La app: consulta /terminos, como el GateTerminos de libra-ui, y mientras tanto ya muestra el sidebar.
const APP = PAGINA(`
<div data-sidebar="sidebar" style="width:200px">menú</div>
<div id="gate" hidden>
  <h1>Términos y Condiciones</h1>
  <label><input type="checkbox" id="ok"> Leí y acepto</label>
  <button id="acepto">Aceptar y continuar</button>
</div>
<script>
  fetch('/terminos').then((r) => r.json()).then((e) => { document.getElementById('gate').hidden = !e.pendiente })
  document.getElementById('acepto').addEventListener('click', async () => {
    await fetch('/terminos/aceptar', { method: 'POST' }); location.reload()
  })
</script>`)

const ANCHA = PAGINA('<div style="width:700px;height:40px;background:#ccc" id="ancha">demasiado ancha</div>')
const SCROLL_PROPIO = PAGINA('<div style="overflow-x:auto"><table style="width:900px"><tr><td>a</td><td>b</td></tr></table></div>')
const FLEXIBLE = PAGINA('<div style="max-width:100%;padding:8px"><p>cabe en cualquier ancho</p></div>')
const ESCRIBE = PAGINA(`
<button id="guardar">Guardar</button><button id="leer">Leer</button><p id="r"></p>
<script>
  const ir = (metodo, ruta) => fetch(ruta, { method: metodo }).then((r) => r.status).catch(() => 'bloqueado')
  guardar.onclick = async () => { r.textContent = await ir('POST', '/api/cosas') }
  leer.onclick = async () => { r.textContent = await ir('GET', '/api/cosas') }
</script>`)

// Una pantalla que se pinta como la suite: la clase `dark` en <html> sale de `localStorage['libra.modo']` (lo que hace `libra-ui/modo` al arrancar) y los colores van
// en `oklch()`, que es como los escribe `tema.css` y lo que `getComputedStyle` devuelve sin convertir.
const MODO = `<script>
  try { if (localStorage.getItem('libra.modo') === 'oscuro') document.documentElement.classList.add('dark') } catch (e) {}
</script>
<style>
  body { background: oklch(1 0 0); color: oklch(0.145 0 0) }
  html.dark body { background: oklch(0.145 0 0); color: oklch(0.985 0 0) }
  .atenuado { color: oklch(0.45 0 0) }
  html.dark .atenuado { color: oklch(0.708 0 0) }
  .tarjeta { background: oklch(1 0 0 / 0.08); padding: 8px }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden }
</style>`
const OSCURO_BIEN = PAGINA(`${MODO}
<h1>Título</h1><div class="tarjeta"><p>Texto sobre una tarjeta translúcida</p></div>
<p class="atenuado">Texto atenuado que todavía se lee</p>
<span class="sr-only" style="color:#222">sólo para lectores</span>`)
const OSCURO_MAL = PAGINA(`${MODO}
<h1>Título</h1>
<p id="wordmark" style="color:#2d2d2d">VentaLibra</p>
<p id="translucido" style="color: rgba(255,255,255,0.2)">Casi transparente</p>
<p id="grande" style="color:#6b6b6b;font-size:28px">Texto grande a 3,4:1</p>
<button disabled style="background:#111;color:#333">Deshabilitado</button>
<div id="logo" style="color:#2d2d2d">Logo sobre papel</div>
<div style="background-image:linear-gradient(#fff,#eee);color:#fff">Sobre un degradé</div>`)

export type Servidor = { url: string; cerrar: () => Promise<void>; estado: { terminosPendientes: boolean; sesiones: number } }

export async function levantarServidor(): Promise<Servidor> {
  const estado = { terminosPendientes: false, sesiones: 0 }
  const json = (res: http.ServerResponse, cuerpo: unknown, cabeceras: Record<string, string> = {}) => {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cabeceras })
    res.end(JSON.stringify(cuerpo))
  }
  const html = (res: http.ServerResponse, cuerpo: string) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(cuerpo)
  }
  const servidor = http.createServer((req, res) => {
    const ruta = (req.url ?? '/').split('?')[0]
    const clave = `${req.method} ${ruta}`
    if (clave === 'GET /login') return html(res, LOGIN)
    if (clave === 'GET /pos') return html(res, APP)
    if (clave === 'GET /ancha') return html(res, ANCHA)
    if (clave === 'GET /scroll-propio') return html(res, SCROLL_PROPIO)
    if (clave === 'GET /flexible') return html(res, FLEXIBLE)
    if (clave === 'GET /escribe') return html(res, ESCRIBE)
    if (clave === 'GET /oscuro-bien') return html(res, OSCURO_BIEN)
    if (clave === 'GET /oscuro-mal') return html(res, OSCURO_MAL)
    if (clave === 'POST /auth/login') {
      estado.sesiones += 1
      // Como libraauth: la cookie de sesión siempre es `Secure`.
      return json(res, { ok: true }, { 'Set-Cookie': 'sesion=de-prueba; Path=/; HttpOnly; Secure; SameSite=Lax' })
    }
    if (clave === 'GET /terminos') return json(res, { pendiente: estado.terminosPendientes })
    if (clave === 'POST /terminos/aceptar') { estado.terminosPendientes = false; return json(res, { pendiente: false }) }
    if (ruta === '/api/cosas') return json(res, { metodo: req.method })
    if (clave === 'GET /api/yo') return json(res, { cookie: req.headers.cookie ?? null })
    res.writeHead(404).end()
  })
  await new Promise<void>((ok) => servidor.listen(0, 'localhost', ok))
  const { port } = servidor.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    estado,
    cerrar: () => new Promise((ok) => servidor.close(() => ok())),
  }
}

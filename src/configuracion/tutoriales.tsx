/** Los tutoriales colapsables de la pantalla de Configuración.
 *
 *  Vienen de `web/templates/config.html` de Contalibra (recuperado en su día
 *  vía `git show 1a8808c:web/templates/config.html`), que los tenía en
 *  Bootstrap/collapse. Contalibra y Restolibra los portaron a
 *  `<details>`/Tailwind **cada uno en su propio `Config.tsx`**, y ahí quedaron:
 *  los otros seis productos de la familia nunca los tuvieron.
 *
 *  🔴 **Por eso viven acá y no en un producto.** El pedido del humano
 *  (2026-08-29) es que la Configuración sea transversal: *"si hago una
 *  modificación en la configuración o una actualización se actualice en
 *  todas"*. Un tutorial escrito en Contalibra se corrige en Contalibra y los
 *  otros siete siguen explicando mal cómo se saca un Access Token.
 *
 *  ## El nombre del producto se pasa, no se adivina
 *
 *  Dos de estos textos lo nombran: el de Gmail dice qué escribir en «Nombre de
 *  la app» y el de Padrón A13 dice dónde está el certificado que hay que
 *  elegir como representante. Escribir "Contalibra" en el kit haría que
 *  MedLibra le pida al cliente que cree una contraseña de aplicación llamada
 *  *Contalibra* — que es peor que no tener el tutorial, porque parece
 *  correcto.
 */
import type { ReactNode } from 'react'
import { ChevronDown, ExternalLink, Info } from 'lucide-react'

/** El acordeón. Es un `<details>` nativo y no un componente de shadcn a
 *  propósito: no hay un primitivo de acordeón vendorizado en los ocho
 *  productos, y `<details>` abre y cierra sin JavaScript. */
export function Tutorial({ badge, badgeClassName, title, children }: {
  badge: string; badgeClassName: string; title: string; children: ReactNode
}) {
  return (
    <details className="group mb-4 rounded-md border bg-muted/30 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold text-white ${badgeClassName}`}>{badge}</span>
        <span className="font-medium">{title}</span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 grid gap-3 border-t pt-3">{children}</div>
    </details>
  )
}

export function TutorialStep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      <ol className="ml-4 list-decimal space-y-1.5 text-sm text-muted-foreground">{children}</ol>
    </div>
  )
}

export function TutorialLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {children}<ExternalLink className="size-3" />
    </a>
  )
}

export function TutorialCode({ children }: { children: ReactNode }) {
  return <code className="mt-1 mb-1 block rounded border bg-background px-2 py-1 font-mono text-xs">{children}</code>
}

/** Un fragmento de código en línea, dentro de un párrafo. */
export function CodigoInline({ children }: { children: ReactNode }) {
  return <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">{children}</code>
}

export function TutorialNote({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'success'; children: ReactNode }) {
  const styles: Record<string, string> = {
    info: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
    warning: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  }
  return (
    <p className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${styles[tone]}`}>
      <Info className="mt-0.5 size-3.5 shrink-0" />{children}
    </p>
  )
}

const AZUL_MERCADOPAGO = 'bg-[#009ee3]'
const AZUL_ARCA = 'bg-[#1a3a5c]'

/** Cómo sacar las cuatro credenciales de MercadoPago. */
export function TutorialMercadoPago() {
  return (
    <Tutorial badge="MercadoPago" badgeClassName={AZUL_MERCADOPAGO} title="¿Cómo obtener el Access Token, User ID, POS ID y Webhook Secret?">
      <TutorialStep title="1 — Access Token (token de producción)">
        <li>Ingresá a <TutorialLink href="https://www.mercadopago.com.ar/developers/panel/app">mercadopago.com.ar/developers/panel/app</TutorialLink></li>
        <li>Creá una nueva aplicación (o seleccioná una existente)</li>
        <li>En la aplicación, andá a la pestaña <strong>Credenciales de producción</strong></li>
        <li>Copiá el <strong>Access token</strong> (empieza con <CodigoInline>APP_USR-</CodigoInline>) y pegalo abajo</li>
      </TutorialStep>
      <TutorialStep title="2 — User ID del vendedor">
        <li>Iniciá sesión en <TutorialLink href="https://www.mercadopago.com.ar">mercadopago.com.ar</TutorialLink></li>
        <li>Hacé clic en tu avatar (arriba a la derecha) → <strong>Tu perfil</strong></li>
        <li>El <strong>User ID</strong> es el número que aparece abajo de tu nombre (ej: <CodigoInline>123456789</CodigoInline>)</li>
        <li>También lo encontrás en el panel de desarrolladores al ver las credenciales de tu app</li>
      </TutorialStep>
      <TutorialStep title="3 — POS ID (External ID del punto de venta)">
        <li>En <TutorialLink href="https://www.mercadopago.com.ar/stores">mercadopago.com.ar/stores</TutorialLink> creá o seleccioná una <strong>Sucursal</strong></li>
        <li>Dentro de la sucursal, creá un <strong>Punto de venta</strong> (tipo: <em>PDV</em>)</li>
        <li>Al crearlo, completá el campo <strong>External ID</strong> con un código propio (ej: <CodigoInline>CAJA01</CodigoInline>) — ese valor es el que va acá</li>
      </TutorialStep>
      <TutorialStep title="4 — Webhook Secret">
        <li>En el panel de desarrolladores, entrá a tu aplicación y luego a <strong>Webhooks</strong></li>
        <li>Registrá la URL: <CodigoInline>https://tu-dominio/webhooks/mercadopago</CodigoInline> y seleccioná el evento <strong>Pagos (payment)</strong></li>
        <li>MercadoPago te mostrará una <strong>firma secreta (secret)</strong> — copiala y pegala en el campo Webhook Secret</li>
      </TutorialStep>
      <TutorialNote tone="warning">Usá siempre las credenciales de <strong>producción</strong>, no las de prueba, para cobros reales.</TutorialNote>
    </Tutorial>
  )
}

/** Cómo generar la clave privada, pedir el certificado y dar de alta el punto
 *  de venta en el portal de ARCA. */
export function TutorialArcaCertificado() {
  return (
    <Tutorial badge="ARCA / AFIP" badgeClassName={AZUL_ARCA} title="¿Cómo obtener el certificado digital y la clave privada?">
      <TutorialStep title="1 — Generar la clave privada y el CSR (en tu PC)">
        <li>Instalá <strong>OpenSSL</strong> (en Windows podés usar Git Bash o WSL; en Linux/Mac ya viene incluido)</li>
        <li>
          Abrí una terminal y ejecutá:
          <TutorialCode>openssl genrsa -out clave_privada.key 2048</TutorialCode>
        </li>
        <li>
          Luego generá el CSR (pedido de certificado):
          <TutorialCode>openssl req -new -key clave_privada.key -subj "/C=AR/O=Mi Empresa/CN=CUIT 20123456789" -out mi_empresa.csr</TutorialCode>
          Reemplazá <em>CUIT 20123456789</em> con tu CUIT sin guiones.
        </li>
        <li>Guardá bien el archivo <strong>clave_privada.key</strong> — es el que subís al campo <em>Clave privada</em> de abajo</li>
      </TutorialStep>
      <TutorialStep title="2 — Obtener el certificado desde el portal ARCA">
        <li>Ingresá con CUIT y Clave Fiscal (nivel 3 o superior) a <TutorialLink href="https://auth.afip.gob.ar">auth.afip.gob.ar</TutorialLink></li>
        <li>Buscá el servicio <strong>&quot;Administración de Certificados Digitales&quot;</strong> en el listado de servicios habilitados</li>
        <li>Hacé clic en <strong>Nueva solicitud de certificado</strong></li>
        <li>Pegá el contenido del archivo <CodigoInline>mi_empresa.csr</CodigoInline> generado en el paso anterior</li>
        <li>Descargá el certificado resultante (<CodigoInline>.crt</CodigoInline> o <CodigoInline>.pem</CodigoInline>) — ese archivo es el que subís al campo <em>Certificado</em> de abajo</li>
      </TutorialStep>
      <TutorialStep title="3 — Punto de venta">
        <li>En el portal ARCA / AFIP, buscá el servicio <strong>&quot;ABM de Puntos de Venta&quot;</strong></li>
        <li>Creá un punto de venta de tipo <strong>Facturación electrónica — Web Services</strong></li>
        <li>El número asignado es el que ingresás en el campo <em>Punto de venta</em> de abajo (ej: <CodigoInline>5</CodigoInline>)</li>
      </TutorialStep>
      <TutorialNote tone="info">Usá el ambiente <strong>Homologación</strong> para hacer pruebas sin emitir comprobantes reales. Cambiá a <strong>Producción</strong> recién cuando todo funcione correctamente.</TutorialNote>
      <TutorialNote tone="warning">La <strong>clave privada</strong> nunca se comparte ni se sube a ningún sitio externo. Solo la subís una vez a este servidor, que es tuyo.</TutorialNote>
    </Tutorial>
  )
}

/** Cómo habilitar el webservice de Padrón A13, que es el que completa los
 *  datos del cliente a partir del CUIT.
 *
 *  `producto` sale en el paso 2: el representante que hay que elegir es el
 *  certificado que se configuró en **este** sistema. */
export function TutorialArcaPadron({ producto }: { producto: string }) {
  return (
    <Tutorial badge="ARCA / AFIP" badgeClassName={AZUL_ARCA} title="¿Qué servicio debo habilitar para consultar datos de clientes por CUIT?">
      <p className="text-sm text-muted-foreground">
        El botón <strong>&quot;Consultar ARCA&quot;</strong> en el formulario de clientes completa automáticamente nombre, domicilio y condición de IVA a partir del CUIT.
        Para que funcione, tu certificado debe tener acceso al webservice de Padrón Alcance 13.
      </p>
      <TutorialStep title="1 — Ingresar al Administrador de Relaciones">
        <li>Ingresá con CUIT y Clave Fiscal a <TutorialLink href="https://auth.afip.gob.ar">auth.afip.gob.ar</TutorialLink></li>
        <li>Buscá y abrí el servicio <strong>&quot;Administrador de Relaciones de Clave Fiscal&quot;</strong></li>
        <li>Hacé clic en <strong>Nueva Relación</strong></li>
      </TutorialStep>
      <TutorialStep title="2 — Crear la relación para Padrón Alcance 13">
        <li>En <em>Servicio</em>, buscá y seleccioná: <strong>Consulta a Padrón Alcance 13</strong> (ws_sr_padron_a13)</li>
        <li>En <em>Representante</em>, seleccioná el certificado que ya configuraste en {producto}</li>
        <li>Confirmá la relación</li>
      </TutorialStep>
      <TutorialNote tone="success">Una vez habilitado, el botón <strong>&quot;Consultar ARCA&quot;</strong> en el alta de clientes funcionará automáticamente.</TutorialNote>
      <TutorialNote tone="info">Este servicio es distinto al de facturación (WSFE). Necesitás habilitarlos por separado usando el mismo certificado.</TutorialNote>
    </Tutorial>
  )
}

/** La contraseña de aplicación de Gmail.
 *
 *  `producto` sale en el paso 5: es el nombre que Google le pide a la
 *  contraseña de aplicación, y el que después aparece en la lista de accesos
 *  de la cuenta. */
export function TutorialGmail({ producto }: { producto: string }) {
  return (
    <Tutorial badge="Gmail" badgeClassName="bg-destructive" title="¿Cómo configurar Gmail con una contraseña de aplicación?">
      <p className="text-sm text-muted-foreground">
        Gmail <strong>no permite usar tu contraseña normal</strong> para enviar emails desde apps externas.
        Necesitás generar una <strong>contraseña de aplicación</strong> de 16 caracteres. Seguí estos pasos:
      </p>
      <ol className="ml-4 list-decimal space-y-1.5 text-sm text-muted-foreground">
        <li>Ingresá a tu cuenta de Google en <TutorialLink href="https://myaccount.google.com">myaccount.google.com</TutorialLink></li>
        <li>En el menú izquierdo hacé clic en <strong>Seguridad</strong></li>
        <li>Asegurate de tener activada la <strong>Verificación en dos pasos</strong> (es un requisito de Google)</li>
        <li>Buscá <em>&quot;contraseñas de aplicación&quot;</em> en el buscador de configuración de Google o ingresá directamente a <TutorialLink href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</TutorialLink></li>
        <li>En el campo <strong>Nombre de la app</strong> escribí <em>{producto}</em> y hacé clic en <strong>Crear</strong></li>
        <li>Google te mostrará una contraseña de <strong>16 caracteres</strong> — copiala en ese momento (no se vuelve a mostrar)</li>
        <li>Pegá esa contraseña en el campo <strong>Contraseña</strong> del formulario de abajo y guardá</li>
      </ol>
      <TutorialNote tone="info">
        <strong>Valores recomendados para Gmail:</strong> Servidor: <CodigoInline>smtp.gmail.com</CodigoInline> · Puerto: <CodigoInline>587</CodigoInline> · Usuario: tu dirección de Gmail completa
      </TutorialNote>
    </Tutorial>
  )
}

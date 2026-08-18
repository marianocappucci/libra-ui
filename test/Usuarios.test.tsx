// La pantalla de usuarios: el alta y la edición en modal, y las acciones de la
// grilla con icono.
//
// Los dos cambios los pidió el humano el 2026-08-15 mirando LibraDesk ya
// desplegado (puntos 7 y 8 de su lista). Llegan acá y no al producto porque
// `pages/Usuarios.tsx` de LibraDesk es un shim de nueve líneas sobre este
// módulo: la pantalla viene entera del paquete, y le llega a cualquier producto
// que suba su pin.
//
// Este archivo es además el primer test de `Usuarios.tsx` — el módulo estaba
// sin cubrir (lo decía el comentario del piso de cobertura en `vitest.config`),
// así que además de las dos formas nuevas se afirma que el ABM sigue mandando
// lo que mandaba: es un paquete compartido por cinco productos y no hay dónde
// enterarse si se rompe.
//
// ⚠️ El `Dialog` acá es el STUB de `test/stubs`, no Radix: rinde
// `role="dialog"` y respeta `open`, pero no hace foco ni marca inerte al resto
// del documento. Alcanza para afirmar "el formulario está adentro del diálogo";
// no dice nada sobre cómo se ve.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Usuarios } from '../src/Usuarios'

const USUARIOS = [
  { id: 'u1', username: 'admin', name: 'Mariano', role: 'admin', active: true, email: 'mariano@empresa.com' },
  // Sin `email` a propósito: el campo es opcional en el tipo porque no todos
  // los productos lo devuelven todavía, y una fila sin correo tiene que poder
  // editarse igual.
  { id: 'u2', username: 'jperez', name: 'Juan Pérez', role: 'staff', active: false },
]

// `delay: null` en todos los `userEvent.setup` de este archivo: la espera
// artificial por tecla lo hacía pasarse del `testTimeout` de 5 s corriendo bajo
// cobertura, y en un caso distinto cada vez. No cambia lo que se ejercita —
// sigue siendo un evento de teclado por carácter—, sólo saca la pausa.
let pedidos: { url: string; metodo: string; cuerpo: unknown }[] = []

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  pedidos = []
  vi.stubGlobal('fetch', vi.fn((url: string, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET'
    pedidos.push({
      url: String(url), metodo,
      cuerpo: opciones?.body ? JSON.parse(String(opciones.body)) : null,
    })
    if (metodo !== 'GET') return Promise.resolve(json({ ok: true }))
    return Promise.resolve(json(USUARIOS))
  }))
})

describe('🔴 el alta y la edición abren en modal', () => {
  it('editar rinde el formulario adentro de un diálogo, con los datos cargados', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    // Control: sin esto, un diálogo que ya estuviera abierto haría pasar el
    // caso sin que el click hiciera nada.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Editar Mariano' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Nombre')).toHaveValue('Mariano')
    // La edición NO ofrece usuario ni contraseña. El usuario porque no se
    // puede cambiar. La contraseña porque tiene su propia acción y su propio
    // diálogo (ver más abajo): metida acá viajaría en cada corrección de un
    // apellido.
    expect(within(dialogo).queryByLabelText('Usuario')).not.toBeInTheDocument()
    expect(within(dialogo).queryByLabelText('Contraseña')).not.toBeInTheDocument()
    // El correo sí, y con el valor cargado: es la dirección a la que llega el
    // mail de "olvidé mi contraseña", y sin poder editarlo los usuarios que ya
    // existían se quedaban sin ninguna forma de recuperarla.
    expect(within(dialogo).getByLabelText(/Correo/)).toHaveValue('mariano@empresa.com')
  })

  it('el alta pide usuario y contraseña, y las manda', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Usuario'), 'nuevo')
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Persona Nueva')
    await user.type(within(dialogo).getByLabelText('Contraseña'), 'secreta123')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear' }))

    await waitFor(() => {
      const alta = pedidos.find((p) => p.metodo === 'POST')
      expect(alta?.cuerpo).toEqual({
        username: 'nuevo', name: 'Persona Nueva',
        password: 'secreta123', email: '', role: 'staff',
      })
    })
    // Y se cierra: si quedara abierto taparía la grilla recién recargada.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('🔴 el formulario NO queda en el flujo de la página, entre el encabezado y la grilla', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')
    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }))

    // Éste es el defecto en sí, y hay que abrirlo para verlo: con el
    // formulario cerrado la pantalla se ve igual antes y después del cambio,
    // así que un caso que sólo mirara el estado inicial no distinguiría nada
    // — pasaría en verde con la tarjeta vieja entera puesta. Se comprobó
    // corriéndolo contra el código anterior.
    //
    // Abierto, la diferencia es dónde vive el campo: adentro del diálogo, o
    // suelto en la página empujando la tabla hacia abajo.
    const nombre = await screen.findByLabelText('Nombre')
    expect(nombre.closest('[role="dialog"]')).not.toBeNull()

    // Y la grilla sigue estando: el diálogo no la reemplaza.
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
  })
})

describe('🔴 las acciones de la grilla van con icono, no con palabra', () => {
  it('editar y desactivar son botones de icono con nombre accesible', async () => {
    render(<Usuarios />)
    await screen.findByText('Mariano')

    const editar = screen.getByRole('button', { name: 'Editar Mariano' })
    const desactivar = screen.getByRole('button', { name: 'Desactivar Mariano' })

    // El nombre accesible vive, pero el texto visible se fue: es exactamente
    // lo que significa "con icono y no con palabra". Se mide sobre
    // `textContent` —lo que se ve— y no sobre el nombre accesible, que a
    // propósito sigue diciendo la acción.
    expect(editar.textContent).toBe('')
    expect(desactivar.textContent).toBe('')
    expect(editar.querySelector('svg')).not.toBeNull()
    expect(desactivar.querySelector('svg')).not.toBeNull()
  })

  it('un usuario inactivo ofrece Activar, y el dibujo es otro', async () => {
    render(<Usuarios />)
    await screen.findByText('Juan Pérez')

    // La columna cambia por fila: `Juan Pérez` está inactivo, así que su botón
    // dice Activar. Afirmarlo sólo sobre la primera fila describiría una fila,
    // no la columna.
    const activar = screen.getByRole('button', { name: 'Activar Juan Pérez' })
    expect(screen.queryByRole('button', { name: 'Desactivar Juan Pérez' })).not.toBeInTheDocument()

    // Y no es el mismo glifo que el de desactivar: si lo fuera, el icono no
    // estaría comunicando el estado y la palabra que se sacó haría falta.
    const desactivar = screen.getByRole('button', { name: 'Desactivar Mariano' })
    expect(activar.querySelector('svg')!.getAttribute('class'))
      .not.toBe(desactivar.querySelector('svg')!.getAttribute('class'))
  })

  it('el toggle manda el PUT con el estado invertido', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: 'Desactivar Mariano' }))

    await waitFor(() => {
      const put = pedidos.find((p) => p.metodo === 'PUT')
      expect(put?.url).toContain('/users/u1')
      expect(put?.cuerpo).toEqual({ name: 'Mariano', role: 'admin', active: false })
    })
  })
})


describe('🔴 el admin le puede cambiar la contraseña a otro usuario', () => {
  it('cada fila ofrece la acción, con el nombre del usuario en el rótulo accesible', async () => {
    render(<Usuarios />)
    await screen.findByText('Mariano')

    // Las dos filas, no sólo la primera: es una columna, y afirmarla sobre una
    // fila describiría esa fila.
    const boton = screen.getByRole('button', { name: 'Cambiar contraseña de Mariano' })
    expect(screen.getByRole('button', { name: 'Cambiar contraseña de Juan Pérez' })).toBeInTheDocument()

    // Icono y no palabra, como las otras dos acciones de esta grilla.
    expect(boton.textContent).toBe('')
    expect(boton.querySelector('svg')).not.toBeNull()

    // Y no es el mismo glifo que el de editar: si lo fuera, las dos acciones
    // se verían iguales y el icono no estaría diciendo nada.
    const editar = screen.getByRole('button', { name: 'Editar Mariano' })
    expect(boton.querySelector('svg')!.getAttribute('class'))
      .not.toBe(editar.querySelector('svg')!.getAttribute('class'))
  })

  it('manda el PUT a la ruta de contraseña del usuario elegido', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Juan Pérez')

    // Se elige el SEGUNDO usuario a propósito: con el primero, un componente
    // que ignorara la fila y usara siempre el primer id daría el mismo verde.
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña de Juan Pérez' }))
    const dialogo = await screen.findByRole('dialog')

    // El diálogo nombra a quién se le está cambiando: es lo que evita
    // cambiársela a la fila de al lado.
    expect(within(dialogo).getByText(/Juan Pérez/)).toBeInTheDocument()

    await user.type(within(dialogo).getByLabelText('Contraseña nueva'), 'nueva456')
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar' }))

    await waitFor(() => {
      const put = pedidos.find((p) => p.url.endsWith('/password'))
      expect(put?.metodo).toBe('PUT')
      expect(put?.url).toBe('/users/u2/password')
      expect(put?.cuerpo).toEqual({ password: 'nueva456' })
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('respeta el basePath del producto', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios basePath="/api/usuarios" />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña de Mariano' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Contraseña nueva'), 'x')
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar' }))

    // LibraDesk monta su router en `/api/usuarios`. Una ruta armada con el
    // '/users' del default le daría 404 contra el catch-all de la SPA, que
    // además contesta 200 con el index.html -- o sea que el error ni siquiera
    // se vería como un error.
    await waitFor(() => {
      expect(pedidos.find((p) => p.url.endsWith('/password'))?.url).toBe('/api/usuarios/u1/password')
    })
  })

  it('la contraseña vacía no dispara ninguna llamada', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña de Mariano' }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar' }))

    expect(await within(dialogo).findByText(/Escribí la contraseña nueva/)).toBeInTheDocument()
    // Lo que se afirma es la ausencia de la llamada, no el cartel: un
    // formulario que mostrara el error DESPUÉS de haber mandado el PUT se
    // vería igual, y del otro lado la contraseña ya habría quedado en blanco.
    expect(pedidos.filter((p) => p.url.endsWith('/password'))).toHaveLength(0)
    // Y el diálogo queda abierto, con lo tipeado: cerrarlo obligaría a
    // empezar de nuevo.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Cancelar cierra el diálogo sin mandar nada', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña de Mariano' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Contraseña nueva'), 'arrepentido')
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    // Lo que importa es la ausencia de la llamada: un Cancelar que cerrara la
    // vista DESPUÉS de haber mandado el PUT se vería exactamente igual, y del
    // otro lado la contraseña ya estaría cambiada.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(pedidos.filter((p) => p.url.endsWith('/password'))).toHaveLength(0)
  })

  it('lo tipeado no sobrevive al diálogo siguiente', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña de Mariano' }))
    await user.type(await screen.findByLabelText('Contraseña nueva'), 'para-mariano')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    // Abrir el de OTRO usuario tiene que empezar en blanco. Con el campo
    // heredado, un Cambiar apurado le pone al segundo la clave que se había
    // tipeado para el primero -- y las dos personas terminan con la misma.
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña de Juan Pérez' }))
    expect(await screen.findByLabelText('Contraseña nueva')).toHaveValue('')
  })

  it('el error del backend se lee adentro del diálogo, que no se cierra', async () => {
    const user = userEvent.setup({ delay: null })
    vi.stubGlobal('fetch', vi.fn((_url: string, opciones?: RequestInit) => {
      const metodo = opciones?.method ?? 'GET'
      if (metodo === 'GET') return Promise.resolve(json(USUARIOS))
      // 404: al usuario lo borraron desde otra pestaña mientras este diálogo
      // estaba abierto. Se elige un error que la guarda del cliente NO puede
      // anticipar -- con uno que sí (la clave vacía) el PUT ni saldría, y el
      // caso estaría midiendo la guarda en vez del camino del error.
      return Promise.resolve(new Response(JSON.stringify({ detail: 'usuario not found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      }))
    }))
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña de Mariano' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Contraseña nueva'), 'nueva456')
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar' }))

    // El cartel del backend tiene que llegar a la vista. Sin esto el diálogo
    // queda abierto sin explicación, y se lee como que el botón no hace nada.
    expect(await within(dialogo).findByText(/usuario not found/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('🔴 el correo del ABM', () => {
  it('el alta lo manda cuando se completa', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Usuario'), 'nuevo')
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Persona Nueva')
    await user.type(within(dialogo).getByLabelText(/Correo/), 'nueva@empresa.com')
    await user.type(within(dialogo).getByLabelText('Contraseña'), 'secreta123')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear' }))

    await waitFor(() => {
      expect(pedidos.find((p) => p.metodo === 'POST')?.cuerpo).toMatchObject({
        email: 'nueva@empresa.com',
      })
    })
  })

  it('la edición lo manda, y el usuario sin correo se puede editar igual', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Juan Pérez')

    await user.click(screen.getByRole('button', { name: 'Editar Juan Pérez' }))
    const dialogo = await screen.findByRole('dialog')
    // La fila que NO trae correo: sin el `?? ''` el input quedaría no
    // controlado y React tira un warning en vez de un valor vacío.
    expect(within(dialogo).getByLabelText(/Correo/)).toHaveValue('')

    await user.type(within(dialogo).getByLabelText(/Correo/), 'jperez@empresa.com')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(pedidos.find((p) => p.metodo === 'PUT')?.cuerpo).toMatchObject({
        email: 'jperez@empresa.com',
      })
    })
  })

  it('🔴 el toggle de activo NO manda el correo', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    await user.click(screen.getByRole('button', { name: 'Desactivar Mariano' }))

    // Su ausencia es lo que le dice al backend "dejalo como está". Mandarlo
    // sería peor que omitirlo: contra un producto cuyo listado todavía no
    // devuelve el campo, `user.email ?? ''` le borraría el correo a cualquiera
    // que se active o se desactive -- y el correo es justamente lo único que
    // le permite recuperar la contraseña.
    await waitFor(() => {
      const put = pedidos.find((p) => p.metodo === 'PUT')
      expect(put?.cuerpo).toEqual({ name: 'Mariano', role: 'admin', active: false })
    })
  })
})

describe('🔴 editar a un usuario desactivado no lo reactiva', () => {
  it('el PUT de la edición conserva el estado que tenía', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Juan Pérez')

    // `Juan Pérez` está inactivo. La edición mandaba `active: true` fijo, así
    // que corregirle el nombre lo volvía a habilitar sin decir nada -- y quien
    // editó un apellido no tiene por qué mirar la columna Estado después.
    await user.click(screen.getByRole('button', { name: 'Editar Juan Pérez' }))
    const dialogo = await screen.findByRole('dialog')
    await user.clear(within(dialogo).getByLabelText('Nombre'))
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Juan P. Pérez')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      const put = pedidos.find((p) => p.metodo === 'PUT')
      expect(put?.cuerpo).toMatchObject({ name: 'Juan P. Pérez', active: false })
    })
  })

  it('y al activo lo deja activo', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Usuarios />)
    await screen.findByText('Mariano')

    // El control del caso anterior: si el componente hubiera pasado de mandar
    // `true` fijo a mandar `false` fijo, aquél seguiría verde.
    await user.click(screen.getByRole('button', { name: 'Editar Mariano' }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(pedidos.find((p) => p.metodo === 'PUT')?.cuerpo).toMatchObject({ active: true })
    })
  })
})

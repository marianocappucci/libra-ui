// El campo de archivo de la suite (ADR-037): la caja con el ícono de subir en el borde derecho.
import { createRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CampoArchivo, formatearTamanio } from '../src/CampoArchivo'

function archivoDe(nombre: string, bytes: number, tipo = 'application/octet-stream') {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo })
}

const caja = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-slot="campo-archivo"]')!
const input = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="file"]')!

/** El campo dentro de un padre que guarda el archivo, como lo usan las pantallas. */
function Controlado(props: Partial<React.ComponentProps<typeof CampoArchivo>> & { alCambiar?: (f: File | null) => void }) {
  const { alCambiar, ...resto } = props
  const [archivo, setArchivo] = useState<File | null>(null)
  return (
    <CampoArchivo
      aria-label="Planilla" {...resto} archivo={archivo}
      onChange={(f) => { setArchivo(f); alCambiar?.(f) }}
    />
  )
}

describe('formatearTamanio', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1229, '1,2 KB'],
    [2.3 * 1024 * 1024, '2,3 MB'],
    [5 * 1024 ** 3, '5 GB'],
  ])('%s bytes se lee «%s»', (bytes, esperado) => {
    expect(formatearTamanio(bytes)).toBe(esperado)
  })

  it('no dice «1.024 KB»: pasa a la unidad siguiente cuando el redondeo llega', () => {
    expect(formatearTamanio(1024 * 1024 - 10)).toBe('1 MB')
  })

  it('un valor que no es un tamaño no rompe', () => {
    expect(formatearTamanio(-5)).toBe('0 B')
    expect(formatearTamanio(Number.NaN)).toBe('0 B')
  })
})

describe('CampoArchivo — estados', () => {
  it('vacío: dice «Ningún archivo», ofrece subir y no ofrece quitar', () => {
    const { container } = render(<CampoArchivo archivo={null} onChange={() => {}} aria-label="Planilla" />)
    expect(screen.getByText('Ningún archivo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar archivo' })).toBeNull()
    expect(input(container)).toHaveAttribute('type', 'file')
  })

  it('el texto vacío se puede cambiar', () => {
    render(<CampoArchivo archivo={null} onChange={() => {}} placeholder="Elegí el certificado" />)
    expect(screen.getByText('Elegí el certificado')).toBeInTheDocument()
    expect(screen.queryByText('Ningún archivo')).toBeNull()
  })

  it('elegido: el nombre, el tamaño legible y «Cambiar archivo» en el botón', () => {
    render(<CampoArchivo archivo={archivoDe('precios.xlsx', 1229)} onChange={() => {}} />)
    expect(screen.getByText('precios.xlsx')).toBeInTheDocument()
    expect(screen.getByText('1,2 KB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar archivo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Subir archivo' })).toBeNull()
    expect(screen.queryByText('Ningún archivo')).toBeNull()
  })

  it('un nombre largo se trunca con CSS y se lee entero en el title', () => {
    const nombre = `${'a'.repeat(120)}.xlsx`
    render(<CampoArchivo archivo={archivoDe(nombre, 10)} onChange={() => {}} />)
    const texto = screen.getByText(nombre)
    expect(texto).toHaveClass('truncate')
    expect(texto).toHaveAttribute('title', nombre)
  })

  it('error: el mensaje va DEBAJO de la caja, la caja se pinta y el input queda inválido y descrito', () => {
    const { container } = render(
      <CampoArchivo archivo={null} onChange={() => {}} id="c" error="Falta la planilla." ayuda="Sólo .xlsx" />,
    )
    const mensaje = screen.getByText('Falta la planilla.')
    expect(caja(container)).not.toContainElement(mensaje)
    expect(caja(container)).toHaveClass('border-destructive')
    expect(screen.getByRole('button', { name: 'Subir archivo' })).toHaveClass('text-destructive')
    expect(input(container)).toHaveAttribute('aria-invalid', 'true')
    expect(input(container).getAttribute('aria-describedby')).toBe('c-error c-ayuda')
    expect(mensaje).toHaveAttribute('id', 'c-error')
  })

  it('ayuda: texto chico y gris debajo, sin error no hay aria-invalid', () => {
    const { container } = render(<CampoArchivo archivo={null} onChange={() => {}} id="c" ayuda="Hasta 5 MB" />)
    expect(screen.getByText('Hasta 5 MB')).toHaveClass('text-muted-foreground')
    expect(input(container)).not.toHaveAttribute('aria-invalid')
    expect(input(container)).toHaveAttribute('aria-describedby', 'c-ayuda')
  })

  it('el aria-describedby del que lo usa se conserva', () => {
    const { container } = render(<CampoArchivo archivo={null} onChange={() => {}} id="c" aria-describedby="otro" ayuda="x" />)
    expect(input(container).getAttribute('aria-describedby')).toBe('otro c-ayuda')
  })

  it('deshabilitado: opacidad reducida, el botón y el input deshabilitados, y no abre nada', async () => {
    const { container } = render(<CampoArchivo archivo={null} onChange={() => {}} disabled />)
    expect(caja(container)).toHaveClass('opacity-50')
    expect(caja(container)).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Subir archivo' })).toBeDisabled()
    expect(input(container)).toBeDisabled()
    const abrir = vi.spyOn(input(container), 'click')
    fireEvent.click(caja(container))
    expect(abrir).not.toHaveBeenCalled()
  })

  it('deshabilitado no ofrece quitar aunque haya archivo', () => {
    render(<CampoArchivo archivo={archivoDe('a.zip', 1)} onChange={() => {}} disabled />)
    expect(screen.queryByRole('button', { name: 'Quitar archivo' })).toBeNull()
  })
})

describe('CampoArchivo — elegir', () => {
  it('un click en cualquier parte de la caja abre el selector', async () => {
    const user = userEvent.setup()
    const { container } = render(<CampoArchivo archivo={null} onChange={() => {}} />)
    const abrir = vi.spyOn(input(container), 'click')

    await user.click(screen.getByText('Ningún archivo'))
    expect(abrir).toHaveBeenCalledTimes(1)
    await user.click(caja(container))
    expect(abrir).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Subir archivo' }))
    expect(abrir).toHaveBeenCalledTimes(3)
  })

  it('el botón se alcanza y se activa con el teclado (Enter y Espacio)', async () => {
    const user = userEvent.setup()
    const { container } = render(<CampoArchivo archivo={null} onChange={() => {}} />)
    const abrir = vi.spyOn(input(container), 'click')

    await user.tab()
    const boton = screen.getByRole('button', { name: 'Subir archivo' })
    expect(boton).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(abrir).toHaveBeenCalledTimes(2)
  })

  it('el input nativo no está en el orden de tabulación: se llega al botón, una sola parada', async () => {
    const user = userEvent.setup()
    const { container } = render(<CampoArchivo archivo={null} onChange={() => {}} />)
    expect(input(container)).toHaveAttribute('tabindex', '-1')
    await user.tab()
    await user.tab()
    expect(document.body).toHaveFocus()
  })

  it('onChange recibe el File elegido', async () => {
    const user = userEvent.setup()
    const alCambiar = vi.fn()
    const f = archivoDe('precios.xlsx', 100)
    const { container } = render(<Controlado alCambiar={alCambiar} />)

    await user.upload(input(container), f)
    expect(alCambiar).toHaveBeenCalledWith(f)
    expect(screen.getByText('precios.xlsx')).toBeInTheDocument()
  })

  it('elegir dos veces el MISMO archivo avisa las dos (el input nativo se vacía)', async () => {
    const user = userEvent.setup()
    const alCambiar = vi.fn()
    const f = archivoDe('real.crt', 10)
    const { container } = render(<CampoArchivo archivo={null} onChange={alCambiar} />)

    await user.upload(input(container), f)
    await user.upload(input(container), f)
    expect(alCambiar).toHaveBeenCalledTimes(2)
    expect(input(container).value).toBe('')
  })

  it('el accept y el name llegan al input; el id lo asocia a su label', async () => {
    const { container } = render(
      <>
        <label htmlFor="backup">Archivo de backup</label>
        <CampoArchivo id="backup" name="archivo" accept=".zip" archivo={null} onChange={() => {}} />
      </>,
    )
    expect(input(container)).toHaveAttribute('accept', '.zip')
    expect(input(container)).toHaveAttribute('name', 'archivo')
    expect(screen.getByLabelText('Archivo de backup')).toBe(input(container))
  })

  it('el ref apunta al input nativo', () => {
    const ref = createRef<HTMLInputElement>()
    const { container } = render(<CampoArchivo ref={ref} archivo={null} onChange={() => {}} />)
    expect(ref.current).toBe(input(container))
  })

  it('el ref de función también recibe el input', () => {
    const ref = vi.fn()
    const { container } = render(<CampoArchivo ref={ref} archivo={null} onChange={() => {}} />)
    expect(ref).toHaveBeenCalledWith(input(container))
  })
})

describe('CampoArchivo — quitar', () => {
  it('la X avisa con null, no abre el selector y deja la caja vacía', async () => {
    const user = userEvent.setup()
    const alCambiar = vi.fn()
    const { container } = render(<Controlado alCambiar={alCambiar} />)
    await user.upload(input(container), archivoDe('a.xlsx', 5))
    const abrir = vi.spyOn(input(container), 'click')

    await user.click(screen.getByRole('button', { name: 'Quitar archivo' }))
    expect(alCambiar).toHaveBeenLastCalledWith(null)
    expect(abrir).not.toHaveBeenCalled()
    expect(screen.getByText('Ningún archivo')).toBeInTheDocument()
  })

  it('con `required` no se puede quitar (quedaría inválido)', () => {
    render(<CampoArchivo archivo={archivoDe('a.zip', 1)} onChange={() => {}} required />)
    expect(screen.queryByRole('button', { name: 'Quitar archivo' })).toBeNull()
  })

  it('`quitable={false}` lo saca', () => {
    render(<CampoArchivo archivo={archivoDe('a.zip', 1)} onChange={() => {}} quitable={false} />)
    expect(screen.queryByRole('button', { name: 'Quitar archivo' })).toBeNull()
  })
})

describe('CampoArchivo — arrastrar y soltar', () => {
  it('mientras se arrastra encima la caja se resalta con el color primario, y se apaga al salir', () => {
    const { container } = render(<CampoArchivo archivo={null} onChange={() => {}} />)
    fireEvent.dragEnter(caja(container))
    expect(caja(container)).toHaveAttribute('data-arrastrando', 'true')
    expect(caja(container)).toHaveClass('border-primary')
    fireEvent.dragLeave(caja(container))
    expect(caja(container)).not.toHaveAttribute('data-arrastrando')
  })

  it('soltar un archivo que cumple con el accept lo elige', () => {
    const alCambiar = vi.fn()
    const f = archivoDe('Copia.ZIP', 10, 'application/zip')
    const { container } = render(<CampoArchivo archivo={null} onChange={alCambiar} accept=".zip,application/zip" />)
    fireEvent.drop(caja(container), { dataTransfer: { files: [f] } })
    expect(alCambiar).toHaveBeenCalledWith(f)
    expect(caja(container)).not.toHaveAttribute('data-arrastrando')
  })

  it('soltar uno que NO cumple se rechaza, y el campo lo dice abajo', () => {
    const alCambiar = vi.fn()
    const { container } = render(<CampoArchivo archivo={null} onChange={alCambiar} accept=".xlsx" />)
    fireEvent.drop(caja(container), { dataTransfer: { files: [archivoDe('foto.png', 10, 'image/png')] } })
    expect(alCambiar).not.toHaveBeenCalled()
    expect(screen.getByText(/Ese formato no se admite \(se espera \.xlsx\)/)).toBeInTheDocument()
    expect(caja(container)).toHaveClass('border-destructive')
  })

  it('el aviso de rechazo se va con el siguiente archivo bueno', () => {
    const { container } = render(<Controlado accept=".xlsx" />)
    fireEvent.drop(caja(container), { dataTransfer: { files: [archivoDe('foto.png', 10)] } })
    expect(screen.getByText(/Ese formato no se admite/)).toBeInTheDocument()
    fireEvent.drop(caja(container), { dataTransfer: { files: [archivoDe('ok.xlsx', 10)] } })
    expect(screen.queryByText(/Ese formato no se admite/)).toBeNull()
    expect(screen.getByText('ok.xlsx')).toBeInTheDocument()
  })

  it('el accept también entiende comodines de tipo (image/*) y tipos exactos', () => {
    const alCambiar = vi.fn()
    const { container } = render(<CampoArchivo archivo={null} onChange={alCambiar} accept="image/*,application/pdf" />)
    fireEvent.drop(caja(container), { dataTransfer: { files: [archivoDe('x.webp', 1, 'image/webp')] } })
    fireEvent.drop(caja(container), { dataTransfer: { files: [archivoDe('x.pdf', 1, 'application/pdf')] } })
    fireEvent.drop(caja(container), { dataTransfer: { files: [archivoDe('x.txt', 1, 'text/plain')] } })
    expect(alCambiar).toHaveBeenCalledTimes(2)
  })

  it('sin accept se acepta cualquier archivo', () => {
    const alCambiar = vi.fn()
    const { container } = render(<CampoArchivo archivo={null} onChange={alCambiar} />)
    fireEvent.drop(caja(container), { dataTransfer: { files: [archivoDe('x.lo-que-sea', 1)] } })
    expect(alCambiar).toHaveBeenCalledTimes(1)
  })

  it('soltar sin archivos (texto arrastrado) no hace nada', () => {
    const alCambiar = vi.fn()
    const { container } = render(<CampoArchivo archivo={null} onChange={alCambiar} />)
    fireEvent.drop(caja(container), { dataTransfer: { files: [] } })
    expect(alCambiar).not.toHaveBeenCalled()
  })

  it('deshabilitado ni se resalta ni acepta lo soltado', () => {
    const alCambiar = vi.fn()
    const { container } = render(<CampoArchivo archivo={null} onChange={alCambiar} disabled />)
    fireEvent.dragEnter(caja(container))
    expect(caja(container)).not.toHaveAttribute('data-arrastrando')
    fireEvent.drop(caja(container), { dataTransfer: { files: [archivoDe('a.zip', 1)] } })
    expect(alCambiar).not.toHaveBeenCalled()
  })
})

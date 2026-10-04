// Los códigos (barras, SKU, balanza…) y las variantes (talle/color, presentaciones) de un producto, en un diálogo.
// Lo abre `Productos` con `conDetalle`. El backend es `GET`/`POST /api/productos/{id}/codigos` y `/variantes`
// (`libracommerce.web.catalogo_router`, v0.19.0).
import { useEffect, useState } from 'react'

import { api } from '../api-client'
import { BadgeEstado } from '../badge-estado'
import { describeErrorHttp } from './errores-http'
import type { CodigoProducto, Producto, VarianteProducto } from './tipos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/** Los tipos de código que acepta el backend (`catalogo.TIPOS_DE_CODIGO`) con su rótulo. */
export const TIPOS_DE_CODIGO: Record<string, string> = {
  internal: 'Interno', barcode: 'Código de barras', sku: 'SKU', scale: 'Balanza', other: 'Otro',
}

const AYUDA_SOLO_LECTURA = 'Tu rol sólo puede ver los códigos y variantes de este producto.'

/** `conEdicionDelProducto` (ADR-013, por defecto `true`): con `false` (el rol sólo repone, como el depósito de VentaLibra) la lista se ve pero no se ofrece nada que escriba
 *  —agregar códigos ni variantes—, y una nota lo dice. El backend lo rechazaría con 403. */
export function ProductoCodigosVariantes({ producto, onClose, conEdicionDelProducto = true }: { producto: Producto; onClose: () => void; conEdicionDelProducto?: boolean }) {
  const [codigos, setCodigos] = useState<CodigoProducto[]>([])
  const [variantes, setVariantes] = useState<VarianteProducto[]>([])
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState('barcode')
  const [codigo, setCodigo] = useState('')
  const [guardandoCodigo, setGuardandoCodigo] = useState(false)

  const [sku, setSku] = useState('')
  const [nombre, setNombre] = useState('')
  const [guardandoVariante, setGuardandoVariante] = useState(false)

  async function cargar() {
    try {
      const [c, v] = await Promise.all([
        api.get<CodigoProducto[]>(`/api/productos/${producto.id}/codigos`),
        api.get<VarianteProducto[]>(`/api/productos/${producto.id}/variantes`),
      ])
      setCodigos(c)
      setVariantes(v)
    } catch (err) {
      setError(describeErrorHttp(err))
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto.id])

  async function agregarCodigo() {
    if (!codigo.trim()) return
    setGuardandoCodigo(true)
    setError(null)
    try {
      await api.post(`/api/productos/${producto.id}/codigos`, { tipo, codigo: codigo.trim() })
      setCodigo('')
      await cargar()
    } catch (err) {
      setError(describeErrorHttp(err))
    } finally {
      setGuardandoCodigo(false)
    }
  }

  async function agregarVariante() {
    if (!sku.trim() || !nombre.trim()) return
    setGuardandoVariante(true)
    setError(null)
    try {
      await api.post(`/api/productos/${producto.id}/variantes`, { sku: sku.trim(), nombre: nombre.trim() })
      setSku('')
      setNombre('')
      await cargar()
    } catch (err) {
      setError(describeErrorHttp(err))
    } finally {
      setGuardandoVariante(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{producto.nombre}</DialogTitle>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!conEdicionDelProducto && <p className="text-sm text-muted-foreground">{AYUDA_SOLO_LECTURA}</p>}

        <div className="grid gap-2">
          <h4 className="text-sm font-medium">Códigos</h4>
          <div className="flex flex-wrap gap-2">
            {codigos.length === 0 && <p className="text-sm text-muted-foreground">Sin códigos todavía.</p>}
            {codigos.map((c) => (
              <BadgeEstado key={c.id} tono={c.es_principal ? 'ok' : 'neutro'}>
                {TIPOS_DE_CODIGO[c.tipo] ?? c.tipo}: {c.codigo}
              </BadgeEstado>
            ))}
          </div>
          {conEdicionDelProducto && <div className="flex items-end gap-2">
            <div className="grid gap-2">
              <Label htmlFor="codigo-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => v && setTipo(v)}>
                <SelectTrigger id="codigo-tipo" className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS_DE_CODIGO).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid flex-1 gap-2">
              <Label htmlFor="codigo-valor">Código</Label>
              <Input id="codigo-valor" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
            <Button onClick={agregarCodigo} disabled={guardandoCodigo}>Agregar</Button>
          </div>}
        </div>

        <div className="grid gap-2 border-t pt-4">
          <h4 className="text-sm font-medium">Variantes (talle/color)</h4>
          <div className="flex flex-wrap gap-2">
            {variantes.length === 0 && <p className="text-sm text-muted-foreground">Sin variantes todavía.</p>}
            {variantes.map((v) => <Badge key={v.id} variant="outline">{v.sku} — {v.nombre}</Badge>)}
          </div>
          {conEdicionDelProducto && <div className="flex items-end gap-2">
            <div className="grid gap-2">
              <Label htmlFor="variante-sku">SKU</Label>
              <Input id="variante-sku" value={sku} onChange={(e) => setSku(e.target.value)} className="w-32" />
            </div>
            <div className="grid flex-1 gap-2">
              <Label htmlFor="variante-nombre">Nombre (ej. M / Azul)</Label>
              <Input id="variante-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <Button onClick={agregarVariante} disabled={guardandoVariante}>Agregar</Button>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

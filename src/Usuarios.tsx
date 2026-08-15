// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era byte-idéntico -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md.
import { useEffect, useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Pencil, UserCheck, UserX } from 'lucide-react'
import { api, ApiError, type User } from './api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable, sortableHeader } from './data-table'
import { PasswordInput } from './PasswordInput'

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

const EMPTY = { username: '', name: '', password: '', role: 'staff' }

// `basePath` es la ruta del router de usuarios en el backend -- default
// '/users' preserva el comportamiento anterior a esta prop
// (Gestiolibra/MedLibra/VentaLibra montan `users.router` en `/users`).
// LibraDesk monta el suyo en `/api/usuarios` y pasa esa ruta explicita.
export function Usuarios({ basePath = '/users' }: { basePath?: string } = {}) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      setUsers(await api.get<User[]>(basePath))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  function startCreate() {
    setEditingId('new')
    setForm(EMPTY)
  }

  function startEdit(user: User) {
    setEditingId(user.id)
    setForm({ username: user.username, name: user.name, password: '', role: user.role })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY)
  }

  async function handleSave() {
    if (!form.name.trim() || (editingId === 'new' && (!form.username.trim() || !form.password))) {
      setError('Completá los campos obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editingId === 'new') {
        await api.post(basePath, {
          username: form.username.trim(), name: form.name.trim(),
          password: form.password, role: form.role,
        })
      } else if (editingId) {
        await api.put(`${basePath}/${editingId}`, { name: form.name.trim(), role: form.role, active: true })
      }
      cancelEdit()
      await load()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(user: User) {
    setError(null)
    try {
      await api.put(`${basePath}/${user.id}`, { name: user.name, role: user.role, active: !user.active })
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  const columns = useMemo<ColumnDef<User>[]>(() => [
    { accessorKey: 'username', header: sortableHeader('Usuario') },
    { accessorKey: 'name', header: 'Nombre' },
    { accessorKey: 'role', header: 'Rol', cell: ({ row }) => <span className="capitalize">{row.original.role}</span> },
    {
      accessorKey: 'active',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge variant={row.original.active ? 'default' : 'outline'}>
          {row.original.active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      // Iconos y no palabras (pedido del humano, 2026-08-15): era la última
      // grilla de la familia que rotulaba sus acciones con texto, y con dos
      // botones por fila el listado se leía como una columna de párrafos.
      //
      // El nombre accesible NO se pierde con el icono: va en `aria-label`, y
      // además nombra al usuario de la fila. Un `title="Editar"` repetido en
      // veinte filas no distingue una de otra para quien navega por teclado.
      cell: ({ row }) => {
        const u = row.original
        const alterna = u.active ? 'Desactivar' : 'Activar'
        return (
          <div className="flex justify-end gap-2">
            <Button size="icon" variant="outline" className="size-8"
                    title="Editar" aria-label={`Editar ${u.name}`}
                    onClick={() => startEdit(u)}>
              <Pencil />
            </Button>
            <Button size="icon" variant="outline" className="size-8"
                    title={alterna} aria-label={`${alterna} ${u.name}`}
                    onClick={() => handleDeactivate(u)}>
              {u.active ? <UserX /> : <UserCheck />}
            </Button>
          </div>
        )
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Usuarios</h2>
        <Button onClick={startCreate}>+ Nuevo usuario</Button>
      </div>

      {/* El error de una acción de la grilla —activar, desactivar— se lee acá.
          El del guardado va adentro del modal, que es donde está la vista. */}
      {error && editingId === null && <p className="text-sm text-destructive">{error}</p>}

      {/* Alta y edición en modal (pedido del humano, 2026-08-15). Era una
          tarjeta que se insertaba entre el encabezado y la grilla: empujaba la
          tabla hacia abajo, y en la edición dejaba al usuario que se estaba
          tocando fuera de la vista. Las dos comparten diálogo porque son el
          mismo formulario con dos campos de más en el alta. */}
      <Dialog open={editingId !== null} onOpenChange={(o) => { if (!o) cancelEdit() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId === 'new' ? 'Nuevo usuario' : 'Editar usuario'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {editingId === 'new' && (
              <div className="grid gap-2">
                <Label htmlFor="usr-username">Usuario</Label>
                <Input id="usr-username" value={form.username} autoFocus
                       onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="usr-name">Nombre</Label>
              <Input id="usr-name" value={form.name} autoFocus={editingId !== 'new'}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {editingId === 'new' && (
              <div className="grid gap-2">
                <Label htmlFor="usr-password">Contraseña</Label>
                <PasswordInput id="usr-password" value={form.password}
                               onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="usr-role">Rol</Label>
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger id="usr-role" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelEdit}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : editingId === 'new' ? 'Crear' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <DataTable
              columns={columns}
              data={users}
              emptyMessage="Sin usuarios todavía."
              search={{
                // El rol se busca por como se ve en la tabla ('admin' /
                // 'staff'), que es tambien como se guarda.
                campos: (u) => [u.username, u.name, u.role],
                placeholder: 'Buscar por usuario, nombre o rol',
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

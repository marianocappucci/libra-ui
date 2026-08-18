// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era byte-idéntico -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md.
import { useEffect, useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { KeyRound, Pencil, UserCheck, UserX } from 'lucide-react'
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

const EMPTY = { username: '', name: '', password: '', email: '', role: 'staff', active: true }

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
  // El cambio de contraseña ajena tiene su propio diálogo y su propio estado
  // de error -- ver el comentario del segundo `Dialog`, abajo.
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)

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
    setForm({
      username: user.username, name: user.name, password: '',
      email: user.email ?? '', role: user.role,
      // 🔴 Se arrastra el estado REAL del usuario. Antes el guardado mandaba
      // `active: true` fijo, así que editarle el nombre o el correo a alguien
      // desactivado lo reactivaba sin decir nada -- y quien lo editó no tenía
      // por qué mirar la columna Estado después de cambiar un apellido. El
      // formulario no ofrece tocarlo (para eso está el botón de la grilla):
      // lo que hace falta es no pisarlo.
      active: user.active,
    })
    setEditingId(user.id)
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
          password: form.password, email: form.email.trim(), role: form.role,
        })
      } else if (editingId) {
        await api.put(`${basePath}/${editingId}`, {
          name: form.name.trim(), role: form.role, active: form.active,
          email: form.email.trim(),
        })
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
      // Sin `email` a propósito, y no por olvido: el backend interpreta su
      // ausencia como "dejalo como está". Mandar `user.email ?? ''` sería peor
      // que no mandarlo -- contra un producto cuyo listado todavía no devuelve
      // el campo, activar o desactivar a alguien le borraría el correo.
      await api.put(`${basePath}/${user.id}`, { name: user.name, role: user.role, active: !user.active })
      await load()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function startPasswordChange(user: User) {
    setPasswordUser(user)
    setNewPassword('')
    setPasswordError(null)
  }

  async function handlePasswordSave() {
    if (!passwordUser) return
    if (!newPassword.trim()) {
      setPasswordError('Escribí la contraseña nueva.')
      return
    }
    setSavingPassword(true)
    setPasswordError(null)
    try {
      await api.put(`${basePath}/${passwordUser.id}/password`, { password: newPassword })
      setPasswordUser(null)
      setNewPassword('')
    } catch (err) {
      setPasswordError(describeError(err))
    } finally {
      setSavingPassword(false)
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
            {/* La llave y no un candado: el candado es el vocabulario de
                "bloqueado/permitido" y esto no bloquea nada. De lucide y no de
                `iconos-accion`, para no dejar esta grilla con dos juegos de
                iconos: los otros dos botones también son de lucide. */}
            <Button size="icon" variant="outline" className="size-8"
                    title="Cambiar contraseña" aria-label={`Cambiar contraseña de ${u.name}`}
                    onClick={() => startPasswordChange(u)}>
              <KeyRound />
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
            {/* El correo se edita en las dos, alta y edición: es la dirección a
                la que llega el mail de "olvidé mi contraseña", y un campo que
                sólo se pudiera cargar en el alta dejaría afuera a todos los
                usuarios que ya existen -- que son justamente los que se quedan
                sin entrar. Opcional: el formato lo valida el navegador con
                `type="email"`, y dejarlo vacío no bloquea el guardado. */}
            <div className="grid gap-2">
              <Label htmlFor="usr-email">
                Correo <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="usr-email" type="email" value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} />
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

      {/* El cambio de contraseña ajena va en un diálogo aparte y NO como un
          campo más de la edición.

          Es una operación de otra naturaleza: la edición se guarda entera de
          una, y una contraseña metida ahí adentro viajaría —o se olvidaría a
          medio tipear— cada vez que alguien corrige un apellido. Separada, la
          acción es una sola cosa: o cambia la clave o falla. Y el título dice a
          quién se le está cambiando, que es lo que evita cambiársela por error
          al usuario de la fila de al lado. */}
      <Dialog open={passwordUser !== null} onOpenChange={(o) => { if (!o) setPasswordUser(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar contraseña de {passwordUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            <div className="grid gap-2">
              <Label htmlFor="usr-nueva-password">Contraseña nueva</Label>
              <PasswordInput id="usr-nueva-password" value={newPassword} autoFocus
                             onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            {/* Se dice en la pantalla y no sólo en el código: quien la escribe
                no es quien la va a usar, así que la única forma de que la
                persona termine con una clave que sólo ella sepa es que la
                cambie al entrar. Esa pantalla ya existe: es la de cambiar la
                propia contraseña, contra `/auth/change-password`. */}
            <p className="text-sm text-muted-foreground">
              Se la vas a tener que decir. Pedile que la cambie desde su propio
              perfil apenas entre.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordUser(null)}>Cancelar</Button>
            <Button onClick={handlePasswordSave} disabled={savingPassword}>
              {savingPassword ? 'Guardando…' : 'Cambiar'}
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

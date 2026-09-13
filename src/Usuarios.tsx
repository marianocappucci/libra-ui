// Extraído 2026-07-26 de Gestiolibra/MedLibra/VentaLibra, donde este
// archivo era byte-idéntico -- ver
// wiki/analyses/auditoria-duplicacion-familia-libra.md.
import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from './data-table'
import { KeyRound, Pencil, Trash2, UserCheck, UserX } from 'lucide-react'
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
// Mismo `ConfirmDialog` que ya usan las otras ~15 pantallas de este paquete
// (Cajas, Clientes, FacturaDetalle, etc.) -- envuelve el `AlertDialog` de
// shadcn y vive en el producto consumidor (`@/components/confirm-dialog`),
// no acá adentro, siguiendo la misma convención que `@/components/ui/*`.
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable, sortableHeader } from './data-table'
import { PasswordInput } from './PasswordInput'
import type { ComponentType } from 'react'
import { TituloPantalla } from './titulo-pantalla'

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail
  return 'Error de conexión.'
}

/** Un rol seleccionable en el formulario de alta/edición. */
export type Rol = { value: string; label: string }

// Default EXACTO al comportamiento previo a la prop `roles` (mismo orden:
// Staff primero) -- un consumidor que no pase la prop no ve ningún cambio.
const ROLES_POR_DEFECTO: Rol[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
]

const PASSWORD_MIN = 6
const passwordCorta = (password: string) => password.length < PASSWORD_MIN
const MSG_PASSWORD_CORTA = `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.`

function formVacio(roles: Rol[]) {
  return { username: '', name: '', password: '', email: '', role: roles[0]?.value ?? '', active: true }
}

// `basePath` es la ruta del router de usuarios en el backend -- default
// '/users' preserva el comportamiento anterior a esta prop
// (Gestiolibra/MedLibra/VentaLibra montan `users.router` en `/users`).
// LibraDesk monta el suyo en `/api/usuarios` y pasa esa ruta explicita.
export function Usuarios({
  basePath = '/users', icono, roles = ROLES_POR_DEFECTO, permitirEliminar = false, usuarioActualId,
}: {
  basePath?: string
  /** El icono que el sidebar del producto le da a esta pantalla.
   *  **Obligatorio y sin default**: VentaLibra usa `Building2` para
   *  `/usuarios` donde los otros usan `UserCog`, asi que un default aca le
   *  pondria a un producto el icono de otro. Que sea requerido hace que el
   *  compilador —y no un guard— obligue a cada consumidor a decir el suyo. */
  icono: ComponentType<{ className?: string }>
  /** Roles que ofrece el Select de rol, en el orden en que se listan.
   *  Default `[{value:'staff',...},{value:'admin',...}]` -- exactamente el
   *  comportamiento de antes de esta prop, para no cambiarle nada a un
   *  consumidor que no la pase. Contalibra/Restolibra pasarían
   *  admin/operador/cajero(/mozo). */
  roles?: Rol[]
  /** Muestra el botón «Eliminar» de la grilla. Default `false`, a propósito:
   *  subir el pin de libra-ui no le puede aparecer a nadie un botón que su
   *  backend todavía no atiende (o atiende sin la guarda del único admin).
   *  Cada producto lo prende cuando adopta el router de usuarios de
   *  libraauth, que trae `DELETE ${basePath}/:id` con esas guardas. */
  permitirEliminar?: boolean
  /** Id del usuario logueado, si la pantalla lo sabe. Oculta el botón
   *  «Eliminar» en su propia fila -- borrarse a uno mismo es un caso que el
   *  backend rechaza igual, pero mejor no ofrecer el botón que ofrecerlo y
   *  fallar. Sin esta prop (consumidor que no la pasa) el botón se muestra
   *  igual en todas las filas: no hay forma de inventar quién es "uno mismo"
   *  sin que el producto lo diga. */
  usuarioActualId?: string
}) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(() => formVacio(roles))
  const [saving, setSaving] = useState(false)
  // El cambio de contraseña ajena tiene su propio diálogo y su propio estado
  // de error -- ver el comentario del segundo `Dialog`, abajo.
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  // Igual que el cambio de contraseña: confirmación con su propio diálogo,
  // sin estado de error propio -- el error de un borrado que falla es una
  // acción de grilla más y usa el mismo `error` de arriba (ver `handleDelete`).
  const [deletingUser, setDeletingUser] = useState<User | null>(null)

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
    setForm(formVacio(roles))
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
    setForm(formVacio(roles))
  }

  async function handleSave() {
    if (!form.name.trim() || (editingId === 'new' && (!form.username.trim() || !form.password))) {
      setError('Completá los campos obligatorios.')
      return
    }
    // Sólo en el alta: la edición no toca la contraseña (tiene su propio
    // diálogo, ver `handlePasswordSave` más abajo), así que acá `form.password`
    // ni se manda.
    if (editingId === 'new' && passwordCorta(form.password)) {
      setError(MSG_PASSWORD_CORTA)
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

  // El error del backend (ej. "no se puede borrar al único admin") se lee
  // arriba de la grilla -- el mismo mecanismo que ya usa `handleDeactivate`
  // para sus propios errores, y no un cartel propio del diálogo de
  // confirmación, que ya se cerró para cuando la respuesta vuelve.
  async function handleDelete(user: User) {
    setError(null)
    try {
      await api.del(`${basePath}/${user.id}`)
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
    if (passwordCorta(newPassword)) {
      setPasswordError(MSG_PASSWORD_CORTA)
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
    // Contalibra/Restolibra ya la mostraban en su grilla propia (es el correo
    // de "olvidé mi contraseña", editable desde 2026-08-15) -- acá faltaba.
    { accessorKey: 'email', header: 'Correo', cell: ({ row }) => row.original.email || '—' },
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
        // Ni con `permitirEliminar` en false ni en la propia fila del
        // usuario logueado (cuando la pantalla sabe quién es) se ofrece el
        // botón -- ver los comentarios de las dos props, arriba.
        const puedeEliminar = permitirEliminar && u.id !== usuarioActualId
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
            {puedeEliminar && (
              <Button size="icon" variant="outline" className="size-8"
                      title="Eliminar" aria-label={`Eliminar ${u.name}`}
                      onClick={() => setDeletingUser(u)}>
                <Trash2 />
              </Button>
            )}
          </div>
        )
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [permitirEliminar, usuarioActualId])

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <TituloPantalla icono={icono}>Usuarios</TituloPantalla>
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
                               placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
                               onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="usr-role">Rol</Label>
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger id="usr-role" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
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
                             placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
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
                campos: (u) => [u.username, u.name, u.role, u.email],
                placeholder: 'Buscar por usuario, nombre o rol',
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Confirmación antes del borrado -- mismo `ConfirmDialog` que ya usan
          las otras pantallas de este paquete (ver el import, arriba). El
          error del backend NO se lee acá adentro: para cuando la respuesta
          vuelve el diálogo ya se cerró, y `handleDelete` lo manda al cartel de
          arriba de la grilla, igual que el toggle de activo/inactivo. */}
      <ConfirmDialog
        open={deletingUser !== null}
        onOpenChange={(o) => { if (!o) setDeletingUser(null) }}
        title={`¿Eliminar a ${deletingUser?.name ?? ''}?`}
        description="Esta acción no se puede deshacer."
        onConfirm={() => { if (deletingUser) { void handleDelete(deletingUser); setDeletingUser(null) } }}
      />
    </div>
  )
}

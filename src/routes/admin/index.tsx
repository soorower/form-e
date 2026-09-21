import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Hourglass,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { useConvexReady } from '#/lib/convex/hooks'
import { pickText } from '#/lib/questionnaire/factory'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/admin/')({
  head: () => ({ meta: [{ title: 'Admin · Form-E' }] }),
  component: AdminRoute,
})

type Overview = NonNullable<FunctionReturnType<typeof api.admin.overview>>
type Group = Overview['groups'][number]
type Person = Overview['users'][number]
type Survey = Overview['surveys'][number]

/** Select value standing for "no group"; group ids are UUIDs, so it cannot collide. */
const NO_GROUP = 'none'

type MemberRole = 'builder' | 'surveyor'
const ROLE_ITEMS: Record<MemberRole, string> = { builder: 'Builder', surveyor: 'Surveyor' }

/** Builder (builds, fills, downloads) or surveyor (fills assigned surveys only). */
function RoleSelect({
  value,
  onChange,
  label,
}: {
  value: MemberRole
  onChange: (role: MemberRole) => void
  label: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next === 'surveyor' ? 'surveyor' : 'builder')}
      items={ROLE_ITEMS}
    >
      <SelectTrigger size="sm" className="w-32" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="builder">Builder</SelectItem>
        <SelectItem value="surveyor">Surveyor</SelectItem>
      </SelectContent>
    </Select>
  )
}

/** A surveyor's code, saved when editing settles. */
function CodeField({
  userId,
  code,
  run,
}: {
  userId: Person['id']
  code: string | null
  run: (task: Promise<unknown>) => Promise<void>
}) {
  const setSurveyorCode = useMutation(api.admin.setSurveyorCode)
  const [value, setValue] = useState(code ?? '')
  useEffect(() => setValue(code ?? ''), [code])
  function save() {
    const next = value.trim().toUpperCase()
    if (next && next !== (code ?? '')) void run(setSurveyorCode({ userId, code: next }))
    else setValue(code ?? '')
  }
  return (
    <Input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      aria-label="Surveyor code"
      placeholder="S01"
      className="h-8 w-24 font-mono uppercase"
    />
  )
}

function errorText(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/** Runs a mutation and keeps its error message for the panel to show. */
function useAction() {
  const [error, setError] = useState<string | null>(null)
  async function run(task: Promise<unknown>) {
    setError(null)
    try {
      await task
    } catch (caught) {
      setError(errorText(caught))
    }
  }
  return { error, run }
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {text}
    </p>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Active</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
      Paused
    </Badge>
  )
}

function StatusBadge({ status }: { status: Person['status'] }) {
  if (status === 'approved') {
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Approved</Badge>
  }
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>
  return (
    <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
      Waiting
    </Badge>
  )
}

/** Signed-up accounts the admin has not decided on yet. */
function pendingUsers(users: Person[]): Person[] {
  return users.filter((person) => person.role !== 'admin' && person.status === 'pending')
}

function AdminRoute() {
  return (
    <RequireAuth admin>
      <AdminPage />
    </RequireAuth>
  )
}

/**
 * Approvals, groups, people, and surveys. Every sign-up waits here until the
 * admin approves it and puts it in a group; from then on the account can
 * build questionnaires and run the surveys owned by that group.
 */
function AdminPage() {
  const ready = useConvexReady()
  const data = useQuery(api.admin.overview, ready ? {} : 'skip')
  const [tab, setTab] = useState('groups')

  if (data === undefined) {
    return <main className="page-wrap-wide px-4 py-12 text-muted-foreground">Loading…</main>
  }
  if (data === null) return null

  const activeGroups = data.groups.filter((group) => group.approved).length
  const unassigned = data.surveys.filter((survey) => survey.groupId === null).length
  const pending = pendingUsers(data.users)

  return (
    <main className="page-wrap-wide px-4 py-10">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Approvals and access</h1>
        <p className="max-w-2xl text-muted-foreground">
          Everyone who signs up waits here until you approve them as a builder or a surveyor.
          You can build and follow surveys yourself from the Surveys and Dashboard links above,
          on this admin sign-in.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Hourglass}
          label="Waiting for approval"
          value={pending.length}
          tone={pending.length > 0 ? 'amber' : 'default'}
        />
        <StatTile icon={Users} label="Groups" value={data.groups.length} />
        <StatTile icon={ShieldCheck} label="Active groups" value={activeGroups} tone="green" />
        <StatTile
          icon={unassigned > 0 ? AlertTriangle : ClipboardList}
          label="Surveys without a group"
          value={unassigned}
          tone={unassigned > 0 ? 'amber' : 'default'}
        />
      </div>

      {pending.length > 0 && (
        <div className="mt-8">
          <PendingApprovals users={pending} groups={data.groups} />
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="mt-8">
        <TabsList>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="people">
            People
            {pending.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="surveys">Surveys</TabsTrigger>
        </TabsList>
        <TabsContent value="groups" className="mt-6">
          <GroupsTab groups={data.groups} />
        </TabsContent>
        <TabsContent value="people" className="mt-6">
          <PeopleTab users={data.users} groups={data.groups} />
        </TabsContent>
        <TabsContent value="surveys" className="mt-6">
          <SurveysTab surveys={data.surveys} groups={data.groups} users={data.users} />
        </TabsContent>
      </Tabs>
    </main>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Users
  label: string
  value: number
  tone?: 'default' | 'green' | 'amber'
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          tone === 'green' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
          tone === 'amber' && 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
          tone === 'default' && 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-3xl font-extrabold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- approvals */

function PendingApprovals({ users, groups }: { users: Person[]; groups: Group[] }) {
  const { error, run } = useAction()
  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hourglass className="size-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          Waiting for your approval
        </CardTitle>
        <CardDescription>
          These people have signed up and can do nothing until you decide. Pick what each will
          do: a <strong>builder</strong> builds surveys, previews and fills them, and downloads
          responses; a <strong>surveyor</strong> only fills the surveys assigned to them and
          follows their team. Then approve or reject.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ErrorLine text={error} />
        <ul className="divide-y divide-border rounded-xl border border-border">
          {users.map((person) => (
            <PendingRow key={person.id} person={person} groups={groups} run={run} />
          ))}
        </ul>
        {groups.length === 0 && (
          <p className="text-xs text-muted-foreground">
            There are no groups yet. Approved people can still build their own surveys; create a
            group when several people should work on the same surveys.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function PendingRow({
  person,
  groups,
  run,
}: {
  person: Person
  groups: Group[]
  run: (task: Promise<unknown>) => Promise<void>
}) {
  const setUserStatus = useMutation(api.admin.setUserStatus)
  const active = groups.filter((group) => group.approved)
  const [role, setRole] = useState<MemberRole>('builder')
  const [code, setCode] = useState('')
  const [groupId, setGroupId] = useState<string>(active.length === 1 ? active[0].id : NO_GROUP)
  const items = {
    [NO_GROUP]: 'No group yet',
    ...Object.fromEntries(groups.map((group) => [group.id, group.name])),
  }

  function approve() {
    void run(
      setUserStatus({
        userId: person.id,
        status: 'approved',
        role,
        code: role === 'surveyor' && code.trim() ? code.trim() : undefined,
        groupId: role === 'builder' && groupId !== NO_GROUP ? groupId : undefined,
      }),
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-48 flex-1">
        <p className="font-medium">{person.name ?? person.email ?? 'Unnamed'}</p>
        <p className="text-xs text-muted-foreground">
          {person.name && person.email ? `${person.email} · ` : ''}
          signed up {new Date(person.signedUpAt).toLocaleDateString()}
        </p>
      </div>
      <RoleSelect value={role} onChange={setRole} label={`Role for ${person.email ?? 'this person'}`} />
      {role === 'surveyor' ? (
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Code (auto)"
          aria-label={`Surveyor code for ${person.email ?? 'this person'}`}
          className="h-8 w-32 font-mono uppercase"
        />
      ) : (
        groups.length > 0 && (
          <Select
            value={groupId}
            onValueChange={(value) => setGroupId(String(value ?? NO_GROUP))}
            items={items}
          >
            <SelectTrigger size="sm" className="min-w-44" aria-label={`Group for ${person.email}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>No group yet</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={approve}>
          <Check data-icon="inline-start" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => void run(setUserStatus({ userId: person.id, status: 'rejected' }))}
        >
          <X data-icon="inline-start" />
          Reject
        </Button>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ groups */

function GroupsTab({ groups }: { groups: Group[] }) {
  const createGroup = useMutation(api.admin.createGroup)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const { error, run } = useAction()
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0] ?? null

  async function create(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    await run(
      createGroup({ name }).then((id) => {
        setSelectedId(id)
        setNewName('')
      }),
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
      <aside className="space-y-3">
        <form onSubmit={(event) => void create(event)} className="flex gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New group name"
            aria-label="New group name"
          />
          <Button type="submit" disabled={!newName.trim()}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        </form>
        <ErrorLine text={error} />
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No groups yet. A group lets several approved people share the same surveys.
          </p>
        ) : (
          <ol className="space-y-2">
            {groups.map((group) => {
              const active = group.id === selected?.id
              return (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(group.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/60',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {group.name}
                      </span>
                      <ActiveBadge active={group.approved} />
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                      {' · '}
                      {group.surveyCount} {group.surveyCount === 1 ? 'survey' : 'surveys'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </aside>

      {selected ? (
        // Keyed so the name and note drafts reset when another group is picked.
        <GroupPanel key={selected.id} group={selected} />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Create a group to start assigning people.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function GroupPanel({ group }: { group: Group }) {
  const updateGroup = useMutation(api.admin.updateGroup)
  const removeGroup = useMutation(api.admin.removeGroup)
  const addMember = useMutation(api.admin.addMember)
  const removeMember = useMutation(api.admin.removeMember)
  const [name, setName] = useState(group.name)
  const [note, setNote] = useState(group.note)
  const [email, setEmail] = useState('')
  const { error, run } = useAction()

  // Name and note save when editing settles (blur / Enter), not per keystroke.
  function saveName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === group.name) {
      setName(group.name)
      return
    }
    void run(updateGroup({ id: group.id, name: trimmed }))
  }

  function saveNote() {
    if (note.trim() === group.note) return
    void run(updateGroup({ id: group.id, note }))
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!email.trim()) return
    await run(addMember({ groupId: group.id, email }).then(() => setEmail('')))
  }

  function remove() {
    const ok = window.confirm(
      `Delete the group "${group.name}"? Its members lose access. Its surveys are kept and can be assigned to another group.`,
    )
    if (ok) void run(removeGroup({ id: group.id }))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={blurOnEnter}
              className="max-w-md text-base font-semibold"
            />
          </div>
          <Label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3">
            <Switch
              checked={group.approved}
              onCheckedChange={(checked) =>
                void run(updateGroup({ id: group.id, approved: checked }))
              }
              aria-label="Active"
            />
            <span className="text-sm">
              <span className="block font-semibold">{group.approved ? 'Active' : 'Paused'}</span>
              <span className="block font-normal text-muted-foreground">
                {group.approved
                  ? 'Members share this group\'s surveys'
                  : 'Members cannot see this group\'s surveys'}
              </span>
            </span>
          </Label>
        </div>
        <CardDescription>
          Created {new Date(group.createdAt).toLocaleDateString()} · {group.surveyCount}{' '}
          {group.surveyCount === 1 ? 'survey' : 'surveys'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Members</h3>
          {group.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody yet. Add people by the email they sign in with.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.members.map((member) => (
                    <TableRow key={member.email}>
                      <TableCell className="font-medium">{member.email}</TableCell>
                      <TableCell className="text-muted-foreground">{member.name ?? '—'}</TableCell>
                      <TableCell>
                        {member.signedUp ? (
                          <Badge variant="secondary">Signed up</Badge>
                        ) : (
                          <Badge variant="outline">Not signed up yet</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${member.email}`}
                          onClick={() =>
                            void run(removeMember({ groupId: group.id, email: member.email }))
                          }
                        >
                          <X />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <form onSubmit={(event) => void add(event)} className="flex flex-wrap gap-2">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@example.com"
              aria-label="Email to add"
              className="min-w-64 flex-1"
            />
            <Button type="submit" variant="outline" disabled={!email.trim()}>
              <UserPlus data-icon="inline-start" />
              Add member
            </Button>
          </form>
        </section>

        <section className="space-y-1.5">
          <Label htmlFor="group-note">Note</Label>
          <Textarea
            id="group-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={saveNote}
            placeholder="What this group is for, who leads it, when the fieldwork runs…"
            rows={3}
          />
        </section>

        <ErrorLine text={error} />

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 p-4">
          <p className="text-sm text-muted-foreground">
            Deleting the group removes its members' access. Surveys are kept.
          </p>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={remove}>
            <Trash2 data-icon="inline-start" />
            Delete group
          </Button>
        </section>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ people */

function PeopleTab({ users, groups }: { users: Person[]; groups: Group[] }) {
  const setRole = useMutation(api.admin.setRole)
  const setUserStatus = useMutation(api.admin.setUserStatus)
  const addMember = useMutation(api.admin.addMember)
  const { error, run } = useAction()
  const groupNames = new Map(groups.map((group) => [group.id, group.name]))
  const groupItems = Object.fromEntries(groups.map((group) => [group.id, group.name]))

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>
          Everyone who has signed up, with your decision and their role. Builders build, fill,
          and download; surveyors only fill the surveys they are assigned to (Surveys tab) and
          carry a code that shows next to their name in progress views.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorLine text={error} />
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Groups</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((person) => {
                const open = groups.filter((group) => !person.groupIds.includes(group.id))
                return (
                  <TableRow key={person.id}>
                    <TableCell>
                      <p className="font-medium">{person.name ?? person.email ?? 'Unnamed'}</p>
                      {person.name && person.email && (
                        <p className="text-xs text-muted-foreground">{person.email}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={person.status} />
                    </TableCell>
                    <TableCell>
                      {person.role === 'admin' ? (
                        <Badge>Admin</Badge>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <RoleSelect
                            value={person.role}
                            onChange={(role) => void run(setRole({ userId: person.id, role }))}
                            label={`Role for ${person.email ?? 'this person'}`}
                          />
                          {person.role === 'surveyor' && (
                            <CodeField userId={person.id} code={person.code} run={run} />
                          )}
                        </div>
                      )}
                      {person.isViewer && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {person.groupIds.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {person.groupIds.map((id) => (
                            <Badge key={id} variant="outline">
                              {groupNames.get(id) ?? 'Unknown group'}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {person.role !== 'admin' && person.status !== 'approved' && (
                          <Button
                            size="sm"
                            onClick={() =>
                              void run(setUserStatus({ userId: person.id, status: 'approved' }))
                            }
                          >
                            <Check data-icon="inline-start" />
                            Approve
                          </Button>
                        )}
                        {person.role !== 'admin' && person.status !== 'rejected' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() =>
                              void run(setUserStatus({ userId: person.id, status: 'rejected' }))
                            }
                          >
                            <X data-icon="inline-start" />
                            {person.status === 'approved' ? 'Revoke' : 'Reject'}
                          </Button>
                        )}
                        {person.email && open.length > 0 && (
                          <Select
                            value={null}
                            onValueChange={(value) => {
                              if (value && person.email) {
                                void run(addMember({ groupId: String(value), email: person.email }))
                              }
                            }}
                            items={groupItems}
                          >
                            <SelectTrigger size="sm" aria-label={`Add ${person.email} to a group`}>
                              <SelectValue placeholder="Add to group" />
                            </SelectTrigger>
                            <SelectContent>
                              {open.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {!person.isViewer && !person.bootstrapAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void run(
                                setRole({
                                  userId: person.id,
                                  role: person.role === 'admin' ? 'builder' : 'admin',
                                }),
                              )
                            }
                          >
                            {person.role === 'admin' ? 'Remove admin' : 'Make admin'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Admins listed in the deployment's ADMIN_EMAILS variable stay admins whatever their
          role here. Group membership only matters for builders (shared surveys); surveyors are
          put on surveys one by one.
        </p>
      </CardContent>
    </Card>
  )
}

/* ----------------------------------------------------------------- surveys */

function SurveysTab({
  surveys,
  groups,
  users,
}: {
  surveys: Survey[]
  groups: Group[]
  users: Person[]
}) {
  const assign = useMutation(api.admin.assignSurvey)
  const assignOwner = useMutation(api.admin.assignOwner)
  const assignSurveyor = useMutation(api.teams.assign)
  const unassignSurveyor = useMutation(api.teams.unassign)
  const { error, run } = useAction()
  const surveyorAccounts = users.filter(
    (person) => person.role === 'surveyor' && person.status === 'approved' && person.email,
  )
  // Who can own a survey: approved builders and admins.
  const ownerAccounts = users.filter(
    (person) => person.role !== 'surveyor' && person.status === 'approved',
  )
  const ownerItems = {
    [NO_GROUP]: 'No owner',
    ...Object.fromEntries(
      ownerAccounts.map((person) => [person.id, person.name ?? person.email ?? 'Unnamed']),
    ),
  }
  const items = {
    [NO_GROUP]: 'No group',
    ...Object.fromEntries(groups.map((group) => [group.id, group.name])),
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Surveys</CardTitle>
        <CardDescription>
          Every survey: its owner, the group that shares it, and the surveyors who fill it. The
          owner and the group's builders can edit the survey and see its responses; a survey with
          neither is visible to admins only, so hand older surveys to a builder here. Putting a
          surveyor on a survey is what makes it appear on their "My surveys" page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorLine text={error} />
        {surveys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No surveys yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Survey</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Surveyors</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveys.map((survey) => {
                  const title = pickText(survey.title, survey.defaultLanguage) || 'Untitled survey'
                  return (
                    <TableRow key={survey.id}>
                      <TableCell>
                        <p lang={survey.defaultLanguage} className="font-medium">
                          {title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Updated {new Date(survey.updatedAt).toLocaleDateString()}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={survey.ownerId ?? NO_GROUP}
                          onValueChange={(value) =>
                            void run(
                              assignOwner({
                                questionnaireId: survey.id,
                                ownerId:
                                  value && value !== NO_GROUP
                                    ? (String(value) as (typeof ownerAccounts)[number]['id'])
                                    : null,
                              }),
                            )
                          }
                          items={ownerItems}
                        >
                          <SelectTrigger
                            size="sm"
                            className={cn(
                              'min-w-40',
                              !survey.ownerId && !survey.groupId && 'border-amber-500/60',
                            )}
                            aria-label={`Owner of ${title}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_GROUP}>No owner</SelectItem>
                            {ownerAccounts.map((person) => (
                              <SelectItem key={person.id} value={person.id}>
                                {person.name ?? person.email ?? 'Unnamed'}
                                {person.role === 'admin' ? ' (admin)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {survey.teamName.trim() || '—'}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={survey.groupId ?? NO_GROUP}
                          onValueChange={(value) =>
                            void run(
                              assign({
                                questionnaireId: survey.id,
                                groupId: value && value !== NO_GROUP ? String(value) : null,
                              }),
                            )
                          }
                          items={items}
                        >
                          <SelectTrigger
                            size="sm"
                            className={cn('min-w-40', !survey.groupId && 'border-amber-500/60')}
                            aria-label={`Group for ${title}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_GROUP}>No group</SelectItem>
                            {groups.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                {group.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {survey.surveyors.map((surveyor) => (
                            <Badge key={surveyor.email} variant="secondary" className="gap-1 pr-1">
                              {surveyor.name}
                              {surveyor.code && (
                                <span className="font-mono text-[10px] font-semibold opacity-70">
                                  {surveyor.code}
                                </span>
                              )}
                              <button
                                type="button"
                                aria-label={`Remove ${surveyor.name} from ${title}`}
                                onClick={() =>
                                  void run(
                                    unassignSurveyor({ questionnaireId: survey.id, email: surveyor.email }),
                                  )
                                }
                                className="rounded-full p-0.5 transition-colors hover:bg-foreground/10"
                              >
                                <X className="size-3" aria-hidden="true" />
                              </button>
                            </Badge>
                          ))}
                          {(() => {
                            const open = surveyorAccounts.filter(
                              (person) =>
                                !survey.surveyors.some(
                                  (surveyor) => surveyor.email === person.email!.toLowerCase(),
                                ),
                            )
                            if (open.length === 0) return null
                            return (
                              <Select
                                value={null}
                                onValueChange={(value) => {
                                  if (value) {
                                    void run(
                                      assignSurveyor({ questionnaireId: survey.id, email: String(value) }),
                                    )
                                  }
                                }}
                                items={Object.fromEntries(
                                  open.map((person) => [
                                    person.email!,
                                    person.code
                                      ? `${person.name ?? person.email} (${person.code})`
                                      : (person.name ?? person.email!),
                                  ]),
                                )}
                              >
                                <SelectTrigger size="sm" aria-label={`Add a surveyor to ${title}`}>
                                  <SelectValue placeholder="Add surveyor" />
                                </SelectTrigger>
                                <SelectContent>
                                  {open.map((person) => (
                                    <SelectItem key={person.id} value={person.email!}>
                                      {person.name ?? person.email}
                                      {person.code ? ` (${person.code})` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{survey.responseCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          nativeButton={false}
                          render={<Link to="/admin/surveys/$surveyId" params={{ surveyId: survey.id }} />}
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

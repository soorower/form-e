import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

/**
 * Who may do what.
 *
 * - An **admin** runs the admin panel: creates groups, adds members by email,
 *   approves groups, and assigns surveys to groups. Admins see every survey.
 *   A user is an admin when their `role` is 'admin' or their email is listed
 *   in the deployment's ADMIN_EMAILS variable (the way the first admin gets
 *   in before anyone can promote them).
 * - Every other sign-up is **pending** until the admin approves it (or was
 *   added to a group by email beforehand, which counts as approval). When
 *   approving, the admin picks a role:
 *   - a **builder** builds questionnaires and runs surveys: their own, plus
 *     those of every active group they belong to; they see every response
 *     and download them;
 *   - a **surveyor** only fills the surveys assigned to them (`assignments`)
 *     and follows the team's progress and chat; they never see answers.
 *   Membership and assignment are by email, so they hold across Google and
 *   password sign-in for the same address.
 * - Everyone else is signed in but waiting: they see nothing.
 *
 * Tablet-facing functions (reading one questionnaire, submitting a response)
 * stay public because enumerators in the field do not sign in.
 */

type Ctx = QueryCtx | MutationCtx

export type Role = 'admin' | 'builder' | 'surveyor'

/** The stored role, with the old `member` value and a missing one read as builder. */
export function roleOf(user: Doc<'users'>): Role {
  if (isAdminUser(user)) return 'admin'
  return user.role === 'surveyor' ? 'surveyor' : 'builder'
}

/** What a surveyor's responses are recorded under and how the team sees them. */
export function displayName(user: Doc<'users'>): string {
  return user.name?.trim() || user.email || 'Surveyor'
}

export type AccountStatus = 'pending' | 'approved' | 'rejected'

/**
 * The admin's decision on this account. An account the admin added to a
 * group by email before it signed up is treated as approved: adding it was
 * the decision.
 */
export function accountStatus(user: Doc<'users'>, membershipCount: number): AccountStatus {
  if (user.status === 'rejected') return 'rejected'
  if (user.status === 'approved') return 'approved'
  return membershipCount > 0 ? 'approved' : 'pending'
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Emails that count as admins regardless of their `role` field. */
export function bootstrapAdmins(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean),
  )
}

export function isAdminUser(user: Doc<'users'>): boolean {
  if (user.role === 'admin') return true
  const email = user.email ? normalizeEmail(user.email) : ''
  return email !== '' && bootstrapAdmins().has(email)
}

export async function currentUser(ctx: Ctx): Promise<Doc<'users'> | null> {
  const userId = await getAuthUserId(ctx)
  if (userId === null) return null
  return ctx.db.get(userId)
}

export interface Access {
  user: Doc<'users'>
  admin: boolean
  role: Role
  status: AccountStatus
  /** Active groups the user belongs to. */
  groups: Doc<'groups'>[]
  /** Groups the user belongs to that are paused (not approved). */
  pending: Doc<'groups'>[]
  /** App-level ids of the surveys assigned to this account as a surveyor. */
  assigned: Set<string>
}

/** Admin, or an account the admin has approved (whatever its role). */
export function isApproved(access: Access): boolean {
  return access.admin || access.status === 'approved'
}

/** Admin, or an approved builder: may create and edit surveys and see answers. */
export function canBuild(access: Access): boolean {
  return access.admin || (access.status === 'approved' && access.role === 'builder')
}

export async function groupByAppId(ctx: Ctx, id: string): Promise<Doc<'groups'> | null> {
  return ctx.db
    .query('groups')
    .withIndex('by_app_id', (q) => q.eq('id', id))
    .unique()
}

export async function questionnaireByAppId(
  ctx: Ctx,
  id: string,
): Promise<Doc<'questionnaires'> | null> {
  return ctx.db
    .query('questionnaires')
    .withIndex('by_app_id', (q) => q.eq('id', id))
    .unique()
}

export async function accessFor(ctx: Ctx, user: Doc<'users'>): Promise<Access> {
  const email = user.email ? normalizeEmail(user.email) : ''
  const memberships = email
    ? await ctx.db
        .query('groupMembers')
        .withIndex('by_email', (q) => q.eq('email', email))
        .collect()
    : []
  const groups: Doc<'groups'>[] = []
  const pending: Doc<'groups'>[] = []
  for (const membership of memberships) {
    const group = await groupByAppId(ctx, membership.groupId)
    if (!group) continue
    ;(group.approved ? groups : pending).push(group)
  }
  const assignments = email
    ? await ctx.db
        .query('assignments')
        .withIndex('by_email', (q) => q.eq('email', email))
        .collect()
    : []
  return {
    user,
    admin: isAdminUser(user),
    role: roleOf(user),
    status: accountStatus(user, groups.length + pending.length),
    groups,
    pending,
    assigned: new Set(assignments.map((assignment) => assignment.questionnaireId)),
  }
}

/** The caller's access, or null when not signed in. */
export async function viewerAccess(ctx: Ctx): Promise<Access | null> {
  const user = await currentUser(ctx)
  return user ? accessFor(ctx, user) : null
}

/** Signed in and approved by the admin (any role). */
export async function requireApproved(ctx: Ctx): Promise<Access> {
  const access = await viewerAccess(ctx)
  if (!access) throw new ConvexError('Sign in to continue.')
  if (!isApproved(access)) {
    if (access.status === 'rejected') throw new ConvexError('Your account was not approved.')
    throw new ConvexError('Your account is waiting for approval.')
  }
  return access
}

/** Signed in, approved, and a builder (or admin). */
export async function requireBuilder(ctx: Ctx): Promise<Access> {
  const access = await requireApproved(ctx)
  if (!canBuild(access)) throw new ConvexError('Only survey builders can do that.')
  return access
}

export async function requireAdmin(ctx: Ctx): Promise<Access> {
  const access = await viewerAccess(ctx)
  if (!access || !access.admin) throw new ConvexError('Only an admin can do that.')
  return access
}

interface Owned {
  id: string
  ownerId?: string
  groupId?: string
}

/**
 * Whether this caller may edit the questionnaire and see its responses:
 * admins always, a builder for their own surveys and those of their active
 * groups.
 */
export function canAccess(access: Access | null, questionnaire: Owned): boolean {
  if (!access) return false
  if (access.admin) return true
  if (!canBuild(access)) return false
  if (questionnaire.ownerId === access.user._id) return true
  return (
    questionnaire.groupId !== undefined &&
    access.groups.some((group) => group.id === questionnaire.groupId)
  )
}

/**
 * Whether this caller belongs to the survey's team: everyone who can edit
 * it, plus the surveyors assigned to it. Opens progress, the leaderboard,
 * and the chat, but not the answers.
 */
export function canView(access: Access | null, questionnaire: Owned): boolean {
  if (canAccess(access, questionnaire)) return true
  if (!access || !isApproved(access) || access.role !== 'surveyor') return false
  return access.assigned.has(questionnaire.id)
}

/** Like canAccess, but throws the message the client shows. */
export function assertAccess(access: Access | null, questionnaire: Owned): void {
  if (!canAccess(access, questionnaire)) {
    throw new ConvexError('You do not have access to this survey.')
  }
}

export function assertView(access: Access | null, questionnaire: Owned): void {
  if (!canView(access, questionnaire)) {
    throw new ConvexError('You are not on this survey\'s team.')
  }
}

/**
 * Every questionnaire the caller may see: all for admins, own + groups' for
 * builders, the assigned ones for surveyors.
 */
export async function visibleQuestionnaires(
  ctx: Ctx,
  access: Access | null,
): Promise<Doc<'questionnaires'>[]> {
  if (!access) return []
  if (access.admin) return ctx.db.query('questionnaires').collect()
  if (!isApproved(access)) return []
  if (access.role === 'surveyor') {
    const rows: Doc<'questionnaires'>[] = []
    for (const id of access.assigned) {
      const row = await questionnaireByAppId(ctx, id)
      if (row) rows.push(row)
    }
    return rows
  }
  const seen = new Map<string, Doc<'questionnaires'>>()
  const own = await ctx.db
    .query('questionnaires')
    .withIndex('by_owner', (q) => q.eq('ownerId', access.user._id))
    .collect()
  for (const row of own) seen.set(row.id, row)
  for (const group of access.groups) {
    const rows = await ctx.db
      .query('questionnaires')
      .withIndex('by_group', (q) => q.eq('groupId', group.id))
      .collect()
    for (const row of rows) seen.set(row.id, row)
  }
  return [...seen.values()]
}

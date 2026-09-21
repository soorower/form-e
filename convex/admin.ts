import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  accountStatus,
  bootstrapAdmins,
  displayName,
  groupByAppId,
  isAdminUser,
  normalizeEmail,
  questionnaireByAppId,
  requireAdmin,
  roleOf,
  viewerAccess,
} from './access'
import { role, userStatus } from './validators'

/**
 * The admin panel: groups, who is in them, whether they are approved, and
 * which survey belongs to which group. Every function here is admins-only;
 * `overview` returns null instead of throwing so a page that is still
 * loading auth does not flash an error.
 */

const MAX_NAME_LENGTH = 80
const MAX_NOTE_LENGTH = 500

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!trimmed) throw new ConvexError('Give the group a name.')
  return trimmed
}

const MAX_CODE_LENGTH = 12

function cleanCode(code: string): string {
  return code.trim().toUpperCase().slice(0, MAX_CODE_LENGTH)
}

/** The next free surveyor code in the S01, S02, … series. */
async function nextSurveyorCode(ctx: MutationCtx): Promise<string> {
  const users = await ctx.db.query('users').collect()
  const taken = new Set(users.map((user) => user.surveyorCode).filter(Boolean))
  for (let n = 1; n < 1000; n += 1) {
    const code = `S${String(n).padStart(2, '0')}`
    if (!taken.has(code)) return code
  }
  return `S${Date.now().toString(36).toUpperCase()}`
}

function cleanEmail(email: string): string {
  const normalized = normalizeEmail(email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ConvexError('Enter a valid email address.')
  }
  return normalized
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const access = await viewerAccess(ctx)
    if (!access?.admin) return null

    const [groups, memberships, users, questionnaires, responses, assignments] =
      await Promise.all([
        ctx.db.query('groups').collect(),
        ctx.db.query('groupMembers').collect(),
        ctx.db.query('users').collect(),
        ctx.db.query('questionnaires').collect(),
        ctx.db.query('responses').collect(),
        ctx.db.query('assignments').collect(),
      ])

    const userByEmail = new Map(
      users.filter((user) => user.email).map((user) => [normalizeEmail(user.email!), user]),
    )
    // The same email can have two rows (Google and password sign-in); for a
    // surveyor assignment the surveyor-role row is the one that counts.
    const surveyorByEmail = new Map(
      users
        .filter((user) => user.email && roleOf(user) === 'surveyor')
        .map((user) => [normalizeEmail(user.email!), user]),
    )
    const userById = new Map(users.map((user) => [user._id as string, user]))
    const responseCounts = new Map<string, number>()
    for (const response of responses) {
      responseCounts.set(
        response.questionnaireId,
        (responseCounts.get(response.questionnaireId) ?? 0) + 1,
      )
    }
    const surveyCounts = new Map<string, number>()
    for (const questionnaire of questionnaires) {
      if (!questionnaire.groupId) continue
      surveyCounts.set(questionnaire.groupId, (surveyCounts.get(questionnaire.groupId) ?? 0) + 1)
    }
    const groupsByEmail = new Map<string, string[]>()
    for (const membership of memberships) {
      const list = groupsByEmail.get(membership.email) ?? []
      list.push(membership.groupId)
      groupsByEmail.set(membership.email, list)
    }
    const bootstrap = bootstrapAdmins()
    const surveyorsBySurvey = new Map<string, { email: string; name: string; code: string | null }[]>()
    for (const assignment of assignments) {
      const user = surveyorByEmail.get(assignment.email) ?? userByEmail.get(assignment.email)
      const list = surveyorsBySurvey.get(assignment.questionnaireId) ?? []
      list.push({
        email: assignment.email,
        name: user ? displayName(user) : assignment.email,
        code: user?.surveyorCode ?? null,
      })
      surveyorsBySurvey.set(assignment.questionnaireId, list)
    }

    return {
      groups: groups
        .map((group) => ({
          id: group.id,
          name: group.name,
          approved: group.approved,
          note: group.note,
          createdAt: group.createdAt,
          surveyCount: surveyCounts.get(group.id) ?? 0,
          members: memberships
            .filter((membership) => membership.groupId === group.id)
            .map((membership) => {
              const user = userByEmail.get(membership.email)
              return {
                email: membership.email,
                name: user?.name ?? null,
                signedUp: user !== undefined,
                addedAt: membership.addedAt,
              }
            })
            .sort((a, b) => a.email.localeCompare(b.email)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      users: users
        .map((user) => {
          const email = user.email ? normalizeEmail(user.email) : ''
          const groupIds = email ? (groupsByEmail.get(email) ?? []) : []
          const admin = isAdminUser(user)
          return {
            id: user._id,
            name: user.name ?? null,
            email: user.email ?? null,
            image: user.image ?? null,
            role: roleOf(user),
            code: user.surveyorCode ?? null,
            assignedCount: email
              ? assignments.filter((assignment) => assignment.email === email).length
              : 0,
            // Admins never wait; everyone else needs the admin's decision.
            status: admin ? ('approved' as const) : accountStatus(user, groupIds.length),
            signedUpAt: user._creationTime,
            // Listed in ADMIN_EMAILS: cannot be demoted from the panel.
            bootstrapAdmin: email !== '' && bootstrap.has(email),
            groupIds,
            isViewer: user._id === access.user._id,
          }
        })
        .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '')),
      surveys: questionnaires
        .map((questionnaire) => ({
          id: questionnaire.id,
          title: questionnaire.title,
          defaultLanguage: questionnaire.defaultLanguage,
          teamName: questionnaire.teamName,
          ownerId: questionnaire.ownerId ?? null,
          owner: questionnaire.ownerId
            ? (() => {
                const owner = userById.get(questionnaire.ownerId)
                return owner ? (owner.name ?? owner.email ?? null) : null
              })()
            : null,
          groupId: questionnaire.groupId ?? null,
          surveyors: surveyorsBySurvey.get(questionnaire.id) ?? [],
          responseCount: responseCounts.get(questionnaire.id) ?? 0,
          updatedAt: questionnaire.updatedAt,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }
  },
})

export const createGroup = mutation({
  args: { name: v.string(), approved: v.optional(v.boolean()) },
  handler: async (ctx, { name, approved }) => {
    await requireAdmin(ctx)
    const now = Date.now()
    const group = {
      id: crypto.randomUUID(),
      name: cleanName(name),
      // Groups the admin creates start active; accounts are what get approved.
      approved: approved ?? true,
      note: '',
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert('groups', group)
    return group.id
  },
})

export const updateGroup = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    approved: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, approved, note }) => {
    await requireAdmin(ctx)
    const group = await groupByAppId(ctx, id)
    if (!group) throw new ConvexError('That group no longer exists.')
    await ctx.db.patch(group._id, {
      ...(name !== undefined ? { name: cleanName(name) } : {}),
      ...(approved !== undefined ? { approved } : {}),
      ...(note !== undefined ? { note: note.trim().slice(0, MAX_NOTE_LENGTH) } : {}),
      updatedAt: Date.now(),
    })
  },
})

/** Deletes the group and its memberships; its surveys stay, unassigned. */
export const removeGroup = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx)
    const group = await groupByAppId(ctx, id)
    if (group) await ctx.db.delete(group._id)

    const memberships = await ctx.db
      .query('groupMembers')
      .withIndex('by_group', (q) => q.eq('groupId', id))
      .collect()
    for (const membership of memberships) await ctx.db.delete(membership._id)

    const questionnaires = await ctx.db
      .query('questionnaires')
      .withIndex('by_group', (q) => q.eq('groupId', id))
      .collect()
    for (const questionnaire of questionnaires) {
      await ctx.db.patch(questionnaire._id, { groupId: undefined })
    }
  },
})

export const addMember = mutation({
  args: { groupId: v.string(), email: v.string() },
  handler: async (ctx, { groupId, email }) => {
    await requireAdmin(ctx)
    const group = await groupByAppId(ctx, groupId)
    if (!group) throw new ConvexError('That group no longer exists.')
    const address = cleanEmail(email)
    const existing = await ctx.db
      .query('groupMembers')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .filter((q) => q.eq(q.field('email'), address))
      .unique()
    if (existing) return
    await ctx.db.insert('groupMembers', { groupId, email: address, addedAt: Date.now() })
  },
})

export const removeMember = mutation({
  args: { groupId: v.string(), email: v.string() },
  handler: async (ctx, { groupId, email }) => {
    await requireAdmin(ctx)
    const address = normalizeEmail(email)
    const memberships = await ctx.db
      .query('groupMembers')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .filter((q) => q.eq(q.field('email'), address))
      .collect()
    for (const membership of memberships) await ctx.db.delete(membership._id)
  },
})

/** Give a surveyor their code; empty picks the next free one. */
async function applyRole(
  ctx: MutationCtx,
  user: Doc<'users'>,
  nextRole: 'admin' | 'builder' | 'surveyor' | 'member',
  code: string | undefined,
): Promise<void> {
  const resolved = nextRole === 'member' ? 'builder' : nextRole
  const patch: Partial<Doc<'users'>> = { role: resolved }
  if (resolved === 'surveyor') {
    const cleaned = code !== undefined ? cleanCode(code) : (user.surveyorCode ?? '')
    patch.surveyorCode = cleaned || (await nextSurveyorCode(ctx))
  }
  await ctx.db.patch(user._id, patch)
}

/** Change what an account may do. Admins cannot change their own role. */
export const setRole = mutation({
  args: { userId: v.id('users'), role, code: v.optional(v.string()) },
  handler: async (ctx, { userId, role: nextRole, code }) => {
    const access = await requireAdmin(ctx)
    if (userId === access.user._id) throw new ConvexError('You cannot change your own role.')
    const user = await ctx.db.get(userId)
    if (!user) throw new ConvexError('That user no longer exists.')
    await applyRole(ctx, user, nextRole, code)
  },
})

/** The code shown next to a surveyor's name in progress views. */
export const setSurveyorCode = mutation({
  args: { userId: v.id('users'), code: v.string() },
  handler: async (ctx, { userId, code }) => {
    await requireAdmin(ctx)
    const user = await ctx.db.get(userId)
    if (!user) throw new ConvexError('That user no longer exists.')
    const cleaned = cleanCode(code)
    if (!cleaned) throw new ConvexError('Give the surveyor a code, e.g. S01.')
    const users = await ctx.db.query('users').collect()
    if (users.some((other) => other._id !== userId && other.surveyorCode === cleaned)) {
      throw new ConvexError(`${cleaned} is already used by another surveyor.`)
    }
    await ctx.db.patch(userId, { surveyorCode: cleaned })
  },
})

/**
 * The admin's decision on a sign-up, with the role the account gets. A
 * builder may go straight into a group; a surveyor gets a code (the next
 * free one unless given) and is put on surveys from the Surveys tab.
 */
export const setUserStatus = mutation({
  args: {
    userId: v.id('users'),
    status: userStatus,
    role: v.optional(role),
    code: v.optional(v.string()),
    groupId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, status, role: nextRole, code, groupId }) => {
    const access = await requireAdmin(ctx)
    if (userId === access.user._id) throw new ConvexError('You cannot change your own status.')
    const user = await ctx.db.get(userId)
    if (!user) throw new ConvexError('That user no longer exists.')
    await ctx.db.patch(userId, { status })
    if (status !== 'approved') return
    if (nextRole !== undefined) await applyRole(ctx, user, nextRole, code)
    if (groupId === undefined) return
    if (!user.email) throw new ConvexError('That account has no email to add to a group.')
    const group = await groupByAppId(ctx, groupId)
    if (!group) throw new ConvexError('That group no longer exists.')
    const email = normalizeEmail(user.email)
    const existing = await ctx.db
      .query('groupMembers')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .filter((q) => q.eq(q.field('email'), email))
      .unique()
    if (!existing) await ctx.db.insert('groupMembers', { groupId, email, addedAt: Date.now() })
  },
})

/**
 * Hands a survey to a builder account (or to nobody with null), so surveys
 * made before ownership existed can be worked on by someone other than the
 * admin. The owner sees the survey, edits it, and reads its responses.
 */
export const assignOwner = mutation({
  args: { questionnaireId: v.string(), ownerId: v.union(v.id('users'), v.null()) },
  handler: async (ctx, { questionnaireId, ownerId }) => {
    await requireAdmin(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) throw new ConvexError('That survey no longer exists.')
    if (ownerId !== null) {
      const owner = await ctx.db.get(ownerId)
      if (!owner) throw new ConvexError('That account no longer exists.')
      if (roleOf(owner) === 'surveyor') {
        throw new ConvexError('Surveyors cannot own surveys; pick a builder or an admin.')
      }
    }
    await ctx.db.patch(questionnaire._id, { ownerId: ownerId ?? undefined })
  },
})

/** Moves a survey into a group, or out of every group with null. */
export const assignSurvey = mutation({
  args: { questionnaireId: v.string(), groupId: v.union(v.string(), v.null()) },
  handler: async (ctx, { questionnaireId, groupId }) => {
    await requireAdmin(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) throw new ConvexError('That survey no longer exists.')
    if (groupId !== null && !(await groupByAppId(ctx, groupId))) {
      throw new ConvexError('That group no longer exists.')
    }
    await ctx.db.patch(questionnaire._id, { groupId: groupId ?? undefined })
  },
})

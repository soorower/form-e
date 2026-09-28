import { ConvexError, v, type Infer } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import type { Doc } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  CARD_RESERVATION_MS,
  pickLeastUsed,
  tallyPlanRow,
  tallySets,
  tallyShown,
  type CardCounts,
} from './cardBalance'
import { recordSummary } from './responseSummaries'
import { openShareLink, pinnedSerials } from './shareLinks'
import {
  formatSurveyNumber,
  inRange,
  pickSerial,
  planRowForSerial,
  type SerialRange,
} from './serials'
import {
  accessFor,
  canAccess,
  canBuild,
  canView,
  displayName,
  isApproved,
  questionnaireByAppId,
  requireAdmin,
  requireBuilder,
  roleOf,
  trustedEmail,
  viewerAccess,
  type Access,
  visibleQuestionnaires,
} from './access'
import { lang, respondentDetails } from './validators'

// Reading answers needs builder access to their survey. `progress` gives the
// team (surveyors included) who collected what, without the answers.
// Submitting, the next serial, drawing cards, and card exposure stay public:
// they serve the tablet fill page, where enumerators need not sign in; a
// signed-in surveyor is stamped onto the response by the server.

const MAX_NAME_LENGTH = 120
const MAX_DETAIL_LENGTH = 500
/** Far above any real interview: three blocks of nine scenarios is about 10 KB. */
const MAX_ANSWERS_BYTES = 256 * 1024

type RespondentDetails = Infer<typeof respondentDetails>

/** The respondent's details as stored: trimmed, capped, filled-in ones only. */
function cleanDetails(details: RespondentDetails | undefined): RespondentDetails | undefined {
  if (!details) return undefined
  const cleaned: RespondentDetails = {}
  for (const key of ['name', 'email', 'phone', 'address'] as const) {
    const value = details[key]?.trim().slice(0, MAX_DETAIL_LENGTH)
    if (value) cleaned[key] = value
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}


async function highestSerial(
  ctx: QueryCtx | MutationCtx,
  questionnaireId: string,
): Promise<number> {
  const last = await ctx.db
    .query('responses')
    .withIndex('by_serial', (q) => q.eq('questionnaireId', questionnaireId))
    .order('desc')
    .first()
  return last?.serial ?? 0
}

/** The survey-number ranges the admin handed out on one survey, with whose they are. */
async function surveyRanges(
  ctx: QueryCtx | MutationCtx,
  questionnaireId: string,
): Promise<(SerialRange & { email: string })[]> {
  const assignments = await ctx.db
    .query('assignments')
    .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
    .collect()
  return assignments.flatMap((assignment) =>
    assignment.rangeStart !== undefined && assignment.rangeEnd !== undefined
      ? [{ email: assignment.email, start: assignment.rangeStart, end: assignment.rangeEnd }]
      : [],
  )
}

/**
 * The next survey number for this caller: the lowest free one in their own
 * range, or one past the highest number outside every range (see
 * `pickSerial`). Numbers held by interviews going on now count as taken, so
 * two tablets starting together are never given the same number; `except`
 * leaves out the caller's own interview.
 */
async function nextFreeSerial(
  ctx: QueryCtx | MutationCtx,
  questionnaireId: string,
  access: Access | null,
  now: number,
  except?: string,
): Promise<number> {
  const ranges = await surveyRanges(ctx, questionnaireId)
  // Numbers set aside for a numbered share link: skipped, never counted on from.
  const pinned = await pinnedSerials(ctx, questionnaireId)
  const taken = new Set<number>()
  if (ranges.length === 0 && pinned.size === 0) {
    // Only the highest matters then, and the index gives it in one read.
    taken.add(await highestSerial(ctx, questionnaireId))
  } else {
    const summaries = await ctx.db
      .query('responseSummaries')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    for (const summary of summaries) taken.add(summary.serial)
  }
  const draws = await ctx.db
    .query('cardDraws')
    .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
    .collect()
  for (const draw of draws) {
    if (draw.serial === undefined || draw.responseId === except) continue
    if (now - draw.drawnAt > CARD_RESERVATION_MS) continue
    taken.add(draw.serial)
  }
  taken.delete(0)
  const email = access && isApproved(access) ? trustedEmail(access.user) : ''
  const own = email ? ranges.find((range) => range.email === email) : undefined
  return pickSerial(taken, ranges, own, pinned)
}

/** The block of survey numbers the admin gave this account on this survey, if any. */
async function ownRange(
  ctx: QueryCtx | MutationCtx,
  questionnaireId: string,
  access: Access | null,
): Promise<SerialRange | null> {
  const email = access && isApproved(access) ? trustedEmail(access.user) : ''
  if (!email) return null
  const range = (await surveyRanges(ctx, questionnaireId)).find((each) => each.email === email)
  return range ? { start: range.start, end: range.end } : null
}

/**
 * Numbers nobody else may be given: recorded ones, and ones held by
 * interviews going on now (other than `except`, the caller's own).
 */
async function takenSerials(
  ctx: QueryCtx | MutationCtx,
  questionnaireId: string,
  now: number,
  except?: string,
): Promise<Set<number>> {
  const taken = new Set<number>()
  const summaries = await ctx.db
    .query('responseSummaries')
    .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
    .collect()
  for (const summary of summaries) taken.add(summary.serial)
  const draws = await ctx.db
    .query('cardDraws')
    .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
    .collect()
  for (const draw of draws) {
    if (draw.serial === undefined || draw.responseId === except) continue
    if (now - draw.drawnAt > CARD_RESERVATION_MS) continue
    taken.add(draw.serial)
  }
  for (const serial of await pinnedSerials(ctx, questionnaireId)) taken.add(serial)
  return taken
}

/**
 * Whether a number a tablet picked for itself offline, from its surveyor's
 * own block, can be kept: it is in that block and still free. When it is
 * not (the same surveyor on a second tablet got there first), the response
 * is numbered as any other would be.
 */
async function claimIsFree(
  ctx: QueryCtx | MutationCtx,
  questionnaireId: string,
  access: Access | null,
  serial: number,
  responseId: string,
  now: number,
): Promise<boolean> {
  if (!Number.isInteger(serial) || serial < 1) return false
  const own = await ownRange(ctx, questionnaireId, access)
  if (!own || !inRange(serial, own)) return false
  return !(await takenSerials(ctx, questionnaireId, now, responseId)).has(serial)
}

/**
 * Card usage for one survey, per choice-experiment question id: `shown` from
 * the responses already recorded, `reserved` from interviews still going on.
 * Counted from the responses' summary rows each time rather than kept in a
 * tally, so deleting or importing responses can never leave it out of step,
 * while a 700-response survey still reads only a few hundred kilobytes.
 * `expired` are reservations nobody submitted in time; a mutation clears them.
 *
 * `planShown` / `planReserved` count the same two things for the rows of a
 * block's scenario plan, so a planned block hands out its least-used row.
 */
async function cardUsage(ctx: QueryCtx | MutationCtx, questionnaireId: string, now: number) {
  const shown = new Map<string, CardCounts>()
  const reserved = new Map<string, CardCounts>()
  const planShown = new Map<string, CardCounts>()
  const planReserved = new Map<string, CardCounts>()
  const summaries = await ctx.db
    .query('responseSummaries')
    .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
    .collect()
  for (const summary of summaries) tallyShown(summary.cards, shown, planShown)
  const submitted = new Set(summaries.map((summary) => summary.responseId))

  const draws = await ctx.db
    .query('cardDraws')
    .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
    .collect()
  const expired = []
  for (const draw of draws) {
    if (submitted.has(draw.responseId) || now - draw.drawnAt > CARD_RESERVATION_MS) {
      expired.push(draw)
    } else {
      tallySets(draw.questionId, draw.sets, reserved)
      if (draw.planRow !== undefined) tallyPlanRow(draw.questionId, draw.planRow, planReserved)
    }
  }
  return { shown, reserved, planShown, planReserved, expired }
}

/** The two usage tallies for one block added together. */
function combined(
  questionId: string,
  shown: Map<string, CardCounts>,
  reserved: Map<string, CardCounts>,
): CardCounts {
  const usage: CardCounts = new Map(shown.get(questionId))
  for (const [key, count] of reserved.get(questionId) ?? []) {
    usage.set(key, (usage.get(key) ?? 0) + count)
  }
  return usage
}

async function deleteDrawsFor(ctx: MutationCtx, responseId: string) {
  const draws = await ctx.db
    .query('cardDraws')
    .withIndex('by_response', (q) => q.eq('responseId', responseId))
    .collect()
  for (const draw of draws) await ctx.db.delete(draw._id)
}

/**
 * Whether the caller may type in the paper form printed for survey number
 * `serial`, and whose it is. Builders on the survey may enter any number; a
 * surveyor only numbers inside their own range. `problem` says why not.
 */
async function paperEntry(
  ctx: QueryCtx | MutationCtx,
  questionnaire: Doc<'questionnaires'>,
  access: Access | null,
  serial: number,
) {
  const ranges = await surveyRanges(ctx, questionnaire.id)
  const owner = await rangeOwner(ctx, ranges, serial)
  const number = formatSurveyNumber(questionnaire.surveyCodePrefix, serial)
  const taken =
    (await ctx.db
      .query('responses')
      .withIndex('by_serial', (q) => q.eq('questionnaireId', questionnaire.id).eq('serial', serial))
      .first()) !== null

  let problem: string | null = null
  if (!Number.isInteger(serial) || serial < 1) {
    problem = 'Survey numbers are whole numbers from 1.'
  } else if (!access || !isApproved(access)) {
    problem = 'Sign in to enter paper forms.'
  } else if (!canBuild(access)) {
    const email = trustedEmail(access.user)
    const own = ranges.find((range) => range.email === email)
    if (!own) problem = 'The admin has not given you a block of survey numbers on this survey.'
    else if (!inRange(serial, own)) {
      problem = `${number} is not one of your numbers (${own.start}–${own.end}).`
    }
  } else if (!canAccess(access, questionnaire)) {
    problem = 'You do not have access to this survey.'
  }
  if (!problem && taken) problem = `${number} is already recorded.`
  if (!problem && (await pinnedSerials(ctx, questionnaire.id)).has(serial)) {
    problem = `${number} is set aside for a survey link.`
  }
  return {
    number,
    taken,
    problem,
    owner: owner ? { user: owner, name: displayName(owner), code: owner.surveyorCode ?? null } : null,
  }
}

/**
 * The account whose block of numbers holds `serial` (the surveyor-role row
 * when one address has two accounts), or null outside every block.
 */
async function rangeOwner(
  ctx: QueryCtx | MutationCtx,
  ranges: (SerialRange & { email: string })[],
  serial: number,
): Promise<Doc<'users'> | null> {
  const ownerRange = ranges.find((range) => inRange(serial, range))
  if (!ownerRange) return null
  const accounts = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', ownerRange.email))
    .collect()
  return accounts.find((account) => roleOf(account) === 'surveyor') ?? accounts[0] ?? null
}

/**
 * Checks a paper form's survey number before its answers are typed in:
 * whether it is free, whether the caller may enter it, and whose range it is
 * in (their name is recorded as the enumerator).
 */
export const paperCheck = query({
  args: { questionnaireId: v.string(), serial: v.number() },
  handler: async (ctx, { questionnaireId, serial }) => {
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) return null
    const entry = await paperEntry(ctx, questionnaire, await viewerAccess(ctx), serial)
    return {
      number: entry.number,
      taken: entry.taken,
      problem: entry.problem,
      owner: entry.owner ? { name: entry.owner.name, code: entry.owner.code } : null,
    }
  },
})

/**
 * One page of a survey's full responses, in survey-number order, for the
 * Responses tab and its downloads. Paged because a 700-response survey's
 * answers are several megabytes: one query reading them all would sit near
 * Convex's read limit, and would re-read everything on every new submit.
 */
export const listBySurveyPage = query({
  args: { questionnaireId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { questionnaireId, paginationOpts }) => {
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire || !canAccess(await viewerAccess(ctx), questionnaire)) {
      return { page: [], isDone: true, continueCursor: '' }
    }
    return ctx.db
      .query('responses')
      .withIndex('by_serial', (q) => q.eq('questionnaireId', questionnaireId))
      .paginate(paginationOpts)
  },
})

/**
 * Who collected what, across every survey the caller is on the team of:
 * enough for counts, leaderboards, and progress bars, without any answers.
 * Surveyors get this for their assigned surveys; builders for theirs.
 */
export const progress = query({
  args: {},
  handler: async (ctx) => {
    const access = await viewerAccess(ctx)
    const rows = []
    for (const questionnaire of await visibleQuestionnaires(ctx, access)) {
      if (!canView(access, questionnaire)) continue
      // Summary rows: a few hundred bytes each instead of the full answers,
      // so several 700-response surveys fit comfortably in one query.
      const summaries = await ctx.db
        .query('responseSummaries')
        .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaire.id))
        .collect()
      for (const summary of summaries) {
        rows.push({
          id: summary.responseId,
          questionnaireId: summary.questionnaireId,
          serial: summary.serial,
          enumerator: summary.enumerator,
          surveyorCode: summary.surveyorCode ?? null,
          submittedAt: summary.submittedAt,
        })
      }
    }
    return rows
  },
})

/**
 * The number the next response on this survey will get, shown before
 * submitting: for a surveyor with a range of their own, the next free number
 * in it. A prediction: `drawCards` holds the actual number when the survey
 * hands out cards, and `submit` otherwise decides it.
 */
export const nextSerial = query({
  // `shareToken`: the page a share link opens, which shows the link's own
  // number, or the next number of whoever shared it.
  args: { questionnaireId: v.string(), shareToken: v.optional(v.string()) },
  handler: async (ctx, { questionnaireId, shareToken }) => {
    const shared = shareToken === undefined ? null : await openShareLink(ctx, shareToken)
    if (shared?.ok && shared.link.serial !== undefined) return shared.link.serial
    return nextFreeSerial(
      ctx,
      questionnaireId,
      shared?.ok ? await accessFor(ctx, shared.sharer) : shared ? null : await viewerAccess(ctx),
      Date.now(),
    )
  },
})

/**
 * What a surveyor's tablet keeps so it can number interviews with no
 * connection: their own block of numbers on this survey and the numbers in it
 * already taken (`except`: the interview on screen, whose held number is its
 * own). Null for anyone without a block; their offline interviews are
 * numbered when they reach the server.
 */
export const offlineKit = query({
  args: { questionnaireId: v.string(), except: v.optional(v.string()) },
  handler: async (ctx, { questionnaireId, except }) => {
    const own = await ownRange(ctx, questionnaireId, await viewerAccess(ctx))
    if (!own) return null
    const taken = await takenSerials(ctx, questionnaireId, Date.now(), except)
    return {
      start: own.start,
      end: own.end,
      taken: [...taken].filter((serial) => inRange(serial, own)).sort((a, b) => a - b),
    }
  },
})

/**
 * Records one response. The serial is assigned here rather than on the tablet,
 * so survey numbers are unique across every device collecting this survey.
 * Convex retries the whole mutation on a write conflict, so two tablets
 * submitting at the same moment cannot receive the same number.
 */
export const submit = mutation({
  args: {
    id: v.string(),
    questionnaireId: v.string(),
    enumerator: v.string(),
    language: lang,
    respondent: v.optional(respondentDetails),
    answers: v.any(),
    // When Submit was pressed on the tablet. Without it an interview kept on
    // an offline tablet was dated by the sync, hours or a day later.
    collectedAt: v.optional(v.number()),
    // A printed paper form being typed in: recorded under the number printed
    // on it, with the cards that number was printed with.
    paperSerial: v.optional(v.number()),
    // Answered by the respondent through a team member's share link
    // (convex/shareLinks.ts): credited to that member, whoever is signed in.
    shareToken: v.optional(v.string()),
    // The number the tablet showed, picked from the surveyor's own block
    // (see `offlineKit`). Kept when it is still free, so an interview done
    // with no connection keeps the number it was done under.
    claimedSerial: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query('responses')
      .withIndex('by_app_id', (q) => q.eq('id', args.id))
      .unique()
    // The number drawCards held for this interview, if it held one.
    const held = (
      await ctx.db
        .query('cardDraws')
        .withIndex('by_response', (q) => q.eq('responseId', args.id))
        .collect()
    ).find((draw) => draw.serial !== undefined)?.serial
    // The cards this interview reserved now count through the response itself.
    await deleteDrawsFor(ctx, args.id)
    if (duplicate) return { serial: duplicate.serial, surveyNumber: duplicate.surveyNumber }

    const questionnaire = await ctx.db
      .query('questionnaires')
      .withIndex('by_app_id', (q) => q.eq('id', args.questionnaireId))
      .unique()
    // Public, so the payload is checked here: a response to a deleted survey
    // has nowhere to go, and junk must not be able to fill the table.
    if (!questionnaire) throw new ConvexError('This survey no longer exists.')
    const { respondent, answers, collectedAt, paperSerial, shareToken, claimedSerial, ...rest } =
      args
    if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
      throw new ConvexError('The answers are not in the shape the app sends.')
    }
    if (JSON.stringify(answers).length > MAX_ANSWERS_BYTES) {
      throw new ConvexError('The answers are too large to store.')
    }
    const now = Date.now()
    const access = await viewerAccess(ctx)
    // The number held when the cards were handed out, which a planned block's
    // row was picked by. It can only have gone to someone else if the
    // interview outlasted its reservation; then the next free one is used.
    const heldFree =
      held !== undefined &&
      (await ctx.db
        .query('responses')
        .withIndex('by_serial', (q) =>
          q.eq('questionnaireId', args.questionnaireId).eq('serial', held),
        )
        .first()) === null
    // A paper form keeps the number printed on it; the owner of the range it
    // is in is the one who interviewed, whoever types it in.
    const paper =
      paperSerial === undefined
        ? null
        : await paperEntry(ctx, questionnaire, access, paperSerial)
    if (paper?.problem) throw new ConvexError(paper.problem)
    // A link that was turned off after the page opened takes nothing more.
    const shared =
      shareToken === undefined || paper ? null : await openShareLink(ctx, shareToken)
    if (shared && !shared.ok) throw new ConvexError(shared.problem)
    if (shared?.ok && shared.questionnaire.id !== args.questionnaireId) {
      throw new ConvexError('This survey link is for a different survey.')
    }
    const sharer = shared?.ok ? shared.sharer : null
    // A numbered link is recorded under its own number, credited to the
    // surveyor whose block holds it, or else to whoever made the link.
    const linkSerial = shared?.ok ? shared.link.serial : undefined
    const linkCredit =
      linkSerial === undefined
        ? sharer
        : ((await rangeOwner(ctx, await surveyRanges(ctx, questionnaire.id), linkSerial)) ?? sharer)
    if (
      linkSerial !== undefined &&
      (await ctx.db
        .query('responses')
        .withIndex('by_serial', (q) =>
          q.eq('questionnaireId', args.questionnaireId).eq('serial', linkSerial),
        )
        .first())
    ) {
      throw new ConvexError('This survey number has already been answered.')
    }
    const claimed =
      paperSerial === undefined &&
      !sharer &&
      claimedSerial !== undefined &&
      (await claimIsFree(ctx, args.questionnaireId, access, claimedSerial, args.id, now))
    const serial =
      paperSerial !== undefined
        ? paperSerial
        : linkSerial !== undefined
          ? linkSerial
          : claimed && claimedSerial !== undefined
          ? claimedSerial
          : heldFree && held !== undefined
          ? held
          : // An answer through a share link takes the next number of whoever
            // shared it, as their own interview would, so their tablet goes
            // on with the number after it and nothing is used twice.
            await nextFreeSerial(
              ctx,
              args.questionnaireId,
              sharer ? await accessFor(ctx, sharer) : access,
              now,
              args.id,
            )
    const surveyNumber = formatSurveyNumber(questionnaire.surveyCodePrefix, serial)

    // A signed-in, approved account is stamped onto the response. A
    // surveyor's responses always carry their own name, whatever the tablet
    // sent, so the leaderboard cannot be gamed by typing another name.
    const approved = access && isApproved(access) ? access : null
    const collector = paper?.owner?.user ?? linkCredit ?? approved?.user ?? null
    const signedIn = collector ? { user: collector, role: roleOf(collector) } : null
    const enumerator =
      paper?.owner
        ? paper.owner.name
        : linkCredit
          ? displayName(linkCredit)
          : signedIn?.role === 'surveyor'
          ? displayName(signedIn.user)
          : args.enumerator.trim().slice(0, MAX_NAME_LENGTH)
    const details = cleanDetails(respondent)

    const response = {
      ...rest,
      answers,
      enumerator,
      ...(details ? { respondent: details } : {}),
      ...(signedIn
        ? {
            surveyorId: signedIn.user._id,
            ...(signedIn.user.surveyorCode ? { surveyorCode: signedIn.user.surveyorCode } : {}),
          }
        : {}),
      serial,
      surveyNumber,
      // The tablet's time when it sent one, never in the future of the server's.
      submittedAt: collectedAt === undefined ? now : Math.min(collectedAt, now),
      receivedAt: now,
      ...(paper ? { paper: true } : {}),
      ...(sharer ? { link: true } : {}),
    }
    await ctx.db.insert('responses', response)
    await recordSummary(ctx, response)
    // A numbered link takes one answer; its number stays set aside.
    if (shared?.ok && linkSerial !== undefined) {
      await ctx.db.patch(shared.link._id, { responseId: args.id })
    }
    return { serial, surveyNumber }
  },
})

/** Bulk upload used once when moving this browser's saved responses to the server. */
export const importMany = mutation({
  args: {
    responses: v.array(
      v.object({
        id: v.string(),
        questionnaireId: v.string(),
        serial: v.number(),
        surveyNumber: v.string(),
        enumerator: v.string(),
        language: lang,
        respondent: v.optional(respondentDetails),
        answers: v.any(),
        submittedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { responses }) => {
    const access = await requireBuilder(ctx)
    const allowed = new Map<string, boolean>()
    let imported = 0
    for (const response of responses) {
      // Only into surveys the caller can see; the rest are silently skipped.
      if (!allowed.has(response.questionnaireId)) {
        const questionnaire = await questionnaireByAppId(ctx, response.questionnaireId)
        allowed.set(response.questionnaireId, !!questionnaire && canAccess(access, questionnaire))
      }
      if (!allowed.get(response.questionnaireId)) continue
      const existing = await ctx.db
        .query('responses')
        .withIndex('by_app_id', (q) => q.eq('id', response.id))
        .unique()
      if (existing) continue
      await ctx.db.insert('responses', response)
      await recordSummary(ctx, response)
      imported += 1
    }
    return imported
  },
})

/**
 * Takes in the responses a tablet could not send, from the backup file it
 * saved ("Download unsent responses"), on any builder's computer. Each is
 * recorded as the tablet would have sent it: a paper form under its printed
 * number, an interview under the number it was done under when that is
 * still free in its surveyor's block, otherwise under the next number
 * outside every block; the surveyor it was collected by is stamped on it.
 * One already on the server (the tablet did get it through) is left alone.
 */
export const importBackup = mutation({
  args: {
    responses: v.array(
      v.object({
        id: v.string(),
        questionnaireId: v.string(),
        enumerator: v.string(),
        language: lang,
        respondent: v.optional(respondentDetails),
        answers: v.any(),
        collectedAt: v.number(),
        claimedSerial: v.optional(v.number()),
        paperSerial: v.optional(v.number()),
        // The users id of the account the tablet was signed in to.
        surveyorId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { responses }) => {
    const access = await requireBuilder(ctx)
    const now = Date.now()
    const results: {
      id: string
      status: 'added' | 'already' | 'skipped'
      surveyNumber?: string
      reason?: string
    }[] = []
    for (const entry of responses) {
      const existing = await ctx.db
        .query('responses')
        .withIndex('by_app_id', (q) => q.eq('id', entry.id))
        .unique()
      if (existing) {
        results.push({ id: entry.id, status: 'already', surveyNumber: existing.surveyNumber })
        continue
      }
      const questionnaire = await questionnaireByAppId(ctx, entry.questionnaireId)
      if (!questionnaire || !canAccess(access, questionnaire)) {
        results.push({
          id: entry.id,
          status: 'skipped',
          reason: questionnaire ? 'You do not have access to this survey.' : 'This survey no longer exists.',
        })
        continue
      }
      const { answers } = entry
      if (
        typeof answers !== 'object' ||
        answers === null ||
        Array.isArray(answers) ||
        JSON.stringify(answers).length > MAX_ANSWERS_BYTES
      ) {
        results.push({ id: entry.id, status: 'skipped', reason: 'The answers could not be read.' })
        continue
      }

      const surveyorId = entry.surveyorId ? ctx.db.normalizeId('users', entry.surveyorId) : null
      const collector = surveyorId ? await ctx.db.get(surveyorId) : null
      const collectorAccess = collector ? await accessFor(ctx, collector) : null
      const paperFree =
        entry.paperSerial !== undefined &&
        Number.isInteger(entry.paperSerial) &&
        entry.paperSerial >= 1 &&
        !(await takenSerials(ctx, entry.questionnaireId, now, entry.id)).has(entry.paperSerial)
      const claimed =
        !paperFree &&
        entry.claimedSerial !== undefined &&
        (await claimIsFree(ctx, entry.questionnaireId, collectorAccess, entry.claimedSerial, entry.id, now))
      const serial = paperFree
        ? entry.paperSerial!
        : claimed
          ? entry.claimedSerial!
          : await nextFreeSerial(ctx, entry.questionnaireId, null, now, entry.id)
      const surveyNumber = formatSurveyNumber(questionnaire.surveyCodePrefix, serial)
      const details = cleanDetails(entry.respondent)
      const response = {
        id: entry.id,
        questionnaireId: entry.questionnaireId,
        language: entry.language,
        answers,
        enumerator:
          collector && roleOf(collector) === 'surveyor'
            ? displayName(collector)
            : entry.enumerator.trim().slice(0, MAX_NAME_LENGTH),
        ...(details ? { respondent: details } : {}),
        ...(collector
          ? {
              surveyorId: collector._id,
              ...(collector.surveyorCode ? { surveyorCode: collector.surveyorCode } : {}),
            }
          : {}),
        serial,
        surveyNumber,
        submittedAt: Math.min(entry.collectedAt, now),
        receivedAt: now,
        ...(paperFree ? { paper: true } : {}),
      }
      await ctx.db.insert('responses', response)
      await recordSummary(ctx, response)
      results.push({ id: entry.id, status: 'added', surveyNumber })
    }
    return results
  },
})

/**
 * Hands an interview its cards for every balanced choice-experiment block:
 * the ones used least so far, counting the responses recorded and the cards
 * other tablets are showing right now. Convex runs mutations one after the
 * other, so two tablets starting at the same moment cannot be given the same
 * "least-used" cards, and the most- and least-used card stay within one or
 * two of each other. No card number is given twice in one interview, across
 * all its blocks. Asking again with the same response id returns the same
 * cards.
 */
/**
 * Responses deleted per `resetSurvey` call. A response can hold up to
 * MAX_ANSWERS_BYTES, so a batch stays well inside one transaction's read
 * limit; the admin's browser calls again until `done`.
 */
const RESET_BATCH = 25

/**
 * Admin only: deletes a survey's collected responses, to start the real
 * survey after testing. Each call deletes up to RESET_BATCH responses with
 * their summary rows and card draws; once none are left it clears the rest
 * (draws of interviews still going on, leftover summaries) and reopens the
 * numbered links those responses answered. Survey numbers then start again
 * from each block's start (or 1). The survey, its team, number blocks,
 * links and chat stay.
 */
export const resetSurvey = mutation({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    await requireAdmin(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) throw new ConvexError('That survey no longer exists.')

    const batch = await ctx.db
      .query('responses')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .take(RESET_BATCH)
    for (const response of batch) {
      const summaries = await ctx.db
        .query('responseSummaries')
        .withIndex('by_response', (q) => q.eq('responseId', response.id))
        .collect()
      for (const summary of summaries) await ctx.db.delete(summary._id)
      await deleteDrawsFor(ctx, response.id)
      await ctx.db.delete(response._id)
    }
    if (batch.length === RESET_BATCH) return { deleted: batch.length, done: false }

    const summaries = await ctx.db
      .query('responseSummaries')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    for (const summary of summaries) await ctx.db.delete(summary._id)
    const draws = await ctx.db
      .query('cardDraws')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    for (const draw of draws) await ctx.db.delete(draw._id)
    const links = await ctx.db
      .query('shareLinks')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    for (const link of links) {
      if (link.responseId !== undefined) await ctx.db.patch(link._id, { responseId: undefined })
    }
    return { deleted: batch.length, done: true }
  },
})

export const drawCards = mutation({
  // `shareToken`: answered through a share link, so the number held is the
  // next one of whoever shared it, whoever happens to be signed in (as
  // `submit` does).
  args: {
    questionnaireId: v.string(),
    responseId: v.string(),
    shareToken: v.optional(v.string()),
  },
  handler: async (ctx, { questionnaireId, responseId, shareToken }) => {
    const held = await ctx.db
      .query('cardDraws')
      .withIndex('by_response', (q) => q.eq('responseId', responseId))
      .collect()
    if (held.length > 0) {
      return held.map(({ questionId, sets, planRow, serial }) => ({
        questionId,
        sets,
        planRow,
        serial,
      }))
    }

    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    const blocks = (questionnaire?.questions ?? []).flatMap((question) => {
      if (question.type !== 'choice_experiment' || question.cards.length === 0) return []
      const planned = question.drawMode === 'plan' && (question.scenarioPlan?.length ?? 0) > 0
      return planned || question.drawMode === 'balanced' ? [question] : []
    })
    if (blocks.length === 0) return []

    const now = Date.now()
    const { shown, reserved, expired } = await cardUsage(
      ctx,
      questionnaireId,
      now,
    )
    for (const draw of expired) await ctx.db.delete(draw._id)

    // The interview's survey number is held now, not at submit, because a
    // planned block's row follows it.
    const shared = shareToken === undefined ? null : await openShareLink(ctx, shareToken)
    const serial =
      shared?.ok && shared.link.serial !== undefined
        ? // A numbered link's number, set aside for it when it was made.
          shared.link.serial
        : await nextFreeSerial(
            ctx,
            questionnaireId,
            shared?.ok
              ? await accessFor(ctx, shared.sharer)
              : shared
                ? null
                : await viewerAccess(ctx),
            now,
            responseId,
          )

    // One plan row for the whole interview, so every planned block shows that
    // same row of the creator's sheet: with three blocks of three, row 7 gives
    // block 1 its columns 1-3, block 2 its 4-6 and block 3 its 7-9. The row
    // follows the survey number (number 1 -> row 1, and round again after the
    // last row: a 50-row plan run to 500 respondents is the plan ten times
    // over), so a surveyor given numbers 101-200 gets the same rows as the
    // paper forms printed for them.
    const planned = blocks.filter(
      (block) => block.drawMode === 'plan' && (block.scenarioPlan?.length ?? 0) > 0,
    )
    const sharedRow =
      planned.length > 0
        ? planRowForSerial(
            planned[0].scenarioPlan!.map((entry) => entry.row),
            serial,
          )
        : undefined

    // Card numbers this interview has been given so far. A balanced block
    // passes over them, so a respondent never meets the same card number
    // twice: nine cards over three blocks are nine different numbers. The
    // planned blocks' cards are the creator's own and are counted first.
    const given = new Set<number>()
    for (const block of planned) {
      for (const set of block.scenarioPlan!.find((entry) => entry.row === sharedRow)?.sets ?? []) {
        given.add(set)
      }
    }

    const drawn = []
    for (const block of blocks) {
      const plan = block.drawMode === 'plan' ? (block.scenarioPlan ?? []) : []
      let sets: number[]
      let planRow: number | undefined
      if (plan.length > 0) {
        // A planned block draws nothing: it shows the interview's row exactly
        // as the creator wrote it — repeats and order included.
        planRow = sharedRow
        const known = new Set(block.cards.map((card) => card.set))
        sets = (plan.find((entry) => entry.row === planRow)?.sets ?? []).filter((set) =>
          known.has(set),
        )
      } else {
        sets = pickLeastUsed(
          block.cards.map((card) => card.set),
          block.scenariosPerRespondent,
          combined(block.id, shown, reserved),
          undefined,
          given,
        )
        for (const set of sets) given.add(set)
      }
      await ctx.db.insert('cardDraws', {
        questionnaireId,
        responseId,
        questionId: block.id,
        sets,
        ...(planRow === undefined ? {} : { planRow }),
        serial,
        drawnAt: now,
      })
      drawn.push({ questionId: block.id, sets, planRow, serial })
    }
    return drawn
  },
})

/**
 * Gives back the cards an interview was holding when it is abandoned: the
 * enumerator started a new response, or left the page without submitting.
 * Without this the cards stayed reserved for CARD_RESERVATION_MS, so every
 * reload made other tablets skip cards that were never actually shown.
 * Public, like the rest of the tablet's functions; it only ever deletes
 * reservations, and `submit` ignores an id it has already recorded.
 */
export const abandonDraw = mutation({
  args: { responseId: v.string() },
  handler: async (ctx, { responseId }) => {
    const submitted = await ctx.db
      .query('responses')
      .withIndex('by_app_id', (q) => q.eq('id', responseId))
      .unique()
    // A recorded response counts through its own answers, so its rows are
    // gone already; this guard only stops a stray call from mattering.
    if (submitted) return
    await deleteDrawsFor(ctx, responseId)
  },
})

/**
 * How many times each design card has been used, per choice-experiment
 * question: `count` in recorded responses, `reserved` in interviews going on
 * right now. The editor shows it against the plan; the tablet falls back on
 * it to draw the least-used cards itself when `drawCards` cannot be reached.
 */
export const cardExposure = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    const { shown, reserved, planShown, planReserved } = await cardUsage(
      ctx,
      questionnaireId,
      Date.now(),
    )
    const cards = []
    for (const { questionId, value, count, reserved: held } of flatten(shown, reserved)) {
      cards.push({ questionId, set: value, count, reserved: held })
    }
    const planRows = []
    for (const { questionId, value, count, reserved: held } of flatten(planShown, planReserved)) {
      planRows.push({ questionId, row: value, count, reserved: held })
    }
    return { cards, planRows }
  },
})

/** Both tallies of one kind as flat rows: one per question id × key. */
function flatten(counted: Map<string, CardCounts>, held: Map<string, CardCounts>) {
  const rows: { questionId: string; value: number; count: number; reserved: number }[] = []
  for (const questionId of new Set([...counted.keys(), ...held.keys()])) {
    const counts = counted.get(questionId)
    const reservations = held.get(questionId)
    for (const value of new Set([...(counts?.keys() ?? []), ...(reservations?.keys() ?? [])])) {
      rows.push({
        questionId,
        value,
        count: counts?.get(value) ?? 0,
        reserved: reservations?.get(value) ?? 0,
      })
    }
  }
  return rows
}

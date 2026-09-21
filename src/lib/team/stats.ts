import { activeEnumerators } from '#/lib/questionnaire/factory'
import type { Questionnaire } from '#/lib/questionnaire/types'

/** What the stats need of a response: who collected it and when. */
export interface ProgressRow {
  enumerator: string
  submittedAt: number
  /** The surveyor's code when a signed-in surveyor collected it. */
  surveyorCode?: string | null
}

/** A surveyor account on the team, listed even before their first response. */
export interface TeamMember {
  name: string
  code?: string | null
}

export interface MemberStat {
  name: string
  /** The surveyor's code (e.g. S01) when known, else null. */
  code: string | null
  /** Position in the leaderboard, from 1. Members with equal totals share a rank. */
  rank: number
  total: number
  today: number
  /** Timestamp of the member's latest response, or null when they have none. */
  lastAt: number | null
  /** The member's share of the team's responses, 0–1. */
  share: number
}

export interface TeamStat {
  total: number
  today: number
  target: number
  /** 0–1 progress towards the target, or null when there is no target. */
  progress: number | null
  members: MemberStat[]
}

export const UNNAMED = '(no name)'

export function startOfToday(now = Date.now()): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

interface Tally {
  code: string | null
  total: number
  today: number
  lastAt: number | null
}

/**
 * Responses per team member, ranked by total. Every listed team member
 * (names from the questionnaire, plus `assigned` surveyor accounts) appears
 * even with no responses; names that only occur in responses (for example
 * typed on a tablet) are included too.
 */
export function memberStats(
  questionnaire: Pick<Questionnaire, 'enumerators'>,
  responses: ProgressRow[],
  now = Date.now(),
  assigned: TeamMember[] = [],
): MemberStat[] {
  const dayStart = startOfToday(now)
  const byName = new Map<string, Tally>()
  const tally = (name: string): Tally => {
    const entry = byName.get(name) ?? { code: null, total: 0, today: 0, lastAt: null }
    byName.set(name, entry)
    return entry
  }
  for (const name of activeEnumerators(questionnaire)) tally(name)
  for (const member of assigned) {
    const name = member.name.trim()
    if (!name) continue
    const entry = tally(name)
    entry.code = member.code ?? entry.code
  }
  for (const response of responses) {
    const entry = tally(response.enumerator.trim() || UNNAMED)
    entry.total += 1
    if (response.submittedAt >= dayStart) entry.today += 1
    entry.lastAt = Math.max(entry.lastAt ?? 0, response.submittedAt)
    entry.code = entry.code ?? response.surveyorCode ?? null
  }

  const teamTotal = responses.length
  const sorted = [...byName.entries()].sort(([nameA, a], [nameB, b]) => {
    if (b.total !== a.total) return b.total - a.total
    if (b.today !== a.today) return b.today - a.today
    return nameA.localeCompare(nameB)
  })

  let rank = 0
  let previousTotal = -1
  return sorted.map(([name, entry], index) => {
    if (entry.total !== previousTotal) {
      rank = index + 1
      previousTotal = entry.total
    }
    return {
      name,
      code: entry.code,
      rank,
      total: entry.total,
      today: entry.today,
      lastAt: entry.lastAt,
      share: teamTotal === 0 ? 0 : entry.total / teamTotal,
    }
  })
}

export function teamStats(
  questionnaire: Pick<Questionnaire, 'enumerators' | 'responseTarget'>,
  responses: ProgressRow[],
  now = Date.now(),
  assigned: TeamMember[] = [],
): TeamStat {
  const members = memberStats(questionnaire, responses, now, assigned)
  const total = responses.length
  const today = members.reduce((sum, member) => sum + member.today, 0)
  const target = Math.max(0, questionnaire.responseTarget)
  return {
    total,
    today,
    target,
    progress: target > 0 ? Math.min(1, total / target) : null,
    members,
  }
}

/** Short relative time such as "just now", "5 min ago", "2 h ago", "3 d ago". */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}

/** Up to two initials for an avatar circle; letters and digits only, "?" when there are none. */
export function initials(name: string): string {
  if (name === UNNAMED) return '?'
  const letters = name
    .trim()
    .split(/\s+/)
    .map((part) => part.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .filter(Boolean)
  if (letters.length === 0) return '?'
  return letters.slice(0, 2).join('').toUpperCase()
}

import { deleteTeamMessages } from '#/lib/team/chat'
import { text } from './factory'
import type { Questionnaire, SurveyResponse } from './types'

/**
 * Browser-local persistence. The shapes mirror the Convex schema in
 * convex/schema.ts so this module can be swapped for Convex queries and
 * mutations once the deployment is linked.
 */

const QUESTIONNAIRES_KEY = 'forme:questionnaires'
const RESPONSES_KEY = 'forme:responses'
/** The team member using this device, shared across surveys. */
const ENUMERATOR_KEY = 'forme:enumerator'

function canStore(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function read<T>(key: string, fallback: T): T {
  if (!canStore()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  if (!canStore()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled. The in-memory state still works.
  }
}

/** Fills in fields added after a questionnaire was first saved. */
export function withDefaults(questionnaire: Questionnaire): Questionnaire {
  return {
    ...questionnaire,
    institution: questionnaire.institution ?? text(),
    teamName: questionnaire.teamName ?? '',
    responseTarget: questionnaire.responseTarget ?? 0,
    surveyCodePrefix: questionnaire.surveyCodePrefix ?? '',
    enumerators: questionnaire.enumerators ?? [],
  }
}

/** Responses saved before survey numbers existed keep serial 0 and no enumerator. */
function withResponseDefaults(response: SurveyResponse): SurveyResponse {
  return {
    ...response,
    serial: response.serial ?? 0,
    surveyNumber: response.surveyNumber ?? '',
    enumerator: response.enumerator ?? '',
  }
}

export function listQuestionnaires(): Questionnaire[] {
  return read<Questionnaire[]>(QUESTIONNAIRES_KEY, [])
    .map(withDefaults)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getQuestionnaire(id: string): Questionnaire | null {
  const found = read<Questionnaire[]>(QUESTIONNAIRES_KEY, []).find((q) => q.id === id)
  return found ? withDefaults(found) : null
}

export function saveQuestionnaire(questionnaire: Questionnaire): Questionnaire {
  const next = { ...questionnaire, updatedAt: Date.now() }
  const all = read<Questionnaire[]>(QUESTIONNAIRES_KEY, [])
  const index = all.findIndex((q) => q.id === next.id)
  if (index === -1) {
    all.push(next)
  } else {
    all[index] = next
  }
  write(QUESTIONNAIRES_KEY, all)
  return next
}

export function deleteQuestionnaire(id: string) {
  deleteTeamMessages(id)
  write(
    QUESTIONNAIRES_KEY,
    read<Questionnaire[]>(QUESTIONNAIRES_KEY, []).filter((q) => q.id !== id),
  )
  write(
    RESPONSES_KEY,
    read<SurveyResponse[]>(RESPONSES_KEY, []).filter((r) => r.questionnaireId !== id),
  )
}

export function listResponses(questionnaireId: string): SurveyResponse[] {
  return read<SurveyResponse[]>(RESPONSES_KEY, [])
    .filter((r) => r.questionnaireId === questionnaireId)
    .map(withResponseDefaults)
}

/** The serial the next response on this device will get: one more than the highest so far. */
export function nextSerial(questionnaireId: string): number {
  return listResponses(questionnaireId).reduce((max, r) => Math.max(max, r.serial), 0) + 1
}

export function saveResponse(response: SurveyResponse) {
  const all = read<SurveyResponse[]>(RESPONSES_KEY, [])
  all.push(response)
  write(RESPONSES_KEY, all)
}

export function getDeviceEnumerator(): string {
  return read<string>(ENUMERATOR_KEY, '')
}

export function setDeviceEnumerator(name: string) {
  write(ENUMERATOR_KEY, name)
}

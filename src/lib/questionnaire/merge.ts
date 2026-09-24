import type { Questionnaire } from './types'

/**
 * Brings an editor's unsaved edits over onto a newer copy of the survey.
 *
 * Every field the editor changed since the copy it started from (`base`)
 * keeps the editor's value; every other field takes the newer copy's. So an
 * admin setting the target while a builder types a label costs neither of
 * them anything, and two builders on different fields both get through. Two
 * edits to the same field cannot both survive: the editor saving now wins,
 * because that is the one still on screen.
 */
export function mergeEdits(
  base: Questionnaire | null,
  mine: Questionnaire,
  theirs: Questionnaire,
): Questionnaire {
  if (!base) return mine
  const merged: Record<string, unknown> = { ...theirs }
  for (const key of Object.keys(mine) as (keyof Questionnaire)[]) {
    if (!sameValue(mine[key], base[key])) merged[key] = mine[key]
  }
  return merged as unknown as Questionnaire
}

/** Deep equality over the plain JSON these documents are made of. */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

import { describe, expect, it } from 'vitest'
import { createQuestion, createQuestionnaire, text } from './factory'
import { mergeEdits } from './merge'

describe('mergeEdits', () => {
  const base = { ...createQuestionnaire(), title: text('Bus survey'), responseTarget: 100, updatedAt: 1 }

  it('keeps my changed fields and takes everything else from the newer copy', () => {
    const mine = { ...base, title: text('AC bus survey') }
    const theirs = { ...base, responseTarget: 300, updatedAt: 2 }
    const merged = mergeEdits(base, mine, theirs)
    expect(merged.title).toEqual(text('AC bus survey'))
    expect(merged.responseTarget).toBe(300)
    expect(merged.updatedAt).toBe(2)
  })

  it('lets the edit on screen win when both changed the same field', () => {
    const mine = { ...base, responseTarget: 150 }
    const theirs = { ...base, responseTarget: 300, updatedAt: 2 }
    expect(mergeEdits(base, mine, theirs).responseTarget).toBe(150)
  })

  it('treats the question list as one field', () => {
    const question = createQuestion('short_text')
    const mine = { ...base, questions: [question] }
    const theirs = { ...base, teamName: 'Team B', updatedAt: 2 }
    const merged = mergeEdits(base, mine, theirs)
    expect(merged.questions).toEqual([question])
    expect(merged.teamName).toBe('Team B')
  })

  it('returns my copy untouched without a base to compare against', () => {
    const mine = { ...base, title: text('x') }
    expect(mergeEdits(null, mine, { ...base, updatedAt: 9 })).toBe(mine)
  })
})

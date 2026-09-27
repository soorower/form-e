// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import type { Questionnaire } from '#/lib/questionnaire/types'
import { QuestionnaireBuilder } from './QuestionnaireBuilder'

vi.mock('convex/react', () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }))
afterEach(cleanup)

function renderBuilder() {
  const questionnaire: Questionnaire = {
    ...createQuestionnaire(),
    id: 's1',
    questions: [
      { ...createQuestion('single_choice'), label: text('Trip purpose') },
      createQuestion('short_text'),
    ],
  }
  let current = questionnaire
  render(
    <QuestionnaireBuilder
      questionnaire={questionnaire}
      onUpdate={(updater: (q: Questionnaire) => Questionnaire) => {
        current = updater(current)
      }}
    />,
  )
  return () => current
}

describe('deleting a question', () => {
  it('asks on the card itself for a question that holds anything, never through a browser dialog', () => {
    // Some browsers answer window.confirm with "Cancel" without showing it,
    // which made questions impossible to delete.
    window.confirm = vi.fn(() => false)
    const latest = renderBuilder()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete question' })[0])
    expect(latest().questions).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deleting question 1' }))
    expect(latest().questions.map((q) => q.label.en)).toEqual([''])
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('deletes an empty question at once', () => {
    const latest = renderBuilder()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete question' })[1])
    expect(latest().questions).toHaveLength(1)
  })
})

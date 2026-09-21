// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import type { Questionnaire, SurveyResponse } from '#/lib/questionnaire/types'
import { QuestionnaireRenderer, type SubmitOutcome } from './QuestionnaireRenderer'

function survey(): Questionnaire {
  const question = { ...createQuestion('short_text'), label: text('Your occupation'), required: true }
  return { ...createQuestionnaire(), title: text('Test survey'), questions: [question] }
}

function answerAndSubmit(answer: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: answer } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
}

describe('QuestionnaireRenderer saving', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(cleanup)

  it('says so when the response could not be saved, and keeps the answers', async () => {
    const onSubmit = vi.fn<(response: SurveyResponse) => Promise<string>>()
    onSubmit.mockRejectedValueOnce(new Error('Server Error')).mockResolvedValueOnce('T-004')
    render(<QuestionnaireRenderer questionnaire={survey()} onSubmit={onSubmit} />)

    answerAndSubmit('Teacher')
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be saved/)
    // It used to fall back to a plain Submit button with nothing said.
    expect(screen.queryByText('Response recorded')).toBeNull()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Teacher')

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await screen.findByText('Response recorded')
    expect(screen.getByText('T-004')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    // Both attempts are the same interview, so the server records it once.
    const [first, second] = onSubmit.mock.calls.map(([response]) => response)
    expect(second.id).toBe(first.id)
    expect(second.answers).toEqual(first.answers)
  })

  it('gives the next interview a new id', async () => {
    const onSubmit = vi.fn<(response: SurveyResponse) => Promise<string>>().mockResolvedValue('T-001')
    render(<QuestionnaireRenderer questionnaire={survey()} onSubmit={onSubmit} />)

    answerAndSubmit('Teacher')
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new response' }))
    answerAndSubmit('Driver')
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))

    const [first, second] = onSubmit.mock.calls.map(([response]) => response)
    expect(second.id).not.toBe(first.id)
  })

  it('never claims a preview was recorded, and shows no survey number for it', async () => {
    render(
      <QuestionnaireRenderer
        questionnaire={survey()}
        meta={{ serial: 17, surveyNumber: 'TRAIN-017', enumerator: 'Ikra', locked: true }}
      />,
    )
    // Before submitting, the preview shows the number the tablet would show.
    expect(screen.getByText('TRAIN-017')).toBeTruthy()

    answerAndSubmit('Teacher')
    await screen.findByText('Preview finished: nothing was recorded')
    expect(screen.queryByText('Response recorded')).toBeNull()
    expect(screen.queryByText('TRAIN-017')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Preview again' }))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })

  it('tells the enumerator when the response is kept on the device for later', async () => {
    const onSubmit = vi
      .fn<(response: SurveyResponse) => Promise<SubmitOutcome>>()
      .mockResolvedValue({ pending: true })
    render(
      <QuestionnaireRenderer
        questionnaire={survey()}
        meta={{ serial: 9, surveyNumber: 'T-009', enumerator: 'Ikra', locked: true }}
        onSubmit={onSubmit}
      />,
    )

    answerAndSubmit('Teacher')
    await screen.findByText('Saved on this device')
    expect(screen.queryByText('Response recorded')).toBeNull()
    // The predicted number is not shown: the server has not assigned one yet.
    expect(screen.queryByText('T-009')).toBeNull()
  })
})

// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import type {
  ChoiceExperimentQuestion,
  Questionnaire,
  SurveyResponse,
} from '#/lib/questionnaire/types'
import { RefusedResponseError } from '#/lib/questionnaire/outbox'
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
    Element.prototype.scrollIntoView = vi.fn()
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

describe('QuestionnaireRenderer respondent details', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
  })

  afterEach(cleanup)

  /** The same survey, now also asking the respondent for their own details. */
  function withDetails(required: boolean): Questionnaire {
    return {
      ...survey(),
      respondent: {
        fields: [
          { key: 'name', required },
          { key: 'phone', required: false },
        ],
        note: text('Kept for follow-up only.'),
      },
    }
  }

  it('asks only for the details switched on, and stores them trimmed', async () => {
    const onSubmit = vi.fn<(response: SurveyResponse) => Promise<string>>().mockResolvedValue('T-001')
    render(<QuestionnaireRenderer questionnaire={withDetails(false)} onSubmit={onSubmit} />)

    expect(screen.getByText('Kept for follow-up only.')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: /Email/ })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: '  Karim Uddin ' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /Your occupation/ }), {
      target: { value: 'Teacher' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    // Only the filled-in fields are stored, and the blank phone is left out.
    expect(onSubmit.mock.calls[0][0].respondent).toEqual({ name: 'Karim Uddin' })
  })

  it('stores nothing when the survey asks for no details', async () => {
    const onSubmit = vi.fn<(response: SurveyResponse) => Promise<string>>().mockResolvedValue('T-001')
    render(<QuestionnaireRenderer questionnaire={survey()} onSubmit={onSubmit} />)
    expect(screen.queryByText('Respondent information')).toBeNull()
    answerAndSubmit('Teacher')
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].respondent).toBeUndefined()
  })

  it('holds the form back until a required detail is filled in', async () => {
    const onSubmit = vi.fn<(response: SurveyResponse) => Promise<string>>().mockResolvedValue('T-001')
    render(<QuestionnaireRenderer questionnaire={withDetails(true)} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByRole('textbox', { name: /Your occupation/ }), {
      target: { value: 'Teacher' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.getByText(/Please fill in the respondent details marked above/)).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Karim' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })

  it('can be submitted by a form that collects nothing but the details', async () => {
    const onSubmit = vi.fn<(response: SurveyResponse) => Promise<string>>().mockResolvedValue('T-001')
    const contactOnly = { ...withDetails(false), questions: [] }
    render(<QuestionnaireRenderer questionnaire={contactOnly} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Karim' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })

  it('makes the details the first step in steps mode, before question 1', () => {
    render(<QuestionnaireRenderer questionnaire={withDetails(true)} mode="steps" />)

    // Step 1 of 2 is the details; the question is not on screen yet.
    expect(screen.getByText('Respondent information')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: /Your occupation/ })).toBeNull()

    // Next will not move on while a required detail is blank.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/Please fill in the details marked/)).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Karim' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('textbox', { name: /Your occupation/ })).toBeTruthy()
    expect(screen.queryByText('Respondent information')).toBeNull()
  })
})

describe('QuestionnaireRenderer scenario plan', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
  })

  afterEach(cleanup)

  /** The attribute cells of every scenario table, top to bottom. */
  const levelCells = () =>
    screen
      .getAllByRole('cell')
      .map((cell) => cell.textContent ?? '')
      .filter((value) => value.endsWith('Hours'))

  /** A block that follows a plan: row 2 shows cards 3, 1, 3 in that order. */
  function planned(): Questionnaire {
    const block = createQuestion('choice_experiment') as ChoiceExperimentQuestion
    Object.assign(block, {
      id: 'block',
      label: text('Choose a trip'),
      drawMode: 'plan' as const,
      attributes: [{ key: 'Time', label: text('Travel time') }],
      alternatives: [{ key: 'A', label: text('Option A') }],
      cards: [1, 2, 3].map((set) => ({ set, levels: { Time_A: `${set} Hours` } })),
      scenarioPlan: [
        { row: 1, sets: [2] },
        { row: 2, sets: [3, 1, 3] },
      ],
      scenariosPerRespondent: 3,
    })
    return { ...createQuestionnaire(), title: text('Plan survey'), questions: [block] }
  }

  it('shows the row the server gave, in the plan order, repeats included', async () => {
    render(
      <QuestionnaireRenderer
        questionnaire={planned()}
        cardExposure={{}}
        planExposure={{}}
        cardDraws={{ block: { sets: [3, 1, 3], planRow: 2 } }}
      />,
    )
    expect((await screen.findByText(/Scenario plan row/)).textContent).toBe('Scenario plan row: 2')
    // 3 Hours, 1 Hours, 3 Hours — one table per scenario, in the plan's order.
    expect(levelCells()).toEqual(['3 Hours', '1 Hours', '3 Hours'])
  })

  it('takes the least-used row itself when the server sent nothing', async () => {
    render(
      <QuestionnaireRenderer
        questionnaire={planned()}
        cardExposure={{}}
        // Row 1 has gone out twice, row 2 never: row 2 is next.
        planExposure={{ block: { 1: 2 } }}
      />,
    )
    expect((await screen.findByText(/Scenario plan row/)).textContent).toBe('Scenario plan row: 2')
    expect(levelCells()).toEqual(['3 Hours', '1 Hours', '3 Hours'])
  })
})

describe('QuestionnaireRenderer keys and notices', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
    Element.prototype.scrollIntoView = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(cleanup)

  it('does not submit the interview on Enter in a text field', () => {
    const onSubmit = vi.fn<(response: SurveyResponse) => Promise<string>>().mockResolvedValue('T-001')
    render(<QuestionnaireRenderer questionnaire={survey()} onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Teacher' } })
    const enter = createEvent.keyDown(input, { key: 'Enter' })
    fireEvent(input, enter)
    // The browser's implicit submission is what used to record the response.
    expect(enter.defaultPrevented).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('heads a step as a step, not with a question number that disagrees with the card', () => {
    render(<QuestionnaireRenderer questionnaire={survey()} mode="steps" />)
    expect(screen.getByText(/^Step/)).toBeTruthy()
    expect(screen.queryByText(/^Question/)).toBeNull()
  })

  it('gives the server’s reason when it refused the response', async () => {
    const onSubmit = vi
      .fn<(response: SurveyResponse) => Promise<string>>()
      .mockRejectedValue(new RefusedResponseError('This survey no longer exists.'))
    render(<QuestionnaireRenderer questionnaire={survey()} onSubmit={onSubmit} />)
    answerAndSubmit('Teacher')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/did not accept this response: This survey no longer exists/)
    expect(alert.textContent).not.toMatch(/internet connection/)
  })
})

describe('QuestionnaireRenderer picture rows', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
  })

  afterEach(cleanup)

  /** The pavement design: a road photo per condition, different for rigid and flexible. */
  function pavement(): Questionnaire {
    const block = createQuestion('choice_experiment') as ChoiceExperimentQuestion
    Object.assign(block, {
      id: 'block',
      label: text('Pavement choice'),
      drawMode: 'plan' as const,
      attributeHeader: text('Type of facility'),
      alternativesHeader: text('Approximate condition'),
      alternatives: [
        { key: 'Rigid', label: text('Rigid pavement') },
        { key: 'Flexible', label: text('Flexible pavement') },
      ],
      attributes: [
        {
          key: 'Road',
          label: text('Road condition'),
          pictures: {
            label: text('Road picture'),
            perAlternative: true,
            items: [
              { alternative: 'Rigid', level: 'Poor', url: 'https://x.test/rigid-poor.jpg' },
              { alternative: 'Flexible', level: 'New', url: 'https://x.test/flexible-new.jpg' },
            ],
          },
        },
        { key: 'Cost', label: text('Travel cost') },
      ],
      cards: [
        { set: 1, levels: { Road_Rigid: 'Poor', Road_Flexible: 'New', Cost_Rigid: '120tk', Cost_Flexible: '100tk' } },
        // No picture for a new rigid road: the cell stays empty.
        { set: 2, levels: { Road_Rigid: 'New', Road_Flexible: 'New', Cost_Rigid: '100tk', Cost_Flexible: '100tk' } },
      ],
      scenarioPlan: [{ row: 1, sets: [1, 2] }],
      scenariosPerRespondent: 2,
    })
    return { ...createQuestionnaire(), title: text('Pavement survey'), questions: [block] }
  }

  it('shows the picture of each alternative’s level in a row above the attribute', async () => {
    render(
      <QuestionnaireRenderer
        questionnaire={pavement()}
        cardExposure={{}}
        planExposure={{}}
        cardDraws={{ block: { sets: [1, 2], planRow: 1 } }}
      />,
    )
    const [first, second] = await screen.findAllByRole('table')
    const pictures = (table: HTMLElement) =>
      Array.from(table.querySelectorAll('img')).map((img) => [img.getAttribute('src'), img.getAttribute('alt')])
    expect(pictures(first)).toEqual([
      ['https://x.test/rigid-poor.jpg', 'Road condition: Poor'],
      ['https://x.test/flexible-new.jpg', 'Road condition: New'],
    ])
    expect(pictures(second)).toEqual([['https://x.test/flexible-new.jpg', 'Road condition: New']])

    // The picture row sits directly above its attribute, headed by its own label.
    const rowHeads = Array.from(first.querySelectorAll('tbody th')).map((th) => th.textContent)
    expect(rowHeads.slice(0, 3)).toEqual(['Road picture', 'Road condition', 'Travel cost'])
    // "Approximate condition" spans both alternative columns.
    const spanning = screen.getAllByText('Approximate condition')[0]
    expect(spanning.getAttribute('colspan')).toBe('2')
  })
})

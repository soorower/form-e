// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import { readOutbox } from '#/lib/questionnaire/outbox'
import { FillPage } from './FillPage'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  drawCards: vi.fn(),
  stored: null as unknown,
  exposure: [] as unknown[],
}))

vi.mock('convex/react', () => ({
  useMutation: (reference: FunctionReference<'mutation'>) =>
    getFunctionName(reference) === 'responses:drawCards' ? mocks.drawCards : mocks.submit,
  useQuery: (reference: FunctionReference<'query'>, args: unknown) => {
    if (args === 'skip') return undefined
    const name = getFunctionName(reference)
    if (name === 'questionnaires:get') return mocks.stored
    if (name === 'responses:nextSerial') return 5
    if (name === 'responses:cardExposure') return mocks.exposure
    return []
  },
}))
vi.mock('#/hooks/useViewer', () => ({
  useViewer: () => ({ viewer: null, isSurveyor: false, canBuild: false }),
}))
vi.mock('#/components/auth/area', () => ({
  useSurveyPaths: () => ({ chat: '/chat', list: '/surveys', editor: '/editor' }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true })
}

async function fillAndSubmit() {
  fireEvent.change(await screen.findByPlaceholderText('Type here'), { target: { value: 'Teacher' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
}

describe('FillPage saving', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const question = {
      ...createQuestion('short_text'),
      label: text('Your occupation'),
      placeholder: text('Type here'),
      required: true,
    }
    mocks.stored = encodeQuestionnaire({
      ...createQuestionnaire(),
      id: 'survey-1',
      surveyCodePrefix: 'T-',
      questions: [question],
    })
  })

  beforeEach(() => {
    window.localStorage.clear()
    mocks.submit.mockReset()
    setOnline(true)
  })

  afterEach(cleanup)

  it('shows the number the server assigned and leaves nothing behind on the device', async () => {
    mocks.submit.mockResolvedValue({ serial: 7, surveyNumber: 'T-007' })
    render(<FillPage surveyId="survey-1" />)

    await fillAndSubmit()
    await screen.findByText('Response recorded')
    expect(screen.getByText('T-007')).toBeTruthy()
    expect(readOutbox()).toEqual([])
    expect(screen.queryByRole('status')).toBeNull()

    const [sent] = mocks.submit.mock.calls[0]
    expect(sent).toMatchObject({ questionnaireId: 'survey-1', language: 'en' })
    expect(Object.values(sent.answers)).toEqual(['Teacher'])
  })

  it('keeps the interview on the device with no connection, and delivers it later', async () => {
    let deliver: (saved: { serial: number; surveyNumber: string }) => void = () => undefined
    // Convex holds a mutation until the connection is back: it neither fails nor resolves.
    mocks.submit.mockReturnValue(new Promise((resolve) => (deliver = resolve)))
    setOnline(false)
    render(<FillPage surveyId="survey-1" />)

    await fillAndSubmit()
    await screen.findByText('Saved on this device')
    expect(readOutbox()).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toMatch(/1 response is kept on this device/)

    deliver({ serial: 8, surveyNumber: 'T-008' })
    await waitFor(() => expect(readOutbox()).toEqual([]))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })

  it('keeps a refused response and sends it again on the next visit, under the same id', async () => {
    mocks.submit.mockRejectedValue(new Error('Server Error'))
    const first = render(<FillPage surveyId="survey-1" />)

    await fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be saved/)
    const [kept] = readOutbox()
    expect(kept.answers).toEqual(mocks.submit.mock.calls[0][0].answers)
    first.unmount()

    mocks.submit.mockReset()
    mocks.submit.mockResolvedValue({ serial: 9, surveyNumber: 'T-009' })
    render(<FillPage surveyId="survey-1" />)
    await waitFor(() => expect(readOutbox()).toEqual([]))
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.submit.mock.calls[0][0].id).toBe(kept.id)
  })
})

describe('FillPage balanced cards', () => {
  const plain = () => mocks.stored

  beforeAll(() => {
    window.scrollTo = vi.fn()
  })

  let before: unknown
  beforeEach(() => {
    before = plain()
    window.localStorage.clear()
    mocks.submit.mockReset()
    mocks.drawCards.mockReset()
    mocks.exposure = []
    setOnline(true)
    const block = {
      ...createQuestion('choice_experiment'),
      id: 'block',
      drawMode: 'balanced' as const,
      scenariosPerRespondent: 2,
      alternatives: [{ key: 'A', label: text('Bus') }],
      attributes: [{ key: 'Time', label: text('Time') }],
      cards: [1, 2, 3, 4].map((set) => ({ set, levels: { Time_A: `${set} Hours` } })),
    }
    mocks.stored = encodeQuestionnaire({
      ...createQuestionnaire(),
      id: 'survey-2',
      surveyCodePrefix: 'T-',
      questions: [block],
    })
  })

  afterEach(() => {
    cleanup()
    mocks.stored = before
  })

  it('shows the cards the server reserved, and saves the interview under the id they were reserved for', async () => {
    mocks.drawCards.mockResolvedValue([{ questionId: 'block', sets: [4, 2] }])
    mocks.submit.mockResolvedValue({ serial: 1, surveyNumber: 'T-001' })
    render(<FillPage surveyId="survey-2" />)

    await screen.findByText('4 Hours')
    expect(screen.getByText('2 Hours')).toBeTruthy()
    expect(screen.queryByText('1 Hours')).toBeNull()
    expect(screen.queryByText('3 Hours')).toBeNull()

    for (const option of screen.getAllByRole('radio')) fireEvent.click(option)
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await screen.findByText('Response recorded')
    const reserved = mocks.drawCards.mock.calls[0][0]
    expect(reserved.questionnaireId).toBe('survey-2')
    expect(mocks.submit.mock.calls[0][0].id).toBe(reserved.responseId)

    // The next interview reserves its own cards under a new id.
    mocks.drawCards.mockResolvedValue([{ questionId: 'block', sets: [1, 3] }])
    fireEvent.click(screen.getByRole('button', { name: 'Start a new response' }))
    await screen.findByText('1 Hours')
    expect(screen.queryByText('4 Hours')).toBeNull()
    const again = mocks.drawCards.mock.calls.at(-1)![0]
    expect(again.responseId).not.toBe(reserved.responseId)
  })

  it('draws the least-used cards itself when the server cannot be reached', async () => {
    // Held by Convex until the connection is back: neither resolves nor fails.
    mocks.drawCards.mockReturnValue(new Promise(() => undefined))
    mocks.exposure = [
      { questionId: 'block', set: 1, count: 3, reserved: 0 },
      { questionId: 'block', set: 2, count: 2, reserved: 1 },
      { questionId: 'block', set: 3, count: 0, reserved: 0 },
      { questionId: 'block', set: 4, count: 1, reserved: 0 },
    ]
    setOnline(false)
    render(<FillPage surveyId="survey-2" />)

    await screen.findByText('3 Hours')
    expect(screen.getByText('4 Hours')).toBeTruthy()
    expect(screen.queryByText('1 Hours')).toBeNull()
    expect(screen.queryByText('2 Hours')).toBeNull()
  })
})

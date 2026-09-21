// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import type { Questionnaire, SurveyResponse } from '#/lib/questionnaire/types'
import { ResponsesPanel } from './ResponsesPanel'

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  downloadText: vi.fn(),
  downloadBlob: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useQuery: (_reference: unknown, args: unknown) => (args === 'skip' ? undefined : mocks.rows),
}))
vi.mock('#/lib/questionnaire/export', async (original) => ({
  ...(await original<typeof import('#/lib/questionnaire/export')>()),
  downloadText: mocks.downloadText,
  downloadBlob: mocks.downloadBlob,
}))

function survey(): Questionnaire {
  const occupation = { ...createQuestion('short_text'), id: 'occupation', label: text('Occupation') }
  // Only Nawal's respondent answered this one, so it is a column Ikra's rows lack.
  const remarks = { ...createQuestion('short_text'), id: 'remarks', label: text('Remarks') }
  return { ...createQuestionnaire(), id: 'q', title: text('Bus survey'), questions: [occupation, remarks] }
}

function stored(serial: number, enumerator: string, answers: SurveyResponse['answers']) {
  return {
    _id: `doc${serial}`,
    _creationTime: serial,
    id: `r${serial}`,
    questionnaireId: 'q',
    serial,
    surveyNumber: `BUS-00${serial}`,
    enumerator,
    language: 'en',
    submittedAt: Date.UTC(2026, 8, 10 + serial),
    answers,
  }
}

const chip = (name: RegExp) => screen.getByRole('button', { name })
const latestTable = () => within(screen.getAllByRole('table')[0])

describe('ResponsesPanel by enumerator', () => {
  beforeEach(() => {
    mocks.downloadText.mockReset()
    mocks.rows = [
      stored(1, 'Ikra', { occupation: 'Teacher' }),
      stored(2, 'Nawal', { occupation: 'Driver', remarks: 'In a hurry' }),
      stored(3, ' Ikra ', { occupation: 'Farmer' }),
      stored(4, '', { occupation: 'Student' }),
    ]
  })

  afterEach(cleanup)

  it('shows everyone until a name is pressed', async () => {
    render(<ResponsesPanel questionnaire={survey()} />)
    await screen.findByText('4 responses')
    expect(chip(/^Everyone/).getAttribute('aria-pressed')).toBe('true')
    expect(chip(/^Ikra/).textContent).toBe('Ikra2')
    expect(chip(/^\(no name\)/).textContent).toBe('(no name)1')
    expect(screen.queryByRole('status')).toBeNull()
    expect(latestTable().getAllByRole('row')).toHaveLength(5)
  })

  it('narrows the tables and the downloads to the pressed name', async () => {
    render(<ResponsesPanel questionnaire={survey()} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ikra/ }))

    expect(screen.getByText('2 of 4 responses')).toBeTruthy()
    expect(chip(/^Ikra/).getAttribute('aria-pressed')).toBe('true')
    expect(chip(/^Everyone/).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('status').textContent).toMatch(/Showing only Ikra: 2 of 4 responses/)
    expect(screen.getByText('Latest submissions by Ikra')).toBeTruthy()

    const latest = latestTable()
    expect(latest.getAllByRole('row')).toHaveLength(3)
    expect(latest.queryByText('BUS-002')).toBeNull()
    expect(latest.getByText('BUS-003')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }))
    const [fileName, csv] = mocks.downloadText.mock.calls[0] as [string, string]
    expect(fileName).toMatch(/^bus-survey-responses-ikra-\d{4}-\d\d-\d\d\.csv$/)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines.slice(1).every((line) => line.includes('Ikra'))).toBe(true)
    expect(csv).not.toContain('Nawal')
    // Same columns as the full export, so each person's file can be stacked.
    expect(lines[0]).toContain('2. Remarks')

    fireEvent.click(screen.getByRole('button', { name: /Download JSON/ }))
    const payload = JSON.parse((mocks.downloadText.mock.calls[1] as [string, string])[1])
    expect(payload.filter).toEqual({ enumerator: 'Ikra' })
    expect(payload.responses.map((response: SurveyResponse) => response.id)).toEqual(['r1', 'r3'])
  })

  it('goes back to everyone on a second press, on Everyone, or on Show everyone', async () => {
    render(<ResponsesPanel questionnaire={survey()} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ikra/ }))
    fireEvent.click(chip(/^Ikra/))
    expect(screen.getByText('4 responses')).toBeTruthy()

    fireEvent.click(chip(/^\(no name\)/))
    expect(screen.getByText('1 of 4 responses')).toBeTruthy()
    expect(latestTable().getByText('BUS-004')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }))
    expect(screen.getByText('4 responses')).toBeTruthy()

    fireEvent.click(chip(/^Nawal/))
    fireEvent.click(chip(/^Everyone/))
    expect(screen.getByText('4 responses')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }))
    const [fileName, csv] = mocks.downloadText.mock.calls[0] as [string, string]
    expect(fileName).toMatch(/^bus-survey-responses-\d{4}/)
    expect(csv.trim().split('\r\n')).toHaveLength(5)
  })
})

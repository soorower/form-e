// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { createQuestionnaire, text } from '#/lib/questionnaire/factory'
import { ResponsesPage } from './ResponsesPage'

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }))

const survey = (id: string, team: string, target = 0) =>
  encodeQuestionnaire({
    ...createQuestionnaire(),
    id,
    title: text(`Survey ${id}`),
    teamName: team,
    responseTarget: target,
  })

vi.mock('#/lib/convex/hooks', () => ({ useConvexReady: () => true }))
vi.mock('convex/react', () => ({
  useQuery: (reference: FunctionReference<'query'>) => {
    const name = getFunctionName(reference)
    if (name === 'questionnaires:list') return [survey('a', 'Dhaka team'), survey('b', 'Sylhet field team', 500)]
    if (name === 'responses:progress') {
      return [
        { questionnaireId: 'b' },
        { questionnaireId: 'b' },
        { questionnaireId: 'a' },
      ]
    }
    return undefined
  },
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('#/components/responses/ResponsesPanel', () => ({
  ResponsesPanel: ({ questionnaire }: { questionnaire: { id: string } }) => (
    <p>panel for {questionnaire.id}</p>
  ),
}))

afterEach(cleanup)

describe('ResponsesPage', () => {
  it('lists every team with its count, the busiest first and open', () => {
    render(<ResponsesPage />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].textContent).toContain('Sylhet field team')
    expect(tabs[0].textContent).toMatch(/2\s*\/ 500/)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('panel for b')).toBeTruthy()
  })

  it('opens the team named in the address, and keeps a pick in it', () => {
    render(<ResponsesPage surveyParam="a" />)
    expect(screen.getByText('panel for a')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Sylhet field team/ }))
    expect(mocks.navigate).toHaveBeenCalledWith(expect.objectContaining({ search: { survey: 'b' } }))
  })
})

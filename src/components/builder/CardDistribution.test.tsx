// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuestion } from '#/lib/questionnaire/factory'
import type { CardDrawMode, ChoiceExperimentQuestion } from '#/lib/questionnaire/types'
import { CardDistribution } from './CardDistribution'

const mocks = vi.hoisted(() => ({
  exposure: { cards: [] as unknown[], planRows: [] as unknown[] },
}))

vi.mock('convex/react', () => ({
  useQuery: (_reference: unknown, args: unknown) => (args === 'skip' ? undefined : mocks.exposure),
}))

function block(cards: number, drawMode: CardDrawMode = 'balanced'): ChoiceExperimentQuestion {
  const question = createQuestion('choice_experiment') as ChoiceExperimentQuestion
  return {
    ...question,
    id: 'block',
    drawMode,
    scenariosPerRespondent: 3,
    cards: Array.from({ length: cards }, (_, i) => ({ set: i + 1, levels: {} })),
  }
}

const survey = (responseTarget: number, onResponseTargetChange = vi.fn()) => ({
  id: 'survey-1',
  responseTarget,
  onResponseTargetChange,
})

describe('CardDistribution', () => {
  afterEach(() => {
    cleanup()
    mocks.exposure = { cards: [], planRows: [] }
  })

  it('works the plan out from the survey target', () => {
    render(<CardDistribution question={block(62)} survey={survey(500)} onChange={vi.fn()} />)
    const plan = screen.getByText('Plan:').parentElement!.textContent
    expect(plan).toMatch(/1,500 card showings over 62 cards/)
    expect(plan).toMatch(/50 cards are shown 24 times and 12 cards 25 times/)
  })

  it('asks for the target first, and writes it to the survey', () => {
    const onTarget = vi.fn()
    render(<CardDistribution question={block(10)} survey={survey(0, onTarget)} onChange={vi.fn()} />)
    expect(screen.getByText(/Enter the total survey target/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('1. Total survey target'), { target: { value: '200' } })
    expect(onTarget).toHaveBeenCalledWith(200)
  })

  it('shows how level the cards are so far, against the plan', async () => {
    mocks.exposure = {
      cards: [
        { questionId: 'block', set: 1, count: 3, reserved: 0 },
        { questionId: 'block', set: 2, count: 2, reserved: 1 },
        { questionId: 'block', set: 3, count: 3, reserved: 0 },
        { questionId: 'other', set: 4, count: 9, reserved: 0 },
      ],
      planRows: [],
    }
    render(<CardDistribution question={block(4)} survey={survey(8)} onChange={vi.fn()} />)
    await screen.findByText('8 showings recorded')
    expect(screen.getByText('least 0 · most 3')).toBeTruthy()
    expect(screen.getByText(/1 card in interviews going on now/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show each card' }))
    const cards = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(cards).toEqual(['#13 / 6', '#22 / 6 +1', '#33 / 6', '#40 / 6'])
  })

  it('shows no plan while cards are drawn at random', () => {
    render(<CardDistribution question={block(4, 'random')} survey={survey(8)} onChange={vi.fn()} />)
    expect(screen.queryByText('Plan:')).toBeNull()
    expect(screen.getByText(/Cards are drawn at random/)).toBeTruthy()
  })

  describe('scenario plan', () => {
    it('reads a pasted sheet and takes the scenario count from it', () => {
      const onChange = vi.fn()
      render(<CardDistribution question={block(50, 'plan')} survey={survey(50)} onChange={onChange} />)
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'Set\tScenario1\tScenario2\tScenario3\n1\t14\t21\t25\n2\t50\t29\t30' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Import plan' }))
      expect(onChange).toHaveBeenCalledWith({
        scenarioPlan: [
          { row: 1, sets: [14, 21, 25] },
          { row: 2, sets: [50, 29, 30] },
        ],
        scenariosPerRespondent: 3,
      })
    })

    it('says which card numbers the plan names that have no card', () => {
      const planned: ChoiceExperimentQuestion = {
        ...block(3, 'plan'),
        scenarioPlan: [
          { row: 1, sets: [1, 2] },
          { row: 2, sets: [3, 9] },
        ],
      }
      render(<CardDistribution question={planned} survey={survey(10)} onChange={vi.fn()} />)
      expect(screen.getByText(/no matching design card \(9\)/)).toBeTruthy()
      // The plan's rows drive the count, so it cannot be edited by hand.
      expect(screen.getByLabelText('2. Scenarios per respondent')).toHaveProperty('disabled', true)
    })

    it('warns while the plan is still empty, because nothing is planned yet', () => {
      render(<CardDistribution question={block(4, 'plan')} survey={survey(10)} onChange={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Example' }))
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toMatch(/Scenario1/)
    })
  })
})

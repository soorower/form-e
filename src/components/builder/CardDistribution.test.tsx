// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuestion } from '#/lib/questionnaire/factory'
import type { ChoiceExperimentQuestion } from '#/lib/questionnaire/types'
import { CardDistribution } from './CardDistribution'

const mocks = vi.hoisted(() => ({ exposure: [] as unknown[] }))

vi.mock('convex/react', () => ({
  useQuery: (_reference: unknown, args: unknown) => (args === 'skip' ? undefined : mocks.exposure),
}))

function block(cards: number, drawMode: 'balanced' | 'random' = 'balanced'): ChoiceExperimentQuestion {
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
    mocks.exposure = []
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
    mocks.exposure = [
      { questionId: 'block', set: 1, count: 3, reserved: 0 },
      { questionId: 'block', set: 2, count: 2, reserved: 1 },
      { questionId: 'block', set: 3, count: 3, reserved: 0 },
      { questionId: 'other', set: 4, count: 9, reserved: 0 },
    ]
    render(<CardDistribution question={block(4)} survey={survey(8)} onChange={vi.fn()} />)
    await screen.findByText('8 showings recorded')
    expect(screen.getByText('least 0 · most 3')).toBeTruthy()
    expect(screen.getByText(/1 card in interviews going on now/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show each card' }))
    const cards = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(cards).toEqual(['#13 / 6', '#22 / 6 +1', '#33 / 6', '#40 / 6'])
  })

  it('turns balancing on and off', () => {
    const onChange = vi.fn()
    render(<CardDistribution question={block(4, 'random')} survey={survey(8)} onChange={onChange} />)
    expect(screen.queryByText('Plan:')).toBeNull()
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith({ drawMode: 'balanced' })
  })
})

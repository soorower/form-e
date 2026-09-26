// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import { EXAMPLE_SCENARIO_PLAN } from '#/lib/questionnaire/scenario-plan'
import type {
  ChoiceExperimentQuestion,
  Questionnaire,
  ScenarioPlanRow,
} from '#/lib/questionnaire/types'
import { QuestionnaireBuilder } from './QuestionnaireBuilder'
import { planRepeats, SurveyCardPlan } from './SurveyCardPlan'

const mocks = vi.hoisted(() => ({
  exposure: { cards: [] as unknown[], planRows: [] as unknown[] },
}))

vi.mock('convex/react', () => ({
  useQuery: (_reference: unknown, args: unknown) => (args === 'skip' ? undefined : mocks.exposure),
}))

function block(id: string, label: string, patch: Partial<ChoiceExperimentQuestion> = {}) {
  const question = createQuestion('choice_experiment') as ChoiceExperimentQuestion
  return {
    ...question,
    id,
    label: text(label),
    drawMode: 'balanced' as const,
    scenariosPerRespondent: 3,
    cards: Array.from({ length: 50 }, (_unused, i) => ({ set: i + 1, levels: {} })),
    ...patch,
  }
}

function renderPanel(blocks: ChoiceExperimentQuestion[]) {
  const onBlockChange = vi.fn()
  const onPlanSplit = vi.fn<(byBlock: Map<string, ScenarioPlanRow[]>) => void>()
  render(
    <SurveyCardPlan
      surveyId="s1"
      responseTarget={500}
      onResponseTargetChange={vi.fn()}
      blocks={blocks}
      onBlockChange={onBlockChange}
      onPlanSplit={onPlanSplit}
    />,
  )
  return { onBlockChange, onPlanSplit }
}

const three = () => [
  block('b1', 'Time and cost'),
  block('b2', 'With probability'),
  block('b3', 'Reliability again'),
]

afterEach(() => {
  cleanup()
  mocks.exposure = { cards: [], planRows: [] }
})

describe('SurveyCardPlan', () => {
  it('is one panel for the whole survey, not one per block', () => {
    renderPanel(three())
    // The target and the draw mode are asked for once, however many blocks.
    expect(screen.getAllByLabelText('1. Total survey target')).toHaveLength(1)
    expect(screen.getAllByLabelText('2. How cards are handed out')).toHaveLength(1)
    expect(screen.getByText(/all 3 choice blocks/)).toBeTruthy()
    // Every block is listed, with its own scenario count.
    expect(screen.getByText('1. Time and cost')).toBeTruthy()
    expect(screen.getByText('3. Reliability again')).toBeTruthy()
    expect(screen.getByText(/answers 9 scenarios in all/)).toBeTruthy()
  })

  it('cuts one pasted sheet across the blocks, in order', () => {
    const planned = three().map((b) => ({ ...b, drawMode: 'plan' as const }))
    const { onPlanSplit } = renderPanel(planned)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: EXAMPLE_SCENARIO_PLAN } })
    fireEvent.click(screen.getByRole('button', { name: 'Import plan' }))

    const byBlock = onPlanSplit.mock.calls[0][0]
    // Sheet row 1 is 14 21 25 | 2 7 23 | 35 34 9.
    expect(byBlock.get('b1')![0]).toEqual({ row: 1, sets: [14, 21, 25] })
    expect(byBlock.get('b2')![0]).toEqual({ row: 1, sets: [2, 7, 23] })
    expect(byBlock.get('b3')![0]).toEqual({ row: 1, sets: [35, 34, 9] })
    expect(screen.getByText(/Shared out over 3 blocks/)).toBeTruthy()
  })

  it('gives a lone block the whole sheet and takes its scenario count from it', () => {
    const { onBlockChange } = renderPanel([block('only', 'One block', { drawMode: 'plan' })])
    fireEvent.change(screen.getByRole('textbox'), { target: { value: EXAMPLE_SCENARIO_PLAN } })
    fireEvent.click(screen.getByRole('button', { name: 'Import plan' }))
    expect(onBlockChange).toHaveBeenCalledWith('only', {
      scenarioPlan: expect.any(Array),
      scenariosPerRespondent: 9,
    })
  })

  it('points out blocks still left without a plan', () => {
    renderPanel([
      block('b1', 'Has one', { drawMode: 'plan', scenarioPlan: [{ row: 1, sets: [1, 2, 3] }] }),
      block('b2', 'Has none', { drawMode: 'plan' }),
      block('b3', 'Also none', { drawMode: 'plan' }),
    ])
    expect(screen.getByText(/2 blocks have no plan yet/)).toBeTruthy()
    expect(screen.getAllByText('no plan yet')).toHaveLength(2)
  })

  it('says so when the blocks disagree, which older surveys can', () => {
    renderPanel([
      block('b1', 'Planned', { drawMode: 'plan' }),
      block('b2', 'Balanced'),
      block('b3', 'Balanced too'),
    ])
    expect(screen.getByText(/do not all agree on how cards are handed out/)).toBeTruthy()
  })
})

describe('the builder behind the panel', () => {
  /** The whole builder, so the wiring from the panel to the questions is real. */
  function renderBuilder(blocks: ChoiceExperimentQuestion[]) {
    const questionnaire: Questionnaire = {
      ...createQuestionnaire(),
      id: 's1',
      questions: blocks,
    }
    let current = questionnaire
    const onUpdate = vi.fn((updater: (q: Questionnaire) => Questionnaire) => {
      current = updater(current)
    })
    render(<QuestionnaireBuilder questionnaire={questionnaire} onUpdate={onUpdate} />)
    return () => current
  }

  it('cuts one sheet across every block and sets them all to follow it', () => {
    const latest = renderBuilder(three().map((b) => ({ ...b, drawMode: 'plan' as const })))
    fireEvent.change(screen.getByPlaceholderText(/Paste the scenario sheet/), {
      target: { value: EXAMPLE_SCENARIO_PLAN },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import plan' }))

    const blocks = latest().questions as ChoiceExperimentQuestion[]
    // All three blocks are written, not just the one the sheet was pasted into.
    expect(blocks.map((b) => b.drawMode)).toEqual(['plan', 'plan', 'plan'])
    expect(blocks.map((b) => b.scenarioPlan.length)).toEqual([5, 5, 5])
    expect(blocks[0].scenarioPlan[0]).toEqual({ row: 1, sets: [14, 21, 25] })
    expect(blocks[1].scenarioPlan[0]).toEqual({ row: 1, sets: [2, 7, 23] })
    expect(blocks[2].scenarioPlan[0]).toEqual({ row: 1, sets: [35, 34, 9] })
    // Same row numbers everywhere, so one interview answers one row throughout.
    expect(blocks[1].scenarioPlan.map((r) => r.row)).toEqual([1, 2, 3, 4, 5])
  })

  it('shows the card panel once, not once per block', () => {
    renderBuilder(three())
    expect(screen.getAllByText('Card distribution')).toHaveLength(1)
    expect(screen.getAllByLabelText('1. Total survey target')).toHaveLength(1)
  })
})

describe('planRepeats', () => {
  it('does not repeat a plan with a row for every respondent', () => {
    expect(planRepeats(500, 500)).toMatch(/Nothing repeats/)
    expect(planRepeats(500, 300)).toMatch(/Nothing repeats/)
  })

  it('repeats a shorter plan to reach the target', () => {
    expect(planRepeats(50, 500)).toMatch(/50 rows × 10 = 500 respondents/)
    expect(planRepeats(50, 520)).toMatch(/rows 1–20 once more/)
  })
})

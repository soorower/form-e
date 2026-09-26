// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { QuestionField, type AnswerUpdate } from '#/components/renderer/QuestionField'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import type {
  AnswerValue,
  ChoiceExperimentQuestion,
  Questionnaire,
  RankingQuestion,
} from '#/lib/questionnaire/types'
import { PaperForm } from './PaperForm'

afterEach(cleanup)

function priority(): RankingQuestion {
  const question = createQuestion('ranking') as RankingQuestion
  return {
    ...question,
    id: 'pref',
    label: text('Preferred modes'),
    options: ['Bus', 'Train', 'Launch', 'Air'].map((label, index) => ({
      id: `o${index}`,
      label: text(label),
    })),
  }
}

function Harness({ question }: { question: RankingQuestion }) {
  const [value, setValue] = useState<AnswerValue | undefined>(undefined)
  return (
    <>
      <QuestionField
        question={question}
        number={1}
        lang="en"
        value={value}
        onChange={(next: AnswerUpdate) =>
          setValue((current) => (typeof next === 'function' ? next(current) : next))
        }
        invalid={false}
      />
      <output data-testid="value">{JSON.stringify(value ?? null)}</output>
    </>
  )
}

describe('priority choice on the tablet', () => {
  it('records the options in the order they are tapped, and renumbers when one is taken out', () => {
    render(<Harness question={priority()} />)
    fireEvent.click(screen.getByRole('button', { name: /Launch/ }))
    fireEvent.click(screen.getByRole('button', { name: /Air/ }))
    fireEvent.click(screen.getByRole('button', { name: /Bus/ }))
    expect(screen.getByTestId('value').textContent).toBe('["o2","o3","o0"]')
    expect(screen.getByText('Priority 1').closest('button')?.textContent).toContain('Launch')

    fireEvent.click(screen.getByRole('button', { name: /Launch/ }))
    expect(screen.getByTestId('value').textContent).toBe('["o3","o0"]')
    expect(screen.getByText('Priority 1').closest('button')?.textContent).toContain('Air')
  })

  it('stops at the number of priorities asked for', () => {
    render(<Harness question={{ ...priority(), maxRanks: 2 }} />)
    fireEvent.click(screen.getByRole('button', { name: /Train/ }))
    fireEvent.click(screen.getByRole('button', { name: /Bus/ }))
    expect((screen.getByRole('button', { name: /Air/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('paper form', () => {
  function planned(): Questionnaire {
    const block = createQuestion('choice_experiment') as ChoiceExperimentQuestion
    const withCards: ChoiceExperimentQuestion = {
      ...block,
      id: 'ce',
      alternatives: [
        { key: 'A', label: text('Bus') },
        { key: 'B', label: text('Train') },
      ],
      attributes: [{ key: 'Cost', label: text('Travel cost') }],
      cards: [1, 2, 3, 4].map((set) => ({
        set,
        levels: { Cost_A: `${set * 100} Tk`, Cost_B: `${set * 150} Tk` },
      })),
      drawMode: 'plan',
      scenariosPerRespondent: 2,
      scenarioPlan: [
        { row: 1, sets: [1, 2] },
        { row: 2, sets: [3, 4] },
      ],
    }
    return {
      ...createQuestionnaire(),
      title: text('AC Bus survey'),
      surveyCodePrefix: 'ACBUS-',
      questions: [withCards, priority()],
    }
  }

  it('prints the survey number, the enumerator and the plan row\'s cards for that number', () => {
    render(<PaperForm questionnaire={planned()} serial={103} lang="en" enumerator="Sorower" newPage={false} />)
    expect(screen.getByText('ACBUS-103')).toBeTruthy()
    expect(screen.getByText('Sorower')).toBeTruthy()
    // 103 on a two-row plan is row 1: cards 1 and 2.
    expect(screen.getByText('(SID: 1)')).toBeTruthy()
    expect(screen.getByText('(SID: 2)')).toBeTruthy()
    expect(screen.getByText('100 Tk')).toBeTruthy()
    expect(screen.queryByText('(SID: 3)')).toBeNull()
    // The priority question comes after the block's two scenarios (questions 1-2).
    expect(screen.getByText(/in order of preference/)).toBeTruthy()
    expect(screen.getByText('3.', { exact: false })).toBeTruthy()
  })

  it('marks a level the card leaves blank with ####', () => {
    const questionnaire = planned()
    const block = questionnaire.questions[0] as ChoiceExperimentQuestion
    block.attributes = [...block.attributes, { key: 'Lift', label: text('Lift') }]
    block.cards[0].levels.Lift_A = 'Available'
    render(<PaperForm questionnaire={questionnaire} serial={1} lang="en" enumerator="" newPage={false} />)
    expect(screen.getByText('Available')).toBeTruthy()
    // Card 1 has no lift level for the train; card 2 has none for either.
    expect(screen.getAllByText('####')).toHaveLength(3)
  })

  it('gives the next number the next row', () => {
    render(<PaperForm questionnaire={planned()} serial={104} lang="en" enumerator="" newPage />)
    expect(screen.getByText('(SID: 3)')).toBeTruthy()
    expect(screen.getByText('(SID: 4)')).toBeTruthy()
  })
})

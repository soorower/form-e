import { describe, expect, it } from 'vitest'
import { parseCardTable } from '#/lib/questionnaire/cards'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import type { ChoiceExperimentQuestion, Questionnaire } from '#/lib/questionnaire/types'
import { decodeQuestionnaire, encodeQuestionnaire } from './questionnaire-codec'

describe('choice experiment defaults', () => {
  it('fills in the layout fields that surveys saved earlier do not have, on read and on write', () => {
    const raw = {
      ...createQuestionnaire(),
      questions: [
        {
          id: 'q',
          type: 'choice_experiment',
          label: text(),
          help: text(),
          required: true,
          alternatives: [],
          attributes: [],
          cards: [],
          levelLabels: [],
          scenariosPerRespondent: 3,
          prompt: text(),
        },
      ],
    }
    const decoded = decodeQuestionnaire(raw) as Questionnaire
    const block = decoded.questions[0] as ChoiceExperimentQuestion
    expect(block.layout).toBe('alternatives')
    expect(block.drawMode).toBe('random')
    expect(block.referenceColumns).toEqual([])
    expect(block.choiceOptions.map((option) => option.key)).toEqual(['yes', 'no'])
    expect(block.attributeHeader.en).toBe('Attributes')

    const encoded = encodeQuestionnaire(decoded) as { questions: Record<string, unknown>[] }
    for (const field of ['layout', 'attributeHeader', 'referenceColumns', 'choiceOptions', 'drawMode']) {
      expect(encoded.questions[0]).toHaveProperty(field)
    }
  })
})

/** Two cards in the shape the discrete-reliability sheet produces: a level is
 *  four times separated by newlines, which cannot be a Convex field name. */
const DISCRETE_CARDS = [
  'Set\tTime_A\tCost_A\tReliability_Range_A\tTime_B\tCost_B\tReliability_Range_B',
  '1\t5 Hours\t1800 Taka\t"4.75 Hours\n5 Hours\n5.25 Hours\n5.5 Hours"\t7 Hours\t1250 Taka\t"6.75 Hours\n7 Hours\n7.25 Hours\n7.5 Hours"',
  '2\t9 Hours\t1600 Taka\t"8 Hours\n9 Hours\n10 Hours\n11 Hours"\t5 Hours\t1450 Taka\t"4 Hours\n5 Hours\n6 Hours\n7 Hours"',
].join('\n')

function questionnaireWithCards(): Questionnaire {
  const block = createQuestion('choice_experiment') as ChoiceExperimentQuestion
  const { attributes, alternatives, cards } = parseCardTable(DISCRETE_CARDS)
  Object.assign(block, { attributes, alternatives, cards })
  block.levelLabels = {
    '4.75 Hours\n5 Hours\n5.25 Hours\n5.5 Hours': {
      en: '',
      bn: '৪ ঘন্টা ৪৫ মি:\n৫ ঘন্টা\n৫ ঘন্টা ১৫ মি:\n৫ ঘন্টা ৩০ মি:',
    },
    '5 Hours': { en: '5 hours', bn: '৫ ঘন্টা' },
  }
  return { ...createQuestionnaire(), questions: [block] }
}

/** Every object field name Convex would have to create for this value. */
function fieldNames(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) fieldNames(item, found)
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.push(key)
      fieldNames(child, found)
    }
  }
  return found
}

describe('questionnaire codec', () => {
  it('survives a round trip with multi-line and Bangla level text', () => {
    const original = questionnaireWithCards()
    const decoded = decodeQuestionnaire(encodeQuestionnaire(original))
    expect(decoded).toEqual(original)
  })

  it('produces only field names Convex accepts: ASCII, no control characters', () => {
    const encoded = encodeQuestionnaire(questionnaireWithCards())
    const bad = fieldNames(encoded).filter((name) => !/^[\x20-\x7e]+$/.test(name))
    expect(bad).toEqual([])
  })

  it('moves the text-keyed maps out of field-name position', () => {
    const encoded = encodeQuestionnaire(questionnaireWithCards()) as {
      questions: { levelLabels: unknown; cards: { levels: unknown }[] }[]
    }
    expect(Array.isArray(encoded.questions[0].levelLabels)).toBe(true)
    expect(Array.isArray(encoded.questions[0].cards[0].levels)).toBe(true)
  })

  it('leaves questions of other types untouched', () => {
    const questionnaire = { ...createQuestionnaire(), questions: [createQuestion('number')] }
    expect(decodeQuestionnaire(encodeQuestionnaire(questionnaire))).toEqual(questionnaire)
  })

  it('strips Convex system fields and tolerates a row stored before this encoding', () => {
    const legacy = {
      _id: 'abc',
      _creationTime: 1,
      ...createQuestionnaire(),
      questions: [
        { ...createQuestion('choice_experiment'), levelLabels: { '5 Hours': { en: 'x', bn: '' } } },
      ],
    }
    const decoded = decodeQuestionnaire(legacy) as Questionnaire
    expect(Object.keys(decoded)).not.toContain('_id')
    const block = decoded.questions[0] as ChoiceExperimentQuestion
    expect(block.levelLabels['5 Hours']).toEqual({ en: 'x', bn: '' })
  })
})

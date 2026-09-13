import { describe, expect, it } from 'vitest'
import {
  EXAMPLE_CARD_TABLE,
  EXAMPLE_PROFILE_CARD_TABLE,
  applyTranslationTable,
  attributeLevels,
  columnKey,
  drawScenarios,
  levelLabel,
  parseCardTable,
  parseDelimited,
} from './cards'
import { createQuestion, formatNumber, questionNumbers, toBanglaDigits } from './factory'

describe('parseDelimited', () => {
  it('splits tab-separated text and keeps quoted line breaks inside a cell', () => {
    const rows = parseDelimited('Set\tTime_A\n1\t"4.75 Hours\n5 Hours"\n')
    expect(rows).toEqual([
      ['Set', 'Time_A'],
      ['1', '4.75 Hours\n5 Hours'],
    ])
  })

  it('handles commas, doubled quotes, CRLF line endings, and a byte-order mark', () => {
    const rows = parseDelimited('﻿Set,Cost_A\r\n1,"1,250 ""Taka"""\r\n\r\n')
    expect(rows).toEqual([
      ['Set', 'Cost_A'],
      ['1', '1,250 "Taka"'],
    ])
  })
})

describe('parseCardTable', () => {
  it('derives attributes, alternatives, and cards from the header', () => {
    const design = parseCardTable(EXAMPLE_CARD_TABLE)
    expect(design.attributes.map((a) => a.key)).toEqual(['Time', 'Cost', 'Reliability'])
    expect(design.alternatives.map((a) => a.key)).toEqual(['A', 'B'])
    expect(design.alternatives[1].label).toEqual({ en: 'Option 2', bn: 'বিকল্প ২' })
    expect(design.cards).toHaveLength(5)
    expect(design.cards[0]).toEqual({
      set: 1,
      levels: {
        Time_A: '5 Hours',
        Cost_A: '1800 Taka',
        Reliability_A: '4.75 Hours - 5.50 Hours',
        Time_B: '7 Hours',
        Cost_B: '1250 Taka',
        Reliability_B: '6.75 Hours - 7.50 Hours',
      },
    })
    expect(design.ignoredColumns).toEqual([])
    expect(design.layout).toBe('alternatives')
  })

  it('reads plain columns as a profile design: one option per card', () => {
    const design = parseCardTable(
      'Card ID\tDistance_From_Residence\tParking_facility\n1\t5 to 8 km\tFree\n2\t< 2 km\tNo',
    )
    expect(design.layout).toBe('profile')
    expect(design.attributes.map((a) => a.key)).toEqual([
      'Distance_From_Residence',
      'Parking_facility',
    ])
    expect(design.attributes[0].label.en).toBe('Distance From Residence')
    expect(design.alternatives).toEqual([
      { key: 'A', label: { en: 'Proposed option', bn: 'প্রস্তাবিত বিকল্প' } },
    ])
    expect(design.cards[1]).toEqual({
      set: 2,
      levels: { Distance_From_Residence: '< 2 km', Parking_facility: 'No' },
    })
    expect(parseCardTable(EXAMPLE_PROFILE_CARD_TABLE).cards).toHaveLength(4)
  })

  it('accepts Card No. or কার্ড নং as the set column and skips a sheet title above the header', () => {
    const design = parseCardTable('Modified Card List\nকার্ড নং\tদূরত্ব\tপার্কিং\n1\t৫ কিমি\tবিনামূল্যে')
    expect(design.layout).toBe('profile')
    expect(design.cards).toEqual([{ set: 1, levels: { দূরত্ব: '৫ কিমি', পার্কিং: 'বিনামূল্যে' } }])
    expect(parseCardTable('Card No.,Distance\n7,near').cards[0].set).toBe(7)
    expect(() => parseCardTable('Card ID,Distance,Distance\n1,a,b')).toThrow(/appears twice/)
  })

  it('splits on the last underscore and reports columns that do not fit the pattern', () => {
    const design = parseCardTable('Set,Reliability_Range_A,Reliability_Range_B,Notes\n1,a,b,x')
    expect(design.attributes[0].key).toBe('Reliability_Range')
    expect(design.attributes[0].label.en).toBe('Reliability Range')
    expect(design.ignoredColumns).toEqual(['Notes'])
  })

  it('numbers cards by row when there is no Set column', () => {
    const design = parseCardTable('Time_A,Time_B\n5,7\n9,5')
    expect(design.cards.map((card) => card.set)).toEqual([1, 2])
  })

  it('keeps existing labels for keys that survive a re-import', () => {
    const previous = {
      attributes: [{ key: 'Time', label: { en: 'Travel time', bn: 'ভ্রমণের সময়' } }],
      alternatives: [{ key: 'A', label: { en: 'Bus', bn: 'বাস' } }],
    }
    const design = parseCardTable('Set,Time_A,Time_B\n1,5,7', previous)
    expect(design.attributes[0].label.bn).toBe('ভ্রমণের সময়')
    expect(design.alternatives[0].label.en).toBe('Bus')
    expect(design.alternatives[1].label.en).toBe('Option 2')
  })

  it('rejects malformed tables with a message that names the problem', () => {
    expect(() => parseCardTable('Set,Time_A,Time_B\n1,5,7\n1,6,8')).toThrow(/more than once/)
    expect(() => parseCardTable('Set,Time_A,Time_B\nx,5,7')).toThrow(/whole number/)
    expect(() => parseCardTable('Set,Time_A\n1,5')).toThrow(/Only one alternative/)
    expect(() => parseCardTable('Set\n1')).toThrow(/No attribute columns/)
    expect(() => parseCardTable('Set,Time_A')).toThrow(/at least one card/)
  })
})

describe('applyTranslationTable', () => {
  function mallBlock() {
    const question = createQuestion('choice_experiment')
    if (question.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    const design = parseCardTable(
      'Card ID\tDistance_From_Residence\tParking_facility\tShop_Closing_Time\n1\t5 to 8 km radius\tFree\t23:00\n2\t< 2 km radius\tNo\t23:00\n3\t5 to 8 km radius\tNo\t21:00',
    )
    Object.assign(question, design)
    return question
  }

  it('fills level wording and attribute labels from a translated table with a Bangla header', () => {
    const question = mallBlock()
    const result = applyTranslationTable(
      question,
      'Modified Card List (Bangla)\nকার্ড নং\tবাসস্থান থেকে দূরত্ব\tপার্কিং সুবিধা\tদোকান বন্ধের সময়\n১\t৫ থেকে ৮ কিমি\tবিনামূল্যে\tরাত ১১ টা\n2\t২ কিমি এর মধ্যে\tনেই\tরাত ১১ টা\n3\t৫ থেকে ৮ কিমি\tনেই\tরাত ৯ টা',
      'bn',
    )
    expect(result.matchedCards).toBe(3)
    expect(result.translated).toBe(6)
    expect(result.levelLabels['5 to 8 km radius'].bn).toBe('৫ থেকে ৮ কিমি')
    expect(result.levelLabels['23:00'].bn).toBe('রাত ১১ টা')
    expect(result.levelLabels['21:00'].bn).toBe('রাত ৯ টা')
    expect(result.attributes.map((a) => a.label.bn)).toEqual([
      'বাসস্থান থেকে দূরত্ব',
      'পার্কিং সুবিধা',
      'দোকান বন্ধের সময়',
    ])
    expect(result.attributeLabelsFilled).toBe(3)
    expect(result.unmatchedSets).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('matches columns by name when the header repeats the imported names, in any order', () => {
    const question = mallBlock()
    const result = applyTranslationTable(
      question,
      'Parking_facility,Card ID,Shop_Closing_Time,Distance_From_Residence\nবিনামূল্যে,1,রাত ১১ টা,৫ থেকে ৮ কিমি',
      'bn',
    )
    expect(result.levelLabels['Free'].bn).toBe('বিনামূল্যে')
    expect(result.levelLabels['5 to 8 km radius'].bn).toBe('৫ থেকে ৮ কিমি')
    expect(result.attributeLabelsFilled).toBe(0)
  })

  it('keeps existing wording for untouched levels, reports unmatched cards and conflicting translations', () => {
    const question = mallBlock()
    question.levelLabels = { No: { en: '', bn: 'নেই' } }
    const result = applyTranslationTable(
      question,
      'Card ID\tD\tP\tT\n1\tক\tবিনামূল্যে\tরাত ১১ টা\n2\tখ\t\tরাত ১০ টা\n9\tগ\tঘ\tঙ',
      'bn',
    )
    expect(result.levelLabels.No.bn).toBe('নেই')
    expect(result.levelLabels['23:00'].bn).toBe('রাত ১১ টা')
    expect(result.conflicts).toEqual(['23:00'])
    expect(result.unmatchedSets).toEqual([9])
    expect(result.matchedCards).toBe(2)
  })

  it('works for the alternatives layout, where the header names are usually unchanged', () => {
    const question = createQuestion('choice_experiment')
    if (question.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    Object.assign(question, parseCardTable(EXAMPLE_CARD_TABLE))
    const result = applyTranslationTable(
      question,
      'Set\tTime_A\tCost_A\tReliability_A\tTime_B\tCost_B\tReliability_B\n1\t৫ ঘন্টা\t১৮০০ টাকা\t৪:৪৫ – ৫:৩০\t৭ ঘন্টা\t১২৫০ টাকা\t৬:৪৫ – ৭:৩০',
      'bn',
    )
    expect(result.levelLabels['5 Hours'].bn).toBe('৫ ঘন্টা')
    expect(result.levelLabels['1250 Taka'].bn).toBe('১২৫০ টাকা')
    expect(result.translated).toBe(6)
  })

  it('rejects a table whose column count does not match the cards', () => {
    expect(() => applyTranslationTable(mallBlock(), 'Card ID\tA\tB\n1\tx\ty', 'bn')).toThrow(
      /2 attribute columns but the imported cards have 3/,
    )
  })
})

describe('columnKey', () => {
  it('adds the alternative suffix only in the alternatives layout', () => {
    expect(columnKey({ layout: 'alternatives' }, 'Cost', 'B')).toBe('Cost_B')
    expect(columnKey({ layout: 'profile' }, 'Cost', 'A')).toBe('Cost')
  })
})

describe('drawScenarios', () => {
  const cards = parseCardTable(EXAMPLE_CARD_TABLE).cards

  it('draws distinct cards using the supplied random source', () => {
    const picks = [4, 0, 1]
    const scenarios = drawScenarios({ cards, scenariosPerRespondent: 3 }, () => picks.shift() ?? 0)
    expect(scenarios.map((s) => s.set)).toEqual([5, 2, 4])
    expect(scenarios.every((s) => s.choice === '')).toBe(true)
    expect(scenarios[0].levels.Time_A).toBe('9 Hours')
  })

  it('never repeats a card and caps the draw at the number of cards', () => {
    for (let i = 0; i < 25; i++) {
      const sets = drawScenarios({ cards, scenariosPerRespondent: 10 }).map((s) => s.set)
      expect(sets).toHaveLength(5)
      expect(new Set(sets).size).toBe(5)
    }
  })

  it('snapshots the levels so later card edits do not change a recorded scenario', () => {
    const [scenario] = drawScenarios({ cards, scenariosPerRespondent: 1 }, () => 0)
    scenario.levels.Time_A = 'changed'
    expect(cards[0].levels.Time_A).toBe('5 Hours')
  })

  it('balanced mode takes the least-shown cards first, in random order', () => {
    const exposure = { 1: 3, 2: 0, 3: 3, 4: 1, 5: 3 }
    const orders = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const sets = drawScenarios(
        { cards, scenariosPerRespondent: 2, drawMode: 'balanced' },
        undefined,
        exposure,
      ).map((s) => s.set)
      expect([...sets].sort()).toEqual([2, 4])
      orders.add(sets.join(','))
    }
    expect(orders.size).toBe(2)
  })

  it('balanced mode breaks ties at random and falls back to a plain draw without counts', () => {
    const combinations = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const sets = drawScenarios({ cards, scenariosPerRespondent: 2, drawMode: 'balanced' }, undefined, {})
        .map((s) => s.set)
        .sort()
      expect(new Set(sets).size).toBe(2)
      combinations.add(sets.join(','))
    }
    expect(combinations.size).toBeGreaterThan(1)
    const fallback = drawScenarios({ cards, scenariosPerRespondent: 5, drawMode: 'balanced' })
    expect(new Set(fallback.map((s) => s.set)).size).toBe(5)
  })
})

describe('levels and labels', () => {
  it('lists distinct levels per attribute across alternatives in order of appearance', () => {
    const question = createQuestion('choice_experiment')
    if (question.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    const { attributes, alternatives, cards } = parseCardTable(EXAMPLE_CARD_TABLE)
    Object.assign(question, { attributes, alternatives, cards })
    expect(attributeLevels(question, 'Time')).toEqual(['5 Hours', '7 Hours', '9 Hours'])
    expect(attributeLevels(question, 'Cost')).toEqual([
      '1800 Taka',
      '1250 Taka',
      '1600 Taka',
      '1450 Taka',
      '2000 Taka',
    ])
  })

  it('falls back to the raw level text when no translation exists', () => {
    const question = { levelLabels: { '5 Hours': { en: '', bn: '৫ ঘন্টা' } } }
    expect(levelLabel(question, '5 Hours', 'bn')).toBe('৫ ঘন্টা')
    expect(levelLabel(question, '5 Hours', 'en')).toBe('5 Hours')
    expect(levelLabel(question, '7 Hours', 'bn')).toBe('7 Hours')
  })
})

describe('numbering', () => {
  it('writes Bangla digits and leaves everything else alone', () => {
    expect(toBanglaDigits('Set 12: 4.5 hr')).toBe('Set ১২: ৪.৫ hr')
    expect(formatNumber(8, 'bn')).toBe('৮')
    expect(formatNumber(8, 'en')).toBe('8')
  })

  it('gives a choice block one number per scenario', () => {
    const block = createQuestion('choice_experiment')
    if (block.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    block.scenariosPerRespondent = 3
    const questions = [createQuestion('number'), block, createQuestion('short_text')]
    expect(questionNumbers(questions)).toEqual([1, 2, 5])
  })
})

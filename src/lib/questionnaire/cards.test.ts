import { describe, expect, it } from 'vitest'
import {
  EXAMPLE_CARD_TABLE,
  EXAMPLE_PROFILE_CARD_TABLE,
  EXAMPLE_TWO_ROW_CARD_TABLE,
  applyTranslationTable,
  attributeLevels,
  attributeSections,
  columnKey,
  drawScenarios,
  levelLabel,
  parseCardTable,
  parseDelimited,
} from './cards'
import { createPrompt, createQuestion, formatNumber, questionNumbers, toBanglaDigits } from './factory'

/**
 * The "Final CARD English" sheet of the Sylhet–Dhaka survey, cut to three
 * attributes: headings on one row (centred over their group, with stray
 * blanks), Bus / Train / Air on the next, "CARD      ID" with runs of spaces.
 */
const SYLHET_CARDS = [
  '\t\tTravel Cost\t\t\tTravel Time  \t           \t\tComfort \t',
  'CARD      ID\tBus\tTrain\tAir\tBus\tTrain\tAir\tBus\tTrain\tAir',
  '1\t10% more than now\tSame as now\t5% more than now\tSame as now\t10% less than now\tSame as now (Overall 2.5hrs)\tAC\tAC\tSame as now',
  '2\t5% less than now\t5% more than now\t10% more than now\tSame as now\t20% less than now\tSame as now (Overall 2.5hrs)\tAC\tAC\tSame as now',
].join('\n')

/** Its "Final CARD Bangla" sheet, in the same shape. */
const SYLHET_CARDS_BANGLA = [
  '\t\tযাতায়াতের খরচ\t\t\tযাতায়াতের সময়\t\t\tস্বাচ্ছন্দ্যতা\t',
  'CARD ID\tবাস\tট্রেন\tবিমান\tবাস\tট্রেন\tবিমান\tবাস\tট্রেন\tবিমান',
  '1\tবর্তমানের চেয়ে ১০% বেশি\tবর্তমানের মতো\tবর্তমানের চেয়ে ৫% বেশি\tবর্তমানের মতো\tবর্তমানের চেয়ে ১০% কম\tবর্তমানের মতো (মোট ২.৫ ঘণ্টা)\tএসি\tএসি\tবর্তমানের মতো',
].join('\n')

/**
 * The "62 Cards" sheet of the access/egress survey, cut to two attributes:
 * merged headings (first cell filled), then a blank column and a Bangla copy
 * whose card column says "কার্ড নং" on the upper row and 0 on the lower.
 */
const BILINGUAL_CARDS = [
  '\tTravel Cost\t\t\tTravel Time\t\t\t\tকার্ড নং\tভ্রমণ খরচ\tভ্রমণ খরচ\tভ্রমণ খরচ\tভ্রমণ সময়\tভ্রমণ সময়\tভ্রমণ সময়',
  'Card ID\tBus\tTrain\tAir\tBus\tTrain\tAir\t\t0\tবাস\tট্রেন\tবিমান\tবাস\tট্রেন\tবিমান',
  '1\tsame as now\tsame as now\t10 % less than now\t15% more than now\t15% less than now\t5% less than now\t\t1\t বর্তমানের মতো\t বর্তমানের মতো\tবর্তমান থেকে ১০% কম\tবর্তমান থেকে ১৫% বেশি\tবর্তমান থেকে ১৫% কম\tবর্তমান থেকে ৫% কম',
  '2\t10 % less than now\t10 % less than now\t10 % more than now\tsame as now\tsame as now\t5% less than now\t\t2\tবর্তমান থেকে ১০% কম\tবর্তমান থেকে ১০% কম\tবর্তমান থেকে ১০% বেশি\t বর্তমানের মতো\t বর্তমানের মতো\tবর্তমান থেকে ৫% কম',
].join('\n')

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

  it('collapses runs of blanks inside a cell but keeps its line breaks', () => {
    const rows = parseDelimited('Set\tFrequency_A\n1\t"Every  2.0 hrs \n  (4 per day)  "\n   \t  ')
    expect(rows).toEqual([
      ['Set', 'Frequency_A'],
      ['1', 'Every 2.0 hrs\n(4 per day)'],
    ])
  })
})

describe('two-row headers', () => {
  it('reads attribute headings over Bus / Train / Air, with the Card ID label on the lower row', () => {
    const design = parseCardTable(SYLHET_CARDS)
    expect(design.layout).toBe('alternatives')
    expect(design.attributes.map((a) => a.key)).toEqual(['Travel_Cost', 'Travel_Time', 'Comfort'])
    expect(design.attributes.map((a) => a.label.en)).toEqual(['Travel Cost', 'Travel Time', 'Comfort'])
    expect(design.alternatives).toEqual([
      { key: 'Bus', label: { en: 'Bus', bn: '' } },
      { key: 'Train', label: { en: 'Train', bn: '' } },
      { key: 'Air', label: { en: 'Air', bn: '' } },
    ])
    expect(design.cards).toHaveLength(2)
    expect(design.cards[1]).toEqual({
      set: 2,
      levels: {
        Travel_Cost_Bus: '5% less than now',
        Travel_Cost_Train: '5% more than now',
        Travel_Cost_Air: '10% more than now',
        Travel_Time_Bus: 'Same as now',
        Travel_Time_Train: '20% less than now',
        Travel_Time_Air: 'Same as now (Overall 2.5hrs)',
        Comfort_Bus: 'AC',
        Comfort_Train: 'AC',
        Comfort_Air: 'Same as now',
      },
    })
    expect(design.ignoredColumns).toEqual([])
    expect(design.translation).toBeUndefined()
    expect(parseCardTable(EXAMPLE_TWO_ROW_CARD_TABLE).cards).toHaveLength(4)
  })

  it('takes the merged heading from the first cell of its group and keeps a re-import’s labels and groups', () => {
    const previous = {
      layout: 'alternatives' as const,
      attributes: [
        { key: 'Travel_Cost', label: { en: 'Fare', bn: 'ভাড়া' }, group: { en: 'Main trip', bn: '' } },
      ],
      alternatives: [{ key: 'Bus', label: { en: 'Coach', bn: 'বাস' } }],
    }
    const design = parseCardTable(EXAMPLE_TWO_ROW_CARD_TABLE, previous)
    expect(design.attributes[0]).toEqual({
      key: 'Travel_Cost',
      label: { en: 'Fare', bn: 'ভাড়া' },
      group: { en: 'Main trip', bn: '' },
    })
    expect(design.attributes[1].label.en).toBe('Travel Time')
    expect(design.alternatives[0].label.en).toBe('Coach')
    expect(design.alternatives[1].label.en).toBe('Train')
  })

  it('does not mistake a card row for an alternative row', () => {
    // A single-row header whose first card happens to repeat its levels.
    const design = parseCardTable('Set\tTime_A\tCost_A\tTime_B\tCost_B\n1\t5\t1800\t5\t1800\n2\t7\t1250\t9\t1450')
    expect(design.cards).toHaveLength(2)
    expect(design.attributes.map((a) => a.key)).toEqual(['Time', 'Cost'])
  })

  it('reads a Bangla copy pasted beside the cards as that language’s wording and headings', () => {
    const design = parseCardTable(BILINGUAL_CARDS)
    expect(design.cards).toHaveLength(2)
    expect(design.attributes.map((a) => a.label)).toEqual([
      { en: 'Travel Cost', bn: 'ভ্রমণ খরচ' },
      { en: 'Travel Time', bn: 'ভ্রমণ সময়' },
    ])
    expect(design.alternatives.map((a) => a.label.bn)).toEqual(['বাস', 'ট্রেন', 'বিমান'])
    expect(design.cards[0].levels.Travel_Cost_Air).toBe('10 % less than now')
    expect(design.translation?.lang).toBe('bn')
    expect(design.translation?.matchedCards).toBe(2)
    expect(design.translation?.translated).toBe(6)
    expect(design.translation?.levelLabels['same as now'].bn).toBe('বর্তমানের মতো')
    expect(design.translation?.levelLabels['15% more than now'].bn).toBe('বর্তমান থেকে ১৫% বেশি')
  })

  it('accepts attribute and alternative written in one cell separated by blanks', () => {
    const design = parseCardTable(
      'Card List\n\tCARD ID\tTravel Cost        Bus\tTravel Cost   Train\tTravel Time     Bus\tTravel Time   Train\n\t1\ta\tb\tc\td',
    )
    expect(design.layout).toBe('alternatives')
    expect(design.attributes.map((a) => a.key)).toEqual(['Travel_Cost', 'Travel_Time'])
    expect(design.alternatives.map((a) => a.label.en)).toEqual(['Bus', 'Train'])
    expect(design.cards[0].levels).toEqual({
      Travel_Cost_Bus: 'a',
      Travel_Cost_Train: 'b',
      Travel_Time_Bus: 'c',
      Travel_Time_Train: 'd',
    })
  })
})

describe('attributeSections', () => {
  it('groups consecutive attributes under a shared heading and leaves the rest unheaded', () => {
    const home = { en: 'Home to station', bn: '' }
    const sections = attributeSections([
      { key: 'Access_Time', label: { en: 'Time', bn: '' }, group: home },
      { key: 'Access_Cost', label: { en: 'Cost', bn: '' }, group: { en: 'Home to station', bn: '' } },
      { key: 'Travel_Time', label: { en: 'Time', bn: '' } },
      { key: 'Travel_Cost', label: { en: 'Cost', bn: '' }, group: { en: ' ', bn: '' } },
      { key: 'Egress_Time', label: { en: 'Time', bn: '' }, group: { en: 'Station to home', bn: '' } },
    ])
    expect(sections.map((section) => [section.group?.en, section.attributes.map((a) => a.key)])).toEqual([
      ['Home to station', ['Access_Time', 'Access_Cost']],
      [undefined, ['Travel_Time', 'Travel_Cost']],
      ['Station to home', ['Egress_Time']],
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

  it('finds the alternative letter in the middle of a name and files the level under attribute_alternative', () => {
    const design = parseCardTable(
      'Set\tTime_A\tCost_A\tCost_A_var\tTime_B\tCost_B\tCost_B_var\tReliability_Range_B\n1\t5\t1800\t1900\t7\t1250\t1300\t6-9',
    )
    expect(design.layout).toBe('alternatives')
    expect(design.alternatives.map((a) => a.key)).toEqual(['A', 'B'])
    expect(design.attributes.map((a) => a.key)).toEqual(['Time', 'Cost', 'Cost_var', 'Reliability_Range'])
    expect(design.cards[0].levels).toEqual({
      Time_A: '5',
      Cost_A: '1800',
      Cost_var_A: '1900',
      Time_B: '7',
      Cost_B: '1250',
      Cost_var_B: '1300',
      Reliability_Range_B: '6-9',
    })
  })

  it('accepts word alternatives when every column ends in one of them', () => {
    const design = parseCardTable('Set,Time_Bus,Cost_Bus,Time_Car,Cost_Car\n1,10,20,30,40')
    expect(design.layout).toBe('alternatives')
    expect(design.alternatives.map((a) => a.key)).toEqual(['Bus', 'Car'])
    expect(design.attributes.map((a) => a.key)).toEqual(['Time', 'Cost'])
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

  it('drops alternative headings when a re-import changes the layout, but keeps attribute labels', () => {
    const previous = {
      layout: 'profile' as const,
      attributes: [{ key: 'Time', label: { en: 'Travel time', bn: 'ভ্রমণের সময়' } }],
      alternatives: [{ key: 'A', label: { en: 'Proposed option', bn: 'প্রস্তাবিত বিকল্প' } }],
    }
    const design = parseCardTable('Set,Time_A,Time_B\n1,5,7', previous)
    expect(design.layout).toBe('alternatives')
    expect(design.alternatives[0].label.en).toBe('Option 1')
    expect(design.attributes[0].label.bn).toBe('ভ্রমণের সময়')
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

  it('matches a translated header by name even when the alternative letter sits mid-name', () => {
    const question = createQuestion('choice_experiment')
    if (question.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    Object.assign(question, parseCardTable('Set,Cost_A,Cost_A_var,Cost_B,Cost_B_var\n1,10,11,20,21'))
    const result = applyTranslationTable(
      question,
      'Set,Cost_B_var,Cost_A_var,Cost_B,Cost_A\n1,একুশ,এগারো,বিশ,দশ',
      'bn',
    )
    expect(result.levelLabels['11'].bn).toBe('এগারো')
    expect(result.levelLabels['21'].bn).toBe('একুশ')
    expect(result.levelLabels['10'].bn).toBe('দশ')
  })

  it('rejects a table whose column count does not match the cards', () => {
    expect(() => applyTranslationTable(mallBlock(), 'Card ID\tA\tB\n1\tx\ty', 'bn')).toThrow(
      /2 attribute columns but the imported cards have 3/,
    )
  })

  it('reads a translated two-row header by position and fills row and column headings', () => {
    const question = createQuestion('choice_experiment')
    if (question.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    Object.assign(question, parseCardTable(SYLHET_CARDS))
    const result = applyTranslationTable(question, SYLHET_CARDS_BANGLA, 'bn')
    expect(result.matchedCards).toBe(1)
    expect(result.unmatchedSets).toEqual([])
    expect(result.levelLabels['10% more than now'].bn).toBe('বর্তমানের চেয়ে ১০% বেশি')
    expect(result.levelLabels['Same as now (Overall 2.5hrs)'].bn).toBe('বর্তমানের মতো (মোট ২.৫ ঘণ্টা)')
    expect(result.levelLabels.AC.bn).toBe('এসি')
    expect(result.attributes.map((a) => a.label.bn)).toEqual([
      'যাতায়াতের খরচ',
      'যাতায়াতের সময়',
      'স্বাচ্ছন্দ্যতা',
    ])
    expect(result.alternatives.map((a) => a.label.bn)).toEqual(['বাস', 'ট্রেন', 'বিমান'])
    expect(result.attributeLabelsFilled).toBe(3)
    expect(result.alternativeLabelsFilled).toBe(3)
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

  it('gives a choice block one number per question asked under each scenario', () => {
    const block = createQuestion('choice_experiment')
    if (block.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    block.scenariosPerRespondent = 3
    const questions = [createQuestion('number'), block, createQuestion('short_text')]
    expect(questionNumbers(questions)).toEqual([1, 2, 5])
    // Three questions under each of three scenarios span nine numbers.
    block.prompts = [createPrompt(), createPrompt('options'), createPrompt('options')]
    expect(questionNumbers(questions)).toEqual([1, 2, 11])
  })
})

import { describe, expect, it } from 'vitest'
import { createQuestion, text } from './factory'
import {
  levelPicture,
  matchWorkbookPictures,
  missingPictures,
  pictureSlots,
  pictureUrls,
  setLevelPicture,
  type SheetText,
  type WorkbookPicture,
} from './pictures'
import type { AttributePictures, ChoiceExperimentQuestion } from './types'

const NEW = 'New Road (Good Condition)'
const POOR = 'Poor with Pothole, once in every 400m'

/** Two cards of the pavement design: road condition and time, rigid vs flexible. */
function pavement(patch: Partial<ChoiceExperimentQuestion> = {}): ChoiceExperimentQuestion {
  return {
    ...(createQuestion('choice_experiment') as ChoiceExperimentQuestion),
    layout: 'alternatives',
    alternatives: [
      { key: 'Rigid', label: text('Rigid', 'রিজিড') },
      { key: 'Flexible', label: text('Flexible', 'ফ্লেক্সিবল') },
    ],
    attributes: [
      { key: 'Road_Condition', label: text('Road Condition', 'রাস্তার অবস্থা') },
      { key: 'Travel_Time', label: text('Travel Time', 'ভ্রমণের সময়') },
    ],
    cards: [
      {
        set: 1,
        levels: {
          Road_Condition_Rigid: NEW,
          Road_Condition_Flexible: NEW,
          Travel_Time_Rigid: '50min',
          Travel_Time_Flexible: '50min',
        },
      },
      {
        set: 2,
        levels: {
          Road_Condition_Rigid: POOR,
          Road_Condition_Flexible: NEW,
          Travel_Time_Rigid: '60min',
          Travel_Time_Flexible: '50min',
        },
      },
    ],
    levelLabels: {
      [POOR]: text(POOR, 'খারাপ রাস্তা (প্রতি ৪০০ মিটার পরপর একটি গর্ত)'),
    },
    ...patch,
  }
}

describe('level pictures', () => {
  it('picks the picture of the level the card shows, per alternative, falling back to a shared one', () => {
    const [road] = pavement().attributes
    const attribute = {
      ...road,
      pictures: {
        label: text('Road picture', 'রাস্তার ছবি'),
        perAlternative: true,
        items: [
          { alternative: 'Rigid', level: NEW, url: 'rigid-new.jpg' },
          { alternative: 'Flexible', level: NEW, url: 'flexible-new.jpg' },
          { alternative: '', level: POOR, url: 'poor.jpg' },
        ],
      },
    }
    expect(levelPicture(attribute, 'Rigid', NEW)?.url).toBe('rigid-new.jpg')
    expect(levelPicture(attribute, 'Flexible', NEW)?.url).toBe('flexible-new.jpg')
    expect(levelPicture(attribute, 'Rigid', POOR)?.url).toBe('poor.jpg')
    expect(levelPicture(attribute, 'Rigid', '')).toBeUndefined()

    // Shared pictures only: an alternative's own picture is not used.
    const shared = { ...attribute, pictures: { ...attribute.pictures, perAlternative: false } }
    expect(levelPicture(shared, 'Rigid', NEW)).toBeUndefined()
    expect(levelPicture(shared, 'Flexible', POOR)?.url).toBe('poor.jpg')
    expect(levelPicture(road, 'Rigid', NEW)).toBeUndefined()
  })

  it('lists the slots an attribute needs and which are still empty', () => {
    const question = pavement()
    const [road] = question.attributes
    expect(pictureSlots(question, road, false)).toEqual([
      { alternative: '', level: NEW },
      { alternative: '', level: POOR },
    ])
    expect(pictureSlots(question, road, true)).toEqual([
      { alternative: 'Rigid', level: NEW },
      { alternative: 'Rigid', level: POOR },
      { alternative: 'Flexible', level: NEW },
      { alternative: 'Flexible', level: POOR },
    ])

    let pictures: AttributePictures = { label: text('Picture'), perAlternative: true, items: [] }
    pictures = setLevelPicture(pictures, { alternative: 'Rigid', level: NEW }, { url: 'a.jpg' })
    pictures = setLevelPicture(pictures, { alternative: 'Rigid', level: NEW }, { url: 'b.jpg', storageId: 's1' })
    expect(pictures.items).toEqual([{ alternative: 'Rigid', level: NEW, url: 'b.jpg', storageId: 's1' }])
    expect(missingPictures(question, { ...road, pictures })).toHaveLength(3)
    expect(pictureUrls({ ...question, attributes: [{ ...road, pictures }] })).toEqual(['b.jpg'])

    pictures = setLevelPicture(pictures, { alternative: 'Rigid', level: NEW }, null)
    expect(pictures.items).toEqual([])
  })
})

describe('matchWorkbookPictures', () => {
  function sheet(rows: Record<number, Record<number, string>>): SheetText {
    return new Map(
      Object.entries(rows).map(([row, cells]) => [
        Number(row),
        new Map(Object.entries(cells).map(([col, value]) => [Number(col), value])),
      ]),
    )
  }
  const at = (sheetName: string, row: number, col: number, name: string): WorkbookPicture => ({
    sheet: sheetName,
    row,
    col,
    name,
  })

  it('reads the EngBng layout: a row per level, a column per alternative', () => {
    // Row 8 heads the picture columns; each level row holds the English name,
    // the Bangla name, and a picture under "Rigid" and under "Flexible".
    const sheets = new Map([
      [
        'EngBng',
        sheet({
          8: { 3: 'Rigid', 4: 'Flexible' },
          9: { 1: NEW, 2: 'নতুন রাস্তা (ভালো অবস্থা)' },
          // Only the Bangla name, with odd spacing: still recognised.
          10: { 2: '  খারাপ রাস্তা  (প্রতি ৪০০ মিটার পরপর একটি গর্ত) ' },
        }),
      ],
      // A printed questionnaire: a picture under "রিজিড পেভমেন্ট", in a row
      // that names no level, and far below cells holding levels. Not matched.
      [
        'Bng Questionnaire (1)',
        sheet({ 1: { 2: '50min' }, 26: { 2: 'রিজিড পেভমেন্ট' }, 27: { 1: 'রাস্তার ছবি' } }),
      ],
    ])
    const pictures = [
      at('EngBng', 9, 3, 'image1.png'),
      at('EngBng', 9, 4, 'image2.png'),
      at('EngBng', 10, 3, 'image5.jpeg'),
      at('EngBng', 10, 4, 'image6.jpeg'),
      at('Bng Questionnaire (1)', 27, 2, 'image5.jpeg'),
      at('Bng Questionnaire (1)', 3, 1, 'logo.png'),
    ]
    const found = matchWorkbookPictures(pavement(), pictures, sheets)
    expect(
      found.matches.map((match) => [match.attribute, match.alternative, match.level, match.picture.name]),
    ).toEqual([
      ['Road_Condition', 'Rigid', NEW, 'image1.png'],
      ['Road_Condition', 'Flexible', NEW, 'image2.png'],
      ['Road_Condition', 'Rigid', POOR, 'image5.jpeg'],
      ['Road_Condition', 'Flexible', POOR, 'image6.jpeg'],
    ])
    expect(found.perAlternative).toEqual({ Road_Condition: true })
    expect(found.unmatched).toBe(2)
    expect(found.conflicts).toEqual([])
  })

  it('shares a picture with no alternative above it, reads levels across the top, and reports clashes', () => {
    const sheets = new Map([
      ['Shared', sheet({ 1: { 1: 'Travel time' }, 2: { 1: '50min' }, 3: { 1: '60min' } })],
      ['Across', sheet({ 1: { 3: NEW }, 2: { 1: 'Flexible' } })],
    ])
    const found = matchWorkbookPictures(
      pavement(),
      [
        at('Shared', 2, 2, 'fifty.png'),
        at('Shared', 3, 2, 'sixty.png'),
        at('Across', 2, 3, 'flexible-new.png'),
      ],
      sheets,
    )
    expect(
      found.matches.map((match) => [match.attribute, match.alternative, match.level, match.picture.name]),
    ).toEqual([
      ['Travel_Time', '', '50min', 'fifty.png'],
      ['Travel_Time', '', '60min', 'sixty.png'],
      ['Road_Condition', 'Flexible', NEW, 'flexible-new.png'],
    ])
    expect(found.unmatched).toBe(0)
    expect(found.perAlternative).toEqual({ Travel_Time: false, Road_Condition: true })
  })

  it('keeps the first of two different pictures for one slot and says so', () => {
    const sheets = new Map([['A', sheet({ 1: { 1: '50min' }, 2: { 1: '50min' } })]])
    const found = matchWorkbookPictures(
      pavement(),
      [at('A', 1, 2, 'one.png'), at('A', 2, 2, 'two.png'), at('A', 2, 3, 'one.png')],
      sheets,
    )
    expect(found.matches.map((match) => match.picture.name)).toEqual(['one.png'])
    expect(found.conflicts).toEqual([{ alternative: '', level: '50min' }])
  })
})

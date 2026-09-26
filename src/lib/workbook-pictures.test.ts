import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// @ts-expect-error jsdom ships no type declarations here; only its DOMParser is used.
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, it } from 'vitest'
import { createQuestion, text } from '#/lib/questionnaire/factory'
import { matchWorkbookPictures } from '#/lib/questionnaire/pictures'
import type { ChoiceExperimentQuestion } from '#/lib/questionnaire/types'
import { readWorkbookPictures } from './workbook-pictures'

// Node's own Blob and DecompressionStream do the unzipping; only the XML
// parser comes from jsdom.
beforeAll(() => {
  globalThis.DOMParser = new JSDOM().window.DOMParser
})

/**
 * src/lib/__fixtures__/pictures.xlsx, built to the same structure as the
 * pavement workbook:
 * - "Pictures": Level | Rigid | Flexible, with pictures placed in cells
 *   (rich values, as Excel's "Place in Cell" stores them). B2 and C2 sit in
 *   the "New Road (Good Condition)" row (the name split into two formatted
 *   runs); B3 in a row named only in Bangla; C3 is a #N/A with no picture.
 * - "Floating": a picture floating over B2, beside "Rough", under "Flexible".
 * - "Printed form": the B2 picture again, beside "Road picture" only.
 */
function fixture(): ArrayBuffer {
  const bytes = readFileSync(fileURLToPath(new URL('./__fixtures__/pictures.xlsx', import.meta.url)))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

describe('readWorkbookPictures', () => {
  it('finds pictures placed in cells and floating over them, with the text around them', async () => {
    const workbook = await readWorkbookPictures(fixture())
    expect(
      workbook.pictures.map(({ sheet, row, col, name }) => [sheet, row, col, name]),
    ).toEqual([
      ['Pictures', 2, 2, 'image1.png'],
      ['Pictures', 2, 3, 'image2.png'],
      ['Pictures', 3, 2, 'image3.png'],
      ['Floating', 2, 2, 'image4.png'],
      ['Printed form', 1, 2, 'image1.png'],
    ])
    expect(workbook.sheets.get('Pictures')?.get(2)?.get(1)).toBe('New Road (Good Condition)')
    expect(workbook.sheets.get('Floating')?.get(1)?.get(2)).toBe('Flexible')
    // An error cell holds no text.
    expect(workbook.sheets.get('Pictures')?.get(3)?.has(3)).toBe(false)

    const stored = await workbook.file('xl/media/image1.png')
    const deflated = await workbook.file('xl/media/image2.png')
    expect(stored.type).toBe('image/png')
    for (const blob of [stored, deflated]) {
      const signature = new Uint8Array(await blob.arrayBuffer()).slice(1, 4)
      expect(new TextDecoder().decode(signature)).toBe('PNG')
    }
  })

  it('matches them to the levels of a block', async () => {
    const workbook = await readWorkbookPictures(fixture())
    const question: ChoiceExperimentQuestion = {
      ...(createQuestion('choice_experiment') as ChoiceExperimentQuestion),
      alternatives: [
        { key: 'Rigid', label: text('Rigid') },
        { key: 'Flexible', label: text('Flexible') },
      ],
      attributes: [{ key: 'Road', label: text('Road condition') }],
      cards: [
        { set: 1, levels: { Road_Rigid: 'New Road (Good Condition)', Road_Flexible: 'Rough' } },
        { set: 2, levels: { Road_Rigid: 'Very poor', Road_Flexible: 'New Road (Good Condition)' } },
      ],
      levelLabels: { 'Very poor': text('Very poor', 'খুব খারাপ রাস্তা') },
    }
    const found = matchWorkbookPictures(question, workbook.pictures, workbook.sheets)
    expect(found.matches.map((m) => [m.alternative, m.level, m.picture.name])).toEqual([
      ['Rigid', 'New Road (Good Condition)', 'image1.png'],
      ['Flexible', 'New Road (Good Condition)', 'image2.png'],
      ['Rigid', 'Very poor', 'image3.png'],
      ['Flexible', 'Rough', 'image4.png'],
    ])
    expect(found.unmatched).toBe(1)
  })

  it('refuses a file that is not a workbook', async () => {
    await expect(readWorkbookPictures(new TextEncoder().encode('Set,Cost_A').buffer)).rejects.toThrow(
      /not an Excel workbook/,
    )
  })
})

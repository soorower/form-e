import { attributeLevels, columnKey } from './cards'
import { text } from './factory'
import type {
  AttributePictures,
  ChoiceAttribute,
  ChoiceExperimentQuestion,
  LevelPicture,
} from './types'

/**
 * Picture rows in choice tables. An attribute may carry a row of pictures
 * shown directly above its own row; each cell shows the picture of the level
 * the card gives that alternative. In the pavement survey the "Road picture"
 * row sits over "Road condition", and a rigid and a flexible road in the same
 * condition look different, so the pictures are kept per alternative.
 */

export function createAttributePictures(perAlternative: boolean): AttributePictures {
  return { label: text('Picture', 'ছবি'), perAlternative, items: [] }
}

/** True when the attribute shows a picture row. */
export function hasPictureRow(attribute: ChoiceAttribute): boolean {
  return attribute.pictures !== undefined
}

/**
 * The picture for one table cell. A block kept per alternative looks for that
 * alternative's own picture first and falls back to a shared one; a shared
 * block only has shared pictures.
 */
export function levelPicture(
  attribute: ChoiceAttribute,
  alternative: string,
  level: string,
): LevelPicture | undefined {
  const pictures = attribute.pictures
  if (!pictures || level === '') return undefined
  const own = pictures.perAlternative
    ? pictures.items.find((item) => item.alternative === alternative && item.level === level)
    : undefined
  return own ?? pictures.items.find((item) => item.alternative === '' && item.level === level)
}

/** Every picture URL a block may show, once each, so a tablet can load them all up front. */
export function pictureUrls(question: ChoiceExperimentQuestion): string[] {
  const urls = new Set<string>()
  for (const attribute of question.attributes) {
    for (const item of attribute.pictures?.items ?? []) urls.add(item.url)
  }
  return [...urls]
}

/** A place a picture can go: one level, for one alternative or ('') for all. */
export interface PictureSlot {
  alternative: string
  level: string
}

/**
 * The pictures an attribute needs: every level it takes, once per
 * alternative when pictures are kept per alternative, else once. Levels are
 * in the order the cards first show them.
 */
export function pictureSlots(
  question: ChoiceExperimentQuestion,
  attribute: ChoiceAttribute,
  perAlternative = attribute.pictures?.perAlternative ?? false,
): PictureSlot[] {
  const levels = attributeLevels(question, attribute.key)
  if (!perAlternative || question.layout === 'profile') {
    return levels.map((level) => ({ alternative: '', level }))
  }
  return question.alternatives.flatMap((alternative) =>
    levels.map((level) => ({ alternative: alternative.key, level })),
  )
}

/** Slots with no picture yet. A cell shown with no picture is left empty on the tablet. */
export function missingPictures(
  question: ChoiceExperimentQuestion,
  attribute: ChoiceAttribute,
): PictureSlot[] {
  if (!attribute.pictures) return []
  const pictures = attribute.pictures
  return pictureSlots(question, attribute).filter(
    (slot) =>
      !pictures.items.some((item) => item.alternative === slot.alternative && item.level === slot.level),
  )
}

/** Puts a picture in a slot (replacing what was there), or clears it with `null`. */
export function setLevelPicture(
  pictures: AttributePictures,
  slot: PictureSlot,
  picture: Pick<LevelPicture, 'url' | 'storageId'> | null,
): AttributePictures {
  const items = pictures.items.filter(
    (item) => !(item.alternative === slot.alternative && item.level === slot.level),
  )
  if (picture) items.push({ ...slot, ...picture })
  return { ...pictures, items }
}

/** Whether the level actually occurs for this alternative in the cards. */
export function levelOccurs(
  question: ChoiceExperimentQuestion,
  attributeKey: string,
  alternative: string,
  level: string,
): boolean {
  return question.cards.some(
    (card) => card.levels[columnKey(question, attributeKey, alternative)] === level,
  )
}

/* ------------------------------------------------------------------------ */
/* Pictures from a workbook                                                  */
/* ------------------------------------------------------------------------ */

/** One picture found in a workbook, where it sits, and the sheet's cell text. */
export interface WorkbookPicture {
  sheet: string
  /** 1-based row and column of the cell the picture sits in (or is anchored to). */
  row: number
  col: number
  /** The picture file's name inside the workbook, e.g. "image3.jpeg". */
  name: string
}

/** A sheet's cell text by 1-based row, then column. */
export type SheetText = Map<number, Map<number, string>>

export interface PictureMatch<P extends WorkbookPicture = WorkbookPicture> {
  attribute: string
  alternative: string
  level: string
  picture: P
}

export interface WorkbookPictureMatches<P extends WorkbookPicture = WorkbookPicture> {
  matches: PictureMatch<P>[]
  /** Attributes that got pictures, and whether the alternatives had different ones. */
  perAlternative: Record<string, boolean>
  /** Pictures next to no level name: logos, pictures in the printed questionnaires. */
  unmatched: number
  /** Slots two different pictures claimed; the first one found was kept. */
  conflicts: PictureSlot[]
}

const normalise = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Matches pictures placed in a workbook to the block's levels, the way the
 * pavement workbook's `EngBng` sheet lays them out: a row per level, holding
 * the level's name ("New Road (Good Condition)", or its translation) with a
 * picture per alternative in the columns headed "Rigid" and "Flexible". The
 * level is looked for across the picture's row, the alternative in the
 * nearest text above it; a sheet laid out the other way round (levels across
 * the top, alternatives down the side) works too. A picture with no alternative heading above it is shared by all of
 * them. Names match on their English or Bangla wording, ignoring case and
 * extra blanks.
 */
export function matchWorkbookPictures<P extends WorkbookPicture>(
  question: ChoiceExperimentQuestion,
  pictures: P[],
  sheets: Map<string, SheetText>,
): WorkbookPictureMatches<P> {
  const levelNames = new Map<string, { attribute: string; level: string }[]>()
  for (const attribute of question.attributes) {
    for (const level of attributeLevels(question, attribute.key)) {
      const label = question.levelLabels[level]
      for (const name of new Set([level, label?.en ?? '', label?.bn ?? ''].map(normalise))) {
        if (!name) continue
        const known = levelNames.get(name) ?? []
        known.push({ attribute: attribute.key, level })
        levelNames.set(name, known)
      }
    }
  }
  const alternativeNames = new Map<string, string>()
  if (question.layout !== 'profile') {
    for (const alternative of question.alternatives) {
      for (const name of [alternative.key, alternative.label.en, alternative.label.bn]) {
        if (normalise(name)) alternativeNames.set(normalise(name), alternative.key)
      }
    }
  }

  const matches: PictureMatch<P>[] = []
  const conflicts: PictureSlot[] = []
  let unmatched = 0

  for (const picture of pictures) {
    const grid = sheets.get(picture.sheet)
    const rowTexts = [...(grid?.get(picture.row) ?? new Map<number, string>()).entries()]
      .filter(([col]) => col !== picture.col)
      .map(([, value]) => value)
    // Only the nearest text above counts, the column's heading. Scanning
    // further up read the printed questionnaires' scenario pictures as
    // pictures of whatever level the scenario above them showed.
    const columnAbove: string[] = []
    for (let row = picture.row - 1; row >= 1 && columnAbove.length === 0; row--) {
      const value = grid?.get(row)?.get(picture.col)
      if (value) columnAbove.push(value)
    }
    const found =
      locate(rowTexts, columnAbove, levelNames, alternativeNames) ??
      // Levels across the top, alternatives down the side.
      locate(columnAbove, rowTexts, levelNames, alternativeNames)
    if (!found) {
      unmatched += 1
      continue
    }
    const clash = matches.find(
      (match) =>
        match.attribute === found.attribute &&
        match.alternative === found.alternative &&
        match.level === found.level,
    )
    if (clash) {
      if (clash.picture.name !== picture.name) {
        conflicts.push({ alternative: found.alternative, level: found.level })
      }
      continue
    }
    matches.push({ ...found, picture })
  }

  const perAlternative: Record<string, boolean> = {}
  for (const match of matches) {
    perAlternative[match.attribute] = (perAlternative[match.attribute] ?? false) || match.alternative !== ''
  }
  return { matches, perAlternative, unmatched, conflicts }
}

/**
 * The level named among `levelSide` and the alternative named among
 * `alternativeSide`. Null when no level is named.
 */
function locate(
  levelSide: string[],
  alternativeSide: string[],
  levelNames: Map<string, { attribute: string; level: string }[]>,
  alternativeNames: Map<string, string>,
): { attribute: string; level: string; alternative: string } | null {
  const named = levelSide.map((value) => levelNames.get(normalise(value))).find(Boolean)
  if (!named) return null
  // A name shared by two attributes ("Good" for road and for service) is
  // ambiguous; the first attribute wins, as the rows are listed.
  const [{ attribute, level }] = named
  const alternative =
    alternativeSide.map((value) => alternativeNames.get(normalise(value))).find(Boolean) ?? ''
  return { attribute, level, alternative }
}

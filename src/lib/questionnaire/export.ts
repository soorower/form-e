import { OTHER_ANSWER, isChoiceExperimentAnswer, isTableAnswer, scenarioChoice } from './answers'
import { columnKey } from './cards'
import { pickText, questionNumbers } from './factory'
import { activeRespondentFields, respondentColumn } from './respondent'
import type {
  AnswerValue,
  ChoiceExperimentQuestion,
  ChoiceQuestion,
  ChoicePrompt,
  Lang,
  Question,
  Questionnaire,
  SurveyResponse,
} from './types'

export type ExportRow = Record<string, string | number>

function optionText(question: Question, id: string, lang: Lang): string {
  if (!('options' in question)) return id
  const option = question.options.find((o) => o.id === id)
  return option ? pickText(option.label, lang) : id
}

function plainAnswer(question: Question, value: AnswerValue | undefined, lang: Lang): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    return question.type === 'single_choice' || question.type === 'dropdown'
      ? optionText(question, value, lang)
      : value
  }
  if (Array.isArray(value)) return value.map((id) => optionText(question, id, lang)).join('; ')
  return ''
}

/** The ids ticked on a multiple-choice question, ignoring anything else. */
function selectedIds(value: AnswerValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
}

/**
 * A multiple-choice answer in the question's own option order, so the first
 * column always holds the earliest option ticked rather than whichever was
 * tapped first. Ids the question no longer has (an option deleted after the
 * response came in) keep their place at the end.
 */
export function orderedSelections(question: ChoiceQuestion, value: AnswerValue | undefined): string[] {
  const ticked = selectedIds(value)
  const order = new Map(question.options.map((option, index) => [option.id, index]))
  const known = ticked.filter((id) => order.has(id))
  known.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  return [...known, ...ticked.filter((id) => !order.has(id))]
}

/**
 * How many columns a multiple-choice question needs: as many as the most
 * selections any one respondent made, and never fewer than one, so the
 * question still has a column when nobody ticked anything.
 *
 * Driven by the answers alone, so a question with ten options that people only
 * ever pick two of takes two columns. It is deliberately not capped at the
 * option count: options deleted after the responses came in would then make
 * the export quietly drop the selections that no longer have an option.
 * The Responses tab works the column list out from every response, so a
 * download narrowed to one enumerator keeps the same layout as the others.
 */
export function selectionColumnCount(
  question: ChoiceQuestion,
  responses: Pick<SurveyResponse, 'answers'>[],
): number {
  let widest = 1
  for (const response of responses) {
    widest = Math.max(widest, selectedIds(response.answers[question.id]).length)
  }
  return widest
}

/**
 * Column heading for the nth selection of a multiple-choice question:
 * "3. Modes used (1)", "3. Modes used (2)", … One selection per column keeps
 * every answer on its own, the way a data-entry sheet has study_hr1 and
 * study_hr2 instead of one cell holding both.
 */
export function selectionColumn(heading: string, index: number): string {
  return `${heading} (${index + 1})`
}

/** English when the survey has it, since analysis scripts usually expect English headings. */
export function defaultExportLanguage(questionnaire: Questionnaire): Lang {
  return questionnaire.languages.includes('en') ? 'en' : questionnaire.defaultLanguage
}

/**
 * Names the row of the creator's scenario plan an interview was given, beside
 * the card's own `Set`. The plan's sheet calls it "Set" too, but that name is
 * already taken here by the design card, so the column says "Plan row".
 */
export const PLAN_ROW_COLUMN = 'Plan row'

/** "Choice" for the first prompt under a scenario, "Choice 2", "Choice 3", … for the rest. */
export function choiceColumn(promptIndex: number): string {
  return promptIndex === 0 ? 'Choice' : `Choice ${promptIndex + 1}`
}

/** The choice columns a block writes, in order: one per prompt, plus the "Other" text where allowed. */
export function choiceColumns(question: Pick<ChoiceExperimentQuestion, 'prompts'>): string[] {
  const prompts = question.prompts.length > 0 ? question.prompts : [null]
  return prompts.flatMap((prompt, index) => {
    const column = choiceColumn(index)
    return prompt?.allowOther ? [column, `${column} (other)`] : [column]
  })
}

/**
 * What goes in a choice column. A prompt answered with the table's columns
 * records the column picked by its key (A/B, or Bus/Train); a prompt with
 * its own options (always the case in the profile layout, whose table has
 * one column) records the answer by its English label ("Yes"), so the
 * export reads without a code book.
 */
function choiceText(
  question: Pick<ChoiceExperimentQuestion, 'layout'>,
  prompt: ChoicePrompt | undefined,
  chosen: string,
): string {
  if (chosen === '' || !prompt) return chosen
  if (prompt.answer === 'alternative' && question.layout !== 'profile') return chosen
  if (chosen === OTHER_ANSWER) return 'Other'
  const option = prompt.options.find((candidate) => candidate.key === chosen)
  return option ? option.label.en || option.key : chosen
}

/**
 * Flattens responses into analysis-ready rows. Plain questions become one
 * column each; a multiple-choice question becomes one column per selection;
 * table questions become one column per row × column; a choice experiment
 * produces one output row per scenario shown, carrying the set number, every
 * attribute level, and the answer to each prompt. Responses with no choice
 * scenarios produce a single row.
 */
export function responsesToRows(
  questionnaire: Questionnaire,
  responses: SurveyResponse[],
  lang: Lang = defaultExportLanguage(questionnaire),
): ExportRow[] {
  const numbers = questionNumbers(questionnaire.questions)
  const rows: ExportRow[] = []
  // Worked out once from the whole batch, so every row carries the same
  // selection columns and the table is not ragged.
  const selectionWidths = new Map(
    questionnaire.questions.flatMap((question) =>
      question.type === 'multi_choice'
        ? [[question.id, selectionColumnCount(question, responses)] as const]
        : [],
    ),
  )
  const respondentFields = activeRespondentFields(questionnaire)

  for (const response of responses) {
    const base: ExportRow = {
      'Response ID': response.id,
      'Survey no.': response.surveyNumber,
      Enumerator: response.enumerator,
      // Only the details this survey asks for, always present as columns so a
      // respondent who left one blank does not shift the table.
      ...Object.fromEntries(
        respondentFields.map((field) => [
          respondentColumn(field.key),
          response.respondent?.[field.key] ?? '',
        ]),
      ),
      'Submitted at': new Date(response.submittedAt).toISOString(),
      Language: response.language,
    }
    const scenarioRows: ExportRow[] = []

    questionnaire.questions.forEach((question, index) => {
      const value = response.answers[question.id]
      const heading = `${numbers[index]}. ${pickText(question.label, lang)}`

      if (question.type === 'multi_choice') {
        // One column per selection: (1) holds the first option ticked, (2) the
        // second, and so on, rather than one cell holding "a; b".
        const chosen = orderedSelections(question, value)
        const width = selectionWidths.get(question.id) ?? 1
        for (let slot = 0; slot < width; slot += 1) {
          const id = chosen[slot]
          base[selectionColumn(heading, slot)] = id ? optionText(question, id, lang) : ''
        }
        return
      }

      if (question.type === 'table') {
        const answer = isTableAnswer(value) ? value : { rows: [] }
        const fixed = new Map(question.rows.map((row) => [row.id, pickText(row.label, lang)]))
        answer.rows.forEach((row, rowIndex) => {
          const rowLabel = fixed.get(row.id) ?? `Row ${rowIndex + 1}`
          for (const column of question.columns) {
            const cell = row.cells[column.id]
            const columnLabel = pickText(column.label, lang)
            base[`${heading} / ${rowLabel} / ${columnLabel}`] =
              typeof cell === 'boolean' ? (cell ? 'Yes' : 'No') : (cell ?? '')
          }
        })
        return
      }

      if (question.type === 'choice_experiment') {
        const answer = isChoiceExperimentAnswer(value) ? value : { scenarios: [] }
        const perScenario = Math.max(1, question.prompts.length)
        answer.scenarios.forEach((scenario, scenarioIndex) => {
          const row: ExportRow = {
            Block: pickText(question.label, lang),
            // The number of the first question under this scenario's table.
            Question: numbers[index] + scenarioIndex * perScenario,
            // Which row of the creator's scenario plan this interview was
            // given; blank on blocks that draw their own cards.
            ...(answer.planRow === undefined ? {} : { [PLAN_ROW_COLUMN]: answer.planRow }),
            Scenario: scenarioIndex + 1,
            Set: scenario.set,
          }
          for (const alternative of question.alternatives) {
            for (const attribute of question.attributes) {
              const key = columnKey(question, attribute.key, alternative.key)
              row[key] = scenario.levels[key] ?? ''
            }
          }
          if (question.prompts.length === 0) {
            row.Choice = scenario.choice
          }
          question.prompts.forEach((prompt, promptIndex) => {
            const column = choiceColumn(promptIndex)
            const chosen = scenarioChoice(scenario, prompt, promptIndex)
            row[column] = choiceText(question, prompt, chosen)
            if (prompt.allowOther) {
              row[`${column} (other)`] = chosen === OTHER_ANSWER ? (scenario.other?.[prompt.key] ?? '') : ''
            }
          })
          scenarioRows.push(row)
        })
        return
      }

      base[heading] = plainAnswer(question, value, lang)
    })

    if (scenarioRows.length === 0) {
      rows.push(base)
    } else {
      for (const scenarioRow of scenarioRows) rows.push({ ...base, ...scenarioRow })
    }
  }

  return rows
}

/** Every column name across the rows, in order of first appearance, with choice columns last. */
export function exportColumns(questionnaire: Questionnaire, rows: ExportRow[]): string[] {
  const columns: string[] = []
  const trailing: string[] = ['Block', 'Question', PLAN_ROW_COLUMN, 'Scenario', 'Set']
  const choices: string[] = ['Choice']
  for (const question of questionnaire.questions) {
    if (question.type !== 'choice_experiment') continue
    for (const alternative of question.alternatives) {
      for (const attribute of question.attributes) {
        const key = columnKey(question, attribute.key, alternative.key)
        if (!trailing.includes(key)) trailing.push(key)
      }
    }
    for (const column of choiceColumns(question)) {
      if (!choices.includes(column)) choices.push(column)
    }
  }
  trailing.push(...choices)
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key) && !trailing.includes(key)) columns.push(key)
    }
  }
  const used = new Set(rows.flatMap((row) => Object.keys(row)))
  return [...columns, ...trailing.filter((key) => used.has(key))]
}

function csvCell(value: string | number | undefined): string {
  const textValue = value == null ? '' : String(value)
  return /[",\n\r]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue
}

/** CSV with a UTF-8 byte-order mark so Excel opens Bangla text correctly. */
export function toCsv(columns: string[], rows: ExportRow[]): string {
  const lines = [columns.map(csvCell).join(',')]
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

/**
 * The name responses are grouped under on the Responses tab: trimmed, and ''
 * when the tablet recorded none (shown as "(no name)").
 */
export function enumeratorKey(response: Pick<SurveyResponse, 'enumerator'>): string {
  return response.enumerator.trim()
}

/** How many responses each enumerator collected, the most first. */
export function countByEnumerator(
  responses: Pick<SurveyResponse, 'enumerator'>[],
): [enumerator: string, count: number][] {
  const counts = new Map<string, number>()
  for (const response of responses) {
    const key = enumeratorKey(response)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])
}

/** One enumerator's responses, or all of them when `enumerator` is null. */
export function filterByEnumerator<T extends Pick<SurveyResponse, 'enumerator'>>(
  responses: T[],
  enumerator: string | null,
): T[] {
  return enumerator === null
    ? responses
    : responses.filter((response) => enumeratorKey(response) === enumerator)
}

/**
 * `enumerator` names the one person a filtered download holds ('' for the
 * responses without a name), so the file cannot pass for the whole survey.
 * Names keep their own script; only what a file name cannot hold is dropped.
 */
export function exportFileName(
  questionnaire: Questionnaire,
  extension: string,
  enumerator: string | null = null,
): string {
  const title = pickText(questionnaire.title, 'en') || 'survey'
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  const date = new Date().toISOString().slice(0, 10)
  const who =
    enumerator === null
      ? ''
      : `-${
          enumerator
            .replace(/[\\/:*?"<>|.\s]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase() || 'no-name'
        }`
  return `${slug || 'survey'}-responses${who}-${date}.${extension}`
}

export function downloadText(fileName: string, content: string, mimeType: string) {
  downloadBlob(fileName, new Blob([content], { type: mimeType }))
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

import { isChoiceExperimentAnswer, isTableAnswer } from './answers'
import { columnKey } from './cards'
import { pickText, questionNumbers } from './factory'
import type {
  AnswerValue,
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

/**
 * Flattens responses into analysis-ready rows. Plain questions become one
 * column each; table questions become one column per row × column; a choice
 * experiment produces one output row per scenario shown, carrying the set
 * number, every attribute level, and the chosen alternative. Responses with
 * no choice scenarios produce a single row.
 */
/** English when the survey has it, since analysis scripts usually expect English headings. */
export function defaultExportLanguage(questionnaire: Questionnaire): Lang {
  return questionnaire.languages.includes('en') ? 'en' : questionnaire.defaultLanguage
}

export function responsesToRows(
  questionnaire: Questionnaire,
  responses: SurveyResponse[],
  lang: Lang = defaultExportLanguage(questionnaire),
): ExportRow[] {
  const numbers = questionNumbers(questionnaire.questions)
  const rows: ExportRow[] = []

  for (const response of responses) {
    const base: ExportRow = {
      'Response ID': response.id,
      'Survey no.': response.surveyNumber,
      Enumerator: response.enumerator,
      'Submitted at': new Date(response.submittedAt).toISOString(),
      Language: response.language,
    }
    const scenarioRows: ExportRow[] = []

    questionnaire.questions.forEach((question, index) => {
      const value = response.answers[question.id]
      const heading = `${numbers[index]}. ${pickText(question.label, lang)}`

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
        answer.scenarios.forEach((scenario, scenarioIndex) => {
          const row: ExportRow = {
            Block: pickText(question.label, lang),
            Question: numbers[index] + scenarioIndex,
            Scenario: scenarioIndex + 1,
            Set: scenario.set,
          }
          for (const alternative of question.alternatives) {
            for (const attribute of question.attributes) {
              const key = columnKey(question, attribute.key, alternative.key)
              row[key] = scenario.levels[key] ?? ''
            }
          }
          // Alternatives layout records the column picked (A/B); the profile
          // layout records the answer given, by its English label ("Yes").
          const option =
            question.layout === 'profile'
              ? question.choiceOptions.find((candidate) => candidate.key === scenario.choice)
              : undefined
          row.Choice = option ? option.label.en || option.key : scenario.choice
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
  const trailing: string[] = ['Block', 'Question', 'Scenario', 'Set']
  for (const question of questionnaire.questions) {
    if (question.type !== 'choice_experiment') continue
    for (const alternative of question.alternatives) {
      for (const attribute of question.attributes) {
        const key = columnKey(question, attribute.key, alternative.key)
        if (!trailing.includes(key)) trailing.push(key)
      }
    }
  }
  trailing.push('Choice')
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

export function exportFileName(questionnaire: Questionnaire, extension: string): string {
  const title = pickText(questionnaire.title, 'en') || 'survey'
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  const date = new Date().toISOString().slice(0, 10)
  return `${slug || 'survey'}-responses-${date}.${extension}`
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

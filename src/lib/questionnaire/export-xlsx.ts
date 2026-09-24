import type * as ExcelJSTypes from 'exceljs'
import { columnKey } from './cards'
import { selectionColumn, type ExportRow } from './export'
import { blockQuestionCount, pickText, questionNumbers, questionTypeLabel } from './factory'
import { followsPlan, planRows } from './scenario-plan'
import type { ChoiceExperimentQuestion, Lang, Questionnaire } from './types'

type ExcelJSModule = typeof ExcelJSTypes

/** Loads exceljs on demand so the respondent-facing pages never ship it. */
async function loadExcelJS(): Promise<ExcelJSModule> {
  const mod = (await import('exceljs')) as ExcelJSModule & { default?: ExcelJSModule }
  return mod.default ?? mod
}

const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?$/
const HEADER_FILL: ExcelJSTypes.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8ECF7' },
}

/**
 * Beyond 15 digits neither a JS number nor an Excel cell holds a value
 * exactly: a 17-digit NID typed into a text question came back altered.
 */
const MAX_EXACT_DIGITS = 15

/** Numeric answers become numbers so Excel can sum and filter them; ids and long digit strings stay text. */
export function cellValue(column: string, value: string | number | undefined): string | number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  if (
    column !== 'Response ID' &&
    column !== 'Survey no.' &&
    NUMERIC.test(value) &&
    value.replace(/\D/g, '').length <= MAX_EXACT_DIGITS
  ) {
    return Number(value)
  }
  return value
}

function styleHeader(row: ExcelJSTypes.Row) {
  row.font = { bold: true }
  row.fill = HEADER_FILL
  row.alignment = { vertical: 'middle', wrapText: true }
}

function fitColumns(sheet: ExcelJSTypes.Worksheet, min = 8, max = 60) {
  sheet.columns.forEach((column) => {
    let width = min
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const longest = String(cell.value ?? '')
        .split('\n')
        .reduce((best, line) => Math.max(best, line.length), 0)
      width = Math.max(width, Math.min(max, longest + 2))
    })
    column.width = width
  })
}

/**
 * Builds a workbook: the flattened responses (same rows as the CSV), the design
 * cards of every choice block, the scenario plan of any block that follows
 * one, and the question list. Returns the .xlsx file contents.
 */
export async function buildResponsesWorkbook(
  questionnaire: Questionnaire,
  columns: string[],
  rows: ExportRow[],
  lang: Lang,
): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Form-E'
  workbook.created = new Date()

  const responses = workbook.addWorksheet('Responses', { views: [{ state: 'frozen', ySplit: 1 }] })
  responses.addRow(columns)
  styleHeader(responses.getRow(1))
  for (const row of rows) {
    const added = responses.addRow(columns.map((column) => cellValue(column, row[column])))
    added.eachCell((cell) => {
      if (typeof cell.value === 'string' && cell.value.includes('\n')) {
        cell.alignment = { wrapText: true, vertical: 'top' }
      }
    })
  }
  if (columns.length > 0) {
    responses.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: columns.length },
    }
  }
  fitColumns(responses)

  const blocks = questionnaire.questions.filter((q) => q.type === 'choice_experiment')
  if (blocks.length > 0) {
    const cards = workbook.addWorksheet('Design cards')
    const numbers = questionNumbers(questionnaire.questions)
    blocks.forEach((block, blockIndex) => {
      const index = questionnaire.questions.indexOf(block)
      const title = cards.addRow([
        `${pickText(block.label, lang) || `Block ${blockIndex + 1}`} (questions ${numbers[index]}–${
          numbers[index] + blockQuestionCount(block) - 1
        }, ${block.scenariosPerRespondent} of ${block.cards.length} cards per respondent)`,
      ])
      title.font = { bold: true, size: 12 }
      const keys = block.alternatives.flatMap((alternative) =>
        block.attributes.map((attribute) => columnKey(block, attribute.key, alternative.key)),
      )
      styleHeader(cards.addRow(['Set', ...keys]))
      for (const card of block.cards) {
        const added = cards.addRow([card.set, ...keys.map((key) => card.levels[key] ?? '')])
        added.eachCell((cell) => {
          if (typeof cell.value === 'string' && cell.value.includes('\n')) {
            cell.alignment = { wrapText: true, vertical: 'top' }
          }
        })
      }
      cards.addRow([])
    })
    fitColumns(cards)
  }

  const planned = blocks.filter(followsPlan)
  if (planned.length > 0) {
    // The creator's own allocation, so the file they download says which cards
    // each plan row hands out and can be checked against the Plan row column.
    const sheet = workbook.addWorksheet('Scenario plan')
    const numbers = questionNumbers(questionnaire.questions)
    planned.forEach((block, blockIndex) => {
      const index = questionnaire.questions.indexOf(block)
      const rows = planRows(block)
      const title = sheet.addRow([
        `${pickText(block.label, lang) || `Block ${blockIndex + 1}`} (questions ${numbers[index]}–${
          numbers[index] + blockQuestionCount(block) - 1
        }, ${rows.length} plan rows). The "Plan row" column of the Responses sheet says which row an interview was given.`,
      ])
      title.font = { bold: true, size: 12 }
      const widest = Math.max(1, ...rows.map((row) => row.sets.length))
      styleHeader(
        sheet.addRow([
          'Plan row',
          ...Array.from({ length: widest }, (_unused, slot) => `Scenario ${slot + 1}`),
        ]),
      )
      for (const row of rows) {
        sheet.addRow([
          row.row,
          ...Array.from({ length: widest }, (_unused, slot) => row.sets[slot] ?? null),
        ])
      }
      sheet.addRow([])
    })
    fitColumns(sheet)
  }

  const questions = workbook.addWorksheet('Questions')
  styleHeader(questions.addRow(['No.', 'Type', 'Question (English)', 'Question (বাংলা)', 'Details']))
  const numbers = questionNumbers(questionnaire.questions)
  questionnaire.questions.forEach((question, index) => {
    let details = ''
    if (question.type === 'multi_choice') {
      // Several selections, so the export gives each one its own column.
      const heading = `${numbers[index]}. ${pickText(question.label, lang)}`
      details = `Tick all that apply: ${question.options
        .map((option) => pickText(option.label, lang))
        .join('; ')} | One column per selection: "${selectionColumn(heading, 0)}", "${selectionColumn(heading, 1)}", …`
    } else if ('options' in question) {
      details = question.options.map((option) => pickText(option.label, lang)).join('; ')
    } else if (question.type === 'table') {
      details = `Rows: ${question.rows.map((row) => pickText(row.label, lang)).join('; ')} | Columns: ${question.columns.map((column) => pickText(column.label, lang)).join('; ')}`
    } else if (question.type === 'choice_experiment') {
      details = `${blockSummary(question)}`
    } else if (question.type === 'number') {
      details = pickText(question.unit, lang)
    }
    const number =
      question.type === 'choice_experiment'
        ? `${numbers[index]}–${numbers[index] + blockQuestionCount(question) - 1}`
        : String(numbers[index])
    questions.addRow([
      number,
      questionTypeLabel(question.type),
      question.label.en,
      question.label.bn,
      details,
    ])
  })
  fitColumns(questions, 8, 80)

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

function blockSummary(question: ChoiceExperimentQuestion) {
  const alternatives = question.alternatives.map((a) => `${a.key}=${a.label.en || a.key}`).join(', ')
  const attributes = question.attributes.map((a) => a.key).join(', ')
  const handedOut = followsPlan(question)
    ? `${planRows(question).length} rows of the scenario plan (see the Scenario plan sheet)`
    : question.drawMode === 'balanced'
      ? 'cards shared out evenly'
      : 'cards drawn at random'
  // "Choice", "Choice 2", … name the export columns each prompt fills.
  const prompts = question.prompts
    .map((prompt, index) => {
      const column = index === 0 ? 'Choice' : `Choice ${index + 1}`
      const answers =
        prompt.answer === 'alternative'
          ? 'one of the alternatives'
          : [...prompt.options.map((option) => option.label.en || option.key), ...(prompt.allowOther ? ['Other'] : [])].join(' / ')
      return `${column}: ${prompt.text.en || prompt.text.bn} (${answers})`
    })
    .join(' | ')
  return `${question.cards.length} cards, ${question.scenariosPerRespondent} per respondent, ${handedOut} | Alternatives: ${alternatives} | Attributes: ${attributes} | ${prompts}`
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

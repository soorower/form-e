import type * as ExcelJSTypes from 'exceljs'
import { columnKey } from './cards'
import type { ExportRow } from './export'
import { pickText, questionNumbers, questionTypeLabel } from './factory'
import type { Lang, Questionnaire } from './types'

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

/** Numeric answers become numbers so Excel can sum and filter them; ids stay text. */
function cellValue(column: string, value: string | number | undefined): string | number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  if (column !== 'Response ID' && column !== 'Survey no.' && NUMERIC.test(value)) {
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
 * Builds a workbook with three sheets: the flattened responses (same rows as
 * the CSV), the design cards of every choice block, and the question list.
 * Returns the .xlsx file contents.
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
          numbers[index] + block.scenariosPerRespondent - 1
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

  const questions = workbook.addWorksheet('Questions')
  styleHeader(questions.addRow(['No.', 'Type', 'Question (English)', 'Question (বাংলা)', 'Details']))
  const numbers = questionNumbers(questionnaire.questions)
  questionnaire.questions.forEach((question, index) => {
    let details = ''
    if ('options' in question) {
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
        ? `${numbers[index]}–${numbers[index] + question.scenariosPerRespondent - 1}`
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

function blockSummary(question: Extract<Questionnaire['questions'][number], { type: 'choice_experiment' }>) {
  const alternatives = question.alternatives.map((a) => `${a.key}=${a.label.en || a.key}`).join(', ')
  const attributes = question.attributes.map((a) => a.key).join(', ')
  return `${question.cards.length} cards, ${question.scenariosPerRespondent} per respondent | Alternatives: ${alternatives} | Attributes: ${attributes}`
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

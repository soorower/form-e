import type * as ExcelJSTypes from 'exceljs'
import { exportColumns, responsesToRows } from '#/lib/questionnaire/export'
import { cellValue } from '#/lib/questionnaire/export-xlsx'
import { pickText } from '#/lib/questionnaire/factory'
import type { PendingResponse } from '#/lib/questionnaire/outbox'
import type { Questionnaire, SurveyResponse } from '#/lib/questionnaire/types'

/**
 * "Download unsent responses": the tablet's last resort when it cannot reach
 * the server for days. The same responses in two files: JSON, and an Excel
 * workbook that shows them the way the Responses tab exports them and also
 * carries the JSON on a hidden sheet. A builder imports either one on any
 * computer ("Import tablet backup" on the Surveys page), which records each
 * response once, under the number it was done under when still free.
 */

export const BACKUP_FORMAT = 'forme-unsent-responses'
const BACKUP_SHEET = 'Form-E backup'
/** Excel holds at most 32,767 characters in a cell. */
const CHUNK = 30_000

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: string
  responses: PendingResponse[]
}

export function buildBackup(pending: PendingResponse[]): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    responses: pending,
  }
}

export function backupFileName(extension: 'json' | 'xlsx', now = new Date()): string {
  const stamp = `${now.toISOString().slice(0, 10)}-${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes(),
  ).padStart(2, '0')}`
  return `forme-unsent-responses-${stamp}.${extension}`
}

export function backupJson(pending: PendingResponse[]): string {
  return JSON.stringify(buildBackup(pending), null, 2)
}

/** A waiting response in the shape the exports read. */
function asResponse(pending: PendingResponse): SurveyResponse {
  const serial = pending.paperSerial ?? pending.claimedSerial ?? 0
  return {
    id: pending.id,
    questionnaireId: pending.questionnaireId,
    serial,
    surveyNumber: pending.surveyNumber ?? '',
    enumerator: pending.enumerator,
    language: pending.language,
    ...(pending.respondent ? { respondent: pending.respondent } : {}),
    answers: pending.answers,
    submittedAt: pending.queuedAt,
    ...(pending.paperSerial !== undefined ? { paper: true } : {}),
  }
}

/** A worksheet name Excel accepts, unique within the workbook. */
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Survey'
  let name = base
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base.slice(0, 26)} ${n}`
  used.add(name.toLowerCase())
  return name
}

async function loadExcelJS(): Promise<typeof ExcelJSTypes> {
  const mod = (await import('exceljs')) as typeof ExcelJSTypes & { default?: typeof ExcelJSTypes }
  return mod.default ?? mod
}

/**
 * The Excel copy: an "About" sheet, one sheet per survey with the responses
 * as the Responses tab exports them (for surveys this tablet has saved), and
 * the JSON on a hidden sheet for importing.
 */
export async function backupWorkbook(
  pending: PendingResponse[],
  surveys: Map<string, Questionnaire>,
): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Form-E'
  workbook.created = new Date()

  const about = workbook.addWorksheet('About')
  about.addRow(['Form-E · responses not yet sent to the server']).font = { bold: true, size: 13 }
  about.addRow([`Saved from this tablet on ${new Date().toLocaleString()}`])
  about.addRow([`${pending.length} ${pending.length === 1 ? 'response' : 'responses'}`])
  about.addRow([])
  about.addRow([
    'To put them on the server: a survey builder opens Surveys → "Import tablet backup" and picks this file.',
  ])
  about.addRow(['Each response is recorded once, even if the tablet also sends it later.'])
  about.getColumn(1).width = 100

  const used = new Set(['about', BACKUP_SHEET.toLowerCase()])
  const bySurvey = new Map<string, PendingResponse[]>()
  for (const response of pending) {
    bySurvey.set(response.questionnaireId, [...(bySurvey.get(response.questionnaireId) ?? []), response])
  }
  for (const [surveyId, responses] of bySurvey) {
    const questionnaire = surveys.get(surveyId)
    const title = questionnaire ? pickText(questionnaire.title, questionnaire.defaultLanguage) : surveyId
    const sheet = workbook.addWorksheet(sheetName(title || surveyId, used), {
      views: [{ state: 'frozen', ySplit: 1 }],
    })
    if (!questionnaire) {
      // Not saved on this tablet, so its questions are unknown here: the
      // answers are listed as they are kept.
      sheet.addRow(['Response ID', 'Enumerator', 'Collected at', 'Answers (JSON)']).font = { bold: true }
      for (const response of responses) {
        sheet.addRow([
          response.id,
          response.enumerator,
          new Date(response.queuedAt).toLocaleString(),
          JSON.stringify(response.answers),
        ])
      }
      continue
    }
    const rows = responsesToRows(questionnaire, responses.map(asResponse))
    const columns = exportColumns(questionnaire, rows)
    sheet.addRow(columns).font = { bold: true }
    for (const row of rows) sheet.addRow(columns.map((column) => cellValue(column, row[column])))
    sheet.columns.forEach((column) => {
      column.width = 18
    })
  }

  const hidden = workbook.addWorksheet(BACKUP_SHEET, { state: 'hidden' })
  const json = JSON.stringify(buildBackup(pending))
  hidden.addRow([BACKUP_FORMAT])
  for (let start = 0; start < json.length; start += CHUNK) {
    hidden.addRow([json.slice(start, start + CHUNK)])
  }

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

function isPending(value: unknown): value is PendingResponse {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.questionnaireId === 'string' &&
    typeof row.enumerator === 'string' &&
    (row.language === 'en' || row.language === 'bn') &&
    typeof row.answers === 'object' &&
    row.answers !== null &&
    typeof row.queuedAt === 'number'
  )
}

/** The responses in a backup's JSON text; throws with a readable reason otherwise. */
export function parseBackupJson(text: string): PendingResponse[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not a Form-E backup (it could not be read as JSON).')
  }
  const file = parsed as Partial<BackupFile> | null
  if (!file || file.format !== BACKUP_FORMAT || !Array.isArray(file.responses)) {
    throw new Error('This file is not a Form-E backup of unsent responses.')
  }
  return file.responses.filter(isPending)
}

/** Reads a backup from the .json or the .xlsx file "Download unsent responses" saved. */
export async function readBackupFile(file: File): Promise<PendingResponse[]> {
  if (/\.json$/i.test(file.name) || file.type === 'application/json') {
    return parseBackupJson(await file.text())
  }
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = await loadExcelJS()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const sheet = workbook.getWorksheet(BACKUP_SHEET)
    if (!sheet) throw new Error('This workbook has no Form-E backup inside it.')
    const parts: string[] = []
    sheet.eachRow((row, index) => {
      if (index === 1) return
      parts.push(String(row.getCell(1).value ?? ''))
    })
    return parseBackupJson(parts.join(''))
  }
  throw new Error('Pick the .json or .xlsx file saved by "Download unsent responses".')
}

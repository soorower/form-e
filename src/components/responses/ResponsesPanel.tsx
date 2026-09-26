import { useState } from 'react'
import { Download, FileJson, FileSpreadsheet, Inbox } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import {
  countByEnumerator,
  defaultExportLanguage,
  downloadBlob,
  downloadText,
  exportColumns,
  exportFileName,
  filterByEnumerator,
  responsesToRows,
  toCsv,
} from '#/lib/questionnaire/export'
import { XLSX_MIME, buildResponsesWorkbook } from '#/lib/questionnaire/export-xlsx'
import { LANGUAGE_LABELS } from '#/lib/questionnaire/factory'
import { activeRespondentFields } from '#/lib/questionnaire/respondent'
import type { Lang, Questionnaire } from '#/lib/questionnaire/types'
import { useSurveyResponses } from '#/hooks/useSurveyResponses'
import { UNNAMED } from '#/lib/team/stats'
import { cn } from '#/lib/utils'

interface ResponsesPanelProps {
  questionnaire: Questionnaire
}

const PREVIEW_ROWS = 25
const LATEST_COUNT = 10

/**
 * Response count, downloads, the latest submissions, and a preview of the
 * flattened export table. The downloads keep responses in survey-number
 * order; the preview shows the newest first, since a choice-experiment
 * survey turns every response into several rows and the latest one would
 * otherwise sit far below the fold.
 *
 * Clicking an enumerator narrows all of it, downloads included, to that
 * person's responses. The columns still come from every response, so each
 * person's file has the same layout and the files can be stacked.
 */
export function ResponsesPanel({ questionnaire }: ResponsesPanelProps) {
  const { responses, complete } = useSurveyResponses(questionnaire.id)
  const [lang, setLang] = useState<Lang>(() => defaultExportLanguage(questionnaire))
  const [building, setBuilding] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [previewLimit, setPreviewLimit] = useState(PREVIEW_ROWS)
  const [showAllLatest, setShowAllLatest] = useState(false)
  // The enumerator whose responses are shown ('' = no name), or null for all.
  const [chosenEnumerator, setChosenEnumerator] = useState<string | null>(null)

  // Everything, or nothing: a download taken while pages were still coming in
  // would quietly miss the responses not loaded yet.
  if (responses === undefined || !complete) {
    return (
      <p className="text-muted-foreground" aria-busy="true">
        Loading responses…{responses && responses.length > 0 ? ` ${responses.length} so far` : ''}
      </p>
    )
  }

  const byEnumerator = countByEnumerator(responses)
  // A name whose last response has gone falls back to everyone.
  const enumerator =
    chosenEnumerator !== null && byEnumerator.some(([name]) => name === chosenEnumerator)
      ? chosenEnumerator
      : null
  const shown = filterByEnumerator(responses, enumerator)
  const enumeratorLabel = enumerator === null ? null : enumerator || UNNAMED

  const rows = responsesToRows(questionnaire, shown, lang)
  const newestFirst = [...shown].sort(
    (a, b) => b.submittedAt - a.submittedAt || b.serial - a.serial,
  )
  const previewRows = responsesToRows(questionnaire, newestFirst, lang)
  const latest = showAllLatest ? newestFirst : newestFirst.slice(0, LATEST_COUNT)
  const columns = exportColumns(
    questionnaire,
    enumerator === null ? rows : responsesToRows(questionnaire, responses, lang),
  )
  const hasChoiceBlock = questionnaire.questions.some((q) => q.type === 'choice_experiment')
  // Only worth a column in the latest-submissions table when it was collected.
  const showsRespondent = activeRespondentFields(questionnaire).some(
    (field) => field.key === 'name',
  )

  function showEnumerator(name: string | null) {
    // Clicking the chosen name again goes back to everyone.
    setChosenEnumerator((current) => (current === name ? null : name))
    setPreviewLimit(PREVIEW_ROWS)
    setShowAllLatest(false)
  }

  async function downloadXlsx() {
    setBuilding(true)
    setExportError(null)
    try {
      const buffer = await buildResponsesWorkbook(questionnaire, columns, rows, lang)
      downloadBlob(
        exportFileName(questionnaire, 'xlsx', enumerator),
        new Blob([buffer], { type: XLSX_MIME }),
      )
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : 'The Excel file could not be created.',
      )
    } finally {
      setBuilding(false)
    }
  }

  function downloadCsv() {
    downloadText(
      exportFileName(questionnaire, 'csv', enumerator),
      toCsv(columns, rows),
      'text/csv;charset=utf-8',
    )
  }

  function downloadJson() {
    const payload = {
      questionnaire: {
        id: questionnaire.id,
        title: questionnaire.title,
        questions: questionnaire.questions,
      },
      // Present only in a one-person download, so the file says what it holds.
      ...(enumeratorLabel === null ? {} : { filter: { enumerator: enumeratorLabel } }),
      responses: shown,
      rows,
    }
    downloadText(
      exportFileName(questionnaire, 'json', enumerator),
      JSON.stringify(payload, null, 2),
      'application/json',
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {enumerator === null
            ? `${responses.length} ${responses.length === 1 ? 'response' : 'responses'}`
            : `${shown.length} of ${responses.length} responses`}
        </CardTitle>
        <CardDescription>
          {hasChoiceBlock
            ? 'One row per scenario shown, with the set number, every attribute level, and the chosen alternative. The respondent’s other answers repeat on each row. The Excel file adds the design cards and question list as extra sheets.'
            : 'One row per response. The Excel file also lists the questions; the CSV keeps Bangla text intact.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {byEnumerator.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Responses by enumerator
              <span className="font-normal"> · click a name to see and download only theirs</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <EnumeratorChip
                name="Everyone"
                count={responses.length}
                active={enumerator === null}
                onClick={() => showEnumerator(null)}
              />
              {byEnumerator.map(([name, count]) => (
                <EnumeratorChip
                  key={name}
                  name={name || UNNAMED}
                  count={count}
                  active={enumerator === name}
                  onClick={() => showEnumerator(name)}
                />
              ))}
            </div>
            {enumeratorLabel !== null && (
              <p role="status" className="text-xs text-muted-foreground">
                Showing only <span className="font-medium text-foreground">{enumeratorLabel}</span>:{' '}
                {shown.length} of {responses.length} responses. The tables and the three downloads
                below hold just these.{' '}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => showEnumerator(null)}
                >
                  Show everyone
                </button>
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" disabled={rows.length === 0 || building} onClick={downloadXlsx}>
            <FileSpreadsheet data-icon="inline-start" />
            {building ? 'Preparing…' : 'Download Excel'}
          </Button>
          <Button type="button" variant="outline" disabled={rows.length === 0} onClick={downloadCsv}>
            <Download data-icon="inline-start" />
            Download CSV
          </Button>
          <Button type="button" variant="outline" disabled={rows.length === 0} onClick={downloadJson}>
            <FileJson data-icon="inline-start" />
            Download JSON
          </Button>
          {questionnaire.languages.length > 1 && (
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="export-lang" className="text-xs text-muted-foreground">
                Headings and options in
              </Label>
              <Select
                value={lang}
                onValueChange={(value) => value && setLang(value)}
                items={LANGUAGE_LABELS}
              >
                <SelectTrigger id="export-lang" className="w-32" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {questionnaire.languages.map((option) => (
                    <SelectItem key={option} value={option} lang={option}>
                      {LANGUAGE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {exportError && <p className="text-xs text-destructive">{exportError}</p>}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">No responses yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Open the survey for respondents on a tablet. Submitted answers appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Latest submissions{enumeratorLabel !== null && ` by ${enumeratorLabel}`}
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8">Survey no.</TableHead>
                      <TableHead className="h-8">Enumerator</TableHead>
                      {showsRespondent && <TableHead className="h-8">Respondent</TableHead>}
                      <TableHead className="h-8">Submitted</TableHead>
                      <TableHead className="h-8">Language</TableHead>
                      <TableHead className="h-8 text-right">Answered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latest.map((response) => (
                      <TableRow key={response.id} className="hover:bg-transparent">
                        <TableCell className="py-1 font-mono font-semibold">
                          {response.surveyNumber || `#${response.serial}`}
                        </TableCell>
                        <TableCell className="py-1">
                          {response.enumerator.trim() || UNNAMED}
                          {response.surveyorCode && (
                            <span className="ml-1.5 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                              {response.surveyorCode}
                            </span>
                          )}
                        </TableCell>
                        {showsRespondent && (
                          <TableCell className="py-1">
                            {response.respondent?.name?.trim() || '—'}
                          </TableCell>
                        )}
                        <TableCell className="py-1 text-muted-foreground">
                          {new Date(response.submittedAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="py-1">{LANGUAGE_LABELS[response.language]}</TableCell>
                        <TableCell className="py-1 text-right tabular-nums">
                          {Object.keys(response.answers).length} / {questionnaire.questions.length}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {newestFirst.length > LATEST_COUNT && (
                  <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => setShowAllLatest((open) => !open)}
                    >
                      {showAllLatest ? `Show the latest ${LATEST_COUNT} only` : `Show all ${newestFirst.length} submissions`}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Export preview, newest response first
              </p>
              <div className="max-h-[32rem] overflow-auto rounded-lg border border-border">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow className="hover:bg-transparent">
                      {columns.map((column) => (
                        <TableHead key={column} className="h-8">
                          {column}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.slice(0, previewLimit).map((row, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        {columns.map((column) => (
                          <TableCell key={column} className="max-w-64 truncate py-1" title={String(row[column] ?? '')}>
                            {String(row[column] ?? '').replace(/\n/g, ' | ')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {previewRows.length > previewLimit && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    <span>
                      Showing the newest {previewLimit} of {previewRows.length} rows. The download has
                      all of them, in survey-number order.
                    </span>
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => setPreviewLimit((limit) => limit + PREVIEW_ROWS)}
                    >
                      Show {PREVIEW_ROWS} more
                    </button>
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => setPreviewLimit(previewRows.length)}
                    >
                      Show all
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

interface EnumeratorChipProps {
  name: string
  count: number
  active: boolean
  onClick: () => void
}

/** A name under "Responses by enumerator": pressing it narrows the panel to that person. */
function EnumeratorChip({ name, count, active, onClick }: EnumeratorChipProps) {
  return (
    <Badge
      variant={active ? 'default' : 'secondary'}
      render={<button type="button" aria-pressed={active} onClick={onClick} />}
      className={cn('h-7 cursor-pointer gap-1.5 px-3 text-xs', !active && 'hover:bg-secondary/70')}
    >
      {name}
      <span className="rounded-full bg-background px-1.5 font-semibold tabular-nums text-foreground">
        {count}
      </span>
    </Badge>
  )
}

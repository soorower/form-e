import { useState } from 'react'
import { Download, FileJson, FileSpreadsheet, Inbox } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import {
  defaultExportLanguage,
  downloadBlob,
  downloadText,
  exportColumns,
  exportFileName,
  responsesToRows,
  toCsv,
} from '#/lib/questionnaire/export'
import { XLSX_MIME, buildResponsesWorkbook } from '#/lib/questionnaire/export-xlsx'
import { LANGUAGE_LABELS } from '#/lib/questionnaire/factory'
import type { Lang, Questionnaire, SurveyResponse } from '#/lib/questionnaire/types'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'
import { stripSystemFieldsAll } from '#/lib/convex/rows'

interface ResponsesPanelProps {
  questionnaire: Questionnaire
}

const PREVIEW_ROWS = 25

/** Response count, downloads, and a preview of the flattened export table. */
export function ResponsesPanel({ questionnaire }: ResponsesPanelProps) {
  const ready = useConvexReady()
  const responses = stripSystemFieldsAll<SurveyResponse>(
    useQuery(
      api.responses.listBySurvey,
      ready ? { questionnaireId: questionnaire.id } : 'skip',
    ) as never,
  )
  const [lang, setLang] = useState<Lang>(() => defaultExportLanguage(questionnaire))
  const [building, setBuilding] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  if (responses === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }

  const rows = responsesToRows(questionnaire, responses, lang)
  const byEnumerator = [...responses.reduce((counts, response) => {
    const name = response.enumerator.trim() || '(no name)'
    return counts.set(name, (counts.get(name) ?? 0) + 1)
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const columns = exportColumns(questionnaire, rows)
  const hasChoiceBlock = questionnaire.questions.some((q) => q.type === 'choice_experiment')

  async function downloadXlsx() {
    setBuilding(true)
    setExportError(null)
    try {
      const buffer = await buildResponsesWorkbook(questionnaire, columns, rows, lang)
      downloadBlob(exportFileName(questionnaire, 'xlsx'), new Blob([buffer], { type: XLSX_MIME }))
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : 'The Excel file could not be created.',
      )
    } finally {
      setBuilding(false)
    }
  }

  function downloadCsv() {
    downloadText(exportFileName(questionnaire, 'csv'), toCsv(columns, rows), 'text/csv;charset=utf-8')
  }

  function downloadJson() {
    const payload = {
      questionnaire: {
        id: questionnaire.id,
        title: questionnaire.title,
        questions: questionnaire.questions,
      },
      responses,
      rows,
    }
    downloadText(
      exportFileName(questionnaire, 'json'),
      JSON.stringify(payload, null, 2),
      'application/json',
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {responses.length} {responses.length === 1 ? 'response' : 'responses'}
        </CardTitle>
        <CardDescription>
          {hasChoiceBlock
            ? 'One row per scenario shown, with the set number, every attribute level, and the chosen alternative. The respondent’s other answers repeat on each row. The Excel file adds the design cards and question list as extra sheets.'
            : 'One row per response. The Excel file also lists the questions; the CSV keeps Bangla text intact.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {byEnumerator.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Responses by enumerator</p>
            <div className="flex flex-wrap gap-2">
              {byEnumerator.map(([name, count]) => (
                <Badge key={name} variant="secondary" className="h-6 gap-1.5 px-2.5 text-xs">
                  {name}
                  <span className="rounded-full bg-background px-1.5 font-semibold tabular-nums">
                    {count}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">No responses yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Open the survey for respondents on a tablet. Submitted answers appear here.
            </p>
          </div>
        ) : (
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
                {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
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
            {rows.length > PREVIEW_ROWS && (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Showing the first {PREVIEW_ROWS} of {rows.length} rows. The download has all of them.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

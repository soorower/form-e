import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { normalizeTableAnswer } from '#/lib/questionnaire/answers'
import { pickText, uid } from '#/lib/questionnaire/factory'
import type {
  AnswerValue,
  CellValue,
  Lang,
  TableAnswerRow,
  TableColumn,
  TableQuestion,
} from '#/lib/questionnaire/types'

interface TableFieldProps {
  question: TableQuestion
  lang: Lang
  value: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
}

export function TableField({ question, lang, value, onChange }: TableFieldProps) {
  const answer = normalizeTableAnswer(question, value)
  const fixedLabels = new Map(question.rows.map((row) => [row.id, pickText(row.label, lang)]))
  const bn = lang === 'bn'

  const setRows = (rows: TableAnswerRow[]) => onChange({ rows })
  const setCell = (rowId: string, columnId: string, cell: CellValue) =>
    setRows(
      answer.rows.map((row) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: cell } } : row,
      ),
    )

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-36 whitespace-normal">
                <span className="sr-only">{bn ? 'সারি' : 'Row'}</span>
              </TableHead>
              {question.columns.map((column) => (
                <TableHead key={column.id} className="min-w-40 whitespace-normal">
                  {pickText(column.label, lang) || '—'}
                </TableHead>
              ))}
              {question.allowAddRows && (
                <TableHead className="w-12">
                  <span className="sr-only">{bn ? 'সারি মুছুন' : 'Remove row'}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {answer.rows.map((row, index) => {
              const fixed = fixedLabels.has(row.id)
              const rowLabel = fixedLabels.get(row.id) || `${bn ? 'সারি' : 'Row'} ${index + 1}`
              return (
                <TableRow key={row.id} className="hover:bg-transparent">
                  <TableCell className="whitespace-normal font-medium">{rowLabel}</TableCell>
                  {question.columns.map((column) => (
                    <TableCell key={column.id}>
                      <CellControl
                        column={column}
                        lang={lang}
                        value={row.cells[column.id]}
                        onChange={(cell) => setCell(row.id, column.id, cell)}
                      />
                    </TableCell>
                  ))}
                  {question.allowAddRows && (
                    <TableCell>
                      {!fixed && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={bn ? 'সারি মুছুন' : 'Remove row'}
                          onClick={() => setRows(answer.rows.filter((r) => r.id !== row.id))}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {question.allowAddRows && (
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => setRows([...answer.rows, { id: uid(), cells: {} }])}
        >
          <Plus data-icon="inline-start" />
          {bn ? 'সারি যোগ করুন' : 'Add row'}
        </Button>
      )}
    </div>
  )
}

interface CellControlProps {
  column: TableColumn
  lang: Lang
  value: CellValue | undefined
  onChange: (value: CellValue) => void
}

function CellControl({ column, lang, value, onChange }: CellControlProps) {
  const label = pickText(column.label, lang)
  const textValue = typeof value === 'string' ? value : ''

  switch (column.input) {
    case 'text':
      return (
        <Input
          aria-label={label}
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 min-w-36 text-base md:text-base"
        />
      )
    case 'number':
      return (
        <Input
          type="number"
          inputMode="decimal"
          aria-label={label}
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 min-w-28 text-base md:text-base"
        />
      )
    case 'checkbox':
      return (
        <div className="flex justify-center">
          <Checkbox
            aria-label={label}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
            className="size-6"
          />
        </div>
      )
    case 'dropdown': {
      const items = Object.fromEntries(
        column.options.map((option) => [option.id, pickText(option.label, lang) || '—']),
      )
      return (
        <Select
          value={textValue || null}
          onValueChange={(next) => onChange(next ?? '')}
          items={items}
        >
          <SelectTrigger aria-label={label} className="w-full min-w-36 data-[size=default]:h-11">
            <SelectValue placeholder={lang === 'bn' ? 'বেছে নিন' : 'Select'} />
          </SelectTrigger>
          <SelectContent>
            {column.options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {items[option.id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
  }
}

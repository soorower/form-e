import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import { createColumn, createOption } from '#/lib/questionnaire/factory'
import type { Lang, TableColumn, TableInputType, TableQuestion } from '#/lib/questionnaire/types'
import { LocalizedInput } from './LocalizedInput'
import { OptionsEditor } from './OptionsEditor'

const INPUT_TYPE_LABELS: Record<TableInputType, string> = {
  text: 'Text',
  number: 'Number',
  checkbox: 'Checkbox',
  dropdown: 'Dropdown',
}
const INPUT_TYPES = Object.keys(INPUT_TYPE_LABELS) as TableInputType[]

interface TableEditorProps {
  question: TableQuestion
  languages: Lang[]
  onChange: (patch: Partial<TableQuestion>) => void
}

export function TableEditor({ question, languages, onChange }: TableEditorProps) {
  function updateColumn(id: string, patch: Partial<TableColumn>) {
    onChange({
      columns: question.columns.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    })
  }

  function setColumnInput(column: TableColumn, input: TableInputType) {
    const options =
      input === 'dropdown' && column.options.length === 0
        ? [createOption('Choice 1'), createOption('Choice 2')]
        : column.options
    updateColumn(column.id, { input, options })
  }

  return (
    <div className="space-y-6">
      <OptionsEditor
        label="Rows"
        addLabel="Add row"
        options={question.rows}
        onChange={(rows) => onChange({ rows })}
        languages={languages}
      />

      <Label className="cursor-pointer gap-3 font-normal">
        <Switch
          checked={question.allowAddRows}
          onCheckedChange={(allowAddRows) => onChange({ allowAddRows })}
        />
        Let respondents add their own rows
      </Label>

      <div className="space-y-2">
        <Label>Columns</Label>
        <div className="space-y-3">
          {question.columns.map((column, index) => (
            <div key={column.id} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start gap-2">
                <LocalizedInput
                  className="min-w-0 flex-1 basis-64"
                  value={column.label}
                  onChange={(label) => updateColumn(column.id, { label })}
                  languages={languages}
                  placeholder={`Column ${index + 1}`}
                />
                <Select
                  value={column.input}
                  onValueChange={(value) => value && setColumnInput(column, value)}
                  items={INPUT_TYPE_LABELS}
                >
                  <SelectTrigger className="w-32" aria-label="Column input type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INPUT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {INPUT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove column ${index + 1}`}
                  disabled={question.columns.length <= 1}
                  onClick={() =>
                    onChange({ columns: question.columns.filter((c) => c.id !== column.id) })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              {column.input === 'dropdown' && (
                <OptionsEditor
                  label="Choices"
                  addLabel="Add choice"
                  options={column.options}
                  onChange={(options) => updateColumn(column.id, { options })}
                  languages={languages}
                />
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ columns: [...question.columns, createColumn()] })}
        >
          <Plus data-icon="inline-start" />
          Add column
        </Button>
      </div>
    </div>
  )
}

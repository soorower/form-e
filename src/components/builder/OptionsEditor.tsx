import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { insertAt, moveItem } from '#/lib/list'
import { createOption } from '#/lib/questionnaire/factory'
import type { Lang, Option } from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'
import { LocalizedInput } from './LocalizedInput'
import { DragHandle, SortableItem, SortableList } from './SortableList'

interface OptionsEditorProps {
  options: Option[]
  onChange: (options: Option[]) => void
  languages: Lang[]
  label?: string
  addLabel?: string
}

/**
 * Editable list of bilingual labels. Also used for table rows and dropdown
 * choices. Rows can be dragged by their grip, and a new row can be slotted
 * in right after any existing one.
 */
export function OptionsEditor({
  options,
  onChange,
  languages,
  label = 'Options',
  addLabel = 'Add option',
}: OptionsEditorProps) {
  const singular = label.replace(/s$/, '')
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <SortableList
        ids={options.map((option) => option.id)}
        onMove={(from, to) => onChange(moveItem(options, from, to))}
        className="space-y-2"
      >
        {options.map((option, index) => (
          <SortableItem key={option.id} id={option.id}>
            {(handle, dragging) => (
              <div
                className={cn(
                  'flex items-start gap-1 rounded-lg',
                  dragging && 'bg-card shadow-lg ring-2 ring-primary/40',
                )}
              >
                <DragHandle handle={handle} label={`Drag ${singular.toLowerCase()} ${index + 1}`} />
                <span className="w-6 shrink-0 pt-2 text-right text-xs tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
                <LocalizedInput
                  className="min-w-0 flex-1"
                  value={option.label}
                  onChange={(next) =>
                    onChange(options.map((o) => (o.id === option.id ? { ...o, label: next } : o)))
                  }
                  languages={languages}
                  placeholder={`${singular} ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Insert ${singular.toLowerCase()} after ${index + 1}`}
                  title={`Insert ${singular.toLowerCase()} below`}
                  onClick={() => onChange(insertAt(options, index + 1, createOption()))}
                >
                  <Plus />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${singular.toLowerCase()} ${index + 1}`}
                  disabled={options.length <= 1}
                  onClick={() => onChange(options.filter((o) => o.id !== option.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </SortableItem>
        ))}
      </SortableList>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...options, createOption()])}
      >
        <Plus data-icon="inline-start" />
        {addLabel}
      </Button>
    </div>
  )
}

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { createOption } from '#/lib/questionnaire/factory'
import type { Lang, Option } from '#/lib/questionnaire/types'
import { LocalizedInput } from './LocalizedInput'

interface OptionsEditorProps {
  options: Option[]
  onChange: (options: Option[]) => void
  languages: Lang[]
  label?: string
  addLabel?: string
}

/** Editable list of bilingual labels. Also used for table rows and dropdown choices. */
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
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={option.id} className="flex items-start gap-2">
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
              aria-label={`Remove ${singular.toLowerCase()} ${index + 1}`}
              disabled={options.length <= 1}
              onClick={() => onChange(options.filter((o) => o.id !== option.id))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
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

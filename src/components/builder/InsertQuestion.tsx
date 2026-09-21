import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import type { QuestionType } from '#/lib/questionnaire/types'
import { QuestionTypeButtons } from './QuestionPalette'

interface InsertQuestionProps {
  /** Accessible name, e.g. "Insert a question after question 4". */
  label: string
  onInsert: (type: QuestionType) => void
}

/**
 * The slot between two question cards. A small button on a rule expands into
 * a type picker, so a question can go exactly where it belongs without
 * deleting the ones after it.
 */
export function InsertQuestion({ label, onInsert }: InsertQuestionProps) {
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <div className="rounded-xl border border-primary/40 bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{label}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel inserting a question"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
        <QuestionTypeButtons
          compact
          onPick={(type) => {
            onInsert(type)
            setOpen(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="group relative flex items-center justify-center py-1">
      <div
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px bg-border opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      />
      <Button
        type="button"
        variant="outline"
        size="xs"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="relative rounded-full text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
      >
        <Plus data-icon="inline-start" />
        Insert question
      </Button>
    </div>
  )
}

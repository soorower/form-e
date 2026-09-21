import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { QUESTION_TYPES } from '#/lib/questionnaire/factory'
import type { QuestionType } from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'
import { QUESTION_ICONS } from './question-icons'

interface QuestionTypeButtonsProps {
  onPick: (type: QuestionType) => void
  /** Icon and name only, in a tight grid, for the insert panel between questions. */
  compact?: boolean
  className?: string
}

/** One button per question type. */
export function QuestionTypeButtons({ onPick, compact = false, className }: QuestionTypeButtonsProps) {
  return (
    <div
      className={cn(
        'grid gap-1',
        compact ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-1',
        className,
      )}
    >
      {QUESTION_TYPES.map(({ type, label, description }) => {
        const Icon = QUESTION_ICONS[type]
        return (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            title={compact ? description : undefined}
            className={cn(
              'flex items-start gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              compact && 'items-center gap-2 py-1.5',
            )}
          >
            <span
              className={cn(
                'flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary',
                compact ? 'size-7' : 'mt-0.5 size-8',
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              {!compact && <span className="block text-xs text-muted-foreground">{description}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface QuestionPaletteProps {
  onAdd: (type: QuestionType) => void
}

export function QuestionPalette({ onAdd }: QuestionPaletteProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Add a question</CardTitle>
        <CardDescription>
          Choose a type to add it at the end. To put one between two questions, use the “Insert
          question” button between them, and drag the grip on a question to move it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QuestionTypeButtons onPick={onAdd} />
      </CardContent>
    </Card>
  )
}

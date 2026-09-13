import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { QUESTION_TYPES } from '#/lib/questionnaire/factory'
import type { QuestionType } from '#/lib/questionnaire/types'
import { QUESTION_ICONS } from './question-icons'

interface QuestionPaletteProps {
  onAdd: (type: QuestionType) => void
}

export function QuestionPalette({ onAdd }: QuestionPaletteProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Add a question</CardTitle>
        <CardDescription>Choose a type to append it to the form.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
        {QUESTION_TYPES.map(({ type, label, description }) => {
          const Icon = QUESTION_ICONS[type]
          return (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              className="flex items-start gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{description}</span>
              </span>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}

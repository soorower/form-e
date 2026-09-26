import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'
import { questionTypeLabel } from '#/lib/questionnaire/factory'
import { FORM_TEXT_DEFAULTS } from '#/lib/questionnaire/text-style'
import type { Lang, Question } from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'
import { ChoiceExperimentEditor } from './ChoiceExperimentEditor'
import { LocalizedInput } from './LocalizedInput'
import { OptionsEditor } from './OptionsEditor'
import { QUESTION_ICONS } from './question-icons'
import { DragHandle, type DragHandleProps } from './SortableList'
import { TableEditor } from './TableEditor'

interface QuestionCardProps {
  question: Question
  index: number
  total: number
  languages: Lang[]
  /** From the surrounding SortableItem; the card shows a grip when given one. */
  handle?: DragHandleProps
  dragging?: boolean
  onChange: (question: Question) => void
  onMove: (direction: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}

export function QuestionCard({
  question,
  index,
  total,
  languages,
  handle,
  dragging = false,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: QuestionCardProps) {
  const Icon = QUESTION_ICONS[question.type]
  const isBlock = question.type === 'choice_experiment'

  return (
    <Card className={cn(dragging && 'shadow-xl ring-2 ring-primary/40')}>
      <CardHeader>
        <div className="flex items-center gap-3">
          {handle && <DragHandle handle={handle} label={`Drag question ${index + 1}`} className="-ml-2" />}
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div>
            <CardTitle>Question {index + 1}</CardTitle>
            <CardDescription>{questionTypeLabel(question.type)}</CardDescription>
          </div>
        </div>
        <CardAction className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Move down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Duplicate question"
            onClick={onDuplicate}
          >
            <Copy />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete question"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>{isBlock ? 'Section title' : 'Question'}</Label>
          <LocalizedInput
            value={question.label}
            onChange={(label) => onChange({ ...question, label })}
            languages={languages}
            placeholder={isBlock ? 'Heading shown above the scenarios' : 'Question text'}
            formatting={isBlock ? FORM_TEXT_DEFAULTS.sectionTitle : FORM_TEXT_DEFAULTS.questionLabel}
          />
        </div>

        <div className="space-y-2">
          <Label>
            {isBlock ? 'Introduction' : 'Help text'}{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <LocalizedInput
            multiline={isBlock}
            value={question.help}
            onChange={(help) => onChange({ ...question, help })}
            languages={languages}
            placeholder={
              isBlock
                ? 'Explain the scenarios, for example what "reliability" means here'
                : 'Guidance shown under the question'
            }
            formatting={isBlock ? FORM_TEXT_DEFAULTS.sectionIntro : FORM_TEXT_DEFAULTS.help}
          />
        </div>

        <TypeEditor question={question} languages={languages} onChange={onChange} />

        <Label className="cursor-pointer gap-3 border-t border-border pt-4 font-normal">
          <Switch
            checked={question.required}
            onCheckedChange={(required) => onChange({ ...question, required })}
          />
          Required
        </Label>
      </CardContent>
    </Card>
  )
}

interface TypeEditorProps {
  question: Question
  languages: Lang[]
  onChange: (question: Question) => void
}

function TypeEditor({ question, languages, onChange }: TypeEditorProps) {
  switch (question.type) {
    case 'short_text':
    case 'long_text':
      return (
        <div className="space-y-2">
          <Label>
            Placeholder <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <LocalizedInput
            value={question.placeholder}
            onChange={(placeholder) => onChange({ ...question, placeholder })}
            languages={languages}
            placeholder="Shown inside the empty field"
          />
        </div>
      )
    case 'number':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`min-${question.id}`}>Minimum</Label>
            <Input
              id={`min-${question.id}`}
              type="number"
              value={question.min ?? ''}
              onChange={(event) =>
                onChange({
                  ...question,
                  min: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`max-${question.id}`}>Maximum</Label>
            <Input
              id={`max-${question.id}`}
              type="number"
              value={question.max ?? ''}
              onChange={(event) =>
                onChange({
                  ...question,
                  max: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>
              Unit <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <LocalizedInput
              value={question.unit}
              onChange={(unit) => onChange({ ...question, unit })}
              languages={languages}
              placeholder="km, minutes, BDT"
            />
          </div>
        </div>
      )
    case 'single_choice':
    case 'multi_choice':
    case 'dropdown':
      return (
        <OptionsEditor
          options={question.options}
          onChange={(options) => onChange({ ...question, options })}
          languages={languages}
        />
      )
    case 'ranking':
      return (
        <div className="space-y-4">
          <OptionsEditor
            options={question.options}
            onChange={(options) => onChange({ ...question, options })}
            languages={languages}
          />
          <div className="space-y-2">
            <Label htmlFor={`ranks-${question.id}`}>How many priorities to ask for</Label>
            <Input
              id={`ranks-${question.id}`}
              type="number"
              min={0}
              max={question.options.length}
              value={question.maxRanks || ''}
              placeholder={`All ${question.options.length}`}
              onChange={(event) =>
                onChange({
                  ...question,
                  maxRanks: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                })
              }
              className="max-w-40"
            />
            <p className="text-sm text-muted-foreground">
              Leave blank to rank every option. The order the respondent taps is saved: the
              first tap is priority 1, and the export gives each priority its own column.
            </p>
          </div>
        </div>
      )
    case 'table':
      return (
        <TableEditor
          question={question}
          languages={languages}
          onChange={(patch) => onChange({ ...question, ...patch })}
        />
      )
    case 'choice_experiment':
      return (
        <ChoiceExperimentEditor
          question={question}
          languages={languages}
          onChange={(patch) => onChange({ ...question, ...patch })}
        />
      )
    case 'date':
    case 'time':
      return null
  }
}

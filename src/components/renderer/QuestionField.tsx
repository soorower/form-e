import { asciiDigits } from '#/lib/questionnaire/answers'
import type { ReactNode } from 'react'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { formatNumber, pickText } from '#/lib/questionnaire/factory'
import { FORM_TEXT_DEFAULTS, localizedStyleClass } from '#/lib/questionnaire/text-style'
import type { AnswerValue, ChoiceQuestion, Lang, Question } from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'
import type { CardExposure } from '#/lib/questionnaire/cards'
import { ChoiceExperimentField } from './ChoiceExperimentField'
import { TableField } from './TableField'

/**
 * Either the next answer or a function of the current one. The function form
 * lets a field that holds several sub-answers (a choice block's scenarios)
 * update safely even when taps arrive faster than renders.
 */
export type AnswerUpdate = AnswerValue | ((current: AnswerValue | undefined) => AnswerValue)

interface QuestionFieldProps {
  question: Question
  number: number
  lang: Lang
  value: AnswerValue | undefined
  onChange: (value: AnswerUpdate) => void
  invalid: boolean
  /** Card exposure counts for a choice experiment; see ChoiceExperimentField. */
  exposure?: CardExposure
  /** Cards the server handed this interview for a balanced choice experiment. */
  assignedSets?: number[]
  /** The scenario-plan row the server gave this interview, for a planned block. */
  assignedPlanRow?: number
  /** How often each scenario-plan row has been used, for the planned fallback. */
  planExposure?: CardExposure
}

export function questionDomId(id: string) {
  return `question-${id}`
}

const GROUP_TYPES = new Set<Question['type']>(['single_choice', 'multi_choice', 'table'])

export function QuestionField({
  question,
  number,
  lang,
  value,
  onChange,
  invalid,
  exposure,
  assignedSets,
  assignedPlanRow,
  planExposure,
}: QuestionFieldProps) {
  if (question.type === 'choice_experiment') {
    return (
      <ChoiceExperimentField
        question={question}
        number={number}
        lang={lang}
        value={value}
        onChange={onChange}
        invalid={invalid}
        domId={questionDomId(question.id)}
        exposure={exposure}
        assignedSets={assignedSets}
        assignedPlanRow={assignedPlanRow}
        planExposure={planExposure}
      />
    )
  }

  const label =
    pickText(question.label, lang) || (lang === 'bn' ? `প্রশ্ন ${number}` : `Question ${number}`)
  const help = pickText(question.help, lang)
  const inputId = `field-${question.id}`
  const labelId = `label-${question.id}`
  const single = !GROUP_TYPES.has(question.type)

  return (
    <section
      id={questionDomId(question.id)}
      lang={lang}
      aria-labelledby={labelId}
      className={cn(
        'space-y-4 rounded-2xl border bg-card p-5 text-card-foreground sm:p-6',
        invalid ? 'border-destructive' : 'border-border',
      )}
    >
      <div className="space-y-1">
        <Label
          id={labelId}
          htmlFor={single ? inputId : undefined}
          className={cn(
            'items-start text-base leading-snug',
            localizedStyleClass(question.label, FORM_TEXT_DEFAULTS.questionLabel),
          )}
        >
          <span className="font-normal not-italic no-underline tabular-nums text-muted-foreground">
            {formatNumber(number, lang)}.
          </span>
          <span className="flex-1">
            {label}
            {question.required && (
              <span className="ml-1 text-destructive" aria-hidden>
                *
              </span>
            )}
          </span>
        </Label>
        {help && (
          <p
            className={cn(
              'whitespace-pre-line text-sm text-muted-foreground',
              localizedStyleClass(question.help, FORM_TEXT_DEFAULTS.help),
            )}
          >
            {help}
          </p>
        )}
      </div>

      <Control
        question={question}
        lang={lang}
        value={value}
        onChange={onChange}
        inputId={inputId}
        labelId={labelId}
      />

      {invalid && (
        <p className="text-sm font-medium text-destructive">
          {lang === 'bn' ? 'এই প্রশ্নের উত্তর দেওয়া আবশ্যক।' : 'This question is required.'}
        </p>
      )}
    </section>
  )
}

interface ControlProps {
  question: Question
  lang: Lang
  value: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
  inputId: string
  labelId: string
}

const asString = (value: AnswerValue | undefined) => (typeof value === 'string' ? value : '')
const asList = (value: AnswerValue | undefined) => (Array.isArray(value) ? value : [])

function Control({ question, lang, value, onChange, inputId, labelId }: ControlProps) {
  switch (question.type) {
    case 'short_text':
      return (
        <Input
          id={inputId}
          value={asString(value)}
          placeholder={pickText(question.placeholder, lang)}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 text-base md:text-base"
        />
      )
    case 'long_text':
      return (
        <Textarea
          id={inputId}
          value={asString(value)}
          placeholder={pickText(question.placeholder, lang)}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-28 text-base md:text-base"
        />
      )
    case 'number': {
      const unit = pickText(question.unit, lang)
      return (
        <div className="flex items-center gap-3">
          {/* A text field: a native number input silently dropped the digits
              a Bangla keyboard types, leaving the answer blank while the typed
              text stayed on screen. isAnswered checks that it is a number. */}
          <Input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={asString(value)}
            onChange={(event) => onChange(asciiDigits(event.target.value))}
            className="h-12 max-w-xs text-base md:text-base"
          />
          {unit && <span className="text-muted-foreground">{unit}</span>}
        </div>
      )
    }
    case 'date':
    case 'time':
      return (
        <Input
          id={inputId}
          type={question.type}
          value={asString(value)}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-fit text-base md:text-base"
        />
      )
    case 'single_choice':
      return (
        <RadioGroup
          aria-labelledby={labelId}
          value={asString(value)}
          onValueChange={(next) => onChange(String(next))}
          className="gap-2"
        >
          {question.options.map((option) => (
            <ChoiceRow key={option.id} text={pickText(option.label, lang)}>
              <RadioGroupItem value={option.id} />
            </ChoiceRow>
          ))}
        </RadioGroup>
      )
    case 'multi_choice': {
      const selected = asList(value)
      return (
        <div role="group" aria-labelledby={labelId} className="grid gap-2">
          {question.options.map((option) => (
            <ChoiceRow key={option.id} text={pickText(option.label, lang)}>
              <Checkbox
                checked={selected.includes(option.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id),
                  )
                }
              />
            </ChoiceRow>
          ))}
        </div>
      )
    }
    case 'dropdown':
      return (
        <DropdownControl
          question={question}
          lang={lang}
          value={asString(value)}
          onChange={onChange}
          inputId={inputId}
        />
      )
    case 'table':
      return <TableField question={question} lang={lang} value={value} onChange={onChange} />
    case 'choice_experiment':
      return null
  }
}

function ChoiceRow({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-4 text-base font-normal transition-colors has-data-checked:border-primary has-data-checked:bg-primary/5">
      {children}
      <span>{text || '—'}</span>
    </Label>
  )
}

interface DropdownControlProps {
  question: ChoiceQuestion
  lang: Lang
  value: string
  onChange: (value: AnswerValue) => void
  inputId: string
}

function DropdownControl({ question, lang, value, onChange, inputId }: DropdownControlProps) {
  const items = Object.fromEntries(
    question.options.map((option) => [option.id, pickText(option.label, lang) || '—']),
  )
  return (
    <Select value={value || null} onValueChange={(next) => onChange(next ?? '')} items={items}>
      <SelectTrigger id={inputId} className="w-full max-w-md text-base data-[size=default]:h-12">
        <SelectValue placeholder={lang === 'bn' ? 'একটি বেছে নিন' : 'Select an option'} />
      </SelectTrigger>
      <SelectContent>
        {question.options.map((option) => (
          <SelectItem key={option.id} value={option.id} className="py-2.5 text-base">
            {items[option.id]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

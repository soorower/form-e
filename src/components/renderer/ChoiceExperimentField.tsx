import { useEffect } from 'react'
import { isChoiceExperimentAnswer } from '#/lib/questionnaire/answers'
import {
  columnKey,
  drawScenarios,
  levelLabel,
  type CardExposure,
} from '#/lib/questionnaire/cards'
import { formatNumber, pickText } from '#/lib/questionnaire/factory'
import { FORM_TEXT_DEFAULTS, localizedStyleClass } from '#/lib/questionnaire/text-style'
import type {
  AnswerValue,
  ChoiceExperimentQuestion,
  ChoiceScenarioAnswer,
  Lang,
} from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'
import type { AnswerUpdate } from './QuestionField'

interface ChoiceExperimentFieldProps {
  question: ChoiceExperimentQuestion
  /** Number of the first scenario's choice question; later scenarios count up from it. */
  number: number
  lang: Lang
  value: AnswerValue | undefined
  onChange: (value: AnswerUpdate) => void
  invalid: boolean
  domId: string
  /**
   * How often each card has been shown so far, for balanced drawing. Leave
   * undefined while it is still loading: a balanced block waits for it rather
   * than drawing blind.
   */
  exposure?: CardExposure
}

/**
 * The stated-preference block: a heading band, the introduction, then one
 * table per drawn card. In the alternatives layout the table has one column
 * per alternative and the choice row sits inside it; in the profile layout
 * the card is one column beside fixed comparison columns and the prompt is
 * answered below the table. Cards are drawn once, when the block first
 * renders without an answer, so the set numbers stay fixed for the response.
 */
export function ChoiceExperimentField({
  question,
  number,
  lang,
  value,
  onChange,
  invalid,
  domId,
  exposure,
}: ChoiceExperimentFieldProps) {
  const answer = isChoiceExperimentAnswer(value) ? value : null
  const hasCards = question.cards.length > 0
  const canDraw = question.drawMode !== 'balanced' || exposure !== undefined

  useEffect(() => {
    if (!answer && hasCards && canDraw) {
      onChange({ scenarios: drawScenarios(question, undefined, exposure) })
    }
  }, [answer, hasCards, canDraw, question, exposure, onChange])

  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const title = pickText(question.label, lang)
  const intro = pickText(question.help, lang)
  const labelId = `label-${question.id}`

  function choose(index: number, alternativeKey: string) {
    onChange((current) => {
      if (!isChoiceExperimentAnswer(current)) return current ?? null
      return {
        scenarios: current.scenarios.map((scenario, i) =>
          i === index ? { ...scenario, choice: alternativeKey } : scenario,
        ),
      }
    })
  }

  return (
    <section
      id={domId}
      lang={lang}
      aria-labelledby={labelId}
      className={cn(
        'space-y-5 rounded-2xl border bg-card p-5 text-card-foreground sm:p-6',
        invalid ? 'border-destructive' : 'border-border',
      )}
    >
      <h2
        id={labelId}
        className={cn(
          'rounded-lg bg-primary/10 px-4 py-2 text-lg text-foreground',
          localizedStyleClass(question.label, FORM_TEXT_DEFAULTS.sectionTitle),
        )}
      >
        {title || t('Choice scenarios', 'পছন্দের দৃশ্যপট')}
      </h2>

      {intro && (
        <p
          className={cn(
            'whitespace-pre-line leading-relaxed',
            localizedStyleClass(question.help, FORM_TEXT_DEFAULTS.sectionIntro),
          )}
        >
          {intro}
        </p>
      )}

      {!hasCards && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {t(
            'No design cards have been added to this section yet.',
            'এই অংশে এখনও কোনো কার্ড যোগ করা হয়নি।',
          )}
        </p>
      )}

      {answer?.scenarios.map((scenario, index) => (
        <ScenarioTable
          key={`${scenario.set}-${index}`}
          question={question}
          scenario={scenario}
          index={index}
          number={number + index}
          lang={lang}
          onChoose={(alternativeKey) => choose(index, alternativeKey)}
        />
      ))}

      {invalid && (
        <p className="text-sm font-medium text-destructive">
          {t('Please choose an option in every scenario.', 'অনুগ্রহ করে প্রতিটি দৃশ্যপটে একটি বিকল্প বেছে নিন।')}
        </p>
      )}
    </section>
  )
}

interface ScenarioTableProps {
  question: ChoiceExperimentQuestion
  scenario: ChoiceScenarioAnswer
  index: number
  number: number
  lang: Lang
  onChoose: (alternativeKey: string) => void
}

function ScenarioTable({ question, scenario, index, number, lang, onChoose }: ScenarioTableProps) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const { alternatives, attributes } = question
  const promptId = `prompt-${question.id}-${index}`
  const attributeHeader = pickText(question.attributeHeader, lang) || t('Attributes', 'বৈশিষ্ট্যসমূহ')

  if (question.layout === 'profile') {
    return (
      <ProfileScenario
        question={question}
        scenario={scenario}
        index={index}
        number={number}
        lang={lang}
        onChoose={onChoose}
        promptId={promptId}
        attributeHeader={attributeHeader}
      />
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-center font-bold">
        {t('Scenario', 'দৃশ্যপট')}-{formatNumber(index + 1, lang)}{' '}
        <span className="text-sm font-normal text-muted-foreground">(SID: {scenario.set})</span>
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="bg-muted/70">
              <th scope="col" className="min-w-40 border-b border-border p-3 text-left font-bold">
                {attributeHeader}
              </th>
              {alternatives.map((alternative) => (
                <th
                  key={alternative.key}
                  scope="col"
                  className="min-w-36 border-b border-l border-border p-3 text-center font-bold"
                >
                  {pickText(alternative.label, lang) || alternative.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attributes.map((attribute) => (
              <tr key={attribute.key} className="border-b border-border">
                <th scope="row" className="p-3 text-left font-medium">
                  {pickText(attribute.label, lang) || attribute.key}
                </th>
                {alternatives.map((alternative) => (
                  <td
                    key={alternative.key}
                    className="border-l border-border p-3 text-center whitespace-pre-line"
                  >
                    {levelLabel(
                      question,
                      scenario.levels[columnKey(question, attribute.key, alternative.key)] ?? '',
                      lang,
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-muted/40">
              <th
                scope="row"
                id={promptId}
                className={cn('p-3', localizedStyleClass(question.prompt, FORM_TEXT_DEFAULTS.prompt))}
              >
                {formatNumber(number, lang)}. {pickText(question.prompt, lang)}
              </th>
              {alternatives.map((alternative) => {
                const selected = scenario.choice === alternative.key
                const altLabel = pickText(alternative.label, lang) || alternative.key
                return (
                  <td
                    key={alternative.key}
                    className={cn(
                      'border-l border-border p-1 text-center transition-colors',
                      selected && 'bg-primary/10',
                    )}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-labelledby={promptId}
                      aria-label={altLabel}
                      onClick={() => onChoose(alternative.key)}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          selected ? 'border-primary bg-primary' : 'border-input bg-background',
                        )}
                      >
                        {selected && <span className="size-3 rounded-full bg-primary-foreground" />}
                      </span>
                      <span className={cn('text-sm', selected ? 'font-semibold' : 'text-muted-foreground')}>
                        {altLabel}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface ProfileScenarioProps extends ScenarioTableProps {
  promptId: string
  attributeHeader: string
}

/**
 * Profile layout: one card column ("the proposed option") beside fixed
 * comparison columns whose text spans every attribute row, then the prompt
 * answered with the block's own options, typically Yes / No.
 */
function ProfileScenario({
  question,
  scenario,
  index,
  number,
  lang,
  onChoose,
  promptId,
  attributeHeader,
}: ProfileScenarioProps) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const { attributes, referenceColumns, choiceOptions } = question
  const card = question.alternatives[0]

  return (
    <div className="space-y-3">
      <p className="text-center font-bold">
        {t('Scenario', 'দৃশ্যপট')}-{formatNumber(index + 1, lang)}{' '}
        <span className="text-sm font-normal text-muted-foreground">(SID: {scenario.set})</span>
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="bg-muted/70">
              <th scope="col" className="min-w-40 border-b border-border p-3 text-left font-bold">
                {attributeHeader}
              </th>
              <th
                scope="col"
                className="min-w-44 border-b border-l border-border p-3 text-center font-bold"
              >
                {card ? pickText(card.label, lang) || card.key : ''}
              </th>
              {referenceColumns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="min-w-36 border-b border-l border-border p-3 text-center font-bold"
                >
                  {pickText(column.label, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attributes.map((attribute, rowIndex) => (
              <tr key={attribute.key} className="border-b border-border last:border-b-0">
                <th scope="row" className="p-3 text-left font-medium">
                  {pickText(attribute.label, lang) || attribute.key}
                </th>
                <td className="border-l border-border p-3 text-center whitespace-pre-line">
                  {card
                    ? levelLabel(
                        question,
                        scenario.levels[columnKey(question, attribute.key, card.key)] ?? '',
                        lang,
                      )
                    : ''}
                </td>
                {rowIndex === 0 &&
                  referenceColumns.map((column) => (
                    <td
                      key={column.key}
                      rowSpan={attributes.length}
                      className="border-l border-border p-3 text-center align-middle whitespace-pre-line text-muted-foreground"
                    >
                      {pickText(column.text, lang)}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <p
          id={promptId}
          className={cn('text-base', localizedStyleClass(question.prompt, FORM_TEXT_DEFAULTS.prompt))}
        >
          {formatNumber(number, lang)}. {pickText(question.prompt, lang)}
        </p>
        <div role="radiogroup" aria-labelledby={promptId} className="flex flex-wrap gap-2">
          {choiceOptions.map((option) => {
            const selected = scenario.choice === option.key
            const label = pickText(option.label, lang) || option.key
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChoose(option.key)}
                className={cn(
                  'inline-flex min-h-12 min-w-32 items-center justify-center gap-2 rounded-xl border px-5 text-base outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected
                    ? 'border-primary bg-primary/10 font-semibold'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                    selected ? 'border-primary bg-primary' : 'border-input bg-background',
                  )}
                >
                  {selected && <span className="size-2 rounded-full bg-primary-foreground" />}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

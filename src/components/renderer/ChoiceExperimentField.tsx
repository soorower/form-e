import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Input } from '#/components/ui/input'
import {
  OTHER_ANSWER,
  answerScenario,
  isChoiceExperimentAnswer,
  scenarioChoice,
  setScenarioOther,
} from '#/lib/questionnaire/answers'
import {
  attributeSections,
  columnKey,
  drawScenarios,
  levelLabel,
  scenariosFromSets,
  type CardExposure,
} from '#/lib/questionnaire/cards'
import { formatNumber, pickText } from '#/lib/questionnaire/factory'
import { levelPicture, pictureUrls } from '#/lib/questionnaire/pictures'
import { followsPlan, leastUsedPlanRow, scenariosFromPlanRow } from '#/lib/questionnaire/scenario-plan'
import { FORM_TEXT_DEFAULTS, localizedStyleClass } from '#/lib/questionnaire/text-style'
import type {
  AnswerValue,
  ChoiceAttribute,
  ChoiceExperimentQuestion,
  ChoicePrompt,
  ChoiceScenarioAnswer,
  Lang,
} from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'
import type { AnswerUpdate } from './QuestionField'

interface ChoiceExperimentFieldProps {
  question: ChoiceExperimentQuestion
  /** Number of the first question under the first scenario; later ones count up from it. */
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
  /**
   * The cards the server handed this interview (set numbers, in order). A
   * balanced block shows these and only draws for itself, from `exposure`,
   * when there are none.
   */
  assignedSets?: number[]
  /**
   * The row of the block's scenario plan the server gave this interview. A
   * planned block shows that row's cards; without it the block takes the
   * least-used row from `planExposure`.
   */
  assignedPlanRow?: number
  /** How often each plan row has been used so far, for the same fallback. */
  planExposure?: CardExposure
}

/**
 * The stated-preference block: a heading band, the introduction, then one
 * table per drawn card followed by the block's prompts. In the alternatives
 * layout the table has one column per alternative; when the only prompt is
 * "pick a column" its choice row sits inside the table, otherwise every
 * prompt is answered below it. In the profile layout the card is one column
 * beside fixed comparison columns. Cards are drawn once, when the block
 * first renders without an answer, so the set numbers stay fixed for the
 * response.
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
  assignedSets,
  assignedPlanRow,
  planExposure,
}: ChoiceExperimentFieldProps) {
  const answer = isChoiceExperimentAnswer(value) ? value : null
  const hasCards = question.cards.length > 0
  const balanced = question.drawMode === 'balanced'
  const planned = followsPlan(question)
  // Both the balanced and the planned block are told what to show by the
  // server, so neither picks anything until that answer (or the counts it
  // falls back on) has arrived.
  const fromServer = balanced || planned
  const canDraw = !fromServer || assignedSets !== undefined || exposure !== undefined
  // The plan row named no card this block still has: the cards were
  // re-imported after the plan was made. Said out loud rather than quietly
  // drawing random cards with no plan row, which would look planned but not be.
  const [planBroken, setPlanBroken] = useState(false)

  useEffect(() => {
    if (answer || !hasCards || !canDraw) return
    if (planned) {
      // A plan is followed, not drawn from: the row names the cards, in order.
      const row = assignedPlanRow ?? leastUsedPlanRow(question, planExposure)
      const scenarios = scenariosFromPlanRow(question, row)
      // Only fall through to a draw if the row named no card this block still
      // has — the design was re-imported after the plan, say.
      if (scenarios.length > 0) {
        onChange({ planRow: row, scenarios })
        return
      }
      setPlanBroken(true)
      return
    }
    // Cards handed in from outside: the server's for a balanced block, or,
    // for any block, the ones printed on the paper form being typed in.
    const assigned = assignedSets ? scenariosFromSets(question, assignedSets) : []
    onChange({
      scenarios: assigned.length > 0 ? assigned : drawScenarios(question, undefined, exposure),
    })
  }, [
    answer,
    hasCards,
    canDraw,
    balanced,
    planned,
    question,
    exposure,
    assignedSets,
    assignedPlanRow,
    planExposure,
    onChange,
  ])

  // Every picture the block may show is fetched up front, while the tablet
  // is still online, so a later scenario's picture is already there when the
  // interview carries on without a connection.
  const pictures = pictureUrls(question).join('\n')
  useEffect(() => {
    if (!pictures) return
    for (const url of pictures.split('\n')) {
      const image = new Image()
      image.src = url
    }
  }, [pictures])

  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const title = pickText(question.label, lang)
  const intro = pickText(question.help, lang)
  const labelId = `label-${question.id}`
  const perScenario = Math.max(1, question.prompts.length)

  function updateScenario(
    index: number,
    change: (scenario: ChoiceScenarioAnswer) => ChoiceScenarioAnswer,
  ) {
    onChange((current) => {
      if (!isChoiceExperimentAnswer(current)) return current ?? null
      return {
        ...current,
        scenarios: current.scenarios.map((scenario, i) => (i === index ? change(scenario) : scenario)),
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

      {planBroken && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-sm font-medium text-destructive"
        >
          {t(
            'This section’s scenario plan names cards it no longer has, so it cannot be shown. Ask the survey creator to correct the cards or the plan before collecting more responses.',
            'এই অংশের সিনারিও প্ল্যানে এমন কার্ডের নম্বর আছে যা এখন আর নেই, তাই এটি দেখানো যাচ্ছে না। আরও উত্তর সংগ্রহের আগে জরিপ নির্মাতাকে কার্ড বা প্ল্যান ঠিক করতে বলুন।',
          )}
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

      {answer?.planRow !== undefined && (
        <p className="text-sm text-muted-foreground">
          {t('Scenario plan row', 'দৃশ্যপট তালিকার সারি')}:{' '}
          <span className="font-mono font-semibold text-foreground">
            {formatNumber(answer.planRow, lang)}
          </span>
        </p>
      )}

      {answer?.scenarios.map((scenario, index) => (
        <Scenario
          key={`${scenario.set}-${index}`}
          question={question}
          scenario={scenario}
          index={index}
          number={number + index * perScenario}
          lang={lang}
          onAnswer={(prompt, promptIndex, chosen) =>
            updateScenario(index, (current) => answerScenario(current, prompt, promptIndex, chosen))
          }
          onOther={(prompt, typed) =>
            updateScenario(index, (current) => setScenarioOther(current, prompt, typed))
          }
        />
      ))}

      {invalid && (
        <p className="text-sm font-medium text-destructive">
          {t(
            'Please answer every question in every scenario.',
            'অনুগ্রহ করে প্রতিটি দৃশ্যপটের প্রতিটি প্রশ্নের উত্তর দিন।',
          )}
        </p>
      )}
    </section>
  )
}

interface ScenarioProps {
  question: ChoiceExperimentQuestion
  scenario: ChoiceScenarioAnswer
  index: number
  /** Number of the first question under this scenario's table. */
  number: number
  lang: Lang
  onAnswer: (prompt: ChoicePrompt, promptIndex: number, chosen: string) => void
  onOther: (prompt: ChoicePrompt, typed: string) => void
}

function Scenario({ question, scenario, index, number, lang, onAnswer, onOther }: ScenarioProps) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const attributeHeader = pickText(question.attributeHeader, lang) || t('Attributes', 'বৈশিষ্ট্যসমূহ')
  const [first] = question.prompts
  // The classic layout keeps the single "which column?" question inside the table.
  const inline =
    question.layout === 'alternatives' &&
    question.prompts.length === 1 &&
    first !== undefined &&
    first.answer === 'alternative'

  return (
    <div className="space-y-3">
      <p className="text-center font-bold">
        {t('Scenario', 'দৃশ্যপট')}-{formatNumber(index + 1, lang)}{' '}
        <span className="text-sm font-normal text-muted-foreground">(SID: {scenario.set})</span>
      </p>
      {question.layout === 'profile' ? (
        <ProfileTable question={question} scenario={scenario} lang={lang} attributeHeader={attributeHeader} />
      ) : (
        <AlternativesTable
          question={question}
          scenario={scenario}
          lang={lang}
          attributeHeader={attributeHeader}
          inlinePrompt={
            inline
              ? {
                  prompt: first,
                  number,
                  id: `prompt-${question.id}-${index}`,
                  onChoose: (chosen) => onAnswer(first, 0, chosen),
                }
              : undefined
          }
        />
      )}
      {!inline && (
        <div className="space-y-4">
          {question.prompts.map((prompt, promptIndex) => (
            <PromptAnswer
              key={prompt.key}
              id={`prompt-${question.id}-${index}-${promptIndex}`}
              question={question}
              prompt={prompt}
              number={number + promptIndex}
              lang={lang}
              chosen={scenarioChoice(scenario, prompt, promptIndex)}
              other={scenario.other?.[prompt.key] ?? ''}
              onChoose={(chosen) => onAnswer(prompt, promptIndex, chosen)}
              onOther={(typed) => onOther(prompt, typed)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** A section heading row spanning the whole table, e.g. "Home to Sylhet station". */
function SectionRow({ text, span }: { text: string; span: number }) {
  return (
    <tr className="bg-muted/50">
      <th scope="colgroup" colSpan={span} className="border-b border-border px-3 py-2 text-left font-semibold">
        {text}
      </th>
    </tr>
  )
}

function attributeName(attribute: ChoiceAttribute, lang: Lang) {
  return pickText(attribute.label, lang) || attribute.key
}

/**
 * One picture in a scenario table: the picture of the level this card shows
 * for this alternative (a potholed rigid road, a new flexible one). A level
 * with no picture leaves the cell empty.
 */
function PictureCell({
  question,
  attribute,
  alternative,
  level,
  lang,
}: {
  question: ChoiceExperimentQuestion
  attribute: ChoiceAttribute
  alternative: string
  level: string
  lang: Lang
}) {
  const picture = levelPicture(attribute, alternative, level)
  if (!picture) return null
  return (
    <img
      src={picture.url}
      alt={`${attributeName(attribute, lang)}: ${levelLabel(question, level, lang)}`}
      className="mx-auto h-40 w-full max-w-72 rounded-md bg-muted object-contain sm:h-48"
    />
  )
}

/** Heading of an attribute's picture row, e.g. "Road picture". */
function pictureRowName(attribute: ChoiceAttribute, lang: Lang) {
  return (attribute.pictures && pickText(attribute.pictures.label, lang)) || attributeName(attribute, lang)
}

interface AlternativesTableProps {
  question: ChoiceExperimentQuestion
  scenario: ChoiceScenarioAnswer
  lang: Lang
  attributeHeader: string
  /** When set, the prompt's choice row is rendered as the table's last row. */
  inlinePrompt?: {
    prompt: ChoicePrompt
    number: number
    id: string
    onChoose: (chosen: string) => void
  }
}

function AlternativesTable({
  question,
  scenario,
  lang,
  attributeHeader,
  inlinePrompt,
}: AlternativesTableProps) {
  const { alternatives } = question
  const sections = attributeSections(question.attributes)
  const chosen = inlinePrompt ? scenarioChoice(scenario, inlinePrompt.prompt, 0) : ''
  // "Approximate condition" spanning "Rigid | Flexible", as the paper form has it.
  const alternativesHeader = question.alternativesHeader
    ? pickText(question.alternativesHeader, lang)
    : ''

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-base">
        <thead>
          {alternativesHeader && (
            <tr className="bg-muted/70">
              <th
                scope="col"
                rowSpan={2}
                className="min-w-40 border-b border-border p-3 text-left align-middle font-bold"
              >
                {attributeHeader}
              </th>
              <th
                scope="colgroup"
                colSpan={alternatives.length}
                className="border-b border-l border-border p-3 text-center font-bold"
              >
                {alternativesHeader}
              </th>
            </tr>
          )}
          <tr className="bg-muted/70">
            {!alternativesHeader && (
              <th scope="col" className="min-w-40 border-b border-border p-3 text-left font-bold">
                {attributeHeader}
              </th>
            )}
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
          {sections.map((section, sectionIndex) => (
            <SectionRows
              key={sectionIndex}
              heading={section.group ? pickText(section.group, lang) : ''}
              span={alternatives.length + 1}
            >
              {section.attributes.map((attribute) => (
                <Fragment key={attribute.key}>
                  {attribute.pictures && (
                    <tr className="border-b border-border">
                      <th scope="row" className="p-3 text-left font-medium">
                        {pictureRowName(attribute, lang)}
                      </th>
                      {alternatives.map((alternative) => (
                        <td key={alternative.key} className="border-l border-border p-2 text-center">
                          <PictureCell
                            question={question}
                            attribute={attribute}
                            alternative={alternative.key}
                            level={scenario.levels[columnKey(question, attribute.key, alternative.key)] ?? ''}
                            lang={lang}
                          />
                        </td>
                      ))}
                    </tr>
                  )}
                  <tr className="border-b border-border">
                    <th scope="row" className="p-3 text-left font-medium">
                      {attributeName(attribute, lang)}
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
                </Fragment>
              ))}
            </SectionRows>
          ))}
          {inlinePrompt && (
            <tr className="bg-muted/40">
              <th
                scope="row"
                id={inlinePrompt.id}
                className={cn(
                  'p-3',
                  localizedStyleClass(inlinePrompt.prompt.text, FORM_TEXT_DEFAULTS.prompt),
                )}
              >
                {formatNumber(inlinePrompt.number, lang)}. {pickText(inlinePrompt.prompt.text, lang)}
              </th>
              {alternatives.map((alternative) => {
                const selected = chosen === alternative.key
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
                      aria-labelledby={inlinePrompt.id}
                      aria-label={altLabel}
                      onClick={() => inlinePrompt.onChoose(alternative.key)}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <RadioDot selected={selected} size="lg" />
                      <span className={cn('text-sm', selected ? 'font-semibold' : 'text-muted-foreground')}>
                        {altLabel}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** The rows of one attribute section, under its heading row when it has one. */
function SectionRows({
  heading,
  span,
  children,
}: {
  heading: string
  span: number
  children: ReactNode
}) {
  return (
    <>
      {heading && <SectionRow text={heading} span={span} />}
      {children}
    </>
  )
}

interface ProfileTableProps {
  question: ChoiceExperimentQuestion
  scenario: ChoiceScenarioAnswer
  lang: Lang
  attributeHeader: string
}

/**
 * Profile layout: one card column ("the proposed option") beside fixed
 * comparison columns whose text spans every attribute row.
 */
function ProfileTable({ question, scenario, lang, attributeHeader }: ProfileTableProps) {
  const { attributes, referenceColumns } = question
  const card = question.alternatives[0]
  const sections = attributeSections(attributes)
  // The comparison cells start on the first attribute row and span every
  // row below it, section headings included; a heading above the first
  // attribute is the only one that spans the full width instead.
  const headedSections = sections.filter((section) => section.group).length
  const pictureRows = attributes.filter((attribute) => attribute.pictures).length
  const referenceSpan =
    attributes.length + pictureRows + headedSections - (sections[0]?.group ? 1 : 0)
  // The comparison cells go on whichever body row comes first, a picture row included.
  let referencePlaced = false
  const referenceCells = () => {
    if (referencePlaced) return null
    referencePlaced = true
    return referenceColumns.map((column) => (
      <td
        key={column.key}
        rowSpan={referenceSpan}
        className="border-l border-border p-3 text-center align-middle whitespace-pre-line text-muted-foreground"
      >
        {pickText(column.text, lang)}
      </td>
    ))
  }

  return (
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
          {sections.map((section, sectionIndex) => (
            <SectionRows
              key={sectionIndex}
              heading={section.group ? pickText(section.group, lang) : ''}
              span={sectionIndex === 0 ? referenceColumns.length + 2 : 2}
            >
              {section.attributes.map((attribute) => {
                const level = card
                  ? (scenario.levels[columnKey(question, attribute.key, card.key)] ?? '')
                  : ''
                return (
                  <Fragment key={attribute.key}>
                    {attribute.pictures && (
                      <tr className="border-b border-border">
                        <th scope="row" className="p-3 text-left font-medium">
                          {pictureRowName(attribute, lang)}
                        </th>
                        <td className="border-l border-border p-2 text-center">
                          {card && (
                            <PictureCell
                              question={question}
                              attribute={attribute}
                              alternative={card.key}
                              level={level}
                              lang={lang}
                            />
                          )}
                        </td>
                        {referenceCells()}
                      </tr>
                    )}
                    <tr className="border-b border-border last:border-b-0">
                      <th scope="row" className="p-3 text-left font-medium">
                        {attributeName(attribute, lang)}
                      </th>
                      <td className="border-l border-border p-3 text-center whitespace-pre-line">
                        {card ? levelLabel(question, level, lang) : ''}
                      </td>
                      {referenceCells()}
                    </tr>
                  </Fragment>
                )
              })}
            </SectionRows>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface PromptAnswerProps {
  id: string
  question: ChoiceExperimentQuestion
  prompt: ChoicePrompt
  number: number
  lang: Lang
  chosen: string
  other: string
  onChoose: (chosen: string) => void
  onOther: (typed: string) => void
}

/**
 * One question under a scenario table with its answer buttons: the table's
 * alternatives, or the prompt's own options plus "Other" with a text field.
 */
function PromptAnswer({
  id,
  question,
  prompt,
  number,
  lang,
  chosen,
  other,
  onChoose,
  onOther,
}: PromptAnswerProps) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  // The profile table has a single card column, so its prompts always use options.
  const usesColumns = prompt.answer === 'alternative' && question.layout !== 'profile'
  const choices =
    usesColumns
      ? question.alternatives.map((alternative) => ({
          key: alternative.key,
          label: pickText(alternative.label, lang) || alternative.key,
        }))
      : [
          ...prompt.options.map((option) => ({
            key: option.key,
            label: pickText(option.label, lang) || option.key,
          })),
          ...(prompt.allowOther ? [{ key: OTHER_ANSWER, label: t('Other', 'অন্যান্য') }] : []),
        ]

  return (
    <div className="space-y-2">
      <p id={id} className={cn('text-base', localizedStyleClass(prompt.text, FORM_TEXT_DEFAULTS.prompt))}>
        {formatNumber(number, lang)}. {pickText(prompt.text, lang)}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const selected = chosen === choice.key
          return (
            <button
              key={choice.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChoose(choice.key)}
              className={cn(
                'inline-flex min-h-12 min-w-32 items-center justify-center gap-2 rounded-xl border px-5 text-base outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                selected
                  ? 'border-primary bg-primary/10 font-semibold'
                  : 'border-border bg-background hover:bg-muted',
              )}
            >
              <RadioDot selected={selected} size="sm" />
              {choice.label}
            </button>
          )
        })}
      </div>
      {prompt.allowOther && chosen === OTHER_ANSWER && (
        <Input
          value={other}
          onChange={(event) => onOther(event.target.value)}
          placeholder={t('Please specify', 'অনুগ্রহ করে লিখুন')}
          aria-label={t('Other answer', 'অন্য উত্তর')}
          className="h-12 max-w-md text-base md:text-base"
        />
      )}
    </div>
  )
}

function RadioDot({ selected, size }: { selected: boolean; size: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        size === 'lg' ? 'size-7' : 'size-5',
        selected ? 'border-primary bg-primary' : 'border-input bg-background',
      )}
    >
      {selected && (
        <span className={cn('rounded-full bg-primary-foreground', size === 'lg' ? 'size-3' : 'size-2')} />
      )}
    </span>
  )
}

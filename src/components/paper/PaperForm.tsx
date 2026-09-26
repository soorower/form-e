import type { ReactNode } from 'react'
import { OTHER_ANSWER } from '#/lib/questionnaire/answers'
import { attributeSections, columnKey, levelLabel } from '#/lib/questionnaire/cards'
import {
  blockQuestionCount,
  formatNumber,
  formatSurveyNumber,
  pickText,
  questionNumbers,
  rankLimit,
} from '#/lib/questionnaire/factory'
import { paperScenarios } from '#/lib/questionnaire/paper'
import { activeRespondentFields, RESPONDENT_FIELDS } from '#/lib/questionnaire/respondent'
import { FORM_TEXT_DEFAULTS, localizedStyleClass } from '#/lib/questionnaire/text-style'
import type {
  ChoiceExperimentQuestion,
  ChoicePrompt,
  ChoiceScenarioAnswer,
  Lang,
  Question,
  Questionnaire,
} from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'

// One printed copy of a survey for one survey number. Drawn in black on
// white whatever the app's theme, because it is meant for paper; the page
// breaks between copies come from `break-before-page` on the copy itself.

interface PaperFormProps {
  questionnaire: Questionnaire
  serial: number
  lang: Lang
  /** Printed in the enumerator box; a blank line when empty. */
  enumerator: string
  /** Starts this copy on a new sheet. False for the first copy. */
  newPage: boolean
}

export function PaperForm({ questionnaire, serial, lang, enumerator, newPage }: PaperFormProps) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const numbers = questionNumbers(questionnaire.questions)
  const title = pickText(questionnaire.title, lang)
  const institution = pickText(questionnaire.institution, lang)
  const description = pickText(questionnaire.description, lang)
  const respondentFields = activeRespondentFields(questionnaire)
  const surveyNumber = formatSurveyNumber(questionnaire.surveyCodePrefix, serial)
  const planRow = questionnaire.questions
    .map((question) =>
      question.type === 'choice_experiment' ? paperScenarios(question, serial).planRow : undefined,
    )
    .find((row) => row !== undefined)

  return (
    <article
      lang={lang}
      className={cn(
        'mx-auto w-full max-w-[190mm] space-y-4 bg-white p-6 text-[10.5pt] leading-snug text-black shadow-sm ring-1 ring-black/10 print:max-w-none print:p-0 print:shadow-none print:ring-0',
        newPage && 'break-before-page',
      )}
    >
      <div className="space-y-1 text-center">
        {questionnaire.logo && (
          <img src={questionnaire.logo} alt="" className="mx-auto mb-1 h-14 w-auto object-contain" />
        )}
        {title && (
          <h2 className={cn('text-[14pt]', localizedStyleClass(questionnaire.title, FORM_TEXT_DEFAULTS.title))}>
            {title}
          </h2>
        )}
        {institution && (
          <p className={localizedStyleClass(questionnaire.institution, FORM_TEXT_DEFAULTS.institution)}>
            {institution}
          </p>
        )}
        {description && (
          <p
            className={cn(
              'whitespace-pre-line text-[9.5pt]',
              localizedStyleClass(questionnaire.description, FORM_TEXT_DEFAULTS.description),
            )}
          >
            {description}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-black p-3">
        <p>
          {t('Survey no.', 'জরিপ নং')}: <span className="font-mono text-[12pt] font-bold">{surveyNumber}</span>
        </p>
        <p className="flex items-end gap-2">
          {t('Enumerator', 'তথ্য সংগ্রহকারী')}:
          {enumerator ? <span className="font-semibold">{enumerator}</span> : <Blank />}
        </p>
        <p className="flex items-end gap-2">
          {t('Date', 'তারিখ')}: <Blank />
        </p>
        <p className="flex items-end gap-2">
          {t('Location', 'স্থান')}: <Blank />
        </p>
        {planRow !== undefined && (
          <p>
            {t('Scenario plan row', 'দৃশ্যপট তালিকার সারি')}:{' '}
            <span className="font-mono font-semibold">{formatNumber(planRow, lang)}</span>
          </p>
        )}
      </div>

      {respondentFields.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">{t('Respondent details', 'উত্তরদাতার তথ্য')}</p>
          {respondentFields.map((field) => {
            const meta = RESPONDENT_FIELDS.find((candidate) => candidate.key === field.key)
            return (
              <p key={field.key} className="flex items-end gap-2">
                <span className="shrink-0">
                  {meta ? pickText(meta.label, lang) : field.key}
                  {field.required ? ' *' : ''}:
                </span>
                <Blank grow />
              </p>
            )
          })}
        </div>
      )}

      {questionnaire.questions.map((question, index) =>
        question.type === 'choice_experiment' ? (
          <PaperChoiceBlock
            key={question.id}
            question={question}
            number={numbers[index]}
            serial={serial}
            lang={lang}
          />
        ) : (
          <PaperQuestion key={question.id} question={question} number={numbers[index]} lang={lang} />
        ),
      )}
    </article>
  )
}

/** A line to write on. */
function Blank({ grow, className }: { grow?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-5 border-b border-black', grow ? 'flex-1' : 'min-w-40', className)}
    />
  )
}

/** A circle to fill in (one answer) or a square to tick (several). */
function Mark({ square }: { square?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3.5 shrink-0 border border-black', square ? 'rounded-[2px]' : 'rounded-full')}
    />
  )
}

function OptionList({ labels, square }: { labels: string[]; square?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
      {labels.map((label, index) => (
        <p key={index} className="flex items-center gap-2">
          <Mark square={square} />
          <span>{label || '—'}</span>
        </p>
      ))}
    </div>
  )
}

function QuestionHeading({
  question,
  number,
  lang,
  note,
}: {
  question: Question
  number: number
  lang: Lang
  note?: string
}) {
  const help = pickText(question.help, lang)
  return (
    <div className="space-y-0.5">
      <p className={localizedStyleClass(question.label, FORM_TEXT_DEFAULTS.questionLabel)}>
        <span className="font-normal not-italic no-underline">{formatNumber(number, lang)}. </span>
        {pickText(question.label, lang)}
        {question.required && ' *'}
      </p>
      {help && <p className="whitespace-pre-line text-[9pt] text-neutral-700">{help}</p>}
      {note && <p className="text-[9pt] italic text-neutral-700">{note}</p>}
    </div>
  )
}

function PaperQuestion({ question, number, lang }: { question: Question; number: number; lang: Lang }) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  let note: string | undefined
  let body: ReactNode = null

  switch (question.type) {
    case 'short_text':
      body = <Blank grow className="flex w-full" />
      break
    case 'long_text':
      body = (
        <div className="space-y-3">
          <Blank grow className="flex w-full" />
          <Blank grow className="flex w-full" />
          <Blank grow className="flex w-full" />
        </div>
      )
      break
    case 'number': {
      const unit = pickText(question.unit, lang)
      const bounds = [
        question.min !== undefined ? `${t('min', 'সর্বনিম্ন')} ${formatNumber(question.min, lang)}` : '',
        question.max !== undefined ? `${t('max', 'সর্বোচ্চ')} ${formatNumber(question.max, lang)}` : '',
      ].filter(Boolean)
      body = (
        <p className="flex items-end gap-2">
          <span aria-hidden className="inline-block h-7 w-32 border border-black" />
          {unit}
          {bounds.length > 0 && <span className="text-[9pt] text-neutral-700">({bounds.join(', ')})</span>}
        </p>
      )
      break
    }
    case 'date':
      body = <p className="font-mono tracking-widest">____ / ____ / ________</p>
      break
    case 'time':
      body = <p className="font-mono tracking-widest">____ : ____</p>
      break
    case 'single_choice':
    case 'dropdown':
      note = t('Choose one.', 'একটি বেছে নিন।')
      body = <OptionList labels={question.options.map((option) => pickText(option.label, lang))} />
      break
    case 'multi_choice':
      note = t('Tick all that apply.', 'প্রযোজ্য সবগুলোতে টিক দিন।')
      body = <OptionList square labels={question.options.map((option) => pickText(option.label, lang))} />
      break
    case 'ranking': {
      const limit = rankLimit(question)
      note = t(
        `Write 1, 2, 3 … in the boxes in order of preference (up to ${limit}). 1 = first priority.`,
        `পছন্দের ক্রমানুসারে ঘরে ১, ২, ৩ … লিখুন (সর্বোচ্চ ${formatNumber(limit, lang)}টি)। ১ = প্রথম অগ্রাধিকার।`,
      )
      body = (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {question.options.map((option) => (
            <p key={option.id} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-5 w-7 shrink-0 border border-black" />
              <span>{pickText(option.label, lang) || '—'}</span>
            </p>
          ))}
        </div>
      )
      break
    }
    case 'table': {
      const blankRows = question.allowAddRows ? 3 : 0
      const rows = [
        ...question.rows.map((row) => pickText(row.label, lang)),
        ...Array.from({ length: blankRows }, () => ''),
      ]
      const dropdowns = question.columns.filter((column) => column.input === 'dropdown')
      body = (
        <div className="space-y-1">
          <table className="w-full border-collapse text-[9.5pt]">
            <thead>
              <tr>
                <th className="border border-black p-1.5" />
                {question.columns.map((column) => (
                  <th key={column.id} className="border border-black p-1.5 font-semibold">
                    {pickText(column.label, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((label, rowIndex) => (
                <tr key={rowIndex}>
                  <th scope="row" className="h-7 border border-black p-1.5 text-left font-normal">
                    {label}
                  </th>
                  {question.columns.map((column) => (
                    <td key={column.id} className="border border-black p-1.5 text-center">
                      {column.input === 'checkbox' && <Mark square />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {dropdowns.map((column) => (
            <p key={column.id} className="text-[9pt] text-neutral-700">
              {pickText(column.label, lang)}:{' '}
              {column.options.map((option) => pickText(option.label, lang)).join(' / ')}
            </p>
          ))}
        </div>
      )
      break
    }
    case 'choice_experiment':
      return null
  }

  return (
    <section className="break-inside-avoid space-y-2">
      <QuestionHeading question={question} number={number} lang={lang} note={note} />
      {body}
    </section>
  )
}

function PaperChoiceBlock({
  question,
  number,
  serial,
  lang,
}: {
  question: ChoiceExperimentQuestion
  number: number
  serial: number
  lang: Lang
}) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const { scenarios } = paperScenarios(question, serial)
  const perScenario = Math.max(1, question.prompts.length)
  const intro = pickText(question.help, lang)
  const last = number + blockQuestionCount(question) - 1

  return (
    <section className="space-y-3">
      <h3
        className={cn(
          'border-y border-black bg-neutral-100 px-2 py-1 text-[11pt]',
          localizedStyleClass(question.label, FORM_TEXT_DEFAULTS.sectionTitle),
        )}
      >
        {pickText(question.label, lang) || t('Choice scenarios', 'পছন্দের দৃশ্যপট')}{' '}
        <span className="text-[9pt] font-normal">
          ({t('questions', 'প্রশ্ন')} {formatNumber(number, lang)}–{formatNumber(last, lang)})
        </span>
      </h3>
      {intro && <p className="whitespace-pre-line">{intro}</p>}
      {scenarios.length === 0 && (
        <p className="border border-dashed border-black p-2 text-center">
          {t('This section has no design cards yet.', 'এই অংশে এখনও কোনো কার্ড নেই।')}
        </p>
      )}
      {scenarios.map((scenario, index) => (
        <PaperScenario
          key={index}
          question={question}
          scenario={scenario}
          index={index}
          number={number + index * perScenario}
          lang={lang}
        />
      ))}
    </section>
  )
}

function PaperScenario({
  question,
  scenario,
  index,
  number,
  lang,
}: {
  question: ChoiceExperimentQuestion
  scenario: ChoiceScenarioAnswer
  index: number
  number: number
  lang: Lang
}) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const attributeHeader = pickText(question.attributeHeader, lang) || t('Attributes', 'বৈশিষ্ট্যসমূহ')
  const [first] = question.prompts
  const inline =
    question.layout === 'alternatives' &&
    question.prompts.length === 1 &&
    first !== undefined &&
    first.answer === 'alternative'
  const sections = attributeSections(question.attributes)
  const profile = question.layout === 'profile'
  const columns = profile ? question.alternatives.slice(0, 1) : question.alternatives
  const references = profile ? question.referenceColumns : []
  const width = columns.length + references.length + 1

  return (
    <div className="break-inside-avoid space-y-2">
      <p className="text-center font-bold">
        {t('Scenario', 'দৃশ্যপট')}-{formatNumber(index + 1, lang)}{' '}
        <span className="text-[9pt] font-normal">(SID: {scenario.set})</span>
      </p>
      <table className="w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="bg-neutral-100">
            <th className="border border-black p-1.5 text-left">{attributeHeader}</th>
            {columns.map((alternative) => (
              <th key={alternative.key} className="border border-black p-1.5">
                {pickText(alternative.label, lang) || alternative.key}
              </th>
            ))}
            {references.map((column) => (
              <th key={column.key} className="border border-black p-1.5">
                {pickText(column.label, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.flatMap((section, sectionIndex) => [
            ...(section.group && pickText(section.group, lang)
              ? [
                  <tr key={`group-${sectionIndex}`}>
                    <th colSpan={width} className="border border-black bg-neutral-50 p-1.5 text-left">
                      {pickText(section.group, lang)}
                    </th>
                  </tr>,
                ]
              : []),
            ...section.attributes.map((attribute) => (
              <tr key={attribute.key}>
                <th scope="row" className="border border-black p-1.5 text-left font-medium">
                  {pickText(attribute.label, lang) || attribute.key}
                </th>
                {columns.map((alternative) => (
                  <td key={alternative.key} className="border border-black p-1.5 text-center whitespace-pre-line">
                    {levelLabel(
                      question,
                      scenario.levels[columnKey(question, attribute.key, alternative.key)] ?? '',
                      lang,
                    )}
                  </td>
                ))}
                {references.map((column) => (
                  <td key={column.key} className="border border-black p-1.5 text-center whitespace-pre-line">
                    {pickText(column.text, lang)}
                  </td>
                ))}
              </tr>
            )),
          ])}
          {inline && (
            <tr>
              <th scope="row" className="border border-black p-1.5 text-left">
                {formatNumber(number, lang)}. {pickText(first.text, lang)}
              </th>
              {columns.map((alternative) => (
                <td key={alternative.key} className="border border-black p-1.5 text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <Mark />
                    {pickText(alternative.label, lang) || alternative.key}
                  </span>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {!inline &&
        question.prompts.map((prompt, promptIndex) => (
          <PaperPrompt
            key={prompt.key}
            question={question}
            prompt={prompt}
            number={number + promptIndex}
            lang={lang}
          />
        ))}
    </div>
  )
}

function PaperPrompt({
  question,
  prompt,
  number,
  lang,
}: {
  question: ChoiceExperimentQuestion
  prompt: ChoicePrompt
  number: number
  lang: Lang
}) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const usesColumns = prompt.answer === 'alternative' && question.layout !== 'profile'
  const labels = usesColumns
    ? question.alternatives.map((alternative) => pickText(alternative.label, lang) || alternative.key)
    : prompt.options.map((option) => pickText(option.label, lang) || option.key)
  return (
    <div className="space-y-1">
      <p className={localizedStyleClass(prompt.text, FORM_TEXT_DEFAULTS.prompt)}>
        {formatNumber(number, lang)}. {pickText(prompt.text, lang)}
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        {labels.map((label, index) => (
          <span key={index} className="inline-flex items-center gap-1.5">
            <Mark />
            {label}
          </span>
        ))}
        {!usesColumns && prompt.allowOther && (
          <span key={OTHER_ANSWER} className="inline-flex items-end gap-1.5">
            <Mark />
            {t('Other', 'অন্যান্য')}: <Blank />
          </span>
        )}
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { OTHER_ANSWER } from '#/lib/questionnaire/answers'
import { attributeSections, columnKey, levelLabel } from '#/lib/questionnaire/cards'
import {
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

// One printed copy of a survey for one survey number, laid out the way the
// team's own printed questionnaires are: the number in the top corner, each
// ordinary question on one line with its answers, and one full-width table
// per scenario. Black on white whatever the app's theme, because it is meant
// for paper; the print page fits each copy on two sheets.

interface PaperFormProps {
  questionnaire: Questionnaire
  serial: number
  lang: Lang
  /** Printed beside "Enumerator" at the end; a blank line when empty. */
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
  const surveyNumber = formatSurveyNumber(questionnaire.surveyCodePrefix, serial)
  const planRow = questionnaire.questions
    .map((question) =>
      question.type === 'choice_experiment' ? paperScenarios(question, serial).planRow : undefined,
    )
    .find((row) => row !== undefined)
  // Only name and phone go on paper, on one line at the end: the form has to
  // fit two pages, and email and address are rarely written legibly anyway.
  const contactFields = activeRespondentFields(questionnaire).filter(
    (field) => field.key === 'name' || field.key === 'phone',
  )

  return (
    <article
      lang={lang}
      className={cn(
        '[orphans:3] [widows:3] [&_h3]:break-after-avoid w-full space-y-2 bg-white p-5 text-[9pt] leading-snug text-black shadow-sm ring-1 ring-black/10 print:p-0 print:shadow-none print:ring-0',
        newPage && 'break-before-page',
      )}
    >
      <header className="break-inside-avoid space-y-1.5">
        <div className="grid grid-cols-[5rem_1fr_5rem] items-start gap-2">
          <div>
            {questionnaire.logo && (
              <img src={questionnaire.logo} alt="" className="h-12 w-auto object-contain" />
            )}
          </div>
          <div className="pt-1 text-center">
            {title && (
              <h2
                className={cn(
                  'text-[10.5pt] leading-tight',
                  localizedStyleClass(questionnaire.title, FORM_TEXT_DEFAULTS.title),
                )}
              >
                {title}
              </h2>
            )}
            {institution && (
              <p className={localizedStyleClass(questionnaire.institution, FORM_TEXT_DEFAULTS.institution)}>
                {institution}
              </p>
            )}
          </div>
          <div className="text-right leading-tight">
            <p className="font-mono text-[10pt] font-bold whitespace-nowrap">{surveyNumber}</p>
            {planRow !== undefined && (
              <p className="text-[7.5pt]">
                {t('Plan row', 'সারি')}: {formatNumber(planRow, lang)}
              </p>
            )}
          </div>
        </div>
        {description && (
          <p
            className={cn(
              'whitespace-pre-line text-[8.5pt] leading-snug',
              localizedStyleClass(questionnaire.description, FORM_TEXT_DEFAULTS.description),
            )}
          >
            {description}
          </p>
        )}
      </header>

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

      <footer className="break-inside-avoid space-y-1.5 border-t border-black pt-2">
        {contactFields.length > 0 && (
          <p className="flex flex-wrap items-end gap-x-6 gap-y-1">
            {contactFields.map((field) => {
              const meta = RESPONDENT_FIELDS.find((candidate) => candidate.key === field.key)
              const label = meta ? pickText(meta.label, lang) : field.key
              return (
                <span key={field.key} className="flex min-w-0 flex-1 items-end gap-1">
                  <span className="shrink-0">
                    {field.key === 'name' ? t('Respondent’s name', 'উত্তরদাতার নাম') : label}
                    {field.required ? ' *' : ''}:
                  </span>
                  <Blank grow />
                </span>
              )
            })}
          </p>
        )}
        <p className="flex flex-wrap items-end gap-x-6 gap-y-1">
          <span className="flex min-w-0 flex-1 items-end gap-1">
            <span className="shrink-0">{t('Enumerator', 'তথ্য সংগ্রহকারী')}:</span>
            {enumerator ? <span className="font-semibold">{enumerator}</span> : <Blank grow />}
          </span>
          <span className="flex items-end gap-1">
            {t('Date', 'তারিখ')}: <Blank />
          </span>
        </p>
        <p className="pt-1 text-center font-semibold">
          {t(
            'Thank you for your valuable time.',
            'আপনার মূল্যবান সময় দেওয়ার জন্য আপনাকে আন্তরিক ধন্যবাদ।',
          )}
        </p>
      </footer>
    </article>
  )
}

/** A line to write on. */
function Blank({ grow, className }: { grow?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-4 border-b border-black',
        grow ? 'min-w-24 flex-1' : 'min-w-28',
        className,
      )}
    />
  )
}

/** A box to write a number in. */
function Box({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-4 w-36 border border-black', className)} />
}

/** A circle to fill in (one answer) or a square to tick (several). */
function Mark({ square }: { square?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 border border-black',
        square ? 'rounded-[1px]' : 'rounded-full',
      )}
    />
  )
}

/** One answer beside the question: a mark, then its label. */
function Choice({ label, square }: { label: string; square?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Mark square={square} />
      {label || '—'}
    </span>
  )
}

function Label({ question, number, lang }: { question: Question; number: number; lang: Lang }) {
  return (
    <span className={localizedStyleClass(question.label, FORM_TEXT_DEFAULTS.questionLabel)}>
      <span className="font-normal not-italic no-underline">{formatNumber(number, lang)}. </span>
      {pickText(question.label, lang)}
      {question.required && ' *'}
    </span>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <span className="text-[7.5pt] italic">({children})</span>
}

/**
 * An ordinary question: the question and its answers on one line, wrapping
 * only when they do not fit. Tables and long text take their own lines.
 */
function PaperQuestion({ question, number, lang }: { question: Question; number: number; lang: Lang }) {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const help = pickText(question.help, lang)
  const label = <Label question={question} number={number} lang={lang} />
  const helpLine = help ? <p className="whitespace-pre-line text-[8pt] leading-tight">{help}</p> : null
  const line = (children: ReactNode) => (
    <section className="break-inside-avoid">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
        {label}
        {children}
      </p>
      {helpLine}
    </section>
  )

  switch (question.type) {
    case 'short_text':
      return line(<Blank grow />)
    case 'long_text':
      return (
        <section className="break-inside-avoid space-y-2">
          <p>{label}</p>
          {helpLine}
          <Blank grow className="flex w-full" />
          <Blank grow className="flex w-full" />
        </section>
      )
    case 'number': {
      const unit = pickText(question.unit, lang)
      return line(
        <span className="inline-flex items-center gap-1.5">
          <Box />
          {unit}
        </span>,
      )
    }
    case 'date':
      return line(<span className="font-mono tracking-widest">____/____/________</span>)
    case 'time':
      return line(<span className="font-mono tracking-widest">____:____</span>)
    case 'single_choice':
    case 'dropdown':
      return line(
        question.options.map((option) => (
          <Choice key={option.id} label={pickText(option.label, lang)} />
        )),
      )
    case 'multi_choice':
      return line(
        <>
          <Note>{t('tick all that apply', 'প্রযোজ্য সবগুলোতে টিক দিন')}</Note>
          {question.options.map((option) => (
            <Choice key={option.id} square label={pickText(option.label, lang)} />
          ))}
        </>,
      )
    case 'ranking': {
      const limit = rankLimit(question)
      return line(
        <>
          <Note>
            {t(
              `write 1, 2, 3 … in order of preference, up to ${limit}`,
              `পছন্দের ক্রমানুসারে ১, ২, ৩ … লিখুন, সর্বোচ্চ ${formatNumber(limit, lang)}টি`,
            )}
          </Note>
          {question.options.map((option) => (
            <span key={option.id} className="inline-flex items-center gap-1 whitespace-nowrap">
              <span aria-hidden className="inline-block h-3.5 w-5 shrink-0 border border-black" />
              {pickText(option.label, lang) || '—'}
            </span>
          ))}
        </>,
      )
    }
    case 'table':
      return <PaperTable question={question} number={number} lang={lang} />
    case 'choice_experiment':
      return null
  }
}

function PaperTable({
  question,
  number,
  lang,
}: {
  question: Extract<Question, { type: 'table' }>
  number: number
  lang: Lang
}) {
  const rows = [
    ...question.rows.map((row) => pickText(row.label, lang)),
    ...Array.from({ length: question.allowAddRows ? 3 : 0 }, () => ''),
  ]
  const cell = 'border border-black px-1 py-px'
  return (
    <section className="break-inside-avoid space-y-1">
      <p>
        <Label question={question} number={number} lang={lang} />
      </p>
      <table className="w-full border-collapse text-[8.5pt]">
        <thead>
          <tr className="bg-neutral-100">
            <th className={cell} />
            {question.columns.map((column) => (
              <th key={column.id} className={cell}>
                {pickText(column.label, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((label, rowIndex) => (
            <tr key={rowIndex}>
              <th scope="row" className={cn(cell, 'h-5 text-left font-normal')}>
                {label}
              </th>
              {question.columns.map((column) => (
                <td key={column.id} className={cn(cell, 'text-center')}>
                  {column.input === 'checkbox' && <Mark square />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {question.columns
        .filter((column) => column.input === 'dropdown')
        .map((column) => (
          <p key={column.id} className="text-[8pt]">
            {pickText(column.label, lang)}:{' '}
            {column.options.map((option) => pickText(option.label, lang)).join(' / ')}
          </p>
        ))}
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
  const scenario = (index: number) => (
    <PaperScenario
      key={index}
      question={question}
      scenario={scenarios[index]}
      index={index}
      number={number + index * perScenario}
      lang={lang}
    />
  )

  // The band and introduction travel with the first scenario, so a section
  // title is never left alone at the foot of a page.
  return (
    <section className="space-y-1.5">
      <div className="break-inside-avoid space-y-1.5">
        <div className="border border-black">
          <h3
            className={cn(
              'bg-neutral-200 px-2 py-0.5 text-center text-[9.5pt]',
              localizedStyleClass(question.label, FORM_TEXT_DEFAULTS.sectionTitle),
            )}
          >
            {pickText(question.label, lang) || t('Choice scenarios', 'পছন্দের দৃশ্যপট')}
          </h3>
          {intro && (
            <p className="border-t border-black bg-neutral-50 px-2 py-1 text-justify text-[8.5pt] leading-snug whitespace-pre-line">
              {intro}
            </p>
          )}
        </div>
        {scenarios.length === 0 ? (
          <p className="border border-dashed border-black p-1 text-center">
            {t('This section has no design cards yet.', 'এই অংশে এখনও কোনো কার্ড নেই।')}
          </p>
        ) : (
          scenario(0)
        )}
      </div>
      {scenarios.slice(1).map((_unused, offset) => scenario(offset + 1))}
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
  const cell = 'border border-black px-1.5 py-px'

  return (
    <div className="break-inside-avoid">
      <p className="text-center text-[8.5pt] font-semibold">
        {t('Scenario', 'দৃশ্যপট')}-{formatNumber(index + 1, lang)} (SID: {scenario.set})
      </p>
      <table className="w-full table-fixed border-collapse text-[8.5pt] leading-tight">
        {/* The attribute names get a fixed share; the answer columns split the rest. */}
        <colgroup>
          <col style={{ width: width <= 3 ? '36%' : '28%' }} />
          {Array.from({ length: width - 1 }, (_unused, column) => (
            <col key={column} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-neutral-100">
            <th className={cn(cell, 'text-left')}>{attributeHeader}</th>
            {columns.map((alternative) => (
              <th key={alternative.key} className={cell}>
                {pickText(alternative.label, lang) || alternative.key}
              </th>
            ))}
            {references.map((column) => (
              <th key={column.key} className={cell}>
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
                    <th colSpan={width} className={cn(cell, 'bg-neutral-50 text-left')}>
                      {pickText(section.group, lang)}
                    </th>
                  </tr>,
                ]
              : []),
            ...section.attributes.map((attribute) => (
              <tr key={attribute.key}>
                <th scope="row" className={cn(cell, 'text-left font-normal')}>
                  {pickText(attribute.label, lang) || attribute.key}
                </th>
                {columns.map((alternative) => (
                  <td key={alternative.key} className={cn(cell, 'text-center whitespace-pre-line')}>
                    {levelLabel(
                      question,
                      scenario.levels[columnKey(question, attribute.key, alternative.key)] ?? '',
                      lang,
                    )}
                  </td>
                ))}
                {references.map((column) => (
                  <td key={column.key} className={cn(cell, 'text-center whitespace-pre-line')}>
                    {pickText(column.text, lang)}
                  </td>
                ))}
              </tr>
            )),
          ])}
          {inline && (
            <tr>
              <th scope="row" className={cn(cell, 'text-left')}>
                {formatNumber(number, lang)}. {pickText(first.text, lang)}
              </th>
              {columns.map((alternative) => (
                <td key={alternative.key} className={cn(cell, 'text-center')}>
                  <Mark square />
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
    <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[8.5pt] leading-tight">
      <span className={localizedStyleClass(prompt.text, FORM_TEXT_DEFAULTS.prompt)}>
        {formatNumber(number, lang)}. {pickText(prompt.text, lang)}
      </span>
      {labels.map((label, index) => (
        <Choice key={index} label={label} />
      ))}
      {!usesColumns && prompt.allowOther && (
        <span key={OTHER_ANSWER} className="inline-flex items-end gap-1">
          <Mark />
          {t('Other', 'অন্যান্য')}: <Blank />
        </span>
      )}
    </p>
  )
}

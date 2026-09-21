import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { isAnswered } from '#/lib/questionnaire/answers'
import {
  LANGUAGE_LABELS,
  activeEnumerators,
  pickText,
  questionNumbers,
  uid,
} from '#/lib/questionnaire/factory'
import { FORM_TEXT_DEFAULTS, localizedStyleClass } from '#/lib/questionnaire/text-style'
import type { AnswerValue, Lang, Questionnaire, SurveyResponse } from '#/lib/questionnaire/types'
import type { CardExposure } from '#/lib/questionnaire/cards'
import { cn } from '#/lib/utils'
import { QuestionField, questionDomId, type AnswerUpdate } from './QuestionField'

/** Who is collecting this response and which number it will get. */
export interface ResponseMeta {
  serial: number
  surveyNumber: string
  enumerator: string
  /** Present when the enumerator can be chosen on this screen. */
  onEnumeratorChange?: (name: string) => void
  /**
   * The enumerator is the signed-in account and cannot be changed here, so
   * the name need not be one of the questionnaire's team names.
   */
  locked?: boolean
}

/** Per choice-experiment question id: how often each card set has been shown. */
export type QuestionnaireCardExposure = Record<string, CardExposure>

interface QuestionnaireRendererProps {
  questionnaire: Questionnaire
  /** Survey number and enumerator shown in the header and saved with the response. */
  meta?: ResponseMeta
  /**
   * Card exposure for balanced drawing. Pass `{}` when there are no responses
   * yet; leave undefined only while it is still loading.
   */
  cardExposure?: QuestionnaireCardExposure
  /**
   * Called with the completed response. May return the survey number actually
   * assigned by the server, which is then shown on the confirmation screen.
   * Omit for a preview that records nothing.
   */
  onSubmit?: (response: SurveyResponse) => void | string | Promise<string | void>
  /**
   * `page` shows every question on one scrolling page (the default).
   * `steps` shows one question at a time with Back / Next, the way a
   * surveyor walks a respondent through the interview.
   */
  mode?: 'page' | 'steps'
}

/** Tablet-first rendering of a questionnaire for respondents. */
export function QuestionnaireRenderer({
  questionnaire,
  meta,
  cardExposure,
  onSubmit,
  mode = 'page',
}: QuestionnaireRendererProps) {
  const [chosenLang, setChosenLang] = useState<Lang | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [attempted, setAttempted] = useState(false)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Steps mode: which question is on screen, and whether Next was pressed
  // on it while it was still unanswered.
  const [step, setStep] = useState(0)
  const [stepAttempted, setStepAttempted] = useState(false)
  const stepped = mode === 'steps'

  const team = activeEnumerators(questionnaire)
  const enumerator = meta?.enumerator.trim() ?? ''
  // With a team list the name must come from it; otherwise any name (or none) is fine.
  const enumeratorMissing =
    !!meta && !meta.locked && team.length > 0 && !team.includes(enumerator)

  const lang: Lang =
    chosenLang && questionnaire.languages.includes(chosenLang)
      ? chosenLang
      : questionnaire.defaultLanguage
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)

  const missing = questionnaire.questions
    .filter((question) => question.required && !isAnswered(question, answers[question.id]))
    .map((question) => question.id)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (submitting) return
    if (enumeratorMissing) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (missing.length > 0) {
      if (stepped) {
        // Go back to the first unanswered required question.
        const index = questionnaire.questions.findIndex((question) => question.id === missing[0])
        if (index >= 0) setStep(index)
        setStepAttempted(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      document
        .getElementById(questionDomId(missing[0]))
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    try {
      // The id is generated here so a retry after a dropped connection is
      // recorded once, not twice.
      const assigned = await onSubmit?.({
        id: uid(),
        questionnaireId: questionnaire.id,
        serial: meta?.serial ?? 0,
        surveyNumber: meta?.surveyNumber ?? '',
        enumerator,
        language: lang,
        answers,
        submittedAt: Date.now(),
      })
      setSubmitted(assigned ?? meta?.surveyNumber ?? '')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setAnswers({})
    setAttempted(false)
    setSubmitting(false)
    setSubmitted(null)
    setStep(0)
    setStepAttempted(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const stepCount = questionnaire.questions.length
  const current = stepped ? questionnaire.questions[Math.min(step, stepCount - 1)] : undefined

  function goTo(index: number) {
    setStep(Math.max(0, Math.min(stepCount - 1, index)))
    setStepAttempted(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Next only moves on when a required question has an answer. */
  function next() {
    if (!current) return
    if (current.required && !isAnswered(current, answers[current.id])) {
      setStepAttempted(true)
      return
    }
    goTo(step + 1)
  }

  /** In steps mode Enter in a text field means Next, not Submit. */
  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!stepped || event.key !== 'Enter') return
    const target = event.target as HTMLElement
    if (target.tagName !== 'INPUT') return
    if (step < stepCount - 1) {
      event.preventDefault()
      next()
    }
  }

  if (submitted !== null) {
    return (
      <div
        lang={lang}
        className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="size-7" />
        </span>
        <h2 className="text-2xl font-bold">{t('Response recorded', 'উত্তর সংরক্ষিত হয়েছে')}</h2>
        {submitted && (
          <p className="text-lg">
            {t('Survey no.', 'জরিপ নং')} <span className="font-mono font-semibold">{submitted}</span>
          </p>
        )}
        <p className="text-muted-foreground">
          {t('Thank you for taking part.', 'অংশগ্রহণের জন্য ধন্যবাদ।')}
        </p>
        <Button type="button" size="lg" className="h-12 px-8 text-base" onClick={reset}>
          {t('Start a new response', 'নতুন উত্তর শুরু করুন')}
        </Button>
      </div>
    )
  }

  const title = pickText(questionnaire.title, lang) || t('Untitled survey', 'শিরোনামহীন জরিপ')
  const institution = pickText(questionnaire.institution, lang)
  const description = pickText(questionnaire.description, lang)
  const { questions } = questionnaire
  const numbers = questionNumbers(questions)

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={onFormKeyDown}
      noValidate
      lang={lang}
      className="mx-auto w-full max-w-3xl space-y-5"
    >
      <header className="space-y-4 rounded-2xl border border-border bg-card p-6 text-card-foreground sm:p-8">
        {(questionnaire.logo || questionnaire.languages.length > 1) && (
          <div className="flex flex-wrap items-start justify-between gap-4">
            {questionnaire.logo && (
              <img
                src={questionnaire.logo}
                alt=""
                className="h-14 w-auto max-w-48 object-contain"
              />
            )}
            {questionnaire.languages.length > 1 && (
              <div
                role="group"
                aria-label="Language"
                className="ml-auto inline-flex rounded-lg border border-border p-0.5"
              >
                {questionnaire.languages.map((option) => (
                  <button
                    key={option}
                    type="button"
                    lang={option}
                    aria-pressed={option === lang}
                    onClick={() => setChosenLang(option)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      option === lang
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {LANGUAGE_LABELS[option]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <h1
          className={cn(
            'text-2xl tracking-tight sm:text-3xl',
            localizedStyleClass(questionnaire.title, FORM_TEXT_DEFAULTS.title),
          )}
        >
          {title}
        </h1>
        {institution && (
          <p
            className={cn(
              'text-lg',
              localizedStyleClass(questionnaire.institution, FORM_TEXT_DEFAULTS.institution),
            )}
          >
            {institution}
          </p>
        )}
        {description && (
          <p
            className={cn(
              'whitespace-pre-line text-muted-foreground',
              localizedStyleClass(questionnaire.description, FORM_TEXT_DEFAULTS.description),
            )}
          >
            {description}
          </p>
        )}
        {meta && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border pt-4 text-sm">
            <p>
              <span className="text-muted-foreground">{t('Survey no.', 'জরিপ নং')}</span>{' '}
              <span className="font-mono text-base font-semibold">{meta.surveyNumber}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="enumerator" className="text-muted-foreground">
                {t('Enumerator', 'জরিপকারী')}
              </label>
              {!meta.onEnumeratorChange ? (
                <span className="font-medium">{enumerator || '—'}</span>
              ) : team.length > 0 ? (
                <Select
                  value={team.includes(enumerator) ? enumerator : null}
                  onValueChange={(name) => meta.onEnumeratorChange?.(name ?? '')}
                  items={Object.fromEntries(team.map((name) => [name, name]))}
                >
                  <SelectTrigger
                    id="enumerator"
                    aria-invalid={attempted && enumeratorMissing}
                    className="w-56 text-base data-[size=default]:h-11"
                  >
                    <SelectValue placeholder={t('Choose your name', 'আপনার নাম বেছে নিন')} />
                  </SelectTrigger>
                  <SelectContent>
                    {team.map((name) => (
                      <SelectItem key={name} value={name} className="py-2.5 text-base">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="enumerator"
                  value={meta.enumerator}
                  placeholder={t('Your name', 'আপনার নাম')}
                  className="h-11 w-56 text-base md:text-base"
                  onChange={(event) => meta.onEnumeratorChange?.(event.target.value)}
                />
              )}
            </div>
            {attempted && enumeratorMissing && (
              <p className="w-full text-sm font-medium text-destructive">
                {t(
                  'Please choose the enumerator before submitting.',
                  'জমা দেওয়ার আগে অনুগ্রহ করে জরিপকারীর নাম বেছে নিন।',
                )}
              </p>
            )}
          </div>
        )}
      </header>

      {questions.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          {t('This survey has no questions yet.', 'এই জরিপে এখনও কোনো প্রশ্ন নেই।')}
        </p>
      )}

      {stepped && current ? (
        <>
          <div className="space-y-2 px-1">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {t('Question', 'প্রশ্ন')}{' '}
                <span className="font-semibold text-foreground">{step + 1}</span> / {stepCount}
              </span>
              <span>{Math.round(((step + 1) / stepCount) * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${((step + 1) / stepCount) * 100}%` }}
              />
            </div>
          </div>

          <QuestionField
            key={current.id}
            question={current}
            number={numbers[step]}
            lang={lang}
            value={answers[current.id]}
            onChange={(next: AnswerUpdate) =>
              setAnswers((all) => ({
                ...all,
                [current.id]: typeof next === 'function' ? next(all[current.id]) : next,
              }))
            }
            invalid={(attempted || stepAttempted) && missing.includes(current.id)}
            exposure={cardExposure ? (cardExposure[current.id] ?? {}) : undefined}
          />

          {stepAttempted && missing.includes(current.id) && (
            <p className="text-center text-sm font-medium text-destructive">
              {t('This question needs an answer.', 'এই প্রশ্নের উত্তর দিতে হবে।')}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 px-6 text-base"
              disabled={step === 0 || submitting}
              onClick={() => goTo(step - 1)}
            >
              {t('Back', 'পেছনে')}
            </Button>
            {step < stepCount - 1 ? (
              <Button type="button" size="lg" className="h-12 px-8 text-base" onClick={next}>
                {t('Next', 'পরবর্তী')}
              </Button>
            ) : (
              <Button type="submit" size="lg" disabled={submitting} className="h-12 px-8 text-base">
                {submitting ? t('Saving…', 'সংরক্ষণ হচ্ছে…') : t('Submit', 'জমা দিন')}
              </Button>
            )}
          </div>
        </>
      ) : (
        questions.map((question, index) => (
          <QuestionField
            key={question.id}
            question={question}
            number={numbers[index]}
            lang={lang}
            value={answers[question.id]}
            onChange={(next: AnswerUpdate) =>
              setAnswers((current) => ({
                ...current,
                [question.id]: typeof next === 'function' ? next(current[question.id]) : next,
              }))
            }
            invalid={attempted && missing.includes(question.id)}
            exposure={cardExposure ? (cardExposure[question.id] ?? {}) : undefined}
          />
        ))
      )}

      {questions.length > 0 && !stepped && (
        <div className="flex flex-col items-center gap-3 pt-2">
          {attempted && missing.length > 0 && (
            <p className="text-sm font-medium text-destructive">
              {t(
                'Please answer the required questions marked above.',
                'অনুগ্রহ করে উপরে চিহ্নিত আবশ্যক প্রশ্নগুলোর উত্তর দিন।',
              )}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            className="h-12 w-full max-w-xs text-base"
          >
            {submitting ? t('Saving…', 'সংরক্ষণ হচ্ছে…') : t('Submit', 'জমা দিন')}
          </Button>
        </div>
      )}
    </form>
  )
}

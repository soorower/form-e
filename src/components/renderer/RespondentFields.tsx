import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { pickText } from '#/lib/questionnaire/factory'
import { activeRespondentFields, respondentFieldMeta } from '#/lib/questionnaire/respondent'
import type {
  Lang,
  Questionnaire,
  RespondentDetails,
  RespondentFieldKey,
} from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'

/** The dom id of the respondent details card, so Submit can scroll to it. */
export const RESPONDENT_DOM_ID = 'respondent-details'

interface RespondentFieldsProps {
  questionnaire: Pick<Questionnaire, 'respondent'>
  lang: Lang
  value: RespondentDetails
  onChange: (value: RespondentDetails) => void
  /** Required fields left blank, marked once Submit or Next has been pressed. */
  missing: RespondentFieldKey[]
}

/**
 * The respondent's own details, asked once above the questions: whichever of
 * name, email, phone, and address the survey switched on. They carry no
 * question number — they are not questions — and they go into their own
 * export columns.
 */
export function RespondentFields({
  questionnaire,
  lang,
  value,
  onChange,
  missing,
}: RespondentFieldsProps) {
  const fields = activeRespondentFields(questionnaire)
  if (fields.length === 0) return null

  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en)
  const note = pickText(questionnaire.respondent?.note ?? { en: '', bn: '' }, lang)

  return (
    <section
      id={RESPONDENT_DOM_ID}
      lang={lang}
      aria-labelledby="respondent-details-heading"
      className={cn(
        'space-y-4 rounded-2xl border bg-card p-5 text-card-foreground sm:p-6',
        missing.length > 0 ? 'border-destructive' : 'border-border',
      )}
    >
      <div className="space-y-1">
        <h2 id="respondent-details-heading" className="text-lg font-semibold">
          {t('Respondent information', 'উত্তরদাতার তথ্য')}
        </h2>
        {note && <p className="whitespace-pre-line text-muted-foreground">{note}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const meta = respondentFieldMeta(field.key)
          const id = `respondent-${field.key}`
          const invalid = missing.includes(field.key)
          const label = pickText(meta.label, lang)
          return (
            <div
              key={field.key}
              className={cn('space-y-1.5', meta.multiline && 'sm:col-span-2')}
            >
              <label htmlFor={id} className="block text-base font-medium">
                {label}
                {field.required ? (
                  <span aria-hidden className="ml-1 text-destructive">
                    *
                  </span>
                ) : (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    {t('(optional)', '(ঐচ্ছিক)')}
                  </span>
                )}
              </label>
              {meta.multiline ? (
                <Textarea
                  id={id}
                  value={value[field.key] ?? ''}
                  required={field.required}
                  aria-invalid={invalid}
                  autoComplete={meta.autoComplete}
                  placeholder={pickText(meta.placeholder, lang)}
                  className="min-h-20 text-base md:text-base"
                  onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                />
              ) : (
                <Input
                  id={id}
                  type={meta.input}
                  value={value[field.key] ?? ''}
                  required={field.required}
                  aria-invalid={invalid}
                  autoComplete={meta.autoComplete}
                  placeholder={pickText(meta.placeholder, lang)}
                  className="h-12 text-base md:text-base"
                  onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                />
              )}
            </div>
          )
        })}
      </div>

      {missing.length > 0 && (
        <p className="text-sm font-medium text-destructive">
          {t(
            'Please fill in the details marked with *.',
            'অনুগ্রহ করে * চিহ্নিত তথ্যগুলো পূরণ করুন।',
          )}
        </p>
      )}
    </section>
  )
}

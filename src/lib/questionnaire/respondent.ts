import type {
  LocalizedText,
  Questionnaire,
  RespondentDetails,
  RespondentFieldKey,
  RespondentInfo,
  RespondentInfoField,
} from './types'

// Labels are written out rather than built with `text()` from factory.ts:
// factory.ts imports `createRespondentInfo` from here, and a plain literal
// keeps that import one-way.

/**
 * The respondent's own details — name, email, phone, address — asked once at
 * the top of the form. They are not questions: they carry no question number,
 * they are never part of a choice block, and they land in their own export
 * columns. A survey collects only the fields the creator switches on, and
 * `fields: []` (the default) collects nothing.
 */

export interface RespondentFieldMeta {
  key: RespondentFieldKey
  label: LocalizedText
  /** HTML input type, so tablets show the right keyboard. */
  input: 'text' | 'email' | 'tel'
  /** Address is the one field worth more than a single line. */
  multiline?: boolean
  autoComplete: string
  placeholder: LocalizedText
}

export const RESPONDENT_FIELDS: RespondentFieldMeta[] = [
  {
    key: 'name',
    label: { en: 'Name', bn: 'নাম' },
    input: 'text',
    autoComplete: 'name',
    placeholder: { en: 'Full name', bn: 'পুরো নাম' },
  },
  {
    key: 'email',
    label: { en: 'Email', bn: 'ইমেইল' },
    input: 'email',
    autoComplete: 'email',
    placeholder: { en: 'name@example.com', bn: 'name@example.com' },
  },
  {
    key: 'phone',
    label: { en: 'Phone', bn: 'মোবাইল নম্বর' },
    input: 'tel',
    autoComplete: 'tel',
    placeholder: { en: '01XXXXXXXXX', bn: '০১XXXXXXXXX' },
  },
  {
    key: 'address',
    label: { en: 'Address', bn: 'ঠিকানা' },
    input: 'text',
    multiline: true,
    autoComplete: 'street-address',
    placeholder: { en: 'Area, city', bn: 'এলাকা, শহর' },
  },
]

export const RESPONDENT_FIELD_KEYS: RespondentFieldKey[] = RESPONDENT_FIELDS.map(
  (field) => field.key,
)

export function respondentFieldMeta(key: RespondentFieldKey): RespondentFieldMeta {
  return RESPONDENT_FIELDS.find((field) => field.key === key) ?? RESPONDENT_FIELDS[0]
}

/** What a survey starts with: no respondent details asked for. */
export function createRespondentInfo(): RespondentInfo {
  return { fields: [], note: { en: '', bn: '' } }
}

/**
 * The fields the form actually shows, in the fixed order name, email, phone,
 * address, whatever order they were switched on in, and without duplicates.
 */
export function activeRespondentFields(
  questionnaire: Pick<Questionnaire, 'respondent'>,
): RespondentInfoField[] {
  const chosen = new Map(
    (questionnaire.respondent?.fields ?? []).map((field) => [field.key, field]),
  )
  return RESPONDENT_FIELD_KEYS.flatMap((key) => {
    const field = chosen.get(key)
    return field ? [{ key, required: field.required === true }] : []
  })
}

/** True when the form asks the respondent for anything about themselves. */
export function asksRespondentInfo(questionnaire: Pick<Questionnaire, 'respondent'>): boolean {
  return activeRespondentFields(questionnaire).length > 0
}

/** Required respondent fields that are still blank, in the order they are shown. */
export function missingRespondentFields(
  questionnaire: Pick<Questionnaire, 'respondent'>,
  details: RespondentDetails | undefined,
): RespondentFieldKey[] {
  return activeRespondentFields(questionnaire)
    .filter((field) => field.required && (details?.[field.key] ?? '').trim() === '')
    .map((field) => field.key)
}

/**
 * The details as they are stored with a response: trimmed, only the fields the
 * survey asks for, and only those that were filled in. Undefined when nothing
 * was collected, so responses to a survey without respondent details look
 * exactly as they did before.
 */
export function respondentToStore(
  questionnaire: Pick<Questionnaire, 'respondent'>,
  details: RespondentDetails | undefined,
): RespondentDetails | undefined {
  const stored: RespondentDetails = {}
  for (const field of activeRespondentFields(questionnaire)) {
    const value = (details?.[field.key] ?? '').trim()
    if (value !== '') stored[field.key] = value
  }
  return Object.keys(stored).length > 0 ? stored : undefined
}

/**
 * Export column heading, e.g. "Respondent name". English whatever language the
 * export is in, like the other fixed columns (`Survey no.`, `Set`, `Choice`);
 * only question headings follow the chosen language.
 */
export function respondentColumn(key: RespondentFieldKey): string {
  return `Respondent ${respondentFieldMeta(key).label.en.toLowerCase()}`
}

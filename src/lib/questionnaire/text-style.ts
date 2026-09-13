import type { LocalizedText, TextAlign, TextStyle } from './types'

export type ResolvedTextStyle = Required<TextStyle>

const ALIGN_CLASS: Record<TextAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
}

export const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify']

/** The style actually shown: the author's choices on top of the element's defaults. */
export function resolveTextStyle(
  style: TextStyle | undefined,
  defaults: TextStyle = {},
): ResolvedTextStyle {
  return {
    bold: style?.bold ?? defaults.bold ?? false,
    italic: style?.italic ?? defaults.italic ?? false,
    underline: style?.underline ?? defaults.underline ?? false,
    align: style?.align ?? defaults.align ?? 'left',
  }
}

/** Tailwind classes for a resolved style. Weight is always set so a default-bold element can be un-bolded. */
export function textStyleClass(style: TextStyle | undefined, defaults: TextStyle = {}): string {
  const resolved = resolveTextStyle(style, defaults)
  return [
    resolved.bold ? 'font-bold' : 'font-normal',
    resolved.italic ? 'italic' : '',
    resolved.underline ? 'underline underline-offset-4' : '',
    ALIGN_CLASS[resolved.align],
  ]
    .filter(Boolean)
    .join(' ')
}

/** Convenience for call sites that hold the whole localized value. */
export function localizedStyleClass(value: LocalizedText | undefined, defaults: TextStyle = {}): string {
  return textStyleClass(value?.style, defaults)
}

/** Sets one style field, dropping it when it matches the default so stored data stays minimal. */
export function updateTextStyle(
  style: TextStyle | undefined,
  patch: TextStyle,
  defaults: TextStyle = {},
): TextStyle | undefined {
  const next: TextStyle = { ...style, ...patch }
  const fallback = resolveTextStyle(undefined, defaults)
  for (const key of Object.keys(next) as (keyof TextStyle)[]) {
    if (next[key] === undefined || next[key] === fallback[key]) delete next[key]
  }
  return Object.keys(next).length > 0 ? next : undefined
}

/**
 * Default look of each kind of text in the rendered form. The builder's
 * toolbars and the renderer both read these so they always agree.
 */
export const FORM_TEXT_DEFAULTS = {
  title: { bold: true } as TextStyle,
  institution: {} as TextStyle,
  description: {} as TextStyle,
  questionLabel: { bold: true } as TextStyle,
  help: {} as TextStyle,
  sectionTitle: { bold: true, align: 'center' } as TextStyle,
  sectionIntro: { align: 'justify' } as TextStyle,
  prompt: { bold: true } as TextStyle,
} as const

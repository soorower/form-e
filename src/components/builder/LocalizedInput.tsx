import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { LANGUAGE_SHORT } from '#/lib/questionnaire/factory'
import { textStyleClass } from '#/lib/questionnaire/text-style'
import type { Lang, LocalizedText, TextStyle } from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'
import { TextStyleToolbar } from './TextStyleToolbar'

interface LocalizedInputProps {
  value: LocalizedText
  onChange: (value: LocalizedText) => void
  languages: Lang[]
  placeholder?: string
  multiline?: boolean
  className?: string
  /**
   * Show the bold / italic / alignment toolbar. The value is how the text
   * looks by default in the rendered form, so the buttons reflect it.
   */
  formatting?: TextStyle
}

/**
 * One text field per enabled language. Bangla fields carry lang="bn" so they
 * pick up the Bangla font and correct glyph shaping. With `formatting`, a
 * toolbar sets the shared style and the fields preview it.
 */
export function LocalizedInput({
  value,
  onChange,
  languages,
  placeholder,
  multiline = false,
  className,
  formatting,
}: LocalizedInputProps) {
  const previewClass = formatting ? textStyleClass(value.style, formatting) : ''

  return (
    <div className={cn('space-y-1.5', className)}>
      {formatting && (
        <TextStyleToolbar
          style={value.style}
          defaults={formatting}
          onChange={(style) => {
            const { style: _previous, ...rest } = value
            onChange(style ? { ...rest, style } : rest)
          }}
        />
      )}
      <div className={cn('grid gap-2', languages.length > 1 && 'sm:grid-cols-2')}>
        {languages.map((lang) => {
          const fieldClass = cn('pl-11', lang === 'bn' && 'font-bangla', previewClass)
          const fieldPlaceholder =
            placeholder && lang === 'bn' ? `${placeholder} (বাংলা)` : placeholder
          const setText = (next: string) => onChange({ ...value, [lang]: next })
          return (
            <div key={lang} className="relative">
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-2 z-10 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground',
                  multiline ? 'top-2.5' : 'top-1/2 -translate-y-1/2',
                )}
              >
                {LANGUAGE_SHORT[lang]}
              </span>
              {multiline ? (
                <Textarea
                  lang={lang}
                  value={value[lang]}
                  placeholder={fieldPlaceholder}
                  className={fieldClass}
                  onChange={(event) => setText(event.target.value)}
                />
              ) : (
                <Input
                  lang={lang}
                  value={value[lang]}
                  placeholder={fieldPlaceholder}
                  className={fieldClass}
                  onChange={(event) => setText(event.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

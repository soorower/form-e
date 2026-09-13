import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Underline,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { resolveTextStyle, updateTextStyle } from '#/lib/questionnaire/text-style'
import type { TextAlign, TextStyle } from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'

interface TextStyleToolbarProps {
  style: TextStyle | undefined
  /** How the element looks with nothing set, so the buttons show the real state. */
  defaults: TextStyle
  onChange: (style: TextStyle | undefined) => void
  className?: string
}

const ALIGN_OPTIONS: { value: TextAlign; label: string; icon: LucideIcon }[] = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Centre', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
]

/** Bold / italic / underline toggles and alignment buttons for one piece of survey text. */
export function TextStyleToolbar({ style, defaults, onChange, className }: TextStyleToolbarProps) {
  const resolved = resolveTextStyle(style, defaults)
  const set = (patch: TextStyle) => onChange(updateTextStyle(style, patch, defaults))

  const toggleClass = (active: boolean) =>
    cn(active && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary')

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className={cn('flex flex-wrap items-center gap-0.5', className)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Bold"
        aria-pressed={resolved.bold}
        className={toggleClass(resolved.bold)}
        onClick={() => set({ bold: !resolved.bold })}
      >
        <Bold />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Italic"
        aria-pressed={resolved.italic}
        className={toggleClass(resolved.italic)}
        onClick={() => set({ italic: !resolved.italic })}
      >
        <Italic />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Underline"
        aria-pressed={resolved.underline}
        className={toggleClass(resolved.underline)}
        onClick={() => set({ underline: !resolved.underline })}
      >
        <Underline />
      </Button>
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      {ALIGN_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-pressed={resolved.align === value}
          className={toggleClass(resolved.align === value)}
          onClick={() => set({ align: value })}
        >
          <Icon />
        </Button>
      ))}
    </div>
  )
}

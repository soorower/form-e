import { useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { LANGUAGES, LANGUAGE_LABELS, formatSurveyNumber } from '#/lib/questionnaire/factory'
import { FORM_TEXT_DEFAULTS } from '#/lib/questionnaire/text-style'
import type { Lang, Questionnaire } from '#/lib/questionnaire/types'
import { LocalizedInput } from './LocalizedInput'

interface FormSettingsProps {
  questionnaire: Questionnaire
  onChange: (patch: Partial<Questionnaire>) => void
}

const MAX_LOGO_EDGE = 480
const KEEP_ORIGINAL_UNDER_BYTES = 120_000

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image failed to load'))
    image.src = src
  })
}

/** Downscale large logos so the data URL stays small enough to store inline. */
async function fileToLogo(file: File): Promise<string> {
  const original = await readAsDataUrl(file)
  const image = await loadImage(original)
  const scale = Math.min(1, MAX_LOGO_EDGE / Math.max(image.width, image.height))
  if (scale === 1 && file.size <= KEEP_ORIGINAL_UNDER_BYTES) return original
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return original
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export function FormSettings({ questionnaire, onChange }: FormSettingsProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const { languages, defaultLanguage } = questionnaire

  function toggleLanguage(lang: Lang, enabled: boolean) {
    const next = enabled
      ? LANGUAGES.filter((l) => l === lang || languages.includes(l))
      : languages.filter((l) => l !== lang)
    if (next.length === 0) return
    onChange({
      languages: next,
      defaultLanguage: next.includes(defaultLanguage) ? defaultLanguage : next[0],
    })
  }

  async function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file.')
      return
    }
    try {
      onChange({ logo: await fileToLogo(file) })
      setLogoError(null)
    } catch {
      setLogoError('That image could not be read.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Survey details</CardTitle>
        <CardDescription>
          The logo, title, institution, and languages respondents see at the top of the form.
          Use the toolbar above a field to make it bold, italic, or centred.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex flex-wrap items-center gap-4">
            {questionnaire.logo ? (
              <img
                src={questionnaire.logo}
                alt="Survey logo"
                className="h-16 w-auto max-w-40 rounded-lg border border-border bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                <ImagePlus className="size-5" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <ImagePlus data-icon="inline-start" />
                {questionnaire.logo ? 'Replace logo' : 'Upload logo'}
              </Button>
              {questionnaire.logo && (
                <Button type="button" variant="ghost" onClick={() => onChange({ logo: null })}>
                  <X data-icon="inline-start" />
                  Remove
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleLogo}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, or SVG. Large images are resized to fit the form header.
          </p>
          {logoError && <p className="text-xs text-destructive">{logoError}</p>}
        </div>

        <div className="space-y-2">
          <Label>Languages</Label>
          <div className="flex flex-wrap gap-5">
            {LANGUAGES.map((lang) => (
              <Label key={lang} lang={lang} className="cursor-pointer font-normal">
                <Checkbox
                  checked={languages.includes(lang)}
                  onCheckedChange={(checked) => toggleLanguage(lang, checked)}
                />
                {LANGUAGE_LABELS[lang]}
              </Label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Turn on বাংলা to write every question in Bangla alongside English. Respondents
            can switch between the enabled languages while filling in the form.
          </p>
        </div>

        {languages.length > 1 && (
          <div className="space-y-2">
            <Label>Default language</Label>
            <Select
              value={defaultLanguage}
              onValueChange={(value) => value && onChange({ defaultLanguage: value })}
              items={LANGUAGE_LABELS}
            >
              <SelectTrigger className="w-44" aria-label="Default language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang} value={lang} lang={lang}>
                    {LANGUAGE_LABELS[lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Title</Label>
          <LocalizedInput
            value={questionnaire.title}
            onChange={(title) => onChange({ title })}
            languages={languages}
            placeholder="Survey title"
            formatting={FORM_TEXT_DEFAULTS.title}
          />
        </div>

        <div className="space-y-2">
          <Label>
            Institution <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <LocalizedInput
            value={questionnaire.institution}
            onChange={(institution) => onChange({ institution })}
            languages={languages}
            placeholder="Department, university, or organisation"
            formatting={FORM_TEXT_DEFAULTS.institution}
          />
        </div>

        <div className="space-y-2">
          <Label>
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <LocalizedInput
            multiline
            value={questionnaire.description}
            onChange={(description) => onChange({ description })}
            languages={languages}
            placeholder="What this survey is for and how long it takes"
            formatting={FORM_TEXT_DEFAULTS.description}
          />
        </div>

        <div className="space-y-6 border-t border-border pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={questionnaire.teamName}
                onChange={(event) => onChange({ teamName: event.target.value })}
                placeholder="Sylhet field team"
              />
              <p className="text-xs text-muted-foreground">
                One survey has one team. The dashboard shows its progress, leaderboard, and chat.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="response-target">Response target</Label>
              <Input
                id="response-target"
                type="number"
                min={0}
                value={questionnaire.responseTarget || ''}
                onChange={(event) =>
                  onChange({ responseTarget: Math.max(0, Number(event.target.value) || 0) })
                }
                placeholder="500"
                className="w-40"
              />
              <p className="text-xs text-muted-foreground">
                Total responses the team is aiming for. Leave empty for no target.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="survey-prefix">Survey number prefix</Label>
            <Input
              id="survey-prefix"
              value={questionnaire.surveyCodePrefix}
              onChange={(event) => onChange({ surveyCodePrefix: event.target.value })}
              placeholder="ACBUS-"
              className="w-56"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Every response gets the next number on the tablet that collected it:{' '}
              <span className="font-mono">
                {formatSurveyNumber(questionnaire.surveyCodePrefix, 1)}
              </span>
              ,{' '}
              <span className="font-mono">
                {formatSurveyNumber(questionnaire.surveyCodePrefix, 2)}
              </span>
              , … The number and the enumerator are saved with each response.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Team members (enumerators)</Label>
            <div className="space-y-2">
              {questionnaire.enumerators.map((name, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={name}
                    aria-label={`Team member ${index + 1}`}
                    placeholder="Name"
                    className="max-w-sm"
                    onChange={(event) =>
                      onChange({
                        enumerators: questionnaire.enumerators.map((n, i) =>
                          i === index ? event.target.value : n,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove team member ${index + 1}`}
                    onClick={() =>
                      onChange({
                        enumerators: questionnaire.enumerators.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ enumerators: [...questionnaire.enumerators, ''] })}
            >
              <Plus data-icon="inline-start" />
              Add team member
            </Button>
            <p className="text-xs text-muted-foreground">
              Enumerators pick their name on the tablet before the first form; the tablet
              remembers it. Leave the list empty to let them type a name instead.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

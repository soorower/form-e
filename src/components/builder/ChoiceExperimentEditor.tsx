import { useRef, useState, type ChangeEvent } from 'react'
import { FileUp, Languages, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import {
  EXAMPLE_CARD_TABLE,
  EXAMPLE_PROFILE_CARD_TABLE,
  applyTranslationTable,
  attributeLevels,
  columnKey,
  parseCardTable,
} from '#/lib/questionnaire/cards'
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  defaultChoiceOptions,
  pickText,
  text,
  uid,
} from '#/lib/questionnaire/factory'
import { FORM_TEXT_DEFAULTS } from '#/lib/questionnaire/text-style'
import type { ChoiceExperimentQuestion, Lang, LocalizedText } from '#/lib/questionnaire/types'
import { LocalizedInput } from './LocalizedInput'

interface ChoiceExperimentEditorProps {
  question: ChoiceExperimentQuestion
  languages: Lang[]
  onChange: (patch: Partial<ChoiceExperimentQuestion>) => void
}

export function ChoiceExperimentEditor({ question, languages, onChange }: ChoiceExperimentEditorProps) {
  const hasCards = question.cards.length > 0
  const [pasted, setPasted] = useState('')
  const [showImport, setShowImport] = useState(!hasCards)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const translationFileInput = useRef<HTMLInputElement>(null)
  const [showTranslate, setShowTranslate] = useState(false)
  const [translation, setTranslation] = useState('')
  const [translateLang, setTranslateLang] = useState<Lang>('bn')

  function applyTranslation(source: string) {
    try {
      const result = applyTranslationTable(question, source, translateLang)
      onChange({ levelLabels: result.levelLabels, attributes: result.attributes })
      const parts = [
        `Filled ${LANGUAGE_LABELS[translateLang]} wording for ${result.translated} ${
          result.translated === 1 ? 'level' : 'levels'
        } from ${result.matchedCards} matching ${result.matchedCards === 1 ? 'card' : 'cards'}.`,
      ]
      if (result.attributeLabelsFilled > 0) {
        parts.push(`Set ${result.attributeLabelsFilled} attribute row labels from the header.`)
      }
      if (result.unmatchedSets.length > 0) {
        parts.push(
          `Ignored ${result.unmatchedSets.length} rows whose card number is not among the imported cards (${result.unmatchedSets.slice(0, 8).join(', ')}${result.unmatchedSets.length > 8 ? ', …' : ''}).`,
        )
      }
      if (result.conflicts.length > 0) {
        parts.push(
          `${result.conflicts.length} levels were translated two different ways; the first wording was kept: ${result.conflicts.slice(0, 5).join('; ')}.`,
        )
      }
      setNotice(parts.join(' '))
      setError(null)
      setTranslation('')
      setShowTranslate(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The translation could not be read.')
    }
  }

  async function handleTranslationFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    applyTranslation(await file.text())
  }

  function importCards(source: string) {
    try {
      const design = parseCardTable(source, question)
      onChange({
        layout: design.layout,
        attributes: design.attributes,
        alternatives: design.alternatives,
        cards: design.cards,
        choiceOptions:
          question.choiceOptions.length > 0 ? question.choiceOptions : defaultChoiceOptions(),
        scenariosPerRespondent: Math.max(
          1,
          Math.min(question.scenariosPerRespondent, design.cards.length),
        ),
      })
      const summary =
        design.layout === 'profile'
          ? `Imported ${design.cards.length} cards with ${design.attributes.length} attributes. Each card describes one option; respondents answer the choice question below it.`
          : `Imported ${design.cards.length} cards with ${design.attributes.length} attributes and ${design.alternatives.length} alternatives side by side.`
      const ignored =
        design.ignoredColumns.length > 0
          ? ` Ignored columns: ${design.ignoredColumns.join(', ')}.`
          : ''
      setNotice(summary + ignored)
      setError(null)
      setPasted('')
      setShowImport(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The cards could not be read.')
      setNotice(null)
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    importCards(await file.text())
  }

  function clearCards() {
    onChange({ cards: [], attributes: [], alternatives: [] })
    setNotice(null)
    setError(null)
    setShowImport(true)
  }

  function setAlternativeLabel(key: string, label: LocalizedText) {
    onChange({
      alternatives: question.alternatives.map((a) => (a.key === key ? { ...a, label } : a)),
    })
  }

  function setAttributeLabel(key: string, label: LocalizedText) {
    onChange({
      attributes: question.attributes.map((a) => (a.key === key ? { ...a, label } : a)),
    })
  }

  function setLevelLabel(raw: string, label: LocalizedText) {
    onChange({ levelLabels: { ...question.levelLabels, [raw]: label } })
  }

  function setReferenceColumn(key: string, patch: { label?: LocalizedText; text?: LocalizedText }) {
    onChange({
      referenceColumns: question.referenceColumns.map((column) =>
        column.key === key ? { ...column, ...patch } : column,
      ),
    })
  }

  function addReferenceColumn() {
    onChange({
      referenceColumns: [
        ...question.referenceColumns,
        {
          key: uid(),
          label: text('Your current option', 'আপনার বর্তমান বিকল্প'),
          text: text('As now', 'পূর্বের ন্যায়'),
        },
      ],
    })
  }

  function removeReferenceColumn(key: string) {
    onChange({ referenceColumns: question.referenceColumns.filter((c) => c.key !== key) })
  }

  function setChoiceOption(key: string, label: LocalizedText) {
    onChange({
      choiceOptions: question.choiceOptions.map((o) => (o.key === key ? { ...o, label } : o)),
    })
  }

  function addChoiceOption() {
    const key = `option-${question.choiceOptions.length + 1}-${uid().slice(0, 4)}`
    onChange({ choiceOptions: [...question.choiceOptions, { key, label: text() }] })
  }

  function removeChoiceOption(key: string) {
    onChange({ choiceOptions: question.choiceOptions.filter((o) => o.key !== key) })
  }

  const isProfile = question.layout === 'profile'
  const cardAlternative = question.alternatives[0]

  // Same order as the pasted header: every attribute of A, then every attribute of B, …
  const columns = question.alternatives.flatMap((alternative) =>
    question.attributes.map((attribute) => columnKey(question, attribute.key, alternative.key)),
  )

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Design cards</Label>
          {hasCards && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{question.cards.length} cards</Badge>
              <Badge variant="secondary">{question.attributes.length} attributes</Badge>
              <Badge variant="secondary">{question.alternatives.length} alternatives</Badge>
            </div>
          )}
        </div>

        {hasCards && (
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8">Set</TableHead>
                  {columns.map((column) => (
                    <TableHead key={column} className="h-8 font-mono">
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {question.cards.map((card) => (
                  <TableRow key={card.set} className="hover:bg-transparent">
                    <TableCell className="py-1 font-medium tabular-nums">{card.set}</TableCell>
                    {columns.map((column) => (
                      <TableCell key={column} className="py-1 whitespace-pre-line">
                        {card.levels[column] ?? ''}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}

        {showImport ? (
          <div className="space-y-2">
            <Textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={
                'Paste the card table from Excel or R. First row is the header:\nSet\tTime_A\tCost_A\tTime_B\tCost_B\n1\t5 Hours\t1800 Taka\t7 Hours\t1250 Taka'
              }
              className="min-h-32 font-mono text-xs"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pasted.trim() === ''}
                onClick={() => importCards(pasted)}
              >
                <Upload data-icon="inline-start" />
                Import cards
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <FileUp data-icon="inline-start" />
                Upload CSV
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPasted(EXAMPLE_CARD_TABLE)}
              >
                <Sparkles data-icon="inline-start" />
                Example: A vs B
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPasted(EXAMPLE_PROFILE_CARD_TABLE)}
              >
                <Sparkles data-icon="inline-start" />
                Example: one option per card
              </Button>
              {hasCards && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowImport(false)}>
                  Cancel
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              onChange={handleFile}
            />
            <p className="text-xs text-muted-foreground">
              Two layouts are recognised from the header. Columns named{' '}
              <span className="font-mono">Attribute_Alternative</span> (
              <span className="font-mono">Cost_A</span>, <span className="font-mono">Cost_B</span>)
              put alternatives side by side and respondents pick one. Plain columns (
              <span className="font-mono">Distance</span>, <span className="font-mono">Parking</span>)
              make each card one option, shown beside a comparison column such as “your current
              destination”, and respondents answer Yes / No. A{' '}
              <span className="font-mono">Set</span> or <span className="font-mono">Card ID</span>{' '}
              column numbers the cards. Cells may hold several lines.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowImport(true)}>
                <Upload data-icon="inline-start" />
                Replace cards
              </Button>
              <Button
                type="button"
                variant={showTranslate ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowTranslate((open) => !open)}
              >
                <Languages data-icon="inline-start" />
                Paste translated table
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={clearCards}
              >
                <Trash2 data-icon="inline-start" />
                Remove cards
              </Button>
            </div>
            {showTranslate && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-muted-foreground">This table is in</Label>
                  <Select
                    value={translateLang}
                    onValueChange={(value) => value && setTranslateLang(value)}
                    items={LANGUAGE_LABELS}
                  >
                    <SelectTrigger size="sm" className="w-32" aria-label="Translation language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang} lang={lang}>
                          {LANGUAGE_LABELS[lang]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={translation}
                  onChange={(event) => setTranslation(event.target.value)}
                  placeholder={
                    'Paste the same card table, translated (for example the Bangla sheet):\nকার্ড নং\tবাসস্থান থেকে দূরত্ব\tপার্কিং সুবিধা\n1\t৫ থেকে ৮ কিমি\tবিনামূল্যে'
                  }
                  className="min-h-32 font-mono text-xs"
                  spellCheck={false}
                  aria-label="Translated card table"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={translation.trim() === ''}
                    onClick={() => applyTranslation(translation)}
                  >
                    <Languages data-icon="inline-start" />
                    Fill level wording
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => translationFileInput.current?.click()}
                  >
                    <FileUp data-icon="inline-start" />
                    Upload CSV
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowTranslate(false)}>
                    Cancel
                  </Button>
                </div>
                <input
                  ref={translationFileInput}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                  className="sr-only"
                  onChange={handleTranslationFile}
                />
                <p className="text-xs text-muted-foreground">
                  Rows are matched by card number and columns by name, or by position when the
                  header is translated. Each translated cell becomes the wording for its English
                  level, and a translated header fills empty attribute row labels. Nothing is
                  translated automatically.
                </p>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {hasCards && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`scenarios-${question.id}`}>Scenarios per respondent</Label>
            <Input
              id={`scenarios-${question.id}`}
              type="number"
              min={1}
              max={question.cards.length}
              value={question.scenariosPerRespondent}
              className="w-28"
              onChange={(event) => {
                const next = Number(event.target.value)
                if (!Number.isInteger(next)) return
                onChange({
                  scenariosPerRespondent: Math.max(1, Math.min(next, question.cards.length)),
                })
              }}
            />
            <p className="text-xs text-muted-foreground">
              Each respondent is shown this many cards, drawn at random without repeats from the{' '}
              {question.cards.length} imported. The set numbers shown are saved with the answers.
            </p>
            <Label className="cursor-pointer gap-3 pt-1 font-normal">
              <Switch
                checked={question.drawMode === 'balanced'}
                onCheckedChange={(balanced) =>
                  onChange({ drawMode: balanced ? 'balanced' : 'random' })
                }
              />
              Balance card usage across respondents
            </Label>
            <p className="text-xs text-muted-foreground">
              When on, each tablet draws the cards shown the fewest times so far, so every card
              ends up used about equally, like a pre-allocated frequency sheet. Off draws at random.
            </p>
          </div>

          <div className="space-y-2">
            <Label>First column heading</Label>
            <LocalizedInput
              value={question.attributeHeader}
              onChange={(attributeHeader) => onChange({ attributeHeader })}
              languages={languages}
              placeholder="Attributes"
            />
          </div>

          {isProfile ? (
            <>
              <div className="space-y-2">
                <Label>Card column heading</Label>
                {cardAlternative && (
                  <LocalizedInput
                    value={cardAlternative.label}
                    onChange={(label) => setAlternativeLabel(cardAlternative.key, label)}
                    languages={languages}
                    placeholder="Proposed option"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Heading above the column that shows the card, for example “Future facilities”.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Comparison columns</Label>
                <div className="space-y-3">
                  {question.referenceColumns.map((column, index) => (
                    <div key={column.key} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="flex items-start gap-2">
                        <LocalizedInput
                          className="min-w-0 flex-1"
                          value={column.label}
                          onChange={(label) => setReferenceColumn(column.key, { label })}
                          languages={languages}
                          placeholder={`Column ${index + 1} heading`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove comparison column ${index + 1}`}
                          onClick={() => removeReferenceColumn(column.key)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <LocalizedInput
                        value={column.text}
                        onChange={(value) => setReferenceColumn(column.key, { text: value })}
                        languages={languages}
                        placeholder="Text shown down the column, e.g. “As now” (may be empty)"
                      />
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addReferenceColumn}>
                  <Plus data-icon="inline-start" />
                  Add comparison column
                </Button>
                <p className="text-xs text-muted-foreground">
                  Fixed columns shown beside the card, such as “your current shopping destination”.
                  Their text spans every attribute row.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Alternative headings</Label>
              <div className="space-y-2">
                {question.alternatives.map((alternative) => (
                  <div key={alternative.key} className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-2 w-10 justify-center font-mono">
                      {alternative.key}
                    </Badge>
                    <LocalizedInput
                      className="min-w-0 flex-1"
                      value={alternative.label}
                      onChange={(label) => setAlternativeLabel(alternative.key, label)}
                      languages={languages}
                      placeholder="Option name"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Attribute row labels</Label>
            <div className="space-y-2">
              {question.attributes.map((attribute) => (
                <div key={attribute.key} className="flex items-start gap-2">
                  <Badge
                    variant="outline"
                    className="mt-2 max-w-40 justify-center truncate font-mono"
                    title={attribute.key}
                  >
                    {attribute.key}
                  </Badge>
                  <LocalizedInput
                    className="min-w-0 flex-1"
                    value={attribute.label}
                    onChange={(label) => setAttributeLabel(attribute.key, label)}
                    languages={languages}
                    placeholder="Row label"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Level wording</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                How each value from the cards is shown to respondents. Leave a field empty to show
                the value exactly as imported.
              </p>
            </div>
            {question.attributes.map((attribute) => {
              const levels = attributeLevels(question, attribute.key)
              if (levels.length === 0) return null
              return (
                <div key={attribute.key} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">
                    {pickText(attribute.label, 'en') || attribute.key}
                  </p>
                  {levels.map((raw) => (
                    <div key={raw} className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                      <span
                        className="truncate pt-2 font-mono text-xs text-muted-foreground"
                        title={raw}
                      >
                        {raw.replace(/\n/g, ' ⏎ ')}
                      </span>
                      <LocalizedInput
                        multiline={raw.includes('\n')}
                        value={question.levelLabels[raw] ?? text()}
                        onChange={(label) => setLevelLabel(raw, label)}
                        languages={languages}
                        placeholder={raw.replace(/\n/g, ' / ')}
                      />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Choice question</Label>
        <LocalizedInput
          value={question.prompt}
          onChange={(prompt) => onChange({ prompt })}
          languages={languages}
          placeholder="Which option would you choose?"
          formatting={FORM_TEXT_DEFAULTS.prompt}
        />
        <p className="text-xs text-muted-foreground">
          Asked under every scenario table. Each scenario gets its own question number.
        </p>
        {isProfile && (
          <div className="space-y-2 pt-2">
            <Label>Answer options</Label>
            <div className="space-y-2">
              {question.choiceOptions.map((option, index) => (
                <div key={option.key} className="flex items-start gap-2">
                  <span className="w-6 shrink-0 pt-2 text-right text-xs tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  <LocalizedInput
                    className="min-w-0 flex-1"
                    value={option.label}
                    onChange={(label) => setChoiceOption(option.key, label)}
                    languages={languages}
                    placeholder={`Answer ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove answer ${index + 1}`}
                    disabled={question.choiceOptions.length <= 2}
                    onClick={() => removeChoiceOption(option.key)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addChoiceOption}>
              <Plus data-icon="inline-start" />
              Add answer
            </Button>
            <p className="text-xs text-muted-foreground">
              The buttons under each scenario, usually Yes / No. The English wording is what
              appears in the Choice column of exports.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

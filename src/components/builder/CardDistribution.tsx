import { useRef, useState, type ChangeEvent } from 'react'
import { useQuery } from 'convex/react'
import { ChevronDown, ChevronUp, FileUp, Sparkles, Trash2, Upload } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { useConvexReady } from '#/lib/convex/hooks'
import { cardPlan, type CardPlan } from '#/lib/questionnaire/cards'
import {
  EXAMPLE_SCENARIO_PLAN,
  checkScenarioPlan,
  parseScenarioPlan,
} from '#/lib/questionnaire/scenario-plan'
import type { CardDrawMode, ChoiceExperimentQuestion } from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'

/** The survey a block belongs to: its fixed target and how to change it. */
export interface SurveyTarget {
  id: string
  responseTarget: number
  onResponseTargetChange: (responseTarget: number) => void
}

interface CardDistributionProps {
  question: ChoiceExperimentQuestion
  /** Left out where the block is edited away from a saved survey. */
  survey?: SurveyTarget
  onChange: (patch: Partial<ChoiceExperimentQuestion>) => void
}

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

const MODE_LABELS: Record<CardDrawMode, string> = {
  balanced: 'Show every card equally often',
  random: 'Draw cards at random',
  plan: 'Follow my scenario plan',
}

const list = (values: number[], limit = 12) =>
  `${values.slice(0, limit).join(', ')}${values.length > limit ? ', …' : ''}`

/**
 * How a block's cards are shared out: the survey target first, then how many
 * cards each respondent sees, then which of the three ways the cards are
 * handed out, with the resulting plan and the usage so far.
 */
export function CardDistribution({ question, survey, onChange }: CardDistributionProps) {
  const mode: CardDrawMode = question.drawMode ?? 'random'
  const usesPlan = mode === 'plan'
  const balanced = mode === 'balanced'
  const plan = survey ? cardPlan(survey.responseTarget, question) : null
  const planRows = question.scenarioPlan ?? []

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium">Card distribution</p>
        <p className="text-xs text-muted-foreground">
          Fix the survey target first; the cards are then shared out over that many responses —
          by the app, or by your own scenario plan.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {survey && (
          <div className="space-y-2">
            <Label htmlFor={`target-${question.id}`}>1. Total survey target</Label>
            <Input
              id={`target-${question.id}`}
              type="number"
              min={0}
              value={survey.responseTarget || ''}
              placeholder="500"
              className="w-40"
              onChange={(event) =>
                survey.onResponseTargetChange(
                  Math.max(0, Math.floor(Number(event.target.value) || 0)),
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Responses the whole survey is after. The same number as “Response target” in the
              survey settings and on the dashboard.
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={`scenarios-${question.id}`}>
            {survey ? '2. ' : ''}Scenarios per respondent
          </Label>
          <Input
            id={`scenarios-${question.id}`}
            type="number"
            min={1}
            max={question.cards.length}
            // The plan's rows decide this; changing it by hand would put the
            // question numbering out of step with what the plan hands out.
            disabled={usesPlan && planRows.length > 0}
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
            {usesPlan && planRows.length > 0
              ? 'Set by the scenario plan: the number of cards its longest row names.'
              : `Each respondent is shown this many of the ${question.cards.length} cards, never the
                 same one twice. The set numbers shown are saved with the answers.`}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`draw-mode-${question.id}`}>{survey ? '3. ' : ''}How cards are handed out</Label>
        <Select
          value={mode}
          onValueChange={(value) => value && onChange({ drawMode: value as CardDrawMode })}
          items={MODE_LABELS}
        >
          <SelectTrigger id={`draw-mode-${question.id}`} className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['balanced', 'random', 'plan'] as CardDrawMode[]).map((option) => (
              <SelectItem key={option} value={option}>
                {MODE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {balanced &&
            'Each new interview is handed the cards used least so far, counted across all tablets, including interviews still going on. The most-used and the least-used card never differ by more than one showing.'}
          {mode === 'random' &&
            'Cards are drawn at random, so some will come up more often than others.'}
          {usesPlan &&
            'Nothing is drawn: you decide which cards go together. Paste the scenario sheet you already build in Excel or R, and each interview is given the row used least so far — so the rows are worked through evenly across all tablets.'}
        </p>
      </div>

      {usesPlan && <ScenarioPlanPanel question={question} onChange={onChange} />}
      {balanced && <PlanSummary plan={plan} question={question} hasSurvey={!!survey} />}
      {survey && (
        <CardUsage
          question={question}
          surveyId={survey.id}
          plan={balanced ? plan : null}
          showPlanRows={usesPlan && planRows.length > 0}
        />
      )}
    </div>
  )
}

/**
 * The scenario plan itself: paste or upload the sheet, then the rows as they
 * were read, with what the plan adds up to. Nothing here is validated against
 * the cards as an error — a plan is the creator's own allocation — but set
 * numbers with no card, and cards the plan never shows, are pointed out.
 */
function ScenarioPlanPanel({
  question,
  onChange,
}: {
  question: ChoiceExperimentQuestion
  onChange: (patch: Partial<ChoiceExperimentQuestion>) => void
}) {
  const rows = question.scenarioPlan ?? []
  const [pasted, setPasted] = useState('')
  const [showImport, setShowImport] = useState(rows.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showRows, setShowRows] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function importPlan(source: string) {
    try {
      const parsed = parseScenarioPlan(source)
      onChange({
        scenarioPlan: parsed.rows,
        // The plan decides how many scenarios an interview holds, and question
        // numbering counts from it, so the two are set together.
        scenariosPerRespondent: Math.max(1, parsed.scenariosPerRow),
      })
      const messages = [
        `Read ${count(parsed.rows.length, 'row', 'rows')} of up to ${count(parsed.scenariosPerRow, 'card', 'cards')} each.`,
      ]
      if (!parsed.hadRowColumn) {
        messages.push('No row-number column was found, so the rows are numbered in the order pasted.')
      }
      if (parsed.skippedRows.length > 0) {
        messages.push(`Skipped ${count(parsed.skippedRows.length, 'row', 'rows')} that held no card numbers.`)
      }
      setNotice(messages.join(' '))
      setError(null)
      setPasted('')
      setShowImport(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The scenario plan could not be read.')
      setNotice(null)
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    importPlan(await file.text())
  }

  const check = checkScenarioPlan(question)
  const perCard = [...check.usage.values()]
  const least = perCard.length > 0 ? Math.min(...perCard) : 0
  const most = perCard.length > 0 ? Math.max(...perCard) : 0

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm">Scenario plan</Label>
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{count(rows.length, 'row', 'rows')}</Badge>
            <Badge variant="secondary">{count(check.showings, 'card showing', 'card showings')}</Badge>
          </div>
        )}
      </div>

      {showImport ? (
        <div className="space-y-2">
          <Textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={
              'Paste the scenario sheet from Excel. First column numbers the rows, the rest are card numbers:\nSet\tScenario1\tScenario2\tScenario3\n1\t14\t21\t25\n2\t50\t29\t30'
            }
            className="min-h-32 font-mono text-xs"
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pasted.trim() === ''}
              onClick={() => importPlan(pasted)}
            >
              <Upload data-icon="inline-start" />
              Import plan
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUp data-icon="inline-start" />
              Upload CSV
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPasted(EXAMPLE_SCENARIO_PLAN)}
            >
              <Sparkles data-icon="inline-start" />
              Example
            </Button>
            {rows.length > 0 && (
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
            One row per respondent group. The first column is that row&apos;s number (headed{' '}
            <span className="font-mono">Set</span>, <span className="font-mono">Respondent</span>,{' '}
            <span className="font-mono">Row</span>, …); every other cell is a card{' '}
            <span className="font-mono">Set</span> number from the design cards above. A row may
            name the same card twice. Tab- or comma-separated, so a paste from Excel and a saved
            CSV both work.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload data-icon="inline-start" />
            Replace plan
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showRows}
            onClick={() => setShowRows((open) => !open)}
          >
            {showRows ? <ChevronUp data-icon="inline-start" /> : <ChevronDown data-icon="inline-start" />}
            {showRows ? 'Hide rows' : 'Show rows'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              onChange({ scenarioPlan: [] })
              setNotice(null)
              setError(null)
              setShowImport(true)
            }}
          >
            <Trash2 data-icon="inline-start" />
            Remove plan
          </Button>
        </div>
      )}

      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {rows.length === 0 && !showImport && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          No plan has been imported yet, so this block still draws its cards at random. Import the
          sheet, or pick another way of handing cards out.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-1.5 text-xs">
          <p>
            Over the whole plan each card comes up{' '}
            <strong>{least === most ? count(least, 'time', 'times') : `${least}–${most} times`}</strong>
            {check.usage.size > 0 && ` across ${count(check.usage.size, 'card', 'cards')}`}.
          </p>
          {check.unknownSets.length > 0 && (
            <p className="text-amber-700 dark:text-amber-300">
              The plan names {count(check.unknownSets.length, 'card number', 'card numbers')} with no
              matching design card ({list(check.unknownSets)}). Those are skipped, so those
              respondents see fewer scenarios.
            </p>
          )}
          {check.unusedSets.length > 0 && (
            <p className="text-muted-foreground">
              {count(check.unusedSets.length, 'card', 'cards')} never appear in the plan (
              {list(check.unusedSets)}).
            </p>
          )}
          {check.unevenRows.length > 0 && (
            <p className="text-muted-foreground">
              {count(check.unevenRows.length, 'row', 'rows')} name fewer cards than the longest row (
              {list(check.unevenRows)}); those respondents answer fewer scenarios.
            </p>
          )}
          {check.rowsWithRepeats.length > 0 && (
            <p className="text-muted-foreground">
              {count(check.rowsWithRepeats.length, 'row', 'rows')} show the same card twice (
              {list(check.rowsWithRepeats)}), as the sheet says.
            </p>
          )}
        </div>
      )}

      {showRows && rows.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-lg border border-border bg-card">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8">Row</TableHead>
                <TableHead className="h-8">Cards shown, in order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.row} className="hover:bg-transparent">
                  <TableCell className="py-1 font-medium tabular-nums">{row.row}</TableCell>
                  <TableCell className="py-1 font-mono tabular-nums">{row.sets.join(', ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function PlanSummary({
  plan,
  question,
  hasSurvey,
}: {
  plan: CardPlan | null
  question: ChoiceExperimentQuestion
  hasSurvey: boolean
}) {
  if (!plan) {
    if (!hasSurvey) return null
    return (
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        Enter the total survey target to see how often each card will be shown. Cards are kept
        level without it too, but there is no planned number to check them against.
      </p>
    )
  }
  const cards = question.cards.length
  return (
    <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm">
      <span className="font-medium">Plan:</span> {plan.showings.toLocaleString()} card showings
      over {count(cards, 'card', 'cards')}.{' '}
      {plan.extraCards === 0 ? (
        <>
          Every card is shown exactly <strong>{count(plan.perCard, 'time', 'times')}</strong>.
        </>
      ) : (
        <>
          {count(cards - plan.extraCards, 'card is', 'cards are')} shown{' '}
          <strong>{count(plan.perCard, 'time', 'times')}</strong> and{' '}
          {count(plan.extraCards, 'card', 'cards')}{' '}
          <strong>{count(plan.perCard + 1, 'time', 'times')}</strong>, because the showings do not
          divide evenly.
        </>
      )}
    </p>
  )
}

/** Live counts: how often each card has come up in recorded responses. */
function CardUsage({
  question,
  surveyId,
  plan,
  showPlanRows,
}: {
  question: ChoiceExperimentQuestion
  surveyId: string
  plan: CardPlan | null
  /** Also show how many respondents each scenario-plan row has been given. */
  showPlanRows: boolean
}) {
  const ready = useConvexReady()
  const exposure = useQuery(api.responses.cardExposure, ready ? { questionnaireId: surveyId } : 'skip')
  const [open, setOpen] = useState(false)
  if (exposure === undefined) return null

  const usage = new Map(
    exposure.cards.filter((row) => row.questionId === question.id).map((row) => [row.set, row]),
  )
  const cards = question.cards.map((card) => ({
    set: card.set,
    shown: usage.get(card.set)?.count ?? 0,
    reserved: usage.get(card.set)?.reserved ?? 0,
  }))
  const shown = cards.map((card) => card.shown)
  const total = shown.reduce((sum, n) => sum + n, 0)
  const inProgress = cards.reduce((sum, card) => sum + card.reserved, 0)
  if (total === 0 && inProgress === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No card has been shown yet. Usage per card appears here once responses come in.
      </p>
    )
  }
  const least = Math.min(...shown)
  const most = Math.max(...shown)
  // With a remainder in the plan some cards end one above the others.
  const planned = plan
    ? plan.extraCards > 0
      ? `${plan.perCard}–${plan.perCard + 1}`
      : String(plan.perCard)
    : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">So far:</span>
        <span>{count(total, 'showing', 'showings')} recorded</span>
        <Badge variant={most - least <= 1 ? 'secondary' : 'outline'}>
          least {least} · most {most}
        </Badge>
        {inProgress > 0 && (
          <span className="text-muted-foreground">
            + {count(inProgress, 'card', 'cards')} in interviews going on now
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp data-icon="inline-start" /> : <ChevronDown data-icon="inline-start" />}
          {open ? 'Hide cards' : 'Show each card'}
        </Button>
      </div>
      {most - least > 1 && !showPlanRows && (
        <p className="text-xs text-muted-foreground">
          The gap is wider than one because of responses collected before balancing was on (or
          on a tablet without a connection). New interviews get the least-used cards until it
          closes.
        </p>
      )}
      {showPlanRows && <PlanRowUsage question={question} exposure={exposure.planRows} />}
      {open && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5">
          {cards.map((card) => (
            <li
              key={card.set}
              className={cn(
                'flex items-baseline justify-between gap-2 rounded-md border border-border px-2 py-1 text-xs tabular-nums',
                card.shown === least && most > least && 'border-primary/40 bg-primary/5',
              )}
            >
              <span className="text-muted-foreground">#{card.set}</span>
              <span className="font-medium">
                {card.shown}
                {planned !== null && <span className="font-normal text-muted-foreground"> / {planned}</span>}
                {card.reserved > 0 && <span className="font-normal text-muted-foreground"> +{card.reserved}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** How many respondents each row of the scenario plan has been given so far. */
function PlanRowUsage({
  question,
  exposure,
}: {
  question: ChoiceExperimentQuestion
  exposure: { questionId: string; row: number; count: number; reserved: number }[]
}) {
  const rows = question.scenarioPlan ?? []
  const used = new Map(
    exposure.filter((row) => row.questionId === question.id).map((row) => [row.row, row]),
  )
  const counts = rows.map((row) => used.get(row.row)?.count ?? 0)
  if (counts.length === 0) return null
  const done = counts.filter((n) => n > 0).length
  const held = rows.reduce((sum, row) => sum + (used.get(row.row)?.reserved ?? 0), 0)
  return (
    <p className="text-xs text-muted-foreground">
      {count(done, 'plan row', 'plan rows')} of {rows.length} have been used at least once; each row
      has gone out {Math.min(...counts)}–{Math.max(...counts)} times
      {held > 0 && `, with ${count(held, 'row', 'rows')} held by interviews going on now`}. Rows are
      handed out least-used first, so they even out as the survey runs.
    </p>
  )
}

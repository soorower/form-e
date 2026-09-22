import { useRef, useState, type ChangeEvent } from 'react'
import { useQuery } from 'convex/react'
import { ChevronDown, ChevronUp, FileUp, Sparkles, Trash2, Upload } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { useConvexReady } from '#/lib/convex/hooks'
import { cardPlan } from '#/lib/questionnaire/cards'
import { pickText } from '#/lib/questionnaire/factory'
import {
  EXAMPLE_SCENARIO_PLAN,
  checkScenarioPlan,
  parseScenarioPlan,
  splitScenarioPlan,
} from '#/lib/questionnaire/scenario-plan'
import type {
  CardDrawMode,
  ChoiceExperimentQuestion,
  ScenarioPlanRow,
} from '#/lib/questionnaire/types'
import { cn } from '#/lib/utils'

/**
 * How the whole survey's choice-experiment cards are handed out, in ONE panel
 * rather than repeated inside every block. The target, the way cards are
 * handed out, and the scenario plan are survey-wide: a survey with three
 * blocks used to ask for all of that three times over, and one sheet covering
 * the whole interview had nowhere obvious to go. Only "scenarios per
 * respondent" is per block, so that is the one thing the block table edits.
 */
export interface SurveyCardPlanProps {
  surveyId: string
  responseTarget: number
  onResponseTargetChange: (responseTarget: number) => void
  /** Every choice-experiment block, in the order respondents meet them. */
  blocks: ChoiceExperimentQuestion[]
  onBlockChange: (id: string, patch: Partial<ChoiceExperimentQuestion>) => void
  /** Writes each block's slice of one pasted sheet back to the survey. */
  onPlanSplit: (byBlock: Map<string, ScenarioPlanRow[]>) => void
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

const blockName = (block: ChoiceExperimentQuestion, index: number) =>
  pickText(block.label, 'en') || `Block ${index + 1}`

/** Which scenario columns of one sheet each block takes, 1-based and inclusive. */
function columnSpans(blocks: ChoiceExperimentQuestion[]) {
  let offset = 0
  return blocks.map((block) => {
    const take = Math.max(1, block.scenariosPerRespondent)
    const span = { from: offset + 1, to: offset + take }
    offset += take
    return span
  })
}

export function SurveyCardPlan({
  surveyId,
  responseTarget,
  onResponseTargetChange,
  blocks,
  onBlockChange,
  onPlanSplit,
}: SurveyCardPlanProps) {
  if (blocks.length === 0) return null

  // One setting for the survey. Blocks saved separately before this panel
  // existed can disagree; the select then shows what most of them say.
  const modes = blocks.map((block) => block.drawMode ?? 'random')
  const mode: CardDrawMode = modes[0] ?? 'balanced'
  const mixed = modes.some((value) => value !== mode)
  const usesPlan = mode === 'plan'
  const spans = columnSpans(blocks)
  const totalScenarios = blocks.reduce(
    (sum, block) => sum + Math.max(1, block.scenariosPerRespondent),
    0,
  )

  function setModeEverywhere(next: CardDrawMode) {
    for (const block of blocks) onBlockChange(block.id, { drawMode: next })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card distribution</CardTitle>
        <CardDescription>
          How the design cards are handed out, for{' '}
          {blocks.length === 1 ? 'the survey’s choice block' : `all ${blocks.length} choice blocks`} at
          once. Each respondent answers {count(totalScenarios, 'scenario', 'scenarios')} in all.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {mixed && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            The blocks were set up separately and do not all agree on how cards are handed out.
            Choosing below sets every block the same way.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="card-target">1. Total survey target</Label>
            <Input
              id="card-target"
              type="number"
              min={0}
              value={responseTarget || ''}
              placeholder="500"
              className="w-40"
              onChange={(event) =>
                onResponseTargetChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))
              }
            />
            <p className="text-xs text-muted-foreground">
              Responses the whole survey is after. The same number as “Response target” in the
              survey details and on the dashboard.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="card-mode">2. How cards are handed out</Label>
            <Select
              value={mode}
              onValueChange={(value) => value && setModeEverywhere(value as CardDrawMode)}
              items={MODE_LABELS}
            >
              <SelectTrigger id="card-mode" className="w-72">
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
              {mode === 'balanced' &&
                'Each new interview is handed the cards used least so far, counted across all tablets. The most-used and the least-used card never differ by more than one showing.'}
              {mode === 'random' && 'Cards are drawn at random, so some come up more often than others.'}
              {usesPlan &&
                'Nothing is drawn: your sheet decides. Each interview is given the lowest-numbered row not yet used, so response 1 answers row 1, response 2 row 2, and so on.'}
            </p>
          </div>
        </div>

        {usesPlan && (
          <ScenarioPlan blocks={blocks} onBlockChange={onBlockChange} onPlanSplit={onPlanSplit} />
        )}

        <BlockTable
          blocks={blocks}
          spans={spans}
          usesPlan={usesPlan}
          responseTarget={responseTarget}
          onBlockChange={onBlockChange}
        />

        <CardUsage blocks={blocks} surveyId={surveyId} usesPlan={usesPlan} />
      </CardContent>
    </Card>
  )
}

/** One row per choice block: its cards, how many scenarios it asks, its share of the plan. */
function BlockTable({
  blocks,
  spans,
  usesPlan,
  responseTarget,
  onBlockChange,
}: {
  blocks: ChoiceExperimentQuestion[]
  spans: { from: number; to: number }[]
  usesPlan: boolean
  responseTarget: number
  onBlockChange: (id: string, patch: Partial<ChoiceExperimentQuestion>) => void
}) {
  return (
    <div className="space-y-2">
      <Label>3. Each block</Label>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9">Block</TableHead>
              <TableHead className="h-9">Cards</TableHead>
              <TableHead className="h-9">Scenarios each</TableHead>
              <TableHead className="h-9">{usesPlan ? 'Takes from the sheet' : 'Shown per card'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocks.map((block, index) => {
              const plan = block.scenarioPlan ?? []
              const summary = cardPlan(responseTarget, block)
              return (
                <TableRow key={block.id} className="hover:bg-transparent">
                  <TableCell className="py-2 font-medium">
                    {index + 1}. {blockName(block, index)}
                  </TableCell>
                  <TableCell className="py-2 tabular-nums">{block.cards.length}</TableCell>
                  <TableCell className="py-2">
                    <Input
                      type="number"
                      min={1}
                      aria-label={`Scenarios per respondent in block ${index + 1}`}
                      value={block.scenariosPerRespondent}
                      className="h-9 w-20"
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        if (!Number.isInteger(next)) return
                        onBlockChange(block.id, { scenariosPerRespondent: Math.max(1, next) })
                      }}
                    />
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {usesPlan ? (
                      plan.length === 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">no plan yet</span>
                      ) : (
                        <>
                          scenarios {spans[index].from}–{spans[index].to} ·{' '}
                          {count(plan.length, 'row', 'rows')}
                        </>
                      )
                    ) : summary ? (
                      summary.extraCards === 0
                        ? `${summary.perCard}×`
                        : `${summary.perCard}–${summary.perCard + 1}×`
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {usesPlan
          ? 'The scenario columns of your sheet are shared out in this order: the first block takes the first columns, the next block the ones after, and so on. Change a block’s scenario count and import the sheet again to re-cut it.'
          : 'Each respondent is shown this many of the block’s cards, never the same one twice.'}
      </p>
    </div>
  )
}

/**
 * The one scenario sheet for the whole interview. Its columns are shared out
 * over the survey's blocks in order, and every block keeps the same row
 * numbers, so one respondent answers one row of the sheet throughout.
 */
function ScenarioPlan({
  blocks,
  onBlockChange,
  onPlanSplit,
}: {
  blocks: ChoiceExperimentQuestion[]
  onBlockChange: (id: string, patch: Partial<ChoiceExperimentQuestion>) => void
  onPlanSplit: (byBlock: Map<string, ScenarioPlanRow[]>) => void
}) {
  // The blocks share row numbers, so any planned block speaks for the plan.
  const planned = blocks.find((block) => (block.scenarioPlan?.length ?? 0) > 0)
  const rows = planned?.scenarioPlan ?? []
  const [pasted, setPasted] = useState('')
  const [showImport, setShowImport] = useState(rows.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showRows, setShowRows] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function importPlan(source: string) {
    try {
      const parsed = parseScenarioPlan(source)
      const messages = [
        `Read ${count(parsed.rows.length, 'row', 'rows')} of up to ${count(parsed.scenariosPerRow, 'scenario', 'scenarios')} each.`,
      ]

      if (blocks.length === 1) {
        // One block: the sheet's width is simply how many scenarios it asks.
        onBlockChange(blocks[0].id, {
          scenarioPlan: parsed.rows,
          scenariosPerRespondent: Math.max(1, parsed.scenariosPerRow),
        })
      } else {
        const split = splitScenarioPlan(
          parsed.rows,
          blocks.map((block) => ({
            id: block.id,
            scenariosPerRespondent: block.scenariosPerRespondent,
          })),
        )
        onPlanSplit(split.byBlock)
        const where = split.spans
          .map(
            (span, index) =>
              `${index + 1}. ${blockName(blocks[index], index)} takes ${
                span.from === span.to ? `scenario ${span.from}` : `scenarios ${span.from}–${span.to}`
              }`,
          )
          .join('; ')
        messages.push(`Shared out over ${count(blocks.length, 'block', 'blocks')} — ${where}.`)
        if (split.missing > 0) {
          messages.push(
            `The blocks ask for ${split.missing} more than the sheet has, so the last of them get none.`,
          )
        }
        if (split.leftover > 0) {
          messages.push(
            `${split.leftover} ${split.leftover === 1 ? 'column is' : 'columns are'} left over. Raise a block’s scenario count, or add a block, and import again.`,
          )
        }
      }

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

  const missingPlan = blocks.filter((block) => (block.scenarioPlan?.length ?? 0) === 0)
  const checks = blocks.map((block) => checkScenarioPlan(block))
  const unknown = [...new Set(checks.flatMap((check) => check.unknownSets))].sort((a, b) => a - b)
  const unused = checks.flatMap((check, index) =>
    check.unusedSets.map((set) => ({ set, block: index + 1 })),
  )

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm">Scenario plan — one sheet for the whole interview</Label>
        {rows.length > 0 && <Badge variant="secondary">{count(rows.length, 'row', 'rows')}</Badge>}
      </div>

      {showImport ? (
        <div className="space-y-2">
          <Textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={
              'Paste the scenario sheet from Excel. First column numbers the rows; every other column is one scenario, as many as your sheet has:\nSet\tScenario1\tScenario2\t…\tScenario9\n1\t14\t21\t…\t9\n2\t50\t29\t…\t37'
            }
            className="min-h-32 font-mono text-xs"
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pasted.trim() === ''} onClick={() => importPlan(pasted)}>
              <Upload data-icon="inline-start" />
              Import plan
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUp data-icon="inline-start" />
              Upload CSV
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPasted(EXAMPLE_SCENARIO_PLAN)}>
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
            One row per respondent, covering <strong>every</strong> block. The first column is that
            row’s number (headed <span className="font-mono">Set</span>,{' '}
            <span className="font-mono">Respondent</span>, <span className="font-mono">Row</span>,
            …); every other cell is a card <span className="font-mono">Set</span> number. The
            columns are shared out over the blocks in order — with blocks of 3, 3 and 3 a
            nine-column sheet gives each of them three — and every block keeps the same row
            numbers, so one respondent answers row 7 throughout. Tab- or comma-separated.
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
              for (const block of blocks) onBlockChange(block.id, { scenarioPlan: [] })
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

      {!showImport && missingPlan.length > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {count(missingPlan.length, 'block has', 'blocks have')} no plan yet (
          {missingPlan.map((block) => blockName(block, blocks.indexOf(block))).join(', ')}), so{' '}
          {missingPlan.length === 1 ? 'it draws' : 'they draw'} cards at random. Import the sheet
          again to cut it across every block.
        </p>
      )}

      {rows.length > 0 && unknown.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          The plan names {count(unknown.length, 'card number', 'card numbers')} with no matching
          design card ({list(unknown)}). Those are skipped.
        </p>
      )}
      {rows.length > 0 && unused.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {count(unused.length, 'card', 'cards')} never appear in the plan (
          {list(unused.slice(0, 12).map((entry) => entry.set))}).
        </p>
      )}

      {showRows && rows.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-lg border border-border bg-card">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8">Row</TableHead>
                {blocks.map((block, index) => (
                  <TableHead key={block.id} className="h-8">
                    {index + 1}. {blockName(block, index)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.row} className="hover:bg-transparent">
                  <TableCell className="py-1 font-medium tabular-nums">{row.row}</TableCell>
                  {blocks.map((block) => (
                    <TableCell key={block.id} className="py-1 font-mono tabular-nums">
                      {(block.scenarioPlan ?? [])
                        .find((entry) => entry.row === row.row)
                        ?.sets.join(', ') ?? '—'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

/** Live counts: how often each card has come up, per block. */
function CardUsage({
  blocks,
  surveyId,
  usesPlan,
}: {
  blocks: ChoiceExperimentQuestion[]
  surveyId: string
  usesPlan: boolean
}) {
  const ready = useConvexReady()
  const exposure = useQuery(api.responses.cardExposure, ready ? { questionnaireId: surveyId } : 'skip')
  const [open, setOpen] = useState(false)
  if (exposure === undefined) return null

  const perBlock = blocks.map((block, index) => {
    const usage = new Map(
      exposure.cards.filter((row) => row.questionId === block.id).map((row) => [row.set, row]),
    )
    const shown = block.cards.map((card) => usage.get(card.set)?.count ?? 0)
    return {
      id: block.id,
      name: `${index + 1}. ${blockName(block, index)}`,
      total: shown.reduce((sum, n) => sum + n, 0),
      least: shown.length > 0 ? Math.min(...shown) : 0,
      most: shown.length > 0 ? Math.max(...shown) : 0,
    }
  })
  const total = perBlock.reduce((sum, block) => sum + block.total, 0)
  const planRowsUsed = new Set(
    exposure.planRows.filter((row) => row.count > 0).map((row) => row.row),
  ).size

  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No card has been shown yet. Usage appears here once responses come in.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">So far:</span>
        <span>{count(total, 'card showing', 'card showings')} recorded</span>
        {usesPlan && planRowsUsed > 0 && (
          <Badge variant="secondary">{count(planRowsUsed, 'plan row', 'plan rows')} used</Badge>
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
          {open ? 'Hide blocks' : 'Show each block'}
        </Button>
      </div>
      {open && (
        <ul className="space-y-1 text-xs">
          {perBlock.map((block) => (
            <li
              key={block.id}
              className={cn(
                'flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border px-2 py-1',
                block.most - block.least > 1 && 'border-amber-500/40',
              )}
            >
              <span>{block.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {block.total} showings · least {block.least} · most {block.most}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

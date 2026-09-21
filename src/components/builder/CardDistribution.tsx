import { useState } from 'react'
import { useQuery } from 'convex/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'
import { useConvexReady } from '#/lib/convex/hooks'
import { cardPlan, type CardPlan } from '#/lib/questionnaire/cards'
import type { ChoiceExperimentQuestion } from '#/lib/questionnaire/types'
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

/**
 * How a block's cards are shared out: the survey target first, then how many
 * cards each respondent sees, then whether every card must come up equally
 * often, with the resulting plan and the usage so far.
 */
export function CardDistribution({ question, survey, onChange }: CardDistributionProps) {
  const balanced = question.drawMode === 'balanced'
  const plan = survey ? cardPlan(survey.responseTarget, question) : null

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium">Card distribution</p>
        <p className="text-xs text-muted-foreground">
          Fix the survey target first; the cards are then shared out over that many responses.
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
            Each respondent is shown this many of the {question.cards.length} cards, never the
            same one twice. The set numbers shown are saved with the answers.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="cursor-pointer gap-3 font-normal">
          <Switch
            checked={balanced}
            onCheckedChange={(on) => onChange({ drawMode: on ? 'balanced' : 'random' })}
          />
          Show every card equally often
        </Label>
        <p className="text-xs text-muted-foreground">
          {balanced
            ? 'Each new interview is handed the cards used least so far, counted across all tablets, including interviews still going on. The most-used and the least-used card never differ by more than one showing.'
            : 'Off: cards are drawn at random, so some will come up more often than others.'}
        </p>
      </div>

      {balanced && <PlanSummary plan={plan} question={question} hasSurvey={!!survey} />}
      {survey && <CardUsage question={question} surveyId={survey.id} plan={balanced ? plan : null} />}
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
}: {
  question: ChoiceExperimentQuestion
  surveyId: string
  plan: CardPlan | null
}) {
  const ready = useConvexReady()
  const rows = useQuery(api.responses.cardExposure, ready ? { questionnaireId: surveyId } : 'skip')
  const [open, setOpen] = useState(false)
  if (rows === undefined) return null

  const usage = new Map(
    rows.filter((row) => row.questionId === question.id).map((row) => [row.set, row]),
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
      {most - least > 1 && (
        <p className="text-xs text-muted-foreground">
          The gap is wider than one because of responses collected before balancing was on (or
          on a tablet without a connection). New interviews get the least-used cards until it
          closes.
        </p>
      )}
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

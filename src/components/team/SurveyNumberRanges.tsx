import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Printer } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { useSurveyPaths } from '#/components/auth/area'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { useConvexReady } from '#/lib/convex/hooks'
import { formatSurveyNumber } from '#/lib/questionnaire/factory'

function errorText(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  return error instanceof Error ? error.message : 'Something went wrong.'
}

interface Range {
  start: number
  end: number
}

/**
 * Which block of survey numbers each surveyor on a survey collects: Ikra
 * 1–100, Sorower 101–200, … Their interviews then take the next free number
 * in their block (so Sorower's first is 101), and a planned choice block
 * gives each number its plan row, so the paper forms printed for a block
 * show the same cards the tablet would.
 */
export function SurveyNumberRanges({
  questionnaireId,
  prefix,
}: {
  questionnaireId: string
  prefix: string
}) {
  const ready = useConvexReady()
  const members = useQuery(api.teams.members, ready ? { questionnaireId } : 'skip')
  const setRange = useMutation(api.teams.setRange)
  const [error, setError] = useState<string | null>(null)

  async function save(email: string, range: Range | null) {
    setError(null)
    try {
      await setRange({ questionnaireId, email, range })
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  if (members === undefined) return <p className="text-sm text-muted-foreground">Loading surveyors…</p>
  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add surveyors to this survey first; then give each one a block of survey numbers.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Give each surveyor a block of survey numbers. Their interviews take the next free number in
        it ({formatSurveyNumber(prefix, 101)} onwards for 101–200), and with a scenario plan each
        number gets its own plan row, round again after the last row. Anyone without a block counts
        on after the highest number outside every block.
      </p>
      <ul className="space-y-2">
        {members.map((member) => (
          <RangeRow
            key={member.email}
            name={member.code ? `${member.name} (${member.code})` : member.name}
            range={member.range}
            prefix={prefix}
            questionnaireId={questionnaireId}
            onSave={(range) => void save(member.email, range)}
          />
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function RangeRow({
  name,
  range,
  prefix,
  questionnaireId,
  onSave,
}: {
  name: string
  range: Range | null
  prefix: string
  questionnaireId: string
  onSave: (range: Range | null) => void
}) {
  const paths = useSurveyPaths()
  const [start, setStart] = useState(range ? String(range.start) : '')
  const [end, setEnd] = useState(range ? String(range.end) : '')
  useEffect(() => {
    setStart(range ? String(range.start) : '')
    setEnd(range ? String(range.end) : '')
  }, [range?.start, range?.end])

  const draft = { start: Math.floor(Number(start)), end: Math.floor(Number(end)) }
  const valid = draft.start >= 1 && draft.end >= draft.start
  const changed = !range || range.start !== draft.start || range.end !== draft.end

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
      <span className="min-w-40 flex-1 text-sm font-medium">{name}</span>
      <Input
        type="number"
        min={1}
        value={start}
        onChange={(event) => setStart(event.target.value)}
        placeholder="From"
        aria-label={`First survey number for ${name}`}
        className="h-8 w-24 tabular-nums"
      />
      <span className="text-muted-foreground">–</span>
      <Input
        type="number"
        min={1}
        value={end}
        onChange={(event) => setEnd(event.target.value)}
        placeholder="To"
        aria-label={`Last survey number for ${name}`}
        className="h-8 w-24 tabular-nums"
      />
      <Button size="sm" disabled={!valid || !changed} onClick={() => onSave(draft)}>
        Save
      </Button>
      {range && (
        <>
          <Button size="sm" variant="ghost" onClick={() => onSave(null)}>
            Clear
          </Button>
          <span className="text-xs text-muted-foreground">
            {formatSurveyNumber(prefix, range.start)} to {formatSurveyNumber(prefix, range.end)}
          </span>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <Link
                to={paths.print}
                params={{ surveyId: questionnaireId }}
                search={{ from: range.start, to: range.end }}
              />
            }
          >
            <Printer data-icon="inline-start" />
            Paper forms
          </Button>
        </>
      )}
    </li>
  )
}

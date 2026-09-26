import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useQuery } from 'convex/react'
import { Inbox } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { ResponsesPanel } from '#/components/responses/ResponsesPanel'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaires } from '#/lib/convex/questionnaire-codec'
import { pickText } from '#/lib/questionnaire/factory'
import { cn } from '#/lib/utils'

/**
 * Every survey team's responses in one place: pick a team, and its
 * responses, per-enumerator counts, and Excel / CSV / JSON downloads open
 * below, the same panel as the editor's Responses tab. `surveyParam` (the
 * `?survey=` query) keeps the choice in the address.
 */
export function ResponsesPage({ surveyParam }: { surveyParam?: string }) {
  const ready = useConvexReady()
  const navigate = useNavigate()
  const listed = useQuery(api.questionnaires.list, ready ? {} : 'skip')
  const surveys = useMemo(() => decodeQuestionnaires(listed), [listed])
  // Counts from the small summary rows, so the list does not read every answer.
  const progress = useQuery(api.responses.progress, ready ? {} : 'skip')

  const counts = new Map<string, number>()
  for (const row of progress ?? []) {
    counts.set(row.questionnaireId, (counts.get(row.questionnaireId) ?? 0) + 1)
  }
  const ranked = [...(surveys ?? [])].sort(
    (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || b.updatedAt - a.updatedAt,
  )
  const selected = ranked.find((survey) => survey.id === surveyParam) ?? ranked[0] ?? null

  return (
    <main className="page-wrap px-4 py-10">
      <div className="mb-6 space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Responses</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Survey team responses</h1>
        <p className="max-w-2xl text-muted-foreground">
          Pick a team to see what it has collected: who collected each response, the answers, and
          downloads as Excel, CSV, or JSON. Press an enumerator's name to narrow everything,
          downloads included, to that person.
        </p>
      </div>

      {surveys === undefined ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : ranked.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <Inbox className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-lg font-semibold">No surveys yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div role="tablist" aria-label="Survey teams" className="flex flex-wrap gap-2">
            {ranked.map((survey) => {
              const active = survey.id === selected?.id
              const count = counts.get(survey.id) ?? 0
              const title =
                pickText(survey.title, survey.defaultLanguage) || 'Untitled survey'
              return (
                <button
                  key={survey.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() =>
                    navigate({ to: '/admin/responses', search: { survey: survey.id }, replace: true })
                  }
                  className={cn(
                    'min-w-48 max-w-72 rounded-xl border px-4 py-2.5 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:border-primary/40',
                  )}
                >
                  <span className="block truncate text-sm font-semibold">
                    {survey.teamName.trim() || 'No team name'}
                  </span>
                  <span
                    lang={survey.defaultLanguage}
                    className="block truncate text-xs text-muted-foreground"
                  >
                    {title}
                  </span>
                  <span className="mt-1 block text-sm tabular-nums">
                    <span className="font-bold">{count}</span>
                    {survey.responseTarget > 0 && (
                      <span className="text-muted-foreground"> / {survey.responseTarget}</span>
                    )}{' '}
                    <span className="text-muted-foreground">
                      {count === 1 ? 'response' : 'responses'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {selected && <ResponsesPanel key={selected.id} questionnaire={selected} />}
        </div>
      )}
    </main>
  )
}

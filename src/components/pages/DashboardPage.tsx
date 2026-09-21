import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  ClipboardList,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Target,
  Trophy,
  Users,
} from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaires, encodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { useSurveyPaths } from '#/components/auth/area'
import { Leaderboard } from '#/components/dashboard/Leaderboard'
import { TeamEditor } from '#/components/dashboard/TeamEditor'
import { SurveyorAssignment } from '#/components/team/SurveyorAssignment'
import { useViewer } from '#/hooks/useViewer'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { activeEnumerators, createQuestionnaire, pickText } from '#/lib/questionnaire/factory'
import type { Questionnaire, ResponseProgress } from '#/lib/questionnaire/types'
import { teamStats, type TeamStat } from '#/lib/team/stats'
import { cn } from '#/lib/utils'

interface TeamRow {
  questionnaire: Questionnaire
  stats: TeamStat
}

function teamLabel(questionnaire: Questionnaire): string {
  return (
    questionnaire.teamName.trim() ||
    pickText(questionnaire.title, questionnaire.defaultLanguage) ||
    'Untitled team'
  )
}

/**
 * Teams ranked by responses; progress and the leaderboard for the selected
 * one. `teamParam` (from ?team=) preselects a survey's team.
 */
export function DashboardPage({ teamParam }: { teamParam?: string }) {
  const ready = useConvexReady()
  const paths = useSurveyPaths()
  const { canBuild } = useViewer()
  // Stripped of Convex system fields so a team can be edited and saved back.
  const surveys = decodeQuestionnaires(useQuery(api.questionnaires.list, ready ? {} : 'skip'))
  // Who collected what, without answers, so surveyors can follow their team too.
  const progress = useQuery(api.responses.progress, ready ? {} : 'skip') as
    | ResponseProgress[]
    | undefined
  const save = useMutation(api.questionnaires.save)
  const [selectedId, setSelectedId] = useState<string | null>(teamParam ?? null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (teamParam) setSelectedId(teamParam)
  }, [teamParam])

  // Keeps "today" and the relative times honest on a dashboard left open.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [])

  const byTeam = useMemo(() => {
    const map = new Map<string, ResponseProgress[]>()
    for (const row of progress ?? []) {
      const list = map.get(row.questionnaireId) ?? []
      list.push(row)
      map.set(row.questionnaireId, list)
    }
    return map
  }, [progress])

  const teams = useMemo<TeamRow[]>(() => {
    if (!surveys) return []
    return surveys
      .map((questionnaire) => ({
        questionnaire,
        stats: teamStats(questionnaire, byTeam.get(questionnaire.id) ?? [], now),
      }))
      .sort((a, b) => b.stats.total - a.stats.total || b.stats.today - a.stats.today)
  }, [surveys, byTeam, now])

  const selected = teams.find((team) => team.questionnaire.id === selectedId) ?? teams[0] ?? null

  // Surveyor accounts on the selected team appear on the leaderboard before
  // their first response, with their code.
  const assigned = useQuery(
    api.teams.members,
    ready && selected ? { questionnaireId: selected.questionnaire.id } : 'skip',
  )
  const selectedStats = selected
    ? teamStats(selected.questionnaire, byTeam.get(selected.questionnaire.id) ?? [], now, assigned ?? [])
    : null

  function updateTeam(patch: Partial<Questionnaire>) {
    if (!selected) return
    void save(encodeQuestionnaire({ ...selected.questionnaire, ...patch }) as never)
  }

  function createTeam(event: FormEvent) {
    event.preventDefault()
    const name = newTeamName.trim()
    if (!name) return
    const questionnaire = { ...createQuestionnaire(), teamName: name }
    void save(encodeQuestionnaire(questionnaire) as never)
    setNewTeamName('')
    setCreating(false)
    setSelectedId(questionnaire.id)
    setEditing(true)
  }

  const totals = teams.reduce(
    (sum, team) => ({ responses: sum.responses + team.stats.total, today: sum.today + team.stats.today }),
    { responses: 0, today: 0 },
  )

  if (surveys === undefined) {
    return <main className="page-wrap-wide px-4 py-12 text-muted-foreground">Loading…</main>
  }

  return (
    <main className="page-wrap-wide px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Dashboard</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Teams in the field</h1>
          <p className="max-w-xl text-muted-foreground">
            One team per survey. See who has collected how much and keep the leaderboard moving;
            each team's chat has its own page.
          </p>
        </div>
        {canBuild && (
          <Button size="lg" onClick={() => setCreating((open) => !open)}>
            <Plus data-icon="inline-start" />
            New team
          </Button>
        )}
      </div>

      {creating && canBuild && (
        <form
          onSubmit={createTeam}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="min-w-64 flex-1 space-y-1.5">
            <label htmlFor="new-team" className="text-sm font-medium">
              Team name
            </label>
            <Input
              id="new-team"
              autoFocus
              value={newTeamName}
              onChange={(event) => setNewTeamName(event.target.value)}
              placeholder="Sylhet field team"
            />
          </div>
          <Button type="submit" disabled={!newTeamName.trim()}>
            Create team and its survey
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            A new survey is created for the team. Build its questions from the Surveys page.
          </p>
        </form>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatTile icon={Users} label="Teams" value={teams.length} />
        <StatTile icon={ClipboardList} label="Responses collected" value={totals.responses} />
        <StatTile icon={Target} label="Collected today" value={totals.today} accent />
      </div>

      {teams.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <Users className="size-10 text-muted-foreground" />
          <p className="text-lg font-semibold">No teams yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {canBuild
              ? 'Create a team to get a survey, a leaderboard, and a chat room for it.'
              : 'You are not on a survey team yet. A builder or the admin adds you to one.'}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Trophy className="size-4 text-amber-500" />
              <h2 className="text-sm font-semibold">Team ranking</h2>
            </div>
            <div className="lg:hidden">
              <Select
                value={selected?.questionnaire.id ?? null}
                onValueChange={(id) => id && setSelectedId(id)}
                items={Object.fromEntries(
                  teams.map((team) => [team.questionnaire.id, teamLabel(team.questionnaire)]),
                )}
              >
                <SelectTrigger className="w-full" aria-label="Team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.questionnaire.id} value={team.questionnaire.id}>
                      {teamLabel(team.questionnaire)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ol className="hidden space-y-2 lg:block">
              {teams.map((team, index) => {
                const active = team.questionnaire.id === selected?.questionnaire.id
                return (
                  <li key={team.questionnaire.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(team.questionnaire.id)
                        setEditing(false)
                      }}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:bg-muted/60',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-5 text-xs font-bold tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {teamLabel(team.questionnaire)}
                        </span>
                        <span className="text-sm font-bold tabular-nums">{team.stats.total}</span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 pl-7 text-xs text-muted-foreground">
                        <span>
                          {activeEnumerators(team.questionnaire).length} members
                          {team.stats.today > 0 && ` · +${team.stats.today} today`}
                        </span>
                      </span>
                      {team.stats.progress !== null && (
                        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${team.stats.progress * 100}%` }}
                          />
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
          </aside>

          {selected && (
            <section className="space-y-5">
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h2 className="text-2xl font-bold">{teamLabel(selected.questionnaire)}</h2>
                      <p className="text-sm text-muted-foreground">
                        Survey:{' '}
                        {canBuild ? (
                          <Link
                            to={paths.editor}
                            params={{ surveyId: selected.questionnaire.id }}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                            lang={selected.questionnaire.defaultLanguage}
                          >
                            {pickText(selected.questionnaire.title, selected.questionnaire.defaultLanguage) ||
                              'Untitled survey'}
                          </Link>
                        ) : (
                          <span
                            className="font-medium text-foreground"
                            lang={selected.questionnaire.defaultLanguage}
                          >
                            {pickText(selected.questionnaire.title, selected.questionnaire.defaultLanguage) ||
                              'Untitled survey'}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {activeEnumerators(selected.questionnaire).map((name) => (
                          <Badge key={name} variant="outline">
                            {name}
                          </Badge>
                        ))}
                      </div>
                      <div className="pt-1">
                        <SurveyorAssignment
                          questionnaireId={selected.questionnaire.id}
                          canEdit={canBuild}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link to={paths.fill} params={{ surveyId: selected.questionnaire.id }} />
                        }
                      >
                        <Play data-icon="inline-start" />
                        Start survey
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link to={paths.chat} params={{ surveyId: selected.questionnaire.id }} />
                        }
                      >
                        <MessageSquare data-icon="inline-start" />
                        Team chat
                      </Button>
                      {canBuild && (
                        <Button variant={editing ? 'secondary' : 'outline'} size="sm" onClick={() => setEditing((open) => !open)}>
                          <Pencil data-icon="inline-start" />
                          {editing ? 'Close' : 'Edit team'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniStat label="Responses" value={selected.stats.total} />
                    <MiniStat label="Today" value={selected.stats.today} />
                    <MiniStat
                      label="Target"
                      value={selected.stats.target > 0 ? selected.stats.target : '—'}
                    />
                  </div>

                  {selected.stats.progress !== null && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress towards target</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {Math.round(selected.stats.progress * 100)}%
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${selected.stats.progress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {editing && canBuild && (
                    <TeamEditor
                      questionnaire={selected.questionnaire}
                      onChange={updateTeam}
                      onDone={() => setEditing(false)}
                    />
                  )}
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Trophy className="size-4 text-amber-500" />
                  <h3 className="font-semibold">Leaderboard</h3>
                </div>
                <Leaderboard members={(selectedStats ?? selected.stats).members} now={now} />
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof Users
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          accent ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-3xl font-extrabold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

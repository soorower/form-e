import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ClipboardList, Eye, MessageSquare, Pencil, Play, Plus, Trash2, Users } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaires } from '#/lib/convex/questionnaire-codec'
import { useViewer, type Viewer } from '#/hooks/useViewer'
import { LocalDataImport } from '#/components/LocalDataImport'
import { useSurveyPaths } from '#/components/auth/area'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { LANGUAGE_LABELS, pickText } from '#/lib/questionnaire/factory'
import type { Questionnaire, ResponseProgress } from '#/lib/questionnaire/types'
import { startOfToday } from '#/lib/team/stats'

export function SurveysPage() {
  const ready = useConvexReady()
  const paths = useSurveyPaths()
  const { viewer } = useViewer()
  const surveys = decodeQuestionnaires(useQuery(api.questionnaires.list, ready ? {} : 'skip'))
  const progress = useQuery(api.responses.progress, ready ? {} : 'skip') as
    | ResponseProgress[]
    | undefined
  const removeSurvey = useMutation(api.questionnaires.remove)

  const responseCounts: Record<string, number> = {}
  for (const row of progress ?? []) {
    responseCounts[row.questionnaireId] = (responseCounts[row.questionnaireId] ?? 0) + 1
  }

  if (viewer?.role === 'surveyor') {
    return <SurveyorHome viewer={viewer} surveys={surveys} progress={progress} />
  }

  // Which group owns a survey matters to admins (an unassigned survey is
  // invisible to every group) and to people who belong to several groups.
  const showGroup = viewer?.role === 'admin' || (viewer?.groups.length ?? 0) > 1
  function groupBadge(survey: Questionnaire) {
    if (!showGroup) return null
    if (!survey.groupId) {
      return viewer?.role === 'admin' ? (
        <Badge
          variant="outline"
          className="border-amber-500/50 text-amber-700 dark:text-amber-300"
          render={<Link to="/admin" />}
        >
          No group yet
        </Badge>
      ) : null
    }
    const name = viewer?.groups.find((group) => group.id === survey.groupId)?.name
    return name ? <Badge variant="outline">{name}</Badge> : null
  }

  function remove(survey: Questionnaire) {
    const name = pickText(survey.title, survey.defaultLanguage) || 'this survey'
    if (!window.confirm(`Delete "${name}" and all of its responses? This cannot be undone.`)) {
      return
    }
    void removeSurvey({ id: survey.id })
  }

  return (
    <main className="page-wrap px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Surveys</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Your questionnaires
          </h1>
          <p className="max-w-xl text-muted-foreground">
            Build a survey, test it in the preview, then open it on a tablet to collect
            responses.
          </p>
        </div>
        <Button size="lg" nativeButton={false} render={<Link to={paths.create} />}>
          <Plus data-icon="inline-start" />
          New survey
        </Button>
      </div>

      <LocalDataImport />

      {surveys === undefined ? (
        <p className="mt-10 text-muted-foreground">Loading…</p>
      ) : surveys.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <ClipboardList className="size-10 text-muted-foreground" />
          <p className="text-lg font-semibold">No surveys yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create your first questionnaire to start designing questions for the field.
          </p>
          <Button nativeButton={false} render={<Link to={paths.create} />}>
            <Plus data-icon="inline-start" />
            Create a survey
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {surveys.map((survey) => {
            const title = pickText(survey.title, survey.defaultLanguage) || 'Untitled survey'
            const questionCount = survey.questions.length
            const responseCount = responseCounts[survey.id] ?? 0
            return (
              <li key={survey.id}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle lang={survey.defaultLanguage} className="text-lg">
                      {title}
                    </CardTitle>
                    <CardDescription>
                      Updated {new Date(survey.updatedAt).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {questionCount} {questionCount === 1 ? 'question' : 'questions'}
                    </Badge>
                    <Badge variant="secondary">
                      {responseCount} {responseCount === 1 ? 'response' : 'responses'}
                    </Badge>
                    {survey.languages.map((lang) => (
                      <Badge key={lang} variant="outline" lang={lang}>
                        {LANGUAGE_LABELS[lang]}
                      </Badge>
                    ))}
                    {groupBadge(survey)}
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false} render={<Link to={paths.editor} params={{ surveyId: survey.id }} />}
                    >
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false} render={
                        <Link to={paths.fill} params={{ surveyId: survey.id }} />
                      }
                    >
                      <Eye data-icon="inline-start" />
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => remove(survey)}
                    >
                      <Trash2 data-icon="inline-start" />
                      Delete
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Surveys and responses are stored on the server. You see your own surveys and those of
        the groups you belong to; the fill page of any survey opens on a tablet without signing in.
      </p>
    </main>
  )
}

/**
 * What a surveyor sees instead of the builder's list: the surveys assigned
 * to them, how far they and the team have got, and the way into the
 * interview, the team page, and the chat.
 */
function SurveyorHome({
  viewer,
  surveys,
  progress,
}: {
  viewer: Viewer
  surveys: Questionnaire[] | undefined
  progress: ResponseProgress[] | undefined
}) {
  const dayStart = startOfToday()
  const paths = useSurveyPaths()
  const mine = (row: ResponseProgress) =>
    (viewer.code !== null && row.surveyorCode === viewer.code) ||
    row.enumerator.trim() === viewer.displayName

  return (
    <main className="page-wrap px-4 py-12">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">My surveys</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {viewer.displayName}
          {viewer.code && (
            <span className="ml-3 rounded-lg bg-muted px-2 py-1 align-middle font-mono text-base font-semibold text-muted-foreground">
              {viewer.code}
            </span>
          )}
        </h1>
        <p className="max-w-xl text-muted-foreground">
          The surveys assigned to you. Start one to interview a respondent; questions come one at a
          time. Every response you record counts for you on the team leaderboard.
        </p>
      </div>

      {surveys === undefined ? (
        <p className="mt-10 text-muted-foreground">Loading…</p>
      ) : surveys.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <ClipboardList className="size-10 text-muted-foreground" />
          <p className="text-lg font-semibold">No surveys assigned yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            A survey builder or the admin puts you on a survey's team. It appears here the moment
            they do.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {surveys.map((survey) => {
            const title = pickText(survey.title, survey.defaultLanguage) || 'Untitled survey'
            const rows = (progress ?? []).filter((row) => row.questionnaireId === survey.id)
            const own = rows.filter(mine)
            const today = own.filter((row) => row.submittedAt >= dayStart).length
            const target = survey.responseTarget > 0 ? survey.responseTarget : null
            return (
              <li key={survey.id}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle lang={survey.defaultLanguage} className="text-lg">
                      {title}
                    </CardTitle>
                    <CardDescription>
                      {survey.teamName.trim() || 'No team name'} · {survey.questions.length}{' '}
                      {survey.questions.length === 1 ? 'question' : 'questions'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Mine</p>
                      <p className="text-xl font-bold tabular-nums">{own.length}</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Today</p>
                      <p className="text-xl font-bold tabular-nums">{today}</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Team</p>
                      <p className="text-xl font-bold tabular-nums">
                        {rows.length}
                        {target && (
                          <span className="text-sm font-medium text-muted-foreground"> / {target}</span>
                        )}
                      </p>
                    </div>
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<Link to={paths.fill} params={{ surveyId: survey.id }} />}
                    >
                      <Play data-icon="inline-start" />
                      Start survey
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link to={paths.dashboard} search={{ team: survey.id }} />}
                    >
                      <Users data-icon="inline-start" />
                      Team
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link to={paths.chat} params={{ surveyId: survey.id }} />}
                    >
                      <MessageSquare data-icon="inline-start" />
                      Chat
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

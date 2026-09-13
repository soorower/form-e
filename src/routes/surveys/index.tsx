import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ClipboardList, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaires } from '#/lib/convex/questionnaire-codec'
import { LocalDataImport } from '#/components/LocalDataImport'
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
import type { Questionnaire } from '#/lib/questionnaire/types'

export const Route = createFileRoute('/surveys/')({
  component: SurveysPage,
})

function SurveysPage() {
  const ready = useConvexReady()
  const surveys = decodeQuestionnaires(useQuery(api.questionnaires.list, ready ? {} : 'skip'))
  const allResponses = useQuery(api.responses.listAll, ready ? {} : 'skip')
  const removeSurvey = useMutation(api.questionnaires.remove)

  const responseCounts: Record<string, number> = {}
  for (const response of allResponses ?? []) {
    responseCounts[response.questionnaireId] = (responseCounts[response.questionnaireId] ?? 0) + 1
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
        <Button size="lg" nativeButton={false} render={<Link to="/create" />}>
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
          <Button nativeButton={false} render={<Link to="/create" />}>
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
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false} render={<Link to="/surveys/$surveyId" params={{ surveyId: survey.id }} />}
                    >
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false} render={
                        <Link to="/surveys/$surveyId/fill" params={{ surveyId: survey.id }} />
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
        Surveys and responses are stored on your Convex deployment, so every tablet signed in to
        this app sees the same data.
      </p>
    </main>
  )
}

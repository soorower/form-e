import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { ArrowLeft, Eye, Inbox, MessageSquare, Pencil, Users } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { useSurveyPaths } from '#/components/auth/area'
import { QuestionnaireBuilder } from '#/components/builder/QuestionnaireBuilder'
import { QuestionnaireRenderer } from '#/components/renderer/QuestionnaireRenderer'
import { ResponsesPanel } from '#/components/responses/ResponsesPanel'
import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useQuestionnaire } from '#/hooks/useQuestionnaire'
import { useConvexReady } from '#/lib/convex/hooks'
import { activeEnumerators, formatSurveyNumber, pickText } from '#/lib/questionnaire/factory'

/** Build, preview, and responses tabs for one survey. */
export function SurveyEditorPage({ surveyId }: { surveyId: string }) {
  const paths = useSurveyPaths()
  const ready = useConvexReady()
  const { questionnaire, update, savedAt, saveError } = useQuestionnaire(surveyId)
  // The number the next real response will get, so the preview shows what the
  // tablet will show. It was a fixed 1, which read as "numbering starts over".
  const nextSerial =
    useQuery(api.responses.nextSerial, ready ? { questionnaireId: surveyId } : 'skip') ?? 1
  const [tab, setTab] = useState('build')

  if (questionnaire === undefined) {
    return <main className="page-wrap px-4 py-12 text-muted-foreground">Loading…</main>
  }

  if (questionnaire === null) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Survey not found</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          It may have been deleted, or your account does not have access to it: only the survey's
          owner, their group, and admins can edit a survey and see its responses. The admin can
          hand it to you from the admin panel.
        </p>
        <Button className="mt-6" nativeButton={false} render={<Link to={paths.list} />}>
          <ArrowLeft data-icon="inline-start" />
          All surveys
        </Button>
      </main>
    )
  }

  const title = pickText(questionnaire.title, questionnaire.defaultLanguage) || 'Untitled survey'
  const questionCount = questionnaire.questions.length

  return (
    <main className="page-wrap px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link to={paths.list} />}>
          <ArrowLeft data-icon="inline-start" />
          All surveys
        </Button>
        <div className="min-w-0 flex-1">
          <h1 lang={questionnaire.defaultLanguage} className="truncate text-xl font-bold">
            {title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Not saved yet'}
            {' · '}
            {questionCount} {questionCount === 1 ? 'question' : 'questions'}
          </p>
          {saveError && (
            <p role="alert" className="mt-1 text-xs font-medium text-destructive">
              {saveError}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to={paths.dashboard} search={{ team: surveyId }} />}
        >
          <Users data-icon="inline-start" />
          Team
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to={paths.chat} params={{ surveyId }} />}
        >
          <MessageSquare data-icon="inline-start" />
          Chat
        </Button>
        <Button
          variant="outline"
          nativeButton={false} render={<Link to={paths.fill} params={{ surveyId }} />}
        >
          <Eye data-icon="inline-start" />
          Open for respondents
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value="build">
            <Pencil />
            Build
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye />
            Preview
          </TabsTrigger>
          <TabsTrigger value="responses">
            <Inbox />
            Responses
          </TabsTrigger>
        </TabsList>
        <TabsContent value="build" className="pt-4">
          <QuestionnaireBuilder questionnaire={questionnaire} onUpdate={update} />
        </TabsContent>
        <TabsContent value="preview" className="pt-4">
          <div
            role="note"
            className="mx-auto mb-4 flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-700 dark:text-amber-300"
          >
            <p>
              <span className="font-semibold">Preview only: nothing entered here is saved.</span>{' '}
              The survey number is the one the next real response will get. To record responses,
              open the survey for respondents.
            </p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to={paths.fill} params={{ surveyId }} />}
            >
              <Eye data-icon="inline-start" />
              Open for respondents
            </Button>
          </div>
          <QuestionnaireRenderer
            questionnaire={questionnaire}
            meta={{
              serial: nextSerial,
              surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, nextSerial),
              enumerator: activeEnumerators(questionnaire)[0] ?? '',
            }}
            // The preview reserves nothing: no card counts, and no plan-row
            // counts either, so a planned block just shows one row at random.
            cardExposure={{}}
          />
        </TabsContent>
        <TabsContent value="responses" className="pt-4">
          <ResponsesPanel questionnaire={questionnaire} />
        </TabsContent>
      </Tabs>
    </main>
  )
}

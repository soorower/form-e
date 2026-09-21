import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, Eye, Inbox, MessageSquare, Pencil, Users } from 'lucide-react'
import { useSurveyPaths } from '#/components/auth/area'
import { QuestionnaireBuilder } from '#/components/builder/QuestionnaireBuilder'
import { QuestionnaireRenderer } from '#/components/renderer/QuestionnaireRenderer'
import { ResponsesPanel } from '#/components/responses/ResponsesPanel'
import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useQuestionnaire } from '#/hooks/useQuestionnaire'
import { activeEnumerators, formatSurveyNumber, pickText } from '#/lib/questionnaire/factory'

/** Build, preview, and responses tabs for one survey. */
export function SurveyEditorPage({ surveyId }: { surveyId: string }) {
  const paths = useSurveyPaths()
  const { questionnaire, update, savedAt, saveError } = useQuestionnaire(surveyId)
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
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Preview only. Answers entered here are not recorded.
          </p>
          <QuestionnaireRenderer
            questionnaire={questionnaire}
            meta={{
              serial: 1,
              surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, 1),
              enumerator: activeEnumerators(questionnaire)[0] ?? '',
            }}
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

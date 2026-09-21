import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { ArrowLeft, Pencil, Play } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { useSurveyPaths } from '#/components/auth/area'
import { TeamChat } from '#/components/dashboard/TeamChat'
import { Button } from '#/components/ui/button'
import { useViewer } from '#/hooks/useViewer'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { pickText } from '#/lib/questionnaire/factory'

/**
 * The team's chat room on its own page, for everyone on the survey's team:
 * its builders and its assigned surveyors. Messages go out under the
 * signed-in person's name.
 */
export function ChatPage({ surveyId }: { surveyId: string }) {
  const paths = useSurveyPaths()
  const ready = useConvexReady()
  const questionnaire = decodeQuestionnaire(
    useQuery(api.questionnaires.get, ready ? { id: surveyId } : 'skip'),
  )
  const { viewer, canBuild } = useViewer()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [])

  if (questionnaire === undefined) {
    return <main className="page-wrap px-4 py-12 text-muted-foreground">Loading…</main>
  }
  if (questionnaire === null) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Survey not found</h1>
        <Button className="mt-6" nativeButton={false} render={<Link to={paths.list} />}>
          <ArrowLeft data-icon="inline-start" />
          Back
        </Button>
      </main>
    )
  }

  const title = pickText(questionnaire.title, questionnaire.defaultLanguage) || 'Untitled survey'
  const team = questionnaire.teamName.trim()

  return (
    <main className="page-wrap px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={paths.dashboard} search={{ team: surveyId }} />}
        >
          <ArrowLeft data-icon="inline-start" />
          Team &amp; progress
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{team || title}</h1>
          <p lang={questionnaire.defaultLanguage} className="truncate text-xs text-muted-foreground">
            Team chat · {title}
          </p>
        </div>
        {canBuild && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to={paths.editor} params={{ surveyId }} />}
          >
            <Pencil data-icon="inline-start" />
            Editor
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to={paths.fill} params={{ surveyId }} />}
        >
          <Play data-icon="inline-start" />
          Start survey
        </Button>
      </div>
      <div className="h-[calc(100vh-14rem)] min-h-[28rem]">
        <TeamChat questionnaire={questionnaire} now={now} author={viewer?.displayName ?? ''} />
      </div>
    </main>
  )
}

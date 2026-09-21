import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useSurveyPaths } from '#/components/auth/area'
import { encodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { createQuestionnaire } from '#/lib/questionnaire/factory'

/** Creates a blank survey (in the author's group) and hands off to its editor. */
export function CreatePage() {
  const navigate = useNavigate()
  const paths = useSurveyPaths()
  const save = useMutation(api.questionnaires.save)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const questionnaire = createQuestionnaire()
    void save(encodeQuestionnaire(questionnaire) as never).then(() =>
      navigate({
        to: paths.editor,
        params: { surveyId: questionnaire.id },
        replace: true,
      }),
    )
  }, [navigate, paths.editor, save])

  return (
    <main className="page-wrap px-4 py-16 text-center text-muted-foreground">
      Creating your survey…
    </main>
  )
}

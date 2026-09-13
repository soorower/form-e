import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { encodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { createQuestionnaire } from '#/lib/questionnaire/factory'

export const Route = createFileRoute('/create')({
  component: CreatePage,
})

/** Creates a blank survey and hands off to its editor. */
function CreatePage() {
  const navigate = useNavigate()
  const save = useMutation(api.questionnaires.save)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const questionnaire = createQuestionnaire()
    void save(encodeQuestionnaire(questionnaire) as never).then(() =>
      navigate({
        to: '/surveys/$surveyId',
        params: { surveyId: questionnaire.id },
        replace: true,
      }),
    )
  }, [navigate, save])

  return (
    <main className="page-wrap px-4 py-16 text-center text-muted-foreground">
      Creating your survey…
    </main>
  )
}

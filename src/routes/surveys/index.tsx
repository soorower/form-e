import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { SurveysPage } from '#/components/pages/SurveysPage'

export const Route = createFileRoute('/surveys/')({
  head: () => ({ meta: [{ title: 'Surveys · Form-E' }] }),
  component: SurveysRoute,
})

/** Every approved account; builders get the list, surveyors their assigned surveys. */
function SurveysRoute() {
  return (
    <RequireAuth>
      <SurveysPage />
    </RequireAuth>
  )
}

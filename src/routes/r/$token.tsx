import { createFileRoute } from '@tanstack/react-router'
import { RespondPage } from '#/components/pages/RespondPage'

/** Public: a survey sent to anyone through a team member's share link. */
export const Route = createFileRoute('/r/$token')({
  head: () => ({ meta: [{ title: 'Survey · Form-E' }] }),
  component: RespondRoute,
})

function RespondRoute() {
  const { token } = Route.useParams()
  return <RespondPage token={token} />
}

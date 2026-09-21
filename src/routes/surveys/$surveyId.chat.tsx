import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { ChatPage } from '#/components/pages/ChatPage'

export const Route = createFileRoute('/surveys/$surveyId/chat')({
  head: () => ({ meta: [{ title: 'Team chat · Form-E' }] }),
  component: ChatRoute,
})

function ChatRoute() {
  const { surveyId } = Route.useParams()
  return (
    <RequireAuth>
      <ChatPage surveyId={surveyId} />
    </RequireAuth>
  )
}

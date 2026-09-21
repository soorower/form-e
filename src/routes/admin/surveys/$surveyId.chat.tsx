import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { ChatPage } from '#/components/pages/ChatPage'

/** A survey's team chat on the admin session. */
export const Route = createFileRoute('/admin/surveys/$surveyId/chat')({
  head: () => ({ meta: [{ title: 'Team chat · Admin · Form-E' }] }),
  component: AdminChatRoute,
})

function AdminChatRoute() {
  const { surveyId } = Route.useParams()
  return (
    <RequireAuth>
      <ChatPage surveyId={surveyId} />
    </RequireAuth>
  )
}

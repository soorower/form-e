import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { FillPage } from '#/components/pages/FillPage'
import { useConvexReady } from '#/lib/convex/hooks'

/**
 * The page a share link opens: the survey for someone answering on their own
 * phone or computer, with no account. The link decides which survey and who
 * the response is credited to; a link that was turned off says so.
 */
export function RespondPage({ token }: { token: string }) {
  const ready = useConvexReady()
  const link = useQuery(api.shareLinks.resolve, ready ? { token } : 'skip')

  if (link === undefined) {
    return <main className="page-wrap px-4 py-12 text-muted-foreground">Loading…</main>
  }
  if (!link.ok) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Survey not available</h1>
        <p className="mt-2 text-muted-foreground">{link.problem}</p>
        <p lang="bn" className="mt-1 text-muted-foreground">
          এই জরিপের লিংকটি এখন উত্তর নিচ্ছে না।
        </p>
      </main>
    )
  }
  return (
    <FillPage
      surveyId={link.questionnaireId}
      share={{ token, sharedBy: link.sharedBy, serial: link.serial }}
    />
  )
}

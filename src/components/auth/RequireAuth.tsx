import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { Hourglass, Loader2, LogOut, ShieldAlert } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { useViewer, type Viewer } from '#/hooks/useViewer'
import { AUTH_AREAS } from '#/lib/auth/areas'
import { useArea } from './area'

interface RequireAuthProps {
  /** Only admins may pass. Implied for every page inside the admin area. */
  admin?: boolean
  /** Only builders (and admins) may pass: the editor, creating surveys, exports. */
  builder?: boolean
  children: ReactNode
}

/**
 * Wraps a page that needs a signed-in, approved user. Auth state is only
 * known in the browser, so on the server and the first client render this
 * shows a placeholder; then it renders the page, sends the visitor to the
 * area's sign-in page (coming back here afterwards), or explains why they
 * cannot go on yet. Inside the admin area it reads the admin session.
 *
 * The server enforces the same rules on every query and mutation; this only
 * decides what to show.
 */
export function RequireAuth({ admin = false, builder = false, children }: RequireAuthProps) {
  const { loading, isAuthenticated, viewer } = useViewer()
  const navigate = useNavigate()
  const location = useLocation()
  const area = useArea()
  const paths = AUTH_AREAS[area]
  const needAdmin = admin || area === 'admin'
  // The page stays mounted while the router moves to /login, and by then
  // `location` already reads as /login; without this guard the effect would
  // fire again with that as the redirect, over and over.
  const redirected = useRef(false)

  useEffect(() => {
    if (loading || isAuthenticated || redirected.current) return
    redirected.current = true
    void navigate({ to: paths.login, search: { redirect: location.href }, replace: true })
  }, [loading, isAuthenticated, navigate, location.href, paths.login])

  if (loading || !isAuthenticated || !viewer) return <GatePlaceholder />
  if (needAdmin && viewer.role !== 'admin') return <AdminsOnly viewer={viewer} />
  if (!viewer.approved) return <AwaitingApproval viewer={viewer} />
  if (builder && !viewer.canBuild) return <BuildersOnly />
  return <>{children}</>
}

/** Ends this area's session; RequireAuth then sends the visitor to sign in. */
function SignOutButton({ label }: { label: string }) {
  const { signOut } = useAuthActions()
  return (
    <Button variant="outline" onClick={() => void signOut()}>
      <LogOut data-icon="inline-start" />
      {label}
    </Button>
  )
}

function GatePlaceholder() {
  return (
    <main
      className="page-wrap flex min-h-[50vh] items-center justify-center gap-2 px-4 py-12 text-muted-foreground"
      aria-busy="true"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Checking your access…
    </main>
  )
}

function GateCard({
  icon,
  tone,
  title,
  description,
  children,
}: {
  icon: ReactNode
  tone: 'amber' | 'red'
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="page-wrap flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div
            className={
              tone === 'amber'
                ? 'mb-2 flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'mb-2 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive'
            }
          >
            {icon}
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">{children}</CardContent>
      </Card>
    </main>
  )
}

/**
 * Signed in, but the admin has not approved this account (yet), or rejected
 * it. Updates live as soon as the admin acts.
 */
function AwaitingApproval({ viewer }: { viewer: Viewer }) {
  const who = viewer.email ?? 'Your account'
  const rejected = viewer.status === 'rejected'
  const title = rejected ? 'Access not granted' : 'Waiting for approval'
  const description = rejected
    ? `The admin has not approved ${who}.`
    : `${who} has signed up. The admin has to approve it before you can go on.`

  return (
    <GateCard
      icon={
        rejected ? (
          <ShieldAlert className="size-6" aria-hidden="true" />
        ) : (
          <Hourglass className="size-6" aria-hidden="true" />
        )
      }
      tone={rejected ? 'red' : 'amber'}
      title={title}
      description={description}
    >
      <p>
        {rejected
          ? 'If you think this is a mistake, contact the Form-E admin, who can approve the account from the admin panel.'
          : 'Only approved accounts can build questionnaires and run surveys. The Form-E admin decides on every sign-up from the admin panel; this page updates on its own as soon as that happens.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
          Back to home
        </Button>
        <SignOutButton label="Use another account" />
      </div>
    </GateCard>
  )
}

/** A surveyor on a page that builds or exports. */
function BuildersOnly() {
  return (
    <GateCard
      icon={<ShieldAlert className="size-6" aria-hidden="true" />}
      tone="amber"
      title="For survey builders"
      description="Your account is a surveyor: you fill the surveys assigned to you and follow your team, but do not build or download."
    >
      <p>Ask the admin if your role should change. Your surveys are one click away.</p>
      <Button nativeButton={false} render={<Link to="/surveys" />}>
        My surveys
      </Button>
    </GateCard>
  )
}

/** The admin area with a non-admin account signed in to it. */
function AdminsOnly({ viewer }: { viewer: Viewer }) {
  return (
    <GateCard
      icon={<ShieldAlert className="size-6" aria-hidden="true" />}
      tone="red"
      title="Admins only"
      description={`This area is for the admin account. You are signed in here as ${
        viewer.email ?? viewer.name ?? 'a non-admin'
      }.`}
    >
      <p>
        Sign out of the admin area and sign in with the admin email. The app's own sign-in is
        separate and is not affected. An existing admin can also make this account an admin from
        the People tab.
      </p>
      <div className="flex flex-wrap gap-2">
        <SignOutButton label="Sign out of admin" />
        <Button variant="ghost" nativeButton={false} render={<Link to="/" />}>
          Open the app
        </Button>
      </div>
    </GateCard>
  )
}

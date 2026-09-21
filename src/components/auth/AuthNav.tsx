import { Link, useNavigate } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { LogOut } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useViewer } from '#/hooks/useViewer'
import { AUTH_AREAS, type AuthArea } from '#/lib/auth/areas'

function initials(name: string | null, email: string | null): string {
  const source = (name ?? email ?? '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

/**
 * Header slot: sign in / sign up links, or the signed-in user and sign out.
 * Reads the session of whichever area it is rendered in.
 */
export function AuthNav({ area = 'app' }: { area?: AuthArea }) {
  const { loading, isAuthenticated, viewer } = useViewer()
  const { signOut } = useAuthActions()
  const navigate = useNavigate()
  const paths = AUTH_AREAS[area]

  // Same footprint as the signed-out buttons so the header does not jump.
  if (loading) return <div className="hidden h-10 w-40 sm:block" aria-hidden="true" />

  if (!isAuthenticated) {
    return (
      <div className="hidden items-center gap-2 sm:flex">
        <Link
          to={paths.login}
          className="flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign in
        </Link>
        <Link
          to={paths.signup}
          className="flex h-10 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-bold text-background no-underline transition-transform hover:opacity-90 active:scale-95"
        >
          Sign up
        </Link>
      </div>
    )
  }

  const label = viewer?.name || viewer?.email || 'Signed in'

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 pr-1 sm:flex">
        {viewer?.image ? (
          <img
            src={viewer.image}
            alt=""
            referrerPolicy="no-referrer"
            className="size-8 rounded-full ring-1 ring-foreground/10"
          />
        ) : (
          <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
            {initials(viewer?.name ?? null, viewer?.email ?? null)}
          </div>
        )}
        <span className="max-w-40 truncate text-sm font-semibold">{label}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-xl"
        onClick={() => void signOut().then(() => navigate({ to: paths.afterSignOut }))}
      >
        <LogOut data-icon="inline-start" />
        Sign out
      </Button>
    </div>
  )
}

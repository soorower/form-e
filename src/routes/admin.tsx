import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { Wordmark } from '#/components/Wordmark'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ShieldCheck } from 'lucide-react'
import ThemeToggle from '#/components/ThemeToggle'
import { AuthNav } from '#/components/auth/AuthNav'
import { AreaProvider } from '#/components/auth/area'
import { useViewer } from '#/hooks/useViewer'
import { ADMIN_AUTH_NAMESPACE, isAdminPath } from '#/lib/auth/areas'
import { adminConvex } from '#/lib/convex/admin-client'

const NAV_LINK =
  'text-muted-foreground transition-colors hover:text-foreground active:text-indigo-500'
const NAV_ACTIVE = { className: 'text-indigo-500' }

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
})

/**
 * The admin area is its own small app under /admin: its own Convex client,
 * its own session store (`storageNamespace`), its own sign-in pages, its
 * own header, and its own copies of the survey pages (/admin/surveys,
 * /admin/dashboard, …) so the admin builds and follows surveys on the admin
 * session. Signing in here does not touch whoever is signed in to the main
 * app in the same browser, and vice versa. The root layout skips the app's
 * header and footer for these routes.
 */
function AdminLayout() {
  return (
    <ConvexAuthProvider
      client={adminConvex}
      storageNamespace={ADMIN_AUTH_NAMESPACE}
      shouldHandleCode={() =>
        typeof window !== 'undefined' && isAdminPath(window.location.pathname)
      }
    >
      <AreaProvider area="admin">
        <AdminHeader />
        <Outlet />
      </AreaProvider>
    </ConvexAuthProvider>
  )
}

function AdminHeader() {
  const { isAdmin } = useViewer()
  return (
    <header className="print:hidden sticky top-0 z-50 border-b border-border bg-background/80 px-4 backdrop-blur-xl">
      <nav className="page-wrap-wide flex items-center justify-between py-3">
        <Link to="/admin" className="flex items-center gap-3 no-underline">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            <Wordmark className="text-xl" /> <span className="font-semibold text-muted-foreground">Admin</span>
          </span>
        </Link>
        {isAdmin && (
          <div className="hidden items-center gap-6 text-sm font-semibold md:flex">
            <Link to="/admin" className={NAV_LINK} activeProps={NAV_ACTIVE} activeOptions={{ exact: true }}>
              Approvals
            </Link>
            <Link to="/admin/surveys" className={NAV_LINK} activeProps={NAV_ACTIVE}>
              Surveys
            </Link>
            <Link to="/admin/dashboard" className={NAV_LINK} activeProps={NAV_ACTIVE}>
              Dashboard
            </Link>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="hidden text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Open the app
          </Link>
          <ThemeToggle />
          <AuthNav area="admin" />
        </div>
      </nav>
    </header>
  )
}

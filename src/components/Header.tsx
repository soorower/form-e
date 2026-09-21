import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'
import { AuthNav } from './auth/AuthNav'
import { useViewer } from '#/hooks/useViewer'

const NAV_LINK =
  'text-muted-foreground transition-colors hover:text-foreground active:text-indigo-500'
const NAV_ACTIVE = { className: 'text-indigo-500' }

export default function Header() {
  // Surveys and the dashboard need a signed-in user, the admin panel an
  // admin, so those links only show to people who can open them. During SSR
  // and the first client render nobody is signed in, which keeps hydration
  // consistent.
  const { isAuthenticated, isAdmin, isSurveyor } = useViewer()
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 px-4 backdrop-blur-xl transition-all duration-300">
      <nav className="page-wrap flex items-center justify-between py-4">
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="group flex items-center gap-3 no-underline transition-transform hover:scale-105"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
              <svg className="size-6" viewBox="0 0 32 32" fill="none">
                <path d="M4 24V10a2 2 0 012-2h20a2 2 0 012 2v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M4 24h24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="10" cy="24" r="2.5" fill="currentColor" />
                <circle cx="22" cy="24" r="2.5" fill="currentColor" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Form-E
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-sm font-semibold">
            <Link to="/" className={NAV_LINK} activeProps={NAV_ACTIVE}>
              Home
            </Link>
            <Link to="/about" className={NAV_LINK} activeProps={NAV_ACTIVE}>
              About
            </Link>
            {isAuthenticated && (
              <>
                <Link to="/surveys" className={NAV_LINK} activeProps={NAV_ACTIVE}>
                  {isSurveyor ? 'My surveys' : 'Surveys'}
                </Link>
                <Link to="/dashboard" className={NAV_LINK} activeProps={NAV_ACTIVE}>
                  Dashboard
                </Link>
              </>
            )}
            {isAdmin && (
              <Link to="/admin" className={NAV_LINK} activeProps={NAV_ACTIVE}>
                Admin
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 pr-4 mr-4 border-r border-white/10">
            <a
              href="https://github.com/TanStack"
              target="_blank"
              rel="noreferrer"
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" width="20" height="20">
                <path
                  fill="currentColor"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                />
              </svg>
            </a>
          </div>
          <ThemeToggle />
          <AuthNav />
        </div>
      </nav>
    </header>
  )
}

import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'
import { Wordmark } from './Wordmark'
import { BrandMark } from './BrandMark'
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
            <BrandMark size={40} className="shadow-lg shadow-primary/20" />
            <Wordmark className="text-2xl" />
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
          <ThemeToggle />
          <AuthNav />
        </div>
      </nav>
    </header>
  )
}

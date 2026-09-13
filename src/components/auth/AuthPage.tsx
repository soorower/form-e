import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useViewer } from '#/hooks/useViewer'
import { safeRedirect, type AuthMode } from '#/lib/auth/errors'
import { AuthForm } from './AuthForm'

interface AuthPageProps {
  mode: AuthMode
  redirect?: string
}

/** Shared layout for /login and /signup. Someone already signed in is sent on. */
export function AuthPage({ mode, redirect }: AuthPageProps) {
  const { loading, isAuthenticated } = useViewer()
  const navigate = useNavigate()
  const target = safeRedirect(redirect)

  useEffect(() => {
    if (!loading && isAuthenticated) void navigate({ href: target, replace: true })
  }, [loading, isAuthenticated, navigate, target])

  return (
    <main className="page-wrap flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
            <svg className="size-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M4 24V10a2 2 0 012-2h20a2 2 0 012 2v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M4 24h24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="10" cy="24" r="2.5" fill="currentColor" />
              <circle cx="22" cy="24" r="2.5" fill="currentColor" />
            </svg>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Form-E</p>
        </div>
        <AuthForm mode={mode} redirect={redirect} />
      </div>
    </main>
  )
}

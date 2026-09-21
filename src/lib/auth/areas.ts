/**
 * The app and the admin panel are two separate sign-in areas. Each has its
 * own pages, its own landing page after sign-in, and its own session store
 * (see routes/admin.tsx), so being signed in to one never signs you out of
 * the other, even in the same browser.
 */
export const AUTH_AREAS = {
  app: { login: '/login', signup: '/signup', home: '/surveys', afterSignOut: '/' },
  admin: {
    login: '/admin/login',
    signup: '/admin/signup',
    home: '/admin',
    afterSignOut: '/admin/login',
  },
} as const

export type AuthArea = keyof typeof AUTH_AREAS

/**
 * The survey pages exist twice: once in the app and once under /admin, where
 * they run on the admin session, so the admin builds and follows surveys
 * without signing in to the app. Page components take their links from
 * here via `useSurveyPaths()`.
 */
export const SURVEY_PATHS = {
  app: {
    list: '/surveys',
    create: '/create',
    dashboard: '/dashboard',
    editor: '/surveys/$surveyId',
    fill: '/surveys/$surveyId/fill',
    chat: '/surveys/$surveyId/chat',
  },
  admin: {
    list: '/admin/surveys',
    create: '/admin/create',
    dashboard: '/admin/dashboard',
    editor: '/admin/surveys/$surveyId',
    fill: '/admin/surveys/$surveyId/fill',
    chat: '/admin/surveys/$surveyId/chat',
  },
} as const

/**
 * Storage namespace for the admin area's tokens. The app's session uses the
 * library default (the deployment URL), so the two never share a key.
 */
export const ADMIN_AUTH_NAMESPACE = 'forme-admin'

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

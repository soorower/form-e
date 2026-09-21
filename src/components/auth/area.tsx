import { createContext, useContext, type ReactNode } from 'react'
import { SURVEY_PATHS, type AuthArea } from '#/lib/auth/areas'

const AreaContext = createContext<AuthArea>('app')

/** Marks a subtree as belonging to the admin area (routes/admin.tsx). */
export function AreaProvider({ area, children }: { area: AuthArea; children: ReactNode }) {
  return <AreaContext.Provider value={area}>{children}</AreaContext.Provider>
}

/** Which sign-in area the current page belongs to: the app (default) or the admin panel. */
export function useArea(): AuthArea {
  return useContext(AreaContext)
}

/** Route paths of the survey pages in the current area, for links and navigation. */
export function useSurveyPaths() {
  return SURVEY_PATHS[useArea()]
}

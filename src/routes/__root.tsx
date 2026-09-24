import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useLocation,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { convex, isConvexConfigured } from '../lib/convex/client'
import { isAdminPath } from '../lib/auth/areas'
import Footer from '../components/Footer'
import Header from '../components/Header'

import appCss from '../styles.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        // Fallback for routes without their own title (editor, fill page, …).
        title: 'Form-E',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      // The tab icon. Without these the starter's React logo was still what
      // browsers showed, since nothing pointed at public/favicon.ico.
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/logo192.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
})

/** The app's chrome. The admin area brings its own header (routes/admin.tsx). */
function RootLayout() {
  const adminArea = useLocation({ select: (location) => isAdminPath(location.pathname) })
  if (adminArea) return <Outlet />
  return (
    <>
      {/* Without the deployment URL every page just loads for ever; say why. */}
      {!isConvexConfigured() && (
        <p
          role="alert"
          className="bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground"
        >
          VITE_CONVEX_URL is not set, so nothing can load or save. Add it to .env.local (or the
          hosting project's environment) and rebuild.
        </p>
      )}
      <Header />
      <Outlet />
      <Footer />
    </>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        {/*
          The app's session. Admin routes nest a second provider with its own
          client and storage namespace, so an OAuth code arriving on an
          /admin URL is left for that one to exchange.
        */}
        <ConvexAuthProvider
          client={convex}
          shouldHandleCode={() =>
            typeof window !== 'undefined' && !isAdminPath(window.location.pathname)
          }
        >
          {children}
        </ConvexAuthProvider>
        <Scripts />
      </body>
    </html>
  )
}

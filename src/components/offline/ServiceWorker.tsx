import { useEffect, useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '#/components/ui/button'

/**
 * Registers the service worker (sw/sw.js, built to /sw.js) that keeps the
 * app on the tablet so it opens with no connection, and tells the app when a
 * newer version has been downloaded and is waiting to take over.
 */

/** How often an open app looks for a new version. */
const UPDATE_CHECK_MS = 60 * 60 * 1000

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()

function setWaiting(worker: ServiceWorker | null) {
  waiting = worker
  for (const listener of listeners) listener()
}

function watch(registration: ServiceWorkerRegistration) {
  // Only an update waits: the very first install takes over by itself.
  if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting)
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        setWaiting(installing)
      }
    })
  })
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (!import.meta.env.PROD) {
      // A worker left by a production build on this address would answer
      // for the dev server; it goes.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      return
    }
    let timer: ReturnType<typeof setInterval> | undefined
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        watch(registration)
        timer = setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_MS)
      })
      .catch(() => undefined)
    return () => clearInterval(timer)
  }, [])
  return null
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Takes the new version: the waiting worker steps in and the page reloads. */
function update() {
  if (!waiting) return
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  })
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

/**
 * "A new version is ready": shown once an update has downloaded. Never
 * applied by itself, so an interview on screen is never cut short.
 */
export function AppUpdateBanner() {
  const ready = useSyncExternalStore(
    subscribe,
    () => waiting !== null,
    () => false,
  )
  if (!ready) return null
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lg">
        <p>A new version of Form-E is ready.</p>
        <Button type="button" size="sm" onClick={update}>
          <RefreshCw data-icon="inline-start" />
          Update now
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setWaiting(null)}>
          Later
        </Button>
      </div>
    </div>
  )
}

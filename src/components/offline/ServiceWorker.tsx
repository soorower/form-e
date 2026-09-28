import { useEffect, useSyncExternalStore } from 'react'
import { useRouter } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { Button } from '#/components/ui/button'

/**
 * Registers the service worker (sw/sw.js, built to /sw.js) that keeps the
 * app on the tablet so it opens with no connection, and brings a newer
 * version in once it has downloaded.
 *
 * A new version takes over by itself whenever nothing can be lost: when the
 * app opens, and when the user moves to another page — but never while an
 * interview has answers that are not submitted (`useHoldAppUpdate`). Until
 * then "A new version is ready" offers it. Tablets used to keep the old
 * version for days because only that banner could bring the new one in.
 */

/** How often an open app looks for a new version. */
const UPDATE_CHECK_MS = 60 * 60 * 1000
/** Moving between pages or coming back to the app looks again, at most this often. */
const NAV_CHECK_MS = 5 * 60 * 1000

let waiting: ServiceWorker | null = null
let registration: ServiceWorkerRegistration | null = null
let lastCheck = 0
/** Interviews on screen with answers not yet submitted. */
let holds = 0
const listeners = new Set<() => void>()

/** Asks the server for a newer version (throttled unless `force`). */
function checkForUpdate(force = false) {
  if (!registration || (!force && Date.now() - lastCheck < NAV_CHECK_MS)) return
  lastCheck = Date.now()
  void registration.update().catch(() => undefined)
}

/** Brings in the waiting version now, unless an interview is under way. */
function applyIfIdle() {
  if (waiting && holds === 0) update()
}

/**
 * Keeps a new version from taking over by itself while `active` (an
 * interview with answers not yet submitted). The banner still offers it.
 */
export function useHoldAppUpdate(active: boolean) {
  useEffect(() => {
    if (!active) return
    holds += 1
    return () => {
      holds -= 1
    }
  }, [active])
}

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
  const router = useRouter()

  // Moving to another page leaves nothing behind (an unsubmitted interview
  // blocks the move first), so a waiting version takes over there.
  useEffect(
    () =>
      router.subscribe('onResolved', () => {
        applyIfIdle()
        checkForUpdate()
      }),
    [router],
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

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
      .then((registered) => {
        registration = registered
        lastCheck = Date.now()
        watch(registered)
        // Downloaded on an earlier visit: the app has only just opened, so
        // nothing is under way yet.
        applyIfIdle()
        timer = setInterval(() => checkForUpdate(true), UPDATE_CHECK_MS)
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
  const worker = waiting
  setWaiting(null)
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  })
  worker.postMessage({ type: 'SKIP_WAITING' })
}

/**
 * "A new version is ready": shown once an update has downloaded and could not
 * take over by itself because an interview is on screen.
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

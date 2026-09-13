import { useEffect, useState } from 'react'

/**
 * False while rendering on the server and during the first client render,
 * true afterwards. Convex queries take `'skip'` until this flips, so no
 * subscription is attempted outside the browser and the markup matches on
 * hydration.
 */
export function useConvexReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return ready
}

/** `args` when ready, otherwise Convex's skip token. */
export function argsOrSkip<T>(ready: boolean, args: T): T | 'skip' {
  return ready ? args : 'skip'
}

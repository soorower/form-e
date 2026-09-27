import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useConvex, useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import { encodeAnswers } from '#/lib/convex/response-codec'
import { noteSerialTaken } from '#/lib/offline/surveys'
import {
  RefusedResponseError,
  clearRefused,
  markRefused,
  onOutboxChange,
  readOutbox,
  removeFromOutbox,
  type PendingResponse,
} from '#/lib/questionnaire/outbox'

/**
 * How often waiting responses are sent again while any are left. The
 * `online` event alone is not enough: on a weak hotspot the tablet counts as
 * online the whole time, so that event never comes.
 */
export const RETRY_INTERVAL_MS = 45_000

/** What the server answered for a response it recorded. */
export interface SavedResponse {
  serial: number
  surveyNumber: string
}

export interface OutboxState {
  /** Everything kept on this device (every area), oldest first. */
  pending: PendingResponse[]
  /** Waiting to be sent by this area's session. */
  waiting: number
  /** Turned down by the server; kept until retried or discarded. */
  refused: PendingResponse[]
  /** Whether the connection to the server is up; null before it is known. */
  connected: boolean | null
  /** When a response last reached the server from this device. */
  lastSentAt: number | null
  /**
   * Sends one response, which must already be in the outbox, and takes it
   * out once the server has it. Null when it is already on its way. Throws
   * `RefusedResponseError` when the server turns it down.
   */
  send: (pending: PendingResponse) => Promise<SavedResponse | null>
  /** Sends everything waiting for this area now. */
  flush: () => void
  /** Puts the refused responses back in line and sends them. */
  retryRefused: () => void
  /** Reads the outbox again (after writing to it directly). */
  refresh: () => Promise<void>
}

const OutboxContext = createContext<OutboxState | null>(null)

const belongsTo = (area: 'app' | 'admin') => (response: PendingResponse) =>
  (response.area ?? 'app') === area

/**
 * Delivers the responses kept on this device, from whatever page is open:
 * straight away, when the connection comes back, when the app is brought to
 * the front again, and every `RETRY_INTERVAL_MS` while any are waiting. One
 * per sign-in area (the app's session in __root.tsx, the admin's in
 * routes/admin.tsx), each sending only what was collected under it, so a
 * response is always stamped with the account that collected it.
 */
export function OutboxProvider({
  area,
  children,
}: {
  area: 'app' | 'admin'
  children: ReactNode
}) {
  const submit = useMutation(api.responses.submit)
  const client = useConvex() as ReturnType<typeof useConvex> | null | undefined
  const [pending, setPending] = useState<PendingResponse[]>([])
  const [connected, setConnected] = useState<boolean | null>(null)
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)
  const inFlight = useRef(new Set<string>())

  const refresh = useCallback(async () => {
    setPending(await readOutbox())
  }, [])

  const send = useCallback(
    async (response: PendingResponse): Promise<SavedResponse | null> => {
      if (inFlight.current.has(response.id)) return null
      inFlight.current.add(response.id)
      try {
        const saved = await submit({
          id: response.id,
          questionnaireId: response.questionnaireId,
          enumerator: response.enumerator,
          language: response.language,
          ...(response.respondent ? { respondent: response.respondent } : {}),
          answers: encodeAnswers(response.answers),
          // When Submit was pressed, so an interview kept on an offline
          // tablet is dated by the interview, not by the sync.
          collectedAt: response.queuedAt,
          ...(response.paperSerial !== undefined ? { paperSerial: response.paperSerial } : {}),
          ...(response.shareToken !== undefined ? { shareToken: response.shareToken } : {}),
          ...(response.claimedSerial !== undefined
            ? { claimedSerial: response.claimedSerial }
            : {}),
        })
        // The saved block learns the number is taken before the waiting copy
        // (which kept it taken until now) goes, so no offline interview can
        // pick it up in between.
        await noteSerialTaken(response.questionnaireId, saved.serial)
        await removeFromOutbox(response.id)
        setLastSentAt(Date.now())
        return saved
      } catch (error) {
        // A rejection is the server's decision, not the network's (Convex
        // holds a request while offline rather than failing it), so sending
        // the same copy again by itself would only be refused again. It is
        // kept, with the reason, until someone retries or discards it.
        const reason =
          error instanceof ConvexError ? String(error.data) : 'The server could not store it.'
        await markRefused(response.id, reason)
        throw new RefusedResponseError(reason)
      } finally {
        inFlight.current.delete(response.id)
      }
    },
    [submit],
  )

  const flush = useCallback(() => {
    void readOutbox().then((all) => {
      setPending(all)
      for (const response of all.filter(belongsTo(area))) {
        if (response.refused === undefined) send(response).catch(() => undefined)
      }
    })
  }, [area, send])

  const retryRefused = useCallback(() => {
    void clearRefused().then(flush)
  }, [flush])

  // Straight away, whenever the outbox changes (here or in another tab),
  // when the connection or the app comes back.
  useEffect(() => {
    flush()
    const unsubscribe = onOutboxChange(() => void refresh())
    const visible = () => {
      if (document.visibilityState === 'visible') flush()
    }
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', visible)
    return () => {
      unsubscribe()
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [flush, refresh])

  const waiting = pending.filter(
    (response) => belongsTo(area)(response) && response.refused === undefined,
  ).length

  // Again and again. Reading the outbox is cheap, and doing it whatever this
  // tab believes also picks up what another tab or an older page kept.
  useEffect(() => {
    const timer = setInterval(flush, RETRY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [flush])

  // Whether the server can be reached, for the status line.
  useEffect(() => {
    if (!client?.subscribeToConnectionState) return
    const update = () => {
      const state = client.connectionState()
      setConnected(state.isWebSocketConnected)
    }
    update()
    return client.subscribeToConnectionState(update)
  }, [client])

  const value = useMemo<OutboxState>(
    () => ({
      pending,
      waiting,
      refused: pending.filter((response) => response.refused !== undefined),
      connected,
      lastSentAt,
      send,
      flush,
      retryRefused,
      refresh,
    }),
    [pending, waiting, connected, lastSentAt, send, flush, retryRefused, refresh],
  )
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>
}

export function useOutbox(): OutboxState {
  const state = useContext(OutboxContext)
  if (!state) throw new Error('useOutbox needs an <OutboxProvider> above it.')
  return state
}

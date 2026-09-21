import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import {
  QuestionnaireRenderer,
  type QuestionnaireCardDraws,
  type QuestionnaireCardExposure,
  type SubmitOutcome,
} from '#/components/renderer/QuestionnaireRenderer'
import { useSurveyPaths } from '#/components/auth/area'
import { useViewer } from '#/hooks/useViewer'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { encodeAnswers } from '#/lib/convex/response-codec'
import { formatSurveyNumber, uid } from '#/lib/questionnaire/factory'
import {
  queueResponse,
  readOutbox,
  removeFromOutbox,
  type PendingResponse,
} from '#/lib/questionnaire/outbox'
import { getDeviceEnumerator, setDeviceEnumerator } from '#/lib/questionnaire/storage'
import type { SurveyResponse } from '#/lib/questionnaire/types'

/**
 * How long Submit waits for the server. Convex holds a mutation until the
 * connection is back rather than failing, so without a limit a tablet with no
 * signal sat on "Saving…" for good.
 */
const SAVE_TIMEOUT_MS = 10_000

/**
 * How long a balanced block waits for the server to hand out its cards
 * before the tablet draws the least-used ones itself from the last counts
 * it saw. An interview must never be stuck behind a weak signal.
 */
const DRAW_TIMEOUT_MS = 6_000

/**
 * The respondent-facing page opened on the tablet in the field. Public, so a
 * shared tablet works without signing in (the enumerator picks a name). A
 * signed-in surveyor is recorded under their own account name and walks
 * through the questions one at a time.
 */
export function FillPage({ surveyId, steps }: { surveyId: string; steps?: boolean }) {
  const paths = useSurveyPaths()
  const ready = useConvexReady()
  const questionnaire = decodeQuestionnaire(
    useQuery(api.questionnaires.get, ready ? { id: surveyId } : 'skip'),
  )
  const serial = useQuery(api.responses.nextSerial, ready ? { questionnaireId: surveyId } : 'skip')
  const exposureRows = useQuery(
    api.responses.cardExposure,
    ready ? { questionnaireId: surveyId } : 'skip',
  )
  const submit = useMutation(api.responses.submit)
  const drawCards = useMutation(api.responses.drawCards)
  const { viewer, isSurveyor, canBuild } = useViewer()
  const [enumerator, setEnumerator] = useState('')
  // The id the interview on screen is saved under. Known from the start, not
  // only at Submit, because the server reserves the interview's cards under it.
  const [interviewId, setInterviewId] = useState(() => uid())
  // What the server handed that interview; `sets: null` = no answer in time.
  const [drawn, setDrawn] = useState<{ id: string; sets: QuestionnaireCardDraws | null } | null>(
    null,
  )
  // Responses kept on this device that the server has not confirmed yet.
  const [waiting, setWaiting] = useState(0)
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    setEnumerator(getDeviceEnumerator())
  }, [])

  const balanced =
    questionnaire?.questions.some(
      (question) =>
        question.type === 'choice_experiment' &&
        question.drawMode === 'balanced' &&
        question.cards.length > 0,
    ) ?? false

  /**
   * Balanced blocks get their cards from the server, which counts what every
   * tablet has shown and is showing, so no two interviews starting together
   * are given the same "least-used" cards. Asking twice for one interview
   * returns the same cards. With no answer in time the blocks draw for
   * themselves; a late answer then changes nothing already on screen.
   */
  useEffect(() => {
    if (!ready || !balanced) return
    let cancelled = false
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    const giveUp = setTimeout(
      () => {
        if (cancelled) return
        setDrawn((current) =>
          current?.id === interviewId ? current : { id: interviewId, sets: null },
        )
      },
      offline ? 0 : DRAW_TIMEOUT_MS,
    )
    drawCards({ questionnaireId: surveyId, responseId: interviewId })
      .then((rows) => {
        if (cancelled) return
        clearTimeout(giveUp)
        setDrawn({
          id: interviewId,
          sets: Object.fromEntries(rows.map((row) => [row.questionId, row.sets])),
        })
      })
      .catch(() => {
        if (cancelled) return
        clearTimeout(giveUp)
        setDrawn((current) =>
          current?.id === interviewId ? current : { id: interviewId, sets: null },
        )
      })
    return () => {
      cancelled = true
      clearTimeout(giveUp)
    }
  }, [ready, balanced, surveyId, interviewId, drawCards])

  /**
   * Sends one queued response and takes it out of the outbox once the server
   * has it. Null when that response is already on its way: Convex keeps a
   * mutation until the connection returns, so asking twice would only queue
   * it twice.
   */
  const send = useCallback(
    async (pending: PendingResponse) => {
      if (inFlight.current.has(pending.id)) return null
      inFlight.current.add(pending.id)
      try {
        const saved = await submit({
          id: pending.id,
          questionnaireId: pending.questionnaireId,
          enumerator: pending.enumerator,
          language: pending.language,
          answers: encodeAnswers(pending.answers),
        })
        removeFromOutbox(pending.id)
        return saved
      } finally {
        inFlight.current.delete(pending.id)
        setWaiting(readOutbox().length)
      }
    },
    [submit],
  )

  /** Whatever an earlier visit could not deliver, from any survey on this device. */
  const flushOutbox = useCallback(() => {
    const pending = readOutbox()
    setWaiting(pending.length)
    for (const response of pending) send(response).catch(() => undefined)
  }, [send])

  useEffect(() => {
    if (!ready) return
    flushOutbox()
    window.addEventListener('online', flushOutbox)
    return () => window.removeEventListener('online', flushOutbox)
  }, [ready, flushOutbox])

  /**
   * The response goes into the outbox first, so it survives a reload or a
   * closed tab, and only then to the server, which assigns the real serial.
   * With no answer in time the enumerator is told it is kept on the device
   * and can carry on; a refusal is thrown so the form says so.
   */
  async function handleSubmit(response: SurveyResponse): Promise<SubmitOutcome> {
    const pending: PendingResponse = {
      id: response.id,
      questionnaireId: response.questionnaireId,
      enumerator: response.enumerator,
      language: response.language,
      answers: response.answers,
      queuedAt: Date.now(),
    }
    const stored = queueResponse(pending)
    const sending = send(pending)
    // Kept on the device, so a late failure is retried by the next flush.
    sending.catch(() => undefined)
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    // Without a stored copy the only safe thing is to wait for the server.
    if (!stored) return { surveyNumber: (await sending)?.surveyNumber }

    const timedOut = Symbol('timed out')
    const saved = await Promise.race([
      sending,
      new Promise<typeof timedOut>((resolve) =>
        setTimeout(() => resolve(timedOut), offline ? 0 : SAVE_TIMEOUT_MS),
      ),
    ])
    if (saved === timedOut || saved === null) {
      // Counted only now, so the notice does not flash during a normal save.
      setWaiting(readOutbox().length)
      return { pending: true }
    }
    return { surveyNumber: saved.surveyNumber }
  }

  function changeEnumerator(name: string) {
    setEnumerator(name)
    setDeviceEnumerator(name)
  }

  if (questionnaire === undefined) {
    return <main className="page-wrap px-4 py-12 text-muted-foreground">Loading…</main>
  }

  if (questionnaire === null) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Survey not found</h1>
        <p className="mt-2 text-muted-foreground">
          This survey may have been deleted.
        </p>
      </main>
    )
  }

  const nextSerial = serial ?? 1

  // Balanced blocks wait for the server's cards. The counts are only what a
  // block falls back on once the server has answered without cards for it or
  // has not answered in time; cards other tablets hold right now count too.
  const assigned = drawn?.id === interviewId ? drawn : null
  let cardExposure: QuestionnaireCardExposure | undefined
  if (!balanced || assigned) {
    cardExposure = {}
    for (const { questionId, set, count, reserved } of exposureRows ?? []) {
      cardExposure[questionId] = {
        ...(cardExposure[questionId] ?? {}),
        [set]: count + reserved,
      }
    }
  }

  // A signed-in, approved account collects under its own name; the server
  // stamps the account onto the response as well.
  const account = viewer?.approved ? viewer : null
  const stepped = isSurveyor || steps === true
  const lockedName = account
    ? account.code
      ? `${account.displayName} (${account.code})`
      : account.displayName
    : null

  return (
    <main className="page-wrap px-4 py-8 sm:py-12">
      <QuestionnaireRenderer
        key={stepped ? 'steps' : 'page'}
        questionnaire={questionnaire}
        meta={
          account
            ? {
                serial: nextSerial,
                surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, nextSerial),
                enumerator: account.displayName,
                locked: true,
              }
            : {
                serial: nextSerial,
                surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, nextSerial),
                enumerator,
                onEnumeratorChange: changeEnumerator,
              }
        }
        cardExposure={cardExposure}
        cardDraws={assigned?.sets ?? undefined}
        responseId={interviewId}
        onRestart={() => setInterviewId(uid())}
        onSubmit={handleSubmit}
        mode={stepped ? 'steps' : 'page'}
      />
      {waiting > 0 && (
        <div
          role="status"
          className="mx-auto mt-6 flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-700 dark:text-amber-300"
        >
          <p>
            {waiting === 1
              ? '1 response is kept on this device and is not on the server yet.'
              : `${waiting} responses are kept on this device and are not on the server yet.`}{' '}
            They are sent when the internet is back.
            <span lang="bn" className="block">
              {waiting} টি উত্তর এই ডিভাইসে রাখা আছে, এখনও সার্ভারে পৌঁছায়নি। ইন্টারনেট ফিরে এলে নিজে থেকেই পাঠানো হবে।
            </span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={flushOutbox}>
            Send now
          </Button>
        </div>
      )}
      <p className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-muted-foreground">
        {lockedName && <span>Collecting as {lockedName}</span>}
        {account && (
          <Link to={paths.chat} params={{ surveyId }} className="hover:text-foreground">
            Team chat
          </Link>
        )}
        {isSurveyor && (
          <Link to={paths.list} className="hover:text-foreground">
            Back to my surveys
          </Link>
        )}
        {canBuild && (
          <Link to={paths.editor} params={{ surveyId }} className="hover:text-foreground">
            Back to the editor
          </Link>
        )}
      </p>
    </main>
  )
}

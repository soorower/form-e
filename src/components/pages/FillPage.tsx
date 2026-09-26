import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  QuestionnaireRenderer,
  type QuestionnaireCardDraws,
  type QuestionnaireCardExposure,
  type QuestionnairePlanExposure,
  type SubmitOutcome,
} from '#/components/renderer/QuestionnaireRenderer'
import { useSurveyPaths } from '#/components/auth/area'
import { useViewer } from '#/hooks/useViewer'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { encodeAnswers } from '#/lib/convex/response-codec'
import { formatSurveyNumber, uid } from '#/lib/questionnaire/factory'
import {
  RefusedResponseError,
  clearRefused,
  forgetOpenInterview,
  markRefused,
  queueResponse,
  readOutbox,
  recallOpenInterview,
  rememberOpenInterview,
  removeFromOutbox,
  type PendingResponse,
} from '#/lib/questionnaire/outbox'
import { paperScenarios } from '#/lib/questionnaire/paper'
import { followsPlan } from '#/lib/questionnaire/scenario-plan'
import { getDeviceEnumerator, setDeviceEnumerator } from '#/lib/questionnaire/storage'
import type { SurveyResponse } from '#/lib/questionnaire/types'

/**
 * How long Submit waits for the server. Convex holds a mutation until the
 * connection is back rather than failing, so without a limit a tablet with no
 * signal sat on "Saving…" for good.
 */
const SAVE_TIMEOUT_MS = 10_000

/**
 * How long a balanced or planned block waits for the server to hand out its
 * cards before the tablet picks for itself from the last counts it saw. An
 * interview must never be stuck behind a weak signal.
 */
const DRAW_TIMEOUT_MS = 6_000

/**
 * The respondent-facing page opened on the tablet in the field. Public, so a
 * shared tablet works without signing in (the enumerator picks a name). A
 * signed-in surveyor is recorded under their own account name and walks
 * through the questions one at a time.
 */
export function FillPage({
  surveyId,
  steps,
  paperSerial,
}: {
  surveyId: string
  steps?: boolean
  /**
   * Typing in the printed paper form with this survey number: the response
   * keeps that number and shows the cards printed on the form.
   */
  paperSerial?: number
}) {
  const paths = useSurveyPaths()
  const navigate = useNavigate()
  const ready = useConvexReady()
  const stored = useQuery(api.questionnaires.get, ready ? { id: surveyId } : 'skip')
  // Decoded once per server row: decoding on every render made a new object
  // each time, and everything keyed on it re-ran for nothing.
  const questionnaire = useMemo(() => decodeQuestionnaire(stored), [stored])
  const serial = useQuery(api.responses.nextSerial, ready ? { questionnaireId: surveyId } : 'skip')
  const paperCheck = useQuery(
    api.responses.paperCheck,
    ready && paperSerial !== undefined ? { questionnaireId: surveyId, serial: paperSerial } : 'skip',
  )
  // Paper numbers typed in on this page: once recorded, the check above says
  // "already recorded", which must not replace the confirmation screen.
  const [enteredHere, setEnteredHere] = useState<number | null>(null)
  const submit = useMutation(api.responses.submit)
  const drawCards = useMutation(api.responses.drawCards)
  const abandonDraw = useMutation(api.responses.abandonDraw)
  const { viewer, isSurveyor, canBuild, loading: viewerLoading } = useViewer()
  const [enumerator, setEnumerator] = useState('')
  // Whether the interview on screen has answers that are not submitted yet.
  const [dirty, setDirty] = useState(false)
  // The id the interview on screen is saved under. Known from the start, not
  // only at Submit, because the server reserves the interview's cards under it.
  const [interviewId, setInterviewId] = useState(() => uid())
  // What the server handed that interview; `sets: null` = no answer in time.
  // `serial` is the survey number the server held for it along with the cards.
  const [drawn, setDrawn] = useState<{
    id: string
    sets: QuestionnaireCardDraws | null
    serial?: number
  } | null>(null)
  // Responses kept on this device: not confirmed by the server yet, or
  // refused by it (those carry the reason and wait for a deliberate retry).
  const [outbox, setOutbox] = useState<PendingResponse[]>([])
  const waiting = outbox.filter((response) => response.refused === undefined).length
  const refused = outbox.filter((response) => response.refused !== undefined)
  const inFlight = useRef(new Set<string>())
  // Interviews that reached Submit. Their cards are accounted for by the
  // response (or by the outbox copy waiting to be sent), so they are never
  // handed back.
  const submitted = useRef(new Set<string>())

  useEffect(() => {
    setEnumerator(getDeviceEnumerator())
  }, [])

  /**
   * Hands back the cards of an interview nobody submitted, so the next
   * tablet sees them as free. Left alone, they stayed reserved for two hours
   * and every reload made other tablets skip cards that were never shown.
   */
  const abandon = useCallback(
    (id: string) => {
      if (submitted.current.has(id)) return
      abandonDraw({ responseId: id }).catch(() => undefined)
    },
    [abandonDraw],
  )

  // Blocks the server decides for: the balanced ones, and the ones that follow
  // the creator's scenario plan.
  const serverDraws =
    paperSerial === undefined &&
    (questionnaire?.questions.some(
      (question) =>
        question.type === 'choice_experiment' &&
        question.cards.length > 0 &&
        (question.drawMode === 'balanced' || followsPlan(question)),
    ) ??
      false)

  // A paper form shows exactly the cards printed on it for its number.
  const paperDraws = useMemo<QuestionnaireCardDraws | undefined>(() => {
    if (paperSerial === undefined || !questionnaire) return undefined
    return Object.fromEntries(
      questionnaire.questions.flatMap((question) => {
        if (question.type !== 'choice_experiment') return []
        const printed = paperScenarios(question, paperSerial)
        return [
          [question.id, { sets: printed.scenarios.map((scenario) => scenario.set), planRow: printed.planRow }],
        ]
      }),
    )
  }, [paperSerial, questionnaire])

  // The counts only matter once a block has to pick for itself, which is
  // when the server did not answer in time. Subscribing on every tablet
  // meant every submit anywhere re-read the whole survey's responses for
  // every open form, and past Convex's read limit that took the form down.
  const gaveUp = drawn?.id === interviewId && drawn.sets === null
  const exposure = useQuery(
    api.responses.cardExposure,
    ready && serverDraws && gaveUp ? { questionnaireId: surveyId } : 'skip',
  )

  /**
   * These blocks get their cards from the server, which counts what every
   * tablet has shown and is showing, so no two interviews starting together
   * are given the same "least-used" cards or the same plan row. Asking twice
   * for one interview returns the same cards. With no answer in time the
   * blocks pick for themselves; a late answer then changes nothing already on
   * screen.
   */
  useEffect(() => {
    if (!ready || !serverDraws) return
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
          sets: Object.fromEntries(
            rows.map((row) => [row.questionId, { sets: row.sets, planRow: row.planRow }]),
          ),
          serial: rows.find((row) => row.serial !== undefined)?.serial,
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
  }, [ready, serverDraws, surveyId, interviewId, drawCards])

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
          ...(pending.respondent ? { respondent: pending.respondent } : {}),
          answers: encodeAnswers(pending.answers),
          // When Submit was pressed, so an interview kept on an offline
          // tablet is dated by the interview, not by the sync.
          collectedAt: pending.queuedAt,
          ...(pending.paperSerial !== undefined ? { paperSerial: pending.paperSerial } : {}),
        })
        removeFromOutbox(pending.id)
        return saved
      } catch (error) {
        // A rejection is the server's decision, not the network's (Convex
        // holds a request while offline rather than failing it), so sending
        // the same copy again by itself would only be refused again. It is
        // kept, with the reason, until someone retries or discards it.
        const reason =
          error instanceof ConvexError ? String(error.data) : 'The server could not store it.'
        markRefused(pending.id, reason)
        throw new RefusedResponseError(reason)
      } finally {
        inFlight.current.delete(pending.id)
        setOutbox(readOutbox())
      }
    },
    [submit],
  )

  /** Whatever an earlier visit could not deliver, from any survey on this device. */
  const flushOutbox = useCallback(() => {
    const pending = readOutbox()
    setOutbox(pending)
    for (const response of pending) {
      if (response.refused === undefined) send(response).catch(() => undefined)
    }
  }, [send])

  /** "Try again" on the refused responses: back in line, then sent. */
  const retryRefused = useCallback(() => {
    clearRefused()
    flushOutbox()
  }, [flushOutbox])

  function discardRefused(id: string) {
    const sure = window.confirm(
      'Discard this response for good? It is not on the server and cannot be recovered afterwards.',
    )
    if (!sure) return
    removeFromOutbox(id)
    setOutbox(readOutbox())
  }

  // Closing the tab or walking away from the page gives the cards back. That
  // release is best effort (it needs an open socket, and a discarded tab
  // fires no pagehide at all), so the interview id is also noted on the
  // device and the next fill page opened here hands back whatever the last
  // one was still holding; otherwise other tablets skipped those cards for
  // two hours.
  useEffect(() => {
    if (!ready || !serverDraws) return
    const previous = recallOpenInterview()
    if (previous && previous !== interviewId) {
      abandonDraw({ responseId: previous }).catch(() => undefined)
    }
    rememberOpenInterview(interviewId)
    const release = () => abandon(interviewId)
    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [ready, serverDraws, interviewId, abandon, abandonDraw])

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
    submitted.current.add(response.id)
    forgetOpenInterview(response.id)
    const pending: PendingResponse = {
      id: response.id,
      questionnaireId: response.questionnaireId,
      enumerator: response.enumerator,
      language: response.language,
      ...(response.respondent ? { respondent: response.respondent } : {}),
      answers: response.answers,
      queuedAt: Date.now(),
      ...(paperSerial !== undefined ? { paperSerial } : {}),
    }
    if (paperSerial !== undefined) setEnteredHere(paperSerial)
    const kept = queueResponse(pending)
    const sending = send(pending)
    // Kept on the device, so a late refusal shows up in the notice below.
    sending.catch(() => undefined)
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false

    const timedOut = Symbol('timed out')
    const saved = await Promise.race([
      sending,
      new Promise<typeof timedOut>((resolve) =>
        setTimeout(() => resolve(timedOut), offline ? 0 : SAVE_TIMEOUT_MS),
      ),
    ])
    if (saved === timedOut || saved === null) {
      // Counted only now, so the notice does not flash during a normal save.
      setOutbox(readOutbox())
      // With no copy on the device (storage full or blocked) only this open
      // page holds the response; waiting here for ever, button greyed out,
      // was the alternative.
      return { pending: true, unstored: !kept }
    }
    return { surveyNumber: saved.surveyNumber }
  }

  function changeEnumerator(name: string) {
    setEnumerator(name)
    setDeviceEnumerator(name)
  }

  // Also while the viewer is unknown: a surveyor's form used to open as the
  // one-page version and remount as the stepper a moment later, losing what
  // had been entered in between.
  if (questionnaire === undefined || viewerLoading) {
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

  // These blocks wait for the server's answer. The counts are only what a
  // block falls back on once the server has answered without cards for it or
  // has not answered in time; cards and plan rows other tablets hold right now
  // count too.
  const assigned = drawn?.id === interviewId ? drawn : null
  // The number the server held along with the cards is the one this interview
  // is recorded under; without one, the prediction.
  const nextSerial = paperSerial ?? assigned?.serial ?? serial ?? 1
  const paperOwner = paperCheck?.owner ?? null
  // Refused before typing starts: a number already recorded, or not the
  // surveyor's own. After a submit here the check turns to "already
  // recorded", which is this page's own doing.
  const paperProblem =
    paperSerial !== undefined && enteredHere !== paperSerial ? (paperCheck?.problem ?? null) : null
  const openPaper = (number: number) =>
    navigate({ to: paths.fill, params: { surveyId }, search: { paper: number } })
  let cardExposure: QuestionnaireCardExposure | undefined
  let planExposure: QuestionnairePlanExposure | undefined
  if (!serverDraws || assigned) {
    cardExposure = {}
    for (const { questionId, set, count, reserved } of exposure?.cards ?? []) {
      cardExposure[questionId] = {
        ...(cardExposure[questionId] ?? {}),
        [set]: count + reserved,
      }
    }
    planExposure = {}
    for (const { questionId, row, count, reserved } of exposure?.planRows ?? []) {
      planExposure[questionId] = {
        ...(planExposure[questionId] ?? {}),
        [row]: count + reserved,
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
      {/* Opening the form for respondents used to be a one-way door: the only
          way back was a small link far below the last question. */}
      {(canBuild || isSurveyor) && (
        <div className="mx-auto mb-5 flex w-full max-w-3xl flex-wrap items-center justify-between gap-3">
          {canBuild ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to={paths.editor} params={{ surveyId }} />}
            >
              <ArrowLeft data-icon="inline-start" />
              Back to the editor
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to={paths.list} />}
            >
              <ArrowLeft data-icon="inline-start" />
              My surveys
            </Button>
          )}
          {canBuild && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Open for respondents · answers here are recorded
            </span>
          )}
        </div>
      )}

      {(canBuild || isSurveyor) && (
        <PaperEntryBar
          current={paperSerial}
          prefix={questionnaire.surveyCodePrefix}
          onOpen={openPaper}
          onLeave={() => navigate({ to: paths.fill, params: { surveyId }, search: {} })}
        />
      )}
      {paperSerial !== undefined && !paperProblem && (
        <p className="mx-auto mb-5 w-full max-w-3xl rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Typing in paper form{' '}
          <span className="font-mono font-semibold">
            {formatSurveyNumber(questionnaire.surveyCodePrefix, paperSerial)}
          </span>
          {paperOwner && <> by {paperOwner.name}{paperOwner.code ? ` (${paperOwner.code})` : ''}</>}. The
          scenario cards below are the ones printed on that form; copy the answers exactly as ticked.
        </p>
      )}

      <InterviewGuard active={dirty} />
      {paperProblem ? (
        <p
          role="alert"
          className="mx-auto w-full max-w-3xl rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-destructive"
        >
          {paperProblem} Enter another survey number above.
        </p>
      ) : (
        <QuestionnaireRenderer
          questionnaire={questionnaire}
          meta={
            paperSerial !== undefined && (paperOwner || account)
              ? {
                  serial: nextSerial,
                  surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, nextSerial),
                  // The interviewer is whoever the number was handed to.
                  enumerator: paperOwner?.name ?? account!.displayName,
                  locked: true,
                }
              : account
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
          planExposure={planExposure}
          cardDraws={paperDraws ?? assigned?.sets ?? undefined}
          responseId={interviewId}
          onRestart={() => {
            // Typing in paper forms: straight on to the next number.
            if (paperSerial !== undefined) {
              openPaper(paperSerial + 1)
              return
            }
            abandon(interviewId)
            setInterviewId(uid())
          }}
          onDirtyChange={setDirty}
          onSubmit={handleSubmit}
          mode={stepped && paperSerial === undefined ? 'steps' : 'page'}
        />
      )}
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
      {refused.length > 0 && (
        <div
          role="alert"
          className="mx-auto mt-4 w-full max-w-3xl rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-medium">
            {refused.length === 1
              ? 'The server did not accept 1 response kept on this device.'
              : `The server did not accept ${refused.length} responses kept on this device.`}{' '}
            They stay here until you try again or discard them.
          </p>
          <ul className="mt-2 space-y-1.5">
            {refused.map((response) => (
              <li key={response.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {new Date(response.queuedAt).toLocaleString()} · {response.enumerator || '(no name)'}
                  : {response.refused}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => discardRefused(response.id)}>
                  Discard
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={retryRefused}>
            Try again
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

      </p>
    </main>
  )
}

/**
 * Holds back leaving the page while the interview has answers that are not
 * submitted: a tap on a header link, a back-swipe, a reload. The confirm is
 * the browser's own, so it works however the app's own dialogs are doing.
 */
function InterviewGuard({ active }: { active: boolean }) {
  useBlocker({
    shouldBlockFn: () =>
      active &&
      !window.confirm(
        'This interview has not been submitted. Leave the page and lose its answers?',
      ),
    enableBeforeUnload: () => active,
  })
  return null
}

/**
 * "Type in a paper form": the survey number printed on the form opens the
 * form with that number and the cards printed on it. Shown to builders and
 * surveyors, never on a shared tablet's public page.
 */
function PaperEntryBar({
  current,
  prefix,
  onOpen,
  onLeave,
}: {
  current?: number
  prefix: string
  onOpen: (serial: number) => void
  onLeave: () => void
}) {
  const [draft, setDraft] = useState(current ? String(current) : '')
  useEffect(() => setDraft(current ? String(current) : ''), [current])
  const number = Math.floor(Number(draft))
  const valid = Number.isFinite(number) && number >= 1
  return (
    <form
      className="mx-auto mb-5 flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onOpen(number)
      }}
    >
      <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
      <label htmlFor="paper-number" className="text-sm font-medium">
        Type in a paper form · survey no.
      </label>
      <span className="font-mono text-sm text-muted-foreground">{prefix}</span>
      <Input
        id="paper-number"
        type="number"
        min={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="h-8 w-24 tabular-nums"
      />
      <Button type="submit" size="sm" variant="outline" disabled={!valid}>
        Open
      </Button>
      {current !== undefined && (
        <Button type="button" size="sm" variant="ghost" onClick={onLeave}>
          Back to tablet interviews
        </Button>
      )}
    </form>
  )
}

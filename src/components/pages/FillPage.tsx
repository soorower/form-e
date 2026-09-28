import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CloudOff, FileText, HardDriveDownload } from 'lucide-react'
import { useConvex, useMutation, useQuery } from 'convex/react'
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
import { useArea, useSurveyPaths } from '#/components/auth/area'
import { useConfirm } from '#/components/ConfirmProvider'
import { useOutbox } from '#/components/offline/OutboxProvider'
import { useHoldAppUpdate } from '#/components/offline/ServiceWorker'
import { UnsentPanel } from '#/components/offline/UnsentPanel'
import { useOfflineSurvey } from '#/hooks/useOfflineSurvey'
import { useViewer } from '#/hooks/useViewer'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { offlineSerial, type OfflineExposure } from '#/lib/offline/surveys'
import { formatSurveyNumber, uid } from '#/lib/questionnaire/factory'
import {
  forgetOpenInterview,
  queueResponse,
  recallOpenInterview,
  rememberOpenInterview,
  type PendingResponse,
} from '#/lib/questionnaire/outbox'
import { paperScenarios } from '#/lib/questionnaire/paper'
import { findPlanRow, followsPlan, planRowForSerial } from '#/lib/questionnaire/scenario-plan'
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
 * signed-in surveyor is recorded under their own account name. The whole form
 * is one scrolling page; ?steps=1 walks through it one question at a time.
 */
export function FillPage({
  surveyId,
  steps,
  paperSerial,
  share,
}: {
  surveyId: string
  steps?: boolean
  /**
   * Opened through a team member's share link (`/r/<token>`): the respondent
   * answers on their own, sees nothing of the team's tools, and the response
   * is credited to `sharedBy`.
   */
  share?: {
    token: string
    sharedBy: string
    /** A link for one survey number (106 sent to one person): that number. */
    serial?: number | null
  }
  /**
   * Typing in the printed paper form with this survey number: the response
   * keeps that number and shows the cards printed on the form.
   */
  paperSerial?: number
}) {
  const paths = useSurveyPaths()
  const area = useArea()
  const navigate = useNavigate()
  const ready = useConvexReady()
  const client = useConvex() as ReturnType<typeof useConvex> | null | undefined
  const liveStored = useQuery(api.questionnaires.get, ready ? { id: surveyId } : 'skip')
  // Through a share link: the link's own number, or the sharer's next one.
  const serial = useQuery(
    api.responses.nextSerial,
    ready
      ? { questionnaireId: surveyId, ...(share ? { shareToken: share.token } : {}) }
      : 'skip',
  )
  const paperCheck = useQuery(
    api.responses.paperCheck,
    ready && paperSerial !== undefined ? { questionnaireId: surveyId, serial: paperSerial } : 'skip',
  )
  // Paper numbers typed in on this page: once recorded, the check above says
  // "already recorded", which must not replace the confirmation screen.
  const [enteredHere, setEnteredHere] = useState<number | null>(null)
  const drawCards = useMutation(api.responses.drawCards)
  const abandonDraw = useMutation(api.responses.abandonDraw)
  const {
    viewer,
    isSurveyor,
    canBuild,
    loading: viewerLoading,
    offline: viewerOffline,
  } = useViewer()
  // Responses kept on this device until the server has them; the provider
  // (components/offline/OutboxProvider) sends them from any page.
  const { pending: outbox, send } = useOutbox()
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
  // The number the interview on screen is done under, once known: the one the
  // server held with its cards, or the next free one in the surveyor's own
  // block. Fixed for the whole interview, so it never changes halfway through.
  const [fixedSerial, setFixedSerial] = useState<{ id: string; serial: number } | null>(null)
  // Interviews that reached Submit. Their cards are accounted for by the
  // response (or by the outbox copy waiting to be sent), so they are never
  // handed back.
  const submitted = useRef(new Set<string>())

  // The tablet's own interviews are numbered from the surveyor's block; a
  // paper form keeps its printed number and a share link is numbered by the server.
  const numbered = paperSerial === undefined && !share
  // The surveyor's block and the numbers in it already taken, kept on the
  // tablet so interviews can be numbered with no connection.
  const liveKit = useQuery(
    api.responses.offlineKit,
    ready && numbered ? { questionnaireId: surveyId, except: interviewId } : 'skip',
  )
  const [fetchedExposure, setFetchedExposure] = useState<OfflineExposure | undefined>(undefined)

  // The server's copy of the survey, or the one saved on this tablet when the
  // server does not answer; every copy the server sends is saved for next time.
  const offline = useOfflineSurvey({
    surveyId,
    liveStored,
    // Only once the account is known, so the block is saved under the right one.
    liveKit: numbered && !viewerLoading ? liveKit : undefined,
    kitOwner: viewer?.id ?? null,
    liveExposure: fetchedExposure,
  })
  const stored = offline.stored
  // Decoded once per server row: decoding on every render made a new object
  // each time, and everything keyed on it re-ran for nothing.
  const questionnaire = useMemo(() => decodeQuestionnaire(stored), [stored])

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

  // The same counts read once (not subscribed) while the page is online, and
  // saved on the tablet, for the interviews it may have to do offline later.
  useEffect(() => {
    if (!ready || !serverDraws || typeof client?.query !== 'function') return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    let cancelled = false
    client
      .query(api.responses.cardExposure, { questionnaireId: surveyId })
      .then((counts) => {
        if (!cancelled) setFetchedExposure(counts)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [ready, serverDraws, client, surveyId])

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
    drawCards({
      questionnaireId: surveyId,
      responseId: interviewId,
      ...(share ? { shareToken: share.token } : {}),
    })
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
  }, [ready, serverDraws, surveyId, interviewId, drawCards, share])

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

  // ── the survey number ──────────────────────────────────────────────────
  const assigned = drawn?.id === interviewId ? drawn : null
  // The saved block stands in once the server is slow to answer or gone.
  const kitStale =
    offline.fromDevice ||
    gaveUp ||
    viewerOffline ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  const kit = numbered
    ? liveKit !== undefined && !viewerLoading
      ? liveKit
      : kitStale
        ? offline.savedKit
        : undefined
    : undefined
  // The next free number in the surveyor's block, counting the responses
  // still waiting on this tablet as taken.
  const claim = numbered ? offlineSerial(kit, surveyId, outbox) : null
  const candidate = assigned?.serial ?? claim ?? undefined
  useEffect(() => {
    if (!numbered || candidate === undefined) return
    setFixedSerial((current) =>
      current?.id === interviewId ? current : { id: interviewId, serial: candidate },
    )
  }, [numbered, candidate, interviewId])
  const fixed = numbered
    ? fixedSerial?.id === interviewId
      ? fixedSerial.serial
      : candidate
    : assigned?.serial
  // Paper forms keep their printed number; otherwise the fixed number, or the
  // server's prediction for a tablet with no block. Unknown offline without one.
  const nextSerial: number | null = paperSerial ?? share?.serial ?? fixed ?? serial ?? null

  // A number from the surveyor's block that the server did not (or not yet)
  // hand out itself: planned blocks show the row that goes with it, as the
  // server and the paper form printed for that number would.
  const claimDraws = useMemo<QuestionnaireCardDraws | undefined>(() => {
    if (!questionnaire || !numbered || fixed === undefined) return undefined
    if (assigned?.sets && assigned.serial === fixed) return undefined
    const planned = questionnaire.questions.flatMap((question) =>
      question.type === 'choice_experiment' && followsPlan(question) ? [question] : [],
    )
    if (planned.length === 0) return undefined
    const row = planRowForSerial(planned[0], fixed)
    const draws: QuestionnaireCardDraws = { ...(assigned?.sets ?? {}) }
    for (const block of planned) {
      draws[block.id] = { sets: findPlanRow(block, row)?.sets ?? [], planRow: row }
    }
    return draws
  }, [questionnaire, numbered, fixed, assigned])

  /**
   * The response goes into the outbox first, so it survives a reload or a
   * closed tab, and only then to the server, which assigns the real serial
   * (or keeps the one from the surveyor's block). With no answer in time the
   * enumerator is told it is kept on the device and can carry on; a refusal
   * is thrown so the form says so.
   */
  async function handleSubmit(response: SurveyResponse): Promise<SubmitOutcome> {
    submitted.current.add(response.id)
    forgetOpenInterview(response.id)
    // Sent as the number to keep when it came from the surveyor's block.
    const claimed = numbered && kit && fixed !== undefined ? fixed : undefined
    const claimedNumber =
      claimed !== undefined && questionnaire
        ? formatSurveyNumber(questionnaire.surveyCodePrefix, claimed)
        : undefined
    const collector = viewer?.approved && !share ? viewer : null
    const pending: PendingResponse = {
      id: response.id,
      questionnaireId: response.questionnaireId,
      enumerator: response.enumerator,
      language: response.language,
      ...(response.respondent ? { respondent: response.respondent } : {}),
      answers: response.answers,
      queuedAt: Date.now(),
      ...(paperSerial !== undefined ? { paperSerial } : {}),
      ...(share ? { shareToken: share.token } : {}),
      ...(claimed !== undefined ? { claimedSerial: claimed, surveyNumber: claimedNumber } : {}),
      area,
      ...(collector ? { surveyorId: collector.id } : {}),
    }
    if (paperSerial !== undefined) setEnteredHere(paperSerial)
    const kept = await queueResponse(pending)
    const sending = send(pending)
    // Kept on the device, so a late refusal shows up in the notice below.
    sending.catch(() => undefined)
    const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false

    const timedOut = Symbol('timed out')
    const saved = await Promise.race([
      sending,
      new Promise<typeof timedOut>((resolve) =>
        setTimeout(() => resolve(timedOut), offlineNow ? 0 : SAVE_TIMEOUT_MS),
      ),
    ])
    if (saved === timedOut || saved === null) {
      // With no copy on the device (storage full or blocked) only this open
      // page holds the response; waiting here for ever, button greyed out,
      // was the alternative.
      return {
        pending: true,
        unstored: !kept,
        ...(claimedNumber ? { surveyNumber: claimedNumber } : {}),
      }
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

  if (questionnaire === null && offline.notOnDevice) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <CloudOff className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold">This survey is not saved on this tablet</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          There is no connection, and this survey was never opened here with internet. Open it once
          while online (or press “Make available offline” on My surveys), then it works without a
          connection.
        </p>
        <p lang="bn" className="mx-auto mt-2 max-w-md text-muted-foreground">
          ইন্টারনেট সংযোগ নেই, আর এই জরিপটি এই ট্যাবলেটে আগে কখনো ইন্টারনেট থাকা অবস্থায় খোলা হয়নি।
          একবার ইন্টারনেটসহ খুলুন, তারপর সংযোগ ছাড়াই কাজ করবে।
        </p>
        <UnsentPanel className="mt-8" />
      </main>
    )
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

  // Unknown only with no connection and no block of numbers: the server
  // numbers the response when it arrives.
  const shownSerial = nextSerial ?? 0
  const shownNumber =
    nextSerial === null
      ? 'given when sent'
      : formatSurveyNumber(questionnaire.surveyCodePrefix, nextSerial)
  // These blocks wait for the server's answer. The counts are only what a
  // block falls back on once the server has answered without cards for it or
  // has not answered in time; cards and plan rows other tablets hold right now
  // count too. Offline, the counts last saved on this tablet stand in.
  const counts = exposure ?? fetchedExposure ?? offline.savedExposure
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
    for (const { questionId, set, count, reserved } of counts?.cards ?? []) {
      cardExposure[questionId] = {
        ...(cardExposure[questionId] ?? {}),
        [set]: count + reserved,
      }
    }
    planExposure = {}
    for (const { questionId, row, count, reserved } of counts?.planRows ?? []) {
      planExposure[questionId] = {
        ...(planExposure[questionId] ?? {}),
        [row]: count + reserved,
      }
    }
  }

  // A signed-in, approved account collects under its own name; the server
  // stamps the account onto the response as well.
  // Whoever opens a share link is a respondent, even a team member trying it.
  const account = viewer?.approved && !share ? viewer : null
  const team = !share && (canBuild || isSurveyor)
  // Everyone, surveyors included, gets the whole form on one scrolling page;
  // ?steps=1 still shows one question at a time.
  const stepped = steps === true
  const lockedName = account
    ? account.code
      ? `${account.displayName} (${account.code})`
      : account.displayName
    : null

  return (
    <main className="page-wrap px-4 py-8 sm:py-12">
      {/* Opening the form for respondents used to be a one-way door: the only
          way back was a small link far below the last question. */}
      {team && (
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

      {team && (
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
            share
              ? {
                  serial: shownSerial,
                  surveyNumber: shownNumber,
                  enumerator: share.sharedBy,
                  locked: true,
                  hideEnumerator: true,
                }
              : paperSerial !== undefined && (paperOwner || account)
              ? {
                  serial: shownSerial,
                  surveyNumber: shownNumber,
                  // The interviewer is whoever the number was handed to.
                  enumerator: paperOwner?.name ?? account!.displayName,
                  locked: true,
                }
              : account
              ? {
                  serial: shownSerial,
                  surveyNumber: shownNumber,
                  enumerator: account.displayName,
                  locked: true,
                }
              : {
                  serial: shownSerial,
                  surveyNumber: shownNumber,
                  enumerator,
                  onEnumeratorChange: changeEnumerator,
                }
          }
          cardExposure={cardExposure}
          planExposure={planExposure}
          cardDraws={paperDraws ?? claimDraws ?? assigned?.sets ?? undefined}
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
          singleResponse={typeof share?.serial === 'number'}
          onDirtyChange={setDirty}
          onSubmit={handleSubmit}
          mode={stepped && paperSerial === undefined ? 'steps' : 'page'}
        />
      )}
      <UnsentPanel className="mt-6" />
      <p className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-muted-foreground">
        {lockedName && <span>Collecting as {lockedName}</span>}
        {account && (
          <Link to={paths.chat} params={{ surveyId }} className="hover:text-foreground">
            Team chat
          </Link>
        )}
        {!share && <OfflineCopyNote fromDevice={offline.fromDevice} saved={offline.saved} />}
      </p>
    </main>
  )
}

/**
 * Whether this survey is saved on the tablet for use with no connection, and
 * whether the form on screen is that saved copy.
 */
function OfflineCopyNote({
  fromDevice,
  saved,
}: {
  fromDevice: boolean
  saved: { savedAt: number; missingPictures?: number } | null
}) {
  if (!saved) return null
  const when = new Date(saved.savedAt).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <span className="inline-flex items-center gap-1.5">
      {fromDevice ? (
        <CloudOff className="size-3.5" aria-hidden="true" />
      ) : (
        <HardDriveDownload className="size-3.5" aria-hidden="true" />
      )}
      {fromDevice
        ? `No connection: this is the copy saved on this tablet (${when})`
        : `Saved on this tablet for offline use · ${when}`}
      {(saved.missingPictures ?? 0) > 0 &&
        ` · ${saved.missingPictures} picture${saved.missingPictures === 1 ? '' : 's'} could not be saved`}
    </span>
  )
}

/**
 * Holds back leaving the page while the interview has answers that are not
 * submitted: a tap on a header link or a back-swipe asks in the app's own
 * dialog. (With window.confirm, a browser that answers it without showing it
 * made the page impossible to leave.) A reload or a closed tab can only be
 * asked about by the browser itself, through beforeunload.
 */
function InterviewGuard({ active }: { active: boolean }) {
  const confirm = useConfirm()
  // Nor may a new version of the app reload the page under it.
  useHoldAppUpdate(active)
  useBlocker({
    shouldBlockFn: async () => {
      if (!active) return false
      const leave = await confirm({
        title: 'Leave this interview?',
        description: 'It has not been submitted, and its answers are lost if you leave.',
        confirmLabel: 'Leave',
        cancelLabel: 'Stay',
        destructive: true,
      })
      return !leave
    },
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

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Check, Copy, Link2, Share2 } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { useViewer } from '#/hooks/useViewer'
import { useConvexReady } from '#/lib/convex/hooks'

/** The address a share link token opens (`/r/<token>`, public). */
export function shareLinkUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}/r/${token}`
}

/**
 * "Share link": the caller's own link to a survey, which anyone can open and
 * answer without an account (convex/shareLinks.ts). Their answers are
 * credited to the person who shared it. Shown to builders, the admin, and the
 * survey's surveyors; builders and the admin can also make a link for one
 * survey number (`NumberedLinks`).
 */
export function ShareLinkButton({
  surveyId,
  size = 'default',
}: {
  surveyId: string
  size?: 'default' | 'sm'
}) {
  const ready = useConvexReady()
  const { canBuild } = useViewer()
  const [open, setOpen] = useState(false)
  const link = useQuery(
    api.shareLinks.mine,
    ready && open ? { questionnaireId: surveyId } : 'skip',
  )
  const create = useMutation(api.shareLinks.create)
  const setActive = useMutation(api.shareLinks.setActive)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const active = link?.active ? link : null
  const url = active ? shareLinkUrl(active.token) : ''
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(
        caught instanceof ConvexError ? String(caught.data) : 'That did not work. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copying is blocked here. Select the link and copy it by hand.')
    }
  }

  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)}>
        <Link2 data-icon="inline-start" />
        Share link
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setError(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share a link to this survey</DialogTitle>
            <DialogDescription>
              Anyone with the link can answer on their own phone or computer, without an
              account. Each answer takes your next survey number, so your own interviews go on
              with the number after it, and is recorded under your name, marked “Link” in the
              downloads.
            </DialogDescription>
          </DialogHeader>

          {link === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : active ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={url}
                  aria-label="Survey link"
                  className="font-mono text-sm"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" onClick={copy}>
                  {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {canShare && (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() => navigator.share({ url }).catch(() => undefined)}
                >
                  <Share2 data-icon="inline-start" />
                  Send with…
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {link
                ? 'Your link is turned off: opening it says the survey is not taking answers.'
                : 'You have no link to this survey yet.'}
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            {active ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => run(() => setActive({ token: active.token, active: false }))}
              >
                Turn the link off
              </Button>
            ) : (
              link !== undefined && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => create({ questionnaireId: surveyId }))}
                >
                  <Link2 data-icon="inline-start" />
                  {link ? 'Turn the link back on' : 'Create link'}
                </Button>
              )
            )}
          </DialogFooter>

          {canBuild && open && (
            <>
              <Separator />
              <NumberedLinks surveyId={surveyId} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Links for one survey number each (106 sent to one person), for builders and
 * the admin: the number is set aside so no tablet takes it, the answer is
 * recorded under it, and the link takes that one answer.
 */
function NumberedLinks({ surveyId }: { surveyId: string }) {
  const ready = useConvexReady()
  const links = useQuery(api.shareLinks.numbered, ready ? { questionnaireId: surveyId } : 'skip')
  const next = useQuery(api.responses.nextSerial, ready ? { questionnaireId: surveyId } : 'skip')
  const createNumbered = useMutation(api.shareLinks.createNumbered)
  const setActive = useMutation(api.shareLinks.setActive)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const number = Math.floor(Number(draft))
  const valid = draft.trim() !== '' && Number.isFinite(number) && number >= 1

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(
        caught instanceof ConvexError ? String(caught.data) : 'That did not work. Try again.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(shareLinkUrl(token))
      setCopied(token)
      setTimeout(() => setCopied((current) => (current === token ? null : current)), 2000)
    } catch {
      setError('Copying is blocked here. Open the link and copy it from the address bar.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium">Link for one survey number</h3>
        <p className="text-muted-foreground">
          Set a number aside for one person, such as 106. Nobody else is given it; the answer is
          recorded under it and credited to the surveyor whose block holds it (or to you), and
          the link then takes no more answers.
        </p>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid) return
          let token = ''
          const made = await run(async () => {
            token = await createNumbered({ questionnaireId: surveyId, serial: number })
          })
          if (made) {
            setDraft('')
            await copy(token)
          }
        }}
      >
        <label htmlFor="link-serial" className="text-sm">
          Survey no.
        </label>
        <Input
          id="link-serial"
          type="number"
          min={1}
          value={draft}
          placeholder={next ? String(next) : ''}
          onChange={(event) => setDraft(event.target.value)}
          className="h-8 w-28 tabular-nums"
        />
        <Button type="submit" size="sm" disabled={!valid || busy}>
          <Link2 data-icon="inline-start" />
          Create and copy
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {links && links.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {links.map((link) => (
            <li key={link.token} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="font-mono font-semibold">{link.surveyNumber}</span>
              <span
                className={
                  link.answered
                    ? 'text-xs font-medium text-emerald-700 dark:text-emerald-400'
                    : link.active
                      ? 'text-xs text-muted-foreground'
                      : 'text-xs text-muted-foreground line-through'
                }
              >
                {link.answered ? 'Answered' : link.active ? 'Waiting for an answer' : 'Turned off'}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {link.createdBy && `by ${link.createdBy}`}
              </span>
              {!link.answered && link.active && (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => copy(link.token)}>
                    {copied === link.token ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copied === link.token ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => run(() => setActive({ token: link.token, active: false }))}
                  >
                    Turn off
                  </Button>
                </>
              )}
              {!link.answered && !link.active && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => setActive({ token: link.token, active: true }))}
                >
                  Turn on
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

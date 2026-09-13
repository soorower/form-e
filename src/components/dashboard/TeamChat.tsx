import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { MessageSquare, Send } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { useConvexReady } from '#/lib/convex/hooks'
import { activeEnumerators } from '#/lib/questionnaire/factory'
import { getDeviceEnumerator, setDeviceEnumerator } from '#/lib/questionnaire/storage'
import type { Questionnaire } from '#/lib/questionnaire/types'
import { MAX_MESSAGE_LENGTH, type ChatMessage } from '#/lib/team/chat'
import { initials, relativeTime } from '#/lib/team/stats'
import { cn } from '#/lib/utils'

interface TeamChatProps {
  questionnaire: Questionnaire
  now: number
}

/**
 * One live chat room per team, served by Convex, so a message sent on one
 * tablet appears on every other device subscribed to the same survey.
 * Messages are grouped by day; your own appear on the right.
 */
export function TeamChat({ questionnaire, now }: TeamChatProps) {
  const ready = useConvexReady()
  const messages = useQuery(
    api.messages.list,
    ready ? { questionnaireId: questionnaire.id } : 'skip',
  ) as ChatMessage[] | undefined
  const send = useMutation(api.messages.send)

  const members = activeEnumerators(questionnaire)
  const [me, setMe] = useState('')
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMe(getDeviceEnumerator())
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages?.length])

  const author = members.length > 0 ? (members.includes(me) ? me : '') : me.trim()

  function changeMe(name: string) {
    setMe(name)
    setDeviceEnumerator(name)
  }

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!author || draft.trim() === '') return
    void send({ questionnaireId: questionnaire.id, author, text: draft })
    setDraft('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const list = messages ?? []
  let lastDay = ''

  return (
    <div className="flex h-full min-h-[28rem] flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="size-4 text-primary" />
        <h3 className="font-semibold">Team chat</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {messages === undefined
            ? 'Connecting…'
            : `${list.length} ${list.length === 1 ? 'message' : 'messages'}`}
        </span>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages !== undefined && list.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hello to the team.
          </p>
        )}
        {list.map((message) => {
          const day = new Date(message.sentAt).toDateString()
          const showDay = day !== lastDay
          lastDay = day
          const mine = message.author === author
          return (
            <div key={message._id ?? message.id}>
              {showDay && (
                <p className="my-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {new Date(message.sentAt).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              )}
              <div className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary"
                  title={message.author}
                >
                  {initials(message.author)}
                </span>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                    mine
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted',
                  )}
                >
                  {!mine && <p className="mb-0.5 text-xs font-semibold">{message.author}</p>}
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
                  <p
                    className={cn(
                      'mt-1 text-[10px]',
                      mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
                    )}
                  >
                    {relativeTime(message.sentAt, now)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={submit} className="space-y-2 border-t border-border p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Sending as</span>
          {members.length > 0 ? (
            <Select
              value={members.includes(me) ? me : null}
              onValueChange={(name) => changeMe(name ?? '')}
              items={Object.fromEntries(members.map((name) => [name, name]))}
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Your name">
                <SelectValue placeholder="Choose your name" />
              </SelectTrigger>
              <SelectContent>
                {members.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={me}
              onChange={(event) => changeMe(event.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              className="h-8 w-44"
            />
          )}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={onKeyDown}
            placeholder={author ? 'Write a message… (Enter to send)' : 'Choose your name first'}
            aria-label="Message"
            disabled={!author}
            className="min-h-10 flex-1 resize-none"
            rows={1}
          />
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={!author || !draft.trim()}>
            <Send />
          </Button>
        </div>
      </form>
    </div>
  )
}

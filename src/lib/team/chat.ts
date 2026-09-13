import { uid } from '#/lib/questionnaire/factory'

/**
 * Team chat, one room per questionnaire. Mirrors the `messages` table in
 * convex/schema.ts. Until the Convex deployment is linked this lives in
 * localStorage, so messages reach other tabs on the same device but not
 * other tablets; the Convex swap keeps this module's interface.
 */

export interface ChatMessage {
  /** Convex document id. Absent on rows that came from the old local store. */
  _id?: string
  id?: string
  questionnaireId: string
  author: string
  text: string
  sentAt: number
}

const MESSAGES_KEY = 'forme:messages'
const CHANGE_EVENT = 'forme:messages-changed'
export const MAX_MESSAGE_LENGTH = 1000

function canStore(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readAll(): ChatMessage[] {
  if (!canStore()) return []
  try {
    const raw = window.localStorage.getItem(MESSAGES_KEY)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

function writeAll(messages: ChatMessage[]) {
  if (!canStore()) return
  try {
    window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // Storage full or disabled; the in-memory state still shows the message.
  }
}

export function listMessages(questionnaireId: string): ChatMessage[] {
  return readAll()
    .filter((message) => message.questionnaireId === questionnaireId)
    .sort((a, b) => a.sentAt - b.sentAt)
}

export function sendMessage(input: {
  questionnaireId: string
  author: string
  text: string
}): ChatMessage | null {
  const text = input.text.trim().slice(0, MAX_MESSAGE_LENGTH)
  const author = input.author.trim()
  if (!text || !author) return null
  const message: ChatMessage = {
    id: uid(),
    questionnaireId: input.questionnaireId,
    author,
    text,
    sentAt: Date.now(),
  }
  writeAll([...readAll(), message])
  return message
}

export function deleteTeamMessages(questionnaireId: string) {
  writeAll(readAll().filter((message) => message.questionnaireId !== questionnaireId))
}

/**
 * Calls `onChange` whenever messages change in this tab or another tab on
 * the same device. Returns an unsubscribe function.
 */
export function subscribeMessages(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === MESSAGES_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

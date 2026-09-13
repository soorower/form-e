// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTeamMessages, listMessages, sendMessage, subscribeMessages } from './chat'

describe('team chat storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('stores trimmed messages per team in send order and ignores empty ones', () => {
    expect(sendMessage({ questionnaireId: 'q1', author: 'Ikra', text: '   ' })).toBeNull()
    expect(sendMessage({ questionnaireId: 'q1', author: '', text: 'hi' })).toBeNull()
    sendMessage({ questionnaireId: 'q1', author: 'Ikra', text: '  Done with set 4  ' })
    sendMessage({ questionnaireId: 'q2', author: 'Nawal', text: 'other team' })
    sendMessage({ questionnaireId: 'q1', author: 'Nawal', text: 'Great' })
    expect(listMessages('q1').map((m) => `${m.author}: ${m.text}`)).toEqual([
      'Ikra: Done with set 4',
      'Nawal: Great',
    ])
    expect(listMessages('q2')).toHaveLength(1)
  })

  it('notifies subscribers in the same tab and stops after unsubscribe', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeMessages(onChange)
    sendMessage({ questionnaireId: 'q1', author: 'A', text: 'one' })
    expect(onChange).toHaveBeenCalledTimes(1)
    unsubscribe()
    sendMessage({ questionnaireId: 'q1', author: 'A', text: 'two' })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('deletes a team room', () => {
    sendMessage({ questionnaireId: 'q1', author: 'A', text: 'one' })
    sendMessage({ questionnaireId: 'q2', author: 'A', text: 'two' })
    deleteTeamMessages('q1')
    expect(listMessages('q1')).toHaveLength(0)
    expect(listMessages('q2')).toHaveLength(1)
  })
})

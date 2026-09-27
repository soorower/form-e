// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, useConfirm } from './ConfirmProvider'

afterEach(cleanup)

function Asker() {
  const confirm = useConfirm()
  const [answer, setAnswer] = useState('none')
  return (
    <>
      <button
        type="button"
        onClick={async () =>
          setAnswer(
            String(
              await confirm({
                title: 'Delete “Trip purpose”?',
                description: 'This cannot be undone.',
                confirmLabel: 'Delete',
                destructive: true,
              }),
            ),
          )
        }
      >
        Ask
      </button>
      <output>{answer}</output>
    </>
  )
}

describe('ConfirmProvider', () => {
  it('asks in the page, never through window.confirm, and answers yes', async () => {
    window.confirm = vi.fn(() => false)
    render(
      <ConfirmProvider>
        <Asker />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByText('Delete “Trip purpose”?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('true'))
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('answers no on Cancel', async () => {
    render(
      <ConfirmProvider>
        <Asker />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('false'))
  })
})

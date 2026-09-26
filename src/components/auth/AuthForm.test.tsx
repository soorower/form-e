// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthForm } from './AuthForm'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  setMyName: vi.fn(),
  navigate: vi.fn(),
  emailCodes: true,
}))

vi.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signIn: mocks.signIn }) }))
vi.mock('convex/react', () => ({
  useQuery: (_reference: unknown, args: unknown) =>
    args === 'skip' ? undefined : { emailCodes: mocks.emailCodes },
  useMutation: () => mocks.setMyName,
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}))

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('AuthForm with emailed codes', () => {
  beforeEach(() => {
    mocks.signIn.mockReset()
    mocks.setMyName.mockReset().mockResolvedValue(undefined)
    mocks.navigate.mockReset()
    mocks.emailCodes = true
  })
  afterEach(cleanup)

  it('asks for the emailed code after sign-up, and keeps the name only once it is proved', async () => {
    // Sign-up starts verification rather than signing in.
    mocks.signIn.mockResolvedValueOnce({ signingIn: false }).mockResolvedValueOnce({ signingIn: true })
    render(<AuthForm mode="signUp" />)
    fill(/Full name/, 'Karim Uddin')
    fill(/^Email/, ' Karim@Example.com ')
    fill(/^Password/, 'long enough')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await screen.findByText('Check your email')
    expect(screen.getByText(/sent an 8-digit code to karim@example.com/)).toBeTruthy()
    expect(mocks.setMyName).not.toHaveBeenCalled()

    fill(/^Code/, '1234 5678')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled())
    expect(mocks.signIn.mock.calls[1]).toEqual([
      'password',
      { flow: 'email-verification', email: 'karim@example.com', code: '12345678' },
    ])
    expect(mocks.setMyName).toHaveBeenCalledWith({ name: 'Karim Uddin' })
  })

  it('says the code is wrong rather than "Server Error"', async () => {
    mocks.signIn.mockResolvedValueOnce({ signingIn: false }).mockRejectedValueOnce(new Error('Server Error'))
    render(<AuthForm mode="signIn" />)
    fill(/^Email/, 'a@example.com')
    fill(/^Password/, 'long enough')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Check your email')
    fill(/^Code/, '00000000')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/wrong or has expired/)
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('resets a forgotten password with a code', async () => {
    mocks.signIn.mockResolvedValueOnce({ signingIn: false }).mockResolvedValueOnce({ signingIn: true })
    render(<AuthForm mode="signIn" />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fill(/^Email/, 'a@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await screen.findByText('Choose a new password')
    fill(/^Code/, '87654321')
    fill(/New password/, 'brand new secret')
    fireEvent.click(screen.getByRole('button', { name: 'Save and sign in' }))
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled())
    expect(mocks.signIn.mock.calls[0]).toEqual(['password', { flow: 'reset', email: 'a@example.com' }])
    expect(mocks.signIn.mock.calls[1][1]).toEqual({
      flow: 'reset-verification',
      email: 'a@example.com',
      code: '87654321',
      newPassword: 'brand new secret',
    })
  })

  it('offers no reset while the deployment cannot send email', () => {
    mocks.emailCodes = false
    render(<AuthForm mode="signIn" />)
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull()
  })
})

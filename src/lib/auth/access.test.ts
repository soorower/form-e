import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  accountStatus,
  emailTrusted,
  isAdminUser,
  roleOf,
  trustedEmail,
} from '../../../convex/access'

type User = Doc<'users'>

function user(fields: Partial<User>): User {
  return { _id: 'users:1' as User['_id'], _creationTime: 1, ...fields }
}

/** What Google sign-in sets; a password sign-up never does. */
const VERIFIED = { emailVerificationTime: 1_700_000_000_000 }

describe('who is an admin', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ' Admin@Example.com ,second@example.com'
  })
  afterEach(() => {
    delete process.env.ADMIN_EMAILS
  })

  it('an address in ADMIN_EMAILS, but only once the sign-in proved it', () => {
    expect(isAdminUser(user({ email: 'admin@example.com', ...VERIFIED }))).toBe(true)
    expect(isAdminUser(user({ email: 'ADMIN@example.com', ...VERIFIED }))).toBe(true)
    expect(isAdminUser(user({ email: 'second@example.com', ...VERIFIED }))).toBe(true)
    expect(isAdminUser(user({ email: 'someone@example.com', ...VERIFIED }))).toBe(false)
  })

  it('never a password sign-up that merely typed the admin address', () => {
    const impostor = user({ email: 'admin@example.com', name: 'Admin' })
    expect(isAdminUser(impostor)).toBe(false)
    expect(roleOf(impostor)).toBe('builder')
    // Not even after the admin approves that account as an ordinary user.
    expect(isAdminUser({ ...impostor, status: 'approved' })).toBe(false)
  })

  it('a role granted by an admin, whatever the sign-in', () => {
    expect(isAdminUser(user({ role: 'admin' }))).toBe(true)
    expect(roleOf(user({ role: 'admin', email: 'x@example.com' }))).toBe('admin')
  })
})

describe('when an address carries group membership and assignments', () => {
  it('trusts a proved address, or an account the admin approved', () => {
    expect(emailTrusted(user({ email: 'a@example.com', ...VERIFIED }))).toBe(true)
    expect(emailTrusted(user({ email: 'a@example.com', status: 'approved' }))).toBe(true)
    expect(emailTrusted(user({ email: 'a@example.com' }))).toBe(false)
    expect(emailTrusted(user({ email: 'a@example.com', status: 'pending' }))).toBe(false)
    expect(emailTrusted(user({ email: 'a@example.com', status: 'rejected' }))).toBe(false)
  })

  it('gives the normalised address, or nothing while it is not trusted', () => {
    expect(trustedEmail(user({ email: ' Builder@Example.com ', ...VERIFIED }))).toBe(
      'builder@example.com',
    )
    expect(trustedEmail(user({ email: 'builder@example.com' }))).toBe('')
    expect(trustedEmail(user({ ...VERIFIED }))).toBe('')
  })

  it('so a password sign-up with an invited address waits for approval', () => {
    // accessFor looks memberships up by trustedEmail(): none for this account.
    const memberships = trustedEmail(user({ email: 'invited@example.com' })) ? 1 : 0
    expect(accountStatus(user({ email: 'invited@example.com' }), memberships)).toBe('pending')
    // The same address proved by Google is in straight away.
    expect(accountStatus(user({ email: 'invited@example.com', ...VERIFIED }), 1)).toBe('approved')
  })
})

describe('accountStatus', () => {
  it('follows the admin decision, else membership, else waits', () => {
    expect(accountStatus(user({ status: 'rejected' }), 3)).toBe('rejected')
    expect(accountStatus(user({ status: 'approved' }), 0)).toBe('approved')
    expect(accountStatus(user({}), 1)).toBe('approved')
    expect(accountStatus(user({}), 0)).toBe('pending')
    expect(accountStatus(user({ status: 'pending' }), 0)).toBe('pending')
  })
})

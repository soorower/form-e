import { describe, expect, it } from 'vitest'
import { allowedOrigins, resolveRedirect } from '../../../convex/authRedirect'

const SITE = 'http://localhost:3000'
const EXTRA = 'https://form-e-theta.vercel.app, https://forme.example.org/'

describe('resolveRedirect', () => {
  it('sends a relative path or query to SITE_URL, as Convex Auth does by default', () => {
    expect(resolveRedirect('/surveys', SITE, EXTRA)).toBe('http://localhost:3000/surveys')
    expect(resolveRedirect('?tab=people', SITE, undefined)).toBe('http://localhost:3000?tab=people')
    expect(resolveRedirect('/admin', 'http://localhost:3000/', undefined)).toBe(
      'http://localhost:3000/admin',
    )
  })

  it('keeps a protocol-relative path on SITE_URL instead of following it', () => {
    const resolved = resolveRedirect('//evil.com/surveys', SITE, EXTRA)
    expect(new URL(resolved).origin).toBe(SITE)
  })

  it('accepts an absolute URL on SITE_URL or on any EXTRA_SITE_URLS origin', () => {
    expect(resolveRedirect('http://localhost:3000/surveys', SITE, EXTRA)).toBe(
      'http://localhost:3000/surveys',
    )
    expect(resolveRedirect('https://form-e-theta.vercel.app/admin?x=1', SITE, EXTRA)).toBe(
      'https://form-e-theta.vercel.app/admin?x=1',
    )
    expect(resolveRedirect('https://forme.example.org/surveys', SITE, EXTRA)).toBe(
      'https://forme.example.org/surveys',
    )
  })

  it('refuses origins that are not listed, including look-alikes', () => {
    const refused = [
      'https://evil.com/surveys',
      'https://form-e-theta.vercel.app.evil.com/surveys',
      'https://form-e-theta.vercel.app@evil.com/surveys',
      'http://form-e-theta.vercel.app/surveys',
      'https://form-e-theta.vercel.app:8443/surveys',
      'http://localhost:3001/surveys',
      'javascript:alert(1)',
      'surveys',
      '',
    ]
    for (const redirectTo of refused) {
      expect(() => resolveRedirect(redirectTo, SITE, EXTRA), redirectTo).toThrow(/Invalid/)
    }
  })

  it('returns the parsed URL, so a backslash trick lands on the allowed origin', () => {
    const resolved = resolveRedirect('https://form-e-theta.vercel.app\\@evil.com', SITE, EXTRA)
    expect(new URL(resolved).origin).toBe('https://form-e-theta.vercel.app')
  })

  it('works without EXTRA_SITE_URLS and needs SITE_URL only for relative targets', () => {
    expect(() => resolveRedirect('https://form-e-theta.vercel.app/', SITE, undefined)).toThrow()
    expect(() => resolveRedirect('/surveys', undefined, EXTRA)).toThrow(/SITE_URL/)
    expect(resolveRedirect('https://forme.example.org/x', undefined, EXTRA)).toBe(
      'https://forme.example.org/x',
    )
  })
})

describe('allowedOrigins', () => {
  it('normalises entries to origins and drops blanks and junk', () => {
    expect([...allowedOrigins(SITE, ` ${EXTRA}, ,not a url,ftp://files.example.org`)]).toEqual([
      'http://localhost:3000',
      'https://form-e-theta.vercel.app',
      'https://forme.example.org',
    ])
  })
})

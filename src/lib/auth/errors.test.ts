import { describe, expect, it } from 'vitest'
import { safeRedirect } from './errors'

describe('safeRedirect', () => {
  it('honours same-origin paths and falls back on anything else', () => {
    expect(safeRedirect('/surveys/abc', '/surveys')).toBe('/surveys/abc')
    expect(safeRedirect(undefined, '/surveys')).toBe('/surveys')
    expect(safeRedirect('https://evil.example/x', '/surveys')).toBe('/surveys')
    expect(safeRedirect('//evil.example/x', '/surveys')).toBe('/surveys')
  })

  it('keeps a destination inside the area that is signing in', () => {
    expect(safeRedirect('/surveys/abc', '/surveys', 'app')).toBe('/surveys/abc')
    expect(safeRedirect('/admin/surveys', '/surveys', 'app')).toBe('/surveys')
    expect(safeRedirect('/admin/surveys', '/admin', 'admin')).toBe('/admin/surveys')
    expect(safeRedirect('/surveys/abc', '/admin', 'admin')).toBe('/admin')
  })

  it.each(['/create', '/create/', '/create?source=home', '/create#new'])(
    'opens the survey list instead of creating a survey after login to %s',
    (redirect) => {
      expect(safeRedirect(redirect, '/surveys', 'app')).toBe('/surveys')
    },
  )

  it.each(['/admin/create', '/admin/create/', '/admin/create?source=home', '/admin/create#new'])(
    'opens the admin home instead of creating a survey after login to %s',
    (redirect) => {
      expect(safeRedirect(redirect, '/admin', 'admin')).toBe('/admin')
    },
  )

  it('still returns to an existing survey with its query and fragment', () => {
    const redirect = '/surveys/abc?tab=responses#latest'
    expect(safeRedirect(redirect, '/surveys', 'app')).toBe(redirect)
  })
})

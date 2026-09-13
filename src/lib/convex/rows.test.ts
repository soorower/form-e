import { describe, expect, it } from 'vitest'
import { stripSystemFields, stripSystemFieldsAll } from './rows'

interface Team {
  id: string
  teamName: string
}

describe('stripSystemFields', () => {
  it('removes the Convex bookkeeping fields a mutation validator would reject', () => {
    const row = {
      _id: 'jd7bthvpymbzpa0prdgx2kyqrs8e7d7p',
      _creationTime: 1789142271895.7827,
      id: 'be8c584b',
      teamName: 'Sylhet field team',
    }
    const stripped = stripSystemFields<Team>(row)
    expect(stripped).toEqual({ id: 'be8c584b', teamName: 'Sylhet field team' })
    expect(Object.keys(stripped!)).not.toContain('_id')
    expect(Object.keys(stripped!)).not.toContain('_creationTime')
  })

  it('passes null and undefined through so loading states still work', () => {
    expect(stripSystemFields<Team>(null)).toBeNull()
    expect(stripSystemFields<Team>(undefined)).toBeUndefined()
    expect(stripSystemFieldsAll<Team>(undefined)).toBeUndefined()
  })

  it('strips every row in a list', () => {
    const rows = [
      { _id: 'a', _creationTime: 1, id: '1', teamName: 'A' },
      { _id: 'b', _creationTime: 2, id: '2', teamName: 'B' },
    ]
    expect(stripSystemFieldsAll<Team>(rows)).toEqual([
      { id: '1', teamName: 'A' },
      { id: '2', teamName: 'B' },
    ])
  })

  it('leaves a row that has no system fields unchanged', () => {
    expect(stripSystemFields<Team>({ id: '1', teamName: 'A' })).toEqual({ id: '1', teamName: 'A' })
  })
})
